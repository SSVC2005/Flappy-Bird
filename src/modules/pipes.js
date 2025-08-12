import { AABB, rand } from './utils.js';

export class Pipes {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.gap = 150;
    this.speed = 200; // px/s left
  this.baseSpacing = 260; // baseline spacing
  this.spacingJitter = 80; // +/- range for variability
  this.minSpacing = 180; // clamp lower bound after bias
    this.lastX = width + 200;
    this.pipes = [];
    this.score = 0;
    this.passed = new Set();
    this.lastCenter = height / 2; // track last gap center for smoothing
    this.maxCenterDelta = 140; // maximum vertical jump between consecutive gaps
  }

  reset() {
    this.pipes = [];
    this.score = 0;
    this.passed.clear();
    this.lastX = this.width + 200;
    this.lastCenter = this.height / 2;
    for (let i = 0; i < 4; i++) this.spawn();
  }

  spawn() {
    const minTop = 40;
    const maxBottom = this.height - 140; // keep above ground
    const rangeMin = minTop + 40;
    const rangeMax = maxBottom - 40;

    // initial random candidate center
    let candidate = rand(rangeMin, rangeMax);

    // constrain vertical change relative to previous center
    const delta = candidate - this.lastCenter;
    if (Math.abs(delta) > this.maxCenterDelta) {
      candidate = this.lastCenter + Math.sign(delta) * this.maxCenterDelta;
      // ensure still within absolute range
      candidate = Math.max(rangeMin, Math.min(rangeMax, candidate));
    }

    // apply a mild easing towards candidate to further smooth extremes
    candidate = this.lastCenter + (candidate - this.lastCenter) * 0.85;

    // update lastCenter for next spawn
    this.lastCenter = candidate;

    const topH = candidate - this.gap / 2;
    const bottomY = candidate + this.gap / 2;
    const bottomH = this.height - bottomY - 100; // ground margin

    // Determine spawn X based on the current farthest pipe to avoid large gaps
    const farthestX = this.pipes.length
      ? Math.max(...this.pipes.map(p => p.x))
      : this.width + 200;
    // Bias spacing toward base by averaging two samples (triangular distribution) then clamp
    const sample = () => this.baseSpacing + rand(-this.spacingJitter, this.spacingJitter);
    let spacing = (sample() + sample()) / 2; // bias toward center
    spacing = Math.max(this.minSpacing, spacing);
    const x = farthestX + spacing;

    const hasCrypto = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function';
    const pairId = hasCrypto ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));

    this.pipes.push(
      { id: pairId, x, y: 0, w: 64, h: topH, type: 'top' },
      { id: pairId, x, y: bottomY, w: 64, h: bottomH, type: 'bottom' },
    );
  }

  update(dt, groundY, birdBounds, onHit, onPass) {
    const toRemove = new Set();

    for (const p of this.pipes) {
      p.x -= this.speed * dt;
      if (p.x + p.w < -100) toRemove.add(p);

      // collision with bird
      if (birdBounds && AABB(birdBounds, p)) onHit?.(p);
    }

    // scoring when bird passes a pair
    for (const pair of new Set(this.pipes.map(p => p.id))) {
      const top = this.pipes.find(p => p.id === pair && p.type === 'top');
      if (!top) continue;
      if (!this.passed.has(pair) && top.x + top.w < birdBounds.x) {
        this.passed.add(pair);
        this.score += 1;
        onPass?.(this.score);
      }
    }

    // remove off-screen and respawn
    if (toRemove.size) this.pipes = this.pipes.filter(p => !toRemove.has(p));
    while (this.pipes.length < 8) this.spawn();
  }

  destroyPair(pairId) {
    this.pipes = this.pipes.filter(p => p.id !== pairId);
  }

  draw(ctx, groundY, groundOffset = 0, highContrast = false) {
    for (const p of this.pipes) {
      // pipe body gradient
      const grad = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      grad.addColorStop(0, '#34d399');
      grad.addColorStop(1, '#059669');
      ctx.fillStyle = grad;
      ctx.fillRect(p.x, p.y, p.w, p.h);

  // highlight stripe (fully opaque so background clouds don't show through)
  ctx.fillStyle = '#6ee7b7';
  ctx.fillRect(p.x + 6, p.y + (p.type === 'top' ? 6 : 0), 6, p.h - 12);

      // pipe lip
      ctx.fillStyle = '#047857';
      if (p.type === 'top') ctx.fillRect(p.x - 6, p.h - 16, p.w + 12, 16);
      else ctx.fillRect(p.x - 6, p.y, p.w + 12, 16);

      if (highContrast) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
      }
    }

    // ground
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(0, groundY, this.width, this.height - groundY);

    // subtle scrolling ground stripes (static offset since no scrolling wanted)
    const stripeW = 18;
    const stripeH = 8;
    const offset = (-groundOffset * 80) % stripeW;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let x = -stripeW + offset; x < this.width + stripeW; x += stripeW) {
      ctx.fillRect(x, groundY, stripeW / 2, stripeH);
    }
  }
}
