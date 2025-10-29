import { TileType } from '../global/types';
import { GameEventHandler } from './bus/eventBus';
import { TowerEventContext, TowerEventHelpers } from './context';

export const createItemPickupHandler = (
  ctx: TowerEventContext,
  helpers: TowerEventHelpers
): GameEventHandler<'encounter.item'> => {
  return async (event) => {
    const state = ctx.getState();
    if (!state) return;
    const { item, tileType, position, tileKey } = event.payload;
    switch (tileType) {
      case TileType.KEY: {
        const gid = item?.gid;
        const amount = item?.value ?? 1;
        if (gid) {
          ctx.addInventoryItem(gid, amount, item?.name);
          const itemName = ctx.getInventoryName(gid, item?.name);
          ctx.postMsg(`Obtained ${itemName}${amount > 1 ? ` x${amount}` : ''}.`);
        } else {
          ctx.applyKeyPickup(amount);
          ctx.postMsg(`Picked up key x${amount}.`);
        }
        break;
      }
      case TileType.HP: {
        const hpValue = item?.value ?? 50;
        ctx.setState((s) => {
          s.hp += hpValue;
        });
        ctx.postMsg(`HP +${hpValue}`);
        break;
      }
      case TileType.ATK: {
        const atkValue = item?.value ?? 3;
        ctx.setState((s) => {
          s.atk += atkValue;
        });
        ctx.postMsg(`ATK +${atkValue}`);
        break;
      }
      case TileType.DEF: {
        const defValue = item?.value ?? 3;
        ctx.setState((s) => {
          s.def += defValue;
        });
        ctx.postMsg(`DEF +${defValue}`);
        break;
      }
      default:
        break;
    }

    ctx.map[position.y][position.x] = TileType.FLOOR;
    ctx.itemData.delete(tileKey);
    ctx.updateUI();
    ctx.removeItemTile(position);
    ctx.removeObjectTile(position);

    const from = helpers.fallbackFrom();
    helpers.enqueueMoveCommit(from, position, true);
  };
};
