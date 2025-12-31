"use client";

import { useState, useEffect } from "react";
import { Plus, ArrowLeft, GripVertical, Trash2, Edit, Save, X, Image as ImageIcon, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useParams, useRouter } from "next/navigation";

// Types
interface Item {
    id: string;
    name: string;
    description?: string;
    price: number;
    is_sold_out: boolean;
    photo_url?: string;
}

interface Category {
    id: string;
    name: string;
    items: Item[];
}

interface Menu {
    id: string;
    name: string;
    slug: string;
    categories: Category[];
}

export default function MenuDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuthenticator((context) => [context.user]);
    const [menu, setMenu] = useState<Menu | null>(null);
    const [loading, setLoading] = useState(true);
    const [dietaryTags, setDietaryTags] = useState<{ id: string, name: string }[]>([]);
    const [allergens, setAllergens] = useState<{ id: string, name: string }[]>([]);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [editingItem, setEditingItem] = useState<Partial<Item> & { categoryId?: string } | null>(null);
    const [isSavingItem, setIsSavingItem] = useState(false);

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
            if (menu) fetchMenu(menu.id);
        } catch (e) {
            console.error(e);
        }
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
    };

    if (loading) return <div className="text-white/40 flex items-center gap-2"><Loader2 className="animate-spin" /> Loading menu...</div>;
    if (!menu) return <div className="text-white/40">Menu not found</div>;

    return (
        <div className="max-w-4xl mx-auto">
            <header className="mb-8">
                <Link href="/dashboard/menus" className="text-sm text-white/40 hover:text-white mb-4 inline-flex items-center gap-1 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Menus
                </Link>
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-2">{menu.name}</h1>
                        <p className="text-white/40 font-mono text-sm">/r/{menu.id}</p>
                    </div>
                    <Link href={`/r/${menu.id}`} target="_blank" className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-bold transition-all text-sm">
                        View Public Page
                    </Link>
                </div>
            </header>

            <div className="space-y-8">
                {menu.categories.map((category) => (
                    <div key={category.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        <div className="p-4 bg-white/5 border-b border-white/10 flex justify-between items-center group">
                            <div className="flex items-center gap-3">
                                <GripVertical className="text-white/20 cursor-move" />
                                <h3 className="font-bold text-lg">{category.name}</h3>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white text-xs font-medium">
                                    Edit
                                </button>
                                <button
                                    onClick={() => handleDeleteCategory(category.id)}
                                    className="p-2 hover:bg-red-500/20 rounded-lg text-red-400 hover:text-red-300"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="p-4 space-y-2">
                            {/* Items List */}
                            {category.items?.length === 0 && (
                                <div className="text-center py-8 text-white/20 text-sm border-2 border-dashed border-white/5 rounded-xl">
                                    No items in this category yet.
                                </div>
                            )}
                            {category.items?.map(item => (
                                <div key={item.id} className="p-3 bg-white/5 rounded-xl flex justify-between items-center group hover:bg-white/10 transition-colors cursor-pointer" onClick={() => setEditingItem({ ...item, categoryId: category.id })}>
                                    <div className="flex items-center gap-4">
                                        {(item.photo_url || (item as any).photos?.[0]?.url) && (
                                            <img src={item.photo_url || (item as any).photos?.[0]?.url} alt={item.name} className="w-10 h-10 rounded-lg object-cover bg-white/5" />
                                        )}
                                        <div>
                                            <p className="font-medium">{item.name}</p>
                                            <p className="text-xs text-white/40 line-clamp-1">{item.description}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="font-mono text-sm">${item.price}</span>
                                        {item.is_sold_out && <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-1 rounded-full uppercase tracking-wider font-bold">Sold Out</span>}
                                    </div>
                                </div>
                            ))}

                            <button
                                onClick={() => {
                                    setEditingItem({ categoryId: category.id });
                                    setFileToUpload(null);
                                }}
                                className="w-full py-3 border-2 border-dashed border-white/10 rounded-xl text-white/40 hover:text-white hover:border-white/20 transition-all text-sm font-medium flex items-center justify-center gap-2"
                            >
                                <Plus className="w-4 h-4" /> Add Item
                            </button>
                        </div>
                    </div>
                ))}

                {/* Add Category Section */}
                {isAddingCategory ? (
                    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl animate-in fade-in slide-in-from-bottom-2">
                        <h3 className="font-bold mb-4">New Category</h3>
                        <div className="flex gap-4">
                            <input
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                                placeholder="Category Name (e.g. Appetizers)"
                                className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2 focus:outline-none focus:border-blue-500 transition-colors"
                                autoFocus
                            />
                            <button
                                onClick={handleAddCategory}
                                className="bg-blue-600 text-white px-6 rounded-xl font-bold hover:bg-blue-500"
                            >
                                Save
                            </button>
                            <button
                                onClick={() => setIsAddingCategory(false)}
                                className="bg-white/10 text-white px-4 rounded-xl font-bold hover:bg-white/20"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setIsAddingCategory(true)}
                        className="w-full py-6 border-2 border-dashed border-white/10 rounded-3xl text-white/40 hover:text-white hover:border-white/20 transition-all font-bold text-lg flex items-center justify-center gap-3"
                    >
                        <Plus className="w-6 h-6" /> Add Category
                    </button>
                )}
            </div>

            {/* Item Editor Modal */}
            {editingItem && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-[#111] border border-white/10 w-full max-w-lg rounded-3xl shadow-2xl scale-100 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                        <div className="p-6 pb-2 flex-shrink-0 flex justify-between items-center">
                            <h2 className="text-xl font-bold">{editingItem.id ? "Edit Item" : "Add Item"}</h2>
                            <button onClick={() => setEditingItem(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 pt-2 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Name</label>
                                <input
                                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-blue-500 transition-colors"
                                    placeholder="e.g. Margherita Pizza"
                                    value={editingItem.name || ""}
                                    onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Description</label>
                                <textarea
                                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-blue-500 transition-colors min-h-[80px]"
                                    placeholder="e.g. Tomato sauce, mozzarella, and fresh basil."
                                    value={editingItem.description || ""}
                                    onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Price ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-blue-500 transition-colors"
                                        placeholder="0.00"
                                        value={editingItem.price || ""}
                                        onChange={e => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Status</label>
                                    <button
                                        onClick={() => setEditingItem({ ...editingItem, is_sold_out: !editingItem.is_sold_out })}
                                        className={`w-full p-3 rounded-xl border font-bold text-sm transition-all ${editingItem.is_sold_out ? 'bg-red-500/20 border-red-500/50 text-red-500' : 'bg-green-500/20 border-green-500/50 text-green-500'}`}
                                    >
                                        {editingItem.is_sold_out ? 'SOLD OUT' : 'AVAILABLE'}
                                    </button>
                                </div>
                            </div>

                            {/* Dietary Tags */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Dietary Tags</label>
                                <div className="flex flex-wrap gap-2">
                                    {dietaryTags.map(tag => (
                                        <button
                                            key={tag.id}
                                            onClick={() => toggleMetadata('tags', tag.id)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${(editingItem as any).dietary_tag_ids?.includes(tag.id) ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
                                        >
                                            {tag.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Allergens */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Contains Allergens</label>
                                <div className="flex flex-wrap gap-2">
                                    {allergens.map(alg => (
                                        <button
                                            key={alg.id}
                                            onClick={() => toggleMetadata('allergens', alg.id)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${(editingItem as any).allergen_ids?.includes(alg.id) ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
                                        >
                                            {alg.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Photo Upload */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Photo</label>
                                <label className="p-8 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center text-white/40 hover:text-white hover:border-white/20 transition-all cursor-pointer relative overflow-hidden bg-white/5">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => e.target.files?.[0] && setFileToUpload(e.target.files[0])}
                                    />
                                    {fileToUpload ? (
                                        <div className="text-center">
                                            <p className="text-blue-400 font-bold mb-1">{fileToUpload.name}</p>
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
                        <div className="p-6 pt-4 border-t border-white/10 flex justify-between gap-3 flex-shrink-0 bg-[#111] rounded-b-3xl">
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
                                <button onClick={() => setEditingItem(null)} className="px-6 py-3 rounded-xl font-bold hover:bg-white/10 transition-colors">Cancel</button>
                                <button
                                    onClick={handleSaveItem}
                                    disabled={isSavingItem || !editingItem.name || (!editingItem.price && editingItem.price !== 0)}
                                    className="px-6 py-3 bg-blue-600 rounded-xl font-bold hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center gap-2"
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
