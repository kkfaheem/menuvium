# Menuvium AR Converter (macOS)

This worker converts KIRI-generated `usdz` assets into `glb` for Android/web AR delivery. It does not submit capture jobs or run photogrammetry.

## Prereqs

- macOS 12+
- Xcode Command Line Tools (`xcode-select --install`)
- Node.js in PATH (used for `npx obj2gltf`)
- `usdextract` in PATH

## Run

From the repo root:

```bash
cd services/ar-converter-mac
export MENUVIUM_API_BASE="https://api.menuvium.com"
export MENUVIUM_AR_CONVERTER_TOKEN="<AR_CONVERTER_TOKEN>"
./run-prod.sh
```

## Notes

- The converter polls `POST /ar-jobs/conversions/claim`.
- It downloads the queued USDZ, exports OBJ via ModelIO, extracts textures with `usdextract`, and builds a GLB with `obj2gltf`.
- If conversion fails, the original USDZ remains stored on the item so a retry can requeue conversion only.
