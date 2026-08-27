# Thicket — Hosting Plan

The system is three deployable parts plus the node clients users run themselves.
Only the contracts are live today (Robinhood testnet). This plans the rest.

```
                       ┌─────────────────────────────┐
   users' browsers ───▶│  Frontend (Vercel)          │  static React/Vite
                       │  thicket.xyz                │  + wallet (ethers, direct to RPC)
                       └──────────────┬──────────────┘
                        /api/* rewrite│  (same-origin, no CORS)
                                      ▼
   users' node   ─────▶┌─────────────────────────────┐  FastAPI, long-running
   clients (their PCs) │  Coordinator (Railway/Render)│  holds state + publisher key
                       │  api.thicket.xyz            │  ├─ Postgres (state)
                       └──────────────┬──────────────┘  └─ scheduler (epoch close)
                                      │ publishRoot / slash / read bonds
                                      ▼
                       ┌─────────────────────────────┐
                       │  Contracts (Robinhood 4663) │  ✅ already live
                       └─────────────────────────────┘
```

## Where each part goes — and why

| Part | Host | Why |
|---|---|---|
| **Frontend** | **Vercel** | Static SPA; Vercel is ideal. `vercel.json` rewrites `/api/*` → the coordinator so the browser stays same-origin (no CORS). |
| **Coordinator** | **Railway** (rec.) or Render / Fly | Needs a **long-running** process + Postgres + a scheduler. Vercel functions are stateless/short-lived — they can't hold the node state or run epochs. Railway bundles service + Postgres + cron simplest. |
| **Contracts** | Robinhood testnet | Done. |
| **Node client** | Users' own machines | We don't host these — we distribute them. They point `COORDINATOR_URL` at `api.thicket.xyz`. |

## Two phases

