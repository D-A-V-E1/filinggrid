"""Run stripe listen with live console output + log file.

Uses STRIPE_SECRET_KEY from backend/.env when set (skips interactive stripe login).
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / ".stripe-listen.log"
ENV = ROOT / "backend" / ".env"
FORWARD = "localhost:8000/webhooks/stripe"


def find_stripe_cli() -> str:
    exe = shutil.which("stripe")
    if exe:
        return exe
    winget = (
        Path.home()
        / "AppData/Local/Microsoft/WinGet/Packages"
        / "Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe/stripe.exe"
    )
    if winget.is_file():
        return str(winget)
    print("[ERROR] Stripe CLI not found. Install: winget install Stripe.StripeCli")
    return ""


def read_stripe_secret_key() -> str | None:
    if not ENV.is_file():
        return None
    text = ENV.read_text(encoding="utf-8")
    match = re.search(r"^STRIPE_SECRET_KEY=(.+)$", text, re.MULTILINE)
    if not match:
        return None
    value = match.group(1).strip().strip('"').strip("'")
    if not value or value.startswith("TODO") or value == "sk_test_...":
        return None
    return value


def main() -> int:
    stripe = find_stripe_cli()
    if not stripe:
        return 1

    api_key = read_stripe_secret_key()
    cmd = [stripe, "listen", "--forward-to", FORWARD]
    if api_key:
        cmd.extend(["--api-key", api_key])
        print(f"[OK] Using STRIPE_SECRET_KEY from backend/.env ({api_key[:12]}...)")
    else:
        print("[WARN] No STRIPE_SECRET_KEY in backend/.env — Stripe CLI login required.")
        print("       Run once: stripe login")
        print("       Or set STRIPE_SECRET_KEY=sk_test_... in backend/.env")
        print()

    print(f"[INFO] Forwarding to http://{FORWARD}")
    print(f"[INFO] Logging to {LOG}")
    print()

    LOG.write_text("", encoding="utf-8")

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
    except OSError as exc:
        print(f"[ERROR] Could not start stripe listen: {exc}")
        return 1

    assert proc.stdout is not None
    with LOG.open("a", encoding="utf-8") as log_file:
        for line in proc.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            log_file.write(line)
            log_file.flush()

    return proc.wait()


if __name__ == "__main__":
    sys.exit(main())
