"""Send a JSON file to the local service without displaying its API key."""
import json
from pathlib import Path
import sys
import urllib.request

runtime = Path(__file__).resolve().parent / ".runtime"
payload = json.loads(Path(sys.argv[1]).read_text())
request = urllib.request.Request(
    "http://127.0.0.1:8766/v1/systemone",
    data=json.dumps(payload, ensure_ascii=False).encode(),
    headers={"Content-Type": "application/json", "Authorization": "Bearer " + (runtime / "api-key").read_text().strip()},
)
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
with opener.open(request, timeout=60) as response:
    print(json.dumps(json.load(response), ensure_ascii=False, indent=2))
