// src/stats.js

// Base stats for the player
const baseStats = {
  maxHp: 100,
  damage: 15,
  fireRate: 1.8, // Shots per second
  speed: 165, // Pixels per second
  projectileCount: 1,
  pierce: 0,
  critChance: 0.05, // 5%
  critMultiplier: 2.0,
  lifesteal: 0.0,
  pickupRange: 115,
  projectileSpeed: 380,
  bounce: 0,
  voidMastery: 0,
  fireMastery: 0,
  frostMastery: 0,
  stormMastery: 0,
  toxinMastery: 0,
  bloodMastery: 0,
  holyMastery: 0,
  earthMastery: 0
};

// Meta upgrades modifiers per level
const metaModifiers = {
  baseHp: (level) => level * 15,
  baseDamage: (level) => level * 2,
  baseSpeed: (level) => level * 8,
  baseFireRate: (level) => level * 0.08,
  baseCritChance: (level) => level * 0.02,
  basePierce: (level) => level * 1,
  baseBounce: (level) => level * 1,
  magnetism: (level) => level * 15
};

class StatManager {
  constructor() {
    this.perks = [];
  }

  addPerk(perk) {
    this.perks.push(perk);
  }

  getRandomPerks(count = 3, rerollCount = 0, ignoreMinLevel = false) {
    if (typeof getRandomPerks === 'function') {
      return getRandomPerks(count, this.perks, rerollCount, ignoreMinLevel);
    }
    return [];
  }

  // Calculate current stats by combining Base + Meta + Perks
  getCurrentStats() {
    // 1. Start with base
    let current = { ...baseStats };

    // 2. Apply Meta upgrades
    current.maxHp += metaModifiers.baseHp(Meta.getUpgradeLevel('baseHp'));
    current.damage += metaModifiers.baseDamage(Meta.getUpgradeLevel('baseDamage'));
    current.speed += metaModifiers.baseSpeed(Meta.getUpgradeLevel('baseSpeed'));
    current.fireRate += metaModifiers.baseFireRate(Meta.getUpgradeLevel('baseFireRate'));
    current.critChance += metaModifiers.baseCritChance(Meta.getUpgradeLevel('baseCritChance'));
    current.pickupRange += metaModifiers.magnetism(Meta.getUpgradeLevel('magnetism'));
    current.pierce += metaModifiers.basePierce(Meta.getUpgradeLevel('basePierce'));
    current.bounce += metaModifiers.baseBounce(Meta.getUpgradeLevel('baseBounce'));
    current.voidMastery = Meta.getUpgradeLevel('voidMastery');
    current.fireMastery = Meta.getUpgradeLevel('fireMastery');
    current.frostMastery = Meta.getUpgradeLevel('frostMastery');
    current.stormMastery = Meta.getUpgradeLevel('stormMastery');
    current.toxinMastery = Meta.getUpgradeLevel('toxinMastery');
    current.bloodMastery = Meta.getUpgradeLevel('bloodMastery');
    current.holyMastery = Meta.getUpgradeLevel('holyMastery');
    current.earthMastery = Meta.getUpgradeLevel('earthMastery');

    if (current.voidMastery > 0) {
        current.damage *= (1 + current.voidMastery * 0.04);
        current.maxHp += current.voidMastery * 8;
    }

    // Apply In-Game Level automatic scaling (Lv 1 -> Lv 35+ smooth ARPG duel curve)
    let inGameLevel = (typeof game !== 'undefined' && game && game.player) ? game.player.level : 1;
    let levelBonus = Math.max(0, inGameLevel - 1);

    current.maxHp += levelBonus * 5; // +5 Max Hull per in-run level
    current.damage *= (1 + levelBonus * 0.042 + Math.pow(levelBonus, 1.2) * 0.006);
    current.fireRate *= (1 + Math.min(0.32, levelBonus * 0.01));
    current.critChance += levelBonus * 0.005; // +0.5% Crit Chance per level
    current.critMultiplier += levelBonus * 0.01; // +1% Crit DMG per level
    current.speed += Math.min(24, levelBonus * 0.6);

    // 3. Apply In-Run Perks (Order-Independent Synergy Engine)
    current.specialEffects = {};
    
    // Group by ID to handle infinite scaling
    const perkCounts = {};
    for (const p of this.perks) {
        perkCounts[p.id] = (perkCounts[p.id] || 0) + 1;
    }

    const resolvedPerks = [];
    for (const [id, count] of Object.entries(perkCounts)) {
        const perkDef = typeof PerkPool !== 'undefined' ? PerkPool.find(p => p.id === id) : this.perks.find(p => p.id === id);
        if (perkDef) resolvedPerks.push({ perkDef, count });
    }
    resolvedPerks.sort((a, b) => {
        if (a.perkDef.id === 'speed_up' && b.perkDef.id !== 'speed_up') return -1;
        if (b.perkDef.id === 'speed_up' && a.perkDef.id !== 'speed_up') return 1;
        return a.perkDef.id.localeCompare(b.perkDef.id);
    });

    // Pass 1: Additive modifiers and specialEffects
    for (const { perkDef, count } of resolvedPerks) {
        if (perkDef.modifiers) {
            for (const [key, value] of Object.entries(perkDef.modifiers)) {
                if (typeof current[key] !== 'undefined') {
                    current[key] += value * count;
                }
            }
        }
        
        if (perkDef.specialEffect) {
            const type = perkDef.specialEffect.type;
            if (!current.specialEffects[type]) {
                current.specialEffects[type] = { level: 0, value: perkDef.specialEffect.value };
            }
            current.specialEffects[type].level += count;
        }
    }

    // Pass 2: Dynamic apply functions (so synergies see full additive modifiers regardless of pick order)
    for (const { perkDef, count } of resolvedPerks) {
        if (typeof perkDef.apply === 'function') {
            perkDef.apply(current, count, perkCounts, inGameLevel);
        }
    }

    // 4. Attributes, Modules, Frequency Shards & Phase Attenuation
    if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.applyAttributesAndModules === 'function' && typeof Meta !== 'undefined') {
        NeonSystems.applyAttributesAndModules(current, Meta, { extraRawAttenuation: (current.voidMastery || 0) * 5 });
    }

