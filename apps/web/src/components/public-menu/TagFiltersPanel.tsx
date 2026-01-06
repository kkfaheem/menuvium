"use client";

import type { DietaryTag, Allergen } from "@/types";
import type { MenuTheme } from "@/lib/menuThemes";
import type { TAG_LABELS_DEFAULTS } from "@/lib/menuTagPresets";

interface TagFiltersPanelProps {
    isOpen: boolean;
    palette: MenuTheme["palette"];
    filterOptions: {
        diet: DietaryTag[];
        spice: DietaryTag[];
        highlights: DietaryTag[];
        allergens: Allergen[];
    };
    selectedTagKeys: string[];
    toggleTagKey: (key: string) => void;
    clearFilters: () => void;
    tagLabels: typeof TAG_LABELS_DEFAULTS;
    isLightAccent: boolean;
}

export function TagFiltersPanel({
    isOpen,
    palette,
    filterOptions,
    selectedTagKeys,
    toggleTagKey,
    clearFilters,
    tagLabels,
    isLightAccent
}: TagFiltersPanelProps) {
    if (!isOpen) return null;

    const hasAnyFilters =
        filterOptions.diet.length > 0 ||
        filterOptions.spice.length > 0 ||
        filterOptions.highlights.length > 0 ||
        filterOptions.allergens.length > 0;

    const filterAccentText = isLightAccent ? palette.text : "#FFFFFF";

    const renderTagGroup = (
        tags: DietaryTag[],
        prefix: string,
        label: string,
        marginTop: boolean
    ) => {
        if (tags.length === 0) return null;

        return (
            <div className={marginTop ? "mt-4" : ""}>
                <div
                    className="px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.22em]"
                    style={{ color: palette.muted }}
                >
                    {label}
                </div>
                <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => {
                        const key = `${prefix}:${tag.id || tag.name}`;
                        const selected = selectedTagKeys.includes(key);
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => toggleTagKey(key)}
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
        );
    };

    return (
        <div
            className="mt-3 rounded-3xl border p-3"
            style={{ borderColor: palette.border, backgroundColor: palette.surface }}
        >
            {/* Header */}
            <div className="mb-3 flex items-center justify-between px-1">
                <div
                    className="text-[10px] font-bold uppercase tracking-[0.22em]"
                    style={{ color: palette.muted }}
                >
                    Filters
                </div>
                {selectedTagKeys.length > 0 && (
                    <button
                        type="button"
                        onClick={clearFilters}
                        className="text-xs font-semibold underline underline-offset-4 transition-colors"
                        style={{ color: palette.muted }}
                    >
                        Clear
                    </button>
                )}
            </div>

            {/* Content */}
            {!hasAnyFilters ? (
                <div className="p-2 text-sm" style={{ color: palette.muted }}>
                    Add dietary/allergen tags to items to enable filtering.
                </div>
            ) : (
                <>
                    {renderTagGroup(filterOptions.diet, "d", tagLabels.diet, false)}
                    {renderTagGroup(filterOptions.spice, "d", tagLabels.spice, filterOptions.diet.length > 0)}
                    {renderTagGroup(
                        filterOptions.highlights,
                        "d",
                        tagLabels.highlights,
                        filterOptions.diet.length > 0 || filterOptions.spice.length > 0
                    )}
                    {renderTagGroup(
                        filterOptions.allergens as unknown as DietaryTag[],
                        "a",
                        tagLabels.allergens ?? "Allergens",
                        filterOptions.diet.length > 0 ||
                        filterOptions.spice.length > 0 ||
                        filterOptions.highlights.length > 0
                    )}
                </>
            )}
        </div>
    );
}
