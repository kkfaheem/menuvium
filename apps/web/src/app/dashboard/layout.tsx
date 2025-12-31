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
    const [isMock, setIsMock] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (typeof window !== 'undefined') {
            const mock = localStorage.getItem('menuvium_mock_user') === 'true';
            setIsMock(mock);
            if (!user && !mock) {
                router.push('/login');
            }
        }
    }, [user, router]);

    if (!mounted) return <div className="min-h-screen bg-[#0a0a0a]" suppressHydrationWarning />;
    if (!user && !isMock) return null;

    return (
        <div className="flex min-h-screen bg-[#0a0a0a] text-white">
            {/* Sidebar */}
            <aside className="w-64 border-r border-white/10 p-6 flex flex-col fixed h-full bg-[#0a0a0a]">
                <h2 className="text-xl font-bold mb-12 tracking-tight pl-2">Menuvium</h2>
                <nav className="flex-1 space-y-2">
                    <Link
                        href="/dashboard"
                        className={`flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${pathname === '/dashboard' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                    >
                        <LayoutDashboard className="w-5 h-5" />
                        Overview
                    </Link>
                    <Link
                        href="/dashboard/menus"
                        className={`flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${pathname.startsWith('/dashboard/menus') ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                    >
                        <UtensilsCrossed className="w-5 h-5" />
                        Menus
                    </Link>
                    <Link
                        href="/onboarding"
                        className={`flex items-center gap-3 p-3 rounded-xl transition-all font-medium ${pathname === '/onboarding' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                    >
                        <Settings className="w-5 h-5" />
                        Settings
                    </Link>
                </nav>
                <button
                    onClick={() => {
                        if (isMock) {
                            localStorage.removeItem('menuvium_mock_user');
                            router.push('/');
                        } else {
                            signOut();
                        }
                    }}
                    className="flex items-center gap-3 p-3 text-white/40 hover:text-white transition-all mt-auto"
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
