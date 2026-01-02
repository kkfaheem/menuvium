"use client";

import { useEffect, useMemo, useState } from "react";
import { Sun, Moon, Plus, ShieldCheck, X } from "lucide-react";
import { updatePassword } from "aws-amplify/auth";

type Theme = "dark" | "light";

interface DietaryTag {
    id: string;
    name: string;
    icon?: string;
}

interface Allergen {
    id: string;
    name: string;
}

export default function SettingsPage() {
    const [theme, setTheme] = useState<Theme>("dark");
    const [tags, setTags] = useState<DietaryTag[]>([]);
    const [allergens, setAllergens] = useState<Allergen[]>([]);
    const [newTag, setNewTag] = useState("");
    const [newAllergen, setNewAllergen] = useState("");
    const [savingTag, setSavingTag] = useState(false);
    const [savingAllergen, setSavingAllergen] = useState(false);
    const [passwordState, setPasswordState] = useState({
        current: "",
        next: "",
        confirm: ""
    });
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

    const isMock = useMemo(() => {
        if (typeof window === "undefined") return false;
        return localStorage.getItem("menuvium_mock_user") === "true";
    }, []);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const savedTheme = (localStorage.getItem("menuvium_cms_theme") as Theme) || "dark";
            setTheme(savedTheme);
            document.documentElement.dataset.cmsTheme = savedTheme;
        }
        fetchDietaryTags();
        fetchAllergens();
    }, []);

    const fetchDietaryTags = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/metadata/dietary-tags`);
            if (res.ok) {
                setTags(await res.json());
            }
        } catch (e) {
            console.error("Failed to fetch tags", e);
        }
    };

    const fetchAllergens = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/metadata/allergens`);
            if (res.ok) {
                setAllergens(await res.json());
            }
        } catch (e) {
            console.error("Failed to fetch allergens", e);
        }
    };

    const setThemeAndPersist = (nextTheme: Theme) => {
        setTheme(nextTheme);
        if (typeof window !== "undefined") {
            localStorage.setItem("menuvium_cms_theme", nextTheme);
            document.documentElement.dataset.cmsTheme = nextTheme;
        }
    };

    const handleAddTag = async () => {
        const trimmed = newTag.trim();
        if (!trimmed) return;
        setSavingTag(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/metadata/dietary-tags`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: trimmed })
            });
            if (res.ok) {
                setNewTag("");
                fetchDietaryTags();
            } else {
                const err = await res.json();
                alert(err.detail || "Failed to add tag");
            }
        } catch (e) {
            console.error(e);
            alert("Failed to add tag");
        } finally {
            setSavingTag(false);
        }
    };

    const handleDeleteTag = async (id: string) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/metadata/dietary-tags/${id}`, {
                method: "DELETE"
            });
            if (res.ok) {
                fetchDietaryTags();
            } else {
                const err = await res.json();
                alert(err.detail || "Failed to delete tag");
            }
        } catch (e) {
            console.error(e);
            alert("Failed to delete tag");
        }
    };

    const handleAddAllergen = async () => {
        const trimmed = newAllergen.trim();
        if (!trimmed) return;
        setSavingAllergen(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/metadata/allergens`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: trimmed })
            });
            if (res.ok) {
                setNewAllergen("");
                fetchAllergens();
            } else {
                const err = await res.json();
                alert(err.detail || "Failed to add allergen");
            }
        } catch (e) {
            console.error(e);
            alert("Failed to add allergen");
        } finally {
            setSavingAllergen(false);
        }
    };

    const handleDeleteAllergen = async (id: string) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/metadata/allergens/${id}`, {
                method: "DELETE"
            });
            if (res.ok) {
                fetchAllergens();
            } else {
                const err = await res.json();
                alert(err.detail || "Failed to delete allergen");
            }
        } catch (e) {
            console.error(e);
            alert("Failed to delete allergen");
        }
    };

    const handleChangePassword = async () => {
        if (!passwordState.current || !passwordState.next || !passwordState.confirm) {
            setPasswordMessage("Fill all password fields.");
            return;
        }
        if (passwordState.next !== passwordState.confirm) {
            setPasswordMessage("New passwords do not match.");
            return;
        }
        setPasswordSaving(true);
        setPasswordMessage(null);
        try {
            await updatePassword({
                oldPassword: passwordState.current,
                newPassword: passwordState.next
            });
            setPasswordMessage("Password updated.");
            setPasswordState({ current: "", next: "", confirm: "" });
        } catch (e: any) {
            setPasswordMessage(e?.message || "Failed to update password.");
        } finally {
            setPasswordSaving(false);
        }
    };

    return (
        <div className="max-w-4xl space-y-8">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                    <p className="text-[var(--cms-muted)]">Keep the control surface clean and fast.</p>
                </div>
            </header>

            <section className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-2xl p-6">
                <h2 className="text-lg font-bold mb-1">Theme</h2>
                <p className="text-sm text-[var(--cms-muted)] mb-4">Switch the CMS appearance.</p>
                <div className="flex gap-2">
                    <button
                        onClick={() => setThemeAndPersist("dark")}
                        className={`h-10 px-4 rounded-xl text-sm font-bold inline-flex items-center gap-2 transition-colors border ${theme === "dark" ? "bg-[var(--cms-pill)] border-[var(--cms-border)]" : "bg-transparent border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)]"}`}
                    >
                        <Moon className="w-4 h-4" /> Dark
                    </button>
                    <button
                        onClick={() => setThemeAndPersist("light")}
                        className={`h-10 px-4 rounded-xl text-sm font-bold inline-flex items-center gap-2 transition-colors border ${theme === "light" ? "bg-[var(--cms-pill)] border-[var(--cms-border)]" : "bg-transparent border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)]"}`}
                    >
                        <Sun className="w-4 h-4" /> Light
                    </button>
                </div>
            </section>

            <section className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-2xl p-6">
                <h2 className="text-lg font-bold mb-1">Dietary Tags</h2>
                <p className="text-sm text-[var(--cms-muted)] mb-4">Manage tags used across menus.</p>
                <div className="flex flex-wrap gap-2 mb-4">
                    {tags.map((tag) => (
                        <span key={tag.id} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--cms-pill)] inline-flex items-center gap-2">
                            {tag.name}
                            <button
                                onClick={() => handleDeleteTag(tag.id)}
                                className="text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
                                aria-label={`Delete ${tag.name}`}
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
                <div className="flex gap-3">
                    <input
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddTag();
                            }
                        }}
                        placeholder="Add a new tag"
                        className="flex-1 h-11 bg-transparent border border-[var(--cms-border)] rounded-xl px-4 focus:outline-none focus:border-[var(--cms-text)]"
                    />
                    <button
                        onClick={handleAddTag}
                        disabled={savingTag || !newTag.trim()}
                        className="h-11 px-4 rounded-xl font-bold text-sm inline-flex items-center gap-2 bg-[var(--cms-text)] text-[var(--cms-bg)] disabled:opacity-50"
                    >
                        <Plus className="w-4 h-4" />
                        Add
                    </button>
                </div>
            </section>

            <section className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-2xl p-6">
                <h2 className="text-lg font-bold mb-1">Allergens</h2>
                <p className="text-sm text-[var(--cms-muted)] mb-4">Manage allergen warnings for menus.</p>
                <div className="flex flex-wrap gap-2 mb-4">
                    {allergens.map((allergen) => (
                        <span key={allergen.id} className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--cms-pill)] inline-flex items-center gap-2">
                            {allergen.name}
                            <button
                                onClick={() => handleDeleteAllergen(allergen.id)}
                                className="text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
                                aria-label={`Delete ${allergen.name}`}
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
                <div className="flex gap-3">
                    <input
                        value={newAllergen}
                        onChange={(e) => setNewAllergen(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddAllergen();
                            }
                        }}
                        placeholder="Add a new allergen"
                        className="flex-1 h-11 bg-transparent border border-[var(--cms-border)] rounded-xl px-4 focus:outline-none focus:border-[var(--cms-text)]"
                    />
                    <button
                        onClick={handleAddAllergen}
                        disabled={savingAllergen || !newAllergen.trim()}
                        className="h-11 px-4 rounded-xl font-bold text-sm inline-flex items-center gap-2 bg-[var(--cms-text)] text-[var(--cms-bg)] disabled:opacity-50"
                    >
                        <Plus className="w-4 h-4" />
                        Add
                    </button>
                </div>
            </section>

            <section className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-2xl p-6">
                <h2 className="text-lg font-bold mb-1">Change Password</h2>
                <p className="text-sm text-[var(--cms-muted)] mb-4">Update your account password.</p>
                <div className="grid gap-3 max-w-md">
                    <input
                        type="password"
                        placeholder="Current password"
                        value={passwordState.current}
                        onChange={(e) => setPasswordState({ ...passwordState, current: e.target.value })}
                        className="h-11 bg-transparent border border-[var(--cms-border)] rounded-xl px-4 focus:outline-none focus:border-[var(--cms-text)]"
                    />
                    <input
                        type="password"
                        placeholder="New password"
                        value={passwordState.next}
                        onChange={(e) => setPasswordState({ ...passwordState, next: e.target.value })}
                        className="h-11 bg-transparent border border-[var(--cms-border)] rounded-xl px-4 focus:outline-none focus:border-[var(--cms-text)]"
                    />
                    <input
                        type="password"
                        placeholder="Confirm new password"
                        value={passwordState.confirm}
                        onChange={(e) => setPasswordState({ ...passwordState, confirm: e.target.value })}
                        className="h-11 bg-transparent border border-[var(--cms-border)] rounded-xl px-4 focus:outline-none focus:border-[var(--cms-text)]"
                    />
                    <button
                        onClick={handleChangePassword}
                        disabled={passwordSaving || isMock}
                        className="h-11 px-4 rounded-xl font-bold text-sm inline-flex items-center gap-2 bg-[var(--cms-text)] text-[var(--cms-bg)] disabled:opacity-50"
                    >
                        <ShieldCheck className="w-4 h-4" />
                        {passwordSaving ? "Updating..." : "Update Password"}
                    </button>
                    {isMock && <p className="text-xs text-[var(--cms-muted)]">Password updates are disabled in mock mode.</p>}
                    {passwordMessage && <p className="text-xs text-[var(--cms-muted)]">{passwordMessage}</p>}
                </div>
            </section>
        </div>
    );
}
