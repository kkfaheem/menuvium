"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Search, X, AlertCircle, SlidersHorizontal } from "lucide-react";
import { MENU_THEME_BY_ID, MenuThemeId } from "@/lib/menuThemes";
import { getApiBase } from "@/lib/apiBase";
import { DIET_TAGS, HIGHLIGHT_TAGS, SPICE_TAGS, TAG_LABELS_DEFAULTS } from "@/lib/menuTagPresets";
import type { Menu, Category, Item, DietaryTag, Allergen, ItemPhoto } from "@/types";
import { ThemeLayout, THEME_LAYOUT_CONFIGS, type ThemeLayoutConfig } from "@/components/public-menu/ThemeLayout";

export default function PublicMenuPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const menuId = params.slug as string; // Route param is still [slug] but contains UUID now

    const [menu, setMenu] = useState<Menu | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [soldOutDisplay, setSoldOutDisplay] = useState<"dim" | "hide">("dim");
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [selectedTagKeys, setSelectedTagKeys] = useState<string[]>([]);
    const [tagLabels, setTagLabels] = useState(TAG_LABELS_DEFAULTS);
    const [tagGroups, setTagGroups] = useState<Record<string, "diet" | "spice" | "highlights">>({});

    // Modal State
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);

    useEffect(() => {
        if (menuId) fetchMenu();
    }, [menuId]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const stored = (localStorage.getItem("menuvium_sold_out_display") as "dim" | "hide") || "dim";
        setSoldOutDisplay(stored);
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const storedLabels = localStorage.getItem("menuvium_tag_labels");
        if (storedLabels) {
            try {
                const parsed = JSON.parse(storedLabels) as Partial<typeof TAG_LABELS_DEFAULTS>;
                setTagLabels({ ...TAG_LABELS_DEFAULTS, ...parsed });
            } catch {
                setTagLabels(TAG_LABELS_DEFAULTS);
            }
        }
        const storedGroups = localStorage.getItem("menuvium_tag_groups");
        if (storedGroups) {
            try {
                const parsed = JSON.parse(storedGroups) as Record<string, "diet" | "spice" | "highlights">;
                setTagGroups(parsed);
            } catch {
                setTagGroups({});
            }
        }
    }, []);

    const visibleItems = (items: Item[]) =>
        items.filter((item) => !(soldOutDisplay === "hide" && item.is_sold_out));

    const isLightHex = (hex: string) => {
        const clean = hex.replace("#", "").trim();
        if (clean.length !== 6) return false;
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        return luminance > 0.72;
    };

    const normalize = (value: string) => value.trim().toLowerCase();

    const filterOptions = useMemo(() => {
        if (!menu) {
            return {
                diet: [] as DietaryTag[],
                spice: [] as DietaryTag[],
                highlights: [] as DietaryTag[],
                allergens: [] as Allergen[],
            };
        }

        const dietDefaults = new Set(DIET_TAGS.map(normalize));
        const spiceDefaults = new Set(SPICE_TAGS.map(normalize));
        const highlightDefaults = new Set(HIGHLIGHT_TAGS.map(normalize));

        const dietaryById = new Map<string, DietaryTag>();
        const allergenById = new Map<string, Allergen>();

        for (const category of menu.categories) {
            for (const item of category.items) {
                if (soldOutDisplay === "hide" && item.is_sold_out) continue;
                for (const tag of item.dietary_tags || []) {
                    const key = tag.id || tag.name;
                    if (!key) continue;
                    if (!dietaryById.has(key)) dietaryById.set(key, tag);
                }
                for (const tag of item.allergens || []) {
                    const key = tag.id || tag.name;
                    if (!key) continue;
                    if (!allergenById.has(key)) allergenById.set(key, tag);
                }
            }
        }

        const groups: Record<"diet" | "spice" | "highlights", DietaryTag[]> = {
            diet: [],
            spice: [],
            highlights: [],
        };

        Array.from(dietaryById.values()).forEach((tag) => {
            const storedGroup = tag.id ? tagGroups[tag.id] : undefined;
            const nameKey = normalize(tag.name);
            const inferred =
                dietDefaults.has(nameKey) ? "diet" : spiceDefaults.has(nameKey) ? "spice" : highlightDefaults.has(nameKey) ? "highlights" : "highlights";
            const group = storedGroup ?? inferred;
            groups[group].push(tag);
        });

        (Object.keys(groups) as Array<keyof typeof groups>).forEach((k) => {
            groups[k] = groups[k].sort((a, b) => a.name.localeCompare(b.name));
        });

        const allergens = Array.from(allergenById.values()).sort((a, b) => a.name.localeCompare(b.name));
        return { ...groups, allergens };
    }, [menu, soldOutDisplay, tagGroups]);

    const itemMatchesSelectedTags = (item: Item) => {
        if (selectedTagKeys.length === 0) return true;
        const dietaryIds = new Set(
            (item.dietary_tags || []).map((t) => `d:${t.id || t.name}`)
        );
        const allergenIds = new Set(
            (item.allergens || []).map((t) => `a:${t.id || t.name}`)
        );
        return selectedTagKeys.some((key) => dietaryIds.has(key) || allergenIds.has(key));
    };

    const fetchMenu = async () => {
        try {
            const apiBase = getApiBase();
            const res = await fetch(`${apiBase}/menus/public/${menuId}`);
            if (!res.ok) throw new Error("Menu not found");
            const data = await res.json();
            setMenu(data);
        } catch (e) {
            setError("Could not load menu. Please try again later.");
        } finally {
            setLoading(false);
        }
    };

    // Filter Logic
    const filteredCategories = menu?.categories.map(cat => {
        const searchFiltered = cat.items
            .filter(item =>
                item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.description?.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .filter(itemMatchesSelectedTags);
        return {
            ...cat,
            items: visibleItems(searchFiltered)
        };
    }).filter(cat => cat.items.length > 0) || [];

    const previewTheme = searchParams.get("theme");
    const resolvedTheme = (previewTheme || menu?.theme || "noir") as MenuThemeId;
    const themeId: MenuThemeId = MENU_THEME_BY_ID[resolvedTheme] ? resolvedTheme : "noir";
    const activeTheme = MENU_THEME_BY_ID[themeId];
    const palette = activeTheme.palette;
    const themeLayout = activeTheme.layout;
    const showImages = menu?.show_item_images !== false; // Default to true if not set

    // Dynamic font loading from theme configuration
    const themeFonts = activeTheme.fonts;

    // Load Google Fonts dynamically when theme changes
    useEffect(() => {
        if (!themeFonts) return;

        // Create Google Fonts URL
        const headingFamily = themeFonts.heading.replace(/\s+/g, '+');
        const bodyFamily = themeFonts.body.replace(/\s+/g, '+');
        const headingWeights = themeFonts.headingWeights;
        const bodyWeights = themeFonts.bodyWeights;

        // Avoid duplicate font loads
        const fontId = `theme-fonts-${themeId}`;
        const existingLink = document.getElementById(fontId);
        if (existingLink) return;

        // Remove old theme fonts
        document.querySelectorAll('[data-theme-font]').forEach(el => el.remove());

        // Create and append Google Fonts link
        const link = document.createElement('link');
        link.id = fontId;
        link.setAttribute('data-theme-font', 'true');
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${headingFamily}:wght@${headingWeights}&family=${bodyFamily}:wght@${bodyWeights}&display=swap`;
        document.head.appendChild(link);

        // Create CSS variables for fonts
        const style = document.createElement('style');
        style.id = `${fontId}-vars`;
        style.setAttribute('data-theme-font', 'true');
        style.textContent = `
            :root {
                --theme-heading-font: "${themeFonts.heading}", sans-serif;
                --theme-body-font: "${themeFonts.body}", sans-serif;
            }
            .theme-heading { font-family: var(--theme-heading-font) !important; }
            .theme-body { font-family: var(--theme-body-font) !important; }
        `;
        document.head.appendChild(style);

        return () => {
            document.querySelectorAll('[data-theme-font]').forEach(el => el.remove());
        };
    }, [themeId, themeFonts]);

    const themeVars = {
        "--menu-bg": palette.bg,
        "--menu-surface": palette.surface,
        "--menu-surface-alt": palette.surfaceAlt,
        "--menu-text": palette.text,
        "--menu-muted": palette.muted,
        "--menu-border": palette.border,
        "--menu-accent": palette.accent,
        "--theme-heading-font": themeFonts ? `"${themeFonts.heading}", sans-serif` : "inherit",
        "--theme-body-font": themeFonts ? `"${themeFonts.body}", sans-serif` : "inherit",
    } as React.CSSProperties;

    const menuColorScheme = isLightHex(palette.bg) ? "light" : "dark";

    // Prevent mobile browsers (and auto-darkening features) from forcing a dark scheme on light themes.
    useEffect(() => {
        const root = document.documentElement;
        const previous = root.style.colorScheme;
        root.style.colorScheme = menuColorScheme;
        return () => {
            root.style.colorScheme = previous;
        };
    }, [menuColorScheme]);

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center text-white/50">
                <div className="animate-pulse flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-white animate-spin"></div>
                    <p className="font-mono text-sm tracking-widest uppercase">Loading Menu</p>
                </div>
            </div>
        );
    }

    if (error || !menu) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center text-white text-center p-6">
                <div className="max-w-md">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold mb-2">Menu Not Found</h1>
                    <p className="text-white/50">{error || "This menu does not exist or has been removed."}</p>
                </div>
            </div>
        );
    }

    const renderBanner = () => {
        if (!menu.banner_url) return null;
        return (
            <div className="rounded-3xl overflow-hidden border shadow-sm" style={{ borderColor: palette.border }}>
                <img src={menu.banner_url} alt={`${menu.name} banner`} className="w-full h-44 object-cover" />
            </div>
        );
    };

    // Render title area with logo when title_design_config is enabled
    const renderTitleArea = (headingClass: string = "text-xl font-bold tracking-tight") => {
        const config = menu.title_design_config;

        // If title design is enabled and we have a logo, render logo-based title
        if (config?.enabled && menu.logo_url) {
            return (
                <div
                    className="flex items-center justify-center mb-2"
                    style={{ paddingTop: '4px', paddingBottom: '4px' }}
                >
                    <img
                        src={menu.logo_url}
                        alt={menu.name}
                        className="object-contain"
                        style={{
                            transform: `scale(${config.logoScale || 1})`,
                            maxHeight: '48px',
                            transformOrigin: 'center'
                        }}
                    />
                </div>
            );
        }

        // Default to text-based title
        return (
            <div className="flex items-center justify-between mb-3">
                <h1 className={`${headingClass} truncate pr-4 theme-heading`}>{menu.name}</h1>
            </div>
        );
    };

    const hasAnyTagFilters =
        filterOptions.diet.length > 0 ||
        filterOptions.spice.length > 0 ||
        filterOptions.highlights.length > 0 ||
        filterOptions.allergens.length > 0;
    const filterAccentText = isLightHex(palette.accent) ? "#111827" : "#FFFFFF";

    const renderTagFiltersToggle = () => (
        <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            disabled={!hasAnyTagFilters}
            aria-label="Filter by tags"
            title={hasAnyTagFilters ? "Filter by tags" : "No tags on this menu yet"}
            className="absolute inset-y-0 right-3 my-auto h-9 w-9 rounded-xl border flex items-center justify-center transition-colors"
            style={{
                borderColor: palette.border,
                backgroundColor: filtersOpen ? palette.surface : palette.surfaceAlt,
                opacity: hasAnyTagFilters ? 1 : 0.55,
                cursor: hasAnyTagFilters ? "pointer" : "not-allowed"
            }}
        >
            <SlidersHorizontal className="h-4 w-4" style={{ color: palette.muted }} />
            {selectedTagKeys.length > 0 && (
                <span
                    className="absolute -top-1 -right-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ backgroundColor: palette.accent, color: filterAccentText }}
                >
                    {selectedTagKeys.length}
                </span>
            )}
        </button>
    );

    const renderTagFiltersPanel = () => {
        if (!filtersOpen) return null;

        return (
            <div
                className="mt-3 rounded-3xl border p-3"
                style={{ borderColor: palette.border, backgroundColor: palette.surface }}
            >
                <div className="mb-3 flex items-center justify-between px-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: palette.muted }}>
                        Filters
                    </div>
                    {selectedTagKeys.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setSelectedTagKeys([])}
                            className="text-xs font-semibold underline underline-offset-4 transition-colors"
                            style={{ color: palette.muted }}
                        >
                            Clear
                        </button>
                    )}
                </div>

                {!hasAnyTagFilters ? (
                    <div className="p-2 text-sm" style={{ color: palette.muted }}>
                        Add dietary/allergen tags to items to enable filtering.
                    </div>
                ) : (
                    <>
                        {filterOptions.diet.length > 0 && (
                            <div>
                                <div
                                    className="px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.22em]"
                                    style={{ color: palette.muted }}
                                >
                                    {tagLabels.diet}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {filterOptions.diet.map((tag) => {
                                        const key = `d:${tag.id || tag.name}`;
                                        const selected = selectedTagKeys.includes(key);
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() =>
                                                    setSelectedTagKeys((prev) =>
                                                        selected ? prev.filter((v) => v !== key) : [...prev, key]
                                                    )
                                                }
                                                className="rounded-full border px-3 py-2 text-xs font-semibold transition-colors"
                                                style={{
                                                    borderColor: palette.border,
                                                    backgroundColor: selected ? palette.accent : palette.surfaceAlt,
                                                    color: selected ? filterAccentText : palette.text
                                                }}
                                            >
                                                {tag.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {filterOptions.spice.length > 0 && (
                            <div className={filterOptions.diet.length > 0 ? "mt-4" : ""}>
                                <div className="px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: palette.muted }}>
                                    {tagLabels.spice}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {filterOptions.spice.map((tag) => {
                                        const key = `d:${tag.id || tag.name}`;
                                        const selected = selectedTagKeys.includes(key);
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() =>
                                                    setSelectedTagKeys((prev) =>
                                                        selected ? prev.filter((v) => v !== key) : [...prev, key]
                                                    )
                                                }
                                                className="rounded-full border px-3 py-2 text-xs font-semibold transition-colors"
                                                style={{
                                                    borderColor: palette.border,
                                                    backgroundColor: selected ? palette.accent : palette.surfaceAlt,
                                                    color: selected ? filterAccentText : palette.text
                                                }}
                                            >
                                                {tag.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {filterOptions.highlights.length > 0 && (
                            <div className={(filterOptions.diet.length > 0 || filterOptions.spice.length > 0) ? "mt-4" : ""}>
                                <div className="px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: palette.muted }}>
                                    {tagLabels.highlights}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {filterOptions.highlights.map((tag) => {
                                        const key = `d:${tag.id || tag.name}`;
                                        const selected = selectedTagKeys.includes(key);
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() =>
                                                    setSelectedTagKeys((prev) =>
                                                        selected ? prev.filter((v) => v !== key) : [...prev, key]
                                                    )
                                                }
                                                className="rounded-full border px-3 py-2 text-xs font-semibold transition-colors"
                                                style={{
                                                    borderColor: palette.border,
                                                    backgroundColor: selected ? palette.accent : palette.surfaceAlt,
                                                    color: selected ? filterAccentText : palette.text
                                                }}
                                            >
                                                {tag.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {filterOptions.allergens.length > 0 && (
                            <div className={(filterOptions.diet.length > 0 || filterOptions.spice.length > 0 || filterOptions.highlights.length > 0) ? "mt-4" : ""}>
                                <div className="px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: palette.muted }}>
                                    {tagLabels.allergens}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {filterOptions.allergens.map((tag) => {
                                        const key = `a:${tag.id || tag.name}`;
                                        const selected = selectedTagKeys.includes(key);
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() =>
                                                    setSelectedTagKeys((prev) =>
                                                        selected ? prev.filter((v) => v !== key) : [...prev, key]
                                                    )
                                                }
                                                className="rounded-full border px-3 py-2 text-xs font-semibold transition-colors"
                                                style={{
                                                    borderColor: palette.border,
                                                    backgroundColor: selected ? palette.accent : palette.surfaceAlt,
                                                    color: selected ? filterAccentText : palette.text
                                                }}
                                            >
                                                {tag.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    };

    const renderNoir = () => (
        <div
            className={`min-h-screen pb-20 selection:bg-orange-500/30 theme-body bg-[var(--menu-bg)] text-[color:var(--menu-text)]`}
            style={themeVars}
        >
            {/* Subtle ambient gradient */}
            <div
                className="fixed inset-0 pointer-events-none opacity-40"
                style={{
                    background: `radial-gradient(ellipse 80% 50% at 50% -20%, ${palette.accent}15, transparent 70%)`
                }}
            />

            <div
                className="sticky top-0 z-40 border-b transition-all"
                style={{
                    backgroundColor: `color-mix(in srgb, ${palette.bg} 85%, transparent)`,
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    borderColor: palette.border
                }}
            >
                <div className="max-w-md mx-auto p-4">
                    {renderTitleArea("text-xl font-bold tracking-tight")}

                    <div className="relative group">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-white/30 group-focus-within:text-white transition-colors duration-300" />
                        </div>
                        <input
                            type="text"
                            placeholder="Find food or drinks..."
                            className="block w-full pl-10 pr-12 py-3.5 rounded-2xl text-sm placeholder:text-[color:var(--menu-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--menu-accent)]/30 transition-all font-medium border"
                            style={{ backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {renderTagFiltersToggle()}
                    </div>
                    {renderTagFiltersPanel()}
                </div>

                <div className="max-w-md mx-auto px-4 pb-0 overflow-x-auto no-scrollbar flex gap-4">
                    {filteredCategories.map(cat => (
                        <a
                            key={cat.id}
                            href={`#cat-${cat.id}`}
                            className="whitespace-nowrap pb-4 text-sm font-bold transition-all duration-300 border-b-2 border-transparent hover:border-[color:var(--menu-accent)] hover:text-[color:var(--menu-accent)]"
                            style={{ color: palette.muted }}
                        >
                            {cat.name}
                        </a>
                    ))}
                </div>
            </div>

            <main className="max-w-md mx-auto p-4 space-y-12 pt-8 relative">
                {renderBanner()}
                {filteredCategories.map((category, categoryIndex) => (
                    <section
                        key={category.id}
                        id={`cat-${category.id}`}
                        className="scroll-mt-48 animate-fade-in-up"
                        style={{ animationDelay: `${categoryIndex * 0.1}s`, animationFillMode: 'backwards' }}
                    >
                        <h2 className="text-2xl font-black mb-6 flex items-center gap-3 theme-heading">
                            {category.name}
                            <span
                                className="text-xs font-mono font-normal px-2.5 py-1 rounded-full"
                                style={{ color: palette.muted, backgroundColor: palette.surfaceAlt }}
                            >
                                {visibleItems(category.items).length}
                            </span>
                        </h2>

                        <div className="grid gap-5">
                            {visibleItems(category.items).map((item, itemIndex) => (
                                <div
                                    key={item.id}
                                    onClick={() => setSelectedItem(item)}
                                    className={`menu-item-card group relative rounded-[28px] p-4 flex gap-4 cursor-pointer overflow-hidden border glow-accent ${item.is_sold_out && soldOutDisplay === "dim" ? "opacity-50 grayscale" : ""}`}
                                    style={{
                                        backgroundColor: palette.surface,
                                        borderColor: palette.border,
                                        boxShadow: `0 4px 24px -8px ${palette.accent}10`
                                    }}
                                >
                                    {/* Subtle gradient overlay */}
                                    <div
                                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                                        style={{
                                            background: `linear-gradient(135deg, ${palette.accent}08, transparent 60%)`
                                        }}
                                    />

                                    <div className="flex-1 min-w-0 flex flex-col justify-between py-1 relative z-10">
                                        <div>
                                            <div className="flex justify-between items-start gap-2 mb-1">
                                                <h3 className="font-bold text-lg leading-tight">{item.name}</h3>
                                            </div>
                                            <p className="text-sm line-clamp-2 mb-3 leading-relaxed" style={{ color: palette.muted }}>
                                                {item.description || "No description available."}
                                            </p>
                                        </div>

                                        <div className="flex items-center justify-between mt-auto">
                                            <div className="font-mono font-bold text-lg" style={{ color: palette.accent }}>
                                                ${item.price.toFixed(2)}
                                            </div>

                                            <span />
                                        </div>
                                    </div>

                                    {showImages && (item.photo_url || item.photos?.[0]?.url) ? (
                                        <div
                                            className="w-28 shrink-0 flex flex-col items-end gap-2"
                                        >
                                            <div
                                                className="w-28 h-28 rounded-2xl overflow-hidden relative img-zoom-container"
                                                style={{
                                                    backgroundColor: palette.surfaceAlt,
                                                    boxShadow: `0 8px 32px -8px rgba(0,0,0,0.4)`
                                                }}
                                            >
                                                <img
                                                    src={item.photo_url || item.photos?.[0]?.url}
                                                    alt={item.name}
                                                    className="w-full h-full object-cover"
                                                />
                                                {item.is_sold_out && (
                                                    <div className="absolute inset-0 bg-black/75 flex items-center justify-center backdrop-blur-sm">
                                                        <span className="text-xs font-black uppercase tracking-widest rotate-[-12deg] border-2 border-red-500 px-2 py-1 text-red-400 bg-black/90 shadow-2xl">Sold Out</span>
                                                    </div>
                                                )}
                                            </div>

                                            <span />
                                        </div>
                                    ) : (
                                        item.is_sold_out && (
                                            <div className="absolute top-4 right-4 bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider backdrop-blur-sm">
                                                Sold Out
                                            </div>
                                        )
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                ))}

                {filteredCategories.length === 0 && (
                    <div className="text-center py-20 opacity-40">
                        <p>No items found for "{searchQuery}"</p>
                    </div>
                )}
            </main>

            <footer className="max-w-md mx-auto p-8 text-center text-xs font-mono" style={{ color: palette.muted }}>
                <p>Powered by Menuvium</p>
            </footer>
        </div>
    );

    const renderPaper = () => (
        <div
            className={`min-h-screen pb-20 theme-body bg-[var(--menu-bg)] text-[color:var(--menu-text)]`}
            style={themeVars}
        >
            <div
                className="sticky top-0 z-40 border-b"
                style={{
                    backgroundColor: `color-mix(in srgb, ${palette.bg} 90%, transparent)`,
                    backdropFilter: 'blur(16px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(150%)',
                    borderColor: palette.border
                }}
            >
                <div className="max-w-md mx-auto p-4">
                    {renderTitleArea("text-2xl font-semibold tracking-tight")}
                    <div className="relative">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4" style={{ color: palette.muted }} />
                        </div>
                        <input
                            type="text"
                            placeholder="Search the menu..."
                            className="block w-full pl-10 pr-12 py-3.5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--menu-accent)]/20 transition-all border"
                            style={{ backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {renderTagFiltersToggle()}
                    </div>
                    {renderTagFiltersPanel()}
                </div>
                <div className="relative max-w-md mx-auto px-4">
                    <div className="pb-3 overflow-x-auto no-scrollbar flex gap-2">
                        {filteredCategories.map(cat => (
                            <a
                                key={cat.id}
                                href={`#cat-${cat.id}`}
                                className="category-chip whitespace-nowrap text-xs font-semibold uppercase tracking-wide rounded-full px-4 py-2.5 transition-all duration-300 shrink-0"
                                style={{
                                    color: palette.muted,
                                    backgroundColor: palette.surface,
                                    borderWidth: '1px',
                                    borderStyle: 'solid',
                                    borderColor: palette.border
                                }}
                            >
                                {cat.name}
                            </a>
                        ))}
                    </div>
                    <div
                        className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none"
                        style={{ background: `linear-gradient(to right, transparent, ${palette.bg})` }}
                    />
                </div>
            </div>

            <main className="max-w-md mx-auto p-4 space-y-10">
                {renderBanner()}
                {filteredCategories.map((category, categoryIndex) => (
                    <section
                        key={category.id}
                        id={`cat-${category.id}`}
                        className="scroll-mt-44 animate-fade-in-up"
                        style={{ animationDelay: `${categoryIndex * 0.08}s`, animationFillMode: 'backwards' }}
                    >
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-2xl theme-heading">{category.name}</h2>
                            <span className="text-xs" style={{ color: palette.muted }}>
                                {visibleItems(category.items).length} items
                            </span>
                        </div>
                        <div
                            className="rounded-3xl border overflow-hidden shadow-soft"
                            style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                        >
                            {visibleItems(category.items).map((item, index) => (
                                <button
                                    key={item.id}
                                    onClick={() => setSelectedItem(item)}
                                    className={`w-full text-left px-5 py-4 flex items-start gap-4 transition-all duration-200 hover:bg-[var(--menu-surface-alt)] ${index > 0 ? 'border-t' : ''} ${item.is_sold_out && soldOutDisplay === "dim" ? "opacity-60" : ""}`}
                                    style={{ borderColor: palette.border }}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-3">
                                            <h3 className="font-semibold text-base">{item.name}</h3>
                                            <span className="text-sm font-semibold shrink-0" style={{ color: palette.accent }}>
                                                ${item.price.toFixed(2)}
                                            </span>
                                        </div>
                                        <p className="text-sm line-clamp-2 mt-1.5 leading-relaxed" style={{ color: palette.muted }}>
                                            {item.description || "No description available."}
                                        </p>
                                    </div>
                                    {showImages && (item.photo_url || item.photos?.[0]?.url) && (
                                        <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0" style={{ backgroundColor: palette.surfaceAlt }}>
                                            <img
                                                src={item.photo_url || item.photos?.[0]?.url}
                                                alt={item.name}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </section>
                ))}

                {filteredCategories.length === 0 && (
                    <div className="text-center py-16" style={{ color: palette.muted }}>
                        <p>No items found for "{searchQuery}"</p>
                    </div>
                )}
            </main>
        </div>
    );

    const renderCitrus = () => (
        <div
            className={`min-h-screen pb-20 theme-body bg-[var(--menu-bg)] text-[color:var(--menu-text)]`}
            style={themeVars}
        >
            <div
                className="sticky top-0 z-40 border-b"
                style={{
                    backgroundColor: `color-mix(in srgb, ${palette.bg} 92%, transparent)`,
                    backdropFilter: 'blur(16px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(150%)',
                    borderColor: palette.border
                }}
            >
                <div className="max-w-md mx-auto p-4">
                    {renderTitleArea("text-3xl tracking-wide")}
                    <div className="relative">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4" style={{ color: palette.accent }} />
                        </div>
                        <input
                            type="text"
                            placeholder="Search items"
                            className="block w-full pl-10 pr-12 py-3.5 rounded-2xl text-sm placeholder:text-[color:var(--menu-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--menu-accent)]/30 transition-all border-2"
                            style={{ backgroundColor: palette.surface, borderColor: palette.accent, color: palette.text }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {renderTagFiltersToggle()}
                    </div>
                    {renderTagFiltersPanel()}
                </div>
                <div className="relative max-w-md mx-auto px-4">
                    <div className="pb-3 overflow-x-auto no-scrollbar flex gap-3">
                        {filteredCategories.map(cat => (
                            <a
                                key={cat.id}
                                href={`#cat-${cat.id}`}
                                className="category-chip whitespace-nowrap text-xs font-bold uppercase tracking-widest rounded-full px-4 py-2.5 shadow-sm transition-bounce hover:scale-105 shrink-0"
                                style={{ backgroundColor: palette.accent, color: palette.bg }}
                            >
                                {cat.name}
                            </a>
                        ))}
                    </div>
                    <div
                        className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none"
                        style={{ background: `linear-gradient(to right, transparent, ${palette.bg})` }}
                    />
                </div>
            </div>

            <main className="max-w-md mx-auto p-4 space-y-10">
                {renderBanner()}
                {filteredCategories.map((category, categoryIndex) => (
                    <section
                        key={category.id}
                        id={`cat-${category.id}`}
                        className="scroll-mt-44 animate-fade-in-up"
                        style={{ animationDelay: `${categoryIndex * 0.08}s`, animationFillMode: 'backwards' }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-2xl tracking-wide theme-heading">{category.name}</h2>
                            <span className="text-xs" style={{ color: palette.muted }}>
                                {visibleItems(category.items).length} items
                            </span>
                        </div>
                        <div className="grid gap-4">
                            {visibleItems(category.items).map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => setSelectedItem(item)}
                                    className={`menu-item-card group cursor-pointer rounded-2xl border-2 p-4 transition-bounce hover:scale-[1.02] ${item.is_sold_out && soldOutDisplay === "dim" ? "opacity-60" : ""}`}
                                    style={{
                                        backgroundColor: palette.surface,
                                        borderColor: palette.border,
                                        boxShadow: `0 4px 16px -4px ${palette.accent}15`
                                    }}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-bold text-base">{item.name}</h3>
                                            <p className="text-sm line-clamp-2 mt-1.5 leading-relaxed" style={{ color: palette.muted }}>
                                                {item.description || "No description available."}
                                            </p>
                                            <span className="inline-block mt-2 text-sm font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: `${palette.accent}15`, color: palette.accent }}>
                                                ${item.price.toFixed(2)}
                                            </span>
                                        </div>
                                        {showImages && (item.photo_url || item.photos?.[0]?.url) && (
                                            <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0" style={{ backgroundColor: palette.surfaceAlt }}>
                                                <img
                                                    src={item.photo_url || item.photos?.[0]?.url}
                                                    alt={item.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                ))}
            </main>
        </div>
    );

    const renderHarbor = () => (
        <div
            className={`min-h-screen pb-20 theme-body bg-[var(--menu-bg)] text-[color:var(--menu-text)]`}
            style={themeVars}
        >
            <div
                className="sticky top-0 z-40 border-b"
                style={{
                    backgroundColor: `color-mix(in srgb, ${palette.surfaceAlt} 90%, transparent)`,
                    backdropFilter: 'blur(16px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(150%)',
                    borderColor: palette.border
                }}
            >
                <div className="max-w-md mx-auto p-4">
                    {renderTitleArea("text-2xl font-semibold tracking-tight")}
                    <div className="relative">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4" style={{ color: palette.muted }} />
                        </div>
                        <input
                            type="text"
                            placeholder="Search menu..."
                            className="block w-full pl-10 pr-12 py-3.5 rounded-2xl text-sm placeholder:text-[color:var(--menu-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--menu-accent)]/20 transition-all border"
                            style={{ backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {renderTagFiltersToggle()}
                    </div>
                    {renderTagFiltersPanel()}
                </div>
                <div className="relative max-w-md mx-auto px-4">
                    <div className="pb-3 overflow-x-auto no-scrollbar flex gap-3">
                        {filteredCategories.map(cat => (
                            <a
                                key={cat.id}
                                href={`#cat-${cat.id}`}
                                className="category-chip whitespace-nowrap text-xs font-semibold rounded-full px-4 py-2.5 transition-all duration-300 shrink-0"
                                style={{
                                    color: palette.text,
                                    backgroundColor: palette.surface,
                                    borderWidth: '1px',
                                    borderStyle: 'solid',
                                    borderColor: palette.border
                                }}
                            >
                                {cat.name}
                            </a>
                        ))}
                    </div>
                    <div
                        className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none"
                        style={{ background: `linear-gradient(to right, transparent, ${palette.surfaceAlt})` }}
                    />
                </div>
            </div>

            <main className="max-w-md mx-auto p-4 space-y-10">
                {renderBanner()}
                {filteredCategories.map((category, categoryIndex) => (
                    <section
                        key={category.id}
                        id={`cat-${category.id}`}
                        className="scroll-mt-44 animate-fade-in-up"
                        style={{ animationDelay: `${categoryIndex * 0.08}s`, animationFillMode: 'backwards' }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold theme-heading">{category.name}</h2>
                            <span className="text-xs" style={{ color: palette.muted }}>
                                {visibleItems(category.items).length} items
                            </span>
                        </div>
                        <div
                            className="rounded-3xl border overflow-hidden shadow-soft"
                            style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                        >
                            {visibleItems(category.items).map((item, index) => (
                                <button
                                    key={item.id}
                                    onClick={() => setSelectedItem(item)}
                                    className={`w-full text-left px-5 py-4 flex items-center gap-4 transition-all duration-200 hover:bg-[var(--menu-surface-alt)] ${index > 0 ? 'border-t' : ''} ${item.is_sold_out && soldOutDisplay === "dim" ? "opacity-60" : ""}`}
                                    style={{ borderColor: palette.border }}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-3">
                                            <h3 className="font-semibold text-base">{item.name}</h3>
                                            <span className="text-sm font-semibold shrink-0" style={{ color: palette.accent }}>
                                                ${item.price.toFixed(2)}
                                            </span>
                                        </div>
                                        <p className="text-sm line-clamp-2 mt-1.5 leading-relaxed" style={{ color: palette.muted }}>
                                            {item.description || "No description available."}
                                        </p>
                                    </div>
                                    {showImages && (item.photo_url || item.photos?.[0]?.url) && (
                                        <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0" style={{ backgroundColor: palette.surfaceAlt }}>
                                            <img
                                                src={item.photo_url || item.photos?.[0]?.url}
                                                alt={item.name}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </section>
                ))}
            </main>
        </div>
    );

    const renderTheme = () => {
        switch (themeLayout) {
            case "paper":
                return renderPaper();
            case "citrus":
                return renderCitrus();
            case "harbor":
                return renderHarbor();
            case "noir":
            default:
                return renderNoir();
        }
    };

    const modalBackdrop = themeLayout === "noir" ? "rgba(0, 0, 0, 0.85)" : "rgba(15, 23, 42, 0.35)";
    const modalPanelStyle = {
        backgroundColor: palette.surface,
        color: palette.text,
        borderColor: palette.border
    };
    const modalTagStyle = {
        backgroundColor: palette.surfaceAlt,
        borderColor: palette.border,
        color: palette.text
    };
    const modalAllergenStyle = {
        backgroundColor: palette.surfaceAlt,
        borderColor: palette.accent,
        color: palette.accent
    };
    const modalCloseStyle = {
        backgroundColor: palette.accent,
        color: palette.bg
    };

    return (
        <div className="min-h-screen" style={{ colorScheme: menuColorScheme }}>
            {renderTheme()}

            {selectedItem && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
                    <div
                        className="absolute inset-0 backdrop-blur-md transition-opacity"
                        style={{ backgroundColor: modalBackdrop }}
                        onClick={() => setSelectedItem(null)}
                    ></div>

                    <div
                        className="relative w-full max-w-lg sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-full duration-300 max-h-[90vh] overflow-y-auto border"
                        style={modalPanelStyle}
                    >
                        <button
                            onClick={() => setSelectedItem(null)}
                            className="absolute top-4 right-4 z-10 p-2 rounded-full border shadow-sm transition-all"
                            style={{
                                backgroundColor: palette.surfaceAlt,
                                borderColor: palette.border,
                                color: palette.text
                            }}
                        >
                            <X className="w-5 h-5" />
                        </button>

                        {(selectedItem.photo_url || selectedItem.photos?.[0]?.url) ? (
                            <div className="aspect-video w-full relative">
                                <img
                                    src={selectedItem.photo_url || selectedItem.photos?.[0]?.url}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                            </div>
                        ) : (
                            <div className="h-12 bg-gradient-to-b from-black/10 to-transparent"></div>
                        )}

                        <div className="p-6 sm:p-8 -mt-12 relative">
                            <div className="flex justify-between items-start mb-4">
                                <h2 className="text-3xl font-black leading-tight">{selectedItem.name}</h2>
                            </div>

                            <p className="text-2xl font-mono font-bold mb-6" style={{ color: palette.accent }}>
                                ${selectedItem.price.toFixed(2)}
                            </p>

                            <div className="space-y-6">
                                <p className="text-lg leading-relaxed font-light" style={{ color: palette.muted }}>
                                    {selectedItem.description || "No description available for this item."}
                                </p>

                                {/* Metadata Grid */}
                                {((selectedItem.dietary_tags?.length ?? 0) > 0 || (selectedItem.allergens?.length ?? 0) > 0) && (
                                    <div className="grid grid-cols-2 gap-4 py-6 border-y" style={{ borderColor: palette.border }}>
                                        {(selectedItem.dietary_tags?.length ?? 0) > 0 && (
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: palette.muted }}>
                                                    Dietary
                                                </h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {(selectedItem.dietary_tags ?? []).map((tag, index) => (
                                                        <span
                                                            key={`${selectedItem.id}-diet-${tag.id ?? tag.name ?? index}`}
                                                            className="px-3 py-1 rounded-lg text-xs font-bold border"
                                                            style={modalTagStyle}
                                                        >
                                                            {tag.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {(selectedItem.allergens?.length ?? 0) > 0 && (
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: palette.muted }}>
                                                    Allergens
                                                </h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {(selectedItem.allergens ?? []).map((tag, index) => (
                                                        <span
                                                            key={`${selectedItem.id}-allergen-${tag.id ?? tag.name ?? index}`}
                                                            className="px-3 py-1 rounded-lg text-xs font-bold border"
                                                            style={modalAllergenStyle}
                                                        >
                                                            {tag.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <button
                                className="w-full mt-8 py-4 rounded-2xl font-black text-lg transition-colors active:scale-[0.98]"
                                style={modalCloseStyle}
                                onClick={() => setSelectedItem(null)}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
