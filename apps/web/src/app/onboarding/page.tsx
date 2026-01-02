"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchAuthSession, fetchUserAttributes } from "aws-amplify/auth";
import CreateMenuFlow from "@/components/menus/CreateMenuFlow";
import { Fraunces, Space_Grotesk } from "next/font/google";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["600", "700"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"] });

export default function OnboardingPage() {
    const { user, signOut } = useAuthenticator((context) => [context.user]);
    const router = useRouter();

    const [mounted, setMounted] = useState(false);
    const [step, setStep] = useState(1);
    const [orgId, setOrgId] = useState<string | null>(null);
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
        if (!user) return;
        const checkExistingMenus = async () => {
            try {
                const token = await getAuthToken();
                const orgRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/organizations/`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!orgRes.ok) return;
                const orgs = await orgRes.json();
                if (!orgs.length) return;
                const menusRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/menus/?org_id=${orgs[0].id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!menusRes.ok) return;
                const menus = await menusRes.json();
                if (menus.length) {
                    router.push("/dashboard/menus");
                }
            } catch (e) {
                console.error(e);
            }
        };
        checkExistingMenus();
    }, [user, router]);

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
            const token = await getAuthToken();
            const username = user?.username || "user";

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/organizations/`, {
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
        return [{ id: orgId, name: formData.orgName || "Company" }];
    }, [orgId, formData.orgName]);

    if (!mounted) return <div className="min-h-screen bg-[#0a0a0a]" />;
    if (!user) return null;

    return (
        <div className={`min-h-screen bg-[#0a0a0a] text-white ${spaceGrotesk.className}`}>
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-32 -left-24 h-72 w-72 rounded-full bg-emerald-400/10 blur-[120px] float-slow" />
                <div className="absolute top-1/3 -right-20 h-64 w-64 rounded-full bg-blue-500/10 blur-[120px] float-medium" />
                <div className="absolute bottom-[-160px] left-1/3 h-80 w-80 rounded-full bg-purple-500/10 blur-[150px] float-slow" />
                <div className="absolute inset-0 opacity-20 gradient-shift bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_50%),linear-gradient(120deg,_rgba(59,130,246,0.12),_rgba(16,185,129,0.08),_rgba(236,72,153,0.08))]" />
            </div>

            <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 py-16">
                <div className="flex flex-wrap items-center justify-between gap-6">
                    <div>
                        <p className="text-white/40 text-sm uppercase tracking-[0.4em] mb-2">Onboarding</p>
                        <h1 className={`text-3xl md:text-4xl font-bold tracking-tight ${fraunces.className}`}>
                            Welcome, <span className="text-blue-400">{displayName}</span>
                        </h1>
                    </div>
                    <button
                        onClick={() => signOut()}
                        className="text-sm text-white/40 hover:text-white transition-colors underline decoration-white/20 underline-offset-4"
                    >
                        Sign Out
                    </button>
                </div>

                <div className={`w-full ${step === 3 ? "max-w-5xl" : "max-w-lg"} transition-all duration-300`}>
                    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.4em] text-white/50 mb-4">
                        <span className="inline-flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60 animate-ping" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400" />
                            </span>
                            Step {step} of 3
                        </span>
                        <span className="h-px flex-1 bg-white/10" />
                    </div>

                    <div className="bg-white/5 border border-white/10 p-8 rounded-[28px] shadow-[0_40px_120px_-60px_rgba(0,0,0,0.8)] backdrop-blur-sm">
                        {step === 1 && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className={`text-2xl font-bold mb-2 ${fraunces.className}`}>Name your company</h2>
                                    <p className="text-white/60 text-sm">Tell us the name guests will recognize.</p>
                                </div>
                                <input
                                    className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium"
                                    placeholder="e.g. Mario's Pizza"
                                    value={formData.orgName}
                                    onChange={e => setFormData({ ...formData, orgName: e.target.value })}
                                />
                                <button
                                    onClick={handleCreateOrg}
                                    disabled={loading || !formData.orgName}
                                    className="w-full bg-blue-600 text-white p-4 rounded-xl font-semibold hover:bg-blue-500 disabled:opacity-50 transition-all active:scale-[0.98]"
                                >
                                    {loading ? "Creating..." : "Continue"}
                                </button>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className={`text-2xl font-bold mb-2 ${fraunces.className}`}>Name your first menu</h2>
                                    <p className="text-white/60 text-sm">Pick a name that matches when it’s served.</p>
                                </div>
                                <input
                                    className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all font-medium"
                                    placeholder="e.g. Dinner, Weekend Brunch"
                                    value={formData.menuName}
                                    onChange={e => setFormData({ ...formData, menuName: e.target.value })}
                                />
                                <button
                                    onClick={() => setStep(3)}
                                    disabled={!formData.menuName}
                                    className="w-full bg-emerald-500 text-black p-4 rounded-xl font-semibold hover:bg-emerald-400 disabled:opacity-50 transition-all active:scale-[0.98]"
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
