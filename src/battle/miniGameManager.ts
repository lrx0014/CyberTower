import { BattleContext, BattleResult } from './types';

export interface MiniGameDescriptor {
  id: string;
  name: string;
  url: string;
  allow?: string;
  timeoutMs?: number;
  description?: string;
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
let nextMiniGameIndex = 0;

export const DEFAULT_MINI_GAME_ID = 'quiz';

export function initialiseMiniGameHost(elements: MiniGameHostElements) {
  host = elements;
  void hideHost();
}

export function registerMiniGames(descriptors: MiniGameDescriptor[]) {
  descriptors.forEach((descriptor) => {
    registry.set(descriptor.id, descriptor);
  });
}

export function setMiniGames(descriptors: MiniGameDescriptor[]) {
  registry.clear();
  registerMiniGames(descriptors);
  nextMiniGameIndex = 0;
}

export function getRegisteredMiniGames(): MiniGameDescriptor[] {
  return Array.from(registry.values());
}

export function selectMiniGame(preferredId?: string): MiniGameDescriptor | undefined {
  if (preferredId) {
    const trimmed = preferredId.trim();
    if (trimmed.length > 0) {
      const preferred = registry.get(trimmed);
      if (preferred) {
        return preferred;
      }
    }
  }
  const all = getRegisteredMiniGames();
  if (all.length === 0) {
    return undefined;
  }
  const index = nextMiniGameIndex % all.length;
  nextMiniGameIndex = (nextMiniGameIndex + 1) % all.length;
  return all[index];
}

export async function loadMiniGamesFromManifest(indexUrl = '/mini-games/loader.json') {
  const descriptors: MiniGameDescriptor[] = [];
  try {
    const indexResponse = await fetch(indexUrl, { cache: 'no-cache' });
    if (!indexResponse.ok) {
      throw new Error(`Failed to fetch manifest index ${indexUrl}: ${indexResponse.status}`);
    }
    const indexEntries = (await indexResponse.json()) as Array<{
      id?: string;
      manifest?: string;
      url?: string;
      allow?: string;
      timeoutMs?: number;
      name?: string;
      description?: string;
    }>;
    if (Array.isArray(indexEntries)) {
      const origin = window.location.origin;
      const absoluteIndexUrl = new URL(indexUrl, origin);
      for (const entry of indexEntries) {
        if (!entry || typeof entry !== 'object') continue;
        try {
          if (entry.manifest) {
            const manifestUrl = new URL(entry.manifest, absoluteIndexUrl);
            const manifestResponse = await fetch(manifestUrl.toString(), { cache: 'no-cache' });
            if (!manifestResponse.ok) {
              // eslint-disable-next-line no-console
              console.warn('[battle] mini-game manifest load failed', manifestUrl.toString(), manifestResponse.status);
              continue;
            }
            const manifest = await manifestResponse.json();
            if (!manifest || typeof manifest !== 'object') {
              continue;
            }
            const id = (manifest.id ?? entry.id ?? manifestUrl.pathname.split('/').slice(-2, -1)[0] ?? '').trim();
            const entryPath = typeof manifest.entry === 'string' ? manifest.entry.trim() : '';
            const url = typeof manifest.url === 'string' && manifest.url.trim().length > 0
              ? manifest.url.trim()
              : entryPath
                ? new URL(entryPath, manifestUrl).toString()
                : undefined;
            if (!id || !url) {
              continue;
            }
            descriptors.push({
              id,
              name: manifest.name || id,
              description: manifest.description || entry.description,
              url,
              allow: manifest.allow || entry.allow,
              timeoutMs: manifest.timeoutMs ?? entry.timeoutMs
            });
          } else if (entry.url) {
            const id = (entry.id || new URL(entry.url, absoluteIndexUrl).pathname.split('/').pop() || '').trim();
            if (!id) continue;
            const url = new URL(entry.url, absoluteIndexUrl).toString();
            descriptors.push({
              id,
              name: entry.name || id,
              description: entry.description,
              url,
              allow: entry.allow,
              timeoutMs: entry.timeoutMs
            });
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[battle] mini-game manifest entry invalid', entry, err);
        }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[battle] failed to load mini-game manifests', err);
    throw err;
  }

  if (descriptors.length > 0) {
    setMiniGames(descriptors);
  }
  return descriptors;
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
