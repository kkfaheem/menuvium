import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, Session, create_engine, select
from sqlmodel.pool import StaticPool

import ar_worker
from ar_pipeline import (
    AR_CAPTURE_MODE_PHOTO_SCAN,
    AR_PROVIDER_KIRI,
    AR_STAGE_CONVERSION_QUEUED,
    AR_STAGE_KIRI_PROCESSING,
    AR_STAGE_QUEUED,
    CONVERSION_STATUS_QUEUED,
)
from database import get_session
from dependencies import get_current_user
from kiri_client import KiriApiError
from kiri_client import KiriSubmittedJob
from main import app
from models import ArCaptureAsset, ArConversionJob, Category, Item, Menu, Organization


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    def mock_get_current_user():
        return {"sub": "test-user", "email": "owner@example.com"}

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_current_user] = mock_get_current_user
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture(name="test_item")
def test_item_fixture(session: Session):
    org = Organization(
        id=uuid.uuid4(),
        name="KIRI Test Restaurant",
        slug="kiri-test-restaurant",
        owner_id="test-user",
    )
    menu = Menu(
        id=uuid.uuid4(),
        name="Dinner",
        slug="kiri-test-menu",
        is_active=True,
        theme="noir",
        org_id=org.id,
    )
    category = Category(
        id=uuid.uuid4(),
        name="Mains",
        rank=0,
        menu_id=menu.id,
    )
    item = Item(
        id=uuid.uuid4(),
        name="Roasted Salmon",
        description="With lemon butter",
        price=24.0,
        is_sold_out=False,
        position=0,
        category_id=category.id,
    )
    session.add(org)
    session.add(menu)
    session.add(category)
    session.add(item)
    session.commit()
    return item


def _auth_headers() -> dict[str, str]:
    return {"Authorization": "Bearer test-token"}


