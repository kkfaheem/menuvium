"use client";

import { useEffect, useMemo, useState } from "react";
import { Monitor, Moon, Plus, Sun, X } from "lucide-react";
import { ALLERGEN_TAGS, DIET_TAGS, HIGHLIGHT_TAGS, SPICE_TAGS, TAG_LABELS_DEFAULTS } from "@/lib/menuTagPresets";
import { getApiBase } from "@/lib/apiBase";
import type { DietaryTag, Allergen } from "@/types";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

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
            <header className="space-y-2">
                <Badge variant="outline">Settings</Badge>
                <div>
                    <h1 className="font-heading text-3xl font-bold tracking-tight">Settings</h1>
                    <p className="text-muted">Keep the control surface clean and fast.</p>
                </div>
            </header>

            <div className="inline-flex w-fit rounded-xl border border-border bg-panelStrong p-1">
                <button
                    type="button"
                    onClick={() => setActiveTab("general")}
                    className={cn(
                        "h-9 rounded-lg px-4 text-xs font-semibold transition-colors",
                        activeTab === "general" ? "bg-panel text-foreground shadow-sm" : "text-muted hover:text-foreground"
                    )}
                >
                    General
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("tags")}
                    className={cn(
                        "h-9 rounded-lg px-4 text-xs font-semibold transition-colors",
                        activeTab === "tags" ? "bg-panel text-foreground shadow-sm" : "text-muted hover:text-foreground"
                    )}
                >
                    Tags
                </button>
            </div>

            {activeTab === "general" && (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle>Appearance</CardTitle>
                            <CardDescription>Choose a theme for the dashboard.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant={theme === "light" ? "secondary" : "outline"}
                                    onClick={() => setTheme("light")}
                                >
                                    <Sun className="h-4 w-4" />
                                    Light
                                </Button>
                                <Button
                                    type="button"
                                    variant={theme === "dark" ? "secondary" : "outline"}
                                    onClick={() => setTheme("dark")}
                                >
                                    <Moon className="h-4 w-4" />
                                    Dark
                                </Button>
                                <Button
                                    type="button"
                                    variant={theme === "system" ? "secondary" : "outline"}
                                    onClick={() => setTheme("system")}
                                >
                                    <Monitor className="h-4 w-4" />
                                    System
                                </Button>
                            </div>
                            <p className="text-xs text-muted">
                                Active: <span className="font-semibold text-foreground">{resolvedTheme}</span>
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Sold-out items</CardTitle>
                            <CardDescription>Choose how sold-out items appear on menus.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant={soldOutDisplay === "dim" ? "secondary" : "outline"}
                                    onClick={() => setSoldOutDisplayAndPersist("dim")}
                                >
                                    Dim items
                                </Button>
                                <Button
                                    type="button"
                                    variant={soldOutDisplay === "hide" ? "secondary" : "outline"}
                                    onClick={() => setSoldOutDisplayAndPersist("hide")}
                                >
                                    Hide items
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                </>
            )}

            {activeTab === "tags" && (
                <>
                    <Card>
                        <CardHeader className="flex flex-row items-start justify-between gap-4">
                            <div>
                                <CardTitle>{tagLabels.diet}</CardTitle>
                                <CardDescription>Dietary markers shown on items.</CardDescription>
                            </div>
                            <Input
                                value={tagLabels.diet}
                                onChange={(e) => updateTagLabel("diet", e.target.value)}
                                className="h-9 w-[160px] rounded-full px-3 text-xs"
                                aria-label="Diet category name"
                            />
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {orderByDefaults(groupedTags.diet, DIET_TAGS).map((tag) => (
                                    <span
                                        key={tag.id}
                                        className="inline-flex items-center gap-2 rounded-full bg-pill px-3 py-1.5 text-xs font-semibold"
                                    >
                                        {tag.name}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteTag(tag.id)}
                                            className="text-muted hover:text-foreground"
                                            aria-label={`Delete ${tag.name}`}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <Input
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
                                    className="h-9 min-w-[180px] flex-1 rounded-full px-4"
                                />
                                <Button
                                    size="sm"
                                    loading={savingTag}
                                    disabled={!newDietTag.trim()}
                                    className="h-9 rounded-full px-4 text-xs"
                                    onClick={() => {
                                        addDietaryTag("diet", newDietTag);
                                        setNewDietTag("");
                                    }}
                                >
                                    <Plus className="h-3 w-3" />
                                    Add
                                </Button>
                            </div>
                            {savingTag ? <p className="text-xs text-muted">Syncing defaults...</p> : null}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-start justify-between gap-4">
                            <div>
                                <CardTitle>{tagLabels.spice}</CardTitle>
                                <CardDescription>Quick heat indicators for items.</CardDescription>
                            </div>
                            <Input
                                value={tagLabels.spice}
                                onChange={(e) => updateTagLabel("spice", e.target.value)}
                                className="h-9 w-[160px] rounded-full px-3 text-xs"
                                aria-label="Spice category name"
                            />
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {orderByDefaults(groupedTags.spice, SPICE_TAGS).map((tag) => (
                                    <span
                                        key={tag.id}
                                        className="inline-flex items-center gap-2 rounded-full bg-pill px-3 py-1.5 text-xs font-semibold"
                                    >
                                        {tag.name}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteTag(tag.id)}
                                            className="text-muted hover:text-foreground"
                                            aria-label={`Delete ${tag.name}`}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <Input
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
                                    className="h-9 min-w-[180px] flex-1 rounded-full px-4"
                                />
                                <Button
                                    size="sm"
                                    loading={savingTag}
                                    disabled={!newSpiceTag.trim()}
                                    className="h-9 rounded-full px-4 text-xs"
                                    onClick={() => {
                                        addDietaryTag("spice", newSpiceTag);
                                        setNewSpiceTag("");
                                    }}
                                >
                                    <Plus className="h-3 w-3" />
                                    Add
                                </Button>
                            </div>
                            {savingTag ? <p className="text-xs text-muted">Syncing defaults...</p> : null}
                        </CardContent>
                    </Card>

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
