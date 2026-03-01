from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from auth import verify_token
import os

security = HTTPBearer()

def get_current_user(token: HTTPAuthorizationCredentials = Depends(security)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = verify_token(token.credentials)
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        return payload
    except Exception as e:
        print(f"Auth error: {e}")
        raise credentials_exception


def get_admin_user(user: dict = Depends(get_current_user)) -> dict:
    """Verify the authenticated user is in the ADMIN_EMAILS allowlist."""
    admin_emails_raw = os.getenv("ADMIN_EMAILS", "")
    admin_emails = [e.strip().lower() for e in admin_emails_raw.split(",") if e.strip()]
    user_email = (user.get("email") or "").strip().lower()
    if not user_email or user_email not in admin_emails:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
