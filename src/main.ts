import Phaser from 'phaser';
import TutorialScene, {
  DEFAULT_GAME_HEIGHT,
  DEFAULT_GAME_WIDTH,
  getActiveScene,
  registerUIHooks,
  resetPlayerState
} from './scenes/TutorialScene';
import { PlayerState } from './global/types';

const msgEl = document.getElementById('msg');
const nameEl = document.getElementById('name');
const hpEl = document.getElementById('hp');
const atkEl = document.getElementById('atk');
const defEl = document.getElementById('def');
const keysEl = document.getElementById('keys');
const resetButton = document.getElementById('reset');
const hintButton = document.getElementById('hint');

if (
  !(msgEl instanceof HTMLElement) ||
  !(nameEl instanceof HTMLElement) ||
  !(hpEl instanceof HTMLElement) ||
  !(atkEl instanceof HTMLElement) ||
  !(defEl instanceof HTMLElement) ||
  !(keysEl instanceof HTMLElement) ||
  !(resetButton instanceof HTMLButtonElement) ||
  !(hintButton instanceof HTMLButtonElement)
) {
  throw new Error('UI elements failed to mount.');
}

const postMessage = (text: string) => {
  msgEl.textContent = text;
};

const updateStats = (state: PlayerState) => {
  nameEl.textContent = state.name;
  hpEl.textContent = `${state.hp}`;
  atkEl.textContent = `${state.atk}`;
  defEl.textContent = `${state.def}`;
  keysEl.textContent = `${state.keys}`;
};

registerUIHooks({
  postMessage,
  updateStats
});

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'phaser',
  backgroundColor: '#0b0e13',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DEFAULT_GAME_WIDTH,
    height: DEFAULT_GAME_HEIGHT
  },
  transparent: true,
  scene: [TutorialScene]
};

const game = new Phaser.Game(config);

window.addEventListener('resize', () => {
  game.scale.refresh();
});

resetButton.addEventListener('click', () => {
  if (resetPlayerState()) {
    const scene = getActiveScene();
    scene?.renderPlayer();
    scene?.centerOnPlayer();
  }
});

hintButton.addEventListener('click', () => {
  postMessage(
    'Move with WASD or the arrow keys. Press E to talk with NPCs. Doors open automatically when adjacent (consumes keys). Colliding with monsters starts a battle.'
  );
});
