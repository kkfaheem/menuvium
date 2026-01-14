"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, UtensilsCrossed, LogOut, Settings, Building2, Menu, X, Palette } from "lucide-react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";

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

    if (!mounted) return <div className="min-h-screen bg-[var(--cms-bg)]" suppressHydrationWarning />;
    if (!user) return null;

    const isManager = mode === "manager";

    if (isModePage) {
        return (
            <div className="relative min-h-screen bg-[var(--cms-bg)] text-[var(--cms-text)] transition-colors">
                {/* Header - glassmorphism */}
                <header className="fixed top-0 left-0 right-0 z-50 glass-subtle">
                    <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                        {/* Left spacer */}
                        <div className="flex-1" />

                        {/* Centered logo */}
                        <Logo size="lg" />

                        {/* Right side */}
                        <div className="flex items-center gap-3 flex-1 justify-end">
                            <ThemeToggle />
                        </div>
                    </div>
                </header>

                {/* Abstract background */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-[var(--cms-accent)]/15 blur-[140px]" />
                    <div className="absolute top-[20%] -right-24 h-72 w-72 rounded-full bg-pink-400/10 blur-[160px]" />
                    <div className="absolute bottom-[-160px] right-[20%] h-80 w-80 rounded-full bg-blue-400/10 blur-[170px]" />
                </div>

                <main className="relative mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 pt-20 pb-12">
                    {children}
                </main>
            </div>
        );
    }

    return (
        <div className="relative min-h-screen bg-[var(--cms-bg)] text-[var(--cms-text)] transition-colors">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-32 left-[18%] h-72 w-72 rounded-full bg-emerald-400/10 blur-[140px] float-slow" />
                <div className="absolute top-[20%] -right-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-[160px] float-medium" />
                <div className="absolute bottom-[-160px] right-[20%] h-80 w-80 rounded-full bg-indigo-400/10 blur-[170px] float-slow" />
                <div className="absolute inset-0 opacity-10 gradient-shift bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_50%),linear-gradient(130deg,_rgba(16,185,129,0.12),_rgba(34,211,238,0.1),_rgba(99,102,241,0.08))]" />
            </div>

            <div className="relative flex min-h-screen flex-col md:flex-row">
                <div className="md:hidden sticky top-0 z-40 border-b border-[var(--cms-border)] bg-[var(--cms-panel)]/90 backdrop-blur-xl">
                    <div className="flex items-center justify-between px-4 py-3">
                        <button
                            onClick={() => setNavOpen(true)}
                            className="h-10 w-10 rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel)] flex items-center justify-center"
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
                    className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-[var(--cms-border)] bg-[var(--cms-panel)]/95 backdrop-blur-xl p-6 transition-transform duration-300 md:sticky md:top-0 md:z-10 md:w-64 md:h-screen md:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
                >
                    <div className="flex items-center justify-between mb-10">
                        <Logo size="lg" />
                        <button
                            onClick={() => setNavOpen(false)}
                            className="md:hidden h-9 w-9 rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel)] flex items-center justify-center"
                            aria-label="Close navigation"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <nav className="flex-1 space-y-2">
                        {!isManager && (
                            <Link
                                href="/dashboard"
                                onClick={() => setNavOpen(false)}
                                className={`flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${pathname === '/dashboard' ? 'bg-[var(--cms-pill)] text-[var(--cms-text)]' : 'text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]'}`}
                            >
                                <LayoutDashboard className="w-5 h-5" />
                                Overview
                            </Link>
                        )}
                        <Link
                            href="/dashboard/menus"
                            onClick={() => setNavOpen(false)}
                            className={`flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${pathname.startsWith('/dashboard/menus') && !pathname.includes('/themes') ? 'bg-[var(--cms-pill)] text-[var(--cms-text)]' : 'text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]'}`}
                        >
                            <UtensilsCrossed className="w-5 h-5" />
                            Menus
                        </Link>
                        <Link
                            href="/dashboard/design-studio"
                            onClick={() => setNavOpen(false)}
                            className={`flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${pathname.startsWith('/dashboard/design-studio') || pathname.includes('/themes') ? 'bg-[var(--cms-pill)] text-[var(--cms-text)]' : 'text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]'}`}
                        >
                            <Palette className="w-5 h-5" />
                            Design Studio
                        </Link>
                        {!isManager && (
                            <Link
                                href="/dashboard/companies"
                                onClick={() => setNavOpen(false)}
                                className={`flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${pathname.startsWith('/dashboard/companies') ? 'bg-[var(--cms-pill)] text-[var(--cms-text)]' : 'text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]'}`}
                            >
                                <Building2 className="w-5 h-5" />
                                Companies
                            </Link>
                        )}
                        {!isManager && (
                            <Link
                                href="/dashboard/settings"
                                onClick={() => setNavOpen(false)}
                                className={`flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${pathname === '/dashboard/settings' ? 'bg-[var(--cms-pill)] text-[var(--cms-text)]' : 'text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]'}`}
                            >
                                <Settings className="w-5 h-5" />
                                Settings
                            </Link>
                        )}
                        <Link
                            href="/dashboard/mode"
                            onClick={() => setNavOpen(false)}
                            className={`flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${pathname.startsWith('/dashboard/mode') ? 'bg-[var(--cms-pill)] text-[var(--cms-text)]' : 'text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]'}`}
                        >
                            <Menu className="w-5 h-5" />
                            Mode
                        </Link>
                    </nav>

                    <div className="mt-auto pt-4 border-t border-[var(--cms-border)]">
                        <div className="flex items-center gap-3 p-3">
                            <ThemeToggle />
                        </div>
                        <button
                            onClick={() => signOut()}
                            className="flex w-full items-center gap-3 p-3 rounded-xl text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)] transition-all"
                        >
                            <LogOut className="w-5 h-5" />
                            Sign Out
                        </button>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 min-w-0 px-5 py-6 sm:px-6 sm:py-8 md:px-6 md:py-8 lg:px-8">
                    {mode ? (
                        children
                    ) : (
                        <div className="w-full max-w-2xl space-y-3">
                            <div className="h-6 w-48 rounded-lg bg-[var(--cms-pill)] animate-pulse" />
                            <div className="h-4 w-72 rounded-lg bg-[var(--cms-pill)] animate-pulse" />
                            <div className="h-4 w-64 rounded-lg bg-[var(--cms-pill)] animate-pulse" />
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
