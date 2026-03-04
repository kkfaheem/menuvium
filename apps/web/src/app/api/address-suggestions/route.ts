import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GoogleAutocompleteResponse = {
    suggestions?: Array<{
        placePrediction?: {
            placeId?: string;
            text?: {
                text?: string;
            };
            structuredFormat?: {
                mainText?: { text?: string };
                secondaryText?: { text?: string };
            };
        };
    }>;
};

type AddressSuggestion = {
    place_id: string;
    display_name: string;
    main_text?: string;
    secondary_text?: string;
};

function getPlacesApiKey() {
    return process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || "";
}

export async function GET(request: NextRequest) {
    const query = request.nextUrl.searchParams.get("q")?.trim() || "";
    if (query.length < 3) {
        return NextResponse.json({ configured: true, suggestions: [] as AddressSuggestion[] });
    }

    const apiKey = getPlacesApiKey();
    if (!apiKey) {
        return NextResponse.json({ configured: false, suggestions: [] as AddressSuggestion[] });
    }

    try {
        const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask":
                    "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
            },
            body: JSON.stringify({
                input: query,
                languageCode: "en",
            }),
            cache: "no-store",
        });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            console.error("Google autocomplete failed", res.status, body);
            return NextResponse.json({ configured: true, suggestions: [] as AddressSuggestion[] });
        }

        const data = (await res.json()) as GoogleAutocompleteResponse;
        const suggestions = (data.suggestions || [])
            .map((entry) => {
                const prediction = entry.placePrediction;
                if (!prediction?.placeId) return null;

                const mainText =
                    prediction.structuredFormat?.mainText?.text || prediction.text?.text || "";
                const secondaryText = prediction.structuredFormat?.secondaryText?.text || "";
                const displayName = secondaryText ? `${mainText}, ${secondaryText}` : mainText;

                if (!displayName) return null;
                return {
                    place_id: prediction.placeId,
                    display_name: displayName,
                    main_text: mainText || undefined,
                    secondary_text: secondaryText || undefined,
                };
            })
            .filter(Boolean) as AddressSuggestion[];

        return NextResponse.json({ configured: true, suggestions });
    } catch (error) {
        console.error("Address suggestion lookup failed", error);
        return NextResponse.json({ configured: true, suggestions: [] as AddressSuggestion[] });
    }
}
