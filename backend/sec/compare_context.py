"""Per-request shared cache for multi-ticker compare loads."""

from __future__ import annotations

from typing import Any


class CompareFactsCache:
    """Deduplicate companyfacts fetches within one compare stream / batch."""

    def __init__(self) -> None:
        self._facts: dict[str, dict[str, Any]] = {}
        self._from_cache: dict[str, bool] = {}

    async def get_company_facts(self, cik: str) -> tuple[dict[str, Any], bool]:
        if cik in self._facts:
            return self._facts[cik], self._from_cache.get(cik, True)

        from sec.xbrl_client import fetch_company_facts

        facts, from_cache = await fetch_company_facts(cik)
        self._facts[cik] = facts
        self._from_cache[cik] = from_cache
        return facts, from_cache
