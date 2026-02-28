"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { ArrowLeft, ChevronDown, ExternalLink, Image, Loader2, Palette, QrCode, Search, X, Sparkles } from "lucide-react";
import { MENU_THEMES, MenuThemeId } from "@/lib/menuThemes";
import { getApiBase } from "@/lib/apiBase";
import { fetchOrgPermissions } from "@/lib/orgPermissions";
import { getAuthToken } from "@/lib/authToken";
import { ImageCropperModal } from "@/components/menus/ImageCropperModal";
import { useToast } from "@/components/ui/ToastProvider";
import { Badge } from "@/components/ui/Badge";

interface Item {
    id: string;
    name: string;
    description?: string;
    price: number;
    photo_url?: string | null;
    photos?: { url: string }[];
    is_sold_out?: boolean;
}

interface Category {
    id: string;
    name: string;
    items: Item[];
}

interface TitleDesignConfig {
    enabled: boolean;
    logoPosition: "left" | "center" | "right";
    logoScale: number;
    spacing: {
        top: number;
        bottom: number;
        horizontal: number;
    };
    layout: "logo-only" | "logo-with-text";
    textPosition: "beside" | "below" | "none";
    dominantColors: string[];
    recommendation?: string;
    generatedAt?: string;
    logoUrl?: string;
}

interface Menu {
    id: string;
    name: string;
    theme?: string;
    show_item_images?: boolean;
    banner_url?: string | null;
    logo_url?: string | null;
    title_design_config?: TitleDesignConfig | null;
    org_id: string;
}

type SampleItem = Item & { category: string };

