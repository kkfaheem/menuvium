"""
Legacy manual debug utility kept for local investigation.

This module name matches pytest discovery patterns, so we explicitly skip it in
automated test runs.
"""

import pytest

pytestmark = pytest.mark.skip(reason="Manual debug utility; excluded from CI test suite.")
