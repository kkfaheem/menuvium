export const getApiBase = () => {
    const envBase = process.env.NEXT_PUBLIC_API_URL;
    if (typeof window !== "undefined" && window.location?.hostname) {
        if (envBase?.startsWith("/")) {
            return envBase;
        }
        const host = window.location.hostname;
        const isLocalHost = host === "localhost" || host === "127.0.0.1";
        const envIsLocal = !!envBase && (envBase.includes("localhost") || envBase.includes("127.0.0.1"));

        if (envBase && !envIsLocal) {
            return envBase;
        }

        if (isLocalHost) {
            return envBase || "http://localhost:8000";
        }

        return `http://${host}:8000`;
    }
    if (envBase?.startsWith("/")) {
        return process.env.API_INTERNAL_URL || "http://localhost:8000";
    }
    return envBase || "http://localhost:8000";
};

const normalizeBase = (value: string) => value.replace(/\/$/, "");

/**
 * Use for direct file uploads (ZIP import, large multipart bodies).
 *
 * In production, proxying large uploads through Vercel route handlers can hit body-size limits.
 * Prefer setting `NEXT_PUBLIC_API_UPLOAD_URL=https://api.yourdomain.com` and keep
 * `NEXT_PUBLIC_API_URL=/api` for normal JSON calls.
 */
export const getUploadApiBase = () => {
    const envUpload = process.env.NEXT_PUBLIC_API_UPLOAD_URL || process.env.NEXT_PUBLIC_API_DIRECT_URL;
    if (envUpload && (envUpload.startsWith("http://") || envUpload.startsWith("https://"))) {
        return normalizeBase(envUpload);
    }

    const envBase = process.env.NEXT_PUBLIC_API_URL;
    if (envBase && (envBase.startsWith("http://") || envBase.startsWith("https://"))) {
        return normalizeBase(envBase);
    }

    if (typeof window !== "undefined" && window.location?.hostname) {
        const host = window.location.hostname;
        const isLocalHost = host === "localhost" || host === "127.0.0.1";
        if (isLocalHost) {
            return normalizeBase(envUpload || envBase || "http://localhost:8000");
        }
        const rootHost = host.replace(/^www\./, "");
        if (rootHost.startsWith("api.")) {
            return `https://${rootHost}`;
        }
        return `https://api.${rootHost}`;
    }

    return normalizeBase(process.env.API_INTERNAL_URL || "http://localhost:8000");
};
