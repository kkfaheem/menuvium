"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchAuthSession } from "aws-amplify/auth";
import { ArrowLeft, Check, ExternalLink, Loader2 } from "lucide-react";
import { MENU_THEMES, MenuThemeId } from "@/lib/menuThemes";

interface Item {
    id: string;
    name: string;
    description?: string;
    price: number;
}

interface Category {
    id: string;
    name: string;
    items: Item[];
}

interface Menu {
    id: string;
    name: string;
    theme?: string;
}

export default function MenuThemesPage() {
    const params = useParams();
    const { user } = useAuthenticator((context) => [context.user]);
    const [menu, setMenu] = useState<Menu | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingThemeId, setSavingThemeId] = useState<MenuThemeId | null>(null);

    const menuId = params.id as string;

    useEffect(() => {
        if (!menuId) return;
        fetchMenuData(menuId);
    }, [menuId, user]);

    const getAuthToken = async () => {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();
        if (!token) {
            throw new Error("Not authenticated");
        }
        return token;
    };

    const fetchMenuData = async (id: string) => {
        try {
            const token = await getAuthToken();
            const [menuRes, catRes] = await Promise.all([
                fetch(`${process.env.NEXT_PUBLIC_API_URL}/menus/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${process.env.NEXT_PUBLIC_API_URL}/categories/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);
            if (menuRes.ok) setMenu(await menuRes.json());
            if (catRes.ok) setCategories(await catRes.json());
        } catch (e) {
            console.error("Failed to load menu theme data", e);
        } finally {
            setLoading(false);
        }
    };

    const sampleItems = useMemo(() => {
        const items = categories.flatMap((cat) => cat.items.map((item) => ({ ...item, category: cat.name })));
        return items.slice(0, 3);
    }, [categories]);

    const applyTheme = async (themeId: MenuThemeId) => {
        if (!menu) return;
        setSavingThemeId(themeId);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/menus/${menu.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ theme: themeId })
            });
            if (res.ok) {
                const data = await res.json();
                setMenu({ ...menu, theme: data.theme ?? themeId });
            } else {
                const err = await res.json();
                alert(`Failed to update theme: ${err.detail || "Unknown error"}`);
            }
        } catch (e) {
            console.error(e);
            alert("Error updating theme");
        } finally {
            setSavingThemeId(null);
        }
    };

    if (loading) {
        return (
            <div className="text-[var(--cms-muted)] flex items-center gap-2">
                <Loader2 className="animate-spin" /> Loading themes...
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <header className="space-y-3">
                <Link href={`/dashboard/menus/${menuId}`} className="text-sm text-[var(--cms-muted)] hover:text-[var(--cms-text)] inline-flex items-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> Back to Menu
                </Link>
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">Choose a Theme</h1>
                    <p className="text-sm text-[var(--cms-muted)]">
                        Preview with your current menu data, then apply the one that fits the brand.
                    </p>
                </div>
            </header>

            <div className="grid gap-6 md:grid-cols-2">
                {MENU_THEMES.map((theme) => {
                    const isActive = (menu?.theme || "noir") === theme.id;
                    return (
                        <div
                            key={theme.id}
                            className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-5 flex flex-col gap-4"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-bold">{theme.name}</h2>
                                    <p className="text-sm text-[var(--cms-muted)]">{theme.description}</p>
                                </div>
                                {isActive && (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-[var(--cms-pill)] text-[var(--cms-text)]">
                                        <Check className="w-3 h-3" /> Active
                                    </span>
                                )}
                            </div>

                            <div
                                className="rounded-2xl p-4 border"
                                style={{ backgroundColor: theme.preview.bg, borderColor: theme.preview.border, color: theme.preview.text }}
                            >
                                <div className="text-sm uppercase tracking-widest opacity-70">Preview</div>
                                <div className="mt-3 text-xl font-bold">{menu?.name || "Menu Title"}</div>
                                <div className="mt-4 space-y-3">
                                    {sampleItems.length > 0 ? (
                                        sampleItems.map((item) => (
                                            <div
                                                key={item.id}
                                                className="flex items-center justify-between rounded-xl px-3 py-2"
                                                style={{ backgroundColor: theme.preview.card, border: `1px solid ${theme.preview.border}` }}
                                            >
                                                <div>
                                                    <div className="text-sm font-semibold">{item.name}</div>
                                                    <div className="text-xs opacity-60">{item.category}</div>
                                                </div>
                                                <div className="text-sm font-semibold" style={{ color: theme.preview.accent }}>
                                                    ${item.price.toFixed(2)}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-sm opacity-60">No items yet.</div>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={() => applyTheme(theme.id)}
                                    disabled={savingThemeId === theme.id}
                                    className={`h-9 px-4 rounded-full text-sm font-semibold inline-flex items-center gap-2 ${savingThemeId === theme.id ? "bg-[var(--cms-panel-strong)] text-[var(--cms-muted)]" : "bg-[var(--cms-text)] text-[var(--cms-bg)] hover:opacity-90"}`}
                                >
                                    {savingThemeId === theme.id && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {savingThemeId === theme.id ? "Applying..." : "Apply Theme"}
                                </button>
                                <Link
                                    href={`/r/${menuId}?theme=${theme.id}`}
                                    target="_blank"
                                    className="h-9 px-4 rounded-full text-sm font-semibold inline-flex items-center gap-2 border border-[var(--cms-border)] text-[var(--cms-text)] hover:bg-[var(--cms-pill)]"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    Preview
                                </Link>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
