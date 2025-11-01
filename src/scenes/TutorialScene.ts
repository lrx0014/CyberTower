import type { StairsEncounterInfo } from '../event/events';
import { BaseTowerScene, TowerSceneConfig, TowerSceneSnapshot } from './BaseTowerScene';

export type { DirectionInput } from './BaseTowerScene';

export {
  DEFAULT_GAME_HEIGHT,
  DEFAULT_GAME_WIDTH,
  debugGrantInventoryItem,
  debugSetPlayerAttributes,
  getActiveScene,
  getInventoryEntries,
  getPlayerSnapshot,
  requestDirectionalInput,
  registerUIHooks,
  resetPlayerState
} from './BaseTowerScene';

const TUTORIAL_SCENE_CONFIG: TowerSceneConfig = {
  key: 'TutorialScene',
  mapKey: 'scene_1_tutorial',
  mapPath: 'assets/scene_1_tutorial.json',
  displayName: 'Lobby',
  defaultMiniGameId: 'quiz'
};

export default class TutorialScene extends BaseTowerScene {
  private static snapshot: TowerSceneSnapshot | null = null;

  constructor() {
    super(TUTORIAL_SCENE_CONFIG);
  }

  init(): void {
    this.setPendingSceneSnapshot(TutorialScene.snapshot);
  }

  protected override handleStairsEncounter(info: StairsEncounterInfo, defaultAction: () => void): void {
    if (info.direction === 'down') {
      defaultAction();
      return;
    }
    TutorialScene.snapshot = this.captureSceneState();
    this.transitionToScene(() => {
      this.scene.start('CombatScene', { floor: 1, reset: true });
    });
  }
}
