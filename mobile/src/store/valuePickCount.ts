/** Last Value-picks scan count for the Home “Free tips” badge. */

type Listener = () => void;

let count = 0;
const listeners = new Set<Listener>();

export function getValuePickCount(): number {
  return count;
}

export function setValuePickCount(n: number) {
  const next = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (next === count) return;
  count = next;
  listeners.forEach((l) => l());
}

export function subscribeValuePickCount(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
