from pathlib import Path

import yaml

from .auth import NadeoClient
from .config import CLUB_ID, CORE_BASE, LIVE_BASE, PIERRE_ID

EXTRA_MAPS_PATH = Path(__file__).parent.parent / "config" / "extra_maps.yml"


def from_club_campaigns(bot: NadeoClient) -> dict[str, str]:
    out: dict[str, str] = {}
    offset, page = 0, 75
    while True:
        r = bot.get(
            f"{LIVE_BASE}/api/token/club/{CLUB_ID}/campaign",
            audience="NadeoLiveServices",
            params={"length": page, "offset": offset},
        )
        body = r.json()
        items = body.get("clubCampaignList") or body.get("campaignList") or []
        for c in items:
            playlist = c.get("campaign", {}).get("playlist", []) or []
            for m in playlist:
                uid = m.get("mapUid") or m.get("uid")
                if uid:
                    if uid not in out or (not out[uid] and m.get("name")):
                        out[uid] = m.get("name") or ""
        if len(items) < page:
            break
        offset += page
    return out


def from_pierre_records(pierre: NadeoClient | None) -> dict[str, str]:
    if pierre is None:
        return {}
    r = pierre.get(
        f"{CORE_BASE}/v2/accounts/{PIERRE_ID}/mapRecords",
        audience="NadeoServices",
    )
    return {rec["mapId"]: "" for rec in r.json() if rec.get("mapId")}


def from_extras() -> dict[str, str]:
    if not EXTRA_MAPS_PATH.exists():
        return {}
    doc = yaml.safe_load(EXTRA_MAPS_PATH.read_text()) or {}
    return {m["map_uid"]: m.get("name", "") for m in (doc.get("maps") or [])}


def resolve_tracked_maps(
    bot: NadeoClient, pierre: NadeoClient | None
) -> dict[str, str]:
    merged: dict[str, str] = {}
    for src in (from_extras(), from_pierre_records(pierre), from_club_campaigns(bot)):
        for uid, name in src.items():
            if uid not in merged or (not merged[uid] and name):
                merged[uid] = name
    return merged
