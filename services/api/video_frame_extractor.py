from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path


MINIMUM_KIRI_IMAGE_COUNT = 20


@dataclass
class VideoProbe:
    duration_seconds: float
    width: int
    height: int


@dataclass
class ExtractedVideoFrames:
    probe: VideoProbe
    desired_frame_count: int
    frame_paths: list[Path]


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _require_binary(name: str) -> str:
    binary_path = shutil.which(name)
    if not binary_path:
        raise RuntimeError(f"Required binary '{name}' is not available in PATH")
    return binary_path


def probe_video(*, video_path: Path, ffprobe_path: str | None = None) -> VideoProbe:
    ffprobe = ffprobe_path or _require_binary("ffprobe")
    command = [
        ffprobe,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        "-show_format",
        str(video_path),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        stderr = (completed.stderr or completed.stdout or "").strip()
        raise RuntimeError(stderr or "ffprobe could not inspect the uploaded video")

    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("ffprobe returned invalid JSON") from exc

    streams = payload.get("streams") or []
    video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    if not isinstance(video_stream, dict):
        raise RuntimeError("No video stream was found in the uploaded file")

    width = int(video_stream.get("width") or 0)
    height = int(video_stream.get("height") or 0)

    duration_raw = (
        video_stream.get("duration")
        or (payload.get("format") or {}).get("duration")
        or 0
    )
    try:
        duration_seconds = float(duration_raw)
    except (TypeError, ValueError):
        duration_seconds = 0.0

    if duration_seconds <= 0:
        raise RuntimeError("Video duration could not be determined")
    if width <= 0 or height <= 0:
        raise RuntimeError("Video resolution could not be determined")

    return VideoProbe(
        duration_seconds=duration_seconds,
        width=width,
        height=height,
    )


def extract_video_frames_to_images(*, video_path: Path, output_dir: Path) -> ExtractedVideoFrames:
    ffmpeg = _require_binary("ffmpeg")
    ffprobe = _require_binary("ffprobe")

    probe = probe_video(video_path=video_path, ffprobe_path=ffprobe)

    target_fps = max(_env_float("AR_VIDEO_FRAME_EXTRACTION_FPS", 6.0), 1.0)
    min_frames = max(_env_int("AR_VIDEO_FRAME_MINIMUM_FRAMES", 48), MINIMUM_KIRI_IMAGE_COUNT)
    max_frames = max(_env_int("AR_VIDEO_FRAME_MAXIMUM_FRAMES", 120), min_frames)
    jpeg_quality = min(max(_env_int("AR_VIDEO_FRAME_JPEG_QUALITY", 2), 1), 31)

    desired_frame_count = min(
        max(int(math.ceil(probe.duration_seconds * target_fps)), min_frames),
        max_frames,
    )
    effective_fps = desired_frame_count / probe.duration_seconds

    output_dir.mkdir(parents=True, exist_ok=True)
    output_pattern = output_dir / "frame-%04d.jpg"
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(video_path),
        "-vf",
        f"fps={effective_fps:.6f}",
        "-frames:v",
        str(desired_frame_count),
        "-q:v",
        str(jpeg_quality),
        str(output_pattern),
    ]
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        stderr = (completed.stderr or completed.stdout or "").strip()
        raise RuntimeError(stderr or "ffmpeg could not extract frames from the uploaded video")

    frame_paths = sorted(output_dir.glob("frame-*.jpg"))
    if len(frame_paths) < MINIMUM_KIRI_IMAGE_COUNT:
        raise RuntimeError(
            f"Only {len(frame_paths)} usable frames were extracted from the uploaded video; "
            f"at least {MINIMUM_KIRI_IMAGE_COUNT} are required"
        )

    return ExtractedVideoFrames(
        probe=probe,
        desired_frame_count=desired_frame_count,
        frame_paths=frame_paths,
    )
