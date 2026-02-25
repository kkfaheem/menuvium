"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface LogoProps {
    size?: "sm" | "md" | "lg";
    className?: string;
}

/**
 * Consistent Menuvium logo component.
 * - From login/landing pages: links to "/"
 * - From dashboard/authenticated pages: links to "/dashboard/menus"
 */
export function Logo({ size = "md", className = "" }: LogoProps) {
    const pathname = usePathname();

    // Determine where logo should link based on current path
    const isPublicPage =
        pathname === "/" || pathname === "/login" || pathname.startsWith("/r/") || pathname.startsWith("/contact");
    const href = isPublicPage ? "/" : "/dashboard/menus";

    const sizeClasses = {
        sm: "text-lg",
        md: "text-xl",
        lg: "text-2xl"
    };

    const dotSizeClasses = {
        sm: "w-1.5 h-1.5",
        md: "w-2 h-2",
        lg: "w-2.5 h-2.5"
    };

    return (
        <Link
            href={href}
            className={`inline-flex items-center gap-1 font-heading font-semibold tracking-tight transition-opacity hover:opacity-80 ${sizeClasses[size]} ${className}`}
        >
            <span className="text-foreground">menu</span>
            <span className="text-[var(--cms-accent-strong)] font-bold">vium</span>
            <span className={`${dotSizeClasses[size]} rounded-full bg-[var(--cms-accent)]`} aria-hidden="true" />
        </Link>
    );
}
