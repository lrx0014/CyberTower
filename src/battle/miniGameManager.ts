import { BattleContext, BattleResult } from './types';

export interface MiniGameDescriptor {
  id: string;
  name: string;
  url: string;
  allow?: string;
  timeoutMs?: number;
}

export interface MiniGameHostElements {
  overlay: HTMLElement;
  frame: HTMLIFrameElement;
  loading?: HTMLElement | null;
}

export interface MiniGameLaunchOptions {
  timeoutMs?: number;
  descriptor?: MiniGameDescriptor;
}

interface ActiveMiniGameSession {
  resolve: (result: BattleResult) => void;
  reject: (reason: Error) => void;
  descriptor: MiniGameDescriptor;
  timeoutHandle: number | null;
  contextId: string;
}

const registry = new Map<string, MiniGameDescriptor>();
let host: MiniGameHostElements | null = null;
let activeSession: ActiveMiniGameSession | null = null;

export const DEFAULT_MINI_GAME_ID = 'sample-skill-challenge';

export function initialiseMiniGameHost(elements: MiniGameHostElements) {
  host = elements;
  hideHost();
}

export function registerMiniGames(descriptors: MiniGameDescriptor[]) {
  descriptors.forEach((descriptor) => {
    registry.set(descriptor.id, descriptor);
  });
}

export function getMiniGameDescriptor(id: string): MiniGameDescriptor | undefined {
  return registry.get(id);
}

function showHost() {
  if (!host) return;
  host.overlay.classList.add('active');
  if (host.loading) {
    host.loading.classList.remove('hidden');
  }
}

function hideHost() {
  if (!host) return;
  host.overlay.classList.remove('active');
  if (host.loading) {
    host.loading.classList.add('hidden');
  }
  if (host.frame) {
    host.frame.src = 'about:blank';
  }
}

function cleanupSession() {
  const previousSession = activeSession;
  if (previousSession?.timeoutHandle != null) {
    window.clearTimeout(previousSession.timeoutHandle);
  }
  activeSession = null;
  hideHost();
  window.removeEventListener('message', handleMessage);
  requestAnimationFrame(() => {
    if (!host) return;
    try {
      host.overlay.blur();
      window.focus();
      host.frame.blur();
      const body = document.body;
      if (body) {
        body.focus({ preventScroll: true });
      }
    } catch (err) {
      // ignore focus errors
    }
  });
}

function handleMessage(event: MessageEvent) {
  if (!activeSession || !host) return;
  const { data, source } = event;

  if (!data || typeof data !== 'object') {
    return;
  }

  if (source !== host.frame.contentWindow) {
    return;
  }

  const messageType = (data as { type?: unknown }).type;
  if (messageType === 'battle:ready') {
    if (host.loading) {
      host.loading.classList.add('hidden');
    }
    return;
  }

  if (messageType === 'battle:result') {
    const session = activeSession;
    if (!session) return;
    cleanupSession();
    session.resolve((data as { payload: BattleResult }).payload);
  }
}

function createTimeout(duration: number, reject: (reason: Error) => void) {
  if (duration <= 0) return null;
  return window.setTimeout(() => {
    reject(new Error('Mini-game timed out.'));
  }, duration);
}

export async function launchMiniGame(
  miniGameId: string,
  context: BattleContext,
  options: MiniGameLaunchOptions = {}
): Promise<BattleResult> {
  if (!host) {
    throw new Error('Mini-game host has not been initialised.');
  }

  if (activeSession) {
    throw new Error('Another mini-game is currently running.');
  }

  const descriptor =
    options.descriptor ?? registry.get(miniGameId) ?? registry.get(DEFAULT_MINI_GAME_ID);

  if (!descriptor) {
    throw new Error(`Mini-game descriptor not found for ${miniGameId}.`);
  }

  return new Promise<BattleResult>((resolve, reject) => {
    const fail = (err: Error) => {
      cleanupSession();
      reject(err);
    };

    const timeoutMs = options.timeoutMs ?? descriptor.timeoutMs ?? 60000;

    activeSession = {
      resolve,
      reject: fail,
      descriptor,
      timeoutHandle: createTimeout(timeoutMs, fail),
      contextId: context.id
    };

    showHost();

    if (host.frame) {
      if (descriptor.allow) {
        host.frame.setAttribute('allow', descriptor.allow);
      }
      host.frame.src = descriptor.url;
      const onLoad = () => {
        host.frame.removeEventListener('load', onLoad);
        if (!activeSession) return;
        try {
          host.frame.contentWindow?.postMessage(
            { type: 'battle:init', payload: context },
            '*'
          );
        } catch (err) {
          fail(err instanceof Error ? err : new Error('Failed to initialise mini-game.'));
        }
      };
      host.frame.addEventListener('load', onLoad);
    }

    window.addEventListener('message', handleMessage);
  });
}

export function cancelActiveMiniGame(reason?: Error) {
  if (!activeSession) return;
  const session = activeSession;
  cleanupSession();
  session.reject(reason ?? new Error('Mini-game cancelled.'));
}
