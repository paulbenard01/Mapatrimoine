"""Polite HTTP: descriptive User-Agent, <= 1 request/second, on-disk cache, retries."""

import hashlib
import logging
import time
from pathlib import Path

import requests

from pci import DATA

USER_AGENT = (
    "PCI-Map/0.1 (independent heritage-mediation project; "
    "+https://github.com/paulbenard01/Mapatrimoine)"
)
CACHE_DIR = DATA / "raw" / "http-cache"
MIN_INTERVAL = 1.0

log = logging.getLogger(__name__)


class FetchError(Exception):
    pass


class PoliteClient:
    def __init__(self, cache_dir: Path = CACHE_DIR, min_interval: float = MIN_INTERVAL):
        self.cache_dir = cache_dir
        self.min_interval = min_interval
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self._last = 0.0

    def cache_path(self, url: str) -> Path:
        return self.cache_dir / hashlib.sha256(url.encode()).hexdigest()[:24]

    def get(self, url: str, retries: int = 3, refresh: bool = False) -> bytes:
        """Return the body of `url`, from cache when present. Raises FetchError."""
        path = self.cache_path(url)
        if path.exists() and not refresh:
            return path.read_bytes()
        delay = 2.0
        for attempt in range(1, retries + 1):
            self._throttle()
            try:
                resp = self.session.get(url, timeout=60, allow_redirects=True)
            except requests.RequestException as exc:
                status = f"network error {exc.__class__.__name__}"
            else:
                if resp.status_code == 200:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(resp.content)
                    return resp.content
                status = f"HTTP {resp.status_code}"
                if resp.status_code in (403, 404, 410):
                    break  # permanent: retrying would only add load
            log.warning("fetch %s failed (%s), attempt %d/%d", url, status, attempt, retries)
            if attempt < retries:
                time.sleep(delay)
                delay *= 2
        raise FetchError(f"{url}: {status}")

    def _throttle(self) -> None:
        wait = self._last + self.min_interval - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()
