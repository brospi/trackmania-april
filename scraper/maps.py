import json
import re
from pathlib import Path

import yaml

from .auth import NadeoClient
from .config import (
    CLUB_ID,
    CORE_BASE,
    LIVE_BASE,
    PIERRE_ID,
    PIERRE_RECORDS_LIMIT,
)

EXTRA_MAPS_PATH = Path(__file__).parent.parent / "config" / "extra_maps.yml"
MAPS_PATH = Path(__file__).parent.parent / "data" / "maps.json"
NAME_BATCH = 50

TM_FMT_RE = re.compile(r"\$(?:\$|[0-9a-fA-F]{3}|[lLhHpP]\[[^\]]*\]|[a-zA-Z])")


def clean_tm_name(raw: str) -> str:
    def _repl(m):
        return "$" if m.group() == "$$" else ""

    return TM_FMT_RE.sub(_repl, raw).strip()


def from_club_campaigns(client: NadeoClient) -> dict[str, str]:
    out: dict[str, str] = {}
    offset, page = 0, 75
    while True:
        r = client.get(
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
                    name = clean_tm_name(m.get("name") or "")
                    if uid not in out or (not out[uid] and name):
                        out[uid] = name
        if len(items) < page:
            break
        offset += page
    return out


def _mapuids_to_mapids(client: NadeoClient, uids: list[str]) -> set[str]:
    out: set[str] = set()
    for i in range(0, len(uids), NAME_BATCH):
        batch = uids[i : i + NAME_BATCH]
        r = client.get(
            f"{CORE_BASE}/maps/?mapUidList={','.join(batch)}",
            audience="NadeoServices",
        )
        for entry in r.json():
            mid = entry.get("mapId")
            if mid:
                out.add(mid)
    return out


def official_memberships(client: NadeoClient) -> dict[str, str]:
    """{mapId: campaign_name} for every map in an official seasonal campaign."""
    uid_to_campaign: dict[str, str] = {}
    offset, page = 0, 30
    while True:
        r = client.get(
            f"{LIVE_BASE}/api/token/campaign/official",
            audience="NadeoLiveServices",
            params={"length": page, "offset": offset},
        )
        body = r.json()
        items = body.get("campaignList", []) or []
        for c in items:
            cname = c.get("name", "")
            for m in c.get("playlist", []) or []:
                uid = m.get("mapUid")
                if uid:
                    uid_to_campaign[uid] = cname
        if len(items) < page:
            break
        offset += page

    if not uid_to_campaign:
        return {}

    mapid_to_campaign: dict[str, str] = {}
    all_uids = list(uid_to_campaign)
    for i in range(0, len(all_uids), NAME_BATCH):
        batch = all_uids[i : i + NAME_BATCH]
        r = client.get(
            f"{CORE_BASE}/maps/?mapUidList={','.join(batch)}",
            audience="NadeoServices",
        )
        for entry in r.json():
            mid = entry.get("mapId")
            muid = entry.get("mapUid")
            if mid and muid:
                mapid_to_campaign[mid] = uid_to_campaign[muid]
    return mapid_to_campaign


def from_pierre_records(client: NadeoClient) -> dict[str, str]:
    r = client.get(
        f"{CORE_BASE}/v2/accounts/{PIERRE_ID}/mapRecords/",
        audience="NadeoServices",
    )
    records = r.json()[:PIERRE_RECORDS_LIMIT]
    return {rec["mapId"]: "" for rec in records if rec.get("mapId")}


def from_extras() -> dict[str, str]:
    if not EXTRA_MAPS_PATH.exists():
        return {}
    doc = yaml.safe_load(EXTRA_MAPS_PATH.read_text()) or {}
    return {m["map_uid"]: m.get("name", "") for m in (doc.get("maps") or [])}


def resolve_tracked_maps(
    client: NadeoClient,
) -> tuple[dict[str, str], dict[str, str]]:
    """Return ({mapId: name_hint}, {mapId: campaign_name})."""
    tracked: dict[str, str] = {}
    for src in (
        from_extras(),
        from_pierre_records(client),
        from_club_campaigns(client),
    ):
        for uid, name in src.items():
            if uid not in tracked or (not tracked[uid] and name):
                tracked[uid] = name

    memberships = official_memberships(client)
    for uid in memberships:
        tracked.setdefault(uid, "")
    return tracked, memberships


def load_cached_maps() -> dict:
    if not MAPS_PATH.exists():
        return {}
    try:
        return json.loads(MAPS_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _is_complete(entry: object) -> bool:
    return (
        isinstance(entry, dict)
        and bool(entry.get("name"))
        and "authorScore" in entry
    )


def enrich_maps(
    client: NadeoClient,
    tracked: dict[str, str],
    cached: dict,
    memberships: dict[str, str] | None = None,
) -> dict[str, dict]:
    """Return {mapId: {name, campaign?, authorScore, goldScore, silverScore, bronzeScore}}.

    Cached entries are reused when complete; everything else is fetched.
    """
    memberships = memberships or {}
    result: dict[str, dict] = {}
    unresolved: list[str] = []
    for uid in tracked:
        entry = cached.get(uid)
        if _is_complete(entry):
            result[uid] = dict(entry)
        else:
            unresolved.append(uid)

    for i in range(0, len(unresolved), NAME_BATCH):
        batch = unresolved[i : i + NAME_BATCH]
        r = client.get(
            f"{CORE_BASE}/maps/?mapIdList={','.join(batch)}",
            audience="NadeoServices",
        )
        for entry in r.json():
            mid = entry.get("mapId")
            if not mid:
                continue
            result[mid] = {
                "name": clean_tm_name(entry.get("name") or ""),
                "authorScore": entry.get("authorScore"),
                "goldScore": entry.get("goldScore"),
                "silverScore": entry.get("silverScore"),
                "bronzeScore": entry.get("bronzeScore"),
            }

    for uid, src_name in tracked.items():
        if uid not in result:
            result[uid] = {"name": src_name}
        elif not result[uid].get("name") and src_name:
            result[uid]["name"] = src_name

    for uid, cname in memberships.items():
        if uid in result and cname:
            result[uid]["campaign"] = cname

    return result
