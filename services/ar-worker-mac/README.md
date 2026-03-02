# Menuvium AR Worker (macOS)

This worker turns an uploaded dish rotation video into `usdz` (iOS Quick Look) + `glb` (Android Scene Viewer) using Apple Object Capture (RealityKit Photogrammetry).

## Prereqs

- macOS 12+ (Apple Silicon recommended for Object Capture)
- Xcode Command Line Tools (`xcode-select --install`)
- `ffmpeg` in PATH (e.g. `brew install ffmpeg`)
- Node.js in PATH (used for `npx obj2gltf`)
- `usdextract` in PATH (ships with Xcode Command Line Tools on macOS)

## Run (local Docker)

1. Start the stack:
   - `docker-compose up --build`
2. Run the worker on your Mac:
   - `cd services/ar-worker-mac`
   - `swift run menuvium-ar-worker --api-base http://localhost:3000/api --token local-dev-worker-token`

### Quality presets

- **Balanced** (faster, lower fidelity):
  - `swift run menuvium-ar-worker --api-base http://localhost:3000/api --token local-dev-worker-token --quality balanced`
- **High** (default; best starting point):
  - `swift run menuvium-ar-worker --api-base http://localhost:3000/api --token local-dev-worker-token --quality high`
- **Ultra** (slowest; attempts custom/max settings when supported):
  - `swift run menuvium-ar-worker --api-base http://localhost:3000/api --token local-dev-worker-token --quality ultra`

You can also override individually:

- `--fps 6` (frame sampling rate)
- `--detail full|custom|ultra|raw`
- `--max-texture-dim twoK|fourK|eightK` (used with `custom/ultra` when supported)
- `--max-polygons 500000` (used with `custom/ultra` when supported)
- `--jpeg-q 1` (higher quality JPEG frames; slower/larger)

## Run (AWS testing)

Point the worker at your deployed API URL and use the same `AR_WORKER_TOKEN` secret value you configured for the API:

- `swift run menuvium-ar-worker --api-base https://<your-domain>/api --token <AR_WORKER_TOKEN>`

## Run (Production on your Mac)

Menuvium queues AR work in the database (`pending` → `processing` → `ready`). If your Mac is asleep/offline, jobs are **not lost**; they will stay `pending` until the worker is running again.

### Prereqs
- Your production API must have `AR_WORKER_TOKEN` set to a secure string.

### Start
From the repo root:
- `cd services/ar-worker-mac`
- Ensure you have the production `AR_WORKER_TOKEN` ready from your Railway environment variables.
- Export the required environment variables:
  ```bash
  export MENUVIUM_API_BASE="https://api.menuvium.com"
  export MENUVIUM_WORKER_TOKEN="<YOUR_RAILWAY_AR_WORKER_TOKEN>"
  ```
- *(Optional)* If you see turntable/background geometry, you can export a crop fraction:
  ```bash
  export MENUVIUM_AR_CROP="0.85"
  ```
- Run the production script:
  ```bash
  ./run-prod.sh
  ```

> Note: `run-prod.sh` uses `caffeinate` to prevent your Mac from sleeping during long renders. To stop the worker, press `Ctrl+C` in the terminal where it’s running.

## Notes

- This worker polls for jobs (`/ar-jobs/claim`) and processes one at a time.
- Output keys are stored under `items/ar/<item_id>/...` in your upload bucket (or local uploads when `LOCAL_UPLOADS=1`).
- Photogrammetry runs with automatic fallbacks: it tries a high-quality config first, then retries with safer settings (and potentially lower detail) if Object Capture returns `processError`.
- For best photorealism, capture matters more than compute:
  - Use 1080p+ (ideally 4K), slow rotation, minimal motion blur.
  - Even lighting, avoid harsh shadows + reflections, keep the dish centered.
  - Prefer a clean background and avoid hands/objects entering the frame.
