import { Game } from './Game.ts';
import type { GameState, MapSize, Difficulty, Theme } from './core/types.ts';
import { createInitialGameState } from './core/GameState.ts';
import { getSlotMeta, loadFromSlot, clearSlot, migrateLegacySave } from './core/Save.ts';
import type { SaveSlot } from './core/Save.ts';
import { getProfiles } from '../scripts/sim/profiles.ts';
import { runSimulation } from '../scripts/sim/engine.ts';
import { formatSuiteReport } from '../scripts/sim/report.ts';

migrateLegacySave();

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiContainer = document.getElementById('ui-container') as HTMLElement;
const landing = document.getElementById('landing') as HTMLElement;

if (!canvas || !uiContainer || !landing) {
  throw new Error('Missing required DOM elements');
}

const currentUrl = new URL(window.location.href);
const devMode = currentUrl.searchParams.get('dev') === '1';
let selectedSize: MapSize = 'normal';
let selectedDifficulty: Difficulty = 'normal';
let selectedTheme: Theme = 'dark';
let lastSimReport = '';

function mapSizeLabel(size: MapSize): string {
  if (size === 'small') return 'Small';
  if (size === 'large') return 'Large';
  if (size === 'huge') return 'Huge';
  return 'Normal';
}

function difficultyLabel(diff: Difficulty): string {
  if (diff === 'easy') return 'Easy';
  if (diff === 'hard') return 'Hard';
  if (diff === 'brutal') return 'Brutal';
  return 'Normal';
}

// Apply initial theme
document.body.classList.add('theme-dark');

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

// ── Difficulty buttons ────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDifficulty = btn.dataset['diff'] as Difficulty;
  });
});

// ── Theme buttons ─────────────────────────────────────────────
document.querySelectorAll<HTMLButtonElement>('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedTheme = btn.dataset['theme'] as Theme;
    document.body.className = document.body.className.replace(/\btheme-\w+\b/, '').trim()
      + ` theme-${selectedTheme}`;
  });
});

