"""Firebase ID-token verification helper for production API integration.

Apply this dependency to every user-data route. Every database query must be
scoped to the verified Firebase UID before public multi-user access is enabled.
Never trust a workspace_id supplied by a client as an authorization boundary.
"""
from fastapi import HTTPException, Header
from firebase_admin import auth

def require_firebase_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in is required.")
    token = authorization.split(" ", 1)[1].strip()
    try:
        return auth.verify_id_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Your session is invalid or expired.")
