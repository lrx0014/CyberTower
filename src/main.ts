import Phaser from 'phaser';
import {
  initialiseMiniGameHost,
  registerMiniGames,
  loadMiniGamesFromManifest,
  setMiniGames,
  cancelActiveMiniGame
} from './battle/miniGameManager';
import CombatScene from './scenes/CombatScene';
import TutorialScene, {
  DEFAULT_GAME_HEIGHT,
  DEFAULT_GAME_WIDTH,
  debugGrantInventoryItem,
  debugSetPlayerAttributes,
  getPreferredPlayerName,
  getInventoryEntries,
  getPlayerSnapshot,
  normalizePlayerNameInput,
  requestDirectionalInput,
  registerUIHooks,
  resetTowerRuntime,
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
const arenaOpenButton = document.getElementById('arena-open');
const arenaModal = document.getElementById('arena-modal');
const arenaCloseButton = document.getElementById('arena-close');
const arenaSeasonLabel = document.getElementById('arena-season');
const arenaLeaderboardList = document.getElementById('arena-leaderboard');
const arenaFindMatchButton = document.getElementById('arena-find-match');
const arenaNotice = document.getElementById('arena-notice');
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
  !(arenaOpenButton instanceof HTMLButtonElement) ||
  !(arenaModal instanceof HTMLElement) ||
  !(arenaCloseButton instanceof HTMLButtonElement) ||
  !(arenaSeasonLabel instanceof HTMLElement) ||
  !(arenaLeaderboardList instanceof HTMLElement) ||
  !(arenaFindMatchButton instanceof HTMLButtonElement) ||
  !(arenaNotice instanceof HTMLElement) ||
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

type ArenaLeaderboardEntry = {
  name: string;
  rating: number;
  wins: number;
  losses: number;
};

const arenaLeaderboardData: ArenaLeaderboardEntry[] = [
  { name: 'CipherBlade', rating: 2487, wins: 12, losses: 3 },
  { name: 'ZeroDay Sage', rating: 2314, wins: 11, losses: 4 },
  { name: 'Firewall Fox', rating: 2280, wins: 10, losses: 5 },
  { name: 'Packet Punch', rating: 2196, wins: 9, losses: 6 },
  { name: 'GhostRider', rating: 2142, wins: 8, losses: 7 },
  { name: 'CryptoSentinel', rating: 2088, wins: 8, losses: 7 }
];

const arenaRatingFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

const computeWeekRangeLabel = () => {
  const now = new Date();
  const day = now.getDay(); // Sun = 0, Mon = 1
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offsetToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  return `Season Week: ${formatter.format(start)} – ${formatter.format(end)}`;
};

const renderArenaLeaderboard = () => {
  arenaLeaderboardList.innerHTML = '';
  arenaLeaderboardData.forEach((entry, index) => {
    const item = document.createElement('li');
    item.className = 'arena-leaderboard-item';

    const rank = document.createElement('span');
    rank.className = 'arena-leaderboard-rank';
    rank.textContent = `#${index + 1}`;

    const name = document.createElement('span');
    name.className = 'arena-leaderboard-name';
    name.textContent = entry.name;

    const rating = document.createElement('span');
    rating.className = 'arena-leaderboard-rating';
    rating.textContent = `${arenaRatingFormatter.format(entry.rating)} RP`;

    const record = document.createElement('span');
    record.className = 'arena-leaderboard-record';
    record.textContent = `${entry.wins}-${entry.losses}`;

    item.append(rank, name, rating, record);
    arenaLeaderboardList.appendChild(item);
  });
};

let arenaKeyHandler: ((event: KeyboardEvent) => void) | null = null;

const closeArenaModal = () => {
  if (arenaModal.classList.contains('hidden')) return;
  arenaModal.classList.add('hidden');
  if (arenaKeyHandler) {
    window.removeEventListener('keydown', arenaKeyHandler);
    arenaKeyHandler = null;
  }
  arenaOpenButton.focus();
};

const openArenaModal = () => {
  arenaNotice.classList.add('hidden');
  arenaSeasonLabel.textContent = computeWeekRangeLabel();
  renderArenaLeaderboard();
  arenaModal.classList.remove('hidden');
  arenaModal.focus({ preventScroll: true });
  arenaKeyHandler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeArenaModal();
    }
  };
  window.addEventListener('keydown', arenaKeyHandler);
};

arenaOpenButton.addEventListener('click', () => {
  openArenaModal();
});

arenaCloseButton.addEventListener('click', () => {
  closeArenaModal();
});

arenaModal.addEventListener('click', (event) => {
  if (event.target === arenaModal) {
    closeArenaModal();
  }
});

arenaFindMatchButton.addEventListener('click', () => {
  arenaNotice.textContent =
    'Matchmaking is still under development. Arena battles are not available in this demo build.';
  arenaNotice.classList.remove('hidden');
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

const destroyGameInstance = () => {
  if (!game) return;
  game.destroy(true);
  game = null;
  window.removeEventListener('resize', handleResize);
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

const removeStoredPlayerName = () => {
  try {
    window.localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
  } catch (err) {
    // ignore storage failures
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

const performFullRestart = () => {
  cancelActiveMiniGame(new Error('Restarting game.'));
  destroyGameInstance();
  CombatScene.resetSnapshots();
  TutorialScene.resetSnapshots();
  resetTowerRuntime();
  removeStoredPlayerName();
  if (!debugPanel.classList.contains('hidden')) {
    debugPanel.classList.add('hidden');
  }
  const defaultState: PlayerState = {
    name: '',
    px: 0,
    py: 0,
    hp: 0,
    atk: 0,
    def: 0,
    keys: 0,
    inventory: {}
  };
  postMessage('Game reset. Enter your name to begin.');
  updateLevelName('—');
  updateStats(defaultState);
  playerNameInput.value = '';
  playerNameError.classList.add('hidden');
  playerNameInput.placeholder = getPreferredPlayerName();
  hidePlayerNameModal();
  initializePlayerName();
};

initializePlayerName();

resetButton.addEventListener('click', () => {
  performFullRestart();
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
