import { Game } from './Game.ts';
import type { GameState, MapSize } from './core/types.ts';
import { createInitialGameState } from './core/GameState.ts';
import { getSlotMeta, loadFromSlot, clearSlot, migrateLegacySave } from './core/Save.ts';
import type { SaveSlot } from './core/Save.ts';

migrateLegacySave();

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiContainer = document.getElementById('ui-container') as HTMLElement;
const landing = document.getElementById('landing') as HTMLElement;

if (!canvas || !uiContainer || !landing) {
  throw new Error('Missing required DOM elements');
}

const devMode = new URLSearchParams(location.search).get('dev') === '1';
let selectedSize: MapSize = 'normal';

// ── Tab switching ─────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>('.ld-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset['tab']!;
    document.querySelectorAll('.ld-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.ld-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`ld-pane-${tab}`)?.classList.add('active');
    if (tab === 'load') renderSlots();
  });
});

// ── Map size buttons ──────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedSize = btn.dataset['size'] as MapSize;
  });
});

// ── Start new game ────────────────────────────────────────────
document.getElementById('ld-start-btn')?.addEventListener('click', () => {
  const seedInput = (document.getElementById('ld-seed-input') as HTMLInputElement).value.trim();
  const seed = seedInput ? parseInt(seedInput, 10) : undefined;
  launchGame(createInitialGameState({ devMode, mapSize: selectedSize, seed }));
});

// ── Render save slots ─────────────────────────────────────────
function renderSlots(): void {
  const container = document.getElementById('ld-slots')!;
  container.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const slot = i as SaveSlot;
    const meta = getSlotMeta(slot);
    const div = document.createElement('div');
    div.className = 'save-slot' + (meta ? ' has-save' : '');
    if (meta) {
      const d = new Date(meta.savedAt);
      const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const sizeName = meta.mapSize.charAt(0).toUpperCase() + meta.mapSize.slice(1);
      div.innerHTML = `
        <div class="slot-icon">💾</div>
        <div class="slot-info">
          <div class="slot-name">Slot ${i + 1} — ${sizeName} Map</div>
          <div class="slot-meta">
            <span>Seed: ${meta.seed}</span>
            <span>Tick: ${meta.tick.toLocaleString()}</span>
            <span>$${Math.round(meta.money).toLocaleString()}</span>
            <span>${dateStr}</span>
          </div>
        </div>
        <div class="slot-actions">
          <button class="slot-load-btn" data-slot="${slot}">▶ Load</button>
          <button class="slot-del-btn" data-slot="${slot}">✕</button>
        </div>`;
    } else {
      div.innerHTML = `
        <div class="slot-icon empty-icon">💾</div>
        <div class="slot-info"><div class="slot-empty">Slot ${i + 1} — Empty</div></div>`;
    }
    container.appendChild(div);
  }
  container.querySelectorAll<HTMLButtonElement>('.slot-load-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const slot = parseInt(btn.dataset['slot']!, 10) as SaveSlot;
      const state = loadFromSlot(slot);
      if (state) launchGame(state);
    });
  });
  container.querySelectorAll<HTMLButtonElement>('.slot-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const slot = parseInt(btn.dataset['slot']!, 10) as SaveSlot;
      if (confirm(`Delete Slot ${slot + 1}? This cannot be undone.`)) {
        clearSlot(slot);
        renderSlots();
      }
    });
  });
}

renderSlots();

function launchGame(state: GameState): void {
  landing.style.display = 'none';
  new Game(canvas, uiContainer, devMode, state).start();
}
