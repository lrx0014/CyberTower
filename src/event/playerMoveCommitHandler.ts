import { GameEventHandler } from './bus/eventBus';
import { TowerEventContext } from './context';

export const createPlayerMoveCommitHandler = (
  ctx: TowerEventContext
): GameEventHandler<'player.move.commit'> => {
  return async (event) => {
    ctx.commitMove(event.payload.to, event.payload.advanceFrame);
    ctx.setLastMoveAttempt(null);
  };
};
