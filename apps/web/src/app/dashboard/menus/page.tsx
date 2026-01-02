"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useRouter } from "next/navigation";

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
    const [isCreating, setIsCreating] = useState(false);
    const router = useRouter();

    const [locations, setLocations] = useState<any[]>([]);
    const [selectedLocation, setSelectedLocation] = useState<string>("");

    useEffect(() => {
        fetchLocations();
    }, [user]);

    useEffect(() => {
        if (selectedLocation) fetchMenus();
    }, [selectedLocation]);

    const getAuthToken = async () => {
        if (user) {
            const session: any = await (user as any).getSession();
            return session.getIdToken().getJwtToken();
        }
        return "mock-token";
    };

    const fetchLocations = async () => {
        console.log("[fetchLocations] Starting...");
        try {
            const token = await getAuthToken();
            console.log("[fetchLocations] Got token:", token.substring(0, 20) + "...");

            const orgRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/organizations/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log("[fetchLocations] Org response status:", orgRes.status);

            if (!orgRes.ok) {
                console.error("[fetchLocations] Failed to fetch orgs");
                return;
            }
            const orgs = await orgRes.json();
            console.log("[fetchLocations] Got orgs:", orgs.length);

            if (orgs.length === 0) {
                console.log("[fetchLocations] No organizations found");
                return;
            }
            const preferredOrgId =
                typeof window !== "undefined" ? localStorage.getItem("menuvium_last_org_id") : null;
            const preferredLocationId =
                typeof window !== "undefined" ? localStorage.getItem("menuvium_last_location_id") : null;

            const locationLists = await Promise.all(
                orgs.map(async (org: { id: string }) => {
                    const locRes = await fetch(
                        `${process.env.NEXT_PUBLIC_API_URL}/organizations/${org.id}/locations`,
                        {
                            headers: { 'Authorization': `Bearer ${token}` }
                        }
                    );
                    if (!locRes.ok) {
                        return [];
                    }
                    const locs = await locRes.json();
                    return locs;
                })
            );

            const locs = locationLists.flat();
            console.log("[fetchLocations] Got locations:", locs.length);
            setLocations(locs);

            if (locs.length > 0) {
                const preferredLocation = preferredLocationId
                    ? locs.find((loc: { id: string }) => loc.id === preferredLocationId)
                    : null;
                if (preferredLocation) {
                    console.log("[fetchLocations] Using preferred location:", preferredLocation.id);
                    setSelectedLocation(preferredLocation.id);
                } else if (preferredOrgId) {
                    const preferredOrgLocation = locs.find(
                        (loc: { org_id: string }) => loc.org_id === preferredOrgId
                    );
                    if (preferredOrgLocation) {
                        console.log("[fetchLocations] Using preferred org location:", preferredOrgLocation.id);
                        setSelectedLocation(preferredOrgLocation.id);
                    } else {
                        console.log("[fetchLocations] Using first location:", locs[0].id);
                        setSelectedLocation(locs[0].id);
                    }
                } else {
                    console.log("[fetchLocations] Using first location:", locs[0].id);
                    setSelectedLocation(locs[0].id);
                }
            } else {
                console.log("[fetchLocations] No locations found");
            }
        } catch (e) {
            console.error("[fetchLocations] Error:", e);
        } finally {
            console.log("[fetchLocations] Setting loading to false");
            // Always clear loading state
            setLoading(false);
        }
    };

    const fetchMenus = async () => {
        if (!selectedLocation) return;
        setLoading(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/menus/?location_id=${selectedLocation}`, {
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

    const handleCreateMenu = async (name: string) => {
        if (!name || !selectedLocation) return;
        setIsCreating(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/menus/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name,
                    // Slug is optional now, backend handles it or we can omit
                    location_id: selectedLocation
                })
            });

            if (res.ok) {
                fetchMenus();
            } else {
                const err = await res.json();
                alert(`Failed to create menu: ${err.detail || 'Unknown error'}`);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsCreating(false);
        }
    };

    if (loading && !menus.length && !selectedLocation) return <div className="text-white/40">Loading context...</div>;

    return (
        <div>
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight mb-2">Menus</h1>
                    <p className="text-[var(--cms-muted)]">Manage your restaurant's menus.</p>
                </div>
                <div className="flex items-center gap-3">
                    {locations.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-[var(--cms-muted)]">Location:</span>
                            <select
                                value={selectedLocation}
                                onChange={(e) => setSelectedLocation(e.target.value)}
                                className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-lg px-3 py-2 text-sm text-[var(--cms-text)] focus:outline-none"
                            >
                                {locations.map(loc => (
                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <button
                        onClick={async () => {
                            if (!selectedLocation) return;
                            const name = window.prompt("Menu name");
                            if (!name || !name.trim()) return;
                            handleCreateMenu(name.trim());
                        }}
                        disabled={isCreating || !selectedLocation}
                        className="bg-[var(--cms-text)] text-[var(--cms-bg)] px-4 py-2 rounded-lg font-bold hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
                    >
                        {isCreating && <Loader2 className="w-4 h-4 animate-spin" />}
                        Create
                    </button>
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
