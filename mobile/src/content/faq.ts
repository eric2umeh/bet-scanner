export type FaqItem = {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'start-what',
    category: 'Getting started',
    question: 'What is Bet Scout?',
    answer:
      'Bet Scout helps you scan today’s football matches, find Safe picks, compare SportyBet and Bet9ja prices, log tips, track hit rate, and use advanced tools like value bets and arbitrage when you want them.',
    keywords: ['what', 'about', 'intro', 'purpose'],
  },
  {
    id: 'start-morning',
    category: 'Getting started',
    question: 'What should I do each morning?',
    answer:
      'Pull down on Home to sync odds and Safe picks (or run Daily update under Tools for fixtures + settle + brief). Tick tips you plan to place → Log selected. After matches finish, open Tips → Settle finished tips.',
    keywords: ['morning', 'routine', 'daily', 'workflow'],
  },
  {
    id: 'today-load',
    category: 'Home',
    question: 'How do I refresh odds and picks?',
    answer:
      'On Home, pull down to sync fresh SportyBet and Bet9ja odds from the server (uses your free odds-api.io quota). Safe picks and goal-market tips then appear on each match card.',
    keywords: ['load', 'real', 'bets', 'sync', 'odds'],
  },
  {
    id: 'today-open-book',
    category: 'Home',
    question: 'How do I open a match in my bookmaker app?',
    answer:
      'On Home, tap the book name with ↗ under a match (e.g. “SportyBet ↗” or “Bet9ja ↗”), or “Open in …” on the match screen. The label follows the book filter you picked, or the tip’s bookmaker. SportyBet opens /m/search?key=… so their site runs the search itself (browsers block us from typing into another site). Other books often lack a public search URL — we open football and copy the team name for paste. If several fixtures appear, pick the right one on the book.',
    keywords: ['sportybet', 'bet9ja', '1xbet', 'open', 'app', 'deep', 'link', 'search', 'place', 'bookmaker'],
  },
  {
    id: 'today-logged-filter',
    category: 'Home',
    question: 'What does the Logged checkbox do?',
    answer:
      'On Home, open Filters and set Logged to All / Logged only / Unlogged only. Use Unlogged when you want tips you have not logged yet.',
    keywords: ['logged', 'unlogged', 'filter', 'checkbox', 'struck', 'tips'],
  },
  {
    id: 'today-log',
    category: 'Home',
    question: 'How do I log tips from Home?',
    answer:
      'Tick one or more picks on match cards (same bookmaker for a multi). Turn on “Log as multi” if you want one accumulator slip. Tap Log selected — tips appear on the Tips tab.',
    keywords: ['log', 'selected', 'multi', 'accumulator', 'tick'],
  },
  {
    id: 'multi-odds',
    category: 'Home',
    question: 'Why don’t multi odds match SportyBet?',
      answer:
        'Bet Scout multi estimate multiplies each leg’s decimal odds. That matches a normal Multiple when each leg is a different match. Same-match legs (e.g. DC + O/U + BTTS) are correlated: SportyBet usually strikes out Multiple; Bet9ja and similar books either block related outcomes in a normal accumulator or push you to Bet Builder (re-priced, not odds × odds). Bet Scout disables Log as multi for same-match slips and logs singles. Always confirm live on your book.',
      keywords: ['multi', 'combined', 'odds', 'accumulator', 'bet builder', 'parlay', 'sportybet', 'bet9ja'],
    },
    {
      id: 'confidence-filter',
      category: 'Home',
      question: 'What does the Confidence % filter do?',
      answer:
        'Confidence % is how strongly the market prices one side shorter than the other (odds gap) — not a predicted win rate. On Home and Tips, open Filters (or Confidence on wide screens) and set ≥ 75 to hide weaker tips. Reset clears the filter.',
      keywords: ['confidence', 'lean', 'filter', 'percent', '75'],
    },
  {
    id: 'today-filter',
    category: 'Home',
    question: 'What do the market chips mean?',
    answer:
      'All shows every pick. Double chance / Winner are Safe Builder styles. O/U 0.5, 1.5, 2.5 are match totals. BTTS is both teams to score. Team 3+ is a side scoring 3 or more goals (team totals Over 2.5). Filter only hides picks on the list.',
    keywords: ['filter', 'chips', 'market', 'double chance', 'btts', 'over under', '0.5', '1.5', 'team'],
  },
  {
    id: 'goal-markets-winrate',
    category: 'Home',
    question: 'Which goal markets hit more often?',
    answer:
      'Over 0.5 (at least one goal) and Over 1.5 usually hit more often than Over 2.5, but odds are shorter. Under 0.5 (0-0) is rare so we skip it. Team scores 3+ is a longshot — only shown when the book heavily favours that side. Confidence % is not win probability; prefer Safe double chance for steadier results. Avoid U21/U23 accumulators.',
    keywords: ['win rate', 'over 0.5', 'over 1.5', 'under', 'team 3', 'confidence'],
  },
  {
    id: 'tips-tabs',
    category: 'Tips',
    question: 'What is Active vs History?',
    answer:
      'Active = bets still in play. When a match ends, tips auto-settle and move to History. History = won, lost, or void. On web, tap Delete on a card; on phone, swipe left to delete.',
    keywords: ['active', 'history', 'delete', 'swipe'],
  },
  {
    id: 'arb-how',
    category: 'Arbitrage',
    question: 'How do I use the Arb tab?',
    answer:
      'Refresh prices on Home first (↻). Open Arb → Find Nigeria surebets. Default scan: 1X2, O/U, BTTS, and team totals (both sides). International adds EU books (incl. O/U from the-odds-api). Copy or Log a stake plan; History keeps logged surebets.',
    keywords: ['arb', 'how', 'steps', 'stake', 'plan', 'surebet'],
  },
  {
    id: 'arb-empty',
    category: 'Arbitrage',
    question: 'Why are there no surebets?',
    answer:
      'True arbs are rare. Odds must be fresh, and tiny edges disappear fast. Refresh Home, then Find surebets closer to kickoff. The scanner needs ≥2 books with overlapping O/U, BTTS, or 1X2 prices — one book alone will never show a cross-book surebet. Youth, unknown (UNK), and lower-tier leagues are skipped because SportyBet/Bet9ja often lack the match or only offer a different O/U line (e.g. 3.5 instead of 2.5).',
    keywords: ['no', 'empty', 'rare', 'none', 'surebet', 'unk', 'youth', 'bet9ja'],
  },
  {
    id: 'arb-confirm-live',
    category: 'Arbitrage',
    question: 'Why can’t I find the surebet match or O/U 2.5 on SportyBet/Bet9ja?',
    answer:
      'Feeds can lag the live book. SportyBet may suspend 2.5 and only show 3.5; Bet9ja may hide lower-league fixtures from search. Always open each leg, confirm the same market line, and skip the arb if either book differs. We already hide many youth/UNK/lower-tier fixtures from Find Nigeria surebets.',
    keywords: ['sportybet', 'bet9ja', '2.5', '3.5', 'search', 'missing', 'confirm'],
  },
  {
    id: 'auth-key',
    category: 'Account',
    question: 'What is the app access key?',
    answer:
      'Not shown to regular users. When APP_API_KEY is set on Render, the web/app build should include EXPO_PUBLIC_APP_API_KEY (same value) so Refresh works automatically. Developers can also paste it under Account → Settings. It is not your login password. Or just sign in — a valid login also unlocks sync/settle.',
    keywords: ['access', 'key', 'api key', 'password', 'render', 'app_api_key'],
  },
  {
    id: 'bookmaker-pair',
    category: 'Odds & API',
    question: 'How do I set my bookmaker pair?',
    answer:
      '1) On odds-api.io dashboard, enable exactly 2 recreational books (e.g. SportyBet + Bet9ja). 2) In local .env and Render → Environment set ODDS_API_IO_BOOKMAKERS=SportyBet,Bet9ja (same spelling as the dashboard). 3) Restart/redeploy the API, then tap ↻ on Home.',
    keywords: ['bookmaker', 'pair', 'odds-api', 'sportybet', 'bet9ja', '1xbet', 'env'],
  },
  {
    id: 'safe-dog',
    category: 'Home',
    question: 'What is SAFE_DOG_HIGH?',
    answer:
      'Safe double chance only shows when the underdog price is at least this number (default 6), with no upper limit. Set SAFE_DOG_HIGH=6 in local .env and on Render → Environment, then restart/redeploy.',
    keywords: ['safe', 'dog', 'threshold', 'double chance', 'render'],
  },
  {
    id: 'today-refresh',
    category: 'Home',
    question: 'What does refresh (↻) do?',
    answer:
      'One action: update the upcoming match list and fetch live prices from your configured books, then rescan Safe and goal tips. There is no separate Sync fixtures / Load real bets button anymore.',
    keywords: ['refresh', 'sync', 'fixtures', 'load', 'real', 'bets'],
  },
  {
    id: 'tips-settle',
    category: 'Tips',
    question: 'How does auto-settle work?',
    answer:
      'Opening the Tips tab quietly settles finished games (no API quota). A score refresh from odds-api.io runs at most every 6 hours, or when you tap Settle finished tips. Postponed or cancelled matches void the tip automatically.',
    keywords: ['settle', 'auto', 'won', 'lost', 'finished'],
  },
  {
    id: 'today-youth',
    category: 'Home',
    question: 'Why does SportyBet only allow singles on some games?',
    answer:
      'Youth, reserve, and academy fixtures (U19, U23, etc.) are often singles-only on SportyBet — no accumulator and sometimes O/U or BTTS markets are disabled live even if our feed still had a price. Bet Scout now hides most youth/reserve O/U and BTTS picks after you refresh odds on Home. For first-team leagues you can usually combine legs in a multi; bet builder is a separate product on the book app.',
    keywords: ['u19', 'u23', 'youth', 'single', 'multi', 'accumulator', 'bet builder', 'disabled'],
  },
  {
    id: 'today-disabled',
    category: 'Home',
    question: 'Why do Home fixtures stop around mid-afternoon?',
    answer:
      'Odds sync uses ODDS_API_IO_EVENT_LIMIT (code max 300). A low value like 40 fills with the soonest kickoffs and drops evening games. Try 100–300, redeploy/restart, then Load matches. Higher uses more free-tier requests (~2 + events÷10 per sync). APP_TIMEZONE=Africa/Lagos is fine and not the cause.',
    keywords: ['3pm', 'evening', 'limit', 'event', 'cutoff', 'afternoon', 'ODDS_API_IO_EVENT_LIMIT'],
  },
  {
    id: 'today-disabled-markets',
    category: 'Home',
    question: 'Why do odds show here but are disabled on SportyBet?',
    answer:
      'We pull prices from odds-api.io, not directly from the SportyBet app. Markets can suspend after sync. We skip suspended API markets and youth leagues where O/U and BTTS are often off. Always confirm live in the book before staking.',
    keywords: ['disabled', 'suspended', 'stale', 'odds', 'sportybet'],
  },
  {
    id: 'arb-books',
    category: 'Arbitrage',
    question: 'Can I swap Bet9ja for another bookmaker?',
    answer:
      'Yes — on the free odds-api.io plan you pick any 2 recreational books in their dashboard, then set ODDS_API_IO_BOOKMAKERS in root .env (e.g. SportyBet,Bet9ja or SportyBet,1xBet). Restart the API and pull down on Home to refresh. True surebets stay rare; a second book with more overlapping fixtures helps more than a thin book.',
    keywords: ['bet9ja', 'betking', '1xbet', 'bookmaker', 'change', 'swap', 'odds-api'],
  },
  {
    id: 'tips-history',
    category: 'Tips',
    question: 'Where is my tip history?',
    answer:
      'Open Tips → History tab. Search by team or market, filter by date logged (YYYY-MM-DD), and tap Load more for older rows. Active shows only open (pending) tips. Tap Remove on any card to delete a log you no longer want.',
    keywords: ['history', 'search', 'delete', 'remove', 'confidence'],
  },
  {
    id: 'arb-what',
    category: 'Arbitrage',
    question: 'What is arbitrage (surebet)?',
    answer:
      'A surebet is when covering every mutually exclusive outcome of the same market (e.g. Over+Under 2.5, BTTS Yes+No, or Home+Draw+Away) costs less than 100% across different bookmakers. Stake the right amounts on each leg and you lock a small profit if all odds stay available.',
    keywords: ['arbitrage', 'surebet', 'arb', 'what', 'explain'],
  },
  {
    id: 'value-what',
    category: 'Value',
    question: 'What is a value pick?',
    answer:
      'A value pick means one book is offering a higher (better) price than the average of your books for the same outcome. Higher “better by %” looks more attractive — but you can still lose. Always check the price live before you bet.',
    keywords: ['value', 'ev', 'plus ev', 'edge', 'fair odds', 'better price'],
  },
  {
    id: 'value-how',
    category: 'Value',
    question: 'How do I use Value picks?',
    answer:
      'Open Tools → Value picks → Find better prices. Read the match, book, and suggested stake. Open that bookmaker, confirm the odds, place the bet yourself, then log it on Home/Tips if you want to track results.',
    keywords: ['value', 'scan', 'log', 'stake'],
  },
  {
    id: 'push-alerts',
    category: 'Account',
    question: 'How do phone push alerts work?',
    answer:
      'Sign in on the Android/iOS app → Account → Settings → turn on Push alerts. You can get a morning update when daily ops runs, and a note when your logged tips settle (won/lost/void). Browser web does not receive push; Telegram digests are separate (server config).',
    keywords: ['push', 'notification', 'alert', 'morning', 'settle', 'phone'],
  },
  {
    id: 'slip-compare',
    category: 'Tools',
    question: 'How does Compare slip work?',
    answer:
      'Paste your slip in plain text (team names + markets). The app looks up saved SportyBet and Bet9ja prices — it cannot open opaque booking codes by itself. You get per-leg prices and a best-mix combined odds estimate.',
    keywords: ['slip', 'compare', 'converter', 'booking', 'code', 'paste'],
  },
  {
    id: 'code-scout',
    category: 'Tools',
    question: 'What is Code Scout?',
    answer:
      'Scout is a main tab that lists booking codes for your preferred book (SportyBet or Bet9ja). Sources include public code sites and curated Twitter handles via free RSS mirrors (set SCOUT_TWITTER_HANDLES on the server). Codes without legs (or folds+odds) show Unverified — copy only; otherwise a confidence % appears. Filter with Good only to hide lottery odds. Copy a code into the bookmaker app. Tip history lives under Account.',
    keywords: ['scout', 'booking', 'code', 'sportybet', 'hub', 'odds', 'folds', 'twitter'],
  },
  {
    id: 'app-lock',
    category: 'Account',
    question: 'How do I lock the app with fingerprint?',
    answer:
      'On Android or iOS: Account → Settings → turn on App Lock. Bet Scout will ask for fingerprint, Face ID, or your device PIN when you open or return to the app. Browser web does not support App Lock.',
    keywords: ['fingerprint', 'biometric', 'face id', 'lock', 'pin', 'security'],
  },
  {
    id: 'tipsters',
    category: 'Tipsters',
    question: 'How do tipsters and booking codes work?',
    answer:
      'Sign in, then add a tipster (name + platform), log their booking codes (stake and odds optional but help ROI), and mark Won / Lost / Void when results are known. Your private leaderboard ranks tipsters for this account — hit rate, or ROI when stake + odds were logged. Codes are for your records; we do not auto-open bookmaker slips.',
    keywords: ['tipster', 'booking', 'code', 'instagram', 'leaderboard', 'roi'],
  },
  {
    id: 'auth',
    category: 'Account',
    question: 'Do I need to sign in?',
    answer:
      'Yes. Create a free account (or sign in) on Account to use Home tips, Surebets, Tools, and your tip history. Account is where you register.',
    keywords: ['sign in', 'login', 'account', 'auth', 'required'],
  },
  {
    id: 'odds-quota',
    category: 'Odds & API',
    question: 'Why should I avoid syncing odds too often?',
    answer:
      'Free odds-api.io has a small hourly quota (~100 requests). Use Daily update under Tools for daily fixtures without odds, and pull down on Home (or Find surebets / Scan value) only when you need fresh prices.',
    keywords: ['quota', 'limit', '429', 'sync', 'odds', 'rate'],
  },
  {
    id: 'offline',
    category: 'Tips',
    question: 'Can I see tips offline?',
    answer:
      'Yes — Home (matches + Safe picks) and the Tips tab keep the last loaded data on the phone. Pull to refresh when you are back online. Prices will not update while offline.',
    keywords: ['offline', 'cache', 'no internet', 'home'],
  },
  {
    id: 'server-wake',
    category: 'Odds & API',
    question: 'Why is the server slow sometimes?',
    answer:
      'On Render’s free tier the server sleeps after idle time. The first request can take 30–60 seconds to wake up. The connection banner at the top will show when the API is unreachable.',
    keywords: ['slow', 'render', 'cold', 'start', 'wake'],
  },
];

export function searchFaq(query: string): FaqItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return FAQ_ITEMS;
  const words = q.split(/\s+/).filter(Boolean);
  return FAQ_ITEMS.filter((item) => {
    const hay = `${item.question} ${item.answer} ${item.category} ${item.keywords.join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function faqCategories(): string[] {
  return [...new Set(FAQ_ITEMS.map((i) => i.category))];
}
