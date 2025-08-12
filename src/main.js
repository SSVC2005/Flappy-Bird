import './style.css';
import { Game } from './modules/game.js';

const root = document.getElementById('app');
root.style.position = 'relative';
root.innerHTML = `
  <canvas id="game" width="480" height="720"></canvas>
  <div id="menu" class="menu-overlay">
    <h1>Flappy Bird</h1>
    <p>Select Difficulty</p>
    <div class="mode-buttons">
      <button id="btn-easy">Easy</button>
      <button id="btn-medium" class="secondary">Medium</button>
      <button id="btn-hard" class="danger">Hard</button>
    </div>
    <p class="small-note">Easy: many powerups • Medium: fewer • Hard: none</p>
  </div>
`;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const game = new Game(canvas, ctx);
const menu = document.getElementById('menu');
function hideMenu() { menu.classList.add('hidden'); }
function showMenu() { menu.classList.remove('hidden'); }

game.requestModeMenu = () => { showMenu(); };

document.getElementById('btn-easy').addEventListener('click', () => { hideMenu(); game.startGameWithMode?.('easy'); });
document.getElementById('btn-medium').addEventListener('click', () => { hideMenu(); game.startGameWithMode?.('medium'); });
document.getElementById('btn-hard').addEventListener('click', () => { hideMenu(); game.startGameWithMode?.('hard'); });

function resize() {
  // Fit canvas to container while keeping 480x720 virtual space
  const rect = root.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(rect.width / 480, rect.height / 720);

  // Set canvas internal size for crisp rendering on high-DPI
  canvas.width = Math.floor(480 * scale * dpr);
  canvas.height = Math.floor(720 * scale * dpr);

  // Set CSS size to fill container width while keeping aspect
  const cssW = Math.min(rect.width, rect.height * (480 / 720));
  const cssH = cssW * (720 / 480);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';

  game.setViewport(scale, dpr);
  // Draw a frame after resize to avoid blank visuals before next RAF
  game.draw();
}

resize();
window.addEventListener('resize', resize);

// Keyboard input
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    game.flap();
  }
});

// Touch/Mouse input
canvas.addEventListener('pointerdown', () => game.flap());
