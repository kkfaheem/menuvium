"""
Per-dish image finder: searches for an image matching each menu item.

Strategy (per dish):
1. Search restaurant website HTML for <img> near the dish name
2. Google Images via SerpAPI (if configured)
3. AI-generate a studio food photo via DALL-E (if configured)
"""

import json
import os
import re
from typing import Optional
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from importer.utils import (
    fetch_url_bytes,
    fetch_url_text,
    image_hash,
    is_likely_dish_image,
    normalize_url,
)


# Cache of already-fetched website HTML (url → BeautifulSoup)
_html_cache: dict[str, Optional[BeautifulSoup]] = {}


async def _get_page_soup(url: str, log_fn) -> Optional[BeautifulSoup]:
    """Fetch and cache a page's BeautifulSoup."""
    if url in _html_cache:
        return _html_cache[url]
    try:
        html = await fetch_url_text(url)
        soup = BeautifulSoup(html, "html.parser")
        _html_cache[url] = soup
        return soup
    except Exception:
        _html_cache[url] = None
        return None


def _normalise_name(name: str) -> str:
    """Lowercase, strip non-alpha for fuzzy matching."""
    return re.sub(r"[^a-z0-9 ]", "", name.lower()).strip()


def _score_image_for_dish(
    img_tag, dish_name_lower: str, page_soup: BeautifulSoup
) -> int:
    """Score how well an <img> tag matches a dish name. Higher = better."""
    score = 0
    alt = (img_tag.get("alt") or "").lower()
    title = (img_tag.get("title") or "").lower()
    src = (img_tag.get("src") or "").lower()

    # Direct match in alt text
    if dish_name_lower in alt:
        score += 10
    # Partial word overlap
    dish_words = set(dish_name_lower.split())
    alt_words = set(alt.split())
    overlap = dish_words & alt_words
    if overlap:
        score += len(overlap) * 2

    # Match in title
    if dish_name_lower in title:
        score += 8

    # Match in src/filename
    if any(w in src for w in dish_words if len(w) > 3):
        score += 3

    # Check nearby text (parent container)
    parent = img_tag.parent
    for _ in range(3):  # Walk up 3 levels
        if parent is None:
            break
        parent_text = parent.get_text(separator=" ", strip=True).lower()
        if dish_name_lower in parent_text:
            score += 5
            break
        # Check word overlap in parent text
        parent_words = set(parent_text.split())
        if len(dish_words & parent_words) >= 2:
            score += 2
        parent = parent.parent

    return score


async def find_dish_image(
    dish_name: str,
    website_url: str,
    restaurant_name: str,
    page_urls: list[str],
    seen_hashes: set[str],
    log_fn=None,
) -> Optional[dict]:
    """Find an image for a specific dish.

    Returns {filename: str, data: bytes} or None.
    """
    if log_fn is None:
        log_fn = lambda msg: None

    dish_lower = _normalise_name(dish_name)
    if not dish_lower:
        return None

    # --- Strategy 1: Search website HTML pages ---
    best_url = None
    best_score = 0

    for page_url in page_urls:
        soup = await _get_page_soup(page_url, log_fn)
        if not soup:
            continue

        for img in soup.find_all("img"):
            src = img.get("src") or img.get("data-src") or img.get("data-lazy-src")
            if not src:
                continue
            resolved = normalize_url(page_url, src)
            if not resolved or not is_likely_dish_image(resolved):
                continue

            score = _score_image_for_dish(img, dish_lower, soup)
            if score > best_score:
                best_score = score
                best_url = resolved

    # Only use website image if score is meaningful
    if best_url and best_score >= 3:
        try:
            data = await fetch_url_bytes(best_url, timeout=15.0)
            if len(data) > 3000:
                h = image_hash(data)
                if h not in seen_hashes:
                    seen_hashes.add(h)
                    ext = _get_image_extension(best_url, data)
                    return {"data": data, "ext": ext, "source": "website"}
        except Exception:
            pass

    # --- Strategy 2: Google Images via SerpAPI ---
    serp_key = os.getenv("SERPAPI_KEY")
    if serp_key:
        img_data = await _search_google_image(dish_name, restaurant_name, serp_key, seen_hashes)
        if img_data:
            return img_data

    # --- Strategy 3: AI-generate image via DALL-E ---
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        img_data = await _generate_dish_image(dish_name, restaurant_name, openai_key, log_fn)
        if img_data:
            return img_data

    return None


async def _search_google_image(
    dish_name: str,
    restaurant_name: str,
    api_key: str,
    seen_hashes: set[str],
) -> Optional[dict]:
    """Search Google Images via SerpAPI for a specific dish."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://serpapi.com/search",
                params={
                    "q": f"{dish_name} {restaurant_name} food",
                    "tbm": "isch",
                    "api_key": api_key,
                    "num": 3,
                },
            )
            data = resp.json()
            for result in data.get("images_results", [])[:3]:
                img_url = result.get("original")
                if not img_url:
                    continue
                try:
                    img_data = await fetch_url_bytes(img_url, timeout=10.0)
                    if len(img_data) > 3000:
                        h = image_hash(img_data)
                        if h not in seen_hashes:
                            seen_hashes.add(h)
                            ext = _get_image_extension(img_url, img_data)
                            return {"data": img_data, "ext": ext, "source": "google"}
                except Exception:
                    continue
    except Exception:
        pass
    return None


async def _generate_dish_image(
    dish_name: str,
    restaurant_name: str,
    api_key: str,
    log_fn,
) -> Optional[dict]:
    """Generate a studio-quality food photo using DALL-E."""
    try:
        from openai import OpenAI
        import httpx

        client = OpenAI(api_key=api_key)
        prompt = (
            f"Professional studio food photography of \"{dish_name}\", "
            f"beautifully plated on an elegant dish, "
            f"shot from a 45-degree angle, soft natural lighting, "
            f"shallow depth of field, clean white or dark slate background, "
            f"restaurant-quality presentation, high resolution, appetizing"
        )

        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1024x1024",
            quality="standard",
            n=1,
        )

        image_url = response.data[0].url
        if image_url:
            async with httpx.AsyncClient(timeout=30) as http_client:
                img_resp = await http_client.get(image_url)
                img_resp.raise_for_status()
                return {"data": img_resp.content, "ext": ".png", "source": "ai_generated"}

    except Exception as e:
        log_fn(f"DALL-E generation failed for '{dish_name}': {e}")

    return None


def _get_image_extension(url: str, data: bytes) -> str:
    """Determine image file extension from URL or magic bytes."""
    path = urlparse(url).path.lower()
    if path.endswith(".png"):
        return ".png"
    if path.endswith(".webp"):
        return ".webp"
    if path.endswith(".gif"):
        return ".gif"
    if data[:2] == b"\x89P":
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return ".jpg"
