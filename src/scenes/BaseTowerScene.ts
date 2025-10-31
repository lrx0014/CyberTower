import Phaser from 'phaser';
import { Vec2, gameEventBus, GameEvent, GameEventType } from '../event/bus/eventBus';
import { createTowerEventHandlers } from '../event/events';
import { DoorUnlockerInfo, TowerEventContext } from '../event/context';
import storyManager from '../story/storyManager';
import { StoryNodeEvent } from '../story/storyTypes';
import { DoorData, ItemData, MonsterStats, PlayerState, TileKey, TileType, UIHooks } from '../global/types';

export const DEFAULT_GAME_WIDTH = 48 * 15 + 24;
export const DEFAULT_GAME_HEIGHT = 48 * 15 + 24;

const CACHE_BUST = Date.now();

let CELL = 48;
let COLS = 0;
let ROWS = 0;
let state: PlayerState | null = null;
let map: TileType[][] | null = null;
let spawn: { x: number; y: number } = { x: 0, y: 0 };
let playerName = 'Traveler';

const monsterData = new Map<TileKey, MonsterStats>();
const itemData = new Map<TileKey, ItemData>();
const doorData = new Map<TileKey, DoorData>();
const itemCatalog = new Map<string, { name?: string }>();
const doorUnlockers = new Map<TileKey, DoorUnlockerInfo>();
const storyTriggers = new Map<TileKey, { storyId: string; once: boolean }>();

type Facing = 'up' | 'down' | 'left' | 'right';


let playerFrames: Record<Facing, number[]> = {
  up: [],
  down: [],
  left: [],
  right: []
};
let defaultPlayerFrame = 0;
let playerFacing: Facing = 'down';
let playerAnimStep = 0;
let playerCurrentFrame = 0;

let uiHooks: UIHooks | null = null;
let activeScene: BaseTowerScene | null = null;

function normalizeFrameList(frames: Array<number | undefined>, fallback: number): number[] {
  const ordered: number[] = [];
  frames.forEach((frame) => {
    if (typeof frame === 'number' && !Number.isNaN(frame)) {
      ordered.push(frame);
    }
  });
  return ordered.length > 0 ? ordered : [fallback];
}

function preparePlayerFrames(tileset: Phaser.Tilemaps.Tileset) {
  playerFrames = {
    up: [],
    down: [],
    left: [],
    right: []
  };
  defaultPlayerFrame = 0;
  let fallbackFrame: number | null = null;

  const tileProps = tileset.tileProperties as Record<string, Record<string, unknown>> | undefined;
  if (tileProps) {
    Object.entries(tileProps).forEach(([indexStr, props]) => {
      if (!props || props.kind !== 'player') return;
      const frameIndex = Number(indexStr);
      const dir = props.dir as Facing | undefined;
      const rawSeq = props.seq;

      if (dir && dir in playerFrames) {
        const seqIndex = rawSeq !== undefined ? Number(rawSeq) : undefined;
        if (seqIndex !== undefined && !Number.isNaN(seqIndex)) {
          playerFrames[dir][seqIndex] = frameIndex;
        } else {
          playerFrames[dir].push(frameIndex);
        }
      } else if (fallbackFrame === null) {
        fallbackFrame = frameIndex;
      }
    });
  }

  if (fallbackFrame === null) {
    fallbackFrame = playerFrames.down.find((f) => typeof f === 'number') ?? 0;
  }
  defaultPlayerFrame = fallbackFrame ?? 0;

  (Object.keys(playerFrames) as Facing[]).forEach((dir) => {
    playerFrames[dir] = normalizeFrameList(playerFrames[dir], defaultPlayerFrame);
  });

  resetPlayerAnimationState();
}

function resetPlayerAnimationState() {
  playerFacing = 'down';
  playerAnimStep = 0;
  playerCurrentFrame = playerFrames[playerFacing]?.[0] ?? defaultPlayerFrame;
}

