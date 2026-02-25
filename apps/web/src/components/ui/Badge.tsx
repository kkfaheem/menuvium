"use client";

import type * as React from "react";
import { cn } from "@/lib/cn";

type BadgeVariant = "default" | "accent" | "success" | "warning" | "danger" | "outline";

export function Badge({
    className,
    variant = "default",
    ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-tight",
                variant === "default" && "border-border bg-panelStrong text-foreground",
                variant === "outline" && "border-border text-muted bg-transparent",
                variant === "accent" && "border-transparent bg-[var(--cms-accent-subtle)] text-[var(--cms-accent-strong)]",
                variant === "success" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                variant === "warning" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                variant === "danger" && "bg-red-500/15 text-red-600 dark:text-red-300",
                className
            )}
            {...props}
        />
    );
}
