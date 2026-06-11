/**
 * Injectable clock — production uses the real one; tests drive a fake
 * so scheduler logic can be verified without waiting.
 */
export function realClock() {
  return {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t),
  };
}

/** Deterministic clock for tests: advance(ms) fires due timers in order. */
export function fakeClock(start = 0) {
  let t = start;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout(fn, ms) {
      const id = ++seq;
      timers.set(id, { at: t + Math.max(0, ms), fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(ms) {
      const target = t + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, v]) => v.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, { at, fn }] = due;
        timers.delete(id);
        t = Math.max(t, at);
        fn();
      }
      t = target;
    },
  };
}
