/** Short in-app explainers for tool / tab headers (info “i” button). */

export const TOOL_INFO = {
  value: {
    title: 'Value picks',
    message:
      'Looks for a book (SportyBet or Bet9ja) offering a higher price than the average of your books for the same bet.\n\n' +
      '1) Load matches on Home\n' +
      '2) Tap Find better prices\n' +
      '3) If you like a pick, open that book and confirm the odds, then place the bet yourself\n\n' +
      '“Better by X%” = how much higher that price is vs the average. It can still lose.\n\n' +
      'Stake size uses your bankroll and unit % in Account → Settings.',
  },
  morning: {
    title: 'Daily update',
    message:
      'Runs your morning routine: refresh the match list, settle finished tips, and build a short decision brief.\n\n' +
      'For fresh bookmaker prices, use Load matches on Home (↻). Odds sync uses your free API quota.',
  },
  slip: {
    title: 'Compare slip',
    message:
      'Paste a bet slip in plain text (teams + markets). Bet Scout looks up prices on your configured books so you can spot which book is better per leg.\n\n' +
      'Does not place bets for you — copy the summary and stake in the book app.',
  },
  scout: {
    title: 'Code Scout',
    message:
      'Lists booking codes scouted for your selected book (SportyBet or Bet9ja). Filter by odds, folds, and risk band, then Copy code into the bookmaker app.\n\n' +
      'Confidence shows only when legs match stored odds, or when folds + combined odds are present. Opaque codes stay Unverified — copy only.\n\n' +
      'Change default book under Account → Settings.',
  },
  tipsters: {
    title: 'Tipsters',
    message:
      'Track booking codes from Instagram / Telegram tipsters on your signed-in account, settle results, and see a private leaderboard (hit rate + ROI when stake and odds are logged).\n\n' +
      'Separate from Home Safe tips and Value picks.',
  },
  surebets: {
    title: 'Surebets',
    message:
      'Looks for the same market priced so covering every outcome across your books can lock a small profit if odds stay available.\n\n' +
      'Enter a sample stake, tap Find Nigeria surebets, then open each leg and confirm the market live (lines can move, e.g. 2.5 → 3.5).',
  },
  home: {
    title: 'Home',
    message:
      'Shows tip-bearing fixtures for the date you pick. Defaults favor home 1X / home win and Over 0.5·1.5 at ≥80% confidence; obscure UNK leagues, BTTS, and soft O/U 2.5 are filtered out.\n\n' +
      'An admin host uses Load matches to sync odds; everyone else sees those shared tips automatically.\n\n' +
      'Admins manage who can Load matches under Account → Users & Roles.\n\n' +
      'Free tips opens Value picks. Brief opens Daily update.',
  },
  tips: {
    title: 'Tip history',
    message:
      'Your logged bets — Active for open tips, History for settled ones. Open from Tools → Tip history. Pull to refresh; Settle finished tips updates results when scores are in.',
  },
  account: {
    title: 'Account',
    message:
      'Sign in, bankroll, unit size, Safe tip style, and App Lock. Settings also set your preferred book for Scout. Tip history is under Tools.',
  },
  tools: {
    title: 'Tools',
    message:
      'Extra utilities: Daily update, Value picks, Compare slip, Tip history, and Tipsters. Code Scout has its own tab. Surebets has its own tab too.',
  },
} as const;
