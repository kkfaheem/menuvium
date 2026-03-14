from pathlib import Path

import video_frame_extractor as extractor


def test_extract_video_frames_falls_back_to_normalized_video(tmp_path, monkeypatch):
    input_video = tmp_path / "input.mov"
    input_video.write_bytes(b"video")
    output_dir = tmp_path / "frames"

    monkeypatch.setattr(extractor, "_require_binary", lambda name: name)
    monkeypatch.setattr(
        extractor,
        "probe_video",
        lambda **kwargs: extractor.VideoProbe(duration_seconds=12.0, width=3840, height=2160),
    )

    def fake_extract_frames_with_ffmpeg(**kwargs):
        video_path = kwargs["video_path"]
        output_dir = kwargs["output_dir"]
        if video_path == input_video:
            raise RuntimeError("ffmpeg frame extraction failed (exit code 1): direct path failed")
        output_dir.mkdir(parents=True, exist_ok=True)
        frame_paths = []
        for index in range(1, 49):
            frame_path = output_dir / f"frame-{index:04d}.jpg"
            frame_path.write_bytes(b"jpg")
            frame_paths.append(frame_path)
        return frame_paths

    monkeypatch.setattr(extractor, "_extract_frames_with_ffmpeg", fake_extract_frames_with_ffmpeg)
    monkeypatch.setattr(
        extractor,
        "_normalize_video_for_frame_extraction",
        lambda **kwargs: kwargs["normalized_video_path"],
    )

    extracted = extractor.extract_video_frames_to_images(video_path=input_video, output_dir=output_dir)

    assert extracted.used_normalized_video is True
    assert extracted.desired_frame_count == 72
    assert len(extracted.frame_paths) == 48


def test_extract_video_frames_surfaces_both_direct_and_normalized_errors(tmp_path, monkeypatch):
    input_video = tmp_path / "input.mov"
    input_video.write_bytes(b"video")
    output_dir = tmp_path / "frames"

    monkeypatch.setattr(extractor, "_require_binary", lambda name: name)
    monkeypatch.setattr(
        extractor,
        "probe_video",
        lambda **kwargs: extractor.VideoProbe(duration_seconds=10.0, width=1920, height=1080),
    )
    monkeypatch.setattr(
        extractor,
        "_extract_frames_with_ffmpeg",
        lambda **kwargs: (_ for _ in ()).throw(
            RuntimeError("ffmpeg frame extraction failed (exit code 1): bad extract")
        ),
    )
    monkeypatch.setattr(
        extractor,
        "_normalize_video_for_frame_extraction",
        lambda **kwargs: (_ for _ in ()).throw(
            RuntimeError("ffmpeg video normalization failed (exit code 1): bad normalize")
        ),
    )

    try:
        extractor.extract_video_frames_to_images(video_path=input_video, output_dir=output_dir)
    except RuntimeError as exc:
        message = str(exc)
    else:
        raise AssertionError("Expected frame extraction to fail")

    assert "Direct extraction error" in message
    assert "Normalized retry error" in message
    assert "bad extract" in message
    assert "bad normalize" in message
