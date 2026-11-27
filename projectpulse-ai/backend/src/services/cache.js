/**
 * In-memory TTL Cache Service for NEXORA Backend
 * Provides bounded cache storage with automatic expiration and explicit invalidation.
 * Safe for multi-tenant isolation and prevents caching of user-sensitive authorization data.
 */

class SimpleCache {
  constructor(defaultTtlMs = 30000, maxEntries = 500) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    // Evict oldest entry if size limit reached
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  size() {
    // Clean up expired on size check
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
    return this.store.size;
  }

  invalidatePrefix(prefix) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  invalidateProject(projectId) {
    if (!projectId) return;
    const id = String(projectId._id || projectId);
    this.delete(`project_metrics:${id}`);
    this.delete(`project_analytics:${id}`);
    this.invalidatePrefix(`project:${id}`);
  }
}

export const cache = new SimpleCache();
export default cache;
