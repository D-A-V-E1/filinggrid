"""Run stripe listen with live console output + log file.

Uses STRIPE_SECRET_KEY from backend/.env when set (skips interactive stripe login).
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
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


def stripe_secret_key_is_valid(api_key: str) -> bool:
    """Return True when Stripe accepts this secret key (preflight before stripe listen)."""
    request = urllib.request.Request(
        "https://api.stripe.com/v1/balance",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status == 200
    except urllib.error.HTTPError as exc:
        return exc.code not in (401, 403)
    except OSError:
        return False


def stripe_cli_is_logged_in() -> bool:
    config = Path.home() / ".config" / "stripe" / "config.toml"
    if not config.is_file():
        return False
    text = config.read_text(encoding="utf-8", errors="replace")
    return "test_mode_api_key" in text or "test_mode_pub_key" in text or "device_name" in text


def _parse_stripe_login_json(raw: str) -> dict[str, str] | None:
    match = re.search(r'\{[\s\S]*"verification_code"[\s\S]*\}', raw)
    if not match:
        return None
    try:
        payload = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    browser_url = str(payload.get("browser_url") or "").strip()
    verification_code = str(payload.get("verification_code") or "").strip()
    next_step = str(payload.get("next_step") or "").strip()
    if not browser_url or not verification_code:
        return None
    poll_url_match = re.search(r"--complete\s+'([^']+)'", next_step)
    poll_url = poll_url_match.group(1) if poll_url_match else ""
    if not poll_url:
        poll_url_match = re.search(r"https://[^\s'\"]+", next_step)
        poll_url = poll_url_match.group(0) if poll_url_match else ""
    if not poll_url:
        return None
    return {
        "browser_url": browser_url,
        "verification_code": verification_code,
        "poll_url": poll_url,
    }


def run_stripe_login_interactive(stripe: str) -> int:
    """Authenticate Stripe CLI; works from cmd windows and non-TTY subprocesses."""
    if sys.stdin.isatty() and sys.stdout.isatty():
        print("[INFO] Starting interactive stripe login (browser pairing)...")
        print()
        code = subprocess.call([stripe, "login"])
        if code == 0 and stripe_cli_is_logged_in():
            return 0

    print("[INFO] Starting stripe login (pairing code flow)...")
    proc = subprocess.run(
        [stripe, "login", "--non-interactive"],
        capture_output=True,
        text=True,
    )
    raw = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0:
        if raw.strip():
            sys.stdout.write(raw)
            if not raw.endswith("\n"):
                sys.stdout.write("\n")
        return proc.returncode

    parsed = _parse_stripe_login_json(raw)
    if not parsed:
        print("[ERROR] Could not parse stripe login output.")
        if raw.strip():
            sys.stdout.write(raw)
        return 1

    print()
    print(f"  Pairing code: {parsed['verification_code']}")
    print(f"  Browser URL:  {parsed['browser_url']}")
    print()
    print("  Open the URL, enter the pairing code, and approve access.")
    print("  Waiting for browser approval...")
    print()

    return subprocess.call([stripe, "login", "--complete", parsed["poll_url"]])


def resolve_listen_auth(stripe: str, api_key: str | None) -> tuple[list[str], str]:
    """Return extra CLI args and auth mode label for stripe listen."""
    if api_key:
        if stripe_secret_key_is_valid(api_key):
            return ["--api-key", api_key], "env_key"

        print("[WARN] STRIPE_SECRET_KEY in backend/.env was rejected by Stripe (401).")
        print("       Ignoring it for this session.")
        print("       To fix permanently: re-copy the secret key from Dashboard -> Developers -> API keys")
        print("       (Reveal test secret key, not restricted key), or roll the key and update .env.")
        print()

    if stripe_cli_is_logged_in():
        print("[OK] Using Stripe CLI saved login (stripe login session).")
        return [], "cli_session"

    login_code = run_stripe_login_interactive(stripe)
    if login_code != 0:
        print("[ERROR] stripe login did not complete successfully.")
        return [], "login_failed"

    if stripe_cli_is_logged_in():
        print("[OK] Stripe CLI login saved. Starting webhook forwarder.")
        return [], "cli_session"

    print("[ERROR] stripe login finished but no CLI config was saved.")
    return [], "login_failed"


def main() -> int:
    stripe = find_stripe_cli()
    if not stripe:
        return 1

    api_key = read_stripe_secret_key()
    auth_args, auth_mode = resolve_listen_auth(stripe, api_key)
    if auth_mode == "login_failed":
        return 1

    cmd = [stripe, "listen", "--forward-to", FORWARD, *auth_args]
    if auth_mode == "env_key" and api_key:
        print(f"[OK] Using STRIPE_SECRET_KEY from backend/.env ({api_key[:12]}...)")

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
