import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = {
    width: 1200,
    height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
    const bg = "#0b0f16";
    const panel = "rgba(255, 255, 255, 0.06)";
    const border = "rgba(255, 255, 255, 0.12)";
    const text = "rgba(255, 255, 255, 0.92)";
    const muted = "rgba(255, 255, 255, 0.70)";
    const accent = "#ff6b1f";

    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    background: bg,
                    padding: 64,
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background:
                            "radial-gradient(600px 600px at 15% 20%, rgba(255, 107, 31, 0.25), transparent 60%), radial-gradient(700px 700px at 85% 25%, rgba(56, 189, 248, 0.18), transparent 55%), radial-gradient(800px 800px at 55% 100%, rgba(16, 185, 129, 0.14), transparent 55%)",
                    }}
                />

                <div style={{ position: "relative", display: "flex", width: "100%", gap: 48 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
                        <div
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 10,
                                padding: "10px 14px",
                                width: "fit-content",
                                borderRadius: 999,
                                background: panel,
                                border: `1px solid ${border}`,
                                color: muted,
                                fontSize: 20,
                                fontWeight: 700,
                                letterSpacing: 0.4,
                            }}
                        >
                            <span
                                style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 999,
                                    background: accent,
                                    opacity: 0.9,
                                }}
                            />
                            QR menus, made modern
                        </div>

                        <div style={{ fontSize: 80, fontWeight: 800, letterSpacing: -2, color: text, lineHeight: 1.02 }}>
                            Menuvium
                        </div>

                        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1.2, color: accent, lineHeight: 1.08 }}>
                            Update instantly.
                            <br />
                            Add photoreal AR.
                        </div>

                        <div style={{ marginTop: 8, fontSize: 26, color: muted, lineHeight: 1.3, maxWidth: 520 }}>
                            Import a menu, pick a theme, publish a QR — then keep iterating without reprinting.
                        </div>
                    </div>

                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                        <div
                            style={{
                                width: 520,
                                height: 360,
                                borderRadius: 28,
                                background: panel,
                                border: `1px solid ${border}`,
                                padding: 18,
                                display: "flex",
                                flexDirection: "column",
                                gap: 12,
                                boxShadow: "0 40px 120px -80px rgba(0,0,0,0.75)",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div
                                        style={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: 999,
                                            background: "rgba(16,185,129,0.9)",
                                        }}
                                    />
                                    <div style={{ color: muted, fontSize: 18, fontWeight: 700 }}>Live preview</div>
                                </div>
                                <div style={{ color: muted, fontSize: 18, fontWeight: 700 }}>Dashboard</div>
                            </div>

                            <div
                                style={{
                                    flex: 1,
                                    borderRadius: 22,
                                    border: `1px solid ${border}`,
                                    background:
                                        "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: muted,
                                    fontSize: 22,
                                    fontWeight: 700,
                                }}
                            >
                                Studio preview
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        ),
        size
    );
}

