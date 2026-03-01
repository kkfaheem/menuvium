"""
Image enhancer: processes raw dish images into "studio quality" output.

Two modes:
  LOCAL_ONLY  — Pillow-based: normalize orientation, resize, sharpen, contrast, pad, export WebP
  AI_ENHANCE  — External API (e.g., Replicate) for upscale + enhance, falls back to LOCAL_ONLY
"""

import io
import os
from typing import Optional

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_DIMENSION = 1600
TARGET_ASPECT_RATIO = 4 / 3  # 4:3 landscape
OUTPUT_QUALITY = 82
PAD_COLOR = (245, 245, 245)  # Light neutral gray


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def enhance_image(
    data: bytes,
    filename: str,
    log_fn=None,
) -> bytes:
    """Enhance an image, choosing AI or local mode based on config.

    Returns WebP bytes of the enhanced image.
    """
    if log_fn is None:
        log_fn = lambda msg: None

    provider = os.getenv("IMAGE_ENHANCE_PROVIDER")
    if provider:
        try:
            log_fn(f"AI-enhancing {filename} via {provider}")
            result = await _ai_enhance(data, provider)
            if result:
                # Apply local finishing pass (consistent sizing/format)
                return _local_enhance(result, apply_corrections=False)
        except Exception as e:
            log_fn(f"AI enhance failed for {filename}: {e}, falling back to local")

    log_fn(f"Local-enhancing {filename}")
    return _local_enhance(data, apply_corrections=True)


# ---------------------------------------------------------------------------
# LOCAL_ONLY processing
# ---------------------------------------------------------------------------

def _local_enhance(data: bytes, apply_corrections: bool = True) -> bytes:
    """Process an image with Pillow for studio-quality output.

    Steps:
    1. Fix EXIF orientation
    2. Convert to RGB
    3. Resize to max dimension
    4. Apply corrections (sharpen, contrast, denoise) if requested
    5. Pad to consistent aspect ratio
    6. Export as WebP
    """
    img = Image.open(io.BytesIO(data))

    # Fix EXIF orientation
    img = ImageOps.exif_transpose(img)

    # Convert to RGB (handles RGBA, palette, etc.)
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Resize to max dimension, maintaining aspect ratio
    img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)

    if apply_corrections:
        # Mild sharpening
        img = img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=80, threshold=3))

        # Slight contrast boost
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.08)

        # Slight color saturation boost
        enhancer = ImageEnhance.Color(img)
        img = enhancer.enhance(1.05)

        # Slight brightness normalization
        enhancer = ImageEnhance.Brightness(img)
        img = enhancer.enhance(1.02)

    # Pad to consistent aspect ratio (4:3)
    img = _pad_to_aspect_ratio(img, TARGET_ASPECT_RATIO)

    # Export as WebP
    output = io.BytesIO()
    img.save(output, format="WEBP", quality=OUTPUT_QUALITY, method=4)
    return output.getvalue()


def _pad_to_aspect_ratio(img: Image.Image, target_ratio: float) -> Image.Image:
    """Pad image with neutral background to match target aspect ratio.

    Uses the wider orientation (landscape) for the target ratio.
    """
    w, h = img.size
    current_ratio = w / h

    if abs(current_ratio - target_ratio) < 0.05:
        return img  # Close enough

    if current_ratio > target_ratio:
        # Image is wider than target — pad height
        new_h = int(w / target_ratio)
        new_img = Image.new("RGB", (w, new_h), PAD_COLOR)
        paste_y = (new_h - h) // 2
        new_img.paste(img, (0, paste_y))
    else:
        # Image is taller than target — pad width
        new_w = int(h * target_ratio)
        new_img = Image.new("RGB", (new_w, h), PAD_COLOR)
        paste_x = (new_w - w) // 2
        new_img.paste(img, (paste_x, 0))

    return new_img


# ---------------------------------------------------------------------------
# AI_ENHANCE processing
# ---------------------------------------------------------------------------

async def _ai_enhance(data: bytes, provider: str) -> Optional[bytes]:
    """Send image to external AI enhancement API.

    Currently supports:
    - "replicate": Uses Replicate's image upscaling models
    - "openai": Uses OpenAI's image editing API

    More providers can be added by implementing the pattern below.
    """
    provider = provider.lower().strip()

    if provider == "replicate":
        return await _enhance_via_replicate(data)
    elif provider == "openai":
        return await _enhance_via_openai(data)
    else:
        raise ValueError(f"Unknown IMAGE_ENHANCE_PROVIDER: {provider}")


async def _enhance_via_replicate(data: bytes) -> Optional[bytes]:
    """Enhance image using Replicate API."""
    api_token = os.getenv("REPLICATE_API_TOKEN")
    if not api_token:
        return None

    # TODO: Implement Replicate upscaling API call
    # This would use a model like "nightmareai/real-esrgan" for upscaling
    # For now, return None to fall back to local processing
    return None


async def _enhance_via_openai(data: bytes) -> Optional[bytes]:
    """Enhance image using OpenAI Image API."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    # TODO: Implement OpenAI image editing API call
    # For now, return None to fall back to local processing
    return None
