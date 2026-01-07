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
    | "matcha"
    | "velvet"
    | "marble"
    | "terracotta"
    | "aurora"
    | "bamboo"
    | "espresso"
    | "lavender"
    | "graphite"
    | "sunkissed"
    | "oceanic"
    | "rosegold"
    | "midnight"
    | "sage"
    | "copper"
    | "arctic"
    | "vineyard"
    | "ember"
    | "oasis"
    | "slate"
    | "honeycomb";

export type MenuTheme = {
    id: MenuThemeId;
    name: string;
    description: string;
    tone: string;
    category: "classic" | "modern" | "playful" | "heritage" | "luxury" | "street" | "coastal" | "cafe";
    cuisines: string[];
    layout: "noir" | "paper" | "citrus" | "harbor";
    /** Typography configuration */
    fonts: {
        /** Google Font name for headings (menu name, category titles) */
        heading: string;
        /** Google Font weights for heading (comma-separated) */
        headingWeights: string;
        /** Google Font name for body text (items, descriptions) */
        body: string;
        /** Google Font weights for body */
        bodyWeights: string;
    };
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
        fonts: {
            heading: "Outfit",
            headingWeights: "600,700,800",
            body: "Space Grotesk",
            bodyWeights: "400,500,600"
        },
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
        fonts: {
            heading: "Playfair Display",
            headingWeights: "500,600,700",
            body: "Libre Baskerville",
            bodyWeights: "400,700"
        },
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
        fonts: {
            heading: "Bebas Neue",
            headingWeights: "400",
            body: "Poppins",
            bodyWeights: "400,500,600"
        },
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
        fonts: {
            heading: "Josefin Sans",
            headingWeights: "500,600,700",
            body: "Work Sans",
            bodyWeights: "400,500,600"
        },
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
        fonts: {
            heading: "EB Garamond",
            headingWeights: "500,600,700",
            body: "Crimson Pro",
            bodyWeights: "400,500,600"
        },
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
        fonts: {
            heading: "Zen Kaku Gothic New",
            headingWeights: "500,700,900",
            body: "Noto Sans JP",
            bodyWeights: "400,500"
        },
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
        fonts: {
            heading: "Lora",
            headingWeights: "500,600,700",
            body: "Source Serif 4",
            bodyWeights: "400,500,600"
        },
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
        fonts: {
            heading: "Gilda Display",
            headingWeights: "400",
            body: "Lora",
            bodyWeights: "400,500,600"
        },
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
        fonts: {
            heading: "Bodoni Moda",
            headingWeights: "500,600,700",
            body: "Source Sans 3",
            bodyWeights: "400,500,600"
        },
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
        fonts: {
            heading: "Oswald",
            headingWeights: "500,600,700",
            body: "Barlow",
            bodyWeights: "400,500,600"
        },
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
        fonts: {
            heading: "Dela Gothic One",
            headingWeights: "400",
            body: "M PLUS 1p",
            bodyWeights: "400,500,700"
        },
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
        fonts: {
            heading: "Teko",
            headingWeights: "500,600,700",
            body: "Barlow Condensed",
            bodyWeights: "400,500,600"
        },
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
        fonts: {
            heading: "Cormorant Infant",
            headingWeights: "600,700",
            body: "Jost",
            bodyWeights: "400,500"
        },
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
        fonts: {
            heading: "Zen Maru Gothic",
            headingWeights: "400,500,700",
            body: "Noto Sans",
            bodyWeights: "400,500"
        },
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
    },
    {
        id: "velvet",
        name: "Velvet Lounge",
        description: "Deep burgundy undertones, plush sophistication, intimate ambiance.",
        tone: "Wine bar, upscale, romantic",
        category: "luxury",
        cuisines: ["wine-bar", "tapas", "cocktails"],
        layout: "noir",
        fonts: {
            heading: "Cormorant Garamond",
            headingWeights: "500,600,700",
            body: "Raleway",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#0D0809",
            surface: "#1A1314",
            surfaceAlt: "#231A1C",
            text: "#F5F0F1",
            muted: "#A89396",
            border: "#2D2224",
            accent: "#9F1239"
        },
        preview: {
            bg: "#0D0809",
            card: "#1A1314",
            text: "#F5F0F1",
            accent: "#9F1239",
            border: "#2D2224"
        }
    },
    {
        id: "marble",
        name: "Marble Hall",
        description: "Pristine whites, subtle veining, architectural elegance.",
        tone: "Fine dining, sophisticated, clean",
        category: "luxury",
        cuisines: ["fine-dining", "modern", "tasting-menu"],
        layout: "harbor",
        fonts: {
            heading: "Fraunces",
            headingWeights: "600,700,800",
            body: "Nunito Sans",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#FAFAFA",
            surface: "#FFFFFF",
            surfaceAlt: "#F5F5F5",
            text: "#1A1A1A",
            muted: "#6B6B6B",
            border: "#E5E5E5",
            accent: "#0F172A"
        },
        preview: {
            bg: "#FAFAFA",
            card: "#FFFFFF",
            text: "#1A1A1A",
            accent: "#0F172A",
            border: "#E5E5E5"
        }
    },
    {
        id: "terracotta",
        name: "Terracotta Sun",
        description: "Warm clay tones, rustic charm, Mediterranean soul.",
        tone: "Mediterranean, rustic, warm",
        category: "heritage",
        cuisines: ["mediterranean", "greek", "spanish"],
        layout: "paper",
        fonts: {
            heading: "Merriweather",
            headingWeights: "700,900",
            body: "Nunito Sans",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#FBF5F0",
            surface: "#FFFFFF",
            surfaceAlt: "#F5E6DB",
            text: "#3D2C23",
            muted: "#8C6D5C",
            border: "#EBDDD2",
            accent: "#C2410C"
        },
        preview: {
            bg: "#FBF5F0",
            card: "#FFFFFF",
            text: "#3D2C23",
            accent: "#C2410C",
            border: "#EBDDD2"
        }
    },
    {
        id: "aurora",
        name: "Aurora Glow",
        description: "Nordic lights, ethereal gradients, cosmic calm.",
        tone: "Scandinavian, modern, ethereal",
        category: "modern",
        cuisines: ["scandinavian", "nordic", "modern"],
        layout: "harbor",
        fonts: {
            heading: "Righteous",
            headingWeights: "400",
            body: "Lexend",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#0F1419",
            surface: "#171D24",
            surfaceAlt: "#1E262F",
            text: "#E8F0F7",
            muted: "#8FA3B5",
            border: "#2A3642",
            accent: "#8B5CF6"
        },
        preview: {
            bg: "#0F1419",
            card: "#171D24",
            text: "#E8F0F7",
            accent: "#8B5CF6",
            border: "#2A3642"
        }
    },
    {
        id: "bamboo",
        name: "Bamboo Garden",
        description: "Zen greens, natural textures, tranquil flow.",
        tone: "Asian fusion, zen, natural",
        category: "modern",
        cuisines: ["asian-fusion", "vietnamese", "thai"],
        layout: "paper",
        fonts: {
            heading: "Noto Serif Display",
            headingWeights: "500,600,700",
            body: "Noto Sans",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#F7F9F4",
            surface: "#FFFFFF",
            surfaceAlt: "#EDF3E5",
            text: "#1D2E1D",
            muted: "#5C7A5C",
            border: "#D4E2CC",
            accent: "#16A34A"
        },
        preview: {
            bg: "#F7F9F4",
            card: "#FFFFFF",
            text: "#1D2E1D",
            accent: "#16A34A",
            border: "#D4E2CC"
        }
    },
    {
        id: "espresso",
        name: "Espresso Bar",
        description: "Rich coffee hues, artisan warmth, cafe culture.",
        tone: "Coffee shop, artisan, cozy",
        category: "cafe",
        cuisines: ["coffee", "brunch", "cafe"],
        layout: "paper",
        fonts: {
            heading: "Bitter",
            headingWeights: "500,600,700",
            body: "Manrope",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#FAF6F3",
            surface: "#FFFFFF",
            surfaceAlt: "#F0E8E0",
            text: "#2A1F1A",
            muted: "#6B5344",
            border: "#E0D5CB",
            accent: "#78350F"
        },
        preview: {
            bg: "#FAF6F3",
            card: "#FFFFFF",
            text: "#2A1F1A",
            accent: "#78350F",
            border: "#E0D5CB"
        }
    },
    {
        id: "lavender",
        name: "Lavender Fields",
        description: "Soft purples, dreamy pastels, gentle sophistication.",
        tone: "Brunch, feminine, elegant",
        category: "cafe",
        cuisines: ["brunch", "afternoon-tea", "dessert"],
        layout: "harbor",
        fonts: {
            heading: "Italiana",
            headingWeights: "400",
            body: "Questrial",
            bodyWeights: "400"
        },
        palette: {
            bg: "#FAF8FC",
            surface: "#FFFFFF",
            surfaceAlt: "#F3EEF8",
            text: "#2D2235",
            muted: "#7C6B8A",
            border: "#E8DFF0",
            accent: "#A855F7"
        },
        preview: {
            bg: "#FAF8FC",
            card: "#FFFFFF",
            text: "#2D2235",
            accent: "#A855F7",
            border: "#E8DFF0"
        }
    },
    {
        id: "graphite",
        name: "Graphite Studio",
        description: "Industrial grays, minimalist edge, urban sophistication.",
        tone: "Industrial, modern, urban",
        category: "modern",
        cuisines: ["modern", "fusion", "gastro-pub"],
        layout: "noir",
        fonts: {
            heading: "Space Grotesk",
            headingWeights: "500,600,700",
            body: "IBM Plex Sans",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#18181B",
            surface: "#27272A",
            surfaceAlt: "#3F3F46",
            text: "#FAFAFA",
            muted: "#A1A1AA",
            border: "#52525B",
            accent: "#F4F4F5"
        },
        preview: {
            bg: "#18181B",
            card: "#27272A",
            text: "#FAFAFA",
            accent: "#F4F4F5",
            border: "#52525B"
        }
    },
    {
        id: "sunkissed",
        name: "Sunkissed Coast",
        description: "Golden hour warmth, beach vibes, relaxed luxury.",
        tone: "Beach club, coastal, relaxed",
        category: "coastal",
        cuisines: ["seafood", "beach-club", "cocktails"],
        layout: "citrus",
        fonts: {
            heading: "Aleo",
            headingWeights: "400,700",
            body: "Quicksand",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#FFFBF5",
            surface: "#FFFFFF",
            surfaceAlt: "#FFF5E6",
            text: "#2D2418",
            muted: "#8A7560",
            border: "#F5E6D3",
            accent: "#EA580C"
        },
        preview: {
            bg: "#FFFBF5",
            card: "#FFFFFF",
            text: "#2D2418",
            accent: "#EA580C",
            border: "#F5E6D3"
        }
    },
    {
        id: "oceanic",
        name: "Oceanic Depth",
        description: "Deep sea blues, mysterious elegance, aquatic allure.",
        tone: "Seafood, upscale, mysterious",
        category: "coastal",
        cuisines: ["seafood", "oyster-bar", "sushi"],
        layout: "noir",
        fonts: {
            heading: "Rufina",
            headingWeights: "400,700",
            body: "Open Sans",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#0A1628",
            surface: "#0F1F35",
            surfaceAlt: "#152942",
            text: "#E6F0FA",
            muted: "#7DA3C8",
            border: "#1E3A5F",
            accent: "#0EA5E9"
        },
        preview: {
            bg: "#0A1628",
            card: "#0F1F35",
            text: "#E6F0FA",
            accent: "#0EA5E9",
            border: "#1E3A5F"
        }
    },
    {
        id: "rosegold",
        name: "Rose Gold Luxe",
        description: "Blush metallics, feminine opulence, refined glamour.",
        tone: "Upscale, glamorous, chic",
        category: "luxury",
        cuisines: ["champagne-bar", "fine-dining", "dessert"],
        layout: "harbor",
        fonts: {
            heading: "Marcellus",
            headingWeights: "400",
            body: "Karla",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#FDF7F7",
            surface: "#FFFFFF",
            surfaceAlt: "#FBF0F0",
            text: "#3D2A2A",
            muted: "#9C7A7A",
            border: "#F0DDDD",
            accent: "#E11D48"
        },
        preview: {
            bg: "#FDF7F7",
            card: "#FFFFFF",
            text: "#3D2A2A",
            accent: "#E11D48",
            border: "#F0DDDD"
        }
    },
    {
        id: "midnight",
        name: "Midnight Society",
        description: "Deep navy, gold accents, members-only mystique.",
        tone: "Speakeasy, exclusive, sophisticated",
        category: "luxury",
        cuisines: ["cocktails", "speakeasy", "late-night"],
        layout: "noir",
        fonts: {
            heading: "Cinzel",
            headingWeights: "500,600,700",
            body: "EB Garamond",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#0A0D14",
            surface: "#111827",
            surfaceAlt: "#1F2937",
            text: "#F9FAFB",
            muted: "#9CA3AF",
            border: "#374151",
            accent: "#F59E0B"
        },
        preview: {
            bg: "#0A0D14",
            card: "#111827",
            text: "#F9FAFB",
            accent: "#F59E0B",
            border: "#374151"
        }
    },
    {
        id: "sage",
        name: "Sage Kitchen",
        description: "Herbal greens, farm-fresh feel, organic elegance.",
        tone: "Farm-to-table, organic, fresh",
        category: "modern",
        cuisines: ["farm-to-table", "vegetarian", "healthy"],
        layout: "paper",
        fonts: {
            heading: "Plus Jakarta Sans",
            headingWeights: "600,700,800",
            body: "DM Sans",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#F5F7F4",
            surface: "#FFFFFF",
            surfaceAlt: "#E8EDE5",
            text: "#1F2E1F",
            muted: "#5E7A5E",
            border: "#D4DED0",
            accent: "#4D7C0F"
        },
        preview: {
            bg: "#F5F7F4",
            card: "#FFFFFF",
            text: "#1F2E1F",
            accent: "#4D7C0F",
            border: "#D4DED0"
        }
    },
    {
        id: "copper",
        name: "Copper & Oak",
        description: "Burnished metals, barrel-aged warmth, craft tradition.",
        tone: "Brewery, craft, artisan",
        category: "street",
        cuisines: ["brewery", "gastropub", "craft-beer"],
        layout: "citrus",
        fonts: {
            heading: "Archivo Black",
            headingWeights: "400",
            body: "Public Sans",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#F9F5F0",
            surface: "#FFFFFF",
            surfaceAlt: "#F0E5D8",
            text: "#2E1F14",
            muted: "#7A5A3D",
            border: "#E5D5C0",
            accent: "#B45309"
        },
        preview: {
            bg: "#F9F5F0",
            card: "#FFFFFF",
            text: "#2E1F14",
            accent: "#B45309",
            border: "#E5D5C0"
        }
    },
    {
        id: "arctic",
        name: "Arctic Breeze",
        description: "Icy blues, crystalline clarity, Nordic minimalism.",
        tone: "Scandinavian, cool, pristine",
        category: "modern",
        cuisines: ["scandinavian", "seafood", "modern"],
        layout: "harbor",
        fonts: {
            heading: "Outfit",
            headingWeights: "500,600,700",
            body: "Inter",
            bodyWeights: "400,500"
        },
        palette: {
            bg: "#F0F9FF",
            surface: "#FFFFFF",
            surfaceAlt: "#E0F2FE",
            text: "#0C4A6E",
            muted: "#0369A1",
            border: "#BAE6FD",
            accent: "#0284C7"
        },
        preview: {
            bg: "#F0F9FF",
            card: "#FFFFFF",
            text: "#0C4A6E",
            accent: "#0284C7",
            border: "#BAE6FD"
        }
    },
    {
        id: "vineyard",
        name: "Vineyard Dusk",
        description: "Wine country purples, sunset warmth, pastoral elegance.",
        tone: "Winery, romantic, pastoral",
        category: "heritage",
        cuisines: ["wine", "french", "californian"],
        layout: "paper",
        fonts: {
            heading: "Cormorant Garamond",
            headingWeights: "500,600,700",
            body: "Quattrocento Sans",
            bodyWeights: "400,700"
        },
        palette: {
            bg: "#FAF7F5",
            surface: "#FFFFFF",
            surfaceAlt: "#F3E8EB",
            text: "#2D1F2D",
            muted: "#7A5A6E",
            border: "#E8D5DD",
            accent: "#7C3AED"
        },
        preview: {
            bg: "#FAF7F5",
            card: "#FFFFFF",
            text: "#2D1F2D",
            accent: "#7C3AED",
            border: "#E8D5DD"
        }
    },
    {
        id: "ember",
        name: "Ember Grill",
        description: "Smoldering reds, live-fire energy, primal warmth.",
        tone: "Steakhouse, fire, bold",
        category: "street",
        cuisines: ["steakhouse", "grill", "argentine"],
        layout: "noir",
        fonts: {
            heading: "Anton",
            headingWeights: "400",
            body: "Rubik",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#0F0A08",
            surface: "#1A1210",
            surfaceAlt: "#251B17",
            text: "#FAF5F2",
            muted: "#BFA89C",
            border: "#3D2E28",
            accent: "#DC2626"
        },
        preview: {
            bg: "#0F0A08",
            card: "#1A1210",
            text: "#FAF5F2",
            accent: "#DC2626",
            border: "#3D2E28"
        }
    },
    {
        id: "oasis",
        name: "Desert Oasis",
        description: "Warm sands, turquoise accents, Moroccan mystique.",
        tone: "Moroccan, exotic, warm",
        category: "heritage",
        cuisines: ["moroccan", "middle-eastern", "persian"],
        layout: "citrus",
        fonts: {
            heading: "Amiri",
            headingWeights: "400,700",
            body: "Cairo",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#FBF8F4",
            surface: "#FFFFFF",
            surfaceAlt: "#F5EDE0",
            text: "#2E261E",
            muted: "#8A7A64",
            border: "#E8DBC8",
            accent: "#0D9488"
        },
        preview: {
            bg: "#FBF8F4",
            card: "#FFFFFF",
            text: "#2E261E",
            accent: "#0D9488",
            border: "#E8DBC8"
        }
    },
    {
        id: "slate",
        name: "Slate & Stone",
        description: "Cool grays, architectural lines, contemporary edge.",
        tone: "Contemporary, minimalist, sleek",
        category: "modern",
        cuisines: ["modern", "tasting-menu", "fusion"],
        layout: "harbor",
        fonts: {
            heading: "Sora",
            headingWeights: "500,600,700",
            body: "Work Sans",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#F8FAFC",
            surface: "#FFFFFF",
            surfaceAlt: "#F1F5F9",
            text: "#0F172A",
            muted: "#64748B",
            border: "#E2E8F0",
            accent: "#475569"
        },
        preview: {
            bg: "#F8FAFC",
            card: "#FFFFFF",
            text: "#0F172A",
            accent: "#475569",
            border: "#E2E8F0"
        }
    },
    {
        id: "honeycomb",
        name: "Honeycomb Café",
        description: "Golden ambers, sweet warmth, artisanal charm.",
        tone: "Artisan, sweet, welcoming",
        category: "cafe",
        cuisines: ["bakery", "breakfast", "honey-bar"],
        layout: "citrus",
        fonts: {
            heading: "Fredoka",
            headingWeights: "500,600,700",
            body: "Nunito",
            bodyWeights: "400,500,600"
        },
        palette: {
            bg: "#FFFCF5",
            surface: "#FFFFFF",
            surfaceAlt: "#FEF3C7",
            text: "#451A03",
            muted: "#92400E",
            border: "#FDE68A",
            accent: "#D97706"
        },
        preview: {
            bg: "#FFFCF5",
            card: "#FFFFFF",
            text: "#451A03",
            accent: "#D97706",
            border: "#FDE68A"
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
