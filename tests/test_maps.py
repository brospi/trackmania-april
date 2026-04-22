import httpx

from scraper import maps as m
from scraper.config import CLUB_ID, CORE_BASE, LIVE_BASE, PIERRE_ID
from tests.conftest import basic_response


def test_club_campaigns_paginates(client, respx_mock):
    respx_mock.post(f"{CORE_BASE}/v2/authentication/token/basic").mock(
        return_value=basic_response()
    )
    page1 = {
        "clubCampaignList": [
            {"campaign": {"playlist": [{"mapUid": f"uid{i}", "name": f"m{i}"}]}}
            for i in range(75)
        ]
    }
    page2 = {
        "clubCampaignList": [
            {"campaign": {"playlist": [{"mapUid": "uidZ", "name": "Z"}]}}
        ]
    }
    respx_mock.route(
        method="GET",
        url__startswith=f"{LIVE_BASE}/api/token/club/{CLUB_ID}/campaign",
    ).mock(
        side_effect=[
            httpx.Response(200, json=page1),
            httpx.Response(200, json=page2),
        ]
    )
    out = m.from_club_campaigns(client)
    assert len(out) == 76
    assert out["uid0"] == "m0"
    assert out["uidZ"] == "Z"


def test_extras_missing_file(monkeypatch, tmp_path):
    monkeypatch.setattr(m, "EXTRA_MAPS_PATH", tmp_path / "nope.yml")
    assert m.from_extras() == {}


def test_extras_reads_yaml(monkeypatch, tmp_path):
    p = tmp_path / "extra.yml"
    p.write_text("maps:\n  - map_uid: abc\n    name: A\n  - map_uid: def\n")
    monkeypatch.setattr(m, "EXTRA_MAPS_PATH", p)
    assert m.from_extras() == {"abc": "A", "def": ""}


def test_extras_no_maps_key(monkeypatch, tmp_path):
    p = tmp_path / "extra.yml"
    p.write_text("# empty\n")
    monkeypatch.setattr(m, "EXTRA_MAPS_PATH", p)
    assert m.from_extras() == {}


def test_resolve_unions_and_prefers_name(monkeypatch, tmp_path):
    extra = tmp_path / "e.yml"
    extra.write_text("maps:\n  - map_uid: shared\n    name: FromExtra\n")
    monkeypatch.setattr(m, "EXTRA_MAPS_PATH", extra)
    monkeypatch.setattr(
        m, "from_club_campaigns", lambda bot: {"shared": "", "club-only": "ClubName"}
    )
    monkeypatch.setattr(m, "from_pierre_records", lambda p: {"pierre-only": ""})
    out = m.resolve_tracked_maps(bot=None, pierre="stub")
    assert out == {
        "shared": "FromExtra",
        "pierre-only": "",
        "club-only": "ClubName",
    }


def test_resolve_without_pierre(monkeypatch, tmp_path):
    monkeypatch.setattr(m, "EXTRA_MAPS_PATH", tmp_path / "none.yml")
    monkeypatch.setattr(m, "from_club_campaigns", lambda bot: {"a": "A"})
    out = m.resolve_tracked_maps(bot=None, pierre=None)
    assert out == {"a": "A"}


def test_pierre_records(client, respx_mock):
    respx_mock.post(f"{CORE_BASE}/v2/authentication/token/basic").mock(
        return_value=basic_response()
    )
    respx_mock.get(f"{CORE_BASE}/v2/accounts/{PIERRE_ID}/mapRecords").mock(
        return_value=httpx.Response(
            200,
            json=[{"mapId": "uid1"}, {"mapId": "uid2"}, {"foo": "bar"}],
        )
    )
    assert m.from_pierre_records(client) == {"uid1": "", "uid2": ""}
