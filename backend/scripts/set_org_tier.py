#!/usr/bin/env python
"""Set an organization's subscription tier by user email (dev/test database seeding).

Usage:
    python scripts/set_org_tier.py user@company.com professional
    python scripts/set_org_tier.py user@company.com free
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import Organization, SessionLocal, User  # noqa: E402
from middleware import TIER_LIMITS  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Set organization subscription tier by user email")
    parser.add_argument("email", help="User email (must exist in users table)")
    parser.add_argument("tier", choices=sorted(TIER_LIMITS.keys()), help="Subscription tier")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == args.email).first()
        if not user:
            print(f"No user found for email: {args.email}", file=sys.stderr)
            print("Sign in once via magic link so the backend creates the user/org record.", file=sys.stderr)
            return 1

        if not user.organization_id:
            print(f"User {args.email} has no organization.", file=sys.stderr)
            return 1

        org = db.query(Organization).filter(Organization.id == user.organization_id).first()
        if not org:
            print(f"Organization not found for user: {args.email}", file=sys.stderr)
            return 1

        previous = org.subscription_tier
        org.subscription_tier = args.tier
        db.commit()
        print(f"Updated {org.name} ({org.id}): {previous} -> {args.tier}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
