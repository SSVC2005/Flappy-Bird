export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
// Seeded RNG (Mulberry32). If no seed provided, falls back to Math.random each call.
let _rngSeed = null;
export function setSeed(seed) { _rngSeed = seed >>> 0; }
function seeded() {
  if (_rngSeed == null) return Math.random();
  _rngSeed |= 0; _rngSeed = (_rngSeed + 0x6D2B79F5) | 0;
  let t = Math.imul(_rngSeed ^ (_rngSeed >>> 15), 1 | _rngSeed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rand = (min, max) => seeded() * (max - min) + min;
export const now = () => performance.now();
export const AABB = (a, b) => (
  a.x < b.x + b.w &&
  a.x + a.w > b.x &&
  a.y < b.y + b.h &&
  a.y + a.h > b.y
);

// Simple event bus
export class EventBus {
  constructor() { this.listeners = new Map(); }
  on(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); return () => this.off(type, fn); }
  off(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, payload) { this.listeners.get(type)?.forEach(fn => { try { fn(payload); } catch(e) { /* swallow */ } }); }
}
