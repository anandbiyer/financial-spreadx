"""LLM client factory — resolves and caches the active provider backend.

Resolution priority for both provider and model:
    explicit argument  >  session setting (config.set_llm_settings)  >  env default

Clients are cached per (provider, model) so repeated calls reuse one instance.
"""

from __future__ import annotations

from config import (
    ANTHROPIC_MODEL,
    BEDROCK_DEFAULT_MODEL_ID,
    get_llm_settings,
    logger,
)
from llm.base import LLMClient

_CACHE: dict[tuple[str, str, str], LLMClient] = {}


def _default_model(provider: str) -> str:
    if provider == "bedrock":
        return BEDROCK_DEFAULT_MODEL_ID
    if provider == "anthropic":
        return ANTHROPIC_MODEL
    raise ValueError(f"Unknown LLM provider: {provider!r}")


def get_llm_client(
    provider: str | None = None,
    model: str | None = None,
) -> LLMClient:
    """Return an LLMClient for the resolved provider/model.

    Args:
        provider: "anthropic" | "bedrock". Defaults to the session setting,
                  then the LLM_PROVIDER env var (default "anthropic").
        model:    Override model id. Defaults to the session setting, then the
                  provider's configured default.
    """
    settings = get_llm_settings()
    provider = provider or settings.get("provider") or "anthropic"
    model = model or settings.get("model") or _default_model(provider)
    api_key = settings.get("api_key")  # usually None -> SDK reads env

    cache_key = (provider, model, api_key or "")
    cached = _CACHE.get(cache_key)
    if cached is not None:
        return cached

    if provider == "bedrock":
        from llm.bedrock import BedrockClient

        client: LLMClient = BedrockClient(model=model)
    elif provider == "anthropic":
        from llm.anthropic_client import AnthropicClient

        client = AnthropicClient(model=model, api_key=api_key)
    else:
        raise ValueError(f"Unknown LLM provider: {provider!r}")

    logger.info(f"[llm] Using provider={provider} model={model}")
    _CACHE[cache_key] = client
    return client
