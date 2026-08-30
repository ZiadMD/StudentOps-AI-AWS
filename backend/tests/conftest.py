"""
Pytest configuration and global fixtures for StudentOps AI test suite.
"""
import pytest
from app.core.rate_limiter import limiter


@pytest.fixture(autouse=True)
def reset_global_rate_limiter():
    """Automatically reset the rate limiter before and after each test."""
    limiter.reset()
    yield
    limiter.reset()
