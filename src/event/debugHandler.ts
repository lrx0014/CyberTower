import { GameEventHandler } from './bus/eventBus';
import { TowerEventContext, TowerEventHelpers } from './context';

export const createDebugHandler = (
  ctx: TowerEventContext,
  helpers: TowerEventHelpers
): GameEventHandler<'debug.console.log'> => {
  return async (event) => {
    console.log(event.payload.txt);
  };
};