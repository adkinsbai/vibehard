# Cloud KiCad Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each VibeHard account and project its own persistent, cloud-hosted KiCad desktop, reachable only through authenticated project APIs and a one-time-ticket WebSocket gateway.

**Architecture:** Keep the current local broker as the process inside each project container. A host-side manager starts one container per `(owner, project)`, stores tickets centrally, forwards project actions, and routes browser RFB traffic to that container. Next retains login/project authorization; nginx routes only the WebSocket path to the manager.

**Tech Stack:** Python 3 + aiohttp + SQLite, Docker Engine on the existing Linux server, KiCad/TigerVNC in an Ubuntu 26.04 image, Next.js route handler, noVNC, nginx.

## Global Constraints

- User accounts do not jointly edit projects. Each account can access only its own projects. Multiple tabs for one account/project reconnect to one desktop.
- Current production is `20260925-llm-model-discovery-v2`, newer than this Git branch; preserve its complete source and protected frontend overlay when packaging a candidate. Never replace the active release with this branch alone.
- Server inventory on 2026-09-25: Docker 24, 2 CPU, 7.4 GiB RAM, no swap, about 12 GiB free disk. Measure three-session capacity before advertising three-user concurrency.
- Keep the existing local broker owner guard. Do not place passwords, bearer tokens, `.env` contents, real account data or production logs in Git or test output.
- EDA containers must run as non-root, have a private network and per-project volume, and not expose a public VNC port. The host-side manager is the only Docker controller.
- An EDA release must pass cross-account denial, ticket expiry/replay, save/restart recovery, three-account concurrency, and same-saved-source ERC/DRC/archive checks before production activation.

## File responsibilities

| File | Responsibility |
| --- | --- |
| `services/eda-desktop/server.py` | Existing per-project KiCad worker; add explicit container bind and health endpoint without weakening local owner guard. |
| `services/eda-desktop/Dockerfile` | Reproducible non-root worker image with KiCad and VNC dependencies. |
| `services/eda-desktop/manager.py` | Authenticated manager HTTP/WS, session/ticket store, Docker lifecycle and quotas. |
| `services/eda-desktop/test_manager.py` | Fake-Docker and fake-worker security/lifecycle regression tests. |
| `lib/server/eda-desktop.ts` | Select trusted local adapter or cloud manager; never send manager token to browser. |
| `app/api/eda/desktop/[id]/route.ts` | Preserve `requestUser` + `ownedProject`; surface cloud errors without local-only wording. |
| `__tests__/eda-desktop-api.test.ts` | Verify production manager routing and authorization. |
| `deploy/nginx/vibehard-eda.location.conf` | Exact same-origin WebSocket proxy location with no ticket query logging. |
| `docs/eda-desktop.md`, `.ai/PROJECT_STATUS.md`, `.ai/TASK_LOG.md` | Deployment contract, measured acceptance and honest status. |

---

### Task 1: Worker image and contained broker

**Files:** Modify `services/eda-desktop/server.py`; create `services/eda-desktop/Dockerfile`; test `services/eda-desktop/test_server.py`.

**Interfaces:** `GET /health` returns `{"ok": true}` without exposing paths; `EDA_DESKTOP_BIND=0.0.0.0` is accepted only with `EDA_DESKTOP_CONTAINER=1`; default remains `127.0.0.1`.

- [ ] Add a test asserting `container_bind()` defaults to loopback and rejects a public bind without container mode; run `python -m unittest discover -s services/eda-desktop -p test_server.py` and observe the new test fail.
- [ ] Implement `container_bind()` and `/health`, keeping bearer protection on `/v1/projects/*` and the origin/ticket rules on `/client/ws`; rerun the same test and expect all cases to pass.
- [ ] Add an Ubuntu 26.04 Dockerfile that installs the same KiCad major version as the local catalog plus `tigervnc-standalone-server`, `openbox`, `python3-aiohttp`, `xdotool`, `xauth`, `dbus-x11`, and CJK fonts. Set a fixed non-root UID, `EDA_DESKTOP_CONTAINER=1`, `/data` volume, and `server.py` entrypoint.
- [ ] On an isolated build host or production host before activation, run `docker build -t vibehard-eda-worker:<git-sha> services/eda-desktop`, then `docker run --rm ... kicad-cli --version`; require KiCad 9 before accepting the image. Record image digest and bytes used.
- [ ] Commit as `feat(eda): package isolated KiCad worker`.

### Task 2: Private manager, ownership-scoped tickets and WebSocket routing

**Files:** Create `services/eda-desktop/manager.py`, `services/eda-desktop/test_manager.py`.

