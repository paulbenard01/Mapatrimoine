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
MAX_TRANSFER = 180.0

log = logging.getLogger(__name__)


class FetchError(Exception):
    pass


class PoliteClient:
    def __init__(
        self,
        cache_dir: Path = CACHE_DIR,
        min_interval: float = MIN_INTERVAL,
        first_backoff: float = 2.0,
    ):
        self.cache_dir = cache_dir
        self.min_interval = min_interval
        self.first_backoff = first_backoff
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
        delay = self.first_backoff
        for attempt in range(1, retries + 1):
            self._throttle()
            try:
                resp = self.session.get(url, timeout=(15, 60), allow_redirects=True, stream=True)
                body = self._read(resp) if resp.status_code == 200 else b""
            except (requests.RequestException, TimeoutError) as exc:
                status = f"network error {exc.__class__.__name__}"
            else:
                if resp.status_code == 200:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(body)
                    return body
                status = f"HTTP {resp.status_code}"
                if resp.status_code in (404, 410):
                    break  # permanent: retrying would only add load
                # 403 is retried: culture.gouv.fr answers 403 for a while after bursts.
            log.warning("fetch %s failed (%s), attempt %d/%d", url, status, attempt, retries)
            if attempt < retries:
                time.sleep(delay)
                delay *= 2
        raise FetchError(f"{url}: {status}")

    def _read(self, resp: requests.Response) -> bytes:
        """Read the body, giving up if the whole transfer exceeds MAX_TRANSFER seconds
        (the server sometimes trickles bytes, which per-read timeouts never catch)."""
        started, chunks = time.monotonic(), []
        for chunk in resp.iter_content(64 * 1024):
            chunks.append(chunk)
            if time.monotonic() - started > MAX_TRANSFER:
                resp.close()
                raise TimeoutError(f"transfer slower than {MAX_TRANSFER}s")
        return b"".join(chunks)

    def _throttle(self) -> None:
        wait = self._last + self.min_interval - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()
