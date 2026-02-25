import { act, renderHook, waitFor } from "@testing-library/react";
import { usePublicMenu } from "@/hooks/usePublicMenu";
import { createMockMenu, setupFetchMock } from "../utils/testUtils";

// Mock the apiBase
jest.mock("@/lib/apiBase", () => ({
    getApiBase: () => "http://test-api.com"
}));

describe("usePublicMenu", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
    });

    it("should initialize with loading state", () => {
        // Keep the initial fetch pending so we can assert the initial state without act warnings.
        (global.fetch as jest.Mock).mockImplementationOnce(() => new Promise(() => { }));
        const { result } = renderHook(() => usePublicMenu({ menuId: "test-uuid" }));

        expect(result.current.loading).toBe(true);
        expect(result.current.menu).toBeNull();
        expect(result.current.error).toBe("");
    });

    it("should fetch menu on mount", async () => {
        const mockMenu = createMockMenu();
        setupFetchMock(mockMenu);

        const { result } = renderHook(() => usePublicMenu({ menuId: "test-uuid" }));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.menu).toEqual(mockMenu);
        expect(global.fetch).toHaveBeenCalledWith(
            "http://test-api.com/menus/public/test-uuid"
        );
    });

    it("should handle errors gracefully", async () => {
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

        const { result } = renderHook(() => usePublicMenu({ menuId: "test-uuid" }));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.error).toBe("Could not load menu. Please try again later.");
    });

    it("should filter categories by search query", async () => {
        const mockMenu = createMockMenu({
            categories: [
                {
                    id: "cat-1",
                    name: "Appetizers",
                    rank: 0,
                    items: [
                        { id: "1", name: "Spring Rolls", price: 8, is_sold_out: false },
                        { id: "2", name: "Soup", price: 6, is_sold_out: false }
                    ]
                }
            ]
        });
        setupFetchMock(mockMenu);

        const { result } = renderHook(() => usePublicMenu({ menuId: "test-uuid" }));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        // Initially all items visible
        expect(result.current.filteredCategories[0].items).toHaveLength(2);

        // Search for "Spring"
        act(() => {
            result.current.setSearchQuery("Spring");
        });

        await waitFor(() => {
            expect(result.current.filteredCategories[0].items).toHaveLength(1);
            expect(result.current.filteredCategories[0].items[0].name).toBe("Spring Rolls");
        });
    });

    it("should toggle tag selection", async () => {
        const mockMenu = createMockMenu();
        setupFetchMock(mockMenu);

        const { result } = renderHook(() => usePublicMenu({ menuId: "test-uuid" }));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.selectedTagKeys).toEqual([]);

        act(() => {
            result.current.toggleTagKey("d:vegan");
        });
        await waitFor(() => {
            expect(result.current.selectedTagKeys).toContain("d:vegan");
        });

        act(() => {
            result.current.toggleTagKey("d:vegan");
        });
        await waitFor(() => {
            expect(result.current.selectedTagKeys).not.toContain("d:vegan");
        });
    });
});
