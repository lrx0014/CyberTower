import { TileType } from '../global/types';
import type { BattleResult } from '../battle/types';
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
    let battleResult: BattleResult | null = null;
    try {
      const battleContext = ctx.createBattleContext(monster, position, tileKey);
      battleResult = await ctx.runBattle(battleContext);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[battle] failed to launch mini-game', err);
      ctx.postMsg('The battle could not be started.');
      helpers.enqueueMoveBlocked('monster', position, 'The battle could not be started.');
      return;
    }

    if (!battleResult) {
      ctx.postMsg('The battle was cancelled.');
      helpers.enqueueMoveBlocked('monster', position, 'The battle was cancelled.');
      return;
    }

    const { player, monster: monsterResult, rewards, outcome, message } = battleResult;

    if (player) {
      ctx.setState((s) => {
        if (player.hp !== undefined) {
          s.hp = Math.max(0, player.hp);
        }
        if (player.deltaHp !== undefined) {
          s.hp = Math.max(0, s.hp + player.deltaHp);
        }
        if (player.atk !== undefined) {
          s.atk = Math.max(0, player.atk);
        }
        if (player.deltaAtk !== undefined) {
          s.atk = Math.max(0, s.atk + player.deltaAtk);
        }
        if (player.def !== undefined) {
          s.def = Math.max(0, player.def);
        }
        if (player.deltaDef !== undefined) {
          s.def = Math.max(0, s.def + player.deltaDef);
        }
      });
    }

    if (rewards?.keys) {
      const keys = Math.floor(rewards.keys);
      if (Number.isFinite(keys) && keys !== 0) {
        if (keys > 0) {
          ctx.applyKeyPickup(keys);
        } else {
          ctx.setState((s) => {
            s.keys = Math.max(0, s.keys + keys);
          });
        }
      }
    }

    rewards?.inventory?.forEach((item) => {
      if (!item || !item.gid || !Number.isFinite(item.count)) return;
      ctx.addInventoryItem(item.gid, item.count, item.name);
    });

    rewards?.messages?.forEach((msg) => {
      if (typeof msg === 'string' && msg.trim().length > 0) {
        ctx.postMsg(msg.trim());
      }
    });

    ctx.updateUI();

    const monsterDefeated =
      monsterResult?.defeated !== undefined
        ? monsterResult.defeated
        : outcome === 'victory';

    const trimmedMessage =
      typeof message === 'string' && message.trim().length > 0 ? message.trim() : undefined;

    if (!monsterDefeated) {
      if (monsterResult?.hp !== undefined) {
        const updatedMonster = ctx.monsterData.get(tileKey);
        if (updatedMonster) {
          updatedMonster.hp = monsterResult.hp;
          ctx.monsterData.set(tileKey, updatedMonster);
        }
      }
      const reason = trimmedMessage ?? `${monster.name || 'Monster'} stands firm.`;
      ctx.postMsg(reason);
      helpers.enqueueMoveBlocked('monster', position, reason);
      return;
    }

    ctx.map[position.y][position.x] = TileType.FLOOR;
    ctx.monsterData.delete(tileKey);
    ctx.removeMonsterTile(position);
    ctx.removeObjectTile(position);

    const successMsg =
      trimmedMessage ?? `You defeated ${monster.name || 'the monster'}!`;
    ctx.postMsg(successMsg);

    const from = helpers.fallbackFrom();
    helpers.enqueueMoveCommit(from, position, true);
  };
};