// ── Start new game ────────────────────────────────────────────
document.getElementById('ld-start-btn')?.addEventListener('click', () => {
  const seedInput = (document.getElementById('ld-seed-input') as HTMLInputElement).value.trim();
  const seed = seedInput ? parseInt(seedInput, 10) : undefined;
  launchGame(createInitialGameState({ devMode, mapSize: selectedSize, seed, difficulty: selectedDifficulty, theme: selectedTheme }));
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
if (devMode) installLandingSimBench();

function launchGame(state: GameState): void {
  landing.style.display = 'none';
  new Game(canvas, uiContainer, devMode, state).start();
}

function installLandingSimBench(): void {
  const newPane = document.getElementById('ld-pane-new');
  const startButton = document.getElementById('ld-start-btn');
  if (!newPane || !startButton) return;

  const defaultProfiles = new Set(['landonly', 'allroutes']);
  const profiles = getProfiles('all');
  const section = document.createElement('section');
  section.id = 'ld-dev-sim-bench';
  section.style.cssText = 'margin-top:24px;padding:18px;border:1px solid #2d577a;border-radius:10px;background:rgba(20,32,46,0.6);';
  section.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;">
      <div>
        <div style="color:#8cf;font-size:13px;font-weight:bold;letter-spacing:1px;">DEV SIM BENCH</div>
        <div style="color:#789;font-size:11px;line-height:1.5;max-width:520px;">Run the headless simulation against the same seed, map size, difficulty, and theme you are about to start. This is for comparing playability and late-game balance before opening a real match.</div>
      </div>
      <span style="padding:4px 8px;border:1px solid #3c6e97;border-radius:999px;color:#9ed0ff;font-size:10px;">dev=1 only</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px;">
      <label style="display:flex;flex-direction:column;gap:4px;color:#9aa;font-size:11px;">
        <span>Benchmark seed</span>
        <input id="ld-sim-seed" type="number" min="0" max="999999999" placeholder="424242" style="background:#111;border:1px solid #333;color:#ddd;padding:8px 10px;font-family:monospace;">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;color:#9aa;font-size:11px;">
        <span>Seed step</span>
        <input id="ld-sim-seed-step" type="number" min="1" max="50000" step="1" value="7919" style="background:#111;border:1px solid #333;color:#ddd;padding:8px 10px;font-family:monospace;">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;color:#9aa;font-size:11px;">
        <span>Benchmark map size</span>
        <select id="ld-sim-map-size" style="background:#111;border:1px solid #333;color:#ddd;padding:8px 10px;font-family:monospace;">
          <option value="small">Small</option>
          <option value="normal" selected>Normal</option>
          <option value="large">Large</option>
          <option value="huge">Huge</option>
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;color:#9aa;font-size:11px;">
        <span>Benchmark difficulty</span>
        <select id="ld-sim-difficulty" style="background:#111;border:1px solid #333;color:#ddd;padding:8px 10px;font-family:monospace;">
          <option value="easy">Easy</option>
          <option value="normal" selected>Normal</option>
          <option value="hard">Hard</option>
          <option value="brutal">Brutal</option>
        </select>
      </label>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px;">
      <label style="display:flex;flex-direction:column;gap:4px;color:#9aa;font-size:11px;">
        <span>Runs per profile</span>
        <input id="ld-sim-runs" type="number" min="1" max="12" value="3" style="background:#111;border:1px solid #333;color:#ddd;padding:8px 10px;font-family:monospace;">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;color:#9aa;font-size:11px;">
        <span>Ticks</span>
        <input id="ld-sim-ticks" type="number" min="250" max="20000" step="250" value="3000" style="background:#111;border:1px solid #333;color:#ddd;padding:8px 10px;font-family:monospace;">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;color:#9aa;font-size:11px;">
        <span>Theme</span>
        <select id="ld-sim-theme" style="background:#111;border:1px solid #333;color:#ddd;padding:8px 10px;font-family:monospace;">
          <option value="classic">Classic</option>
          <option value="dark" selected>Dark</option>
          <option value="neon">Neon</option>
          <option value="anime">Anime</option>
          <option value="retro">Retro</option>
        </select>
      </label>
      <div style="padding:8px 10px;border:1px solid #23384c;background:#0f1823;color:#88a1b8;font-size:11px;line-height:1.5;">
        These controls affect the benchmark directly, even if the main new-game controls above are set differently.
      </div>
    </div>
    <div style="color:#9aa;font-size:11px;letter-spacing:1px;margin-bottom:8px;">Profiles to compare</div>
    <div id="ld-sim-profiles" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px;">
      ${profiles.map((profile) => `
        <label style="display:flex;align-items:flex-start;gap:8px;padding:8px;border:1px solid #2a2a2a;background:#111;color:#bbb;font-size:11px;">
          <input type="checkbox" data-profile="${profile.id}" ${defaultProfiles.has(profile.id) ? 'checked' : ''} style="margin-top:2px;">
          <span><b style="color:#fff;">${profile.name}</b><br><span style="color:#666;">${profile.description}</span></span>
        </label>
      `).join('')}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      <button id="ld-sim-compare-btn" style="padding:10px 14px;background:#163040;border:1px solid #4488cc;color:#8cf;font-family:monospace;">Compare Selected Profiles</button>
      <button id="ld-sim-lategame-btn" style="padding:10px 14px;background:#1d2b16;border:1px solid #5b8f42;color:#9fd47a;font-family:monospace;">Compare Land vs All Routes</button>
      <button id="ld-sim-export-btn" style="padding:10px 14px;background:#181818;border:1px solid #333;color:#777;font-family:monospace;" disabled>Export Report</button>
    </div>
    <div id="ld-sim-status" style="color:#789;font-size:11px;margin-bottom:8px;">Ready. Pick a seed and scenario settings, then run a comparison.</div>
    <pre id="ld-sim-output" style="margin:0;min-height:220px;max-height:420px;overflow:auto;padding:12px;background:#0b0f14;border:1px solid #202a35;color:#cfd8e3;font-size:11px;line-height:1.45;white-space:pre-wrap;"></pre>
  `;
  startButton.insertAdjacentElement('beforebegin', section);

  const outputEl = document.getElementById('ld-sim-output') as HTMLPreElement | null;
  const statusEl = document.getElementById('ld-sim-status') as HTMLDivElement | null;
  const compareBtn = document.getElementById('ld-sim-compare-btn') as HTMLButtonElement | null;
  const lateGameBtn = document.getElementById('ld-sim-lategame-btn') as HTMLButtonElement | null;
  const exportBtn = document.getElementById('ld-sim-export-btn') as HTMLButtonElement | null;

  const syncBenchControlsFromLanding = () => {
    const landingSeed = (document.getElementById('ld-seed-input') as HTMLInputElement | null)?.value.trim() ?? '';
    const benchSeed = document.getElementById('ld-sim-seed') as HTMLInputElement | null;
    const benchSize = document.getElementById('ld-sim-map-size') as HTMLSelectElement | null;
    const benchDifficulty = document.getElementById('ld-sim-difficulty') as HTMLSelectElement | null;
    const benchTheme = document.getElementById('ld-sim-theme') as HTMLSelectElement | null;
    if (benchSeed && landingSeed) benchSeed.value = landingSeed;
    if (benchSize) benchSize.value = selectedSize;
    if (benchDifficulty) benchDifficulty.value = selectedDifficulty;
    if (benchTheme) benchTheme.value = selectedTheme;
  };
  syncBenchControlsFromLanding();

  const landingSeedEl = document.getElementById('ld-seed-input') as HTMLInputElement | null;
  landingSeedEl?.addEventListener('input', () => {
    const benchSeed = document.getElementById('ld-sim-seed') as HTMLInputElement | null;
    if (benchSeed && !benchSeed.value) benchSeed.value = landingSeedEl.value;
  });

  const getBaseSeed = (): number => {
    const seedInput = (document.getElementById('ld-sim-seed') as HTMLInputElement | null)?.value.trim() ?? '';
    if (seedInput) {
      const parsed = parseInt(seedInput, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 424242;
  };
  const getRuns = (): number => Math.max(1, Math.min(12, parseInt(((document.getElementById('ld-sim-runs') as HTMLInputElement | null)?.value ?? '3'), 10) || 3));
  const getTicks = (): number => Math.max(250, Math.min(20000, parseInt(((document.getElementById('ld-sim-ticks') as HTMLInputElement | null)?.value ?? '3000'), 10) || 3000));
  const getSeedStep = (): number => Math.max(1, Math.min(50000, parseInt(((document.getElementById('ld-sim-seed-step') as HTMLInputElement | null)?.value ?? '7919'), 10) || 7919));
  const getBenchMapSize = (): MapSize => (((document.getElementById('ld-sim-map-size') as HTMLSelectElement | null)?.value ?? 'normal') as MapSize);
  const getBenchDifficulty = (): Difficulty => (((document.getElementById('ld-sim-difficulty') as HTMLSelectElement | null)?.value ?? 'normal') as Difficulty);
  const getBenchTheme = (): Theme => (((document.getElementById('ld-sim-theme') as HTMLSelectElement | null)?.value ?? 'dark') as Theme);
  const getSelectedProfiles = (): string[] => {
    return [...document.querySelectorAll<HTMLInputElement>('#ld-sim-profiles input[data-profile]:checked')].map((el) => el.dataset['profile']!).filter(Boolean);
  };
  const setBusy = (busy: boolean, text: string) => {
    if (statusEl) statusEl.textContent = text;
    if (compareBtn) compareBtn.disabled = busy;
    if (lateGameBtn) lateGameBtn.disabled = busy;
  };

  const runBench = (profileIds: string[]) => {
    const ids = profileIds.length > 0 ? profileIds : ['landonly', 'allroutes'];
    const selectedProfiles = ids.map((id) => getProfiles(id)[0]).filter((profile): profile is NonNullable<typeof profile> => Boolean(profile));
    if (selectedProfiles.length === 0) {
      if (statusEl) statusEl.textContent = 'Pick at least one valid profile to simulate.';
      return;
    }
    const seed = getBaseSeed();
    const runs = getRuns();
    const ticks = getTicks();
    const seedStep = getSeedStep();
    const benchMapSize = getBenchMapSize();
    const benchDifficulty = getBenchDifficulty();
    const benchTheme = getBenchTheme();
    setBusy(true, `Running ${selectedProfiles.length} profile(s) across ${runs} seed(s) on ${mapSizeLabel(benchMapSize)} / ${difficultyLabel(benchDifficulty)}...`);
    if (outputEl) outputEl.textContent = 'Running simulation...';

    window.setTimeout(() => {
      const results = [];
      for (const profile of selectedProfiles) {
        for (let index = 0; index < runs; index += 1) {
          results.push(runSimulation({
            seed: seed + index * seedStep,
            ticks,
            profile,
            mapSize: benchMapSize,
            difficulty: benchDifficulty,
            theme: benchTheme,
          }));
        }
      }
      results.sort((a, b) => b.score - a.score);
      lastSimReport = [
        `TransportSim Landing Bench`,
        `Seed base: ${seed} | runs: ${runs} | ticks: ${ticks} | step: ${seedStep}`,
        `Map size: ${benchMapSize} | difficulty: ${benchDifficulty} | theme: ${benchTheme}`,
        '',
        formatSuiteReport(results),
      ].join('\n');
      if (outputEl) outputEl.textContent = lastSimReport;
      if (statusEl) statusEl.textContent = `Finished ${results.length} run(s). This compares simulation behavior before you start a live map.`;
      if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.style.color = '#9ed0ff';
        exportBtn.style.borderColor = '#3c6e97';
      }
      setBusy(false, statusEl?.textContent ?? 'Finished.');
    }, 0);
  };

  compareBtn?.addEventListener('click', () => runBench(getSelectedProfiles()));
  lateGameBtn?.addEventListener('click', () => runBench(['landonly', 'allroutes']));
  exportBtn?.addEventListener('click', () => {
    if (!lastSimReport) return;
    const blob = new Blob([lastSimReport], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `transportsim-landing-bench-${getBenchMapSize()}-${getBenchDifficulty()}-seed${getBaseSeed()}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  if (outputEl) {
    outputEl.textContent = 'No benchmark run yet.\n\nRecommended flow:\n1. Set a benchmark seed explicitly.\n2. Compare `landonly` vs `allroutes` first.\n3. Add `balanced` or `multimodal` if you want a broader read on whether rail, air, and sea are truly paying off on this scenario.';
  }
}
