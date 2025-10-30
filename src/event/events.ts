import { TileKey } from '../global/types';
import { gameEventBus, Vec2 } from './bus/eventBus';
import {
  MoveBlockReason,
  TowerEventContext,
  TowerEventHandlers,
  TowerEventHelpers
} from './context';
import { createDoorUnlockerMoveHandler } from './doorUnlockerHandler';
import { createPlayerMoveAttemptHandler } from './playerMoveAttemptHandler';
import { createPlayerMoveBlockedHandler } from './playerMoveBlockedHandler';
import { createPlayerMoveCommitHandler } from './playerMoveCommitHandler';
import { createDoorEncounterHandler } from './doorEncounterHandler';
import { createItemPickupHandler } from './itemPickupHandler';
import { createMonsterEncounterHandler } from './monsterEncounterHandler';
import { createStairsEncounterHandler } from './stairsEncounterHandler';
import { createDebugHandler } from './debugHandler';
import { createArticleUnlockHandler } from './articleUnlockHandler';

const fallbackFrom = (ctx: TowerEventContext): Vec2 => {
  const last = ctx.getLastMoveAttempt();
  if (last) return last.from;
  const state = ctx.getState();
  if (state) return { x: state.px, y: state.py };
  return { x: 0, y: 0 };
};

const enqueueMoveCommit = (from: Vec2, to: Vec2, advanceFrame: boolean) => {
  gameEventBus.enqueue({
    type: 'player.move.commit',
    trigger: 'system',
    payload: { from, to, advanceFrame }
  });
};

const enqueueMoveBlocked = (reason: MoveBlockReason, position: Vec2, message?: string) => {
  gameEventBus.enqueue({
    type: 'player.move.blocked',
    trigger: 'system',
    payload: { reason, position, message }
  });
};

const enqueueDoorEncounter = (position: Vec2, tileKey: TileKey, door: ReturnType<TowerEventContext['getDoorData']>) => {
  gameEventBus.enqueue({
    type: 'encounter.door',
    trigger: 'system',
    payload: { position, tileKey, door }
  });
};

const createHelpers = (ctx: TowerEventContext): TowerEventHelpers => ({
  fallbackFrom: () => fallbackFrom(ctx),
  enqueueMoveCommit,
  enqueueMoveBlocked,
  enqueueDoorEncounter,
  stateHasKeys: (needed: number) => {
    const state = ctx.getState();
    return !!state && state.keys >= needed;
  }
});

export function createTowerEventHandlers(ctx: TowerEventContext): TowerEventHandlers {
  const helpers = createHelpers(ctx);
  const handleDoorUnlockerMove = createDoorUnlockerMoveHandler(ctx, helpers);

  return {
    moveAttempt: createPlayerMoveAttemptHandler(ctx, helpers, handleDoorUnlockerMove),
    moveBlocked: createPlayerMoveBlockedHandler(ctx),
    moveCommit: createPlayerMoveCommitHandler(ctx),
    doorEncounter: createDoorEncounterHandler(ctx, helpers),
    itemPickup: createItemPickupHandler(ctx, helpers),
    monsterEncounter: createMonsterEncounterHandler(ctx, helpers),
    stairsEncounter: createStairsEncounterHandler(ctx, helpers),
    debug: createDebugHandler(ctx, helpers),
    articleUnlock: createArticleUnlockHandler(),
  };
}
