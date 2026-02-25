"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Mail, Shield, Trash2, UserPlus, X } from "lucide-react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { getApiBase } from "@/lib/apiBase";
import { fetchOrgPermissions } from "@/lib/orgPermissions";
import { getAuthToken } from "@/lib/authToken";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";

type Company = { id: string; name: string };

type Member = {
    id: string;
    email: string;
    can_manage_availability: boolean;
    can_edit_items: boolean;
    can_manage_menus: boolean;
    created_at: string;
};

type MemberPatch = Partial<
    Pick<
        Member,
        "email" | "can_manage_availability" | "can_edit_items" | "can_manage_menus"
    >
>;

const permissionRows: Array<{
    key: keyof Pick<Member, "can_manage_availability" | "can_edit_items" | "can_manage_menus">;
    title: string;
    description: string;
}> = [
    {
        key: "can_manage_availability",
        title: "Availability",
        description: "Can mark items sold out / available."
    },
    {
        key: "can_edit_items",
        title: "Items",
        description: "Can add/edit item name, price, photo, tags."
    },
    {
        key: "can_manage_menus",
        title: "Menus",
        description: "Can create menus, edit categories, reorder."
    }
];

export default function CompanyDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuthenticator((context) => [context.user]);
    const confirm = useConfirm();
    const { toast } = useToast();

    const orgId = params.id as string;
    const apiBase = getApiBase();

    const [company, setCompany] = useState<Company | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [inviteEmail, setInviteEmail] = useState("");
    const [invitePermissions, setInvitePermissions] = useState<
        Pick<Member, "can_manage_availability" | "can_edit_items" | "can_manage_menus">
    >({
        can_manage_availability: true,
        can_edit_items: true,
        can_manage_menus: false
    });

    const load = async () => {
        if (!user || !orgId) return;
        setLoading(true);
        setError(null);
        try {
            const token = await getAuthToken();
            const orgRes = await fetch(`${apiBase}/organizations/`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!orgRes.ok) throw new Error("Failed to load companies");
            const orgs = (await orgRes.json()) as Company[];
            const org = orgs.find((o) => o.id === orgId) || null;
            setCompany(org);

            const perms = await fetchOrgPermissions({ apiBase, token, orgId });
            if (!perms.can_manage_users) {
                setMembers([]);
                setError("Admins only: you don’t have permission to manage team members for this company.");
                return;
            }

            const memberRes = await fetch(`${apiBase}/organizations/${orgId}/members`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!memberRes.ok) {
                const err = await memberRes.json().catch(() => ({}));
                throw new Error(err.detail || "Failed to load members");
            }
            setMembers(await memberRes.json());
        } catch (e) {
            console.error(e);
            setError(e instanceof Error ? e.message : "Failed to load company");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, [user, orgId]);

    const toggleInvitePermission = (key: keyof typeof invitePermissions) => {
        setInvitePermissions((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const createInvite = async () => {
        const email = inviteEmail.trim().toLowerCase();
        if (!email) return;
        setSaving(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/organizations/${orgId}/members`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ email, ...invitePermissions })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err ? (err as any).detail : undefined;
                toast({
                    variant: "error",
                    title: "Failed to add user",
                    description: typeof detail === "string" ? detail : "Please try again.",
                });
                return;
            }
            const created = await res.json();
            setMembers((prev) => [created, ...prev]);
            setInviteEmail("");
            toast({ variant: "success", title: "User added" });
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to add user",
                description: "Please try again in a moment.",
            });
        } finally {
            setSaving(false);
        }
    };

    const updateMember = async (member: Member, patch: MemberPatch) => {
        setSaving(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/organizations/${orgId}/members/${member.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(patch)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err ? (err as any).detail : undefined;
                toast({
                    variant: "error",
                    title: "Failed to update permissions",
                    description: typeof detail === "string" ? detail : "Please try again.",
                });
                return;
            }
            const updated = await res.json();
            setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
            toast({ variant: "success", title: "Permissions updated" });
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to update permissions",
                description: "Please try again in a moment.",
            });
        } finally {
            setSaving(false);
        }
    };

    const removeMember = async (member: Member) => {
        const ok = await confirm({
            title: "Remove team member?",
            description: `Remove ${member.email} from this company.`,
            confirmLabel: "Remove",
            variant: "destructive",
        });
        if (!ok) return;
        setSaving(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/organizations/${orgId}/members/${member.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err ? (err as any).detail : undefined;
                toast({
                    variant: "error",
                    title: "Failed to remove user",
                    description: typeof detail === "string" ? detail : "Please try again.",
                });
                return;
            }
            setMembers((prev) => prev.filter((m) => m.id !== member.id));
            toast({ variant: "success", title: "User removed" });
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to remove user",
                description: "Please try again in a moment.",
            });
        } finally {
            setSaving(false);
        }
    };

    const headerName = company?.name || "Company";

    const sortedMembers = useMemo(() => {
        return members.slice().sort((a, b) => a.email.localeCompare(b.email));
    }, [members]);

    if (loading) {
        return (
            <div className="text-[var(--cms-muted)] flex items-center gap-2">
                <Loader2 className="animate-spin" /> Loading…
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl mr-auto space-y-8">
            <header className="space-y-3">
                <Link
                    href="/dashboard/companies"
                    className="text-sm text-[var(--cms-muted)] hover:text-[var(--cms-text)] inline-flex items-center gap-1 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Companies
                </Link>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">{headerName}</h1>
                        <p className="text-sm text-[var(--cms-muted)]">
                            Add teammates by email and set what they can do.
                        </p>
                    </div>
                </div>
            </header>

            {error && (
                <section className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-3xl p-6">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-[var(--cms-pill)] flex items-center justify-center">
                            <Shield className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="font-semibold">Access restricted</p>
                            <p className="text-sm text-[var(--cms-muted)] mt-1">{error}</p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Link
                                    href="/dashboard/mode"
                                    className="px-4 py-2 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] text-sm font-semibold hover:bg-[var(--cms-pill)]"
                                >
                                    Switch mode
                                </Link>
                                <Link
                                    href="/dashboard/companies"
                                    className="px-4 py-2 rounded-xl border border-[var(--cms-border)] text-sm font-semibold hover:bg-[var(--cms-pill)]"
                                >
                                    Back to Companies
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {!error && (
                <>
                    <section className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-3xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <UserPlus className="w-5 h-5" />
                        <h2 className="text-lg font-bold">Invite user</h2>
                    </div>
                    <span className="text-xs text-[var(--cms-muted)]">Email must match their login email.</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--cms-muted)]">
                            <Mail className="w-4 h-4" />
                        </div>
                        <input
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="teammate@restaurant.com"
                            className="w-full bg-[var(--cms-panel-strong)] border border-[var(--cms-border)] rounded-2xl pl-10 pr-4 py-3 focus:outline-none focus:border-[var(--cms-text)]"
                        />
                    </div>
                    <button
                        onClick={createInvite}
                        disabled={saving || !inviteEmail.trim()}
                        className="px-5 py-3 rounded-2xl font-semibold bg-[var(--cms-text)] text-[var(--cms-bg)] disabled:opacity-50 inline-flex items-center justify-center gap-2 w-full sm:w-auto"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Invite
                    </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                    {permissionRows.map((row) => (
                        <button
                            key={row.key}
                            type="button"
                            onClick={() => toggleInvitePermission(row.key)}
                            className="text-left rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-4 py-3 hover:bg-[var(--cms-pill)] transition-colors"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="font-semibold">{row.title}</div>
                                    <div className="text-xs text-[var(--cms-muted)]">{row.description}</div>
                                </div>
                                <span
                                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${invitePermissions[row.key] ? "bg-[var(--cms-text)]" : "bg-[var(--cms-border)]"}`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 rounded-full bg-[var(--cms-bg)] shadow transition-transform ${invitePermissions[row.key] ? "translate-x-5" : "translate-x-1"}`}
                                    />
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
                    </section>

                    <section className="space-y-4">
                <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    <h2 className="text-lg font-bold">Team members</h2>
                </div>

                {!sortedMembers.length ? (
                    <div className="text-sm text-[var(--cms-muted)]">No invited users yet.</div>
                ) : (
                    <div className="space-y-3">
                        {sortedMembers.map((member) => (
                            <div
                                key={member.id}
                                className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-3xl p-5 space-y-4"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="font-semibold">{member.email}</div>
                                        <div className="text-xs text-[var(--cms-muted)]">Permissions</div>
                                    </div>
                                    <button
                                        onClick={() => removeMember(member)}
                                        disabled={saving}
                                        className="h-10 w-10 rounded-full border border-[var(--cms-border)] text-red-400 hover:text-red-300 hover:bg-red-500/10 inline-flex items-center justify-center disabled:opacity-50"
                                        title="Remove"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    {permissionRows.map((row) => {
                                        const enabled = member[row.key];
                                        return (
                                            <button
                                                key={`${member.id}-${row.key}`}
                                                type="button"
                                                onClick={() => updateMember(member, { [row.key]: !enabled })}
                                                disabled={saving}
                                                className="text-left rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-4 py-3 hover:bg-[var(--cms-pill)] transition-colors disabled:opacity-60"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <div className="font-semibold">{row.title}</div>
                                                        <div className="text-xs text-[var(--cms-muted)]">{row.description}</div>
                                                    </div>
                                                    <span
                                                        className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${enabled ? "bg-[var(--cms-text)]" : "bg-[var(--cms-border)]"}`}
                                                    >
                                                        <span
                                                            className={`inline-block h-4 w-4 rounded-full bg-[var(--cms-bg)] shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-1"}`}
                                                        />
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                    </section>
                </>
            )}

            <button
                onClick={() => router.push("/dashboard/menus")}
                className="inline-flex items-center gap-2 text-sm text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
            >
                <X className="w-4 h-4" />
                Done
            </button>
        </div>
    );
}
