import type { Category, Item, DietaryTag, Allergen, Menu } from "@/types";
import type { TAG_LABELS_DEFAULTS } from "@/lib/menuTagPresets";
import type { MenuTheme } from "@/lib/menuThemes";

/**
 * Props shared across all public menu layout components
 */
export interface PublicMenuLayoutProps {
    menu: Menu;
    palette: MenuTheme["palette"];
    filteredCategories: Category[];
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    filtersOpen: boolean;
    setFiltersOpen: (open: boolean) => void;
    selectedItem: Item | null;
    setSelectedItem: (item: Item | null) => void;
    renderTagFiltersPanel: () => React.ReactNode;
    renderBanner: () => React.ReactNode;
    renderTagFiltersToggle: () => React.ReactNode;
}

/**
 * Props for the TagFiltersPanel component
 */
export interface TagFiltersPanelProps {
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
    tagLabels: typeof TAG_LABELS_DEFAULTS;
    soldOutDisplay: "dim" | "hide";
    setSoldOutDisplay: (value: "dim" | "hide") => void;
}

/**
 * Props for individual menu item cards
 */
export interface MenuItemCardProps {
    item: Item;
    palette: MenuTheme["palette"];
    soldOutDisplay: "dim" | "hide";
    onClick: () => void;
}
