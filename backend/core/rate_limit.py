from slowapi import Limiter
from slowapi.util import get_remote_address


# SlowAPI's default key is the connecting client IP. Reverse proxies must
# overwrite and validate forwarded headers before they reach the application.
limiter = Limiter(key_func=get_remote_address)