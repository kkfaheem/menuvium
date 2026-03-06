"use client";

import { Monitor, MoonStar, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useTheme } from "./ThemeProvider";

type ThemeToggleProps = {
    className?: string;
};

type ThemeOption = {
    value: "light" | "dark" | "system";
    label: string;
    icon: typeof Sun;
};

const OPTIONS: ThemeOption[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: MoonStar },
    { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle({ className }: ThemeToggleProps) {
    const { theme, setTheme } = useTheme();

    return (
        <div
            role="group"
            aria-label="Theme mode"
            className={cn(
                "inline-flex h-10 items-center rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)]/90 p-1 shadow-[var(--cms-shadow-xs)]",
                className
            )}
        >
            {OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = theme === option.value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => setTheme(option.value)}
                        aria-pressed={active}
                        aria-label={`Switch to ${option.label.toLowerCase()} mode`}
                        title={option.label}
                        className={cn(
                            "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150 motion-reduce:transition-none",
                            active
                                ? "bg-[var(--cms-panel)] text-[var(--cms-accent-strong)] ring-1 ring-[var(--cms-border)] shadow-[0_3px_8px_rgba(0,0,0,0.18)]"
                                : "text-[var(--cms-muted)] hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)]"
                        )}
                    >
                        <Icon className="h-3.5 w-3.5" />
                    </button>
                );
            })}
        </div>
    );
}
