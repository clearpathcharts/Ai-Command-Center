"""Firebase user and background-worker authentication helpers."""
import hmac
import os
import firebase_admin
from firebase_admin import auth
from fastapi import Header, HTTPException

def require_firebase_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in is required.")
    try:
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        token = authorization.split(" ", 1)[1].strip()
        return auth.verify_id_token(token, check_revoked=True)
    except Exception:
        raise HTTPException(status_code=401, detail="Your session is invalid or expired.")

def require_worker_token(x_worker_token: str | None = Header(default=None)):
    expected = os.getenv("WORKER_SHARED_SECRET")
    if not expected:
        raise HTTPException(status_code=503, detail="Background worker is not configured.")
    if not x_worker_token or not hmac.compare_digest(x_worker_token, expected):
        raise HTTPException(status_code=401, detail="Worker authentication failed.")
    return True
