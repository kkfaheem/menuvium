"use client";

import type * as React from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "rounded-3xl border border-border bg-panel shadow-[var(--cms-shadow-sm)]",
                "transition-shadow duration-200 hover:shadow-[var(--cms-shadow-md)]",
                className
            )}
            {...props}
        />
    );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn("px-6 pt-6 pb-4 border-b border-border", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return <h2 className={cn("font-heading text-base font-semibold tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
    return <p className={cn("mt-1 text-sm text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn("px-6 py-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn("px-6 py-5 border-t border-border", className)} {...props} />;
}
