"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { getApiBase } from "@/lib/apiBase";
import { TAG_LABELS_DEFAULTS, DIET_TAGS, SPICE_TAGS, HIGHLIGHT_TAGS } from "@/lib/menuTagPresets";
import type { Menu, Category, Item, DietaryTag, Allergen } from "@/types";

interface UsePublicMenuOptions {
    menuId: string;
    previewTheme?: string | null;
}

interface FilterOptions {
    diet: DietaryTag[];
    spice: DietaryTag[];
    highlights: DietaryTag[];
    allergens: Allergen[];
}

interface UsePublicMenuReturn {
    // State
    menu: Menu | null;
    loading: boolean;
    error: string;

    // Search & Filtering
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    selectedTagKeys: string[];
    setSelectedTagKeys: (keys: string[]) => void;
    toggleTagKey: (key: string) => void;
    filtersOpen: boolean;
    setFiltersOpen: (open: boolean) => void;
    filterOptions: FilterOptions;
    filteredCategories: Category[];

    // Settings
    soldOutDisplay: "dim" | "hide";
    setSoldOutDisplay: (value: "dim" | "hide") => void;
    tagLabels: typeof TAG_LABELS_DEFAULTS;

    // Item Modal
    selectedItem: Item | null;
    setSelectedItem: (item: Item | null) => void;

    // Utilities
    visibleItems: (items: Item[]) => Item[];
    isLightHex: (hex: string) => boolean;
}

export function usePublicMenu({ menuId }: UsePublicMenuOptions): UsePublicMenuReturn {
    const [menu, setMenu] = useState<Menu | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [soldOutDisplay, setSoldOutDisplayState] = useState<"dim" | "hide">("dim");
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [selectedTagKeys, setSelectedTagKeys] = useState<string[]>([]);
    const [tagLabels, setTagLabels] = useState(TAG_LABELS_DEFAULTS);
    const [tagGroups, setTagGroups] = useState<Record<string, "diet" | "spice" | "highlights">>({});
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);

    // Load preferences from localStorage
    useEffect(() => {
        if (typeof window === "undefined") return;

        const stored = localStorage.getItem("menuvium_sold_out_display") as "dim" | "hide" | null;
        if (stored) setSoldOutDisplayState(stored);

        const storedLabels = localStorage.getItem("menuvium_tag_labels");
        if (storedLabels) {
            try {
                const parsed = JSON.parse(storedLabels);
                setTagLabels({ ...TAG_LABELS_DEFAULTS, ...parsed });
            } catch {
                setTagLabels(TAG_LABELS_DEFAULTS);
            }
        }

        const storedGroups = localStorage.getItem("menuvium_tag_groups");
        if (storedGroups) {
            try {
                setTagGroups(JSON.parse(storedGroups));
            } catch {
                setTagGroups({});
            }
        }
    }, []);

    // Fetch menu
    useEffect(() => {
        if (!menuId) return;

        const fetchMenu = async () => {
            try {
                const apiBase = getApiBase();
                const res = await fetch(`${apiBase}/menus/public/${menuId}`);
                if (!res.ok) throw new Error("Menu not found");
                const data = await res.json();
                setMenu(data);
            } catch {
                setError("Could not load menu. Please try again later.");
            } finally {
                setLoading(false);
            }
        };

        fetchMenu();
    }, [menuId]);

    // Persist sold out display preference
    const setSoldOutDisplay = useCallback((value: "dim" | "hide") => {
        setSoldOutDisplayState(value);
        if (typeof window !== "undefined") {
            localStorage.setItem("menuvium_sold_out_display", value);
        }
    }, []);

    // Toggle tag selection
    const toggleTagKey = useCallback((key: string) => {
        setSelectedTagKeys(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    }, []);

    // Filter visibility helper
    const visibleItems = useCallback((items: Item[]) =>
        items.filter(item => !(soldOutDisplay === "hide" && item.is_sold_out)),
        [soldOutDisplay]
    );

    // Light color detection
    const isLightHex = useCallback((hex: string) => {
        const clean = hex.replace("#", "").trim();
        if (clean.length !== 6) return false;
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        return luminance > 0.72;
    }, []);

    // Normalize string for comparison
    const normalize = (value: string) => value.trim().toLowerCase();

    // Build filter options from menu data
    const filterOptions = useMemo((): FilterOptions => {
        if (!menu) {
            return { diet: [], spice: [], highlights: [], allergens: [] };
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
                    if (key && !dietaryById.has(key)) dietaryById.set(key, tag);
                }
                for (const allergen of item.allergens || []) {
                    const key = allergen.id || allergen.name;
                    if (key && !allergenById.has(key)) allergenById.set(key, allergen);
                }
            }
        }

        const groups: Record<"diet" | "spice" | "highlights", DietaryTag[]> = {
            diet: [],
            spice: [],
            highlights: []
        };

        Array.from(dietaryById.values()).forEach(tag => {
            const storedGroup = tag.id ? tagGroups[tag.id] : undefined;
            const nameKey = normalize(tag.name);
            const inferred = dietDefaults.has(nameKey) ? "diet"
                : spiceDefaults.has(nameKey) ? "spice"
                    : "highlights";
            const group = storedGroup ?? inferred;
            groups[group].push(tag);
        });

        Object.keys(groups).forEach(k => {
            const key = k as keyof typeof groups;
            groups[key] = groups[key].sort((a, b) => a.name.localeCompare(b.name));
        });

        const allergens = Array.from(allergenById.values()).sort((a, b) =>
            a.name.localeCompare(b.name)
        );

        return { ...groups, allergens };
    }, [menu, soldOutDisplay, tagGroups]);

    // Check if item matches selected tags
    const itemMatchesSelectedTags = useCallback((item: Item) => {
        if (selectedTagKeys.length === 0) return true;
        const dietaryIds = new Set(
            (item.dietary_tags || []).map(t => `d:${t.id || t.name}`)
        );
        const allergenIds = new Set(
            (item.allergens || []).map(t => `a:${t.id || t.name}`)
        );
        return selectedTagKeys.some(key => dietaryIds.has(key) || allergenIds.has(key));
    }, [selectedTagKeys]);

    // Filter categories based on search and tag selection
    const filteredCategories = useMemo(() => {
        if (!menu) return [];

        return menu.categories
            .map(cat => {
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
            })
            .filter(cat => cat.items.length > 0);
    }, [menu, searchQuery, itemMatchesSelectedTags, visibleItems]);

    return {
        menu,
        loading,
        error,
        searchQuery,
        setSearchQuery,
        selectedTagKeys,
        setSelectedTagKeys,
        toggleTagKey,
        filtersOpen,
        setFiltersOpen,
        filterOptions,
        filteredCategories,
        soldOutDisplay,
        setSoldOutDisplay,
        tagLabels,
        selectedItem,
        setSelectedItem,
        visibleItems,
        isLightHex
    };
}
