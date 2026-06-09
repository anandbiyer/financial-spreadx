"""Bedrock backend — wraps the existing Converse API usage verbatim.

This preserves the exact request/response shape the project used before the
provider abstraction was introduced, so selecting `provider="bedrock"`
reproduces today's behaviour byte-for-byte.
"""

from __future__ import annotations

from config import get_bedrock_client
from llm.usage import record_usage


class BedrockClient:
    """LLMClient backed by AWS Bedrock's Converse API."""

    provider = "bedrock"

    def __init__(self, model: str) -> None:
        self.model = model

    def complete(
        self,
        *,
        prompt: str,
        max_tokens: int,
        system: str | None = None,
    ) -> str:
        client = get_bedrock_client()
        kwargs = {
            "modelId": self.model,
            "messages": [{"role": "user", "content": [{"text": prompt}]}],
            "inferenceConfig": {"maxTokens": max_tokens},
        }
        if system:
            kwargs["system"] = [{"text": system}]
        response = client.converse(**kwargs)
        record_usage("bedrock", self.model, response)
        return response["output"]["message"]["content"][0]["text"]

    def complete_vision(
        self,
        *,
        prompt: str,
        image_png: bytes,
        max_tokens: int,
        system: str | None = None,
    ) -> str:
        client = get_bedrock_client()
        content = [
            {"image": {"format": "png", "source": {"bytes": image_png}}},
            {"text": prompt},
        ]
        kwargs = {
            "modelId": self.model,
            "messages": [{"role": "user", "content": content}],
            "inferenceConfig": {"maxTokens": max_tokens},
        }
        if system:
            kwargs["system"] = [{"text": system}]
        response = client.converse(**kwargs)
        record_usage("bedrock", self.model, response)
        return response["output"]["message"]["content"][0]["text"]
