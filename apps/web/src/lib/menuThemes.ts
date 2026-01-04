export type MenuThemeId =
    | "noir"
    | "paper"
    | "citrus"
    | "harbor"
    | "saffron"
    | "umami"
    | "mezze"
    | "trattoria"
    | "brasserie"
    | "taqueria"
    | "ramen"
    | "smokehouse"
    | "patisserie"
    | "matcha";

export type MenuTheme = {
    id: MenuThemeId;
    name: string;
    description: string;
    tone: string;
    category: "classic" | "modern" | "playful" | "heritage" | "luxury" | "street" | "coastal" | "cafe";
    cuisines: string[];
    layout: "noir" | "paper" | "citrus" | "harbor";
    palette: {
        bg: string;
        surface: string;
        surfaceAlt: string;
        text: string;
        muted: string;
        border: string;
        accent: string;
    };
    preview: {
        bg: string;
        card: string;
        text: string;
        accent: string;
        border: string;
    };
};

export const MENU_THEMES: MenuTheme[] = [
    {
        id: "noir",
        name: "Noir Night",
        description: "Moody contrast, neon accents, cinematic cards.",
        tone: "Bold, nightlife, premium",
        category: "luxury",
        cuisines: ["cocktails", "steakhouse", "late-night"],
        layout: "noir",
        palette: {
            bg: "#050505",
            surface: "#121212",
            surfaceAlt: "#1A1A1A",
            text: "#F5F5F5",
            muted: "#A3A3A3",
            border: "#1C1C1C",
            accent: "#FF6B35"
        },
        preview: {
            bg: "#050505",
            card: "#121212",
            text: "#F5F5F5",
            accent: "#FF6B35",
            border: "#1C1C1C"
        }
    },
    {
        id: "paper",
        name: "Paper Ledger",
        description: "Editorial layout with soft paper texture and serif headlines.",
        tone: "Classic, café, minimal",
        category: "classic",
        cuisines: ["cafe", "bakery", "brunch"],
        layout: "paper",
        palette: {
            bg: "#F6F1EA",
            surface: "#FFFFFF",
            surfaceAlt: "#F1ECE3",
            text: "#2B2420",
            muted: "#6E6258",
            border: "#E6DED4",
            accent: "#C27D4E"
        },
        preview: {
            bg: "#F6F1EA",
            card: "#FFFFFF",
            text: "#2B2420",
            accent: "#C27D4E",
            border: "#E6DED4"
        }
    },
    {
        id: "citrus",
        name: "Citrus Pop",
        description: "Bright accents, playful blocks, energetic spacing.",
        tone: "Fast casual, vibrant, youthful",
        category: "playful",
        cuisines: ["fast-casual", "street-food", "tacos"],
        layout: "citrus",
        palette: {
            bg: "#FFF6E8",
            surface: "#FFFFFF",
            surfaceAlt: "#FFF1DD",
            text: "#1F1A14",
            muted: "#6F5640",
            border: "#F4D8B8",
            accent: "#FFB703"
        },
        preview: {
            bg: "#FFF6E8",
            card: "#FFFFFF",
            text: "#1F1A14",
            accent: "#FFB703",
            border: "#F4D8B8"
        }
    },
    {
        id: "harbor",
        name: "Harbor Line",
        description: "Cool gradients, airy list layout, understated luxury.",
        tone: "Seafood, modern, calm",
        category: "coastal",
        cuisines: ["seafood", "oysters", "coastal"],
        layout: "harbor",
        palette: {
            bg: "#F1F6F8",
            surface: "#FFFFFF",
            surfaceAlt: "#F7FBFC",
            text: "#1D2B2F",
            muted: "#5A6C72",
            border: "#D6E3E8",
            accent: "#2A9D8F"
        },
        preview: {
            bg: "#F1F6F8",
            card: "#FFFFFF",
            text: "#1D2B2F",
            accent: "#2A9D8F",
            border: "#D6E3E8"
        }
    },
    {
        id: "saffron",
        name: "Saffron Table",
        description: "Warm spice tones, elegant serif, intimate glow.",
        tone: "Indian, heritage, premium",
        category: "heritage",
        cuisines: ["indian", "tandoor", "curry"],
        layout: "paper",
        palette: {
            bg: "#F8F3E8",
            surface: "#FFFFFF",
            surfaceAlt: "#F3E7D4",
            text: "#2B1F16",
            muted: "#7A6150",
            border: "#E8DDCC",
            accent: "#D97706"
        },
        preview: {
            bg: "#F8F3E8",
            card: "#FFFFFF",
            text: "#2B1F16",
            accent: "#D97706",
            border: "#E8DDCC"
        }
    },
    {
        id: "umami",
        name: "Umami Grid",
        description: "Deep inks, minimal lines, refined contrast.",
        tone: "Japanese, modern, quiet",
        category: "modern",
        cuisines: ["japanese", "sushi", "kappo"],
        layout: "noir",
        palette: {
            bg: "#0B0C10",
            surface: "#14161B",
            surfaceAlt: "#1C1F26",
            text: "#F4F3F1",
            muted: "#9CA3AF",
            border: "#232730",
            accent: "#60A5FA"
        },
        preview: {
            bg: "#0B0C10",
            card: "#14161B",
            text: "#F4F3F1",
            accent: "#60A5FA",
            border: "#232730"
        }
    },
    {
        id: "mezze",
        name: "Mezze Grove",
        description: "Olive tones, airy spacing, mezze-friendly layout.",
        tone: "Middle Eastern, shareable, warm",
        category: "heritage",
        cuisines: ["middle-eastern", "mezze", "mediterranean"],
        layout: "paper",
        palette: {
            bg: "#F6F3ED",
            surface: "#FFFFFF",
            surfaceAlt: "#EEF1E6",
            text: "#243022",
            muted: "#65715E",
            border: "#E0E6D8",
            accent: "#84A98C"
        },
        preview: {
            bg: "#F6F3ED",
            card: "#FFFFFF",
            text: "#243022",
            accent: "#84A98C",
            border: "#E0E6D8"
        }
    },
    {
        id: "trattoria",
        name: "Trattoria Linen",
        description: "Soft linen tones, handwritten warmth, classic feel.",
        tone: "Italian, rustic, cozy",
        category: "classic",
        cuisines: ["italian", "pasta", "pizza"],
        layout: "paper",
        palette: {
            bg: "#F5EFE7",
            surface: "#FFFFFF",
            surfaceAlt: "#EFE4D6",
            text: "#2F241D",
            muted: "#6F5E52",
            border: "#E5D7C6",
            accent: "#C65D3B"
        },
        preview: {
            bg: "#F5EFE7",
            card: "#FFFFFF",
            text: "#2F241D",
            accent: "#C65D3B",
            border: "#E5D7C6"
        }
    },
    {
        id: "brasserie",
        name: "Brasserie Bleu",
        description: "Slate blues, fine rules, effortless Parisian calm.",
        tone: "French, refined, modern",
        category: "classic",
        cuisines: ["french", "brasserie", "wine"],
        layout: "harbor",
        palette: {
            bg: "#EEF2F7",
            surface: "#FFFFFF",
            surfaceAlt: "#F6F8FB",
            text: "#1E2A3A",
            muted: "#5D6B7C",
            border: "#D6DEE8",
            accent: "#4C6FFF"
        },
        preview: {
            bg: "#EEF2F7",
            card: "#FFFFFF",
            text: "#1E2A3A",
            accent: "#4C6FFF",
            border: "#D6DEE8"
        }
    },
    {
        id: "taqueria",
        name: "Taqueria Sol",
        description: "Sunset heat, bold badges, street-ready layout.",
        tone: "Mexican, street, energetic",
        category: "street",
        cuisines: ["mexican", "tacos", "street-food"],
        layout: "citrus",
        palette: {
            bg: "#FFF1E6",
            surface: "#FFFFFF",
            surfaceAlt: "#FFE3CC",
            text: "#2A1B12",
            muted: "#7A4C3B",
            border: "#F3D0B5",
            accent: "#F97316"
        },
        preview: {
            bg: "#FFF1E6",
            card: "#FFFFFF",
            text: "#2A1B12",
            accent: "#F97316",
            border: "#F3D0B5"
        }
    },
    {
        id: "ramen",
        name: "Ramen Lane",
        description: "Ink strokes, neon broth notes, punchy spacing.",
        tone: "Noodles, late-night, modern",
        category: "modern",
        cuisines: ["ramen", "noodles", "japanese"],
        layout: "noir",
        palette: {
            bg: "#07090C",
            surface: "#13161C",
            surfaceAlt: "#1C212B",
            text: "#F5F7FA",
            muted: "#9BA3B4",
            border: "#232A36",
            accent: "#22D3EE"
        },
        preview: {
            bg: "#07090C",
            card: "#13161C",
            text: "#F5F7FA",
            accent: "#22D3EE",
            border: "#232A36"
        }
    },
    {
        id: "smokehouse",
        name: "Smokehouse",
        description: "Charcoal base, ember accents, hearty spacing.",
        tone: "BBQ, smoke, bold",
        category: "street",
        cuisines: ["bbq", "grill", "meats"],
        layout: "noir",
        palette: {
            bg: "#0A0A0B",
            surface: "#151515",
            surfaceAlt: "#1E1E1E",
            text: "#F4F2EE",
            muted: "#B0A7A0",
            border: "#262626",
            accent: "#F97316"
        },
        preview: {
            bg: "#0A0A0B",
            card: "#151515",
            text: "#F4F2EE",
            accent: "#F97316",
            border: "#262626"
        }
    },
    {
        id: "patisserie",
        name: "Patisserie Silk",
        description: "Soft blush, delicate lines, dessert-forward calm.",
        tone: "Dessert, cafe, airy",
        category: "cafe",
        cuisines: ["dessert", "bakery", "patisserie"],
        layout: "paper",
        palette: {
            bg: "#FDF6F5",
            surface: "#FFFFFF",
            surfaceAlt: "#F9E8E6",
            text: "#2B1F23",
            muted: "#81656E",
            border: "#F2D9DD",
            accent: "#F472B6"
        },
        preview: {
            bg: "#FDF6F5",
            card: "#FFFFFF",
            text: "#2B1F23",
            accent: "#F472B6",
            border: "#F2D9DD"
        }
    },
    {
        id: "matcha",
        name: "Matcha Mist",
        description: "Herbal greens, quiet space, tea house light.",
        tone: "Tea, wellness, minimal",
        category: "cafe",
        cuisines: ["tea", "matcha", "wellness"],
        layout: "harbor",
        palette: {
            bg: "#F3F8F2",
            surface: "#FFFFFF",
            surfaceAlt: "#EDF4EC",
            text: "#1F2A20",
            muted: "#63706A",
            border: "#D6E3D6",
            accent: "#34D399"
        },
        preview: {
            bg: "#F3F8F2",
            card: "#FFFFFF",
            text: "#1F2A20",
            accent: "#34D399",
            border: "#D6E3D6"
        }
    }
];

export const MENU_THEME_BY_ID = MENU_THEMES.reduce<Record<MenuThemeId, MenuTheme>>(
    (acc, theme) => {
        acc[theme.id] = theme;
        return acc;
    },
    {} as Record<MenuThemeId, MenuTheme>
);
