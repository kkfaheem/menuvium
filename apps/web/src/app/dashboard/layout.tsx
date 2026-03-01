"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, UtensilsCrossed, LogOut, Settings, Building2, Menu, X, Palette, QrCode, Zap, Users, Activity, BarChart3, Shield } from "lucide-react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useEffect, useState } from "react";
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
    const { user, signOut, authStatus } = useAuthenticator((context) => [context.user, context.authStatus]);
    const [mounted, setMounted] = useState(false);
    const [navOpen, setNavOpen] = useState(false);
    const [mode, setMode] = useState<"admin" | "manager" | null>(null);
    const [modeReady, setModeReady] = useState(false);
    const isModePage = pathname.startsWith("/dashboard/mode");

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        if (authStatus === "unauthenticated") {
            router.replace("/login");
        }
    }, [mounted, authStatus, router]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const stored = localStorage.getItem("menuvium_user_mode");
        const resolvedMode = stored === "admin" || stored === "manager" ? stored : null;
        setMode(resolvedMode);
        setModeReady(true);
    }, [pathname]);

    useEffect(() => {
        if (!mounted || !user || !modeReady) return;
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
    }, [mounted, user, mode, pathname, router, isModePage, modeReady]);

    if (!mounted) return <div className="min-h-screen bg-background" suppressHydrationWarning />;
    if (!user) return null;

    const isManager = mode === "manager";
    const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").toLowerCase().split(",").map(e => e.trim());
    const userEmail = typeof user?.signInDetails?.loginId === 'string' ? user.signInDetails.loginId.toLowerCase() : "";
    const isSuperAdmin = adminEmails.includes(userEmail);
    if (isModePage) {
        return (
            <div className="min-h-screen bg-background text-foreground">
                <header className="sticky top-0 z-40 border-b border-border bg-panel/90 supports-[backdrop-filter]:bg-panel/80 backdrop-blur-xl">
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
            <div className="flex min-h-screen flex-col md:flex-row md:gap-6 md:px-6 md:py-6">
                <div className="md:hidden sticky top-0 z-40 border-b border-border bg-panel/90 supports-[backdrop-filter]:bg-panel/80 backdrop-blur-xl">
                    <div className="flex items-center justify-between px-4 py-3">
                        <button
                            onClick={() => setNavOpen(true)}
                            className="h-11 w-11 rounded-2xl border border-border bg-panelStrong flex items-center justify-center shadow-sm hover:bg-pill transition-colors"
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
                        "fixed inset-y-0 left-0 z-50 w-72 rounded-r-[2rem] border-r border-border bg-panel p-5 shadow-[var(--cms-shadow-lg)] transition-transform duration-300 md:sticky md:top-6 md:z-10 md:h-[calc(100vh-3rem)] md:w-72 md:translate-x-0 md:rounded-[2rem] md:border md:border-border md:shadow-[var(--cms-shadow-md)]",
                        navOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
                    )}
                >
                    <div className="flex items-center justify-between px-1 py-1 mb-6">
                        <Logo size="lg" />
                        <button
                            onClick={() => setNavOpen(false)}
                            className="md:hidden h-10 w-10 rounded-2xl border border-border bg-panelStrong flex items-center justify-center shadow-sm hover:bg-pill transition-colors"
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
                                    "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors",
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
                                "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                pathname.startsWith("/dashboard/menus") &&
                                    !pathname.includes("/themes") &&
                                    !pathname.includes("/publish")
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
                                "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                pathname.startsWith("/dashboard/design-studio") || pathname.includes("/themes")
                                    ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                    : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                            )}
                        >
                            <Palette className="w-5 h-5" />
                            Design Studio
                        </Link>
                        <Link
                            href="/dashboard/publish"
                            onClick={() => setNavOpen(false)}
                            className={cn(
                                "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                pathname.startsWith("/dashboard/publish") || pathname.includes("/publish")
                                    ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                    : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                            )}
                        >
                            <QrCode className="w-5 h-5" />
                            Publish
                        </Link>
                        {!isManager && (
                            <Link
                                href="/dashboard/companies"
                                onClick={() => setNavOpen(false)}
                                className={cn(
                                    "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors",
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
                                    "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors",
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
                                "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                pathname.startsWith("/dashboard/mode")
                                    ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                    : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                            )}
                        >
                            <Menu className="w-5 h-5" />
                            Mode
                        </Link>
                    </nav>

                    <div className="mt-auto pt-4 border-t border-border space-y-2">
                        {isSuperAdmin && (
                            <div className="px-3 pb-2">
                                <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--cms-muted)] mb-3 mt-2">
                                    <Shield className="w-3.5 h-3.5" />
                                    Super Admin
                                </h4>
                                <div className="space-y-1">
                                    <Link
                                        href="/dashboard/admin/analytics"
                                        onClick={() => setNavOpen(false)}
                                        className={cn(
                                            "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                            pathname === "/dashboard/admin/analytics"
                                                ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                                : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                        )}
                                    >
                                        <BarChart3 className="w-5 h-5" />
                                        Platform Analytics
                                    </Link>
                                    <Link
                                        href="/dashboard/admin/organizations"
                                        onClick={() => setNavOpen(false)}
                                        className={cn(
                                            "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                            pathname.startsWith("/dashboard/admin/organizations")
                                                ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                                : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                        )}
                                    >
                                        <Users className="w-5 h-5" />
                                        Organizations
                                    </Link>
                                    <Link
                                        href="/dashboard/admin/jobs"
                                        onClick={() => setNavOpen(false)}
                                        className={cn(
                                            "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                            pathname.startsWith("/dashboard/admin/jobs")
                                                ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                                : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                        )}
                                    >
                                        <Activity className="w-5 h-5" />
                                        System Health
                                    </Link>
                                    <Link
                                        href="/admin/menu-importer"
                                        onClick={() => setNavOpen(false)}
                                        className={cn(
                                            "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors",
                                            pathname.startsWith("/admin/menu-importer")
                                                ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                                                : "text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-pill"
                                        )}
                                    >
                                        <Zap className="w-5 h-5" />
                                        Menu Importer
                                    </Link>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center gap-3 px-1 py-2 border-t border-border mt-2">
                            <ThemeToggle />
                        </div>
                        <button
                            onClick={() => signOut()}
                            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted hover:text-[var(--cms-text)] hover:bg-pill transition-colors"
                        >
                            <LogOut className="w-5 h-5" />
                            Sign Out
                        </button>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 sm:py-8 md:px-0 md:py-0">
                    <div className="mx-auto w-full max-w-7xl">
                        {modeReady && mode ? (
                            children
                        ) : (
                            <div className="w-full max-w-2xl space-y-3">
                                <div className="h-6 w-48 rounded-lg bg-pill animate-pulse" />
                                <div className="h-4 w-72 rounded-lg bg-pill animate-pulse" />
                                <div className="h-4 w-64 rounded-lg bg-pill animate-pulse" />
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
