import { GameEventHandler } from './bus/eventBus';
import { TowerEventContext } from './context';

export const createPlayerMoveBlockedHandler = (
  ctx: TowerEventContext
): GameEventHandler<'player.move.blocked'> => {
  return async (event) => {
    ctx.setLastMoveAttempt(null);
    if (event.payload.message) {
      ctx.postMsg(event.payload.message);
    }
  };
};
