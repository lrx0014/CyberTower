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
const workshopOpenButton = document.getElementById('workshop-open');
const workshopModal = document.getElementById('workshop-modal');
const workshopCloseButton = document.getElementById('workshop-close');
const workshopNotice = document.getElementById('workshop-notice');
const workshopForm = document.getElementById('workshop-form');
const workshopTemplateSelect = document.getElementById('workshop-template');
const workshopQuestionsContainer = document.getElementById('workshop-questions');
const workshopAddQuestionButton = document.getElementById('workshop-add-question');
const workshopNotesInput = document.getElementById('workshop-notes');
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
  !(workshopOpenButton instanceof HTMLButtonElement) ||
  !(workshopModal instanceof HTMLElement) ||
  !(workshopCloseButton instanceof HTMLButtonElement) ||
  !(workshopNotice instanceof HTMLElement) ||
  !(workshopForm instanceof HTMLFormElement) ||
  !(workshopTemplateSelect instanceof HTMLSelectElement) ||
  !(workshopQuestionsContainer instanceof HTMLElement) ||
  !(workshopAddQuestionButton instanceof HTMLButtonElement) ||
  !(workshopNotesInput instanceof HTMLTextAreaElement) ||
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

interface WorkshopOptionState {
  id: string;
  text: string;
}

interface WorkshopQuestionState {
  id: string;
  prompt: string;
  explanation: string;
  options: WorkshopOptionState[];
  correctOptionId: string | null;
}

const workshopQuestions: WorkshopQuestionState[] = [];
let workshopQuestionCounter = 0;
let workshopOptionCounter = 0;

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

const MIN_WORKSHOP_OPTIONS = 2;
const MAX_WORKSHOP_OPTIONS = 6;

const hideWorkshopNotice = () => {
  workshopNotice.classList.add('hidden');
  workshopNotice.classList.remove('success', 'error');
};

const showWorkshopNotice = (message: string, variant: 'info' | 'success' | 'error' = 'info') => {
  workshopNotice.textContent = message;
  workshopNotice.classList.remove('hidden', 'success', 'error');
  if (variant === 'success') {
    workshopNotice.classList.add('success');
  } else if (variant === 'error') {
    workshopNotice.classList.add('error');
  }
};

const createWorkshopOption = (): WorkshopOptionState => {
  workshopOptionCounter += 1;
  return { id: `option-${workshopOptionCounter}`, text: '' };
};

const addWorkshopQuestionState = () => {
  workshopQuestionCounter += 1;
  const optionA = createWorkshopOption();
  const optionB = createWorkshopOption();
  const newQuestion: WorkshopQuestionState = {
    id: `question-${workshopQuestionCounter}`,
    prompt: '',
    explanation: '',
    options: [optionA, optionB],
    correctOptionId: optionA.id
  };
  workshopQuestions.push(newQuestion);
};

const removeWorkshopQuestionState = (questionId: string) => {
  const index = workshopQuestions.findIndex((question) => question.id === questionId);
  if (index >= 0) {
    workshopQuestions.splice(index, 1);
  }
};

const addWorkshopOptionToQuestion = (questionId: string) => {
  const question = workshopQuestions.find((item) => item.id === questionId);
  if (!question) return;
  if (question.options.length >= MAX_WORKSHOP_OPTIONS) {
    showWorkshopNotice(`Each question can have up to ${MAX_WORKSHOP_OPTIONS} answer options.`, 'error');
    return;
  }
  question.options.push(createWorkshopOption());
};

const removeWorkshopOptionFromQuestion = (questionId: string, optionId: string) => {
  const question = workshopQuestions.find((item) => item.id === questionId);
  if (!question) return;
  if (question.options.length <= MIN_WORKSHOP_OPTIONS) {
    showWorkshopNotice(`Each question needs at least ${MIN_WORKSHOP_OPTIONS} answer options.`, 'error');
    return;
  }
  const index = question.options.findIndex((option) => option.id === optionId);
  if (index >= 0) {
    question.options.splice(index, 1);
    if (question.correctOptionId === optionId) {
      question.correctOptionId = question.options[0]?.id ?? null;
    }
  }
};

