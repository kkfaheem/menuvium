export type MenuThemeId = "noir" | "paper" | "citrus" | "harbor";

export type MenuTheme = {
    id: MenuThemeId;
    name: string;
    description: string;
    tone: string;
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
        preview: {
            bg: "#F1F6F8",
            card: "#FFFFFF",
            text: "#1D2B2F",
            accent: "#2A9D8F",
            border: "#D6E3E8"
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
