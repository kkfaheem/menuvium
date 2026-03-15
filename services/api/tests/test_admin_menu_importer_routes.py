import types
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

import routers.menu_importer as menu_importer_routes
from database import get_session
from dependencies import get_current_user
from main import app
from models import ImportJob, Organization


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
def client_fixture(session: Session, monkeypatch: pytest.MonkeyPatch):
    def get_session_override():
        return session

    def mock_get_current_user():
        return {"sub": "admin-user-sub", "email": "admin@example.com"}

    monkeypatch.setenv("ADMIN_EMAILS", "admin@example.com")
    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_current_user] = mock_get_current_user
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture(name="test_org")
def test_org_fixture(session: Session):
    org = Organization(
        id=uuid.uuid4(),
        name="Importer Test Org",
        slug="importer-test-org",
        owner_id="admin-user-sub",
    )
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


def test_import_processed_job_rejects_zero_items(
    client: TestClient,
    session: Session,
    test_org: Organization,
    monkeypatch: pytest.MonkeyPatch,
):
    job = ImportJob(
        id=uuid.uuid4(),
        restaurant_name="Zero Item Cafe",
        status="COMPLETED",
        progress=100,
        current_step="Completed",
        result_zip_key="imports/test-job/output/zero-item-cafe.zip",
        metadata_json={"items_count": 0, "categories_count": 0},
        created_by="admin-user-sub",
    )
    session.add(job)
    session.commit()

    def fail_get_zip_data(_storage_key: str):
        raise AssertionError("get_zip_data should not be called for zero-item jobs")

    monkeypatch.setattr(menu_importer_routes, "get_zip_data", fail_get_zip_data)

    response = client.post(
        f"/admin/menu-importer/jobs/{job.id}/import",
        json={"org_id": str(test_org.id)},
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Processed result has no parsed items and cannot be used to create a menu"


def test_import_processed_job_allows_completed_job_without_items_metadata(
    client: TestClient,
    session: Session,
    test_org: Organization,
    monkeypatch: pytest.MonkeyPatch,
):
    job = ImportJob(
        id=uuid.uuid4(),
        restaurant_name="Imported Bistro",
        status="COMPLETED",
        progress=100,
        current_step="Completed",
        result_zip_key="imports/test-job/output/imported-bistro.zip",
        metadata_json={"categories_count": 3},
        created_by="admin-user-sub",
    )
    session.add(job)
    session.commit()

    monkeypatch.setattr(menu_importer_routes, "get_zip_data", lambda _storage_key: b"zip-bytes")

    def fake_import_menu_from_zip_bytes(*, menu, zip_bytes, session, public_prefix):
        assert zip_bytes == b"zip-bytes"
        session.add(menu)
        session.commit()
        session.refresh(menu)
        return types.SimpleNamespace(
            categories_created=3,
            items_created=7,
            photos_imported=5,
            tags_created=2,
            allergens_created=1,
        )

    monkeypatch.setattr(menu_importer_routes, "import_menu_from_zip_bytes", fake_import_menu_from_zip_bytes)

    response = client.post(
        f"/admin/menu-importer/jobs/{job.id}/import",
        json={"org_id": str(test_org.id)},
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["org_id"] == str(test_org.id)
    assert body["menu_name"] == "Imported Bistro"
    assert body["items_created"] == 7
