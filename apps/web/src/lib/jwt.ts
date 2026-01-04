export type JwtPayload = Record<string, unknown> & {
    sub?: string;
    email?: string;
};

const decodeBase64Url = (input: string) => {
    const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return atob(padded);
};

export const decodeJwtPayload = <T extends JwtPayload = JwtPayload>(token: string): T | null => {
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const json = decodeBase64Url(parts[1]);
        return JSON.parse(json) as T;
    } catch {
        return null;
    }
};

export const getJwtSub = (token: string): string | null => {
    const payload = decodeJwtPayload(token);
    return (payload?.sub as string | undefined) || null;
};

