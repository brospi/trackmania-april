import base64
import json
import time

import httpx
import pytest

from scraper.auth import NadeoClient


def make_jwt(exp_offset: float = 3600.0) -> str:
    header = base64.urlsafe_b64encode(b'{"alg":"none"}').rstrip(b"=").decode()
    payload = (
        base64.urlsafe_b64encode(
            json.dumps({"exp": int(time.time() + exp_offset)}).encode()
        )
        .rstrip(b"=")
        .decode()
    )
    return f"{header}.{payload}.sig"


def basic_body(access_exp: float = 3600, refresh_exp: float = 7200) -> dict:
    return {
        "accessToken": make_jwt(access_exp),
        "refreshToken": make_jwt(refresh_exp),
    }


def basic_response(**kw) -> httpx.Response:
    return httpx.Response(200, json=basic_body(**kw))


@pytest.fixture
def http():
    with httpx.Client(timeout=5.0) as c:
        yield c


@pytest.fixture
def client(http):
    return NadeoClient(http, "bot", "pass")
