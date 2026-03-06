import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool
import hashlib
from datetime import datetime, timedelta
from typing import Optional

from main import app
from database import get_session
from dependencies import get_current_user
from models import Organization, OrganizationMember, OrganizationOwnershipTransfer
import routers.organizations as organizations_router


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


def test_list_organizations_matches_member_email_case_insensitive(session: Session):
    def get_session_override():
        return session

    def mock_get_current_user():
        return {"sub": "member-user", "email": "Test.User@Example.com"}

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_current_user] = mock_get_current_user
    client = TestClient(app)

    org = Organization(name="Owned by someone else", slug="other-org", owner_id="other-user")
    session.add(org)
    session.commit()
    session.refresh(org)

    session.add(
        OrganizationMember(
            org_id=org.id,
            email="test.user@example.com",
            can_manage_availability=False,
            can_edit_items=False,
            can_manage_menus=True,
            can_manage_users=False,
        )
    )
    session.commit()

    res = client.get("/organizations/", headers={"Authorization": "Bearer mocktoken"})
    assert res.status_code == 200, res.text
    data = res.json()
    assert any(o["id"] == str(org.id) for o in data)

    app.dependency_overrides.clear()


def test_request_ownership_transfer_sends_email_to_member(
    client: TestClient,
    session: Session,
    monkeypatch: pytest.MonkeyPatch,
):
    def owner_user_override():
        return {"sub": "owner-sub", "email": "owner@example.com"}

    app.dependency_overrides[get_current_user] = owner_user_override

    org = Organization(name="Transfer Org", slug="transfer-org", owner_id="owner-sub")
    session.add(org)
    session.commit()
    session.refresh(org)

    member = OrganizationMember(
        org_id=org.id,
        email="new.owner@example.com",
        can_manage_availability=True,
        can_edit_items=True,
        can_manage_menus=True,
        can_manage_users=False,
    )
    session.add(member)
    session.commit()
    session.refresh(member)

    sent = {}

    def fake_send_email(*, to_email: str, subject: str, text_body: str, html_body: Optional[str] = None):
        sent["to_email"] = to_email
        sent["subject"] = subject
        sent["text_body"] = text_body
        sent["html_body"] = html_body

    monkeypatch.setattr(organizations_router, "send_email", fake_send_email)

    res = client.post(
        f"/organizations/{org.id}/ownership-transfer",
        json={"member_id": str(member.id)},
        headers={"Authorization": "Bearer mocktoken"},
    )

    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["target_member_id"] == str(member.id)
    assert payload["target_email"] == "new.owner@example.com"
    assert sent["to_email"] == "new.owner@example.com"
    assert "Confirm ownership transfer" in sent["subject"]

    transfer = session.exec(
        select(OrganizationOwnershipTransfer).where(
            OrganizationOwnershipTransfer.org_id == org.id,
            OrganizationOwnershipTransfer.target_member_id == member.id,
        )
    ).first()
    assert transfer is not None
    assert transfer.status == "pending"


def test_verify_ownership_transfer_updates_owner(client: TestClient, session: Session):
    def new_owner_override():
        return {"sub": "new-owner-sub", "email": "new.owner@example.com"}

    app.dependency_overrides[get_current_user] = new_owner_override

    org = Organization(name="Verify Org", slug="verify-org", owner_id="old-owner-sub")
    session.add(org)
    session.commit()
    session.refresh(org)

    member = OrganizationMember(
        org_id=org.id,
        email="new.owner@example.com",
        can_manage_availability=False,
        can_edit_items=False,
        can_manage_menus=False,
        can_manage_users=False,
    )
    session.add(member)
    session.commit()
    session.refresh(member)

    raw_token = "ownership-transfer-token"
    transfer = OrganizationOwnershipTransfer(
        org_id=org.id,
        requested_by_user_id="old-owner-sub",
        requested_by_email="old.owner@example.com",
        target_member_id=member.id,
        target_user_id=None,
        target_email=member.email,
        token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
        status="pending",
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    session.add(transfer)
    session.commit()
    session.refresh(transfer)

    res = client.post(
        "/organizations/ownership-transfer/verify",
        json={"token": raw_token},
        headers={"Authorization": "Bearer mocktoken"},
    )

    assert res.status_code == 200, res.text
    data = res.json()
    assert data["ok"] is True
    assert data["org_id"] == str(org.id)
    assert data["new_owner_email"] == "new.owner@example.com"

    session.refresh(org)
    session.refresh(member)
    session.refresh(transfer)

    assert org.owner_id == "new-owner-sub"
    assert member.user_id == "new-owner-sub"
    assert member.role == "owner"
    assert transfer.status == "completed"
    assert transfer.verified_at is not None

    previous_owner_member = session.exec(
        select(OrganizationMember).where(
            OrganizationMember.org_id == org.id,
            OrganizationMember.user_id == "old-owner-sub",
            OrganizationMember.id != member.id,
        )
    ).first()
    assert previous_owner_member is not None
    assert previous_owner_member.role == "member"


def test_verify_ownership_transfer_rejects_wrong_user(client: TestClient, session: Session):
    def wrong_user_override():
        return {"sub": "wrong-user-sub", "email": "wrong.user@example.com"}

    app.dependency_overrides[get_current_user] = wrong_user_override

    org = Organization(name="Wrong User Org", slug="wrong-user-org", owner_id="old-owner-sub-2")
    session.add(org)
    session.commit()
    session.refresh(org)

    member = OrganizationMember(
        org_id=org.id,
        email="intended.new.owner@example.com",
        can_manage_availability=False,
        can_edit_items=False,
        can_manage_menus=False,
        can_manage_users=False,
    )
    session.add(member)
    session.commit()
    session.refresh(member)

    raw_token = "ownership-transfer-token-2"
    transfer = OrganizationOwnershipTransfer(
        org_id=org.id,
        requested_by_user_id="old-owner-sub-2",
        requested_by_email="old.owner2@example.com",
        target_member_id=member.id,
        target_user_id=None,
        target_email=member.email,
        token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
        status="pending",
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    session.add(transfer)
    session.commit()
    session.refresh(transfer)

    res = client.post(
        "/organizations/ownership-transfer/verify",
        json={"token": raw_token},
        headers={"Authorization": "Bearer mocktoken"},
    )

    assert res.status_code == 403, res.text
    session.refresh(org)
    session.refresh(transfer)
    assert org.owner_id == "old-owner-sub-2"
    assert transfer.status == "pending"
