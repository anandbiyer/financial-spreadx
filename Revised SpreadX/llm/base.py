"""LLMClient protocol — the provider-agnostic interface.

Two methods cover every Claude call in the project today:
  - complete()        : text-only prompt  -> raw text response
  - complete_vision() : image + prompt    -> raw text response

Both return the model's raw text string (no JSON parsing here); callers keep
their existing strip-fences / json.loads logic unchanged.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class LLMClient(Protocol):
    """Minimal interface implemented by every provider backend."""

    #: Provider identifier, e.g. "anthropic" or "bedrock".
    provider: str
    #: Resolved model id this client talks to.
    model: str

    def complete(
        self,
        *,
        prompt: str,
        max_tokens: int,
        system: str | None = None,
    ) -> str:
        """Run a text-only completion and return the raw text response."""
        ...

    def complete_vision(
        self,
        *,
        prompt: str,
        image_png: bytes,
        max_tokens: int,
        system: str | None = None,
    ) -> str:
        """Run an image+text completion and return the raw text response.

        `image_png` is raw PNG bytes (the same buffer produced by the
        rasterizer and previously passed straight to Bedrock).
        """
        ...
