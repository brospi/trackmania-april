import base64
import json
import time
from dataclasses import dataclass

import httpx

from .config import CORE_BASE

AUDIENCES = ("NadeoServices", "NadeoLiveServices")


@dataclass
class Token:
    access: str
    refresh: str
    exp: float


def _jwt_exp(token: str) -> float:
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))["exp"]


class NadeoClient:
    def __init__(self, http: httpx.Client, login: str, password: str):
        self._http = http
        self._auth = (login, password)
        self._tokens: dict[str, Token] = {}

    def _basic(self, audience: str) -> Token:
        r = self._http.post(
            f"{CORE_BASE}/v2/authentication/token/basic",
            auth=self._auth,
            json={"audience": audience},
        )
        r.raise_for_status()
        j = r.json()
        return Token(j["accessToken"], j["refreshToken"], _jwt_exp(j["accessToken"]))

    def _refresh(self, tok: Token) -> Token:
        r = self._http.post(
            f"{CORE_BASE}/v2/authentication/token/refresh",
            headers={"Authorization": f"nadeo_v1 t={tok.refresh}"},
        )
        r.raise_for_status()
        j = r.json()
        return Token(j["accessToken"], j["refreshToken"], _jwt_exp(j["accessToken"]))

    def token(self, audience: str) -> str:
        tok = self._tokens.get(audience)
        if tok is None:
            tok = self._basic(audience)
        elif tok.exp - time.time() < 60:
            try:
                tok = self._refresh(tok)
            except httpx.HTTPError:
                tok = self._basic(audience)
        self._tokens[audience] = tok
        return tok.access

    def get(self, url: str, audience: str, **kw) -> httpx.Response:
        headers = kw.pop("headers", {}) | {
            "Authorization": f"nadeo_v1 t={self.token(audience)}"
        }
        r = self._http.get(url, headers=headers, **kw)
        if r.status_code == 401:
            self._tokens.pop(audience, None)
            headers["Authorization"] = f"nadeo_v1 t={self.token(audience)}"
            r = self._http.get(url, headers=headers, **kw)
        r.raise_for_status()
        return r
