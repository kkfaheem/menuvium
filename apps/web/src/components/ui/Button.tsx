"use client";

import type * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
};

export function Button({
    className,
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    type,
    children,
    ...props
}: ButtonProps) {
    return (
        <button
            type={type ?? "button"}
            className={cn(
                "inline-flex select-none items-center justify-center gap-2 rounded-xl border border-transparent font-semibold tracking-tight",
                "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
                "active:translate-y-px",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30",
                "disabled:pointer-events-none disabled:opacity-50",
                size === "sm" && "h-9 px-3 text-sm",
                size === "md" && "h-11 px-4 text-sm",
                size === "lg" && "h-12 px-5 text-base",
                variant === "primary" &&
                "bg-[linear-gradient(180deg,var(--cms-accent),var(--cms-accent-strong))] text-white shadow-sm hover:shadow-md",
                variant === "secondary" &&
                "border-[var(--cms-border)] bg-[var(--cms-panel-strong)] text-[var(--cms-text)] shadow-sm hover:bg-[var(--cms-pill)] hover:shadow-md",
                variant === "outline" &&
                "border-[var(--cms-border)] bg-transparent text-[var(--cms-text)] hover:bg-[var(--cms-pill)]",
                variant === "ghost" && "bg-transparent text-[var(--cms-text)] hover:bg-[var(--cms-pill)]",
                variant === "destructive" && "bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow-md",
                className
            )}
            disabled={disabled || loading}
            {...props}
        >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {children}
        </button>
    );
}
