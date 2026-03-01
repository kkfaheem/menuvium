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
    """Use Google Places Text Search → Place Details to find restaurant website."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            search_url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
            search_resp = await client.get(
                search_url,
                params={"query": f"{query} restaurant", "key": api_key},
            )
            search_data = search_resp.json()
            results = search_data.get("results", [])
            if not results:
                return None

            place_id = results[0].get("place_id")
            if not place_id:
                return None

            details_url = "https://maps.googleapis.com/maps/api/place/details/json"
            details_resp = await client.get(
                details_url,
                params={
                    "place_id": place_id,
                    "fields": "website,name",
                    "key": api_key,
                },
            )
            details_data = details_resp.json()
            website = details_data.get("result", {}).get("website")
            return website or None
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
