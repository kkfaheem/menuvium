"use client";

import { useEffect, useMemo, useState } from "react";
import { Monitor, Moon, Plus, Sun, X } from "lucide-react";
import { ALLERGEN_TAGS, DIET_TAGS, HIGHLIGHT_TAGS, SPICE_TAGS, TAG_LABELS_DEFAULTS } from "@/lib/menuTagPresets";
import { getApiBase } from "@/lib/apiBase";
import type { DietaryTag, Allergen } from "@/types";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/components/ui/ToastProvider";
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
    const activeOptionClasses = "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]";
    const activeOptionButtonClasses =
        "border-[var(--cms-accent)] bg-[var(--cms-accent-subtle)] text-[var(--cms-text)] hover:bg-[var(--cms-accent-subtle)]";

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
	                <h1 className="font-heading text-3xl font-bold tracking-tight">Settings</h1>
	                <p className="text-muted">Keep the control surface clean and fast.</p>
	            </header>

            <div className="inline-flex w-fit rounded-xl border border-border bg-panelStrong p-1">
                <button
                    type="button"
                    onClick={() => setActiveTab("general")}
                    className={cn(
                        "h-9 rounded-lg px-4 text-xs font-semibold transition-colors",
                        activeTab === "general" ? activeOptionClasses : "text-muted hover:text-foreground"
                    )}
                >
                    General
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("tags")}
                    className={cn(
                        "h-9 rounded-lg px-4 text-xs font-semibold transition-colors",
                        activeTab === "tags" ? activeOptionClasses : "text-muted hover:text-foreground"
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
                                    variant="outline"
                                    className={theme === "light" ? activeOptionButtonClasses : undefined}
                                    onClick={() => setTheme("light")}
                                >
                                    <Sun className="h-4 w-4" />
                                    Light
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className={theme === "dark" ? activeOptionButtonClasses : undefined}
                                    onClick={() => setTheme("dark")}
                                >
                                    <Moon className="h-4 w-4" />
                                    Dark
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className={theme === "system" ? activeOptionButtonClasses : undefined}
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
                                    variant="outline"
                                    className={soldOutDisplay === "dim" ? activeOptionButtonClasses : undefined}
                                    onClick={() => setSoldOutDisplayAndPersist("dim")}
                                >
                                    Dim items
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className={soldOutDisplay === "hide" ? activeOptionButtonClasses : undefined}
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
	                <div className="grid gap-4 lg:grid-cols-2">
	                    <Card className="h-full">
	                        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
	                            <div>
	                                <CardTitle>Diet</CardTitle>
	                            </div>
	                            <div className="w-full space-y-1 sm:w-[200px]">
	                                <p className="text-xs font-semibold text-muted">Section label</p>
	                                <Input
	                                    value={tagLabels.diet}
                                    onChange={(e) => updateTagLabel("diet", e.target.value)}
                                    className="h-10 rounded-full px-4 text-sm"
                                    aria-label="Diet section label"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {orderByDefaults(groupedTags.diet, DIET_TAGS).map((tag) => (
                                    <span
                                        key={tag.id}
                                        className="inline-flex items-center gap-2 rounded-full border border-border bg-pill px-3 py-1.5 text-xs font-semibold"
                                    >
                                        {tag.name}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteTag(tag.id)}
                                            className="rounded-full p-0.5 text-muted hover:bg-panelStrong hover:text-foreground"
                                            aria-label={`Delete ${tag.name}`}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
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
                                    className="h-10 rounded-full px-4"
                                />
                                <Button
                                    size="sm"
                                    loading={savingTag}
                                    disabled={!newDietTag.trim()}
                                    className="h-10 rounded-full px-5 text-xs"
                                    onClick={() => {
                                        addDietaryTag("diet", newDietTag);
                                        setNewDietTag("");
                                    }}
                                >
                                    <Plus className="h-3 w-3" />
                                    Add
                                </Button>
                            </div>
                            {savingTag ? <p className="text-xs text-muted">Saving…</p> : null}
                        </CardContent>
                    </Card>

	                    <Card className="h-full">
	                        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
	                            <div>
	                                <CardTitle>Spice level</CardTitle>
	                            </div>
	                            <div className="w-full space-y-1 sm:w-[200px]">
	                                <p className="text-xs font-semibold text-muted">Section label</p>
	                                <Input
	                                    value={tagLabels.spice}
                                    onChange={(e) => updateTagLabel("spice", e.target.value)}
                                    className="h-10 rounded-full px-4 text-sm"
                                    aria-label="Spice section label"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {orderByDefaults(groupedTags.spice, SPICE_TAGS).map((tag) => (
                                    <span
                                        key={tag.id}
                                        className="inline-flex items-center gap-2 rounded-full border border-border bg-pill px-3 py-1.5 text-xs font-semibold"
                                    >
                                        {tag.name}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteTag(tag.id)}
                                            className="rounded-full p-0.5 text-muted hover:bg-panelStrong hover:text-foreground"
                                            aria-label={`Delete ${tag.name}`}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
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
                                    className="h-10 rounded-full px-4"
                                />
                                <Button
                                    size="sm"
                                    loading={savingTag}
                                    disabled={!newSpiceTag.trim()}
                                    className="h-10 rounded-full px-5 text-xs"
                                    onClick={() => {
                                        addDietaryTag("spice", newSpiceTag);
                                        setNewSpiceTag("");
                                    }}
                                >
                                    <Plus className="h-3 w-3" />
                                    Add
                                </Button>
                            </div>
                            {savingTag ? <p className="text-xs text-muted">Saving…</p> : null}
                        </CardContent>
                    </Card>

	                    <Card className="h-full">
	                        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
	                            <div>
	                                <CardTitle>Highlights</CardTitle>
	                            </div>
	                            <div className="w-full space-y-1 sm:w-[200px]">
	                                <p className="text-xs font-semibold text-muted">Section label</p>
	                                <Input
	                                    value={tagLabels.highlights}
                                    onChange={(e) => updateTagLabel("highlights", e.target.value)}
                                    className="h-10 rounded-full px-4 text-sm"
                                    aria-label="Highlights section label"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {orderByDefaults(groupedTags.highlights, HIGHLIGHT_TAGS).map((tag) => (
                                    <span
                                        key={tag.id}
                                        className="inline-flex items-center gap-2 rounded-full border border-border bg-pill px-3 py-1.5 text-xs font-semibold"
                                    >
                                        {tag.name}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteTag(tag.id)}
                                            className="rounded-full p-0.5 text-muted hover:bg-panelStrong hover:text-foreground"
                                            aria-label={`Delete ${tag.name}`}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                                <Input
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
                                    className="h-10 rounded-full px-4"
                                />
                                <Button
                                    size="sm"
                                    loading={savingTag}
                                    disabled={!newHighlightTag.trim()}
                                    className="h-10 rounded-full px-5 text-xs"
                                    onClick={() => {
                                        addDietaryTag("highlights", newHighlightTag);
                                        setNewHighlightTag("");
                                    }}
                                >
                                    <Plus className="h-3 w-3" />
                                    Add
                                </Button>
                            </div>
                            {savingTag ? <p className="text-xs text-muted">Saving…</p> : null}
                        </CardContent>
                    </Card>

	                    <Card className="h-full">
	                        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
	                            <div>
	                                <CardTitle>Allergens</CardTitle>
	                            </div>
	                            <div className="w-full space-y-1 sm:w-[200px]">
	                                <p className="text-xs font-semibold text-muted">Section label</p>
	                                <Input
	                                    value={tagLabels.allergens}
                                    onChange={(e) => updateTagLabel("allergens", e.target.value)}
                                    className="h-10 rounded-full px-4 text-sm"
                                    aria-label="Allergens section label"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {orderAllergens(allergens, ALLERGEN_TAGS).map((allergen) => (
                                    <span
                                        key={allergen.id}
                                        className="inline-flex items-center gap-2 rounded-full border border-border bg-pill px-3 py-1.5 text-xs font-semibold"
                                    >
                                        {allergen.name}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteAllergen(allergen.id)}
                                            className="rounded-full p-0.5 text-muted hover:bg-panelStrong hover:text-foreground"
                                            aria-label={`Delete ${allergen.name}`}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                                <Input
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
                                    className="h-10 rounded-full px-4"
                                />
                                <Button
                                    size="sm"
                                    loading={savingAllergen}
                                    disabled={!newAllergenTag.trim()}
                                    className="h-10 rounded-full px-5 text-xs"
                                    onClick={() => {
                                        addAllergen(newAllergenTag);
                                        setNewAllergenTag("");
                                    }}
                                >
                                    <Plus className="h-3 w-3" />
                                    Add
                                </Button>
                            </div>
                            {savingAllergen ? <p className="text-xs text-muted">Saving…</p> : null}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
