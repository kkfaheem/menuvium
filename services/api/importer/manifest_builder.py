"""
Manifest builder: creates manifest.json matching the Menuvium export schema.

Expects enriched ParsedMenu where each item has:
- dietary_tags, allergens (from AI enrichment)
- image_filename (from per-dish image finder)
"""

import json
from datetime import datetime, timezone
from typing import Optional

from importer.menu_extractor import ParsedMenu
from importer.utils import slugify


def _photo_filename(filename: Optional[str]) -> list[dict[str, str]]:
    if not filename:
        return []
    normalized = filename if filename.startswith("images/") else f"images/{filename}"
    return [{
        "original_url": "",
        "filename": normalized,
    }]


def _manifest_item(
    *,
    name: str,
    description: Optional[str],
    price: Optional[float],
    position: int,
    dietary_tags: Optional[list[str]],
    allergens: Optional[list[str]],
    image_filename: Optional[str],
) -> dict:
    return {
        "name": name,
        "description": description,
        "price": price if price is not None else 0.00,
        "position": position,
        "is_sold_out": False,
        "dietary_tags": dietary_tags or [],
        "allergens": allergens or [],
        "photos": _photo_filename(image_filename),
    }


def build_manifest(
    restaurant_name: str,
    parsed_menu: ParsedMenu,
    theme: str = "noir",
    image_filenames: Optional[list[str]] = None,
) -> str:
    """Build manifest.json string matching Menuvium's exact schema.

    Each item already carries its own image_filename, dietary_tags,
    and allergens from the enrichment + image-finding steps.
    `image_filenames` is kept for backward compatibility with the
    older importer flow and tests.
    """
    menu_slug = slugify(restaurant_name)
    legacy_images = image_filenames if image_filenames is not None else None
    legacy_idx = 0

    categories = []
    if not parsed_menu.categories and legacy_images:
        placeholder_items = []
        for pos, filename in enumerate(legacy_images):
            placeholder_items.append(_manifest_item(
                name=f"Item {pos + 1}",
                description=None,
                price=0.00,
                position=pos,
                dietary_tags=[],
                allergens=[],
                image_filename=filename,
            ))
        categories.append({
            "name": "Menu Items",
            "rank": 0,
            "items": placeholder_items,
        })

    for rank, cat in enumerate(parsed_menu.categories):
        items = []
        for pos, item in enumerate(cat.items):
            image_filename = item.image_filename
            if legacy_images is not None and legacy_idx < len(legacy_images):
                image_filename = legacy_images[legacy_idx]
                legacy_idx += 1

            items.append(_manifest_item(
                name=item.name,
                description=item.description,
                price=item.price,
                position=pos,
                dietary_tags=item.dietary_tags,
                allergens=item.allergens,
                image_filename=image_filename,
            ))

        categories.append({
            "name": cat.name,
            "rank": rank,
            "items": items,
        })

    manifest = {
        "version": "1.0",
        "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "menu_name": restaurant_name,
        "menu_slug": menu_slug,
        "menu_theme": theme,
        "menu_is_active": True,
        "menu_banner_url": None,
        "menu_logo_url": None,
        "categories": categories,
    }

    return json.dumps(manifest, indent=4, ensure_ascii=False)
