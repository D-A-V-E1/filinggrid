"""Poll .stripe-listen.log for whsec_ and write STRIPE_WEBHOOK_SECRET to .env files."""

from __future__ import annotations

import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / ".stripe-listen.log"
ENV_FILES = [ROOT / ".env", ROOT / "backend" / ".env"]
MAX_WAIT_SEC = 120
POLL_INTERVAL_SEC = 2

LOGIN_HINTS = (
    "pairing code",
    "stripe login",
    "not configured api keys",
    "confirm_auth",
)


def patch_env(path: Path, key: str, value: str) -> None:
    if path.exists():
        text = path.read_text(encoding="utf-8")
    else:
        text = ""
    pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
    line = f"{key}={value}"
    if pattern.search(text):
        text = pattern.sub(line, text)
    else:
        text = text.rstrip("\n") + ("\n" if text else "") + line + "\n"
    path.write_text(text, encoding="utf-8")


def read_log_text(path: Path) -> str:
    raw = path.read_bytes()
    if raw.startswith(b"\xff\xfe"):
        return raw.decode("utf-16-le")
    if raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16-be")
    return raw.decode("utf-8", errors="replace")


def extract_secret(log_text: str) -> str | None:
    match = re.search(r"(whsec_[A-Za-z0-9]+)", log_text)
    return match.group(1) if match else None


def login_blocked(log_text: str) -> bool:
    lower = log_text.lower()
    return any(hint in lower for hint in LOGIN_HINTS)


def main() -> int:
    deadline = time.time() + MAX_WAIT_SEC
    warned_login = False

    while time.time() < deadline:
        if LOG.exists():
            log_text = read_log_text(LOG)

            if not warned_login and login_blocked(log_text) and not extract_secret(log_text):
                warned_login = True
                print(
                    "[WARN] Stripe CLI is waiting for login in the PeerDisclosures Stripe window."
                )
                print("       Complete browser login there, OR set STRIPE_SECRET_KEY=sk_test_...")
                print("       in backend/.env and restart start-with-stripe.bat")

            secret = extract_secret(log_text)
            if secret:
                updated = []
                for env_path in ENV_FILES:
                    if env_path.exists():
                        patch_env(env_path, "STRIPE_WEBHOOK_SECRET", secret)
                        updated.append(env_path.relative_to(ROOT).as_posix())
                if updated:
                    print(
                        f"[OK] STRIPE_WEBHOOK_SECRET={secret[:12]}... "
                        f"written to {', '.join(updated)}"
                    )
                else:
                    print("[ERROR] No .env files found to update.")
                    return 1
                return 0

        time.sleep(POLL_INTERVAL_SEC)

    print("[ERROR] Timed out waiting for Stripe webhook secret (120s).")
    print("        Check the PeerDisclosures Stripe window for errors.")
    if LOG.exists():
        tail = read_log_text(LOG)[-800:]
        if tail.strip():
            print("\n--- stripe listen log (tail) ---")
            print(tail)
    return 1


if __name__ == "__main__":
    sys.exit(main())
