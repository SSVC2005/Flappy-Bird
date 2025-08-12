import { now, rand } from './utils.js';
import { clamp } from './utils.js';
import { Bird } from './bird.js';
import { Pipes } from './pipes.js';
import { CONFIG, currentMedal, loadUnlocked, saveUnlocked } from './config.js';
import shieldImgUrl from '../../assets/shield.png';
import fireballImgUrl from '../../assets/fireball.png';
import { PowerupManager } from './powerups.js';

export class Game {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;

    // Virtual game size (configurable)
    this.width = CONFIG.virtualWidth;
    this.height = CONFIG.virtualHeight;
    this.groundY = this.height - CONFIG.groundHeight;

    this.state = 'idle'; // idle | running | gameover

    this.bird = new Bird(96, this.height / 2 - 12);
    this.pipes = new Pipes(this.width, this.height);

    this.score = 0;
    this.highScore = Number(localStorage.getItem('flappy_highscore') || 0);

    this.last = now();
    this.raf = null;

    this.sfx = this.createSfx();
    this.muted = false;

    // visual polish state
    this.clouds = this.initClouds();
    this.groundOffset = 0;
    this.elapsed = 0;
    this.grace = 0; // start-of-run collision grace

    // input / timers
    this.lastFlapTime = 0;
    this.pendingFlap = false; // buffered flap
    this.noFlapTimer = 0; // current glide duration
    this.longestNoFlap = 0; // best glide this run
    this.nightCycles = 0;

    // viewport scale
    this.scale = 1;
    this.dpr = 1;

    // day/night cycle
    this.dayNightFactor = 0; // 0 = day, 1 = night
    this.transitioning = false;
    this.transitionStart = 0;
    this.transitionDuration = 2.5; // seconds
    this.transitionFrom = 0;
    this.transitionTo = 0;
    this.nextToggleScore = 10; // first toggle after 10 pipes
  // mode selection (via menu)
  this.mode = null; // not chosen yet
  this.showModeMenu = true;

    this.unlocked = new Set(loadUnlocked());

    // powerups (managed by PowerupManager)
    this.currentPower = null; // 'shield' | 'fireball' | null (single-use, no duration)
    this.passThroughUntil = 0; // temporary invulnerability window after shield use
    this.lastShieldUseX = null; // x where shield consumed
    this.hudPowerAlpha = 0; // fade for power HUD
    this.highContrast = false; // accessibility toggle
    this.shieldImg = this.loadPowerImage(shieldImgUrl);
    this.fireballImg = this.loadPowerImage(fireballImgUrl);
    this.powerMgr = new PowerupManager(
      () => this.pipes.pipes,
      () => this.bird,
      { shield: this.shieldImg, fireball: this.fireballImg }
    );
  this.applyModeSettings();

    // Pre-populate pipes for idle scene and render initial frame
    this.pipes.reset();
    this.draw();

    // Idle bird baseline (for gentle bobbing before start)
    this.idleBirdBaseY = this.bird.y;

