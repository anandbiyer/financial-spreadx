"""Unit tests for the LLM usage meter — token extraction per provider, model-id
normalization, cost math, and the no-op-when-inactive contract."""

from __future__ import annotations

from types import SimpleNamespace

from config import normalize_model_id
from llm.usage import (
    UsageMeter,
    record_usage,
    reset_active_meter,
    set_active_meter,
)


def _anthropic_msg(in_t, out_t, cr=0, cc=0):
    usage = SimpleNamespace(input_tokens=in_t, output_tokens=out_t,
                            cache_read_input_tokens=cr, cache_creation_input_tokens=cc)
    return SimpleNamespace(usage=usage)


def _bedrock_resp(in_t, out_t, cr=0, cw=0):
    return {"usage": {"inputTokens": in_t, "outputTokens": out_t,
                      "cacheReadInputTokens": cr, "cacheWriteInputTokens": cw}}


def test_normalize_model_id_strips_bedrock_prefix():
    assert normalize_model_id("global.anthropic.claude-sonnet-4-6") == "claude-sonnet-4-6"
    assert normalize_model_id("anthropic.claude-opus-4-8") == "claude-opus-4-8"
    assert normalize_model_id("claude-sonnet-4-6") == "claude-sonnet-4-6"


def test_record_is_noop_without_active_meter():
    # No meter active -> must not raise.
    record_usage("anthropic", "claude-sonnet-4-6", _anthropic_msg(10, 5))


def test_anthropic_and_bedrock_usage_accumulate_with_stage_split():
    meter = UsageMeter()
    token = set_active_meter(meter)
    try:
        meter.set_stage("extraction")
        record_usage("anthropic", "claude-sonnet-4-6", _anthropic_msg(1000, 200))
        meter.set_stage("spreading")
        record_usage("bedrock", "global.anthropic.claude-sonnet-4-6", _bedrock_resp(500, 100))
    finally:
        reset_active_meter(token)

    snap = meter.snapshot()
    assert snap["total"]["input_tokens"] == 1500
    assert snap["total"]["output_tokens"] == 300
    assert snap["total"]["calls"] == 2
    assert set(snap["by_stage"]) == {"extraction", "spreading"}
    # Bedrock prefix normalized to the same pricing key.
    assert snap["models"] == ["claude-sonnet-4-6"]
    # Sonnet 4.6 = $3/$15 per 1M: 1500*3/1e6 + 300*15/1e6 = 0.0045 + 0.0045 = 0.009
    assert abs(snap["total"]["cost_usd"] - 0.009) < 1e-9
    assert snap["unknown_model_pricing"] is False


def test_unknown_model_pricing_flagged_zero_cost():
    meter = UsageMeter()
    token = set_active_meter(meter)
    try:
        record_usage("anthropic", "some-future-model", _anthropic_msg(1000, 1000))
    finally:
        reset_active_meter(token)
    snap = meter.snapshot()
    assert snap["unknown_model_pricing"] is True
    assert snap["total"]["cost_usd"] == 0.0
