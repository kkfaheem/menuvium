"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    return (
        <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="relative inline-flex h-8 w-16 items-center rounded-full border border-slate-200 bg-slate-100 transition-colors dark:border-slate-700 dark:bg-slate-800"
            aria-label="Toggle theme"
        >
            {/* Sliding indicator */}
            <span
                className={`absolute h-6 w-6 rounded-full bg-white shadow-md transition-all duration-200 dark:bg-slate-600 ${isDark ? "left-[calc(100%-1.625rem)]" : "left-0.5"
                    }`}
            />
            {/* Sun icon (left side) */}
            <Sun
                className={`absolute left-1.5 h-4 w-4 transition-colors ${isDark ? "text-slate-500" : "text-amber-500"
                    }`}
            />
            {/* Moon icon (right side) */}
            <Moon
                className={`absolute right-1.5 h-4 w-4 transition-colors ${isDark ? "text-blue-400" : "text-slate-400"
                    }`}
            />
            <span className="sr-only">Toggle theme</span>
        </button>
    );
}
