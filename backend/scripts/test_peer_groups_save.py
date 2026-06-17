"""Smoke-test saved peer groups in Pro dev mode."""

from __future__ import annotations

import os

import httpx

API = os.environ.get("FILINGGRID_API", "http://localhost:8001")
HEADERS = {"X-Dev-Tier": "professional", "Content-Type": "application/json"}


def main() -> int:
    failures = 0
    with httpx.Client(timeout=30) as client:
        listed = client.get(f"{API}/peer-groups", headers=HEADERS)
        if listed.status_code != 200:
            print(f"FAIL list: HTTP {listed.status_code} {listed.text[:200]}")
            return 1

        created = client.post(
            f"{API}/peer-groups",
            headers=HEADERS,
            json={"group_name": "Smoke test banks", "tickers_list": ["JPM", "GS", "MS"]},
        )
        if created.status_code != 200:
            print(f"FAIL create: HTTP {created.status_code} {created.text[:200]}")
            return 1
        group = created.json()
        group_id = group["id"]
        print(f"OK create: {group['group_name']} -> {group['tickers_list']}")

        listed2 = client.get(f"{API}/peer-groups", headers=HEADERS)
        ids = [g["id"] for g in listed2.json()]
        if group_id not in ids:
            print(f"FAIL list after create: {ids}")
            failures += 1
        else:
            print("OK list after create")

        deleted = client.delete(f"{API}/peer-groups/{group_id}", headers=HEADERS)
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
