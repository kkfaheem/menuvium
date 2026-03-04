"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    deleteUserAttributes,
    fetchUserAttributes,
    updateUserAttributes,
} from "aws-amplify/auth";
import type { UserAttributeKey } from "aws-amplify/auth";
import { Camera, Monitor, Moon, Plus, Sun, UserCircle, X } from "lucide-react";
import { ALLERGEN_TAGS, DIET_TAGS, HIGHLIGHT_TAGS, SPICE_TAGS, TAG_LABELS_DEFAULTS } from "@/lib/menuTagPresets";
import { getApiBase } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/authToken";
import type { DietaryTag, Allergen } from "@/types";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

type TagLabels = {
    diet: string;
    spice: string;
    highlights: string;
    allergens: string;
};

type SoldOutDisplay = "dim" | "hide";
type DeletableProfileAttributeKey = Extract<UserAttributeKey, "phone_number" | "picture">;
type ProfileDraft = {
    name: string;
    phone: string;
    email: string;
    picture: string;
};

export default function SettingsPage() {
    const apiBase = getApiBase();
    const { theme, setTheme } = useTheme();
    const { toast } = useToast();
    const [soldOutDisplay, setSoldOutDisplay] = useState<SoldOutDisplay>("dim");
    const [tags, setTags] = useState<DietaryTag[]>([]);
    const [allergens, setAllergens] = useState<Allergen[]>([]);
    const [savingTag, setSavingTag] = useState(false);
    const [savingAllergen, setSavingAllergen] = useState(false);
    const [activeTab, setActiveTab] = useState<"profile" | "general" | "tags">("general");
    const [tagLabels, setTagLabels] = useState<TagLabels>(TAG_LABELS_DEFAULTS);
    const [tagGroups, setTagGroups] = useState<Record<string, "diet" | "spice" | "highlights">>({});
    const [newDietTag, setNewDietTag] = useState("");
    const [newSpiceTag, setNewSpiceTag] = useState("");
    const [newHighlightTag, setNewHighlightTag] = useState("");
    const [newAllergenTag, setNewAllergenTag] = useState("");
    const [profileDraft, setProfileDraft] = useState<ProfileDraft>({
        name: "",
        phone: "",
        email: "",
        picture: "",
    });
    const [profileBaseline, setProfileBaseline] = useState<ProfileDraft>({
        name: "",
        phone: "",
        email: "",
        picture: "",
    });
    const [loadingProfile, setLoadingProfile] = useState(false);
    const [savingProfile, setSavingProfile] = useState(false);
    const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);
    const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
    const activeOptionClasses = "bg-[var(--cms-accent)] text-white";
    const optionButtonClasses = (isActive: boolean) =>
        cn(
            "inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30",
            isActive
                ? "border-[var(--cms-accent)] bg-[var(--cms-accent)] text-white"
                : "border-[var(--cms-border)] bg-transparent text-[var(--cms-text)] hover:bg-[var(--cms-pill)]"
        );

    const normalize = (value: string) => value.trim().toLowerCase();
    const normalizeKey = (value: string) => value.trim();
    const normalizePhone = (value: string): string => {
        const raw = value.trim();
        if (!raw) return "";
        const digits = raw.replace(/\D/g, "");
        if (!digits) return "";
        if (raw.startsWith("+")) return `+${digits}`;
        if (digits.length === 10) return `+1${digits}`;
        if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
        return `+${digits}`;
    };
    const profileDirty = useMemo(() => {
        return (
            profileDraft.name.trim() !== profileBaseline.name.trim() ||
            profileDraft.email.trim() !== profileBaseline.email.trim() ||
            normalizePhone(profileDraft.phone) !== normalizePhone(profileBaseline.phone) ||
            profileDraft.picture.trim() !== profileBaseline.picture.trim()
        );
    }, [profileDraft, profileBaseline]);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const savedSoldOutRaw = localStorage.getItem("menuvium_sold_out_display");
            const savedSoldOut: SoldOutDisplay =
                savedSoldOutRaw === "dim" || savedSoldOutRaw === "hide" ? savedSoldOutRaw : "dim";
            setSoldOutDisplay(savedSoldOut);
            const storedLabels = localStorage.getItem("menuvium_tag_labels");
            if (storedLabels) {
                try {
                    const parsed = JSON.parse(storedLabels) as Partial<TagLabels>;
                    setTagLabels({ ...TAG_LABELS_DEFAULTS, ...parsed });
                } catch {
                    setTagLabels(TAG_LABELS_DEFAULTS);
                }
            }
            const storedGroups = localStorage.getItem("menuvium_tag_groups");
            if (storedGroups) {
                try {
                    const parsed = JSON.parse(storedGroups) as Record<string, "diet" | "spice" | "highlights">;
                    setTagGroups(parsed);
                } catch {
                    setTagGroups({});
                }
            }
        }
        fetchDietaryTags();
        fetchAllergens();
        fetchProfile();
    }, []);

    const createDietaryTag = async (name: string) => {
        const res = await fetch(`${apiBase}/metadata/dietary-tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Failed to add tag");
        }
        return res.json();
    };

    const createAllergen = async (name: string) => {
        const res = await fetch(`${apiBase}/metadata/allergens`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Failed to add allergen");
        }
        return res.json();
    };

    const fetchDietaryTags = async () => {
        try {
            const res = await fetch(`${apiBase}/metadata/dietary-tags`);
            if (res.ok) {
                const data = await res.json();
                setTags(data);
                await ensureDietaryDefaults(data);
                ensureTagGroups(data);
            }
        } catch (e) {
            console.error("Failed to fetch tags", e);
        }
    };

    const fetchAllergens = async () => {
        try {
            const res = await fetch(`${apiBase}/metadata/allergens`);
            if (res.ok) {
                const data = await res.json();
                setAllergens(data);
                await ensureAllergenDefaults(data);
            }
        } catch (e) {
            console.error("Failed to fetch allergens", e);
        }
    };

    const setProfileField = (key: keyof ProfileDraft, value: string) => {
        setProfileDraft((prev) => ({ ...prev, [key]: value }));
    };

    const fetchProfile = async () => {
        setLoadingProfile(true);
        try {
            const attrs = await fetchUserAttributes();
            const next: ProfileDraft = {
                name: (attrs.name || "").trim(),
                phone: (attrs.phone_number || "").trim(),
                email: (attrs.email || "").trim(),
                picture: (attrs.picture || "").trim(),
            };
            setProfileDraft(next);
            setProfileBaseline(next);
        } catch (e) {
            console.error("Failed to fetch profile", e);
            toast({
                variant: "error",
                title: "Failed to load profile",
                description: "Please refresh the page and try again.",
            });
        } finally {
            setLoadingProfile(false);
        }
    };

    const getProfileUploadUrl = async (fileType: string) => {
        const token = await getAuthToken();
        const res = await fetch(`${apiBase}/items/upload-url`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ file_type: fileType }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err?.detail || "Failed to prepare photo upload");
        }
        return (await res.json()) as {
            upload_url: string;
            public_url: string;
        };
    };

    const uploadProfilePhoto = async (file: File) => {
        if (!file.type.startsWith("image/")) {
            toast({
                variant: "error",
                title: "Invalid file type",
                description: "Please choose an image file.",
            });
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast({
                variant: "error",
                title: "Photo too large",
                description: "Max size is 10MB.",
            });
            return;
        }

        setUploadingProfilePhoto(true);
        try {
            const { upload_url, public_url } = await getProfileUploadUrl(
                file.type || "image/png",
            );
            const uploadRes = await fetch(upload_url, {
                method: "PUT",
                headers: { "Content-Type": file.type || "application/octet-stream" },
                body: file,
            });
            if (!uploadRes.ok) {
                throw new Error("Failed to upload photo");
            }
            setProfileField("picture", public_url);
            toast({
                variant: "success",
                title: "Photo uploaded",
                description: "Save profile to apply it.",
            });
        } catch (e: any) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to upload photo",
                description: e?.message || "Please try again.",
            });
        } finally {
            setUploadingProfilePhoto(false);
        }
    };

    const saveProfile = async () => {
        const nextName = profileDraft.name.trim();
        const nextEmail = profileDraft.email.trim();
        const nextPhone = normalizePhone(profileDraft.phone);
        const nextPicture = profileDraft.picture.trim();

        if (!nextEmail) {
            toast({
                variant: "error",
                title: "Email is required",
            });
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
            toast({
                variant: "error",
                title: "Invalid email",
                description: "Please enter a valid email address.",
            });
            return;
        }
        if (profileDraft.phone.trim() && !/^\+[1-9]\d{7,14}$/.test(nextPhone)) {
            toast({
                variant: "error",
                title: "Invalid phone number",
                description:
                    "Use full international format (for example +14165550123).",
            });
            return;
        }

        const updates: Record<string, string> = {};
        const attributesToDelete: DeletableProfileAttributeKey[] = [];
        if (nextName !== profileBaseline.name.trim()) updates.name = nextName;
        if (nextEmail !== profileBaseline.email.trim()) updates.email = nextEmail;
        if (!nextPhone && normalizePhone(profileBaseline.phone)) {
            attributesToDelete.push("phone_number");
        } else if (nextPhone !== normalizePhone(profileBaseline.phone)) {
            updates.phone_number = nextPhone;
        }
        if (!nextPicture && profileBaseline.picture.trim()) {
            attributesToDelete.push("picture");
        } else if (nextPicture !== profileBaseline.picture.trim()) {
            updates.picture = nextPicture;
        }

        if (!Object.keys(updates).length && !attributesToDelete.length) {
            toast({
                variant: "default",
                title: "No changes to save",
            });
            return;
        }

        setSavingProfile(true);
        try {
            let result: any = {};
            if (Object.keys(updates).length) {
                result = await updateUserAttributes({
                    userAttributes: updates,
                });
            }

            if (attributesToDelete.length) {
                await deleteUserAttributes({
                    userAttributeKeys: attributesToDelete as [
                        DeletableProfileAttributeKey,
                        ...DeletableProfileAttributeKey[],
                    ],
                });
            }

            const verifyMessages = Object.entries(result || {})
                .map(([attribute, status]: [string, any]) => {
                    const step = status?.nextStep?.updateAttributeStep;
                    if (step !== "CONFIRM_ATTRIBUTE_WITH_CODE") return null;
                    const destination = status?.nextStep?.codeDeliveryDetails?.destination;
                    return destination
                        ? `${attribute} requires verification at ${destination}`
                        : `${attribute} requires verification`;
                })
                .filter(Boolean) as string[];

            await fetchProfile();
            toast({
                variant: "success",
                title: "Profile updated",
                description: verifyMessages.length
                    ? verifyMessages.join(" • ")
                    : "Changes saved successfully.",
            });
        } catch (e: any) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to update profile",
                description: e?.message || "Please try again.",
            });
        } finally {
            setSavingProfile(false);
        }
    };

    const setSoldOutDisplayAndPersist = (next: SoldOutDisplay) => {
        setSoldOutDisplay(next);
        if (typeof window !== "undefined") {
            localStorage.setItem("menuvium_sold_out_display", next);
        }
    };

    const updateTagLabel = (key: keyof TagLabels, value: string) => {
        const next = { ...tagLabels, [key]: value };
        setTagLabels(next);
        if (typeof window !== "undefined") {
            localStorage.setItem("menuvium_tag_labels", JSON.stringify(next));
        }
    };

    const persistTagGroups = (next: Record<string, "diet" | "spice" | "highlights">) => {
        setTagGroups(next);
        if (typeof window !== "undefined") {
            localStorage.setItem("menuvium_tag_groups", JSON.stringify(next));
        }
    };

    const ensureDietaryDefaults = async (existing: DietaryTag[]) => {
        const existingNames = new Set(existing.map((tag) => normalize(tag.name)));
        const missing = [...DIET_TAGS, ...SPICE_TAGS, ...HIGHLIGHT_TAGS].filter(
            (name) => !existingNames.has(normalize(name))
        );
        if (!missing.length) return;
        setSavingTag(true);
        try {
            await Promise.all(missing.map((name) => createDietaryTag(name)));
            fetchDietaryTags();
        } catch (e: any) {
            console.error(e);
        } finally {
            setSavingTag(false);
        }
    };

    const ensureTagGroups = (existing: DietaryTag[]) => {
        const next = { ...tagGroups };
        const defaults = new Map<string, "diet" | "spice" | "highlights">();
        DIET_TAGS.forEach((name) => defaults.set(normalize(name), "diet"));
        SPICE_TAGS.forEach((name) => defaults.set(normalize(name), "spice"));
        HIGHLIGHT_TAGS.forEach((name) => defaults.set(normalize(name), "highlights"));
        let changed = false;

        existing.forEach((tag) => {
            if (next[tag.id]) return;
            const group = defaults.get(normalize(tag.name)) ?? "highlights";
            next[tag.id] = group;
            changed = true;
        });

        if (changed) {
            persistTagGroups(next);
        }
    };

    const ensureAllergenDefaults = async (existing: Allergen[]) => {
        const existingNames = new Set(existing.map((tag) => normalize(tag.name)));
        const missing = ALLERGEN_TAGS.filter((name) => !existingNames.has(normalize(name)));
        if (!missing.length) return;
        setSavingAllergen(true);
        try {
            await Promise.all(missing.map((name) => createAllergen(name)));
            fetchAllergens();
        } catch (e: any) {
            console.error(e);
        } finally {
            setSavingAllergen(false);
        }
    };

    const handleDeleteTag = async (id: string) => {
        try {
            const res = await fetch(`${apiBase}/metadata/dietary-tags/${id}`, {
                method: "DELETE"
            });
            if (res.ok) {
                const next = { ...tagGroups };
                delete next[id];
                persistTagGroups(next);
                fetchDietaryTags();
            } else {
                const err = await res.json();
                toast({
                    variant: "error",
                    title: "Failed to delete tag",
                    description: err.detail || "Please try again.",
                });
            }
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to delete tag",
                description: "Please try again in a moment.",
            });
        }
    };

    const handleDeleteAllergen = async (id: string) => {
        try {
            const res = await fetch(`${apiBase}/metadata/allergens/${id}`, {
                method: "DELETE"
            });
            if (res.ok) {
                fetchAllergens();
            } else {
                const err = await res.json();
                toast({
                    variant: "error",
                    title: "Failed to delete allergen",
                    description: err.detail || "Please try again.",
                });
            }
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to delete allergen",
                description: "Please try again in a moment.",
            });
        }
    };

    const addDietaryTag = async (group: "diet" | "spice" | "highlights", name: string) => {
        const trimmed = normalizeKey(name);
        if (!trimmed) return;
        setSavingTag(true);
        try {
            const created = await createDietaryTag(trimmed);
            if (created?.id) {
                persistTagGroups({ ...tagGroups, [created.id]: group });
            }
            fetchDietaryTags();
        } catch (e: any) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to add tag",
                description: e?.message || "Please try again.",
            });
        } finally {
            setSavingTag(false);
        }
    };

    const addAllergen = async (name: string) => {
        const trimmed = normalizeKey(name);
        if (!trimmed) return;
        setSavingAllergen(true);
        try {
            await createAllergen(trimmed);
            fetchAllergens();
        } catch (e: any) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to add allergen",
                description: e?.message || "Please try again.",
            });
        } finally {
            setSavingAllergen(false);
        }
    };

    const groupedTags = useMemo(
        () => ({
            diet: tags.filter((tag) => tagGroups[tag.id] === "diet"),
            spice: tags.filter((tag) => tagGroups[tag.id] === "spice"),
            highlights: tags.filter((tag) => tagGroups[tag.id] === "highlights")
        }),
        [tags, tagGroups]
    );
    const orderByDefaults = (list: DietaryTag[], defaults: string[]) => {
        const order = new Map(defaults.map((name, index) => [normalize(name), index]));
        return [...list].sort((a, b) => {
            const aRank = order.get(normalize(a.name));
            const bRank = order.get(normalize(b.name));
            if (aRank !== undefined || bRank !== undefined) {
                return (aRank ?? Number.MAX_SAFE_INTEGER) - (bRank ?? Number.MAX_SAFE_INTEGER);
            }
            return a.name.localeCompare(b.name);
        });
    };
    const orderAllergens = (list: Allergen[], defaults: string[]) => {
        const order = new Map(defaults.map((name, index) => [normalize(name), index]));
        return [...list].sort((a, b) => {
            const aRank = order.get(normalize(a.name));
            const bRank = order.get(normalize(b.name));
            if (aRank !== undefined || bRank !== undefined) {
                return (aRank ?? Number.MAX_SAFE_INTEGER) - (bRank ?? Number.MAX_SAFE_INTEGER);
            }
            return a.name.localeCompare(b.name);
        });
    };


	    return (
	        <div className="max-w-4xl space-y-8">
	            <header className="space-y-2">
	                <h1 className="font-heading text-3xl font-bold tracking-tight">Settings</h1>
	                <p className="text-muted">Keep the control surface clean and fast.</p>
	            </header>

            <div className="inline-flex w-fit rounded-xl border border-border bg-panelStrong p-1">
                <button
                    type="button"
                    onClick={() => setActiveTab("profile")}
                    className={cn(
                        "h-9 rounded-lg px-4 text-xs font-semibold transition-colors",
                        activeTab === "profile" ? activeOptionClasses : "text-muted hover:text-foreground"
                    )}
                >
                    Profile
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("general")}
                    className={cn(
                        "h-9 rounded-lg px-4 text-xs font-semibold transition-colors",
                        activeTab === "general" ? activeOptionClasses : "text-muted hover:text-foreground"
                    )}
                >
                    General
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("tags")}
                    className={cn(
                        "h-9 rounded-lg px-4 text-xs font-semibold transition-colors",
                        activeTab === "tags" ? activeOptionClasses : "text-muted hover:text-foreground"
                    )}
                >
                    Tags
                </button>
            </div>

            {activeTab === "profile" && (
                <Card>
                    <CardHeader>
                        <CardTitle>Profile</CardTitle>
                        <CardDescription>Update your account details and photo.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            <div className="h-24 w-24 overflow-hidden rounded-2xl border border-border bg-panelStrong">
                                {profileDraft.picture ? (
                                    <img
                                        src={profileDraft.picture}
                                        alt="Profile"
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-muted">
                                        <UserCircle className="h-12 w-12" />
                                    </div>
                                )}
                            </div>
                            <div className="space-y-2">
                                <input
                                    ref={profilePhotoInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onClick={(e) => {
                                        (e.currentTarget as HTMLInputElement).value = "";
                                    }}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        uploadProfilePhoto(file);
                                    }}
                                />
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant="secondary"
                                        onClick={() => profilePhotoInputRef.current?.click()}
                                        disabled={uploadingProfilePhoto}
                                        loading={uploadingProfilePhoto}
                                    >
                                        <Camera className="h-4 w-4" />
                                        Upload photo
                                    </Button>
                                    {profileDraft.picture ? (
                                        <Button
                                            variant="ghost"
                                            onClick={() => setProfileField("picture", "")}
                                        >
                                            Remove photo
                                        </Button>
                                    ) : null}
                                </div>
                                <p className="text-xs text-muted">
                                    PNG or JPG up to 10MB.
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5 sm:col-span-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                                    Name
                                </label>
                                <Input
                                    value={profileDraft.name}
                                    onChange={(e) => setProfileField("name", e.target.value)}
                                    placeholder="Your full name"
                                    autoComplete="name"
                                />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                                    Email
                                </label>
                                <Input
                                    type="email"
                                    value={profileDraft.email}
                                    onChange={(e) => setProfileField("email", e.target.value)}
                                    placeholder="you@company.com"
                                    autoComplete="email"
                                />
                            </div>
                            <div className="space-y-1.5 sm:col-span-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                                    Phone Number
                                </label>
                                <Input
                                    value={profileDraft.phone}
                                    onChange={(e) => setProfileField("phone", e.target.value)}
                                    placeholder="+14165550123"
                                    autoComplete="tel"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Button
                                onClick={saveProfile}
                                loading={savingProfile}
                                disabled={loadingProfile || uploadingProfilePhoto || !profileDirty}
                            >
                                Save Profile
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {activeTab === "general" && (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle>Appearance</CardTitle>
                            <CardDescription>Choose a theme for the dashboard.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className={optionButtonClasses(theme === "light")}
                                    onClick={() => setTheme("light")}
                                    aria-pressed={theme === "light"}
                                >
                                    <Sun className="h-4 w-4" />
                                    Light
                                </button>
                                <button
                                    type="button"
                                    className={optionButtonClasses(theme === "dark")}
                                    onClick={() => setTheme("dark")}
                                    aria-pressed={theme === "dark"}
                                >
                                    <Moon className="h-4 w-4" />
                                    Dark
                                </button>
                                <button
                                    type="button"
                                    className={optionButtonClasses(theme === "system")}
                                    onClick={() => setTheme("system")}
                                    aria-pressed={theme === "system"}
                                >
                                    <Monitor className="h-4 w-4" />
                                    System
                                </button>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Sold-out items</CardTitle>
                            <CardDescription>Choose how sold-out items appear on menus.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className={optionButtonClasses(soldOutDisplay === "dim")}
                                    onClick={() => setSoldOutDisplayAndPersist("dim")}
                                    aria-pressed={soldOutDisplay === "dim"}
                                >
                                    Dim items
                                </button>
                                <button
                                    type="button"
                                    className={optionButtonClasses(soldOutDisplay === "hide")}
                                    onClick={() => setSoldOutDisplayAndPersist("hide")}
                                    aria-pressed={soldOutDisplay === "hide"}
                                >
                                    Hide items
                                </button>
                            </div>
                        </CardContent>
                    </Card>

                </>
            )}

	            {activeTab === "tags" && (
	                <div className="grid gap-4 lg:grid-cols-2">
	                    <Card className="h-full">
	                        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
	                            <div>
	                                <CardTitle>Diet</CardTitle>
	                            </div>
	                            <div className="w-full space-y-1 sm:w-[200px]">
	                                <p className="text-xs font-semibold text-muted">Section label</p>
	                                <Input
	                                    value={tagLabels.diet}
                                    onChange={(e) => updateTagLabel("diet", e.target.value)}
                                    className="h-10 rounded-full px-4 text-sm"
                                    aria-label="Diet section label"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {orderByDefaults(groupedTags.diet, DIET_TAGS).map((tag) => (
                                    <span
                                        key={tag.id}
                                        className="inline-flex items-center gap-2 rounded-full border border-border bg-pill px-3 py-1.5 text-xs font-semibold"
                                    >
                                        {tag.name}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteTag(tag.id)}
                                            className="rounded-full p-0.5 text-muted hover:bg-panelStrong hover:text-foreground"
                                            aria-label={`Delete ${tag.name}`}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                                <Input
                                    value={newDietTag}
                                    onChange={(e) => setNewDietTag(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addDietaryTag("diet", newDietTag);
                                            setNewDietTag("");
                                        }
                                    }}
                                    placeholder="Add a diet tag"
                                    className="h-10 rounded-full px-4"
                                />
                                <Button
                                    size="sm"
                                    loading={savingTag}
                                    disabled={!newDietTag.trim()}
                                    className="h-10 rounded-full px-5 text-xs"
                                    onClick={() => {
                                        addDietaryTag("diet", newDietTag);
                                        setNewDietTag("");
                                    }}
                                >
                                    <Plus className="h-3 w-3" />
                                    Add
                                </Button>
                            </div>
                            {savingTag ? <p className="text-xs text-muted">Saving…</p> : null}
                        </CardContent>
                    </Card>

	                    <Card className="h-full">
	                        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
	                            <div>
	                                <CardTitle>Spice level</CardTitle>
	                            </div>
	                            <div className="w-full space-y-1 sm:w-[200px]">
	                                <p className="text-xs font-semibold text-muted">Section label</p>
	                                <Input
	                                    value={tagLabels.spice}
                                    onChange={(e) => updateTagLabel("spice", e.target.value)}
                                    className="h-10 rounded-full px-4 text-sm"
                                    aria-label="Spice section label"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {orderByDefaults(groupedTags.spice, SPICE_TAGS).map((tag) => (
                                    <span
                                        key={tag.id}
                                        className="inline-flex items-center gap-2 rounded-full border border-border bg-pill px-3 py-1.5 text-xs font-semibold"
                                    >
                                        {tag.name}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteTag(tag.id)}
                                            className="rounded-full p-0.5 text-muted hover:bg-panelStrong hover:text-foreground"
                                            aria-label={`Delete ${tag.name}`}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                                <Input
                                    value={newSpiceTag}
                                    onChange={(e) => setNewSpiceTag(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addDietaryTag("spice", newSpiceTag);
                                            setNewSpiceTag("");
                                        }
                                    }}
                                    placeholder="Add a spice tag"
                                    className="h-10 rounded-full px-4"
                                />
                                <Button
                                    size="sm"
                                    loading={savingTag}
                                    disabled={!newSpiceTag.trim()}
                                    className="h-10 rounded-full px-5 text-xs"
                                    onClick={() => {
                                        addDietaryTag("spice", newSpiceTag);
                                        setNewSpiceTag("");
                                    }}
                                >
                                    <Plus className="h-3 w-3" />
                                    Add
                                </Button>
                            </div>
                            {savingTag ? <p className="text-xs text-muted">Saving…</p> : null}
                        </CardContent>
                    </Card>

	                    <Card className="h-full">
	                        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
	                            <div>
	                                <CardTitle>Highlights</CardTitle>
	                            </div>
	                            <div className="w-full space-y-1 sm:w-[200px]">
	                                <p className="text-xs font-semibold text-muted">Section label</p>
	                                <Input
	                                    value={tagLabels.highlights}
                                    onChange={(e) => updateTagLabel("highlights", e.target.value)}
                                    className="h-10 rounded-full px-4 text-sm"
                                    aria-label="Highlights section label"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {orderByDefaults(groupedTags.highlights, HIGHLIGHT_TAGS).map((tag) => (
                                    <span
                                        key={tag.id}
                                        className="inline-flex items-center gap-2 rounded-full border border-border bg-pill px-3 py-1.5 text-xs font-semibold"
                                    >
                                        {tag.name}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteTag(tag.id)}
                                            className="rounded-full p-0.5 text-muted hover:bg-panelStrong hover:text-foreground"
                                            aria-label={`Delete ${tag.name}`}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                                <Input
                                    value={newHighlightTag}
                                    onChange={(e) => setNewHighlightTag(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addDietaryTag("highlights", newHighlightTag);
                                            setNewHighlightTag("");
                                        }
                                    }}
                                    placeholder="Add a highlight tag"
                                    className="h-10 rounded-full px-4"
                                />
                                <Button
                                    size="sm"
                                    loading={savingTag}
                                    disabled={!newHighlightTag.trim()}
                                    className="h-10 rounded-full px-5 text-xs"
                                    onClick={() => {
                                        addDietaryTag("highlights", newHighlightTag);
                                        setNewHighlightTag("");
                                    }}
                                >
                                    <Plus className="h-3 w-3" />
                                    Add
                                </Button>
                            </div>
                            {savingTag ? <p className="text-xs text-muted">Saving…</p> : null}
                        </CardContent>
                    </Card>

	                    <Card className="h-full">
	                        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
	                            <div>
	                                <CardTitle>Allergens</CardTitle>
	                            </div>
	                            <div className="w-full space-y-1 sm:w-[200px]">
	                                <p className="text-xs font-semibold text-muted">Section label</p>
	                                <Input
	                                    value={tagLabels.allergens}
                                    onChange={(e) => updateTagLabel("allergens", e.target.value)}
                                    className="h-10 rounded-full px-4 text-sm"
                                    aria-label="Allergens section label"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {orderAllergens(allergens, ALLERGEN_TAGS).map((allergen) => (
                                    <span
                                        key={allergen.id}
                                        className="inline-flex items-center gap-2 rounded-full border border-border bg-pill px-3 py-1.5 text-xs font-semibold"
                                    >
                                        {allergen.name}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteAllergen(allergen.id)}
                                            className="rounded-full p-0.5 text-muted hover:bg-panelStrong hover:text-foreground"
                                            aria-label={`Delete ${allergen.name}`}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                                <Input
                                    value={newAllergenTag}
                                    onChange={(e) => setNewAllergenTag(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addAllergen(newAllergenTag);
                                            setNewAllergenTag("");
                                        }
                                    }}
                                    placeholder="Add an allergen"
                                    className="h-10 rounded-full px-4"
                                />
                                <Button
                                    size="sm"
                                    loading={savingAllergen}
                                    disabled={!newAllergenTag.trim()}
                                    className="h-10 rounded-full px-5 text-xs"
                                    onClick={() => {
                                        addAllergen(newAllergenTag);
                                        setNewAllergenTag("");
                                    }}
                                >
                                    <Plus className="h-3 w-3" />
                                    Add
                                </Button>
                            </div>
                            {savingAllergen ? <p className="text-xs text-muted">Saving…</p> : null}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
