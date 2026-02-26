"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchUserAttributes } from "aws-amplify/auth";
import { Briefcase, ShieldCheck } from "lucide-react";
import { getApiBase } from "@/lib/apiBase";
import { getJwtSub } from "@/lib/jwt";
import { getAuthToken } from "@/lib/authToken";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type Mode = "admin" | "manager";

export default function ModeSelectPage() {
    const router = useRouter();
    const { user, signOut } = useAuthenticator((context) => [context.user]);
    const [displayName, setDisplayName] = useState("");
    const [loading, setLoading] = useState(true);
    const [ownedOrgCount, setOwnedOrgCount] = useState(0);
    const [memberOrgCount, setMemberOrgCount] = useState(0);

    const apiBase = getApiBase();

    useEffect(() => {
        if (!user) {
            router.push("/login");
        }
    }, [user, router]);

    useEffect(() => {
        const load = async () => {
            if (!user) return;
            setLoading(true);
            try {
                const attrs = await fetchUserAttributes();
                const name = attrs.name || attrs.preferred_username || attrs.email || user.username;
                setDisplayName(name || "User");
            } catch {
                setDisplayName(user.username || "User");
            }

            try {
                const token = await getAuthToken();
                const orgRes = await fetch(`${apiBase}/organizations/`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!orgRes.ok) return;
                const orgs = await orgRes.json();
                const list = Array.isArray(orgs) ? orgs : [];
                const userSub = getJwtSub(token);
                const owned = userSub ? list.filter((org: { owner_id?: string }) => org.owner_id === userSub) : [];
                setOwnedOrgCount(owned.length);
                setMemberOrgCount(Math.max(0, list.length - owned.length));
            } catch {
                setOwnedOrgCount(0);
                setMemberOrgCount(0);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [user, apiBase]);

    const chooseMode = (mode: Mode) => {
        if (typeof window !== "undefined") {
            localStorage.setItem("menuvium_user_mode", mode);
        }
        if (mode === "manager") {
            router.push("/dashboard/menus");
            return;
        }
        router.push(ownedOrgCount > 0 ? "/dashboard/menus" : "/onboarding");
    };

    const subtitle = useMemo(() => {
        if (loading) return "Loading your account…";
        if (ownedOrgCount > 0) return "Choose how you want to use Menuvium today.";
        if (memberOrgCount > 0) return "You’re on a team. Choose Manager to work on assigned menus, or Admin to create your own company.";
        return "Choose a mode. Admin can create your company and first menu.";
    }, [loading, ownedOrgCount, memberOrgCount]);

    return (
        <div className="w-full max-w-4xl mr-auto space-y-8">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <Badge variant="outline">Account</Badge>
                    <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
                        Welcome,{" "}
                        {displayName ? (
                            <span className="text-[var(--cms-accent-strong)]">{displayName}</span>
                        ) : (
                            <span className="inline-block h-[1.1em] w-28 animate-pulse rounded-lg bg-pill align-middle" aria-hidden />
                        )}
                    </h1>
                    <p className="text-sm text-muted mt-2">{subtitle}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => signOut()}>
                    Sign out
                </Button>
            </header>

            <div className="grid gap-5 md:grid-cols-2">
                <button
                    onClick={() => chooseMode("admin")}
                    className="text-left rounded-2xl border border-border bg-panel p-6 shadow-sm transition-colors hover:bg-panelStrong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/25"
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-pill flex items-center justify-center">
                            <ShieldCheck className="w-6 h-6" />
                        </div>
                        <Badge variant="accent">Admin</Badge>
                    </div>
                    <h2 className="mt-4 text-xl font-bold">Owner / Admin</h2>
                    <p className="mt-2 text-sm text-muted leading-relaxed">
                        Create companies and menus, invite teammates, and control everything.
                    </p>
                    {memberOrgCount > 0 && ownedOrgCount === 0 && (
                        <p className="mt-3 text-xs text-muted">
                            Note: Admin mode shows only companies you own (not ones you’re invited to).
                        </p>
                    )}
                    <ul className="mt-4 space-y-2 text-sm text-muted">
                        <li>• Create companies & menus</li>
                        <li>• Invite users and assign permissions</li>
                        <li>• Themes, settings, exports</li>
                    </ul>
                </button>

                <button
                    onClick={() => chooseMode("manager")}
                    className="text-left rounded-2xl border border-border bg-panel p-6 shadow-sm transition-colors hover:bg-panelStrong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/25"
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-pill flex items-center justify-center">
                            <Briefcase className="w-6 h-6" />
                        </div>
                        <Badge variant="outline">Manager</Badge>
                    </div>
                    <h2 className="mt-4 text-xl font-bold">Menu Manager</h2>
                    <p className="mt-2 text-sm text-muted leading-relaxed">
                        Manage menus you’ve been granted access to. You’ll only see what you’re allowed to edit.
                    </p>
                    <ul className="mt-4 space-y-2 text-sm text-muted">
                        <li>• Update items & availability (as allowed)</li>
                        <li>• Access only assigned companies</li>
                        <li>• No admin-only screens</li>
                    </ul>
                </button>
            </div>

            <div className="text-xs text-muted">
                Tip: you can switch modes anytime from this page.{" "}
                <Link href="/dashboard/mode" className="underline underline-offset-4 hover:text-foreground">
                    Bookmark
                </Link>
                .
            </div>
        </div>
    );
}
