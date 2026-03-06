"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    deleteUserAttributes,
    fetchUserAttributes,
    updateUserAttributes,
} from "aws-amplify/auth";
import type { UserAttributeKey } from "aws-amplify/auth";
import { Camera, UserCircle } from "lucide-react";
import { getApiBase } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/authToken";
import { decodeJwtPayload } from "@/lib/jwt";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type DeletableProfileAttributeKey = Extract<UserAttributeKey, "phone_number" | "picture">;

type ProfileDraft = {
    name: string;
    phone: string;
    email: string;
    picture: string;
};

type ProfileClaims = {
    name?: string;
    given_name?: string;
    family_name?: string;
    preferred_username?: string;
    email?: string;
    phone_number?: string;
    picture?: string;
};

export default function ProfilePage() {
    const apiBase = getApiBase();
    const { toast } = useToast();
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

    const asCleanString = (value: unknown) => {
        if (typeof value !== "string") return "";
        return value.trim();
    };

    const deriveNameFromClaims = (claims: ProfileClaims) => {
        const directName = asCleanString(claims.name);
        if (directName) return directName;
        const given = asCleanString(claims.given_name);
        const family = asCleanString(claims.family_name);
        const combined = [given, family].filter(Boolean).join(" ").trim();
        if (combined) return combined;
        const preferred = asCleanString(claims.preferred_username);
        return preferred || "";
    };

    const readProfileClaims = async (): Promise<ProfileClaims> => {
        try {
            const token = await getAuthToken();
            return decodeJwtPayload<ProfileClaims>(token) || {};
        } catch {
            return {};
        }
    };

    const profileDirty = useMemo(() => {
        return (
            profileDraft.name.trim() !== profileBaseline.name.trim() ||
            profileDraft.email.trim() !== profileBaseline.email.trim() ||
            normalizePhone(profileDraft.phone) !== normalizePhone(profileBaseline.phone) ||
            profileDraft.picture.trim() !== profileBaseline.picture.trim()
        );
    }, [profileDraft, profileBaseline]);

    const setProfileField = (key: keyof ProfileDraft, value: string) => {
        setProfileDraft((prev) => ({ ...prev, [key]: value }));
    };

    const fetchProfile = async () => {
        setLoadingProfile(true);
        try {
            const attrs = (await fetchUserAttributes().catch(
                () => ({})
            )) as Partial<Record<UserAttributeKey, string>>;
            const claims = await readProfileClaims();
            const next: ProfileDraft = {
                name: asCleanString(attrs.name) || deriveNameFromClaims(claims),
                phone:
                    asCleanString(attrs.phone_number) ||
                    asCleanString(claims.phone_number),
                email: asCleanString(attrs.email) || asCleanString(claims.email),
                picture: asCleanString(attrs.picture) || asCleanString(claims.picture),
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

    useEffect(() => {
        void fetchProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getProfileUploadUrl = async (file: File) => {
        const token = await getAuthToken();
        const safeFilename = file.name?.trim() || `profile-${Date.now()}.png`;
        const res = await fetch(`${apiBase}/items/upload-url`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                filename: safeFilename,
                content_type: file.type || "image/png",
            }),
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
            const { upload_url, public_url } = await getProfileUploadUrl(file);
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
        const nextPhone = normalizePhone(profileDraft.phone);
        const nextPicture = profileDraft.picture.trim();

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

    return (
        <div className="max-w-4xl space-y-8">
            <header className="space-y-2">
                <h1 className="font-heading text-3xl font-bold tracking-tight">Profile</h1>
                <p className="text-muted">Manage your account details and avatar.</p>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle>Profile</CardTitle>
                    <CardDescription>Update your account details and photo.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="h-24 w-24 overflow-hidden rounded-2xl border border-border bg-panelStrong">
                            {profileDraft.picture ? (
                                <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={profileDraft.picture}
                                        alt="Profile"
                                        className="h-full w-full object-cover"
                                    />
                                </>
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
                                    void uploadProfilePhoto(file);
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
                                placeholder="you@company.com"
                                autoComplete="email"
                                readOnly
                                disabled
                            />
                            <p className="text-xs text-muted">
                                Email is managed by your login provider and cannot be changed here.
                            </p>
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
                            onClick={() => void saveProfile()}
                            loading={savingProfile}
                            disabled={loadingProfile || uploadingProfilePhoto || !profileDirty}
                        >
                            Save Profile
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
