from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool
import pytest
from main import app
from database import get_session
from dependencies import get_current_user
# Import models to ensure they're registered with SQLModel.metadata
from models import Organization

# Setup in-memory DB for tests
engine = create_engine(
    "sqlite://", 
    connect_args={"check_same_thread": False}, 
    poolclass=StaticPool
)
SQLModel.metadata.create_all(engine)

def get_session_override():
    with Session(engine) as session:
        yield session

app.dependency_overrides[get_session] = get_session_override
app.dependency_overrides[get_current_user] = lambda: {"sub": "test-user"}

@pytest.fixture(name="session")  
def session_fixture():  
    engine = create_engine(
        "sqlite://", 
        connect_args={"check_same_thread": False}, 
        poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session

client = TestClient(app)

def test_create_organization():
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

def test_list_organizations():
    response = client.get(
        "/organizations/",
        headers={"Authorization": "Bearer mocktoken"}
    )
    assert response.status_code == 200, response.text
