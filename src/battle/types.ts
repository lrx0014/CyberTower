import type { MonsterStats, PlayerState } from '../global/types';
import type { Vec2 } from '../event/bus/eventBus';

export interface BattleContext {
  id: string;
  sceneKey: string;
  sceneName: string;
  player: {
    name: string;
    stats: Pick<PlayerState, 'hp' | 'atk' | 'def'>;
    inventory: PlayerState['inventory'];
    keys: number;
  };
  monster: {
    id: string;
    name: string;
    stats: Pick<MonsterStats, 'hp' | 'atk' | 'def'>;
    miniGameId: string;
  };
  environment: {
    position: Vec2;
    seed: number;
    extra?: Record<string, unknown>;
  };
}

export type BattleOutcome = 'victory' | 'defeat' | 'abort';

export interface BattleAttributeChanges {
  hp?: number;
  deltaHp?: number;
  atk?: number;
  deltaAtk?: number;
  def?: number;
  deltaDef?: number;
}

export interface BattleInventoryReward {
  gid: string;
  count: number;
  name?: string;
}

export interface BattleRewards {
  keys?: number;
  inventory?: BattleInventoryReward[];
  messages?: string[];
}

export interface BattleResult {
  outcome: BattleOutcome;
  message?: string;
  player?: BattleAttributeChanges;
  monster?: {
    defeated?: boolean;
    hp?: number;
    deltaHp?: number;
  };
  rewards?: BattleRewards;
  extra?: Record<string, unknown>;
}
