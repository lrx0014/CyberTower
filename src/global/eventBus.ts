import type { DoorData, ItemData, MonsterStats, TileKey, TileType } from './types';

export interface Vec2 {
  x: number;
  y: number;
}

interface GameEventBase<TType extends string, TPayload> {
  type: TType;
  trigger: 'player' | 'system';
  payload: TPayload;
  once?: boolean;
}

export type PlayerMoveAttemptEvent = GameEventBase<
  'player.move.attempt',
  {
    from: Vec2;
    to: Vec2;
  }
>;

export type PlayerMoveCommitEvent = GameEventBase<
  'player.move.commit',
  {
    from: Vec2;
    to: Vec2;
    advanceFrame: boolean;
  }
>;

export type PlayerMoveBlockedEvent = GameEventBase<
  'player.move.blocked',
  {
    reason: 'wall' | 'door' | 'entity' | 'monster' | 'keys' | 'bounds';
    position: Vec2;
    message?: string;
  }
>;

export type DoorEncounterEvent = GameEventBase<
  'encounter.door',
  {
    position: Vec2;
    door: DoorData | undefined;
    tileKey: TileKey;
  }
>;

export type ItemPickupEvent = GameEventBase<
  'encounter.item',
  {
    position: Vec2;
    item: ItemData | undefined;
    tileType: TileType;
    tileKey: TileKey;
  }
>;

export type MonsterEncounterEvent = GameEventBase<
  'encounter.monster',
  {
    position: Vec2;
    monster: MonsterStats | undefined;
    tileKey: TileKey;
  }
>;

export type StairsEvent = GameEventBase<
  'encounter.stairs',
  {
    position: Vec2;
  }
>;

export type GameEvent =
  | PlayerMoveAttemptEvent
  | PlayerMoveCommitEvent
  | PlayerMoveBlockedEvent
  | DoorEncounterEvent
  | ItemPickupEvent
  | MonsterEncounterEvent
  | StairsEvent;

export type GameEventType = GameEvent['type'];

export type GameEventHandler<TType extends GameEventType> = (
  event: Extract<GameEvent, { type: TType }>
) => void | Promise<void>;

export class EventBus {
  private readonly queue: GameEvent[] = [];
  private readonly handlers = new Map<GameEventType, Set<GameEventHandler<any>>>();
  private processing = false;
  private running = false;

  subscribe<TType extends GameEventType>(type: TType, handler: GameEventHandler<TType>): () => void {
    const bucket = this.handlers.get(type) ?? new Set();
    bucket.add(handler as GameEventHandler<any>);
    this.handlers.set(type, bucket);
    return () => {
      bucket.delete(handler as GameEventHandler<any>);
      if (bucket.size === 0) {
        this.handlers.delete(type);
      }
    };
  }

  enqueue(event: GameEvent) {
    this.queue.push(event);
    if (this.running) {
      this.scheduleProcess();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.scheduleProcess();
  }

  stop() {
    this.running = false;
  }

  private scheduleProcess() {
    if (this.processing || !this.running) return;
    this.processing = true;
    setTimeout(() => this.processQueue(), 0);
  }

  private async processQueue() {
    while (this.running && this.queue.length > 0) {
      const event = this.queue.shift();
      if (!event) {
        break;
      }
      const handlers = this.handlers.get(event.type);
      if (!handlers || handlers.size === 0) {
        continue;
      }
      for (const handler of handlers) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await handler(event as never);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[EventBus] handler failed for', event.type, err);
        }
      }
    }
    this.processing = false;
    if (this.running && this.queue.length > 0) {
      this.scheduleProcess();
    }
  }
}

export const gameEventBus = new EventBus();
