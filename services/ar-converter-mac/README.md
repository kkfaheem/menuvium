# Menuvium AR Worker (macOS)

This worker handles the heavy AR pipeline on macOS:

- downloads queued scan videos from the API
- runs video quality checks
- extracts and scores candidate frames
- drops blurry and near-duplicate frames
- submits the selected frame set to the model provider
- converts the returned `usdz` asset into `glb` for Android/web AR delivery

## Prereqs

- macOS 12+
- Xcode Command Line Tools (`xcode-select --install`)
- `curl` in PATH
- Node.js in PATH (used for `npx obj2gltf`)
- `usdextract` in PATH

## Run

From the repo root:

```bash
cd services/ar-converter-mac
export MENUVIUM_API_BASE="https://api.menuvium.com"
export MENUVIUM_AR_CONVERTER_TOKEN="<AR_CONVERTER_TOKEN>"
export KIRI_API_KEY="<KIRI_API_KEY>"
./run-prod.sh
```

## Notes

- The worker polls both `POST /ar-jobs/generations/claim` and `POST /ar-jobs/conversions/claim`.
- For generation jobs it uploads all extracted frames for inspection under `items/ar/{item_id}/debug_frames/{job_id}/...`.
- It logs how many candidate frames were extracted and how many were ultimately used for model generation.
- For conversion jobs it downloads the queued USDZ, exports OBJ via ModelIO, extracts textures with `usdextract`, and builds a GLB with `obj2gltf`.
- If conversion fails, the original USDZ remains stored on the item so a retry can requeue conversion only.
