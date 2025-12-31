"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Search, MapPin, Phone, Clock, ArrowRight, X, AlertCircle } from "lucide-react";

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
    categories: Category[];
}

export default function PublicMenuPage() {
    const params = useParams();
    const menuId = params.slug as string; // Route param is still [slug] but contains UUID now

    const [menu, setMenu] = useState<Menu | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");

    // Modal State
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);

    useEffect(() => {
        if (menuId) fetchMenu();
    }, [menuId]);

    const fetchMenu = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/menus/public/${menuId}`);
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
    const filteredCategories = menu?.categories.map(cat => ({
        ...cat,
        items: cat.items.filter(item =>
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description?.toLowerCase().includes(searchQuery.toLowerCase())
        )
    })).filter(cat => cat.items.length > 0) || [];

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

    return (
        <div className="min-h-screen bg-[#050505] text-white pb-20 font-sans selection:bg-orange-500/30">
            {/* Sticky Header with Search */}
            <div className="sticky top-0 z-40 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5 transition-all">
                <div className="max-w-md mx-auto p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-xl font-bold tracking-tight truncate pr-4">{menu.name}</h1>
                        <div className="flex gap-3">
                            {/* Actions like info could go here */}
                        </div>
                    </div>

                    <div className="relative group">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-white/30 group-focus-within:text-white transition-colors" />
                        </div>
                        <input
                            type="text"
                            placeholder="Find food or drinks..."
                            className="block w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm placeholder:text-white/30 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-all font-medium"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {/* Category Nav - Horizontal Scroll */}
                <div className="max-w-md mx-auto px-4 pb-0 overflow-x-auto no-scrollbar flex gap-4 mask-fade-right">
                    {filteredCategories.map(cat => (
                        <a
                            key={cat.id}
                            href={`#cat-${cat.id}`}
                            className="whitespace-nowrap pb-4 text-sm font-bold text-white/50 hover:text-white transition-colors border-b-2 border-transparent hover:border-white"
                        >
                            {cat.name}
                        </a>
                    ))}
                </div>
            </div>

            <main className="max-w-md mx-auto p-4 space-y-12 pt-8">
                {filteredCategories.map(category => (
                    <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-48">
                        <h2 className="text-2xl font-black mb-6 flex items-center gap-3">
                            {category.name}
                            <span className="text-xs font-mono font-normal text-white/20 bg-white/5 px-2 py-1 rounded-full">{category.items.length}</span>
                        </h2>

                        <div className="grid gap-6">
                            {category.items.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => setSelectedItem(item)}
                                    className={`group relative bg-white/[0.03] active:scale-[0.98] transition-all duration-200 rounded-3xl p-4 flex gap-4 cursor-pointer overflow-hidden border border-white/5 hover:border-white/10 ${item.is_sold_out ? 'opacity-50 grayscale' : ''}`}
                                >
                                    <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                                        <div>
                                            <div className="flex justify-between items-start gap-2 mb-1">
                                                <h3 className="font-bold text-lg leading-tight truncate">{item.name}</h3>
                                            </div>
                                            <p className="text-sm text-white/50 line-clamp-2 mb-3 leading-relaxed">
                                                {item.description || "No description available."}
                                            </p>
                                        </div>

                                        <div className="flex items-center justify-between mt-auto">
                                            <div className="font-mono font-bold text-lg text-white/90">
                                                ${item.price.toFixed(2)}
                                            </div>

                                            {/* Tags Mini */}
                                            <div className="flex gap-1">
                                                {item.dietary_tags.slice(0, 3).map(tag => (
                                                    <span key={tag.id} className="w-1.5 h-1.5 rounded-full bg-blue-500/50"></span>
                                                ))}
                                                {item.allergens.length > 0 && (
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500/50"></span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {(item.photo_url || item.photos[0]?.url) ? (
                                        <div className="w-28 h-28 shrink-0 rounded-2xl overflow-hidden bg-white/10 relative shadow-lg">
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

            {/* Item Detail Modal */}
            {selectedItem && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/90 backdrop-blur-md transition-opacity"
                        onClick={() => setSelectedItem(null)}
                    ></div>

                    {/* Sheet/Modal */}
                    <div className="relative bg-[#111] w-full max-w-lg sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-full duration-300 max-h-[90vh] overflow-y-auto border border-white/10">

                        {/* Close Button Mobile */}
                        <button
                            onClick={() => setSelectedItem(null)}
                            className="absolute top-4 right-4 z-10 p-2 bg-black/30 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        {(selectedItem.photo_url || selectedItem.photos[0]?.url) ? (
                            <div className="aspect-video w-full relative">
                                <img
                                    src={selectedItem.photo_url || selectedItem.photos[0]?.url}
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#111] to-transparent"></div>
                            </div>
                        ) : (
                            <div className="h-12 bg-gradient-to-b from-white/10 to-[#111]"></div>
                        )}

                        <div className="p-6 sm:p-8 -mt-12 relative">
                            <div className="flex justify-between items-start mb-4">
                                <h2 className="text-3xl font-black leading-tight">{selectedItem.name}</h2>
                            </div>

                            <p className="text-2xl font-mono font-bold text-blue-400 mb-6">
                                ${selectedItem.price.toFixed(2)}
                            </p>

                            <div className="space-y-6">
                                <p className="text-lg text-white/70 leading-relaxed font-light">
                                    {selectedItem.description || "No description available for this item."}
                                </p>

                                {/* Metadata Grid */}
                                {(selectedItem.dietary_tags.length > 0 || selectedItem.allergens.length > 0) && (
                                    <div className="grid grid-cols-2 gap-4 py-6 border-y border-white/5">
                                        {selectedItem.dietary_tags.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">Dietary</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedItem.dietary_tags.map(tag => (
                                                        <span key={tag.id} className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-bold border border-blue-500/20">
                                                            {tag.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {selectedItem.allergens.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">Allergens</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedItem.allergens.map(tag => (
                                                        <span key={tag.id} className="px-3 py-1 bg-red-500/10 text-red-400 rounded-lg text-xs font-bold border border-red-500/20">
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
                                className="w-full mt-8 py-4 bg-white text-black rounded-2xl font-black text-lg hover:bg-gray-200 transition-colors active:scale-[0.98]"
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

