// Powerup manager for spawning and tracking active powerups

import { rand } from './utils.js';

export class PowerupManager {
  constructor(getPipes, getBird, images) {
    this.getPipes = getPipes; // () => pipes array
    this.getBird = getBird;   // () => bird instance
    this.images = images;     // { shield, fireball }
    this.items = [];          // active Powerup[]
    this.nextScoreTrigger = Infinity;
    this.cooldownUntilScore = 0;
    this.bag = [];
    this.lastType = null;
    this.spawnIntervalMin = 4;
    this.spawnIntervalMax = 8;
  }

  schedule(currentScore) {
    this.nextScoreTrigger = currentScore + Math.floor(rand(this.spawnIntervalMin, this.spawnIntervalMax + 1));
  }

  /** Weighted bag refill (fireball rarer) */
  refillBag() {
    this.bag = ['shield','shield','shield','fireball'];
    // shuffle
    for (let i = this.bag.length - 1; i > 0; i--) {
      const j = Math.floor(rand(0, i + 1));
      [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
    }
    // avoid immediate repeat of lastType by moving if needed
    if (this.lastType && this.bag[0] === this.lastType) {
      const swapIdx = this.bag.findIndex(t => t !== this.lastType);
      if (swapIdx > 0) [this.bag[0], this.bag[swapIdx]] = [this.bag[swapIdx], this.bag[0]];
    }
  }

  nextType() {
    if (!this.bag.length) this.refillBag();
    const t = this.bag.shift();
    this.lastType = t;
    return t;
  }

  trySpawn(currentScore, width, buildPairMap) {
    if (currentScore < this.cooldownUntilScore) return;
    if (currentScore < this.nextScoreTrigger) return;
    const pairMap = buildPairMap();
    const pairIds = [...pairMap.keys()];
    const occupied = new Set(this.items.map(p => p.hostPairId));
    let chosen = null; let minX = Infinity;
    for (const id of pairIds) {
      if (occupied.has(id)) continue;
      const pair = pairMap.get(id);
      if (!pair.top || !pair.bottom) continue;
      if (pair.top.x > width + 40) { chosen = { id, ...pair }; break; }
      if (pair.top.x > this.getBird().x + 140 && pair.top.x < minX) { minX = pair.top.x; chosen = { id, ...pair }; }
    }
    if (!chosen) return;
    const gapCenterY = chosen.top.h + (chosen.bottom.y - chosen.top.h) / 2;
    const x = chosen.top.x + chosen.top.w / 2;
    const y = gapCenterY;
    const type = this.nextType();
    const img = type === 'shield' ? this.images.shield : this.images.fireball;
    this.items.push({ x, y, r: 20, type, img, absorb: 0, collected: false, hostPairId: chosen.id });
    this.schedule(currentScore); // schedule next
  }

  onCollect(p, currentScore) {
    p.collected = true; p.absorb = 0.45; this.cooldownUntilScore = currentScore + 3;
  }

  update(dt, pipeSpeed) {
    this.items.forEach(p => { p.x -= pipeSpeed * dt; if (p.collected) p.absorb -= dt; });
    this.items = this.items.filter(p => !(p.collected && p.absorb <= 0) && p.x > -80);
  }
}
