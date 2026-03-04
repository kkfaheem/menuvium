"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Mail, MapPin, Shield, Trash2, UserPlus } from "lucide-react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { getApiBase } from "@/lib/apiBase";
import { fetchOrgPermissions } from "@/lib/orgPermissions";
import { getAuthToken } from "@/lib/authToken";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { cn } from "@/lib/cn";

type Company = {
    id: string;
    name: string;
    slug: string;
    address?: string | null;
};

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

type AddressSuggestion = {
    place_id: number;
    display_name: string;
};

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

const slugify = (value: string) =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");

export default function CompanyDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuthenticator((context) => [context.user]);
    const confirm = useConfirm();
    const { toast } = useToast();

    const orgId = params.id as string;
    const apiBase = getApiBase();

    const [activeTab, setActiveTab] = useState<"details" | "team">("details");

    const [company, setCompany] = useState<Company | null>(null);
    const [orgPermissions, setOrgPermissions] = useState<{
        can_manage_users: boolean;
    } | null>(null);

    const [members, setMembers] = useState<Member[]>([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isSavingDetails, setIsSavingDetails] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [membersError, setMembersError] = useState<string | null>(null);

    const [companyNameDraft, setCompanyNameDraft] = useState("");
    const [companyAddressDraft, setCompanyAddressDraft] = useState("");

    const [addressSearch, setAddressSearch] = useState("");
    const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
    const [addressLoading, setAddressLoading] = useState(false);
    const [addressDropdownOpen, setAddressDropdownOpen] = useState(false);
    const addressPickerRef = useRef<HTMLDivElement | null>(null);

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
        setMembersError(null);
        try {
            const token = await getAuthToken();
            const orgRes = await fetch(`${apiBase}/organizations/`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!orgRes.ok) {
                throw new Error("Failed to load companies");
            }

            const orgs = (await orgRes.json()) as Company[];
            const org = orgs.find((o) => o.id === orgId) || null;
            if (!org) {
                throw new Error("Company not found");
            }

            setCompany(org);
            setCompanyNameDraft(org.name);
            const nextAddress = org.address || "";
            setCompanyAddressDraft(nextAddress);
            setAddressSearch(nextAddress);

            const perms = await fetchOrgPermissions({ apiBase, token, orgId });
            setOrgPermissions({ can_manage_users: perms.can_manage_users });

            if (!perms.can_manage_users) {
                setMembers([]);
                setMembersError("You don’t have permission to manage team members for this company.");
                return;
            }

            const memberRes = await fetch(`${apiBase}/organizations/${orgId}/members`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!memberRes.ok) {
                const err = await memberRes.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err
                        ? (err as { detail?: unknown }).detail
                        : undefined;
                throw new Error(typeof detail === "string" ? detail : "Failed to load members");
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
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, orgId]);

    useEffect(() => {
        if (!addressDropdownOpen) return;
        const query = addressSearch.trim();
        if (query.length < 3) {
            setAddressSuggestions([]);
            setAddressLoading(false);
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            setAddressLoading(true);
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`,
                    {
                        signal: controller.signal,
                        headers: { Accept: "application/json" }
                    }
                );
                if (!res.ok) {
                    setAddressSuggestions([]);
                    return;
                }
                const data = (await res.json()) as AddressSuggestion[];
                setAddressSuggestions(
                    Array.isArray(data)
                        ? data.map((item) => ({
                            place_id: Number(item.place_id),
                            display_name: item.display_name,
                        }))
                        : []
                );
            } catch (e) {
                if ((e as Error).name !== "AbortError") {
                    console.error("Address lookup failed", e);
                }
            } finally {
                setAddressLoading(false);
            }
        }, 250);

        return () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
    }, [addressSearch, addressDropdownOpen]);

    useEffect(() => {
        if (!addressDropdownOpen) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!addressPickerRef.current) return;
            if (!addressPickerRef.current.contains(event.target as Node)) {
                setAddressDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        return () => document.removeEventListener("mousedown", onPointerDown);
    }, [addressDropdownOpen]);

    const detailsDirty = useMemo(() => {
        if (!company) return false;
        return (
            companyNameDraft.trim() !== company.name ||
            companyAddressDraft.trim() !== (company.address || "")
        );
    }, [company, companyNameDraft, companyAddressDraft]);

    const canManageUsers = Boolean(orgPermissions?.can_manage_users);

    const saveDetails = async () => {
        if (!company) return;
        const nextName = companyNameDraft.trim();
        if (!nextName) {
            toast({
                variant: "warning",
                title: "Company name required",
                description: "Please enter a company name before saving.",
            });
            return;
        }

        setIsSavingDetails(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/organizations/${orgId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: nextName,
                    slug: slugify(nextName),
                    address: companyAddressDraft.trim() || null,
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err
                        ? (err as { detail?: unknown }).detail
                        : undefined;
                toast({
                    variant: "error",
                    title: "Failed to save details",
                    description: typeof detail === "string" ? detail : "Please try again.",
                });
                return;
            }

            const updated = (await res.json()) as Company;
            setCompany(updated);
            setCompanyNameDraft(updated.name);
            const nextAddress = updated.address || "";
            setCompanyAddressDraft(nextAddress);
            setAddressSearch(nextAddress);
            setAddressSuggestions([]);
            setAddressDropdownOpen(false);
            toast({ variant: "success", title: "Company updated" });
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to save details",
                description: "Please try again in a moment.",
            });
        } finally {
            setIsSavingDetails(false);
        }
    };

    const toggleInvitePermission = (key: keyof typeof invitePermissions) => {
        setInvitePermissions((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const createInvite = async () => {
        if (!canManageUsers) return;
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
                    typeof err === "object" && err && "detail" in err
                        ? (err as { detail?: unknown }).detail
                        : undefined;
                toast({
                    variant: "error",
                    title: "Failed to add user",
                    description: typeof detail === "string" ? detail : "Please try again.",
                });
                return;
            }
            const created = (await res.json()) as Member;
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
        if (!canManageUsers) return;
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
                    typeof err === "object" && err && "detail" in err
                        ? (err as { detail?: unknown }).detail
                        : undefined;
                toast({
                    variant: "error",
                    title: "Failed to update permissions",
                    description: typeof detail === "string" ? detail : "Please try again.",
                });
                return;
            }
            const updated = (await res.json()) as Member;
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
        if (!canManageUsers) return;
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
                    typeof err === "object" && err && "detail" in err
                        ? (err as { detail?: unknown }).detail
                        : undefined;
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

    if (error) {
        return (
            <div className="w-full max-w-4xl mr-auto space-y-6">
                <Link
                    href="/dashboard/companies"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Companies
                </Link>
                <section className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-3xl p-6">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-[var(--cms-pill)] flex items-center justify-center">
                            <Shield className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="font-semibold">Could not load company</p>
                            <p className="text-sm text-[var(--cms-muted)] mt-1">{error}</p>
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl mr-auto space-y-8">
            <header className="space-y-3">
                <Link
                    href="/dashboard/companies"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Companies
                </Link>
                <div className="space-y-2">
                    <h1 className="font-heading text-3xl font-bold tracking-tight">{company?.name || "Company"}</h1>
                    <p className="text-muted">Manage details, team, and permissions in one place.</p>
                </div>
            </header>

            <div className="inline-flex w-fit rounded-xl border border-border bg-panelStrong p-1">
                <button
                    type="button"
                    onClick={() => setActiveTab("details")}
                    className={cn(
                        "h-9 rounded-lg px-4 text-xs font-semibold transition-colors",
                        activeTab === "details"
                            ? "bg-[var(--cms-accent)] text-white"
                            : "text-muted hover:text-foreground"
                    )}
                >
                    Details
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("team")}
                    className={cn(
                        "h-9 rounded-lg px-4 text-xs font-semibold transition-colors",
                        activeTab === "team"
                            ? "bg-[var(--cms-accent)] text-white"
                            : "text-muted hover:text-foreground"
                    )}
                >
                    Team & permissions
                </button>
            </div>

            {activeTab === "details" && (
                <section className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-3xl p-6 space-y-5">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold">Company name</label>
                        <input
                            value={companyNameDraft}
                            onChange={(e) => setCompanyNameDraft(e.target.value)}
                            placeholder="Company name"
                            className="w-full bg-[var(--cms-panel-strong)] border border-[var(--cms-border)] rounded-2xl px-4 py-3 focus:outline-none focus:border-[var(--cms-text)]"
                        />
                    </div>

                    <div className="space-y-2" ref={addressPickerRef}>
                        <label className="text-sm font-semibold">Address</label>
                        <div className="relative">
                            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--cms-muted)]">
                                <MapPin className="w-4 h-4" />
                            </div>
                            <input
                                value={companyAddressDraft}
                                onChange={(e) => {
                                    const next = e.target.value;
                                    setCompanyAddressDraft(next);
                                    setAddressSearch(next);
                                    setAddressDropdownOpen(true);
                                }}
                                onFocus={() => setAddressDropdownOpen(true)}
                                placeholder="Start typing an address"
                                className="w-full bg-[var(--cms-panel-strong)] border border-[var(--cms-border)] rounded-2xl pl-10 pr-4 py-3 focus:outline-none focus:border-[var(--cms-text)]"
                            />
                        </div>

                        {addressDropdownOpen && (
                            <div className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)] overflow-hidden">
                                {addressLoading ? (
                                    <div className="px-4 py-3 text-sm text-[var(--cms-muted)]">Searching addresses…</div>
                                ) : addressSearch.trim().length < 3 ? (
                                    <div className="px-4 py-3 text-sm text-[var(--cms-muted)]">Type at least 3 characters.</div>
                                ) : addressSuggestions.length ? (
                                    <div className="max-h-56 overflow-y-auto">
                                        {addressSuggestions.map((suggestion) => (
                                            <button
                                                key={suggestion.place_id}
                                                type="button"
                                                onClick={() => {
                                                    setCompanyAddressDraft(suggestion.display_name);
                                                    setAddressSearch(suggestion.display_name);
                                                    setAddressDropdownOpen(false);
                                                    setAddressSuggestions([]);
                                                }}
                                                className="block w-full px-4 py-3 text-left text-sm hover:bg-[var(--cms-panel-strong)]"
                                            >
                                                {suggestion.display_name}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="px-4 py-3 text-sm text-[var(--cms-muted)]">No matches found. Keep typing to refine.</div>
                                )}
                            </div>
                        )}

                        <p className="text-xs text-[var(--cms-muted)]">Pick an address from suggestions or keep your own text.</p>
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => void saveDetails()}
                            disabled={isSavingDetails || !detailsDirty}
                            className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${
                                detailsDirty && !isSavingDetails
                                    ? "bg-[var(--cms-accent)] text-white hover:bg-[var(--cms-accent-strong)]"
                                    : "bg-[var(--cms-panel-strong)] text-[var(--cms-muted)] cursor-not-allowed"
                            }`}
                        >
                            {isSavingDetails ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            {isSavingDetails ? "Saving..." : "Save details"}
                        </button>
                    </div>
                </section>
            )}

            {activeTab === "team" && (
                <>
                    {membersError ? (
                        <section className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-3xl p-6">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-[var(--cms-pill)] flex items-center justify-center">
                                    <Shield className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-semibold">Access restricted</p>
                                    <p className="text-sm text-[var(--cms-muted)] mt-1">{membersError}</p>
                                </div>
                            </div>
                        </section>
                    ) : (
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
                                        onClick={() => void createInvite()}
                                        disabled={saving || !inviteEmail.trim()}
                                        className="px-5 py-3 rounded-2xl font-semibold bg-[var(--cms-accent)] text-white hover:bg-[var(--cms-accent-strong)] transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2 w-full sm:w-auto"
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
                                                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${invitePermissions[row.key] ? "bg-[var(--cms-accent)]" : "bg-[var(--cms-border)]"}`}
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
                                                        onClick={() => void removeMember(member)}
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
                                                                onClick={() => void updateMember(member, { [row.key]: !enabled })}
                                                                disabled={saving}
                                                                className="text-left rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-4 py-3 hover:bg-[var(--cms-pill)] transition-colors disabled:opacity-60"
                                                            >
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <div>
                                                                        <div className="font-semibold">{row.title}</div>
                                                                        <div className="text-xs text-[var(--cms-muted)]">{row.description}</div>
                                                                    </div>
                                                                    <span
                                                                        className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${enabled ? "bg-[var(--cms-accent)]" : "bg-[var(--cms-border)]"}`}
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
                </>
            )}

            <button
                onClick={() => router.push("/dashboard/companies")}
                className="inline-flex items-center gap-2 text-sm text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
            >
                Back to list
            </button>
        </div>
    );
}
