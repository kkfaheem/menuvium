"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchAuthSession, fetchUserAttributes } from "aws-amplify/auth";
import CreateMenuFlow from "@/components/menus/CreateMenuFlow";
import { Fraunces, Space_Grotesk } from "next/font/google";
import { getApiBase } from "@/lib/apiBase";
import { getJwtSub } from "@/lib/jwt";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["600", "700"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"] });

type CmsTheme = "dark" | "light";

export default function OnboardingPage() {
    const { user, signOut } = useAuthenticator((context) => [context.user]);
    const router = useRouter();

    const [mounted, setMounted] = useState(false);
    const [step, setStep] = useState(1);
    const [orgId, setOrgId] = useState<string | null>(null);
    const [cmsTheme, setCmsTheme] = useState<CmsTheme>("dark");
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

    useEffect(() => {
        if (typeof window === "undefined") return;
        const savedTheme = (localStorage.getItem("menuvium_cms_theme") as CmsTheme) || "dark";
        setCmsTheme(savedTheme);
        document.documentElement.dataset.cmsTheme = savedTheme;
    }, []);

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

    const getAuthToken = async () => {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();
        if (!token) {
            throw new Error("Not authenticated");
        }
        return token;
    };

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
                const err = await res.json();
                alert(`Failed to create org: ${err.detail || 'Unknown error'}`);
            }
        } catch (e) {
            console.error(e);
            alert("Error connecting to API. Is the backend running?");
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

    const [displayName, setDisplayName] = useState("Menuvium Owner");

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

    if (!mounted) return <div className="min-h-screen bg-[#0a0a0a]" />;
    if (!user) return null;

    const isLight = cmsTheme === "light";

    return (
        <div className={`min-h-screen bg-[var(--cms-bg)] text-[var(--cms-text)] ${spaceGrotesk.className}`}>
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className={`absolute -top-32 -left-24 h-72 w-72 rounded-full blur-[120px] float-slow ${isLight ? "bg-emerald-500/15" : "bg-emerald-400/10"}`} />
                <div className={`absolute top-1/3 -right-20 h-64 w-64 rounded-full blur-[120px] float-medium ${isLight ? "bg-sky-500/12" : "bg-blue-500/10"}`} />
                <div className={`absolute bottom-[-160px] left-1/3 h-80 w-80 rounded-full blur-[150px] float-slow ${isLight ? "bg-violet-500/10" : "bg-purple-500/10"}`} />
                <div className="absolute inset-0 opacity-10 gradient-shift bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_55%),linear-gradient(120deg,_rgba(59,130,246,0.12),_rgba(16,185,129,0.1),_rgba(236,72,153,0.08))]" />
            </div>

            <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-16">
                <div className="flex flex-wrap items-center justify-between gap-6">
                    <div>
                        <p className="text-[var(--cms-muted)] text-sm uppercase tracking-[0.4em] mb-2">Onboarding</p>
                        <h1 className={`text-3xl md:text-4xl font-bold tracking-tight ${fraunces.className}`}>
                            Welcome, <span className={isLight ? "text-sky-600" : "text-blue-400"}>{displayName}</span>
                        </h1>
                    </div>
                    <button
                        onClick={() => signOut()}
                        className="text-sm text-[var(--cms-muted)] hover:text-[var(--cms-text)] transition-colors underline decoration-[var(--cms-border)] underline-offset-4"
                    >
                        Sign Out
                    </button>
                </div>

                <div className={`w-full ${step === 3 ? "max-w-5xl" : "max-w-lg"} transition-all duration-300`}>
                    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.4em] text-[var(--cms-muted)] mb-4">
                        <span className="inline-flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60 animate-ping" />
                                <span className={`relative inline-flex h-2 w-2 rounded-full ${isLight ? "bg-sky-600" : "bg-blue-400"}`} />
                            </span>
                            Step {step} of 3
                        </span>
                        <span className="h-px flex-1 bg-[var(--cms-border)]" />
                    </div>

                    <div className="bg-[var(--cms-panel)]/90 border border-[var(--cms-border)] p-8 rounded-[28px] shadow-[0_40px_120px_-60px_rgba(0,0,0,0.6)] backdrop-blur-sm">
                        {step === 1 && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className={`text-2xl font-bold mb-2 ${fraunces.className}`}>Choose a company</h2>
                                    <p className="text-[var(--cms-muted)] text-sm">Create a new company or pick an existing one.</p>
                                </div>
                                {orgs.length > 0 && (
                                    <div className="inline-flex rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] p-1 text-xs font-semibold">
                                        <button
                                            onClick={() => setOrgMode("select")}
                                            className={`px-4 py-2 rounded-full transition-colors ${orgMode === "select" ? "bg-[var(--cms-text)] text-[var(--cms-bg)]" : "text-[var(--cms-muted)]"}`}
                                        >
                                            Existing
                                        </button>
                                        <button
                                            onClick={() => setOrgMode("create")}
                                            className={`px-4 py-2 rounded-full transition-colors ${orgMode === "create" ? "bg-[var(--cms-text)] text-[var(--cms-bg)]" : "text-[var(--cms-muted)]"}`}
                                        >
                                            New
                                        </button>
                                    </div>
                                )}
                                {orgMode === "select" && orgs.length > 0 ? (
                                    <div className="space-y-4">
                                        <select
                                            value={selectedOrgId}
                                            onChange={(e) => setSelectedOrgId(e.target.value)}
                                            className="w-full bg-[var(--cms-panel-strong)] border border-[var(--cms-border)] p-4 rounded-xl text-[var(--cms-text)] focus:outline-none focus:ring-2 focus:ring-sky-500/40 transition-all font-medium"
                                        >
                                            {orgs.map((org) => (
                                                <option key={org.id} value={org.id}>{org.name}</option>
                                            ))}
                                        </select>
                                        <button
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
                                            className="w-full bg-[var(--cms-accent-strong)] text-[#0b0c10] p-4 rounded-xl font-semibold hover:opacity-90 transition-all active:scale-[0.98]"
                                        >
                                            Continue
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <input
                                            className="w-full bg-[var(--cms-panel-strong)] border border-[var(--cms-border)] p-4 rounded-xl text-[var(--cms-text)] placeholder:text-[var(--cms-muted-strong)] focus:outline-none focus:ring-2 focus:ring-sky-500/40 transition-all font-medium"
                                            placeholder="e.g. Mario's Pizza"
                                            value={formData.orgName}
                                            onChange={e => setFormData({ ...formData, orgName: e.target.value })}
                                        />
                                        <button
                                            onClick={handleCreateOrg}
                                            disabled={loading || !formData.orgName}
                                            className="w-full bg-[var(--cms-accent-strong)] text-[#0b0c10] p-4 rounded-xl font-semibold hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.98]"
                                        >
                                            {loading ? "Creating..." : "Continue"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className={`text-2xl font-bold mb-2 ${fraunces.className}`}>Name your first menu</h2>
                                    <p className="text-[var(--cms-muted)] text-sm">Pick a name that matches when it’s served.</p>
                                </div>
                                <input
                                    className="w-full bg-[var(--cms-panel-strong)] border border-[var(--cms-border)] p-4 rounded-xl text-[var(--cms-text)] placeholder:text-[var(--cms-muted-strong)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all font-medium"
                                    placeholder="e.g. Dinner, Weekend Brunch"
                                    value={formData.menuName}
                                    onChange={e => setFormData({ ...formData, menuName: e.target.value })}
                                />
                                <button
                                    onClick={() => setStep(3)}
                                    disabled={!formData.menuName}
                                    className="w-full bg-[var(--cms-accent)] text-[#0b0c10] p-4 rounded-xl font-semibold hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.98]"
                                >
                                    Choose how to build
                                </button>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-6">
                                <CreateMenuFlow
                                    variant="dark"
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
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
