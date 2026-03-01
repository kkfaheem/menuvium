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

import httpx

from importer.utils import USER_AGENT


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
        return url

    search_query = restaurant_name
    if location_hint:
        search_query = f"{restaurant_name} {location_hint}"

    # 2. Google Places API
    places_key = os.getenv("GOOGLE_PLACES_API_KEY")
    if places_key:
        result = await _resolve_via_google_places(search_query, places_key)
        if result:
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
            # Text Search to find place
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

            # Place Details to get website
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

            # Check knowledge graph first
            if "knowledge_graph" in data:
                kg = data["knowledge_graph"]
                if "website" in kg:
                    return kg["website"]

            # Check organic results
            organic = data.get("organic_results", [])
            for result in organic[:3]:
                link = result.get("link", "")
                # Filter out social media and review sites
                skip_domains = [
                    "yelp.com", "tripadvisor.com", "facebook.com",
                    "instagram.com", "twitter.com", "doordash.com",
                    "ubereats.com", "grubhub.com", "opentable.com",
                ]
                from urllib.parse import urlparse
                domain = urlparse(link).netloc.lower()
                if not any(skip in domain for skip in skip_domains):
                    return link
    except Exception:
        pass
    return None
