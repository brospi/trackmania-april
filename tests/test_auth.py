import httpx

from scraper.config import CORE_BASE
from tests.conftest import basic_response


def test_basic_caches_per_audience(client, respx_mock):
    route = respx_mock.post(f"{CORE_BASE}/v2/authentication/token/basic").mock(
        return_value=basic_response()
    )
    a = client.token("NadeoServices")
    b = client.token("NadeoServices")
    assert a == b
    assert route.call_count == 1


def test_independent_audience_caches(client, respx_mock):
    route = respx_mock.post(f"{CORE_BASE}/v2/authentication/token/basic").mock(
        side_effect=[basic_response(), basic_response()]
    )
    client.token("NadeoServices")
    client.token("NadeoLiveServices")
    assert route.call_count == 2


def test_refresh_on_near_expiry(client, respx_mock):
    respx_mock.post(f"{CORE_BASE}/v2/authentication/token/basic").mock(
        return_value=basic_response(access_exp=30)
    )
    refresh_route = respx_mock.post(
        f"{CORE_BASE}/v2/authentication/token/refresh"
    ).mock(return_value=basic_response(access_exp=3600))
    client.token("NadeoServices")
    client.token("NadeoServices")
    assert refresh_route.call_count == 1


def test_refresh_fallback_to_basic(client, respx_mock):
    basic_route = respx_mock.post(
        f"{CORE_BASE}/v2/authentication/token/basic"
    ).mock(
        side_effect=[
            basic_response(access_exp=30),
            basic_response(access_exp=3600),
        ]
    )
    respx_mock.post(f"{CORE_BASE}/v2/authentication/token/refresh").mock(
        return_value=httpx.Response(500)
    )
    client.token("NadeoServices")
    client.token("NadeoServices")
    assert basic_route.call_count == 2


def test_401_retry_on_get(client, respx_mock):
    respx_mock.post(f"{CORE_BASE}/v2/authentication/token/basic").mock(
        side_effect=[basic_response(), basic_response()]
    )
    get_route = respx_mock.get("https://example.com/x").mock(
        side_effect=[
            httpx.Response(401),
            httpx.Response(200, json={"ok": True}),
        ]
    )
    r = client.get("https://example.com/x", audience="NadeoServices")
    assert r.json() == {"ok": True}
    assert get_route.call_count == 2