    // Pass 3: Stat-Transforming Perks, Proc-Chance Scaling & Keystones
    if (perkCounts.twin_link) {
        current.damage *= Math.pow(0.82, perkCounts.twin_link);
    }
    if (current.specialEffects.shotgun) {
        current.damage *= 0.65;
        current.projectileSpeed *= 0.88;
    }
    if (perkCounts.pierce_up) {
        current.damage *= Math.pow(0.94, perkCounts.pierce_up);
    }
    if (current.specialEffects.returnToSender) {
        current.damage *= 0.90;
    }
    const attrs = current.appliedAttributes || { destructivePower: 0, kineticCadence: 0, structuralVitality: 0, signalResonance: 0 };
    const srBonus = (current.attributeMilestones && current.attributeMilestones.sr50) ? 0.10 : 0;
    current.splitChance = perkCounts.split
        ? Math.min(0.68, 0.08 * perkCounts.split + 0.0075 * ((attrs.kineticCadence || 0) + (attrs.signalResonance || 0)) + srBonus)
        : 0;
    current.forkChance = perkCounts.fork
        ? Math.min(0.68, 0.10 + 0.09 * Math.max(0, perkCounts.fork - 1) + 0.0075 * ((attrs.kineticCadence || 0) + (attrs.signalResonance || 0)) + srBonus)
        : 0;
    current.rockShardChance = perkCounts.rock_shard
        ? Math.min(0.68, 0.10 + 0.09 * Math.max(0, perkCounts.rock_shard - 1) + 0.0075 * ((attrs.destructivePower || 0) + (attrs.signalResonance || 0)) + srBonus)
        : 0;
    const baseBounceLv = typeof Meta !== 'undefined' && Meta.getUpgradeLevel ? Meta.getUpgradeLevel('baseBounce') : 0;
    const bounceSources = (perkCounts.bounce_up || 0) + baseBounceLv + (current.signatureTraits && current.signatureTraits.chillOnHitSec ? 1 : 0);
    current.ricochetChance = current.bounce > 0
        ? Math.min(0.80, 0.12 + 0.10 * Math.max(0, bounceSources - 1) + 0.0075 * ((attrs.kineticCadence || 0) + (attrs.signalResonance || 0)) + (current.signatureTraits && current.signatureTraits.chillOnHitSec ? 0.25 : 0) + srBonus)
        : 0;
    if (current.specialEffects.echo) {
        current.fireRate *= 0.90;
    }
    if (current.specialEffects.sniper) {
        current.damage *= 1.5;
        current.projectileSpeed *= 2.0;
        current.fireRate *= 0.65;
        current.pierce += 4;
    }
    if (current.specialEffects.avatarOfFire) {
        current.damage *= (1.2 + (current.fireMastery || 0) * 0.1);
    }
    if (current.specialEffects.crimsonDance) {
        current.critChance += 0.15;
    }
    if (current.specialEffects.energyShield) {
        const aegisBase = 30 + Math.floor(current.maxHp * 0.25) * current.specialEffects.energyShield.level;
        const totalBarrier = aegisBase + (current.bonusEnergyShield || 0);
        current.damage *= 1 + Math.min(0.85, totalBarrier / 900);
        current.fireRate *= 1 + Math.min(0.45, totalBarrier / 1400);
    }
    if (current.specialEffects.chaosInoculation) {
        const convertedShield = 80 + Math.floor(current.maxHp * 1.5);
        const barrierMult = current.barrierMult !== undefined ? current.barrierMult : 1;
        current.bonusEnergyShield = Math.max(0, Math.floor((current.bonusEnergyShield || 0) + convertedShield * barrierMult));
        current.maxHp = 1;
    }
    if (current.specialEffects.glassCannon) {
        current.damage *= 2.5;
        current.maxHp = 1;
    }