**Phase A — public staging (fast, ~half a day)**
Get it reachable on the internet end-to-end.
- Frontend → Vercel, env vars set, `/api` rewrite → coordinator URL.
- Coordinator → Railway, **single instance**, current in-memory state, `COORDINATOR_PRIVATE_KEY` as a host secret (out of DRY mode).
- Epoch close → a Railway cron hitting `/epoch/close`, or a temporary manual call.
- **Caveat:** a restart wipes all contribution/epoch state, and you can run **only one instance** (in-memory state isn't shared). Fine for a demo, not for real users.

**Phase B — durable (the real thing)**
- **Persistence:** move coordinator state (nodes, contribution minutes, epochs, cumulative rewards) from the in-memory dict to **Postgres**; heartbeat freshness in **Redis**. This is the biggest code change and is what lets it restart safely and scale past one instance.
- **Scheduled epochs:** APScheduler (or host cron) closes epochs on a fixed cadence and publishes roots automatically.
- **Key management:** move `COORDINATOR_PRIVATE_KEY` to a KMS/secret manager; keep the publisher wallet funded with gas.
- **Hardening:** CORS locked to the Vercel domain, rate-limiting on `/register` + `/heartbeat`, health check endpoint, structured logs.

## Env var matrix

**Vercel (frontend, build-time `VITE_*`)**
```
VITE_CHAIN_ID=4663
VITE_RPC_URL=https://rpc.mainnet.chain.robinhood.com/rpc
VITE_TOKEN_ADDRESS=0xac2763ede29a967b490293f5276ac8042acb35c1
VITE_STAKING_ADDRESS=0x002497526d249f31f0ba5cb30627228c3b9b4e39
VITE_DISTRIBUTOR_ADDRESS=0xfe03bc178cff2149e84b4babb399083e31c637e2
```
**Coordinator host (runtime secrets)**
```
ROBINHOOD_RPC=https://rpc.mainnet.chain.robinhood.com/rpc
COORDINATOR_PRIVATE_KEY=0x…            # publisher/slasher (0x14aA…779C) — SECRET
STAKING_ADDRESS=0x002497526d249f31f0ba5cb30627228c3b9b4e39
DISTRIBUTOR_ADDRESS=0xfe03bc178cff2149e84b4babb399083e31c637e2
DATABASE_URL=postgres://…             # Phase B
REDIS_URL=redis://…                   # Phase B
```

## Code changes hosting will require (so nothing is a surprise)

- `vercel.json` with the `/api/*` → coordinator rewrite; set `frontend/` as the Vercel root, build `npm run build`, output `dist`.
- Frontend: point `coordinatorBase` at `/api` in prod (already is) — just ensure the rewrite target is the real coordinator URL.
- Coordinator: add CORS middleware, a `/health` endpoint, a `Procfile`/start command (`uvicorn app.main:app --host 0.0.0.0 --port $PORT`), pinned deps.
- **Phase B:** the Postgres/Redis refactor of `app/main.py` state + a scheduler module. Non-trivial — plan it as its own chunk.

## Trust & safety notes

- The coordinator holds the **publisher/slasher key** and is a **trusted component** in this hybrid MVP — it's not decentralized yet. Anyone running it can publish roots and slash. That's an accepted MVP trade-off, not a finished trust model.
- Keep the publisher wallet **separate** from your main deployer/treasury wallet in production, funded only with gas.
- Still **unaudited, testnet-only.** Public hosting doesn't change that — don't put real value behind it.

## Deploy steps (durable / Phase B)

Decided: **Railway** for the coordinator, **Postgres** for state (no Redis).

### 1. Coordinator → Railway
1. New Railway project → **Deploy from GitHub repo** (or `railway up` from `coordinator/`).
   Set the service **Root Directory** to `coordinator/`. Railway auto-detects Python
   (Nixpacks), installs `requirements.txt`, and runs the `Procfile`.
2. Add the **Postgres** plugin. Railway injects `DATABASE_URL` into the service automatically.
3. Set service variables:
   ```
   ROBINHOOD_RPC=https://rpc.mainnet.chain.robinhood.com/rpc
   COORDINATOR_PRIVATE_KEY=0x…            # publisher/slasher — SECRET
   STAKING_ADDRESS=0x002497526d249f31f0ba5cb30627228c3b9b4e39
   DISTRIBUTOR_ADDRESS=0xfe03bc178cff2149e84b4babb399083e31c637e2
   EPOCH_SECONDS=3600
   CORS_ORIGINS=https://<your-app>.vercel.app
   ```
4. Deploy. Confirm `GET https://<service>.up.railway.app/health` returns
   `{"status":"ok","dry":false,…}`. `dry:false` means the publisher key is set and roots
   post on-chain. Keep the publisher wallet funded with a little testnet ETH.
   **Run a single instance / 1 worker** — the epoch scheduler runs in-process (the Procfile
   pins `--workers 1`); multiple workers would double-publish.

### 2. Frontend → Vercel
1. Import the repo; set **Root Directory** to `frontend/`. Framework preset: Vite.
   (`vercel.json` already sets build `npm run build` → `dist`.)
2. Set Environment Variables (from `deployments/robinhood-testnet.json`):
   ```
   VITE_CHAIN_ID=4663
   VITE_RPC_URL=https://rpc.mainnet.chain.robinhood.com/rpc
   VITE_TOKEN_ADDRESS=0xac2763ede29a967b490293f5276ac8042acb35c1
   VITE_STAKING_ADDRESS=0x002497526d249f31f0ba5cb30627228c3b9b4e39
   VITE_DISTRIBUTOR_ADDRESS=0xfe03bc178cff2149e84b4babb399083e31c637e2
   VITE_COORDINATOR_URL=https://<service>.up.railway.app
   ```
   (Using `VITE_COORDINATOR_URL` is the simplest path — the browser calls the coordinator
   directly, so make sure `CORS_ORIGINS` on Railway lists your Vercel origin. Alternatively
   delete `VITE_COORDINATOR_URL` and edit `vercel.json`'s rewrite destination to the Railway
   host to stay same-origin.)
3. Deploy. Open the URL, connect wallet, bond, and watch earnings settle each epoch.

### 3. Node clients (users)
Distribute `node/`; users set `COORDINATOR_URL=https://<service>.up.railway.app` in `node/.env`.

## Cost sketch (testnet/staging)

- Vercel: free hobby tier is fine for the frontend.
- Railway/Render: ~$5–10/mo for a small always-on service + Postgres.
- Gas: the publisher wallet spends a little testnet ETH per epoch/slash (free from the faucet).
