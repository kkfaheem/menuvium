"use client";

import React from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { Menu, Category, Item, DietaryTag, Allergen } from "@/types";

/**
 * Theme configuration for menu rendering
 */
export interface MenuThemePalette {
    bg: string;
    surface: string;
    surfaceAlt: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
}

export interface ThemeLayoutConfig {
    /** Font className to apply */
    fontClass: string;
    /** Optional title font className (for Paper theme which uses Playfair for titles) */
    titleFontClass?: string;
    /** Header title size class */
    titleSize: string;
    /** Whether to show "Menu" badge next to title */
    showMenuBadge?: boolean;
    /** Header blur amount */
    headerBlur: string;
    /** Header bg opacity mix */
    headerBgMix: string;
    /** Search input border style */
    searchBorderStyle: "normal" | "accent";
    /** Category chip style */
    categoryStyle: "underline" | "pill" | "tag";
    /** Item card style */
    cardStyle: "glass" | "flat" | "elevated";
    /** Whether to show footer */
    showFooter?: boolean;
    /** Whether to show ambient gradient */
    showAmbientGradient?: boolean;
}

export interface ThemeLayoutProps {
    menu: Menu;
    categories: Category[];
    palette: MenuThemePalette;
    config: ThemeLayoutConfig;
    themeVars: React.CSSProperties;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    renderBanner: () => React.ReactNode;
    renderTagFiltersToggle: () => React.ReactNode;
    renderTagFiltersPanel: () => React.ReactNode;
    onItemClick?: (item: Item) => void;
}

/**
 * Unified theme layout component that replaces renderNoir, renderPaper, renderCitrus, renderHarbor
 */
