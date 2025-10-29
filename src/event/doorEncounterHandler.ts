import { GameEventHandler } from './bus/eventBus';
import { TowerEventContext, TowerEventHelpers } from './context';

export const createDoorEncounterHandler = (
  ctx: TowerEventContext,
  helpers: TowerEventHelpers
): GameEventHandler<'encounter.door'> => {
  return async (event) => {
    const state = ctx.getState();
    if (!state) return;
    const { door, position, tileKey } = event.payload;
    const requireId = door?.require;
    let opened = false;
    if (requireId) {
      const consumed = ctx.consumeInventoryItem(requireId, 1);
      if (!consumed) {
        const itemName = ctx.getInventoryName(requireId, door?.requireName);
        ctx.postMsg(`You need ${itemName} to open this door.`);
        return;
      }
      const itemName = ctx.getInventoryName(requireId, door?.requireName);
      ctx.postMsg(`You used ${itemName} to open the door.`);
      opened = true;
    } else {
      const need = door?.keyCost ?? 1;
      if (state.keys < need) {
        ctx.postMsg(`Need ${need} key(s).`);
        return;
      }
      ctx.setState((s) => {
        s.keys -= need;
      });
      ctx.postMsg(`Used ${need} key(s). The door opened.`);
      opened = true;
    }
    if (!opened) return;
    ctx.openDoorTile(position);
    for (const [unlockKey, data] of ctx.doorUnlockers) {
      if (data.doorKey === tileKey) {
        ctx.doorUnlockers.delete(unlockKey);
      }
    }
    ctx.updateUI();

    const from = helpers.fallbackFrom();
    helpers.enqueueMoveCommit(from, position, true);
  };
};
