"""
Manifest builder: creates manifest.json matching the Menuvium export schema.

Output format matches demo_menu/manifest.json and routers/export.py exactly:
{
  "version": "1.0",
  "exported_at": "...",
  "menu_name": "...",
  "menu_slug": "...",
  "menu_theme": "noir",
  "menu_is_active": true,
  "menu_banner_url": null,
  "menu_logo_url": null,
  "categories": [
    {
      "name": "...",
      "rank": 0,
      "items": [
        {
          "name": "...",
          "description": "...",
          "price": 12.99,
          "position": 0,
          "is_sold_out": false,
          "dietary_tags": [],
          "allergens": [],
          "photos": [{"original_url": "", "filename": "images/dish_001.webp"}]
        }
      ]
    }
  ]
}
"""

import json
from datetime import datetime, timezone
from typing import Optional

from importer.menu_extractor import ParsedMenu
from importer.utils import slugify


def build_manifest(
    restaurant_name: str,
    parsed_menu: ParsedMenu,
    image_filenames: list[str],
    theme: str = "noir",
) -> str:
    """Build manifest.json string matching Menuvium's exact schema.

    Args:
        restaurant_name: Display name of the restaurant
        parsed_menu: Structured menu data from extractor
        image_filenames: List of enhanced image filenames (e.g., ["dish_001.webp", ...])
        theme: Menu theme to set (default: "noir")

    Returns:
        JSON string of the manifest
    """
    menu_slug = slugify(restaurant_name)

    # Build categories with items
    categories = []
    image_idx = 0  # Track which images to assign to items

    if parsed_menu.categories:
        for rank, cat in enumerate(parsed_menu.categories):
            items = []
            for pos, item in enumerate(cat.items):
                # Assign images to items round-robin if we have images
                photos = []
                if image_filenames and image_idx < len(image_filenames):
                    photos.append({
                        "original_url": "",
                        "filename": f"images/{image_filenames[image_idx]}",
                    })
                    image_idx += 1

                items.append({
                    "name": item.name,
                    "description": item.description,
                    "price": item.price if item.price is not None else 0.00,
                    "position": pos,
                    "is_sold_out": False,
                    "dietary_tags": [],
                    "allergens": [],
                    "photos": photos,
                })

            categories.append({
                "name": cat.name,
                "rank": rank,
                "items": items,
            })
    else:
        # No parsed categories — create a placeholder with unassigned images
        items_with_images = []
        for i, fname in enumerate(image_filenames):
            items_with_images.append({
                "name": f"Dish {i + 1}",
                "description": None,
                "price": 0.00,
                "position": i,
                "is_sold_out": False,
                "dietary_tags": [],
                "allergens": [],
                "photos": [{"original_url": "", "filename": f"images/{fname}"}],
            })
        if items_with_images:
            categories.append({
                "name": "Menu Items",
                "rank": 0,
                "items": items_with_images,
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
