"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import {
    ArrowLeft,
    Check,
    Copy,
    ExternalLink,
    Loader2,
    Palette,
    QrCode,
    UtensilsCrossed,
} from "lucide-react";
import { getApiBase } from "@/lib/apiBase";
import { fetchOrgPermissions } from "@/lib/orgPermissions";
import { getAuthToken } from "@/lib/authToken";
import { Badge } from "@/components/ui/Badge";

interface ItemPhoto {
    url: string;
}

interface Item {
    id: string;
    name: string;
    price: number;
    is_sold_out: boolean;
    photo_url?: string | null;
    photos?: ItemPhoto[];
}

interface Category {
    id: string;
    name: string;
    items: Item[];
}

interface Menu {
    id: string;
    name: string;
    is_active: boolean;
    theme?: string;
    org_id: string;
}

export default function MenuPublishPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuthenticator((context) => [context.user]);
    const [menu, setMenu] = useState<Menu | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const [baseOrigin, setBaseOrigin] = useState("https://menuvium.com");
    const [copied, setCopied] = useState(false);
    const apiBase = getApiBase();

    const menuId = params.id as string;

    useEffect(() => {
        if (typeof window === "undefined") return;
        setBaseOrigin(window.location.origin);
    }, []);

    useEffect(() => {
        if (!menuId) return;
        fetchMenuData(menuId);
    }, [menuId, user]);

    const fetchMenuData = async (id: string) => {
        setLoading(true);
        try {
            const token = await getAuthToken();
            const [menuRes, catRes] = await Promise.all([
                fetch(`${apiBase}/menus/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${apiBase}/categories/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);

            if (!menuRes.ok) {
                router.replace("/dashboard/menus");
                return;
            }

            const menuData = (await menuRes.json()) as Menu;
            const perms = await fetchOrgPermissions({ apiBase, token, orgId: menuData.org_id });
            if (!perms.can_view) {
                setPermissionError("You do not have permission to view publish details for this menu.");
                router.replace(`/dashboard/menus/${id}`);
                return;
            }

            setMenu(menuData);
            if (catRes.ok) {
                setCategories(await catRes.json());
            }
        } catch (e) {
            console.error("Failed to load publish data", e);
        } finally {
            setLoading(false);
        }
    };

    const publicUrl = `${baseOrigin}/r/${menu?.id || menuId}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(publicUrl)}`;

    const sampleItems = useMemo(() => {
        return categories.flatMap((category) =>
            category.items.map((item) => ({
                ...item,
                categoryName: category.name,
                imageUrl: item.photo_url || item.photos?.[0]?.url || null,
            }))
        );
    }, [categories]);

    const previewItems = sampleItems.slice(0, 3);
    const totalItems = sampleItems.length;
    const soldOutCount = sampleItems.filter((item) => item.is_sold_out).length;

    const quickUpdates = [
        {
            text: menu?.is_active ? "Menu is live and visible to guests" : "Menu is currently paused",
            status: menu?.is_active ? "Live" : "Paused",
            success: menu?.is_active ?? false,
        },
        {
            text: `${categories.length} categories and ${totalItems} items synced to your QR link`,
            status: "Live",
            success: true,
        },
        {
            text:
                soldOutCount > 0
                    ? `${soldOutCount} item${soldOutCount === 1 ? "" : "s"} marked sold out`
                    : "No sold out items",
            status: "Live",
            success: true,
        },
        {
            text: `Theme: ${menu?.theme || "noir"}`,
            status: "Live",
            success: true,
        },
    ];

    const copyPublicUrl = async () => {
        try {
            await navigator.clipboard.writeText(publicUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            setCopied(false);
        }
    };

    if (loading) {
        return (
            <div className="text-[var(--cms-muted)] flex items-center gap-2">
                <Loader2 className="animate-spin" /> Loading publish data...
            </div>
        );
    }

    if (permissionError) {
        return <div className="text-sm text-[var(--cms-muted)]">{permissionError}</div>;
    }

    if (!menu) {
        return <div className="text-sm text-[var(--cms-muted)]">Menu not found.</div>;
    }

    return (
        <div className="w-full max-w-7xl mr-auto space-y-8">
            <header className="space-y-4">
                <Link
                    href={`/dashboard/menus/${menuId}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Menu
                </Link>

                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-end">
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href={`/dashboard/menus/${menuId}/themes`}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-panelStrong px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-pill"
                        >
                            <Palette className="w-4 h-4" />
                            Design Studio
                        </Link>
                        <button
                            onClick={copyPublicUrl}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--cms-accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--cms-accent-strong)]"
                        >
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {copied ? "Copied" : "Copy link"}
                        </button>
                    </div>
                </div>
            </header>

            <div className="grid gap-6 xl:grid-cols-[minmax(380px,0.95fr)_minmax(0,1.45fr)]">
                <section className="rounded-3xl border border-border bg-panel p-5 sm:p-6">
                    <div className="space-y-5">
                        <div className="space-y-1">
                            <p className="text-xs font-semibold tracking-[0.28em] uppercase text-muted">QR Code</p>
                            <h2 className="font-heading text-xl font-bold tracking-tight">Menu QR</h2>
                        </div>

                        <div className="rounded-2xl border border-border bg-panelStrong p-5 flex items-center justify-center">
                            <img
                                src={qrImageUrl}
                                alt={`QR code for ${menu.name}`}
                                className="h-64 w-64 max-w-full rounded-xl bg-white p-2"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-semibold tracking-[0.22em] uppercase text-muted">Public URL</label>
                            <div className="flex items-center gap-2 rounded-xl border border-border bg-panelStrong px-3 py-2.5">
                                <span className="truncate text-sm text-foreground">{publicUrl}</span>
                                <button
                                    onClick={copyPublicUrl}
                                    className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-pill"
                                    aria-label="Copy public URL"
                                >
                                    <Copy className="h-4 w-4 text-muted" />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Link
                                href={publicUrl}
                                target="_blank"
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border bg-panelStrong px-4 text-xs font-semibold text-foreground transition-colors hover:bg-pill"
                            >
                                <ExternalLink className="w-3 h-3" /> Open guest page
                            </Link>
                            <Link
                                href={qrImageUrl}
                                target="_blank"
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border bg-panelStrong px-4 text-xs font-semibold text-foreground transition-colors hover:bg-pill"
                            >
                                <QrCode className="w-3 h-3" /> Open QR image
                            </Link>
                        </div>
                    </div>
                </section>

                <div className="space-y-6">
                    <section className="rounded-3xl border border-border bg-panel p-5 sm:p-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <p className="text-xs font-semibold tracking-[0.28em] uppercase text-muted">Guest Preview</p>
                                <h2 className="mt-1 font-heading text-2xl font-bold tracking-tight">{menu.name}</h2>
                                <p className="mt-1 text-sm text-muted">
                                    {categories.length > 0
                                        ? categories.slice(0, 3).map((category) => category.name).join(" · ")
                                        : "No categories yet"}
                                </p>
                            </div>
                            <Link
                                href={publicUrl}
                                target="_blank"
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border bg-panelStrong px-4 text-sm font-semibold text-foreground transition-colors hover:bg-pill"
                            >
                                Open <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                        </div>

                        {previewItems.length === 0 ? (
                            <div className="mt-5 rounded-2xl border border-dashed border-border bg-panelStrong p-8 text-center">
                                <UtensilsCrossed className="mx-auto h-7 w-7 text-muted" />
                                <p className="mt-3 text-sm text-muted">No items found yet. Add items to preview them here.</p>
                            </div>
                        ) : (
                            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {previewItems.map((item) => (
                                    <article key={item.id} className="overflow-hidden rounded-2xl border border-border bg-panelStrong">
                                        <div className="aspect-[4/2.2] bg-pill">
                                            {item.imageUrl ? (
                                                <img
                                                    src={item.imageUrl}
                                                    alt={item.name}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center text-xs text-muted">
                                                    No image
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-3">
                                            <p className="truncate text-sm font-semibold">{item.name}</p>
                                            <div className="mt-1 flex items-center justify-between text-xs text-muted">
                                                <span className="truncate">{item.categoryName}</span>
                                                <span>${item.price.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="rounded-3xl border border-border bg-panel p-5 sm:p-6">
                        <p className="text-xs font-semibold tracking-[0.28em] uppercase text-muted">Recent Updates</p>
                        <div className="mt-4 space-y-3">
                            {quickUpdates.map((update) => (
                                <div
                                    key={update.text}
                                    className="flex items-start justify-between gap-3 rounded-xl border border-border bg-panelStrong px-3 py-2.5"
                                >
                                    <p className="text-sm text-foreground">{update.text}</p>
                                    <Badge variant={update.success ? "success" : "outline"}>{update.status}</Badge>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
