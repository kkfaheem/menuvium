"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, UtensilsCrossed, LogOut, Settings, Building2, Menu, X, Palette } from "lucide-react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, signOut } = useAuthenticator((context) => [context.user]);
    const [mounted, setMounted] = useState(false);
    const [navOpen, setNavOpen] = useState(false);
    const [mode, setMode] = useState<"admin" | "manager" | null>(null);
    const isModePage = pathname.startsWith("/dashboard/mode");

    useEffect(() => {
        setMounted(true);
        if (typeof window !== "undefined") {
            // REMOVED legacy theme logic
            if (!user) {
                router.replace("/login");
            }
        }
    }, [user, router]);

    useLayoutEffect(() => {
        if (typeof window === "undefined") return;
        setMode((localStorage.getItem("menuvium_user_mode") as "admin" | "manager" | null) || null);
    }, [pathname]);

    useEffect(() => {
        if (!mounted || !user) return;
        if (mode === null && !isModePage) {
            router.replace("/dashboard/mode");
            return;
        }
        if (mode === "manager") {
            const restricted =
                pathname === "/dashboard" ||
                pathname.startsWith("/dashboard/companies") ||
                pathname.startsWith("/dashboard/settings");
            if (restricted) {
                router.replace("/dashboard/menus");
            }
        }
    }, [mounted, user, mode, pathname, router, isModePage]);

    if (!mounted) return <div className="min-h-screen bg-background" suppressHydrationWarning />;
    if (!user) return null;

    const isManager = mode === "manager";

    if (isModePage) {
        return (
            <div className="min-h-screen bg-background text-foreground">
                <header className="sticky top-0 z-40 border-b border-border bg-panel">
                    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
                        <div className="flex-1" />
                        <Logo size="lg" />
                        <div className="flex flex-1 items-center justify-end gap-3">
                            <ThemeToggle />
                        </div>
                    </div>
                </header>

                <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center px-4 py-10 sm:px-6">
                    {children}
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex min-h-screen flex-col md:flex-row">
                <div className="md:hidden sticky top-0 z-40 border-b border-border bg-panel">
                    <div className="flex items-center justify-between px-4 py-3">
                        <button
                            onClick={() => setNavOpen(true)}
                            className="h-10 w-10 rounded-xl border border-border bg-panel flex items-center justify-center hover:bg-pill transition-colors"
                            aria-label="Open navigation"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <Logo size="md" />
                        <div className="flex items-center gap-2">
                            <ThemeToggle />
                        </div>
                    </div>
                </div>

                {navOpen && (
                    <div className="md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setNavOpen(false)} />
                )}

                {/* Sidebar */}
                <aside
                    className={cn(
                        "fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-panel p-6 transition-transform duration-300 md:sticky md:top-0 md:z-10 md:h-screen md:w-64 md:translate-x-0",
                        navOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
                    )}
                >
                    <div className="flex items-center justify-between mb-10">
                        <Logo size="lg" />
                        <button
                            onClick={() => setNavOpen(false)}
                            className="md:hidden h-9 w-9 rounded-xl border border-border bg-panel flex items-center justify-center hover:bg-pill transition-colors"
                            aria-label="Close navigation"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <nav className="flex-1 space-y-1">
                        {!isManager && (
                            <Link
                                href="/dashboard"
                                onClick={() => setNavOpen(false)}
                                className={cn(
                                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                                    pathname === "/dashboard"
                                        ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                        : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                )}
                            >
                                <LayoutDashboard className="w-5 h-5" />
                                Overview
                            </Link>
                        )}
                        <Link
                            href="/dashboard/menus"
                            onClick={() => setNavOpen(false)}
                            className={cn(
                                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                                pathname.startsWith("/dashboard/menus") && !pathname.includes("/themes")
                                    ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                    : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                            )}
                        >
                            <UtensilsCrossed className="w-5 h-5" />
                            Menus
                        </Link>
                        <Link
                            href="/dashboard/design-studio"
                            onClick={() => setNavOpen(false)}
                            className={cn(
                                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                                pathname.startsWith("/dashboard/design-studio") || pathname.includes("/themes")
                                    ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                    : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                            )}
                        >
                            <Palette className="w-5 h-5" />
                            Design Studio
                        </Link>
                        {!isManager && (
                            <Link
                                href="/dashboard/companies"
                                onClick={() => setNavOpen(false)}
                                className={cn(
                                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                                    pathname.startsWith("/dashboard/companies")
                                        ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                        : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                )}
                            >
                                <Building2 className="w-5 h-5" />
                                Companies
                            </Link>
                        )}
                        {!isManager && (
                            <Link
                                href="/dashboard/settings"
                                onClick={() => setNavOpen(false)}
                                className={cn(
                                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                                    pathname === "/dashboard/settings"
                                        ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                        : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                )}
                            >
                                <Settings className="w-5 h-5" />
                                Settings
                            </Link>
                        )}
                        <Link
                            href="/dashboard/mode"
                            onClick={() => setNavOpen(false)}
                            className={cn(
                                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                                pathname.startsWith("/dashboard/mode")
                                    ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                    : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                            )}
                        >
                            <Menu className="w-5 h-5" />
                            Mode
                        </Link>
                    </nav>

                    <div className="mt-auto pt-4 border-t border-border">
                        <div className="flex items-center gap-3 px-2 py-2">
                            <ThemeToggle />
                        </div>
                        <button
                            onClick={() => signOut()}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:text-[var(--cms-text)] hover:bg-pill transition-colors"
                        >
                            <LogOut className="w-5 h-5" />
                            Sign Out
                        </button>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
                    {mode ? (
                        children
                    ) : (
                        <div className="w-full max-w-2xl space-y-3">
                            <div className="h-6 w-48 rounded-lg bg-pill animate-pulse" />
                            <div className="h-4 w-72 rounded-lg bg-pill animate-pulse" />
                            <div className="h-4 w-64 rounded-lg bg-pill animate-pulse" />
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
