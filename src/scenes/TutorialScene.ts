import Phaser from 'phaser';
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
  state = { name: playerName, px: spawn.x, py: spawn.y, hp: 200, atk: 10, def: 5, keys: 0 };
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

const keyOf = (x: number, y: number): TileKey => `${x},${y}`;

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

  preload() {
    this.load.spritesheet('tiles', `assets/tiles.png?cb=${CACHE_BUST}`, { frameWidth: 48, frameHeight: 48 });
    this.load.tilemapTiledJSON('scene_1_tutorial', `assets/scene_1_tutorial.json?cb=${CACHE_BUST}`);
  }

  create() {
    activeScene = this;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (activeScene === this) activeScene = null;
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      if (activeScene === this) activeScene = null;
    });

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

    const objLayer = tm.getObjectLayer('objects');
    objLayer?.objects.forEach((obj) => {
      const gx = Math.floor((obj.x ?? 0) / CELL);
      const gy = Math.floor((obj.y ?? 0) / CELL);
      if (!(gx >= 0 && gy >= 0 && gx < COLS && gy < ROWS)) return;
      const props: Record<string, unknown> = {};
      (obj.properties ?? []).forEach((p) => {
        if (!p.name) return;
        props[p.name] = p.value;
      });
      const kind = (props.kind as string) || obj.type || obj.name;
      const key = keyOf(gx, gy);
      switch (kind) {
        case 'player':
          spawn = { x: gx, y: gy };
          playerName = (props.charName as string) || (props.displayName as string) || (props.name as string) || 'Hero';
          break;
        case 'door':
          map![gy][gx] = TileType.DOOR;
          doorData.set(key, {
            doorType: (props.doorType as string) || 'yellow',
            keyCost: Number(props.keyCost ?? 1)
          });
          break;
        case 'key':
          map![gy][gx] = TileType.KEY;
          itemData.set(key, { type: 'key', value: Number(props.value ?? 1) });
          break;
        case 'item': {
          const itemType = (props.itemType as ItemData['type']) || 'hp';
          let tileType = TileType.HP;
          if (itemType === 'atk') tileType = TileType.ATK;
          else if (itemType === 'def') tileType = TileType.DEF;
          map![gy][gx] = tileType;
          itemData.set(key, { type: itemType, value: Number(props.value ?? (itemType === 'hp' ? 50 : 3)) });
          break;
        }
        case 'stairs':
          map![gy][gx] = TileType.STAIRS;
          break;
        case 'monster':
          map![gy][gx] = TileType.MONSTER;
          monsterData.set(key, {
            name: (props.name as string) || 'Monster',
            hp: Number(props.hp ?? 20),
            atk: Number(props.atk ?? 5),
            def: Number(props.def ?? 0)
          });
          break;
        default:
          break;
      }
    });

    if (spawn.x == null || spawn.y == null) {
      throw new Error('Objects layer did not provide a player spawn (kind=player).');
    }

    state = { name: playerName, px: spawn.x, py: spawn.y, hp: 200, atk: 10, def: 5, keys: 0 };
    resetPlayerAnimationState();
    selectPlayerFrame(false);
    updateUI();
    postMsg('Level loaded.');

    if (this.objectsEntityLayer?.hasTileAt(spawn.x, spawn.y)) {
      this.objectsEntityLayer.removeTileAt(spawn.x, spawn.y);
    }

    this.renderPlayer();

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
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return;
    if (map[ny][nx] === TileType.WALL) {
      postMsg('A wall blocks the way.');
      return;
    }

    if (map[ny][nx] === TileType.DOOR) {
      const door = doorData.get(keyOf(nx, ny));
      const need = door?.keyCost ?? 1;
      if (state.keys >= need) {
        state.keys -= need;
        map[ny][nx] = TileType.FLOOR;
        postMsg(`Used ${need} key(s). The door opened.`);
        updateUI();
        this.removeTileAt(nx, ny, this.doorsLayer);
        this.removeTileAt(nx, ny, this.objectsEntityLayer);
      } else {
        postMsg(`Need ${need} key(s).`);
        return;
      }
    }

    if (this.objectsEntityLayer && this.objectsEntityLayer.hasTileAt(nx, ny) && map[ny][nx] === TileType.FLOOR) {
      postMsg('Something blocks the way.');
      return;
    }

    if (map[ny][nx] === TileType.MONSTER) {
      const monster = monsterData.get(keyOf(nx, ny));
      if (!monster) {
        map[ny][nx] = TileType.FLOOR;
        this.removeTileAt(nx, ny, this.monstersLayer);
        this.removeTileAt(nx, ny, this.objectsEntityLayer);
      } else {
        const result = battleCalc(monster);
        if (!result.canWin) {
          postMsg(`${monster.name || 'Monster'} is too strong to defeat right now.`);
          return;
        }
        state.hp -= result.hpLoss;
        map[ny][nx] = TileType.FLOOR;
        monsterData.delete(keyOf(nx, ny));
        this.removeTileAt(nx, ny, this.monstersLayer);
        this.removeTileAt(nx, ny, this.objectsEntityLayer);
        postMsg(`Fought ${monster.name || 'Monster'} for ${result.rounds} round(s) and lost ${result.hpLoss} HP.`);
        updateUI();
      }
    }

    if (map[ny][nx] === TileType.KEY) {
      const item = itemData.get(keyOf(nx, ny));
      const value = item?.value ?? 1;
      state.keys += value;
      map[ny][nx] = TileType.FLOOR;
      itemData.delete(keyOf(nx, ny));
      postMsg(`Picked up yellow key x${value}.`);
      updateUI();
      this.removeTileAt(nx, ny, this.itemsLayer);
      this.removeTileAt(nx, ny, this.objectsEntityLayer);
    }
    if (map[ny][nx] === TileType.HP) {
      const item = itemData.get(keyOf(nx, ny));
      const value = item?.value ?? 50;
      state.hp += value;
      map[ny][nx] = TileType.FLOOR;
      itemData.delete(keyOf(nx, ny));
      postMsg(`HP +${value}`);
      updateUI();
      this.removeTileAt(nx, ny, this.itemsLayer);
      this.removeTileAt(nx, ny, this.objectsEntityLayer);
    }
    if (map[ny][nx] === TileType.ATK) {
      const item = itemData.get(keyOf(nx, ny));
      const value = item?.value ?? 3;
      state.atk += value;
      map[ny][nx] = TileType.FLOOR;
      itemData.delete(keyOf(nx, ny));
      postMsg(`ATK +${value}`);
      updateUI();
      this.removeTileAt(nx, ny, this.itemsLayer);
      this.removeTileAt(nx, ny, this.objectsEntityLayer);
    }
    if (map[ny][nx] === TileType.DEF) {
      const item = itemData.get(keyOf(nx, ny));
      const value = item?.value ?? 3;
      state.def += value;
      map[ny][nx] = TileType.FLOOR;
      itemData.delete(keyOf(nx, ny));
      postMsg(`DEF +${value}`);
      updateUI();
      this.removeTileAt(nx, ny, this.itemsLayer);
      this.removeTileAt(nx, ny, this.objectsEntityLayer);
    }
    if (map[ny][nx] === TileType.STAIRS) {
      postMsg('Level 1 complete!');
    }

    selectPlayerFrame(true);
    state.px = nx;
    state.py = ny;
    this.renderPlayer();
    this.centerOnPlayer();

    if (state.hp <= 0) {
      postMsg('You fell... click "Restart".');
    }
  }

  private removeTileAt(x: number, y: number, layer?: Phaser.Tilemaps.TilemapLayer) {
    if (!layer) return;
    if (layer.hasTileAt(x, y)) {
      layer.removeTileAt(x, y);
    }
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
