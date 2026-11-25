"""End-to-end checklist (PLAN.md Phase 7) against a RUNNING backend (+ frontend), e.g. after .\\run.ps1.

Usage (repo root):
    python backend/scripts/e2e_check.py                 # all checks
    python backend/scripts/e2e_check.py --skip-stream   # without waiting for a live digging alert

Checks
    1. /docs (OpenAPI) lists every endpoint
    2. upload one real official-test recording per class -> expected class and alert level (needs ml/data/raw)
    3. the live stream raises a digging alert (critical) within --stream-timeout seconds (speed 4x)
    4. events are stored; run again after restarting the backend to see the count carry over
    5. the frontend serves every page (if it is running)
Exit code 0 when everything passes.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

import httpx
import pandas as pd
import websockets

ROOT = Path(__file__).resolve().parents[2]
RAW_TEST = ROOT / "ml" / "data" / "raw" / "test"
INDEX = ROOT / "backend" / "app" / "data" / "demo_index.csv"
EXPECTED_LEVEL = {"dig": "critical", "knock": "warning", "shake": "warning", "walk": "info", "water": "info",
                  "background": "normal"}
ENDPOINTS = {"/api/health", "/api/predict", "/api/samples", "/api/samples/{sample_id}",
             "/api/samples/{sample_id}/prediction", "/api/explain/{sample_id}", "/api/metrics", "/api/events",
             "/api/events/stats"}
PAGES = ["/", "/analyze", "/events", "/models", "/about"]

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""), flush=True)


def per_class_files(per_class: int) -> list[tuple[str, Path]]:
    """The first `per_class` files of each class in the demo-pack index (official test split), in index order.
    Not filtered on correctness: if the model gets one wrong, the check fails and says so."""
    idx = pd.read_csv(INDEX)
    out = []
    for cls, g in idx.groupby("class_name", sort=False):
        for f in g["file"].head(per_class):
            folder = next(RAW_TEST.glob(f"*_{cls}"), None)
            if folder is not None and (folder / f).exists():
                out.append((cls, folder / f))
    return out


async def wait_for_dig(ws_url: str, timeout: float) -> tuple[bool, str]:
    async with websockets.connect(ws_url, max_size=2**22) as ws:
        await ws.send(json.dumps({"cmd": "speed", "value": 4}))
        deadline, seen = time.time() + timeout, 0
        try:
            while time.time() < deadline:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=max(1, deadline - time.time())))
                if msg.get("type") == "prediction":
                    seen += 1
                    if msg["predicted_class"] == "dig" and msg["alert_level"] == "critical":
                        return True, f"after {seen} windows, event {msg['event_id']}, {msg['confidence']:.1%}"
        except asyncio.TimeoutError:
            pass
        finally:
            await ws.send(json.dumps({"cmd": "speed", "value": 1}))
    return False, f"no digging alert in {seen} windows"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--web", default="http://localhost:3000")
    ap.add_argument("--per-class", type=int, default=3)
    ap.add_argument("--stream-timeout", type=float, default=120)
    ap.add_argument("--skip-stream", action="store_true")
    args = ap.parse_args()
    api = httpx.Client(base_url=args.api, timeout=60)

    print("\n1. API and docs")
    try:
        h = api.get("/api/health").json()
    except httpx.HTTPError as exc:
        print(f"  backend not reachable at {args.api}: {exc}")
        return 1
    check("backend healthy", h["status"] == "ok", f"model {h['model']}, {h['demo_samples']} samples")
    before = h["events_stored"]
    paths = set(api.get("/openapi.json").json()["paths"])
    check("/docs lists every REST endpoint", ENDPOINTS <= paths, f"{len(paths)} paths")
    check("/docs page served", api.get("/docs").status_code == 200)

    print("\n2. Upload one real recording per class")
    files = per_class_files(args.per_class)
    if not files:
        check("raw test files available", False, f"none under {RAW_TEST}")
    for cls, path in files:
        r = api.post("/api/predict", files={"file": (path.name, path.read_bytes())})
        if r.status_code != 200:
            check(f"{cls}: {path.name}", False, f"HTTP {r.status_code} {r.text[:80]}")
            continue
        p = r.json()
        ok = p["predicted_class"] == cls and p["alert_level"] == EXPECTED_LEVEL[cls]
        check(f"{cls:10s} -> {p['predicted_class']:10s} alert {p['alert_level']:8s}", ok,
              f"{p['confidence']:.1%}, {p['latency_ms']:.0f} ms, {path.name}")

    if not args.skip_stream:
        print("\n3. Live stream raises a digging alert")
        ws_url = args.api.replace("http", "ws", 1) + "/api/stream"
        ok, detail = asyncio.run(wait_for_dig(ws_url, args.stream_timeout))
        check("stream: digging -> critical alert", ok, detail)

    print("\n4. Events are stored")
    after = api.get("/api/health").json()["events_stored"]
    check("event count grew", after > before, f"{before} -> {after} events in the database")
    print("     (restart the backend and run again: the count must start from the previous total)")

    print("\n5. Frontend pages")
    try:
        web = httpx.Client(base_url=args.web, timeout=120)
        for page in PAGES:
            r = web.get(page)
            check(f"page {page}", r.status_code == 200 and "FiberGuard" in r.text, f"HTTP {r.status_code}")
    except httpx.HTTPError as exc:
        check("frontend reachable", False, str(exc))

    failed = [n for n, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed" + (f"; failed: {failed}" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
