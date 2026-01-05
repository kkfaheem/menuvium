"use client";

import * as React from "react";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeProviderContextProps {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    resolvedTheme: "light" | "dark";
}

const ThemeProviderContext = createContext<ThemeProviderContextProps | undefined>(undefined);

export function useTheme() {
    const context = useContext(ThemeProviderContext);
    // Gracefully handle case where context is not available (shouldn't happen in production)
    if (context === undefined) {
        // Return a safe default that won't crash the app
        return {
            theme: "system" as Theme,
            setTheme: () => { },
            resolvedTheme: "light" as "light" | "dark",
        };
    }
    return context;
}

interface ThemeProviderProps {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
}

export default function ThemeProvider({
    children,
    defaultTheme = "system",
    storageKey = "menuvium-theme",
}: ThemeProviderProps) {
    const [theme, setThemeState] = useState<Theme>(defaultTheme);
    const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        try {
            const storedTheme = localStorage.getItem(storageKey) as Theme | null;
            if (storedTheme) {
                setThemeState(storedTheme);
            }
        } catch {
            // localStorage might not be available in some environments
        }
    }, [storageKey]);

    useEffect(() => {
        if (!mounted) return;

        const root = window.document.documentElement;
        root.classList.remove("light", "dark");

        let effectiveTheme: "light" | "dark";

        if (theme === "system") {
            effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light";
        } else {
            effectiveTheme = theme;
        }

        root.classList.add(effectiveTheme);
        setResolvedTheme(effectiveTheme);
    }, [theme, mounted]);

    // Listen for system theme changes
    useEffect(() => {
        if (theme !== "system" || !mounted) return;

        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = (e: MediaQueryListEvent) => {
            const newTheme = e.matches ? "dark" : "light";
            document.documentElement.classList.remove("light", "dark");
            document.documentElement.classList.add(newTheme);
            setResolvedTheme(newTheme);
        };

        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, [theme, mounted]);

    const setTheme = useCallback((newTheme: Theme) => {
        try {
            localStorage.setItem(storageKey, newTheme);
        } catch {
            // localStorage might not be available
        }
        setThemeState(newTheme);
    }, [storageKey]);

    // Prevent hydration mismatch by not rendering until mounted
    if (!mounted) {
        return <>{children}</>;
    }

    return (
        <ThemeProviderContext.Provider value={{ theme, setTheme, resolvedTheme }}>
            {children}
        </ThemeProviderContext.Provider>
    );
}
