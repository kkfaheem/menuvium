import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])


def get_cognito_client():
    import boto3
    return boto3.client(
        "cognito-idp",
        region_name=os.getenv("AWS_REGION", "us-east-1")
    )


class CheckLinkResponse(BaseModel):
    needs_link: bool
    provider: str | None = None
    existing_email: str | None = None


class LinkAccountsResponse(BaseModel):
    ok: bool
    detail: str = ""


@router.get("/check-link", response_model=CheckLinkResponse)
def check_link(user: dict = Depends(get_current_user)):
    """
    Check if the current user is a federated (Google) identity whose email
    already belongs to an existing Cognito user-pool account.
    """
    email = (user.get("email") or "").strip().lower()
    sub = user.get("sub", "")

    if not email:
        return CheckLinkResponse(needs_link=False)

    user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
    if not user_pool_id:
        return CheckLinkResponse(needs_link=False)

    client = get_cognito_client()

    try:
        response = client.list_users(
            UserPoolId=user_pool_id,
            Filter=f'email = "{email}"',
            Limit=10
        )
    except Exception as e:
        print(f"DEBUG: check_link list_users error: {e}")
        return CheckLinkResponse(needs_link=False)

    users = response.get("Users", [])

    # Find users with the same email that aren't the current federated user
    other_accounts = [
        u for u in users
        if u["Username"] != sub and not u["Username"].startswith("Google_")
    ]

    if not other_accounts:
        return CheckLinkResponse(needs_link=False)

    # There's an existing email/password account
    existing = other_accounts[0]
    existing_email_attr = next(
        (a["Value"] for a in existing.get("Attributes", []) if a["Name"] == "email"),
        email
    )

    return CheckLinkResponse(
        needs_link=True,
        provider="Google",
        existing_email=existing_email_attr
    )


@router.post("/link-accounts", response_model=LinkAccountsResponse)
def link_accounts(user: dict = Depends(get_current_user)):
    """
    Link the current federated user (Google) to an existing email/password
    account in the same user pool.
    """
    email = (user.get("email") or "").strip().lower()
    sub = user.get("sub", "")

    if not email or not sub:
        raise HTTPException(status_code=400, detail="Missing user info")

    user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
    if not user_pool_id:
        raise HTTPException(status_code=500, detail="COGNITO_USER_POOL_ID not configured")

    client = get_cognito_client()

    # 1. Find the existing email/password account
    try:
        response = client.list_users(
            UserPoolId=user_pool_id,
            Filter=f'email = "{email}"',
            Limit=10
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list users: {e}")

    users = response.get("Users", [])
    existing = next(
        (u for u in users if u["Username"] != sub and not u["Username"].startswith("Google_")),
        None
    )

    if not existing:
        raise HTTPException(status_code=404, detail="No existing account found to link")

    # 2. Link the Google identity to the existing account
    # The federated username is typically "Google_<google-user-id>"
    # We need to extract the provider user ID
    try:
        # Find the current user's Google entry to get provider details
        federated_user = next(
            (u for u in users if u["Username"] == sub or u["Username"].startswith("Google_")),
            None
        )

        if not federated_user:
            raise HTTPException(status_code=404, detail="Current federated user not found")

        # Extract provider user ID from the username (e.g. "Google_123456789")
        fed_username = federated_user["Username"]
        if "_" in fed_username:
            provider_name = fed_username.split("_")[0]
            provider_user_id = fed_username.split("_", 1)[1]
        else:
            raise HTTPException(status_code=400, detail="Cannot determine provider from username")

        client.admin_link_provider_for_user(
            UserPoolId=user_pool_id,
            DestinationUser={
                "ProviderName": "Cognito",
                "ProviderAttributeValue": existing["Username"]
            },
            SourceUser={
                "ProviderName": provider_name,
                "ProviderAttributeName": "Cognito_Subject",
                "ProviderAttributeValue": provider_user_id
            }
        )

        print(f"DEBUG: Linked {fed_username} -> {existing['Username']} ({email})")
        return LinkAccountsResponse(ok=True, detail=f"Accounts linked successfully for {email}")

    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: link_accounts error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to link accounts: {e}")
