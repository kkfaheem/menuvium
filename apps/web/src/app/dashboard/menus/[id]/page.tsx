"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, ArrowLeft, GripVertical, Trash2, X, Image as ImageIcon, Loader2, Check, ChevronDown, ChevronRight, Download, PencilLine } from "lucide-react";
import Link from "next/link";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useParams, useRouter } from "next/navigation";
import {
    DndContext,
    PointerSensor,
    DragOverlay,
    closestCenter,
    type DragEndEvent,
    useSensor,
    useSensors
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { ALLERGEN_TAGS, DIET_TAGS, HIGHLIGHT_TAGS, SPICE_TAGS, TAG_LABELS_DEFAULTS } from "@/lib/menuTagPresets";
import { getApiBase } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/authToken";
import { fetchOrgPermissions } from "@/lib/orgPermissions";
import type { Menu, Category, Item, DietaryTag, Allergen, OrgPermissions, ItemFormData } from "@/types";
import { SortableCategoryCard } from "@/components/menus/SortableCategoryCard";
import { SortableItemRow } from "@/components/menus/SortableItemRow";
import { useMenuEditor } from "@/hooks/useMenuEditor";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";

export default function MenuDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuthenticator((context) => [context.user]);
    const confirm = useConfirm();
    const { toast } = useToast();
    const apiBase = getApiBase();
    const [menu, setMenu] = useState<Menu | null>(null);
    const [menuName, setMenuName] = useState("");
    const [menuActive, setMenuActive] = useState(true);
    const [isSavingMenu, setIsSavingMenu] = useState(false);
    const [isDeletingMenu, setIsDeletingMenu] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [pageDirty, setPageDirty] = useState(false);
    const [hasLoadedMenu, setHasLoadedMenu] = useState(false);
    const [menuBaseline, setMenuBaseline] = useState<{ name: string; is_active: boolean } | null>(null);
    const [loading, setLoading] = useState(true);
    const [dietaryTags, setDietaryTags] = useState<{ id: string, name: string }[]>([]);
    const [allergens, setAllergens] = useState<{ id: string, name: string }[]>([]);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [arVideoToUpload, setArVideoToUpload] = useState<File | null>(null);
    const [arVideoPreviewUrl, setArVideoPreviewUrl] = useState<string | null>(null);
    const [isUploadingArVideo, setIsUploadingArVideo] = useState(false);
    const [isRetryingArGeneration, setIsRetryingArGeneration] = useState(false);
    const [arVideoError, setArVideoError] = useState<string | null>(null);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [editingItem, setEditingItem] = useState<Partial<Item> & { categoryId?: string } | null>(null);
    const [isSavingItem, setIsSavingItem] = useState(false);
    const [isRemovingItemPhoto, setIsRemovingItemPhoto] = useState(false);
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [editingCategoryName, setEditingCategoryName] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [isEditingMenuName, setIsEditingMenuName] = useState(false);
    const [menuNameDraft, setMenuNameDraft] = useState("");
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Set<string>>(new Set());
    const [tagLabels, setTagLabels] = useState(TAG_LABELS_DEFAULTS);
    const [tagGroups, setTagGroups] = useState<Record<string, "diet" | "spice" | "highlights">>({});
    const [mode, setMode] = useState<"admin" | "manager" | null>(null);
    const [orgPermissions, setOrgPermissions] = useState<OrgPermissions | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const arVideoInputRef = useRef<HTMLInputElement | null>(null);
    const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
    const [isPhotoPreviewOpen, setIsPhotoPreviewOpen] = useState(false);
    const existingEditingItemPhotoUrl =
        editingItem?.photo_url || (editingItem ? (editingItem as any).photos?.[0]?.url : undefined);
    const editingItemDisplayPhotoUrl = filePreviewUrl || existingEditingItemPhotoUrl;
    const editingItemArStatus = editingItem?.ar_status ?? "none";
    const editingItemArStage = editingItem?.ar_stage || null;
    const editingItemArStageDetail = editingItem?.ar_stage_detail || null;
    const editingItemArProgress =
        typeof editingItem?.ar_progress === "number"
            ? Math.max(0, Math.min(1, editingItem.ar_progress))
            : null;
    const editingItemArProgressPercent =
        editingItemArProgress === null ? null : Math.round(editingItemArProgress * 100);
    const arStatusLabel =
        editingItemArStatus === "ready"
            ? "Ready"
            : editingItemArStatus === "processing"
                ? "Processing"
                : editingItemArStatus === "pending"
                    ? "Queued"
                    : editingItemArStatus === "failed"
                        ? "Failed"
                        : "Not set";
    const arStatusPillClassName =
        editingItemArStatus === "ready"
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            : editingItemArStatus === "processing"
                ? "bg-sky-500/10 text-sky-400 border-sky-500/20"
                : editingItemArStatus === "pending"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : editingItemArStatus === "failed"
                        ? "bg-red-500/10 text-red-400 border-red-500/20"
                        : "bg-[var(--cms-panel-strong)] text-[var(--cms-muted)] border-[var(--cms-border)]";

    useEffect(() => {
        if (!fileToUpload) {
            setFilePreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(fileToUpload);
        setFilePreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [fileToUpload]);

    useEffect(() => {
        if (!arVideoToUpload) {
            setArVideoPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(arVideoToUpload);
        setArVideoPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [arVideoToUpload]);

    useEffect(() => {
        setArVideoToUpload(null);
        setArVideoPreviewUrl(null);
        setArVideoError(null);
        if (arVideoInputRef.current) arVideoInputRef.current.value = "";
    }, [editingItem?.id]);

    useEffect(() => {
        if (!isPhotoPreviewOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsPhotoPreviewOpen(false);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isPhotoPreviewOpen]);

    const normalize = (value: string) => value.trim().toLowerCase();
    const orderTags = <T extends { id: string; name: string }>(source: T[], names: string[]) =>
        names.map((name) => source.find((tag) => normalize(tag.name) === normalize(name))).filter(Boolean) as T[];

    const orderByDefaults = (list: { id: string; name: string }[], defaults: string[]) => {
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

    const ensureTagGroups = (existing: { id: string; name: string }[]) => {
        const defaults = new Map<string, "diet" | "spice" | "highlights">();
        DIET_TAGS.forEach((name) => defaults.set(normalize(name), "diet"));
        SPICE_TAGS.forEach((name) => defaults.set(normalize(name), "spice"));
        HIGHLIGHT_TAGS.forEach((name) => defaults.set(normalize(name), "highlights"));
        const next = { ...tagGroups };
        let changed = false;
        existing.forEach((tag) => {
            if (next[tag.id]) return;
            const group = defaults.get(normalize(tag.name)) ?? "highlights";
            next[tag.id] = group;
            changed = true;
        });
        if (changed && typeof window !== "undefined") {
            localStorage.setItem("menuvium_tag_groups", JSON.stringify(next));
            setTagGroups(next);
        }
    };

    useEffect(() => {
        if (!dietaryTags.length) return;
        ensureTagGroups(dietaryTags);
    }, [dietaryTags, tagGroups]);

    const groupedTags = {
        diet: dietaryTags.filter((tag) => tagGroups[tag.id] === "diet"),
        spice: dietaryTags.filter((tag) => tagGroups[tag.id] === "spice"),
        highlights: dietaryTags.filter((tag) => tagGroups[tag.id] === "highlights")
    };

    const dietTagList = orderByDefaults(groupedTags.diet, DIET_TAGS);
    const spiceTagList = orderByDefaults(groupedTags.spice, SPICE_TAGS);
    const highlightTagList = orderByDefaults(groupedTags.highlights, HIGHLIGHT_TAGS);
    const allergenTagList = orderTags(allergens, ALLERGEN_TAGS);

    useEffect(() => {
        if (params.id) {
            fetchMenu(params.id as string);
            fetchMetadata();
        }
    }, [params.id, user]);


    useEffect(() => {
        if (typeof window === "undefined") return;
        const storedLabels = localStorage.getItem("menuvium_tag_labels");
        if (storedLabels) {
            try {
                const parsed = JSON.parse(storedLabels) as Partial<typeof TAG_LABELS_DEFAULTS>;
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
        setMode((localStorage.getItem("menuvium_user_mode") as "admin" | "manager" | null) || null);
    }, []);

    const fetchMetadata = async () => {
        try {
            const [tagsRes, algRes] = await Promise.all([
                fetch(`${apiBase}/metadata/dietary-tags`),
                fetch(`${apiBase}/metadata/allergens`)
            ]);
            if (tagsRes.ok) setDietaryTags(await tagsRes.json());
            if (algRes.ok) setAllergens(await algRes.json());
        } catch (e) {
            console.error("Failed to fetch metadata", e);
        }
    };

    const fetchMenu = async (id: string) => {
        setLoading(true);
        try {
            const token = await getAuthToken();

            // First get the menu details
            const res = await fetch(`${apiBase}/menus/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to fetch menu");
            const menuData = await res.json();

            try {
                const perms = await fetchOrgPermissions({ apiBase, token, orgId: menuData.org_id });
                setOrgPermissions(perms);
            } catch (e) {
                console.error(e);
                setOrgPermissions(null);
            }

            const catRes = await fetch(`${apiBase}/categories/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const categories = await catRes.json();

            // TODO: Fetch items per category or fetch all items for menu to populate
            // For now, let's assume specific category fetching logic isn't fully optimised but we need to see items
            // We need a way to see items. Let's fetch them for each category (inefficient but works for now)
            const categoriesWithItems = await Promise.all(categories.map(async (c: any) => {
                // We don't have a direct endpoint for items by category strictly in router, 
                // but we can assume list_categories MIGHT return items if configured?
                // Wait, backend list_categories just returns [Category]. 
                // Let's rely on categories already having items if loaded. 
                // Actually, list_categories endpoint implementation does `session.exec(select(Category)...)`
                // SQLModel default response might NOT include items.
                // Ideally we should fix fetchMenu to use a better query or endpoint.
                // BUT, for now, let's just use what we have and patch if empty.
                return { ...c, items: c.items || [] };
            }));

            setMenu({ ...menuData, categories: categoriesWithItems });
            const baseline = { name: menuData.name || "", is_active: Boolean(menuData.is_active) };
            const shouldSyncMenuFields =
                !menuBaseline ||
                (menuName.trim() === menuBaseline.name && menuActive === menuBaseline.is_active);
            setMenuBaseline(baseline);
            if (shouldSyncMenuFields) {
                setMenuName(baseline.name);
                setMenuActive(baseline.is_active);
            }
            if (!hasLoadedMenu) {
                setPageDirty(false);
                setHasLoadedMenu(true);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleAddCategory = async () => {
        if (!newCategoryName || !menu) return;
        if (!orgPermissions?.can_manage_menus) {
            toast({
                variant: "warning",
                title: "Not authorized",
                description: "You don’t have permission to manage menus.",
            });
            return;
        }
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/categories/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: newCategoryName,
                    menu_id: menu.id,
                    rank: menu.categories.length
                })
            });
            if (res.ok) {
                setNewCategoryName("");
                setIsAddingCategory(false);
                setPageDirty(true);
                fetchMenu(menu.id);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteCategory = async (categoryId: string) => {
        const ok = await confirm({
            title: "Delete category?",
            description: "This will permanently delete the category and its items.",
            confirmLabel: "Delete",
            variant: "destructive",
        });
        if (!ok) return;
        if (!orgPermissions?.can_manage_menus) {
            toast({
                variant: "warning",
                title: "Not authorized",
                description: "You don’t have permission to manage menus.",
            });
            return;
        }
        try {
            const token = await getAuthToken();
            await fetch(`${apiBase}/categories/${categoryId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setPageDirty(true);
            if (menu) fetchMenu(menu.id);
        } catch (e) {
            console.error(e);
        }
    };

    const handleUpdateCategoryName = async (category: Category) => {
        if (!menu) return;
        if (!orgPermissions?.can_manage_menus) {
            toast({
                variant: "warning",
                title: "Not authorized",
                description: "You don’t have permission to manage menus.",
            });
            return;
        }
        const name = editingCategoryName.trim();
        if (!name) return;
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/categories/${category.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    id: category.id,
                    name,
                    rank: category.rank ?? 0,
                    menu_id: menu.id
                })
            });
            if (res.ok) {
                setEditingCategoryId(null);
                setEditingCategoryName("");
                setPageDirty(true);
                fetchMenu(menu.id);
            } else {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err ? (err as any).detail : undefined;
                toast({
                    variant: "error",
                    title: "Failed to update category",
                    description: typeof detail === "string" ? detail : "Unknown error",
                });
            }
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to update category",
                description: "Please try again in a moment.",
            });
        }
    };

    const reorderArray = <T,>(arr: T[], fromIndex: number, toIndex: number) => {
        const next = [...arr];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
    };

    const persistCategoryOrder = async (categories: Category[]) => {
        if (!menu) return;
        try {
            const token = await getAuthToken();
            await Promise.all(
                categories.map((cat, index) =>
                    fetch(`${apiBase}/categories/${cat.id}`, {
                        method: "PATCH",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            id: cat.id,
                            name: cat.name,
                            rank: index,
                            menu_id: menu.id
                        })
                    })
                )
            );
            setPageDirty(true);
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to reorder categories",
                description: "Please try again.",
            });
        }
    };

    const persistItemOrder = async (categoryId: string, items: Item[]) => {
        try {
            const token = await getAuthToken();
            await Promise.all(
                items.map((item, index) =>
                    fetch(`${apiBase}/items/${item.id}`, {
                        method: "PATCH",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        },
                        body: JSON.stringify({ position: index })
                    })
                )
            );
            setPageDirty(true);
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to reorder items",
                description: "Please try again.",
            });
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 6 }
        })
    );

    const findCategoryByItemId = (itemSortableId: string) => {
        if (!menu) return null;
        return menu.categories.find((cat) =>
            (cat.items || []).some((item) => `item-${item.id}` === itemSortableId)
        );
    };

    const toggleCategoryCollapse = (categoryId: string) => {
        setCollapsedCategoryIds((prev) => {
            const next = new Set(prev);
            if (next.has(categoryId)) {
                next.delete(categoryId);
            } else {
                next.add(categoryId);
            }
            return next;
        });
    };

    const collapseAllCategories = () => {
        if (!menu) return;
        setCollapsedCategoryIds(new Set(menu.categories.map((c) => c.id)));
    };

    const expandAllCategories = () => {
        setCollapsedCategoryIds(new Set());
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        setIsDragging(false);
        setActiveDragId(null);
        if (!orgPermissions?.can_manage_menus) return;
        if (!menu || !event.over) return;
        const activeId = String(event.active.id);
        const overId = String(event.over.id);
        if (activeId === overId) return;

        if (activeId.startsWith("cat-") && overId.startsWith("cat-")) {
            const fromIndex = menu.categories.findIndex((c) => `cat-${c.id}` === activeId);
            const toIndex = menu.categories.findIndex((c) => `cat-${c.id}` === overId);
            if (fromIndex < 0 || toIndex < 0) return;
            const nextCategories = arrayMove(menu.categories, fromIndex, toIndex);
            setMenu({ ...menu, categories: nextCategories });
            await persistCategoryOrder(nextCategories);
            return;
        }

        if (activeId.startsWith("item-") && overId.startsWith("item-")) {
            const activeCategory = findCategoryByItemId(activeId);
            const overCategory = findCategoryByItemId(overId);
            if (!activeCategory || !overCategory || activeCategory.id !== overCategory.id) return;
            const fromIndex = (activeCategory.items || []).findIndex((i) => `item-${i.id}` === activeId);
            const toIndex = (activeCategory.items || []).findIndex((i) => `item-${i.id}` === overId);
            if (fromIndex < 0 || toIndex < 0) return;
            const nextItems = arrayMove(activeCategory.items || [], fromIndex, toIndex);
            const nextCategories = menu.categories.map((cat) =>
                cat.id === activeCategory.id ? { ...cat, items: nextItems } : cat
            );
            setMenu({ ...menu, categories: nextCategories });
            await persistItemOrder(activeCategory.id, nextItems);
        }
    };

    const handleFileUpload = async (file: File) => {
        const token = await getAuthToken();

        // 1. Get Presigned URL
        const res = await fetch(`${apiBase}/items/upload-url`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                filename: file.name,
                content_type: file.type
            })
        });

        if (!res.ok) throw new Error("Failed to get upload URL");
        const { upload_url, s3_key, public_url } = await res.json();

        // 2. Upload to S3
        const uploadRes = await fetch(upload_url, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });

        if (!uploadRes.ok) throw new Error("Failed to upload image");

        return { s3_key, public_url };
    };

    const getVideoDurationSeconds = (file: File) =>
        new Promise<number>((resolve, reject) => {
            const video = document.createElement("video");
            video.preload = "metadata";
            const url = URL.createObjectURL(file);
            video.onloadedmetadata = () => {
                URL.revokeObjectURL(url);
                if (!Number.isFinite(video.duration)) {
                    reject(new Error("Could not read video duration"));
                    return;
                }
                resolve(video.duration);
            };
            video.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("Could not read video metadata"));
            };
            video.src = url;
        });

    const handleUploadArVideo = async () => {
        if (!editingItem) return;
        if (!editingItem.id) {
            toast({
                variant: "warning",
                title: "Save the item first",
                description: "Create the item before uploading an AR video.",
            });
            return;
        }
        const canEditItems = Boolean(orgPermissions?.can_edit_items);
        if (!canEditItems) {
            toast({
                variant: "warning",
                title: "Not authorized",
                description: "You don’t have permission to edit items.",
            });
            return;
        }
        if (!arVideoToUpload) {
            toast({
                variant: "warning",
                title: "Select a video",
                description: "Choose a rotation video to upload.",
            });
            return;
        }

        setIsUploadingArVideo(true);
        setArVideoError(null);
        try {
            if (!arVideoToUpload.type.startsWith("video/")) {
                throw new Error("Invalid file type. Please upload a video.");
            }

            const duration = await getVideoDurationSeconds(arVideoToUpload);
            if (duration > 20) {
                throw new Error("Please keep the rotation video under 20 seconds.");
            }

            const token = await getAuthToken();
            const presignRes = await fetch(`${apiBase}/items/${editingItem.id}/ar/video-upload-url`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    filename: arVideoToUpload.name,
                    content_type: arVideoToUpload.type
                })
            });
            if (!presignRes.ok) {
                const err = await presignRes.json().catch(() => ({}));
                throw new Error(`AR video upload URL error: ${err.detail || presignRes.statusText || "Unknown error"}`);
            }
            const { upload_url, s3_key, public_url } = await presignRes.json();

            const uploadRes = await fetch(upload_url, {
                method: "PUT",
                body: arVideoToUpload,
                headers: { "Content-Type": arVideoToUpload.type }
            });
            if (!uploadRes.ok) throw new Error("Failed to upload video");

            const attachRes = await fetch(`${apiBase}/items/${editingItem.id}/ar/video`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ s3_key, url: public_url })
            });
            if (!attachRes.ok) {
                const err = await attachRes.json().catch(() => ({}));
                throw new Error(`AR queue error: ${err.detail || attachRes.statusText || "Unknown error"}`);
            }
            const updated = await attachRes.json();
            setEditingItem((prev) => (prev ? ({ ...prev, ...updated } as any) : prev));

            setArVideoToUpload(null);
            setArVideoPreviewUrl(null);
            if (arVideoInputRef.current) arVideoInputRef.current.value = "";
            setPageDirty(true);
            if (menu) fetchMenu(menu.id);
            toast({ variant: "success", title: "AR video uploaded", description: "Generation has been queued." });
        } catch (e) {
            console.error(e);
            setArVideoError(e instanceof Error ? e.message : "Failed to upload AR video");
        } finally {
            setIsUploadingArVideo(false);
        }
    };

    const handleRetryArGeneration = async () => {
        if (!editingItem?.id) return;
        const canEditItems = Boolean(orgPermissions?.can_edit_items);
        if (!canEditItems) {
            toast({
                variant: "warning",
                title: "Not authorized",
                description: "You don’t have permission to edit items.",
            });
            return;
        }

        setIsRetryingArGeneration(true);
        setArVideoError(null);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/items/${editingItem.id}/ar/retry`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || res.statusText || "Unknown error");
            }
            const updated = await res.json();
            setEditingItem((prev) => (prev ? ({ ...prev, ...updated } as any) : prev));
            setPageDirty(true);
            if (menu) fetchMenu(menu.id);
        } catch (e) {
            console.error(e);
            setArVideoError(e instanceof Error ? e.message : "Failed to retry AR generation");
        } finally {
            setIsRetryingArGeneration(false);
        }
    };

    const refreshEditingItemArStatus = async (itemId: string) => {
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/items/${itemId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            setEditingItem((prev) => {
                if (!prev) return prev;
                if (String((prev as any).id || "") !== String(itemId)) return prev;
                return {
                    ...prev,
                    ar_status: data.ar_status,
                    ar_error_message: data.ar_error_message,
                    ar_video_url: data.ar_video_url,
                    ar_model_glb_url: data.ar_model_glb_url,
                    ar_model_usdz_url: data.ar_model_usdz_url,
                    ar_model_poster_url: data.ar_model_poster_url,
                    ar_created_at: data.ar_created_at,
                    ar_updated_at: data.ar_updated_at,
                    ar_stage: data.ar_stage,
                    ar_stage_detail: data.ar_stage_detail,
                    ar_progress: data.ar_progress
                } as any;
            });
        } catch {
            // Best-effort polling; ignore errors.
        }
    };

    useEffect(() => {
        if (!editingItem?.id) return;
        const status = (editingItem as any).ar_status;
        if (status !== "pending" && status !== "processing") return;

        let canceled = false;
        const itemId = String(editingItem.id);
        const tick = async () => {
            if (canceled) return;
            await refreshEditingItemArStatus(itemId);
        };

        tick();
        const interval = window.setInterval(tick, 4000);
        return () => {
            canceled = true;
            window.clearInterval(interval);
        };
    }, [editingItem?.id, (editingItem as any)?.ar_status]);

    const handleSaveItem = async () => {
        if (!editingItem) return;

        const canEditItems = Boolean(orgPermissions?.can_edit_items);
        const canManageAvailability = Boolean(orgPermissions?.can_manage_availability);

        if (editingItem.id && !canEditItems) {
            if (!canManageAvailability) {
                toast({
                    variant: "warning",
                    title: "Not authorized",
                    description: "You don’t have permission to update availability.",
                });
                return;
            }
            setIsSavingItem(true);
            try {
                const token = await getAuthToken();
                const res = await fetch(`${apiBase}/items/${editingItem.id}`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ is_sold_out: editingItem.is_sold_out || false })
                });
                if (res.ok) {
                    setEditingItem(null);
                    setFileToUpload(null);
                    if (menu) fetchMenu(menu.id);
                } else {
                    const err = await res.json().catch(() => ({}));
                    const detail =
                        typeof err === "object" && err && "detail" in err ? (err as any).detail : undefined;
                    toast({
                        variant: "error",
                        title: "Failed to update item",
                        description: typeof detail === "string" ? detail : "Unknown error",
                    });
                }
            } catch (e) {
                console.error(e);
                toast({
                    variant: "error",
                    title: "Error updating item",
                    description: "Please try again in a moment.",
                });
            } finally {
                setIsSavingItem(false);
            }
            return;
        }

        if (!canEditItems) {
            toast({
                variant: "warning",
                title: "Not authorized",
                description: "You don’t have permission to edit items.",
            });
            return;
        }

        if (!editingItem.name) return;
        if (editingItem.price === undefined || editingItem.price === null) return;

        setIsSavingItem(true);
        try {
            const token = await getAuthToken();

            // Handle Photo Upload
            let photoKey = null;
            let photoUrl = null;
            if (fileToUpload) {
                const uploadData = await handleFileUpload(fileToUpload);
                photoKey = uploadData.s3_key;
                photoUrl = uploadData.public_url;
            }

            const payload = {
                name: editingItem.name,
                description: editingItem.description,
                price: editingItem.price,
                is_sold_out: editingItem.is_sold_out || false,
                category_id: editingItem.categoryId,
                dietary_tag_ids: (editingItem as any).dietary_tag_ids || [],
                allergen_ids: (editingItem as any).allergen_ids || []
            };

            let res;
            let itemId;

            if (editingItem.id) {
                // Update
                res = await fetch(`${apiBase}/items/${editingItem.id}`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                });
                itemId = editingItem.id;
            } else {
                // Create
                res = await fetch(`${apiBase}/items/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    const data = await res.json();
                    itemId = data.id;
                }
            }

            if (res.ok && itemId && photoKey && photoUrl) {
                // Link photo
                await fetch(`${apiBase}/items/${itemId}/photos`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        s3_key: photoKey,
                        url: photoUrl
                    })
                });
            }

            if (res.ok) {
                setEditingItem(null);
                setFileToUpload(null);
                setPageDirty(true);
                if (menu) fetchMenu(menu.id);
                toast({ variant: "success", title: "Item saved" });
            } else {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err ? (err as any).detail : undefined;
                toast({
                    variant: "error",
                    title: "Failed to save item",
                    description: typeof detail === "string" ? detail : "Unknown error",
                });
            }
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Error saving item",
                description: "Please try again in a moment.",
            });
        } finally {
            setIsSavingItem(false);
        }
    };

    const handleRemoveItemPhoto = async () => {
        if (!editingItem) return;
        const canEditItems = Boolean(orgPermissions?.can_edit_items);
        if (!canEditItems) return;

        if (fileToUpload) {
            setFileToUpload(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            setIsPhotoPreviewOpen(false);
            setPageDirty(true);
            return;
        }

        const currentUrl = editingItem.photo_url || (editingItem as any).photos?.[0]?.url;
        if (!currentUrl) return;

        if (!editingItem.id) {
            setEditingItem({ ...(editingItem as any), photo_url: undefined, photos: [] });
            setPageDirty(true);
            return;
        }

        setIsRemovingItemPhoto(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/items/${editingItem.id}/photos`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err ? (err as any).detail : undefined;
                toast({
                    variant: "error",
                    title: "Failed to remove photo",
                    description: typeof detail === "string" ? detail : "Please try again.",
                });
                return;
            }
            setEditingItem((prev) => (prev ? ({ ...(prev as any), photo_url: undefined, photos: [] }) : prev));
            setFileToUpload(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            setIsPhotoPreviewOpen(false);
            setPageDirty(true);
            if (menu) fetchMenu(menu.id);
            toast({ variant: "success", title: "Photo removed" });
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Failed to remove photo",
                description: "Please try again in a moment.",
            });
        } finally {
            setIsRemovingItemPhoto(false);
        }
    };

    const toggleMetadata = (type: 'tags' | 'allergens', id: string) => {
        if (!editingItem) return;
        const key = type === 'tags' ? 'dietary_tag_ids' : 'allergen_ids';
        const current = (editingItem as any)[key] || [];
        const updated = current.includes(id)
            ? current.filter((x: string) => x !== id)
            : [...current, id];
        setEditingItem({ ...editingItem, [key]: updated });
        setPageDirty(true);
    };

    const handleSaveMenu = async () => {
        if (!menu) return;
        if (!orgPermissions?.can_manage_menus) {
            toast({
                variant: "warning",
                title: "Not authorized",
                description: "You don’t have permission to manage menus.",
            });
            return;
        }
        if (!menuName.trim()) {
            toast({
                variant: "warning",
                title: "Menu name required",
                description: "Please enter a name for this menu.",
            });
            return;
        }
        setIsSavingMenu(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/menus/${menu.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: menuName.trim(),
                    is_active: menuActive
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err ? (err as any).detail : undefined;
                toast({
                    variant: "error",
                    title: "Failed to save menu",
                    description: typeof detail === "string" ? detail : "Unknown error",
                });
                return;
            }
            const data = await res.json();
            setMenu({ ...menu, ...data });
            setMenuName(data.name || menuName);
            setMenuActive(Boolean(data.is_active));
            setMenuBaseline({ name: data.name || menuName, is_active: Boolean(data.is_active) });
            setPageDirty(false);
            toast({ variant: "success", title: "Menu saved" });
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Error saving menu",
                description: "Please try again in a moment.",
            });
        } finally {
            setIsSavingMenu(false);
        }
    };

    const handleDeleteMenu = async () => {
        if (!menu) return;
        if (!orgPermissions?.can_manage_menus) {
            toast({
                variant: "warning",
                title: "Not authorized",
                description: "You don’t have permission to manage menus.",
            });
            return;
        }
        const ok = await confirm({
            title: "Delete menu?",
            description: "This permanently deletes the menu and all categories/items inside it.",
            confirmLabel: "Delete",
            variant: "destructive",
            requireTextMatch: menu.name,
            requireTextLabel: `Type "${menu.name}" to confirm.`,
        });
        if (!ok) return;
        setIsDeletingMenu(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/menus/${menu.id}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                toast({ variant: "success", title: "Menu deleted" });
                router.push("/dashboard/menus");
            } else {
                toast({
                    variant: "error",
                    title: "Failed to delete menu",
                    description: "Please try again.",
                });
            }
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Error deleting menu",
                description: "Please try again in a moment.",
            });
        } finally {
            setIsDeletingMenu(false);
        }
    };

    const handleExportMenu = async () => {
        if (!menu) return;
        setIsExporting(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${apiBase}/export/menu/${menu.id}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const detail =
                    typeof err === "object" && err && "detail" in err ? (err as any).detail : undefined;
                toast({
                    variant: "error",
                    title: "Export failed",
                    description: typeof detail === "string" ? detail : "Unknown error",
                });
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            // Extract filename from Content-Disposition header or use default
            const contentDisposition = res.headers.get("Content-Disposition");
            let filename = `menu_${menu.name.replace(/[^a-zA-Z0-9]/g, "_")}_export.zip`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/);
                if (match) filename = match[1];
            }
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            toast({
                variant: "error",
                title: "Error exporting menu",
                description: "Please try again in a moment.",
            });
        } finally {
            setIsExporting(false);
        }
    };

    if (loading) return <div className="text-[var(--cms-muted)] flex items-center gap-2"><Loader2 className="animate-spin" /> Loading menu...</div>;
    if (!menu) return <div className="text-[var(--cms-muted)]">Menu not found</div>;

    const canManageMenus = Boolean(orgPermissions?.can_manage_menus);
    const canEditItems = Boolean(orgPermissions?.can_edit_items);
    const canManageAvailability = Boolean(orgPermissions?.can_manage_availability);
    const canOpenItemModal = canEditItems || canManageAvailability;

    return (
        <div className="w-full max-w-5xl mr-auto">
            <header className="mb-6 space-y-3 sm:mb-8">
                <Link
                    href="/dashboard/menus"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-muted transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Menus
                </Link>
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div className="space-y-2">
                        {isEditingMenuName ? (
                            <div className="flex items-center gap-2">
                                <input
                                    className="font-heading text-3xl font-bold tracking-tight bg-transparent border-b border-[var(--cms-border)] focus:outline-none focus:border-[var(--cms-text)] transition-colors"
                                    value={menuNameDraft}
                                    onChange={(e) => setMenuNameDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            const nextName = menuNameDraft.trim();
                                            if (!nextName) return;
                                            setMenuName(nextName);
                                            setPageDirty(true);
                                            setIsEditingMenuName(false);
                                        }
                                    }}
                                    aria-label="Menu name"
                                    autoFocus
                                />
                                <button
                                    onClick={() => {
                                        const nextName = menuNameDraft.trim();
                                        if (!nextName) return;
                                        setMenuName(nextName);
                                        setPageDirty(true);
                                        setIsEditingMenuName(false);
                                    }}
                                    className="p-2 rounded-lg hover:bg-[var(--cms-pill)]"
                                    title="Save"
                                >
                                    <Check className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => {
                                        setMenuNameDraft(menuName);
                                        setIsEditingMenuName(false);
                                    }}
                                    className="p-2 rounded-lg hover:bg-[var(--cms-pill)]"
                                    title="Cancel"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
	                        ) : (
	                            <>
	                                {canManageMenus ? (
	                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMenuNameDraft(menuName);
                                            setIsEditingMenuName(true);
                                        }}
                                        className="group inline-flex items-center gap-2 font-heading text-3xl font-bold tracking-tight text-left hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent-strong)]/25"
                                        aria-label="Edit menu name"
                                        title="Edit menu name"
                                    >
                                        <span className="leading-none">{menuName}</span>
                                        <PencilLine className="relative top-[1px] w-4 h-4 text-[var(--cms-muted)] transition-colors group-hover:text-[var(--cms-text)]" />
                                    </button>
                                ) : (
	                                    <h1 className="font-heading text-3xl font-bold tracking-tight">{menuName}</h1>
	                                )}
	                            </>
	                        )}
                            <p className="text-muted">
                                Edit items, pricing, availability, and photoreal AR dishes.
                            </p>
	                    </div>
                    <div className="w-full md:w-auto md:min-w-[420px]">
                        <div className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-3">
                            <div className="flex flex-wrap items-center gap-2">
                                {canManageMenus && (
                                    <>
                                        <button
                                            onClick={() => {
                                                setMenuActive(!menuActive);
                                                setPageDirty(true);
                                            }}
                                            className="h-9 px-3.5 inline-flex items-center justify-between gap-3 rounded-xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)]"
                                        >
                                            <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[var(--cms-muted)]">
                                                {menuActive ? "Active" : "Inactive"}
                                            </span>
                                            <span
                                                className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${menuActive ? "bg-[var(--cms-text)]" : "bg-[var(--cms-panel)]"}`}
                                            >
                                                <span
                                                    className={`inline-block h-3 w-3 rounded-full bg-[var(--cms-bg)] shadow transition-transform ${menuActive ? "translate-x-4" : "translate-x-1"}`}
                                                />
                                            </span>
                                        </button>
                                        <button
                                            onClick={handleSaveMenu}
                                            disabled={isSavingMenu || !pageDirty}
                                            className={`h-9 px-4 rounded-xl text-sm font-semibold inline-flex items-center gap-2 justify-center min-w-[100px] ${isSavingMenu || !pageDirty ? "bg-[var(--cms-panel-strong)] text-[var(--cms-muted)] cursor-not-allowed border border-[var(--cms-border)]" : "bg-[var(--cms-accent)] text-white hover:bg-[var(--cms-accent-strong)]"}`}
                                        >
                                            {isSavingMenu && <Loader2 className="w-4 h-4 animate-spin" />}
                                            {isSavingMenu ? "Saving..." : "Save"}
                                        </button>
                                    </>
                                )}
                                <Link
                                    href={`/dashboard/menus/${menu.id}/publish`}
                                    className="h-9 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center justify-center bg-[var(--cms-panel-strong)] text-[var(--cms-muted)] border border-[var(--cms-border)] hover:text-[var(--cms-text)]"
                                >
                                    Publish
                                </Link>
                            </div>
                            <div className="mt-3 border-t border-[var(--cms-border)] pt-3 flex flex-wrap items-center gap-2">
                                {canManageMenus && (
                                    <>
                                        <Link
                                            href={`/dashboard/menus/${menu.id}/themes`}
                                            className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center bg-[var(--cms-panel-strong)] text-[var(--cms-muted)] border border-[var(--cms-border)] hover:text-[var(--cms-text)]"
                                        >
                                            Design Studio
                                        </Link>
                                        <button
                                            onClick={handleExportMenu}
                                            disabled={isExporting}
                                            className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 justify-center bg-[var(--cms-panel-strong)] text-[var(--cms-muted)] border border-[var(--cms-border)] hover:text-[var(--cms-text)] disabled:opacity-50"
                                        >
                                            {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                            {isExporting ? "Exporting..." : "Export"}
                                        </button>
                                    </>
                                )}
                                <Link
                                    href={`/r/${menu.id}`}
                                    target="_blank"
                                    className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center bg-[var(--cms-panel-strong)] text-[var(--cms-muted)] border border-[var(--cms-border)] hover:text-[var(--cms-text)]"
                                >
                                    View Public Page
                                </Link>
                            </div>
                        </div>
                        <div className="mt-2 flex items-center justify-end gap-2 text-xs text-[var(--cms-muted)]">
                            <button
                                onClick={collapseAllCategories}
                                className="hover:text-[var(--cms-text)]"
                            >
                                Collapse all
                            </button>
                            <span className="text-[var(--cms-border)]">•</span>
                            <button
                                onClick={expandAllCategories}
                                className="hover:text-[var(--cms-text)]"
                            >
                                Expand all
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="space-y-8">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={(event) => {
                        setIsDragging(true);
                        setActiveDragId(String(event.active.id));
                    }}
                    onDragEnd={handleDragEnd}
                    onDragCancel={() => {
                        setIsDragging(false);
                        setActiveDragId(null);
                    }}
                >
                    <SortableContext
                        items={menu.categories.map((category) => `cat-${category.id}`)}
                        strategy={verticalListSortingStrategy}
                    >
                        {menu.categories.map((category) => (
                            <SortableCategoryCard
                                key={category.id}
                                id={`cat-${category.id}`}
                                disabled={!canManageMenus}
                                className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-2xl overflow-hidden"
                            >
                                {({ attributes, listeners }) => (
                                    <>
                                        <div className="p-4 bg-[var(--cms-panel-strong)] border-b border-[var(--cms-border)] flex justify-between items-center group">
                                            <div className="flex items-center gap-3">
                                                {canManageMenus ? (
                                                    <button
                                                        className="text-[var(--cms-muted)] cursor-grab active:cursor-grabbing"
                                                        {...attributes}
                                                        {...listeners}
                                                        aria-label="Reorder category"
                                                    >
                                                        <GripVertical className="w-4 h-4" />
                                                    </button>
                                                ) : (
                                                    <div className="w-8 h-8" aria-hidden="true" />
                                                )}
                                                <button
                                                    onClick={() => toggleCategoryCollapse(category.id)}
                                                    className="text-[var(--cms-muted)] hover:text-[var(--cms-text)]"
                                                    aria-label="Toggle category"
                                                >
                                                    {collapsedCategoryIds.has(category.id) ? (
                                                        <ChevronRight className="w-4 h-4" />
                                                    ) : (
                                                        <ChevronDown className="w-4 h-4" />
                                                    )}
                                                </button>
                                                {canManageMenus ? (
                                                    editingCategoryId === category.id ? (
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                value={editingCategoryName}
                                                                onChange={(e) => setEditingCategoryName(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter") {
                                                                        e.preventDefault();
                                                                        handleUpdateCategoryName(category);
                                                                    }
                                                                }}
                                                                className="bg-transparent border border-[var(--cms-border)] rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-[var(--cms-text)]"
                                                                autoFocus
                                                            />
                                                            <button
                                                                onClick={() => handleUpdateCategoryName(category)}
                                                                className="p-1.5 rounded-lg hover:bg-[var(--cms-pill)]"
                                                                title="Save"
                                                            >
                                                                <Check className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setEditingCategoryId(null);
                                                                    setEditingCategoryName("");
                                                                }}
                                                                className="p-1.5 rounded-lg hover:bg-[var(--cms-pill)]"
                                                                title="Cancel"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => {
                                                                setEditingCategoryId(category.id);
                                                                setEditingCategoryName(category.name);
                                                            }}
                                                            className="font-bold text-lg text-left hover:opacity-80"
                                                        >
                                                            {category.name}
                                                        </button>
                                                    )
                                                ) : (
                                                    <div className="font-bold text-lg">{category.name}</div>
                                                )}
                                            </div>
                                            {canManageMenus && (
                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleDeleteCategory(category.id)}
                                                        className="p-2 hover:bg-red-500/10 rounded-lg text-red-500 hover:text-red-600"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {!collapsedCategoryIds.has(category.id) && (
                                            <div className="p-4 space-y-2">
                                                {category.items?.length === 0 && (
                                                    <div className="text-center py-8 text-[var(--cms-muted)] text-sm border-2 border-dashed border-[var(--cms-border)] rounded-xl">
                                                        No items in this category yet.
                                                    </div>
                                                )}
                                                <SortableContext
                                                    items={(category.items || []).map((item) => `item-${item.id}`)}
                                                    strategy={verticalListSortingStrategy}
                                                >
                                                    {category.items
                                                        .map((item) => (
                                                            <SortableItemRow
                                                                key={item.id}
                                                                id={`item-${item.id}`}
                                                                disabled={!canManageMenus}
                                                                className={`px-3.5 py-3 bg-[var(--cms-panel-strong)] rounded-xl border border-transparent flex justify-between items-center group hover:bg-[var(--cms-pill)] hover:border-[var(--cms-border)] transition-colors ${canOpenItemModal ? "cursor-pointer" : ""} ${item.is_sold_out ? "opacity-60" : ""}`}
                                                            >
                                                                {({ attributes: itemAttributes, listeners: itemListeners }) => (
                                                                    <div
                                                                        className="flex w-full items-center justify-between gap-3"
                                                                        onClick={() => {
                                                                            if (isDragging) return;
                                                                            if (!canOpenItemModal) return;
                                                                            setEditingItem({
                                                                                ...item,
                                                                                categoryId: category.id,
                                                                                dietary_tag_ids: (item.dietary_tags || []).map((t: any) => t.id),
                                                                                allergen_ids: (item.allergens || []).map((a: any) => a.id)
                                                                            } as any);
                                                                            setFileToUpload(null);
                                                                        }}
                                                                    >
                                                                        <div className="flex min-w-0 items-center gap-3.5">
                                                                            {canManageMenus ? (
                                                                                <button
                                                                                    className="text-[var(--cms-muted)] cursor-grab active:cursor-grabbing"
                                                                                    {...itemAttributes}
                                                                                    {...itemListeners}
                                                                                    aria-label="Reorder item"
                                                                                >
                                                                                    <GripVertical className="w-4 h-4" />
                                                                                </button>
                                                                            ) : (
                                                                                <div className="w-8 h-8" aria-hidden="true" />
                                                                            )}
                                                                            {(item.photo_url || (item as any).photos?.[0]?.url) && (
                                                                                <img src={item.photo_url || (item as any).photos?.[0]?.url} alt={item.name} className="w-10 h-10 rounded-lg object-cover bg-[var(--cms-panel-strong)]" />
                                                                            )}
                                                                            <div className="min-w-0">
                                                                                <div className="flex min-w-0 items-center gap-2">
                                                                                    <p className="font-medium truncate">{item.name}</p>
                                                                                    {Boolean(item.ar_video_url) && (
                                                                                        <span className="inline-flex items-center rounded-md border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-cyan-300">
                                                                                            AR
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                {item.description && (
                                                                                    <p className="text-xs text-[var(--cms-muted)] line-clamp-1">{item.description}</p>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div className="ml-2 flex shrink-0 items-center gap-2.5">
                                                                            <span className="font-mono text-sm tabular-nums">${item.price}</span>
                                                                            {item.is_sold_out && <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-1 rounded-full uppercase tracking-wider font-bold">Sold Out</span>}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </SortableItemRow>
                                                        ))}
                                                </SortableContext>

                                                {canEditItems && (
                                                    <button
                                                        onClick={() => {
                                                            setEditingItem({ categoryId: category.id });
                                                            setFileToUpload(null);
                                                            setPageDirty(true);
                                                        }}
                                                        className="w-full py-3 border-2 border-dashed border-[var(--cms-border)] rounded-xl text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:border-[var(--cms-text)] transition-all text-sm font-medium flex items-center justify-center gap-2"
                                                    >
                                                        <Plus className="w-4 h-4" /> Add Item
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </SortableCategoryCard>
                        ))}
                    </SortableContext>
                    <DragOverlay dropAnimation={null}>
                        {activeDragId?.startsWith("cat-") && (
                            <div className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-2xl overflow-hidden shadow-2xl w-[520px]">
                                <div className="p-4 bg-[var(--cms-panel-strong)] border-b border-[var(--cms-border)] flex items-center gap-3">
                                    <GripVertical className="w-4 h-4 text-[var(--cms-muted)]" />
                                    <span className="font-bold text-lg">
                                        {menu.categories.find((c) => `cat-${c.id}` === activeDragId)?.name}
                                    </span>
                                </div>
                            </div>
                        )}
                        {activeDragId?.startsWith("item-") && (
                            <div className="p-3 bg-[var(--cms-panel-strong)] rounded-xl border border-[var(--cms-border)] shadow-2xl flex items-center gap-4 w-[420px]">
                                <GripVertical className="w-4 h-4 text-[var(--cms-muted)]" />
                                <span className="font-medium">
                                    {menu.categories
                                        .flatMap((cat) => cat.items || [])
                                        .find((item) => `item-${item.id}` === activeDragId)?.name}
                                </span>
                            </div>
                        )}
                    </DragOverlay>
                </DndContext>

                {canManageMenus && (
                    <>
                        {/* Add Category Section */}
                        {isAddingCategory ? (
                            <div className="bg-[var(--cms-panel)] border border-[var(--cms-border)] p-6 rounded-2xl animate-fade-in-up">
                                <h3 className="font-bold mb-4">New Category</h3>
                                <div className="flex gap-4">
                                    <input
                                        value={newCategoryName}
                                        onChange={(e) => {
                                            setNewCategoryName(e.target.value);
                                            if (e.target.value.trim()) setPageDirty(true);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                handleAddCategory();
                                            }
                                        }}
                                        placeholder="Category Name (e.g. Appetizers)"
                                        className="flex-1 bg-transparent border border-[var(--cms-border)] rounded-xl px-4 py-2 focus:outline-none focus:border-[var(--cms-text)] transition-colors"
                                        autoFocus
                                    />
                                    <button
                                        onClick={handleAddCategory}
                                        className="bg-[var(--cms-accent)] text-white px-6 rounded-xl font-bold hover:bg-[var(--cms-accent-strong)]"
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsAddingCategory(false);
                                            setNewCategoryName("");
                                        }}
                                        className="bg-[var(--cms-panel-strong)] text-[var(--cms-text)] px-4 rounded-xl font-bold hover:opacity-90"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => {
                                    setIsAddingCategory(true);
                                    setPageDirty(true);
                                }}
                                className="w-full py-6 border-2 border-dashed border-[var(--cms-border)] rounded-3xl text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:border-[var(--cms-text)] transition-all font-bold text-lg flex items-center justify-center gap-3"
                            >
                                <Plus className="w-6 h-6" /> Add Category
                            </button>
                        )}
                    </>
                )}
            </div>


            {canManageMenus && (
                <div className="mt-10 border border-red-500/20 bg-red-500/5 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h3 className="font-bold text-red-400">Delete Menu</h3>
                        <p className="text-sm text-[var(--cms-muted)]">This removes the menu and its items permanently.</p>
                    </div>
                    <button
                        onClick={handleDeleteMenu}
                        disabled={isDeletingMenu}
                        className="px-4 py-2 rounded-lg font-bold text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {isDeletingMenu ? "Deleting..." : "Delete Menu"}
                    </button>
                </div>
            )}

            {/* Item Editor Modal */}
            {editingItem && (
                <div className="fixed inset-0 cms-modal-overlay backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div
                        className="cms-modal-shell ring-1 ring-[var(--cms-border)] w-full max-w-lg rounded-[28px] max-h-[90vh] flex flex-col backdrop-blur-xl animate-fade-in-scale"
                        onKeyDown={(e) => {
                            const target = e.target as HTMLElement;
                            const isTextarea = target.tagName === "TEXTAREA";
                            if (e.key === "Enter" && !isTextarea) {
                                e.preventDefault();
                                handleSaveItem();
                            }
                        }}
                    >
                        <div className="cms-modal-header p-6 pb-4 flex-shrink-0 flex justify-between items-center border-b border-[var(--cms-border)] rounded-t-[28px]">
                            <div>
                                <h2 className="font-heading text-xl font-bold tracking-tight">
                                    {editingItem.id ? "Edit item" : "Add item"}
                                </h2>
                                <p className="text-xs text-[var(--cms-muted)] mt-1">Keep it concise and scannable on mobile.</p>
                            </div>
                            <button
                                onClick={() => {
                                    setEditingItem(null);
                                    setFileToUpload(null);
                                    setArVideoToUpload(null);
                                    setArVideoError(null);
                                }}
                                className="p-2 hover:bg-[var(--cms-pill)] rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 pt-5 flex flex-col gap-5 overflow-y-auto flex-1 custom-scrollbar">
                            <div className="space-y-2">
                                <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--cms-muted)]">
                                    Name
                                </label>
                                <input
                                    className="w-full bg-[var(--cms-panel-strong)] border border-[var(--cms-border)] rounded-2xl px-4 py-3 focus:outline-none focus:border-[var(--cms-text)] focus:ring-2 focus:ring-[var(--cms-accent-strong)]/20 transition-all text-sm"
                                    placeholder="e.g. Margherita Pizza"
                                    value={editingItem.name || ""}
                                    onChange={(e) => {
                                        if (!canEditItems) return;
                                        setEditingItem({ ...editingItem, name: e.target.value });
                                        setPageDirty(true);
                                    }}
                                    disabled={!canEditItems}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--cms-muted)]">
                                    Description
                                </label>
                                <textarea
                                    className="w-full bg-[var(--cms-panel-strong)] border border-[var(--cms-border)] rounded-2xl px-4 py-3 focus:outline-none focus:border-[var(--cms-text)] focus:ring-2 focus:ring-[var(--cms-accent-strong)]/20 transition-all min-h-[96px] text-sm"
                                    placeholder="e.g. Tomato sauce, mozzarella, and fresh basil."
                                    value={editingItem.description || ""}
                                    onChange={(e) => {
                                        if (!canEditItems) return;
                                        setEditingItem({ ...editingItem, description: e.target.value });
                                        setPageDirty(true);
                                    }}
                                    disabled={!canEditItems}
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--cms-muted)]">
                                        Price
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-full bg-[var(--cms-panel-strong)] border border-[var(--cms-border)] rounded-2xl px-4 py-3 focus:outline-none focus:border-[var(--cms-text)] focus:ring-2 focus:ring-[var(--cms-accent-strong)]/20 transition-all text-sm"
                                        placeholder="0.00"
                                        value={editingItem.price ?? ""}
                                        onChange={(e) => {
                                            if (!canEditItems) return;
                                            const raw = e.target.value;
                                            const nextPrice = raw === "" ? undefined : parseFloat(raw);
                                            setEditingItem({ ...editingItem, price: nextPrice });
                                            setPageDirty(true);
                                        }}
                                        disabled={!canEditItems}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--cms-muted)]">
                                        Status
                                    </label>
                                    <button
                                        onClick={() => {
                                            setEditingItem({ ...editingItem, is_sold_out: !editingItem.is_sold_out });
                                            setPageDirty(true);
                                        }}
                                        disabled={!canManageAvailability && !canEditItems}
                                        className={`w-full px-4 py-3 rounded-2xl border font-semibold text-sm transition-all inline-flex items-center justify-between ${editingItem.is_sold_out ? "bg-red-500/10 border-red-500/30 text-red-500" : "bg-[var(--cms-panel-strong)] border-[var(--cms-border)] text-[var(--cms-text)]"} hover:shadow-[0_0_0_1px_rgba(255,255,255,0.06)]`}
                                    >
                                        <span>{editingItem.is_sold_out ? "Sold Out" : "Available"}</span>
                                        <span
                                            className={`h-2 w-2 rounded-full ${editingItem.is_sold_out ? "bg-red-500" : "bg-emerald-400"}`}
                                        />
                                    </button>
                                </div>
                            </div>

                            {/* Photo Upload */}
                            <div className="space-y-2">
                                <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--cms-muted)]">Photo</label>
                                <div
                                    role="button"
                                    tabIndex={editingItemDisplayPhotoUrl || canEditItems ? 0 : -1}
                                    aria-disabled={!editingItemDisplayPhotoUrl && !canEditItems}
                                    aria-label={editingItemDisplayPhotoUrl ? "View photo" : "Upload a photo"}
                                    onKeyDown={(e) => {
                                        const target = e.target as HTMLElement | null;
                                        if (target?.closest?.("button")) return;
                                        if (e.key !== "Enter" && e.key !== " ") return;
                                        e.preventDefault();
                                        if (editingItemDisplayPhotoUrl) {
                                            setIsPhotoPreviewOpen(true);
                                        } else {
                                            if (!canEditItems) return;
                                            fileInputRef.current?.click();
                                        }
                                    }}
                                    onClick={(e) => {
                                        const target = e.target as HTMLElement | null;
                                        if (target?.closest?.("button")) return;
                                        if (editingItemDisplayPhotoUrl) {
                                            setIsPhotoPreviewOpen(true);
                                        } else {
                                            if (!canEditItems) return;
                                            fileInputRef.current?.click();
                                        }
                                    }}
                                    onDragOver={(e) => {
                                        if (!canEditItems) return;
                                        e.preventDefault();
                                    }}
                                    onDrop={(e) => {
                                        if (!canEditItems) return;
                                        e.preventDefault();
                                        const file = e.dataTransfer.files?.[0];
                                        if (!file) return;
                                        if (!file.type.startsWith("image/")) return;
                                        setFileToUpload(file);
                                        setPageDirty(true);
                                    }}
                                    className={`group relative overflow-hidden rounded-2xl border ${editingItemDisplayPhotoUrl ? "border-solid" : "border-dashed"} bg-[var(--cms-panel-strong)] ring-1 ring-transparent transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cms-accent-strong)]/25 ${canEditItems
                                        ? "cursor-pointer border-[var(--cms-border)] hover:border-[var(--cms-text)] hover:ring-[var(--cms-border)]"
                                        : "cursor-not-allowed opacity-70 border-[var(--cms-border)]"
                                        }`}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            (e.currentTarget as HTMLInputElement).value = "";
                                        }}
                                        onChange={(e) => {
                                            if (!canEditItems) return;
                                            if (!e.target.files?.[0]) return;
                                            setFileToUpload(e.target.files[0]);
                                            setPageDirty(true);
                                        }}
                                        disabled={!canEditItems}
                                    />

                                    {!editingItemDisplayPhotoUrl ? (
                                        <div className="min-h-[148px] px-6 py-10 flex flex-col items-center justify-center text-center">
                                            <div className="w-12 h-12 rounded-2xl bg-[var(--cms-pill)] flex items-center justify-center ring-1 ring-[var(--cms-border)] shadow-sm">
                                                <ImageIcon className="w-6 h-6 text-[var(--cms-muted)] group-hover:text-[var(--cms-text)] transition-colors" />
                                            </div>
                                            <div className="mt-4 text-sm font-semibold text-[var(--cms-text)]">Upload a photo</div>
                                            <div className="mt-1 text-xs text-[var(--cms-muted)]">Click to choose or drag and drop • PNG/JPG • up to 10MB</div>
                                        </div>
                                    ) : (
                                        <div className="relative min-h-[148px]">
                                            <img src={editingItemDisplayPhotoUrl} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/25 to-black/10 pointer-events-none" />

                                            <div
                                                className="absolute top-3 right-3 z-20 pointer-events-auto flex items-center gap-2"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        if (!canEditItems) return;
                                                        setIsPhotoPreviewOpen(false);
                                                        fileInputRef.current?.click();
                                                    }}
                                                    disabled={!canEditItems}
                                                    className="rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel)] px-3 py-1 text-[11px] font-semibold text-[var(--cms-text)] shadow-sm hover:bg-[var(--cms-panel-strong)] transition-colors disabled:opacity-60"
                                                >
                                                    Change
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleRemoveItemPhoto();
                                                    }}
                                                    disabled={!canEditItems || isRemovingItemPhoto}
                                                    className="rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel)] px-3 py-1 text-[11px] font-semibold text-[var(--cms-text)] shadow-sm hover:bg-[var(--cms-panel-strong)] transition-colors disabled:opacity-60"
                                                >
                                                    {fileToUpload ? "Clear" : isRemovingItemPhoto ? "Removing…" : "Remove"}
                                                </button>
                                            </div>

                                            <div className="relative z-10 px-5 py-4 flex items-end justify-between">
                                                <div className="min-w-0">
                                                    {fileToUpload ? (
                                                        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white ring-1 ring-white/20">
                                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-300" aria-hidden="true" />
                                                            New photo selected
                                                        </div>
                                                    ) : (
                                                        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white ring-1 ring-white/20">
                                                            Current photo
                                                        </div>
                                                    )}
                                                    {fileToUpload && (
                                                        <div className="mt-2 text-xs text-white/85 truncate">{fileToUpload.name}</div>
                                                    )}
                                                </div>
                                                <div className="text-xs font-semibold text-white/90 hidden sm:block">Click to view</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {isPhotoPreviewOpen && editingItemDisplayPhotoUrl && (
                                    <div
                                        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
                                        role="dialog"
                                        aria-modal="true"
                                        onClick={() => setIsPhotoPreviewOpen(false)}
                                    >
                                        <div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                type="button"
                                                className="absolute -top-3 -right-3 w-10 h-10 rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel)] text-[var(--cms-text)] flex items-center justify-center shadow-lg hover:bg-[var(--cms-panel-strong)] transition-colors"
                                                onClick={() => setIsPhotoPreviewOpen(false)}
                                                aria-label="Close"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                            <img
                                                src={editingItemDisplayPhotoUrl}
                                                alt=""
                                                className="w-full max-h-[80vh] object-contain rounded-2xl bg-black/20 ring-1 ring-white/10"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* AR Video / Model */}
                            <div className="space-y-2">
                                <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--cms-muted)]">
                                    AR Model
                                </label>
                                <div className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel)] p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-[var(--cms-text)]">Photoreal AR (video → 3D)</div>
                                            <div className="text-xs text-[var(--cms-muted)] mt-1">
                                                Upload a ~10s rotating dish video. Processing can take a while, but AR opens instantly once ready.
                                            </div>
                                        </div>
                                        <div className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${arStatusPillClassName}`}>
                                            {arStatusLabel}
                                        </div>
                                    </div>

                                    {(editingItemArStatus === "pending" || editingItemArStatus === "processing") && (
                                        <div className="space-y-2">
                                            <div className="text-xs text-[var(--cms-muted)]">
                                                {editingItemArStage ? `Stage: ${editingItemArStage}` : "Stage: processing"}
                                                {editingItemArProgressPercent !== null ? ` • ${editingItemArProgressPercent}%` : ""}
                                            </div>
                                            {editingItemArStageDetail && (
                                                <div className="text-xs text-[var(--cms-muted)]">{editingItemArStageDetail}</div>
                                            )}
                                            {editingItemArProgressPercent !== null && (
                                                <div className="h-2 rounded-full bg-[var(--cms-border)] overflow-hidden">
                                                    <div
                                                        className="h-full bg-[var(--cms-text)]"
                                                        style={{ width: `${editingItemArProgressPercent}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {editingItem.ar_error_message && (
                                        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">
                                            {editingItem.ar_error_message}
                                        </div>
                                    )}

                                    {(editingItem.ar_model_poster_url || arVideoPreviewUrl) && (
                                        <div className="rounded-2xl overflow-hidden border border-[var(--cms-border)] bg-[var(--cms-panel-strong)]">
                                            {arVideoPreviewUrl ? (
                                                <video
                                                    src={arVideoPreviewUrl}
                                                    className="w-full max-h-56 object-cover"
                                                    muted
                                                    playsInline
                                                    controls
                                                />
                                            ) : (
                                                <img
                                                    src={editingItem.ar_model_poster_url || ""}
                                                    alt=""
                                                    className="w-full max-h-56 object-cover"
                                                />
                                            )}
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        <div className="text-xs text-[var(--cms-muted)]">
                                            Tip: shoot 4K if possible, bright diffuse light, minimal blur, keep dish centered, add some background texture.
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <input
                                                ref={arVideoInputRef}
                                                type="file"
                                                accept="video/*"
                                                className="hidden"
                                                onClick={(e) => {
                                                    (e.currentTarget as HTMLInputElement).value = "";
                                                }}
                                                onChange={(e) => {
                                                    if (!canEditItems) return;
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;
                                                    setArVideoToUpload(file);
                                                    setPageDirty(true);
                                                }}
                                                disabled={!canEditItems}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => arVideoInputRef.current?.click()}
                                                disabled={!canEditItems}
                                                className="h-11 w-full rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-4 text-sm font-semibold text-[var(--cms-text)] shadow-sm transition-colors hover:bg-[var(--cms-pill)] disabled:opacity-60"
                                            >
                                                Choose video
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleUploadArVideo}
                                                disabled={!canEditItems || !editingItem.id || !arVideoToUpload || isUploadingArVideo}
                                                className="h-11 w-full rounded-2xl bg-[linear-gradient(180deg,var(--cms-accent),var(--cms-accent-strong))] px-4 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-60"
                                            >
                                                {isUploadingArVideo ? "Uploading…" : "Upload & generate"}
                                            </button>
                                            {editingItemArStatus === "failed" && Boolean(editingItem.ar_video_url) && (
                                                <button
                                                    type="button"
                                                    onClick={handleRetryArGeneration}
                                                    disabled={!canEditItems || !editingItem.id || isRetryingArGeneration || isUploadingArVideo}
                                                    className="h-11 w-full sm:col-span-2 rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] px-4 text-sm font-semibold text-[var(--cms-text)] shadow-sm transition-colors hover:bg-[var(--cms-pill)] disabled:opacity-60"
                                                >
                                                    {isRetryingArGeneration ? "Retrying…" : "Retry"}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {arVideoToUpload && (
                                        <div className="text-xs text-[var(--cms-muted)] truncate">
                                            Selected: {arVideoToUpload.name}
                                        </div>
                                    )}
                                    {arVideoError && (
                                        <div className="text-xs text-red-300">{arVideoError}</div>
                                    )}

                                    {!editingItem.id && (
                                        <div className="text-xs text-[var(--cms-muted)]">
                                            Save the item first to enable AR processing.
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* Tags */}
                            {canEditItems && (
                                <div className="space-y-3">
                                    <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--cms-muted)]">Tags</label>
                                    <div className="space-y-4">
                                        <div>
                                            <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--cms-muted)] mb-2">{tagLabels.diet}</div>
                                            <div className="flex flex-wrap gap-2">
                                                {dietTagList.map(tag => (
                                                    <button
                                                        key={tag.id}
                                                        onClick={() => toggleMetadata('tags', tag.id)}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${(editingItem as any).dietary_tag_ids?.includes(tag.id) ? "bg-[var(--cms-text)] border-[var(--cms-text)] text-[var(--cms-bg)] shadow-sm" : "bg-[var(--cms-panel-strong)] border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:border-[var(--cms-text)]/40"}`}
                                                    >
                                                        {tag.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--cms-muted)] mb-2">{tagLabels.spice}</div>
                                            <div className="flex flex-wrap gap-2">
                                                {spiceTagList.map(tag => (
                                                    <button
                                                        key={tag.id}
                                                        onClick={() => toggleMetadata('tags', tag.id)}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${(editingItem as any).dietary_tag_ids?.includes(tag.id) ? "bg-[var(--cms-text)] border-[var(--cms-text)] text-[var(--cms-bg)] shadow-sm" : "bg-[var(--cms-panel-strong)] border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:border-[var(--cms-text)]/40"}`}
                                                    >
                                                        {tag.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[11px] uppercase tracking-[0.2em] text-[var(--cms-muted)] mb-2">{tagLabels.highlights}</div>
                                            <div className="flex flex-wrap gap-2">
                                                {highlightTagList.map(tag => (
                                                    <button
                                                        key={tag.id}
                                                        onClick={() => toggleMetadata('tags', tag.id)}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${(editingItem as any).dietary_tag_ids?.includes(tag.id) ? "bg-[var(--cms-text)] border-[var(--cms-text)] text-[var(--cms-bg)] shadow-sm" : "bg-[var(--cms-panel-strong)] border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:border-[var(--cms-text)]/40"}`}
                                                    >
                                                        {tag.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Allergens */}
                            {canEditItems && (
                                <div className="space-y-2">
                                    <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--cms-muted)]">{tagLabels.allergens}</label>
                                    <div className="flex flex-wrap gap-2">
                                        {allergenTagList.map(alg => (
                                            <button
                                                key={alg.id}
                                                onClick={() => toggleMetadata('allergens', alg.id)}
                                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${(editingItem as any).allergen_ids?.includes(alg.id) ? "bg-red-500/10 border-red-500/40 text-red-500 shadow-sm" : "bg-[var(--cms-panel-strong)] border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:border-[var(--cms-text)]/40"}`}
                                            >
                                                {alg.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </div>
                        <div className="cms-modal-footer p-6 pt-4 border-t border-[var(--cms-border)] flex justify-between gap-3 flex-shrink-0 rounded-b-[28px]">
                            <div>
                                {canEditItems && editingItem.id && (
                                    <button
                                        onClick={async () => {
                                            const ok = await confirm({
                                                title: "Delete item?",
                                                description: "This will permanently delete the item.",
                                                confirmLabel: "Delete",
                                                variant: "destructive",
                                            });
                                            if (!ok) return;
                                            try {
                                                const token = await getAuthToken();
                                                const res = await fetch(`${apiBase}/items/${editingItem.id}`, {
                                                    method: 'DELETE',
                                                    headers: { 'Authorization': `Bearer ${token}` }
                                                });
                                                if (res.ok) {
                                                    setEditingItem(null);
                                                    setPageDirty(true);
                                                    if (menu) fetchMenu(menu.id);
                                                    toast({ variant: "success", title: "Item deleted" });
                                                    return;
                                                }
                                                toast({ variant: "error", title: "Failed to delete item" });
                                            } catch (e) {
                                                console.error(e);
                                                toast({
                                                    variant: "error",
                                                    title: "Failed to delete item",
                                                    description: "Please try again in a moment.",
                                                });
                                            }
                                        }}
                                        className="h-11 px-4 rounded-2xl border border-red-500/25 font-semibold text-red-500 hover:bg-red-500/10 transition-colors inline-flex items-center gap-2"
                                    >
                                        <Trash2 className="w-4 h-4" /> Delete
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setEditingItem(null);
                                        setFileToUpload(null);
                                    }}
                                    className="h-11 px-5 rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-panel-strong)] font-semibold text-[var(--cms-text)] shadow-sm hover:bg-[var(--cms-pill)] transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveItem}
                                    disabled={
                                        isSavingItem ||
                                        (canEditItems
                                            ? !editingItem.name || (!editingItem.price && editingItem.price !== 0)
                                            : !editingItem.id || !canManageAvailability)
                                    }
                                    className="h-11 px-5 bg-[linear-gradient(180deg,var(--cms-accent),var(--cms-accent-strong))] text-white rounded-2xl font-semibold transition-colors disabled:opacity-50 inline-flex items-center gap-2 shadow-sm hover:shadow-md"
                                >
                                    {isSavingItem && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {isSavingItem ? 'Saving...' : 'Save Item'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
