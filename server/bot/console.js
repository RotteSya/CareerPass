/**
 * Console channel — the zero-credential bot. Prints framed messages to
 * stdout and forwards them to subscribers (the /demo page over SSE).
 */
export function createConsoleChannel() {
  const listeners = new Set();

  return {
    name: 'console',
    requiresLink: false,

    send(user, msg) {
      const line = '─'.repeat(46);
      const body = msg.text.split('\n').map((l) => `│ ${l}`).join('\n');
      const btns = (msg.buttons || [])
        .map((b) => `│ [ ${b.label} ]${b.url ? ` → ${b.url}` : ''}`)
        .join('\n');
      console.log(`\n┌─ GooJob → ${user.email} ${line.slice(String(user.email).length + 12)}\n${body}${btns ? `\n${btns}` : ''}\n└${line}\n`);
      for (const fn of listeners) {
        fn({ at: Date.now(), to: user.email, text: msg.text, buttons: msg.buttons || [] });
      }
    },

    /** /demo page subscribes here. Returns unsubscribe. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
