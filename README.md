# Bet Scanner (Phase 1) — Football fixtures API

You are building a football betting **decision** app, learning AI/backend engineering as you go.

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

## What you should understand after Phase 1

| Concept | Where it lives |
|---|---|
| Env config | `app/config.py` |
| DB models | `app/models/` |
| External API call | `app/services/football_data.py` |
| Upsert / sync | `app/services/sync_matches.py` |
| HTTP endpoint | `app/api/matches.py` |
| Cron script | `scripts/sync_matches.py` |

If a match day has no games in your competitions, `/matches/today` will correctly return `[]`.

---

## Phase roadmap (so you know what “next” means)

| Phase | Goal |
|---|---|
| **1 (now)** | Fixtures in DB + `/matches/today` + daily sync |
| 2 | Odds snapshots into `odds` |
| 3 | Simple ranking / risk profiles → write `tips` |
| 4 | Telegram or web UI |
| 5 | Auto-settle tips + performance history |
| 6 | LLM explanations (not predictions) |
| 7 | Better ML (LightGBM etc.) |

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
