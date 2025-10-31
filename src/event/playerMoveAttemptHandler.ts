import { TileType, TileKey } from '../global/types';
import { GameEventHandler, gameEventBus } from './bus/eventBus';
import { DoorUnlockerMoveHandler, TowerEventContext, TowerEventHelpers } from './context';

export const createPlayerMoveAttemptHandler = (
  ctx: TowerEventContext,
  helpers: TowerEventHelpers,
  handleDoorUnlockerMove: DoorUnlockerMoveHandler
): GameEventHandler<'player.move.attempt'> => {
  return async (event) => {
    const state = ctx.getState();
    if (!state) return;
    const { from, to } = event.payload;
    const { x: nx, y: ny } = to;

    if (nx < 0 || ny < 0 || nx >= ctx.cols || ny >= ctx.rows) {
      helpers.enqueueMoveBlocked('bounds', to, 'Cannot move beyond the map.');
      return;
    }

    ctx.setLastMoveAttempt({ from, to });

    const tileType = ctx.map[ny][nx];
    const tileKey = `${nx},${ny}` as TileKey;
    const unlockerInfo = ctx.doorUnlockers.get(tileKey);

    if (tileType === TileType.WALL) {
      helpers.enqueueMoveBlocked('wall', to, 'A wall blocks the way.');
      return;
    }

    if (tileType === TileType.DOOR && !unlockerInfo) {
      helpers.enqueueDoorEncounter(to, tileKey, ctx.getDoorData(tileKey));
      return;
    }

    if (tileType === TileType.MONSTER) {
      gameEventBus.enqueue({
        type: 'encounter.monster',
        trigger: 'system',
        payload: { position: to, monster: ctx.getMonsterData(tileKey), tileKey }
      });
      return;
    }

    if (tileType === TileType.KEY || tileType === TileType.HP || tileType === TileType.ATK || tileType === TileType.DEF) {
      gameEventBus.enqueue({
        type: 'encounter.item',
        trigger: 'system',
        payload: { position: to, item: ctx.getItemData(tileKey), tileType, tileKey }
      });
      return;
    }

    if (tileType === TileType.STAIRS) {
      const stairsInfo = ctx.getStairsData(tileKey);
      gameEventBus.enqueue({
        type: 'encounter.stairs',
        trigger: 'system',
        payload: { position: to, tileKey, direction: stairsInfo?.direction ?? 'up' }
      });
      return;
    }

    if (unlockerInfo) {
      await handleDoorUnlockerMove(tileKey, to);
      return;
    }

    if (ctx.hasBlockingObject(nx, ny) && tileType === TileType.FLOOR) {
      helpers.enqueueMoveBlocked('entity', to, 'Something blocks the way.');
      return;
    }

    helpers.enqueueMoveCommit(from, to, true);
  };
};
