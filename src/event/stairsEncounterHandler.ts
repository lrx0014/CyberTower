import type { Vec2 } from './bus/eventBus';
import { GameEventHandler } from './bus/eventBus';
import { TowerEventContext, TowerEventHelpers } from './context';

export interface StairsEncounterHooks {
  onStairsEncounter?: (position: Vec2, defaultAction: () => void) => void | Promise<void>;
}

export const createStairsEncounterHandler = (
  ctx: TowerEventContext,
  helpers: TowerEventHelpers,
  hooks: StairsEncounterHooks | undefined
): GameEventHandler<'encounter.stairs'> => {
  return async (event) => {
    const position = event.payload.position;
    const defaultAction = () => {
      ctx.postMsg('Level 1 complete!');
      const from = helpers.fallbackFrom();
      helpers.enqueueMoveCommit(from, position, true);
    };

    if (hooks?.onStairsEncounter) {
      await hooks.onStairsEncounter(position, defaultAction);
      return;
    }

    defaultAction();
  };
};
