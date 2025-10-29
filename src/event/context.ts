import { Vec2 } from './bus/eventBus';
import { DoorData, ItemData, MonsterStats, PlayerState, TileKey, TileType } from '../global/types';

export type MoveBlockReason = 'wall' | 'door' | 'entity' | 'monster' | 'keys' | 'bounds';

export interface DoorUnlockerInfo {
  doorKey?: TileKey;
  require?: string;
  requireName?: string;
  name?: string;
}

export interface TowerEventContext {
  cols: number;
  rows: number;
  map: TileType[][];
  monsterData: Map<TileKey, MonsterStats>;
  itemData: Map<TileKey, ItemData>;
  doorData: Map<TileKey, DoorData>;
  doorUnlockers: Map<TileKey, DoorUnlockerInfo>;
  hasBlockingObject: (x: number, y: number) => boolean;
  postMsg: (text: string) => void;
  updateUI: () => void;
  battleCalc: (monster: MonsterStats) => { canWin: boolean; hpLoss: number; rounds: number };
  consumeInventoryItem: (gid: string, quantity: number) => boolean;
  addInventoryItem: (gid: string, quantity: number, name?: string) => void;
  getInventoryName: (gid: string | undefined, fallback?: string) => string;
  applyKeyPickup: (amount: number) => void;
  getLastMoveAttempt: () => { from: Vec2; to: Vec2 } | null;
  setLastMoveAttempt: (value: { from: Vec2; to: Vec2 } | null) => void;
  getState: () => PlayerState | null;
  setState: (updater: (state: PlayerState) => void) => void;
  commitMove: (destination: Vec2, advanceFrame: boolean) => void;
  openDoorTile: (position: Vec2) => void;
  removeItemTile: (position: Vec2) => void;
  removeMonsterTile: (position: Vec2) => void;
  removeObjectTile: (position: Vec2) => void;
  getItemData: (tileKey: TileKey) => ItemData | undefined;
  getDoorData: (tileKey: TileKey) => DoorData | undefined;
  getMonsterData: (tileKey: TileKey) => MonsterStats | undefined;
}

export interface TowerEventHelpers {
  fallbackFrom: () => Vec2;
  enqueueMoveCommit: (from: Vec2, to: Vec2, advanceFrame: boolean) => void;
  enqueueMoveBlocked: (reason: MoveBlockReason, position: Vec2, message?: string) => void;
  enqueueDoorEncounter: (position: Vec2, tileKey: TileKey, door: DoorData | undefined) => void;
  stateHasKeys: (needed: number) => boolean;
}

import type { GameEventHandler } from './bus/eventBus';

export interface TowerEventHandlers {
  moveAttempt: GameEventHandler<'player.move.attempt'>;
  moveBlocked: GameEventHandler<'player.move.blocked'>;
  moveCommit: GameEventHandler<'player.move.commit'>;
  doorEncounter: GameEventHandler<'encounter.door'>;
  itemPickup: GameEventHandler<'encounter.item'>;
  monsterEncounter: GameEventHandler<'encounter.monster'>;
  stairsEncounter: GameEventHandler<'encounter.stairs'>;
}

export type DoorUnlockerMoveHandler = (tileKey: TileKey, destination: Vec2) => Promise<void>;
