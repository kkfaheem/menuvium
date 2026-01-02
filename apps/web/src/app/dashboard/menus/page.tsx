"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchAuthSession } from "aws-amplify/auth";

// Types
interface Menu {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    categories: any[];
}

export default function MenusPage() {
    const { user } = useAuthenticator((context) => [context.user]);
    const [menus, setMenus] = useState<Menu[]>([]);
    const [loading, setLoading] = useState(true);

    const [organizations, setOrganizations] = useState<any[]>([]);
    const [selectedOrg, setSelectedOrg] = useState<string>("");

    useEffect(() => {
        fetchOrganizations();
    }, [user]);

    useEffect(() => {
        if (selectedOrg) fetchMenus();
    }, [selectedOrg]);

    useEffect(() => {
        if (!selectedOrg || typeof window === "undefined") return;
        localStorage.setItem("menuvium_last_org_id", selectedOrg);
    }, [selectedOrg]);

    const getAuthToken = async () => {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();
        if (!token) {
            throw new Error("Not authenticated");
        }
        return token;
    };

    const fetchOrganizations = async () => {
        try {
            const token = await getAuthToken();
            const orgRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/organizations/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!orgRes.ok) {
                return;
            }
            const orgs = await orgRes.json();

            if (orgs.length === 0) {
                return;
            }
            const preferredOrgId =
                typeof window !== "undefined" ? localStorage.getItem("menuvium_last_org_id") : null;

            setOrganizations(orgs);
            if (orgs.length > 0) {
                const preferredOrg = preferredOrgId
                    ? orgs.find((org: { id: string }) => org.id === preferredOrgId)
                    : null;
                setSelectedOrg(preferredOrg ? preferredOrg.id : orgs[0].id);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchMenus = async () => {
        if (!selectedOrg) return;
        setLoading(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/menus/?org_id=${selectedOrg}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMenus(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (loading && !menus.length && !selectedOrg) return <div className="text-white/40">Loading context...</div>;

    return (
        <div>
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight mb-2">Menus</h1>
                    <p className="text-[var(--cms-muted)]">Manage your restaurant's menus.</p>
                </div>
                <div className="flex items-center gap-3">
                    {organizations.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-[var(--cms-muted)]">Company:</span>
                            <select
                                value={selectedOrg}
                                onChange={(e) => setSelectedOrg(e.target.value)}
                                className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-lg px-3 py-2 text-sm text-[var(--cms-text)] focus:outline-none"
                            >
                                {organizations.map(org => (
                                    <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <Link
                        href="/dashboard/menus/new"
                        className="bg-[var(--cms-text)] text-[var(--cms-bg)] px-4 py-2 rounded-lg font-bold hover:opacity-90 inline-flex items-center gap-2"
                    >
                        Create Menu
                    </Link>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {menus.map(menu => (
                    <Link
                        key={menu.id}
                        href={`/dashboard/menus/${menu.id}`}
                        className={`group block bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-2xl p-6 transition-all hover:scale-[1.02] ${menu.is_active ? 'hover:bg-[var(--cms-panel-strong)]' : 'opacity-70 hover:opacity-90'}`}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 rounded-full bg-[var(--cms-pill)] flex items-center justify-center text-[var(--cms-text)] font-bold text-xl">
                                {menu.name[0]}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className={`px-2 py-1 rounded text-xs font-bold ${menu.is_active ? 'bg-[var(--cms-pill)] text-[var(--cms-text)]' : 'bg-[var(--cms-panel-strong)] text-[var(--cms-muted)]'}`}>
                                    {menu.is_active ? 'ACTIVE' : 'INACTIVE'}
                                </div>
                            </div>
                        </div>
                        <h3 className="text-xl font-bold mb-1 group-hover:text-[var(--cms-text)] transition-colors">{menu.name}</h3>

                    </Link>
                ))}
            </div>
        </div>
    );
}
