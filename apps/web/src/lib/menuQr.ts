export type MenuQrUrls = {
  previewUrl: string;
  openUrl: string;
  pdfUrl: string;
};

export type RegenerateMenuQrResponse = {
  qr_url: string;
  current_qr_url: string;
  generated_at: string;
};

export function buildMenuQrUrls(
  apiBase: string,
  menuId: string,
  revision: number | string = 0,
): MenuQrUrls {
  const buildUrl = (format: "png" | "pdf", size: number) => {
    const params = new URLSearchParams({
      format,
      size: String(size),
    });
    if (revision) {
      params.set("rev", String(revision));
    }
    return `${apiBase}/menus/${menuId}/qr?${params.toString()}`;
  };

  return {
    previewUrl: buildUrl("png", 640),
    openUrl: buildUrl("png", 1000),
    pdfUrl: buildUrl("pdf", 1000),
  };
}

export async function regenerateMenuQr(
  apiBase: string,
  menuId: string,
  token: string,
): Promise<RegenerateMenuQrResponse> {
  const response = await fetch(`${apiBase}/menus/${menuId}/regenerate-qr`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let detail = "Failed to regenerate QR code";
    try {
      const payload = await response.json();
      if (typeof payload?.detail === "string" && payload.detail.trim()) {
        detail = payload.detail;
      }
    } catch {
      // Ignore malformed error payloads and use the fallback message.
    }
    throw new Error(detail);
  }

  return response.json();
}
