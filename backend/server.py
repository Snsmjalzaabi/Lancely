"""Lancely mobile — backend stub.

The mobile app uses the shared Lancely web backend; this local FastAPI
exists only to keep the platform supervisor configuration happy.
"""
import os

from fastapi import FastAPI

app = FastAPI(title="Lancely mobile stub", version="1.0.2")

SHARED_BACKEND_URL = os.environ.get(
    "SHARED_BACKEND_URL",
    "https://freelancer-hub-47.preview.emergentagent.com",
)


@app.get("/api/health")
async def health():
    return {
        "app": "lancely-mobile-stub",
        "status": "ok",
        "shared_backend": SHARED_BACKEND_URL,
    }
