"""Pytest configuration for local package imports."""

from pathlib import Path
import sys


def _ensure_backend_package_on_path() -> None:
    """Adds the backend app root so tests can import `app.*` from the repo root."""
    backend_root = Path(__file__).resolve().parents[1]
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))


_ensure_backend_package_on_path()

