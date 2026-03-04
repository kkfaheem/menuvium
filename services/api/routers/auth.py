import os
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from dependencies import get_current_user
from botocore.exceptions import ClientError

router = APIRouter(prefix="/auth", tags=["Auth"])

FEDERATED_PROVIDER_MAP = {
    "google": "Google",
    "facebook": "Facebook",
    "signinwithapple": "SignInWithApple",
    "loginwithamazon": "LoginWithAmazon",
}


def get_cognito_client():
    import boto3
    return boto3.client(
        "cognito-idp",
        region_name=os.getenv("AWS_REGION", "us-east-1")
    )


def parse_federated_username(username: str) -> tuple[str, str] | None:
    """
    Parse Cognito federated usernames like:
      - Google_12345
      - google_12345
      - SignInWithApple_abcdef
    Returns (ProviderNameForCognito, provider_subject_id) or None.
    """
    if not username or "_" not in username:
        return None

    raw_provider, provider_user_id = username.split("_", 1)
    provider_key = raw_provider.strip().lower()
    canonical_provider = FEDERATED_PROVIDER_MAP.get(provider_key)
    if not canonical_provider or not provider_user_id:
        return None

    return canonical_provider, provider_user_id


def is_federated_username(username: str) -> bool:
    return parse_federated_username(username) is not None


def is_merge_not_supported_error(error: Exception) -> bool:
    if isinstance(error, ClientError):
        err = error.response.get("Error", {})
        code = str(err.get("Code", ""))
        message = str(err.get("Message", ""))
        return (
            code == "InvalidParameterException"
            and "Merging is not currently supported" in message
        )
    return "Merging is not currently supported" in str(error)


def admin_link_provider_for_user(
    client,
    user_pool_id: str,
    destination_username: str,
    provider_name: str,
    provider_user_id: str,
):
    client.admin_link_provider_for_user(
        UserPoolId=user_pool_id,
        DestinationUser={
            "ProviderName": "Cognito",
            "ProviderAttributeValue": destination_username,
        },
        SourceUser={
            "ProviderName": provider_name,
            "ProviderAttributeName": "Cognito_Subject",
            "ProviderAttributeValue": provider_user_id,
        },
    )


def get_federated_provider_info(user: dict, cognito_username: str) -> tuple[str, str] | None:
    # Primary: infer from cognito username (e.g. google_12345)
    parsed = parse_federated_username(cognito_username)
    if parsed:
        return parsed

    # Fallback: infer from identities claim when username shape is opaque.
    raw_identities = user.get("identities")
    if isinstance(raw_identities, str):
        try:
            identities = json.loads(raw_identities)
        except Exception:
            identities = []
    elif isinstance(raw_identities, list):
        identities = raw_identities
    else:
        identities = []

    if not identities:
        return None

    first = identities[0] if isinstance(identities[0], dict) else {}
    provider_key = str(first.get("providerName") or "").strip().lower()
    provider_name = FEDERATED_PROVIDER_MAP.get(provider_key)
    provider_user_id = str(first.get("userId") or "").strip()
    if not provider_name or not provider_user_id:
        return None

    return provider_name, provider_user_id


class CheckLinkResponse(BaseModel):
    needs_link: bool
    provider: str | None = None
    existing_email: str | None = None
    existing_name: str | None = None


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
    # cognito:username holds the actual Cognito username (e.g. "Google_12345")
    # sub is a UUID that differs from Username for federated users
    cognito_username = user.get("cognito:username", user.get("sub", ""))
    current_provider = get_federated_provider_info(user, cognito_username)

    print(
        f"DEBUG: check_link: email={email}, cognito_username={cognito_username}, "
        f"is_federated={bool(current_provider)}"
    )

    if not email:
        return CheckLinkResponse(needs_link=False)

    # Only check for federated users (Google/Facebook/Apple/etc.)
    if not current_provider:
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
    print(f"DEBUG: check_link found {len(users)} users with email={email}: {[u['Username'] for u in users]}")

    # Find native (non-federated) accounts with the same email.
    # Exclude the current username if returned.
    native_accounts = [
        u for u in users
        if not is_federated_username(u.get("Username", ""))
        and u.get("Username") != cognito_username
    ]

    if not native_accounts:
        return CheckLinkResponse(needs_link=False)

    existing = native_accounts[0]
    existing_email_attr = next(
        (a["Value"] for a in existing.get("Attributes", []) if a["Name"] == "email"),
        email
    )
    existing_name_attr = next(
        (a["Value"] for a in existing.get("Attributes", []) if a["Name"] == "name"),
        None
    )

    provider_name, _ = current_provider
    return CheckLinkResponse(
        needs_link=True,
        provider=provider_name,
        existing_email=existing_email_attr,
        existing_name=existing_name_attr
    )


