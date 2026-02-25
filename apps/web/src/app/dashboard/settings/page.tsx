"use client";

import { useEffect, useMemo, useState } from "react";
import { Monitor, Moon, Plus, Sun, X } from "lucide-react";
import { ALLERGEN_TAGS, DIET_TAGS, HIGHLIGHT_TAGS, SPICE_TAGS, TAG_LABELS_DEFAULTS } from "@/lib/menuTagPresets";
import { getApiBase } from "@/lib/apiBase";
import type { DietaryTag, Allergen } from "@/types";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/components/ui/ToastProvider";

type TagLabels = {
    diet: string;
    spice: string;
    highlights: string;
    allergens: string;
};

type SoldOutDisplay = "dim" | "hide";

export default function SettingsPage() {
    const apiBase = getApiBase();
    const { theme, resolvedTheme, setTheme } = useTheme();
    const { toast } = useToast();
    const [soldOutDisplay, setSoldOutDisplay] = useState<SoldOutDisplay>("dim");
    const [tags, setTags] = useState<DietaryTag[]>([]);
    const [allergens, setAllergens] = useState<Allergen[]>([]);
    const [savingTag, setSavingTag] = useState(false);
    const [savingAllergen, setSavingAllergen] = useState(false);
    const [activeTab, setActiveTab] = useState<"general" | "tags">("general");
    const [tagLabels, setTagLabels] = useState<TagLabels>(TAG_LABELS_DEFAULTS);
    const [tagGroups, setTagGroups] = useState<Record<string, "diet" | "spice" | "highlights">>({});
    const [newDietTag, setNewDietTag] = useState("");
    const [newSpiceTag, setNewSpiceTag] = useState("");
    const [newHighlightTag, setNewHighlightTag] = useState("");
    const [newAllergenTag, setNewAllergenTag] = useState("");

    const normalize = (value: string) => value.trim().toLowerCase();
    const normalizeKey = (value: string) => value.trim();

    useEffect(() => {
        if (typeof window !== "undefined") {
            const savedSoldOut = (localStorage.getItem("menuvium_sold_out_display") as SoldOutDisplay) || "dim";
            setSoldOutDisplay(savedSoldOut);
            const storedLabels = localStorage.getItem("menuvium_tag_labels");
            if (storedLabels) {
                try {
                    const parsed = JSON.parse(storedLabels) as Partial<TagLabels>;
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
        }
        fetchDietaryTags();
        fetchAllergens();
    }, []);

    const createDietaryTag = async (name: string) => {
        const res = await fetch(`${apiBase}/metadata/dietary-tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Failed to add tag");
        }
        return res.json();
    };

    const createAllergen = async (name: string) => {
        const res = await fetch(`${apiBase}/metadata/allergens`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Failed to add allergen");
        }
        return res.json();
    };

    const fetchDietaryTags = async () => {
        try {
            const res = await fetch(`${apiBase}/metadata/dietary-tags`);
            if (res.ok) {
                const data = await res.json();
                setTags(data);
                await ensureDietaryDefaults(data);
                ensureTagGroups(data);
            }
        } catch (e) {
            console.error("Failed to fetch tags", e);
        }
    };

    const fetchAllergens = async () => {
        try {
            const res = await fetch(`${apiBase}/metadata/allergens`);
            if (res.ok) {
                const data = await res.json();
                setAllergens(data);
                await ensureAllergenDefaults(data);
            }
        } catch (e) {
            console.error("Failed to fetch allergens", e);
        }
    };

    const setSoldOutDisplayAndPersist = (next: SoldOutDisplay) => {
        setSoldOutDisplay(next);
        if (typeof window !== "undefined") {
            localStorage.setItem("menuvium_sold_out_display", next);
        }
    };

    const updateTagLabel = (key: keyof TagLabels, value: string) => {
        const next = { ...tagLabels, [key]: value };
        setTagLabels(next);
        if (typeof window !== "undefined") {
            localStorage.setItem("menuvium_tag_labels", JSON.stringify(next));
        }
    };

    const persistTagGroups = (next: Record<string, "diet" | "spice" | "highlights">) => {
        setTagGroups(next);
        if (typeof window !== "undefined") {
            localStorage.setItem("menuvium_tag_groups", JSON.stringify(next));
        }
    };

    const ensureDietaryDefaults = async (existing: DietaryTag[]) => {
        const existingNames = new Set(existing.map((tag) => normalize(tag.name)));
        const missing = [...DIET_TAGS, ...SPICE_TAGS, ...HIGHLIGHT_TAGS].filter(
            (name) => !existingNames.has(normalize(name))
        );
        if (!missing.length) return;
        setSavingTag(true);
        try {
            await Promise.all(missing.map((name) => createDietaryTag(name)));
            fetchDietaryTags();
        } catch (e: any) {
            console.error(e);
        } finally {
            setSavingTag(false);
        }
    };

    const ensureTagGroups = (existing: DietaryTag[]) => {
        const next = { ...tagGroups };
        const defaults = new Map<string, "diet" | "spice" | "highlights">();
        DIET_TAGS.forEach((name) => defaults.set(normalize(name), "diet"));
        SPICE_TAGS.forEach((name) => defaults.set(normalize(name), "spice"));
        HIGHLIGHT_TAGS.forEach((name) => defaults.set(normalize(name), "highlights"));
        let changed = false;

        existing.forEach((tag) => {
            if (next[tag.id]) return;
            const group = defaults.get(normalize(tag.name)) ?? "highlights";
            next[tag.id] = group;
            changed = true;
        });

        if (changed) {
            persistTagGroups(next);
        }
    };

    const ensureAllergenDefaults = async (existing: Allergen[]) => {
        const existingNames = new Set(existing.map((tag) => normalize(tag.name)));
        const missing = ALLERGEN_TAGS.filter((name) => !existingNames.has(normalize(name)));
        if (!missing.length) return;
        setSavingAllergen(true);
        try {
            await Promise.all(missing.map((name) => createAllergen(name)));
            fetchAllergens();
        } catch (e: any) {
            console.error(e);
        } finally {
            setSavingAllergen(false);
        }
    };

    const handleDeleteTag = async (id: string) => {
        try {
            const res = await fetch(`${apiBase}/metadata/dietary-tags/${id}`, {
                method: "DELETE"
            });
            if (res.ok) {
                const next = { ...tagGroups };
                delete next[id];
                persistTagGroups(next);
                fetchDietaryTags();
            } else {
                const err = await res.json();
                toast({
                    variant: "error",
                    title: "Failed to delete tag",
                    description: err.detail || "Please try again.",
                });
            }
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to delete tag",
                description: "Please try again in a moment.",
            });
        }
    };

    const handleDeleteAllergen = async (id: string) => {
        try {
            const res = await fetch(`${apiBase}/metadata/allergens/${id}`, {
                method: "DELETE"
            });
            if (res.ok) {
                fetchAllergens();
            } else {
                const err = await res.json();
                toast({
                    variant: "error",
                    title: "Failed to delete allergen",
                    description: err.detail || "Please try again.",
                });
            }
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to delete allergen",
                description: "Please try again in a moment.",
            });
        }
    };

    const addDietaryTag = async (group: "diet" | "spice" | "highlights", name: string) => {
        const trimmed = normalizeKey(name);
        if (!trimmed) return;
        setSavingTag(true);
        try {
            const created = await createDietaryTag(trimmed);
            if (created?.id) {
                persistTagGroups({ ...tagGroups, [created.id]: group });
            }
            fetchDietaryTags();
        } catch (e: any) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to add tag",
                description: e?.message || "Please try again.",
            });
        } finally {
            setSavingTag(false);
        }
    };

    const addAllergen = async (name: string) => {
        const trimmed = normalizeKey(name);
        if (!trimmed) return;
        setSavingAllergen(true);
        try {
            await createAllergen(trimmed);
            fetchAllergens();
        } catch (e: any) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to add allergen",
                description: e?.message || "Please try again.",
            });
        } finally {
            setSavingAllergen(false);
        }
    };

    const groupedTags = useMemo(
        () => ({
            diet: tags.filter((tag) => tagGroups[tag.id] === "diet"),
            spice: tags.filter((tag) => tagGroups[tag.id] === "spice"),
            highlights: tags.filter((tag) => tagGroups[tag.id] === "highlights")
        }),
        [tags, tagGroups]
    );
    const orderByDefaults = (list: DietaryTag[], defaults: string[]) => {
        const order = new Map(defaults.map((name, index) => [normalize(name), index]));
        return [...list].sort((a, b) => {
            const aRank = order.get(normalize(a.name));
            const bRank = order.get(normalize(b.name));
            if (aRank !== undefined || bRank !== undefined) {
                return (aRank ?? Number.MAX_SAFE_INTEGER) - (bRank ?? Number.MAX_SAFE_INTEGER);
            }
            return a.name.localeCompare(b.name);
        });
    };
    const orderAllergens = (list: Allergen[], defaults: string[]) => {
        const order = new Map(defaults.map((name, index) => [normalize(name), index]));
        return [...list].sort((a, b) => {
            const aRank = order.get(normalize(a.name));
            const bRank = order.get(normalize(b.name));
            if (aRank !== undefined || bRank !== undefined) {
                return (aRank ?? Number.MAX_SAFE_INTEGER) - (bRank ?? Number.MAX_SAFE_INTEGER);
            }
            return a.name.localeCompare(b.name);
        });
    };


    return (
        <div className="max-w-4xl space-y-8">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                    <p className="text-[var(--cms-muted)]">Keep the control surface clean and fast.</p>
                </div>
            </header>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    onClick={() => setActiveTab("general")}
                    className={`h-9 px-4 rounded-full text-xs font-semibold border transition-colors ${activeTab === "general" ? "bg-[var(--cms-text)] text-[var(--cms-bg)] border-[var(--cms-text)]" : "border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)]"}`}
                >
                    General
                </button>
                <button
                    onClick={() => setActiveTab("tags")}
                    className={`h-9 px-4 rounded-full text-xs font-semibold border transition-colors ${activeTab === "tags" ? "bg-[var(--cms-text)] text-[var(--cms-bg)] border-[var(--cms-text)]" : "border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)]"}`}
                >
                    Tags
                </button>
            </div>

            {activeTab === "general" && (
                <>
                    <section className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-2xl p-6">
                        <h2 className="text-lg font-bold mb-1">Appearance</h2>
                        <p className="text-sm text-[var(--cms-muted)] mb-4">
                            Choose a theme for the dashboard.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setTheme("light")}
                                className={`h-10 px-4 rounded-xl text-sm font-bold transition-colors border inline-flex items-center gap-2 ${theme === "light"
                                    ? "bg-[var(--cms-pill)] border-[var(--cms-border)]"
                                    : "bg-transparent border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
                                    }`}
                            >
                                <Sun className="h-4 w-4" />
                                Light
                            </button>
                            <button
                                type="button"
                                onClick={() => setTheme("dark")}
                                className={`h-10 px-4 rounded-xl text-sm font-bold transition-colors border inline-flex items-center gap-2 ${theme === "dark"
                                    ? "bg-[var(--cms-pill)] border-[var(--cms-border)]"
                                    : "bg-transparent border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
                                    }`}
                            >
                                <Moon className="h-4 w-4" />
                                Dark
                            </button>
                            <button
                                type="button"
                                onClick={() => setTheme("system")}
                                className={`h-10 px-4 rounded-xl text-sm font-bold transition-colors border inline-flex items-center gap-2 ${theme === "system"
                                    ? "bg-[var(--cms-pill)] border-[var(--cms-border)]"
                                    : "bg-transparent border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
                                    }`}
                            >
                                <Monitor className="h-4 w-4" />
                                System
                            </button>
                        </div>
                        <p className="mt-3 text-xs text-[var(--cms-muted)]">
                            Active: <span className="font-semibold text-[var(--cms-text)]">{resolvedTheme}</span>
                        </p>
                    </section>

                    <section className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-2xl p-6">
                        <h2 className="text-lg font-bold mb-1">Sold-out items</h2>
                        <p className="text-sm text-[var(--cms-muted)] mb-4">Choose how sold-out items appear on menus.</p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSoldOutDisplayAndPersist("dim")}
                                className={`h-10 px-4 rounded-xl text-sm font-bold transition-colors border ${soldOutDisplay === "dim" ? "bg-[var(--cms-pill)] border-[var(--cms-border)]" : "bg-transparent border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)]"}`}
                            >
                                Dim items
                            </button>
                            <button
                                onClick={() => setSoldOutDisplayAndPersist("hide")}
                                className={`h-10 px-4 rounded-xl text-sm font-bold transition-colors border ${soldOutDisplay === "hide" ? "bg-[var(--cms-pill)] border-[var(--cms-border)]" : "bg-transparent border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)]"}`}
                            >
                                Hide items
                            </button>
                        </div>
                    </section>

                </>
            )}

            {activeTab === "tags" && (
                <>
                    <section className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-2xl p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold mb-1">{tagLabels.diet}</h2>
                                <p className="text-sm text-[var(--cms-muted)] mb-4">Dietary markers shown on items.</p>
                            </div>
                            <input
                                value={tagLabels.diet}
                                onChange={(e) => updateTagLabel("diet", e.target.value)}
                                className="h-9 px-3 text-xs rounded-full bg-transparent border border-[var(--cms-border)] text-[var(--cms-muted)] focus:outline-none focus:border-[var(--cms-text)]"
                                aria-label="Diet category name"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {orderByDefaults(groupedTags.diet, DIET_TAGS).map((tag) => (
                                <span key={tag.id} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--cms-pill)] inline-flex items-center gap-2">
                                    {tag.name}
                                    <button
                                        onClick={() => handleDeleteTag(tag.id)}
                                        className="text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
                                        aria-label={`Delete ${tag.name}`}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3 items-center">
                            <input
                                value={newDietTag}
                                onChange={(e) => setNewDietTag(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        addDietaryTag("diet", newDietTag);
                                        setNewDietTag("");
                                    }
                                }}
                                placeholder="Add a diet tag"
                                className="flex-1 min-w-[180px] h-9 bg-transparent border border-[var(--cms-border)] rounded-full px-4 text-sm focus:outline-none focus:border-[var(--cms-text)]"
                            />
                            <button
                                onClick={() => {
                                    addDietaryTag("diet", newDietTag);
                                    setNewDietTag("");
                                }}
                                disabled={savingTag || !newDietTag.trim()}
                                className="h-9 px-4 rounded-full font-semibold text-xs inline-flex items-center gap-2 bg-[var(--cms-text)] text-[var(--cms-bg)] disabled:opacity-50"
                            >
                                <Plus className="w-3 h-3" />
                                Add
                            </button>
                        </div>
                        {savingTag && <p className="text-xs text-[var(--cms-muted)] mt-3">Syncing defaults...</p>}
                    </section>

                    <section className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-2xl p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold mb-1">{tagLabels.spice}</h2>
                                <p className="text-sm text-[var(--cms-muted)] mb-4">Quick heat indicators for items.</p>
                            </div>
                            <input
                                value={tagLabels.spice}
                                onChange={(e) => updateTagLabel("spice", e.target.value)}
                                className="h-9 px-3 text-xs rounded-full bg-transparent border border-[var(--cms-border)] text-[var(--cms-muted)] focus:outline-none focus:border-[var(--cms-text)]"
                                aria-label="Spice category name"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {orderByDefaults(groupedTags.spice, SPICE_TAGS).map((tag) => (
                                <span key={tag.id} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--cms-pill)] inline-flex items-center gap-2">
                                    {tag.name}
                                    <button
                                        onClick={() => handleDeleteTag(tag.id)}
                                        className="text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
                                        aria-label={`Delete ${tag.name}`}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3 items-center">
                            <input
                                value={newSpiceTag}
                                onChange={(e) => setNewSpiceTag(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        addDietaryTag("spice", newSpiceTag);
                                        setNewSpiceTag("");
                                    }
                                }}
                                placeholder="Add a spice tag"
                                className="flex-1 min-w-[180px] h-9 bg-transparent border border-[var(--cms-border)] rounded-full px-4 text-sm focus:outline-none focus:border-[var(--cms-text)]"
                            />
                            <button
                                onClick={() => {
                                    addDietaryTag("spice", newSpiceTag);
                                    setNewSpiceTag("");
                                }}
                                disabled={savingTag || !newSpiceTag.trim()}
                                className="h-9 px-4 rounded-full font-semibold text-xs inline-flex items-center gap-2 bg-[var(--cms-text)] text-[var(--cms-bg)] disabled:opacity-50"
                            >
                                <Plus className="w-3 h-3" />
                                Add
                            </button>
                        </div>
                    </section>

                    <section className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-2xl p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold mb-1">{tagLabels.highlights}</h2>
                                <p className="text-sm text-[var(--cms-muted)] mb-4">Callouts that help guests decide.</p>
                            </div>
                            <input
                                value={tagLabels.highlights}
                                onChange={(e) => updateTagLabel("highlights", e.target.value)}
                                className="h-9 px-3 text-xs rounded-full bg-transparent border border-[var(--cms-border)] text-[var(--cms-muted)] focus:outline-none focus:border-[var(--cms-text)]"
                                aria-label="Highlights category name"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {orderByDefaults(groupedTags.highlights, HIGHLIGHT_TAGS).map((tag) => (
                                <span key={tag.id} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--cms-pill)] inline-flex items-center gap-2">
                                    {tag.name}
                                    <button
                                        onClick={() => handleDeleteTag(tag.id)}
                                        className="text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
                                        aria-label={`Delete ${tag.name}`}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3 items-center">
                            <input
                                value={newHighlightTag}
                                onChange={(e) => setNewHighlightTag(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        addDietaryTag("highlights", newHighlightTag);
                                        setNewHighlightTag("");
                                    }
                                }}
                                placeholder="Add a highlight tag"
                                className="flex-1 min-w-[180px] h-9 bg-transparent border border-[var(--cms-border)] rounded-full px-4 text-sm focus:outline-none focus:border-[var(--cms-text)]"
                            />
                            <button
                                onClick={() => {
                                    addDietaryTag("highlights", newHighlightTag);
                                    setNewHighlightTag("");
                                }}
                                disabled={savingTag || !newHighlightTag.trim()}
                                className="h-9 px-4 rounded-full font-semibold text-xs inline-flex items-center gap-2 bg-[var(--cms-text)] text-[var(--cms-bg)] disabled:opacity-50"
                            >
                                <Plus className="w-3 h-3" />
                                Add
                            </button>
                        </div>
                    </section>

                    <section className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-2xl p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold mb-1">{tagLabels.allergens}</h2>
                                <p className="text-sm text-[var(--cms-muted)] mb-4">Manage allergen warnings for menus.</p>
                            </div>
                            <input
                                value={tagLabels.allergens}
                                onChange={(e) => updateTagLabel("allergens", e.target.value)}
                                className="h-9 px-3 text-xs rounded-full bg-transparent border border-[var(--cms-border)] text-[var(--cms-muted)] focus:outline-none focus:border-[var(--cms-text)]"
                                aria-label="Allergens category name"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {orderAllergens(allergens, ALLERGEN_TAGS).map((allergen) => (
                                <span key={allergen.id} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--cms-pill)] inline-flex items-center gap-2">
                                    {allergen.name}
                                    <button
                                        onClick={() => handleDeleteAllergen(allergen.id)}
                                        className="text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
                                        aria-label={`Delete ${allergen.name}`}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3 items-center">
                            <input
                                value={newAllergenTag}
                                onChange={(e) => setNewAllergenTag(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        addAllergen(newAllergenTag);
                                        setNewAllergenTag("");
                                    }
                                }}
                                placeholder="Add an allergen"
                                className="flex-1 min-w-[180px] h-9 bg-transparent border border-[var(--cms-border)] rounded-full px-4 text-sm focus:outline-none focus:border-[var(--cms-text)]"
                            />
                            <button
                                onClick={() => {
                                    addAllergen(newAllergenTag);
                                    setNewAllergenTag("");
                                }}
                                disabled={savingAllergen || !newAllergenTag.trim()}
                                className="h-9 px-4 rounded-full font-semibold text-xs inline-flex items-center gap-2 bg-[var(--cms-text)] text-[var(--cms-bg)] disabled:opacity-50"
                            >
                                <Plus className="w-3 h-3" />
                                Add
                            </button>
                        </div>
                        {savingAllergen && <p className="text-xs text-[var(--cms-muted)] mt-3">Syncing defaults...</p>}
                    </section>
                </>
            )}
        </div>
    );
}
