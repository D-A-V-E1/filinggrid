"""Automated sign-up / billing checks + manual browser checklist.

Runs pytest for auth, tier gates, and webhooks. If the API is up, also runs
e2e_checkout_test.py (Stripe checkout + webhook simulation).

Usage:
    cd backend
    .\\.venv\\Scripts\\python.exe scripts/signup_e2e_automated.py
"""

from __future__ import annotations

import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
PYTHON = sys.executable


def _api_up() -> bool:
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=3) as resp:
            return resp.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def _run(label: str, args: list[str]) -> int:
    print(f"\n=== {label} ===")
    result = subprocess.run(args, cwd=BACKEND)
    return result.returncode


def _print_manual_checklist() -> None:
    print(
        """
=== Manual browser E2E (requires Supabase + stripe listen) ===

Prerequisites:
  1. API on :8000, frontend on :3000, Postgres migrated
  2. stripe listen --forward-to localhost:8000/webhooks/stripe
  3. STRIPE_WEBHOOK_SECRET from CLI output in backend/.env (restart API)

Steps:
  1. /account -> sign in (any email) -> magic link -> ?auth=success
     -> Welcome checklist on /account; GET /auth/me -> tier: free
  2. /account with Gmail signed in -> Upgrade blocked with work-email message
  3. Sign out -> paywall (4 tickers) -> work email magic link -> checkout 4242...
  4. After redirect -> banner + "Open compare with 8 tickers" link
     -> 8 columns, saved groups, GAAP sections work
  5. /account -> Manage billing -> Customer Portal -> cancel subscription
     -> tier returns to free after webhook
  6. Inboxes: Supabase magic-link email + Stripe receipt (if enabled in Dashboard)

See docs/TIER_TESTING.md (Sign-up and onboarding E2E) for full detail.
"""
    )


def main() -> int:
    failures = 0

    failures += _run(
        "Auth + tier + webhook pytest",
        [
            PYTHON,
            "-m",
            "pytest",
            "tests/test_jwt_auth.py",
            "tests/test_auth_peer_groups_integration.py",
            "tests/test_tier_gates.py",
            "tests/test_stripe_webhooks.py",
            "-q",
            "--tb=line",
        ],
    )

    if _api_up():
        print("\n=== API health ===\nOK http://127.0.0.1:8000/health")
        failures += _run(
            "Live checkout + webhook simulation",
            [PYTHON, "scripts/e2e_checkout_test.py"],
        )
    else:
        print("\n=== API health ===\nSKIP (API not running on :8000)")
        print("Start uvicorn and re-run for live checkout simulation.")

    _print_manual_checklist()
    return failures


if __name__ == "__main__":
    sys.exit(main())
