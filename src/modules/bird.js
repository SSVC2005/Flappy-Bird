import { clamp } from './utils.js';
import aliveSpriteA from '../../assets/pngwing.com.png';
import aliveSpriteB from '../../assets/pngwing.com (2).png';
import deadSpriteUrl from '../../assets/pngwing.com (1).png';

export class Bird {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = 40;
    this.h = 32;
    this.vy = 0;
    this.gravity = 1500;
    this.flapStrength = -420;
    this.maxFall = 900;
    this.rotation = 0;
    this.alive = true;

    // Animation state
    this.animTime = 0;
    this.frameDuration = 0.14; // seconds per frame

    // Sprites
    this.aliveImgA = new Image();
    this.aliveImgB = new Image();
    this.deadImg = new Image();
    this.aliveReadyA = false;
    this.aliveReadyB = false;
    this.deadReady = false;

    this.aliveImgA.onload = () => { this.aliveReadyA = true; };
    this.aliveImgB.onload = () => { this.aliveReadyB = true; };
    this.deadImg.onload = () => { this.deadReady = true; };

    this.aliveImgA.src = aliveSpriteA;
    this.aliveImgB.src = aliveSpriteB;
    this.deadImg.src = deadSpriteUrl;

    if (this.aliveImgA.complete && this.aliveImgA.naturalWidth) this.aliveReadyA = true;
    if (this.aliveImgB.complete && this.aliveImgB.naturalWidth) this.aliveReadyB = true;
    if (this.deadImg.complete && this.deadImg.naturalWidth) this.deadReady = true;
  }

  reset(x, y) {
    this.x = x; this.y = y; this.vy = 0; this.rotation = 0; this.alive = true; this.animTime = 0;
  }

  flap() {
    if (!this.alive) return;
    this.vy = this.flapStrength;
    this.animTime += this.frameDuration * 0.6; // nudge animation forward
  }

  update(dt, groundY) {
    if (!this.alive) return;
    this.vy += this.gravity * dt;
    this.vy = clamp(this.vy, -1000, this.maxFall);
    this.y += this.vy * dt;
  // target rotation based on velocity
  const t = clamp((this.vy + 500) / 1400, 0, 1);
  const targetRot = -0.5 + t * 1.2;
  // ease rotation (lerp)
  const ease = 1 - Math.pow(0.0001, dt); // frame-rate independent smoothing
  this.rotation = this.rotation + (targetRot - this.rotation) * ease;

    this.animTime += dt;

    if (this.y + this.h > groundY) { this.y = groundY - this.h; this.vy = 0; this.alive = false; }
    if (this.y < 0) { this.y = 0; this.vy = 0; this.alive = false; }
  }

  bounds() { return { x: this.x + 6, y: this.y + 4, w: this.w - 12, h: this.h - 8 }; }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    const rot = this.alive ? this.rotation : Math.min(1.2, this.rotation + 0.4);
    ctx.rotate(rot);

    let img; let ready;
    if (!this.alive) {
      img = this.deadImg; ready = this.deadReady;
    } else {
      const frame = Math.floor(this.animTime / this.frameDuration) % 2;
      if (frame === 0) { img = this.aliveImgA; ready = this.aliveReadyA; }
      else { img = this.aliveImgB; ready = this.aliveReadyB; }
    }

    if (ready) {
      ctx.drawImage(img, -this.w / 2, -this.h / 2, this.w, this.h);
    } else {
      // Placeholder until sprites load
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath(); ctx.ellipse(0, 0, this.w / 2, this.h / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(6, -4, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(8, -4, 2, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }
}
