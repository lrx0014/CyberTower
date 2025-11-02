export interface EquipmentDefinition {
  gid: string;
  name: string;
  bonus: {
    atk?: number;
    def?: number;
  };
}

type EquipmentDefinitionMap = Record<string, EquipmentDefinition>;

export const EQUIPMENT_DEFINITIONS: EquipmentDefinitionMap = {
  'equipment.passwordArmor': {
    gid: 'equipment.passwordArmor',
    name: 'Password Armor (+1 DEF)',
    bonus: { def: 1 }
  },
  'equipment.mfaShield': {
    gid: 'equipment.mfaShield',
    name: 'MFA Shield (+1 DEF)',
    bonus: { def: 1 }
  },
  'equipment.antiPhishingSword': {
    gid: 'equipment.antiPhishingSword',
    name: 'Anti-Phishing Sword (+1 ATK)',
    bonus: { atk: 1 }
  }
};

export interface EquipmentBonusTotals {
  bonusAtk: number;
  bonusDef: number;
}

export const ALL_EQUIPMENT: EquipmentDefinition[] = Object.values(EQUIPMENT_DEFINITIONS);

export const getEquipmentDefinition = (gid: string): EquipmentDefinition | undefined => {
  return EQUIPMENT_DEFINITIONS[gid];
};

export const computeEquipmentBonusTotals = (inventory: Record<string, number>): EquipmentBonusTotals => {
  let bonusAtk = 0;
  let bonusDef = 0;
  Object.entries(inventory).forEach(([gid, count]) => {
    const qty = Number(count);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const def = getEquipmentDefinition(gid);
    if (!def) return;
    if (def.bonus.atk) {
      bonusAtk += def.bonus.atk * qty;
    }
    if (def.bonus.def) {
      bonusDef += def.bonus.def * qty;
    }
  });
  return { bonusAtk, bonusDef };
};

export const pickRandomEquipmentReward = (rng: () => number = Math.random): EquipmentDefinition => {
  const pool = ALL_EQUIPMENT;
  if (pool.length === 0) {
    throw new Error('No equipment definitions available.');
  }
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[index];
};
