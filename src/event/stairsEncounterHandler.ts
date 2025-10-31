import type { Vec2 } from './bus/eventBus';
import type { TileKey } from '../global/types';
import { GameEventHandler } from './bus/eventBus';
import { TowerEventContext, TowerEventHelpers } from './context';

export interface StairsEncounterInfo {
  position: Vec2;
  tileKey: TileKey;
  direction: 'up' | 'down';
}

export interface StairsEncounterHooks {
  onStairsEncounter?: (info: StairsEncounterInfo, defaultAction: () => void) => void | Promise<void>;
}

export const createStairsEncounterHandler = (
  ctx: TowerEventContext,
  helpers: TowerEventHelpers,
  hooks: StairsEncounterHooks | undefined
): GameEventHandler<'encounter.stairs'> => {
  return async (event) => {
    const position = event.payload.position;
    const info: StairsEncounterInfo = {
      position,
      tileKey: event.payload.tileKey,
      direction: event.payload.direction
    };
    const defaultAction = () => {
      const sceneName = ctx.getSceneDisplayName();
      ctx.postMsg(`${sceneName} complete!`);
      const from = helpers.fallbackFrom();
      helpers.enqueueMoveCommit(from, position, true);
    };

    if (hooks?.onStairsEncounter) {
      await hooks.onStairsEncounter(info, defaultAction);
      return;
    }

    defaultAction();
  };
};
