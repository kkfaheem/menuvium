import { fetchAuthSession } from "aws-amplify/auth";
import { decodeJwtPayload } from "@/lib/jwt";

const CACHE_MS = 10_000;
let cachedToken: { token: string; fetchedAt: number } | null = null;

const now = () => Date.now();

const getIdTokenFromLocalStorage = (): string | null => {
    if (typeof window === "undefined") return null;
    const clientId = process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID;
    if (!clientId) return null;

    const lastUserKey = `CognitoIdentityServiceProvider.${clientId}.LastAuthUser`;
    const username = window.localStorage.getItem(lastUserKey);
    if (!username) return null;

    const tokenKey = `CognitoIdentityServiceProvider.${clientId}.${username}.idToken`;
    return window.localStorage.getItem(tokenKey);
};

const isTokenValidSoon = (token: string): boolean => {
    const payload = decodeJwtPayload<{ exp?: number }>(token);
    const exp = payload?.exp;
    if (!exp) return false;
    // consider invalid if expiring in the next 60s
    return exp * 1000 > now() + 60_000;
};

export const getAuthToken = async (): Promise<string> => {
    if (cachedToken && now() - cachedToken.fetchedAt < CACHE_MS && isTokenValidSoon(cachedToken.token)) {
        return cachedToken.token;
    }

    const stored = getIdTokenFromLocalStorage();
    if (stored && isTokenValidSoon(stored)) {
        cachedToken = { token: stored, fetchedAt: now() };
        return stored;
    }

    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) {
        throw new Error("Not authenticated");
    }
    cachedToken = { token, fetchedAt: now() };
    return token;
};

