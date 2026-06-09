"""Unit tests for detect_and_correct_rotation() — rotates landscape content
in portrait pages so Claude Vision can read sideways tables."""

from __future__ import annotations

import io

from PIL import Image

from pdf.page_rasterizer import detect_and_correct_rotation


def _make_png(width: int, height: int, draw_rect: bool = True) -> bytes:
    """Create a test PNG image, optionally with a non-white rectangle."""
    img = Image.new("RGB", (width, height), color=(255, 255, 255))
    if draw_rect:
        # Draw a dark rectangle in the center to give a bounding box
        from PIL import ImageDraw
        d = ImageDraw.Draw(img)
        margin_x = width // 10
        margin_y = height // 10
        d.rectangle(
            [margin_x, margin_y, width - margin_x, height - margin_y],
            fill=(0, 0, 0),
        )
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_portrait_content_no_rotation():
    """Portrait content in portrait page — no rotation needed."""
    png = _make_png(400, 800)  # Tall image
    result = detect_and_correct_rotation(png, 612.0, 792.0)  # Portrait page
    img = Image.open(io.BytesIO(result))
    assert img.width == 400
    assert img.height == 800


def test_landscape_content_in_portrait_page_rotated():
    """Landscape content in portrait page — should rotate 90 degrees."""
    png = _make_png(800, 400)  # Wide image with landscape content
    result = detect_and_correct_rotation(png, 612.0, 792.0)  # Portrait page
    img = Image.open(io.BytesIO(result))
    # After 90-degree rotation, dimensions swap
    assert img.width == 400
    assert img.height == 800


def test_landscape_page_no_rotation():
    """Landscape page dimensions — no rotation (page itself is landscape)."""
    png = _make_png(800, 400)  # Wide content
    result = detect_and_correct_rotation(png, 792.0, 612.0)  # Landscape page
    img = Image.open(io.BytesIO(result))
    assert img.width == 800
    assert img.height == 400


def test_empty_image_no_crash():
    """All-white image has no bounding box — returns original unchanged."""
    png = _make_png(400, 600, draw_rect=False)
    result = detect_and_correct_rotation(png, 612.0, 792.0)
    assert result == png


def test_rotation_produces_valid_png():
    """Rotated output starts with PNG magic bytes."""
    png = _make_png(800, 400)
    result = detect_and_correct_rotation(png, 612.0, 792.0)
    assert result[:4] == b"\x89PNG"
