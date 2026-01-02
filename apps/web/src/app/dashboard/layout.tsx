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
        <div className="flex min-h-screen bg-[var(--cms-bg)] text-[var(--cms-text)] transition-colors">
            {/* Sidebar */}
            <aside className="w-64 border-r border-[var(--cms-border)] p-6 flex flex-col fixed h-full bg-[var(--cms-panel)] transition-colors">
                <h2 className="text-xl font-bold mb-12 tracking-tight pl-2">Menuvium</h2>
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
            <main className="flex-1 ml-64 p-12">
                {children}
            </main>
        </div>
    );
}
