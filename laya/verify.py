"""Real HTTP/inference smoke checks; synthetic cases are not a hardware benchmark."""
import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import statistics
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "laya" / ".runtime"
BASE = "http://127.0.0.1:8766"
KEY = (RUNTIME / "api-key").read_text().strip()
EXAMPLE = json.loads((ROOT / "laya/example.json").read_text())
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def call(path, payload=None, auth=True):
    headers = {"Content-Type": "application/json"}
    if auth:
        headers["Authorization"] = "Bearer " + KEY
    request = urllib.request.Request(BASE + path, headers=headers,
        data=None if payload is None else json.dumps(payload, ensure_ascii=False).encode())
    start = time.perf_counter()
    try:
        with OPENER.open(request, timeout=60) as response:
            return response.status, json.load(response), (time.perf_counter() - start) * 1000
    except urllib.error.HTTPError as error:
        return error.code, json.load(error), (time.perf_counter() - start) * 1000


code, health, _ = call("/health")
assert code == 200 and health["loaded"] == ["multilingual"] and health["device"] == "mps"
assert call("/v1/systemone", EXAMPLE, auth=False)[0] == 401
invalid = copy.deepcopy(EXAMPLE)
invalid["model"] = "english"
assert call("/v1/systemone", invalid)[0] == 422
oversized = copy.deepcopy(EXAMPLE)
oversized["state"] = "x" * 12001
assert call("/v1/systemone", oversized)[0] == 413
long_tokens = copy.deepcopy(EXAMPLE)
long_tokens["state"] = "x " * 2000
assert call("/v1/systemone", long_tokens)[0] == 422

rows = []
for expected, evidence in [
    ("supported", "该器件支持 I2C 通信。"),
    ("contradicted", "该器件仅支持 SPI，不支持 I2C。"),
    ("unknown", "该器件采用 QFN 封装。资料没有说明通信接口。"),
]:
    payload = copy.deepcopy(EXAMPLE)
    payload["state"]["evidence"] = evidence
    code, result, elapsed = call("/v1/systemone", payload)
    assert code == 200, result
    answer = result["answers"]["evidence_status"]
    rows.append({"expected": expected, "actual": answer["choice"],
                 "elapsed_ms": round(elapsed, 1), "probabilities": answer["probabilities"]})

times = []
for _ in range(10):
    code, result, elapsed = call("/v1/systemone", EXAMPLE)
    assert code == 200 and "evidence_status" in result["answers"]
    times.append(elapsed)
report = {
    "checked_at": datetime.now(timezone.utc).isoformat(),
    "health": health, "deployment": call("/deployment")[1],
    "checks": {"unauthenticated": 401, "unsupported_model": 422, "oversized": 413, "token_limit": 422},
    "synthetic_cases": rows,
    "synthetic_correct": sum(row["expected"] == row["actual"] for row in rows),
    "warm_http": {"n": 10, "p50_ms": round(statistics.median(times), 1),
                  "min_ms": round(min(times), 1), "max_ms": round(max(times), 1)},
    "limitation": "Tiny synthetic smoke test; not hardware selection accuracy or load validation.",
}
(RUNTIME / "verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(report, ensure_ascii=False, indent=2))
