import { BaseTowerScene, TowerSceneConfig } from './BaseTowerScene';

const COMBAT_SCENE_CONFIG: TowerSceneConfig = {
  key: 'CombatScene',
  mapKey: 'scene_2_combat',
  mapPath: 'assets/scene_2_combat.json'
};

export default class CombatScene extends BaseTowerScene {
  constructor() {
    super(COMBAT_SCENE_CONFIG);
  }
}
