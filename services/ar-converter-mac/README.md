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
# copy .env.example to .env once, then edit the values
# run-prod.sh automatically loads .env and .env.local
./run-prod.sh
```

Example local `.env`:

```env
MENUVIUM_API_BASE=https://api.menuvium.com
MENUVIUM_AR_CONVERTER_TOKEN=<AR_CONVERTER_TOKEN>
KIRI_API_KEY=<KIRI_API_KEY>
MENUVIUM_AR_CONVERTER_POLL_SECONDS=5

MENUVIUM_SCAN_MIN_DURATION_SECONDS=6
MENUVIUM_SCAN_MAX_DURATION_SECONDS=180
MENUVIUM_SCAN_MIN_MAX_DIMENSION=1080
MENUVIUM_SCAN_FRAME_FPS=12
MENUVIUM_SCAN_FRAME_MIN_CANDIDATES=120
MENUVIUM_SCAN_FRAME_MAX_CANDIDATES=300
MENUVIUM_SCAN_MIN_SELECTED_FRAMES=20
MENUVIUM_SCAN_TARGET_SELECTED_FRAMES=180
MENUVIUM_SCAN_BLUR_ABSOLUTE_THRESHOLD=0.02
MENUVIUM_SCAN_BLUR_RELATIVE_FACTOR=0.45
MENUVIUM_SCAN_DUPLICATE_HAMMING_THRESHOLD=6

MENUVIUM_AR_PROCESS_TIMEOUT_SECONDS=900
MENUVIUM_AR_AUTO_ROTATE=0
MENUVIUM_AR_REWRITE_USDZ=0
```

## Notes

- The worker polls both `POST /ar-jobs/generations/claim` and `POST /ar-jobs/conversions/claim`.
- For generation jobs it uploads all extracted frames for inspection under `items/ar/{item_id}/debug_frames/{job_id}/...`.
- It logs how many candidate frames were extracted and how many were ultimately used for model generation.
- For conversion jobs it downloads the queued USDZ, exports OBJ via ModelIO, extracts textures with `usdextract`, and builds a GLB with `obj2gltf`.
- If conversion fails, the original USDZ remains stored on the item so a retry can requeue conversion only.
