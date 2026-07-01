"""Heavy endpoint concurrency cap."""

import os
from unittest.mock import patch

from config import Settings


def test_heavy_semaphore_defaults_to_three():
    env = os.environ.copy()
    env.pop("MAX_CONCURRENT_PARSE", None)
    with patch.dict(os.environ, env, clear=True):
        s = Settings()
        assert s.max_concurrent_heavy == 3


def test_heavy_semaphore_reads_env():
    with patch.dict(os.environ, {"MAX_CONCURRENT_PARSE": "2"}, clear=False):
        s = Settings()
        assert s.max_concurrent_heavy == 2
