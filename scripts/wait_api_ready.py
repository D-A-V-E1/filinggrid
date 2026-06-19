"""Wait until API /health reports foreign filing fallback support."""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

DEFAULT_URL = "http://127.0.0.1:8000/health"
MAX_WAIT_SEC = 90
POLL_INTERVAL_SEC = 2


def main() -> int:
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    deadline = time.time() + MAX_WAIT_SEC
    last_error = ""

    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=8) as res:
                body = json.loads(res.read().decode("utf-8"))
            fallback = (body.get("features") or {}).get("foreign_filing_fallback")
            if body.get("status") == "ok" and fallback:
                print(f"[OK] API ready with foreign filing fallback v{fallback}")
                return 0
            last_error = f"health ok but missing foreign_filing_fallback (features={body.get('features')})"
        except urllib.error.HTTPError as exc:
            last_error = f"HTTP {exc.code}"
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
        time.sleep(POLL_INTERVAL_SEC)

    print(f"[WARN] API not ready after {MAX_WAIT_SEC}s: {last_error or 'timeout'}")
    print("       Run stop.bat, then start.bat — stale API processes skip 20-F/6-K fallback.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
