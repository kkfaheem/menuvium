type CacheEntry<T> = {
    value: T;
    updatedAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 30_000;

export function getCachedValue<T>(key: string, ttlMs: number = DEFAULT_TTL_MS): T | null {
    const cached = memoryCache.get(key) as CacheEntry<T> | undefined;
    if (!cached) return null;
    if (Date.now() - cached.updatedAt > ttlMs) {
        memoryCache.delete(key);
        return null;
    }
    return cached.value;
}

export function setCachedValue<T>(key: string, value: T) {
    memoryCache.set(key, { value, updatedAt: Date.now() });
}

export async function getCachedOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number = DEFAULT_TTL_MS
): Promise<{ value: T; fromCache: boolean }> {
    const cached = getCachedValue<T>(key, ttlMs);
    if (cached !== null) {
        return { value: cached, fromCache: true };
    }

    const existingRequest = inFlightRequests.get(key) as Promise<T> | undefined;
    if (existingRequest) {
        const value = await existingRequest;
        return { value, fromCache: false };
    }

    const request = fetcher()
        .then((value) => {
            setCachedValue(key, value);
            return value;
        })
        .finally(() => {
            inFlightRequests.delete(key);
        });

    inFlightRequests.set(key, request as Promise<unknown>);
    const value = await request;
    return { value, fromCache: false };
}

export function clearCachedByPrefix(prefix: string) {
    memoryCache.forEach((_value, key) => {
        if (key.startsWith(prefix)) {
            memoryCache.delete(key);
        }
    });
}
