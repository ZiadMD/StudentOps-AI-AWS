"""
Vercel Serverless ASGI Entrypoint for StudentOps AI.
Bridges incoming serverless HTTP / SSE requests to the FastAPI application.
"""
import sys
from pathlib import Path

# Add backend directory to Python sys.path
backend_path = Path(__file__).resolve().parent.parent / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from main import app
