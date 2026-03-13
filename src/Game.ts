import type { GameState, UIState } from './core/types.ts';
import type { SimSpeed } from './core/types.ts';
import { ToolType } from './core/types.ts';
import { createInitialGameState } from './core/GameState.ts';
import type { NewGameOptions } from './core/GameState.ts';
import { simulationTick, getTickDuration } from './core/GameLoop.ts';
import { Renderer } from './render/Renderer.ts';
import { Camera } from './render/Camera.ts';
import { InputHandler } from './input/InputHandler.ts';
import { createUIState } from './input/Tools.ts';
import { executeToolAction } from './input/ToolActions.ts';
import { UIManager } from './ui/UIManager.ts';
import { unlockTech } from './core/TechTree.ts';
import { TechId } from './core/types.ts';
import { TILE_SIZE } from './constants.ts';
import { migrateLegacySave } from './core/Save.ts';

export class Game {
  state: GameState;
  uiState: UIState;
  camera: Camera;
  renderer: Renderer;
  inputHandler: InputHandler;
  uiManager: UIManager;

  private canvas: HTMLCanvasElement;
  private lastTime = 0;
  private accumulator = 0;

  constructor(canvas: HTMLCanvasElement, uiContainer: HTMLElement, devMode = false) {
    this.canvas = canvas;
    migrateLegacySave();
    this.state = createInitialGameState({ devMode });
    this.uiState = createUIState();

    // Center camera on the generated map dimensions
    const worldCenterX = (this.state.map.width  * TILE_SIZE) / 2;
    const worldCenterY = (this.state.map.height * TILE_SIZE) / 2;
    this.camera = new Camera(canvas.width, canvas.height, worldCenterX, worldCenterY);

    this.renderer = new Renderer(canvas);

    this.inputHandler = new InputHandler(canvas, this.camera, this.uiState);
    this.inputHandler.setClickHandler((tx, ty) => {
      executeToolAction(this.state, this.uiState, tx, ty);
    });

    this.uiManager = new UIManager(uiContainer, (speed: SimSpeed) => {
      this.state.time.speed = speed;
    });

    this.uiManager.setToolChangeHandler((tool: ToolType) => {
      this.uiState.activeTool = tool;
    });

    this.uiManager.setNewGameHandler((opts: NewGameOptions) => {
      this.state = createInitialGameState({ ...opts, devMode });
      this.accumulator = 0;
      this.uiState = createUIState();
      this.inputHandler.setUIState(this.uiState);
      const cx = (this.state.map.width  * TILE_SIZE) / 2;
      const cy = (this.state.map.height * TILE_SIZE) / 2;
      this.camera.x = cx;
      this.camera.y = cy;
    });

    this.uiManager.setLoadSaveHandler((loaded: GameState) => {
      this.state = loaded;
      this.accumulator = 0;
      this.uiState = createUIState();
      this.inputHandler.setUIState(this.uiState);
      const cx = (this.state.map.width  * TILE_SIZE) / 2;
      const cy = (this.state.map.height * TILE_SIZE) / 2;
      this.camera.x = cx;
      this.camera.y = cy;
    });

    this.uiManager.setUnlockTechHandler((id: string) => {
      const success = unlockTech(this.state, id as TechId);
      if (success) {
        const node = this.state.tech.find((t) => t.id === id);
        if (node) this.addToast(`🔬 Unlocked: ${node.name}`);
      }
    });

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  private handleResize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.camera.resize(this.canvas.width, this.canvas.height);
  }

  start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number): void {
    // Always schedule next frame first — a crash below must not freeze the loop
    requestAnimationFrame((t) => this.frame(t));

    try {
      const dt = now - this.lastTime;
      this.lastTime = now;

      // Fixed-timestep simulation
      const tickDuration = getTickDuration(this.state.time.speed);
      if (tickDuration > 0) {
        this.accumulator += dt;
        if (this.accumulator > tickDuration * 5) {
          this.accumulator = tickDuration * 5;
        }
        while (this.accumulator >= tickDuration) {
          const completed = simulationTick(this.state);
          for (const id of completed) {
            const obj = this.state.objectives.find((o) => o.id === id);
            if (obj) this.addToast(`🎯 Objective completed: ${obj.title} (+$${obj.reward.toLocaleString()})`);
          }
          this.accumulator -= tickDuration;
        }
      }

      // Tick down toasts
      this.uiState.toasts = this.uiState.toasts
        .map((t) => ({ ...t, ttl: t.ttl - (now - this.lastTime || 16) }))
        .filter((t) => t.ttl > 0);

      // Render
      this.renderer.draw(this.state, this.uiState, this.camera);
      this.uiManager.update(this.state, this.uiState);
    } catch (err) {
      console.error('[Game] frame error:', err);
    }
  }

  private addToast(msg: string): void {
    const id = Date.now() + Math.random();
    this.uiState.toasts.push({ id, msg, ttl: 4000 });
    // Keep max 4 toasts
    if (this.uiState.toasts.length > 4) this.uiState.toasts.shift();
  }
}
