import { type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBackendBaseUrl() {
    const base = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    if (!base.startsWith("http://") && !base.startsWith("https://")) {
        return "http://localhost:8000";
    }
    return base.replace(/\/$/, "");
}

function toBackendUrl(request: NextRequest, pathParts: string[]) {
    const base = getBackendBaseUrl();
    const needsTrailingSlash =
        pathParts.length === 1 && ["organizations", "menus", "items", "categories"].includes(pathParts[0] || "");
    const path = pathParts.map(encodeURIComponent).join("/") + (needsTrailingSlash ? "/" : "");
    const search = request.nextUrl.search;
    return `${base}/${path}${search}`;
}

function forwardedHeaders(request: NextRequest) {
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("connection");
    headers.delete("content-length");

    const host = request.headers.get("host");
    if (host) headers.set("x-forwarded-host", host);

    const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
    if (proto) headers.set("x-forwarded-proto", proto);

    headers.set("x-forwarded-prefix", "/api");
    return headers;
}

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params;
    const url = toBackendUrl(request, path || []);
    const headers = forwardedHeaders(request);

    const init: RequestInit = {
        method: request.method,
        headers,
        cache: "no-store"
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = await request.arrayBuffer();
    }

    const response = await fetch(url, init);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
    });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
