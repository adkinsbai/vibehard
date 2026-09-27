"""Install this local deployment as the current user's macOS LaunchAgent."""
import os
from pathlib import Path
import plistlib
import secrets
import subprocess

root = Path(__file__).resolve().parents[1]
runtime = root / "laya/.runtime"
assert (runtime / "venv/bin/python").exists(), "Install the virtual environment first"
assert (runtime / "model/model.safetensors").exists(), "Download the pinned model first"
key = runtime / "api-key"
if not key.exists():
    fd = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as file:
        file.write(secrets.token_urlsafe(32))
config = {
    "Label": "tech.ldcx.laya",
    "ProgramArguments": [str(runtime / "venv/bin/python"), str(root / "laya/server.py")],
    "WorkingDirectory": str(root), "RunAtLoad": True,
    "KeepAlive": {"SuccessfulExit": False}, "ThrottleInterval": 30,
    "EnvironmentVariables": {"PYTHONUNBUFFERED": "1"},
    "StandardOutPath": str(runtime / "service.stdout.log"),
    "StandardErrorPath": str(runtime / "service.stderr.log"),
    "ProcessType": "Background",
}
destination = Path.home() / "Library/LaunchAgents/tech.ldcx.laya.plist"
destination.parent.mkdir(parents=True, exist_ok=True)
data = plistlib.dumps(config)
if destination.exists() and destination.read_bytes() != data:
    raise RuntimeError(f"Existing different configuration must be reviewed first: {destination}")
destination.write_bytes(data)
destination.chmod(0o644)
subprocess.run(["launchctl", "bootstrap", f"gui/{os.getuid()}", str(destination)], check=True)
print(f"Installed {destination}")
