"""
Background worker for menu importer jobs.

Runs as a background thread inside the FastAPI process.
Polls the database every 5 seconds for QUEUED jobs and processes them
through the full pipeline.
"""

import asyncio
import json
import threading
import time
import traceback
from datetime import datetime

from sqlmodel import Session, select

from database import get_engine
from models import ImportJob

from importer.website_resolver import resolve_website
from importer.menu_extractor import extract_menu
from importer.image_collector import collect_images
from importer.image_enhancer import enhance_image
from importer.manifest_builder import build_manifest
from importer.zipper import create_zip, store_zip
from importer.utils import slugify


POLL_INTERVAL = 5  # seconds


def start_worker():
    """Start the background worker thread. Call once from FastAPI lifespan."""
    thread = threading.Thread(target=_worker_loop, daemon=True, name="menu-importer-worker")
    thread.start()
    print("[menu-importer] Background worker started")
    return thread


def _worker_loop():
    """Main worker loop: poll for QUEUED jobs and process them."""
    # Create a new event loop for this thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    while True:
        try:
            job = _pick_next_job()
            if job:
                print(f"[menu-importer] Processing job {job.id}: {job.restaurant_name}")
                loop.run_until_complete(_process_job(job.id))
            else:
                time.sleep(POLL_INTERVAL)
        except Exception as e:
            print(f"[menu-importer] Worker error: {e}")
            traceback.print_exc()
            time.sleep(POLL_INTERVAL)


def _pick_next_job():
    """Atomically pick the oldest QUEUED job and set it to RUNNING."""
    engine = get_engine()
    with Session(engine) as session:
        job = session.exec(
            select(ImportJob)
            .where(ImportJob.status == "QUEUED")
            .order_by(ImportJob.created_at.asc())
            .limit(1)
        ).first()

        if job:
            job.status = "RUNNING"
            job.started_at = datetime.utcnow()
            job.updated_at = datetime.utcnow()
            session.add(job)
            session.commit()
            session.refresh(job)
        return job


def _update_job(job_id, **kwargs):
    """Update job fields in the database."""
    engine = get_engine()
    with Session(engine) as session:
        job = session.get(ImportJob, job_id)
        if not job:
            return
        for key, value in kwargs.items():
            setattr(job, key, value)
        job.updated_at = datetime.utcnow()
        session.add(job)
        session.commit()


def _append_log(job_id, message: str):
    """Append a log entry to the job's logs field."""
    engine = get_engine()
    with Session(engine) as session:
        job = session.get(ImportJob, job_id)
        if not job:
            return
        try:
            logs = json.loads(job.logs or "[]")
        except (json.JSONDecodeError, TypeError):
            logs = []
        logs.append({
            "time": datetime.utcnow().isoformat(),
            "message": message,
        })
        job.logs = json.dumps(logs)
        job.updated_at = datetime.utcnow()
        session.add(job)
        session.commit()


def _log_and_update(job_id, message: str, progress: int, current_step: str):
    """Log a message and update job progress/step."""
    _append_log(job_id, message)
    _update_job(job_id, progress=progress, current_step=current_step)