export default function MenuThemesPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuthenticator((context) => [context.user]);
    const { toast } = useToast();
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
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [logoUploading, setLogoUploading] = useState(false);
    const [activeTab, setActiveTab] = useState<"theme" | "branding" | "title">("theme");
    const [bannerCropFile, setBannerCropFile] = useState<File | null>(null);
    const bannerPreviewBlobUrlRef = useRef<string | null>(null);
    const [titleConfig, setTitleConfig] = useState<TitleDesignConfig | null>(null);
    const [generatingTitle, setGeneratingTitle] = useState(false);
    const [titleHint, setTitleHint] = useState("");

    const menuId = params.id as string;

    useEffect(() => {
        if (!menuId) return;
        fetchMenuData(menuId);
    }, [menuId, user]);

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

    const sampleItems = useMemo<SampleItem[]>(() => {
        const items = categories.flatMap((cat) => cat.items.map((item) => ({ ...item, category: cat.name })));
        return items.slice(0, 3);
    }, [categories]);

    useEffect(() => {
        if (bannerPreviewBlobUrlRef.current) {
            URL.revokeObjectURL(bannerPreviewBlobUrlRef.current);
            bannerPreviewBlobUrlRef.current = null;
        }
        setBannerPreview(menu?.banner_url ?? null);
        setLogoPreview(menu?.logo_url ?? null);
        setTitleConfig(menu?.title_design_config ?? null);
    }, [menu?.banner_url, menu?.logo_url, menu?.title_design_config]);

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

    const activeTheme = useMemo(() => {
        const activeId = (menu?.theme || "noir") as MenuThemeId;
        return MENU_THEMES.find((theme) => theme.id === activeId) || MENU_THEMES[0];
    }, [menu?.theme]);

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

    const uploadBanner = async (file: File): Promise<Menu | null> => {
        if (!menu) return null;
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
            return updated;
        } catch (e) {
            console.error(e);
            toast({ variant: "error", title: "Error uploading banner" });
            return null;
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
            toast({ variant: "error", title: "Error removing banner" });
        } finally {
            setBannerUploading(false);
        }
    };

    const uploadLogo = async (file: File) => {
        if (!menu) return;
        setLogoUploading(true);
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
                    content_type: file.type || "image/png"
                })
            });
            if (!uploadRes.ok) {
                throw new Error("Failed to get upload url");
            }
            const uploadData = await uploadRes.json();
            const putRes = await fetch(uploadData.upload_url, {
                method: "PUT",
                headers: { "Content-Type": file.type || "image/png" },
                body: file
            });
            if (!putRes.ok) {
                throw new Error("Failed to upload logo");
            }
            const patchRes = await fetch(`${apiBase}/menus/${menu.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ logo_url: uploadData.public_url })
            });
            if (!patchRes.ok) {
                throw new Error("Failed to save logo");
            }
            const updated = await patchRes.json();
            setMenu(updated);
        } catch (e) {
            console.error(e);
            toast({ variant: "error", title: "Error uploading logo" });
        } finally {
            setLogoUploading(false);
        }
    };

    const removeLogo = async () => {
        if (!menu) return;
        setLogoUploading(true);
        try {
            const token = await getAuthToken();
            const patchRes = await fetch(`${apiBase}/menus/${menu.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ logo_url: null })
            });
            if (!patchRes.ok) {
                throw new Error("Failed to remove logo");
            }
            const updated = await patchRes.json();
            setMenu(updated);
        } catch (e) {
            console.error(e);
            toast({ variant: "error", title: "Error removing logo" });
        } finally {
            setLogoUploading(false);
        }
    };

    const generateTitleDesign = async () => {
        if (!menu || !menu.logo_url) return;
        setGeneratingTitle(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/menus/generate-title-design/${menu.id}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ hint: titleHint })
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.detail || "Failed to generate title design");
            }
            const data = await res.json();
            setTitleConfig(data.config);
            setMenu({ ...menu, title_design_config: data.config });
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Error generating title design",
                description: e instanceof Error ? e.message : undefined,
            });
        } finally {
            setGeneratingTitle(false);
        }
    };

    const toggleTitleDesign = async (enabled: boolean) => {
        if (!menu || !titleConfig) return;
        try {
            const token = await getAuthToken();
            const updatedConfig = { ...titleConfig, enabled };
            const res = await fetch(`${apiBase}/menus/${menu.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ title_design_config: updatedConfig })
            });
            if (!res.ok) throw new Error("Failed to update title design");
            const updated = await res.json();
            setMenu(updated);
            setTitleConfig(updatedConfig);
        } catch (e) {
            console.error(e);
            toast({ variant: "error", title: "Error updating title design" });
        }
    };

    const toggleItemImages = async (showImages: boolean) => {
        if (!menu) return;
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/menus/${menu.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ show_item_images: showImages })
            });
            if (!res.ok) throw new Error("Failed to update item images setting");
            const updated = await res.json();
            setMenu(updated);
        } catch (e) {
            console.error(e);
            toast({ variant: "error", title: "Error updating item images setting" });
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
                return;
            }
            const err = await res.json();
            toast({
                variant: "error",
                title: "Failed to update theme",
                description: err.detail || "Unknown error",
            });
        } catch (e) {
            console.error(e);
            toast({ variant: "error", title: "Error updating theme" });
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

    if (permissionError) {
        return <div className="text-sm text-[var(--cms-muted)]">{permissionError}</div>;
    }

    const previewCategories = categories.slice(0, 4).map((category) => category.name);
    const previewItems = sampleItems.slice(0, 3);

    return (
        <div className="w-full max-w-[1400px] mr-auto space-y-6">
            <header className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--cms-border)] text-center text-xs font-semibold tracking-[0.2em] text-[var(--cms-muted)]">
                    Menuvium Studio
                </div>
                <div className="px-5 py-5 sm:px-6 sm:py-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-2">
                            <Link
                                href={`/dashboard/menus/${menuId}`}
                                className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground"
                            >
                                <ArrowLeft className="w-4 h-4" /> Back to Menu
                            </Link>
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--cms-muted)]">Menuvium Studio</p>
                            <h1 className="font-heading text-4xl font-bold tracking-tight">Design Studio</h1>
                            <p className="text-muted">Pick a theme, tune your brand, and preview instantly across every menu scan.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Link
                                href={`/r/${menu?.id}`}
                                target="_blank"
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-4 text-sm font-semibold text-[var(--cms-text)] transition-colors hover:bg-[var(--cms-pill)]"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Live preview
                            </Link>
                            <Link
                                href={`/dashboard/menus/${menuId}/publish`}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--cms-accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--cms-accent-strong)]"
                            >
                                <QrCode className="w-4 h-4" />
                                Publish
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
                <div className="space-y-6">
                    <section className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-2">
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setActiveTab("theme")}
                                className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
                                    activeTab === "theme"
                                        ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                        : "text-[var(--cms-muted)] hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)]"
                                }`}
                            >
                                <Palette className="w-4 h-4" />
                                Themes
                            </button>
                            <button
                                onClick={() => setActiveTab("branding")}
                                className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
                                    activeTab === "branding"
                                        ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                        : "text-[var(--cms-muted)] hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)]"
                                }`}
                            >
                                <Image className="w-4 h-4" />
                                Branding
                            </button>
                            <button
                                onClick={() => setActiveTab("title")}
                                className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
                                    activeTab === "title"
                                        ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                        : "text-[var(--cms-muted)] hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)]"
                                }`}
                            >
                                <Sparkles className="w-4 h-4" />
                                Title design
                            </button>
                        </div>
                    </section>

                    {activeTab === "theme" && (
                        <section className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-5 sm:p-6 space-y-5">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--cms-muted)]">Theme Library</p>
                                    <h2 className="font-heading text-5xl max-[640px]:text-4xl font-bold tracking-tight mt-1">Choose a look</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cms-muted)]" />
                                        <input
                                            value={search}
                                            onChange={(event) => setSearch(event.target.value)}
                                            placeholder="Search..."
                                            className="h-11 min-w-[220px] w-full rounded-full border border-[var(--cms-border)] bg-[var(--cms-bg)] pl-9 pr-4 text-sm text-[var(--cms-text)] placeholder:text-[var(--cms-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)]/20"
                                        />
                                    </div>
                                    {hasFilters && (
                                        <button
                                            onClick={resetFilters}
                                            className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--cms-border)] px-4 text-sm font-semibold text-[var(--cms-muted)] transition-colors hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)]"
                                        >
                                            <X className="h-4 w-4" /> Clear
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {tagsList.map((tag) => (
                                    <button
                                        key={tag}
                                        onClick={() => toggleTag(tag)}
                                        className={`h-8 px-4 rounded-full text-xs font-semibold border whitespace-nowrap ${
                                            selectedTags.includes(tag)
                                                ? "bg-[var(--cms-accent)] text-white border-[var(--cms-accent)]"
                                                : "border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]"
                                        }`}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>

                            {orderedThemes.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-[var(--cms-border)] bg-[var(--cms-panel-strong)] p-8 text-center text-[var(--cms-muted)]">
                                    No themes match those filters. Try clearing or adjusting your search.
                                </div>
                            ) : (
                                <div className="grid gap-3 md:grid-cols-2">
                                    {orderedThemes.map((theme) => {
                                        const isActive = (menu?.theme || "noir") === theme.id;
                                        return (
                                            <article
                                                key={theme.id}
                                                className={`rounded-2xl border p-4 transition-colors ${
                                                    isActive
                                                        ? "border-white/40 bg-gradient-to-r from-[var(--cms-accent)]/20 to-[var(--cms-accent)]/5"
                                                        : "border-[var(--cms-border)] bg-[var(--cms-bg)] hover:bg-[var(--cms-panel-strong)]"
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <h3 className="truncate text-xl font-bold tracking-tight">{theme.name}</h3>
                                                        <p className="mt-1 text-sm text-[var(--cms-muted)]">{theme.description}</p>
                                                        <p className="mt-1 text-xs text-[var(--cms-muted)] capitalize">
                                                            {theme.category} · {theme.layout}
                                                        </p>
                                                    </div>
                                                    {isActive && (
                                                        <Badge variant="success" className="shrink-0">
                                                            Active
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="mt-4 flex items-center gap-2">
                                                    <button
                                                        onClick={() => applyTheme(theme.id)}
                                                        disabled={savingThemeId === theme.id || isActive}
                                                        className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
                                                            savingThemeId === theme.id || isActive
                                                                ? "bg-[var(--cms-panel-strong)] text-[var(--cms-muted)]"
                                                                : "bg-[var(--cms-accent)] text-white hover:bg-[var(--cms-accent-strong)]"
                                                        }`}
                                                    >
                                                        {savingThemeId === theme.id && <Loader2 className="w-4 h-4 animate-spin" />}
                                                        {isActive ? "Current theme" : savingThemeId === theme.id ? "Applying..." : "Apply"}
                                                    </button>
                                                    <Link
                                                        href={`/r/${menuId}?theme=${theme.id}`}
                                                        target="_blank"
                                                        className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--cms-border)] px-4 text-sm font-semibold text-[var(--cms-muted)] transition-colors hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)]"
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
                                                        Preview
                                                    </Link>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    )}

                    {activeTab === "branding" && (
                        <>
                            <section className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-5 sm:p-6">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--cms-muted)]">Branding</p>
                                        <h2 className="font-heading text-2xl font-bold tracking-tight mt-1">Restaurant logo</h2>
                                        <p className="text-sm text-[var(--cms-muted)] mt-1">Used in title areas and public menu headers.</p>
                                    </div>
                                    {logoPreview && (
                                        <button
                                            onClick={removeLogo}
                                            disabled={logoUploading}
                                            className="h-9 px-4 rounded-full border border-[var(--cms-border)] text-sm font-semibold text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]"
                                        >
                                            Remove logo
                                        </button>
                                    )}
                                </div>
                                <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr] items-center">
                                    <div className="rounded-2xl border border-dashed border-[var(--cms-border)] bg-[var(--cms-bg)] p-4 flex items-center justify-center min-h-[220px]">
                                        {logoPreview ? (
                                            <img src={logoPreview} alt="Restaurant logo" className="w-36 h-36 object-contain rounded-xl" />
                                        ) : (
                                            <div className="text-center text-sm text-[var(--cms-muted)]">No logo uploaded yet.</div>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--cms-text)]">Upload your logo</label>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            disabled={logoUploading}
                                            onChange={(event) => {
                                                const file = event.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onload = (e) => setLogoPreview(e.target?.result as string);
                                                    reader.readAsDataURL(file);
                                                    uploadLogo(file);
                                                }
                                                event.currentTarget.value = "";
                                            }}
                                            className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-[var(--cms-text)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--cms-bg)] hover:file:opacity-90"
                                        />
                                        <p className="text-xs text-[var(--cms-muted)]">Recommended: square image, 512x512 or larger.</p>
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-5 sm:p-6">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--cms-muted)]">Cover</p>
                                        <h2 className="font-heading text-2xl font-bold tracking-tight mt-1">Menu banner</h2>
                                        <p className="text-sm text-[var(--cms-muted)] mt-1">Shown at the top of your guest menu.</p>
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
                                <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_0.75fr] items-center">
                                    <div className="rounded-2xl border border-dashed border-[var(--cms-border)] bg-[var(--cms-bg)] p-4">
                                        {bannerPreview ? (
                                            <img src={bannerPreview} alt="Menu banner" className="w-full h-48 object-cover rounded-xl" />
                                        ) : (
                                            <div className="h-48 rounded-xl flex items-center justify-center text-sm text-[var(--cms-muted)]">No banner uploaded yet.</div>
                                        )}
                                    </div>
                                    <div className="space-y-3">
                                        <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--cms-text)]">Upload a cover photo</label>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            disabled={bannerUploading}
                                            onChange={(event) => {
                                                const file = event.target.files?.[0];
                                                if (file) setBannerCropFile(file);
                                                event.currentTarget.value = "";
                                            }}
                                            className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-[var(--cms-text)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--cms-bg)] hover:file:opacity-90"
                                        />
                                        <p className="text-xs text-[var(--cms-muted)]">Recommended: 1600x900 or larger (16:9).</p>
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-5 sm:p-6">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--cms-muted)]">Display</p>
                                        <h2 className="font-heading text-2xl font-bold tracking-tight mt-1">Item images</h2>
                                        <p className="text-sm text-[var(--cms-muted)] mt-1">Toggle item photos on the public menu page.</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={menu?.show_item_images !== false}
                                            onChange={(e) => toggleItemImages(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-[var(--cms-border)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500" />
                                        <span className="ms-2 text-xs font-medium text-[var(--cms-muted)] group-hover:text-[var(--cms-text)] transition-colors whitespace-nowrap">
                                            {menu?.show_item_images !== false ? "Visible" : "Hidden"}
                                        </span>
                                    </label>
                                </div>
                            </section>
                        </>
                    )}

                    {activeTab === "title" && (
                        <section className="relative overflow-hidden rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-6 sm:p-8">
                            <div className="absolute inset-0 opacity-[0.04] bg-gradient-to-br from-amber-500 via-orange-500 to-cyan-500 pointer-events-none" />
                            <div className="relative">
                                <div className="flex items-start justify-between gap-4 mb-6">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-cyan-500/20 flex items-center justify-center shrink-0">
                                            <Sparkles className="w-5 h-5 text-amber-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--cms-muted)]">Title design</p>
                                            <h2 className="font-heading text-2xl font-bold tracking-tight mt-1">AI title area</h2>
                                            <p className="text-sm text-[var(--cms-muted)] mt-1">Generate and save a logo-led title treatment for your menu.</p>
                                        </div>
                                    </div>
                                    {titleConfig && (
                                        <label className="relative inline-flex items-center cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={titleConfig.enabled}
                                                onChange={(e) => toggleTitleDesign(e.target.checked)}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-[var(--cms-border)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-amber-500 peer-checked:to-orange-500" />
                                            <span className="ms-2 text-xs font-medium text-[var(--cms-muted)] group-hover:text-[var(--cms-text)] transition-colors whitespace-nowrap">
                                                {titleConfig.enabled ? "Active" : "Off"}
                                            </span>
                                        </label>
                                    )}
                                </div>

                                {!logoPreview ? (
                                    <div className="rounded-2xl border-2 border-dashed border-[var(--cms-border)] bg-[var(--cms-bg)] p-10 text-center">
                                        <Image className="w-9 h-9 text-[var(--cms-muted)] mx-auto" />
                                        <p className="text-sm font-semibold mt-3">Upload a logo first</p>
                                        <p className="text-xs text-[var(--cms-muted)] mt-1">AI title generation requires a logo on your menu.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-5">
                                        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                                            <div className="flex-1 max-w-md">
                                                <label className="mb-1.5 block text-xs font-semibold tracking-wide uppercase text-[var(--cms-muted)]">
                                                    Style hint <span className="normal-case font-normal">(optional)</span>
                                                </label>
                                                <input
                                                    value={titleHint}
                                                    onChange={(e) => setTitleHint(e.target.value)}
                                                    placeholder="e.g. minimalist, elegant, playful, bold"
                                                    className="w-full h-12 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-bg)] px-4 text-sm text-[var(--cms-text)] placeholder:text-[var(--cms-muted)]/60 focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
                                                />
                                            </div>
                                            <button
                                                onClick={generateTitleDesign}
                                                disabled={generatingTitle || !menu?.logo_url}
                                                className="h-12 px-6 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 text-white disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-amber-500 via-orange-500 to-cyan-500"
                                            >
                                                {generatingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                                {generatingTitle ? "Generating..." : "Generate with AI"}
                                            </button>
                                        </div>

                                        {titleConfig ? (
                                            <div className="space-y-4">
                                                <div className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-bg)] p-5">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="text-xs font-semibold tracking-wide uppercase text-[var(--cms-muted)]">Preview</span>
                                                        <Badge variant="accent">AI Generated</Badge>
                                                    </div>
                                                    <div
                                                        className="rounded-xl bg-white p-6 flex items-center"
                                                        style={{
                                                            justifyContent: "center",
                                                            paddingTop: `${Math.min(titleConfig.spacing.top, 16)}px`,
                                                            paddingBottom: `${Math.min(titleConfig.spacing.bottom, 16)}px`
                                                        }}
                                                    >
                                                        <img
                                                            src={logoPreview}
                                                            alt="Logo preview"
                                                            style={{
                                                                transform: `scale(${Math.min(titleConfig.logoScale, 1.5)})`,
                                                                maxHeight: "64px",
                                                                objectFit: "contain"
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                {titleConfig.recommendation ? (
                                                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">AI Insight</p>
                                                        <p className="mt-1 text-sm text-[var(--cms-muted)]">{titleConfig.recommendation}</p>
                                                    </div>
                                                ) : null}
                                                <details className="group rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-bg)] overflow-hidden">
                                                    <summary className="px-4 py-3 cursor-pointer text-xs font-semibold text-[var(--cms-muted)] flex items-center justify-between hover:text-[var(--cms-text)] transition-colors">
                                                        Advanced settings
                                                        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                                                    </summary>
                                                    <div className="px-4 pb-4 pt-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                        <div className="rounded-xl bg-[var(--cms-panel)] p-3 text-center">
                                                            <p className="text-[10px] uppercase tracking-wide text-[var(--cms-muted)] mb-1">Position</p>
                                                            <p className="text-sm font-semibold capitalize">{titleConfig.logoPosition}</p>
                                                        </div>
                                                        <div className="rounded-xl bg-[var(--cms-panel)] p-3 text-center">
                                                            <p className="text-[10px] uppercase tracking-wide text-[var(--cms-muted)] mb-1">Scale</p>
                                                            <p className="text-sm font-semibold">{titleConfig.logoScale}x</p>
                                                        </div>
                                                        <div className="rounded-xl bg-[var(--cms-panel)] p-3 text-center">
                                                            <p className="text-[10px] uppercase tracking-wide text-[var(--cms-muted)] mb-1">Layout</p>
                                                            <p className="text-sm font-semibold capitalize">{titleConfig.layout.replace("-", " ")}</p>
                                                        </div>
                                                        {titleConfig.dominantColors && titleConfig.dominantColors.length > 0 ? (
                                                            <div className="rounded-xl bg-[var(--cms-panel)] p-3 text-center">
                                                                <p className="text-[10px] uppercase tracking-wide text-[var(--cms-muted)] mb-1">Colors</p>
                                                                <div className="flex gap-1 justify-center">
                                                                    {titleConfig.dominantColors.slice(0, 4).map((color, idx) => (
                                                                        <div
                                                                            key={idx}
                                                                            className="w-4 h-4 rounded-full border border-white/10 shadow-sm"
                                                                            style={{ backgroundColor: color }}
                                                                            title={color}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </details>
                                            </div>
                                        ) : (
                                            <div className="rounded-2xl border-2 border-dashed border-[var(--cms-border)] bg-[var(--cms-bg)] p-8 text-center">
                                                <p className="text-sm font-semibold">Ready to generate</p>
                                                <p className="text-xs text-[var(--cms-muted)] mt-1">Click the button above to generate a title design.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    <ImageCropperModal
                        open={Boolean(bannerCropFile)}
                        file={bannerCropFile}
                        aspect={16 / 9}
                        title="Crop banner"
                        description="Drag to reposition and adjust zoom. Double-click to reset."
                        confirmLabel="Crop & upload"
                        onCancel={() => setBannerCropFile(null)}
                        onConfirm={async (blob) => {
                            const original = bannerCropFile;
                            if (!original) return;

                            const previousPreview = bannerPreview;
                            const localUrl = URL.createObjectURL(blob);
                            bannerPreviewBlobUrlRef.current = localUrl;
                            setBannerPreview(localUrl);

                            const filenameBase = original.name.replace(/\.[^/.]+$/, "");
                            const croppedFile = new File([blob], `${filenameBase}_banner.jpg`, { type: blob.type });

                            const updated = await uploadBanner(croppedFile);
                            if (!updated) {
                                if (bannerPreviewBlobUrlRef.current) {
                                    URL.revokeObjectURL(bannerPreviewBlobUrlRef.current);
                                    bannerPreviewBlobUrlRef.current = null;
                                }
                                setBannerPreview(previousPreview);
                            }

                            setBannerCropFile(null);
                        }}
                    />
                </div>

                <aside className="xl:sticky xl:top-6 xl:self-start space-y-4">
                    <section
                        className="overflow-hidden rounded-3xl border border-[var(--cms-border)]"
                        style={{
                            background: `linear-gradient(140deg, ${activeTheme.preview.bg} 0%, ${activeTheme.preview.card} 100%)`,
                            color: activeTheme.preview.text,
                        }}
                    >
                        <div
                            className="px-5 py-4 border-b"
                            style={{
                                borderColor: activeTheme.preview.border,
                                background: `linear-gradient(120deg, ${activeTheme.preview.accent}30 0%, transparent 70%)`
                            }}
                        >
                            <span
                                className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold"
                                style={{ borderColor: `${activeTheme.preview.border}`, backgroundColor: `${activeTheme.preview.bg}` }}
                            >
                                Theme · {activeTheme.name}
                            </span>
                            <h3 className="mt-4 font-heading text-5xl max-[640px]:text-4xl font-bold tracking-tight">{menu?.name || "Menu Preview"}</h3>
                            <p className="mt-1 text-sm opacity-80">Scan, order, and view in AR</p>
                        </div>

                        <div className="px-5 py-4">
                            <div className="flex flex-wrap gap-2">
                                {previewCategories.length > 0 ? (
                                    previewCategories.map((category) => (
                                        <span
                                            key={category}
                                            className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold"
                                            style={{ borderColor: activeTheme.preview.border, backgroundColor: activeTheme.preview.card }}
                                        >
                                            {category}
                                        </span>
                                    ))
                                ) : (
                                    <span
                                        className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold"
                                        style={{ borderColor: activeTheme.preview.border, backgroundColor: activeTheme.preview.card }}
                                    >
                                        Add categories
                                    </span>
                                )}
                            </div>

                            <div className="mt-4 space-y-3">
                                {previewItems.length > 0 ? (
                                    previewItems.map((item) => {
                                        const imageUrl = item.photo_url || item.photos?.[0]?.url || null;
                                        return (
                                            <article
                                                key={item.id}
                                                className="rounded-2xl border px-3 py-2.5"
                                                style={{ borderColor: activeTheme.preview.border, backgroundColor: activeTheme.preview.card }}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border" style={{ borderColor: activeTheme.preview.border }}>
                                                        {imageUrl ? (
                                                            <img src={imageUrl} alt={item.name} className="h-full w-full object-cover" />
                                                        ) : (
                                                            <div className="h-full w-full flex items-center justify-center text-sm font-semibold" style={{ backgroundColor: `${activeTheme.preview.accent}35` }}>
                                                                {item.name[0]}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-lg font-semibold">{item.name}</p>
                                                        <p className="text-base opacity-70">${item.price.toFixed(2)}</p>
                                                    </div>
                                                    <span
                                                        className="inline-flex rounded-full px-3 py-1 text-sm font-semibold"
                                                        style={{ backgroundColor: `${activeTheme.preview.accent}33`, color: activeTheme.preview.text }}
                                                    >
                                                        View
                                                    </span>
                                                </div>
                                            </article>
                                        );
                                    })
                                ) : (
                                    <div
                                        className="rounded-2xl border p-5 text-sm opacity-80"
                                        style={{ borderColor: activeTheme.preview.border, backgroundColor: activeTheme.preview.card }}
                                    >
                                        Add menu items to preview the guest experience here.
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
