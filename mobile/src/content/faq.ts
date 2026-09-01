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
    question: 'What is Bet Scanner?',
    answer:
      'Bet Scanner helps you scan today’s football matches, find Safe picks, compare SportyBet and Bet9ja prices, log tips, track hit rate, and use advanced tools like value bets and arbitrage when you want them.',
    keywords: ['what', 'about', 'intro', 'purpose'],
  },
  {
    id: 'start-morning',
    category: 'Getting started',
    question: 'What should I do each morning?',
    answer:
      'Pull down on Today to sync odds and Safe picks (or run Morning update in Me for fixtures only). Tick tips you plan to place → Log selected. After matches finish, open Tips → Settle finished tips.',
    keywords: ['morning', 'routine', 'daily', 'workflow'],
  },
  {
    id: 'today-load',
    category: 'Today',
    question: 'How do I refresh odds and picks?',
    answer:
      'On Today, pull down to sync fresh SportyBet and Bet9ja odds from the server (uses your free odds-api.io quota). Safe picks and goal-market tips then appear on each match card.',
    keywords: ['load', 'real', 'bets', 'sync', 'odds'],
  },
  {
    id: 'today-log',
    category: 'Today',
    question: 'How do I log tips from Today?',
    answer:
      'Tick one or more picks on match cards (same bookmaker for a multi). Turn on “Log as multi” if you want one accumulator slip. Tap Log selected — tips appear on the Tips tab.',
    keywords: ['log', 'selected', 'multi', 'accumulator', 'tick'],
  },
  {
    id: 'today-filter',
    category: 'Today',
    question: 'What do the market chips mean?',
    answer:
      'All shows every pick. Double chance / 1X2 are Safe Builder styles. O/U is over/under 2.5 goals. BTTS is both teams to score. Filter only hides picks on the list — it does not change the API.',
    keywords: ['filter', 'chips', 'market', 'double chance', 'btts', 'over under'],
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
    category: 'Today',
    question: 'Why does SportyBet only allow singles on some games?',
    answer:
      'Youth, reserve, and academy fixtures (U19, U23, etc.) are often singles-only on SportyBet — no accumulator and sometimes O/U or BTTS markets are disabled live even if our feed still had a price. Bet Scanner now hides most youth/reserve O/U and BTTS picks after you refresh odds on Today. For first-team leagues you can usually combine legs in a multi; bet builder is a separate product on the book app.',
    keywords: ['u19', 'u23', 'youth', 'single', 'multi', 'accumulator', 'bet builder', 'disabled'],
  },
  {
    id: 'today-disabled',
    category: 'Today',
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
      'Yes — on the free odds-api.io plan you pick any 2 recreational books in their dashboard, then set ODDS_API_IO_BOOKMAKERS in root .env (e.g. SportyBet,BetKing or SportyBet,1xBet). Restart the API and pull down on Today to sync. True surebets stay rare; a second book with more overlapping fixtures helps more than Bet9ja alone if Bet9ja coverage is thin.',
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
      'A surebet is when the combined implied probability across Home, Draw, and Away is below 100% across different bookmakers. If you stake the right amounts on each outcome, you lock in a small profit no matter who wins.',
    keywords: ['arbitrage', 'surebet', 'arb', 'what', 'explain'],
  },
  {
    id: 'arb-how',
    category: 'Arbitrage',
    question: 'How do I use the Arb tab?',
    answer:
      '1) Set bankroll in Me → Settings. 2) Open Arb → Find surebets (syncs odds + scans). 3) Copy the stake plan and place each leg quickly.',
    keywords: ['arb', 'how', 'steps', 'stake', 'plan'],
  },
  {
    id: 'arb-empty',
    category: 'Arbitrage',
    question: 'Why are there no surebets?',
    answer:
      'True arbs are rare on just SportyBet and Bet9ja. Odds must be fresh, and tiny edges may disappear before you place all legs. Try refreshing odds and scanning again closer to kickoff.',
    keywords: ['no', 'empty', 'rare', 'none', 'surebet'],
  },
  {
    id: 'value-what',
    category: 'Value',
    question: 'What is a value (+EV) pick?',
    answer:
      'A value pick is a bet where one book’s price is higher than the “fair” odds estimated from all books combined. Positive expected value (EV %) means the price looks better than the market consensus.',
    keywords: ['value', 'ev', 'plus ev', 'edge', 'fair odds'],
  },
  {
    id: 'value-how',
    category: 'Value',
    question: 'How do I use Value picks?',
    answer:
      'Open Tools → Value picks. Tap Scan value (syncs odds + scans) using your bankroll and unit % from Me. Review EV % and suggested stake, then log from Today if you placed a pick.',
    keywords: ['value', 'scan', 'log', 'stake'],
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
    id: 'tipsters',
    category: 'Tipsters',
    question: 'How do tipsters and booking codes work?',
    answer:
      'Add a tipster (name + platform), log their booking codes, then mark Won / Lost / Void when results are known. The leaderboard ranks hit rate over time. Codes are stored for your records — we do not auto-open bookmaker slips.',
    keywords: ['tipster', 'booking', 'code', 'instagram', 'leaderboard'],
  },
  {
    id: 'auth',
    category: 'Account',
    question: 'Do I need to sign in?',
    answer:
      'Only if your server has AUTH_REQUIRED_FOR_TIPS=true. Otherwise sign-in is optional but keeps your tips tied to your email when you use multiple devices.',
    keywords: ['sign in', 'login', 'account', 'auth', 'required'],
  },
  {
    id: 'auth-key',
    category: 'Account',
    question: 'What is the app access key?',
    answer:
      'A separate server-wide password (APP_API_KEY on Render). Most personal setups leave it blank. It is not your email password — that is Me → Account.',
    keywords: ['access', 'key', 'api key', 'password'],
  },
  {
    id: 'odds-quota',
    category: 'Odds & API',
    question: 'Why should I avoid syncing odds too often?',
    answer:
      'Free odds-api.io has a small hourly quota (~100 requests). Use Morning update in Me for daily fixtures without odds, and pull down on Today (or Find surebets / Scan value) only when you need fresh prices.',
    keywords: ['quota', 'limit', '429', 'sync', 'odds', 'rate'],
  },
  {
    id: 'offline',
    category: 'Tips',
    question: 'Can I see tips offline?',
    answer:
      'Yes — the Tips tab caches your last loaded tips on the phone. Pull to refresh when you are back online.',
    keywords: ['offline', 'cache', 'no internet'],
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
