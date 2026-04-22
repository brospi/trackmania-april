# trackmania-april

Private Trackmania club performance tracker for 2 players.

## Architecture

- **Scraper**: Python 3.12 job run by GitHub Actions on a 6h cron. Authenticates against the Nadeo API with a dedicated-server account and appends snapshots to `data/snapshots.json` only when a score changes.
- **Frontend**: static HTML + vanilla JS + Chart.js (CDN) served from `/docs` via GitHub Pages. Reads `data/*.json` by relative `fetch()`.
- **No database.** JSON in-repo is the source of truth; git history is the audit log.

## Auth

Ubisoft API auth was retired in April 2026, so the scraper uses a dedicated-server account.

- Credentials: GitHub Secrets `NADEO_DEDI_LOGIN` / `NADEO_DEDI_PASSWORD`
- Endpoint: `POST https://prod.trackmania.core.nadeo.online/v2/authentication/token/basic`
- Audiences: `NadeoLiveServices`, `NadeoServices`

## Scope

- Club id: `115307`
- Tracked players (`PLAYER_IDS`):
  - `ffbe6f24-3880-482a-a469-cdbf08eb9372` — Thibault
  - `d0fbaef3-fbce-440f-9c26-5a62694feb62` — Pierre
- Map set = union of:
  1. Maps from `/club/115307/campaigns`
  2. Pierre's recent records via `/v2/accounts/{id}/mapRecords`
  3. Hand-edited `config/extra_maps.yml`

## Layout

```
.github/workflows/   scrape + Pages deploy
scraper/             Python scraper (httpx, pyyaml)
tests/               pytest + respx
config/              extra_maps.yml, other static config
data/                snapshots.json and derived JSON read by the frontend
docs/                GitHub Pages site (dashboard, per-map, leaderboard)
```

## References

- [openplanet.dev docs](https://openplanet.dev/) — Nadeo API reference
