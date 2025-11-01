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
  void hideHost();
}

export function registerMiniGames(descriptors: MiniGameDescriptor[]) {
  descriptors.forEach((descriptor) => {
    registry.set(descriptor.id, descriptor);
  });
}

export function getMiniGameDescriptor(id: string): MiniGameDescriptor | undefined {
  return registry.get(id);
}

function animateOverlay(active: boolean, waitForTransition = true): Promise<void> {
  if (!host) return Promise.resolve();
  const overlay = host.overlay;
  const isActive = overlay.classList.contains('active');
  if (active === isActive) {
    return Promise.resolve();
  }

  if (!waitForTransition) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        if (active) {
          overlay.classList.add('active');
        } else {
          overlay.classList.remove('active');
        }
        resolve();
      });
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      overlay.removeEventListener('transitionend', onTransition);
      window.clearTimeout(fallback);
      resolve();
    };
    const onTransition = (event: TransitionEvent) => {
      if (event.target !== overlay) return;
      if (!(event.propertyName === 'transform' || event.propertyName === 'opacity')) return;
      finish();
    };
    const fallback = window.setTimeout(finish, 420);
    overlay.addEventListener('transitionend', onTransition);
    requestAnimationFrame(() => {
      if (active) {
        overlay.classList.add('active');
      } else {
        overlay.classList.remove('active');
      }
    });
  });
}

async function showHost(): Promise<void> {
  if (!host) return;
  if (host.loading) {
    host.loading.classList.remove('hidden');
  }
  await animateOverlay(true, false);
}

async function hideHost(): Promise<void> {
  if (!host) return;
  if (host.loading) {
    host.loading.classList.add('hidden');
  }
  await animateOverlay(false, true);
  if (host.frame) {
    host.frame.src = 'about:blank';
  }
}

async function cleanupSession() {
  const previousSession = activeSession;
  if (previousSession?.timeoutHandle != null) {
    window.clearTimeout(previousSession.timeoutHandle);
  }
  activeSession = null;
  window.removeEventListener('message', handleMessage);
  await hideHost();
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
    void cleanupSession().then(() => {
      session.resolve((data as { payload: BattleResult }).payload);
    });
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

  await showHost();

  return new Promise<BattleResult>((resolve, reject) => {
    const fail = (err: Error) => {
      void cleanupSession().finally(() => reject(err));
    };

    const timeoutMs = options.timeoutMs ?? descriptor.timeoutMs ?? 60000;

    activeSession = {
      resolve,
      reject: fail,
      descriptor,
      timeoutHandle: createTimeout(timeoutMs, fail),
      contextId: context.id
    };

    if (!host.frame) {
      fail(new Error('Mini-game frame element not found.'));
      return;
    }

    const frame = host.frame;
    if (descriptor.allow) {
      frame.setAttribute('allow', descriptor.allow);
    }

    const onLoad = () => {
      frame.removeEventListener('load', onLoad);
      if (!activeSession) return;
      try {
        frame.contentWindow?.postMessage({ type: 'battle:init', payload: context }, '*');
      } catch (err) {
        fail(err instanceof Error ? err : new Error('Failed to initialise mini-game.'));
      }
    };

    frame.addEventListener('load', onLoad);

    try {
      frame.src = descriptor.url;
    } catch (err) {
      frame.removeEventListener('load', onLoad);
      fail(err instanceof Error ? err : new Error('Failed to load mini-game.'));
    }

    window.addEventListener('message', handleMessage);
  });
}

export function cancelActiveMiniGame(reason?: Error) {
  if (!activeSession) return;
  const session = activeSession;
  void cleanupSession().finally(() => {
    session.reject(reason ?? new Error('Mini-game cancelled.'));
  });
}
