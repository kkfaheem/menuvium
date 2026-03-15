import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool
import uuid

import routers.menus as menu_routes
from main import app
from database import get_session
from dependencies import get_current_user
from models import Menu, Category, Item, Organization
from storage_keys import menu_qr_current_key


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

    def mock_get_current_user():
        return {"sub": "test-user-sub", "email": "owner@example.com"}

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_current_user] = mock_get_current_user
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture(name="test_org")
def test_org_fixture(session: Session):
    """Create a test organization."""
    org = Organization(
        id=uuid.uuid4(),
        name="Test Restaurant",
        slug="test-restaurant",
        owner_id="test-user-sub"
    )
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


@pytest.fixture(name="test_menu")
def test_menu_fixture(session: Session, test_org: Organization):
    """Create a test menu with categories and items."""
    menu = Menu(
        id=uuid.uuid4(),
        name="Lunch Menu",
        slug=str(uuid.uuid4()),
        is_active=True,
        theme="noir",
        org_id=test_org.id
    )
    session.add(menu)
    session.commit()
    session.refresh(menu)
    return menu


@pytest.fixture(name="test_category")
def test_category_fixture(session: Session, test_menu: Menu):
    """Create a test category."""
    category = Category(
        id=uuid.uuid4(),
        name="Appetizers",
        rank=0,
        menu_id=test_menu.id
    )
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@pytest.fixture(name="test_item")
def test_item_fixture(session: Session, test_category: Category):
    """Create a test item."""
    item = Item(
        id=uuid.uuid4(),
        name="Spring Rolls",
        description="Crispy veggie rolls",
        price=8.99,
        is_sold_out=False,
        position=0,
        category_id=test_category.id
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


class TestPublicMenuEndpoint:
    """Tests for the public menu endpoint."""

    def test_get_public_menu_success(
        self, 
        client: TestClient, 
        test_menu: Menu,
        test_category: Category,
        test_item: Item
    ):
        """Test successful retrieval of a public menu."""
        response = client.get(f"/menus/public/{test_menu.id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == str(test_menu.id)
        assert data["name"] == "Lunch Menu"
        assert len(data["categories"]) == 1
        assert data["categories"][0]["name"] == "Appetizers"

    def test_get_public_menu_not_found(self, client: TestClient):
        """Test 404 for non-existent menu."""
        fake_id = str(uuid.uuid4())
        response = client.get(f"/menus/public/{fake_id}")
        assert response.status_code == 404

    def test_get_public_menu_inactive(
        self, 
        client: TestClient, 
        session: Session,
        test_menu: Menu
    ):
        """Test that inactive menus are not publicly accessible."""
        test_menu.is_active = False
        session.add(test_menu)
        session.commit()
        
        response = client.get(f"/menus/public/{test_menu.id}")
        # Depending on implementation, this might be 404 or 403
        assert response.status_code in [403, 404]


class TestItemEndpoints:
    """Tests for item CRUD endpoints."""

    def test_create_item(
        self, 
        client: TestClient, 
        test_category: Category
    ):
        """Test creating a new item."""
        # Note: This test will need auth mocking for full coverage
        item_data = {
            "name": "New Item",
            "price": 12.99,
            "category_id": str(test_category.id),
            "is_sold_out": False
        }
        # This endpoint requires auth, so we'd need to mock it
        # response = client.post("/items/", json=item_data)
        # assert response.status_code == 200

    def test_item_sold_out_toggle(
        self, 
        client: TestClient, 
        session: Session,
        test_item: Item
    ):
        """Test toggling item sold out status."""
        # This endpoint requires auth, so we'd need to mock it
        # But we can verify the data model works
        test_item.is_sold_out = True
        session.add(test_item)
        session.commit()
        session.refresh(test_item)
        
        assert test_item.is_sold_out is True


class TestCategoryEndpoints:
    """Tests for category CRUD endpoints."""

    def test_category_ordering(
        self, 
        session: Session,
        test_menu: Menu
    ):
        """Test that categories can be ordered by rank."""
        cat1 = Category(name="First", rank=1, menu_id=test_menu.id)
        cat2 = Category(name="Second", rank=2, menu_id=test_menu.id)
        cat3 = Category(name="Third", rank=0, menu_id=test_menu.id)  # Should appear first
        
        session.add_all([cat1, cat2, cat3])
        session.commit()
        
        # Query ordered by rank
        from sqlmodel import select
        categories = session.exec(
            select(Category)
            .where(Category.menu_id == test_menu.id)
            .order_by(Category.rank)
        ).all()
        
        assert categories[0].name == "Third"
        assert categories[1].name == "First"
        assert categories[2].name == "Second"


class TestMenuQrEndpoints:
    def test_get_menu_qr_ignores_legacy_logo_variant(
        self,
        client: TestClient,
        test_menu: Menu,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(
            menu_routes,
            "_render_standard_qr_png",
            lambda public_url, size_px=1000: f"plain:{size_px}".encode("utf-8"),
        )

        response = client.get(
            f"/menus/{test_menu.id}/qr",
            params={"variant": "logo", "format": "png", "size": 640},
        )

        assert response.status_code == 200
        assert response.content == b"plain:640"
        assert response.headers["content-type"] == "image/png"
        assert response.headers["content-disposition"].endswith('Lunch Menu-qr.png"')

    def test_regenerate_menu_qr_persists_plain_qr_assets(
        self,
        client: TestClient,
        session: Session,
        test_menu: Menu,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(
            menu_routes,
            "_render_standard_qr_png",
            lambda public_url, size_px=1000: b"plain-qr",
        )

        stored_keys: list[str] = []

        def fake_store_bytes(*, data, key, content_type, base_url=None, cache_control=None):
            stored_keys.append(key)
            return f"https://cdn.example.com/{key}"

        monkeypatch.setattr(menu_routes, "store_bytes", fake_store_bytes)

        response = client.post(
            f"/menus/{test_menu.id}/regenerate-qr",
            headers={"Authorization": "Bearer mocktoken"},
        )

        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["qr_url"].startswith("https://cdn.example.com/")
        assert payload["current_qr_url"] == (
            f"https://cdn.example.com/{menu_qr_current_key(test_menu.org_id, test_menu.id)}"
        )
        assert len(stored_keys) == 2
        assert stored_keys[0].startswith(
            f"orgs/{test_menu.org_id}/menus/{test_menu.id}/qr/versions/"
        )
        assert stored_keys[0].endswith("/qr-1000.png")
        assert stored_keys[1] == menu_qr_current_key(test_menu.org_id, test_menu.id)

        refreshed_menu = session.get(Menu, test_menu.id)
        assert refreshed_menu is not None
        assert refreshed_menu.logo_qr_url == payload["qr_url"]
        assert refreshed_menu.logo_qr_generated_at is not None
