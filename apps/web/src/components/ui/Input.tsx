"use client";

import type * as React from "react";
import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type, ...props }: InputProps) {
    return (
        <input
            type={type}
            className={cn(
                "w-full h-11 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel)] px-3 text-sm text-[var(--cms-text)] shadow-sm",
                "placeholder:text-[var(--cms-muted-strong)]",
                "focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)]/25 focus:border-[var(--cms-accent)] transition-[border-color,box-shadow]",
                className
            )}
            {...props}
        />
    );
}
