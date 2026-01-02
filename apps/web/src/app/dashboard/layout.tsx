"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, UtensilsCrossed, LogOut, Settings } from "lucide-react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useEffect, useState } from "react";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, signOut } = useAuthenticator((context) => [context.user]);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (typeof window !== 'undefined') {
            const savedTheme = (localStorage.getItem('menuvium_cms_theme') as "dark" | "light") || "dark";
            document.documentElement.dataset.cmsTheme = savedTheme;
            if (!user) {
                router.push('/login');
            }
        }
    }, [user, router]);

    if (!mounted) return <div className="min-h-screen bg-[#0a0a0a]" suppressHydrationWarning />;
    if (!user) return null;

    return (
        <div className="relative min-h-screen bg-[var(--cms-bg)] text-[var(--cms-text)] transition-colors">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-32 left-[18%] h-72 w-72 rounded-full bg-emerald-400/10 blur-[140px] float-slow" />
                <div className="absolute top-[20%] -right-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-[160px] float-medium" />
                <div className="absolute bottom-[-160px] right-[20%] h-80 w-80 rounded-full bg-indigo-400/10 blur-[170px] float-slow" />
                <div className="absolute inset-0 opacity-10 gradient-shift bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_50%),linear-gradient(130deg,_rgba(16,185,129,0.12),_rgba(34,211,238,0.1),_rgba(99,102,241,0.08))]" />
            </div>

            <div className="relative flex min-h-screen flex-col md:flex-row">
            {/* Sidebar */}
            <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-[var(--cms-border)] p-6 flex flex-col md:fixed md:h-full bg-[var(--cms-panel)]/90 backdrop-blur-xl transition-colors">
                <h2 className="text-xl font-bold mb-6 md:mb-12 tracking-tight pl-2">Menuvium</h2>
                <nav className="flex-1 space-y-2">
                    <Link
                        href="/dashboard"
                        className={`flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${pathname === '/dashboard' ? 'bg-[var(--cms-pill)] text-[var(--cms-text)]' : 'text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]'}`}
                    >
                        <LayoutDashboard className="w-5 h-5" />
                        Overview
                    </Link>
                    <Link
                        href="/dashboard/menus"
                        className={`flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${pathname.startsWith('/dashboard/menus') ? 'bg-[var(--cms-pill)] text-[var(--cms-text)]' : 'text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]'}`}
                    >
                        <UtensilsCrossed className="w-5 h-5" />
                        Menus
                    </Link>
                    <Link
                        href="/dashboard/settings"
                        className={`flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${pathname === '/dashboard/settings' ? 'bg-[var(--cms-pill)] text-[var(--cms-text)]' : 'text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]'}`}
                    >
                        <Settings className="w-5 h-5" />
                        Settings
                    </Link>
                </nav>
                <button
                    onClick={() => signOut()}
                    className="flex items-center gap-3 p-3 text-[var(--cms-muted-strong)] hover:text-[var(--cms-text)] transition-all mt-auto"
                >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                </button>
            </aside>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 p-6 md:p-12">
                {children}
            </main>
            </div>
        </div>
    );
}
