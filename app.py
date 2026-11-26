"""Entry point when the whole project folder is deployed.

It loads the server from the backend folder. The server also hands out
the website pages from this folder, so everything lives at one address.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))

from main import app  # noqa: E402,F401
