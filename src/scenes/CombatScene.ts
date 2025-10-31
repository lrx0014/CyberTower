import type { Vec2 } from '../event/bus/eventBus';
import { BaseTowerScene, TowerSceneConfig } from './BaseTowerScene';

const COMBAT_SCENE_CONFIG: TowerSceneConfig = {
  key: 'CombatScene',
  mapKey: 'scene_2_combat',
  mapPath: 'assets/scene_2_combat.json',
  displayName: 'Floor 1'
};

interface CombatSceneData {
  floor?: number;
}

export default class CombatScene extends BaseTowerScene {
  private currentFloor = 1;

  constructor() {
    super(COMBAT_SCENE_CONFIG);
  }

  init(data?: CombatSceneData) {
    const rawFloor = data?.floor;
    const parsedFloor =
      typeof rawFloor === 'number' && Number.isFinite(rawFloor) ? Math.max(1, Math.floor(rawFloor)) : 1;
    this.currentFloor = parsedFloor;
    this.setDisplayName(`Floor ${this.currentFloor}`);
  }

  protected override handleStairsEncounter(_position: Vec2, _defaultAction: () => void): void {
    this.scene.start('CombatScene', { floor: this.currentFloor + 1 });
  }
}
