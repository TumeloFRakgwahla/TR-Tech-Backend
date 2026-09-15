const DEFAULT_TTL_MS = 10 * 60 * 1000;

class SimpleCache {
  constructor() {
    this.store = new Map();
    this.timers = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs = DEFAULT_TTL_MS) {
    this.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    const timer = setTimeout(() => this.delete(key), ttlMs);
    if (timer.unref) timer.unref();
    this.timers.set(key, timer);
  }

  delete(key) {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    this.store.delete(key);
  }

  clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.store.clear();
  }
}

const cache = new SimpleCache();

if (process.env.NODE_ENV === 'test') {
  cache.clear();
}

module.exports = cache;
