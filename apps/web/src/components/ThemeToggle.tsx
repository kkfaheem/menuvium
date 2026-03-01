"use client";

import { MoonStar, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    return (
        <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-pressed={isDark}
            className="group relative inline-flex h-10 w-[86px] items-center rounded-full border border-[var(--cms-border)] bg-[color-mix(in_srgb,var(--cms-panel)_86%,transparent)] p-1 text-[var(--cms-muted)] shadow-sm transition-colors duration-200 hover:border-[var(--cms-text)]/30 hover:text-[var(--cms-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent-strong)]/25 motion-reduce:transition-none"
            aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
            title={`Switch to ${isDark ? "light" : "dark"} mode`}
        >
            <span
                aria-hidden="true"
                className={cn(
                    "pointer-events-none absolute left-1 top-1 h-8 w-8 rounded-full bg-[var(--cms-panel)] ring-1 ring-[var(--cms-border)] shadow-[0_6px_16px_rgba(0,0,0,0.26)] transition-transform duration-200 motion-reduce:transition-none",
                    isDark ? "translate-x-[44px]" : "translate-x-0"
                )}
            />
            <span
                aria-hidden="true"
                className={cn(
                    "relative z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 motion-reduce:transition-none",
                    !isDark ? "text-amber-500" : "text-[var(--cms-muted)]"
                )}
            >
                <Sun className="h-4 w-4" />
            </span>
            <span
                aria-hidden="true"
                className={cn(
                    "relative z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 motion-reduce:transition-none",
                    isDark ? "text-[var(--cms-accent)]" : "text-[var(--cms-muted)]"
                )}
            >
                <MoonStar className="h-4 w-4" />
            </span>
            <span className="sr-only">Toggle theme</span>
        </button>
    );
}