const renderWorkshopQuestions = () => {
  const templateSelected = workshopTemplateSelect.value.trim().length > 0;
  workshopQuestionsContainer.innerHTML = '';

  if (!templateSelected) {
    const placeholder = document.createElement('div');
    placeholder.className = 'workshop-empty';
    placeholder.textContent = 'Pick a game style to start building new questions.';
    workshopQuestionsContainer.appendChild(placeholder);
    return;
  }

  if (workshopQuestions.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'workshop-empty';
    placeholder.textContent = 'No questions yet. Press “Add Question” to begin.';
    workshopQuestionsContainer.appendChild(placeholder);
    return;
  }

  workshopQuestions.forEach((question, index) => {
    const questionCard = document.createElement('div');
    questionCard.className = 'workshop-question';

    const header = document.createElement('div');
    header.className = 'workshop-question-header';
    const title = document.createElement('h5');
    title.textContent = `Question ${index + 1}`;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'workshop-danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      removeWorkshopQuestionState(question.id);
      renderWorkshopQuestions();
      hideWorkshopNotice();
    });
    header.append(title, removeBtn);
    questionCard.appendChild(header);

    const promptField = document.createElement('label');
    promptField.className = 'workshop-field';
    const promptLabel = document.createElement('span');
    promptLabel.textContent = 'Question Text';
    const promptTextarea = document.createElement('textarea');
    promptTextarea.placeholder = 'What question do you want to add?';
    promptTextarea.value = question.prompt;
    promptTextarea.addEventListener('input', () => {
      question.prompt = promptTextarea.value;
      hideWorkshopNotice();
    });
    promptField.append(promptLabel, promptTextarea);
    questionCard.appendChild(promptField);

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'workshop-option-list';
    question.options.forEach((option) => {
      const optionRow = document.createElement('div');
      optionRow.className = 'workshop-option';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `workshop-correct-${question.id}`;
      radio.value = option.id;
      radio.checked = question.correctOptionId === option.id;
      radio.addEventListener('change', () => {
        question.correctOptionId = option.id;
        hideWorkshopNotice();
      });

      const optionInput = document.createElement('input');
      optionInput.type = 'text';
      optionInput.placeholder = 'Answer option';
      optionInput.value = option.text;
      optionInput.addEventListener('input', () => {
        option.text = optionInput.value;
        hideWorkshopNotice();
      });

      const removeOptionButton = document.createElement('button');
      removeOptionButton.type = 'button';
      removeOptionButton.className = 'workshop-tertiary';
      removeOptionButton.textContent = 'Remove';
      removeOptionButton.disabled = question.options.length <= MIN_WORKSHOP_OPTIONS;
      removeOptionButton.addEventListener('click', () => {
        if (question.options.length <= MIN_WORKSHOP_OPTIONS) {
          showWorkshopNotice(
            `Each question needs at least ${MIN_WORKSHOP_OPTIONS} answer options.`,
            'error'
          );
          return;
        }
        removeWorkshopOptionFromQuestion(question.id, option.id);
        renderWorkshopQuestions();
        hideWorkshopNotice();
      });

      optionRow.append(radio, optionInput, removeOptionButton);
      optionsContainer.appendChild(optionRow);
    });
    questionCard.appendChild(optionsContainer);

    const addOptionButton = document.createElement('button');
    addOptionButton.type = 'button';
    addOptionButton.className = 'workshop-tertiary';
    addOptionButton.textContent = 'Add answer option';
    addOptionButton.addEventListener('click', () => {
      addWorkshopOptionToQuestion(question.id);
      renderWorkshopQuestions();
      hideWorkshopNotice();
    });
    questionCard.appendChild(addOptionButton);

    const explanationField = document.createElement('label');
    explanationField.className = 'workshop-field';
    const explanationLabel = document.createElement('span');
    explanationLabel.textContent = 'Why this answer is correct (optional)';
    const explanationTextarea = document.createElement('textarea');
    explanationTextarea.placeholder = 'Tell players why the correct answer is right.';
    explanationTextarea.value = question.explanation;
    explanationTextarea.rows = 2;
    explanationTextarea.addEventListener('input', () => {
      question.explanation = explanationTextarea.value;
      hideWorkshopNotice();
    });
    explanationField.append(explanationLabel, explanationTextarea);
    questionCard.appendChild(explanationField);

    workshopQuestionsContainer.appendChild(questionCard);
  });
};

