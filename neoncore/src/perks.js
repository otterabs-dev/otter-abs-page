// src/perks.js

// Weights: Common=100, Rare=32, Keystone=3
const Rarity = {
  COMMON: 100,
  RARE: 32,
  KEYSTONE: 3
};

const PerkPool = [
  // --- BASE STATS (COMMON) ---
  { id: "hp_up", name: "Hull Integrity", description: "+14 Max Hull & +6% Base Hull (Scales per stack)", weight: Rarity.COMMON, minLevel: 1, reqGlobalLevel: 1, apply: (stats, count) => { stats.maxHp = Math.round((stats.maxHp + 14 * count) * (1 + 0.06 * count)); }, treeNode: { parent: "voidMastery", cost: 0 } },
  { id: "dmg_up", name: "Power Core", description: "+3 Base Dmg & +10% Total Output (Scales with Speed)", weight: Rarity.COMMON, minLevel: 1, reqGlobalLevel: 1, apply: (stats, count) => { stats.damage = (stats.damage + 3 * count + (stats.speed * 0.008 * count)) * (1 + 0.10 * count); }, treeNode: { parent: "voidMastery", cost: 0 } },
  { id: "speed_up", name: "Overclock", description: "+22 Speed & +5% Thruster Velocity", weight: Rarity.COMMON, minLevel: 1, reqGlobalLevel: 1, apply: (stats, count) => { stats.speed = (stats.speed + 22 * count) * (1 + 0.05 * count); }, treeNode: { parent: "voidMastery", cost: 0 } },
  { id: "fire_rate_up", name: "Rapid Fire", description: "+0.15 Base Fire Rate & +7% Cadence", weight: Rarity.COMMON, minLevel: 1, reqGlobalLevel: 1, apply: (stats, count) => { stats.fireRate = (stats.fireRate + 0.15 * count) * (1 + 0.07 * count); }, treeNode: { parent: "voidMastery", cost: 0 } },
  { id: "crit_chance_up", name: "Precision Strike", description: "+10% Crit Chance", weight: Rarity.COMMON, minLevel: 1, reqGlobalLevel: 1, modifiers: { critChance: 0.1 }, treeNode: { parent: "voidMastery", cost: 0 } },
  { id: "crit_dmg_up", name: "Lethal Force", description: "+50% Crit Damage Multiplier", weight: Rarity.COMMON, minLevel: 1, reqGlobalLevel: 1, modifiers: { critMultiplier: 0.5 }, treeNode: { parent: "voidMastery", cost: 0 } },
  { id: "heavy_ammo", name: "Heavy Ammo", description: "+10 Damage, -10% Projectile Speed, +Knockback", weight: Rarity.COMMON, minLevel: 2, reqGlobalLevel: 1, modifiers: { damage: 10, projectileSpeed: -30 }, specialEffect: { type: "knockback", value: 1 }, treeNode: { parent: "voidMastery", cost: 1 } },
  { id: "sniper", unique: true, name: "Sniper", description: "+50% Damage, +100% Proj Speed, -35% Fire Rate, +4 Pierce & Knockback (70% dmg per pierce)", weight: Rarity.COMMON, minLevel: 5, reqGlobalLevel: 5, modifiers: { }, specialEffect: { type: "sniper", value: 1 }, treeNode: { parent: "heavy_ammo", cost: 1 } },
  { id: "point_blank", unique: true, name: "Point Blank", description: "+50% Damage up close, drops off at range", weight: Rarity.COMMON, minLevel: 5, reqGlobalLevel: 5, specialEffect: { type: "pointBlank", value: 1 }, treeNode: { parent: "heavy_ammo", cost: 1 } },
  
  // --- PROJECTILES (RARE) ---
  { id: "twin_link", name: "Twin Link", description: "+1 Projectile per shot (-18% Projectile Damage per stack)", weight: Rarity.RARE, minLevel: 5, reqGlobalLevel: 1, modifiers: { projectileCount: 1 }, treeNode: { parent: "voidMastery", cost: 1 } },
  { id: "pierce_up", name: "Railgun", description: "+1 Pierce (-6% Base Damage; 80% dmg per pierced target)", weight: Rarity.RARE, minLevel: 5, reqGlobalLevel: 1, modifiers: { pierce: 1 }, treeNode: { parent: "voidMastery", cost: 1 } },
  { id: "bounce_up", name: "Ricochet", description: "+1 Bounce Capacity; 12% base (+10%/stack, +0.75%/Cadence or Resonance pt) Ricochet chance", weight: Rarity.RARE, minLevel: 5, reqGlobalLevel: 1, modifiers: { bounce: 1 }, treeNode: { parent: "voidMastery", cost: 1 } },
  { id: "fork", name: "Fork", description: "10% base (+9%/stack, +0.75%/Cadence or Resonance pt) chance to diverge into 2 bolts (42% dmg)", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 6, specialEffect: { type: "fork", value: 1 }, treeNode: { parent: "bounce_up", cost: 2 } },
  { id: "split", name: "Split", description: "8% base (+8%/stack, +0.75%/Cadence or Resonance pt) chance to split into 2 shards (32% dmg)", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 6, specialEffect: { type: "split", value: 1 }, treeNode: { parent: "twin_link", cost: 2 } },
  { id: "return", unique: true, name: "Boomerang", description: "+1 Pierce & shots return (65% return dmg, -10% Base Damage)", weight: Rarity.RARE, minLevel: 5, reqGlobalLevel: 5, modifiers: { pierce: 1 }, specialEffect: { type: "returnToSender", value: 1 }, treeNode: { parent: "pierce_up", cost: 2 } },
  { id: "homing", unique: true, worldHidden: true, vaultHint: "Inner Expanse SE Vault", name: "Homing", description: "Projectiles curve toward enemies", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 6, specialEffect: { type: "homing", value: 1 }, treeNode: { parent: "bounce_up", cost: 2 } },
  { id: "orbiting", unique: true, name: "Orbiting", description: "Spawns a permanent orbiting satellite", weight: Rarity.RARE, minLevel: 15, reqGlobalLevel: 14, specialEffect: { type: "orbiting", value: 1 }, treeNode: { parent: "homing", cost: 2 } },
  { id: "shotgun", unique: true, worldHidden: true, vaultHint: "Inner Expanse NE Vault", name: "Shotgun", description: "+3 Projectiles, wide spread, short range (-35% Projectile Damage)", weight: Rarity.RARE, minLevel: 5, reqGlobalLevel: 6, modifiers: { projectileCount: 3 }, specialEffect: { type: "shotgun", value: 1 }, treeNode: { parent: "twin_link", cost: 2 } },
  { id: "accelerant", unique: true, name: "Accelerant", description: "Projectiles speed up over time, gaining +1 Pierce", weight: Rarity.RARE, minLevel: 5, reqGlobalLevel: 5, modifiers: { pierce: 1 }, specialEffect: { type: "accelerant", value: 1 }, treeNode: { parent: "pierce_up", cost: 2 } },
  
  // --- ELEMENTAL: FIRE (RARE) ---
  { id: "ignite", name: "Ignite", description: "28% chance (guaranteed every 4th hit) to burn enemies (DoT)", weight: Rarity.RARE, minLevel: 2, reqGlobalLevel: 2, element: "fire", specialEffect: { type: "ignite", value: 1 }, treeNode: { parent: "fireMastery", cost: 1 } },
  { id: "combustion", unique: true, name: "Combustion", description: "Burning enemies explode on death, applying massive Burn to nearby enemies", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 9, element: "fire", specialEffect: { type: "combustion", value: 1 }, treeNode: { parent: "ignite", cost: 2 } },
  { id: "fire_trail", unique: true, name: "Fire Trail", description: "Projectiles leave a burning trail", weight: Rarity.RARE, minLevel: 5, reqGlobalLevel: 9, element: "fire", specialEffect: { type: "fireTrail", value: 1 }, treeNode: { parent: "ignite", cost: 2 } },
  { id: "flame_aura", unique: true, name: "Flame Aura", description: "Burn enemies near you constantly", weight: Rarity.RARE, minLevel: 15, reqGlobalLevel: 16, element: "fire", specialEffect: { type: "flameAura", value: 1 }, treeNode: { parent: "combustion", cost: 3 } },
  { id: "meteor", unique: true, worldHidden: true, vaultHint: "Deep Ember Rift Vault (N)", name: "Meteor Strike", description: "Every 10th shot calls a meteor", weight: Rarity.RARE, minLevel: 15, reqGlobalLevel: 16, element: "fire", specialEffect: { type: "meteor", value: 1 }, treeNode: { parent: "fire_trail", cost: 3 } },
  
  // --- ELEMENTAL: COLD (RARE) ---
  { id: "chill", name: "Chilled", description: "Hit enemies are slowed by 35%", weight: Rarity.RARE, minLevel: 2, reqGlobalLevel: 3, element: "frost", specialEffect: { type: "chill", value: 1 }, treeNode: { parent: "frostMastery", cost: 1 } },
  { id: "freeze", name: "Deep Freeze", description: "15% chance (guaranteed every 6th hit on chilled) to freeze for 2s", weight: Rarity.RARE, minLevel: 5, reqGlobalLevel: 9, element: "frost", specialEffect: { type: "freeze", value: 1 }, treeNode: { parent: "chill", cost: 1 } },
  { id: "shatter", unique: true, name: "Shatter", description: "Frozen enemies shoot piercing ice shards in all directions on death", weight: Rarity.RARE, minLevel: 15, reqGlobalLevel: 16, element: "frost", specialEffect: { type: "shatter", value: 1 }, treeNode: { parent: "freeze", cost: 2 } },
  { id: "frost_nova", unique: true, name: "Frost Nova", description: "Taking damage freezes nearby enemies (2s Cooldown)", weight: Rarity.RARE, minLevel: 5, reqGlobalLevel: 9, element: "frost", specialEffect: { type: "frostNova", value: 1 }, treeNode: { parent: "freeze", cost: 2 } },
  { id: "glacial_path", unique: true, worldHidden: true, vaultHint: "Deep Cryo Spire Vault (NE)", name: "Glacial Path", description: "Moving leaves ice that slows enemies", weight: Rarity.RARE, minLevel: 15, reqGlobalLevel: 16, element: "frost", specialEffect: { type: "glacialPath", value: 1 }, treeNode: { parent: "shatter", cost: 3 } },
  
  // --- ELEMENTAL: LIGHTNING (RARE) ---
  { id: "chain_lightning", unique: true, name: "Chain Lightning", description: "Projectiles zap nearby enemies on hit", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 9, element: "storm", specialEffect: { type: "chainLightning", value: 1 }, treeNode: { parent: "shock", cost: 1 } },
  { id: "shock", name: "Shock", description: "Hit enemies take 20% more damage from all sources", weight: Rarity.RARE, minLevel: 2, reqGlobalLevel: 4, element: "storm", specialEffect: { type: "shock", value: 1 }, treeNode: { parent: "stormMastery", cost: 1 } },
  { id: "thunderstrike", unique: true, name: "Thunderstrike", description: "Critical hits call down lightning", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 9, element: "storm", specialEffect: { type: "thunderstrike", value: 1 }, treeNode: { parent: "shock", cost: 2 } },
  { id: "conduit", unique: true, name: "Conduit", description: "Chain Lightning range +50% and +2 Chain targets", weight: Rarity.RARE, minLevel: 15, reqGlobalLevel: 16, element: "storm", specialEffect: { type: "conduit", value: 1 }, treeNode: { parent: "chain_lightning", cost: 2 } },
  { id: "lightning_dash", unique: true, worldHidden: true, vaultHint: "Deep Storm Conduit Vault (E)", name: "Static Charge", description: "Moving builds charge for a massive beam attack", weight: Rarity.RARE, minLevel: 15, reqGlobalLevel: 16, element: "storm", specialEffect: { type: "staticCharge", value: 1 }, treeNode: { parent: "thunderstrike", cost: 3 } },
  
  // --- CHAOS & UTILITY (RARE) ---
  { id: "poison_nova", name: "Toxic Nova", description: "Releases a poison nova periodically", weight: Rarity.RARE, minLevel: 2, reqGlobalLevel: 5, element: "toxin", specialEffect: { type: "poisonNova", value: 6 }, treeNode: { parent: "toxinMastery", cost: 1 } },
  { id: "plague", unique: true, name: "Plague", description: "Poison spreads on death", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 9, element: "toxin", specialEffect: { type: "plague", value: 1 }, treeNode: { parent: "poison_nova", cost: 2 } },
  { id: "acid_pool", unique: true, name: "Acid Pool", description: "Enemies drop acid pools on death", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 9, element: "toxin", specialEffect: { type: "acidPool", value: 1 }, treeNode: { parent: "poison_nova", cost: 2 } },
  { id: "culling_strike", unique: true, worldHidden: true, vaultHint: "Inner Expanse SW Vault", name: "Execute Threshold", description: "Instantly kill non-bosses below 10% HP", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 6, specialEffect: { type: "cullingStrike", value: 1 }, treeNode: { parent: "voidMastery", cost: 2 } },
  { id: "decay", unique: true, worldHidden: true, vaultHint: "Deep Blight Basin Vault (SE)", name: "Decay", description: "Enemies take damage based on how much they move", weight: Rarity.RARE, minLevel: 15, reqGlobalLevel: 16, element: "toxin", specialEffect: { type: "decay", value: 1 }, treeNode: { parent: "plague", cost: 2 } },
  { id: "vampirism", unique: true, name: "Vampiric Aura", description: "Heal 3% Max HP on Elite/Boss kill or 12% chance on normal kill", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 6, specialEffect: { type: "vampirism", value: 1 }, treeNode: { parent: "voidMastery", cost: 2 } },
  { id: "gravity_well", unique: true, name: "Gravity Well", description: "10% chance on kill (100% on Elite, 3s CD) to spawn a black hole", weight: Rarity.RARE, minLevel: 15, reqGlobalLevel: 14, specialEffect: { type: "blackHole", value: 1 }, treeNode: { parent: "vampirism", cost: 3 } },
  { id: "magnetism", unique: true, name: "Magnetism", description: "5% chance on XP pickup to gather all XP Orbs", weight: Rarity.RARE, minLevel: 2, reqGlobalLevel: 1, specialEffect: { type: "vacuum", value: 1 }, treeNode: { parent: "voidMastery", cost: 1 } },
  { id: "xp_burst", name: "Experience Burst", description: "XP Orbs give 20% more experience", weight: Rarity.RARE, minLevel: 4, reqGlobalLevel: 5, specialEffect: { type: "xpBurst", value: 1 }, treeNode: { parent: "magnetism", cost: 1 } },
  { id: "regen", unique: true, name: "Regenerative Plating", description: "Regenerate 2 HP + 2% Max HP every 3 seconds", weight: Rarity.RARE, minLevel: 2, reqGlobalLevel: 1, specialEffect: { type: "regen", value: 1 }, treeNode: { parent: "voidMastery", cost: 1 } },
  { id: "thorns", unique: true, name: "Thorns", description: "Reflect 5x damage taken to attackers", weight: Rarity.RARE, minLevel: 5, reqGlobalLevel: 5, specialEffect: { type: "thorns", value: 1 }, treeNode: { parent: "regen", cost: 1 } },
  
  // --- TRIGGERS (RARE) ---
  { id: "coc", unique: true, name: "Critical Protocol: Execute", description: "Crits fire a free extra shot", weight: Rarity.RARE, minLevel: 15, reqGlobalLevel: 14, specialEffect: { type: "castOnCrit", value: 1 }, treeNode: { parent: "voidMastery", cost: 3 } },
  { id: "cwdt", unique: true, name: "Emergency Protocol: Retaliate", description: "Taking damage fires a poison nova (2s Cooldown)", weight: Rarity.RARE, minLevel: 15, reqGlobalLevel: 14, specialEffect: { type: "castOnDamageTaken", value: 1 }, treeNode: { parent: "voidMastery", cost: 3 } },
  { id: "echo", unique: true, name: "Recoil Duplicator", description: "Shots repeat 0.5s later at 55% Damage (-10% Fire Rate)", weight: Rarity.RARE, minLevel: 15, reqGlobalLevel: 14, specialEffect: { type: "echo", value: 1 }, treeNode: { parent: "voidMastery", cost: 3 } },
  
  // --- DEFENSIVE (RARE) ---
  { id: "energy_shield", unique: true, worldHidden: true, vaultHint: "Inner Expanse NW Vault", name: "Aegis Matrix", description: "Gain a regenerating Aegis Shield (30 + 25% Max HP)", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 6, specialEffect: { type: "energyShield", value: 30 }, treeNode: { parent: "voidMastery", cost: 2 } },
  { id: "phasing", unique: true, name: "Quantum Slipstream", description: "Pass through enemies for 2s after taking damage", weight: Rarity.RARE, minLevel: 5, reqGlobalLevel: 9, specialEffect: { type: "phasing", value: 1 }, treeNode: { parent: "energy_shield", cost: 2 } },
  { id: "repulsion", unique: true, name: "Repulsion Field", description: "Periodically pushes nearby enemies away", weight: Rarity.RARE, minLevel: 5, reqGlobalLevel: 9, specialEffect: { type: "repulsion", value: 1 }, treeNode: { parent: "energy_shield", cost: 2 } },
  
  // --- ELEMENTAL: BLOOD (RARE) ---
  { id: "hemomancy", name: "Hemomancy", description: "+4% Lifesteal chance on hit", weight: Rarity.RARE, minLevel: 2, reqGlobalLevel: 6, element: "blood", modifiers: { lifesteal: 0.04 }, treeNode: { parent: "bloodMastery", cost: 1 } },
  { id: "blood_nova", unique: true, name: "Blood Nova", description: "Taking damage unleashes a wave of blood stealing life (2s Cooldown)", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 11, element: "blood", specialEffect: { type: "bloodNova", value: 1 }, treeNode: { parent: "hemomancy", cost: 2 } },
  { id: "corpse_explosion", unique: true, worldHidden: true, vaultHint: "Deep Crimson Altar Vault (SW)", name: "Corpse Explosion", description: "Enemies explode for 15% of their Max HP as physical damage on death", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 11, element: "blood", specialEffect: { type: "corpseExplosion", value: 1 }, treeNode: { parent: "hemomancy", cost: 2 } },

  // --- ELEMENTAL: HOLY (RARE) ---
  { id: "smite", name: "Smite", description: "20% chance on hit to call down a holy beam", weight: Rarity.RARE, minLevel: 2, reqGlobalLevel: 7, element: "holy", specialEffect: { type: "smite", value: 1 }, treeNode: { parent: "holyMastery", cost: 1 } },
  { id: "consecration", unique: true, name: "Consecrated Ground", description: "Periodically create an aura that heals you and burns enemies", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 11, element: "holy", specialEffect: { type: "consecration", value: 1 }, treeNode: { parent: "smite", cost: 2 } },
  { id: "divine_shield", unique: true, worldHidden: true, vaultHint: "Deep Astral Choir Vault (W)", name: "Divine Shield", description: "Ignore the first instance of damage every 20s", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 11, element: "holy", specialEffect: { type: "divineShield", value: 1 }, treeNode: { parent: "smite", cost: 2 } },

  // --- ELEMENTAL: EARTH (RARE) ---
  { id: "rock_shard", name: "Rock Shards", description: "10% base (+9%/stack, +0.75%/Power or Resonance pt) chance to burst into 3 shrapnel (30% dmg)", weight: Rarity.RARE, minLevel: 2, reqGlobalLevel: 8, element: "earth", specialEffect: { type: "rockShard", value: 1 }, treeNode: { parent: "earthMastery", cost: 1 } },
  { id: "earthquake", unique: true, name: "Earthquake", description: "Periodically cause a quake that stuns nearby enemies", weight: Rarity.RARE, minLevel: 10, reqGlobalLevel: 11, element: "earth", specialEffect: { type: "earthquake", value: 1 }, treeNode: { parent: "rock_shard", cost: 2 } },
  { id: "petrify", unique: true, worldHidden: true, vaultHint: "Deep Tectonic Vault (NW)", name: "Petrify", description: "16% chance to turn enemies to stone (stun & +50% dmg taken)", weight: Rarity.RARE, minLevel: 15, reqGlobalLevel: 16, element: "earth", specialEffect: { type: "petrify", value: 1 }, treeNode: { parent: "earthquake", cost: 3 } },
  
  // --- KEYSTONES (EXTREMELY RARE) ---
  { id: "glass_cannon", unique: true, worldHidden: true, vaultHint: "NW Outer Rim Vault", name: "Overclocked Core (Keystone)", description: "+150% Damage, Max HP becomes 1", weight: Rarity.KEYSTONE, minLevel: 15, reqGlobalLevel: 20, isKeystone: true, specialEffect: { type: "glassCannon", value: 1 }, treeNode: { parent: "echo", cost: 5 } },
  { id: "ancestral_bond", unique: true, worldHidden: true, vaultHint: "Far South Outer Rim Vault", name: "Autonomous Architect (Keystone)", description: "You cannot shoot. Spawns 2 autonomous turrets", weight: Rarity.KEYSTONE, minLevel: 15, reqGlobalLevel: 20, isKeystone: true, specialEffect: { type: "ancestralBond", value: 1 }, treeNode: { parent: "split", cost: 5 } },
  { id: "chaos_inoculation", unique: true, worldHidden: true, vaultHint: "SE Outer Rim Vault", name: "Synthetic Singularity (Keystone)", description: "Immune to Poison/Acid. Max HP becomes 1. Converts HP into massive Energy Shield", weight: Rarity.KEYSTONE, minLevel: 15, reqGlobalLevel: 22, element: "toxin", isKeystone: true, specialEffect: { type: "chaosInoculation", value: 1 }, treeNode: { parent: "decay", cost: 5 } },
  { id: "avatar_of_fire", unique: true, worldHidden: true, vaultHint: "NE Outer Rim Vault", name: "Absolute Ignition (Keystone)", description: "100% Damage converted to Fire. Always ignite. No other damage types.", weight: Rarity.KEYSTONE, minLevel: 15, reqGlobalLevel: 22, element: "fire", isKeystone: true, specialEffect: { type: "avatarOfFire", value: 1 }, treeNode: { parent: "flame_aura", cost: 5 } },
  { id: "crimson_dance", unique: true, worldHidden: true, vaultHint: "SW Outer Rim Vault", name: "Hemorrhaging Nanobots (Keystone)", description: "+15% Crit Chance. Crits deal no extra hit damage but inflict heavy stacking Bleed", weight: Rarity.KEYSTONE, minLevel: 15, reqGlobalLevel: 22, element: "blood", isKeystone: true, specialEffect: { type: "crimsonDance", value: 1 }, treeNode: { parent: "blood_nova", cost: 5 } },
];

