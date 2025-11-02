import { BaseTowerScene, TowerSceneConfig, TowerSceneSnapshot } from './BaseTowerScene';
import type { StairsEncounterInfo } from '../event/events';
import type { MonsterStats, TileKey } from '../global/types';
import type { Vec2 } from '../event/bus/eventBus';

const COMBAT_SCENE_CONFIG: TowerSceneConfig = {
  key: 'CombatScene',
  mapKey: 'scene_2_combat',
  mapPath: 'assets/scene_2_combat.json',
  displayName: 'Floor 1',
  defaultMiniGameId: 'quiz'
};

interface CombatSceneData {
  floor?: number;
  reset?: boolean;
}

export default class CombatScene extends BaseTowerScene {
  private static floorSnapshots = new Map<number, TowerSceneSnapshot>();
  private currentFloor = 1;

  constructor() {
    super(COMBAT_SCENE_CONFIG);
  }

  public static resetSnapshots(): void {
    CombatScene.floorSnapshots.clear();
  }

  init(data?: CombatSceneData) {
    if (data?.reset) {
      CombatScene.floorSnapshots.clear();
    }
    const rawFloor = data?.floor;
    const parsedFloor =
      typeof rawFloor === 'number' && Number.isFinite(rawFloor) ? Math.max(1, Math.floor(rawFloor)) : 1;
    this.currentFloor = parsedFloor;
    this.setDisplayName(`Floor ${this.currentFloor}`);
    const snapshot = CombatScene.floorSnapshots.get(this.currentFloor);
    this.setPendingSceneSnapshot(snapshot ?? null);
  }

  protected override handleStairsEncounter(info: StairsEncounterInfo, defaultAction: () => void): void {
    CombatScene.floorSnapshots.set(this.currentFloor, this.captureSceneState());

    if (info.direction === 'up') {
      this.transitionToScene(() => {
        this.scene.start('CombatScene', { floor: this.currentFloor + 1 });
      });
      return;
    }

    if (info.direction === 'down') {
      const previousFloor = this.currentFloor - 1;
      if (previousFloor < 1) {
        this.transitionToScene(() => {
          this.scene.start('TutorialScene');
        });
        return;
      }
      if (!CombatScene.floorSnapshots.has(previousFloor)) {
        defaultAction();
        return;
      }
      this.transitionToScene(() => {
        this.scene.start('CombatScene', { floor: previousFloor });
      });
      return;
    }

    defaultAction();
  }

  protected override getBattleEnvironmentExtras(
    _monster: MonsterStats,
    _position: Vec2,
    _tileKey: TileKey
  ): Record<string, unknown> | undefined {
    return { floor: this.currentFloor };
  }
}
