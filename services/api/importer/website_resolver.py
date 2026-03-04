"""
Website resolver: determines the restaurant's official website URL.

Priority:
1. User-provided override
2. Google Places API (if GOOGLE_PLACES_API_KEY configured)
3. SerpAPI web search (if SERPAPI_KEY configured)
4. Mark job as NEEDS_INPUT
"""

import os
from typing import Optional
from urllib.parse import urlparse

import httpx

from importer.utils import fetch_url_text


# Domains that are link aggregators or not actual restaurant sites
AGGREGATOR_DOMAINS = {
    "linktr.ee", "linktree.com", "campsite.bio", "bio.link",
    "beacons.ai", "lnk.bio", "tap.bio", "linkpop.com",
    "heylink.me", "solo.to", "milkshake.app",
}

SKIP_DOMAINS = {
    "yelp.com", "tripadvisor.com", "facebook.com",
    "instagram.com", "twitter.com", "x.com", "tiktok.com",
    "doordash.com", "ubereats.com", "grubhub.com",
    "opentable.com", "postmates.com", "seamless.com",
    "zomato.com", "foursquare.com", "google.com",
}


def _is_aggregator(url: str) -> bool:
    """Check if a URL is a link aggregator site."""
    domain = urlparse(url).netloc.lower().lstrip("www.")
    return any(agg in domain for agg in AGGREGATOR_DOMAINS)


def _is_skip_domain(url: str) -> bool:
    """Check if a URL is a social media or review site to skip."""
    domain = urlparse(url).netloc.lower().lstrip("www.")
    return any(skip in domain for skip in SKIP_DOMAINS)


async def _follow_aggregator(url: str) -> Optional[str]:
    """Fetch a link aggregator page and try to extract the real website URL."""
    try:
        html = await fetch_url_text(url)
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")

        # Look for links that aren't social media / aggregator
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if not href.startswith(("http://", "https://")):
                continue
            if _is_aggregator(href) or _is_skip_domain(href):
                continue
            # Filter out obviously non-website links
            if "mailto:" in href or "tel:" in href:
                continue
            # Good candidate — an external link from the aggregator
            link_text = (a.get_text() or "").lower().strip()
            # Prioritize links with menu/website keywords
            menu_keywords = ["menu", "website", "site", "order", "food", "reserve"]
            if any(kw in link_text for kw in menu_keywords):
                return href

        # Second pass: return any external link that's not social/aggregator
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if not href.startswith(("http://", "https://")):
                continue
            if _is_aggregator(href) or _is_skip_domain(href):
                continue
            if "mailto:" in href or "tel:" in href:
                continue
            return href

    except Exception:
        pass
    return None


async def resolve_website(
    restaurant_name: str,
    location_hint: Optional[str] = None,
    website_override: Optional[str] = None,
) -> Optional[str]:
    """Resolve the official website URL for a restaurant.

    Returns the URL string or None if resolution failed and needs user input.
    """
    # 1. Override provided
    if website_override and website_override.strip():
        url = website_override.strip()
        if not url.startswith(("http://", "https://")):
            url = f"https://{url}"
        # If override is an aggregator, follow through
        if _is_aggregator(url):
            real = await _follow_aggregator(url)
            if real:
                return real
        return url

    search_query = restaurant_name
    if location_hint:
        search_query = f"{restaurant_name} {location_hint}"

    # 2. Google Places API
    places_key = os.getenv("GOOGLE_PLACES_API_KEY")
    if places_key:
        result = await _resolve_via_google_places(search_query, places_key)
        if result:
            # If Google returned an aggregator, follow through
            if _is_aggregator(result):
                real = await _follow_aggregator(result)
                if real:
                    return real
            elif not _is_skip_domain(result):
                return result

    # 3. SerpAPI
    serp_key = os.getenv("SERPAPI_KEY")
    if serp_key:
        result = await _resolve_via_serpapi(search_query, serp_key)
        if result:
            return result

    # 4. No API configured — needs user input
    return None


async def _resolve_via_google_places(query: str, api_key: str) -> Optional[str]:
    """Use Places API (New) Search Text + Place Details to find restaurant website."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            search_url = "https://places.googleapis.com/v1/places:searchText"
            search_resp = await client.post(
                search_url,
                headers={
                    "X-Goog-Api-Key": api_key,
                    "X-Goog-FieldMask": "places.id,places.name",
                },
                json={"textQuery": f"{query} restaurant", "languageCode": "en"},
            )
            if search_resp.status_code >= 400:
                return None

            search_data = search_resp.json()
            places = search_data.get("places", [])
            if not places:
                return None

            details_headers = {
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "websiteUri,movedPlace,movedPlaceId",
            }

            # Try the top few places to improve hit rate for ambiguous names.
            for place in places[:5]:
                place_id = place.get("id")
                if not place_id:
                    place_name = place.get("name")
                    if isinstance(place_name, str) and place_name.startswith("places/"):
                        place_id = place_name.split("/", 1)[1]
                if not place_id:
                    continue

                details_url = f"https://places.googleapis.com/v1/places/{place_id}"
                details_resp = await client.get(details_url, headers=details_headers)
                if details_resp.status_code >= 400:
                    continue

                details_data = details_resp.json()
                website = details_data.get("websiteUri")
                if website:
                    return website

                # Handle moved places by retrying details on the moved place id.
                moved_place = details_data.get("movedPlace")
                moved_place_id = details_data.get("movedPlaceId")
                next_id: Optional[str] = None
                if isinstance(moved_place_id, str) and moved_place_id:
                    next_id = moved_place_id
                elif isinstance(moved_place, str) and moved_place.startswith("places/"):
                    next_id = moved_place.split("/", 1)[1]

                if next_id:
                    moved_details_url = f"https://places.googleapis.com/v1/places/{next_id}"
                    moved_details_resp = await client.get(moved_details_url, headers=details_headers)
                    if moved_details_resp.status_code < 400:
                        moved_details_data = moved_details_resp.json()
                        moved_website = moved_details_data.get("websiteUri")
                        if moved_website:
                            return moved_website

            return None
    except Exception:
        return None


async def _resolve_via_serpapi(query: str, api_key: str) -> Optional[str]:
    """Use SerpAPI to search for the restaurant and extract its website."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://serpapi.com/search",
                params={
                    "q": f"{query} restaurant official site",
                    "api_key": api_key,
                    "num": 5,
                },
            )
            data = resp.json()

            if "knowledge_graph" in data:
                kg = data["knowledge_graph"]
                if "website" in kg:
                    url = kg["website"]
                    if not _is_aggregator(url) and not _is_skip_domain(url):
                        return url

            organic = data.get("organic_results", [])
            for result in organic[:5]:
                link = result.get("link", "")
                if not _is_aggregator(link) and not _is_skip_domain(link):
                    return link
    except Exception:
        pass
    return None
