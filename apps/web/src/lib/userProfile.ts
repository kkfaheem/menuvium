import { fetchUserAttributes } from "aws-amplify/auth";
import { getAuthToken } from "@/lib/authToken";
import { decodeJwtPayload } from "@/lib/jwt";

type AuthLikeUser = {
    username?: string;
    signInDetails?: {
        loginId?: string;
    };
};

const OPAQUE_USERNAME_PREFIX = /^(google|facebook|loginwithamazon|signinwithapple|oidc|saml)_/i;

const asCleanString = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const isOpaqueUsername = (value: string): boolean => OPAQUE_USERNAME_PREFIX.test(value);

const formatEmailLocalPart = (email: string): string => {
    const local = email.split("@")[0]?.split("+")[0]?.trim() || "";
    if (!local) return email;
    const normalized = local.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!normalized) return email;

    // If local-part is mostly an opaque id, keep the full email instead of forced title-case.
    if (/^[a-z]*\d{4,}[a-z\d]*$/i.test(normalized.replace(/\s+/g, ""))) {
        return email;
    }

    return normalized
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
};

const deriveDisplayName = (
    attributes: Record<string, unknown>,
    user?: AuthLikeUser
): string | null => {
    const fullName = asCleanString(attributes.name);
    if (fullName) return fullName;

    const givenName = asCleanString(attributes.given_name);
    const familyName = asCleanString(attributes.family_name);
    const combined = [givenName, familyName].filter(Boolean).join(" ").trim();
    if (combined) return combined;
    if (givenName) return givenName;

    const preferredUsername = asCleanString(attributes.preferred_username);
    if (preferredUsername && !isOpaqueUsername(preferredUsername)) {
        return preferredUsername;
    }

    const cognitoUsername = asCleanString(attributes["cognito:username"]);
    if (cognitoUsername && !isOpaqueUsername(cognitoUsername)) {
        return cognitoUsername;
    }

    const email = asCleanString(attributes.email) || asCleanString(user?.signInDetails?.loginId);
    if (email) return formatEmailLocalPart(email);

    const username = asCleanString(user?.username);
    if (username && !isOpaqueUsername(username)) {
        return username;
    }

    return null;
};

export const fetchDisplayName = async (user: AuthLikeUser | undefined, fallback: string): Promise<string> => {
    let claimsDisplayName: string | null = null;

    try {
        const token = await getAuthToken();
        const claims = decodeJwtPayload<Record<string, unknown>>(token) || {};
        claimsDisplayName = deriveDisplayName(claims, user);
    } catch {
        claimsDisplayName = null;
    }

    try {
        const attributes = await fetchUserAttributes();
        return deriveDisplayName(attributes, user) || claimsDisplayName || fallback;
    } catch {
        return deriveDisplayName({}, user) || claimsDisplayName || fallback;
    }
};
