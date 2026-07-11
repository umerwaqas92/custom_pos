"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withCache = withCache;
exports.invalidateCache = invalidateCache;
const cache = new Map();
async function withCache(key, ttlMs, loader) {
    const existing = cache.get(key);
    const now = Date.now();
    if (existing && existing.expiresAt > now) {
        return existing.value;
    }
    const value = await loader();
    cache.set(key, {
        value,
        expiresAt: now + ttlMs
    });
    return value;
}
function invalidateCache(keyPrefix) {
    if (!keyPrefix) {
        cache.clear();
        return;
    }
    for (const key of cache.keys()) {
        if (key.startsWith(keyPrefix)) {
            cache.delete(key);
        }
    }
}
