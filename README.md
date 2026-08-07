# Bet Scanner — Football decision / surebet API

You are building a football betting **decision** app, learning AI/backend engineering as you go.

**Non-code docs** (guides, glossary, product notes) live in [`docs/`](./docs/).  
Start with the [Betting glossary](./docs/GLOSSARY.txt) if you’re new to betting terms.

**Easiest way to see data:** run the server, then open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) (simple dashboard).  
`/docs` is an advanced API test panel — see [`docs/HOW_TO_USE_DOCS.txt`](./docs/HOW_TO_USE_DOCS.txt).

This phase is only the **data spine**:
- Postgres tables: `matches`, `odds`, `tips`
- `GET /matches/today`
- A daily sync job that fills `matches` from [football-data.org](https://www.football-data.org/)

Odds, tip generation, ML, Telegram, and LLMs come in later phases.

---

## Folder map (what to open while learning)

```
bet-scanner/
├── app/
│   ├── main.py                 # FastAPI app entry
│   ├── config.py               # reads .env
│   ├── db.py                   # Postgres connection
│   ├── models/                 # database tables
│   ├── schemas/                # JSON shapes for the API
│   ├── api/matches.py          # HTTP routes
│   ├── services/
│   │   ├── football_data.py    # talks to external fixtures API
│   │   └── sync_matches.py     # upsert logic
│   └── ...
├── scripts/sync_matches.py     # cron entrypoint
├── docker-compose.yml          # local Postgres
├── .env.example
└── requirements.txt
```

---

## Database: cloud from day one (recommended)

We use **Supabase Postgres** now so you do **not** migrate later.

| Choice | Use it? |
|---|---|
| **Supabase** (default) | Yes — free tier, dashboard, same Postgres forever |
| Neon | Also fine (serverless Postgres) |
| Railway | Fine if you already host there |
| AWS RDS | Skip for now — more setup/cost than you need |
| Docker | Optional only; not required for this path |

The app only reads `DATABASE_URL`. Cloud or local = same code.

---

## Step-by-step setup (do these in order)

Project path:

```bash
cd "/Users/MAC/Desktop/next/bet-scanner"
```

### 1) Create a free football API key

1. Register: https://www.football-data.org/client/register  
2. Copy your API token  

### 2) Create a free Supabase Postgres database

1. Go to https://supabase.com → Sign up / Log in  
2. **New project** → name it e.g. `bet-scanner`  
3. Set a strong DB password (save it)  
4. Wait until the project is ready  
5. Open **Project Settings → Database**  
6. Copy the **URI** connection string (under Connection string)  
   - Prefer the **Session** pooler URI if shown (works well from a laptop)  
   - It looks like: `postgresql://postgres.[ref]:YOUR_PASSWORD@aws-0-....pooler.supabase.com:5432/postgres`

### 3) Put secrets in `.env`

```bash
cp .env.example .env
```

Edit `.env`:

```env
FOOTBALL_DATA_API_KEY=paste_your_football_token

# Important: add "+psycopg" after "postgresql" for our SQLAlchemy driver
DATABASE_URL=postgresql+psycopg://postgres.[ref]:YOUR_PASSWORD@aws-0-....pooler.supabase.com:5432/postgres
```

Example transform:

- From Supabase: `postgresql://postgres.xxx:pass@host:5432/postgres`  
- In `.env`: `postgresql+psycopg://postgres.xxx:pass@host:5432/postgres`

If your password has special characters (`@`, `#`, `%`), URL-encode them or reset to a simpler password.

### 4) Activate Python env

```bash
source .venv/bin/activate
# only if packages missing:
pip install -r requirements.txt
```

### 5) Run the API

```bash
uvicorn app.main:app --reload
```

Open interactive docs (best learning tool):

- http://127.0.0.1:8000/docs  
- http://127.0.0.1:8000/health  

### 6) Pull today’s matches, then list them

In the docs UI (or Postman):

1. `POST /matches/sync` → pulls fixtures into Postgres  
2. `GET /matches/today` → returns today’s matches  

Or from a terminal (with the server running):

```bash
curl -X POST http://127.0.0.1:8000/matches/sync
curl http://127.0.0.1:8000/matches/today
```

### 7) Run the daily job without the web server

```bash
source .venv/bin/activate
python scripts/sync_matches.py
```

Later you will schedule this with cron / a hosted cron worker.

---

## Phase 2 — multi-provider fixtures + odds

We do **not** depend on only football-data.org.

| Provider | Free? | Role |
|---|---|---|
| [football-data.org](https://www.football-data.org/) | Yes | Big-league calendars |
| [API-Football](https://dashboard.api-football.com/) | Yes (~100 req/day) | **Today + tomorrow** fixtures (incl. live) |
| [The Odds API](https://the-odds-api.com/) | Yes (~500 req/month) | Bookmaker **1X2 odds** snapshots |

Architecture (scalable later for SportyBet/Bet9ja):

```
providers/   → talk to external APIs, return shared shapes
services/    → save into Postgres
api/         → expose HTTP endpoints
```

### Extra keys for Phase 2

Add to `.env` (placeholders were appended if missing):

```env
API_FOOTBALL_KEY=...
ODDS_API_KEY=...
FIXTURE_PROVIDERS=football-data,api-football
```

### Phase 2 endpoints

1. `POST /matches/sync` — runs all enabled fixture providers  
2. `GET /matches/today` — after API-Football, useful for “on now / later today”  
3. `POST /odds/sync` — fill `odds` table (don't spam; free monthly quota)  
4. `GET /odds/latest` — read recent snapshots  

```bash
python scripts/sync_odds.py
```

### What to open while learning (Phase 2)

| Concept | File |
|---|---|
| Shared shapes | `app/providers/base.py` |
| football-data provider | `app/providers/football_data.py` |
| today/tomorrow provider | `app/providers/api_football.py` |
| odds provider | `app/providers/the_odds_api.py` |
| save matches | `app/services/match_store.py` |
| odds sync | `app/services/sync_odds.py` |
| odds HTTP | `app/api/odds.py` |

---

## Phase 3A — Arbitrage / surebets

| Endpoint | Purpose |
|---|---|
| `GET /arbitrage/scan` | Find 1X2 surebets from stored odds |
| `POST /arbitrage/calculate` | Split ₦ bankroll across legs |

```bash
python scripts/demo_arbitrage_math.py
```

Reminder: profit is locked only if **all legs** are placed at the shown odds before books move/void them.

---

## Phase 3C — Bankroll + Safe Builder (current)

Rules-based safer slips (not surebets):

| Endpoint | Purpose |
|---|---|
| `POST /bankroll/size` | ₦ unit from bankroll % |
| `GET /safe-builder/scan` | Apply underdog/fav/DC/flex rules to stored odds |
| `POST /safe-builder/evaluate` | Paste 1X2 odds → which rule fires |

```bash
python scripts/demo_safe_builder.py
```

Guide: `docs/PHASE_3C_SAFE_BUILDER.txt`

---

## Phase 4 — Tips hit-rate + Telegram (current)

| Endpoint | Purpose |
|---|---|
| `POST /tips/log-safe-scan` | Save Safe Builder picks into `tips` |
| `GET /tips` / `GET /tips/stats` | History + hit rate |
| `POST /tips/auto-settle` | Settle from finished match scores |
| `POST /telegram/test` | Optional Telegram alert |

Guide: `docs/PHASE_4_TIPS_TELEGRAM.txt`

---

## Phase 4.5 — Surebet ops

| Action | Purpose |
|---|---|
| Dashboard **Scan surebets** | Stake split using your Bankroll ₦ |
| **Stake plan / Copy** | Exact ₦ per leg + clipboard text |
| **Log surebets → tips** | Save arbs + optional Telegram |
| `POST /tips/log-arbitrage-scan` | Same via API |

Guide: `docs/PHASE_4_5_SUREBET_OPS.txt`

---

## Phase 5 — Value / EV tips (current)

Risked singles (not surebets): flag when a book is longer than de-vigged consensus fair odds.

| Endpoint / Action | Purpose |
|---|---|
| `GET /value/scan` | Cross-book +EV 1X2 picks + unit stake |
| `POST /value/evaluate` | Paste multi-book odds → fair probs / EV |
| `POST /tips/log-value-scan` | Log value tips + optional Telegram |
| Dashboard **Scan value** | Preview +EV table |

```bash
python scripts/demo_value_math.py
```

Guide: `docs/PHASE_5_VALUE_TIPS.txt`

---

## Phase roadmap

| Phase | Goal |
|---|---|
| 1 | Fixtures in DB + `/matches/today` + daily sync |
| 2 | Multi-provider fixtures + odds snapshots |
| 3A | Arbitrage scan + ₦ stake calculator |
| 3B | Nigerian book odds (SportyBet / Bet9ja via free odds-api.io) |
| 3C | Bankroll / unit sizing + Safe Builder (your underdog rules) |
| 4 | Tip logging, hit-rate, dashboard + optional Telegram |
| 4.5 | Surebet stake plans, copy stakes, arb tips + Telegram alerts |
| **5 (now)** | Value / EV tips (cross-book de-vig; AI models later) |

---

## Common errors

**`Missing FOOTBALL_DATA_API_KEY`**  
→ `.env` missing or still has `your_token_here`

**Connection refused to Postgres**  
→ `docker compose up -d` not running

**`[]` from `/matches/today` after sync**  
→ No fixtures today for PL/PD/SA/BL1/FL1, or sync failed — check the sync response message

**Rate limited (429)**  
→ Free tier limit — wait a minute; don’t hammer sync

---

## Learning tip

Change one thing at a time. Example practice tasks:

1. Add a query param `?competition=PL` to `/matches/today`  
2. Add `GET /matches/{id}`  
3. Print how many matches were finished vs scheduled in the sync script  

When you’re stuck, open `/docs` and the file named in the error traceback — that’s normal engineering, not failure.
