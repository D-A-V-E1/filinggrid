"""Install backend requirements only when requirements.txt changed."""

from __future__ import annotations

import hashlib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REQ = ROOT / "backend" / "requirements.txt"
STAMP = ROOT / "backend" / ".venv" / ".requirements-sha256"
VENV_PY = ROOT / "backend" / ".venv" / "Scripts" / "python.exe"
VENV_PIP = ROOT / "backend" / ".venv" / "Scripts" / "pip.exe"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).digest().hex()


def main() -> int:
    if not REQ.exists():
        print("[ERROR] backend/requirements.txt not found")
        return 1
    if not VENV_PY.exists():
        print("[ERROR] Virtual environment missing — run start.bat to create it first")
        return 1

    digest = sha256(REQ)
    if STAMP.exists() and STAMP.read_text(encoding="utf-8").strip() == digest:
        print("[OK]   Backend packages up to date.")
        return 0

    print("[INFO] Installing Python packages...")
    steps = [
        [str(VENV_PIP), "install", "--upgrade", "pip", "setuptools", "wheel", "-q"],
        [str(VENV_PIP), "install", "greenlet==3.1.1", "--only-binary=:all:", "-q"],
        [str(VENV_PIP), "install", "-r", str(REQ)],
    ]
    for cmd in steps:
        rc = subprocess.call(cmd)
        if rc != 0:
            print("[ERROR] pip install failed.")
            return rc

    STAMP.parent.mkdir(parents=True, exist_ok=True)
    STAMP.write_text(digest, encoding="utf-8")
    print("[OK]   Backend ready.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
