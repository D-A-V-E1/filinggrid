"""Wait until the Next.js dev server returns HTTP 200 on / (not just port LISTENING)."""

from __future__ import annotations

import sys
import time
import urllib.error
import urllib.request

DEFAULT_URL = "http://127.0.0.1:3000/"
MAX_WAIT_SEC = 120
POLL_INTERVAL_SEC = 2


def main() -> int:
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    deadline = time.time() + MAX_WAIT_SEC
    last_error = ""

    while time.time() < deadline:
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=8) as res:
                if 200 <= res.status < 400:
                    print(f"[OK] Web ready: {url} ({res.status})")
                    return 0
                last_error = f"HTTP {res.status}"
        except urllib.error.HTTPError as exc:
            if 200 <= exc.code < 400:
                print(f"[OK] Web ready: {url} ({exc.code})")
                return 0
            last_error = f"HTTP {exc.code}"
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
        time.sleep(POLL_INTERVAL_SEC)

    print(f"[WARN] Web not ready after {MAX_WAIT_SEC}s: {last_error or 'timeout'}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
