export type TileKey = `${number},${number}`;

export enum TileType {
  FLOOR = 0,
  WALL = 1,
  DOOR = 2,
  KEY = 3,
  STAIRS = 4,
  HP = 5,
  ATK = 6,
  DEF = 7,
  MONSTER = 8
}

export interface MonsterStats {
  name: string;
  hp: number;
  atk: number;
  def: number;
}

export interface ItemData {
  type: 'hp' | 'atk' | 'def' | 'key';
  value: number;
}

export interface DoorData {
  doorType: string;
  keyCost: number;
}

export interface PlayerState {
  name: string;
  px: number;
  py: number;
  hp: number;
  atk: number;
  def: number;
  keys: number;
}

export interface UIHooks {
  postMessage: (text: string) => void;
  updateStats: (state: PlayerState) => void;
}
