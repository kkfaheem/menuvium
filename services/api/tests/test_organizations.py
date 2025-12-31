from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool
import pytest
from main import app
from database import get_session
import os

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
    # Force Mock Auth
    os.environ["AUTH_MODE"] = "MOCK"
    
    response = client.post(
        "/organizations/", 
        json={"name": "Test Kitchen", "slug": "test-kitchen", "owner_id": "ignored_in_mock"},
        headers={"Authorization": "Bearer mocktoken"}
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["name"] == "Test Kitchen"
    assert data["slug"] == "test-kitchen"
    assert "id" in data

def test_create_location():
    os.environ["AUTH_MODE"] = "MOCK"
    
    # Create Org first
    org_res = client.post(
        "/organizations/", 
        json={"name": "Burger Joint", "slug": "burger-joint", "owner_id": "ignored"},
        headers={"Authorization": "Bearer mocktoken"}
    )
    org_id = org_res.json()["id"]
    
    # Create Location
    res = client.post(
        f"/organizations/{org_id}/locations",
        json={"name": "Downtown", "address": "123 Main St", "org_id": org_id},
        headers={"Authorization": "Bearer mocktoken"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["name"] == "Downtown"
    assert data["org_id"] == org_id
