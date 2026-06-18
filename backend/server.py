"""Lancely mobile — backend stub.

The mobile app now uses the shared Lancely web backend at
https://freelancer-hub-47.preview.emergentagent.com (configured via
EXPO_PUBLIC_BACKEND_URL in /app/frontend/.env).

This local FastAPI app exists only to satisfy the platform's supervisor
configuration (which expects /app/backend to be runnable). It exposes a
single health-check route and intentionally has no business logic.
"""
from fastapi import FastAPI

app = FastAPI(title="Lancely mobile stub", version="1.0.2")

@app.get("/api/health")
async def health():
    return {
        "app": "lancely-mobile-stub",
        "status": "ok",
        "shared_backend": "https://freelancer-hub-47.preview.emergentagent.com",
    }
