"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { Loader2, PencilLine, Sparkles, Link, Upload } from "lucide-react";
import { getApiBase } from "@/lib/apiBase";
import { fetchOrgPermissions, type OrgPermissions } from "@/lib/orgPermissions";
import { getAuthToken } from "@/lib/authToken";
import { useTheme } from "@/components/ThemeProvider";

interface ParsedItem {
    name: string;
    description?: string;
    price?: number | null;
}

interface ParsedCategory {
    name: string;
    items: ParsedItem[];
}

interface ParsedMenu {
    categories: ParsedCategory[];
}

type CreateMenuFlowProps = {
    initialOrgId?: string;
    allowOrgSelect?: boolean;
    organizations?: { id: string; name: string }[];
    variant?: "light" | "dark" | "auto";
    onCreated?: (menuId: string) => void;
    initialMenuName?: string;
    lockMenuName?: boolean;
    showMenuDetails?: boolean;
    heroLabel?: string;
    heroTitle?: string;
    heroDescription?: string;
};

export default function CreateMenuFlow({
    initialOrgId,
    allowOrgSelect = true,
    organizations: providedOrganizations,
    variant = "light",
    onCreated,
    initialMenuName,
    lockMenuName = false,
    showMenuDetails = true,
    heroLabel = "New Menu",
    heroTitle = "Build a menu guests actually scan",
    heroDescription = "Start clean or import a menu file. You can fine‑tune everything after."
}: CreateMenuFlowProps) {
    const { user } = useAuthenticator((context) => [context.user]);
    const router = useRouter();
    const { resolvedTheme } = useTheme();
    const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>(providedOrganizations || []);
    const [selectedOrg, setSelectedOrg] = useState<string>(initialOrgId || "");
    const [menuName, setMenuName] = useState(initialMenuName || "");
    const [mode, setMode] = useState<"manual" | "import">("manual");
    const [creating, setCreating] = useState(false);
    const [importFiles, setImportFiles] = useState<File[]>([]);
    const [importUrl, setImportUrl] = useState("");
    const [importTab, setImportTab] = useState<"files" | "url">("files");
    const [parsedMenu, setParsedMenu] = useState<ParsedMenu | null>(null);
    const [isParsing, setIsParsing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [draftMenuId, setDraftMenuId] = useState<string | null>(null);
    const [orgPermissions, setOrgPermissions] = useState<OrgPermissions | null>(null);
    const [permissionsLoading, setPermissionsLoading] = useState(false);
    const [permissionsError, setPermissionsError] = useState<string | null>(null);

    const [resolvedVariant, setResolvedVariant] = useState<"light" | "dark">(
        variant === "dark" ? "dark" : "light"
    );

    useEffect(() => {
        if (variant === "auto") {
            setResolvedVariant(resolvedTheme);
            return;
        }
        setResolvedVariant(variant === "dark" ? "dark" : "light");
    }, [variant, resolvedTheme]);

    const palette = useMemo(() => {
        if (variant === "auto") {
            return {
                panel: "bg-[var(--cms-panel)] border-[var(--cms-border)]",
                panelMuted: "bg-[var(--cms-panel-strong)]/70 border-[var(--cms-border)]",
                text: "text-[var(--cms-text)]",
                muted: "text-[var(--cms-muted)]",
                pill: "bg-[var(--cms-pill)]",
                input: "bg-transparent border-[var(--cms-border)] text-[var(--cms-text)] placeholder:text-[var(--cms-muted)]",
                primary: "bg-[var(--cms-text)] text-[var(--cms-bg)]",
                border: "border-[var(--cms-border)]",
                dotActive: "bg-[var(--cms-text)]",
                dotMuted: "bg-[var(--cms-border)]"
            };
        }

        const isDark = resolvedVariant === "dark";
        return {
            panel: isDark ? "bg-white/5 border-white/10" : "bg-[var(--cms-panel)] border-[var(--cms-border)]",
            panelMuted: isDark ? "bg-white/3 border-white/10" : "bg-[var(--cms-panel)]/70 border-[var(--cms-border)]",
            text: isDark ? "text-white" : "text-[var(--cms-text)]",
            muted: isDark ? "text-white/60" : "text-[var(--cms-muted)]",
            pill: isDark ? "bg-white/10" : "bg-[var(--cms-pill)]",
            input: isDark
                ? "bg-white/5 border-white/10 text-white placeholder:text-white/40"
                : "bg-transparent border-[var(--cms-border)] text-[var(--cms-text)] placeholder:text-[var(--cms-muted)]",
            primary: isDark
                ? "bg-white text-black"
                : "bg-[var(--cms-text)] text-[var(--cms-bg)]",
            border: isDark ? "border-white/10" : "border-[var(--cms-border)]",
            dotActive: isDark ? "bg-white" : "bg-[var(--cms-text)]",
            dotMuted: isDark ? "bg-white/30" : "bg-[var(--cms-border)]"
        };
    }, [resolvedVariant, variant]);

    useEffect(() => {
        if (!allowOrgSelect || providedOrganizations) return;
        fetchOrganizations();
    }, [user, allowOrgSelect, providedOrganizations]);

    useEffect(() => {
        if (initialOrgId) setSelectedOrg(initialOrgId);
    }, [initialOrgId]);

    useEffect(() => {
        if (initialMenuName !== undefined) {
            setMenuName(initialMenuName);
        }
    }, [initialMenuName]);

    useEffect(() => {
        if (!selectedOrg || typeof window === "undefined") return;
        localStorage.setItem("menuvium_last_org_id", selectedOrg);
    }, [selectedOrg]);

    useEffect(() => {
        const load = async () => {
            if (!user || !selectedOrg) return;
            setPermissionsLoading(true);
            setPermissionsError(null);
            try {
                const token = await getAuthToken();
                const apiBase = getApiBase();
                const perms = await fetchOrgPermissions({ apiBase, token, orgId: selectedOrg });
                setOrgPermissions(perms);
            } catch (e) {
                console.error(e);
                setOrgPermissions(null);
                setPermissionsError(e instanceof Error ? e.message : "Failed to load permissions");
            } finally {
                setPermissionsLoading(false);
            }
        };
        load();
    }, [user, selectedOrg]);

    const fetchOrganizations = async () => {
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const orgRes = await fetch(`${apiBase}/organizations/`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!orgRes.ok) return;
            const orgs = await orgRes.json();
            if (!orgs.length) return;
            setOrganizations(orgs);
            if (orgs.length > 0 && !selectedOrg) {
                setSelectedOrg(orgs[0].id);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const ensureDraftMenu = async () => {
        if (!selectedOrg) return;
        if (orgPermissions && !orgPermissions.can_manage_menus) {
            alert("Not authorized to create menus for this company.");
            return;
        }
        if (draftMenuId) return draftMenuId;
        const resolvedName = !menuName.trim() ? "Imported Menu" : menuName.trim();
        setCreating(true);
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const res = await fetch(`${apiBase}/menus/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: resolvedName,
                    org_id: selectedOrg
                })
            });
            if (!res.ok) {
                const err = await res.json();
                alert(`Failed to create menu: ${err.detail || "Unknown error"}`);
                return;
            }
            const data = await res.json();
            setDraftMenuId(data.id);
            return data.id as string;
        } catch (e) {
            console.error(e);
        } finally {
            setCreating(false);
        }
    };

    const createManualMenu = async () => {
        if (!menuName.trim() || !selectedOrg) return;
        if (orgPermissions && !orgPermissions.can_manage_menus) {
            alert("Not authorized to create menus for this company.");
            return;
        }
        setCreating(true);
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const res = await fetch(`${apiBase}/menus/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: menuName.trim(),
                    org_id: selectedOrg
                })
            });
            if (!res.ok) {
                const err = await res.json();
                alert(`Failed to create menu: ${err.detail || "Unknown error"}`);
                return;
            }
            const data = await res.json();
            if (onCreated) {
                onCreated(data.id);
            } else {
                router.push(`/dashboard/menus/${data.id}`);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setCreating(false);
        }
    };

    const handleParseImport = async () => {
        if (importTab === "files" && importFiles.length === 0) return;
        if (importTab === "url" && !importUrl.trim()) return;
        if (orgPermissions && !orgPermissions.can_manage_menus) {
            alert("Not authorized to create menus for this company.");
            return;
        }
        const menuId = await ensureDraftMenu();
        if (!menuId) return;
        setIsParsing(true);
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            let res: Response;

            if (importTab === "url") {
                // URL-based import
                res = await fetch(`${apiBase}/imports/menu/parse-url?menu_id=${menuId}&url=${encodeURIComponent(importUrl.trim())}`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else if (importFiles.length === 1) {
                // Single file import (original endpoint for backwards compatibility)
                const formData = new FormData();
                formData.append("file", importFiles[0]);
                res = await fetch(`${apiBase}/imports/menu/parse?menu_id=${menuId}`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData
                });
            } else {
                // Multi-file import
                const formData = new FormData();
                importFiles.forEach((file) => {
                    formData.append("files", file);
                });
                res = await fetch(`${apiBase}/imports/menu/parse-multi?menu_id=${menuId}`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData
                });
            }

            if (!res.ok) {
                const err = await res.json();
                alert(err.detail || "Failed to parse menu");
                return;
            }
            setParsedMenu(await res.json());
        } catch (e) {
            console.error(e);
            alert("Failed to parse menu");
        } finally {
            setIsParsing(false);
        }
    };

    const handleApplyImport = async () => {
        if (!parsedMenu) return;
        if (orgPermissions && !orgPermissions.can_manage_menus) {
            alert("Not authorized to create menus for this company.");
            return;
        }
        const menuId = draftMenuId ?? (await ensureDraftMenu());
        if (!menuId) return;
        setIsImporting(true);
        try {
            const token = await getAuthToken();
            const apiBase = getApiBase();
            const res = await fetch(`${apiBase}/imports/menu/apply?menu_id=${menuId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(parsedMenu)
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.detail || "Failed to import menu");
                return;
            }
            if (onCreated) {
                onCreated(menuId);
            } else {
                router.push(`/dashboard/menus/${menuId}`);
            }
        } catch (e) {
            console.error(e);
            alert("Failed to import menu");
        } finally {
            setIsImporting(false);
        }
    };

    const selectedOrgName = organizations.find((org) => org.id === selectedOrg)?.name || "Company locked";
    const canManageMenus = orgPermissions ? orgPermissions.can_manage_menus : true;

    return (
        <div className="space-y-8">
            <div className={`relative overflow-hidden rounded-3xl border ${palette.border} ${palette.panel} p-6 md:p-8`}>
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute -top-24 -right-20 h-48 w-48 rounded-full bg-amber-300/10 blur-[80px]" />
                    <div className="absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-emerald-300/10 blur-[90px]" />
                </div>
                <div className={`relative ${showMenuDetails ? "grid gap-6 md:grid-cols-[1.15fr_0.85fr]" : "space-y-4"} items-center`}>
                    <div className="space-y-3">
                        <p className={`text-xs uppercase tracking-[0.3em] ${palette.muted}`}>{heroLabel}</p>
                        <h2 className={`text-3xl md:text-4xl font-bold tracking-tight ${palette.text}`}>
                            {heroTitle}
                        </h2>
                        <p className={`text-sm ${palette.muted}`}>
                            {heroDescription}
                        </p>
                        {!showMenuDetails && (
                            <div className="flex flex-wrap gap-2 pt-2 text-xs">
                                <span className={`px-3 py-1 rounded-full border ${palette.border} ${palette.panelMuted}`}>
                                    Menu: {menuName || "Untitled menu"}
                                </span>
                                <span className={`px-3 py-1 rounded-full border ${palette.border} ${palette.panelMuted}`}>
                                    Company: {selectedOrgName}
                                </span>
                            </div>
                        )}
                    </div>
                    {showMenuDetails && (
                        <div className="space-y-3">
                            <div className={`text-xs uppercase tracking-[0.2em] ${palette.muted}`}>Menu details</div>
                            <input
                                value={menuName}
                                onChange={(e) => setMenuName(e.target.value)}
                                placeholder="Menu name (optional for import)"
                                disabled={lockMenuName}
                                className={`w-full h-11 rounded-xl px-4 focus:outline-none focus:border-current border ${palette.input} ${lockMenuName ? "opacity-70 cursor-not-allowed" : ""}`}
                            />
                            {allowOrgSelect ? (
                                <select
                                    value={selectedOrg}
                                    onChange={(e) => setSelectedOrg(e.target.value)}
                                    className={`w-full h-11 rounded-xl px-4 focus:outline-none border ${palette.input}`}
                                >
                                    {organizations.map((org) => (
                                        <option key={org.id} value={org.id}>{org.name}</option>
                                    ))}
                                </select>
                            ) : (
                                <div className={`h-11 rounded-xl px-4 flex items-center border ${palette.input}`}>
                                    {selectedOrgName}
                                </div>
                            )}
                            <p className={`text-xs ${palette.muted}`}>{selectedOrg ? "Company locked for this menu." : "Select a company to continue."}</p>
                            {permissionsError && (
                                <p className={`text-xs ${palette.muted}`}>{permissionsError}</p>
                            )}
                            {!permissionsLoading && orgPermissions && !orgPermissions.can_manage_menus && (
                                <p className={`text-xs ${palette.muted}`}>
                                    You don’t have permission to create menus for this company.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className={`rounded-3xl border ${palette.border} ${palette.panel} p-6 space-y-5`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h3 className={`text-lg font-bold ${palette.text}`}>Choose a starting point</h3>
                        <p className={`text-sm ${palette.muted}`}>Switch anytime after creation.</p>
                    </div>
                    <div className={`inline-flex rounded-full border ${palette.border} ${palette.panelMuted} p-1`}>
                        <button
                            onClick={() => setMode("manual")}
                            className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${mode === "manual" ? palette.primary : palette.muted}`}
                        >
                            Manual build
                        </button>
                        <button
                            onClick={() => setMode("import")}
                            className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors ${mode === "import" ? palette.primary : palette.muted}`}
                        >
                            Import
                        </button>
                    </div>
                </div>

                {mode === "manual" && (
                    <div className={`rounded-2xl border ${palette.border} ${palette.panelMuted} p-5 flex flex-col gap-3`}>
                        <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-2xl ${palette.pill} flex items-center justify-center`}>
                                <PencilLine className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className={`text-base font-bold ${palette.text}`}>Create manually</h4>
                                <p className={`text-sm ${palette.muted}`}>Add categories, items, and pricing from scratch.</p>
                            </div>
                        </div>
                        <button
                            onClick={createManualMenu}
                            disabled={creating || !menuName.trim() || !selectedOrg || permissionsLoading || !canManageMenus}
                            className={`h-12 rounded-2xl font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 ${palette.primary}`}
                        >
                            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                            Create menu
                        </button>
                    </div>
                )}

                {mode === "import" && (
                    <div className={`rounded-2xl border ${palette.border} ${palette.panelMuted} p-5 space-y-4`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className={`text-base font-bold ${palette.text}`}>Import menu</h4>
                                <p className={`text-sm ${palette.muted}`}>Upload files or paste a public URL.</p>
                            </div>
                            <span className={`text-xs inline-flex items-center gap-1 ${palette.muted}`}>
                                <Sparkles className="w-3 h-3" /> OCR + AI
                            </span>
                        </div>

                        {/* Import source tabs */}
                        <div className={`inline-flex rounded-full border ${palette.border} ${palette.panelMuted} p-1`}>
                            <button
                                onClick={() => { setImportTab("files"); setParsedMenu(null); }}
                                className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${importTab === "files" ? palette.primary : palette.muted}`}
                            >
                                <Upload className="w-3 h-3" /> Files
                            </button>
                            <button
                                onClick={() => { setImportTab("url"); setParsedMenu(null); }}
                                className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${importTab === "url" ? palette.primary : palette.muted}`}
                            >
                                <Link className="w-3 h-3" /> URL
                            </button>
                        </div>

                        {/* Files import */}
                        {importTab === "files" && (
                            <div className="space-y-3">
                                <p className={`text-xs ${palette.muted}`}>
                                    Upload one or more images/PDFs. Multiple files will be combined and parsed together.
                                </p>
                                <div className="flex flex-wrap items-center gap-3">
                                    <input
                                        type="file"
                                        accept="image/*,.pdf"
                                        multiple
                                        onChange={(e) => {
                                            setImportFiles(Array.from(e.target.files || []));
                                            setParsedMenu(null);
                                        }}
                                        className="text-sm"
                                    />
                                    {importFiles.length > 0 && (
                                        <span className={`text-xs ${palette.muted}`}>
                                            {importFiles.length} file{importFiles.length > 1 ? "s" : ""} selected
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* URL import */}
                        {importTab === "url" && (
                            <div className="space-y-3">
                                <p className={`text-xs ${palette.muted}`}>
                                    Paste a public link to a menu image, PDF, or web page.
                                </p>
                                <input
                                    type="url"
                                    placeholder="https://restaurant.com/menu.pdf"
                                    value={importUrl}
                                    onChange={(e) => {
                                        setImportUrl(e.target.value);
                                        setParsedMenu(null);
                                    }}
                                    className={`w-full h-11 rounded-xl px-4 focus:outline-none focus:border-current border ${palette.input}`}
                                />
                            </div>
                        )}

                        {/* Parse button */}
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                onClick={handleParseImport}
                                disabled={
                                    (importTab === "files" && importFiles.length === 0) ||
                                    (importTab === "url" && !importUrl.trim()) ||
                                    isParsing || !selectedOrg || permissionsLoading || !canManageMenus
                                }
                                className={`h-10 px-4 rounded-lg font-semibold text-sm disabled:opacity-50 ${palette.primary}`}
                            >
                                {isParsing ? "Parsing..." : "Parse menu"}
                            </button>
                            {parsedMenu && (
                                <button
                                    onClick={handleApplyImport}
                                    disabled={isImporting || permissionsLoading || !canManageMenus}
                                    className={`h-10 px-4 rounded-lg font-semibold text-sm border ${palette.border} ${palette.panelMuted} disabled:opacity-50`}
                                >
                                    {isImporting ? "Importing..." : "Import & open"}
                                </button>
                            )}
                        </div>

                        {parsedMenu && (
                            <div className="space-y-4">
                                {parsedMenu.categories.map((cat, idx) => (
                                    <div key={`${cat.name}-${idx}`} className={`border ${palette.border} rounded-2xl p-4`}>
                                        <h4 className={`font-bold mb-2 ${palette.text}`}>{cat.name}</h4>
                                        <ul className={`text-sm ${palette.muted} space-y-1`}>
                                            {cat.items.map((item, itemIdx) => (
                                                <li key={`${item.name}-${itemIdx}`}>
                                                    {item.name}{item.price != null ? ` — $${item.price}` : ""}{item.description ? ` · ${item.description}` : ""}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

        </div>
    );
}