async def _process_job(job_id):
    """Execute the full import pipeline for a single job."""
    engine = get_engine()

    # Load job data
    with Session(engine) as session:
        job = session.get(ImportJob, job_id)
        if not job:
            return
        restaurant_name = job.restaurant_name
        location_hint = job.location_hint
        website_override = job.website_override

    def log(msg):
        _append_log(job_id, msg)

    try:
        # ---- Step 1: Resolve website (0 → 10%) ----
        _log_and_update(job_id, "Resolving restaurant website...", 0, "Resolving website")

        website_url = await resolve_website(
            restaurant_name, location_hint, website_override
        )

        if not website_url:
            _log_and_update(
                job_id,
                "Could not resolve restaurant website. Please provide a website URL override.",
                5,
                "Needs website URL",
            )
            _update_job(
                job_id,
                status="NEEDS_INPUT",
                error_message="Website not resolved. Provide a URL override and retry.",
            )
            return

        log(f"Website resolved: {website_url}")
        _update_job(
            job_id,
            progress=10,
            current_step="Discovering menu sources",
            metadata_json={"website_url": website_url},
        )

        # ---- Step 2–3: Discover and extract menu (10 → 40%) ----
        _log_and_update(job_id, "Extracting menu data...", 15, "Extracting menu")

        parsed_menu = await extract_menu(website_url, log_fn=log)
        total_items = sum(len(c.items) for c in parsed_menu.categories)
        log(f"Menu extraction complete: {len(parsed_menu.categories)} categories, {total_items} items")

        _update_job(
            job_id,
            progress=40,
            current_step="Discovering images",
            metadata_json={
                "website_url": website_url,
                "menu_source_urls": parsed_menu.source_urls,
                "categories_count": len(parsed_menu.categories),
                "items_count": total_items,
            },
        )

        # ---- Step 4–5: Discover and download images (40 → 70%) ----
        _log_and_update(job_id, "Collecting dish images...", 45, "Collecting images")

        raw_images = await collect_images(
            website_url, restaurant_name, max_images=30, log_fn=log
        )
        log(f"Downloaded {len(raw_images)} images")
        _update_job(job_id, progress=60, current_step="Enhancing images")

        # ---- Step 6: Enhance images (70 → 85%) ----
        _log_and_update(job_id, "Enhancing images...", 70, "Enhancing images")

        enhanced_images = []
        for i, img in enumerate(raw_images):
            try:
                enhanced_data = await enhance_image(img["data"], img["filename"], log_fn=log)
                # Rename to sequential webp
                fname = f"dish_{i + 1:03d}.webp"
                enhanced_images.append({
                    "filename": fname,
                    "data": enhanced_data,
                })
            except Exception as e:
                log(f"Failed to enhance {img['filename']}: {e}")

            # Update progress proportionally
            pct = 70 + int(15 * (i + 1) / max(len(raw_images), 1))
            _update_job(job_id, progress=min(pct, 85))

        log(f"Enhanced {len(enhanced_images)} images")

        # ---- Step 7: Build manifest (85 → 90%) ----
        _log_and_update(job_id, "Building manifest.json...", 85, "Building manifest")

        image_filenames = [img["filename"] for img in enhanced_images]
        manifest_json = build_manifest(
            restaurant_name, parsed_menu, image_filenames
        )
        log("Manifest built successfully")

        # ---- Step 8: Create zip (90 → 95%) ----
        _log_and_update(job_id, "Creating zip archive...", 90, "Creating zip")

        zip_data = create_zip(restaurant_name, manifest_json, enhanced_images)
        log(f"Zip created: {len(zip_data)} bytes")

        # ---- Step 9: Store zip (95 → 100%) ----
        _log_and_update(job_id, "Storing zip...", 95, "Storing result")

        storage_key = store_zip(zip_data, str(job_id), restaurant_name)
        log(f"Zip stored: {storage_key}")

        # ---- Done ----
        _update_job(
            job_id,
            status="COMPLETED",
            progress=100,
            current_step="Done",
            result_zip_key=storage_key,
            finished_at=datetime.utcnow(),
            metadata_json={
                "website_url": website_url,
                "menu_source_urls": parsed_menu.source_urls,
                "categories_count": len(parsed_menu.categories),
                "items_count": total_items,
                "images_count": len(enhanced_images),
                "zip_size_bytes": len(zip_data),
            },
        )
        _append_log(job_id, "✅ Job completed successfully!")

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        log(f"❌ Job failed: {error_msg}")
        _update_job(
            job_id,
            status="FAILED",
            error_message=error_msg,
            finished_at=datetime.utcnow(),
        )
        traceback.print_exc()
