import type { ComponentRef } from 'react';
import type { View } from 'react-native';

type ViewRef = ComponentRef<typeof View>;

// Where the shortlist's slots are on the screen, so the beat's poster can fly to the right one
// (swipe.md#the-shortlisted-beat). The top bar registers each slot's view; the beat measures it.

export type Rect = { x: number; y: number; width: number; height: number };

const slots = new Map<number, ViewRef>();

export function registerSlot(index: number, view: ViewRef | null) {
  if (view) slots.set(index, view);
  else slots.delete(index);
}

/** The slot's rectangle in window coordinates; null when it is not there or cannot be measured. */
export function measureView(view: ViewRef | null | undefined): Promise<Rect | null> {
  return new Promise((resolve) => {
    if (!view) return resolve(null);
    // A view that cannot be measured must not hold the beat: the flight becomes a fade.
    const timer = setTimeout(() => resolve(null), 100);
    view.measureInWindow((x, y, width, height) => {
      clearTimeout(timer);
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  });
}

export function measureSlot(index: number): Promise<Rect | null> {
  return measureView(slots.get(index));
}
