"""Admin authentication via signed cookies."""

import os
import hashlib
from itsdangerous import URLSafeSerializer
from fastapi import Request, HTTPException
from fastapi.responses import RedirectResponse

# Admin credentials (override via environment variables)
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

# Secret key for signing session cookies
SECRET_KEY = os.getenv("SECRET_KEY", "digital-bridge-secret-key-2024")
serializer = URLSafeSerializer(SECRET_KEY)

SESSION_COOKIE_NAME = "admin_session"


def verify_credentials(username: str, password: str) -> bool:
    """Check if provided credentials match admin credentials."""
    return username == ADMIN_USERNAME and password == ADMIN_PASSWORD


def create_session_token(username: str) -> str:
    """Create a signed session token."""
    return serializer.dumps({"user": username})


def verify_session(request: Request) -> bool:
    """Verify that the request has a valid admin session cookie."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return False
    try:
        data = serializer.loads(token)
        return data.get("user") == ADMIN_USERNAME
    except Exception:
        return False


def require_admin(request: Request):
    """Dependency that ensures the user is an authenticated admin."""
    if not verify_session(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
