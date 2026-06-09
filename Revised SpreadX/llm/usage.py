"""Per-run LLM token usage + estimated cost accounting.

Both provider backends already receive a `usage` block on every response and
previously discarded it. The provider methods now call `record_usage(...)` after
each call; if a `UsageMeter` is active for the current run (set by the pipeline
orchestrator via a contextvar) the tokens are accumulated, otherwise it is a
no-op — so unit tests and ad-hoc calls need no meter.

Cost is an ESTIMATE at Anthropic list price (config.MODEL_PRICING) — it ignores
Bedrock-specific pricing, discounts, and prompt caching. Vision/image tokens are
counted by the API inside `input_tokens`; there is no separate image line.
"""

from __future__ import annotations

import contextvars
import threading

from config import (
    CACHE_READ_MULT,
    CACHE_WRITE_MULT,
    MODEL_PRICING,
    logger,
    normalize_model_id,
)

_active_meter: contextvars.ContextVar = contextvars.ContextVar("usage_meter", default=None)


class UsageMeter:
    """Thread-safe accumulator of token usage, bucketed by (stage, model)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stage = "other"
        # (stage, model) -> counters
        self._buckets: dict[tuple, dict] = {}

    def set_stage(self, stage: str) -> None:
        with self._lock:
            self._stage = stage or "other"

    def add(self, model: str, input_tokens: int, output_tokens: int,
            cache_read: int = 0, cache_creation: int = 0) -> None:
        key = (self._stage, normalize_model_id(model))
        with self._lock:
            b = self._buckets.setdefault(
                key, {"calls": 0, "input_tokens": 0, "output_tokens": 0,
                      "cache_read": 0, "cache_creation": 0})
            b["calls"] += 1
            b["input_tokens"] += int(input_tokens or 0)
            b["output_tokens"] += int(output_tokens or 0)
            b["cache_read"] += int(cache_read or 0)
            b["cache_creation"] += int(cache_creation or 0)

    @staticmethod
    def _cost(model: str, b: dict) -> tuple[float, bool]:
        rates = MODEL_PRICING.get(normalize_model_id(model))
        if rates is None:
            return 0.0, True  # unknown pricing
        in_rate, out_rate = rates
        cost = (b["input_tokens"] / 1e6 * in_rate
                + b["output_tokens"] / 1e6 * out_rate
                + b["cache_read"] / 1e6 * in_rate * CACHE_READ_MULT
                + b["cache_creation"] / 1e6 * in_rate * CACHE_WRITE_MULT)
        return round(cost, 6), False

    def snapshot(self) -> dict:
        """A serialisable summary: per-stage rollup + grand total + cost."""
        with self._lock:
            buckets = {k: dict(v) for k, v in self._buckets.items()}

        by_stage: dict[str, dict] = {}
        total = {"calls": 0, "input_tokens": 0, "output_tokens": 0,
                 "cache_read": 0, "cache_creation": 0, "cost_usd": 0.0}
        models: set[str] = set()
        unknown = False
        for (stage, model), b in buckets.items():
            models.add(model)
            cost, miss = self._cost(model, b)
            unknown = unknown or miss
            st = by_stage.setdefault(
                stage, {"calls": 0, "input_tokens": 0, "output_tokens": 0,
                        "cache_read": 0, "cache_creation": 0, "cost_usd": 0.0})
            for k in ("calls", "input_tokens", "output_tokens", "cache_read", "cache_creation"):
                st[k] += b[k]
                total[k] += b[k]
            st["cost_usd"] = round(st["cost_usd"] + cost, 6)
            total["cost_usd"] = round(total["cost_usd"] + cost, 6)

        return {
            "by_stage": by_stage,
            "total": total,
            "models": sorted(models),
            "unknown_model_pricing": unknown,
            "pricing_note": "Estimated at Anthropic list price; excludes Bedrock "
                            "pricing, discounts, and prompt caching.",
        }


def set_active_meter(meter: UsageMeter | None):
    """Activate `meter` for the current context; returns the contextvar token."""
    return _active_meter.set(meter)


def reset_active_meter(token) -> None:
    _active_meter.reset(token)


def _extract(provider: str, raw) -> tuple[int, int, int, int]:
    """Return (input, output, cache_read, cache_creation) for either backend."""
    if provider == "anthropic":
        u = getattr(raw, "usage", None)
        if u is None:
            return 0, 0, 0, 0
        return (
            getattr(u, "input_tokens", 0) or 0,
            getattr(u, "output_tokens", 0) or 0,
            getattr(u, "cache_read_input_tokens", 0) or 0,
            getattr(u, "cache_creation_input_tokens", 0) or 0,
        )
    # bedrock converse: dict with a 'usage' key
    u = (raw or {}).get("usage", {}) if isinstance(raw, dict) else {}
    return (
        u.get("inputTokens", 0) or 0,
        u.get("outputTokens", 0) or 0,
        u.get("cacheReadInputTokens", 0) or 0,
        u.get("cacheWriteInputTokens", 0) or 0,
    )


def record_usage(provider: str, model: str, raw) -> None:
    """Record one response's usage into the active meter (no-op if none active)."""
    meter = _active_meter.get()
    if meter is None:
        return
    try:
        in_t, out_t, cr, cc = _extract(provider, raw)
        meter.add(model, in_t, out_t, cr, cc)
    except Exception as e:  # never let accounting break a real call
        logger.warning(f"[usage] failed to record usage ({provider}): {e}")
