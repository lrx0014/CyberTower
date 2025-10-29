import { GameEventHandler } from './bus/eventBus';
import { TowerEventContext, TowerEventHelpers } from './context';

export const createStairsEncounterHandler = (
  ctx: TowerEventContext,
  helpers: TowerEventHelpers
): GameEventHandler<'encounter.stairs'> => {
  return async (event) => {
    ctx.postMsg('Level 1 complete!');
    const from = helpers.fallbackFrom();
    helpers.enqueueMoveCommit(from, event.payload.position, true);
  };
};
