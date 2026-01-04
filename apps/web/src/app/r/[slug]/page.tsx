"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Search, X, AlertCircle } from "lucide-react";
import { Bebas_Neue, Manrope, Playfair_Display, Space_Grotesk } from "next/font/google";
import { MENU_THEME_BY_ID, MenuThemeId } from "@/lib/menuThemes";
import { getApiBase } from "@/lib/apiBase";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700"] });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: ["400"] });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// Types matching Backend Response
interface DietaryTag {
    id: string;
    name: string;
    icon?: string;
}

interface Allergen {
    id: string;
    name: string;
}

interface ItemPhoto {
    url: string;
}

interface Item {
    id: string;
    name: string;
    description?: string;
    price: number;
    is_sold_out: boolean;
    photo_url?: string;
    photos: ItemPhoto[];
    dietary_tags: DietaryTag[];
    allergens: Allergen[];
}

interface Category {
    id: string;
    name: string;
    items: Item[];
}

interface Menu {
    id: string;
    name: string;
    slug: string;
    currency?: string;
    theme?: string;
    banner_url?: string | null;
    categories: Category[];
}

export default function PublicMenuPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const menuId = params.slug as string; // Route param is still [slug] but contains UUID now

    const [menu, setMenu] = useState<Menu | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [soldOutDisplay, setSoldOutDisplay] = useState<"dim" | "hide">("dim");

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

    const visibleItems = (items: Item[]) =>
        items.filter((item) => !(soldOutDisplay === "hide" && item.is_sold_out));

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
        const searchFiltered = cat.items.filter(item =>
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description?.toLowerCase().includes(searchQuery.toLowerCase())
        );
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
    const themeVars = {
        "--menu-bg": palette.bg,
        "--menu-surface": palette.surface,
        "--menu-surface-alt": palette.surfaceAlt,
        "--menu-text": palette.text,
        "--menu-muted": palette.muted,
        "--menu-border": palette.border,
        "--menu-accent": palette.accent
    } as React.CSSProperties;

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

    const renderNoir = () => (
        <div
            className={`min-h-screen pb-20 selection:bg-orange-500/30 ${spaceGrotesk.className} bg-[var(--menu-bg)] text-[color:var(--menu-text)]`}
            style={themeVars}
        >
            <div
                className="sticky top-0 z-40 backdrop-blur-xl border-b transition-all"
                style={{ backgroundColor: palette.bg, borderColor: palette.border }}
            >
                <div className="max-w-md mx-auto p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-xl font-bold tracking-tight truncate pr-4">{menu.name}</h1>
                    </div>

                    <div className="relative group">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-white/30 group-focus-within:text-white transition-colors" />
                        </div>
                        <input
                            type="text"
                            placeholder="Find food or drinks..."
                            className="block w-full pl-10 pr-4 py-3 rounded-2xl text-sm placeholder:text-[color:var(--menu-muted)] focus:outline-none transition-all font-medium border"
                            style={{ backgroundColor: palette.surfaceAlt, borderColor: palette.border, color: palette.text }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="max-w-md mx-auto px-4 pb-0 overflow-x-auto no-scrollbar flex gap-4 mask-fade-right">
                    {filteredCategories.map(cat => (
                        <a
                            key={cat.id}
                            href={`#cat-${cat.id}`}
                            className="whitespace-nowrap pb-4 text-sm font-bold transition-colors border-b-2 border-transparent"
                            style={{ color: palette.muted }}
                        >
                            {cat.name}
                        </a>
                    ))}
                </div>
            </div>

            <main className="max-w-md mx-auto p-4 space-y-12 pt-8">
                {renderBanner()}
                {filteredCategories.map(category => (
                    <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-48">
                        <h2 className="text-2xl font-black mb-6 flex items-center gap-3">
                            {category.name}
                            <span
                                className="text-xs font-mono font-normal px-2 py-1 rounded-full"
                                style={{ color: palette.muted, backgroundColor: palette.surfaceAlt }}
                            >
                                {visibleItems(category.items).length}
                            </span>
                        </h2>

                        <div className="grid gap-6">
                            {visibleItems(category.items).map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => setSelectedItem(item)}
                                    className={`group relative active:scale-[0.98] transition-all duration-200 rounded-3xl p-4 flex gap-4 cursor-pointer overflow-hidden border ${item.is_sold_out && soldOutDisplay === "dim" ? "opacity-50 grayscale" : ""}`}
                                    style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                                >
                                    <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                                        <div>
                                            <div className="flex justify-between items-start gap-2 mb-1">
                                                <h3 className="font-bold text-lg leading-tight truncate">{item.name}</h3>
                                            </div>
                                            <p className="text-sm line-clamp-2 mb-3 leading-relaxed" style={{ color: palette.muted }}>
                                                {item.description || "No description available."}
                                            </p>
                                        </div>

                                        <div className="flex items-center justify-between mt-auto">
                                            <div className="font-mono font-bold text-lg" style={{ color: palette.accent }}>
                                                ${item.price.toFixed(2)}
                                            </div>

                                            <div className="flex gap-1">
                                                {item.dietary_tags.slice(0, 3).map((tag, index) => (
                                                    <span key={`${item.id}-diet-${tag.id ?? tag.name ?? index}`} className="w-1.5 h-1.5 rounded-full bg-blue-500/50"></span>
                                                ))}
                                                {item.allergens.length > 0 && (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500/50"></span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {(item.photo_url || item.photos[0]?.url) ? (
                                        <div className="w-28 h-28 shrink-0 rounded-2xl overflow-hidden relative shadow-lg" style={{ backgroundColor: palette.surfaceAlt }}>
                                            <img
                                                src={item.photo_url || item.photos[0]?.url}
                                                alt={item.name}
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                            />
                                            {item.is_sold_out && (
                                                <div className="absolute inset-0 bg-black/70 flex items-center justify-center backdrop-blur-[1px]">
                                                    <span className="text-xs font-black uppercase tracking-widest rotate-[-12deg] border-2 border-red-500 px-2 py-1 text-red-500 bg-black/80 shadow-2xl">Sold Out</span>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        item.is_sold_out && (
                                            <div className="absolute top-4 right-4 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg">
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

            <footer className="max-w-md mx-auto p-8 text-center text-white/20 text-xs font-mono">
                <p>Powered by Menuvium</p>
            </footer>
        </div>
    );

    const renderPaper = () => (
        <div
            className={`min-h-screen pb-20 ${manrope.className} bg-[var(--menu-bg)] text-[color:var(--menu-text)]`}
            style={themeVars}
        >
            <div
                className="sticky top-0 z-40 backdrop-blur border-b"
                style={{ backgroundColor: palette.bg, borderColor: palette.border }}
            >
                <div className="max-w-md mx-auto p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className={`text-2xl font-semibold tracking-tight ${playfair.className}`}>{menu.name}</h1>
                    </div>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-[#C4B8AD]" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search the menu..."
                            className="block w-full pl-10 pr-4 py-3 rounded-2xl text-sm focus:outline-none transition-all border"
                            style={{ backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <div className="max-w-md mx-auto px-4 pb-3 overflow-x-auto no-scrollbar flex gap-2">
                    {filteredCategories.map(cat => (
                        <a
                            key={cat.id}
                            href={`#cat-${cat.id}`}
                            className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-[#7A6B62] bg-white border border-[#E6DED4] rounded-full px-3 py-2 hover:border-[#C27D4E] hover:text-[#2B2420] transition-colors"
                        >
                            {cat.name}
                        </a>
                    ))}
                </div>
            </div>

            <main className="max-w-md mx-auto p-4 space-y-10">
                {renderBanner()}
                {filteredCategories.map(category => (
                    <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-44">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className={`text-2xl ${playfair.className}`}>{category.name}</h2>
                            <span className="text-xs" style={{ color: palette.muted }}>
                                {visibleItems(category.items).length} items
                            </span>
                        </div>
                        <div
                            className="rounded-3xl border divide-y overflow-hidden"
                            style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                        >
                            {visibleItems(category.items).map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => setSelectedItem(item)}
                                    className={`w-full text-left px-4 py-4 flex items-start gap-3 transition-colors ${item.is_sold_out && soldOutDisplay === "dim" ? "opacity-60" : ""}`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-3">
                                            <h3 className="font-semibold text-base">{item.name}</h3>
                                            <span className="text-sm font-semibold" style={{ color: palette.accent }}>
                                                ${item.price.toFixed(2)}
                                            </span>
                                        </div>
                                        <p className="text-sm line-clamp-2 mt-1" style={{ color: palette.muted }}>
                                            {item.description || "No description available."}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>
                ))}

                {filteredCategories.length === 0 && (
                    <div className="text-center py-16 text-[#9C8F86]">
                        <p>No items found for "{searchQuery}"</p>
                    </div>
                )}
            </main>
        </div>
    );

    const renderCitrus = () => (
        <div
            className={`min-h-screen pb-20 ${spaceGrotesk.className} bg-[var(--menu-bg)] text-[color:var(--menu-text)]`}
            style={themeVars}
        >
            <div
                className="sticky top-0 z-40 backdrop-blur border-b"
                style={{ backgroundColor: palette.bg, borderColor: palette.border }}
            >
                <div className="max-w-md mx-auto p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className={`text-3xl tracking-wide ${bebas.className}`}>{menu.name}</h1>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-[#C58B2B]">Menu</span>
                    </div>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-[#D8A352]" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search items"
                            className="block w-full pl-10 pr-4 py-3 rounded-2xl text-sm placeholder:text-[color:var(--menu-muted)] focus:outline-none transition-all border-2"
                            style={{ backgroundColor: palette.surface, borderColor: palette.accent, color: palette.text }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <div className="max-w-md mx-auto px-4 pb-3 overflow-x-auto no-scrollbar flex gap-3">
                    {filteredCategories.map(cat => (
                        <a
                            key={cat.id}
                            href={`#cat-${cat.id}`}
                            className="whitespace-nowrap text-xs font-bold uppercase tracking-widest text-[#1F1A14] bg-[#FFB703] rounded-full px-4 py-2 shadow-sm hover:bg-[#FF8F00] transition-colors"
                        >
                            {cat.name}
                        </a>
                    ))}
                </div>
            </div>

            <main className="max-w-md mx-auto p-4 space-y-10">
                {renderBanner()}
                {filteredCategories.map(category => (
                    <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-44">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className={`text-2xl tracking-wide ${bebas.className}`}>{category.name}</h2>
                            <span className="text-xs" style={{ color: palette.muted }}>
                                {visibleItems(category.items).length} items
                            </span>
                        </div>
                        <div className="grid gap-4">
                            {visibleItems(category.items).map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => setSelectedItem(item)}
                                    className={`group cursor-pointer rounded-2xl border-2 p-4 shadow-sm hover:-translate-y-0.5 transition-all ${item.is_sold_out && soldOutDisplay === "dim" ? "opacity-60" : ""}`}
                                    style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-base truncate">{item.name}</h3>
                                            <p className="text-sm line-clamp-2 mt-1" style={{ color: palette.muted }}>
                                                {item.description || "No description available."}
                                            </p>
                                        </div>
                                        <span className="text-sm font-semibold" style={{ color: palette.accent }}>
                                            ${item.price.toFixed(2)}
                                        </span>
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
            className={`min-h-screen pb-20 ${manrope.className} bg-[var(--menu-bg)] text-[color:var(--menu-text)]`}
            style={themeVars}
        >
            <div
                className="sticky top-0 z-40 backdrop-blur border-b"
                style={{ backgroundColor: palette.surfaceAlt, borderColor: palette.border }}
            >
                <div className="max-w-md mx-auto p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h1 className="text-2xl font-semibold tracking-tight">{menu.name}</h1>
                    </div>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-[#7C9198]" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search menu..."
                            className="block w-full pl-10 pr-4 py-3 rounded-2xl text-sm placeholder:text-[color:var(--menu-muted)] focus:outline-none transition-all border"
                            style={{ backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <div className="max-w-md mx-auto px-4 pb-3 overflow-x-auto no-scrollbar flex gap-3">
                    {filteredCategories.map(cat => (
                        <a
                            key={cat.id}
                            href={`#cat-${cat.id}`}
                            className="whitespace-nowrap text-xs font-semibold text-[#1D2B2F] border border-[#D6E3E8] bg-white rounded-full px-4 py-2 hover:border-[#2A9D8F] hover:text-[#2A9D8F] transition-colors"
                        >
                            {cat.name}
                        </a>
                    ))}
                </div>
            </div>

            <main className="max-w-md mx-auto p-4 space-y-10">
                {renderBanner()}
                {filteredCategories.map(category => (
                    <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-44">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold">{category.name}</h2>
                            <span className="text-xs" style={{ color: palette.muted }}>
                                {visibleItems(category.items).length} items
                            </span>
                        </div>
                        <div
                            className="rounded-2xl border divide-y"
                            style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                        >
                            {visibleItems(category.items).map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => setSelectedItem(item)}
                                    className={`w-full text-left px-4 py-4 flex items-center justify-between gap-4 transition-colors ${item.is_sold_out && soldOutDisplay === "dim" ? "opacity-60" : ""}`}
                                >
                                    <div className="min-w-0">
                                        <h3 className="font-semibold text-base truncate">{item.name}</h3>
                                        <p className="text-sm line-clamp-2 mt-1" style={{ color: palette.muted }}>
                                            {item.description || "No description available."}
                                        </p>
                                    </div>
                                    <span className="text-sm font-semibold" style={{ color: palette.accent }}>
                                        ${item.price.toFixed(2)}
                                    </span>
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
        <div className="min-h-screen">
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

                        {(selectedItem.photo_url || selectedItem.photos[0]?.url) ? (
                            <div className="aspect-video w-full relative">
                                <img
                                    src={selectedItem.photo_url || selectedItem.photos[0]?.url}
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
                                {(selectedItem.dietary_tags.length > 0 || selectedItem.allergens.length > 0) && (
                                    <div className="grid grid-cols-2 gap-4 py-6 border-y" style={{ borderColor: palette.border }}>
                                        {selectedItem.dietary_tags.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: palette.muted }}>
                                                    Dietary
                                                </h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedItem.dietary_tags.map((tag, index) => (
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
                                        {selectedItem.allergens.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: palette.muted }}>
                                                    Allergens
                                                </h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedItem.allergens.map((tag, index) => (
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
