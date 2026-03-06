export type UserMode = "admin" | "manager";

const LEGACY_MODE_KEY = "menuvium_user_mode";
const SCOPED_MODE_PREFIX = "menuvium_user_mode:";

function isUserMode(value: string | null): value is UserMode {
    return value === "admin" || value === "manager";
}

function getLastAuthUser(): string | null {
    if (typeof window === "undefined") return null;
    const clientId = process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID;
    if (!clientId) return null;
    const lastUserKey = `CognitoIdentityServiceProvider.${clientId}.LastAuthUser`;
    return window.localStorage.getItem(lastUserKey);
}

function getScopedModeKey(): string | null {
    const username = getLastAuthUser();
    if (!username) return null;
    return `${SCOPED_MODE_PREFIX}${username}`;
}

export function getStoredUserMode(): UserMode | null {
    if (typeof window === "undefined") return null;

    const scopedKey = getScopedModeKey();
    if (scopedKey) {
        const scopedMode = window.localStorage.getItem(scopedKey);
        if (isUserMode(scopedMode)) {
            return scopedMode;
        }
    }

    const legacyMode = window.localStorage.getItem(LEGACY_MODE_KEY);
    if (!isUserMode(legacyMode)) return null;

    // One-time migration from global key to per-user key.
    if (scopedKey) {
        window.localStorage.setItem(scopedKey, legacyMode);
        window.localStorage.removeItem(LEGACY_MODE_KEY);
    }

    return legacyMode;
}

export function setStoredUserMode(mode: UserMode): void {
    if (typeof window === "undefined") return;
    const scopedKey = getScopedModeKey();
    if (scopedKey) {
        window.localStorage.setItem(scopedKey, mode);
        return;
    }
    window.localStorage.setItem(LEGACY_MODE_KEY, mode);
}

export function clearStoredUserMode(): void {
    if (typeof window === "undefined") return;
    const scopedKey = getScopedModeKey();
    if (scopedKey) {
        window.localStorage.removeItem(scopedKey);
    }
    window.localStorage.removeItem(LEGACY_MODE_KEY);
}
