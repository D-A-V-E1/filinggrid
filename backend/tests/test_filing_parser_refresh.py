"""Parse refresh flags should only bypass cache for requested tickers."""

from filing_parser import ParseRequest, _should_refresh_ticker


def test_should_refresh_all_when_refresh_cache_true():
    request = ParseRequest(tickers=["NVDA", "AMD"], refresh_cache=True)
    assert _should_refresh_ticker("NVDA", request)
    assert _should_refresh_ticker("AMD", request)


def test_should_refresh_only_listed_tickers():
    request = ParseRequest(tickers=["NVDA", "AMD", "INTC"], refresh_tickers=["AMD"])
    assert not _should_refresh_ticker("NVDA", request)
    assert _should_refresh_ticker("AMD", request)
    assert not _should_refresh_ticker("INTC", request)


def test_should_refresh_none_by_default():
    request = ParseRequest(tickers=["AMD"])
    assert not _should_refresh_ticker("AMD", request)