    // v2.4 Hard Projectile Volley, Pierce & Bounce Caps (convert excess into damage)
    const MAX_VOLLEY_PROJECTILES = 4;
    const rawProjCount = Math.max(1, Math.floor(current.projectileCount || 1));
    if (rawProjCount > MAX_VOLLEY_PROJECTILES) {
        const excessProj = rawProjCount - MAX_VOLLEY_PROJECTILES;
        current.damage *= Math.pow(1.22, excessProj);
        current.projectileCount = MAX_VOLLEY_PROJECTILES;
    } else {
        current.projectileCount = rawProjCount;
    }
    const maxPierce = (current.specialEffects && current.specialEffects.sniper) ? 5 : 3;
    const rawPierce = Math.max(0, Math.floor(current.pierce || 0));
    const rawBounce = Math.max(0, Math.floor(current.bounce || 0));
    const excessPB = Math.max(0, rawPierce - maxPierce) + Math.max(0, rawBounce - 2);
    if (excessPB > 0) {
        current.damage *= Math.pow(1.14, excessPB);
    }
    current.pierce = Math.min(maxPierce, rawPierce);
    current.bounce = Math.min(2, rawBounce);

    // Clamp safe bounds
    current.damageMitigation = Math.min(0.52, Math.max(0, current.damageMitigation || 0));
    current.phaseEvasion = Math.min(0.26, Math.max(0, current.phaseEvasion || 0));
    current.critChance = Math.min(0.75, Math.max(0, current.critChance));
    current.critMultiplier = Math.min(3.5, Math.max(1.2, current.critMultiplier));
    current.fireRate = Math.min(20, Math.max(0.25, current.fireRate));
    current.projectileSpeed = Math.min(1500, Math.max(100, current.projectileSpeed));
    current.speed = Math.min(420, Math.max(80, current.speed));
    current.maxHp = (current.specialEffects.chaosInoculation || current.specialEffects.glassCannon)
        ? 1
        : Math.max(1, Math.floor(current.maxHp));

    return current;
  }
}
