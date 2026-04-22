import datetime
import json
from pathlib import Path

from .auth import NadeoClient
from .config import CORE_BASE, PLAYER_IDS

SNAPSHOT_PATH = Path(__file__).parent.parent / "data" / "snapshots.json"
MAPS_PATH = Path(__file__).parent.parent / "data" / "maps.json"


def fetch_times(bot: NadeoClient, map_uid: str) -> dict[str, int | None]:
    r = bot.get(
        f"{CORE_BASE}/v2/mapRecords/",
        audience="NadeoServices",
        params={"accountIdList": ",".join(PLAYER_IDS), "mapId": map_uid},
    )
    by_player: dict[str, int | None] = {pid: None for pid in PLAYER_IDS}
    for rec in r.json():
        pid = rec.get("accountId")
        if pid in by_player:
            by_player[pid] = rec["recordScore"]["time"]
    return by_player


def _last_times(
    snapshots: list[dict], map_uid: str
) -> dict[str, int | None] | None:
    for entry in reversed(snapshots):
        if entry["map_uid"] == map_uid:
            return entry["times"]
    return None


def snapshot(bot: NadeoClient, maps: dict[str, str]) -> int:
    now = datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds")
    snapshots = json.loads(SNAPSHOT_PATH.read_text())
    changed = 0
    for uid in sorted(maps):
        times = fetch_times(bot, uid)
        last = _last_times(snapshots, uid)
        if last != times:
            snapshots.append({"ts": now, "map_uid": uid, "times": times})
            changed += 1
    if changed:
        SNAPSHOT_PATH.write_text(json.dumps(snapshots, indent=2) + "\n")
    MAPS_PATH.write_text(json.dumps(maps, indent=2, sort_keys=True) + "\n")
    return changed
