from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env.local from the project root.
# This file is at: services/analysis-engine/src/main.py
# Project root is:  ../../..  (relative to this file)
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.normpath(os.path.join(_THIS_DIR, "..", "..", ".."))
_ENV_PATH = os.path.join(_PROJECT_ROOT, ".env.local")

if os.path.exists(_ENV_PATH):
    load_dotenv(_ENV_PATH)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Import the router after loading env so that env vars are available
from .routers.analysis import router as analysis_router  # noqa: E402

app = FastAPI(
    title="Hiring Agent Analysis Engine",
    description="Analyzes candidate terminal interaction transcripts using Gemini API",
    version="0.1.0",
)

# CORS middleware — allow all origins for MVP
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(analysis_router)


@app.get("/")
async def root() -> dict:
    """Root endpoint with service info."""
    return {
        "service": "analysis-engine",
        "version": "0.1.0",
        "description": "Candidate transcript analysis powered by Gemini",
        "endpoints": {
            "POST /analyze": "Analyze a candidate session",
            "GET /health": "Health check",
        },
    }


@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "analysis-engine",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "gemini_key_set": bool(os.environ.get("GEMINI_API_KEY")),
    }
