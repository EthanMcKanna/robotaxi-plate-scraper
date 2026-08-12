#!/usr/bin/env python3
"""Listen to the X filtered stream for @RtaxiTracker mentions and queue them
as pending vehicle submissions in the tracker's review queue.

The stream rule (already configured on the app) matches mentions, excluding
retweets. Each matching post becomes a `vehicleSubmissions` producer record
pushed to the Cloudflare Worker — deduplicated by tweet id via the ingest
idempotency key — so it shows up at robotaxitracker.com/review with the
post text, author, and any attached photos.

Env:
  X_BEARER_TOKEN            app bearer token (filtered-stream access)
  ROBOTAXI_INGEST_URL       e.g. https://robotaxi-api-v1.ethanmckanna.workers.dev
  ROBOTAXI_INGEST_SECRET    HMAC secret for producer robotaxi-plate-scraper
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import time
import urllib.error
import urllib.request

PRODUCER_ID = "robotaxi-plate-scraper"
STREAM_URL = (
    "https://api.x.com/2/tweets/search/stream"
    "?tweet.fields=created_at,author_id,attachments"
    "&expansions=author_id,attachments.media_keys"
    "&media.fields=url,preview_image_url,type"
    "&user.fields=username"
)

# Plate-ish token: 5-8 uppercase alphanumerics containing both letters and
# digits (XJR2490, 33204K4, 6EY854 …). Filters out plain words and numbers.
PLATE_RE = re.compile(r"\b(?=[A-Z0-9]{5,8}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]+\b")
NOT_PLATES = {"MODELY", "MODEL3", "MODELS", "MODELX", "CYBERCAB", "ROBOTAXI", "COVID19"}


def send_event(envelope: dict, idempotency_key: str) -> None:
    endpoint = os.environ["ROBOTAXI_INGEST_URL"].rstrip("/")
    secret = os.environ["ROBOTAXI_INGEST_SECRET"]
    body = json.dumps(envelope, separators=(",", ":"), ensure_ascii=False).encode()
    timestamp = str(int(time.time()))
    body_hash = hashlib.sha256(body).hexdigest()
    canonical = "\n".join((timestamp, PRODUCER_ID, idempotency_key, body_hash)).encode()
    signature = hmac.new(secret.encode(), canonical, hashlib.sha256).hexdigest()
    request = urllib.request.Request(
        f"{endpoint}/v1/ingest/events",
        data=body,
        method="POST",
        headers={
            "content-type": "application/json",
            "user-agent": f"{PRODUCER_ID}-xmentions/1.0",
            "idempotency-key": idempotency_key,
            "x-robotaxi-producer": PRODUCER_ID,
            "x-robotaxi-timestamp": timestamp,
            "x-robotaxi-signature": signature,
        },
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                result = json.loads(response.read())
            if result.get("accepted") is not True:
                raise RuntimeError("worker did not accept event")
            return
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2**attempt)


def parse_plates(text: str) -> list[str]:
    cleaned = re.sub(r"https?://\S+|@\w+|#\w+", " ", text.upper())
    return [t for t in PLATE_RE.findall(cleaned) if t not in NOT_PLATES]


def guess_provider(text: str) -> str:
    lower = text.lower()
    if "waymo" in lower:
        return "waymo"
    if "zoox" in lower:
        return "zoox"
    return "tesla"


def queue_mention(payload: dict) -> None:
    tweet = payload.get("data") or {}
    tweet_id = tweet.get("id")
    text = tweet.get("text") or ""
    if not tweet_id:
        return

    includes = payload.get("includes") or {}
    users = {u.get("id"): u.get("username") for u in includes.get("users") or []}
    username = users.get(tweet.get("author_id")) or "unknown"
    if username.lower() == "rtaxitracker":
        return  # ignore our own posts

    images = [
        m.get("url") or m.get("preview_image_url")
        for m in includes.get("media") or []
        if m.get("url") or m.get("preview_image_url")
    ]
    url = f"https://x.com/{username}/status/{tweet_id}"
    plates = parse_plates(text)
    now_ms = int(time.time() * 1000)
    record_id = f"xmention-{tweet_id}"

    record = {
        "_id": record_id,
        "_creationTime": now_ms,
        "plateNumber": plates[0] if plates else "",
        "provider": guess_provider(text),
        "status": "pending",
        "submittedAt": now_ms,
        "submittedBy": f"@{username} via X",
        "submitterNotes": f"X mention by @{username}: {text.strip()}\n{url}"
        + (f"\nOther plate candidates: {', '.join(plates[1:])}" if len(plates) > 1 else ""),
        "imageUrls": images,
        "source": "x-mention",
    }
    send_event(
        {
            "schemaVersion": 1,
            "type": "source.record",
            "idempotencyKey": record_id,
            "occurredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "dataset": "vehicleSubmissions",
            "record": record,
        },
        record_id,
    )
    print(f"[queued] @{username} {url} plate={plates[0] if plates else 'none'}", flush=True)


def stream_forever() -> None:
    bearer = os.environ["X_BEARER_TOKEN"]
    backoff = 5
    while True:
        request = urllib.request.Request(
            STREAM_URL, headers={"Authorization": f"Bearer {bearer}"}
        )
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                print("[stream] connected", flush=True)
                backoff = 5
                for raw in response:
                    line = raw.decode("utf-8", "replace").strip()
                    if not line:
                        continue  # keep-alive newline
                    try:
                        payload = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if payload.get("errors") and not payload.get("data"):
                        print(f"[stream] error payload: {json.dumps(payload)[:200]}", flush=True)
                        continue
                    try:
                        queue_mention(payload)
                    except Exception as exc:
                        print(f"[queue] failed for line: {exc}", flush=True)
        except urllib.error.HTTPError as exc:
            wait = 60 if exc.code == 429 else backoff
            print(f"[stream] HTTP {exc.code}; reconnecting in {wait}s", flush=True)
            time.sleep(wait)
            backoff = min(backoff * 2, 320)
        except Exception as exc:
            print(f"[stream] {type(exc).__name__}: {exc}; reconnecting in {backoff}s", flush=True)
            time.sleep(backoff)
            backoff = min(backoff * 2, 320)


if __name__ == "__main__":
    stream_forever()