@router.post("/link-accounts", response_model=LinkAccountsResponse)
def link_accounts(user: dict = Depends(get_current_user)):
    """
    Link the current federated user (Google) to an existing email/password
    account in the same user pool.
    """
    email = (user.get("email") or "").strip().lower()
    cognito_username = user.get("cognito:username", user.get("sub", ""))
    provider_info = get_federated_provider_info(user, cognito_username)

    print(f"DEBUG: link_accounts: email={email}, cognito_username={cognito_username}")

    if not email or not cognito_username:
        raise HTTPException(status_code=400, detail="Missing user info")

    # Verify this is a federated user
    if not provider_info:
        raise HTTPException(status_code=400, detail="Current user is not a federated identity")

    user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
    if not user_pool_id:
        raise HTTPException(status_code=500, detail="COGNITO_USER_POOL_ID not configured")

    client = get_cognito_client()

    # 1. Find the existing native (email/password) account
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
        (u for u in users
         if not is_federated_username(u.get("Username", ""))
         and u.get("Username") != cognito_username),
        None
    )

    if not existing:
        raise HTTPException(status_code=404, detail="No existing account found to link")

    # 2. Extract provider info from cognito_username (e.g. "Google_123456789")
    provider_name, provider_user_id = provider_info

    print(f"DEBUG: Linking {provider_name}:{provider_user_id} -> {existing['Username']}")

    try:
        admin_link_provider_for_user(
            client=client,
            user_pool_id=user_pool_id,
            destination_username=existing["Username"],
            provider_name=provider_name,
            provider_user_id=provider_user_id,
        )
        print(f"DEBUG: Successfully linked {cognito_username} -> {existing['Username']} ({email})")
        return LinkAccountsResponse(
            ok=True,
            detail=f"Accounts linked successfully for {email}. Please sign in again."
        )
    except Exception as e:
        # Cognito limitation: if the social/federated shadow user already exists,
        # link can fail with "Merging is not currently supported".
        # In that case, delete the shadow user and retry link.
        if is_merge_not_supported_error(e):
            print(
                "DEBUG: merge-not-supported, deleting federated shadow user "
                f"{cognito_username} and retrying"
            )
            try:
                client.admin_delete_user(
                    UserPoolId=user_pool_id,
                    Username=cognito_username,
                )
            except Exception as delete_error:
                print(f"DEBUG: failed deleting federated shadow user: {delete_error}")
                raise HTTPException(
                    status_code=500,
                    detail=(
                        "Failed to prepare account link. Ensure backend IAM has "
                        "cognito-idp:AdminDeleteUser permission."
                    ),
                )

            try:
                admin_link_provider_for_user(
                    client=client,
                    user_pool_id=user_pool_id,
                    destination_username=existing["Username"],
                    provider_name=provider_name,
                    provider_user_id=provider_user_id,
                )
                print(
                    "DEBUG: Successfully linked after deleting shadow user "
                    f"{cognito_username} -> {existing['Username']} ({email})"
                )
                return LinkAccountsResponse(
                    ok=True,
                    detail=f"Accounts linked successfully for {email}. Please sign in again.",
                )
            except Exception as retry_error:
                print(f"DEBUG: link retry error: {retry_error}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to link accounts after cleanup: {retry_error}",
                )

        print(f"DEBUG: link_accounts error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to link accounts: {e}")
