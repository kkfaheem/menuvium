"""
Image enhancer: processes raw dish images into consistent, premium output.

All images get the same treatment for visual consistency:
1. EXIF orientation fix
2. Convert to RGB
3. Center-crop to square (1:1) — best for menu displays
4. Resize to consistent dimensions
5. Auto brightness/contrast normalization
6. Consistent color saturation
7. Mild sharpening for food detail
8. Subtle vignette for premium feel
9. Export as WebP
"""

import io
import math
from typing import Optional

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps, ImageStat


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TARGET_SIZE = 800           # Square output: 800x800
OUTPUT_QUALITY = 82         # WebP quality
SHARPEN_RADIUS = 1.2
SHARPEN_PERCENT = 70
SHARPEN_THRESHOLD = 3
CONTRAST_FACTOR = 1.10      # Slightly boost contrast
SATURATION_FACTOR = 1.12    # Slightly boost color vibrance
VIGNETTE_STRENGTH = 0.15    # Subtle vignette (0 = none, 1 = max)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def enhance_image(
    data: bytes,
    filename: str,
    log_fn=None,
) -> bytes:
    """Enhance a dish image with consistent styling.

    Returns WebP bytes of the enhanced image.
    """
    if log_fn is None:
        log_fn = lambda msg: None

    log_fn(f"Enhancing {filename}")
    return _local_enhance(data)


# ---------------------------------------------------------------------------
# Enhancement pipeline
# ---------------------------------------------------------------------------

def _local_enhance(data: bytes) -> bytes:
    """Process an image with Pillow for consistent, premium output.

    All images go through identical treatment for visual cohesion.
    """
    img = Image.open(io.BytesIO(data))

    # 1. Fix EXIF orientation
    img = ImageOps.exif_transpose(img)

    # 2. Convert to RGB
    if img.mode != "RGB":
        img = img.convert("RGB")

    # 3. Center-crop to square
    img = _center_crop_square(img)

    # 4. Resize to target size
    img = img.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)

    # 5. Auto brightness normalization (bring all images to similar exposure)
    img = _auto_brightness(img)

    # 6. Contrast boost
    img = ImageEnhance.Contrast(img).enhance(CONTRAST_FACTOR)

    # 7. Color saturation boost (makes food look more appetizing)
    img = ImageEnhance.Color(img).enhance(SATURATION_FACTOR)

    # 8. Sharpening (crisp food detail)
    img = img.filter(ImageFilter.UnsharpMask(
        radius=SHARPEN_RADIUS,
        percent=SHARPEN_PERCENT,
        threshold=SHARPEN_THRESHOLD,
    ))

    # 9. Subtle vignette for premium feel
    if VIGNETTE_STRENGTH > 0:
        img = _apply_vignette(img, VIGNETTE_STRENGTH)

    # 10. Export as WebP
    output = io.BytesIO()
    img.save(output, format="WEBP", quality=OUTPUT_QUALITY, method=4)
    return output.getvalue()


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _center_crop_square(img: Image.Image) -> Image.Image:
    """Center-crop image to a square using the shorter dimension."""
    w, h = img.size
    if w == h:
        return img

    size = min(w, h)
    left = (w - size) // 2
    top = (h - size) // 2
    return img.crop((left, top, left + size, top + size))


def _auto_brightness(img: Image.Image, target_mean: float = 128.0) -> Image.Image:
    """Normalize brightness so all images have similar exposure.

    Calculates the mean brightness and adjusts to target.
    Clamps adjustment to avoid extreme changes.
    """
    stat = ImageStat.Stat(img)
    # Average brightness across R, G, B channels
    current_mean = sum(stat.mean[:3]) / 3.0

    if current_mean < 10:  # Nearly black image, skip
        return img

    factor = target_mean / current_mean
    # Clamp factor to prevent extreme adjustments
    factor = max(0.7, min(1.5, factor))

    return ImageEnhance.Brightness(img).enhance(factor)


def _apply_vignette(img: Image.Image, strength: float = 0.15) -> Image.Image:
    """Apply a subtle radial vignette effect for a premium look.

    Creates a dark gradient overlay that's transparent in the center
    and darkens toward the edges.
    """
    w, h = img.size
    # Create a radial gradient mask
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)

    # Fill with concentric ellipses from center (white) to edges (black)
    cx, cy = w // 2, h // 2
    max_radius = math.sqrt(cx * cx + cy * cy)
    steps = 60

    for i in range(steps, 0, -1):
        ratio = i / steps
        radius_x = int(cx * ratio * 1.4)  # Wider than image center
        radius_y = int(cy * ratio * 1.4)
        # Brightness: 255 at center → darker at edges
        brightness = int(255 * (1 - strength * (1 - ratio) ** 1.5))
        draw.ellipse(
            [cx - radius_x, cy - radius_y, cx + radius_x, cy + radius_y],
            fill=brightness,
        )

    # Apply mask as a multiplicative blend
    from PIL import ImageChops
    mask = mask.convert("RGB")
    return ImageChops.multiply(img, mask)
