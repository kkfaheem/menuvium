export const getApiBase = () => {
    const envBase = process.env.NEXT_PUBLIC_API_URL;
    if (typeof window !== "undefined" && window.location?.hostname) {
        const host = window.location.hostname;
        const isLocalHost = host === "localhost" || host === "127.0.0.1";
        const envIsLocal =
            !!envBase && (envBase.includes("localhost") || envBase.includes("127.0.0.1"));

        if (isLocalHost) {
            return "http://localhost:8000";
        }

        if (envBase && !envIsLocal) {
            return envBase;
        }

        return `http://${host}:8000`;
    }
    return envBase || "http://localhost:8000";
};
