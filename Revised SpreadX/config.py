"""Shared configuration constants for the extraction pipeline."""

import os
import boto3
import logging
from botocore.config import Config



logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(filename)s:%(lineno)d - %(message)s",
    handlers=[
        logging.FileHandler("spread_pipeline.log", encoding="utf-8"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("spreadx")

# Baaki ka purana AWS & Bedrock config same rahega



# AWS & S3 Bedrock configs
AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
BEDROCK_DEFAULT_MODEL_ID = os.getenv("BEDROCK_DEFAULT_MODEL_ID", "global.anthropic.claude-sonnet-4-6")

def get_bedrock_client():
    # Long 15-minute timeout config to prevent crashes on dense pages
    config = Config(connect_timeout=120, read_timeout=900, retries={'max_attempts': 3})
    return boto3.client("bedrock-runtime", region_name=AWS_REGION, config=config)


# ── LLM provider selection ───────────────────────────────────────────────────
# Two interchangeable backends behind llm.get_llm_client():
#   - "anthropic": Claude API direct (default; needs ANTHROPIC_API_KEY in env)
#   - "bedrock"  : AWS Bedrock Converse (for customer demos)
# The active provider is chosen at runtime via the front-end toggle, which calls
# set_llm_settings(); falls back to the LLM_PROVIDER env var, then "anthropic".
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "anthropic")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")

# ── LLM cost estimation ──────────────────────────────────────────────────────
# USD per 1,000,000 tokens (input, output) — Anthropic list price. This is an
# ESTIMATE only: it ignores Bedrock-specific pricing, volume/commit discounts,
# the Batch API's 50% discount, and prompt caching. Keys are bare model ids.
MODEL_PRICING = {
    "claude-opus-4-8": (5.0, 25.0),
    "claude-opus-4-7": (5.0, 25.0),
    "claude-opus-4-6": (5.0, 25.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
}
CACHE_READ_MULT = 0.1    # cache reads ~0.1x the input rate
CACHE_WRITE_MULT = 1.25  # 5-minute cache writes ~1.25x the input rate


def normalize_model_id(model: str) -> str:
    """Strip provider prefixes so Bedrock ids map to the bare pricing key, e.g.
    'global.anthropic.claude-sonnet-4-6' -> 'claude-sonnet-4-6'."""
    m = str(model or "")
    if "anthropic." in m:
        m = m.split("anthropic.", 1)[1]
    return m

# Session-level overrides set by the UI. api_key is normally None so the
# Anthropic SDK reads ANTHROPIC_API_KEY from the environment (no key in the UI).
_LLM_SETTINGS = {
    "provider": LLM_PROVIDER,
    "model": None,      # None -> provider default (BEDROCK_DEFAULT_MODEL_ID / ANTHROPIC_MODEL)
    "api_key": None,    # None -> read from environment
}


def set_llm_settings(provider=None, model=None, api_key=None):
    """Update the active LLM settings (called by the front-end toggle).

    Only non-None arguments overwrite existing values, except `model`, which is
    set whenever provided (pass model=None explicitly to reset to the provider
    default — typically done when switching provider).
    """
    if provider is not None:
        _LLM_SETTINGS["provider"] = provider
    if model is not None or provider is not None:
        # When the provider changes, default the model unless one was given.
        _LLM_SETTINGS["model"] = model
    if api_key is not None:
        _LLM_SETTINGS["api_key"] = api_key
    logger.info(f"[llm] settings updated: provider={_LLM_SETTINGS['provider']} model={_LLM_SETTINGS['model']}")


def get_llm_settings() -> dict:
    """Return a copy of the current LLM settings."""
    return dict(_LLM_SETTINGS)

# ── Stage 11 spreading ───────────────────────────────────────────────────────
# COA-mapping confidence gate: a row maps only when the model's top pick clears
# this score, else it routes to the unmapped queue. Lowered from 0.60 to 0.55 to
# recover the near-miss band (0.55-0.59), which the threshold-sensitivity study
# showed improves coverage and the A=L+E balance for most filings. Override per
# run via the SPREAD_CONFIDENCE_THRESHOLD env var or main.py --confidence-threshold.
SPREAD_CONFIDENCE_THRESHOLD = float(os.getenv("SPREAD_CONFIDENCE_THRESHOLD", "0.55"))

# Page classification thresholds (from page-classifier.ts)
DIGITAL_WORD_THRESHOLD = 80
DIGITAL_ASCII_THRESHOLD = 0.90
HYBRID_WORD_THRESHOLD = 20

# Page filter continuation window
CONTINUATION_MAX_WINDOW = 8

# Text windows
PAGE_TEXT_WINDOW = 2000         # Chars scanned for statement-type signals
MAX_PAGE_TEXT_FOR_EXTRACT = 6000  # Truncate single-page text sent to Claude
MAX_CONCAT_TEXT_FOR_EXTRACT = 12000  # Truncate multi-page concatenated text
MAX_NOTE_TEXT = 4000            # Truncate note text sent to Claude

# Extraction max tokens
TEXT_EXTRACT_MAX_TOKENS = 8192     # Claude output ceiling for text extraction
VISION_EXTRACT_MAX_TOKENS = 8192   # Claude output ceiling for vision extraction

# Rasterization
DEFAULT_DPI_SCALE = 2.0
SCANNED_DPI_SCALE = 1.5        # Lower DPI for classification (speed)
