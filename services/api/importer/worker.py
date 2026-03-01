"""
Background worker for menu importer jobs.

Runs as a background thread inside the FastAPI process.
Polls the database every 5 seconds for QUEUED jobs and processes them
through the dish-first pipeline.
"""

import asyncio
import json
import threading
import time
import traceback
from datetime import datetime
from urllib.parse import urlparse

from sqlmodel import Session, select

from database import get_engine
from models import ImportJob

from importer.website_resolver import resolve_website
from importer.menu_extractor import extract_menu, enrich_items_with_ai
from importer.image_collector import find_dish_image, _html_cache
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
    """Execute the dish-first import pipeline for a single job."""
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

    # Clear HTML cache between jobs
    _html_cache.clear()

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
            current_step="Extracting menu",
            metadata_json={"website_url": website_url},
        )

        # ---- Step 2: Extract menu text (10 → 35%) ----
        _log_and_update(job_id, "Extracting menu data...", 10, "Extracting menu")

        parsed_menu = await extract_menu(website_url, log_fn=log)
        total_items = sum(len(c.items) for c in parsed_menu.categories)
        log(f"Menu extraction complete: {len(parsed_menu.categories)} categories, {total_items} items")

        # ---- GATE: If no items found, fail ----
        if total_items == 0:
            _log_and_update(
                job_id,
                "❌ No menu items found. Cannot proceed without menu data.",
                35,
                "Failed — no menu items",
            )
            _update_job(
                job_id,
                status="FAILED",
                error_message="No menu items could be extracted from the website. "
                              "Try providing a direct URL to the menu page.",
                finished_at=datetime.utcnow(),
                metadata_json={
                    "website_url": website_url,
                    "menu_source_urls": parsed_menu.source_urls,
                    "categories_count": 0,
                    "items_count": 0,
                },
            )
            return

        _update_job(
            job_id,
            progress=35,
            current_step="Enriching with AI",
            metadata_json={
                "website_url": website_url,
                "menu_source_urls": parsed_menu.source_urls,
                "categories_count": len(parsed_menu.categories),
                "items_count": total_items,
            },
        )

        # ---- Step 3: AI-enrich items (35 → 45%) ----
        _log_and_update(job_id, "Enriching items with AI (descriptions, tags, allergens)...", 35, "AI enrichment")

        parsed_menu = await enrich_items_with_ai(parsed_menu, log_fn=log)
        _update_job(job_id, progress=45, current_step="Finding dish images")

        # ---- Step 4: Per-dish image search (45 → 80%) ----
        _log_and_update(job_id, "Finding images for each dish...", 45, "Finding dish images")

        # Build list of pages to scan for images (website + menu source pages)
        parsed_base = urlparse(website_url)
        base_origin = f"{parsed_base.scheme}://{parsed_base.netloc}"
        page_urls = [website_url]
        for src_url in parsed_menu.source_urls:
            if src_url not in page_urls:
                page_urls.append(src_url)
        # Also add homepage if different
        if base_origin not in page_urls and base_origin + "/" not in page_urls:
            page_urls.append(base_origin)

        all_items = [(cat, item) for cat in parsed_menu.categories for item in cat.items]
        seen_hashes: set[str] = set()
        images_found = 0
        images_data: list[dict] = []  # {filename, data}

        for i, (cat, item) in enumerate(all_items):
            img_result = await find_dish_image(
                dish_name=item.name,
                website_url=website_url,
                restaurant_name=restaurant_name,
                page_urls=page_urls,
                seen_hashes=seen_hashes,
                log_fn=log,
            )

            if img_result:
                fname = f"dish_{i + 1:03d}{img_result['ext']}"
                item.image_filename = fname
                images_data.append({"filename": fname, "data": img_result["data"]})
                images_found += 1
                source = img_result.get("source", "unknown")
                log(f"Found image for '{item.name}' ({source}): {fname}")
            else:
                log(f"No image found for '{item.name}'")

            # Update progress proportionally
            pct = 45 + int(35 * (i + 1) / max(len(all_items), 1))
            _update_job(job_id, progress=min(pct, 80))

        log(f"Image search complete: {images_found}/{total_items} dishes have images")

        # ---- Step 5: Enhance images (80 → 90%) ----
        _log_and_update(job_id, "Enhancing images...", 80, "Enhancing images")

        enhanced_images: list[dict] = []
        for i, img in enumerate(images_data):
            try:
                enhanced_data = await enhance_image(img["data"], img["filename"], log_fn=log)
                # Convert to webp filename
                base_name = img["filename"].rsplit(".", 1)[0]
                webp_fname = f"{base_name}.webp"
                enhanced_images.append({"filename": webp_fname, "data": enhanced_data})

                # Update the item's filename to webp
                for cat in parsed_menu.categories:
                    for item in cat.items:
                        if item.image_filename == img["filename"]:
                            item.image_filename = webp_fname
                            break
            except Exception as e:
                log(f"Failed to enhance {img['filename']}: {e}")
                # Keep original
                enhanced_images.append(img)

            pct = 80 + int(10 * (i + 1) / max(len(images_data), 1))
            _update_job(job_id, progress=min(pct, 90))

        log(f"Enhanced {len(enhanced_images)} images")

        # ---- Step 6: Build manifest (90 → 93%) ----
        _log_and_update(job_id, "Building manifest.json...", 90, "Building manifest")

        manifest_json = build_manifest(restaurant_name, parsed_menu)
        log("Manifest built successfully")

        # ---- Step 7: Create zip (93 → 96%) ----
        _log_and_update(job_id, "Creating zip archive...", 93, "Creating zip")

        zip_data = create_zip(restaurant_name, manifest_json, enhanced_images)
        log(f"Zip created: {len(zip_data)} bytes")

        # ---- Step 8: Store zip (96 → 100%) ----
        _log_and_update(job_id, "Storing zip...", 96, "Storing result")

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
                "images_count": images_found,
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
