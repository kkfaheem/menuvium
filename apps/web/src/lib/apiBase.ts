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