const CORE_CALIBRATION_IDS = [
  "hp_up", "dmg_up", "speed_up", "fire_rate_up",
  "crit_chance_up", "crit_dmg_up", "heavy_ammo",
  "regen", "magnetism", "xp_burst"
];

const MULTI_HIT_PERKS = ["split", "fork", "rock_shard"];
const MAX_PERK_STACKS = {
  twin_link: 2,
  bounce_up: 3,
  pierce_up: 3,
  poison_nova: 3,
  split: 3,
  fork: 3,
  rock_shard: 3
};
if (typeof globalThis !== 'undefined') {
  globalThis.CORE_CALIBRATION_IDS = CORE_CALIBRATION_IDS;
  globalThis.MULTI_HIT_PERKS = MULTI_HIT_PERKS;
}

function getRandomPerks(count, currentPerks = [], rerollCount = 0, ignoreMinLevel = false) {
  const choices = [];
  const playerLevel = (typeof game !== 'undefined' && game && game.player) ? game.player.level : 1;
  const isBonusPerk = Boolean(ignoreMinLevel || (typeof game !== 'undefined' && game && game.lastLevelWasBonusPerk));
  const isMilestoneLevel = playerLevel >= 5 && playerLevel % 5 === 0;

  // Filter available perks by Meta Tree unlock, Element Boss defeat, and Map Vault discovery
  let available = PerkPool.filter(p => {
    if (!Meta.isPerkUnlocked(p.id)) return false;
    if (p.element && p.element !== 'void' && typeof Meta.isSectorConquered === 'function' && !Meta.isSectorConquered(p.element)) return false;
    if (p.worldHidden && typeof Meta.isMapPerkFound === 'function' && !Meta.isMapPerkFound(p.id)) return false;
    return true;
  });

  // Filter by in-run player level (or disallow keystones when ignoring minLevel for starter/bonus perks)
  if (!ignoreMinLevel) {
    available = available.filter(p => (p.minLevel || 1) <= playerLevel);
  } else {
    available = available.filter(p => !p.isKeystone);
  }

  // Filter out unique perks and maxed-out stackable perks
  available = available.filter(p => {
    const ownedCount = currentPerks.reduce((sum, cp) => sum + (cp.id === p.id ? 1 : 0), 0);
    if (p.unique && ownedCount > 0) return false;
    if (MAX_PERK_STACKS[p.id] !== undefined && ownedCount >= MAX_PERK_STACKS[p.id]) return false;
    return true;
  });

  // Synergy Engine & Mutually Exclusive Logic
  const hasBloodNova = currentPerks.some(cp => cp.id === "blood_nova");
  const hasEnergyShield = currentPerks.some(cp => cp.id === "energy_shield");
  const hasOneHpKeystone = currentPerks.some(cp => cp.id === "glass_cannon" || cp.id === "chaos_inoculation");
  const hasMultiHitPerk = currentPerks.some(cp => MULTI_HIT_PERKS.includes(cp.id));

  if (hasBloodNova) {
    available = available.filter(p => p.id !== "energy_shield" && p.id !== "phasing");
  }
  if (hasEnergyShield) {
    available = available.filter(p => p.id !== "blood_nova" && p.id !== "hemomancy");
  }
  if (hasOneHpKeystone) {
    available = available.filter(p => !["hp_up", "regen", "vampirism", "hemomancy", "blood_nova"].includes(p.id));
  }
  if (hasMultiHitPerk) {
    available = available.filter(p => !MULTI_HIT_PERKS.includes(p.id));
  }

  // v2.3 5-Level Special Perk Milestone Cadence + Anti-Snowball Pacing:
  // - Standard level-ups (not divisible by 5 and not Bonus/Ad starter perks) offer Core Calibrations only.
  // - Every 5th level (5, 10, 15, 20...) guarantees 1 Special/Elemental pick (2 at Lv 15+) paired with Core Calibrations.
  if (!isBonusPerk && !isMilestoneLevel) {
    const coreOnly = available.filter(p => CORE_CALIBRATION_IDS.includes(p.id));
    if (coreOnly.length > 0) {
      available = coreOnly;
    }
  }

  // Check if player has any Keystone
  const hasKeystone = currentPerks.some(p => p.isKeystone);

  const computePerkWeight = (perk) => {
    let w = perk.weight;
    if (perk.isKeystone && hasKeystone) {
      w *= 0.1;
    }
    if (perk.element) {
      const masteryLevel = Meta.getUpgradeLevel(perk.element + 'Mastery');
      if (masteryLevel > 0) {
        w *= (1 + Math.min(1.5, masteryLevel * 0.30));
      } else {
        w *= 0.5;
      }
    }
    if (rerollCount > 2 && perk.minLevel > 1) {
      w *= Math.pow(0.8, rerollCount - 2);
    }
    return w;
  };

  const drawFromPool = (pool) => {
    if (!pool || pool.length === 0) return null;
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) {
      return pool.splice(0, 1)[0].perk;
    }
    let randomVal = Math.random() * totalWeight;
    for (let j = 0; j < pool.length; j++) {
      randomVal -= pool[j].weight;
      if (randomVal <= 0) {
        const picked = pool[j].perk;
        pool.splice(j, 1);
        return picked;
      }
    }
    return pool.splice(pool.length - 1, 1)[0].perk;
  };

  if (isMilestoneLevel && !ignoreMinLevel) {
    const specialPool = [];
    const corePool = [];
    for (const perk of available) {
      const entry = { perk, weight: computePerkWeight(perk) };
      if (CORE_CALIBRATION_IDS.includes(perk.id)) {
        corePool.push(entry);
      } else {
        specialPool.push(entry);
      }
    }
    const specialQuota = count > 3
      ? specialPool.length
      : Math.min(specialPool.length, playerLevel >= 15 ? Math.min(2, count) : 1);

    for (let s = 0; s < specialQuota && choices.length < count; s++) {
      const picked = drawFromPool(specialPool);
      if (picked) choices.push(picked);
    }
    while (choices.length < count) {
      const picked = drawFromPool(corePool) || drawFromPool(specialPool);
      if (!picked) break;
      choices.push(picked);
    }
    return choices;
  }

  // Standard / Bonus rolls
  const weightedPool = available.map(perk => ({ perk, weight: computePerkWeight(perk) }));
  for (let i = 0; i < count; i++) {
    const picked = drawFromPool(weightedPool);
    if (!picked) break;
    choices.push(picked);
  }

  return choices;
}
