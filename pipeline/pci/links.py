"""`pci check-links`: report dead links in the research files (content/).

Polite like every fetch here: descriptive User-Agent, at most one request per second, a
streamed GET that is closed right after the status line (some sites refuse HEAD).
Nothing is cached or written: the command only prints what is broken.
"""

import logging
import time

import requests

from pci.http import MIN_INTERVAL, USER_AGENT

log = logging.getLogger(__name__)


def check_links(pairs: list[tuple[str, str]], session=None, interval: float = MIN_INTERVAL):
    """[(file, url, problem)] for each url that does not answer 2xx/3xx."""
    session = session or requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    status_by_url: dict[str, str | None] = {}
    broken, last = [], 0.0
    for label, url in pairs:
        if url not in status_by_url:
            wait = last + interval - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            last = time.monotonic()
            try:
                resp = session.get(url, timeout=(15, 30), allow_redirects=True, stream=True)
                resp.close()
                status_by_url[url] = None if resp.status_code < 400 else f"HTTP {resp.status_code}"
            except requests.RequestException as exc:
                status_by_url[url] = f"network error {exc.__class__.__name__}"
        if status_by_url[url]:
            broken.append((label, url, status_by_url[url]))
    return broken
