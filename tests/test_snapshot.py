import json

import httpx
import pytest

from scraper import snapshot as snap
from scraper.config import CORE_BASE, PLAYER_IDS
from tests.conftest import basic_response


@pytest.fixture
def data_files(monkeypatch, tmp_path):
    snap_path = tmp_path / "snapshots.json"
    snap_path.write_text("[]")
    maps_path = tmp_path / "maps.json"
    monkeypatch.setattr(snap, "SNAPSHOT_PATH", snap_path)
    monkeypatch.setattr(snap, "MAPS_PATH", maps_path)
    return snap_path, maps_path


def _records(times: dict):
    return [
        {"accountId": pid, "recordScore": {"time": t}}
        for pid, t in times.items()
        if t is not None
    ]


def _mock_basic(respx_mock):
    respx_mock.post(f"{CORE_BASE}/v2/authentication/token/basic").mock(
        return_value=basic_response()
    )


def _mock_records(respx_mock, times):
    respx_mock.route(
        method="GET", url__startswith=f"{CORE_BASE}/v2/mapRecords/"
    ).mock(return_value=httpx.Response(200, json=_records(times)))


def test_first_run_appends_and_writes_maps(client, respx_mock, data_files):
    snap_path, maps_path = data_files
    p1, p2 = list(PLAYER_IDS)
    times = {p1: 12345, p2: 23456}
    _mock_basic(respx_mock)
    _mock_records(respx_mock, times)

    maps = {"uid1": "Map One"}
    changed = snap.snapshot(client, maps)

    assert changed == 1
    data = json.loads(snap_path.read_text())
    assert len(data) == 1
    assert data[0]["map_uid"] == "uid1"
    assert data[0]["times"] == times
    assert json.loads(maps_path.read_text()) == maps


def test_unchanged_times_no_append(client, respx_mock, data_files):
    snap_path, _ = data_files
    p1, p2 = list(PLAYER_IDS)
    times = {p1: 100, p2: 200}
    snap_path.write_text(
        json.dumps([{"ts": "old", "map_uid": "uid1", "times": times}])
    )
    _mock_basic(respx_mock)
    _mock_records(respx_mock, times)

    changed = snap.snapshot(client, {"uid1": ""})
    assert changed == 0
    data = json.loads(snap_path.read_text())
    assert len(data) == 1


def test_one_player_improves(client, respx_mock, data_files):
    snap_path, _ = data_files
    p1, p2 = list(PLAYER_IDS)
    snap_path.write_text(
        json.dumps([{"ts": "old", "map_uid": "uid1", "times": {p1: 100, p2: 200}}])
    )
    _mock_basic(respx_mock)
    _mock_records(respx_mock, {p1: 100, p2: 190})

    changed = snap.snapshot(client, {"uid1": ""})
    assert changed == 1
    data = json.loads(snap_path.read_text())
    assert len(data) == 2
    assert data[-1]["times"] == {p1: 100, p2: 190}


def test_record_disappears_is_change(client, respx_mock, data_files):
    snap_path, _ = data_files
    p1, p2 = list(PLAYER_IDS)
    snap_path.write_text(
        json.dumps([{"ts": "old", "map_uid": "uid1", "times": {p1: 100, p2: 200}}])
    )
    _mock_basic(respx_mock)
    _mock_records(respx_mock, {p1: 100, p2: None})

    changed = snap.snapshot(client, {"uid1": ""})
    assert changed == 1
    data = json.loads(snap_path.read_text())
    assert data[-1]["times"] == {p1: 100, p2: None}


def test_fetch_times_handles_subset(client, respx_mock):
    p1, p2 = list(PLAYER_IDS)
    _mock_basic(respx_mock)
    _mock_records(respx_mock, {p1: 999})

    times = snap.fetch_times(client, "uid1")
    assert times == {p1: 999, p2: None}
