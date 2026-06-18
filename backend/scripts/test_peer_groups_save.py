"""Smoke-test saved peer groups against a running API.

Modes:
  Dev (default): ``X-Dev-Tier: professional`` — in-memory store, no sign-in.
  Signed-in: set ``FILINGGRID_AUTH_TOKEN`` or pass ``--token`` (JWT from browser devtools).

Examples::

  .venv\\Scripts\\python.exe scripts\\test_peer_groups_save.py
  .venv\\Scripts\\python.exe scripts\\test_peer_groups_save.py --token eyJ...
  set FILINGGRID_AUTH_TOKEN=eyJ... && .venv\\Scripts\\python.exe scripts\\test_peer_groups_save.py
"""

from __future__ import annotations

import argparse
import os
import sys

import httpx

DEFAULT_API = "http://localhost:8000"


def _resolve_headers(token: str, dev_mode: bool) -> dict[str, str]:
    base = {"Content-Type": "application/json"}
    if token and not dev_mode:
        base["Authorization"] = f"Bearer {token}"
        return base
    base["X-Dev-Tier"] = "professional"
    return base


def _verify_mode(client: httpx.Client, api: str, headers: dict[str, str], signed_in: bool) -> tuple[bool, str]:
    if not signed_in:
        return True, "dev-tier professional (in-memory until API restart)"

    res = client.get(f"{api}/auth/me", headers=headers)
    if res.status_code != 200:
        return False, f"/auth/me HTTP {res.status_code}: {res.text[:200]}"
    body = res.json()
    if not body.get("is_authenticated"):
        return False, "token not accepted — check SUPABASE_JWT_SECRET / JWKS on the API"
    if body.get("tier") != "professional":
        return (
            False,
            f"signed-in tier is {body.get('tier')!r}; Professional required for saved groups",
        )
    return True, f"signed in as {body.get('email')}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke-test saved peer groups API")
    parser.add_argument(
        "--api",
        default=os.environ.get("FILINGGRID_API", DEFAULT_API),
        help=f"API base URL (default: {DEFAULT_API})",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("FILINGGRID_AUTH_TOKEN", ""),
        help="Supabase access token for signed-in smoke (or FILINGGRID_AUTH_TOKEN)",
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Force dev-tier mode even when --token is set",
    )
    args = parser.parse_args()

    api = args.api.rstrip("/")
    signed_in = bool(args.token) and not args.dev
    headers = _resolve_headers(args.token, args.dev)
    failures = 0

    with httpx.Client(timeout=30) as client:
        ok, mode_msg = _verify_mode(client, api, headers, signed_in)
        print(f"Mode: {mode_msg}")
        if not ok:
            print(f"FAIL auth check: {mode_msg}")
            return 1

        listed = client.get(f"{api}/peer-groups", headers=headers)
        if listed.status_code != 200:
            print(f"FAIL list: HTTP {listed.status_code} {listed.text[:200]}")
            return 1

        created = client.post(
            f"{api}/peer-groups",
            headers=headers,
            json={"group_name": "Smoke test banks", "tickers_list": ["JPM", "GS", "MS"]},
        )
        if created.status_code != 200:
            print(f"FAIL create: HTTP {created.status_code} {created.text[:200]}")
            return 1
        group = created.json()
        group_id = group["id"]
        print(f"OK create: {group['group_name']} -> {group['tickers_list']}")

        listed2 = client.get(f"{api}/peer-groups", headers=headers)
        ids = [g["id"] for g in listed2.json()]
        if group_id not in ids:
            print(f"FAIL list after create: {ids}")
            failures += 1
        else:
            print("OK list after create")

        deleted = client.delete(f"{api}/peer-groups/{group_id}", headers=headers)
        if deleted.status_code != 200:
            print(f"FAIL delete: HTTP {deleted.status_code}")
            failures += 1
        else:
            print("OK delete")

    if failures:
        print(f"\n{failures} step(s) failed")
        return 1
    print("\nPeer group save smoke test passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
