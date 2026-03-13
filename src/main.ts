import { Game } from './Game.ts';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiContainer = document.getElementById('ui-container') as HTMLElement;

if (!canvas || !uiContainer) {
  throw new Error('Missing #game-canvas or #ui-container elements in HTML');
}

const devMode = new URLSearchParams(location.search).get('dev') === '1';
const game = new Game(canvas, uiContainer, devMode);
game.start();
