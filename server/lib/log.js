const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

const stamp = () => new Date().toISOString().slice(11, 19);

/** Tiny scoped logger: const log = logger('mail'); log('...'); log.error(e) */
export function logger(scope) {
  const fn = (...args) => console.log(dim(stamp()), cyan(`[${scope}]`), ...args);
  fn.error = (...args) => console.error(dim(stamp()), red(`[${scope}]`), ...args);
  return fn;
}