function selectPlayerFrame(advance: boolean): number {
  const frames = playerFrames[playerFacing] ?? [defaultPlayerFrame];
  if (frames.length === 0) {
    playerCurrentFrame = defaultPlayerFrame;
    playerAnimStep = 0;
    return playerCurrentFrame;
  }
  if (advance) {
    playerAnimStep = (playerAnimStep + 1) % frames.length;
  } else if (playerAnimStep >= frames.length) {
    playerAnimStep = 0;
  }
  playerCurrentFrame = frames[playerAnimStep] ?? frames[0];
  return playerCurrentFrame;
}

function facingFromDelta(dx: number, dy: number): Facing | null {
  if (dx > 0) return 'right';
  if (dx < 0) return 'left';
  if (dy > 0) return 'down';
  if (dy < 0) return 'up';
  return null;
}

export function registerUIHooks(hooks: UIHooks) {
  uiHooks = hooks;
  const scene = getActiveScene();
  if (scene) {
    hooks.updateLevelName(scene.getDisplayName());
  }
  if (state) {
    hooks.updateStats(state);
  }
}

export function getActiveScene(): BaseTowerScene | null {
  return activeScene;
}

export type DirectionInput = 'up' | 'down' | 'left' | 'right';

export function requestDirectionalInput(direction: DirectionInput) {
  if (!direction) return;
  activeScene?.handleDirectionalInput(direction);
}

export function resetPlayerState(): boolean {
  if (!state) return false;
  state = { name: playerName, px: spawn.x, py: spawn.y, hp: 100, atk: 0, def: 0, keys: 0, inventory: {} };
  resetPlayerAnimationState();
  selectPlayerFrame(false);
  updateUI();
  postMsg('Reset to the spawn point.');
  return true;
}

function postMsg(text: string) {
  uiHooks?.postMessage(text);
}

function updateUI() {
  if (!state) return;
  uiHooks?.updateStats(state);
}

function registerItemDefinition(gid: string, name?: string) {
  if (!gid) return;
  const trimmedName = typeof name === 'string' && name.trim().length > 0 ? name.trim() : undefined;
  const existing = itemCatalog.get(gid) ?? {};
  if (trimmedName) {
    existing.name = trimmedName;
  }
  itemCatalog.set(gid, existing);
}

const NAME_KEYS = ['displayName', 'label', 'name', 'title'];

