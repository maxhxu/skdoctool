"""
CSRF protection without any extra state.

For each state-changing form (register, logout, key management) the token
embedded in the hidden field is HMAC(SECRET_KEY, <the cookie value that
request is scoped to>). To forge a valid token, an attacker's cross-site
page would need to already know the victim's httponly cookie value (which
same-origin policy prevents) — knowing only that *some* cookie exists isn't
enough, unlike a naive "cookie == field" double-submit with no signing.

This also means a CSRF token from one context (e.g. one /register attempt)
is useless in another, since it's bound to that exact cookie value.
"""

import hashlib
import hmac

from . import config


def csrf_token_for(cookie_value: str) -> str:
    return hmac.new(
        config.SECRET_KEY.encode(), cookie_value.encode(), hashlib.sha256
    ).hexdigest()


def verify_csrf(cookie_value: str | None, submitted_token: str | None) -> bool:
    if not cookie_value or not submitted_token:
        return False
    expected = csrf_token_for(cookie_value)
    return hmac.compare_digest(expected, submitted_token)


def set_csrf_cookie(response, name: str, bound_cookie_value: str, max_age: int) -> None:
    """Set the JS-readable companion CSRF cookie for a given httponly
    cookie value. Not httponly — the frontend needs to read it to put it
    in a request header. Its value is useless without also holding the
    (httponly, unreadable-to-JS) cookie it was derived from, so exposing
    it doesn't weaken anything."""
    response.set_cookie(
        name,
        csrf_token_for(bound_cookie_value),
        max_age=max_age,
        httponly=False,
        samesite="lax",
    )
