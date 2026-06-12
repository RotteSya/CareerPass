import { logger } from '../lib/log.js';

const log = logger('channel');

/**
 * Channel registry. A channel implements:
 *   { name, requiresLink, send(user, msg), start?(), stop?() }
 * Users route to their preferred channel; anything unlinked or
 * unconfigured falls back to the console channel so no message is lost.
 */
export function createChannels() {
  const impls = new Map();
  return {
    register(impl) {
      impls.set(impl.name, impl);
    },
    get: (name) => impls.get(name),
    list: () => [...impls.keys()],
    async send(user, msg) {
      let impl = impls.get(user.channel);
      if (!impl || (impl.requiresLink && !user.chat_id)) {
        if (impl) log(`${user.email} not linked on ${user.channel} yet — console fallback`);
        impl = impls.get('console');
      }
      if (!impl) return;
      try {
        await impl.send(user, msg);
      } catch (err) {
        log.error(`send via ${impl.name} failed:`, err.message);
      }
    },
    async stopAll() {
      for (const impl of impls.values()) await impl.stop?.();
    },
  };
}
