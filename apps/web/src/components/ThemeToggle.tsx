"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    return (
        <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-pressed={isDark}
            className="relative inline-flex h-8 w-16 items-center rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent-strong)]/25"
            aria-label="Toggle theme"
        >
            <Sun
                aria-hidden="true"
                className={`absolute left-2 h-4 w-4 transition-colors ${isDark ? "text-[var(--cms-muted)]" : "text-[var(--cms-accent-strong)]"}`}
            />
            <Moon
                aria-hidden="true"
                className={`absolute right-2 h-4 w-4 transition-colors ${isDark ? "text-[var(--cms-accent-strong)]" : "text-[var(--cms-muted)]"}`}
            />
            <span
                aria-hidden="true"
                className={`absolute left-0.5 h-7 w-7 rounded-full bg-[var(--cms-panel)] shadow-sm ring-1 ring-[var(--cms-border)] transition-transform duration-200 ${isDark ? "translate-x-8" : "translate-x-0"}`}
            />
            <span className="sr-only">Toggle theme</span>
        </button>
    );
}
