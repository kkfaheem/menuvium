import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool
import uuid

from main import app
from database import get_session
from dependencies import get_current_user
from models import Organization


@pytest.fixture(name="session")
def session_fixture():
    """Create an in-memory SQLite database for testing."""
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
    """Create a test client with the test database session."""
    def get_session_override():
        return session

    # Mock auth to return a test user
    def mock_get_current_user():
        return {"sub": "test-user"}

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_current_user] = mock_get_current_user
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


def test_create_organization(client: TestClient):
    response = client.post(
        "/organizations/", 
        json={"name": "Test Kitchen", "slug": "test-kitchen", "owner_id": "ignored"},
        headers={"Authorization": "Bearer mocktoken"}
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["name"] == "Test Kitchen"
    assert data["slug"] == "test-kitchen"
    assert "id" in data


def test_list_organizations(client: TestClient):
    response = client.get(
        "/organizations/",
        headers={"Authorization": "Bearer mocktoken"}
    )
    assert response.status_code == 200, response.text