    // Start the animation loop immediately so idle bird can flap
    this.tick();
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyM') this.toggleMute(); });
  window.addEventListener('keydown', (e) => this.handleMenuInput(e));
  }

  setViewport(scale, dpr) {
    this.scale = scale || 1;
    this.dpr = dpr || 1;
  }

  initClouds() {
    const layers = [
      { count: 6, y: 90, speed: 8, size: 1.0, alpha: 0.6 },
      { count: 5, y: 140, speed: 14, size: 1.2, alpha: 0.5 },
      { count: 4, y: 200, speed: 22, size: 1.4, alpha: 0.45 },
    ];
    const clouds = [];
    for (const l of layers) {
      for (let i = 0; i < l.count; i++) {
        clouds.push({
          layer: l,
          x: Math.random() * (this.width + 300) - 150,
            y: l.y + (Math.random() * 40 - 20),
          w: 60 * l.size * (0.8 + Math.random() * 0.4),
        });
      }
    }
    return clouds;
  }

  createSfx() {
    let ctx = null;
    const AC = window.AudioContext || window.webkitAudioContext;

    const ensureCtx = async () => {
      if (!AC) return null;
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') try { await ctx.resume(); } catch {}
      return ctx;
    };

    const play = async (type) => {
      const c = await ensureCtx();
      if (!c) return; if (this.muted) return;
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g).connect(c.destination);
      const t0 = c.currentTime;
      if (type === 'flap') {
        o.type = 'square'; o.frequency.setValueAtTime(680, t0); o.frequency.exponentialRampToValueAtTime(300, t0 + 0.08);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      } else if (type === 'score') {
        o.type = 'triangle'; o.frequency.setValueAtTime(520, t0); o.frequency.exponentialRampToValueAtTime(880, t0 + 0.12);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      } else if (type === 'hit') {
        o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t0);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      }
      o.start(); o.stop(t0 + 0.4);
    };

    return { play };
  }

  toggleMute() { this.muted = !this.muted; }
  toggleContrast() { this.highContrast = !this.highContrast; this.draw(); }

  start() {
    if (this.state === 'running') return;
    this.state = 'running';
    this.bird.reset(96, this.height / 2 - 12);
    this.pipes.reset();
    this.pipes.gap = 150;
    this.pipes.speed = 200;
    this.score = 0;
    this.last = now();
    this.elapsed = 0;
    this.dayNightFactor = 0;
    this.transitioning = false;
    this.transitionFrom = 0;
    this.transitionTo = 0;
    this.nextToggleScore = 10;
    this.grace = CONFIG.startGraceSeconds;
    this.pendingFlap = false;
    this.noFlapTimer = 0;
    this.longestNoFlap = 0;
    this.nightCycles = 0;
  this.currentPower = null;
  this.passThroughUntil = 0;
  this.hudPowerAlpha = 0;
  // schedule only if spawning enabled
  if (this.powerMgr.spawnIntervalMin !== Infinity) this.powerMgr.schedule(this.score);
    if (!this.raf) this.tick();
  }

  applyModeSettings() {
    const modeCfg = CONFIG.modes?.[this.mode];
    if (!modeCfg) return;
    if (modeCfg.powerups?.disabled) {
      this.powerMgr.spawnIntervalMin = Infinity;
      this.powerMgr.spawnIntervalMax = Infinity;
  this.powerMgr.items = [];
  this.powerMgr.nextScoreTrigger = Infinity;
    } else if (modeCfg.powerups) {
      this.powerMgr.spawnIntervalMin = modeCfg.powerups.spawnIntervalMin;
      this.powerMgr.spawnIntervalMax = modeCfg.powerups.spawnIntervalMax;
    }
  }

  handleMenuInput(e) {
    if (this.state === 'idle' && this.showModeMenu) {
      if (e.code === 'Digit1' || e.key === '1') this.startGameWithMode('easy');
      if (e.code === 'Digit2' || e.key === '2') this.startGameWithMode('medium');
      if (e.code === 'Digit3' || e.key === '3') this.startGameWithMode('hard');
    } else if (this.state === 'gameover') {
      if (e.code === 'Enter' || e.code === 'Space') { this.showModeMenu = true; this.state = 'idle'; this.draw(); }
      if (this.showModeMenu) {
        if (e.code === 'Digit1' || e.key === '1') this.startGameWithMode('easy');
        if (e.code === 'Digit2' || e.key === '2') this.startGameWithMode('medium');
        if (e.code === 'Digit3' || e.key === '3') this.startGameWithMode('hard');
      }
    }
  }

  startGameWithMode(mode) {
    this.mode = mode;
    this.applyModeSettings();
  this.showModeMenu = false; // go to idle with start hint
  this.state = 'idle';
  this.draw();
  }

  gameOver() {
    if (this.state !== 'running') return;
    this.state = 'gameover';
    cancelAnimationFrame(this.raf);
    this.raf = null;
    if (!this.muted) this.sfx.play('hit');
    if (this.score > this.highScore) {
      this.highScore = this.score;
      try { localStorage.setItem('flappy_highscore', String(this.highScore)); } catch {}
    }
  // Show difficulty menu for next run
  this.showModeMenu = true;
  // Optionally clear selected mode so player consciously re-picks (comment out next line to keep last)
  this.mode = null;
  if (this.requestModeMenu) try { this.requestModeMenu(); } catch {}
    this.draw();
  }


  applyPowerup(type) {
    // Replace any existing unused power (no stacking)
    this.currentPower = type;
  this.hudPowerAlpha = 1; // fade in HUD
  }

  hasShield() { return this.currentPower === 'shield'; }
  hasFireball() { return this.currentPower === 'fireball'; }
  hasPassThrough() { return this.elapsed < this.passThroughUntil; }

  handlePipeCollision(pipe) {
    if (this.grace > 0) return; // start grace
    if (this.hasPassThrough()) return; // currently phasing through after shield
    // single-use consumption logic
    if (this.hasFireball()) {
      this.pipes.destroyPair(pipe.id); // blast the pair
      this.score += 1;
  if (!this.muted) this.sfx.play('score');
  this.currentPower = null; // consumed
  this.hudPowerAlpha = 0; // fade out
      return;
    }
    if (this.hasShield()) {
      this.currentPower = null; // absorb impact
  this.passThroughUntil = this.elapsed + 0.5; // allow half a second to clear gap
  this.hudPowerAlpha = 0; // fade out after use
  this.lastShieldUseX = this.bird.x;
      return; // ignore and keep phasing briefly
    }
    // normal death
    this.bird.alive = false; this.gameOver();
  }

  flap() {
    const t = now();
    if (this.state === 'idle') { if (!this.showModeMenu && this.mode) { this.start(); this.bird.flap(); this.emitFlap(); } return; }
    if (this.state === 'gameover') {
      // Transition back to idle + menu; player must pick difficulty again
      this.state = 'idle';
      this.showModeMenu = true;
      if (this.requestModeMenu) try { this.requestModeMenu(); } catch {}
      this.draw();
      return;
    }
    if (this.state === 'running') {
      if (t - this.lastFlapTime < CONFIG.inputBufferMs) { this.pendingFlap = true; return; }
      this.executeFlap(t);
    }
  }

  executeFlap(t) {
    this.lastFlapTime = t;
    this.bird.flap();
    this.noFlapTimer = 0;
    this.emitFlap();
  }

  emitFlap() {
    if (!this.muted) this.sfx.play('flap');
  }

  tick() {
    this.raf = requestAnimationFrame(() => this.tick());
    const t = now();
    let dt = (t - this.last) / 1000;
    dt = Math.min(dt, 1 / 30);
    this.last = t;
    this.elapsed += dt;

  if (this.state === 'idle') {
      this.bird.animTime += dt;
      const bobAmp = 10; const bobSpeed = 2;
      this.bird.y = this.idleBirdBaseY + Math.sin(this.elapsed * bobSpeed * Math.PI) * bobAmp;
      this.bird.rotation = Math.sin(this.elapsed * bobSpeed * Math.PI) * 0.25;
    } else {
      if (this.state === 'running') {
        this.pipes.speed = 200 + Math.min(140, this.elapsed * 8);
        const targetGap = 150 - Math.min(50, this.elapsed * 2);
        this.pipes.gap = targetGap + Math.sin(this.elapsed * 1.5) * 6;
      }
      this.bird.update(dt, this.groundY);
      const b = this.bird.bounds();
      if (this.state === 'running') {
        this.pipes.update(dt, this.groundY, b, (pipe) => this.handlePipeCollision(pipe), (score) => {
          this.score = score;
          if (!this.muted) this.sfx.play('score');
          if (this.score >= this.nextToggleScore) {
            this.transitioning = true;
            this.transitionStart = this.elapsed;
            this.transitionFrom = this.dayNightFactor;
            this.transitionTo = this.dayNightFactor < 0.5 ? 1 : 0;
            this.nextToggleScore += 10;
            if (this.dayNightFactor >= 0.5 && this.transitionTo === 0) this.nightCycles += 1;
          }
          // powerup spawn attempt
          this.powerMgr.trySpawn(this.score, this.width, () => this.buildPairMap());
        });
        if (!this.bird.alive) { this.gameOver(); return; }
      }
    }

    if (this.transitioning) {
      const tProg = (this.elapsed - this.transitionStart) / this.transitionDuration;
      if (tProg >= 1) { this.dayNightFactor = this.transitionTo; this.transitioning = false; }
      else {
        const ease = tProg * (2 - tProg);
        this.dayNightFactor = this.transitionFrom + (this.transitionTo - this.transitionFrom) * ease;
      }
    }

    if (this.pendingFlap && (now() - this.lastFlapTime) >= CONFIG.inputBufferMs) {
      this.pendingFlap = false; this.executeFlap(now());
    }

    if (this.state === 'running') {
      this.grace -= dt;
      this.noFlapTimer += dt;
      if (this.noFlapTimer > this.longestNoFlap) this.longestNoFlap = this.noFlapTimer;
  // update powerups positions & collisions
  this.updatePowerups(dt);
    }

    this.updateBackground(dt);
    this.checkAchievements();

    this.draw();
  }

  updateBackground(dt) {
    for (const c of this.clouds) {
      c.x -= c.layer.speed * dt;
      if (c.x < -220) {
        c.x = this.width + 180 + Math.random() * 120;
        c.y = c.layer.y + (Math.random() * 40 - 20);
        c.w = 60 * c.layer.size * (0.8 + Math.random() * 0.4);
      }
    }
    this.groundOffset = 0;
  }

  drawBackground() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    const dayTop = '#93c5fd', dayBottom = '#38bdf8', nightTop = '#0f172a', nightBottom = '#1e293b';
    const topColor = this.lerpColor(dayTop, nightTop, this.dayNightFactor);
    const bottomColor = this.lerpColor(dayBottom, nightBottom, this.dayNightFactor);
    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    sky.addColorStop(0, topColor); sky.addColorStop(1, bottomColor);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, this.width, this.height);

    const sunColor = this.dayNightFactor < 0.5 ? '#fbbf24' : '#ffffff';
    const glow = ctx.createRadialGradient(72, 80, 6, 72, 80, 48);
    glow.addColorStop(0, this.hexWithAlpha(sunColor, 0.9));
    glow.addColorStop(1, this.hexWithAlpha(sunColor, 0));
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(72, 80, 48, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = sunColor; ctx.beginPath(); ctx.arc(72, 80, 24, 0, Math.PI * 2); ctx.fill();

    if (this.dayNightFactor > 0.3) {
      const starAlpha = (this.dayNightFactor - 0.3) / 0.7;
      ctx.fillStyle = `rgba(255,255,255,${0.5 * starAlpha})`;
      for (let i = 0; i < 40; i++) { const sx = (i * 73) % this.width; const sy = (i * 97) % (this.groundY - 120); if ((i * 19) % 3 === 0) ctx.fillRect(sx, sy, 2, 2); }
    }

    for (const c of this.clouds) {
      ctx.save();
      const alphaDim = this.dayNightFactor * 0.55;
      ctx.globalAlpha = c.layer.alpha * (1 - alphaDim);
      ctx.fillStyle = '#ffffff';
      this.drawCloud(ctx, c.x, c.y, c.w);
      ctx.restore();
    }
  }

  drawCloud(ctx, x, y, w) {
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.6, w * 0.22, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.35, y - w * 0.08, w * 0.3, w * 0.18, 0, 0, Math.PI * 2);
    ctx.ellipse(x - w * 0.25, y - w * 0.06, w * 0.28, w * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  draw() {
    const pxW = this.canvas.width; const pxH = this.canvas.height;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, pxW, pxH);
    this.ctx.setTransform(this.scale * this.dpr, 0, 0, this.scale * this.dpr, 0, 0);

    this.drawBackground();
  this.pipes.draw(this.ctx, this.groundY, this.groundOffset, this.highContrast);
  this.bird.draw(this.ctx);
  // pass-through glow
  if (this.hasPassThrough()) {
    const ctx = this.ctx;
    const alpha = clamp((this.passThroughUntil - this.elapsed) / 0.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha * 0.65;
    const bx = this.bird.x + this.bird.w / 2;
    const by = this.bird.y + this.bird.h / 2;
    const rad = 50 + (1 - alpha) * 20;
    const grad = ctx.createRadialGradient(bx, by, 10, bx, by, rad);
    grad.addColorStop(0, 'rgba(255,215,0,0.9)');
    grad.addColorStop(1, 'rgba(255,215,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(bx, by, rad, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  this.drawPowerups();
  this.drawPowerHud();

    this.drawTopHud();
  if (this.state === 'idle') this.drawStartHint();
    if (this.state === 'gameover') this.drawGameOver();
  }

  drawTopHud() {
    const ctx = this.ctx;
    ctx.save();
  ctx.font = 'bold 18px system-ui';
  const muteTxt = this.muted ? 'Muted (M)' : 'Sound (M)';
  const modeLabel = this.mode ? this.mode.charAt(0).toUpperCase()+this.mode.slice(1) : '';
  const text = `Score: ${this.score}   •   Best: ${this.highScore}   •   ${muteTxt}${modeLabel ? '   •   ' + modeLabel : ''}`;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const paddingX = 28; // horizontal padding
  const paddingY = 10; // vertical top/bottom total ~ h - font size
  let w = Math.max(320, textWidth + paddingX * 2);
  w = Math.min(w, this.width - 32); // margin from edges
  const h = 44;
  const x = this.width / 2 - w / 2;
  const y = 18;
  ctx.fillStyle = 'rgba(17,24,39,0.45)';
  ctx.roundRect?.(x, y, w, h, 14); if (!ctx.roundRect) { ctx.beginPath(); ctx.rect(x, y, w, h); }
  ctx.fill();
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
  ctx.fillText(text, this.width / 2, y + 28);
    ctx.restore();
  }

  drawStartHint() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(17,24,39,0.6)';
    ctx.roundRect?.(40, 200, this.width - 80, 170, 16); if (!ctx.roundRect) { ctx.beginPath(); ctx.rect(40, 200, this.width - 80, 170); }
    ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 30px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Flappy Bird', this.width / 2, 242);
    ctx.font = '600 16px system-ui';
    if (!this.showModeMenu) {
      ctx.fillText('Press Space or Tap to Flap', this.width / 2, 272);
      ctx.fillText('Tap/Space to start', this.width / 2, 296);
    } else {
      ctx.fillText('Select Difficulty', this.width / 2, 272);
      ctx.font = '600 14px system-ui';
      ctx.fillText('1: Easy  •  2: Medium  •  3: Hard', this.width / 2, 296);
      ctx.font = '600 16px system-ui';
      ctx.fillText('More powerups on Hard', this.width / 2, 320);
    }
    ctx.font = '600 14px system-ui';
    if (!this.showModeMenu) {
      ctx.fillText('Press M to mute audio', this.width / 2, 320);
      if (this.mode !== 'hard') ctx.fillText('Collect powerups: Shield / Fire', this.width / 2, 338);
      ctx.font = '600 16px system-ui';
      ctx.fillText(`Mode: ${this.mode ? this.mode.charAt(0).toUpperCase()+this.mode.slice(1) : ''}`, this.width / 2, (this.mode !== 'hard') ? 358 : 338);
    }
    ctx.restore();
  }

  drawGameOver() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(17,24,39,0.7)'; ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#111827';
    const cw = this.width - 120, ch = 300, cx = 60, cy = 180;
    ctx.roundRect?.(cx, cy, cw, ch, 16); if (!ctx.roundRect) { ctx.beginPath(); ctx.rect(cx, cy, cw, ch); }
    ctx.fill();

    if (this.bird.deadImg && this.bird.deadReady) {
      const bw = 64, bh = 52; ctx.save(); ctx.translate(this.width / 2, cy + 60); ctx.drawImage(this.bird.deadImg, -bw / 2, -bh / 2, bw, bh); ctx.restore();
    }

    ctx.fillStyle = '#fff'; ctx.font = 'bold 28px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Game Over', this.width / 2, cy + 120);
    ctx.font = '600 18px system-ui';
    ctx.fillText(`Score: ${this.score}`, this.width / 2, cy + 150);
    ctx.fillText(`Best: ${this.highScore}`, this.width / 2, cy + 176);

    const medal = currentMedal(this.score);
    if (medal) { ctx.font = '600 16px system-ui'; ctx.fillStyle = medal.color; ctx.fillText(`${medal.name} Medal`, this.width / 2, cy + 202); }

    ctx.font = '600 16px system-ui'; ctx.fillStyle = '#e5e7eb';
    ctx.fillText('Press Space or Tap to restart', this.width / 2, cy + 230);
  // display active power (debug/info)
  if (this.currentPower) { ctx.font = '600 12px system-ui'; ctx.fillStyle = '#9ca3af'; ctx.fillText(`Active: ${(this.currentPower === 'shield') ? 'Shield' : 'Fire'}`, this.width / 2, cy + 250); }

    // show unlocked achievements (latest 3)
    const unlockedArr = [...this.unlocked];
    if (unlockedArr.length) {
      ctx.font = '600 12px system-ui'; ctx.fillStyle = '#9ca3af';
      const recent = unlockedArr.slice(-3).map(id => CONFIG.achievements.find(a => a.id === id)?.label).filter(Boolean);
      ctx.fillText(`Unlocked: ${recent.join(', ')}`, this.width / 2, cy + ch - 34);
    }
    ctx.restore();
  }

  checkAchievements() {
    let updated = false;
    for (const a of CONFIG.achievements) {
      if (!this.unlocked.has(a.id) && a.test(this.score, this)) {
  this.unlocked.add(a.id); updated = true;
      }
    }
    if (updated) saveUnlocked([...this.unlocked]);
  }

  updatePowerups(dt) {
    const speed = this.pipes.speed;
    const bx = this.bird.x + this.bird.w / 2;
    const by = this.bird.y + this.bird.h / 2;
    // move existing
    this.powerMgr.update(dt, speed);
    for (const p of this.powerMgr.items) {
      if (p.collected) continue;
      const dx = p.x - bx; const dy = p.y - by; const dist = Math.hypot(dx, dy);
      if (dist < p.r + Math.max(this.bird.w, this.bird.h) * 0.45) {
        this.applyPowerup(p.type);
        this.powerMgr.onCollect(p, this.score);
      }
    }
  }

  drawPowerups() {
    const ctx = this.ctx;
    for (const p of this.powerMgr.items) {
      ctx.save();
      let alpha = 1;
      let scale = 1;
      if (p.collected) {
        alpha = Math.max(0, p.absorb / 0.45);
        scale = 1 + (1 - alpha) * 0.8; // grow as it is absorbed
        // also draw a line/beam to bird
        ctx.globalAlpha = alpha * 0.5;
  // beam color toward bird during absorption (gold for shield, orange for fireball)
  ctx.strokeStyle = p.type === 'shield' ? 'rgba(255,215,0,0.55)' : 'rgba(255,140,0,0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(this.bird.x + this.bird.w/2, this.bird.y + this.bird.h/2);
        ctx.stroke();
        ctx.globalAlpha = alpha; // restore
      }
      const img = p.img;
      if (img && img.complete && img.naturalWidth) {
        const size = p.r * 2 * scale;
        ctx.drawImage(img, p.x - size/2, p.y - size/2, size, size);
      } else {
        ctx.fillStyle = p.type === 'shield' ? '#3b82f6' : '#f97316';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * scale, 0, Math.PI*2); ctx.fill();
      }
      // glow
      ctx.globalAlpha = alpha * 0.6;
      const gSize = p.r * 2.4 * scale;
      const grad = ctx.createRadialGradient(p.x, p.y, gSize*0.1, p.x, p.y, gSize);
  // translucent glow (gold for shield, orange for fireball)
  grad.addColorStop(0, p.type === 'shield' ? 'rgba(255,215,0,0.85)' : 'rgba(255,140,0,0.85)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x, p.y, gSize, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  loadPowerImage(src) { const i = new Image(); i.src = src; return i; }

  drawPowerHud() {
  const target = this.currentPower ? 1 : 0;
  this.hudPowerAlpha += (target - this.hudPowerAlpha) * 0.1;
  if (this.hudPowerAlpha < 0.02 && !this.currentPower) return;
    const ctx = this.ctx;
    const panelW = 150;
    const panelH = 54;
    const x = this.width / 2 - panelW / 2;
    const y = this.groundY - panelH - 8; // just above ground
    ctx.save();
  // fade alpha toward 0.85 when active
  ctx.globalAlpha = 0.3 + this.hudPowerAlpha * 0.55;
    ctx.fillStyle = 'rgba(17,24,39,0.55)';
    ctx.roundRect?.(x, y, panelW, panelH, 14); if (!ctx.roundRect) { ctx.beginPath(); ctx.rect(x, y, panelW, panelH); }
    ctx.fill();
    ctx.globalAlpha = 1;
    // icon
  const img = this.currentPower === 'shield' ? this.shieldImg : this.fireballImg;
    const iconSize = 40;
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, x + 10, y + panelH / 2 - iconSize / 2, iconSize, iconSize);
    } else {
      ctx.fillStyle = this.currentPower === 'shield' ? '#3b82f6' : '#f97316';
      ctx.beginPath(); ctx.arc(x + 10 + iconSize/2, y + panelH/2, iconSize/2, 0, Math.PI*2); ctx.fill();
    }
    ctx.font = '600 16px system-ui';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
  ctx.fillText(this.currentPower === 'shield' ? 'Shield' : 'Fireball', x + 10 + iconSize + 12, y + panelH/2 + 6);
    ctx.font = '500 11px system-ui';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('Single-use', x + 10 + iconSize + 12, y + panelH/2 - 14);
    ctx.restore();
  }

  buildPairMap() {
    const map = new Map();
    for (const p of this.pipes.pipes) {
      let entry = map.get(p.id);
      if (!entry) { entry = {}; map.set(p.id, entry); }
      if (p.type === 'top') entry.top = p; else entry.bottom = p;
    }
    return map;
  }

  lerpColor(a, b, t) {
    const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
    const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
    const rr = Math.round(ar + (br - ar) * t);
    const rg = Math.round(ag + (bg - ag) * t);
    const rb = Math.round(ab + (bb - ab) * t);
    return '#' + rr.toString(16).padStart(2, '0') + rg.toString(16).padStart(2, '0') + rb.toString(16).padStart(2, '0');
  }

  hexWithAlpha(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16); const g = parseInt(hex.slice(3, 5), 16); const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
}
