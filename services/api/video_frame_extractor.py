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
    used_normalized_video: bool = False


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


def _format_process_failure(*, label: str, completed: subprocess.CompletedProcess[str]) -> RuntimeError:
    output = (completed.stderr or completed.stdout or "").strip()
    exit_detail = (
        f"terminated by signal {abs(completed.returncode)}"
        if completed.returncode < 0
        else f"exit code {completed.returncode}"
    )
    if output:
        message = f"{label} failed ({exit_detail}): {output}"
    else:
        message = f"{label} failed ({exit_detail})"
    if completed.returncode == -9:
        message += " The process was SIGKILLed, which usually means the container ran out of memory."
    return RuntimeError(message)


def _run_command(*, command: list[str], label: str) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        raise _format_process_failure(label=label, completed=completed)
    return completed


def _ffmpeg_threads() -> int:
    return max(_env_int("AR_VIDEO_FFMPEG_THREADS", 1), 1)


def _normalized_max_dimension() -> int:
    return max(_env_int("AR_VIDEO_NORMALIZE_MAX_DIMENSION", 1920), 720)


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
    completed = _run_command(command=command, label="ffprobe inspection")

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


def _desired_frame_count(*, duration_seconds: float) -> int:
    target_fps = max(_env_float("AR_VIDEO_FRAME_EXTRACTION_FPS", 6.0), 1.0)
    min_frames = max(_env_int("AR_VIDEO_FRAME_MINIMUM_FRAMES", 48), MINIMUM_KIRI_IMAGE_COUNT)
    max_frames = max(_env_int("AR_VIDEO_FRAME_MAXIMUM_FRAMES", 120), min_frames)
    return min(
        max(int(math.ceil(duration_seconds * target_fps)), min_frames),
        max_frames,
    )


def _extract_frames_with_ffmpeg(
    *,
    ffmpeg_path: str,
    video_path: Path,
    output_dir: Path,
    desired_frame_count: int,
    duration_seconds: float,
) -> list[Path]:
    jpeg_quality = min(max(_env_int("AR_VIDEO_FRAME_JPEG_QUALITY", 2), 1), 31)
    effective_fps = desired_frame_count / duration_seconds
    threads = _ffmpeg_threads()

    output_dir.mkdir(parents=True, exist_ok=True)
    output_pattern = output_dir / "frame-%04d.jpg"
    command = [
        ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-threads",
        str(threads),
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
    _run_command(command=command, label="ffmpeg frame extraction")

    frame_paths = sorted(output_dir.glob("frame-*.jpg"))
    if len(frame_paths) < MINIMUM_KIRI_IMAGE_COUNT:
        raise RuntimeError(
            f"Only {len(frame_paths)} usable frames were extracted from the uploaded video; "
            f"at least {MINIMUM_KIRI_IMAGE_COUNT} are required"
        )
    return frame_paths


def _normalize_video_for_frame_extraction(
    *,
    ffmpeg_path: str,
    source_video_path: Path,
    normalized_video_path: Path,
) -> Path:
    threads = _ffmpeg_threads()
    max_dimension = _normalized_max_dimension()
    normalized_video_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-threads",
        str(threads),
        "-i",
        str(source_video_path),
        "-map",
        "0:v:0",
        "-an",
        "-sn",
        "-dn",
        "-vf",
        (
            f"scale=w=min(iw\\,{max_dimension}):"
            f"h=min(ih\\,{max_dimension}):"
            "force_original_aspect_ratio=decrease:"
            "force_divisible_by=2"
        ),
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-preset",
        os.getenv("AR_VIDEO_NORMALIZE_PRESET", "ultrafast"),
        "-crf",
        os.getenv("AR_VIDEO_NORMALIZE_CRF", "18"),
        "-movflags",
        "+faststart",
        str(normalized_video_path),
    ]
    _run_command(command=command, label="ffmpeg video normalization")
    return normalized_video_path


def extract_video_frames_to_images(*, video_path: Path, output_dir: Path) -> ExtractedVideoFrames:
    ffmpeg = _require_binary("ffmpeg")
    ffprobe = _require_binary("ffprobe")

    probe = probe_video(video_path=video_path, ffprobe_path=ffprobe)
    desired_frame_count = _desired_frame_count(duration_seconds=probe.duration_seconds)
    normalize_before_extraction = max(probe.width, probe.height) > _normalized_max_dimension()

    try:
        if normalize_before_extraction:
            raise RuntimeError(
                f"Source video is {probe.width}x{probe.height}; normalizing before extraction"
            )
        frame_paths = _extract_frames_with_ffmpeg(
            ffmpeg_path=ffmpeg,
            video_path=video_path,
            output_dir=output_dir,
            desired_frame_count=desired_frame_count,
            duration_seconds=probe.duration_seconds,
        )
        used_normalized_video = False
    except RuntimeError as direct_error:
        normalized_video_path = output_dir.parent / "normalized-input.mp4"
        if output_dir.exists():
            shutil.rmtree(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        try:
            normalized_video = _normalize_video_for_frame_extraction(
                ffmpeg_path=ffmpeg,
                source_video_path=video_path,
                normalized_video_path=normalized_video_path,
            )
            frame_paths = _extract_frames_with_ffmpeg(
                ffmpeg_path=ffmpeg,
                video_path=normalized_video,
                output_dir=output_dir,
                desired_frame_count=desired_frame_count,
                duration_seconds=probe.duration_seconds,
            )
            used_normalized_video = True
        except RuntimeError as normalized_error:
            raise RuntimeError(
                "Video frame extraction failed. "
                f"Direct extraction error: {direct_error}. "
                f"Normalized retry error: {normalized_error}"
            ) from normalized_error

    return ExtractedVideoFrames(
        probe=probe,
        desired_frame_count=desired_frame_count,
        frame_paths=frame_paths,
        used_normalized_video=used_normalized_video,
    )