function getNameFromProps(props: Record<string, unknown> | undefined): string | undefined {
  if (!props) return undefined;
  for (const key of NAME_KEYS) {
    const value = props[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function seedItemCatalogFromTiles(map: Phaser.Tilemaps.Tilemap) {
  map.tilesets.forEach((tileset) => {
    const tileProps = tileset.tileProperties as Record<string, Record<string, unknown>> | undefined;
    if (!tileProps) return;
    Object.entries(tileProps).forEach(([indexStr, props]) => {
      if (!props) return;
      const rawGid = props.gid;
      if (rawGid === undefined || rawGid === null) return;
      const definedGid = String(rawGid).trim();
      if (!definedGid) return;
      const tileName = getNameFromProps(props);
      registerItemDefinition(definedGid, tileName);
    });
  });
}

function addInventoryItem(gid: string, quantity: number, name?: string) {
  if (!state || !gid) return;
  registerItemDefinition(gid, name);
  const q = Math.max(1, Number.isFinite(quantity) ? Math.floor(quantity) : 1);
  const current = state.inventory[gid] ?? 0;
  state.inventory[gid] = current + q;
}

function consumeInventoryItem(gid: string, quantity: number): boolean {
  if (!state || !gid) return false;
  const current = state.inventory[gid] ?? 0;
  const required = Math.max(1, Number.isFinite(quantity) ? Math.floor(quantity) : 1);
  if (current < required) return false;
  const next = current - required;
  if (next > 0) {
    state.inventory[gid] = next;
  } else {
    delete state.inventory[gid];
  }
  return true;
}

function getInventoryName(gid: string | undefined, fallback?: string): string {
  if (!gid) return fallback ?? 'key';
  const fromCatalog = itemCatalog.get(gid)?.name;
  if (fromCatalog && fromCatalog.length > 0) return fromCatalog;
  if (fallback && fallback.length > 0) return fallback;
  return gid;
}

export function getPlayerSnapshot(): PlayerState | null {
  if (!state) return null;
  return { ...state };
}

export interface InventoryEntry {
  gid: string;
  name: string;
  count: number;
}

export function getInventoryEntries(): InventoryEntry[] {
  if (!state) return [];
  return Object.entries(state.inventory)
    .map(([gid, count]) => ({
      gid,
      count,
      name: getInventoryName(gid, undefined)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const clampStat = (value: number | undefined, fallback: number): number => {
  if (value === undefined || Number.isNaN(value)) return fallback;
  const v = Math.floor(value);
  return Number.isFinite(v) ? Math.max(0, v) : fallback;
};

export function debugSetPlayerAttributes(
  attrs: Partial<Pick<PlayerState, 'hp' | 'atk' | 'def'>>
): PlayerState | null {
  if (!state) return null;
  if (attrs.hp !== undefined) state.hp = clampStat(attrs.hp, state.hp);
  if (attrs.atk !== undefined) state.atk = clampStat(attrs.atk, state.atk);
  if (attrs.def !== undefined) state.def = clampStat(attrs.def, state.def);
  updateUI();
  postMsg('Debug: Player attributes updated.');
  return { ...state };
}

export function debugGrantInventoryItem(gid: string, count: number, name?: string): PlayerState | null {
  if (!state) return null;
  const trimmedGid = gid.trim();
  if (!trimmedGid) return { ...state };
  const amount = Math.floor(count);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ...state };
  }
  const known = itemCatalog.has(trimmedGid);
  if (!known && !name) {
    postMsg(`Debug Error: item not found with gid ${trimmedGid}`);
    return { ...state };
  }
  addInventoryItem(trimmedGid, amount, name);
  const itemName = getInventoryName(trimmedGid, name);
  postMsg(`Debug: Granted ${itemName}${amount > 1 ? ` x${amount}` : ''}.`);
  updateUI();
  return { ...state };
}

const keyOf = (x: number, y: number): TileKey => `${x},${y}`;
const parseTileKey = (key: TileKey): { x: number; y: number } => {
  const [sx, sy] = key.split(',');
  return { x: Number.parseInt(sx, 10), y: Number.parseInt(sy, 10) };
};

function battleCalc(monster: MonsterStats) {
  if (!state) throw new Error('Player state is not initialised.');
  const playerDamage = Math.max(0, state.atk - monster.def);
  const monsterDamage = Math.max(0, monster.atk - state.def);
  if (playerDamage <= 0) return { canWin: false, hpLoss: Infinity, rounds: 0 };
  const rounds = Math.ceil(monster.hp / playerDamage);
  const hpLoss = Math.max(0, (rounds - 1) * monsterDamage);
  return { canWin: state.hp > hpLoss, hpLoss, rounds };
}

export interface TowerSceneConfig {
  key: string;
  mapKey: string;
  mapPath: string;
  displayName: string;
}

export class BaseTowerScene extends Phaser.Scene {
  protected readonly towerConfig: TowerSceneConfig;
  protected displayName: string;

  constructor(config: TowerSceneConfig) {
    super({ key: config.key });
    this.towerConfig = config;
    this.displayName = config.displayName;
  }

  preload() {
    this.load.spritesheet('tiles', `assets/tiles.png?cb=${CACHE_BUST}`, { frameWidth: 48, frameHeight: 48 });
    this.load.tilemapTiledJSON(this.towerConfig.mapKey, `${this.towerConfig.mapPath}?cb=${CACHE_BUST}`);
  }

  private tilesLayer?: Phaser.Tilemaps.TilemapLayer;
  private wallsLayer?: Phaser.Tilemaps.TilemapLayer;
  private itemsLayer?: Phaser.Tilemaps.TilemapLayer;
  private doorsLayer?: Phaser.Tilemaps.TilemapLayer;
  private monstersLayer?: Phaser.Tilemaps.TilemapLayer;
  private objectsEntityLayer?: Phaser.Tilemaps.TilemapLayer;
  private playerSprite?: Phaser.GameObjects.Sprite;
  private eventUnsubscribes: Array<() => void> = [];
  private lastMoveAttempt: { from: { x: number; y: number }; to: { x: number; y: number } } | null = null;

  create() {
    activeScene = this;
    const teardown = () => {
      if (activeScene === this) activeScene = null;
      this.unregisterEventHandlers();
      this.lastMoveAttempt = null;
      gameEventBus.stop();
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
    this.events.once(Phaser.Scenes.Events.DESTROY, teardown);

    this.cameras.main.setBackgroundColor('#0b0e13');

    const tm = this.make.tilemap({ key: this.towerConfig.mapKey });
    if (!tm) throw new Error(`Failed to load ${this.towerConfig.mapPath}`);

    const tilesetName = (tm.tilesets && tm.tilesets[0]?.name) || 'main';
    const tileset = tm.addTilesetImage(tilesetName, 'tiles');
    if (!tileset) {
      throw new Error(
        `Tileset failed to load: the Tiled tileset name must match the image asset (attempted ${tilesetName} + assets/tiles.png).`
      );
    }

    preparePlayerFrames(tileset);
    selectPlayerFrame(false);

    if (tm.getLayerIndex('ground') === -1) throw new Error('Missing tile layer: ground');
    if (tm.getLayerIndex('walls') === -1) throw new Error('Missing tile layer: walls');
    if (!tm.getObjectLayer('objects')) throw new Error('Missing object layer: objects');

    this.tilesLayer = tm.createLayer('ground', tileset, 0, 0) ?? undefined;
    this.wallsLayer = tm.createLayer('walls', tileset, 0, 0) ?? undefined;

    const itemsIdx = tm.getLayerIndex('items');
    const doorsIdx = tm.getLayerIndex('doors');
    const monstersIdx = tm.getLayerIndex('monsters');
    const objectsEntityIdx = tm.getLayerIndex('objects_entity');
    this.itemsLayer = Number.isInteger(itemsIdx) && itemsIdx >= 0 ? tm.createLayer('items', tileset, 0, 0) ?? undefined : undefined;
    this.doorsLayer = Number.isInteger(doorsIdx) && doorsIdx >= 0 ? tm.createLayer('doors', tileset, 0, 0) ?? undefined : undefined;
    this.monstersLayer =
      Number.isInteger(monstersIdx) && monstersIdx >= 0 ? tm.createLayer('monsters', tileset, 0, 0) ?? undefined : undefined;
    this.objectsEntityLayer =
      Number.isInteger(objectsEntityIdx) && objectsEntityIdx >= 0
        ? tm.createLayer('objects_entity', tileset, 0, 0) ?? undefined
        : undefined;

    CELL = tm.tileWidth;
    COLS = tm.width;
    ROWS = tm.height;

    map = Array.from({ length: ROWS }, () => Array(COLS).fill(TileType.FLOOR));
    monsterData.clear();
    itemData.clear();
    doorData.clear();
    itemCatalog.clear();
    doorUnlockers.clear();
    storyTriggers.clear();
    seedItemCatalogFromTiles(tm);
    playerName = 'Hero';

    if (this.wallsLayer) {
      for (let y = 0; y < ROWS; y += 1) {
        for (let x = 0; x < COLS; x += 1) {
          if (this.wallsLayer.hasTileAt(x, y)) {
            map[y][x] = TileType.WALL;
          }
        }
      }
    }

    if (this.doorsLayer) {
      this.doorsLayer.forEachTile((tile) => {
        if (!tile || tile.index < 0) return;
        const { x, y } = tile;
        if (x >= 0 && y >= 0 && x < COLS && y < ROWS) {
          const key = keyOf(x, y);
          map![y][x] = TileType.DOOR;
          if (!doorData.has(key)) {
            doorData.set(key, { doorType: 'yellow', keyCost: 1 });
          }
        }
      });
    }

    const objectLayerNames = ['objects', 'doors', 'items'];
    objectLayerNames.forEach((layerName) => {
      const layer = tm.getObjectLayer(layerName);
      layer?.objects.forEach((obj) => this.processObject(layerName, obj));
    });

    if (spawn.x == null || spawn.y == null) {
      throw new Error('Objects layer did not provide a player spawn (kind=player).');
    }

    state = { name: playerName, px: spawn.x, py: spawn.y, hp: 100, atk: 0, def: 0, keys: 0, inventory: {} };
    resetPlayerAnimationState();
    selectPlayerFrame(false);
    updateUI();
    this.pushDisplayNameToUI();
    postMsg(`Entered ${this.displayName}.`);

    if (this.objectsEntityLayer?.hasTileAt(spawn.x, spawn.y)) {
      this.objectsEntityLayer.removeTileAt(spawn.x, spawn.y);
    }

    if (this.playerSprite) {
      this.playerSprite.destroy();
      this.playerSprite = undefined;
    }

    this.renderPlayer();
    storyManager.init({
      onStart: () => {
        this.lastMoveAttempt = null;
      },
      onEnd: () => {
        this.lastMoveAttempt = null;
      },
      grantItem: (gid, amount, max) => this.grantStoryItem(gid, amount, max),
      getInventoryName: (gid, fallback) => getInventoryName(gid, fallback),
      emitEvent: (event) => this.emitStoryEvent(event)
    });
    this.registerEventHandlers();
    gameEventBus.start();

    this.input.keyboard.on('keydown', (event: KeyboardEvent) => {
      if (!state) return;
      let dx = 0;
      let dy = 0;
      if (event.code === 'KeyW' || event.code === 'ArrowUp') dy = -1;
      if (event.code === 'KeyS' || event.code === 'ArrowDown') dy = 1;
      if (event.code === 'KeyA' || event.code === 'ArrowLeft') dx = -1;
      if (event.code === 'KeyD' || event.code === 'ArrowRight') dx = 1;
      if (dx !== 0 || dy !== 0) this.tryMove(dx, dy);
    });

    this.centerOnPlayer();
  }

  private processObject(layerName: string, obj: Phaser.Types.Tilemaps.TiledObject) {
    const baseX = obj.x ?? 0;
    const baseY = obj.y ?? 0;
    const width = obj.width && obj.width > 0 ? obj.width : CELL;
    const height = obj.height && obj.height > 0 ? obj.height : CELL;
    const isTileObject = typeof (obj as { gid?: number }).gid === 'number';

    let gx: number;
    let gy: number;

    if (isTileObject) {
      // Tile objects in Tiled are positioned by their bottom-left corner.
      const adjustedY = baseY - height;
      gx = Math.floor(baseX / CELL);
      gy = Math.floor(adjustedY / CELL);
    } else {
      const centerX = baseX + width / 2;
      const centerY = baseY + height / 2;
      gx = Math.floor(centerX / CELL);
      gy = Math.floor(centerY / CELL);
    }

    if (!(gx >= 0 && gy >= 0 && gx < COLS && gy < ROWS)) return;
    const props: Record<string, unknown> = {};
    (obj.properties ?? []).forEach((p) => {
      if (!p.name) return;
      props[p.name] = p.value;
    });
    const objName = typeof obj.name === 'string' && obj.name.trim().length > 0 ? obj.name.trim() : undefined;
    const displayName = getNameFromProps(props) ?? objName;
    const gidValue =
      typeof (obj as { gid?: number }).gid === 'number'
        ? String((obj as { gid?: number }).gid)
        : props.gid !== undefined && props.gid !== null
          ? String(props.gid)
          : undefined;
    const kind = (props.kind as string) || obj.type || objName || layerName;
    const key = keyOf(gx, gy);
    const storyId = typeof props.story === 'string' && props.story.trim().length > 0 ? props.story.trim() : undefined;
    if (storyId) {
      let once = false;
      if (typeof props.once === 'boolean') {
        once = props.once;
      } else if (typeof props.once === 'string') {
        once = props.once.trim().toLowerCase() === 'true';
      }
      storyTriggers.set(key, { storyId, once });
    }
    switch (kind) {
      case 'player':
        spawn = { x: gx, y: gy };
        playerName = (props.charName as string) || displayName || 'Traveler';
        break;
      case 'door':
        map![gy][gx] = TileType.DOOR;
        {
          const requireId = props.require !== undefined && props.require !== null ? String(props.require) : undefined;
          const requireDisplayName =
            requireId && typeof props.requireName === 'string' && props.requireName.trim().length > 0
              ? (props.requireName as string).trim()
              : requireId
                ? getInventoryName(requireId, undefined)
                : undefined;
          doorData.set(key, {
            doorType: (props.doorType as string) || 'yellow',
            keyCost: Number(props.keyCost ?? 1),
            require: requireId,
            requireName: requireDisplayName,
            name: displayName
          });
        }
        break;
      case 'key':
        map![gy][gx] = TileType.KEY;
        {
          const resolvedName = gidValue ? getInventoryName(gidValue, displayName) : displayName;
          itemData.set(key, {
            type: 'key',
            value: Number(props.value ?? 1),
            gid: gidValue,
            name: resolvedName
          });
        }
        break;
      case 'door_unlocker': {
        const requireId = props.require !== undefined && props.require !== null ? String(props.require) : undefined;
        const requireDisplayName =
          requireId && typeof props.requireName === 'string' && props.requireName.trim().length > 0
            ? (props.requireName as string).trim()
            : undefined;
        const neighbors: Array<{ x: number; y: number }> = [
          { x: gx + 1, y: gy },
          { x: gx - 1, y: gy },
          { x: gx, y: gy + 1 },
          { x: gx, y: gy - 1 }
        ];
        let linkedDoorKey: TileKey | undefined;
        neighbors.some(({ x: nx, y: ny }) => {
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return false;
          if (map![ny][nx] === TileType.DOOR) {
            linkedDoorKey = keyOf(nx, ny);
            return true;
          }
          return false;
        });
        if (linkedDoorKey) {
          const existingDoor = doorData.get(linkedDoorKey) ?? {
            doorType: 'yellow',
            keyCost: 0
          };
          const updatedDoor: DoorData = {
            ...existingDoor,
            require: requireId ?? existingDoor.require,
            requireName: requireDisplayName ?? existingDoor.requireName,
            name: existingDoor.name ?? displayName
          };
          doorData.set(linkedDoorKey, updatedDoor);
        }
        doorUnlockers.set(key, {
          doorKey: linkedDoorKey,
          require: requireId,
          requireName:
            requireDisplayName ??
            (linkedDoorKey ? doorData.get(linkedDoorKey)?.requireName : undefined) ??
            (requireId ? getInventoryName(requireId, undefined) : undefined),
          name: displayName
        });
        break;
      }
      case 'stairs':
        map![gy][gx] = TileType.STAIRS;
        break;
      case 'monster':
        map![gy][gx] = TileType.MONSTER;
        monsterData.set(key, {
          name: (props.name as string) || displayName || 'Monster',
          hp: Number(props.hp ?? 20),
          atk: Number(props.atk ?? 5),
          def: Number(props.def ?? 0)
        });
        break;
      default:
        break;
    }
  }

  private registerEventHandlers() {
    this.unregisterEventHandlers();
    this.lastMoveAttempt = null;
    const context = this.createEventContext();
    const handlers = createTowerEventHandlers(context, {
      onStairsEncounter: (position, defaultAction) => this.handleStairsEncounter(position, defaultAction)
    });
    this.eventUnsubscribes = [
      gameEventBus.subscribe('player.move.attempt', handlers.moveAttempt),
      gameEventBus.subscribe('player.move.blocked', handlers.moveBlocked),
      gameEventBus.subscribe('player.move.commit', handlers.moveCommit),
      gameEventBus.subscribe('encounter.door', handlers.doorEncounter),
      gameEventBus.subscribe('encounter.item', handlers.itemPickup),
      gameEventBus.subscribe('encounter.monster', handlers.monsterEncounter),
      gameEventBus.subscribe('encounter.stairs', handlers.stairsEncounter),
      gameEventBus.subscribe('article.unlock', handlers.articleUnlock),
      gameEventBus.subscribe('debug.console.log', handlers.debug),
    ];
  }

  private unregisterEventHandlers() {
    this.eventUnsubscribes.forEach((fn) => fn());
    this.eventUnsubscribes = [];
  }

  private tryMove(dx: number, dy: number) {
    if (!state || !map || storyManager.isActive()) return;
    const attemptedFacing = facingFromDelta(dx, dy);
    if (attemptedFacing) {
      playerFacing = attemptedFacing;
      selectPlayerFrame(false);
      if (this.playerSprite) {
        this.playerSprite.setFrame(playerCurrentFrame);
      }
    }
    const nx = state.px + dx;
    const ny = state.py + dy;
    const toKey = keyOf(nx, ny);
    const storyInfo = storyTriggers.get(toKey);
    if (storyInfo) {
      storyManager
        .start(storyInfo.storyId)
        .then((started) => {
          if (started && storyInfo.once) {
            storyTriggers.delete(toKey);
            this.removeTileAt(nx, ny, this.objectsEntityLayer);
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[story] failed to start', storyInfo.storyId, err);
        });
      return;
    }

    const from = { x: state.px, y: state.py };
    const to = { x: nx, y: ny };
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
      gameEventBus.enqueue({
        type: 'player.move.blocked',
        trigger: 'system',
        payload: { reason: 'bounds', position: to, message: 'Cannot move beyond the map.' }
      });
      return;
    }
    this.lastMoveAttempt = { from, to };
    gameEventBus.enqueue({ type: 'player.move.attempt', trigger: 'player', payload: { from, to } });
  }

  public handleDirectionalInput(direction: DirectionInput) {
    switch (direction) {
      case 'up':
        this.tryMove(0, -1);
        break;
      case 'down':
        this.tryMove(0, 1);
        break;
      case 'left':
        this.tryMove(-1, 0);
        break;
      case 'right':
        this.tryMove(1, 0);
        break;
      default:
        break;
    }
  }

  private removeTileAt(x: number, y: number, layer?: Phaser.Tilemaps.TilemapLayer) {
    if (!layer) return;
    if (layer.hasTileAt(x, y)) {
      layer.removeTileAt(x, y);
    }
  }

  private openDoorTile(position: Vec2) {
    if (!map) return;
    const { x, y } = position;
    if (y >= 0 && x >= 0 && y < map.length && x < map[y].length) {
      map[y][x] = TileType.FLOOR;
    }
    const key = keyOf(x, y);
    doorData.delete(key);
    this.removeTileAt(x, y, this.doorsLayer);
    this.removeTileAt(x, y, this.objectsEntityLayer);
  }

  private removeItemTile(position: Vec2) {
    this.removeTileAt(position.x, position.y, this.itemsLayer);
  }

  private removeMonsterTile(position: Vec2) {
    this.removeTileAt(position.x, position.y, this.monstersLayer);
  }

  private removeObjectTile(position: Vec2) {
    this.removeTileAt(position.x, position.y, this.objectsEntityLayer);
  }

  private emitStoryEvent(event: StoryNodeEvent) {
    if (!event || typeof event.type !== 'string') return;
    const type = event.type.trim();
    if (!type) return;
    const payload =
      event.payload && typeof event.payload === 'object'
        ? (event.payload as Record<string, unknown>)
        : ({} as Record<string, unknown>);
    const busEvent = {
      type: type as GameEventType,
      trigger: 'system',
      payload: payload as never
    } as GameEvent;
    gameEventBus.enqueue(busEvent);
  }

  private grantStoryItem(gid: string, amount: number, max?: number) {
    if (!state) {
      return { success: false, granted: 0, current: 0 };
    }
    const trimmedGid = typeof gid === 'string' ? gid.trim() : '';
    if (!trimmedGid) {
      return { success: false, granted: 0, current: 0 };
    }
    const currentCount = state.inventory[trimmedGid] ?? 0;
    const rawAmount = Number.isFinite(amount) ? Math.floor(amount) : 0;
    const grantAmount = rawAmount > 0 ? rawAmount : 1;
    let limit: number | undefined;
    if (max !== undefined && Number.isFinite(max)) {
      limit = Math.floor(max);
    }
    if (limit !== undefined) {
      if (limit <= 0 || currentCount >= limit) {
        return { success: false, granted: 0, current: currentCount };
      }
      const remaining = limit - currentCount;
      const toGrant = Math.max(0, Math.min(grantAmount, remaining));
      if (toGrant <= 0) {
        return { success: false, granted: 0, current: currentCount };
      }
      addInventoryItem(trimmedGid, toGrant);
      updateUI();
      const updatedCount = state.inventory[trimmedGid] ?? currentCount + toGrant;
      return { success: true, granted: toGrant, current: updatedCount };
    }
    addInventoryItem(trimmedGid, grantAmount);
    updateUI();
    const updatedCount = state.inventory[trimmedGid] ?? currentCount + grantAmount;
    return { success: true, granted: grantAmount, current: updatedCount };
  }

  private applyKeyPickup(amount: number) {
    if (!state) return;
    state.keys += amount;
    updateUI();
  }

  private commitMove(destination: Vec2, advanceFrame: boolean) {
    if (!state) return;
    if (advanceFrame) {
      selectPlayerFrame(true);
    }
    state.px = destination.x;
    state.py = destination.y;
    this.renderPlayer();
    this.centerOnPlayer();
    if (state.hp <= 0) {
      postMsg('You fell... click "Restart".');
    }
  }

  private createEventContext(): TowerEventContext {
    if (!map) {
      throw new Error('Map is not initialised.');
    }
    return {
      cols: COLS,
      rows: ROWS,
      map,
      monsterData,
      itemData,
      doorData,
      doorUnlockers,
      hasBlockingObject: (x, y) => this.objectsEntityLayer?.hasTileAt(x, y) ?? false,
      postMsg,
      updateUI,
      battleCalc,
      consumeInventoryItem,
      addInventoryItem,
      getInventoryName,
      applyKeyPickup: (amount) => this.applyKeyPickup(amount),
      getLastMoveAttempt: () => this.lastMoveAttempt,
      setLastMoveAttempt: (value) => {
        this.lastMoveAttempt = value;
      },
      getState: () => state,
      setState: (updater) => {
        if (state) {
          updater(state);
        }
      },
      commitMove: (destination, advanceFrame) => this.commitMove(destination, advanceFrame),
      openDoorTile: (position) => this.openDoorTile(position),
      removeItemTile: (position) => this.removeItemTile(position),
      removeMonsterTile: (position) => this.removeMonsterTile(position),
      removeObjectTile: (position) => this.removeObjectTile(position),
      getItemData: (tileKey) => itemData.get(tileKey),
      getDoorData: (tileKey) => doorData.get(tileKey),
      getMonsterData: (tileKey) => monsterData.get(tileKey),
      getSceneDisplayName: () => this.displayName
    };
  }

  public getDisplayName(): string {
    return this.displayName;
  }

  protected setDisplayName(name: string) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed === this.displayName) return;
    this.displayName = trimmed;
    this.pushDisplayNameToUI();
  }

  private pushDisplayNameToUI() {
    if (activeScene === this) {
      uiHooks?.updateLevelName(this.displayName);
    }
  }

  protected handleStairsEncounter(_position: Vec2, defaultAction: () => void) {
    defaultAction();
  }

  renderPlayer() {
    if (!state) return;
    const x = state.px * CELL + CELL / 2;
    const y = state.py * CELL + CELL / 2;
    const frame = playerCurrentFrame;
    if (!this.playerSprite) {
      this.playerSprite = this.add.sprite(x, y, 'tiles', frame).setOrigin(0.5).setDepth(20);
    } else {
      this.playerSprite.setPosition(x, y);
      this.playerSprite.setFrame(frame);
    }
  }

  centerOnPlayer() {
    const cam = this.cameras.main;
    cam.setZoom(1);
    cam.setViewport(0, 0, COLS * CELL, ROWS * CELL);
  }
}
