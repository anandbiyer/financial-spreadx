"""Provider-agnostic LLM client layer.

Exposes a single factory, `get_llm_client()`, that returns an `LLMClient`
backed by either the Anthropic API (direct) or AWS Bedrock, selected at runtime
via `config.set_llm_settings()` (front-end toggle) or the `LLM_PROVIDER` env var.

All call sites use `complete()` / `complete_vision()`, both of which return the
model's raw text — exactly what the existing JSON-cleanup logic consumes — so
swapping providers requires no change to prompts or downstream parsing.
"""

from llm.base import LLMClient
from llm.factory import get_llm_client

__all__ = ["LLMClient", "get_llm_client"]
