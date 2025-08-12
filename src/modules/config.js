// Centralized configuration and tunable constants
export const CONFIG = {
  virtualWidth: 480,
  virtualHeight: 720,
  groundHeight: 100,
  startGraceSeconds: 0.6,
  inputBufferMs: 50,
  powerups: {
    spawnIntervalMin: 4, // min pipes between spawns
    spawnIntervalMax: 8,
  },
  modes: {
  // Easy: most frequent powerups (increased frequency)
  easy: { name: 'Easy', powerups: { spawnIntervalMin: 3, spawnIntervalMax: 5 } },
  // Medium: fewer than easy
  medium: { name: 'Medium', powerups: { spawnIntervalMin: 7, spawnIntervalMax: 10 } },
  // Hard: no powerups
  hard: { name: 'Hard', powerups: { disabled: true } },
  },
  medals: [
    { name: 'Bronze', min: 10, color: '#cd7f32' },
    { name: 'Silver', min: 25, color: '#c0c0c0' },
    { name: 'Gold', min: 50, color: '#ffd700' },
    { name: 'Platinum', min: 80, color: '#e5e4e2' },
    { name: 'Obsidian', min: 120, color: '#0f0f0f' }
  ],
  achievements: [
    { id: 'first10', label: 'Score 10', test: (s) => s >= 10 },
    { id: 'nightbird', label: 'Survive a night cycle', test: (_s, g) => g.nightCycles > 0 },
    { id: 'streak25', label: 'Score 25', test: (s) => s >= 25 },
    { id: 'streak50', label: 'Score 50', test: (s) => s >= 50 },
    { id: 'noFlap3', label: '3s Glide', test: (_s, g) => g.longestNoFlap >= 3 },
  ],
};

export function currentMedal(score) {
  let medal = null;
  for (const m of CONFIG.medals) if (score >= m.min) medal = m; else break;
  return medal;
}

export function loadUnlocked() {
  try { return JSON.parse(localStorage.getItem('flappy_achievements') || '[]'); } catch { return []; }
}

export function saveUnlocked(list) {
  try { localStorage.setItem('flappy_achievements', JSON.stringify(list)); } catch {}
}
