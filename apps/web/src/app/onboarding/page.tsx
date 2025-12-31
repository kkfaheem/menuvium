"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";

export default function OnboardingPage() {
    const { user, signOut } = useAuthenticator((context) => [context.user]);
    const router = useRouter();

    const [mounted, setMounted] = useState(false);
    const [isMock, setIsMock] = useState(false);
    const [step, setStep] = useState(1);
    const [orgId, setOrgId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        orgName: "",
        locName: "",
        menuName: "",
        address: "",
        phone: ""
    });
    const [loading, setLoading] = useState(false);
    const [locId, setLocId] = useState<string | null>(null);

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

    const getAuthToken = async () => {
        if (user) {
            const session: any = await (user as any).getSession();
            return session.getIdToken().getJwtToken();
        }
        return "mock-token";
    };

    const handleCreateOrg = async () => {
        setLoading(true);
        try {
            const token = await getAuthToken();
            const username = user?.username || "mock-user";

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

    const handleCreateLocation = async () => {
        if (!orgId) return;
        setLoading(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/organizations/${orgId}/locations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: formData.locName,
                    address: formData.address,
                    org_id: orgId
                })
            });

            if (res.ok) {
                const data = await res.json();
                setLocId(data.id);
                if (typeof window !== "undefined") {
                    localStorage.setItem("menuvium_last_location_id", data.id);
                }
                setStep(3);
            } else {
                const err = await res.json();
                alert(`Failed to create location: ${err.detail || 'Unknown error'}`);
            }
        } catch (e) {
            console.error(e);
            alert("Error connecting to API.");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateMenu = async () => {
        if (!locId) return;
        setLoading(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/menus/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: formData.menuName,
                    location_id: locId
                })
            });

            if (res.ok) {
                const data = await res.json();
                router.push(`/dashboard/menus/${data.id}`);
            } else {
                const err = await res.json();
                alert(`Failed to create menu: ${err.detail || 'Unknown error'}`);
            }
        } catch (e) {
            console.error(e);
            alert("Error connecting to API.");
        } finally {
            setLoading(false);
        }
    };

    const displayName = user?.username || "Mock Admin";

    if (!mounted) return <div className="min-h-screen bg-[#0a0a0a]" />;
    if (!user && !isMock) return null;

    return (
        <div className="flex min-h-screen flex-col items-center p-12 md:p-24 bg-[#0a0a0a] text-white">
            <div className="w-full max-w-md">
                <div className="flex justify-between items-center mb-12">
                    <div>
                        <p className="text-white/40 text-sm uppercase tracking-widest mb-1">Onboarding</p>
                        <h1 className="text-2xl font-bold tracking-tight">Welcome, <span className="text-blue-400">{displayName}</span></h1>
                    </div>
                    <button
                        onClick={() => {
                            if (isMock) {
                                localStorage.removeItem('menuvium_mock_user');
                                router.push('/');
                            } else {
                                signOut();
                            }
                        }}
                        className="text-sm text-white/40 hover:text-white transition-colors underline decoration-white/20 underline-offset-4"
                    >
                        Sign Out
                    </button>
                </div>

                <div className="bg-white/5 border border-white/10 p-8 rounded-3xl shadow-2xl backdrop-blur-sm">
                    {step === 1 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-xl font-bold mb-2">Create Organization</h2>
                                <p className="text-white/60 text-sm">Tell us the name of your restaurant or business.</p>
                            </div>
                            <input
                                className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium"
                                placeholder="e.g. Mario's Pizza"
                                value={formData.orgName}
                                onChange={e => setFormData({ ...formData, orgName: e.target.value })}
                            />
                            <button
                                onClick={handleCreateOrg}
                                disabled={loading || !formData.orgName}
                                className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-500 disabled:opacity-50 transition-all active:scale-[0.98]"
                            >
                                {loading ? "Creating..." : "Continue to Location"}
                            </button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-xl font-bold mb-2 text-green-400">Org Created!</h2>
                                <p className="text-white/60 text-sm">Now add your first physical location.</p>
                            </div>
                            <div className="space-y-4">
                                <input
                                    className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium"
                                    placeholder="Location Name (e.g. Downtown)"
                                    value={formData.locName}
                                    onChange={e => setFormData({ ...formData, locName: e.target.value })}
                                />
                                <input
                                    className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium"
                                    placeholder="Street Address"
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                />
                            </div>
                            <button
                                className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-500 disabled:opacity-50 transition-all active:scale-[0.98]"
                                onClick={handleCreateLocation}
                                disabled={loading || !formData.locName || !formData.address}
                            >
                                {loading ? "Saving..." : "Continue to Menu"}
                            </button>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-xl font-bold mb-2 text-green-400">Location Added!</h2>
                                <p className="text-white/60 text-sm">Finally, let's create your first menu.</p>
                            </div>
                            <input
                                className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium"
                                placeholder="Menu Name (e.g. Dinner Menu)"
                                value={formData.menuName}
                                onChange={e => setFormData({ ...formData, menuName: e.target.value })}
                            />
                            <button
                                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white p-4 rounded-xl font-bold hover:opacity-90 transition-all active:scale-[0.98]"
                                onClick={handleCreateMenu}
                                disabled={loading || !formData.menuName}
                            >
                                {loading ? "Creating..." : "Finish & Edit Menu"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
