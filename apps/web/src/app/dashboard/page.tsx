"use client";

import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useEffect, useState } from "react";

export default function DashboardPage() {
    const { user } = useAuthenticator(context => [context.user]);
    // Mock user check usually handled by layout, but we need username here
    const [mockUser, setMockUser] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setMockUser(localStorage.getItem('menuvium_mock_user') === 'true');
        }
    }, []);

    const displayName = user?.username || (mockUser ? "Mock Admin" : "User");

    return (
        <div>
            <header className="mb-12">
                <h1 className="text-4xl font-bold tracking-tight mb-2">
                    Welcome back, <span className="text-[var(--cms-text)]">{displayName}</span>
                </h1>
                <p className="text-[var(--cms-muted)]">Here is an overview of your restaurant.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-3xl">
                    <p className="text-sm text-[var(--cms-muted)] uppercase tracking-widest mb-2 font-semibold">Active Locations</p>
                    <p className="text-3xl font-bold">1</p>
                </div>
                <div className="p-6 bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-3xl">
                    <p className="text-sm text-[var(--cms-muted)] uppercase tracking-widest mb-2 font-semibold">Menu Items</p>
                    <p className="text-3xl font-bold">0</p>
                </div>
                <div className="p-6 bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-3xl">
                    <p className="text-sm text-[var(--cms-muted)] uppercase tracking-widest mb-2 font-semibold">Total Scans</p>
                    <p className="text-3xl font-bold">0</p>
                </div>
            </div>

            <div className="mt-12 p-12 border-2 border-dashed border-[var(--cms-border)] rounded-[40px] flex flex-col items-center justify-center text-center bg-[var(--cms-panel-strong)]">
                <div className="w-16 h-16 bg-[var(--cms-pill)] rounded-2xl flex items-center justify-center mb-6">
                    <LayoutDashboard className="w-8 h-8 text-[var(--cms-text)]" />
                </div>
                <h3 className="text-xl font-bold mb-2">No menu created yet</h3>
                <p className="text-[var(--cms-muted)] max-w-sm mb-8">Start building your dynamic menu to generate your first QR code.</p>
                <Link href="/dashboard/menus" className="px-8 py-3 bg-[var(--cms-text)] text-[var(--cms-bg)] font-bold rounded-xl hover:scale-105 transition-all inline-block">
                    Create First Menu
                </Link>
            </div>
        </div>
    );
}
