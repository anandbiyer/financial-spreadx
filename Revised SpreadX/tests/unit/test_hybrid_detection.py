"""Unit tests for hybrid page detection — reclassifies digital pages
with high drawing counts and low word counts to scanned (vision path)."""

from __future__ import annotations

from models.page import ClassifiedPage


def _make_page(word_count: int, drawing_count: int,
               classification: str = "digital") -> ClassifiedPage:
    return ClassifiedPage(
        page_number=1,
        classification=classification,
        word_count=word_count,
        ascii_ratio=0.95,
        text_content="x " * word_count,
        drawing_count=drawing_count,
    )


def _apply_hybrid_detection(page: ClassifiedPage) -> None:
    """Replicate the orchestrator's hybrid detection logic."""
    if page.classification != "digital":
        return
    if (page.drawing_count > 100
            and page.drawing_count > 0
            and page.word_count < page.drawing_count * 0.5):
        page.classification = "scanned"
        page.requires_ocr = True


def test_digital_page_not_reclassified():
    """Normal digital page (200 words, 50 drawings) stays digital."""
    page = _make_page(word_count=200, drawing_count=50)
    _apply_hybrid_detection(page)
    assert page.classification == "digital"


def test_hybrid_page_with_many_drawings_reclassified():
    """Page with 100 words and 1400 drawings is reclassified to scanned."""
    page = _make_page(word_count=100, drawing_count=1400)
    _apply_hybrid_detection(page)
    assert page.classification == "scanned"
    assert page.requires_ocr is True


def test_scanned_page_unchanged():
    """Already-scanned page is not affected by detection."""
    page = _make_page(word_count=5, drawing_count=0, classification="scanned")
    _apply_hybrid_detection(page)
    assert page.classification == "scanned"


def test_hybrid_threshold_boundary():
    """word_count exactly at drawing_count * 0.5 stays digital (not strictly less)."""
    page = _make_page(word_count=100, drawing_count=200)
    _apply_hybrid_detection(page)
    assert page.classification == "digital"


def test_low_drawing_count_not_triggered():
    """50 words, 80 drawings — below 100 drawing threshold, stays digital."""
    page = _make_page(word_count=50, drawing_count=80)
    _apply_hybrid_detection(page)
    assert page.classification == "digital"


def test_hybrid_page_keeps_text_content():
    """After reclassification, text_content is preserved for fallback."""
    page = _make_page(word_count=120, drawing_count=1500)
    original_text = page.text_content
    _apply_hybrid_detection(page)
    assert page.classification == "scanned"
    assert page.text_content == original_text
