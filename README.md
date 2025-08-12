# Flappy Bird (Vite + Canvas)

A polished, responsive Flappy Bird clone built with vanilla JS, Canvas 2D, and Vite.

## Features
- Smooth physics and refined visuals (gradients, clouds, day/night).
- Dynamic difficulty: speed ramps up, pipe gap subtly tightens.
- Variable pipe spacing for variety while keeping fairness.
- Single-use powerups (Shield, Fireball) spawn inside pipe gaps.
- High score saved in localStorage and displayed in HUD.
- Simple synth SFX for flap, score, and hit.
- Keyboard and touch controls.

## Getting Started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the dev server:
   ```bash
   npm run dev
   ```
3. Open your browser at http://localhost:5173

### Requirements
- Node.js 18+ (tested with Vite 5)

## Controls
- Space or Tap to flap.
- Space or Tap to start and to restart after Game Over.

## Powerups
All powerups are single-use and spawn centered in upcoming pipe gaps:
- Shield: Negates the next collision and grants 0.5s brief pass-through window (gold glow) so you safely clear that pair.
- Fireball: Destroys the pipe pair you collide with, immediately awarding its score.
Picking up a new powerup replaces any unused one.

## Tuning
- Pipe settings in `src/modules/pipes.js`:
   - `gap`, `speed`, `baseSpacing`, `spacingJitter`.
- Difficulty scaling in `src/modules/game.js` inside `tick()` where `pipes.speed` and `pipes.gap` are adjusted.

## Build
```bash
npm run build
npm run preview
```

## License
MIT
