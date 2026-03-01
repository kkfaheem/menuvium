"""
Image collector: discovers and downloads dish images from restaurant websites.

Sources (in priority order):
1. Restaurant website (homepage, /menu, /gallery, /photos pages)
2. Google Places Photos (if GOOGLE_PLACES_API_KEY configured)
3. Instagram/social links found on website (only if public)
"""

import os
from typing import Optional
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from importer.utils import (
    fetch_url_bytes,
    fetch_url_text,
    image_hash,
    is_image_url,
    is_likely_dish_image,
    normalize_url,
)


# Pages to crawl for images
IMAGE_PAGE_PATHS = [
    "", "/menu", "/food-menu", "/menus", "/gallery", "/photos",
    "/our-food", "/food", "/dishes",
]


async def collect_images(
    website_url: str,
    restaurant_name: str,
    max_images: int = 30,
    log_fn=None,
) -> list[dict]:
    """Discover and download dish images.

    Returns list of dicts: {"url": str, "data": bytes, "hash": str, "filename": str}
    Deduplicates by content hash.
    """
    if log_fn is None:
        log_fn = lambda msg: None

    candidate_urls: list[str] = []
    seen_hashes: set[str] = set()
    results: list[dict] = []

    # 1. Crawl website pages for images
    base_parsed = urlparse(website_url)
    base_origin = f"{base_parsed.scheme}://{base_parsed.netloc}"

    for path in IMAGE_PAGE_PATHS:
        page_url = f"{base_origin}{path}"
        try:
            log_fn(f"Scanning for images: {page_url}")
            html = await fetch_url_text(page_url)
            soup = BeautifulSoup(html, "html.parser")
            page_images = _extract_image_urls(page_url, soup)
            candidate_urls.extend(page_images)
        except Exception as e:
            log_fn(f"Could not fetch {page_url}: {e}")

    # Deduplicate URLs
    unique_urls = list(dict.fromkeys(candidate_urls))
    log_fn(f"Found {len(unique_urls)} unique candidate image URLs")

    # 2. Google Places Photos (optional)
    places_key = os.getenv("GOOGLE_PLACES_API_KEY")
    if places_key:
        places_urls = await _get_places_photos(restaurant_name, places_key, log_fn)
        unique_urls.extend(places_urls)
        log_fn(f"Added {len(places_urls)} Google Places photos")

    # 3. Download and deduplicate images
    download_count = 0
    for url in unique_urls:
        if download_count >= max_images:
            break
        try:
            data = await fetch_url_bytes(url, timeout=20.0)
            if len(data) < 5000:  # Skip tiny images
                continue

            h = image_hash(data)
            if h in seen_hashes:
                continue
            seen_hashes.add(h)

            # Determine file extension
            ext = _get_image_extension(url, data)
            idx = len(results) + 1
            filename = f"dish_{idx:03d}{ext}"

            results.append({
                "url": url,
                "data": data,
                "hash": h,
                "filename": filename,
            })
            download_count += 1
            log_fn(f"Downloaded image {download_count}: {filename}")

        except Exception as e:
            log_fn(f"Failed to download {url}: {e}")

    log_fn(f"Collected {len(results)} images total")
    return results


def _extract_image_urls(page_url: str, soup: BeautifulSoup) -> list[str]:
    """Extract image URLs from an HTML page, filtering out icons/logos."""
    urls: list[str] = []

    # <img> tags
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or img.get("data-lazy-src")
        if not src:
            continue
        resolved = normalize_url(page_url, src)
        if resolved and is_likely_dish_image(resolved):
            # Try to check dimensions from attributes
            width = _parse_int(img.get("width", "0"))
            height = _parse_int(img.get("height", "0"))
            if width > 0 and height > 0 and (width < 100 or height < 100):
                continue
            urls.append(resolved)

        # Also check srcset
        srcset = img.get("srcset", "")
        if srcset:
            for part in srcset.split(","):
                src_part = part.strip().split(" ")[0]
                resolved = normalize_url(page_url, src_part)
                if resolved and is_likely_dish_image(resolved):
                    urls.append(resolved)

    # <source> tags (picture element)
    for source in soup.find_all("source"):
        srcset = source.get("srcset", "")
        for part in srcset.split(","):
            src_part = part.strip().split(" ")[0]
            resolved = normalize_url(page_url, src_part)
            if resolved and is_likely_dish_image(resolved):
                urls.append(resolved)

    # og:image meta tag
    og = soup.find("meta", property="og:image")
    if og and og.get("content"):
        resolved = normalize_url(page_url, og["content"])
        if resolved:
            urls.append(resolved)

    # JSON-LD (look for images in structured data)
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            import json
            data = json.loads(script.string or "")
            _extract_jsonld_images(data, page_url, urls)
        except Exception:
            pass

    return urls


def _extract_jsonld_images(data, base_url: str, urls: list[str]):
    """Recursively extract image URLs from JSON-LD structured data."""
    if isinstance(data, dict):
        for key in ("image", "photo", "thumbnail"):
            val = data.get(key)
            if isinstance(val, str):
                resolved = normalize_url(base_url, val)
                if resolved:
                    urls.append(resolved)
            elif isinstance(val, list):
                for v in val:
                    if isinstance(v, str):
                        resolved = normalize_url(base_url, v)
                        if resolved:
                            urls.append(resolved)
        for v in data.values():
            _extract_jsonld_images(v, base_url, urls)
    elif isinstance(data, list):
        for item in data:
            _extract_jsonld_images(item, base_url, urls)


async def _get_places_photos(
    restaurant_name: str, api_key: str, log_fn
) -> list[str]:
    """Get photo URLs from Google Places API."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            search_resp = await client.get(
                "https://maps.googleapis.com/maps/api/place/textsearch/json",
                params={"query": f"{restaurant_name} restaurant", "key": api_key},
            )
            results = search_resp.json().get("results", [])
            if not results:
                return []

            place_id = results[0].get("place_id")
            if not place_id:
                return []

            details_resp = await client.get(
                "https://maps.googleapis.com/maps/api/place/details/json",
                params={
                    "place_id": place_id,
                    "fields": "photos",
                    "key": api_key,
                },
            )
            photos = details_resp.json().get("result", {}).get("photos", [])
            urls = []
            for photo in photos[:10]:
                ref = photo.get("photo_reference")
                if ref:
                    url = (
                        f"https://maps.googleapis.com/maps/api/place/photo"
                        f"?maxwidth=1600&photo_reference={ref}&key={api_key}"
                    )
                    urls.append(url)
            return urls
    except Exception as e:
        log_fn(f"Google Places photos failed: {e}")
        return []


def _get_image_extension(url: str, data: bytes) -> str:
    """Determine image file extension from URL or magic bytes."""
    path = urlparse(url).path.lower()
    if path.endswith(".png"):
        return ".png"
    if path.endswith(".webp"):
        return ".webp"
    if path.endswith(".gif"):
        return ".gif"
    # Check magic bytes
    if data[:2] == b"\x89P":
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return ".jpg"  # Default to JPEG


def _parse_int(value: str) -> int:
    """Parse an integer from a string, returning 0 on failure."""
    try:
        return int(value)
    except (ValueError, TypeError):
        return 0
