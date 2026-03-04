import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GoogleAddressComponent = {
    longText?: string;
    shortText?: string;
    types?: string[];
};

type GooglePlaceDetailsResponse = {
    formattedAddress?: string;
    addressComponents?: GoogleAddressComponent[];
};

function getPlacesApiKey() {
    return process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || "";
}

function findComponent(components: GoogleAddressComponent[], type: string) {
    return components.find((component) => component.types?.includes(type));
}

export async function GET(request: NextRequest) {
    const placeId = request.nextUrl.searchParams.get("placeId")?.trim() || "";
    if (!placeId) {
        return NextResponse.json({ detail: "Missing placeId" }, { status: 400 });
    }

    const apiKey = getPlacesApiKey();
    if (!apiKey) {
        return NextResponse.json({ detail: "Address lookup is not configured" }, { status: 503 });
    }

    try {
        const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
            headers: {
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": "formattedAddress,addressComponents",
            },
            cache: "no-store",
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            console.error("Google place details failed", res.status, body);
            return NextResponse.json({ detail: "Failed to fetch place details" }, { status: 502 });
        }

        const data = (await res.json()) as GooglePlaceDetailsResponse;
        const components = data.addressComponents || [];
        const streetNumber = findComponent(components, "street_number")?.longText || "";
        const route = findComponent(components, "route")?.longText || "";
        const premise = findComponent(components, "premise")?.longText || "";
        const subpremise = findComponent(components, "subpremise")?.longText || "";
        const floor = findComponent(components, "floor")?.longText || "";
        const room = findComponent(components, "room")?.longText || "";

        let addressLine1 = [streetNumber, route].filter(Boolean).join(" ").trim();
        if (!addressLine1) {
            addressLine1 = premise || (data.formattedAddress || "").split(",")[0]?.trim() || "";
        }

        const line2Parts = [
            subpremise ? `Unit ${subpremise}` : "",
            floor ? `Floor ${floor}` : "",
            room ? `Room ${room}` : "",
        ].filter(Boolean);

        const locality =
            findComponent(components, "locality")?.longText ||
            findComponent(components, "postal_town")?.longText ||
            findComponent(components, "sublocality_level_1")?.longText ||
            findComponent(components, "administrative_area_level_2")?.longText ||
            "";
        const adminArea = findComponent(components, "administrative_area_level_1");
        const country = findComponent(components, "country")?.longText || "";
        const postalCode = findComponent(components, "postal_code")?.longText || "";
        const postalSuffix = findComponent(components, "postal_code_suffix")?.longText || "";

        return NextResponse.json({
            address_line1: addressLine1 || "",
            address_line2: line2Parts.join(", "),
            city: locality,
            state_province: adminArea?.shortText || adminArea?.longText || "",
            country,
            postal_code: postalCode ? `${postalCode}${postalSuffix ? `-${postalSuffix}` : ""}` : "",
            formatted_address: data.formattedAddress || "",
        });
    } catch (error) {
        console.error("Address details lookup failed", error);
        return NextResponse.json({ detail: "Failed to fetch place details" }, { status: 500 });
    }
}
