import Phaser from 'phaser';
import {
  initialiseMiniGameHost,
  registerMiniGames,
  loadMiniGamesFromManifest,
  setMiniGames
} from './battle/miniGameManager';
import CombatScene from './scenes/CombatScene';
import TutorialScene, {
  DEFAULT_GAME_HEIGHT,
  DEFAULT_GAME_WIDTH,
  debugGrantInventoryItem,
  debugSetPlayerAttributes,
  getPreferredPlayerName,
  getActiveScene,
  getInventoryEntries,
  getPlayerSnapshot,
  normalizePlayerNameInput,
  requestDirectionalInput,
  registerUIHooks,
  resetPlayerState,
  setPreferredPlayerName,
  PLAYER_NAME_MAX_LENGTH
} from './scenes/TutorialScene';
import type { DirectionInput } from './scenes/TutorialScene';
import { PlayerState } from './global/types';
import { initialiseJournalUI } from './journal/travelerJournal';

const msgEl = document.getElementById('msg');
const levelNameEl = document.getElementById('level-name');
const nameEl = document.getElementById('name');
const hpEl = document.getElementById('hp');
const atkEl = document.getElementById('atk');
const defEl = document.getElementById('def');
const resetButton = document.getElementById('reset');
const hintButton = document.getElementById('hint');
const inventoryList = document.getElementById('inventory-list');
const journalOpenButton = document.getElementById('journal-open');
const journalModal = document.getElementById('journal-modal');
const journalCloseButton = document.getElementById('journal-close');
const journalNav = document.getElementById('journal-nav');
const journalContent = document.getElementById('journal-content');
const miniGameOverlay = document.getElementById('minigame-overlay');
const miniGameFrame = document.getElementById('minigame-frame');
const miniGameLoading = document.getElementById('minigame-loading');
const playerNameModal = document.getElementById('player-name-modal');
const playerNameForm = document.getElementById('player-name-form');
const playerNameInput = document.getElementById('player-name-input');
const playerNameError = document.getElementById('player-name-error');

// for debug
const debugToggle = document.getElementById('debug-toggle');
const debugPanel = document.getElementById('debug-panel');
const debugClose = document.getElementById('debug-close');
const debugForm = document.getElementById('debug-form');
const debugHpInput = document.getElementById('debug-hp');
const debugAtkInput = document.getElementById('debug-atk');
const debugDefInput = document.getElementById('debug-def');
const debugItemGidInput = document.getElementById('debug-item-gid');
const debugItemQtyInput = document.getElementById('debug-item-qty');
const debugItemApplyButton = document.getElementById('debug-item-apply');
const mobileControls = document.getElementById('mobile-controls');
const mobileButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(
  '#mobile-controls [data-direction]'
));

if (
  !(msgEl instanceof HTMLElement) ||
  !(nameEl instanceof HTMLElement) ||
  !(hpEl instanceof HTMLElement) ||
  !(atkEl instanceof HTMLElement) ||
  !(defEl instanceof HTMLElement) ||
  !(levelNameEl instanceof HTMLElement) ||
  !(inventoryList instanceof HTMLElement) ||
  !(journalOpenButton instanceof HTMLButtonElement) ||
  !(journalModal instanceof HTMLElement) ||
  !(journalCloseButton instanceof HTMLButtonElement) ||
  !(journalNav instanceof HTMLElement) ||
  !(journalContent instanceof HTMLElement) ||
  !(miniGameOverlay instanceof HTMLElement) ||
  !(miniGameFrame instanceof HTMLIFrameElement) ||
  !(miniGameLoading instanceof HTMLElement) ||
  !(playerNameModal instanceof HTMLElement) ||
  !(playerNameForm instanceof HTMLFormElement) ||
  !(playerNameInput instanceof HTMLInputElement) ||
  !(playerNameError instanceof HTMLElement) ||
  !(resetButton instanceof HTMLButtonElement) ||
  !(hintButton instanceof HTMLButtonElement) ||
  !(debugToggle instanceof HTMLButtonElement) ||
  !(debugPanel instanceof HTMLElement) ||
  !(debugClose instanceof HTMLButtonElement) ||
  !(debugForm instanceof HTMLFormElement) ||
  !(debugHpInput instanceof HTMLInputElement) ||
  !(debugAtkInput instanceof HTMLInputElement) ||
  !(debugDefInput instanceof HTMLInputElement) ||
  !(debugItemGidInput instanceof HTMLInputElement) ||
  !(debugItemQtyInput instanceof HTMLInputElement) ||
  !(debugItemApplyButton instanceof HTMLButtonElement) ||
  !(mobileControls instanceof HTMLElement) ||
  mobileButtons.length === 0
) {
  throw new Error('UI elements failed to mount.');
}

