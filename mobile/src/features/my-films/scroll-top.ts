// Tapping the selected My films tab again scrolls the grid to the top (tab-bar.md). The tab bar
// lives in the layout and the grid in the screen, so the layout says it and the grid listens.

const listeners = new Set<() => void>();

export function requestScrollToTop() {
  listeners.forEach((listener) => listener());
}

/** Returns the unsubscribe. */
export function onScrollToTop(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
