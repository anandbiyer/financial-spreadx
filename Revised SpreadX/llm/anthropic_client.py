"""Anthropic backend — Claude API (direct) via the official `anthropic` SDK.

Used by default (LLM_PROVIDER=anthropic). The API key is read from the
environment (ANTHROPIC_API_KEY) by the SDK; an explicit key may be passed but
the UI never collects one.

Timeout/retries are set generously to mirror the 900s read timeout the Bedrock
path uses for dense pages.
"""

from __future__ import annotations

import base64

from llm.usage import record_usage


class AnthropicClient:
    """LLMClient backed by the Anthropic Messages API."""

    provider = "anthropic"

    def __init__(self, model: str, api_key: str | None = None) -> None:
        # Imported lazily so the project still runs (Bedrock-only) without the
        # `anthropic` package installed.
        from anthropic import Anthropic

        self.model = model
        kwargs: dict = {"timeout": 900.0, "max_retries": 3}
        if api_key:
            kwargs["api_key"] = api_key
        # When api_key is omitted, the SDK reads ANTHROPIC_API_KEY from env.
        self._client = Anthropic(**kwargs)

    @staticmethod
    def _text_of(message) -> str:
        """Concatenate all text blocks of a Messages API response."""
        return "".join(
            block.text for block in message.content if getattr(block, "type", None) == "text"
        )

    def complete(
        self,
        *,
        prompt: str,
        max_tokens: int,
        system: str | None = None,
    ) -> str:
        kwargs = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system
        message = self._client.messages.create(**kwargs)
        record_usage("anthropic", self.model, message)
        return self._text_of(message)

    def complete_vision(
        self,
        *,
        prompt: str,
        image_png: bytes,
        max_tokens: int,
        system: str | None = None,
    ) -> str:
        b64 = base64.standard_b64encode(image_png).decode("ascii")
        content = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": b64,
                },
            },
            {"type": "text", "text": prompt},
        ]
        kwargs = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": content}],
        }
        if system:
            kwargs["system"] = system
        message = self._client.messages.create(**kwargs)
        record_usage("anthropic", self.model, message)
        return self._text_of(message)
