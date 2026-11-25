"""Authentication is intentionally not provided in the personal local-only release.

The browser application does not use this API. Cloud endpoints fail closed in
main.py; these guards also prevent accidental use if an endpoint is re-enabled.
"""
from fastapi import HTTPException


def require_firebase_user():
    raise HTTPException(
        status_code=503,
        detail="Cloud accounts are disabled in personal local-only mode."
    )


def require_worker_token():
    raise HTTPException(
        status_code=503,
        detail="Background workers are disabled in personal local-only mode."
    )