**Interfaces:** `POST /v1/projects/{owner}/{project}` accepts the existing `DesktopAction` JSON and a manager-only bearer token. `GET /client/ws?ticket=...` requires allowed Origin, a valid platform session cookie verified through the current platform `/api/auth/session`, and a one-time ticket bound to owner/project/container. The manager binds only loopback and the Docker bridge gateway; it never accepts a client-supplied filesystem path or container address.

- [ ] Write fake-Docker tests for UUID/path rejection, different `(owner, project)` yielding different container names and roots, one container reused for same project, global capacity returning 429, stop affecting only its project, and restart recovering saved files. Run `python -m unittest discover -s services/eda-desktop -p test_manager.py` and confirm the tests fail before implementation.
- [ ] Write ticket tests for 60-second expiry, atomic single consumption, owner mismatch, and login-cookie mismatch. Use a temporary SQLite DB and fake platform session verifier; confirm failure before implementation.
- [ ] Implement `ProjectKey`, `DockerController`, `TicketStore`, and `Manager` with root-validated UUIDs, private per-project paths, per-worker random tokens, `docker run --network <internal-bridge> --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges --memory ... --memory-swap ... --cpus ... --pids-limit ...`, labels for recovery, readiness polling, and idle cleanup. Preserve existing worker action response shapes.
- [ ] Implement WebSocket bidirectional binary forwarding through aiohttp; verify the cookie with the platform session endpoint before consuming the manager ticket, then obtain a fresh worker ticket and connect to the private worker. Disable URL-bearing access logs.
- [ ] Rerun manager and worker tests, verify `python -m compileall -q services/eda-desktop`, and commit as `feat(eda): manage private cloud KiCad sessions`.

### Task 3: Platform integration and explicit cloud errors

**Files:** Modify `lib/server/eda-desktop.ts`, `app/api/eda/desktop/[id]/route.ts`, `__tests__/eda-desktop-api.test.ts`, and the local error text in `components/eda/desktop-workbench.tsx` if it still assumes WSL.

**Interfaces:** Production reads `EDA_MANAGER_URL` and `EDA_MANAGER_TOKEN_FILE` on the server; development can keep `EDA_DESKTOP_URL` local. `desktopRequest(owner, project, action)` retains its signature and return type. The browser retains `/eda-desktop/ws` (plus configured base path).

- [ ] Add route tests that production requests with a valid owned project call the manager, unauthenticated/cross-project requests do not call it, and unavailable manager returns a 503 with a cloud-relevant message. Run targeted Vitest to see the new assertions fail.
- [ ] Implement production manager selection with a strict loopback URL and server-side token file; leave the local-only adapter unchanged for development. Preserve same-origin POST validation and error status from the manager.
- [ ] Run targeted Vitest, `pnpm exec tsc --noEmit`, targeted ESLint, and `NEXT_PUBLIC_BASE_PATH=/vibehard pnpm build`. Commit as `feat(eda): connect workbench to cloud session manager`.

### Task 4: Private deployment, candidate release and acceptance

**Files:** Create `deploy/nginx/vibehard-eda.location.conf`; update `docs/eda-desktop.md`, `.ai/PROJECT_STATUS.md`, `.ai/TASK_LOG.md`. Keep host credentials and systemd environment outside Git.

**Interfaces:** nginx exact path `/vibehard/eda-desktop/ws` forwards WebSocket upgrades to the manager on the host Docker bridge address; all other `/vibehard/` traffic remains on Next port 3210. The manager control port is never publicly reachable.

- [ ] Build worker image and create its internal Docker bridge; start the manager as a separate systemd service on the target server with a dedicated data root and root-only manager token. Record actual image digest, memory, CPU and disk usage. Confirm unauthenticated control API returns 401 and public network cannot reach worker/manager control ports.
- [ ] Assemble a candidate Next release by applying reviewed EDA files to the current active release's complete `source` and overlay, rather than replacing it with this branch. Run platform migrations only if the diff actually needs them. Start candidate on port 3211, run existing frontend release verification, and confirm protected PCB/Demo/admin surfaces remain intact.
- [ ] Add the exact nginx WebSocket location after `nginx -t`, and reload without changing unrelated routes; verify TLS WebSocket upgrade, cookie denial, ticket replay denial, and that the old platform remains healthy.
- [ ] Use three ordinary test accounts, each with an owned test project, to place/save different KiCad changes in three simultaneous sessions. Test two tabs on one project, two projects for one account, cross-account project denial, disconnect/reconnect, manager/worker restart, ZIP hashes, ERC/DRC and saved-source consistency. Do not call this complete if capacity or data-isolation checks fail.
- [ ] Activate the candidate release only after the checks above, preserve the previous unit/release for rollback, and update status/docs with exact measured evidence. Open/attach a PR for the reviewed branch when GitHub access is available.
