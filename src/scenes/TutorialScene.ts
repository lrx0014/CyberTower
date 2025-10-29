import Phaser from 'phaser';
import {
  DoorEncounterEvent,
  GameEventHandler,
  ItemPickupEvent,
  MonsterEncounterEvent,
  Vec2,
  PlayerMoveAttemptEvent,
  PlayerMoveBlockedEvent,
  PlayerMoveCommitEvent,
  StairsEvent,
  gameEventBus
} from '../global/eventBus';
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
let playerName = 'Hero';

const monsterData = new Map<TileKey, MonsterStats>();
const itemData = new Map<TileKey, ItemData>();
const doorData = new Map<TileKey, DoorData>();
const itemCatalog = new Map<string, { name?: string }>();
const doorUnlockers = new Map<
  TileKey,
  {
    doorKey?: TileKey;
    require?: string;
    requireName?: string;
    name?: string;
  }
>();

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
let activeScene: TutorialScene | null = null;

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
  if (state) {
    hooks.updateStats(state);
  }
}

export function getActiveScene(): TutorialScene | null {
  return activeScene;
}

export function resetPlayerState(): boolean {
  if (!state) return false;
  state = { name: playerName, px: spawn.x, py: spawn.y, hp: 200, atk: 10, def: 5, keys: 0, inventory: {} };
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

export default class TutorialScene extends Phaser.Scene {
  private tilesLayer?: Phaser.Tilemaps.TilemapLayer;
  private wallsLayer?: Phaser.Tilemaps.TilemapLayer;
  private itemsLayer?: Phaser.Tilemaps.TilemapLayer;
  private doorsLayer?: Phaser.Tilemaps.TilemapLayer;
  private monstersLayer?: Phaser.Tilemaps.TilemapLayer;
  private objectsEntityLayer?: Phaser.Tilemaps.TilemapLayer;
  private playerSprite?: Phaser.GameObjects.Sprite;
  private eventUnsubscribes: Array<() => void> = [];
  private lastMoveAttempt: { from: { x: number; y: number }; to: { x: number; y: number } } | null = null;

  preload() {
    this.load.spritesheet('tiles', `assets/tiles.png?cb=${CACHE_BUST}`, { frameWidth: 48, frameHeight: 48 });
    this.load.tilemapTiledJSON('scene_1_tutorial', `assets/scene_1_tutorial.json?cb=${CACHE_BUST}`);
  }

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

    const tm = this.make.tilemap({ key: 'scene_1_tutorial' });
    if (!tm) throw new Error('Failed to load assets/scene_1_tutorial.json');

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

    state = { name: playerName, px: spawn.x, py: spawn.y, hp: 200, atk: 10, def: 5, keys: 0, inventory: {} };
    resetPlayerAnimationState();
    selectPlayerFrame(false);
    updateUI();
    postMsg('Level loaded.');

    if (this.objectsEntityLayer?.hasTileAt(spawn.x, spawn.y)) {
      this.objectsEntityLayer.removeTileAt(spawn.x, spawn.y);
    }

    this.renderPlayer();
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
    switch (kind) {
      case 'player':
        spawn = { x: gx, y: gy };
        playerName = (props.charName as string) || displayName || 'Hero';
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
    this.eventUnsubscribes = [
      gameEventBus.subscribe('player.move.attempt', this.handlePlayerMoveAttempt),
      gameEventBus.subscribe('player.move.blocked', this.handlePlayerMoveBlocked),
      gameEventBus.subscribe('player.move.commit', this.handlePlayerMoveCommit),
      gameEventBus.subscribe('encounter.door', this.handleDoorEncounter),
      gameEventBus.subscribe('encounter.item', this.handleItemPickup),
      gameEventBus.subscribe('encounter.monster', this.handleMonsterEncounter),
      gameEventBus.subscribe('encounter.stairs', this.handleStairsEvent)
    ];
  }

  private unregisterEventHandlers() {
    this.eventUnsubscribes.forEach((fn) => fn());
    this.eventUnsubscribes = [];
  }

  private tryMove(dx: number, dy: number) {
    if (!state || !map) return;
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

  private handlePlayerMoveAttempt: GameEventHandler<'player.move.attempt'> = async (event: PlayerMoveAttemptEvent) => {
    if (!state || !map) return;
    const { from, to } = event.payload;
    const { x: nx, y: ny } = to;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
      gameEventBus.enqueue({
        type: 'player.move.blocked',
        trigger: 'system',
        payload: { reason: 'bounds', position: to, message: 'Cannot move beyond the map.' }
      });
      return;
    }
    const tileType = map[ny][nx];
    const tileKey = keyOf(nx, ny);
    const unlockerInfo = doorUnlockers.get(tileKey);

    if (tileType === TileType.WALL) {
      gameEventBus.enqueue({
        type: 'player.move.blocked',
        trigger: 'system',
        payload: { reason: 'wall', position: to, message: 'A wall blocks the way.' }
      });
      return;
    }

    if (tileType === TileType.DOOR && !unlockerInfo) {
      gameEventBus.enqueue({
        type: 'encounter.door',
        trigger: 'system',
        payload: { position: to, door: doorData.get(tileKey), tileKey }
      });
      return;
    }

    if (tileType === TileType.MONSTER) {
      gameEventBus.enqueue({
        type: 'encounter.monster',
        trigger: 'system',
        payload: { position: to, monster: monsterData.get(tileKey), tileKey }
      });
      return;
    }

    if (tileType === TileType.KEY || tileType === TileType.HP || tileType === TileType.ATK || tileType === TileType.DEF) {
      gameEventBus.enqueue({
        type: 'encounter.item',
        trigger: 'system',
        payload: { position: to, item: itemData.get(tileKey), tileType, tileKey }
      });
      return;
    }

    if (tileType === TileType.STAIRS) {
      gameEventBus.enqueue({ type: 'encounter.stairs', trigger: 'system', payload: { position: to } });
      return;
    }

    if (unlockerInfo) {
      this.handleDoorUnlockerMove(tileKey, to);
      return;
    }

    if (this.objectsEntityLayer?.hasTileAt(nx, ny) && tileType === TileType.FLOOR) {
      gameEventBus.enqueue({
        type: 'player.move.blocked',
        trigger: 'system',
        payload: { reason: 'entity', position: to, message: 'Something blocks the way.' }
      });
      return;
    }

    gameEventBus.enqueue({
      type: 'player.move.commit',
      trigger: 'system',
      payload: { from, to, advanceFrame: true }
    });
  };

  private handlePlayerMoveBlocked: GameEventHandler<'player.move.blocked'> = async (event: PlayerMoveBlockedEvent) => {
    if (!state) return;
    this.lastMoveAttempt = null;
    if (event.payload.message) {
      postMsg(event.payload.message);
    }
  };

  private handlePlayerMoveCommit: GameEventHandler<'player.move.commit'> = async (event: PlayerMoveCommitEvent) => {
    if (!state) return;
    const { to, advanceFrame } = event.payload;
    if (advanceFrame) {
      selectPlayerFrame(true);
    }
    state.px = to.x;
    state.py = to.y;
    this.renderPlayer();
    this.centerOnPlayer();
    this.lastMoveAttempt = null;
    if (state.hp <= 0) {
      postMsg('You fell... click "Restart".');
    }
  };

  private handleDoorEncounter: GameEventHandler<'encounter.door'> = async (event: DoorEncounterEvent) => {
    if (!state || !map) return;
    const { door, position, tileKey } = event.payload;
    const requireId = door?.require;
    let opened = false;
    if (requireId) {
      const consumed = consumeInventoryItem(requireId, 1);
      if (!consumed) {
        const itemName = getInventoryName(requireId, door?.requireName);
        postMsg(`You need ${itemName} to open this door.`);
        return;
      }
      const itemName = getInventoryName(requireId, door?.requireName);
      postMsg(`You used ${itemName} to open the door.`);
      opened = true;
    } else {
      const need = door?.keyCost ?? 1;
      if (state.keys < need) {
        postMsg(`Need ${need} key(s).`);
        return;
      }
      state.keys -= need;
      postMsg(`Used ${need} key(s). The door opened.`);
      opened = true;
    }
    if (!opened) return;
    this.openDoorTile(position);
    for (const [unlockKey, data] of doorUnlockers) {
      if (data.doorKey === tileKey) {
        doorUnlockers.delete(unlockKey);
      }
    }
    updateUI();

    const from = this.lastMoveAttempt?.from ?? { x: state.px, y: state.py };
    gameEventBus.enqueue({
      type: 'player.move.commit',
      trigger: 'system',
      payload: { from, to: position, advanceFrame: true }
    });
  };

  private handleItemPickup: GameEventHandler<'encounter.item'> = async (event: ItemPickupEvent) => {
    if (!state || !map) return;
    const { item, tileType, position, tileKey } = event.payload;
    switch (tileType) {
      case TileType.KEY: {
        const gid = item?.gid;
        const amount = item?.value ?? 1;
        if (gid) {
          addInventoryItem(gid, amount, item?.name);
          const itemName = getInventoryName(gid, item?.name);
          postMsg(`Obtained ${itemName}${amount > 1 ? ` x${amount}` : ''}.`);
        } else {
          state.keys += amount;
          postMsg(`Picked up key x${amount}.`);
        }
        break;
      }
      case TileType.HP: {
        const hpValue = item?.value ?? 50;
        state.hp += hpValue;
        postMsg(`HP +${hpValue}`);
        break;
      }
      case TileType.ATK: {
        const atkValue = item?.value ?? 3;
        state.atk += atkValue;
        postMsg(`ATK +${atkValue}`);
        break;
      }
      case TileType.DEF: {
        const defValue = item?.value ?? 3;
        state.def += defValue;
        postMsg(`DEF +${defValue}`);
        break;
      }
      default:
        break;
    }
    map[position.y][position.x] = TileType.FLOOR;
    itemData.delete(tileKey);
    updateUI();
    this.removeTileAt(position.x, position.y, this.itemsLayer);
    this.removeTileAt(position.x, position.y, this.objectsEntityLayer);

    const from = this.lastMoveAttempt?.from ?? { x: state.px, y: state.py };
    gameEventBus.enqueue({
      type: 'player.move.commit',
      trigger: 'system',
      payload: { from, to: position, advanceFrame: true }
    });
  };

  private handleMonsterEncounter: GameEventHandler<'encounter.monster'> = async (event: MonsterEncounterEvent) => {
    if (!state || !map) return;
    const { monster, position, tileKey } = event.payload;
    if (!monster) {
      map[position.y][position.x] = TileType.FLOOR;
      monsterData.delete(tileKey);
      this.removeTileAt(position.x, position.y, this.monstersLayer);
      this.removeTileAt(position.x, position.y, this.objectsEntityLayer);
      const from = this.lastMoveAttempt?.from ?? { x: state.px, y: state.py };
      gameEventBus.enqueue({
        type: 'player.move.commit',
        trigger: 'system',
        payload: { from, to: position, advanceFrame: true }
      });
      return;
    }
    const result = battleCalc(monster);
    if (!result.canWin) {
      gameEventBus.enqueue({
        type: 'player.move.blocked',
        trigger: 'system',
        payload: {
          reason: 'monster',
          position,
          message: `${monster.name || 'Monster'} is too strong to defeat right now.`
        }
      });
      return;
    }
    state.hp -= result.hpLoss;
    map[position.y][position.x] = TileType.FLOOR;
    monsterData.delete(tileKey);
    this.removeTileAt(position.x, position.y, this.monstersLayer);
    this.removeTileAt(position.x, position.y, this.objectsEntityLayer);
    postMsg(`Fought ${monster.name || 'Monster'} for ${result.rounds} round(s) and lost ${result.hpLoss} HP.`);
    updateUI();
    const from = this.lastMoveAttempt?.from ?? { x: state.px, y: state.py };
    gameEventBus.enqueue({
      type: 'player.move.commit',
      trigger: 'system',
      payload: { from, to: position, advanceFrame: true }
    });
  };

  private handleStairsEvent: GameEventHandler<'encounter.stairs'> = async (event: StairsEvent) => {
    if (!state) return;
    postMsg('Level 1 complete!');
    const from = this.lastMoveAttempt?.from ?? { x: state.px, y: state.py };
    gameEventBus.enqueue({
      type: 'player.move.commit',
      trigger: 'system',
      payload: { from, to: event.payload.position, advanceFrame: true }
    });
  };

  private handleDoorUnlockerMove(tileKey: TileKey, destination: Vec2) {
    if (!state || !map) return;
    const info = doorUnlockers.get(tileKey);
    if (!info) {
      const from = this.lastMoveAttempt?.from ?? { x: state.px, y: state.py };
      gameEventBus.enqueue({
        type: 'player.move.commit',
        trigger: 'system',
        payload: { from, to: destination, advanceFrame: true }
      });
      return;
    }

    const doorKey = info.doorKey;
    const door = doorKey ? doorData.get(doorKey) : undefined;
    const requireId = door?.require ?? info.require;
    const requireDisplay = door?.requireName ?? info.requireName;
    let opened = false;

    if (requireId) {
      const consumed = consumeInventoryItem(requireId, 1);
      if (!consumed) {
        const itemName = getInventoryName(requireId, requireDisplay);
        postMsg(`You need ${itemName} to open this door.`);
        gameEventBus.enqueue({
          type: 'player.move.blocked',
          trigger: 'system',
          payload: { reason: 'keys', position: destination, message: `You need ${itemName} to open this door.` }
        });
        return;
      } else {
        const itemName = getInventoryName(requireId, requireDisplay);
        postMsg(`You used ${itemName} to open the door.`);
        opened = true;
      }
    } else {
      const need = door?.keyCost ?? 0;
      if (need > 0 && state.keys >= need) {
        state.keys -= need;
        postMsg(`Used ${need} key(s). The door opened.`);
        opened = true;
      } else if (need > 0) {
        postMsg(`Need ${need} key(s).`);
        gameEventBus.enqueue({
          type: 'player.move.blocked',
          trigger: 'system',
          payload: { reason: 'keys', position: destination, message: `Need ${need} key(s).` }
        });
        return;
      } else {
        postMsg('The door unlocks.');
        opened = true;
      }
    }

    if (opened) {
      if (doorKey) {
        const doorPos = parseTileKey(doorKey);
        this.openDoorTile(doorPos);
        for (const [otherKey, data] of doorUnlockers) {
          if (data.doorKey === doorKey) {
            doorUnlockers.delete(otherKey);
          }
        }
      } else {
        doorUnlockers.delete(tileKey);
      }
      this.removeTileAt(destination.x, destination.y, this.objectsEntityLayer);
      updateUI();
    }

    const from = this.lastMoveAttempt?.from ?? { x: state.px, y: state.py };
    gameEventBus.enqueue({
      type: 'player.move.commit',
      trigger: 'system',
      payload: { from, to: destination, advanceFrame: true }
    });
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
