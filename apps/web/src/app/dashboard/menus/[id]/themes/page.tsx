"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuthenticator } from "@aws-amplify/ui-react";
import {
  ArrowLeft,
  ExternalLink,
  Image,
  Loader2,
  Palette,
  Search,
  X,
} from "lucide-react";
import { MENU_THEME_BY_ID, MENU_THEMES, MenuThemeId } from "@/lib/menuThemes";
import { getApiBase } from "@/lib/apiBase";
import { fetchOrgPermissions } from "@/lib/orgPermissions";
import { getAuthToken } from "@/lib/authToken";
import { ImageCropperModal } from "@/components/menus/ImageCropperModal";
import { useToast } from "@/components/ui/ToastProvider";
import { Badge } from "@/components/ui/Badge";

interface Menu {
  id: string;
  name: string;
  theme?: string;
  show_item_images?: boolean;
  banner_url?: string | null;
  logo_url?: string | null;
  logo_qr_url?: string | null;
  org_id: string;
}

export default function MenuThemesPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthenticator((context) => [context.user]);
  const { toast } = useToast();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingThemeId, setSavingThemeId] = useState<MenuThemeId | null>(null);
  const apiBase = getApiBase();
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoQrGenerating, setLogoQrGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<"theme" | "branding">("theme");
  const [bannerCropFile, setBannerCropFile] = useState<File | null>(null);
  const bannerPreviewBlobUrlRef = useRef<string | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<MenuThemeId>("noir");
  const [selectedShowItemImages, setSelectedShowItemImages] = useState(true);
  const [previewRevision, setPreviewRevision] = useState(0);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewScrollTopRef = useRef(0);
  const previewSignatureRef = useRef<string | null>(null);

  const menuId = params.id as string;

  const resolveThemeId = (themeId?: string | null): MenuThemeId => {
    if (!themeId) return "noir";
    return MENU_THEME_BY_ID[themeId as MenuThemeId]
      ? (themeId as MenuThemeId)
      : "noir";
  };

  const withAlpha = (hex: string, alphaHex: string) => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) return `${hex}${alphaHex}`;
    return hex;
  };

  useEffect(() => {
    if (!menuId) return;
    fetchMenuData(menuId);
  }, [menuId, user]);

  const fetchMenuData = async (id: string) => {
    try {
      const token = await getAuthToken();
      const menuRes = await fetch(`${apiBase}/menus/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (menuRes.ok) {
        const menuData = (await menuRes.json()) as Menu;
        const perms = await fetchOrgPermissions({
          apiBase,
          token,
          orgId: menuData.org_id,
        });
        if (!perms.can_manage_menus) {
          setPermissionError(
            "You don’t have permission to change themes for this menu.",
          );
          router.replace(`/dashboard/menus/${id}`);
          return;
        }
        setMenu(menuData);
      }
    } catch (e) {
      console.error("Failed to load menu theme data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (bannerPreviewBlobUrlRef.current) {
      URL.revokeObjectURL(bannerPreviewBlobUrlRef.current);
      bannerPreviewBlobUrlRef.current = null;
    }
    setBannerPreview(menu?.banner_url ?? null);
    setLogoPreview(menu?.logo_url ?? null);
  }, [menu?.banner_url, menu?.logo_url]);

  const tagsList = useMemo(() => {
    const tags = new Set<string>();
    MENU_THEMES.forEach((theme) => {
      tags.add(theme.category);
      tags.add(theme.layout);
      theme.cuisines.forEach((cuisine) => tags.add(cuisine));
    });
    return Array.from(tags).sort();
  }, []);

  const filteredThemes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return MENU_THEMES.filter((theme) => {
      if (selectedTags.length > 0) {
        const themeTags = [theme.category, theme.layout, ...theme.cuisines];
        if (!selectedTags.every((tag) => themeTags.includes(tag))) return false;
      }
      if (!query) return true;
      const haystack =
        `${theme.name} ${theme.description} ${theme.tone} ${theme.cuisines.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [search, selectedTags]);

  const orderedThemes = useMemo(() => {
    const activeId = resolveThemeId(menu?.theme);
    return filteredThemes.slice().sort((a, b) => {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [filteredThemes, menu?.theme]);

  const activeThemeId = useMemo(
    () => resolveThemeId(menu?.theme),
    [menu?.theme],
  );
  const activeShowItemImages = menu?.show_item_images !== false;
  const selectedTheme = useMemo(() => {
    return MENU_THEME_BY_ID[selectedThemeId] || MENU_THEME_BY_ID.noir;
  }, [selectedThemeId]);
  const previewContentSignature = useMemo(
    () =>
      [
        menu?.banner_url ?? "",
        menu?.logo_url ?? "",
        menu?.show_item_images === false ? "hide" : "show",
      ].join("|"),
    [menu?.banner_url, menu?.logo_url, menu?.show_item_images],
  );

  const capturePreviewScrollPosition = () => {
    const frameWindow = previewIframeRef.current?.contentWindow;
    const frameDocument = previewIframeRef.current?.contentDocument;
    previewScrollTopRef.current =
      frameWindow?.scrollY ??
      frameDocument?.documentElement.scrollTop ??
      frameDocument?.body.scrollTop ??
      0;
  };

  const previewHref = useMemo(() => {
    const params = new URLSearchParams({
      theme: selectedThemeId,
      v: String(previewRevision),
      embed: "1",
      show_images: selectedShowItemImages ? "1" : "0",
    });
    return `/r/${menuId}?${params.toString()}`;
  }, [menuId, selectedThemeId, previewRevision, selectedShowItemImages]);

  const previewOpenHref = useMemo(() => {
    const params = new URLSearchParams({
      theme: selectedThemeId,
      show_images: selectedShowItemImages ? "1" : "0",
    });
    return `/r/${menuId}?${params.toString()}`;
  }, [menuId, selectedThemeId, selectedShowItemImages]);

  useEffect(() => {
    setSelectedThemeId(activeThemeId);
  }, [activeThemeId]);

  useEffect(() => {
    setSelectedShowItemImages(activeShowItemImages);
  }, [activeShowItemImages]);

  useEffect(() => {
    if (previewSignatureRef.current === null) {
      previewSignatureRef.current = previewContentSignature;
      return;
    }
    if (previewSignatureRef.current === previewContentSignature) return;
    capturePreviewScrollPosition();
    previewSignatureRef.current = previewContentSignature;
    setPreviewRevision((prev) => prev + 1);
  }, [previewContentSignature]);

  const resetFilters = () => {
    setSearch("");
    setSelectedTags([]);
  };

  const hasFilters = search.trim() || selectedTags.length > 0;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((value) => value !== tag)
        : [...prev, tag],
    );
  };

  const uploadBanner = async (file: File): Promise<Menu | null> => {
    if (!menu) return null;
    setBannerUploading(true);
    try {
      const token = await getAuthToken();
      const uploadRes = await fetch(`${apiBase}/items/upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || "image/jpeg",
        }),
      });
      if (!uploadRes.ok) {
        throw new Error("Failed to get upload url");
      }
      const uploadData = await uploadRes.json();
      const putRes = await fetch(uploadData.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error("Failed to upload banner");
      }
      const patchRes = await fetch(`${apiBase}/menus/${menu.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ banner_url: uploadData.public_url }),
      });
      if (!patchRes.ok) {
        throw new Error("Failed to save banner");
      }
      const updated = await patchRes.json();
      setMenu(updated);
      return updated;
    } catch (e) {
      console.error(e);
      toast({ variant: "error", title: "Error uploading banner" });
      return null;
    } finally {
      setBannerUploading(false);
    }
  };

  const removeBanner = async () => {
    if (!menu) return;
    setBannerUploading(true);
    try {
      const token = await getAuthToken();
      const patchRes = await fetch(`${apiBase}/menus/${menu.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ banner_url: null }),
      });
      if (!patchRes.ok) {
        throw new Error("Failed to remove banner");
      }
      const updated = await patchRes.json();
      setMenu(updated);
    } catch (e) {
      console.error(e);
      toast({ variant: "error", title: "Error removing banner" });
    } finally {
      setBannerUploading(false);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!menu) return;
    setLogoUploading(true);
    try {
      const token = await getAuthToken();
      const uploadRes = await fetch(`${apiBase}/items/upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || "image/png",
        }),
      });
      if (!uploadRes.ok) {
        throw new Error("Failed to get upload url");
      }
      const uploadData = await uploadRes.json();
      const putRes = await fetch(uploadData.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/png" },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error("Failed to upload logo");
      }
      const patchRes = await fetch(`${apiBase}/menus/${menu.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ logo_url: uploadData.public_url }),
      });
      if (!patchRes.ok) {
        throw new Error("Failed to save logo");
      }
      const updated = await patchRes.json();
      setMenu(updated);
      setLogoQrGenerating(true);
      try {
        const qrRes = await fetch(
          `${apiBase}/menus/${menu.id}/generate-logo-qr`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        if (!qrRes.ok) {
          const err = await qrRes.json().catch(() => ({}));
          const detail =
            typeof err === "object" && err && "detail" in err
              ? String((err as { detail?: unknown }).detail || "")
              : "";
          throw new Error(detail || "Branded QR generation failed");
        }
        const qrData = await qrRes.json();
        setMenu((prev) =>
          prev
            ? {
                ...prev,
                logo_qr_url:
                  typeof qrData.logo_qr_url === "string"
                    ? qrData.logo_qr_url
                    : prev.logo_qr_url,
              }
            : prev,
        );
      } catch (e) {
        console.error(e);
        toast({
          variant: "warning",
          title: "Logo uploaded",
          description:
            e instanceof Error
              ? `Could not generate branded QR: ${e.message}`
              : "Could not generate branded QR right now.",
        });
      } finally {
        setLogoQrGenerating(false);
      }
    } catch (e) {
      console.error(e);
      toast({ variant: "error", title: "Error uploading logo" });
    } finally {
      setLogoUploading(false);
    }
  };

  const removeLogo = async () => {
    if (!menu) return;
    setLogoUploading(true);
    try {
      const token = await getAuthToken();
      const patchRes = await fetch(`${apiBase}/menus/${menu.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ logo_url: null }),
      });
      if (!patchRes.ok) {
        throw new Error("Failed to remove logo");
      }
      const updated = await patchRes.json();
      setMenu(updated);
      setLogoQrGenerating(false);
    } catch (e) {
      console.error(e);
      toast({ variant: "error", title: "Error removing logo" });
    } finally {
      setLogoUploading(false);
    }
  };

  const handleShowItemImagesSelection = (showImages: boolean) => {
    capturePreviewScrollPosition();
    setSelectedShowItemImages(showImages);
  };

  const applyTheme = async (themeId: MenuThemeId) => {
    if (!menu) return;
    setSavingThemeId(themeId);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${apiBase}/menus/${menu.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          theme: themeId,
          show_item_images: selectedShowItemImages,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMenu((prev) =>
          prev
            ? {
                ...prev,
                theme: data.theme ?? themeId,
                show_item_images:
                  typeof data.show_item_images === "boolean"
                    ? data.show_item_images
                    : selectedShowItemImages,
              }
            : prev,
        );
        return;
      }
      const err = await res.json();
      toast({
        variant: "error",
        title: "Failed to update theme",
        description: err.detail || "Unknown error",
      });
    } catch (e) {
      console.error(e);
      toast({ variant: "error", title: "Error updating theme" });
    } finally {
      setSavingThemeId(null);
    }
  };

  const handleThemeSelection = (themeId: MenuThemeId) => {
    if (themeId === selectedThemeId) return;
    capturePreviewScrollPosition();
    setSelectedThemeId(themeId);
  };

  const handlePreviewLoad = () => {
    const frameWindow = previewIframeRef.current?.contentWindow;
    if (!frameWindow || previewScrollTopRef.current <= 0) return;
    const scrollTarget = previewScrollTopRef.current;
    previewScrollTopRef.current = 0;
    frameWindow.requestAnimationFrame(() => {
      frameWindow.scrollTo(0, scrollTarget);
    });
  };

  if (loading) {
    return (
      <div className="text-[var(--cms-muted)] flex items-center gap-2">
        <Loader2 className="animate-spin" /> Loading themes...
      </div>
    );
  }

  if (permissionError) {
    return (
      <div className="text-sm text-[var(--cms-muted)]">{permissionError}</div>
    );
  }

  const hasThemeSelectionChange = selectedThemeId !== activeThemeId;
  const hasItemImagesSelectionChange =
    selectedShowItemImages !== activeShowItemImages;
  const isApplyingSelectedTheme = savingThemeId === selectedThemeId;
  const canApplySelectedTheme =
    (hasThemeSelectionChange || hasItemImagesSelectionChange) && !savingThemeId;

  return (
    <div className="w-full max-w-[1400px] mr-auto space-y-6">
      <header className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Link
              href={`/dashboard/menus/${menuId}`}
              className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Menu
            </Link>
            <h1 className="font-heading text-4xl font-bold tracking-tight">
              Design Studio
            </h1>
            <p className="text-sm text-[var(--cms-muted)]">
              Menu:{" "}
              <span className="font-semibold text-[var(--cms-text)]">
                {menu?.name || "Untitled Menu"}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-3 text-xs font-semibold text-[var(--cms-muted)]">
              <span>Item images</span>
              <span className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedShowItemImages}
                  onChange={(e) =>
                    handleShowItemImagesSelection(e.target.checked)
                  }
                  className="peer sr-only"
                />
                <span className="h-5 w-9 rounded-full bg-[var(--cms-border)] transition-colors peer-checked:bg-[var(--cms-accent)]" />
                <span className="pointer-events-none absolute left-[2px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
              </span>
            </label>
            <button
              type="button"
              onClick={() => applyTheme(selectedThemeId)}
              disabled={!canApplySelectedTheme}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
                canApplySelectedTheme
                  ? "bg-[var(--cms-accent)] text-white hover:bg-[var(--cms-accent-strong)]"
                  : "bg-[var(--cms-panel-strong)] text-[var(--cms-muted)]"
              }`}
            >
              {isApplyingSelectedTheme ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              {isApplyingSelectedTheme ? "Applying..." : "Apply"}
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-2">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab("theme")}
                className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
                  activeTab === "theme"
                    ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                    : "text-[var(--cms-muted)] hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)]"
                }`}
              >
                <Palette className="w-4 h-4" />
                Themes
              </button>
              <button
                onClick={() => setActiveTab("branding")}
                className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
                  activeTab === "branding"
                    ? "bg-[var(--cms-accent-subtle)] text-[var(--cms-text)]"
                    : "text-[var(--cms-muted)] hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)]"
                }`}
              >
                <Image className="w-4 h-4" />
                Branding
              </button>
            </div>
          </section>

          {activeTab === "theme" && (
            <section className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-5 sm:p-6 space-y-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--cms-muted)]">
                    Theme Library
                  </p>
                  <h2 className="font-heading text-5xl max-[640px]:text-4xl font-bold tracking-tight mt-1">
                    Choose a look
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cms-muted)]" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search..."
                      className="h-11 min-w-[220px] w-full rounded-full border border-[var(--cms-border)] bg-[var(--cms-bg)] pl-9 pr-4 text-sm text-[var(--cms-text)] placeholder:text-[var(--cms-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--cms-accent)]/20"
                    />
                  </div>
                  {hasFilters && (
                    <button
                      onClick={resetFilters}
                      className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--cms-border)] px-4 text-sm font-semibold text-[var(--cms-muted)] transition-colors hover:bg-[var(--cms-pill)] hover:text-[var(--cms-text)]"
                    >
                      <X className="h-4 w-4" /> Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {tagsList.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`h-8 px-4 rounded-full text-xs font-semibold border whitespace-nowrap ${
                      selectedTags.includes(tag)
                        ? "bg-[var(--cms-accent)] text-white border-[var(--cms-accent)]"
                        : "border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {orderedThemes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--cms-border)] bg-[var(--cms-panel-strong)] p-8 text-center text-[var(--cms-muted)]">
                  No themes match those filters. Try clearing or adjusting your
                  search.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {orderedThemes.map((theme) => {
                    const isActive = activeThemeId === theme.id;
                    const isSelected = selectedThemeId === theme.id;
                    const primaryTextColor = theme.palette.text;
                    const secondaryTextColor = withAlpha(
                      theme.palette.text,
                      "B8",
                    );
                    const tertiaryTextColor = withAlpha(
                      theme.palette.text,
                      "96",
                    );
                    const cardBlendStyle = {
                      backgroundColor: theme.palette.surface,
                      backgroundImage: `
                                                radial-gradient(140% 120% at 0% 0%, ${withAlpha(theme.palette.accent, "40")} 0%, transparent 58%),
                                                radial-gradient(120% 130% at 100% 5%, ${withAlpha(theme.palette.bg, "DD")} 0%, transparent 62%),
                                                radial-gradient(125% 140% at 50% 100%, ${withAlpha(theme.palette.surfaceAlt, "D6")} 0%, transparent 60%),
                                                linear-gradient(140deg, ${withAlpha(theme.palette.bg, "EA")} 0%, ${withAlpha(theme.palette.surface, "F2")} 52%, ${withAlpha(theme.palette.accent, "22")} 100%)
                                            `,
                    } as const;
                    return (
                      <div key={theme.id} className="relative">
                        {isActive && (
                          <Badge
                            variant="success"
                            className="pointer-events-none absolute -top-2.5 right-2 z-10 rounded-md border border-neutral-700 bg-white px-2 py-0.5 font-bold text-emerald-700 shadow-[0_4px_10px_rgba(0,0,0,0.28)]"
                          >
                            Active
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => handleThemeSelection(theme.id)}
                          aria-pressed={isSelected}
                          className={`w-full overflow-hidden rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent)]/30 ${
                            isActive
                              ? "border-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                              : isSelected
                                ? "border-[var(--cms-accent)]/40"
                                : "border-[var(--cms-border)]"
                          }`}
                          style={cardBlendStyle}
                        >
                          <div className="px-2.5 py-2.5">
                            <div className="min-w-0">
                              <h3
                                className="truncate text-base font-bold tracking-tight"
                                style={{ color: primaryTextColor }}
                              >
                                {theme.name}
                              </h3>
                              <p
                                className="mt-0.5 line-clamp-1 text-[11px]"
                                style={{ color: secondaryTextColor }}
                              >
                                {theme.description}
                              </p>
                              <p
                                className="mt-0.5 text-[10px] capitalize"
                                style={{ color: tertiaryTextColor }}
                              >
                                {theme.category} · {theme.layout}
                              </p>
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {activeTab === "branding" && (
            <>
              <section className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--cms-muted)]">
                      Branding
                    </p>
                    <h2 className="font-heading text-2xl font-bold tracking-tight mt-1">
                      Restaurant logo
                    </h2>
                    <p className="text-sm text-[var(--cms-muted)] mt-1">
                      Used in title areas and public menu headers.
                    </p>
                  </div>
                  {logoPreview && (
                    <button
                      onClick={removeLogo}
                      disabled={logoUploading}
                      className="h-9 px-4 rounded-full border border-[var(--cms-border)] text-sm font-semibold text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]"
                    >
                      Remove logo
                    </button>
                  )}
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr] items-center">
                  <div className="rounded-2xl border border-dashed border-[var(--cms-border)] bg-[var(--cms-bg)] p-4 flex items-center justify-center min-h-[220px]">
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Restaurant logo"
                        className="w-36 h-36 object-contain rounded-xl"
                      />
                    ) : (
                      <div className="text-center text-sm text-[var(--cms-muted)]">
                        No logo uploaded yet.
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--cms-text)]">
                      Upload your logo
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={logoUploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (e) =>
                            setLogoPreview(e.target?.result as string);
                          reader.readAsDataURL(file);
                          uploadLogo(file);
                        }
                        event.currentTarget.value = "";
                      }}
                      className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-[var(--cms-text)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--cms-bg)] hover:file:opacity-90"
                    />
                    <p className="text-xs text-[var(--cms-muted)]">
                      Recommended: square image, 512x512 or larger.
                    </p>
                    {logoQrGenerating ? (
                      <p className="text-xs text-[var(--cms-muted)]">
                        Generating branded QR code...
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--cms-muted)]">
                      Cover
                    </p>
                    <h2 className="font-heading text-2xl font-bold tracking-tight mt-1">
                      Menu banner
                    </h2>
                    <p className="text-sm text-[var(--cms-muted)] mt-1">
                      Shown at the top of your guest menu.
                    </p>
                  </div>
                  {bannerPreview && (
                    <button
                      onClick={removeBanner}
                      disabled={bannerUploading}
                      className="h-9 px-4 rounded-full border border-[var(--cms-border)] text-sm font-semibold text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:bg-[var(--cms-pill)]"
                    >
                      Remove banner
                    </button>
                  )}
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_0.75fr] items-center">
                  <div className="rounded-2xl border border-dashed border-[var(--cms-border)] bg-[var(--cms-bg)] p-4">
                    {bannerPreview ? (
                      <img
                        src={bannerPreview}
                        alt="Menu banner"
                        className="w-full h-48 object-cover rounded-xl"
                      />
                    ) : (
                      <div className="h-48 rounded-xl flex items-center justify-center text-sm text-[var(--cms-muted)]">
                        No banner uploaded yet.
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--cms-text)]">
                      Upload a cover photo
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={bannerUploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) setBannerCropFile(file);
                        event.currentTarget.value = "";
                      }}
                      className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-[var(--cms-text)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--cms-bg)] hover:file:opacity-90"
                    />
                    <p className="text-xs text-[var(--cms-muted)]">
                      Recommended: 1600x900 or larger (16:9).
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}

          <ImageCropperModal
            open={Boolean(bannerCropFile)}
            file={bannerCropFile}
            aspect={16 / 9}
            title="Crop banner"
            description="Drag to reposition and adjust zoom. Double-click to reset."
            confirmLabel="Crop & upload"
            onCancel={() => setBannerCropFile(null)}
            onConfirm={async (blob) => {
              const original = bannerCropFile;
              if (!original) return;

              const previousPreview = bannerPreview;
              const localUrl = URL.createObjectURL(blob);
              bannerPreviewBlobUrlRef.current = localUrl;
              setBannerPreview(localUrl);

              const filenameBase = original.name.replace(/\.[^/.]+$/, "");
              const croppedFile = new File(
                [blob],
                `${filenameBase}_banner.jpg`,
                { type: blob.type },
              );

              const updated = await uploadBanner(croppedFile);
              if (!updated) {
                if (bannerPreviewBlobUrlRef.current) {
                  URL.revokeObjectURL(bannerPreviewBlobUrlRef.current);
                  bannerPreviewBlobUrlRef.current = null;
                }
                setBannerPreview(previousPreview);
              }

              setBannerCropFile(null);
            }}
          />
        </div>

        <aside className="xl:sticky xl:top-6 xl:self-start space-y-4">
          <div className="flex items-center justify-between gap-3 px-1">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--cms-muted)]">
              Preview · {selectedTheme.name}
            </span>
            <Link
              href={previewOpenHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--cms-muted)] transition-colors hover:text-[var(--cms-text)]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open preview in new tab
            </Link>
          </div>

          <section className="rounded-3xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-3 sm:p-4">
            <div className="mx-auto w-full max-w-[420px]">
              <div className="relative rounded-[2.8rem] bg-gradient-to-b from-white/40 via-zinc-500/35 to-zinc-900/80 p-[9px] shadow-[0_30px_55px_-35px_rgba(0,0,0,0.9)]">
                <div className="relative overflow-hidden rounded-[2.45rem] border border-black/60 bg-black">
                  <div className="pointer-events-none absolute left-1/2 top-[9px] z-20 h-[7px] w-[7px] -translate-x-1/2 rounded-full bg-zinc-500/85 ring-1 ring-white/20" />
                  <div className="relative aspect-[9/19.5] w-full overflow-hidden rounded-[1.95rem] bg-white">
                    <iframe
                      ref={previewIframeRef}
                      title={`${menu?.name || "Menu"} preview`}
                      src={previewHref}
                      onLoad={handlePreviewLoad}
                      className="no-scrollbar h-full w-full border-0"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
