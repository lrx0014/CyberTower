import { TileType } from '../global/types';
import { GameEventHandler } from './bus/eventBus';
import { TowerEventContext, TowerEventHelpers } from './context';

export const createMonsterEncounterHandler = (
  ctx: TowerEventContext,
  helpers: TowerEventHelpers
): GameEventHandler<'encounter.monster'> => {
  return async (event) => {
    const state = ctx.getState();
    if (!state) return;
    const { monster, position, tileKey } = event.payload;
    if (!monster) {
      ctx.map[position.y][position.x] = TileType.FLOOR;
      ctx.monsterData.delete(tileKey);
      ctx.removeMonsterTile(position);
      ctx.removeObjectTile(position);
      const from = helpers.fallbackFrom();
      helpers.enqueueMoveCommit(from, position, true);
      return;
    }
    const result = ctx.battleCalc(monster);
    if (!result.canWin) {
      helpers.enqueueMoveBlocked('monster', position, `${monster.name || 'Monster'} is too strong to defeat right now.`);
      return;
    }
    ctx.setState((s) => {
      s.hp -= result.hpLoss;
    });
    ctx.map[position.y][position.x] = TileType.FLOOR;
    ctx.monsterData.delete(tileKey);
    ctx.removeMonsterTile(position);
    ctx.removeObjectTile(position);
    ctx.postMsg(`Fought ${monster.name || 'Monster'} for ${result.rounds} round(s) and lost ${result.hpLoss} HP.`);
    ctx.updateUI();
    const from = helpers.fallbackFrom();
    helpers.enqueueMoveCommit(from, position, true);
  };
};
