"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { ArrowLeft, Check, ChevronDown, ExternalLink, Image, Loader2, Palette, Search, SlidersHorizontal, X, Sparkles } from "lucide-react";
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
}

interface Category {
    id: string;
    name: string;
    items: Item[];
}

interface TitleDesignConfig {
    enabled: boolean;
    logoPosition: 'left' | 'center' | 'right';
    logoScale: number;
    spacing: {
        top: number;
        bottom: number;
        horizontal: number;
    };
    layout: 'logo-only' | 'logo-with-text';
    textPosition: 'beside' | 'below' | 'none';
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
    const [activeTab, setActiveTab] = useState<'branding' | 'theme'>('branding');
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

    const sampleItems = useMemo(() => {
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
            } else {
                const err = await res.json();
                toast({
                    variant: "error",
                    title: "Failed to update theme",
                    description: err.detail || "Unknown error",
                });
            }
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

    return (
        <div className="w-full max-w-6xl mr-auto space-y-8">
            <header className="space-y-4">
                <Link
                    href={`/dashboard/menus/${menuId}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Menu
                </Link>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-2">
                        <Badge variant="outline">Design Studio</Badge>
                        <h1 className="font-heading text-3xl font-bold tracking-tight">Design Studio</h1>
                        <p className="text-muted">Customize your menu's branding and visual theme.</p>
                    </div>
                    <Link
                        href={`/r/${menu?.id}`}
                        target="_blank"
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-panelStrong px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-pill"
                    >
                        <ExternalLink className="w-4 h-4" />
                        View Public Page
                    </Link>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="flex gap-1 p-1 rounded-2xl bg-[var(--cms-panel)] border border-[var(--cms-border)] w-fit">
                <button
                    onClick={() => setActiveTab('branding')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors inline-flex items-center gap-2 ${activeTab === 'branding' ? 'bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]' : 'text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]'}`}
                >
                    <Image className="w-4 h-4" />
                    Branding
                </button>
                <button
                    onClick={() => setActiveTab('theme')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors inline-flex items-center gap-2 ${activeTab === 'theme' ? 'bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]' : 'text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]'}`}
                >
                    <Palette className="w-4 h-4" />
                    Theme
                </button>
            </div>
            {/* Branding Tab */}
            {activeTab === 'branding' && (
                <>
                    {/* Logo Section */}
                    <section className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-4 sm:p-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="font-heading text-lg font-bold tracking-tight">Restaurant Logo</h2>
                                <p className="text-sm text-[var(--cms-muted)]">Your logo will appear on public menus.</p>
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

                        <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr] items-center">
                            <div className="rounded-2xl border border-dashed border-[var(--cms-border)] bg-[var(--cms-bg)] p-4 flex items-center justify-center">
                                {logoPreview ? (
                                    <img src={logoPreview} alt="Restaurant logo" className="w-32 h-32 object-contain rounded-xl" />
                                ) : (
                                    <div className="w-32 h-32 rounded-xl flex items-center justify-center text-sm text-[var(--cms-muted)] text-center">
                                        No logo uploaded yet.
                                    </div>
                                )}
                            </div>
                            <div className="space-y-3">
                                <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--cms-text)]">
                                    Upload your logo
                                </label>
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
                                <p className="text-xs text-[var(--cms-muted)]">Recommended: Square image, 512×512 or larger.</p>
                            </div>
                        </div>
                    </section>

                    {/* Title Area Design Section */}
                    <section className="relative overflow-hidden rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-6 sm:p-8">
                        {/* Gradient background accent */}
                        <div className="absolute inset-0 opacity-[0.03] bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 pointer-events-none" />

                        <div className="relative">
                            {/* Header with animated sparkle */}
                            <div className="flex items-start justify-between gap-4 mb-6">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center shrink-0">
                                        <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
                                    </div>
                                    <div>
                                        <h2 className="font-heading text-lg font-bold tracking-tight">AI Title Design</h2>
                                        <p className="text-sm text-[var(--cms-muted)] mt-0.5">
                                            Generate a stunning title area from your logo
                                        </p>
                                    </div>
                                </div>

                                {/* Toggle switch for public menu */}
                                {titleConfig && (
                                    <label className="relative inline-flex items-center cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={titleConfig.enabled}
                                            onChange={(e) => toggleTitleDesign(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-[var(--cms-border)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-purple-500 peer-checked:to-pink-500" />
                                        <span className="ms-2 text-xs font-medium text-[var(--cms-muted)] group-hover:text-[var(--cms-text)] transition-colors whitespace-nowrap">
                                            {titleConfig.enabled ? 'Active' : 'Off'}
                                        </span>
                                    </label>
                                )}
                            </div>

                            {!logoPreview ? (
                                /* No logo uploaded state */
                                <div className="rounded-2xl border-2 border-dashed border-[var(--cms-border)] bg-gradient-to-b from-[var(--cms-bg)] to-transparent p-10 text-center transition-all hover:border-purple-500/30">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--cms-panel)] flex items-center justify-center">
                                        <Image className="w-8 h-8 text-[var(--cms-muted)]" />
                                    </div>
                                    <p className="text-sm font-semibold text-[var(--cms-text)]">Upload a logo first</p>
                                    <p className="text-xs text-[var(--cms-muted)] mt-1 max-w-xs mx-auto">
                                        Our AI will analyze your logo and generate a beautiful, theme-adaptive title design
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    {/* Generation controls */}
                                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                                        <div className="flex-1 max-w-md">
                                            <label className="mb-1.5 block text-xs font-semibold tracking-wide uppercase text-[var(--cms-muted)]">
                                                Style hint <span className="normal-case font-normal">(optional)</span>
                                            </label>
                                            <input
                                                value={titleHint}
                                                onChange={(e) => setTitleHint(e.target.value)}
                                                placeholder="e.g. minimalist, elegant, playful, bold"
                                                className="w-full h-12 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-bg)] px-4 text-sm text-[var(--cms-text)] placeholder:text-[var(--cms-muted)]/60 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
                                            />
                                        </div>

                                        {/* Animated Generate Button */}
                                        <button
                                            onClick={generateTitleDesign}
                                            disabled={generatingTitle || !menu?.logo_url}
                                            className="relative group h-12 px-6 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98]"
                                            style={{
                                                background: generatingTitle
                                                    ? 'linear-gradient(135deg, #8B5CF6, #EC4899)'
                                                    : 'linear-gradient(135deg, #8B5CF6, #EC4899, #F97316)',
                                                backgroundSize: '200% 200%',
                                                animation: generatingTitle ? 'none' : 'gradientShift 3s ease infinite'
                                            }}
                                        >
                                            {/* Shimmer effect */}
                                            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                                            <span className="relative text-white flex items-center gap-2">
                                                {generatingTitle ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Generating...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles className="w-4 h-4" />
                                                        Generate with AI
                                                    </>
                                                )}
                                            </span>
                                        </button>
                                    </div>

                                    {/* Preview area */}
                                    {titleConfig ? (
                                        <div className="space-y-4 animate-fadeIn">
                                            {/* Preview card with gradient border */}
                                            <div className="relative rounded-2xl p-[1px] bg-gradient-to-r from-purple-500/30 via-pink-500/30 to-orange-500/30">
                                                <div className="rounded-2xl bg-[var(--cms-bg)] p-5">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="text-xs font-semibold tracking-wide uppercase text-[var(--cms-muted)]">Preview</span>
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 font-medium">
                                                            AI Generated
                                                        </span>
                                                    </div>
                                                    <div
                                                        className="rounded-xl bg-white p-6 flex items-center transition-all duration-500"
                                                        style={{
                                                            justifyContent: 'center',
                                                            paddingTop: `${Math.min(titleConfig.spacing.top, 16)}px`,
                                                            paddingBottom: `${Math.min(titleConfig.spacing.bottom, 16)}px`
                                                        }}
                                                    >
                                                        <img
                                                            src={logoPreview}
                                                            alt="Logo preview"
                                                            className="transition-transform duration-500"
                                                            style={{
                                                                transform: `scale(${Math.min(titleConfig.logoScale, 1.5)})`,
                                                                maxHeight: '64px',
                                                                objectFit: 'contain'
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* AI Recommendation */}
                                            {titleConfig.recommendation && (
                                                <div className="rounded-2xl bg-gradient-to-r from-purple-500/5 to-pink-500/5 border border-purple-500/10 p-4 animate-fadeIn">
                                                    <div className="flex items-start gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                                                            <Sparkles className="w-4 h-4 text-purple-400" />
                                                        </div>
                                                        <div className="flex-1">
                                                            <h4 className="text-xs font-semibold mb-1 text-purple-300">AI Insight</h4>
                                                            <p className="text-xs text-[var(--cms-muted)] leading-relaxed">{titleConfig.recommendation}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Design Details - Collapsible */}
                                            <details className="group rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)] overflow-hidden">
                                                <summary className="px-4 py-3 cursor-pointer text-xs font-semibold text-[var(--cms-muted)] flex items-center justify-between hover:text-[var(--cms-text)] transition-colors">
                                                    <span>Design Details</span>
                                                    <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                                                </summary>
                                                <div className="px-4 pb-4 pt-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    <div className="rounded-xl bg-[var(--cms-bg)] p-3 text-center">
                                                        <p className="text-[10px] uppercase tracking-wide text-[var(--cms-muted)] mb-1">Position</p>
                                                        <p className="text-sm font-semibold capitalize">{titleConfig.logoPosition}</p>
                                                    </div>
                                                    <div className="rounded-xl bg-[var(--cms-bg)] p-3 text-center">
                                                        <p className="text-[10px] uppercase tracking-wide text-[var(--cms-muted)] mb-1">Scale</p>
                                                        <p className="text-sm font-semibold">{titleConfig.logoScale}x</p>
                                                    </div>
                                                    <div className="rounded-xl bg-[var(--cms-bg)] p-3 text-center">
                                                        <p className="text-[10px] uppercase tracking-wide text-[var(--cms-muted)] mb-1">Layout</p>
                                                        <p className="text-sm font-semibold capitalize">{titleConfig.layout.replace('-', ' ')}</p>
                                                    </div>
                                                    {titleConfig.dominantColors && titleConfig.dominantColors.length > 0 && (
                                                        <div className="rounded-xl bg-[var(--cms-bg)] p-3 text-center">
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
                                                    )}
                                                </div>
                                            </details>
                                        </div>
                                    ) : (
                                        /* Empty state after logo is uploaded but no generation yet */
                                        <div className="rounded-2xl border-2 border-dashed border-[var(--cms-border)] bg-gradient-to-b from-[var(--cms-bg)] to-transparent p-8 text-center">
                                            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 flex items-center justify-center">
                                                <Sparkles className="w-6 h-6 text-purple-400/60" />
                                            </div>
                                            <p className="text-sm font-semibold text-[var(--cms-text)]">Ready to generate</p>
                                            <p className="text-xs text-[var(--cms-muted)] mt-1 max-w-xs mx-auto">
                                                Click the button above to let AI create a stunning title design
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* CSS Keyframes for gradient animation */}
                        <style jsx>{`
                            @keyframes gradientShift {
                                0%, 100% { background-position: 0% 50%; }
                                50% { background-position: 100% 50%; }
                            }
                            @keyframes fadeIn {
                                from { opacity: 0; transform: translateY(8px); }
                                to { opacity: 1; transform: translateY(0); }
                            }
                            .animate-fadeIn {
                                animation: fadeIn 0.4s ease-out forwards;
                            }
                        `}</style>
                    </section>

                    {/* Banner Section */}
                    <section className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-4 sm:p-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="font-heading text-lg font-bold tracking-tight">Menu Cover Banner</h2>
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
                                        if (file) setBannerCropFile(file);
                                        event.currentTarget.value = "";
                                    }}
                                    className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-[var(--cms-text)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--cms-bg)] hover:file:opacity-90"
                                />
                                <p className="text-xs text-[var(--cms-muted)]">Recommended: 1600×900 or larger (16:9 aspect ratio).</p>
                            </div>
                        </div>
                    </section>

                    {/* Item Images Toggle Section */}
                    <section className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-4 sm:p-6">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h2 className="font-heading text-lg font-bold tracking-tight">Item Images</h2>
                                <p className="text-sm text-[var(--cms-muted)]">
                                    Show item photos on the public menu page.
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={menu?.show_item_images !== false}
                                    onChange={(e) => toggleItemImages(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-[var(--cms-border)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500" />
                                <span className="ms-2 text-xs font-medium text-[var(--cms-muted)] group-hover:text-[var(--cms-text)] transition-colors whitespace-nowrap">
                                    {menu?.show_item_images !== false ? 'Visible' : 'Hidden'}
                                </span>
                            </label>
                        </div>
                    </section>
                </>
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

            {/* Theme Tab */}
            {activeTab === 'theme' && (
                <>
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
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-[var(--cms-muted)]">{orderedThemes.length} themes</span>
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
                                    className={`h-8 px-4 rounded-full text-xs font-semibold border whitespace-nowrap ${selectedTags.includes(tag) ? "bg-[var(--cms-accent)] text-white border-[var(--cms-accent)]" : "border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]"}`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </section>

                    {orderedThemes.length === 0 ? (
                        <div className="rounded-3xl border border-dashed border-[var(--cms-border)] bg-[var(--cms-panel)] p-10 text-center text-[var(--cms-muted)]">
                            No themes match those filters. Try clearing or adjusting your search.
                        </div>
                    ) : (
                        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 auto-rows-fr">
                            {orderedThemes.map((theme) => {
                                const isActive = (menu?.theme || "noir") === theme.id;
                                return (
                                    <div
                                        key={theme.id}
                                        className="group rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-5 flex flex-col gap-4 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5 h-full"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <h2 className="font-heading text-lg font-bold tracking-tight">{theme.name}</h2>
                                                <p className="text-sm text-[var(--cms-muted)] line-clamp-2 min-h-[2.5rem]">{theme.description}</p>
                                                <div className="mt-3 flex gap-2 text-xs text-[var(--cms-muted)] overflow-hidden h-7">
                                                    {[theme.category, theme.layout, ...theme.cuisines.slice(0, 2)].map((tag, tagIndex) => (
                                                        <span key={`${theme.id}-${tagIndex}-${tag}`} className="px-2 py-1 rounded-full border border-[var(--cms-border)] whitespace-nowrap flex-shrink-0">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                    {theme.cuisines.length > 2 && (
                                                        <span className="px-2 py-1 rounded-full border border-[var(--cms-border)] whitespace-nowrap flex-shrink-0">
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

                                        <link
                                            rel="stylesheet"
                                            href={`https://fonts.googleapis.com/css2?family=${theme.fonts.heading.replace(/\s+/g, '+')}:wght@${theme.fonts.headingWeights}&family=${theme.fonts.body.replace(/\s+/g, '+')}:wght@${theme.fonts.bodyWeights}&display=swap`}
                                        />
                                        <div
                                            className="theme-preview rounded-2xl p-4 border relative flex-1"
                                            style={{
                                                backgroundColor: theme.preview.bg,
                                                borderColor: theme.preview.border,
                                                color: theme.preview.text,
                                                backgroundImage: `radial-gradient(120% 120% at 0% 0%, ${theme.preview.accent}22 0%, transparent 55%), radial-gradient(120% 120% at 100% 0%, ${theme.preview.accent}33 0%, transparent 45%)`
                                            }}
                                        >
                                            <div className="text-sm uppercase tracking-widest opacity-70" style={{ fontFamily: `"${theme.fonts.body}", sans-serif` }}>Preview</div>
                                            <div className="mt-3 text-xl font-bold" style={{ fontFamily: `"${theme.fonts.heading}", serif` }}>{menu?.name || "Menu Title"}</div>
                                            <div className="mt-4 space-y-3">
                                                {sampleItems.length > 0 ? (
                                                    sampleItems.map((item) => (
                                                        <div
                                                            key={item.id}
                                                            className="flex items-center justify-between rounded-xl px-3 py-2 transition-transform duration-300 group-hover:translate-x-1"
                                                            style={{ backgroundColor: theme.preview.card, border: `1px solid ${theme.preview.border}` }}
                                                        >
                                                            <div>
                                                                <div className="text-sm font-semibold" style={{ fontFamily: `"${theme.fonts.heading}", sans-serif` }}>{item.name}</div>
                                                                <div className="text-xs opacity-60" style={{ fontFamily: `"${theme.fonts.body}", sans-serif` }}>{item.category}</div>
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
                                                className={`h-9 px-4 rounded-full text-sm font-semibold inline-flex items-center gap-2 transition-colors ${savingThemeId === theme.id ? "bg-[var(--cms-panel-strong)] text-[var(--cms-muted)]" : "bg-[var(--cms-accent)] text-white hover:bg-[var(--cms-accent-strong)]"}`}
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
                </>
            )}
        </div>
    );
}
