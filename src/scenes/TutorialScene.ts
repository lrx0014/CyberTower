import type { Vec2 } from '../event/bus/eventBus';
import { BaseTowerScene, TowerSceneConfig } from './BaseTowerScene';

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
  displayName: 'Lobby'
};

export default class TutorialScene extends BaseTowerScene {
  constructor() {
    super(TUTORIAL_SCENE_CONFIG);
  }

  protected override handleStairsEncounter(_position: Vec2, _defaultAction: () => void): void {
    this.scene.start('CombatScene');
  }
}
