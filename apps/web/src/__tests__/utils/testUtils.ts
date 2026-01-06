import type { Menu, Category, Item, DietaryTag, Allergen } from "@/types";

/**
 * Creates a mock Item for testing
 */
export const createMockItem = (overrides: Partial<Item> = {}): Item => ({
    id: "item-1",
    name: "Test Item",
    description: "A delicious test item",
    price: 9.99,
    is_sold_out: false,
    position: 0,
    photos: [],
    dietary_tags: [],
    allergens: [],
    ...overrides
});

/**
 * Creates a mock Category for testing
 */
export const createMockCategory = (overrides: Partial<Category> = {}): Category => ({
    id: "cat-1",
    name: "Test Category",
    rank: 0,
    items: [createMockItem()],
    ...overrides
});

/**
 * Creates a mock Menu for testing
 */
export const createMockMenu = (overrides: Partial<Menu> = {}): Menu => ({
    id: "menu-1",
    name: "Test Menu",
    slug: "test-menu-uuid",
    is_active: true,
    theme: "noir",
    categories: [createMockCategory()],
    ...overrides
});

/**
 * Creates a mock DietaryTag for testing
 */
export const createMockDietaryTag = (overrides: Partial<DietaryTag> = {}): DietaryTag => ({
    id: "tag-1",
    name: "Vegan",
    icon: "🌱",
    ...overrides
});

/**
 * Creates a mock Allergen for testing
 */
export const createMockAllergen = (overrides: Partial<Allergen> = {}): Allergen => ({
    id: "allergen-1",
    name: "Nuts",
    ...overrides
});

/**
 * Mock API responses
 */
export const mockApiResponses = {
    menu: createMockMenu(),
    categories: [createMockCategory()],
    dietaryTags: [createMockDietaryTag()],
    allergens: [createMockAllergen()],
    permissions: {
        is_owner: true,
        can_view: true,
        can_manage_availability: true,
        can_edit_items: true,
        can_manage_menus: true,
        can_manage_users: true
    }
};

/**
 * Helper to setup fetch mock for a successful response
 */
export const setupFetchMock = (response: unknown) => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(response)
    });
};

/**
 * Helper to setup fetch mock for a failed response
 */
export const setupFetchMockError = (status = 500, detail = "Server error") => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status,
        json: () => Promise.resolve({ detail })
    });
};
