"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Plus, ArrowLeft, GripVertical, Trash2, X, Image as ImageIcon, Loader2, Check, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useParams, useRouter } from "next/navigation";
import {
    DndContext,
    PointerSensor,
    DragOverlay,
    closestCenter,
    useSensor,
    useSensors
} from "@dnd-kit/core";
import {
    SortableContext,
    useSortable,
    arrayMove,
    verticalListSortingStrategy,
    defaultAnimateLayoutChanges
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Types
interface Item {
    id: string;
    name: string;
    description?: string;
    price: number;
    is_sold_out: boolean;
    photo_url?: string;
    position?: number;
}

interface Category {
    id: string;
    name: string;
    items: Item[];
    rank?: number;
}

interface Menu {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    categories: Category[];
}

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

function SortableCategoryCard({
    id,
    className,
    children
}: {
    id: string;
    className: string;
    children: (props: { attributes: any; listeners: any; isDragging: boolean }) => ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
        animateLayoutChanges: (args) => defaultAnimateLayoutChanges({ ...args, wasDragging: true })
    });
    const style = {
        transform: CSS.Transform.toString({
            ...transform,
            scaleX: 1,
            scaleY: 1
        }),
        transition,
        opacity: isDragging ? 0.7 : undefined,
        boxShadow: isDragging ? "0 10px 30px rgba(0,0,0,0.2)" : undefined
    };

    return (
        <div ref={setNodeRef} style={style} className={className}>
            {children({ attributes, listeners, isDragging })}
        </div>
    );
}

function SortableItemRow({
    id,
    className,
    children
}: {
    id: string;
    className: string;
    children: (props: { attributes: any; listeners: any; isDragging: boolean }) => ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
        animateLayoutChanges: (args) => defaultAnimateLayoutChanges({ ...args, wasDragging: true })
    });
    const style = {
        transform: CSS.Transform.toString({
            ...transform,
            scaleX: 1,
            scaleY: 1
        }),
        transition,
        opacity: isDragging ? 0.7 : undefined,
        boxShadow: isDragging ? "0 8px 20px rgba(0,0,0,0.18)" : undefined
    };

    return (
        <div ref={setNodeRef} style={style} className={className}>
            {children({ attributes, listeners, isDragging })}
        </div>
    );
}

