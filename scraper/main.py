import os
import sys

import httpx

from .auth import NadeoClient
from .maps import enrich_maps, load_cached_maps, resolve_tracked_maps
from .snapshot import snapshot

DEFAULT_UA = "trackmania-april / https://github.com/brospi/trackmania-april"


def main() -> int:
    login = os.environ["NADEO_DEDI_LOGIN"]
    password = os.environ["NADEO_DEDI_PASSWORD"]
    user_agent = os.environ.get("NADEO_USER_AGENT", DEFAULT_UA)

    headers = {"User-Agent": user_agent}
    with httpx.Client(timeout=30.0, headers=headers) as http:
        client = NadeoClient(http, login, password)
        cached = load_cached_maps()
        tracked = resolve_tracked_maps(client)
        maps = enrich_maps(client, tracked, cached)
        changed = snapshot(client, maps)

    print(f"tracked={len(maps)} changed={changed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
