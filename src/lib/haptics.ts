/** Thin wrapper over the Vibration API (Android Chrome; iOS Safari silently ignores it). */
export function haptic(pattern: number | readonly number[]) {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    // Chrome logs an error for every vibrate() before the first real tap.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(pattern as number | number[]);
  } catch {
    /* some browsers throw when called without a user gesture */
  }
}

export const HAPTIC = {
  tick: 8,
  pop: [30, 20, 60],
  smallSmash: [25, 15, 35],
  bigSmash: [60, 30, 90, 20, 40],
  shred: [15, 10, 15, 10, 15, 10, 15, 10, 40],
  roast: [10, 40, 10],
} as const;
