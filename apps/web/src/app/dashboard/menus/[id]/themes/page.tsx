"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchAuthSession } from "aws-amplify/auth";
import { ArrowLeft, Check, ExternalLink, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { MENU_THEMES, MenuThemeId } from "@/lib/menuThemes";
import { getApiBase } from "@/lib/apiBase";
import { fetchOrgPermissions } from "@/lib/orgPermissions";

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
    banner_url?: string | null;
    org_id: string;
}

export default function MenuThemesPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuthenticator((context) => [context.user]);
    const [menu, setMenu] = useState<Menu | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingThemeId, setSavingThemeId] = useState<MenuThemeId | null>(null);
    const apiBase = getApiBase();
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [bannerPreview, setBannerPreview] = useState<string | null>(null);
    const [bannerUploading, setBannerUploading] = useState(false);

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
                fetch(`${apiBase}/menus/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${apiBase}/categories/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);
            if (menuRes.ok) {
                const menuData = (await menuRes.json()) as Menu;
                const perms = await fetchOrgPermissions({ apiBase, token, orgId: menuData.org_id });
                if (!perms.can_manage_menus) {
                    setPermissionError("You don’t have permission to change themes for this menu.");
                    router.replace(`/dashboard/menus/${id}`);
                    return;
                }
                setMenu(menuData);
            }
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

    useEffect(() => {
        setBannerPreview(menu?.banner_url ?? null);
    }, [menu?.banner_url]);

    const tagsList = useMemo(() => {
        const tags = new Set<string>();
        MENU_THEMES.forEach((theme) => {
            tags.add(theme.category);
            tags.add(theme.layout);
            theme.cuisines.forEach((cuisine) => tags.add(cuisine));
        });
        return Array.from(tags).sort();
    }, []);

    const filteredThemes = useMemo(() => {
        const query = search.trim().toLowerCase();
        return MENU_THEMES.filter((theme) => {
            if (selectedTags.length > 0) {
                const themeTags = [theme.category, theme.layout, ...theme.cuisines];
                if (!selectedTags.every((tag) => themeTags.includes(tag))) return false;
            }
            if (!query) return true;
            const haystack = `${theme.name} ${theme.description} ${theme.tone} ${theme.cuisines.join(" ")}`.toLowerCase();
            return haystack.includes(query);
        });
    }, [search, selectedTags]);

    const orderedThemes = useMemo(() => {
        const activeId = (menu?.theme || "noir") as MenuThemeId;
        return filteredThemes.slice().sort((a, b) => {
            if (a.id === activeId) return -1;
            if (b.id === activeId) return 1;
            return a.name.localeCompare(b.name);
        });
    }, [filteredThemes, menu?.theme]);

    const resetFilters = () => {
        setSearch("");
        setSelectedTags([]);
    };

    const hasFilters = search.trim() || selectedTags.length > 0;

    const toggleTag = (tag: string) => {
        setSelectedTags((prev) =>
            prev.includes(tag) ? prev.filter((value) => value !== tag) : [...prev, tag]
        );
    };

    const uploadBanner = async (file: File) => {
        if (!menu) return;
        setBannerUploading(true);
        try {
            const token = await getAuthToken();
            const uploadRes = await fetch(`${apiBase}/items/upload-url`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    filename: file.name,
                    content_type: file.type || "image/jpeg"
                })
            });
            if (!uploadRes.ok) {
                throw new Error("Failed to get upload url");
            }
            const uploadData = await uploadRes.json();
            const putRes = await fetch(uploadData.upload_url, {
                method: "PUT",
                headers: { "Content-Type": file.type || "image/jpeg" },
                body: file
            });
            if (!putRes.ok) {
                throw new Error("Failed to upload banner");
            }
            const patchRes = await fetch(`${apiBase}/menus/${menu.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ banner_url: uploadData.public_url })
            });
            if (!patchRes.ok) {
                throw new Error("Failed to save banner");
            }
            const updated = await patchRes.json();
            setMenu(updated);
        } catch (e) {
            console.error(e);
            alert("Error uploading banner");
        } finally {
            setBannerUploading(false);
        }
    };

    const removeBanner = async () => {
        if (!menu) return;
        setBannerUploading(true);
        try {
            const token = await getAuthToken();
            const patchRes = await fetch(`${apiBase}/menus/${menu.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ banner_url: null })
            });
            if (!patchRes.ok) {
                throw new Error("Failed to remove banner");
            }
            const updated = await patchRes.json();
            setMenu(updated);
        } catch (e) {
            console.error(e);
            alert("Error removing banner");
        } finally {
            setBannerUploading(false);
        }
    };

    const applyTheme = async (themeId: MenuThemeId) => {
        if (!menu) return;
        setSavingThemeId(themeId);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/menus/${menu.id}`, {
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
        <div className="w-full max-w-6xl mr-auto space-y-8">
            <header className="space-y-4">
                <Link href={`/dashboard/menus/${menuId}`} className="text-sm text-[var(--cms-muted)] hover:text-[var(--cms-text)] inline-flex items-center gap-1">
                    <ArrowLeft className="w-4 h-4" /> Back to Menu
                </Link>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold tracking-tight">Choose a Theme</h1>
                        <p className="text-sm text-[var(--cms-muted)]">
                            Preview with your menu data, filter by vibe, and apply instantly.
                        </p>
                    </div>
                    <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--cms-muted)]">
                        <SlidersHorizontal className="w-4 h-4" />
                        {orderedThemes.length} themes
                    </div>
                </div>
            </header>

            <section className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-4 sm:p-6 space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cms-muted)]" />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search themes, cuisines, or vibes"
                            className="h-10 w-full rounded-full border border-[var(--cms-border)] bg-[var(--cms-bg)] pl-9 pr-4 text-sm text-[var(--cms-text)] placeholder:text-[var(--cms-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--cms-text)]/10"
                        />
                    </div>
                    {hasFilters && (
                        <button
                            onClick={resetFilters}
                            className="h-10 px-4 rounded-full border border-[var(--cms-border)] text-sm font-semibold text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)] inline-flex items-center gap-2"
                        >
                            <X className="w-4 h-4" />
                            Clear
                        </button>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cms-muted)]">Tags</div>
                    {selectedTags.length > 0 && (
                        <span className="text-xs text-[var(--cms-muted)]">
                            Filtering: <span className="font-semibold text-[var(--cms-text)]">{selectedTags.join(", ")}</span>
                        </span>
                    )}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {tagsList.map((tag) => (
                        <button
                            key={tag}
                            onClick={() => toggleTag(tag)}
                            className={`h-8 px-4 rounded-full text-xs font-semibold border whitespace-nowrap ${selectedTags.includes(tag) ? "bg-[var(--cms-text)] text-[var(--cms-bg)] border-[var(--cms-text)]" : "border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]"}`}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            </section>

            <section className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-bold">Menu cover banner</h2>
                        <p className="text-sm text-[var(--cms-muted)]">Shown at the top of the public menu.</p>
                    </div>
                    {bannerPreview && (
                        <button
                            onClick={removeBanner}
                            disabled={bannerUploading}
                            className="h-9 px-4 rounded-full border border-[var(--cms-border)] text-sm font-semibold text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]"
                        >
                            Remove banner
                        </button>
                    )}
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr] items-center">
                    <div className="rounded-2xl border border-dashed border-[var(--cms-border)] bg-[var(--cms-bg)] p-4">
                        {bannerPreview ? (
                            <img src={bannerPreview} alt="Menu banner" className="w-full h-44 object-cover rounded-xl" />
                        ) : (
                            <div className="h-44 rounded-xl flex items-center justify-center text-sm text-[var(--cms-muted)]">
                                No banner uploaded yet.
                            </div>
                        )}
                    </div>
                    <div className="space-y-3">
                        <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--cms-text)]">
                            Upload a cover photo
                        </label>
                        <input
                            type="file"
                            accept="image/*"
                            disabled={bannerUploading}
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) uploadBanner(file);
                                event.currentTarget.value = "";
                            }}
                            className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-[var(--cms-text)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--cms-bg)] hover:file:opacity-90"
                        />
                        <p className="text-xs text-[var(--cms-muted)]">Recommended: 1600×900 or larger.</p>
                    </div>
                </div>
            </section>

            {orderedThemes.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[var(--cms-border)] bg-[var(--cms-panel)] p-10 text-center text-[var(--cms-muted)]">
                    No themes match those filters. Try clearing or adjusting your search.
                </div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {orderedThemes.map((theme) => {
                    const isActive = (menu?.theme || "noir") === theme.id;
                    return (
                        <div
                            key={theme.id}
                            className="group rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-5 flex flex-col gap-4 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-bold">{theme.name}</h2>
                                    <p className="text-sm text-[var(--cms-muted)]">{theme.description}</p>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--cms-muted)]">
                                    {[theme.category, theme.layout, ...theme.cuisines.slice(0, 2)].map((tag) => (
                                        <span key={`${theme.id}-${tag}`} className="px-2 py-1 rounded-full border border-[var(--cms-border)]">
                                            {tag}
                                        </span>
                                    ))}
                                    {theme.cuisines.length > 2 && (
                                        <span className="px-2 py-1 rounded-full border border-[var(--cms-border)]">
                                            +{theme.cuisines.length - 2} more
                                        </span>
                                    )}
                                </div>
                                </div>
                                {isActive && (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-[var(--cms-pill)] text-[var(--cms-text)]">
                                        <Check className="w-3 h-3" /> Active
                                    </span>
                                )}
                            </div>

                            <div
                                className="theme-preview rounded-2xl p-4 border relative"
                                style={{
                                    backgroundColor: theme.preview.bg,
                                    borderColor: theme.preview.border,
                                    color: theme.preview.text,
                                    backgroundImage: `radial-gradient(120% 120% at 0% 0%, ${theme.preview.accent}22 0%, transparent 55%), radial-gradient(120% 120% at 100% 0%, ${theme.preview.accent}33 0%, transparent 45%)`
                                }}
                            >
                                <div className="text-sm uppercase tracking-widest opacity-70">Preview</div>
                                <div className="mt-3 text-xl font-bold">{menu?.name || "Menu Title"}</div>
                                <div className="mt-4 space-y-3">
                                    {sampleItems.length > 0 ? (
                                        sampleItems.map((item) => (
                                            <div
                                                key={item.id}
                                                className="flex items-center justify-between rounded-xl px-3 py-2 transition-transform duration-300 group-hover:translate-x-1"
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
                                <div
                                    className="absolute inset-x-6 bottom-6 h-1 rounded-full"
                                    style={{ backgroundColor: theme.preview.accent, opacity: 0.4 }}
                                ></div>
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
            )}
            <style jsx>{`
                .theme-preview::after {
                    content: "";
                    position: absolute;
                    inset: -40%;
                    background: radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.12), transparent 60%);
                    opacity: 0.3;
                    pointer-events: none;
                }
            `}</style>
        </div>
    );
}
