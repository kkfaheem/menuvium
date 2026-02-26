"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchUserAttributes } from "aws-amplify/auth";
import CreateMenuFlow from "@/components/menus/CreateMenuFlow";
import { getApiBase } from "@/lib/apiBase";
import { getJwtSub } from "@/lib/jwt";
import { getAuthToken } from "@/lib/authToken";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

export default function OnboardingPage() {
    const { user, signOut } = useAuthenticator((context) => [context.user]);
    const router = useRouter();
    const { toast } = useToast();

    const [mounted, setMounted] = useState(false);
    const [step, setStep] = useState(1);
    const [orgId, setOrgId] = useState<string | null>(null);
    const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
    const [orgMode, setOrgMode] = useState<"create" | "select">("create");
    const [selectedOrgId, setSelectedOrgId] = useState("");
    const [formData, setFormData] = useState({
        orgName: "",
        menuName: ""
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (!user) {
            router.push('/login');
        }
    }, [user, router]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mode = localStorage.getItem("menuvium_user_mode");
        if (mode === "manager") {
            router.push("/dashboard/menus");
        }
    }, [router]);

    // Removed legacy theme effect

    useEffect(() => {
        if (!user) return;
        const checkExistingMenus = async () => {
            try {
                const apiBase = getApiBase();
                const token = await getAuthToken();
                const orgRes = await fetch(`${apiBase}/organizations/`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!orgRes.ok) return;
                const orgs = await orgRes.json();
                const userSub = getJwtSub(token);
                const ownedOrgs = userSub ? orgs.filter((org: { owner_id?: string }) => org.owner_id === userSub) : [];
                if (!ownedOrgs.length) return;
                const menuLists = await Promise.all(
                    ownedOrgs.map((org: { id: string }) =>
                        fetch(`${apiBase}/menus/?org_id=${org.id}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        }).then((res) => (res.ok ? res.json() : []))
                    )
                );
                const hasMenus = menuLists.flat().length > 0;
                if (hasMenus) {
                    router.push("/dashboard/menus");
                }
            } catch (e) {
                console.error(e);
            }
        };
        checkExistingMenus();
    }, [user, router]);

    useEffect(() => {
        if (!user) return;
        const loadOrganizations = async () => {
            try {
                const apiBase = getApiBase();
                const token = await getAuthToken();
                const orgRes = await fetch(`${apiBase}/organizations/`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!orgRes.ok) return;
                const data = await orgRes.json();
                const userSub = getJwtSub(token);
                const ownedOrgs = userSub ? data.filter((org: { owner_id?: string }) => org.owner_id === userSub) : [];
                setOrgs(ownedOrgs);
                if (ownedOrgs.length > 0) {
                    const preferredOrgId =
                        typeof window !== "undefined" ? localStorage.getItem("menuvium_last_org_id") : null;
                    const nextOrgId =
                        preferredOrgId && ownedOrgs.find((org: { id: string }) => org.id === preferredOrgId)
                            ? preferredOrgId
                            : ownedOrgs[0].id;
                    setSelectedOrgId(nextOrgId);
                    setOrgMode("select");
                } else {
                    setOrgMode("create");
                }
            } catch (e) {
                console.error(e);
            }
        };
        loadOrganizations();
    }, [user]);

    const handleCreateOrg = async () => {
        setLoading(true);
        try {
            const apiBase = getApiBase();
            const token = await getAuthToken();
            const username = user?.username || "user";

            const res = await fetch(`${apiBase}/organizations/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: formData.orgName,
                    slug: formData.orgName.toLowerCase().replace(/\s+/g, '-'),
                    owner_id: username
                })
            });

            if (res.ok) {
                const data = await res.json();
                setOrgId(data.id);
                if (typeof window !== "undefined") {
                    localStorage.setItem("menuvium_last_org_id", data.id);
                }
                setStep(2);
            } else {
                const contentType = res.headers.get("content-type") || "";
                let detail = `HTTP ${res.status} ${res.statusText}`.trim();

                if (contentType.includes("application/json")) {
                    const err = await res
                        .json()
                        .catch(() => null);
                    if (err && typeof err === "object" && "detail" in err) {
                        const maybeDetail = (err as { detail?: unknown }).detail;
                        if (typeof maybeDetail === "string" && maybeDetail.trim()) {
                            detail = maybeDetail;
                        } else if (maybeDetail != null) {
                            detail = JSON.stringify(maybeDetail);
                        }
                    } else if (err != null) {
                        detail = JSON.stringify(err);
                    }
                } else {
                    const text = await res.text().catch(() => "");
                    if (text.trim()) detail = text.trim();
                }

                toast({
                    variant: "error",
                    title: "Failed to create company",
                    description: detail || "Unknown error",
                });
            }
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Could not reach the API",
                description: "Please try again in a moment.",
            });
        } finally {
            setLoading(false);
        }
    };

    const hasMenusForOrg = async (targetOrgId: string) => {
        try {
            const apiBase = getApiBase();
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/menus/?org_id=${targetOrgId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return false;
            const data = await res.json();
            return Array.isArray(data) && data.length > 0;
        } catch (e) {
            console.error(e);
            return false;
        }
    };

    const [displayName, setDisplayName] = useState("");

    useEffect(() => {
        const loadProfile = async () => {
            if (!user) return;
            try {
                const attrs = await fetchUserAttributes();
                const name = attrs.name || attrs.preferred_username || attrs.email || user.username;
                setDisplayName(name || "Menuvium Owner");
            } catch {
                setDisplayName(user.username || "Menuvium Owner");
            }
        };
        loadProfile();
    }, [user]);
    const onboardingOrganizations = useMemo(() => {
        if (!orgId) return [];
        const selectedName =
            orgs.find((org) => org.id === orgId)?.name || formData.orgName || "Company";
        return [{ id: orgId, name: selectedName }];
    }, [orgId, formData.orgName, orgs]);

    if (!mounted) return <div className="min-h-screen bg-background" />;
    if (!user) return null;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="sticky top-0 z-40 border-b border-border bg-panel/90 supports-[backdrop-filter]:bg-panel/80 backdrop-blur-xl">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted">Onboarding</p>
                        <h1 className="mt-1 truncate font-heading text-2xl font-bold tracking-tight sm:text-3xl">
                            Welcome,{" "}
                            {displayName ? (
                                <span className="text-[var(--cms-accent-strong)]">{displayName}</span>
                            ) : (
                                <span className="inline-block h-[1.1em] w-28 animate-pulse rounded-lg bg-pill align-middle" aria-hidden />
                            )}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <ThemeToggle />
                        <Button variant="ghost" size="sm" onClick={() => signOut()}>
                            Sign out
                        </Button>
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
                <div className={cn("w-full", step === 3 ? "max-w-5xl" : "max-w-xl")}>
                    <div className="mb-4 flex items-center gap-3">
                        <Badge variant="accent">Step {step} of 3</Badge>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-pill">
                            <div
                                className="h-full rounded-full bg-[var(--cms-accent)] transition-all"
                                style={{ width: `${Math.max(1, Math.min(100, (step / 3) * 100))}%` }}
                            />
                        </div>
                    </div>

                    <Card>
                        {step === 1 ? (
                            <>
                                <CardHeader>
                                    <CardTitle>Choose a company</CardTitle>
                                    <CardDescription>Create a new company or pick an existing one.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-5">
                                    {orgs.length > 0 ? (
                                        <div className="inline-flex rounded-xl border border-border bg-panelStrong p-1 text-xs font-semibold">
                                            <button
                                                type="button"
                                                onClick={() => setOrgMode("select")}
                                                className={cn(
                                                    "rounded-lg px-4 py-2 transition-colors",
                                                    orgMode === "select"
                                                        ? "bg-panel text-foreground shadow-sm"
                                                        : "text-muted hover:text-foreground"
                                                )}
                                            >
                                                Existing
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setOrgMode("create")}
                                                className={cn(
                                                    "rounded-lg px-4 py-2 transition-colors",
                                                    orgMode === "create"
                                                        ? "bg-panel text-foreground shadow-sm"
                                                        : "text-muted hover:text-foreground"
                                                )}
                                            >
                                                New
                                            </button>
                                        </div>
                                    ) : null}

                                    {orgMode === "select" && orgs.length > 0 ? (
                                        <div className="space-y-4">
                                            <select
                                                value={selectedOrgId}
                                                onChange={(e) => setSelectedOrgId(e.target.value)}
                                                className="h-11 w-full rounded-xl border border-border bg-panel px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)]/25 focus:border-[var(--cms-accent)]"
                                            >
                                                {orgs.map((org) => (
                                                    <option key={org.id} value={org.id}>
                                                        {org.name}
                                                    </option>
                                                ))}
                                            </select>

                                            <Button
                                                className="w-full"
                                                size="lg"
                                                loading={loading}
                                                onClick={() => {
                                                    if (!selectedOrgId) return;
                                                    setLoading(true);
                                                    const continueFlow = async () => {
                                                        const hasMenus = await hasMenusForOrg(selectedOrgId);
                                                        if (hasMenus) {
                                                            router.push("/dashboard/menus");
                                                            return;
                                                        }
                                                        setOrgId(selectedOrgId);
                                                        if (typeof window !== "undefined") {
                                                            localStorage.setItem("menuvium_last_org_id", selectedOrgId);
                                                        }
                                                        setStep(2);
                                                    };
                                                    continueFlow().finally(() => setLoading(false));
                                                }}
                                            >
                                                Continue
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <Input
                                                className="h-11 px-4"
                                                placeholder="e.g. Mario's Pizza"
                                                value={formData.orgName}
                                                onChange={(e) => setFormData({ ...formData, orgName: e.target.value })}
                                            />
                                            <Button
                                                className="w-full"
                                                size="lg"
                                                loading={loading}
                                                disabled={!formData.orgName}
                                                onClick={handleCreateOrg}
                                            >
                                                Continue
                                            </Button>
                                        </div>
                                    )}
                                </CardContent>
                            </>
                        ) : null}

                        {step === 2 ? (
                            <>
                                <CardHeader>
                                    <CardTitle>Name your first menu</CardTitle>
                                    <CardDescription>Pick a name that matches when it’s served.</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <Input
                                        className="h-11 px-4"
                                        placeholder="e.g. Dinner, Weekend Brunch"
                                        value={formData.menuName}
                                        onChange={(e) => setFormData({ ...formData, menuName: e.target.value })}
                                    />
                                    <Button
                                        className="w-full"
                                        size="lg"
                                        disabled={!formData.menuName}
                                        onClick={() => setStep(3)}
                                    >
                                        Choose how to build
                                    </Button>
                                </CardContent>
                            </>
                        ) : null}

                        {step === 3 ? (
                            <CardContent className="space-y-6">
                                <CreateMenuFlow
                                    variant="auto"
                                    allowOrgSelect={false}
                                    initialOrgId={orgId || undefined}
                                    organizations={onboardingOrganizations}
                                    initialMenuName={formData.menuName}
                                    lockMenuName
                                    showMenuDetails={false}
                                    heroLabel="Creation Mode"
                                    heroTitle="Choose how to build it"
                                    heroDescription="Pick one path. You can always switch later inside the editor."
                                    onCreated={(menuId) => router.push(`/dashboard/menus/${menuId}`)}
                                />
                            </CardContent>
                        ) : null}
                    </Card>
                </div>
            </main>
        </div>
    );
}