export function ThemeLayout({
    menu,
    categories,
    palette,
    config,
    themeVars,
    searchQuery,
    onSearchChange,
    renderBanner,
    renderTagFiltersToggle,
    renderTagFiltersPanel,
    onItemClick
}: ThemeLayoutProps) {
    const {
        fontClass,
        titleFontClass,
        titleSize,
        showMenuBadge,
        headerBlur,
        headerBgMix,
        searchBorderStyle,
        categoryStyle,
        cardStyle,
        showFooter,
        showAmbientGradient
    } = config;

    const getCategoryChipStyles = (catId: string) => {
        switch (categoryStyle) {
            case "pill":
                return {
                    className: "whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all",
                    style: { color: palette.text, backgroundColor: palette.surfaceAlt }
                };
            case "tag":
                return {
                    className: "whitespace-nowrap px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all border-2",
                    style: { color: palette.accent, borderColor: palette.accent, backgroundColor: "transparent" }
                };
            case "underline":
            default:
                return {
                    className: "whitespace-nowrap pb-4 text-sm font-bold transition-all duration-300 border-b-2 border-transparent hover:border-[color:var(--menu-accent)] hover:text-[color:var(--menu-accent)]",
                    style: { color: palette.muted }
                };
        }
    };

    const getCardStyles = () => {
        switch (cardStyle) {
            case "elevated":
                return {
                    className: "relative p-5 rounded-2xl border transition-all hover:shadow-lg",
                    style: { backgroundColor: palette.surface, borderColor: palette.border }
                };
            case "flat":
                return {
                    className: "relative p-5 rounded-xl border transition-all",
                    style: { backgroundColor: palette.surface, borderColor: palette.border }
                };
            case "glass":
            default:
                return {
                    className: "relative p-5 rounded-3xl border transition-all",
                    style: {
                        backgroundColor: `color-mix(in srgb, ${palette.surface} 80%, transparent)`,
                        backdropFilter: "blur(12px)",
                        borderColor: palette.border
                    }
                };
        }
    };

    return (
        <div
            className={`min-h-screen pb-20 ${fontClass} bg-[var(--menu-bg)] text-[color:var(--menu-text)]`}
            style={themeVars}
        >
            {/* Ambient gradient (for Noir theme) */}
            {showAmbientGradient && (
                <div
                    className="fixed inset-0 pointer-events-none opacity-40"
                    style={{
                        background: `radial-gradient(ellipse 80% 50% at 50% -20%, ${palette.accent}15, transparent 70%)`
                    }}
                />
            )}

            {/* Sticky Header */}
            <div
                className="sticky top-0 z-40 border-b transition-all"
                style={{
                    backgroundColor: `color-mix(in srgb, ${palette.bg} ${headerBgMix}, transparent)`,
                    backdropFilter: `blur(${headerBlur}) saturate(180%)`,
                    WebkitBackdropFilter: `blur(${headerBlur}) saturate(180%)`,
                    borderColor: palette.border
                }}
            >
                <div className="max-w-md mx-auto p-4">
                    {/* Title Row */}
                    <div className="flex items-center justify-between mb-4">
                        <h1 className={`${titleSize} font-bold tracking-tight truncate pr-4 ${titleFontClass || ""}`}>
                            {menu.name}
                        </h1>
                        {showMenuBadge && (
                            <span
                                className="text-[10px] uppercase tracking-[0.2em]"
                                style={{ color: palette.accent }}
                            >
                                Menu
                            </span>
                        )}
                    </div>

                    {/* Search Input */}
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <Search
                                className="h-4 w-4 transition-colors duration-300"
                                style={{ color: searchBorderStyle === "accent" ? palette.accent : palette.muted }}
                            />
                        </div>
                        <input
                            type="text"
                            placeholder="Search items..."
                            className="block w-full pl-10 pr-12 py-3.5 rounded-2xl text-sm placeholder:text-[color:var(--menu-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--menu-accent)]/30 transition-all font-medium border"
                            style={{
                                backgroundColor: palette.surfaceAlt,
                                borderColor: searchBorderStyle === "accent" ? palette.accent : palette.border,
                                color: palette.text
                            }}
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                        />
                        {renderTagFiltersToggle()}
                    </div>
                    {renderTagFiltersPanel()}
                </div>

                {/* Category Navigation */}
                <div className="max-w-md mx-auto px-4 pb-0 overflow-x-auto no-scrollbar flex gap-4">
                    {categories.map(cat => {
                        const chipStyles = getCategoryChipStyles(cat.id);
                        return (
                            <a
                                key={cat.id}
                                href={`#cat-${cat.id}`}
                                className={chipStyles.className}
                                style={chipStyles.style}
                            >
                                {cat.name}
                            </a>
                        );
                    })}
                </div>
            </div>

            {/* Main Content */}
            <main className="max-w-md mx-auto p-4 space-y-12 pt-8 relative">
                {renderBanner()}

                {categories.map((category, categoryIndex) => (
                    <section
                        key={category.id}
                        id={`cat-${category.id}`}
                        className="scroll-mt-48 animate-fade-in-up"
                        style={{ animationDelay: `${categoryIndex * 0.1}s`, animationFillMode: "backwards" }}
                    >
                        {/* Category Header */}
                        <h2 className="text-2xl font-black mb-6 flex items-center gap-3">
                            {category.name}
                            <span
                                className="text-xs font-mono font-normal px-2.5 py-1 rounded-full"
                                style={{ color: palette.muted, backgroundColor: palette.surfaceAlt }}
                            >
                                {category.items.length}
                            </span>
                        </h2>

                        {/* Items Grid */}
                        <div className="space-y-4">
                            {category.items.map(item => {
                                const cardStyles = getCardStyles();
                                const photoUrl = item.photo_url || item.photos?.[0]?.url;

                                return (
                                    <div
                                        key={item.id}
                                        className={`${cardStyles.className} ${item.is_sold_out ? "opacity-50" : ""}`}
                                        style={cardStyles.style}
                                        onClick={() => onItemClick?.(item)}
                                    >
                                        <div className="flex gap-4">
                                            {/* Item Details */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <h3 className="font-bold text-base leading-snug">
                                                        {item.name}
                                                    </h3>
                                                    <span
                                                        className="text-sm font-bold shrink-0"
                                                        style={{ color: palette.accent }}
                                                    >
                                                        ${item.price.toFixed(2)}
                                                    </span>
                                                </div>

                                                {item.description && (
                                                    <p
                                                        className="text-sm leading-relaxed line-clamp-2 mb-3"
                                                        style={{ color: palette.muted }}
                                                    >
                                                        {item.description}
                                                    </p>
                                                )}

                                                {/* Tags */}
                                                <div className="flex flex-wrap gap-1.5">
                                                    {item.dietary_tags?.map(tag => (
                                                        <span
                                                            key={tag.id}
                                                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                                            style={{
                                                                backgroundColor: `${palette.accent}20`,
                                                                color: palette.accent
                                                            }}
                                                        >
                                                            {tag.name}
                                                        </span>
                                                    ))}
                                                    {item.allergens?.map(allergen => (
                                                        <span
                                                            key={allergen.id}
                                                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                                                            style={{
                                                                borderColor: palette.border,
                                                                color: palette.muted
                                                            }}
                                                        >
                                                            {allergen.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Item Photo */}
                                            {photoUrl && (
                                                <div
                                                    className="w-24 h-24 shrink-0 rounded-2xl overflow-hidden relative"
                                                    style={{
                                                        backgroundColor: palette.surfaceAlt,
                                                        boxShadow: "0 8px 32px -8px rgba(0,0,0,0.3)"
                                                    }}
                                                >
                                                    <img
                                                        src={photoUrl}
                                                        alt={item.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                    {item.is_sold_out && (
                                                        <div className="absolute inset-0 bg-black/75 flex items-center justify-center backdrop-blur-sm">
                                                            <span className="text-xs font-black uppercase tracking-widest rotate-[-12deg] border-2 border-red-500 px-2 py-1 text-red-400 bg-black/90">
                                                                Sold Out
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Sold out badge when no photo */}
                                            {!photoUrl && item.is_sold_out && (
                                                <div className="absolute top-4 right-4 bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                                                    Sold Out
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}

                {categories.length === 0 && (
                    <div className="text-center py-20 opacity-40">
                        <p>No items found for "{searchQuery}"</p>
                    </div>
                )}
            </main>

            {/* Footer */}
            {showFooter && (
                <footer
                    className="max-w-md mx-auto p-8 text-center text-xs font-mono"
                    style={{ color: palette.muted }}
                >
                    <p>Powered by Menuvium</p>
                </footer>
            )}
        </div>
    );
}

/**
 * Theme layout configurations for each theme
 */
export const THEME_LAYOUT_CONFIGS: Record<string, ThemeLayoutConfig> = {
    noir: {
        fontClass: "", // Will be set dynamically with spaceGrotesk
        titleSize: "text-xl",
        headerBlur: "20px",
        headerBgMix: "85%",
        searchBorderStyle: "normal",
        categoryStyle: "underline",
        cardStyle: "glass",
        showFooter: true,
        showAmbientGradient: true
    },
    paper: {
        fontClass: "", // Will be set dynamically with manrope
        titleFontClass: "", // Will be set dynamically with playfair
        titleSize: "text-2xl",
        headerBlur: "16px",
        headerBgMix: "90%",
        searchBorderStyle: "normal",
        categoryStyle: "pill",
        cardStyle: "flat",
        showFooter: false,
        showAmbientGradient: false
    },
    citrus: {
        fontClass: "", // Will be set dynamically with spaceGrotesk
        titleSize: "text-3xl",
        showMenuBadge: true,
        headerBlur: "16px",
        headerBgMix: "92%",
        searchBorderStyle: "accent",
        categoryStyle: "tag",
        cardStyle: "elevated",
        showFooter: false,
        showAmbientGradient: false
    },
    harbor: {
        fontClass: "", // Will be set dynamically with manrope
        titleSize: "text-xl",
        headerBlur: "16px",
        headerBgMix: "90%",
        searchBorderStyle: "normal",
        categoryStyle: "pill",
        cardStyle: "flat",
        showFooter: false,
        showAmbientGradient: false
    }
};
