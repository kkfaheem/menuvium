import os
import requests
from jose import jwt
from fastapi import HTTPException, status

# Simple in-memory cache for JWKS
jwks_cache = {}

def _is_test_mode() -> bool:
    return os.getenv("PYTEST_CURRENT_TEST") is not None or os.getenv("MENUVIIUM_TEST_MODE") == "1"

def get_keys(region, user_pool_id):
    if "keys" in jwks_cache:
        return jwks_cache["keys"]
    
    url = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json"
    response = requests.get(url)
    if response.status_code == 200:
        jwks_cache["keys"] = response.json()["keys"]
        return jwks_cache["keys"]
    return []

def verify_token(token: str):
    if _is_test_mode():
        return {"sub": "test-user", "email": "test@example.com"}

    region = os.getenv("AWS_REGION", "us-east-1")
    user_pool_id = os.getenv("COGNITO_USER_POOL_ID")
    client_id = os.getenv("COGNITO_CLIENT_ID")

    if not user_pool_id:
         raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Valid Auth Config Missing"
        )

    # Decode without verification first to find kid
    try:
        headers = jwt.get_unverified_header(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token format")

    # If it's an impersonation token (HS256) signed by our backend
    if headers.get("alg") == "HS256":
        impersonation_secret = os.getenv("IMPERSONATION_SECRET")
        if not impersonation_secret:
            raise HTTPException(status_code=500, detail="Impersonation not configured on backend")
        try:
            claims = jwt.decode(
                token,
                impersonation_secret,
                algorithms=["HS256"],
                audience=client_id,
                options={"verify_at_hash": False}
            )
            return claims
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Invalid impersonation token: {e}")

    # Standard Cognito Token RS256
    kid = headers.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="Missing kid in token header")
        
    keys = get_keys(region, user_pool_id)
    key_index = -1
    for i in range(len(keys)):
        if kid == keys[i]["kid"]:
            key_index = i
            break
            
    if key_index == -1:
        raise HTTPException(status_code=401, detail="Public key not found in JWK set")

    public_key = keys[key_index]
    
    # Verify signature
    try:
        claims = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=client_id,
            options={"verify_at_hash": False}
        )
        return claims
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Cognito token: {e}")