const updateWorkshopFormState = () => {
  const templateSelected = workshopTemplateSelect.value.trim().length > 0;
  workshopAddQuestionButton.disabled = !templateSelected;
  renderWorkshopQuestions();
};

let arenaKeyHandler: ((event: KeyboardEvent) => void) | null = null;
let workshopKeyHandler: ((event: KeyboardEvent) => void) | null = null;

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

const closeWorkshopModal = () => {
  if (workshopModal.classList.contains('hidden')) return;
  workshopModal.classList.add('hidden');
  if (workshopKeyHandler) {
    window.removeEventListener('keydown', workshopKeyHandler);
    workshopKeyHandler = null;
  }
  hideWorkshopNotice();
  workshopOpenButton.focus();
};

const openWorkshopModal = () => {
  hideWorkshopNotice();
  workshopModal.classList.remove('hidden');
  workshopModal.focus({ preventScroll: true });
  updateWorkshopFormState();
  workshopKeyHandler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeWorkshopModal();
    }
  };
  window.addEventListener('keydown', workshopKeyHandler);
};

workshopOpenButton.addEventListener('click', () => {
  openWorkshopModal();
});

workshopCloseButton.addEventListener('click', () => {
  closeWorkshopModal();
});

workshopModal.addEventListener('click', (event) => {
  if (event.target === workshopModal) {
    closeWorkshopModal();
  }
});

workshopTemplateSelect.addEventListener('change', () => {
  hideWorkshopNotice();
  updateWorkshopFormState();
});

workshopAddQuestionButton.addEventListener('click', () => {
  if (!workshopTemplateSelect.value.trim()) {
    showWorkshopNotice('Pick a game style before adding questions.', 'error');
    workshopTemplateSelect.focus();
    return;
  }
  addWorkshopQuestionState();
  renderWorkshopQuestions();
  hideWorkshopNotice();
});

workshopForm.addEventListener('submit', (event) => {
  event.preventDefault();
  hideWorkshopNotice();

  const templateValue = workshopTemplateSelect.value.trim();
  if (!templateValue) {
    showWorkshopNotice('Pick a game style before you send it in.', 'error');
    workshopTemplateSelect.focus();
    return;
  }

  if (workshopQuestions.length === 0) {
    showWorkshopNotice('Add at least one question to your quiz version.', 'error');
    return;
  }

  for (let i = 0; i < workshopQuestions.length; i += 1) {
    const question = workshopQuestions[i];
    const position = i + 1;
    const prompt = question.prompt.trim();
    if (!prompt) {
      showWorkshopNotice(`Question ${position} is missing a prompt.`, 'error');
      return;
    }
    const trimmedOptions = question.options.map((option) => ({
      id: option.id,
      text: option.text.trim()
    }));
    const filledOptionCount = trimmedOptions.filter((option) => option.text.length > 0).length;
    if (filledOptionCount < MIN_WORKSHOP_OPTIONS) {
      showWorkshopNotice(`Question ${position} needs at least two answer options filled in.`, 'error');
      return;
    }
    if (!question.correctOptionId) {
      showWorkshopNotice(`Select the correct answer for question ${position}.`, 'error');
      return;
    }
    const correctOption = trimmedOptions.find((option) => option.id === question.correctOptionId);
    if (!correctOption || correctOption.text.length === 0) {
      showWorkshopNotice(`Provide text for the correct answer in question ${position}.`, 'error');
      return;
    }
  }

  const questionCount = workshopQuestions.length;
  const templateLabel = workshopTemplateSelect.selectedOptions[0]?.textContent?.trim() ?? templateValue;

  showWorkshopNotice(
    `Mock submission ready! Your “${templateLabel}” quiz with ${questionCount} question${questionCount > 1 ? 's' : ''} will be checked once the Workshop opens.`,
    'success'
  );

  workshopTemplateSelect.selectedIndex = 0;
  workshopNotesInput.value = '';
  workshopQuestions.length = 0;
  updateWorkshopFormState();
});

updateWorkshopFormState();

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
