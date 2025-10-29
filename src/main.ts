import Phaser from 'phaser';
import TutorialScene, {
  DEFAULT_GAME_HEIGHT,
  DEFAULT_GAME_WIDTH,
  debugSetPlayerAttributes,
  getActiveScene,
  getPlayerSnapshot,
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

// for debug
const debugToggle = document.getElementById('debug-toggle');
const debugPanel = document.getElementById('debug-panel');
const debugClose = document.getElementById('debug-close');
const debugForm = document.getElementById('debug-form');
const debugHpInput = document.getElementById('debug-hp');
const debugAtkInput = document.getElementById('debug-atk');
const debugDefInput = document.getElementById('debug-def');
const debugKeysInput = document.getElementById('debug-keys');

if (
  !(msgEl instanceof HTMLElement) ||
  !(nameEl instanceof HTMLElement) ||
  !(hpEl instanceof HTMLElement) ||
  !(atkEl instanceof HTMLElement) ||
  !(defEl instanceof HTMLElement) ||
  !(keysEl instanceof HTMLElement) ||
  !(resetButton instanceof HTMLButtonElement) ||
  !(hintButton instanceof HTMLButtonElement) ||
  !(debugToggle instanceof HTMLButtonElement) ||
  !(debugPanel instanceof HTMLElement) ||
  !(debugClose instanceof HTMLButtonElement) ||
  !(debugForm instanceof HTMLFormElement) ||
  !(debugHpInput instanceof HTMLInputElement) ||
  !(debugAtkInput instanceof HTMLInputElement) ||
  !(debugDefInput instanceof HTMLInputElement) ||
  !(debugKeysInput instanceof HTMLInputElement)
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

const toggleDebugPanel = (show: boolean) => {
  if (show) {
    debugPanel.classList.remove('hidden');
  } else {
    debugPanel.classList.add('hidden');
  }
};

const refreshDebugForm = () => {
  const snapshot = getPlayerSnapshot();
  if (!snapshot) return;
  debugHpInput.value = `${snapshot.hp}`;
  debugAtkInput.value = `${snapshot.atk}`;
  debugDefInput.value = `${snapshot.def}`;
  debugKeysInput.value = `${snapshot.keys}`;
};

debugToggle.addEventListener('click', () => {
  const isHidden = debugPanel.classList.contains('hidden');
  toggleDebugPanel(isHidden);
  if (isHidden) {
    refreshDebugForm();
  }
});

debugClose.addEventListener('click', () => {
  toggleDebugPanel(false);
});

debugForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const hp = Number.parseInt(debugHpInput.value, 10);
  const atk = Number.parseInt(debugAtkInput.value, 10);
  const def = Number.parseInt(debugDefInput.value, 10);
  const keys = Number.parseInt(debugKeysInput.value, 10);
  debugSetPlayerAttributes({
    hp: Number.isNaN(hp) ? undefined : hp,
    atk: Number.isNaN(atk) ? undefined : atk,
    def: Number.isNaN(def) ? undefined : def,
    keys: Number.isNaN(keys) ? undefined : keys
  });
  refreshDebugForm();
});