def test_generate_ar_model_queues_kiri_from_images(
    client: TestClient,
    session: Session,
    test_item: Item,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("KIRI_API_KEY", "kiri-test-key")

    for position in range(20):
        session.add(
            ArCaptureAsset(
                item_id=test_item.id,
                kind="image",
                position=position,
                s3_key=f"items/ar/{test_item.id}/capture/{position}.jpg",
                url=f"https://example.com/{position}.jpg",
            )
        )
    session.commit()

    response = client.post(
        f"/items/{test_item.id}/ar/generate",
        json={"capture_mode": AR_CAPTURE_MODE_PHOTO_SCAN},
        headers=_auth_headers(),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ar_status"] == "pending"
    assert payload["ar_stage"] == AR_STAGE_QUEUED

    queued_item = session.get(Item, test_item.id)
    assert queued_item is not None
    assert queued_item.ar_provider == AR_PROVIDER_KIRI
    assert queued_item.ar_capture_mode == AR_CAPTURE_MODE_PHOTO_SCAN
    assert queued_item.ar_stage == AR_STAGE_QUEUED


def test_attach_ar_video_compatibility_route_queues_kiri_generation(
    client: TestClient,
    session: Session,
    test_item: Item,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("KIRI_API_KEY", "kiri-test-key")

    response = client.post(
        f"/items/{test_item.id}/ar/video",
        json={
            "s3_key": f"items/ar/{test_item.id}/video/dish.mp4",
            "url": "https://example.com/dish.mp4",
        },
        headers=_auth_headers(),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ar_status"] == "pending"
    assert payload["ar_stage"] == AR_STAGE_QUEUED
    assert payload["ar_video_url"] == "https://example.com/dish.mp4"

    captures = session.exec(
        select(ArCaptureAsset).where(ArCaptureAsset.item_id == test_item.id)
    ).all()
    assert len(captures) == 1
    assert captures[0].kind == "video"


def test_retry_requeues_conversion_when_usdz_exists(
    client: TestClient,
    session: Session,
    test_item: Item,
):
    test_item.ar_provider = AR_PROVIDER_KIRI
    test_item.ar_capture_mode = AR_CAPTURE_MODE_PHOTO_SCAN
    test_item.ar_status = "failed"
    test_item.ar_stage = "failed"
    test_item.ar_model_usdz_s3_key = f"items/ar/{test_item.id}/model_usdz/model.usdz"
    test_item.ar_model_usdz_url = "https://example.com/model.usdz"
    session.add(test_item)
    session.commit()

    response = client.post(
        f"/items/{test_item.id}/ar/retry",
        headers=_auth_headers(),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["ar_status"] == "processing"
    assert payload["ar_stage"] == AR_STAGE_CONVERSION_QUEUED

    conversion_job = session.exec(
        select(ArConversionJob).where(ArConversionJob.item_id == test_item.id)
    ).first()
    assert conversion_job is not None
    assert conversion_job.status == CONVERSION_STATUS_QUEUED


def test_process_pending_item_uses_plain_capture_values_after_commit(
    session: Session,
    test_item: Item,
    monkeypatch: pytest.MonkeyPatch,
):
    session.add(
        ArCaptureAsset(
            item_id=test_item.id,
            kind="video",
            position=0,
            s3_key=f"items/ar/{test_item.id}/video/dish.mp4",
            url="https://example.com/dish.mp4",
        )
    )
    test_item.ar_provider = AR_PROVIDER_KIRI
    test_item.ar_capture_mode = AR_CAPTURE_MODE_PHOTO_SCAN
    test_item.ar_status = "processing"
    test_item.ar_stage = "uploading_to_kiri"
    session.add(test_item)
    session.commit()

    class FakeKiriClient:
        def submit_photo_images(self, **kwargs):
            return KiriSubmittedJob(serialize="serialize-123", calculate_type=1)

    def fake_materialize_storage_key_to_path(*, key: str, destination: Path) -> Path:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(b"video")
        return destination

    monkeypatch.setattr(ar_worker, "get_engine", lambda: session.get_bind())
    monkeypatch.setattr(ar_worker, "_kiri_client", lambda: FakeKiriClient())
    monkeypatch.setattr(
        ar_worker,
        "materialize_storage_key_to_path",
        fake_materialize_storage_key_to_path,
    )
    monkeypatch.setattr(
        ar_worker,
        "extract_video_frames_to_images",
        lambda **kwargs: SimpleNamespace(
            probe=SimpleNamespace(duration_seconds=8.0, width=1920, height=1080),
            desired_frame_count=48,
            frame_paths=[Path(f"/tmp/frame-{index:04d}.jpg") for index in range(1, 49)],
            used_normalized_video=False,
        ),
    )

    ar_worker._process_pending_item(test_item.id)

    session.expire_all()
    refreshed = session.get(Item, test_item.id)
    assert refreshed is not None
    assert refreshed.ar_status == "processing"
    assert refreshed.ar_stage == AR_STAGE_KIRI_PROCESSING
    assert refreshed.ar_metadata_json["serialize"] == "serialize-123"


def test_process_pending_video_extracts_frames_and_submits_photo_images_at_max_quality(
    session: Session,
    test_item: Item,
    monkeypatch: pytest.MonkeyPatch,
):
    session.add(
        ArCaptureAsset(
            item_id=test_item.id,
            kind="video",
            position=0,
            s3_key=f"items/ar/{test_item.id}/video/dish.mov",
            url="https://example.com/dish.mov",
        )
    )
    test_item.ar_provider = AR_PROVIDER_KIRI
    test_item.ar_capture_mode = AR_CAPTURE_MODE_PHOTO_SCAN
    test_item.ar_status = "processing"
    test_item.ar_stage = "uploading_to_kiri"
    session.add(test_item)
    session.commit()

    extracted_paths = [Path(f"/tmp/frame-{index:04d}.jpg") for index in range(1, 61)]
    captured_kwargs: dict[str, object] = {}

    class FakeKiriClient:
        def submit_photo_images(self, **kwargs):
            captured_kwargs.update(kwargs)
            return KiriSubmittedJob(serialize="serialize-from-frames", calculate_type=1)

        def submit_photo_video(self, **kwargs):
            raise AssertionError("Raw video submission should not be used for uploaded AR videos")

    def fake_materialize_storage_key_to_path(*, key: str, destination: Path) -> Path:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(b"video")
        return destination

    monkeypatch.setattr(ar_worker, "get_engine", lambda: session.get_bind())
    monkeypatch.setattr(ar_worker, "_kiri_client", lambda: FakeKiriClient())
    monkeypatch.setattr(
        ar_worker,
        "materialize_storage_key_to_path",
        fake_materialize_storage_key_to_path,
    )
    monkeypatch.setattr(
        ar_worker,
        "extract_video_frames_to_images",
        lambda **kwargs: SimpleNamespace(
            probe=SimpleNamespace(duration_seconds=12.5, width=3840, height=2160),
            desired_frame_count=75,
            frame_paths=extracted_paths,
            used_normalized_video=False,
        ),
    )

    ar_worker._process_pending_item(test_item.id)

    session.expire_all()
    refreshed = session.get(Item, test_item.id)
    assert refreshed is not None
    assert refreshed.ar_status == "processing"
    assert refreshed.ar_stage == AR_STAGE_KIRI_PROCESSING
    assert refreshed.ar_metadata_json["serialize"] == "serialize-from-frames"
    assert refreshed.ar_metadata_json["provider_input_kind"] == "images"
    assert refreshed.ar_metadata_json["video_frame_extraction"]["submitted_frame_count"] == 60
    assert list(captured_kwargs["image_paths"]) == extracted_paths
    assert captured_kwargs["file_format"] == "usdz"
    assert captured_kwargs["model_quality"] == 3
    assert captured_kwargs["texture_quality"] == 3
    assert captured_kwargs["texture_smoothing"] == 1
    assert captured_kwargs["is_mask"] == 1


def test_format_kiri_submission_error_for_video_resolution_rejection():
    message = ar_worker._format_kiri_submission_error(
        KiriApiError("The video does not meet the requirements and cannot be uploaded", code=2009),
        capture_input_kind="video",
    )

    assert "1920x1080" in message
    assert "Re-export" in message
