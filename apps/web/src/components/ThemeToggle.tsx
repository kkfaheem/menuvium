"use client";

import { MoonStar, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    return (
        <div
            role="group"
            aria-label="Theme mode"
            className="inline-flex h-9 items-center rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] p-1 shadow-sm"
        >
            <button
                type="button"
                onClick={() => setTheme("light")}
                aria-pressed={!isDark}
                aria-label="Switch to light mode"
                className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-150 motion-reduce:transition-none",
                    !isDark
                        ? "bg-[var(--cms-panel)] text-amber-500 ring-1 ring-[var(--cms-border)] shadow-[0_4px_10px_rgba(0,0,0,0.2)]"
                        : "text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
                )}
            >
                <Sun className="h-3.5 w-3.5" />
            </button>
            <button
                type="button"
                onClick={() => setTheme("dark")}
                aria-pressed={isDark}
                aria-label="Switch to dark mode"
                className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-150 motion-reduce:transition-none",
                    isDark
                        ? "bg-[var(--cms-panel)] text-[var(--cms-accent)] ring-1 ring-[var(--cms-border)] shadow-[0_4px_10px_rgba(0,0,0,0.2)]"
                        : "text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
                )}
            >
                <MoonStar className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
