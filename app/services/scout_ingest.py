"""
Phase 15A — ingest booking codes from public web pages + share-code text.

SportyBet Code Hub is a client app (not a stable public JSON API), so we start with
community pages that already publish codes + odds, plus shareCode URL patterns.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from decimal import Decimal
from html import unescape

import httpx
from sqlalchemy.orm import Session

from app.config import Settings
from app.services.scout_codes import (
    purge_past_scouted_codes,
    purge_stale_web_listings,
    risk_band_for_odds,
    upsert_scouted_code,
)

# SportyBet-style short codes + optional odds nearby
CODE_TOKEN = re.compile(r"\b([A-Z0-9]{5,8})\b")
SHARE_CODE = re.compile(
    r"shareCode=([A-Za-z0-9]{4,12})",
    re.IGNORECASE,
)
ODDS_NEAR = re.compile(
    r"(?:odds|@)\s*[:=]?\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:odds|x)\b",
    re.IGNORECASE,
)
# Table-ish: DATE | CODE | ODDS
TABLE_ROW = re.compile(
    r"(?P<date>(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})"
    r".{0,40}?"
    r"(?P<code>[A-Z0-9]{5,8})"
    r".{0,40}?"
    r"(?P<odds>\d+(?:\.\d+)?)",
    re.IGNORECASE | re.DOTALL,
)
MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "sept": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

# Noise tokens that look like codes
SKIP_TOKENS = {
    "SPORTS",
    "FOOTBALL",
    "SOCCER",
    "TODAY",
    "CODES",
    "BOOKING",
    "SPORTY",
    "BET9JA",
    "NIGERIA",
    "UPDATE",
    "BEFORE",
    "READY",
    "LOAD",
    "VIP",
}


def _strip_html(html: str) -> str:
    text = re.sub(r"(?is)<script[^>]*>.*?</script>", " ", html)
    text = re.sub(r"(?is)<style[^>]*>.*?</style>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n+", "\n", text)
    return text


def _parse_date(raw: str) -> datetime | None:
    m = re.match(
        r"(?P<mon>[A-Za-z]+)\.?\s+(?P<day>\d{1,2}),?\s+(?P<year>\d{4})",
        (raw or "").strip(),
    )
    if not m:
        return None
    mon = MONTHS.get(m.group("mon").lower()[:4]) or MONTHS.get(m.group("mon").lower()[:3])
    if not mon:
        return None
    try:
        return datetime(
            int(m.group("year")),
            mon,
            int(m.group("day")),
            tzinfo=timezone.utc,
        )
    except ValueError:
        return None


def parse_public_code_page(
    text: str,
    *,
    bookmaker: str,
    source_label: str,
    source_url: str,
) -> list[dict]:
    """Extract {code, odds, scouted_at} dicts from page text."""
    found: dict[str, dict] = {}

    for m in TABLE_ROW.finditer(text):
        code = m.group("code").upper()
        if code in SKIP_TOKENS or not re.search(r"\d", code):
            # Prefer codes that mix letters+digits (typical SportyBet)
            if code in SKIP_TOKENS:
                continue
        try:
            odds = Decimal(m.group("odds"))
        except Exception:  # noqa: BLE001
            continue
        if odds < Decimal("1.01") or odds > Decimal("100000"):
            continue
        found[code] = {
            "code_text": code,
            "bookmaker": bookmaker,
            "combined_odds": odds,
            "scouted_at": _parse_date(m.group("date")),
            "source": "web",
            "source_label": source_label,
            "source_url": source_url,
            "title": f"{source_label} · {code}",
        }

    for m in SHARE_CODE.finditer(text):
        code = m.group(1).upper()
        if code in found:
            continue
        found[code] = {
            "code_text": code,
            "bookmaker": bookmaker,
            "combined_odds": None,
            "scouted_at": None,
            "source": "hub",
            "source_label": source_label,
            "source_url": source_url,
            "title": f"Share code {code}",
        }

    return list(found.values())


def _odds_from_blob(text: str) -> Decimal | None:
    for m in ODDS_NEAR.finditer(text or ""):
        raw = m.group(1) or m.group(2)
        if not raw:
            continue
        try:
            odds = Decimal(raw)
        except Exception:  # noqa: BLE001
            continue
        if Decimal("1.01") <= odds <= Decimal("100000"):
            return odds
    return None


def parse_twitter_style_text(
    text: str,
    *,
    bookmaker: str = "sportybet",
    source_label: str = "Twitter",
) -> list[dict]:
    """Pull shareCode=… and nearby odds from tipster-style posts."""
    blob_odds = _odds_from_blob(text)
    rows = parse_public_code_page(
        text,
        bookmaker=bookmaker,
        source_label=source_label,
        source_url="",
    )
    for r in rows:
        r["source"] = "twitter"
        if r.get("combined_odds") is None and blob_odds is not None:
            r["combined_odds"] = blob_odds
    # Also catch "NG: P6VBYM" style without URL
    for m in re.finditer(
        r"(?:NG|code|booking)\s*[:\-]?\s*([A-Z0-9]{5,8})",
        text,
        re.IGNORECASE,
    ):
        code = m.group(1).upper()
        if any(r["code_text"] == code for r in rows):
            continue
        if code in SKIP_TOKENS:
            continue
        rows.append(
            {
                "code_text": code,
                "bookmaker": bookmaker,
                "combined_odds": blob_odds,
                "scouted_at": None,
                "source": "twitter",
                "source_label": source_label,
                "source_url": None,
                "title": f"{source_label} · {code}",
            }
        )
    return rows


def _rss_item_texts(xml: str) -> list[str]:
    """Very small RSS/Atom extractor — title + description/content per item."""
    chunks: list[str] = []
    # Prefer <item>…</item> then <entry>…</entry>
    for block in re.findall(r"(?is)<item\b[^>]*>.*?</item>", xml):
        parts = re.findall(
            r"(?is)<(?:title|description|content:encoded|content)\b[^>]*>(.*?)</(?:title|description|content:encoded|content)>",
            block,
        )
        text = " ".join(_strip_html(p) for p in parts)
        if text.strip():
            chunks.append(text)
    if chunks:
        return chunks
    for block in re.findall(r"(?is)<entry\b[^>]*>.*?</entry>", xml):
        parts = re.findall(
            r"(?is)<(?:title|summary|content)\b[^>]*>(.*?)</(?:title|summary|content)>",
            block,
        )
        text = " ".join(_strip_html(p) for p in parts)
        if text.strip():
            chunks.append(text)
    return chunks


def configured_twitter_targets(settings: Settings) -> list[dict[str, str]]:
    """
    Parse SCOUT_TWITTER_HANDLES.

    Formats (comma-separated):
      sportybet:SportyBet
      bet9ja:SomeTipster
      nairabet:Handle
      SportyBet              → defaults to sportybet (legacy)
      both:SomeTipster      → ingest once; book detected from tweet text
    """
    raw = (getattr(settings, "scout_twitter_handles", None) or "").strip()
    if not raw:
        return []
    out: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for part in raw.split(","):
        part = part.strip().lstrip("@")
        if not part:
            continue
        book = "sportybet"
        handle = part
        if ":" in part:
            left, right = part.split(":", 1)
            left_l = left.strip().lower()
            right = right.strip().lstrip("@")
            if left_l in ("sportybet", "bet9ja", "nairabet", "betking", "both"):
                book = left_l
                handle = right
            elif right.lower() in ("sportybet", "bet9ja", "nairabet", "betking", "both"):
                # Handle:book alternate
                handle = left.strip().lstrip("@")
                book = right.lower()
            else:
                handle = right or left
        if not handle:
            continue
        key = (book, handle.lower())
        if key in seen:
            continue
        seen.add(key)
        out.append({"bookmaker": book, "handle": handle})
    return out


def detect_bookmaker_from_text(text: str, default: str = "sportybet") -> str:
    t = (text or "").lower()
    if "bet9ja" in t or "bet 9ja" in t:
        return "bet9ja"
    if "nairabet" in t or "naira bet" in t:
        return "nairabet"
    if "betking" in t or "bet king" in t:
        return "betking"
    if "sportybet" in t or "sporty bet" in t or "sporty" in t:
        return "sportybet"
    if default == "both":
        return "sportybet"
    return default or "sportybet"


def configured_twitter_rss_templates(settings: Settings) -> list[str]:
    raw = (getattr(settings, "scout_twitter_rss_templates", None) or "").strip()
    if not raw:
        return [
            "https://xcancel.com/{user}/rss",
            "https://nitter.privacydev.net/{user}/rss",
        ]
    return [t.strip() for t in raw.split(",") if t.strip() and "{user}" in t]


def fetch_rss_xml(url: str, *, timeout: float = 18.0) -> str:
    headers = {
        "User-Agent": "BetScoutCodeScout/1.0 (+https://github.com/bet-scanner)",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    }
    with httpx.Client(timeout=timeout, follow_redirects=True, headers=headers) as client:
        resp = client.get(url)
        resp.raise_for_status()
        return resp.text


def ingest_twitter_handles(db: Session, settings: Settings) -> tuple[int, list[str]]:
    """
    Free path: poll curated X handles via public RSS mirrors (Nitter/xcancel-style).
    Supports sportybet / bet9ja / other books via book:handle entries.
    """
    targets = configured_twitter_targets(settings)
    if not targets:
        return 0, []

    templates = configured_twitter_rss_templates(settings)
    skip_lottery = bool(getattr(settings, "scout_twitter_skip_lottery", True))
    tz_name = getattr(settings, "app_timezone", None) or "Africa/Lagos"
    upserted = 0
    used: list[str] = []

    for target in targets:
        handle = target["handle"]
        book_pref = target["bookmaker"]
        xml: str | None = None
        for tmpl in templates:
            url = tmpl.replace("{user}", handle)
            try:
                xml = fetch_rss_xml(url)
                if "<item" in xml.lower() or "<entry" in xml.lower():
                    break
                xml = None
            except Exception:  # noqa: BLE001
                xml = None
                continue
        if not xml:
            continue

        label = f"@{handle}"
        got_any = False
        for text in _rss_item_texts(xml):
            book = (
                detect_bookmaker_from_text(text, book_pref)
                if book_pref == "both"
                else book_pref
            )
            # Still prefer tweet text when it clearly names another NG book
            detected = detect_bookmaker_from_text(text, book)
            if book_pref not in ("both",) and detected in ("bet9ja", "sportybet", "nairabet", "betking"):
                # If tweet explicitly names a book, trust that over the handle default
                if detected != book and (
                    "bet9ja" in text.lower()
                    or "sporty" in text.lower()
                    or "nairabet" in text.lower()
                    or "betking" in text.lower()
                ):
                    book = detected
            rows = parse_twitter_style_text(
                text,
                bookmaker=book,
                source_label=label,
            )
            for row in rows:
                band = risk_band_for_odds(row.get("combined_odds"), row.get("folds"))
                if skip_lottery and band == "lottery":
                    continue
                saved = upsert_scouted_code(
                    db,
                    code_text=row["code_text"],
                    bookmaker=row["bookmaker"],
                    source="twitter",
                    source_label=f"{label} · {row['bookmaker']}",
                    source_url=f"https://x.com/{handle}",
                    folds=row.get("folds"),
                    combined_odds=row.get("combined_odds"),
                    title=row.get("title") or f"{label} · {row['code_text']}",
                    notes=(text[:400] if text else None),
                    scouted_at=row.get("scouted_at"),
                    tz_name=tz_name,
                )
                if saved is not None:
                    upserted += 1
                    got_any = True
        if got_any:
            used.append(f"{book_pref}:{label}")

    return upserted, used


def safe_refresh_scout(db: Session, settings: Settings) -> dict:
    """
    Best-effort scout refresh for Load matches / daily ops.
    Never raises — odds sync must not fail because Twitter mirrors are down.
    """
    try:
        tz_name = getattr(settings, "app_timezone", None) or "Africa/Lagos"
        stale = purge_stale_web_listings(db)
        n_web, s_web = ingest_web_sources(db, settings)
        n_tw, s_tw = ingest_twitter_handles(db, settings)
        purged = purge_past_scouted_codes(db, tz_name=tz_name)
        sources = list(dict.fromkeys([*s_web, *s_tw]))
        return {
            "ok": True,
            "upserted": n_web + n_tw,
            "sources": sources,
            "purged": purged + stale,
            "message": (
                f"Scout refreshed · {n_web + n_tw} same-day code(s), "
                f"{purged + stale} stale/past removed"
            ),
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "upserted": 0, "sources": [], "message": str(exc)}


def refresh_all_sources(db: Session, settings: Settings) -> tuple[int, list[str]]:
    purge_stale_web_listings(db)
    n1, s1 = ingest_web_sources(db, settings)
    n2, s2 = ingest_twitter_handles(db, settings)
    tz_name = getattr(settings, "app_timezone", None) or "Africa/Lagos"
    purge_past_scouted_codes(db, tz_name=tz_name)
    return n1 + n2, list(dict.fromkeys([*s1, *s2]))


def ingest_text_blob(
    db: Session,
    text: str,
    *,
    bookmaker: str = "sportybet",
    source_label: str = "Twitter paste",
    tz_name: str | None = None,
) -> int:
    rows = parse_twitter_style_text(text, bookmaker=bookmaker, source_label=source_label)
    n = 0
    for row in rows:
        saved = upsert_scouted_code(
            db,
            code_text=row["code_text"],
            bookmaker=row["bookmaker"],
            source=row.get("source") or "twitter",
            source_label=row.get("source_label"),
            source_url=row.get("source_url"),
            folds=row.get("folds"),
            combined_odds=row.get("combined_odds"),
            title=row.get("title"),
            notes=row.get("notes"),
            scouted_at=row.get("scouted_at"),
            tz_name=tz_name,
        )
        if saved is not None:
            n += 1
    return n


DEFAULT_WEB_SOURCES: list[dict[str, str]] = [
    {
        "url": "https://surecodes24.com/sportybet-booking-codes/",
        "bookmaker": "sportybet",
        "label": "SureCodes24",
    },
    {
        "url": "https://bettinginafrica.com/ng/sportybet-booking-codes-today",
        "bookmaker": "sportybet",
        "label": "BettingInAfrica",
    },
    {
        "url": "https://surecodes24.com/bet9ja-booking-codes/",
        "bookmaker": "bet9ja",
        "label": "SureCodes24 Bet9ja",
    },
]


def configured_web_sources(settings: Settings) -> list[dict[str, str]]:
    raw = (getattr(settings, "scout_web_sources", None) or "").strip()
    if not raw:
        return list(DEFAULT_WEB_SOURCES)
    out: list[dict[str, str]] = []
    for part in raw.split(";"):
        part = part.strip()
        if not part:
            continue
        # bookmaker|label|url
        bits = [b.strip() for b in part.split("|")]
        if len(bits) == 3:
            out.append({"bookmaker": bits[0].lower(), "label": bits[1], "url": bits[2]})
        elif part.startswith("http"):
            out.append({"bookmaker": "sportybet", "label": "Web", "url": part})
    return out or list(DEFAULT_WEB_SOURCES)


def fetch_url_text(url: str, *, timeout: float = 20.0) -> str:
    headers = {
        "User-Agent": "BetScoutCodeScout/1.0 (+https://github.com/bet-scanner)",
        "Accept": "text/html,application/xhtml+xml",
    }
    with httpx.Client(timeout=timeout, follow_redirects=True, headers=headers) as client:
        resp = client.get(url)
        resp.raise_for_status()
        return _strip_html(resp.text)


def ingest_web_sources(db: Session, settings: Settings) -> tuple[int, list[str]]:
    upserted = 0
    used: list[str] = []
    tz_name = getattr(settings, "app_timezone", None) or "Africa/Lagos"
    for src in configured_web_sources(settings):
        url = src["url"]
        label = src.get("label") or "Web"
        book = src.get("bookmaker") or "sportybet"
        try:
            text = fetch_url_text(url)
        except Exception:  # noqa: BLE001 — one bad source must not kill refresh
            continue
        rows = parse_public_code_page(
            text,
            bookmaker=book,
            source_label=label,
            source_url=url,
        )
        if not rows:
            continue
        used.append(label)
        for row in rows:
            tip_date = row.get("scouted_at")
            saved = upsert_scouted_code(
                db,
                code_text=row["code_text"],
                bookmaker=row["bookmaker"],
                source=row.get("source") or "web",
                source_label=row.get("source_label"),
                source_url=row.get("source_url"),
                folds=row.get("folds"),
                combined_odds=row.get("combined_odds"),
                title=row.get("title"),
                notes=row.get("notes"),
                scouted_at=tip_date,
                tz_name=tz_name,
                live_listing=True,
            )
            if saved is not None:
                upserted += 1
    return upserted, used
