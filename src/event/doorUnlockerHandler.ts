import { TileKey } from '../global/types';
import { Vec2 } from './bus/eventBus';
import { DoorUnlockerMoveHandler, TowerEventContext, TowerEventHelpers } from './context';

const parseTileKey = (key: TileKey): Vec2 => {
  const [sx, sy] = key.split(',');
  return { x: Number.parseInt(sx, 10), y: Number.parseInt(sy, 10) };
};

export const createDoorUnlockerMoveHandler = (
  ctx: TowerEventContext,
  helpers: TowerEventHelpers
): DoorUnlockerMoveHandler => {
  return async (tileKey, destination) => {
    const info = ctx.doorUnlockers.get(tileKey);
    if (!info) {
      const from = helpers.fallbackFrom();
      helpers.enqueueMoveCommit(from, destination, true);
      return;
    }

    const doorKey = info.doorKey;
    const door = doorKey ? ctx.getDoorData(doorKey) : undefined;
    const requireId = door?.require ?? info.require;
    const requireDisplay = door?.requireName ?? info.requireName;
    let opened = false;

    if (requireId) {
      const consumed = ctx.consumeInventoryItem(requireId, 1);
      if (!consumed) {
        const itemName = ctx.getInventoryName(requireId, requireDisplay);
        ctx.postMsg(`You need ${itemName} to open this door.`);
        helpers.enqueueMoveBlocked('keys', destination, `You need ${itemName} to open this door.`);
        return;
      }
      const itemName = ctx.getInventoryName(requireId, requireDisplay);
      ctx.postMsg(`You used ${itemName} to open the door.`);
      opened = true;
    } else {
      const need = door?.keyCost ?? 0;
      if (need > 0 && helpers.stateHasKeys(need)) {
        ctx.setState((s) => {
          s.keys -= need;
        });
        ctx.postMsg(`Used ${need} key(s). The door opened.`);
        opened = true;
      } else if (need > 0) {
        ctx.postMsg(`Need ${need} key(s).`);
        helpers.enqueueMoveBlocked('keys', destination, `Need ${need} key(s).`);
        return;
      } else {
        ctx.postMsg('The door unlocks.');
        opened = true;
      }
    }

    if (opened) {
      if (doorKey) {
        const doorPos = parseTileKey(doorKey);
        ctx.openDoorTile(doorPos);
        for (const [otherKey, data] of ctx.doorUnlockers) {
          if (data.doorKey === doorKey) {
            ctx.doorUnlockers.delete(otherKey);
          }
        }
      } else {
        ctx.doorUnlockers.delete(tileKey);
      }
      ctx.removeObjectTile(destination);
      ctx.updateUI();
    }

    const from = helpers.fallbackFrom();
    helpers.enqueueMoveCommit(from, destination, true);
  };
};