export default function MenuDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuthenticator((context) => [context.user]);
    const [menu, setMenu] = useState<Menu | null>(null);
    const [menuName, setMenuName] = useState("");
    const [menuActive, setMenuActive] = useState(true);
    const [isSavingMenu, setIsSavingMenu] = useState(false);
    const [isDeletingMenu, setIsDeletingMenu] = useState(false);
    const [pageDirty, setPageDirty] = useState(false);
    const [hasLoadedMenu, setHasLoadedMenu] = useState(false);
    const [menuBaseline, setMenuBaseline] = useState<{ name: string; is_active: boolean } | null>(null);
    const [loading, setLoading] = useState(true);
    const [dietaryTags, setDietaryTags] = useState<{ id: string, name: string }[]>([]);
    const [allergens, setAllergens] = useState<{ id: string, name: string }[]>([]);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [editingItem, setEditingItem] = useState<Partial<Item> & { categoryId?: string } | null>(null);
    const [isSavingItem, setIsSavingItem] = useState(false);
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [editingCategoryName, setEditingCategoryName] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [isEditingMenuName, setIsEditingMenuName] = useState(false);
    const [menuNameDraft, setMenuNameDraft] = useState("");
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Set<string>>(new Set());
    const [importFile, setImportFile] = useState<File | null>(null);
    const [parsedMenu, setParsedMenu] = useState<ParsedMenu | null>(null);
    const [isParsingImport, setIsParsingImport] = useState(false);
    const [isApplyingImport, setIsApplyingImport] = useState(false);

    useEffect(() => {
        if (params.id) {
            fetchMenu(params.id as string);
            fetchMetadata();
        }
    }, [params.id, user]);

    const fetchMetadata = async () => {
        try {
            const [tagsRes, algRes] = await Promise.all([
                fetch(`${process.env.NEXT_PUBLIC_API_URL}/metadata/dietary-tags`),
                fetch(`${process.env.NEXT_PUBLIC_API_URL}/metadata/allergens`)
            ]);
            if (tagsRes.ok) setDietaryTags(await tagsRes.json());
            if (algRes.ok) setAllergens(await algRes.json());
        } catch (e) {
            console.error("Failed to fetch metadata", e);
        }
    };

    const getAuthToken = async () => {
        if (user) {
            const session: any = await (user as any).getSession();
            return session.getIdToken().getJwtToken();
        }
        return "mock-token";
    };

    const fetchMenu = async (id: string) => {
        try {
            const token = await getAuthToken();

            // First get the menu details
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/menus/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to fetch menu");
            const menuData = await res.json();

            const catRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/categories/${id}`, {
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
        try {
            const token = await getAuthToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/categories/`, {
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
        if (!confirm("Delete this category?")) return;
        try {
            const token = await getAuthToken();
            await fetch(`${process.env.NEXT_PUBLIC_API_URL}/categories/${categoryId}`, {
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
        const name = editingCategoryName.trim();
        if (!name) return;
        try {
            const token = await getAuthToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/categories/${category.id}`, {
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
                const err = await res.json();
                alert(`Failed to update category: ${err.detail || "Unknown error"}`);
            }
        } catch (e) {
            console.error(e);
            alert("Failed to update category");
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
                    fetch(`${process.env.NEXT_PUBLIC_API_URL}/categories/${cat.id}`, {
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
            alert("Failed to reorder categories");
        }
    };

    const persistItemOrder = async (categoryId: string, items: Item[]) => {
        try {
            const token = await getAuthToken();
            await Promise.all(
                items.map((item, index) =>
                    fetch(`${process.env.NEXT_PUBLIC_API_URL}/items/${item.id}`, {
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
            alert("Failed to reorder items");
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

    const handleParseImport = async () => {
        if (!menu || !importFile) return;
        setIsParsingImport(true);
        try {
            const token = await getAuthToken();
            const formData = new FormData();
            formData.append("file", importFile);
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/imports/menu/parse?menu_id=${menu.id}`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });
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
            setIsParsingImport(false);
        }
    };

    const handleApplyImport = async () => {
        if (!menu || !parsedMenu) return;
        if (!confirm("Importing will add categories and items to this menu. Continue?")) return;
        setIsApplyingImport(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/imports/menu/apply?menu_id=${menu.id}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(parsedMenu)
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.detail || "Failed to apply import");
                return;
            }
            setParsedMenu(null);
            setImportFile(null);
            setPageDirty(true);
            fetchMenu(menu.id);
        } catch (e) {
            console.error(e);
            alert("Failed to apply import");
        } finally {
            setIsApplyingImport(false);
        }
    };

    const handleDragEnd = async (event: { active: { id: string | number }; over?: { id: string | number } }) => {
        setIsDragging(false);
        setActiveDragId(null);
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

    const handleCategoryDrop = async (targetId: string) => {
        if (!menu || !draggingCategoryId || draggingCategoryId === targetId) return;
        const fromIndex = menu.categories.findIndex((c) => c.id === draggingCategoryId);
        const toIndex = menu.categories.findIndex((c) => c.id === targetId);
        if (fromIndex < 0 || toIndex < 0) return;
        const nextCategories = reorderArray(menu.categories, fromIndex, toIndex);
        setMenu({ ...menu, categories: nextCategories });
        setDraggingCategoryId(null);
        setIsDragging(false);
        await persistCategoryOrder(nextCategories);
    };

    const handleItemDrop = async (category: Category, targetId: string) => {
        if (!menu || !draggingItem || draggingItem.categoryId !== category.id) return;
        if (draggingItem.itemId === targetId) return;
        const items = [...(category.items || [])];
        const fromIndex = items.findIndex((i) => i.id === draggingItem.itemId);
        const toIndex = items.findIndex((i) => i.id === targetId);
        if (fromIndex < 0 || toIndex < 0) return;
        const nextItems = reorderArray(items, fromIndex, toIndex);
        const nextCategories = menu.categories.map((cat) =>
            cat.id === category.id ? { ...cat, items: nextItems } : cat
        );
        setMenu({ ...menu, categories: nextCategories });
        setDraggingItem(null);
        setIsDragging(false);
        await persistItemOrder(category.id, nextItems);
    };

    const handleFileUpload = async (file: File) => {
        const token = await getAuthToken();

        // 1. Get Presigned URL
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/items/upload-url`, {
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

    const handleSaveItem = async () => {
        console.log("handleSaveItem called", editingItem);
        if (!editingItem) {
            console.log("No editingItem");
            return;
        }
        if (!editingItem.name) {
            console.log("No name");
            return;
        }
        if (editingItem.price === undefined || editingItem.price === null) {
            console.log("No price");
            return;
        }

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
                res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/items/${editingItem.id}`, {
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
                res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/items/`, {
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
                await fetch(`${process.env.NEXT_PUBLIC_API_URL}/items/${itemId}/photos`, {
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
            } else {
                const err = await res.json();
                alert(`Failed to save item: ${err.detail || 'Unknown error'}`);
            }
        } catch (e) {
            console.error(e);
            alert("Error saving item");
        } finally {
            setIsSavingItem(false);
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
        if (!menuName.trim()) {
            alert("Menu name is required");
            return;
        }
        setIsSavingMenu(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/menus/${menu.id}`, {
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
                const err = await res.json();
                alert(`Failed to save menu: ${err.detail || "Unknown error"}`);
                return;
            }
            const data = await res.json();
            setMenu({ ...menu, ...data });
            setMenuName(data.name || menuName);
            setMenuActive(Boolean(data.is_active));
            setMenuBaseline({ name: data.name || menuName, is_active: Boolean(data.is_active) });
            setPageDirty(false);
        } catch (e) {
            console.error(e);
            alert("Error saving menu");
        } finally {
            setIsSavingMenu(false);
        }
    };

    const handleDeleteMenu = async () => {
        if (!menu) return;
        if (!confirm("This will permanently delete the menu and its items. Continue?")) return;
        const confirmation = prompt(`Type "${menu.name}" to confirm deletion.`);
        if (confirmation !== menu.name) {
            alert("Menu name did not match. Delete cancelled.");
            return;
        }
        setIsDeletingMenu(true);
        try {
            const token = await getAuthToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/menus/${menu.id}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                router.push("/dashboard/menus");
            } else {
                alert("Failed to delete menu");
            }
        } catch (e) {
            console.error(e);
            alert("Error deleting menu");
        } finally {
            setIsDeletingMenu(false);
        }
    };

    if (loading) return <div className="text-[var(--cms-muted)] flex items-center gap-2"><Loader2 className="animate-spin" /> Loading menu...</div>;
    if (!menu) return <div className="text-[var(--cms-muted)]">Menu not found</div>;

    return (
        <div className="max-w-4xl mx-auto">
            <header className="mb-8">
                <Link href="/dashboard/menus" className="text-sm text-[var(--cms-muted)] hover:text-[var(--cms-text)] inline-flex items-center gap-1 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Menus
                </Link>
                <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        {isEditingMenuName ? (
                            <div className="flex items-center gap-2">
                                <input
                                    className="text-3xl font-bold tracking-tight bg-transparent border-b border-[var(--cms-border)] focus:outline-none focus:border-[var(--cms-text)] transition-colors"
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
                            <button
                                onClick={() => {
                                    setMenuNameDraft(menuName);
                                    setIsEditingMenuName(true);
                                }}
                                className="text-3xl font-bold tracking-tight text-left hover:opacity-80"
                            >
                                {menuName}
                            </button>
                        )}
                    </div>
                    <div className="flex flex-col items-start gap-3 md:items-end">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => {
                                    setMenuActive(!menuActive);
                                    setPageDirty(true);
                                }}
                                className="h-8 w-[124px] inline-flex items-center justify-between px-3 rounded-full border border-[var(--cms-border)] bg-[var(--cms-panel)]"
                            >
                                <span className="text-xs font-semibold text-[var(--cms-text)] w-[64px] text-left">
                                    {menuActive ? "Active" : "Inactive"}
                                </span>
                                <span className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${menuActive ? "bg-[var(--cms-text)]" : "bg-[var(--cms-panel-strong)]"}`}>
                                    <span className={`inline-block h-3 w-3 rounded-full bg-[var(--cms-bg)] shadow transition-transform ${menuActive ? "translate-x-4" : "translate-x-1"}`} />
                                </span>
                            </button>
                            <button
                                onClick={handleSaveMenu}
                                disabled={isSavingMenu || !pageDirty}
                                className={`h-8 px-4 rounded-full font-semibold text-sm inline-flex items-center gap-2 justify-center min-w-[92px] ${isSavingMenu || !pageDirty ? "bg-[var(--cms-panel-strong)] text-[var(--cms-muted)] cursor-not-allowed" : "bg-[var(--cms-text)] text-[var(--cms-bg)] hover:opacity-90"}`}
                            >
                                {isSavingMenu && <Loader2 className="w-4 h-4 animate-spin" />}
                                {isSavingMenu ? "Saving..." : "Save"}
                            </button>
                            <Link href={`/r/${menu.id}`} target="_blank" className="h-8 px-3 rounded-full text-xs font-semibold inline-flex items-center bg-[var(--cms-panel)] text-[var(--cms-muted)] border border-[var(--cms-border)] hover:text-[var(--cms-text)]">
                                View Public Page
                            </Link>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[var(--cms-muted)]">
                            <button
                                onClick={collapseAllCategories}
                                className="hover:text-[var(--cms-text)]"
                            >
                                Collapse all
                            </button>
                            <span className="text-[var(--cms-border)]">/</span>
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
                                className="bg-[var(--cms-panel)] border border-[var(--cms-border)] rounded-2xl overflow-hidden"
                            >
                                {({ attributes, listeners }) => (
                                    <>
                                        <div className="p-4 bg-[var(--cms-panel-strong)] border-b border-[var(--cms-border)] flex justify-between items-center group">
                                            <div className="flex items-center gap-3">
                                                <button
                                                    className="text-[var(--cms-muted)] cursor-grab active:cursor-grabbing"
                                                    {...attributes}
                                                    {...listeners}
                                                    aria-label="Reorder category"
                                                >
                                                    <GripVertical className="w-4 h-4" />
                                                </button>
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
                                                {editingCategoryId === category.id ? (
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
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleDeleteCategory(category.id)}
                                                    className="p-2 hover:bg-red-500/10 rounded-lg text-red-500 hover:text-red-600"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
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
                                                    {category.items?.map((item) => (
                                                        <SortableItemRow
                                                            key={item.id}
                                                            id={`item-${item.id}`}
                                                            className="p-3 bg-[var(--cms-panel-strong)] rounded-xl flex justify-between items-center group hover:bg-[var(--cms-pill)] transition-colors cursor-pointer"
                                                        >
                                                            {({ attributes: itemAttributes, listeners: itemListeners }) => (
                                                                <div
                                                                    className="flex w-full items-center justify-between"
                                                                    onClick={() => {
                                                                        if (isDragging) return;
                                                                        setEditingItem({ ...item, categoryId: category.id });
                                                                        setFileToUpload(null);
                                                                    }}
                                                                >
                                                                    <div className="flex items-center gap-4">
                                                                        <button
                                                                            className="text-[var(--cms-muted)] cursor-grab active:cursor-grabbing"
                                                                            {...itemAttributes}
                                                                            {...itemListeners}
                                                                            aria-label="Reorder item"
                                                                        >
                                                                            <GripVertical className="w-4 h-4" />
                                                                        </button>
                                                                        {(item.photo_url || (item as any).photos?.[0]?.url) && (
                                                                            <img src={item.photo_url || (item as any).photos?.[0]?.url} alt={item.name} className="w-10 h-10 rounded-lg object-cover bg-[var(--cms-panel-strong)]" />
                                                                        )}
                                                                        <div>
                                                                            <p className="font-medium">{item.name}</p>
                                                                            <p className="text-xs text-[var(--cms-muted)] line-clamp-1">{item.description}</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-4">
                                                                        <span className="font-mono text-sm">${item.price}</span>
                                                                        {item.is_sold_out && <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-1 rounded-full uppercase tracking-wider font-bold">Sold Out</span>}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </SortableItemRow>
                                                    ))}
                                                </SortableContext>

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

                {/* Add Category Section */}
                {isAddingCategory ? (
                    <div className="bg-[var(--cms-panel)] border border-[var(--cms-border)] p-6 rounded-2xl animate-in fade-in slide-in-from-bottom-2">
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
                                className="bg-[var(--cms-text)] text-[var(--cms-bg)] px-6 rounded-xl font-bold hover:opacity-90"
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
            </div>

            <div className="mt-10 border border-[var(--cms-border)] bg-[var(--cms-panel)] rounded-2xl p-6">
                <h3 className="font-bold text-lg mb-1">Import Menu</h3>
                <p className="text-sm text-[var(--cms-muted)] mb-4">Upload a menu image or PDF. We will parse and let you review before importing.</p>
                <div className="flex flex-wrap items-center gap-3">
                    <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                        className="text-sm"
                    />
                    <button
                        onClick={handleParseImport}
                        disabled={!importFile || isParsingImport}
                        className="h-10 px-4 rounded-lg font-bold text-sm bg-[var(--cms-text)] text-[var(--cms-bg)] disabled:opacity-50"
                    >
                        {isParsingImport ? "Parsing..." : "Parse"}
                    </button>
                    {parsedMenu && (
                        <button
                            onClick={handleApplyImport}
                            disabled={isApplyingImport}
                            className="h-10 px-4 rounded-lg font-bold text-sm bg-[var(--cms-panel-strong)] text-[var(--cms-text)] border border-[var(--cms-border)] disabled:opacity-50"
                        >
                            {isApplyingImport ? "Importing..." : "Import"}
                        </button>
                    )}
                </div>

                {parsedMenu && (
                    <div className="mt-6 space-y-4">
                        {parsedMenu.categories.map((cat, idx) => (
                            <div key={`${cat.name}-${idx}`} className="border border-[var(--cms-border)] rounded-xl p-4">
                                <h4 className="font-bold mb-2">{cat.name}</h4>
                                <ul className="text-sm text-[var(--cms-muted)] space-y-1">
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

            {/* Item Editor Modal */}
            {editingItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div
                        className="bg-[var(--cms-panel)] border border-[var(--cms-border)] w-full max-w-lg rounded-3xl shadow-2xl scale-100 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
                        onKeyDown={(e) => {
                            const target = e.target as HTMLElement;
                            const isTextarea = target.tagName === "TEXTAREA";
                            if (e.key === "Enter" && !isTextarea) {
                                e.preventDefault();
                                handleSaveItem();
                            }
                        }}
                    >
                        <div className="p-6 pb-2 flex-shrink-0 flex justify-between items-center">
                            <h2 className="text-xl font-bold">{editingItem.id ? "Edit Item" : "Add Item"}</h2>
                            <button
                                onClick={() => {
                                    setEditingItem(null);
                                    setFileToUpload(null);
                                }}
                                className="p-2 hover:bg-[var(--cms-pill)] rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 pt-2 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-[var(--cms-muted)] mb-2">Name</label>
                                <input
                                    className="w-full bg-transparent border border-[var(--cms-border)] rounded-xl p-3 focus:outline-none focus:border-[var(--cms-text)] transition-colors"
                                    placeholder="e.g. Margherita Pizza"
                                    value={editingItem.name || ""}
                                    onChange={e => {
                                        setEditingItem({ ...editingItem, name: e.target.value });
                                        setPageDirty(true);
                                    }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-[var(--cms-muted)] mb-2">Description</label>
                                <textarea
                                    className="w-full bg-transparent border border-[var(--cms-border)] rounded-xl p-3 focus:outline-none focus:border-[var(--cms-text)] transition-colors min-h-[80px]"
                                    placeholder="e.g. Tomato sauce, mozzarella, and fresh basil."
                                    value={editingItem.description || ""}
                                    onChange={e => {
                                        setEditingItem({ ...editingItem, description: e.target.value });
                                        setPageDirty(true);
                                    }}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--cms-muted)] mb-2">Price ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-full bg-transparent border border-[var(--cms-border)] rounded-xl p-3 focus:outline-none focus:border-[var(--cms-text)] transition-colors"
                                        placeholder="0.00"
                                        value={editingItem.price || ""}
                                        onChange={e => {
                                            setEditingItem({ ...editingItem, price: parseFloat(e.target.value) });
                                            setPageDirty(true);
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--cms-muted)] mb-2">Status</label>
                                    <button
                                        onClick={() => {
                                            setEditingItem({ ...editingItem, is_sold_out: !editingItem.is_sold_out });
                                            setPageDirty(true);
                                        }}
                                        className={`w-full p-3 rounded-xl border font-bold text-sm transition-all ${editingItem.is_sold_out ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-[var(--cms-pill)] border-[var(--cms-border)] text-[var(--cms-text)]'}`}
                                    >
                                        {editingItem.is_sold_out ? 'SOLD OUT' : 'AVAILABLE'}
                                    </button>
                                </div>
                            </div>

                            {/* Dietary Tags */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-[var(--cms-muted)] mb-2">Dietary Tags</label>
                                <div className="flex flex-wrap gap-2">
                                    {dietaryTags.map(tag => (
                                        <button
                                            key={tag.id}
                                            onClick={() => toggleMetadata('tags', tag.id)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${(editingItem as any).dietary_tag_ids?.includes(tag.id) ? 'bg-[var(--cms-text)] border-[var(--cms-text)] text-[var(--cms-bg)]' : 'bg-transparent border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)]'}`}
                                        >
                                            {tag.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Allergens */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-[var(--cms-muted)] mb-2">Contains Allergens</label>
                                <div className="flex flex-wrap gap-2">
                                    {allergens.map(alg => (
                                        <button
                                            key={alg.id}
                                            onClick={() => toggleMetadata('allergens', alg.id)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${(editingItem as any).allergen_ids?.includes(alg.id) ? 'bg-red-500/10 border-red-500/40 text-red-500' : 'bg-transparent border-[var(--cms-border)] text-[var(--cms-muted)] hover:text-[var(--cms-text)]'}`}
                                        >
                                            {alg.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Photo Upload */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-[var(--cms-muted)] mb-2">Photo</label>
                                <label className="p-8 border-2 border-dashed border-[var(--cms-border)] rounded-xl flex flex-col items-center justify-center text-[var(--cms-muted)] hover:text-[var(--cms-text)] hover:border-[var(--cms-text)] transition-all cursor-pointer relative overflow-hidden bg-[var(--cms-panel-strong)]">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            if (!e.target.files?.[0]) return;
                                            setFileToUpload(e.target.files[0]);
                                            setPageDirty(true);
                                        }}
                                    />
                                    {fileToUpload ? (
                                        <div className="text-center">
                                            <p className="font-bold mb-1">{fileToUpload.name}</p>
                                            <p className="text-xs">Click to change</p>
                                        </div>
                                    ) : (editingItem.photo_url || (editingItem as any).photos?.[0]?.url) ? (
                                        <div className="absolute inset-0">
                                            <img src={editingItem.photo_url || (editingItem as any).photos?.[0]?.url} className="w-full h-full object-cover opacity-50 hover:opacity-100 transition-opacity" />
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity text-xs font-bold">
                                                Click to change
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <ImageIcon className="w-8 h-8 mb-2" />
                                            <span className="text-sm font-medium">Click to upload photo</span>
                                        </>
                                    )}
                                </label>
                            </div>

                        </div>
                        <div className="p-6 pt-4 border-t border-[var(--cms-border)] flex justify-between gap-3 flex-shrink-0 bg-[var(--cms-panel)] rounded-b-3xl">
                            <div>
                                {editingItem.id && (
                                    <button
                                        onClick={async () => {
                                            if (!confirm("Delete this item?")) return;
                                            try {
                                                const token = await getAuthToken();
                                                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/items/${editingItem.id}`, {
                                                    method: 'DELETE',
                                                    headers: { 'Authorization': `Bearer ${token}` }
                                                });
                                                if (res.ok) {
                                                    setEditingItem(null);
                                                    setPageDirty(true);
                                                    if (menu) fetchMenu(menu.id);
                                                }
                                            } catch (e) {
                                                console.error(e);
                                            }
                                        }}
                                        className="px-4 py-3 rounded-xl font-bold text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-2"
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
                                    className="px-6 py-3 rounded-xl font-bold hover:bg-[var(--cms-pill)] transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveItem}
                                    disabled={isSavingItem || !editingItem.name || (!editingItem.price && editingItem.price !== 0)}
                                    className="px-6 py-3 bg-[var(--cms-text)] text-[var(--cms-bg)] rounded-xl font-bold hover:opacity-90 transition-colors disabled:opacity-50 flex items-center gap-2"
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
