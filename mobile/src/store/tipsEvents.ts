type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeTipsList(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyTipsListChanged() {
  listeners.forEach((l) => l());
}
