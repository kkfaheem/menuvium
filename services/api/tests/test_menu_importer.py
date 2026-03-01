"""
Unit tests for the admin menu importer feature.

Tests:
  - slugify() function
  - manifest_builder — output matches Menuvium schema
  - HTML menu extraction basics
"""

import json
import sys
import os

# Add the services/api directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestSlugify:
    """Tests for importer.utils.slugify"""

    def test_basic(self):
        from importer.utils import slugify
        assert slugify("The Gilded Fork") == "the-gilded-fork"

    def test_special_chars(self):
        from importer.utils import slugify
        assert slugify("Joe's Bar & Grill!") == "joe-s-bar-grill"

    def test_unicode(self):
        from importer.utils import slugify
        assert slugify("Café Résumé") == "cafe-resume"

    def test_multiple_spaces(self):
        from importer.utils import slugify
        assert slugify("  The   Great   Escape  ") == "the-great-escape"

    def test_numbers(self):
        from importer.utils import slugify
        assert slugify("Restaurant 42") == "restaurant-42"

    def test_empty_string(self):
        from importer.utils import slugify
        assert slugify("") == "restaurant"

    def test_only_special_chars(self):
        from importer.utils import slugify
        assert slugify("@#$%^&*") == "restaurant"


class TestManifestBuilder:
    """Tests for importer.manifest_builder.build_manifest"""

    def test_schema_matches(self):
        from importer.manifest_builder import build_manifest
        from importer.menu_extractor import ParsedMenu, ParsedCategory, ParsedItem

        menu = ParsedMenu(
            categories=[
                ParsedCategory(
                    name="Appetizers",
                    items=[
                        ParsedItem(name="Spring Rolls", description="Crispy veggie rolls", price=8.99),
                        ParsedItem(name="Soup", description=None, price=5.50),
                    ],
                ),
                ParsedCategory(
                    name="Mains",
                    items=[
                        ParsedItem(name="Grilled Salmon", description="Atlantic salmon", price=22.00),
                    ],
                ),
            ]
        )

        manifest_str = build_manifest(
            restaurant_name="Test Restaurant",
            parsed_menu=menu,
            image_filenames=["dish_001.webp", "dish_002.webp", "dish_003.webp"],
        )

        manifest = json.loads(manifest_str)

        # Top-level keys
        assert manifest["version"] == "1.0"
        assert "exported_at" in manifest
        assert manifest["menu_name"] == "Test Restaurant"
        assert manifest["menu_slug"] == "test-restaurant"
        assert manifest["menu_theme"] == "noir"
        assert manifest["menu_is_active"] is True
        assert manifest["menu_banner_url"] is None
        assert manifest["menu_logo_url"] is None
        assert isinstance(manifest["categories"], list)
        assert len(manifest["categories"]) == 2

        # Category structure
        cat = manifest["categories"][0]
        assert cat["name"] == "Appetizers"
        assert cat["rank"] == 0
        assert len(cat["items"]) == 2

        # Item structure
        item = cat["items"][0]
        assert item["name"] == "Spring Rolls"
        assert item["description"] == "Crispy veggie rolls"
        assert item["price"] == 8.99
        assert item["position"] == 0
        assert item["is_sold_out"] is False
        assert isinstance(item["dietary_tags"], list)
        assert isinstance(item["allergens"], list)
        assert isinstance(item["photos"], list)
        assert len(item["photos"]) == 1
        assert item["photos"][0]["filename"] == "images/dish_001.webp"

    def test_no_categories(self):
        from importer.manifest_builder import build_manifest
        from importer.menu_extractor import ParsedMenu

        manifest_str = build_manifest(
            restaurant_name="Empty Menu",
            parsed_menu=ParsedMenu(),
            image_filenames=["dish_001.webp"],
        )
        manifest = json.loads(manifest_str)
        assert len(manifest["categories"]) == 1
        assert manifest["categories"][0]["name"] == "Menu Items"
        assert len(manifest["categories"][0]["items"]) == 1

    def test_no_images(self):
        from importer.manifest_builder import build_manifest
        from importer.menu_extractor import ParsedMenu, ParsedCategory, ParsedItem

        menu = ParsedMenu(
            categories=[
                ParsedCategory(
                    name="Drinks",
                    items=[ParsedItem(name="Coffee", price=3.50)],
                )
            ]
        )
        manifest_str = build_manifest(
            restaurant_name="Coffee Shop",
            parsed_menu=menu,
            image_filenames=[],
        )
        manifest = json.loads(manifest_str)
        assert manifest["categories"][0]["items"][0]["photos"] == []


class TestHTMLMenuExtraction:
    """Tests for HTML menu text extraction internals."""

    def test_extract_menu_text(self):
        from importer.menu_extractor import _extract_menu_text_from_html
        from bs4 import BeautifulSoup

        html = """
        <html>
        <head><title>Test Menu</title></head>
        <body>
            <header><nav>Navigation</nav></header>
            <main>
                <h1>Our Menu</h1>
                <h2>Appetizers</h2>
                <div class="item">
                    <span class="name">Spring Rolls</span>
                    <span class="price">$8.99</span>
                </div>
                <div class="item">
                    <span class="name">Caesar Salad</span>
                    <span class="price">$12.50</span>
                </div>
            </main>
            <footer>Contact us</footer>
        </body>
        </html>
        """
        soup = BeautifulSoup(html, "html.parser")
        text = _extract_menu_text_from_html(soup)

        assert "Our Menu" in text
        assert "Spring Rolls" in text
        assert "$8.99" in text
        assert "Caesar Salad" in text
        # Nav and footer should be removed
        assert "Navigation" not in text
        assert "Contact us" not in text

    def test_looks_like_menu(self):
        from importer.menu_extractor import _looks_like_menu

        menu_text = "Spring Rolls $8.99\nCaesar Salad $12.50\nGrilled Salmon $22.00\nPasta $15.99"
        assert _looks_like_menu(menu_text) is True

        non_menu = "Contact us at info@restaurant.com"
        assert _looks_like_menu(non_menu) is False

    def test_discover_menu_links(self):
        from importer.menu_extractor import _discover_menu_links
        from bs4 import BeautifulSoup

        html = """
        <html>
        <body>
            <a href="/menu">Our Menu</a>
            <a href="/about">About Us</a>
            <a href="/food-menu">Food Menu</a>
            <a href="https://external.com/menu">External</a>
        </body>
        </html>
        """
        soup = BeautifulSoup(html, "html.parser")
        links = _discover_menu_links("https://restaurant.com", soup)

        assert "https://restaurant.com/menu" in links
        assert "https://restaurant.com/food-menu" in links
        assert "https://restaurant.com/about" not in links
        assert "https://external.com/menu" not in links

    def test_fallback_parse(self):
        from importer.menu_extractor import _fallback_parse

        text = """
Spring Rolls 8.99
Caesar Salad $12.50
Grilled Salmon $22.00
Coffee 3.50
"""
        result = _fallback_parse(text)
        assert len(result.categories) == 1
        assert len(result.categories[0].items) >= 3
        # Check that items have names and prices
        names = [item.name for item in result.categories[0].items]
        assert "Spring Rolls" in names or any("Spring" in n for n in names)
