"""Production smoke checks — read-only HTTP probes against deployed hosts.

Usage:
  python scripts/prod_smoke_check.py
  python scripts/prod_smoke_check.py --api https://api.peerdisclosures.com --app https://peerdisclosures.com

Exit 0 when all checks pass; 1 on any failure.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request


def _get(url: str, timeout: float = 15.0) -> tuple[int, dict | str]:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode()
        try:
            return resp.status, json.loads(raw)
        except json.JSONDecodeError:
            return resp.status, raw


def _post_json(url: str, body: dict, timeout: float = 15.0) -> tuple[int, dict | str]:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw


def main() -> int:
    parser = argparse.ArgumentParser(description="PeerDisclosures production smoke checks")
    parser.add_argument("--api", default="https://api.peerdisclosures.com", help="API base URL")
    parser.add_argument("--app", default="https://peerdisclosures.com", help="Frontend base URL")
    args = parser.parse_args()

    api = args.api.rstrip("/")
    app = args.app.rstrip("/")
    failures: list[str] = []

    def ok(label: str) -> None:
        print(f"OK  {label}")

    def fail(label: str, detail: str) -> None:
        print(f"FAIL {label}: {detail}")
        failures.append(label)

    print(f"=== API direct: {api} ===")
    try:
        status, body = _get(f"{api}/health")
        if status == 200 and isinstance(body, dict) and body.get("status") == "ok":
            ok(f"GET {api}/health")
        else:
            fail(f"GET {api}/health", f"status={status} body={body!r}")
    except Exception as exc:
        fail(f"GET {api}/health", str(exc))

    print(f"\n=== Frontend proxy: {app} ===")
    try:
        status, body = _get(f"{app}/api/backend/health")
        if status == 200 and isinstance(body, dict) and body.get("status") == "ok":
            ok(f"GET {app}/api/backend/health")
        else:
            fail(f"GET {app}/api/backend/health", f"status={status} body={body!r}")
    except Exception as exc:
        fail(f"GET {app}/api/backend/health", str(exc))

    print("\n=== Dev tier locked down ===")
    try:
        status, _body = _post_json(f"{api}/dev/tier", {"tier": "professional"})
        if status == 404:
            ok("POST /dev/tier returns 404 (ALLOW_DEV_TIER_TOGGLE off)")
        else:
            fail("POST /dev/tier", f"expected 404, got {status}")
    except Exception as exc:
        fail("POST /dev/tier", str(exc))

    print("\n=== Public compare (free tier) ===")
    try:
        status, body = _get(f"{api}/tickers/search?q=AAPL&limit=1")
        if status == 200 and isinstance(body, list) and body:
            ok("GET /tickers/search?q=AAPL")
        else:
            fail("GET /tickers/search", f"status={status} body={body!r}")
    except Exception as exc:
        fail("GET /tickers/search", str(exc))

    print("\n=== Manual steps (browser) ===")
    print("  1. Open compare with 4 tickers -> paywall")
    print("  2. Sign in (magic link) -> checkout with corporate email")
    print("  3. Stripe Dashboard → Webhooks → confirm checkout.session.completed delivered")
    print("  4. GET /auth/me -> tier: professional")
    print("  5. /account -> Manage billing -> cancel -> tier returns to free")
    print("  See docs/PRODUCTION_SMOKE_TEST.md for full checklist.")

    if failures:
        print(f"\n{len(failures)} automated check(s) failed.")
        return 1
    print("\nAll automated checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
