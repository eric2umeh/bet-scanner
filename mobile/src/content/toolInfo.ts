/** Short in-app explainers for tool / tab headers (info “i” button). */

export const TOOL_INFO = {
  value: {
    title: 'Value picks',
    message:
      'Finds matches where one of your configured books (e.g. SportyBet or MelBet) offers a clearer price than the average of those books.\n\n' +
      'Tap Scan value after Load matches on Home. A higher “edge %” means a better price vs that average — still risked money; confirm live before staking.\n\n' +
      'Uses your bankroll and unit % from Account → Settings. Needs fresh odds on at least 2 books for the same match.',
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
  tipsters: {
    title: 'Tipsters',
    message:
      'Track booking codes from Instagram / Telegram tipsters, settle results, and see a simple leaderboard.\n\n' +
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
      'Shows tip-bearing fixtures for the date you pick. Load matches syncs odds from your books, then builds Safe / lean tips.\n\n' +
      'Free tips opens Value picks. Brief opens Daily update.',
  },
  tips: {
    title: 'Tips',
    message:
      'Your logged bets — Active for open tips, History for settled ones. Pull to refresh; Settle finished tips updates results when scores are in.',
  },
  account: {
    title: 'Account',
    message:
      'Sign in, bankroll, unit size, and Safe tip style. Those settings feed Home tips, Value picks, and stake suggestions.',
  },
  tools: {
    title: 'Tools',
    message:
      'Extra utilities: Daily update, Value picks, Compare slip, and Tipsters. Surebets has its own tab. Bankroll lives under Account.',
  },
} as const;
