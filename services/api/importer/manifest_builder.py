"""
Manifest builder: creates manifest.json matching the Menuvium export schema.

Expects enriched ParsedMenu where each item has:
- dietary_tags, allergens (from AI enrichment)
- image_filename (from per-dish image finder)
"""

import json
from datetime import datetime, timezone

from importer.menu_extractor import ParsedMenu
from importer.utils import slugify


def build_manifest(
    restaurant_name: str,
    parsed_menu: ParsedMenu,
    theme: str = "noir",
) -> str:
    """Build manifest.json string matching Menuvium's exact schema.

    Each item already carries its own image_filename, dietary_tags,
    and allergens from the enrichment + image-finding steps.
    """
    menu_slug = slugify(restaurant_name)

    categories = []
    for rank, cat in enumerate(parsed_menu.categories):
        items = []
        for pos, item in enumerate(cat.items):
            photos = []
            if item.image_filename:
                photos.append({
                    "original_url": "",
                    "filename": f"images/{item.image_filename}",
                })

            items.append({
                "name": item.name,
                "description": item.description,
                "price": item.price if item.price is not None else 0.00,
                "position": pos,
                "is_sold_out": False,
                "dietary_tags": item.dietary_tags or [],
                "allergens": item.allergens or [],
                "photos": photos,
            })

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