const invalidMobileButton = mobileButtons.find((btn) => !(btn instanceof HTMLButtonElement));
if (invalidMobileButton) {
  throw new Error('Mobile controls failed to mount.');
}

initialiseJournalUI({
  openButton: journalOpenButton,
  closeButton: journalCloseButton,
  modal: journalModal,
  list: journalNav,
  content: journalContent
});

initialiseMiniGameHost({
  overlay: miniGameOverlay,
  frame: miniGameFrame,
  loading: miniGameLoading
});

const fallbackMiniGame = {
  id: 'quiz',
  name: 'Cybersecurity Quiz Duel',
  url: '/mini-games/quiz/index.html',
  timeoutMs: 60000
};

registerMiniGames([fallbackMiniGame]);

loadMiniGamesFromManifest('/mini-games/loader.json')
  .then((descriptors) => {
    if (Array.isArray(descriptors) && descriptors.length > 0) {
      setMiniGames(descriptors);
    }
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[battle] failed to load mini-game list', err);
  });

const postMessage = (text: string) => {
  msgEl.textContent = text;
};

const updateLevelName = (text: string) => {
  levelNameEl.textContent = text;
};

const updateStats = (state: PlayerState) => {
  nameEl.textContent = state.name;
  hpEl.textContent = `${state.hp}`;
  atkEl.textContent = `${state.atk}`;
  defEl.textContent = `${state.def}`;
  renderInventory(state);
};

const renderInventory = (state: PlayerState) => {
  while (inventoryList.firstChild) {
    inventoryList.removeChild(inventoryList.firstChild);
  }

  const entries = getInventoryEntries().filter((entry) => entry.count > 0);
  if (state.keys > 0) {
    entries.push({
      gid: '__generic_key__',
      name: 'Key',
      count: state.keys
    });
  }

  if (entries.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'inventory-empty';
    emptyEl.textContent = 'Empty';
    inventoryList.appendChild(emptyEl);
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'stat';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = entry.name;
    const valueSpan = document.createElement('span');
    valueSpan.textContent = `x${entry.count}`;
    row.appendChild(nameSpan);
    row.appendChild(valueSpan);
    inventoryList.appendChild(row);
  });
};

registerUIHooks({
  postMessage,
  updateStats,
  updateLevelName
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
  scene: [TutorialScene, CombatScene]
};

let game: Phaser.Game | null = null;
const handleResize = () => {
  if (game) {
    game.scale.refresh();
  }
};

const startGame = () => {
  if (game) return;
  game = new Phaser.Game(config);
  window.addEventListener('resize', handleResize);
};

const PLAYER_NAME_STORAGE_KEY = 'cybertower.playerName';

const readStoredPlayerName = (): string | null => {
  try {
    return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
  } catch (err) {
    return null;
  }
};

const writeStoredPlayerName = (value: string) => {
  try {
    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, value);
  } catch (err) {
    // ignore storage failures (e.g. disabled storage)
  }
};

const hidePlayerNameModal = () => {
  playerNameModal.classList.add('hidden');
  playerNameInput.blur();
};

const showPlayerNameModal = () => {
  playerNameModal.classList.remove('hidden');
  window.setTimeout(() => {
    playerNameInput.focus();
    playerNameInput.select();
  }, 0);
};

playerNameInput.maxLength = PLAYER_NAME_MAX_LENGTH;
playerNameInput.placeholder = getPreferredPlayerName();

playerNameInput.addEventListener('input', () => {
  if (!playerNameError.classList.contains('hidden')) {
    playerNameError.classList.add('hidden');
  }
});

playerNameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const normalized = normalizePlayerNameInput(playerNameInput.value);
  if (!normalized) {
    playerNameError.classList.remove('hidden');
    playerNameInput.focus();
    return;
  }
  const appliedName = setPreferredPlayerName(normalized);
  nameEl.textContent = appliedName;
  playerNameInput.value = appliedName;
  playerNameError.classList.add('hidden');
  writeStoredPlayerName(appliedName);
  hidePlayerNameModal();
  startGame();
});

const initializePlayerName = () => {
  const storedName = readStoredPlayerName();
  const normalizedStored = storedName ? normalizePlayerNameInput(storedName) : null;
  if (normalizedStored) {
    const appliedName = setPreferredPlayerName(normalizedStored);
    nameEl.textContent = appliedName;
    playerNameInput.value = appliedName;
    playerNameError.classList.add('hidden');
    writeStoredPlayerName(appliedName);
    hidePlayerNameModal();
    startGame();
    return;
  }
  playerNameInput.value = '';
  playerNameError.classList.add('hidden');
  showPlayerNameModal();
};

initializePlayerName();

resetButton.addEventListener('click', () => {
  if (resetPlayerState()) {
    const scene = getActiveScene();
    scene?.renderPlayer();
    scene?.centerOnPlayer();
  }
});

hintButton.addEventListener('click', () => {
  postMessage(
    'Move with WASD or the arrow keys. Doors open automatically when adjacent (consumes keys). Colliding with monsters starts a battle.'
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
  debugItemGidInput.value = '';
  debugItemQtyInput.value = '1';
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
  debugSetPlayerAttributes({
    hp: Number.isNaN(hp) ? undefined : hp,
    atk: Number.isNaN(atk) ? undefined : atk,
    def: Number.isNaN(def) ? undefined : def
  });
  refreshDebugForm();
});

debugItemApplyButton.addEventListener('click', () => {
  const gid = debugItemGidInput.value.trim();
  const qty = Number.parseInt(debugItemQtyInput.value, 10);
  if (!gid) return;
  if (Number.isNaN(qty) || qty <= 0) return;
  debugGrantInventoryItem(gid, qty);
  debugItemQtyInput.value = '1';
});

const triggerDirection = (direction: DirectionInput) => {
  requestDirectionalInput(direction);
};

const activeTimers = new Map<HTMLButtonElement, number>();
const repeatDelayMs = 150;

const isDirectionInput = (value: string): value is DirectionInput => {
  return value === 'up' || value === 'down' || value === 'left' || value === 'right';
};

const stopContinuousMove = (button: HTMLButtonElement) => {
  const timer = activeTimers.get(button);
  if (timer !== undefined) {
    window.clearInterval(timer);
    activeTimers.delete(button);
  }
};

const startContinuousMove = (button: HTMLButtonElement, direction: DirectionInput, pointerId: number) => {
  triggerDirection(direction);
  stopContinuousMove(button);
  const intervalId = window.setInterval(() => {
    triggerDirection(direction);
  }, repeatDelayMs);
  activeTimers.set(button, intervalId);
  try {
    button.setPointerCapture(pointerId);
  } catch (err) {
    // ignore pointer capture errors (e.g. unsupported scenarios)
  }
};

mobileButtons.forEach((button) => {
  const rawDirection = (button.dataset.direction ?? '').trim().toLowerCase();
  if (!isDirectionInput(rawDirection)) return;
  const direction = rawDirection;

  const handlePointerUp = (event: PointerEvent) => {
    stopContinuousMove(button);
    if (button.hasPointerCapture(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }
  };

  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    startContinuousMove(button, direction, event.pointerId);
  });

  button.addEventListener('pointerup', (event) => {
    event.preventDefault();
    handlePointerUp(event);
  });

  button.addEventListener('pointercancel', (event) => {
    handlePointerUp(event);
  });

  button.addEventListener('pointerleave', () => {
    stopContinuousMove(button);
  });

  button.addEventListener('pointerout', () => {
    stopContinuousMove(button);
  });

  button.addEventListener('click', (event) => {
    event.preventDefault();
  });
});

window.addEventListener('pointerup', () => {
  mobileButtons.forEach((button) => {
    stopContinuousMove(button);
  });
});
