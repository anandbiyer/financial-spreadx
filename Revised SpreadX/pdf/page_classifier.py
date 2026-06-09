"""S2 — Page Classifier.

Classifies every page of a PDF as digital, scanned, or hybrid based on
word count and ASCII ratio thresholds.

Ported from: financial-spreadx/lib/pdf/page-classifier.ts
"""

from __future__ import annotations

import fitz  # PyMuPDF

from config import (
    DIGITAL_ASCII_THRESHOLD,
    DIGITAL_WORD_THRESHOLD,
    HYBRID_WORD_THRESHOLD,
)
from models.page import ClassifiedPage, PageClassification


def classify_by_thresholds(
    word_count: int, ascii_ratio: float
) -> PageClassification:
    """Apply deterministic thresholds to classify a page.

    Thresholds (same as TypeScript version):
        digital : word_count >= 80  AND  ascii_ratio >= 0.90
        hybrid  : word_count >= 20  (partial text layer)
        scanned : word_count < 20   (text layer absent / garbage)
    """
    if word_count >= DIGITAL_WORD_THRESHOLD and ascii_ratio >= DIGITAL_ASCII_THRESHOLD:
        return "digital"
    elif word_count >= HYBRID_WORD_THRESHOLD:
        return "hybrid"
    else:
        return "scanned"


def classify_pdf_pages(pdf_bytes: bytes) -> list[ClassifiedPage]:
    """Classify every page of a PDF buffer.

    Uses PyMuPDF (fitz) for per-page text extraction, then applies
    word-count / ASCII-ratio thresholds to classify each page.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages: list[ClassifiedPage] = []

    try:
        for page_idx in range(len(doc)):
            page = doc[page_idx]
            text: str = page.get_text("text")

            # Count words (filter tokens with length > 1, matching TS behavior)
            words = [w for w in text.split() if len(w) > 1]
            word_count = len(words)

            # ASCII ratio: proportion of characters with ordinal < 128
            ascii_count = sum(1 for ch in text if ord(ch) < 128)
            ascii_ratio = ascii_count / len(text) if len(text) > 0 else 0.0

            classification = classify_by_thresholds(word_count, ascii_ratio)

            # Count vector drawings (used for hybrid detection and DPI decisions)
            drawing_count = len(page.get_drawings())

            pages.append(
                ClassifiedPage(
                    page_number=page_idx + 1,  # 1-based
                    classification=classification,
                    word_count=word_count,
                    ascii_ratio=round(ascii_ratio, 4),
                    text_content=text if classification != "scanned" else "",
                    requires_ocr=classification == "scanned",
                    drawing_count=drawing_count,
                    page_width=page.rect.width,
                    page_height=page.rect.height,
                )
            )
    finally:
        doc.close()

    return pages


def summarize_classifications(
    pages: list[ClassifiedPage],
) -> dict[str, int]:
    """Return counts of each classification type."""
    return {
        "digital": sum(1 for p in pages if p.classification == "digital"),
        "scanned": sum(1 for p in pages if p.classification == "scanned"),
        "hybrid": sum(1 for p in pages if p.classification == "hybrid"),
        "total": len(pages),
    }
