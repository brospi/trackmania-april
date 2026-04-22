import os
import sys

import httpx

from .auth import NadeoClient
from .maps import resolve_tracked_maps
from .snapshot import snapshot


def main() -> int:
    login = os.environ["NADEO_DEDI_LOGIN"]
    password = os.environ["NADEO_DEDI_PASSWORD"]
    pierre_login = os.environ.get("NADEO_PIERRE_LOGIN")
    pierre_password = os.environ.get("NADEO_PIERRE_PASSWORD")

    with httpx.Client(timeout=30.0) as http:
        bot = NadeoClient(http, login, password)
        pierre = (
            NadeoClient(http, pierre_login, pierre_password)
            if pierre_login and pierre_password
            else None
        )
        maps = resolve_tracked_maps(bot, pierre)
        changed = snapshot(bot, maps)

    print(f"tracked={len(maps)} changed={changed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
