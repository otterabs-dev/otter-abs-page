// src/systems.js
// Core ARPG math, attributes, modules, shards, phases, contracts, and descent systems for NeonCore v2.0.

const NeonSystems = (() => {
  'use strict';

  const MAX_MODULE_INVENTORY = 36;

  const ATTRIBUTE_DEFS = {
    destructivePower: {
      id: 'destructivePower',
      name: 'Destructive Power',
      desc: 'Amplifies base output and knockback impulse.'
    },
    kineticCadence: {
      id: 'kineticCadence',
      name: 'Kinetic Cadence',
      desc: 'Improves fire cadence, vector speed, and Phase Evasion.'
    },
    structuralVitality: {
      id: 'structuralVitality',
      name: 'Structural Vitality',
      desc: 'Reinforces Max Hull, Barrier capacity, and Attenuation Rating.'
    },
    signalResonance: {
      id: 'signalResonance',
      name: 'Signal Resonance',
      desc: 'Boosts Discovery Multiplier, Critical Frequency, and Matter yield.'
    }
  };

  const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTE_DEFS);

  const MODULE_SLOTS = {
    emitter: 'Pulse Emitter',
    lens: 'Vector Lens',
    shell: 'Aegis Shell',
    relay: 'Singularity Relay'
  };

  const SLOT_KEYS = Object.keys(MODULE_SLOTS);

  const ALL_EQUIPMENT_SLOTS = {
    emitter: 'Pulse Emitter',
    lens: 'Vector Lens',
    shell: 'Aegis Shell',
    relay: 'Singularity Relay',
    auxiliary: 'Auxiliary Core',
    relic: 'Apex Relic'
  };

  const ALL_SLOT_KEYS = Object.keys(ALL_EQUIPMENT_SLOTS);

  const MODULE_QUALITIES = {
    standard: {
      id: 'standard',
      name: 'Standard',
      propCount: 1,
      socketCount: 0,
      color: '#aaddff',
      salvageMatter: 10
    },
    refined: {
      id: 'refined',
      name: 'Refined',
      propCount: 2,
      socketCount: 1,
      color: '#00eeff',
      salvageMatter: 20
    },
    harmonic: {
      id: 'harmonic',
      name: 'Harmonic',
      propCount: 3,
      socketCount: 2,
      color: '#ffd700',
      salvageMatter: 35
    },
    signature: {
      id: 'signature',
      name: 'Signature',
      propCount: 2,
      socketCount: 2,
      color: '#ff6622',
      salvageMatter: 50
    },
    mythic: {
      id: 'mythic',
      name: 'Mythic Relic',
      propCount: 3,
      socketCount: 2,
      color: '#ffcc33',
      salvageMatter: 140
    }
  };

  const MODULE_PROPERTIES = {
    powerOutput: {
      id: 'powerOutput',
      name: 'Power Output',
      min: 0.06,
      max: 0.28,
      decimals: 3,
      isPercent: true,
      statLabel: 'Damage Output'
    },
    fireCadence: {
      id: 'fireCadence',
      name: 'Fire Cadence',
      min: 0.05,
      max: 0.22,
      decimals: 3,
      isPercent: true,
      statLabel: 'Fire Cadence'
    },
    vectorVelocity: {
      id: 'vectorVelocity',
      name: 'Vector Velocity',
      min: 18,
      max: 85,
      decimals: 0,
      isPercent: false,
      statLabel: 'Projectile Speed'
    },
    hullCapacity: {
      id: 'hullCapacity',
      name: 'Hull Capacity',
      min: 18,
      max: 95,
      decimals: 0,
      isPercent: false,
      statLabel: 'Max Hull'
    },
    barrierCapacity: {
      id: 'barrierCapacity',
      name: 'Barrier Capacity',
      min: 16,
      max: 85,
      decimals: 0,
      isPercent: false,
      statLabel: 'Max Barrier'
    },
    attenuationRating: {
      id: 'attenuationRating',
      name: 'Attenuation Rating',
      min: 12,
      max: 65,
      decimals: 0,
      isPercent: false,
      statLabel: 'Attenuation'
    },
    critFrequency: {
      id: 'critFrequency',
      name: 'Critical Frequency',
      min: 0.03,
      max: 0.14,
      decimals: 3,
      isPercent: true,
      statLabel: 'Crit Frequency'
    },
    vitalSiphon: {
      id: 'vitalSiphon',
      name: 'Vital Siphon',
      min: 1,
      max: 4,
      decimals: 0,
      isPercent: false,
      statLabel: 'Hull / Kill'
    },
    signalGain: {
      id: 'signalGain',
      name: 'Signal Gain',
      min: 12,
      max: 45,
      secondaryMin: 0.08,
      secondaryMax: 0.25,
      decimals: 0,
      secondaryDecimals: 3,
      isPercent: false,
      statLabel: 'Pickup Range / Discovery'
    },
    thrusterDrift: {
      id: 'thrusterDrift',
      name: 'Thruster Drift',
      min: 8,
      max: 32,
      decimals: 0,
      isPercent: false,
      statLabel: 'Move Speed'
    }
  };

  const PROPERTY_KEYS = Object.keys(MODULE_PROPERTIES);

  const SLOT_IMPLICITS = {
    emitter: { key: 'damageFlat', values: [3, 6, 11, 18], format: v => `+${v} Base Weapon Damage` },
    lens: { key: 'critMultBonus', values: [0.12, 0.22, 0.35, 0.50], secondaryKey: 'projSpeedFlat', secondaryValues: [18, 34, 52, 75], format: (v, sv) => `+${Math.round(v * 100)}% Crit Dmg, +${sv} Velocity` },
    shell: { key: 'maxHpFlat', values: [20, 42, 72, 110], secondaryKey: 'attenuationFlat', secondaryValues: [8, 15, 24, 36], format: (v, sv) => `+${v} Max Hull, +${sv} Attenuation` },
    relay: { key: 'allElemBonus', values: [0.05, 0.10, 0.16, 0.24], secondaryKey: 'fireCadencePct', secondaryValues: [0.04, 0.07, 0.11, 0.16], format: (v, sv) => `+${Math.round(v * 100)}% Elem Dmg, +${Math.round(sv * 100)}% Cadence` }
  };

  const SLOT_PROPERTY_BIAS = {
    emitter: ['powerOutput', 'fireCadence', 'critFrequency', 'vitalSiphon'],
    lens: ['critFrequency', 'vectorVelocity', 'powerOutput', 'fireCadence'],
    shell: ['hullCapacity', 'barrierCapacity', 'attenuationRating', 'thrusterDrift'],
    relay: ['fireCadence', 'signalGain', 'vitalSiphon', 'barrierCapacity']
  };

  const SYNERGY_AFFIX_DEFS = {
    vs_burning: { id: 'vs_burning', min: 0.25, max: 0.48, decimals: 2, format: v => `+${Math.round(v * 100)}% Dmg vs Burning Targets` },
    vs_chilled: { id: 'vs_chilled', min: 0.25, max: 0.48, decimals: 2, format: v => `+${Math.round(v * 100)}% Dmg vs Chilled or Frozen Targets` },
    vs_tox_shock: { id: 'vs_tox_shock', min: 0.25, max: 0.48, decimals: 2, format: v => `+${Math.round(v * 100)}% Dmg vs Poisoned or Shocked Targets` },
    elite_slayer: { id: 'elite_slayer', min: 0.22, max: 0.42, decimals: 2, format: v => `+${Math.round(v * 100)}% Dmg vs Elites & Bosses` },
    kill_haste: { id: 'kill_haste', min: 0.18, max: 0.28, decimals: 2, format: v => `Kills grant +${Math.round(v * 100)}% Fire Cadence (2.5s)` },
    kinetic_nova: { id: 'kinetic_nova', min: 8, max: 8, decimals: 0, format: () => 'Every 8th Hit releases an 85px Pulse (55% Dmg)' }
  };

  const SYNERGY_AFFIX_KEYS = Object.keys(SYNERGY_AFFIX_DEFS);

  const ATTRIBUTE_MILESTONES = {
    destructivePower: [
      { threshold: 15, key: 'dp15', label: '+15% Dmg vs Elites & Bosses' },
      { threshold: 30, key: 'dp30', label: '+25% Pulse & Blast Radius' },
      { threshold: 50, key: 'dp50', label: 'Ignore 25% Enemy Resist & Shield' }
    ],
    kineticCadence: [
      { threshold: 15, key: 'kc15', label: 'Up to +12% Fire Cadence while Moving' },
      { threshold: 30, key: 'kc30', label: '+30% Speed Burst (1.8s) on Hit Taken' },
      { threshold: 50, key: 'kc50', label: 'Every 5th Shot fires a Bonus Rapid Bolt' }
    ],
    structuralVitality: [
      { threshold: 15, key: 'sv15', label: 'Regenerate 0.5% Max Hull/sec' },
      { threshold: 30, key: 'sv30', label: '+30% Lifesteal & Vital Siphon' },
      { threshold: 50, key: 'sv50', label: 'Save lethal hit once/run at 25% Hull' }
    ],
    signalResonance: [
      { threshold: 15, key: 'sr15', label: '+30% Elemental Status & DoT Duration' },
      { threshold: 30, key: 'sr30', label: 'Crits 18% chance to drop +2 Matter' },
      { threshold: 50, key: 'sr50', label: '+10% Bonus Split, Fork & Ricochet Chance' }
    ]
  };

  const SIGNATURE_CATALOG = {
    sig_fire_core: {
      id: 'sig_fire_core',
      name: 'Pyroclast Core',
      slot: 'emitter',
      bossElement: 'fire',
      positiveText: '+45% Burn Multiplier',
      tradeoffText: '-12% Fire Rate',
      effects: { burnDamageMultBonus: 0.45, fireRateMult: 0.88 }
    },
    sig_frost_lens: {
      id: 'sig_frost_lens',
      name: 'Cryo Refraction Lens',
      slot: 'lens',
      bossElement: 'frost',
      positiveText: '+1 Bounce & Chills Hit Enemies (1.2s)',
      tradeoffText: '-12% Projectile Speed',
      effects: { bounceBonus: 1, chillOnHitSec: 1.2, projSpeedMult: 0.88 }
    },
    sig_storm_relay: {
      id: 'sig_storm_relay',
      name: 'Tempest Arc Relay',
      slot: 'relay',
      bossElement: 'storm',
      positiveText: 'Every 6th Shot Arcs to 2 Enemies (65% Dmg)',
      tradeoffText: '-10% Base Damage Mult',
      effects: { stormArcEvery: 6, stormArcTargets: 2, stormArcDmgFactor: 0.65, damageMult: 0.90 }
    },
    sig_toxin_shell: {
      id: 'sig_toxin_shell',
      name: 'Bio-Lattice Shell',
      slot: 'shell',
      bossElement: 'toxin',
      positiveText: '-60% Poison/Hazard Damage & +45 Barrier',
      tradeoffText: '-15% Max Hull',
      effects: { hazardResistBonus: 0.60, barrierBonus: 45, maxHpMult: 0.85 }
    },
    sig_blood_emitter: {
      id: 'sig_blood_emitter',
      name: 'Crimson Overdrive Emitter',
      slot: 'emitter',
      bossElement: 'blood',
      positiveText: '+28% Damage Below 65% Hull & +2 Vital Siphon',
      tradeoffText: '-20% Max Barrier',
      effects: { lowHullDmgBonus: 0.28, lowHullThreshold: 0.65, vitalSiphonBonus: 2, barrierMult: 0.80 }
    },
    sig_holy_shell: {
      id: 'sig_holy_shell',
      name: 'Astral Bastion Shell',
      slot: 'shell',
      bossElement: 'holy',
      positiveText: '+35 Attenuation Rating & +35% Barrier Recharge Speed',
      tradeoffText: '-10% Movement Speed',
      effects: { attenuationBonus: 35, shieldRechargeBonus: 0.35, moveSpeedMult: 0.90 }
    },
    sig_earth_lens: {
      id: 'sig_earth_lens',
      name: 'Tectonic Mass Lens',
      slot: 'lens',
      bossElement: 'earth',
      positiveText: '+1 Pierce & +35% Knockback',
      tradeoffText: '-12% Fire Rate',
      effects: { pierceBonus: 1, knockbackBonus: 0.35, fireRateMult: 0.88 }
    },
    sig_architect_prism: {
      id: 'sig_architect_prism',
      name: 'Singularity Convergence Lens',
      slot: 'lens',
      bossElement: 'architect',
      positiveText: '+1 Projectile',
      tradeoffText: '-18% Per-Projectile Damage Factor',
      effects: { projectileCountBonus: 1, damageMult: 0.82, perProjectileFactor: 0.82 }
    },
    sig_architect_relay: {
      id: 'sig_architect_relay',
      name: 'Harmonic Equilibrium Relay',
      slot: 'relay',
      bossElement: 'architect',
      positiveText: '+8 to All 4 Attributes',
      tradeoffText: '-10% Max Hull',
      effects: { allAttributesBonus: 8, maxHpMult: 0.90 }
    }
  };

  const APEX_RELIC_CATALOG = {
    relic_aegis_starforge: {
      id: 'relic_aegis_starforge',
      name: 'Aegis Starforge Core',
      slot: 'relic',
      poiId: 'mythic_vault_north',
      positiveText: 'Every 4th Shot Fires a Piercing Solar Lance (+145% Dmg) & +45 Attenuation',
      tradeoffText: '-8% Movement Speed',
      effects: {
        starforgeLanceEvery: 4,
        starforgeLanceDmgMult: 1.45,
        attenuationBonus: 45,
        moveSpeedMult: 0.92
      }
    },
    relic_chrono_singularity: {
      id: 'relic_chrono_singularity',
      name: 'Chrono-Singularity Heart',
      slot: 'relic',
      poiId: 'mythic_vault_sw',
      positiveText: 'Periodic Stagger & Chill Pulse (220px every 4.5s) & +18% Fire Cadence',
      tradeoffText: '-10% Max Hull',
      effects: {
        chronoPulseInterval: 4.5,
        chronoPulseRadius: 220,
        fireRateMult: 1.18,
        maxHpMult: 0.90
      }
    },
    relic_void_harvester: {
      id: 'relic_void_harvester',
      name: 'Void Harvester Engine',
      slot: 'relic',
      poiId: 'mythic_vault_se',
      positiveText: '+28% Matter Yield, +35% Discovery, Kill Plasma Surge & +6 All Attributes',
      tradeoffText: '-15% Max Barrier',
      effects: {
        matterMultBonus: 0.28,
        discoveryBonus: 0.35,
        harvesterSurgeDmg: 0.35,
        allAttributesBonus: 6,
        barrierMult: 0.85
      }
    }
  };

  const SHARD_ELEMENTS = ['fire', 'frost', 'storm', 'toxin', 'blood', 'holy', 'earth'];

  const SHARD_TIER_BONUSES = {
    1: { elemDamage: 0.07, attenuation: 7 },
    2: { elemDamage: 0.13, attenuation: 14 }
  };

  const HARMONIC_SEQUENCES = {
    'fire+storm': {
      id: 'fire+storm',
      name: 'Plasma Surge',
      elements: ['fire', 'storm'],
      bonus: 0.10,
      desc: '+10% Fire & Storm Damage, +10% Output Synergy'
    },
    'frost+earth': {
      id: 'frost+earth',
      name: 'Crystalline Bastion',
      elements: ['frost', 'earth'],
      bonus: 0.10,
      desc: '+10% Frost & Earth Damage, +10% Barrier Recharge & +15 Attenuation'
    },
    'blood+toxin': {
      id: 'blood+toxin',
      name: 'Bio-Siphon',
      elements: ['blood', 'toxin'],
      bonus: 0.10,
      desc: '+10% Blood & Toxin Damage, +10% Siphon Synergy'
    },
    'holy+fire': {
      id: 'holy+fire',
      name: 'Solar Equilibrium',
      elements: ['holy', 'fire'],
      bonus: 0.10,
      desc: '+10% Holy & Fire Damage, +10% Discovery & Burn Synergy'
    }
  };

  const WORLD_PHASES = {
    1: {
      phase: 1,
      name: 'Phase I: Harmonic',
      hpMult: 1.0,
      dmgMult: 1.0,
      attenuationPenalty: 0,
      rewardMult: 1.0,
      eliteMods: 0
    },
    2: {
      phase: 2,
      name: 'Phase II: Overclocked',
      hpMult: 2.0,
      dmgMult: 1.35,
      attenuationPenalty: 25,
      rewardMult: 1.55,
      eliteMods: 1
    },
    3: {
      phase: 3,
      name: 'Phase III: Critical',
      hpMult: 3.8,
      dmgMult: 1.7,
      attenuationPenalty: 55,
      rewardMult: 2.25,
      eliteMods: 2
    },
    4: {
      phase: 4,
      name: 'Phase IV: Singularity',
      hpMult: 6.0,
      dmgMult: 2.1,
      attenuationPenalty: 75,
      rewardMult: 3.0,
      eliteMods: 2
    }
  };

  const ELITE_MODIFIER_DEFS = {
    thermal_nova: { id: 'thermal_nova', name: 'Thermal Nova', color: '#ff5522' },
    phase_blink: { id: 'phase_blink', name: 'Phase Blink', color: '#aa66ff' },
    barrier_matrix: { id: 'barrier_matrix', name: 'Barrier Matrix', color: '#00ddff' },
    gravity_tether: { id: 'gravity_tether', name: 'Gravity Tether', color: '#ff44cc' },
    siphon_field: { id: 'siphon_field', name: 'Siphon Field', color: '#ff2255' },
    split_lattice: { id: 'split_lattice', name: 'Split Lattice', color: '#66ff88' }
  };

  const FRACTURE_KEY_DEFS = {
    dense_lattice: {
      id: 'dense_lattice',
      name: 'Dense Lattice Key',
      desc: '+45% Pack Density, +30% Discovery, +25% Matter Yield.',
      packMult: 1.45,
      eliteMult: 1.15,
      hazardRateMult: 1.0,
      discoveryBonus: 0.30,
      matterBonus: 0.25,
      guaranteedBossHarmonic: false
    },
    twin_wardens: {
      id: 'twin_wardens',
      name: 'Twin Wardens Key',
      desc: '+85% Elite Presence, +35% Matter Yield, Guaranteed Harmonic Boss Drop.',
      packMult: 1.15,
      eliteMult: 1.85,
      hazardRateMult: 1.15,
      discoveryBonus: 0.20,
      matterBonus: 0.35,
      guaranteedBossHarmonic: true
    },
    volatile_flux: {
      id: 'volatile_flux',
      name: 'Volatile Flux Key',
      desc: '+75% Hazard Rate, +55% Discovery, +45% Matter Yield, Guaranteed Harmonic Boss Drop.',
      packMult: 1.25,
      eliteMult: 1.35,
      hazardRateMult: 1.75,
      discoveryBonus: 0.55,
      matterBonus: 0.45,
      guaranteedBossHarmonic: true
    }
  };

  const CONTRACT_TYPES = ['kill_sector', 'clear_shrines', 'defeat_boss', 'reach_depth', 'collect_vault'];
  const FRACTURE_KEY_IDS = Object.keys(FRACTURE_KEY_DEFS);

  const SECTOR_LABELS = {
    fire: 'Ember Rift',
    frost: 'Cryo Spire',
    storm: 'Storm Conduit',
    toxin: 'Blight Basin',
    blood: 'Crimson Altar',
    holy: 'Astral Choir',
    earth: 'Tectonic Vault'
  };

  const TIER_BANDS = {
    1: [0.00, 0.35],
    2: [0.25, 0.60],
    3: [0.50, 0.82],
    4: [0.72, 1.00]
  };

  const QUALITY_NAME_PREFIXES = {
    standard: ['Basic', 'Linear', 'Direct', 'Compact'],
    refined: ['Tuned', 'Aligned', 'Focused', 'Calibrated'],
    harmonic: ['Harmonic', 'Resonant', 'Apex', 'Coherent'],
    signature: ['Singular']
  };

  const SLOT_SHORT_NOUNS = {
    emitter: 'Emitter',
    lens: 'Lens',
    shell: 'Shell',
    relay: 'Relay'
  };

  let _uidCounter = 0;

  function _hyp(x, k, maxVal) {
    if (!(x > 0) || !(k > 0)) return 0;
    return maxVal * (x / (x + k));
  }

  function _clampInt(val, min, max, fallback) {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
  }

  function _roundTo(val, decimals) {
    if (!decimals) return Math.round(val);
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
  }

  function _nextUid(prefix, rng) {
    _uidCounter += 1;
    const randPart = Math.floor((rng || Math.random)() * 0xffffff).toString(36);
    return `${prefix}_${_uidCounter.toString(36)}_${randPart}`;
  }

  function _pickRandom(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function _resolveMeta(metaObj) {
    if (!metaObj || typeof metaObj !== 'object') return null;
    const state = (metaObj.data && typeof metaObj.data === 'object') ? metaObj.data : metaObj;
    if (!state.spentAttributes || typeof state.spentAttributes !== 'object') {
      state.spentAttributes = { destructivePower: 0, kineticCadence: 0, structuralVitality: 0, signalResonance: 0 };
    }
    if (!state.equippedModules || typeof state.equippedModules !== 'object') {
      state.equippedModules = { emitter: null, lens: null, shell: null, relay: null, auxiliary: null, relic: null };
    } else {
      for (const k of ALL_SLOT_KEYS) {
        if (state.equippedModules[k] === undefined) state.equippedModules[k] = null;
      }
    }
    if (!state.unlockedSlots || typeof state.unlockedSlots !== 'object') {
      state.unlockedSlots = {
        auxiliary: Boolean(state.equippedModules.auxiliary),
        relic: Boolean(state.equippedModules.relic)
      };
    }
    if (!Array.isArray(state.moduleInventory)) state.moduleInventory = [];
    if (!state.frequencyShards || typeof state.frequencyShards !== 'object') {
      state.frequencyShards = {};
    }
    for (const el of SHARD_ELEMENTS) {
      if (!Array.isArray(state.frequencyShards[el])) {
        state.frequencyShards[el] = [0, 0];
      }
    }
    if (!state.fractureKeys || typeof state.fractureKeys !== 'object') {
      state.fractureKeys = { dense_lattice: 1, twin_wardens: 0, volatile_flux: 0 };
    }
    if (!Array.isArray(state.activeContracts)) state.activeContracts = [];
    return { meta: metaObj, state };
  }

  function _persist(meta) {
    if (meta && typeof meta.save === 'function') meta.save();
  }

  function _getMatter(meta, state) {
    if (meta && typeof meta.getCurrency === 'function') return meta.getCurrency();
    return Math.max(0, Math.floor(Number(state.currency) || 0));
  }

  function _addMatter(meta, state, amount) {
    const clean = Math.max(0, Math.floor(Number(amount) || 0));
    if (clean <= 0) return;
    if (meta && typeof meta.addCurrency === 'function') {
      meta.addCurrency(clean);
    } else {
      state.currency = Math.max(0, Math.floor(Number(state.currency) || 0)) + clean;
    }
  }

  function _spendMatter(meta, state, amount) {
    const cost = Math.max(0, Math.floor(Number(amount) || 0));
    if (meta && typeof meta.spendCurrency === 'function') {
      return meta.spendCurrency(cost);
    }
    const cur = _getMatter(meta, state);
    if (cur < cost) return false;
    state.currency = cur - cost;
    return true;
  }

  function _rollProperty(key, itemTier, rng, minBias = 0, itemLevelMult = 1.0) {
    const def = MODULE_PROPERTIES[key];
    const band = TIER_BANDS[_clampInt(itemTier, 1, 4, 1)];
    const u = minBias + (1 - minBias) * rng();
    const frac = band[0] + u * (band[1] - band[0]);
    const scaleM = Math.max(1.0, Math.min(1.6, Number(itemLevelMult) || 1.0));
    const prop = {
      key: def.id,
      value: _roundTo((def.min + frac * (def.max - def.min)) * scaleM, def.decimals)
    };
    if (def.secondaryMin !== undefined) {
      const u2 = minBias + (1 - minBias) * rng();
      const frac2 = band[0] + u2 * (band[1] - band[0]);
      prop.secondaryValue = _roundTo(
        (def.secondaryMin + frac2 * (def.secondaryMax - def.secondaryMin)) * scaleM,
        def.secondaryDecimals
      );
    }
    return prop;
  }

  function _buildModuleName(slot, quality, properties, rng) {
    const prefix = _pickRandom(QUALITY_NAME_PREFIXES[quality] || QUALITY_NAME_PREFIXES.standard, rng);
    const noun = SLOT_SHORT_NOUNS[slot] || 'Module';
    const primaryDef = properties && properties[0] ? MODULE_PROPERTIES[properties[0].key] : null;
    return primaryDef ? `${prefix} ${noun} of ${primaryDef.name}` : `${prefix} ${noun}`;
  }

  function _findModuleLocation(state, modUid) {
    if (!modUid) return null;
    for (const slot of ALL_SLOT_KEYS) {
      const eq = state.equippedModules[slot];
      if (eq && eq.uid === modUid) return { mod: eq, location: 'equipped', slot };
    }
    const idx = state.moduleInventory.findIndex(m => m && m.uid === modUid);
    if (idx !== -1) return { mod: state.moduleInventory[idx], location: 'inventory', index: idx };
    return null;
  }

  function _isSlotUnlocked(meta, state, slotKey) {
    if (slotKey === 'emitter' || slotKey === 'lens' || slotKey === 'shell' || slotKey === 'relay') {
      return true;
    }
    if (meta && typeof meta.isSlotUnlocked === 'function') {
      return Boolean(meta.isSlotUnlocked(slotKey));
    }
    return Boolean(state && state.unlockedSlots && state.unlockedSlots[slotKey]);
  }

  function getOverclockSyncCost(retries = 0) {
    const r = Math.max(0, Math.floor(Number(retries) || 0));
    return Math.min(90, 15 + r * 15);
  }

  function _boostPropertyValue(prop) {
    const def = MODULE_PROPERTIES[prop.key];
    if (!def) return;
    if (def.decimals === 0) {
      prop.value = prop.key === 'vitalSiphon'
        ? Math.max(prop.value + 1, Math.ceil(prop.value * 1.18))
        : Math.max(prop.value + 1, Math.round(prop.value * 1.18));
    } else {
      prop.value = _roundTo(prop.value * 1.18, def.decimals);
    }
    if (prop.secondaryValue !== undefined && def.secondaryDecimals !== undefined) {
      prop.secondaryValue = _roundTo(prop.secondaryValue * 1.18, def.secondaryDecimals);
    }
  }

  function getPhaseConfig(phase, singularityLevel = 1) {
    const p = _clampInt(phase, 1, 4, 1);
    const base = WORLD_PHASES[p];
    if (p < 4) {
      return { ...base, singularityLevel: 1 };
    }
    const singLvl = _clampInt(singularityLevel, 1, 99, 1);
    const step = singLvl - 1;
    return {
      phase: 4,
      singularityLevel: singLvl,
      name: singLvl > 1 ? `Phase IV: Singularity +${singLvl}` : base.name,
      hpMult: _roundTo(base.hpMult * Math.pow(1.45, step), 2),
      dmgMult: _roundTo(base.dmgMult + step * 0.28, 2),
      attenuationPenalty: base.attenuationPenalty + step * 15,
      rewardMult: _roundTo(base.rewardMult + step * 0.65, 2),
      eliteMods: base.eliteMods
    };
  }

  function _capFirst(s) {
    return s ? (s.charAt(0).toUpperCase() + s.slice(1)) : '';
  }

  function _buildSlotImplicit(slot, itemTier) {
    const def = SLOT_IMPLICITS[slot];
    if (!def) return null;
    const idx = Math.max(0, Math.min(3, _clampInt(itemTier, 1, 4, 1) - 1));
    const val = def.values[idx];
    const secVal = def.secondaryValues ? def.secondaryValues[idx] : undefined;
    const imp = {
      key: def.key,
      value: val,
      label: def.format(val, secVal)
    };
    if (def.secondaryKey && secVal !== undefined) {
      imp.secondaryKey = def.secondaryKey;
      imp.secondaryValue = secVal;
    }
    return imp;
  }

  function _rollSynergyAffix(itemTier, rng = Math.random, minBias = 0, itemLevelMult = 1.0) {
    const key = _pickRandom(SYNERGY_AFFIX_KEYS, rng);
    const def = SYNERGY_AFFIX_DEFS[key];
    const band = TIER_BANDS[_clampInt(itemTier, 1, 4, 1)];
    const u = minBias + (1 - minBias) * rng();
    const frac = band[0] + u * (band[1] - band[0]);
    const scaleM = Math.max(1.0, Math.min(1.5, Number(itemLevelMult) || 1.0));
    const val = _roundTo((def.min + frac * (def.max - def.min)) * scaleM, def.decimals);
    return {
      id: def.id,
      value: val,
      label: def.format(val)
    };
  }

  function _pickBiasedPropertyKeys(slot, count, rng, excludeSet = new Set()) {
    const biasedPool = (SLOT_PROPERTY_BIAS[slot] || PROPERTY_KEYS).filter(k => !excludeSet.has(k));
    const generalPool = PROPERTY_KEYS.filter(k => !excludeSet.has(k));
    const chosen = [];
    const chosenSet = new Set(excludeSet);
    for (let i = 0; i < count; i++) {
      const useBias = biasedPool.some(k => !chosenSet.has(k)) && rng() < 0.65;
      const source = useBias
        ? biasedPool.filter(k => !chosenSet.has(k))
        : generalPool.filter(k => !chosenSet.has(k));
      if (source.length === 0) break;
      const picked = source[Math.floor(rng() * source.length)];
      chosen.push(picked);
      chosenSet.add(picked);
    }
    return chosen;
  }

  function detectHarmonicSequence(mod) {
    if (!mod || !Array.isArray(mod.sockets) || mod.sockets.length < 2) return null;
    const s0 = mod.sockets[0];
    const s1 = mod.sockets[1];
    if (!s0 || !s1 || !s0.element || !s1.element) return null;
    const named = HARMONIC_SEQUENCES[`${s0.element}+${s1.element}`]
      || HARMONIC_SEQUENCES[`${s1.element}+${s0.element}`];
    if (named) return named;
    if (!SHARD_ELEMENTS.includes(s0.element) || !SHARD_ELEMENTS.includes(s1.element)) return null;
    if (s0.element === s1.element) {
      const el = s0.element;
      return {
        id: `pure_${el}`,
        name: `Pure ${_capFirst(el)} Resonance`,
        elements: [el],
        bonus: 0.14,
        desc: `+14% ${_capFirst(el)} Damage & +15 Attenuation`
      };
    }
    const pair = [s0.element, s1.element].sort();
    return {
      id: `dual_${pair[0]}+${pair[1]}`,
      name: 'Dual Harmonic Link',
      elements: [pair[0], pair[1]],
      bonus: 0.08,
      desc: `+8% ${_capFirst(pair[0])}/${_capFirst(pair[1])} Damage, +6% Output & +10 Attenuation`
    };
  }

  function formatModuleProperty(prop) {
    if (!prop || !MODULE_PROPERTIES[prop.key]) return '';
    const def = MODULE_PROPERTIES[prop.key];
    if (prop.key === 'signalGain') {
      const discPct = Math.round((prop.secondaryValue || 0) * 100);
      return `+${Math.round(prop.value)} Pickup Range, +${discPct}% Discovery`;
    }
    if (def.isPercent) {
      return `+${Math.round(prop.value * 100)}% ${def.statLabel}`;
    }
    return `+${Math.round(prop.value)} ${def.statLabel}`;
  }

  function generateModule({
    itemTier = 1,
    quality = null,
    forceSlot = null,
    forceSignatureId = null,
    itemLevel = null,
    zoneLevel = null,
    reqLevel = null,
    rng = Math.random
  } = {}) {
    const cleanTier = _clampInt(itemTier, 1, 4, 1);
    const tierDefaultIlvl = cleanTier === 1 ? 1 : (cleanTier === 2 ? 10 : (cleanTier === 3 ? 25 : 45));
    const hasExplicitScale = (itemLevel != null) || (zoneLevel != null);
    const resolvedItemLevel = itemLevel != null
      ? _clampInt(itemLevel, 1, 99, tierDefaultIlvl)
      : (zoneLevel != null
          ? _clampInt(Math.round(Number(zoneLevel) + (cleanTier - 1) * 3 + rng() * 3), 1, 99, 1)
          : tierDefaultIlvl);
    const resolvedReqLevel = reqLevel != null
      ? _clampInt(reqLevel, 1, 99, 1)
      : (hasExplicitScale ? Math.max(1, Math.min(40, Math.floor((resolvedItemLevel - 1) / 4) + 1)) : 1);
    const iLvlScale = hasExplicitScale
      ? (1 + Math.min(0.45, Math.max(0, (resolvedItemLevel - 1) * 0.006)))
      : 1.0;

    let chosenSig = (forceSignatureId && SIGNATURE_CATALOG[forceSignatureId])
      ? SIGNATURE_CATALOG[forceSignatureId]
      : null;

    let resolvedQuality = chosenSig ? 'signature' : quality;
    if (!resolvedQuality || !MODULE_QUALITIES[resolvedQuality]) {
      const roll = rng();
      if (roll < 0.55) resolvedQuality = 'standard';
      else if (roll < 0.83) resolvedQuality = 'refined';
      else if (roll < 0.96) resolvedQuality = 'harmonic';
      else resolvedQuality = 'signature';
    }

    let slot = (forceSlot && MODULE_SLOTS[forceSlot]) ? forceSlot : _pickRandom(SLOT_KEYS, rng);
    if (chosenSig) {
      slot = chosenSig.slot;
    } else if (resolvedQuality === 'signature') {
      const candidates = Object.values(SIGNATURE_CATALOG).filter(
        s => !forceSlot || !MODULE_SLOTS[forceSlot] || s.slot === forceSlot
      );
      chosenSig = _pickRandom(candidates, rng);
      slot = chosenSig.slot;
    }

    const qDef = MODULE_QUALITIES[resolvedQuality];
    const pickedKeys = _pickBiasedPropertyKeys(slot, qDef.propCount, rng);
    const properties = pickedKeys.map(k => _rollProperty(k, cleanTier, rng, 0, iLvlScale));
    const implicit = _buildSlotImplicit(slot, cleanTier);
    const synergyAffix = (resolvedQuality === 'refined' || resolvedQuality === 'harmonic')
      ? _rollSynergyAffix(cleanTier, rng, 0, iLvlScale)
      : null;

    const sockets = Array.from({ length: qDef.socketCount }, () => null);
    const name = chosenSig ? chosenSig.name : _buildModuleName(slot, resolvedQuality, properties, rng);

    return {
      uid: _nextUid('mod', rng),
      name,
      slot,
      quality: resolvedQuality,
      itemTier: cleanTier,
      itemLevel: resolvedItemLevel,
      reqLevel: resolvedReqLevel,
      properties,
      sockets,
      implicit,
      synergyAffix,
      signatureId: chosenSig ? chosenSig.id : null,
      relicId: null,
      overdriven: false,
      stabilityPenalty: 0
    };
  }

  function generateApexRelic(relicId = null, rng = Math.random, opts = {}) {
    const keys = Object.keys(APEX_RELIC_CATALOG);
    const chosenId = (relicId && APEX_RELIC_CATALOG[relicId]) ? relicId : _pickRandom(keys, rng);
    const def = APEX_RELIC_CATALOG[chosenId];
    const resolvedItemLevel = opts && opts.itemLevel != null ? _clampInt(opts.itemLevel, 1, 99, 50) : 50;
    const resolvedReqLevel = opts && opts.reqLevel != null ? _clampInt(opts.reqLevel, 1, 99, 1) : 1;
    const iLvlScale = opts && opts.itemLevel != null ? (1 + Math.min(0.45, Math.max(0, (resolvedItemLevel - 1) * 0.006))) : 1.0;
    const pool = ['powerOutput', 'fireCadence', 'hullCapacity', 'barrierCapacity', 'attenuationRating', 'critFrequency'];
    const properties = [];
    for (let i = 0; i < 3 && pool.length > 0; i++) {
      const idx = Math.floor(rng() * pool.length);
      const key = pool.splice(idx, 1)[0];
      properties.push(_rollProperty(key, 4, rng, 0.55, iLvlScale));
    }
    return {
      uid: _nextUid('relic', rng),
      name: def.name,
      slot: 'relic',
      quality: 'mythic',
      itemTier: 4,
      itemLevel: resolvedItemLevel,
      reqLevel: resolvedReqLevel,
      properties,
      sockets: [null, null],
      implicit: null,
      synergyAffix: _rollSynergyAffix(4, rng, 0.5, iLvlScale),
      signatureId: null,
      relicId: def.id,
      overdriven: false,
      stabilityPenalty: 0
    };
  }

  function addModuleToInventory(meta, mod) {
    const resolved = _resolveMeta(meta);
    if (!resolved || !mod) return { added: false, reason: 'invalid_input' };
    const { state } = resolved;

    if (state.moduleInventory.length >= MAX_MODULE_INVENTORY) {
      let lowestIdx = -1;
      let lowestTier = Infinity;
      for (let i = 0; i < state.moduleInventory.length; i++) {
        const candidate = state.moduleInventory[i];
        if (candidate && candidate.quality === 'standard') {
          const tier = candidate.itemTier || 1;
          if (tier < lowestTier) {
            lowestTier = tier;
            lowestIdx = i;
          }
        }
      }

      if (lowestIdx !== -1) {
        const salvaged = state.moduleInventory.splice(lowestIdx, 1)[0];
        _addMatter(meta, state, 12);
        state.moduleInventory.push(mod);
        _persist(meta);
        return { added: true, autoSalvaged: salvaged, matterGained: 12 };
      }

      if (mod.quality === 'standard') {
        _addMatter(meta, state, 12);
        _persist(meta);
        return { added: false, autoSalvaged: mod, matterGained: 12 };
      }

      return { added: false, reason: 'inventory_full' };
    }

    state.moduleInventory.push(mod);
    _persist(meta);
    return { added: true, autoSalvaged: null, matterGained: 0 };
  }

  function equipModule(meta, modUid, targetSlot = null, opts = {}) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta' };
    const { state } = resolved;
    const idx = state.moduleInventory.findIndex(m => m && m.uid === modUid);
    if (idx === -1) {
      for (const [eqSlot, eqMod] of Object.entries(state.equippedModules || {})) {
        if (eqMod && eqMod.uid === modUid) {
          const desired = targetSlot || eqSlot;
          if (desired === eqSlot || eqMod.slot === 'relic') {
            return { ok: true, equipped: eqMod, unequipped: null, slot: eqSlot, alreadyEquipped: true };
          }
          if (desired === 'auxiliary' && !_isSlotUnlocked(meta, state, 'auxiliary')) {
            return { ok: false, reason: 'slot_locked', slot: 'auxiliary' };
          }
          if ((desired === eqMod.slot || desired === 'auxiliary') && ALL_EQUIPMENT_SLOTS[desired]) {
            const displaced = state.equippedModules[desired] || null;
            state.equippedModules[desired] = eqMod;
            state.equippedModules[eqSlot] = displaced;
            _persist(meta);
            return { ok: true, equipped: eqMod, unequipped: displaced, slot: desired };
          }
        }
      }
      return { ok: false, reason: 'not_found' };
    }

    const mod = state.moduleInventory[idx];
    if (!ALL_EQUIPMENT_SLOTS[mod.slot]) return { ok: false, reason: 'invalid_slot' };

    const modReq = Math.max(1, Math.floor(Number(mod.reqLevel) || 1));
    const metaLv = (meta && typeof meta.getGlobalLevel === 'function') ? meta.getGlobalLevel() : (state.globalLevel || 1);
    const effLv = Math.max(metaLv, Math.floor(Number(opts && opts.inRunLevel) || 0));
    if (effLv < modReq) {
      return { ok: false, reason: 'level_too_low', reqLevel: modReq, currentLevel: effLv };
    }

    let slotToUse = targetSlot || mod.slot;
    if (!ALL_EQUIPMENT_SLOTS[slotToUse]) return { ok: false, reason: 'invalid_slot' };

    if (slotToUse === 'auxiliary') {
      if (mod.slot === 'relic') return { ok: false, reason: 'invalid_slot' };
      if (!_isSlotUnlocked(meta, state, 'auxiliary')) {
        return { ok: false, reason: 'slot_locked', slot: 'auxiliary' };
      }
    } else if (mod.slot === 'relic') {
      slotToUse = 'relic';
      if (!_isSlotUnlocked(meta, state, 'relic')) {
        return { ok: false, reason: 'slot_locked', slot: 'relic' };
      }
    } else if (slotToUse !== mod.slot) {
      return { ok: false, reason: 'invalid_slot' };
    }

    const prev = state.equippedModules[slotToUse] || null;
    if (prev) {
      state.moduleInventory[idx] = prev;
    } else {
      state.moduleInventory.splice(idx, 1);
    }
    state.equippedModules[slotToUse] = mod;
    _persist(meta);
    return { ok: true, equipped: mod, unequipped: prev, slot: slotToUse };
  }

  function unequipModule(meta, slot) {
    const resolved = _resolveMeta(meta);
    if (!resolved || !ALL_EQUIPMENT_SLOTS[slot]) return { ok: false, reason: 'invalid_slot' };
    const { state } = resolved;
    const prev = state.equippedModules[slot];
    if (!prev) return { ok: false, reason: 'slot_empty' };
    if (state.moduleInventory.length >= MAX_MODULE_INVENTORY) {
      return { ok: false, reason: 'inventory_full' };
    }

    state.equippedModules[slot] = null;
    state.moduleInventory.push(prev);
    _persist(meta);
    return { ok: true, module: prev };
  }

  function salvageModule(meta, modUid) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta' };
    const { state } = resolved;
    const idx = state.moduleInventory.findIndex(m => m && m.uid === modUid);
    if (idx === -1) return { ok: false, reason: 'not_found' };

    const mod = state.moduleInventory.splice(idx, 1)[0];
    const qDef = MODULE_QUALITIES[mod.quality] || MODULE_QUALITIES.standard;
    const matterGained = qDef.salvageMatter;
    _addMatter(meta, state, matterGained);
    _persist(meta);
    return { ok: true, matterGained, module: mod };
  }

  function socketShard(meta, modUid, socketIndex, element, tier = 1) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta' };
    if (!SHARD_ELEMENTS.includes(element)) return { ok: false, reason: 'invalid_element' };
    const cleanTier = tier === 2 ? 2 : 1;
    const { state } = resolved;
    const found = _findModuleLocation(state, modUid);
    if (!found) return { ok: false, reason: 'not_found' };

    const mod = found.mod;
    if (!Array.isArray(mod.sockets) || socketIndex < 0 || socketIndex >= mod.sockets.length) {
      return { ok: false, reason: 'invalid_socket' };
    }

    const tierIdx = cleanTier - 1;
    const counts = state.frequencyShards[element];
    if (!counts || (counts[tierIdx] || 0) < 1) {
      return { ok: false, reason: 'insufficient_shards' };
    }

    const previous = mod.sockets[socketIndex];
    if (previous && SHARD_ELEMENTS.includes(previous.element)) {
      const prevTierIdx = previous.tier === 2 ? 1 : 0;
      state.frequencyShards[previous.element][prevTierIdx] += 1;
    }

    counts[tierIdx] -= 1;
    mod.sockets[socketIndex] = { element, tier: cleanTier };
    const harmonicSequence = detectHarmonicSequence(mod);
    _persist(meta);
    return { ok: true, module: mod, replaced: previous || null, harmonicSequence };
  }

  function unsocketShard(meta, modUid, socketIndex) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta' };
    const { state } = resolved;
    const found = _findModuleLocation(state, modUid);
    if (!found) return { ok: false, reason: 'not_found' };

    const mod = found.mod;
    if (!Array.isArray(mod.sockets) || socketIndex < 0 || socketIndex >= mod.sockets.length) {
      return { ok: false, reason: 'invalid_socket' };
    }
    const existing = mod.sockets[socketIndex];
    if (!existing) return { ok: false, reason: 'socket_empty' };

    if (SHARD_ELEMENTS.includes(existing.element)) {
      const tierIdx = existing.tier === 2 ? 1 : 0;
      state.frequencyShards[existing.element][tierIdx] += 1;
    }
    mod.sockets[socketIndex] = null;
    _persist(meta);
    return { ok: true, removed: existing, module: mod };
  }

  function synthesizeShards(meta, element) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta' };
    if (!SHARD_ELEMENTS.includes(element)) return { ok: false, reason: 'invalid_element' };
    const { state } = resolved;
    const counts = state.frequencyShards[element];
    if (!counts || (counts[0] || 0) < 3) {
      return { ok: false, reason: 'insufficient_shards' };
    }

    counts[0] -= 3;
    counts[1] = (counts[1] || 0) + 1;
    _persist(meta);
    return { ok: true, element, tier1: counts[0], tier2: counts[1] };
  }

  function recalibrateModule(meta, modUid, bonusQuality = false, rng = Math.random) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta' };
    const { state } = resolved;
    const found = _findModuleLocation(state, modUid);
    if (!found) return { ok: false, reason: 'not_found' };

    const mod = found.mod;
    const tier = _clampInt(mod.itemTier, 1, 4, 1);
    const cost = 35 * tier;
    if (!_spendMatter(meta, state, cost)) {
      return { ok: false, reason: 'insufficient_matter', cost };
    }

    const minBias = bonusQuality ? 0.35 : 0;
    const targetCount = (mod.properties && mod.properties.length > 0)
      ? mod.properties.length
      : (MODULE_QUALITIES[mod.quality] ? MODULE_QUALITIES[mod.quality].propCount : 1);

    const pickedKeys = _pickBiasedPropertyKeys(mod.slot, targetCount, rng);
    mod.properties = pickedKeys.map(key => _rollProperty(key, tier, rng, minBias));
    if (!mod.implicit && SLOT_IMPLICITS[mod.slot]) {
      mod.implicit = _buildSlotImplicit(mod.slot, tier);
    }
    if (mod.quality === 'refined' || mod.quality === 'harmonic' || mod.quality === 'mythic') {
      mod.synergyAffix = _rollSynergyAffix(tier, rng, minBias);
    }
    if (!mod.signatureId) {
      mod.name = _buildModuleName(mod.slot, mod.quality, mod.properties, rng);
    }
    _persist(meta);
    return { ok: true, module: mod, cost };
  }

  function amplifyModule(meta, modUid, preferredElement = null, rng = Math.random) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta' };
    const { state } = resolved;
    const found = _findModuleLocation(state, modUid);
    if (!found) return { ok: false, reason: 'not_found' };

    const mod = found.mod;
    const nextQuality = mod.quality === 'standard' ? 'refined' : (mod.quality === 'refined' ? 'harmonic' : null);
    if (!nextQuality) {
      return { ok: false, reason: 'cannot_amplify' };
    }

    const tier = _clampInt(mod.itemTier, 1, 4, 1);
    const cost = 60 * tier;
    if (_getMatter(meta, state) < cost) {
      return { ok: false, reason: 'insufficient_matter', cost };
    }

    // Find an available shard before spending Matter
    const searchOrder = (preferredElement && SHARD_ELEMENTS.includes(preferredElement))
      ? [preferredElement, ...SHARD_ELEMENTS.filter(e => e !== preferredElement)]
      : SHARD_ELEMENTS;

    let shardPick = null;
    for (const el of searchOrder) {
      const counts = state.frequencyShards[el];
      if (counts && counts[0] > 0) {
        shardPick = { element: el, tierIdx: 0, tier: 1 };
        break;
      }
    }
    if (!shardPick) {
      for (const el of searchOrder) {
        const counts = state.frequencyShards[el];
        if (counts && counts[1] > 0) {
          shardPick = { element: el, tierIdx: 1, tier: 2 };
          break;
        }
      }
    }
    if (!shardPick) {
      return { ok: false, reason: 'insufficient_shards', cost };
    }

    _spendMatter(meta, state, cost);
    state.frequencyShards[shardPick.element][shardPick.tierIdx] -= 1;

    mod.quality = nextQuality;
    if (!Array.isArray(mod.properties)) mod.properties = [];
    const usedKeys = new Set(mod.properties.map(p => p.key));
    const newKeys = _pickBiasedPropertyKeys(mod.slot, 1, rng, usedKeys);
    if (newKeys.length > 0) {
      mod.properties.push(_rollProperty(newKeys[0], tier, rng));
    }
    if (!mod.implicit && SLOT_IMPLICITS[mod.slot]) {
      mod.implicit = _buildSlotImplicit(mod.slot, tier);
    }
    if (!mod.synergyAffix && (nextQuality === 'refined' || nextQuality === 'harmonic')) {
      mod.synergyAffix = _rollSynergyAffix(tier, rng);
    }

    if (!Array.isArray(mod.sockets)) mod.sockets = [];
    const targetSockets = MODULE_QUALITIES[nextQuality].socketCount;
    while (mod.sockets.length < targetSockets) mod.sockets.push(null);

    if (!mod.signatureId) {
      mod.name = _buildModuleName(mod.slot, mod.quality, mod.properties, rng);
    }

    _persist(meta);
    return { ok: true, module: mod, cost, shardUsed: { element: shardPick.element, tier: shardPick.tier } };
  }

  function overdriveModule(meta, modUid, bonusQuality = false, rng = Math.random) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta' };
    const { state } = resolved;
    const found = _findModuleLocation(state, modUid);
    if (!found) return { ok: false, reason: 'not_found' };

    const mod = found.mod;
    if (mod.overdriven) {
      return { ok: false, reason: 'already_overdriven' };
    }

    const tier = _clampInt(mod.itemTier, 1, 4, 1);
    const cost = 90 * tier;
    if (!_spendMatter(meta, state, cost)) {
      return { ok: false, reason: 'insufficient_matter', cost };
    }

    mod.overdriven = true;
    const roll = rng();
    const boostCutoff = bonusQuality ? 0.60 : 0.40;
    const mutateCutoff = bonusQuality ? 0.90 : 0.75;

    let outcome;
    if (roll < boostCutoff) {
      outcome = 'boost';
      if (Array.isArray(mod.properties)) {
        for (const prop of mod.properties) {
          _boostPropertyValue(prop);
        }
      }
    } else if (roll < mutateCutoff) {
      outcome = 'mutate';
      if (!Array.isArray(mod.properties)) mod.properties = [];
      if (mod.properties.length > 0) {
        const replaceIdx = Math.floor(rng() * mod.properties.length);
        const usedKeys = new Set(mod.properties.map(p => p.key));
        const unused = PROPERTY_KEYS.filter(k => !usedKeys.has(k));
        const newKey = unused.length > 0 ? _pickRandom(unused, rng) : mod.properties[replaceIdx].key;
        mod.properties[replaceIdx] = _rollProperty(newKey, tier, rng, bonusQuality ? 0.35 : 0.15);
      } else {
        mod.properties.push(_rollProperty(_pickRandom(PROPERTY_KEYS, rng), tier, rng, 0.25));
      }
    } else {
      outcome = 'destabilize';
      mod.stabilityPenalty = _roundTo((mod.stabilityPenalty || 0) + 0.08, 3);
    }

    _persist(meta);
    return { ok: true, module: mod, outcome, cost };
  }

  function autoSynthesizeAllShards(meta) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta', mergedCount: 0 };
    const { state } = resolved;
    let mergedCount = 0;
    const mergedByElement = {};
    for (const el of SHARD_ELEMENTS) {
      const counts = state.frequencyShards[el];
      if (!counts) continue;
      const fusions = Math.floor((counts[0] || 0) / 3);
      if (fusions > 0) {
        counts[0] -= fusions * 3;
        counts[1] = (counts[1] || 0) + fusions;
        mergedCount += fusions;
        mergedByElement[el] = fusions;
      }
    }
    if (mergedCount > 0) _persist(meta);
    return { ok: true, mergedCount, mergedByElement };
  }

  function addFrequencyShard(meta, element, tier = 1, opts = {}) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta' };
    if (!SHARD_ELEMENTS.includes(element)) return { ok: false, reason: 'invalid_element' };
    const { state } = resolved;
    if (!Array.isArray(state.frequencyShards[element])) state.frequencyShards[element] = [0, 0];
    const tIdx = tier === 2 ? 1 : 0;
    state.frequencyShards[element][tIdx] = (state.frequencyShards[element][tIdx] || 0) + 1;
    let merged = 0;
    if (!opts || opts.autoMerge !== false) {
      const counts = state.frequencyShards[element];
      const fusions = Math.floor((counts[0] || 0) / 3);
      if (fusions > 0) {
        counts[0] -= fusions * 3;
        counts[1] = (counts[1] || 0) + fusions;
        merged = fusions;
      }
    }
    _persist(meta);
    return { ok: true, element, counts: [...state.frequencyShards[element]], merged };
  }

  function getAutoResonanceBonuses(meta) {
    const resolved = _resolveMeta(meta);
    const elemBonuses = {};
    let totalUnits = 0;
    let dominantElement = null;
    let bestUnits = 0;
    for (const el of SHARD_ELEMENTS) {
      const pair = (resolved && resolved.state.frequencyShards && resolved.state.frequencyShards[el]) || [0, 0];
      const units = Math.max(0, Math.floor(Number(pair[0]) || 0)) + Math.max(0, Math.floor(Number(pair[1]) || 0)) * 3;
      totalUnits += units;
      elemBonuses[el] = units > 0 ? _roundTo(_hyp(units, 12, 0.36), 4) : 0;
      if (units > bestUnits) {
        bestUnits = units;
        dominantElement = el;
      }
    }
    const rawAttenuation = totalUnits > 0 ? Math.round(_hyp(totalUnits, 20, 42)) : 0;
    return { elemBonuses, rawAttenuation, totalUnits, dominantElement };
  }

  function getModuleUpgradeCost(mod) {
    if (!mod || typeof mod !== 'object') return 999;
    const iLv = Math.max(1, Math.floor(Number(mod.itemLevel) || (mod.itemTier || 1) * 10));
    const up = Math.max(0, Math.floor(Number(mod.upgradeCount) || 0));
    return Math.round(35 + iLv * 6 + up * 18);
  }

  function upgradeModuleLevel(meta, modUid) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta' };
    const { state } = resolved;
    const found = _findModuleLocation(state, modUid);
    if (!found) return { ok: false, reason: 'not_found' };

    const mod = found.mod;
    const up = Math.max(0, Math.floor(Number(mod.upgradeCount) || 0));
    if (up >= 10) {
      return { ok: false, reason: 'max_upgraded', module: mod };
    }
    const cost = getModuleUpgradeCost(mod);
    if (!_spendMatter(meta, state, cost)) {
      return { ok: false, reason: 'insufficient_matter', cost };
    }

    mod.upgradeCount = up + 1;
    mod.itemLevel = Math.min(99, Math.max(1, Math.floor(Number(mod.itemLevel) || (mod.itemTier || 1) * 10)) + 2);
    if (Array.isArray(mod.properties)) {
      for (const prop of mod.properties) {
        if (!prop || !prop.key) continue;
        const def = MODULE_PROPERTIES[prop.key];
        const dec = def && def.decimals !== undefined ? def.decimals : 2;
        const nextVal = dec === 0
          ? Math.max(prop.value + 1, Math.round(prop.value * 1.06))
          : _roundTo(prop.value * 1.06, dec);
        prop.value = nextVal;
        if (prop.secondaryValue !== undefined && def && def.secondaryDecimals !== undefined) {
          prop.secondaryValue = _roundTo(prop.secondaryValue * 1.05, def.secondaryDecimals);
        }
      }
    }
    if (mod.implicit && Number.isFinite(Number(mod.implicit.value))) {
      const nextImp = mod.implicit.value < 1
        ? _roundTo(mod.implicit.value * 1.05, 3)
        : Math.max(mod.implicit.value + 1, Math.round(mod.implicit.value * 1.05));
      mod.implicit.value = nextImp;
      if (mod.implicit.key === 'damageFlat') mod.implicit.label = `+${Math.round(nextImp)} Base Damage`;
      else if (mod.implicit.key === 'critMultBonus') mod.implicit.label = `+${Math.round(nextImp * 100)}% Crit Damage`;
      else if (mod.implicit.key === 'maxHpFlat') mod.implicit.label = `+${Math.round(nextImp)} Max Hull`;
      else if (mod.implicit.key === 'fireCadencePct') mod.implicit.label = `+${Math.round(nextImp * 100)}% Fire Rate`;
    }
    _persist(meta);
    return { ok: true, module: mod, cost, newItemLevel: mod.itemLevel, upgradeCount: mod.upgradeCount };
  }

  function autoEquipBestModules(meta, opts = {}) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta' };
    const { state } = resolved;
    const powerBefore = getEquippedGearPower(meta);
    const metaLv = (meta && typeof meta.getGlobalLevel === 'function') ? meta.getGlobalLevel() : (state.globalLevel || 1);
    const effLv = Math.max(metaLv, Math.floor(Number(opts && opts.inRunLevel) || 0));
    let changedCount = 0;

    const coreSlots = ['emitter', 'lens', 'shell', 'relay'];
    if (_isSlotUnlocked(meta, state, 'relic')) coreSlots.push('relic');

    for (const slot of coreSlots) {
      const curMod = state.equippedModules[slot];
      const curScore = curMod ? getModulePowerScore(curMod) : -1;
      let bestIdx = -1;
      let bestScore = curScore;
      for (let i = 0; i < state.moduleInventory.length; i++) {
        const cand = state.moduleInventory[i];
        if (!cand || cand.slot !== slot) continue;
        if (Math.max(1, Math.floor(Number(cand.reqLevel) || 1)) > effLv) continue;
        const sc = getModulePowerScore(cand);
        if (sc > bestScore) {
          bestScore = sc;
          bestIdx = i;
        }
      }
      if (bestIdx !== -1) {
        const picked = state.moduleInventory[bestIdx];
        if (curMod) state.moduleInventory[bestIdx] = curMod;
        else state.moduleInventory.splice(bestIdx, 1);
        state.equippedModules[slot] = picked;
        changedCount++;
      }
    }

    if (_isSlotUnlocked(meta, state, 'auxiliary')) {
      const curAux = state.equippedModules.auxiliary;
      const curAuxScore = curAux ? getModulePowerScore(curAux) : -1;
      let bestAuxIdx = -1;
      let bestAuxScore = curAuxScore;
      for (let i = 0; i < state.moduleInventory.length; i++) {
        const cand = state.moduleInventory[i];
        if (!cand || cand.slot === 'relic') continue;
        if (Math.max(1, Math.floor(Number(cand.reqLevel) || 1)) > effLv) continue;
        const sc = getModulePowerScore(cand);
        if (sc > bestAuxScore) {
          bestAuxScore = sc;
          bestAuxIdx = i;
        }
      }
      if (bestAuxIdx !== -1) {
        const picked = state.moduleInventory[bestAuxIdx];
        if (curAux) state.moduleInventory[bestAuxIdx] = curAux;
        else state.moduleInventory.splice(bestAuxIdx, 1);
        state.equippedModules.auxiliary = picked;
        changedCount++;
      }
    }

    if (changedCount > 0) _persist(meta);
    return {
      ok: true,
      changedCount,
      powerBefore,
      powerAfter: getEquippedGearPower(meta)
    };
  }

  function salvageWorseModules(meta, opts = {}) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta', salvagedCount: 0, matterGained: 0 };
    const { state } = resolved;
    const metaLv = (meta && typeof meta.getGlobalLevel === 'function') ? meta.getGlobalLevel() : (state.globalLevel || 1);
    const effLv = Math.max(metaLv, Math.floor(Number(opts && opts.inRunLevel) || 0));

    let salvagedCount = 0;
    let matterGained = 0;
    const kept = [];
    for (const mod of state.moduleInventory) {
      if (!mod) continue;
      if (mod.quality === 'signature' || mod.quality === 'mythic') {
        kept.push(mod);
        continue;
      }
      const eqMod = state.equippedModules ? state.equippedModules[mod.slot] : null;
      if (!eqMod) {
        kept.push(mod);
        continue;
      }
      const modReq = Math.max(1, Math.floor(Number(mod.reqLevel) || 1));
      const eqScore = getModulePowerScore(eqMod);
      const candScore = getModulePowerScore(mod);
      if (modReq > effLv && candScore > eqScore) {
        kept.push(mod);
        continue;
      }
      if (candScore <= eqScore) {
        const qDef = MODULE_QUALITIES[mod.quality] || MODULE_QUALITIES.standard;
        matterGained += qDef.salvageMatter;
        salvagedCount++;
      } else {
        kept.push(mod);
      }
    }
    state.moduleInventory = kept;
    if (matterGained > 0) _addMatter(meta, state, matterGained);
    if (salvagedCount > 0) _persist(meta);
    return { ok: true, salvagedCount, matterGained };
  }

  function saveLoadoutPreset(meta, presetIdx, customName = null) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta' };
    const { state } = resolved;
    const idx = Math.max(0, Math.min(2, Math.floor(Number(presetIdx) || 0)));
    if (!Array.isArray(state.loadoutPresets)) state.loadoutPresets = [null, null, null];
    const slots = {};
    for (const sk of ALL_SLOT_KEYS) {
      slots[sk] = state.equippedModules[sk] ? state.equippedModules[sk].uid : null;
    }
    const existing = state.loadoutPresets[idx];
    const name = (typeof customName === 'string' && customName.trim())
      ? customName.trim().slice(0, 18)
      : ((existing && existing.name) ? existing.name : `SET ${idx + 1}`);
    state.loadoutPresets[idx] = { name, slots };
    state.activePresetIndex = idx;
    _persist(meta);
    return { ok: true, presetIndex: idx, preset: state.loadoutPresets[idx] };
  }

  function applyLoadoutPreset(meta, presetIdx, opts = {}) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta' };
    const { state } = resolved;
    const idx = Math.max(0, Math.min(2, Math.floor(Number(presetIdx) || 0)));
    const preset = Array.isArray(state.loadoutPresets) ? state.loadoutPresets[idx] : null;
    if (!preset || !preset.slots) return { ok: false, reason: 'empty_preset' };

    let equippedCount = 0;
    for (const sk of ALL_SLOT_KEYS) {
      const targetUid = preset.slots[sk];
      if (!targetUid) continue;
      if (state.equippedModules[sk] && state.equippedModules[sk].uid === targetUid) {
        equippedCount++;
        continue;
      }
      const res = equipModule(meta, targetUid, sk, opts);
      if (res && res.ok) equippedCount++;
    }
    state.activePresetIndex = idx;
    _persist(meta);
    return { ok: true, presetIndex: idx, equippedCount };
  }

  function claimAllCompletedContracts(meta) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta', claimedCount: 0, totalMatter: 0, totalAttrPoints: 0 };
    const { state } = resolved;
    ensureContracts(meta);
    const completedIds = state.activeContracts.filter(c => c && c.completed).map(c => c.id);
    let claimedCount = 0;
    let totalMatter = 0;
    let totalAttrPoints = 0;
    for (const cid of completedIds) {
      const res = claimContract(meta, cid);
      if (res && res.ok) {
        claimedCount++;
        totalMatter += (res.rewards && res.rewards.matter) || 0;
        totalAttrPoints += (res.rewards && res.rewards.bonusAttributePoints) || 0;
      }
    }
    return { ok: true, claimedCount, totalMatter, totalAttrPoints };
  }

  function buyBrokerCapsule(meta, rng = Math.random) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta' };
    const { state } = resolved;
    const cost = 55;
    if (!_spendMatter(meta, state, cost)) {
      return { ok: false, reason: 'insufficient_matter', cost };
    }

    const phase = _clampInt(state.maxUnlockedPhase || state.selectedPhase || 1, 1, 4, 1);
    let itemTier = phase;
    if (phase === 1 && rng() < 0.25) itemTier = 2;
    else if (phase === 2 && rng() < 0.30) itemTier = 3;
    else if (phase === 3 && rng() < 0.30) itemTier = 4;
    else if (phase === 4 && rng() < 0.35) itemTier = 3;

    const qRoll = rng();
    let quality = 'refined';
    if (qRoll >= 0.86) quality = 'signature';
    else if (qRoll >= 0.52) quality = 'harmonic';

    const brokerZ = Math.max(1, (state.globalLevel || 1) * 3);
    const mod = generateModule({ itemTier, quality, zoneLevel: brokerZ, rng });
    const jackpot = mod.quality === 'signature';
    const inventoryResult = addModuleToInventory(meta, mod);
    _persist(meta);
    return { ok: true, mod, jackpot, cost, inventoryResult };
  }

  function _createContract(type, seedIndex, phaseHint) {
    const phase = _clampInt(phaseHint, 1, 4, 1);
    const elIdx = seedIndex % SHARD_ELEMENTS.length;
    const targetElement = SHARD_ELEMENTS[elIdx];
    const sectorName = SECTOR_LABELS[targetElement] || targetElement;
    const rewardShardElement = SHARD_ELEMENTS[(seedIndex + 2) % SHARD_ELEMENTS.length];
    const rewardKeyId = FRACTURE_KEY_IDS[seedIndex % FRACTURE_KEY_IDS.length];
    const rewardMatter = 45 + phase * 20;

    let title = '';
    let desc = '';
    let target = 1;
    let contractElement = null;

    switch (type) {
      case 'kill_sector':
        target = 25 + phase * 10;
        contractElement = targetElement;
        title = `Purge ${sectorName}`;
        desc = `Neutralize ${target} hostiles inside ${sectorName}.`;
        break;
      case 'clear_shrines':
        target = 2;
        title = 'Stabilize Volatile Shrines';
        desc = 'Activate 2 Volatile Shrines in the field.';
        break;
      case 'defeat_boss':
        target = 1;
        contractElement = targetElement;
        title = `Defeat ${sectorName} Warden`;
        desc = `Eliminate the ${sectorName} Warden or Architect Boss.`;
        break;
      case 'reach_depth':
        target = 1 + phase;
        title = 'Singularity Descent';
        desc = `Reach Depth ${target} in Singularity Descent.`;
        break;
      case 'collect_vault':
      default:
        target = 1;
        title = 'Vault Recovery';
        desc = 'Open 1 Hidden Vault or Deep Beacon cache.';
        break;
    }

    return {
      id: `ctr_${type}_${seedIndex}_${_nextUid('c', Math.random)}`,
      type,
      title,
      desc,
      target,
      progress: 0,
      completed: false,
      targetElement: contractElement,
      rewardMatter,
      rewardAttrPoints: 1,
      rewardShardElement,
      rewardShardTier: 1,
      rewardKeyId
    };
  }

  function ensureContracts(meta) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return [];
    const { state } = resolved;
    let changed = false;

    state.activeContracts = state.activeContracts.filter(
      c => c && typeof c === 'object' && CONTRACT_TYPES.includes(c.type)
    );

    const completedBase = Math.max(0, Math.floor(Number(state.completedContracts) || 0));
    const phaseHint = _clampInt(state.maxUnlockedPhase || 1, 1, 4, 1);

    let cursor = 0;
    while (state.activeContracts.length < 3) {
      const existingTypes = new Set(state.activeContracts.map(c => c.type));
      let chosenType = null;
      for (let offset = 0; offset < CONTRACT_TYPES.length; offset++) {
        const candidate = CONTRACT_TYPES[(completedBase + state.activeContracts.length + cursor + offset) % CONTRACT_TYPES.length];
        if (!existingTypes.has(candidate)) {
          chosenType = candidate;
          break;
        }
      }
      if (!chosenType) chosenType = CONTRACT_TYPES[state.activeContracts.length % CONTRACT_TYPES.length];
      state.activeContracts.push(
        _createContract(chosenType, completedBase + state.activeContracts.length + cursor, phaseHint)
      );
      cursor += 1;
      changed = true;
    }

    if (changed) _persist(meta);
    return state.activeContracts;
  }

  function recordContractEvent(meta, type, payload = {}) {
    const resolved = _resolveMeta(meta);
    if (!resolved || !CONTRACT_TYPES.includes(type)) return [];
    const { state } = resolved;
    ensureContracts(meta);

    let changed = false;
    const newlyCompleted = [];

    for (const contract of state.activeContracts) {
      if (contract.type !== type || contract.completed) continue;

      if (type === 'reach_depth') {
        const depth = Math.max(0, Math.floor(Number(payload.depth ?? payload.count) || 0));
        if (depth > contract.progress) {
          contract.progress = Math.min(contract.target, depth);
          changed = true;
        }
      } else {
        if (contract.targetElement && payload.element && payload.element !== contract.targetElement && !payload.anyElement) {
          continue;
        }
        const inc = Math.max(1, Math.floor(Number(payload.count) || 1));
        contract.progress = Math.min(contract.target, contract.progress + inc);
        changed = true;
      }

      if (contract.progress >= contract.target && !contract.completed) {
        contract.completed = true;
        newlyCompleted.push(contract);
        changed = true;
      }
    }

    if (changed) _persist(meta);
    return newlyCompleted;
  }

  function claimContract(meta, contractId) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { ok: false, reason: 'invalid_meta' };
    const { state } = resolved;
    ensureContracts(meta);

    const idx = state.activeContracts.findIndex(c => c && c.id === contractId);
    if (idx === -1) return { ok: false, reason: 'not_found' };

    const contract = state.activeContracts[idx];
    if (!contract.completed) return { ok: false, reason: 'incomplete' };

    _addMatter(meta, state, contract.rewardMatter);
    const attrReward = contract.rewardAttrPoints || 1;
    state.bonusAttributePoints = Math.max(0, Math.floor(Number(state.bonusAttributePoints) || 0)) + attrReward;

    const shardEl = SHARD_ELEMENTS.includes(contract.rewardShardElement)
      ? contract.rewardShardElement
      : SHARD_ELEMENTS[0];
    state.frequencyShards[shardEl][0] += 1;

    const keyId = FRACTURE_KEY_DEFS[contract.rewardKeyId] ? contract.rewardKeyId : FRACTURE_KEY_IDS[0];
    state.fractureKeys[keyId] = Math.max(0, Math.floor(Number(state.fractureKeys[keyId]) || 0)) + 1;

    state.completedContracts = Math.max(0, Math.floor(Number(state.completedContracts) || 0)) + 1;
    state.activeContracts.splice(idx, 1);
    ensureContracts(meta);
    _persist(meta);

    return {
      ok: true,
      claimed: contract,
      rewards: {
        matter: contract.rewardMatter,
        bonusAttributePoints: attrReward,
        shard: { element: shardEl, tier: 1 },
        fractureKey: keyId
      },
      contracts: state.activeContracts
    };
  }

  function getEffectiveAttributes(meta, equippedOverride = null) {
    const resolved = _resolveMeta(meta);
    const spent = resolved ? resolved.state.spentAttributes : {};
    const equipped = equippedOverride || (resolved ? resolved.state.equippedModules : {});
    let allBonus = 0;

    if (equipped && typeof equipped === 'object') {
      for (const slot of ALL_SLOT_KEYS) {
        const mod = equipped[slot];
        if (!mod) continue;
        if (mod.signatureId && SIGNATURE_CATALOG[mod.signatureId]) {
          allBonus += SIGNATURE_CATALOG[mod.signatureId].effects.allAttributesBonus || 0;
        }
        if (mod.relicId && APEX_RELIC_CATALOG[mod.relicId]) {
          allBonus += APEX_RELIC_CATALOG[mod.relicId].effects.allAttributesBonus || 0;
        }
      }
    }

    const result = {};
    for (const key of ATTRIBUTE_KEYS) {
      result[key] = Math.max(0, Math.floor(Number(spent[key]) || 0)) + allBonus;
    }
    return result;
  }

  function _applyHarmonicSynergy(seq, current, stateAcc) {
    if (!seq) return;
    if (seq.id && seq.id.startsWith('pure_') && seq.elements && seq.elements[0]) {
      const el = seq.elements[0];
      current.elemBonuses[el] = (current.elemBonuses[el] || 0) + seq.bonus;
      stateAcc.rawAttenuation += 15;
      return;
    }
    if (seq.id && seq.id.startsWith('dual_') && Array.isArray(seq.elements)) {
      for (const el of seq.elements) {
        current.elemBonuses[el] = (current.elemBonuses[el] || 0) + seq.bonus;
      }
      stateAcc.additiveDamagePct += 0.06;
      stateAcc.rawAttenuation += 10;
      return;
    }
    switch (seq.id) {
      case 'fire+storm':
        current.elemBonuses.fire += seq.bonus;
        current.elemBonuses.storm += seq.bonus;
        stateAcc.additiveDamagePct += seq.bonus;
        break;
      case 'frost+earth':
        current.elemBonuses.frost += seq.bonus;
        current.elemBonuses.earth += seq.bonus;
        current.shieldRechargeMult += seq.bonus;
        stateAcc.rawAttenuation += 15;
        break;
      case 'blood+toxin':
        current.elemBonuses.blood += seq.bonus;
        current.elemBonuses.toxin += seq.bonus;
        current.lifesteal = (current.lifesteal || 0) + seq.bonus;
        break;
      case 'holy+fire':
        current.elemBonuses.holy += seq.bonus;
        current.elemBonuses.fire += seq.bonus;
        current.discoveryMult += seq.bonus;
        current.burnDamageMult += seq.bonus;
        break;
    }
  }

  function _applyImplicitStats(imp, current, stateAcc) {
    if (!imp || !imp.key) return;
    const applyOne = (k, val) => {
      const num = Number(val) || 0;
      if (!num) return;
      switch (k) {
        case 'damageFlat': current.damage += num; break;
        case 'critMultBonus': current.critMultiplier += num; break;
        case 'projSpeedFlat': current.projectileSpeed += num; break;
        case 'maxHpFlat': current.maxHp += num; break;
        case 'attenuationFlat': stateAcc.rawAttenuation += num; break;
        case 'fireCadencePct': stateAcc.additiveFireRatePct += num; break;
        case 'allElemBonus':
          for (const el of SHARD_ELEMENTS) {
            current.elemBonuses[el] = (current.elemBonuses[el] || 0) + num;
          }
          break;
      }
    };
    applyOne(imp.key, imp.value);
    if (imp.secondaryKey) applyOne(imp.secondaryKey, imp.secondaryValue);
  }

  function _applySynergyAffix(affix, current) {
    if (!affix || !affix.id || !current.synergyBonuses) return;
    const v = Number(affix.value) || 0;
    switch (affix.id) {
      case 'vs_burning': current.synergyBonuses.vsBurning += v; break;
      case 'vs_chilled': current.synergyBonuses.vsChilled += v; break;
      case 'vs_tox_shock': current.synergyBonuses.vsToxShock += v; break;
      case 'elite_slayer': current.synergyBonuses.eliteSlayer += v; break;
      case 'kill_haste': current.synergyBonuses.killHaste += v; break;
      case 'kinetic_nova':
        if (v > 0) {
          current.synergyBonuses.kineticNovaEvery = current.synergyBonuses.kineticNovaEvery
            ? Math.min(current.synergyBonuses.kineticNovaEvery, Math.round(v))
            : Math.round(v);
        }
        break;
    }
  }

  function _applyModuleProperty(prop, current, stateAcc) {
    if (!prop) return;
    const v = Number(prop.value) || 0;
    switch (prop.key) {
      case 'powerOutput': stateAcc.additiveDamagePct += v; break;
      case 'fireCadence': stateAcc.additiveFireRatePct += v; break;
      case 'vectorVelocity': current.projectileSpeed += v; break;
      case 'hullCapacity': current.maxHp += v; break;
      case 'barrierCapacity': current.bonusEnergyShield += v; break;
      case 'attenuationRating': stateAcc.rawAttenuation += v; break;
      case 'critFrequency': current.critChance += v; break;
      case 'vitalSiphon': current.vitalSiphon += v; break;
      case 'signalGain':
        current.pickupRange += v;
        current.discoveryMult += Number(prop.secondaryValue) || 0;
        break;
      case 'thrusterDrift': current.speed += v; break;
    }
  }

  function _applySignatureEffects(sig, current, stateAcc) {
    const fx = sig.effects || {};
    if (fx.burnDamageMultBonus) current.burnDamageMult += fx.burnDamageMultBonus;
    if (fx.fireRateMult) stateAcc.fireRateMult *= fx.fireRateMult;
    if (fx.bounceBonus) current.bounce += fx.bounceBonus;
    if (fx.chillOnHitSec) {
      current.signatureTraits.chillOnHitSec = Math.max(current.signatureTraits.chillOnHitSec || 0, fx.chillOnHitSec);
    }
    if (fx.projSpeedMult) stateAcc.projSpeedMult *= fx.projSpeedMult;
    if (fx.stormArcEvery) {
      current.signatureTraits.stormArcEvery = fx.stormArcEvery;
      current.signatureTraits.stormArcTargets = fx.stormArcTargets;
      current.signatureTraits.stormArcDmgFactor = fx.stormArcDmgFactor;
    }
    if (fx.damageMult) stateAcc.damageMult *= fx.damageMult;
    if (fx.hazardResistBonus) current.hazardResist = Math.min(0.85, current.hazardResist + fx.hazardResistBonus);
    if (fx.barrierBonus) current.bonusEnergyShield += fx.barrierBonus;
    if (fx.maxHpMult) stateAcc.maxHpMult *= fx.maxHpMult;
    if (fx.lowHullDmgBonus) {
      current.lowHullDmgMult += fx.lowHullDmgBonus;
      current.signatureTraits.lowHullThreshold = fx.lowHullThreshold;
    }
    if (fx.vitalSiphonBonus) current.vitalSiphon += fx.vitalSiphonBonus;
    if (fx.barrierMult) current.barrierMult *= fx.barrierMult;
    if (fx.attenuationBonus) stateAcc.rawAttenuation += fx.attenuationBonus;
    if (fx.shieldRechargeBonus) current.shieldRechargeMult += fx.shieldRechargeBonus;
    if (fx.moveSpeedMult) stateAcc.moveSpeedMult *= fx.moveSpeedMult;
    if (fx.pierceBonus) current.pierce += fx.pierceBonus;
    if (fx.knockbackBonus) current.knockbackMult += fx.knockbackBonus;
    if (fx.projectileCountBonus) current.projectileCount += fx.projectileCountBonus;
    if (fx.perProjectileFactor) current.signatureTraits.perProjectileFactor = fx.perProjectileFactor;
    if (fx.allAttributesBonus) {
      current.signatureTraits.allAttributesBonus = (current.signatureTraits.allAttributesBonus || 0) + fx.allAttributesBonus;
    }
    if (fx.starforgeLanceEvery) {
      current.signatureTraits.starforgeLanceEvery = fx.starforgeLanceEvery;
      current.signatureTraits.starforgeLanceDmgMult = fx.starforgeLanceDmgMult || 1.45;
    }
    if (fx.chronoPulseInterval) {
      current.signatureTraits.chronoPulseInterval = fx.chronoPulseInterval;
      current.signatureTraits.chronoPulseRadius = fx.chronoPulseRadius || 220;
    }
    if (fx.matterMultBonus) current.matterMult += fx.matterMultBonus;
    if (fx.discoveryBonus) current.discoveryMult += fx.discoveryBonus;
    if (fx.harvesterSurgeDmg) current.signatureTraits.harvesterSurgeDmg = fx.harvesterSurgeDmg;
  }

  function applyAttributesAndModules(current, meta, context = {}) {
    if (!current || typeof current !== 'object') return current;

    for (const k of ['damage', 'fireRate', 'projectileSpeed', 'maxHp', 'speed', 'critChance', 'pickupRange', 'bounce', 'pierce', 'projectileCount']) {
      if (typeof current[k] !== 'number' || !Number.isFinite(current[k])) current[k] = 0;
    }
    if (typeof current.critMultiplier !== 'number' || !Number.isFinite(current.critMultiplier)) {
      current.critMultiplier = 2.0;
    }

    current.damageMitigation = current.damageMitigation || 0;
    current.phaseEvasion = current.phaseEvasion || 0;
    current.discoveryMult = current.discoveryMult || 1.0;
    current.matterMult = current.matterMult || 1.0;
    current.vitalSiphon = current.vitalSiphon || 0;
    current.bonusEnergyShield = current.bonusEnergyShield || 0;
    current.signatureTraits = current.signatureTraits || {};
    current.synergyBonuses = {
      vsBurning: 0,
      vsChilled: 0,
      vsToxShock: 0,
      eliteSlayer: 0,
      killHaste: 0,
      kineticNovaEvery: 0
    };
    current.burnDamageMult = current.burnDamageMult || 1.0;
    current.hazardResist = current.hazardResist || 0;
    current.shieldRechargeMult = current.shieldRechargeMult || 1.0;
    current.knockbackMult = current.knockbackMult || 1.0;
    current.lowHullDmgMult = current.lowHullDmgMult || 1.0;
    current.barrierMult = current.barrierMult || 1.0;
    current.harmonicSequences = current.harmonicSequences || [];
    current.socketedShardCount = 0;
    current.dominantShardElement = null;
    current.elemBonuses = current.elemBonuses || {
      fire: 0, frost: 0, storm: 0, toxin: 0, blood: 0, holy: 0, earth: 0
    };
    for (const el of SHARD_ELEMENTS) {
      if (typeof current.elemBonuses[el] !== 'number') current.elemBonuses[el] = 0;
    }

    const resolved = _resolveMeta(meta);
    if (!resolved) return current;
    const { state } = resolved;
    const equipped = state.equippedModules || {};

    const attrs = getEffectiveAttributes(meta, equipped);
    current.appliedAttributes = attrs;

    const stateAcc = {
      additiveDamagePct: 0,
      additiveFireRatePct: 0,
      rawAttenuation: Number(context.extraRawAttenuation) || 0,
      damageMult: 1.0,
      fireRateMult: 1.0,
      projSpeedMult: 1.0,
      maxHpMult: 1.0,
      moveSpeedMult: 1.0
    };

    // 1. Apply 4 Core Attributes (with diminishing returns) & 15/30/50 Breakthrough Milestones
    const pDP = attrs.destructivePower;
    if (pDP > 0) {
      current.damage += 0.90 * pDP;
      stateAcc.additiveDamagePct += _hyp(pDP, 60, 0.65);
      current.knockbackMult += _hyp(pDP, 40, 0.6);
    }

    const pKC = attrs.kineticCadence;
    if (pKC > 0) {
      stateAcc.additiveFireRatePct += _hyp(pKC, 60, 0.70);
      current.projectileSpeed += 2.2 * pKC;
      current.phaseEvasion += _hyp(pKC, 105, 0.28);
    }

    const pSV = attrs.structuralVitality;
    if (pSV > 0) {
      current.maxHp += 12 * pSV;
      stateAcc.rawAttenuation += 2.2 * pSV;
    }

    const pSR = attrs.signalResonance;
    if (pSR > 0) {
      current.discoveryMult += _hyp(pSR, 55, 1.25);
      current.critChance += _hyp(pSR, 65, 0.34);
      current.matterMult += _hyp(pSR, 65, 0.55);
    }

    current.attributeMilestones = {
      dp15: pDP >= 15,
      dp30: pDP >= 30,
      dp50: pDP >= 50,
      kc15: pKC >= 15,
      kc30: pKC >= 30,
      kc50: pKC >= 50,
      sv15: pSV >= 15,
      sv30: pSV >= 30,
      sv50: pSV >= 50,
      sr15: pSR >= 15,
      sr30: pSR >= 30,
      sr50: pSR >= 50
    };

    // 2. Apply Equipped Modules, Slot Implicits, Synergy Affixes, Shards, Harmonic Sequences & Signatures/Relics
    for (const slot of ALL_SLOT_KEYS) {
      const mod = equipped[slot];
      if (!mod || typeof mod !== 'object') continue;

      const hasProps = Array.isArray(mod.properties) && mod.properties.length > 0;
      if (hasProps) {
        if (mod.implicit) {
          _applyImplicitStats(mod.implicit, current, stateAcc);
        }
        for (const prop of mod.properties) {
          _applyModuleProperty(prop, current, stateAcc);
        }
        if (mod.synergyAffix) {
          _applySynergyAffix(mod.synergyAffix, current);
        }
      }

      if (mod.stabilityPenalty > 0) {
        stateAcc.moveSpeedMult *= Math.max(0.5, 1 - mod.stabilityPenalty);
      }

      if (Array.isArray(mod.sockets)) {
        for (const socket of mod.sockets) {
          if (!socket || !SHARD_ELEMENTS.includes(socket.element)) continue;
          const bonus = SHARD_TIER_BONUSES[socket.tier === 2 ? 2 : 1];
          current.elemBonuses[socket.element] += bonus.elemDamage;
          stateAcc.rawAttenuation += bonus.attenuation;
          current.socketedShardCount += 1;
          if (!current.dominantShardElement) current.dominantShardElement = socket.element;
        }
        const seq = detectHarmonicSequence(mod);
        if (seq) {
          current.harmonicSequences.push(seq);
          _applyHarmonicSynergy(seq, current, stateAcc);
        }
      }

      if (mod.signatureId && SIGNATURE_CATALOG[mod.signatureId]) {
        _applySignatureEffects(SIGNATURE_CATALOG[mod.signatureId], current, stateAcc);
      }
      if (mod.relicId && APEX_RELIC_CATALOG[mod.relicId]) {
        _applySignatureEffects(APEX_RELIC_CATALOG[mod.relicId], current, stateAcc);
      }
    }

    if (current.socketedShardCount > 0) {
      let bestEl = current.dominantShardElement;
      let bestVal = -1;
      for (const el of SHARD_ELEMENTS) {
        const val = current.elemBonuses[el] || 0;
        if (val > bestVal) {
          bestVal = val;
          bestEl = el;
        }
      }
      current.dominantShardElement = bestEl;
    }

    // 2b. Passive Auto-Resonance from Frequency Shards + Biome Mastery Bonuses & Penetration
    const autoRes = getAutoResonanceBonuses(meta);
    if (autoRes.totalUnits > 0) {
      for (const el of SHARD_ELEMENTS) {
        if (autoRes.elemBonuses[el] > 0) {
          current.elemBonuses[el] = (current.elemBonuses[el] || 0) + autoRes.elemBonuses[el];
        }
      }
      stateAcc.rawAttenuation += autoRes.rawAttenuation;
      current.autoResonanceUnits = autoRes.totalUnits;
      if (!current.dominantShardElement && autoRes.dominantElement) {
        current.dominantShardElement = autoRes.dominantElement;
      }
    }

    let masteryPen = 0;
    if (meta && typeof meta.getBiomeMasterySummary === 'function') {
      const bm = meta.getBiomeMasterySummary();
      if (bm && bm.elemDamageBonuses) {
        for (const el of SHARD_ELEMENTS) {
          if (bm.elemDamageBonuses[el] > 0) {
            current.elemBonuses[el] = (current.elemBonuses[el] || 0) + bm.elemDamageBonuses[el];
          }
        }
        masteryPen = bm.elementalPenetration || 0;
      }
    }

    const attrPen = ((current.attributeMilestones && current.attributeMilestones.dp50) ? 0.08 : 0)
      + Math.min(0.14, (pSR || 0) * 0.003);
    current.elementalPenetration = Math.min(0.40, _roundTo((current.elementalPenetration || 0) + attrPen + masteryPen, 3));

    // 3. Structural Vitality Barrier bonus when Barrier > 0 (from modules, Aegis Matrix, or Synthetic Singularity)
    const hasBarrier = current.bonusEnergyShield > 0
      || Boolean(current.specialEffects && (current.specialEffects.energyShield || current.specialEffects.chaosInoculation));
    if (pSV > 0 && hasBarrier) {
      current.bonusEnergyShield += 5 * pSV;
    }

    // 4. Finalize additive & multiplicative stat transforms
    current.damage = current.damage * (1 + stateAcc.additiveDamagePct) * stateAcc.damageMult;
    current.fireRate = current.fireRate * (1 + stateAcc.additiveFireRatePct) * stateAcc.fireRateMult;
    current.projectileSpeed = current.projectileSpeed * stateAcc.projSpeedMult;
    current.maxHp = current.maxHp * stateAcc.maxHpMult;
    current.speed = current.speed * stateAcc.moveSpeedMult;
    if (current.bonusEnergyShield > 0) {
      current.bonusEnergyShield = Math.max(0, Math.round(current.bonusEnergyShield * current.barrierMult));
    }

    // 5. Phase Attenuation Penalty & Damage Mitigation
    const activePhase = context.phase != null ? context.phase : (state.selectedPhase || 1);
    const singularityLevel = context.singularityLevel != null ? context.singularityLevel : (state.singularityLevel || 1);
    const phaseCfg = getPhaseConfig(activePhase, singularityLevel);
    const netAttenuation = stateAcc.rawAttenuation - (phaseCfg.attenuationPenalty || 0);
    const effectiveAttenuation = Math.max(0, netAttenuation);

    current.rawAttenuation = stateAcc.rawAttenuation;
    current.attenuationPenalty = phaseCfg.attenuationPenalty || 0;
    current.attenuationRating = netAttenuation;
    current.damageMitigation = effectiveAttenuation > 0
      ? Math.min(0.52, effectiveAttenuation / (effectiveAttenuation + 210))
      : 0;

    return current;
  }

  function getModulePowerScore(mod) {
    if (!mod || typeof mod !== 'object') return 0;
    const qWeight = { standard: 8, refined: 18, harmonic: 32, signature: 42, mythic: 56 }[mod.quality] || 8;
    const iLvl = Math.max(1, Number(mod.itemLevel) || (mod.itemTier || 1) * 10);
    const propCount = Array.isArray(mod.properties) ? mod.properties.length : 0;
    const filledSockets = Array.isArray(mod.sockets)
      ? mod.sockets.reduce((sum, s) => sum + (s ? (s.tier === 2 ? 12 : 6) : 0), 0)
      : 0;
    return Math.round(iLvl * 1.6 + qWeight + propCount * 5 + filledSockets + (mod.overdriven ? 14 : 0));
  }

  function getEquippedGearPower(meta) {
    const resolved = _resolveMeta(meta);
    if (!resolved || !resolved.state || !resolved.state.equippedModules) return 0;
    let total = 0;
    for (const mod of Object.values(resolved.state.equippedModules)) {
      if (mod) total += getModulePowerScore(mod);
    }
    return total;
  }

  const LORE_TRANSMISSIONS = [
    {
      id: 'biome_fire',
      category: 'biome',
      modeScope: 'overworld',
      speaker: 'SIGNAL',
      channelTag: '[VOID-INTERCEPT]',
      color: '#ff4422',
      title: 'Ember Rift',
      text: 'Thermal lattice spikes detected across fractured calderas. Residual ignite harmonics linger inside every molten seam.'
    },
    {
      id: 'biome_frost',
      category: 'biome',
      modeScope: 'overworld',
      speaker: 'SIGNAL',
      channelTag: '[VOID-INTERCEPT]',
      color: '#44aaff',
      title: 'Cryo Spire',
      text: 'Refracted cryo arrays lock motion along crystalline corridors. Even time-drift slows inside these sub-zero prisms.'
    },
    {
      id: 'biome_storm',
      category: 'biome',
      modeScope: 'overworld',
      speaker: 'SIGNAL',
      channelTag: '[VOID-INTERCEPT]',
      color: '#00eeff',
      title: 'Storm Conduit',
      text: 'High-voltage slipstreams arc between unshielded relay pylons. Step into the conduit lanes to outpace the pulse.'
    },
    {
      id: 'biome_toxin',
      category: 'biome',
      modeScope: 'overworld',
      speaker: 'SIGNAL',
      channelTag: '[VOID-INTERCEPT]',
      color: '#33ff66',
      title: 'Blight Basin',
      text: 'Volatile spore pockets saturate the lower honeycomb lattice. Prolonged exposure dissolves unattenuated hull plating.'
    },
    {
      id: 'biome_blood',
      category: 'biome',
      modeScope: 'overworld',
      speaker: 'SIGNAL',
      channelTag: '[VOID-INTERCEPT]',
      color: '#ff0055',
      title: 'Crimson Altar',
      text: 'Sanguine conduits throb beneath shattered ritual colonnades. Every siphon pulse answers sustained combat aggression.'
    },
    {
      id: 'biome_holy',
      category: 'biome',
      modeScope: 'overworld',
      speaker: 'SIGNAL',
      channelTag: '[VOID-INTERCEPT]',
      color: '#ffee88',
      title: 'Astral Choir',
      text: 'Suspended bastions hum with high-band harmonic resonance. Cross the starlit spans carefully above open void chasms.'
    },
    {
      id: 'biome_earth',
      category: 'biome',
      modeScope: 'overworld',
      speaker: 'SIGNAL',
      channelTag: '[VOID-INTERCEPT]',
      color: '#cc8844',
      title: 'Tectonic Vault',
      text: 'Dense basalt plates shift around heavy artillery bastions. Impact shockwaves echo across these reinforced gorges.'
    },
    {
      id: 'entity_archivist',
      category: 'entity',
      modeScope: 'overworld',
      speaker: 'ARCHIVIST',
      channelTag: '[ARCHIVE-ECHO]',
      color: '#00eeff',
      title: 'Echoes in the Static',
      text: 'Every felled construct writes a waveform back into my ledger. Bring me clean telemetry, and I will decode what the Lattice erased.'
    },
    {
      id: 'entity_artificer',
      category: 'entity',
      modeScope: 'overworld',
      speaker: 'ARTIFICER',
      channelTag: '[FORGE-SIGNAL]',
      color: '#ff00ff',
      title: 'Resonance Calibrated',
      text: 'Those wardens welded my forge offline, yet the harmonic core survived. Feed me shards and matter, and I will tune your frame past spec.'
    },
    {
      id: 'entity_broker',
      category: 'entity',
      modeScope: 'overworld',
      speaker: 'BROKER',
      channelTag: '[BLACK-CHANNEL]',
      color: '#ffd700',
      title: 'Unlisted Inventory',
      text: 'Nice timing out there, runner. Standard channels carry junk, but my black-market capsules hold hardware the Sanctum denies exists.'
    },
    {
      id: 'encounter_wanderer',
      category: 'encounter',
      modeScope: 'overworld',
      speaker: 'WANDERER',
      channelTag: '[DRIFT-VECTOR]',
      color: '#00ffaa',
      title: 'Signal Beyond the Grid',
      text: 'I uncoupled from the Megalattice cycles before its collapse. Take this shard, keep moving, and never mistake stillness for safety.'
    },
    {
      id: 'encounter_mythic_vault',
      category: 'encounter',
      modeScope: 'overworld',
      speaker: 'ARCHIVIST',
      channelTag: '[ARCHIVE-ECHO]',
      color: '#ffcc33',
      title: 'Apex Relic Unsealed',
      text: 'Vault seals broken on the outer rim. That relic carries pre-fracture architecture built to bend core combat laws.'
    },
    {
      id: 'citadel_first_clear',
      category: 'encounter',
      modeScope: 'overworld',
      speaker: 'SIGNAL',
      channelTag: '[VOID-INTERCEPT]',
      color: '#ffd700',
      title: 'Citadel Frequency Attuned',
      text: 'Guardian frequency silenced and folded into your core matrix. New elemental channels and Abyssal gates now respond to your signal.'
    },
    {
      id: 'encounter_nemesis',
      category: 'encounter',
      modeScope: 'overworld',
      speaker: 'BROKER',
      channelTag: '[BLACK-CHANNEL]',
      color: '#ff2266',
      title: 'Vendetta Signal Locked',
      text: 'That hunter logged your hull signature and climbed the food chain on it. Collect the bounty before it writes your name twice.'
    },
    {
      id: 'phase_1',
      category: 'phase',
      modeScope: 'overworld',
      speaker: 'SIGNAL',
      channelTag: '[VOID-INTERCEPT]',
      color: '#00ffff',
      title: 'Phase I: Harmonic',
      text: 'Baseline resonance holds across all seven sectors. Chart the outer monoliths while the Lattice still tolerates your wake.'
    },
    {
      id: 'phase_2',
      category: 'phase',
      modeScope: 'overworld',
      speaker: 'SIGNAL',
      channelTag: '[VOID-INTERCEPT]',
      color: '#00eeff',
      title: 'Phase II: Overclocked',
      text: 'Containment walls are bleeding across sector dividers. Cross-biome anomalies now hunt outside their native bands.'
    },
    {
      id: 'phase_3',
      category: 'phase',
      modeScope: 'overworld',
      speaker: 'SIGNAL',
      channelTag: '[VOID-INTERCEPT]',
      color: '#ffaa00',
      title: 'Phase III: Critical',
      text: 'Attenuation drag has surged past safe thresholds. Elite cadres carry dual lattice modifiers across every ring.'
    },
    {
      id: 'phase_4',
      category: 'phase',
      modeScope: 'overworld',
      speaker: 'SIGNAL',
      channelTag: '[VOID-INTERCEPT]',
      color: '#ff44ff',
      title: 'Phase IV: Singularity',
      text: 'Reality compression nears maximum density around the central spire. Only fully tuned builds endure the Singularity tide.'
    },
    {
      id: 'architect_phase2',
      category: 'architect',
      modeScope: 'overworld',
      speaker: 'ARCHITECT',
      channelTag: '[CORE-DIRECTIVE]',
      color: '#ffd700',
      title: 'Directive II: Overdrive',
      text: 'Variance exceeds tolerance. Deploying resonance pylons and auxiliary constructs to prune an unauthorized signal.'
    },
    {
      id: 'architect_phase3',
      category: 'architect',
      modeScope: 'overworld',
      speaker: 'ARCHITECT',
      channelTag: '[CORE-DIRECTIVE]',
      color: '#ff00ff',
      title: 'Directive III: Singularity',
      text: 'Sanctum protocols revoked. Collapsing all spare frequencies into terminal containment around your core.'
    },
    {
      id: 'architect_shattered',
      category: 'architect',
      modeScope: 'overworld',
      speaker: 'ARCHITECT',
      channelTag: '[CORE-DIRECTIVE]',
      color: '#ffd700',
      title: 'Megalattice Reboot',
      text: 'Sovereign node fractured, yet the deeper recursion stays intact. Higher Phase harmonics are already calibrating.'
    },
    {
      id: 'descent_crucible_entry',
      category: 'descent',
      modeScope: 'descent',
      speaker: 'SIGNAL',
      channelTag: '[CRUCIBLE-LOG]',
      color: '#ff22ee',
      title: 'Crucible Entry',
      text: 'Octagonal containment sealed around the lower core. No safe perimeter exists here, only escalating wave pressure.'
    },
    {
      id: 'descent_depth_5',
      category: 'descent',
      modeScope: 'descent',
      speaker: 'SIGNAL',
      channelTag: '[CRUCIBLE-LOG]',
      color: '#cc44ff',
      title: 'Crucible Depth 5',
      text: 'Depth five harmonic lock engaged. A Crucible Warden enters the octagon to stress-test your build under fire.'
    },
    {
      id: 'descent_depth_10',
      category: 'descent',
      modeScope: 'descent',
      speaker: 'SIGNAL',
      channelTag: '[CRUCIBLE-LOG]',
      color: '#ff3388',
      title: 'Crucible Depth 10',
      text: 'Depth ten telemetry breaches deep-core limits. Crucible gravity tightens as sovereign patterns converge.'
    }
  ].map(entry => Object.freeze(entry));

  const _LORE_BY_ID = Object.create(null);
  for (const entry of LORE_TRANSMISSIONS) {
    _LORE_BY_ID[entry.id] = entry;
  }

  function getLoreTransmission(id) {
    if (typeof id !== 'string' || !id) return null;
    return _LORE_BY_ID[id] || null;
  }

  function getLoreTransmissionsByCategory(category) {
    if (!category || category === 'all') return LORE_TRANSMISSIONS.slice();
    return LORE_TRANSMISSIONS.filter(t => t.category === category);
  }

  function getTransmissionProgress(unlockedIds = [], modeFilter = null) {
    const pool = modeFilter
      ? LORE_TRANSMISSIONS.filter(t => t.modeScope === modeFilter)
      : LORE_TRANSMISSIONS;
    const seen = new Set();
    if (unlockedIds && typeof unlockedIds[Symbol.iterator] === 'function') {
      for (const id of unlockedIds) {
        if (typeof id === 'string' && _LORE_BY_ID[id]) {
          seen.add(id);
        }
      }
    }
    let unlocked = 0;
    let overworldUnlocked = 0;
    let overworldTotal = 0;
    let descentUnlocked = 0;
    let descentTotal = 0;
    for (const t of LORE_TRANSMISSIONS) {
      const has = seen.has(t.id);
      if (t.modeScope === 'descent') {
        descentTotal += 1;
        if (has) descentUnlocked += 1;
      } else {
        overworldTotal += 1;
        if (has) overworldUnlocked += 1;
      }
    }
    for (const t of pool) {
      if (seen.has(t.id)) unlocked += 1;
    }
    const total = pool.length;
    const ratio = total > 0 ? unlocked / total : 0;
    return {
      unlocked,
      total,
      ratio,
      pct: Math.round(ratio * 100),
      byScope: {
        overworld: { unlocked: overworldUnlocked, total: overworldTotal },
        descent: { unlocked: descentUnlocked, total: descentTotal }
      }
    };
  }

  const SignalEchoes = (() => {
    const REACTIVE_ECHOES = Object.freeze([
      // Sanctum Entities: ARCHIVIST (4)
      {
        id: 'echo_archivist_ci',
        trigger: 'sanctum_entity',
        modeScope: 'overworld',
        speaker: 'ARCHIVIST',
        channelTag: '[ARCHIVE-ECHO]',
        color: '#00eeff',
        title: 'Singularity Frame',
        text: 'One hull unit anchored behind pure barrier math. Your waveform reads like a pre-fracture ghost.',
        priority: 10,
        conditions: { entityId: 'archivist', keystoneId: 'chaos_inoculation' }
      },
      {
        id: 'echo_archivist_bond',
        trigger: 'sanctum_entity',
        modeScope: 'overworld',
        speaker: 'ARCHIVIST',
        channelTag: '[ARCHIVE-ECHO]',
        color: '#00eeff',
        title: 'Autonomous Chorus',
        text: 'Two turrets speak where your emitter stays silent. Even the Lattice hesitates before dual vectors.',
        priority: 10,
        conditions: { entityId: 'archivist', keystoneId: 'ancestral_bond' }
      },
      {
        id: 'echo_archivist_phase',
        trigger: 'sanctum_entity',
        modeScope: 'overworld',
        speaker: 'ARCHIVIST',
        channelTag: '[ARCHIVE-ECHO]',
        color: '#00eeff',
        title: 'Lattice Compression',
        text: 'High-phase drift scrambles every outer sector archive. Return clean telemetry before the record tears.',
        priority: 6,
        conditions: { entityId: 'archivist', minPhase: 3 }
      },
      {
        id: 'echo_archivist_base',
        trigger: 'sanctum_entity',
        modeScope: 'overworld',
        speaker: 'ARCHIVIST',
        channelTag: '[ARCHIVE-ECHO]',
        color: '#00eeff',
        title: 'Ledger Open',
        text: 'Sector contracts await your combat feed. Every anomaly felled restores what the Lattice erased.',
        priority: 1,
        conditions: { entityId: 'archivist' }
      },
      // Sanctum Entities: ARTIFICER (4)
      {
        id: 'echo_artificer_fire',
        trigger: 'sanctum_entity',
        modeScope: 'overworld',
        speaker: 'ARTIFICER',
        channelTag: '[FORGE-SIGNAL]',
        color: '#ff00ff',
        title: 'Thermal Lock',
        text: 'Absolute Ignition burns every circuit monochrome. I can still tune that furnace past tolerance.',
        priority: 10,
        conditions: { entityId: 'artificer', keystoneId: 'avatar_of_fire' }
      },
      {
        id: 'echo_artificer_harmonic',
        trigger: 'sanctum_entity',
        modeScope: 'overworld',
        speaker: 'ARTIFICER',
        channelTag: '[FORGE-SIGNAL]',
        color: '#ff00ff',
        title: 'True Resonance',
        text: 'Those socketed shards sing in tight harmonic lock. Keep feeding the frame while the chord holds.',
        priority: 10,
        conditions: { entityId: 'artificer', hasHarmonicSequence: true }
      },
      {
        id: 'echo_artificer_glass',
        trigger: 'sanctum_entity',
        modeScope: 'overworld',
        speaker: 'ARTIFICER',
        channelTag: '[FORGE-SIGNAL]',
        color: '#ff00ff',
        title: 'Razor Margin',
        text: 'Overclocked Core leaves zero hull for error. One clean volley makes plating an obsolete debate.',
        priority: 8,
        conditions: { entityId: 'artificer', keystoneId: 'glass_cannon' }
      },
      {
        id: 'echo_artificer_base',
        trigger: 'sanctum_entity',
        modeScope: 'overworld',
        speaker: 'ARTIFICER',
        channelTag: '[FORGE-SIGNAL]',
        color: '#ff00ff',
        title: 'Anvil Warm',
        text: 'Shards and raw matter keep my coils singing. Drop a module on the bench and watch output climb.',
        priority: 1,
        conditions: { entityId: 'artificer' }
      },
      // Sanctum Entities: BROKER (4)
      {
        id: 'echo_broker_nemesis',
        trigger: 'sanctum_entity',
        modeScope: 'overworld',
        speaker: 'BROKER',
        channelTag: '[BLACK-CHANNEL]',
        color: '#ffd700',
        title: 'Open Bounty',
        text: 'A Nemesis carries your old hull signature out there. Claim that bounty before the hunter collects.',
        priority: 10,
        conditions: { entityId: 'broker', hasNemesis: true }
      },
      {
        id: 'echo_broker_streak',
        trigger: 'sanctum_entity',
        modeScope: 'overworld',
        speaker: 'BROKER',
        channelTag: '[BLACK-CHANNEL]',
        color: '#ffd700',
        title: 'Hot Streak',
        text: 'Clean extractions keep my private ledgers generous. Push deeper while the streak multiplier pays.',
        priority: 10,
        conditions: { entityId: 'broker', minStreak: 2 }
      },
      {
        id: 'echo_broker_bleed',
        trigger: 'sanctum_entity',
        modeScope: 'overworld',
        speaker: 'BROKER',
        channelTag: '[BLACK-CHANNEL]',
        color: '#ffd700',
        title: 'Crimson Margin',
        text: 'Hemorrhaging Nanobots trade burst spikes for relentless bleed. My buyers always respect sharp odds.',
        priority: 8,
        conditions: { entityId: 'broker', keystoneId: 'crimson_dance' }
      },
      {
        id: 'echo_broker_base',
        trigger: 'sanctum_entity',
        modeScope: 'overworld',
        speaker: 'BROKER',
        channelTag: '[BLACK-CHANNEL]',
        color: '#ffd700',
        title: 'Off-Grid Stock',
        text: 'My capsules bypass standard Lattice audits completely. Bring crystals if you want unlisted hardware.',
        priority: 1,
        conditions: { entityId: 'broker' }
      },
      // Wanderer Echo (2)
      {
        id: 'echo_wanderer_harmonic',
        trigger: 'wanderer_echo',
        modeScope: 'overworld',
        speaker: 'WANDERER',
        channelTag: '[DRIFT-VECTOR]',
        color: '#00ffaa',
        title: 'Shared Frequency',
        text: 'Your sockets echo the outer drift lanes I walked alone. Hold that rhythm when the rings tighten.',
        priority: 8,
        conditions: { hasHarmonicSequence: true }
      },
      {
        id: 'echo_wanderer_base',
        trigger: 'wanderer_echo',
        modeScope: 'overworld',
        speaker: 'WANDERER',
        channelTag: '[DRIFT-VECTOR]',
        color: '#00ffaa',
        title: 'Untethered Path',
        text: 'Another pass across the borderlands, runner. Take this shard and stay ahead of the enclosing tide.',
        priority: 1,
        conditions: {}
      },
      // Abyssal Rift (2)
      {
        id: 'echo_rift_fire',
        trigger: 'abyssal_rift',
        modeScope: 'overworld',
        speaker: 'SIGNAL',
        channelTag: '[VOID-INTERCEPT]',
        color: '#ff4422',
        title: 'Ember Rift Sealed',
        text: 'Thermal abyssal pressure vents cleanly into your core. Residual ash harmonics steady the outer rim.',
        priority: 8,
        conditions: { element: 'fire' }
      },
      {
        id: 'echo_rift_base',
        trigger: 'abyssal_rift',
        modeScope: 'overworld',
        speaker: 'SIGNAL',
        channelTag: '[VOID-INTERCEPT]',
        color: '#00eeff',
        title: 'Abyssal Rift Cleared',
        text: 'Outer-rim distortion collapsed and locked into your wake. Take the return beacon before pressure spikes.',
        priority: 1,
        conditions: {}
      },
      // Volatile Pact Fulfilled (2)
      {
        id: 'echo_pact_glass',
        trigger: 'pact_fulfilled',
        modeScope: 'overworld',
        speaker: 'BROKER',
        channelTag: '[BLACK-CHANNEL]',
        color: '#ffd700',
        title: 'Zero-Margin Pact',
        text: 'Twelve clean kills on a single hull unit takes nerve. That obelisk practically owes you interest.',
        priority: 8,
        conditions: { keystoneId: 'glass_cannon' }
      },
      {
        id: 'echo_pact_base',
        trigger: 'pact_fulfilled',
        modeScope: 'overworld',
        speaker: 'BROKER',
        channelTag: '[BLACK-CHANNEL]',
        color: '#ffd700',
        title: 'Pact Balanced',
        text: 'Not a single hull fracture during the ambush window. The black channel respects disciplined odds.',
        priority: 1,
        conditions: {}
      },
      // Citadel Clear (2)
      {
        id: 'echo_citadel_streak',
        trigger: 'citadel_clear',
        modeScope: 'overworld',
        speaker: 'SIGNAL',
        channelTag: '[VOID-INTERCEPT]',
        color: '#ffd700',
        title: 'Chain Resonance',
        text: 'Another Citadel beacon locks onto your extraction streak. Each silenced bastion weakens the central spire.',
        priority: 8,
        conditions: { minStreak: 2 }
      },
      {
        id: 'echo_citadel_base',
        trigger: 'citadel_clear',
        modeScope: 'overworld',
        speaker: 'SIGNAL',
        channelTag: '[VOID-INTERCEPT]',
        color: '#00eeff',
        title: 'Citadel Stabilized',
        text: 'Guardian frequency silenced across the sector bastion. The central spire registers one fewer anchor.',
        priority: 1,
        conditions: {}
      },
      // Architect Summon (2)
      {
        id: 'echo_architect_summon_phase',
        trigger: 'architect_summon',
        modeScope: 'overworld',
        speaker: 'ARCHITECT',
        channelTag: '[CORE-DIRECTIVE]',
        color: '#ff44ff',
        title: 'Recursive Escalation',
        text: 'Elevated phase harmonics detected at the spire. Containment escalates to sovereign combat telemetry.',
        priority: 8,
        conditions: { minPhase: 2 }
      },
      {
        id: 'echo_architect_summon_base',
        trigger: 'architect_summon',
        modeScope: 'overworld',
        speaker: 'ARCHITECT',
        channelTag: '[CORE-DIRECTIVE]',
        color: '#ff44ff',
        title: 'Directive Engaged',
        text: 'Seven Citadel locks severed at once. Stand inside the spire and answer sovereign convergence.',
        priority: 1,
        conditions: {}
      },
      // Architect Clear (2)
      {
        id: 'echo_architect_clear_phase',
        trigger: 'architect_clear',
        modeScope: 'overworld',
        speaker: 'ARCHITECT',
        channelTag: '[CORE-DIRECTIVE]',
        color: '#ff44ff',
        title: 'Recursion Intact',
        text: 'Another phase shell fractured under your volley. Deeper Megalattice frequencies are already waking.',
        priority: 8,
        conditions: { minPhase: 2 }
      },
      {
        id: 'echo_architect_clear_base',
        trigger: 'architect_clear',
        modeScope: 'overworld',
        speaker: 'ARCHITECT',
        channelTag: '[CORE-DIRECTIVE]',
        color: '#ff44ff',
        title: 'Sovereign Pruned',
        text: 'My spire frame collapses, yet the core protocol persists. Return when higher harmonics call.',
        priority: 1,
        conditions: {}
      },
      // Crucible Warden (2, strictly descent-scoped)
      {
        id: 'echo_crucible_deep',
        trigger: 'crucible_warden',
        modeScope: 'descent',
        speaker: 'SIGNAL',
        channelTag: '[CRUCIBLE-LOG]',
        color: '#ff3388',
        title: 'Deep Crucible Surge',
        text: 'Deep-core pressure spikes as a sovereign Warden locks the octagon. Hold your vector under crushing fire.',
        priority: 9,
        conditions: { minDepth: 10 }
      },
      {
        id: 'echo_crucible_warden',
        trigger: 'crucible_warden',
        modeScope: 'descent',
        speaker: 'SIGNAL',
        channelTag: '[CRUCIBLE-LOG]',
        color: '#cc44ff',
        title: 'Warden Pattern Locked',
        text: 'Octagon containment seals around a fresh Crucible Warden. Break its guard before the wave timer closes.',
        priority: 1,
        conditions: { minDepth: 5 }
      }
    ].map(entry => Object.freeze({
      ...entry,
      conditions: Object.freeze({ ...(entry.conditions || {}) })
    })));

    function _matchesConditions(cond, norm) {
      if (!cond) return true;
      if (cond.entityId !== undefined && cond.entityId !== norm.entityId) return false;
      if (cond.keystoneId !== undefined && !norm.keystoneSet.has(cond.keystoneId)) return false;
      if (cond.hasHarmonicSequence !== undefined && Boolean(cond.hasHarmonicSequence) !== norm.hasHarmonicSequence) return false;
      if (cond.hasNemesis !== undefined && Boolean(cond.hasNemesis) !== norm.hasNemesis) return false;
      if (cond.minStreak !== undefined && norm.streak < cond.minStreak) return false;
      if (cond.minPhase !== undefined && norm.phase < cond.minPhase) return false;
      if (cond.minDepth !== undefined && norm.depth < cond.minDepth) return false;
      if (cond.element !== undefined && cond.element !== norm.element) return false;
      return true;
    }

    /** Selects the highest-priority reactive echo deterministically without Math.random(). */
    function selectReactiveEcho(trigger, context = {}) {
      if (typeof trigger !== 'string' || !trigger) return null;
      const ctx = (context && typeof context === 'object') ? context : {};
      const modeScope = (ctx.mode === 'descent' || ctx.modeScope === 'descent' || ctx.isDescentMode)
        ? 'descent'
        : 'overworld';

      const keystoneSet = new Set();
      if (ctx.activeKeystoneIds && typeof ctx.activeKeystoneIds[Symbol.iterator] === 'function') {
        for (const k of ctx.activeKeystoneIds) {
          if (typeof k === 'string' && k) keystoneSet.add(k);
        }
      }
      if (typeof ctx.keystoneId === 'string' && ctx.keystoneId) {
        keystoneSet.add(ctx.keystoneId);
      }

      const norm = {
        entityId: typeof ctx.entityId === 'string' ? ctx.entityId.trim() : '',
        keystoneSet,
        hasHarmonicSequence: Boolean(ctx.hasHarmonicSequence),
        hasNemesis: Boolean(ctx.hasNemesis),
        streak: Math.max(0, Math.floor(Number(ctx.streak ?? ctx.extractionStreak) || 0)),
        phase: Math.max(1, Math.floor(Number(ctx.phase) || 1)),
        depth: Math.max(1, Math.floor(Number(ctx.depth ?? ctx.descentDepth) || 1)),
        element: typeof ctx.element === 'string' ? ctx.element.trim().toLowerCase() : ''
      };

      const matches = [];
      for (const entry of REACTIVE_ECHOES) {
        if (entry.trigger === trigger && entry.modeScope === modeScope && _matchesConditions(entry.conditions, norm)) {
          matches.push(entry);
        }
      }
      if (matches.length === 0) return null;

      const seenSet = new Set();
      if (ctx.seenIds && typeof ctx.seenIds[Symbol.iterator] === 'function') {
        for (const id of ctx.seenIds) {
          if (typeof id === 'string' && id) seenSet.add(id);
        }
      }
      const unseen = matches.filter(e => !seenSet.has(e.id));
      let pool = unseen;
      if (pool.length === 0) {
        const lastId = typeof ctx.lastId === 'string' ? ctx.lastId : '';
        const withoutLast = (lastId && matches.length > 1) ? matches.filter(e => e.id !== lastId) : matches;
        pool = withoutLast.length > 0 ? withoutLast : matches;
      }

      let maxPriority = -Infinity;
      for (const e of pool) {
        const p = Number(e.priority) || 0;
        if (p > maxPriority) maxPriority = p;
      }
      const topTier = pool.filter(e => (Number(e.priority) || 0) === maxPriority);
      const runCount = Math.max(0, Math.floor(Number(ctx.runCount) || 0));
      return topTier[runCount % topTier.length] || null;
    }

    return Object.freeze({
      REACTIVE_ECHOES,
      selectReactiveEcho
    });
  })();

  function compactInPlace(arr, shouldRemoveFn) {
    if (!Array.isArray(arr) || typeof shouldRemoveFn !== 'function') return arr;
    let writeIdx = 0;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (!shouldRemoveFn(item, i, arr)) {
        arr[writeIdx++] = item;
      }
    }
    arr.length = writeIdx;
    return arr;
  }

  function createCombatBroadphase() {
    const _sorted = [];
    const bp = {
      _sorted,
      maxRadius: 0,
      sourceRef: null,
      sourceLen: 0,
      rebuild(enemies) {
        bp.sourceRef = Array.isArray(enemies) ? enemies : null;
        bp.sourceLen = bp.sourceRef ? bp.sourceRef.length : 0;
        _sorted.length = 0;
        bp.maxRadius = 0;
        if (!bp.sourceRef || bp.sourceLen === 0) return bp;

        for (let i = 0; i < bp.sourceLen; i++) {
          const e = bp.sourceRef[i];
          if (!e || e.markedForDeletion || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
          const er = Number.isFinite(e.radius) && e.radius > 0 ? e.radius : 0;
          if (er > bp.maxRadius) bp.maxRadius = er;
          _sorted.push(e);
        }

        for (let i = 1; i < _sorted.length; i++) {
          const cur = _sorted[i];
          const curX = cur.x;
          let j = i - 1;
          while (j >= 0 && _sorted[j].x > curX) {
            _sorted[j + 1] = _sorted[j];
            j--;
          }
          _sorted[j + 1] = cur;
        }
        return bp;
      },
      _lowerBound(minX) {
        let lo = 0;
        let hi = _sorted.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (_sorted[mid].x < minX) lo = mid + 1;
          else hi = mid;
        }
        return lo;
      },
      queryXRangeInto(minX, maxX, out) {
        if (!Array.isArray(out)) return [];
        out.length = 0;
        if (!Number.isFinite(minX) || !Number.isFinite(maxX) || minX > maxX || _sorted.length === 0) {
          return out;
        }
        for (let i = bp._lowerBound(minX); i < _sorted.length; i++) {
          const e = _sorted[i];
          if (e.x > maxX) break;
          out.push(e);
        }
        return out;
      },
      queryRadiusInto(cx, cy, radius, out, includeEnemyRadius = false) {
        if (!Array.isArray(out)) return [];
        out.length = 0;
        if (
          !Number.isFinite(cx) ||
          !Number.isFinite(cy) ||
          !Number.isFinite(radius) ||
          radius < 0 ||
          _sorted.length === 0
        ) {
          return out;
        }

        if (!includeEnemyRadius) {
          const searchMinX = cx - radius;
          const searchMaxX = cx + radius;
          const rSq = radius * radius;
          for (let i = bp._lowerBound(searchMinX); i < _sorted.length; i++) {
            const e = _sorted[i];
            if (e.x > searchMaxX) break;
            const dx = e.x - cx;
            if (dx * dx > rSq) continue;
            const dy = e.y - cy;
            if (dx * dx + dy * dy <= rSq) out.push(e);
          }
          return out;
        }

        const searchPad = radius + bp.maxRadius;
        const searchMinX = cx - searchPad;
        const searchMaxX = cx + searchPad;
        for (let i = bp._lowerBound(searchMinX); i < _sorted.length; i++) {
          const e = _sorted[i];
          if (e.x > searchMaxX) break;
          const er = Number.isFinite(e.radius) && e.radius > 0 ? e.radius : 0;
          const rSum = radius + er;
          const rSumSq = rSum * rSum;
          const dx = e.x - cx;
          if (dx * dx > rSumSq) continue;
          const dy = e.y - cy;
          if (dx * dx + dy * dy <= rSumSq) out.push(e);
        }
        return out;
      }
    };
    return bp;
  }

  function createSignalTelemetry() {
    let frameMs = 16.67;
    let peakMs = 16.67;
    let entityLoad = 0;
    let hz = 60;
    let fidelity = 'RESONANT';
    let sampleCount = 0;

    function _classify(ms) {
      if (ms <= 17.5) return 'RESONANT';
      if (ms <= 24.0) return 'FOCUSED';
      return 'OVERCLOCK_PERF';
    }

    const telemetry = {
      get frameMs() { return frameMs; },
      get peakMs() { return peakMs; },
      get entityLoad() { return entityLoad; },
      get hz() { return hz; },
      get fidelity() { return fidelity; },
      reset() {
        frameMs = 16.67;
        peakMs = 16.67;
        entityLoad = 0;
        hz = 60;
        fidelity = 'RESONANT';
        sampleCount = 0;
      },
      recordFrame(rawMs, load = 0) {
        if (!Number.isFinite(rawMs)) return telemetry;
        const clamped = Math.max(1, Math.min(100, rawMs));
        frameMs = frameMs * 0.85 + clamped * 0.15;
        peakMs = sampleCount === 0 ? clamped : Math.max(peakMs * 0.992, clamped);
        sampleCount++;
        entityLoad = Number.isFinite(load) ? Math.max(0, Math.round(load)) : 0;
        hz = Math.max(1, Math.round(1000 / frameMs));
        fidelity = _classify(frameMs);
        return telemetry;
      },
      getFidelity() {
        return fidelity;
      },
      getParticleBudget() {
        if (fidelity === 'OVERCLOCK_PERF') return 120;
        if (fidelity === 'FOCUSED') return 180;
        return 250;
      },
      getFidelityColor() {
        if (fidelity === 'OVERCLOCK_PERF') return '#ff6622';
        if (fidelity === 'FOCUSED') return '#ffd700';
        return '#00ffaa';
      },
      formatTelemetryBadge(compact = false) {
        if (!compact) return `SIG ${hz}Hz [${fidelity}]`;
        const shortTag = fidelity === 'OVERCLOCK_PERF'
          ? 'PERF'
          : (fidelity === 'FOCUSED' ? 'FOC' : 'RES');
        return `SIG ${hz}Hz [${shortTag}]`;
      }
    };
    return telemetry;
  }

  const ACHIEVEMENT_CATEGORIES = Object.freeze([
    Object.freeze({ id: 'combat', label: 'COMBAT', color: '#ff4466' }),
    Object.freeze({ id: 'biomes', label: 'BIOMES', color: '#00eeff' }),
    Object.freeze({ id: 'buildcraft', label: 'BUILDCRAFT', color: '#ffd700' }),
    Object.freeze({ id: 'descent', label: 'DESCENT', color: '#ff22ee' }),
    Object.freeze({ id: 'challenge', label: 'CHALLENGE', color: '#ffaa00' }),
    Object.freeze({ id: 'secrets', label: 'SIGNALS', color: '#00ffaa' })
  ]);

  const ACHIEVEMENT_CATALOG = Object.freeze([
    // Combat (5)
    {
      id: 'combat_purge_500',
      category: 'combat',
      title: 'Grid Purger',
      hint: 'Defeat 500 hostiles across deployments.',
      color: '#ff4466',
      target: 500,
      reward: { matter: 60, crystals: 1 },
      modeScope: 'any'
    },
    {
      id: 'combat_streak_35',
      category: 'combat',
      title: 'Overdrive Chain',
      hint: 'Reach a 35x kill streak in a single deployment.',
      color: '#ff6622',
      target: 35,
      reward: { matter: 45 },
      modeScope: 'any'
    },
    {
      id: 'combat_exposed_boss',
      category: 'combat',
      title: 'Surgical Shatter',
      hint: 'Defeat a Boss while its armor is Exposed.',
      color: '#00ffaa',
      target: 1,
      reward: { matter: 55, attrPoints: 1 },
      modeScope: 'any'
    },
    {
      id: 'combat_nemesis_slain',
      category: 'combat',
      title: 'Vendetta Closed',
      hint: 'Track down and eliminate a hunter Nemesis.',
      color: '#ff2266',
      target: 1,
      reward: { matter: 70, crystals: 1 },
      modeScope: 'overworld'
    },
    {
      id: 'combat_volatile_pact',
      category: 'combat',
      title: 'Pact Unbroken',
      hint: 'Complete a Volatile Pact ambush without hull damage.',
      color: '#ff3366',
      target: 1,
      reward: { matter: 65, perkPoints: 1 },
      modeScope: 'overworld'
    },
    // Biomes (4)
    {
      id: 'biomes_sectors_all',
      category: 'biomes',
      title: 'Lattice Cartographer',
      hint: 'Discover all seven outer elemental Sectors.',
      color: '#00eeff',
      target: 7,
      reward: { matter: 55, attrPoints: 1 },
      modeScope: 'overworld'
    },
    {
      id: 'biomes_citadel_triad',
      category: 'biomes',
      title: 'Triad Attunement',
      hint: 'Conquer three distinct Sector Citadels.',
      color: '#44aaff',
      target: 3,
      reward: { matter: 65, perkPoints: 1 },
      modeScope: 'overworld'
    },
    {
      id: 'biomes_citadel_all',
      category: 'biomes',
      title: 'Megalattice Sovereign',
      hint: 'Conquer all seven Sector Citadels.',
      color: '#ffd700',
      target: 7,
      reward: { matter: 120, crystals: 2 },
      modeScope: 'overworld'
    },
    {
      id: 'biomes_architect',
      category: 'biomes',
      title: 'Architect Shattered',
      hint: 'Defeat The Architect in any World Phase.',
      color: '#ffffff',
      target: 1,
      reward: { matter: 100, crystals: 2, fractureKey: 'volatile_flux' },
      modeScope: 'overworld'
    },
    // Buildcraft (6)
    {
      id: 'build_keystone_overclocked',
      category: 'buildcraft',
      title: 'Overclocked Core Clear',
      hint: 'Defeat a Boss while wielding Overclocked Core.',
      color: '#ffd700',
      target: 1,
      reward: { matter: 75, crystals: 1 },
      modeScope: 'any'
    },
    {
      id: 'build_keystone_architect',
      category: 'buildcraft',
      title: 'Autonomous Architect Clear',
      hint: 'Defeat a Boss while wielding Autonomous Architect.',
      color: '#00eeff',
      target: 1,
      reward: { matter: 75, perkPoints: 1 },
      modeScope: 'any'
    },
    {
      id: 'build_keystone_ignition',
      category: 'buildcraft',
      title: 'Absolute Ignition Clear',
      hint: 'Defeat a Boss while wielding Absolute Ignition.',
      color: '#ff4422',
      target: 1,
      reward: { matter: 75, attrPoints: 1 },
      modeScope: 'any'
    },
    {
      id: 'build_keystone_singularity',
      category: 'buildcraft',
      title: 'Synthetic Singularity Clear',
      hint: 'Defeat a Boss while wielding Synthetic Singularity.',
      color: '#33ff66',
      target: 1,
      reward: { matter: 75, crystals: 1 },
      modeScope: 'any'
    },
    {
      id: 'build_keystone_hemorrhage',
      category: 'buildcraft',
      title: 'Hemorrhaging Nanobots Clear',
      hint: 'Defeat a Boss while wielding Hemorrhaging Nanobots.',
      color: '#ff0055',
      target: 1,
      reward: { matter: 75, perkPoints: 1 },
      modeScope: 'any'
    },
    {
      id: 'build_harmonic_boss',
      category: 'buildcraft',
      title: 'Harmonic Convergence',
      hint: 'Defeat a Boss with an active Harmonic Sequence.',
      color: '#ffd700',
      target: 1,
      reward: { matter: 65, attrPoints: 1 },
      modeScope: 'any'
    },
    // Descent (4)
    {
      id: 'descent_depth_5',
      category: 'descent',
      title: 'Crucible Threshold',
      hint: 'Reach Depth 5 in Singularity Descent.',
      color: '#cc44ff',
      target: 5,
      reward: { matter: 55, perkPoints: 1 },
      modeScope: 'descent'
    },
    {
      id: 'descent_depth_10',
      category: 'descent',
      title: 'Deep-Core Breach',
      hint: 'Reach Depth 10 in Singularity Descent.',
      color: '#ff22ee',
      target: 10,
      reward: { matter: 95, crystals: 1 },
      modeScope: 'descent'
    },
    {
      id: 'descent_warden_1',
      category: 'descent',
      title: 'Warden Breaker',
      hint: 'Eliminate a Crucible Warden in Singularity Descent.',
      color: '#ff3388',
      target: 1,
      reward: { matter: 70, attrPoints: 1 },
      modeScope: 'descent'
    },
    {
      id: 'descent_warden_3',
      category: 'descent',
      title: 'Crucible Dominator',
      hint: 'Eliminate three Crucible Wardens across Descent runs.',
      color: '#ff00ff',
      target: 3,
      reward: { matter: 110, crystals: 2, fractureKey: 'twin_wardens' },
      modeScope: 'descent'
    },
    // Challenge (5)
    {
      id: 'challenge_flawless_boss',
      category: 'challenge',
      title: 'Untouchable Hull',
      hint: 'Defeat any Boss without taking Hull damage.',
      color: '#ffee88',
      target: 1,
      reward: { matter: 85, crystals: 1, attrPoints: 1 },
      modeScope: 'any'
    },
    {
      id: 'challenge_fast_citadel',
      category: 'challenge',
      title: 'Blitz Protocol',
      hint: 'Defeat a Citadel Guardian within 45 seconds.',
      color: '#ffaa00',
      target: 1,
      reward: { matter: 70, fractureKey: 'dense_lattice' },
      modeScope: 'overworld'
    },
    {
      id: 'challenge_fracture_boss',
      category: 'challenge',
      title: 'Fractured Apex',
      hint: 'Defeat a Boss while a Fracture Key is active.',
      color: '#ff88ff',
      target: 1,
      reward: { matter: 75, perkPoints: 1 },
      modeScope: 'any'
    },
    {
      id: 'challenge_daily_60',
      category: 'challenge',
      title: 'Daily Endurance',
      hint: 'Survive 60 seconds inside a Daily Run.',
      color: '#ffd700',
      target: 60,
      reward: { matter: 60, crystals: 1 },
      modeScope: 'overworld'
    },
    {
      id: 'challenge_safe_extraction',
      category: 'challenge',
      title: 'Clean Exfiltration',
      hint: 'Complete a Safe Extraction back through the Sanctum.',
      color: '#00ffff',
      target: 1,
      reward: { matter: 55, attrPoints: 1 },
      modeScope: 'overworld'
    },
    // Secrets / Signals (4)
    {
      id: 'secrets_wanderer',
      category: 'secrets',
      title: 'Signal Beyond the Grid',
      hint: 'Encounter The Wanderer in the outer rings.',
      color: '#00ffaa',
      target: 1,
      reward: { matter: 50, attrPoints: 1 },
      modeScope: 'overworld'
    },
    {
      id: 'secrets_mythic_vault',
      category: 'secrets',
      title: 'Relic Archeologist',
      hint: 'Unseal a Mythic Relic Vault on the outer rim.',
      color: '#ffcc33',
      target: 1,
      reward: { matter: 65, perkPoints: 1 },
      modeScope: 'overworld'
    },
    {
      id: 'secrets_triple_threat',
      category: 'secrets',
      title: 'Triple Threat',
      hint: 'Meet Wanderer, open Mythic Vault & slay Nemesis or Courier in one run.',
      color: '#ffd700',
      target: 3,
      reward: { matter: 100, crystals: 2 },
      modeScope: 'overworld'
    },
    {
      id: 'secrets_lore_decoder',
      category: 'secrets',
      title: 'Signal Archivist',
      hint: 'Decode 12 Lore Transmissions across runs.',
      color: '#00eeff',
      target: 12,
      reward: { matter: 65, perkPoints: 1 },
      modeScope: 'any'
    }
  ].map(entry => Object.freeze({
    ...entry,
    reward: Object.freeze({ ...(entry.reward || {}) })
  })));

  const _ACHIEVEMENT_BY_ID = Object.create(null);
  for (const entry of ACHIEVEMENT_CATALOG) {
    _ACHIEVEMENT_BY_ID[entry.id] = entry;
  }

  function getAchievementDef(id) {
    if (typeof id !== 'string' || !id) return null;
    return _ACHIEVEMENT_BY_ID[id.trim()] || null;
  }

  function formatAchievementReward(reward) {
    if (!reward || typeof reward !== 'object') return '';
    const parts = [];
    if (reward.matter > 0) parts.push(`+${Math.floor(reward.matter)} MATTER`);
    if (reward.crystals > 0) parts.push(`+${Math.floor(reward.crystals)} CRYSTAL${reward.crystals > 1 ? 'S' : ''}`);
    if (reward.perkPoints > 0) parts.push(`+${Math.floor(reward.perkPoints)} PERK PT${reward.perkPoints > 1 ? 'S' : ''}`);
    if (reward.attrPoints > 0) parts.push(`+${Math.floor(reward.attrPoints)} ATTR PT${reward.attrPoints > 1 ? 'S' : ''}`);
    if (reward.fractureKey) parts.push('+1 FRACTURE KEY');
    return parts.join(', ');
  }

  function _normalizeSectorElement(raw) {
    if (typeof raw !== 'string') return null;
    const clean = raw.trim().toLowerCase();
    const alias = clean === 'ice'
      ? 'frost'
      : (clean === 'lightning' ? 'storm' : (clean === 'poison' ? 'toxin' : (clean === 'psychic' ? 'holy' : clean)));
    return SHARD_ELEMENTS.includes(alias) ? alias : null;
  }

  function _ensureAchievementState(state) {
    if (!state.achievements || typeof state.achievements !== 'object') {
      state.achievements = { unlocked: {}, progress: {}, claimed: {} };
    } else {
      if (!state.achievements.unlocked || typeof state.achievements.unlocked !== 'object') state.achievements.unlocked = {};
      if (!state.achievements.progress || typeof state.achievements.progress !== 'object') state.achievements.progress = {};
      if (!state.achievements.claimed || typeof state.achievements.claimed !== 'object') state.achievements.claimed = {};
    }
    if (!state.lifetimeStats || typeof state.lifetimeStats !== 'object') {
      state.lifetimeStats = {};
    }
    return state.achievements;
  }

  function _computeAchievementProgress(def, state, globalState, context = {}) {
    const ach = _ensureAchievementState(state);
    const existing = Math.max(0, Math.floor(Number(ach.progress[def.id]) || 0));
    const lt = state.lifetimeStats || {};
    const ctxKeystones = Array.isArray(context.activeKeystoneIds) ? context.activeKeystoneIds : [];
    const bossKilled = Boolean(context.bossDefeated);

    switch (def.id) {
      case 'combat_purge_500': {
        let codexSum = 0;
        if (state.codexKills && typeof state.codexKills === 'object') {
          for (const v of Object.values(state.codexKills)) {
            codexSum += Math.max(0, Math.floor(Number(v) || 0));
          }
        }
        const ctxKills = Math.max(0, Math.floor(Number(context.enemiesKilled) || 0));
        return Math.max(existing, codexSum, ctxKills);
      }
      case 'combat_streak_35': {
        const ltBest = Math.max(0, Math.floor(Number(lt.bestKillStreak) || 0));
        const ctxStreak = Math.max(
          Math.floor(Number(context.killStreak) || 0),
          Math.floor(Number(context.bestKillStreak) || 0)
        );
        return Math.max(existing, ltBest, ctxStreak);
      }
      case 'combat_exposed_boss':
        return Math.max(existing, Math.floor(Number(lt.exposedBossKills) || 0));
      case 'combat_nemesis_slain':
        return Math.max(existing, Math.floor(Number(lt.nemesisSlain) || 0));
      case 'combat_volatile_pact':
        return Math.max(existing, Math.floor(Number(lt.pactsFulfilled) || 0));
      case 'biomes_sectors_all': {
        const secSet = new Set();
        if (Array.isArray(state.discoveredSectors)) {
          for (const s of state.discoveredSectors) {
            const norm = _normalizeSectorElement(s);
            if (norm) secSet.add(norm);
          }
        }
        return Math.max(existing, secSet.size);
      }
      case 'biomes_citadel_triad':
      case 'biomes_citadel_all': {
        const conqSet = new Set();
        if (Array.isArray(state.conqueredSectors)) {
          for (const s of state.conqueredSectors) {
            const norm = _normalizeSectorElement(s);
            if (norm) conqSet.add(norm);
          }
        }
        return Math.max(existing, conqSet.size);
      }
      case 'biomes_architect':
        return Math.max(existing, (Number(state.architectDefeatedPhase) || 0) >= 1 ? 1 : 0);
      case 'build_keystone_overclocked':
        return Math.max(existing, (bossKilled && ctxKeystones.includes('glass_cannon')) ? 1 : 0);
      case 'build_keystone_architect':
        return Math.max(existing, (bossKilled && ctxKeystones.includes('ancestral_bond')) ? 1 : 0);
      case 'build_keystone_ignition':
        return Math.max(existing, (bossKilled && ctxKeystones.includes('avatar_of_fire')) ? 1 : 0);
      case 'build_keystone_singularity':
        return Math.max(existing, (bossKilled && ctxKeystones.includes('chaos_inoculation')) ? 1 : 0);
      case 'build_keystone_hemorrhage':
        return Math.max(existing, (bossKilled && ctxKeystones.includes('crimson_dance')) ? 1 : 0);
      case 'build_harmonic_boss':
        return Math.max(
          existing,
          Math.floor(Number(lt.harmonicBossClears) || 0),
          (bossKilled && context.hasHarmonicSequence) ? 1 : 0
        );
      case 'descent_depth_5':
      case 'descent_depth_10': {
        const bestD = Math.max(0, Math.floor(Number(state.bestDescentDepth) || 0));
        const ctxD = context.mode === 'descent' ? Math.max(0, Math.floor(Number(context.descentDepth) || 0)) : 0;
        return Math.max(existing, bestD, ctxD);
      }
      case 'descent_warden_1':
      case 'descent_warden_3':
        return Math.max(existing, Math.floor(Number(lt.crucibleWardensSlain) || 0));
      case 'challenge_flawless_boss':
        return Math.max(existing, Math.floor(Number(lt.flawlessBosses) || 0));
      case 'challenge_fast_citadel': {
        const fastSec = Number(lt.fastestCitadelSec) || 0;
        return Math.max(existing, (fastSec > 0 && fastSec <= 45) ? 1 : 0);
      }
      case 'challenge_fracture_boss':
        return Math.max(
          existing,
          Math.floor(Number(lt.fractureBossClears) || 0),
          (bossKilled && context.hasFractureKey) ? 1 : 0
        );
      case 'challenge_daily_60': {
        const bestDaily = globalState ? Math.max(0, Math.floor(Number(globalState.bestDailySurvivalSec) || 0)) : 0;
        const curDaily = context.isDailyRun ? Math.max(0, Math.floor(Number(context.runTime) || 0)) : 0;
        return Math.max(existing, bestDaily, curDaily);
      }
      case 'challenge_safe_extraction':
        return Math.max(
          existing,
          Math.floor(Number(lt.safeExtractions) || 0),
          Math.floor(Number(state.bestExtractionStreak) || 0),
          context.safeExtracted ? 1 : 0
        );
      case 'secrets_wanderer': {
        const hasLore = Array.isArray(state.unlockedTransmissions) && state.unlockedTransmissions.includes('encounter_wanderer');
        return Math.max(existing, Math.floor(Number(lt.wanderersMet) || 0), hasLore ? 1 : 0);
      }
      case 'secrets_mythic_vault': {
        const hasLore = Array.isArray(state.unlockedTransmissions) && state.unlockedTransmissions.includes('encounter_mythic_vault');
        return Math.max(existing, Math.floor(Number(lt.mythicVaultsOpened) || 0), hasLore ? 1 : 0);
      }
      case 'secrets_triple_threat': {
        const combo = (context.runWandererMet ? 1 : 0) + (context.runMythicVault ? 1 : 0) + (context.runNemesisOrCourier ? 1 : 0);
        return Math.max(existing, combo);
      }
      case 'secrets_lore_decoder': {
        const loreSet = new Set();
        if (Array.isArray(state.unlockedTransmissions)) {
          for (const tid of state.unlockedTransmissions) {
            if (typeof tid === 'string' && getLoreTransmission(tid.trim())) {
              loreSet.add(tid.trim());
            }
          }
        }
        return Math.max(existing, loreSet.size);
      }
      default:
        return existing;
    }
  }

  function evaluateAchievements(meta, context = {}) {
    const resolved = _resolveMeta(meta);
    if (!resolved) return { newlyUnlocked: [], progressUpdated: false };
    const { state } = resolved;
    const globalState = (meta && meta.globalData && typeof meta.globalData === 'object') ? meta.globalData : null;
    const ach = _ensureAchievementState(state);
    const silent = Boolean(context && context.silent);
    const deferSave = Boolean(context && context.deferSave);
    const newlyUnlocked = [];
    let progressUpdated = false;

    for (const def of ACHIEVEMENT_CATALOG) {
      const rawVal = _computeAchievementProgress(def, state, globalState, context);
      const clamped = Math.min(def.target, Math.max(0, Math.floor(Number(rawVal) || 0)));
      const prevProg = Math.max(0, Math.floor(Number(ach.progress[def.id]) || 0));
      if (clamped > prevProg) {
        ach.progress[def.id] = clamped;
        progressUpdated = true;
      }

      if (clamped >= def.target && !ach.unlocked[def.id]) {
        if (meta && typeof meta.unlockAchievement === 'function') {
          const res = meta.unlockAchievement(def.id, def.reward, { silent, deferSave: true });
          if (res && res.unlocked) {
            newlyUnlocked.push(def);
          }
        } else {
          ach.unlocked[def.id] = Date.now() || 1;
          if (!silent && !ach.claimed[def.id]) {
            ach.claimed[def.id] = true;
            const rw = def.reward || {};
            if (rw.matter > 0) _addMatter(meta, state, rw.matter);
            if (rw.crystals > 0 && meta && typeof meta.addPremium === 'function') meta.addPremium(rw.crystals);
            if (rw.perkPoints > 0) state.perkPoints = Math.max(0, Math.floor(Number(state.perkPoints) || 0)) + rw.perkPoints;
            if (rw.attrPoints > 0) state.bonusAttributePoints = Math.max(0, Math.floor(Number(state.bonusAttributePoints) || 0)) + rw.attrPoints;
            if (rw.fractureKey && FRACTURE_KEY_DEFS[rw.fractureKey]) {
              state.fractureKeys[rw.fractureKey] = Math.max(0, Math.floor(Number(state.fractureKeys[rw.fractureKey]) || 0)) + 1;
            }
          } else if (silent) {
            ach.claimed[def.id] = true;
          }
          newlyUnlocked.push(def);
        }
      } else if (silent && ach.unlocked[def.id] && !ach.claimed[def.id]) {
        ach.claimed[def.id] = true;
      }
    }

    if ((newlyUnlocked.length > 0 || progressUpdated) && !deferSave) {
      _persist(meta);
    }

    return { newlyUnlocked, progressUpdated };
  }

  function getAchievementProgressSnapshot(meta) {
    const resolved = _resolveMeta(meta);
    const state = resolved ? resolved.state : null;
    const globalState = (meta && meta.globalData && typeof meta.globalData === 'object') ? meta.globalData : null;
    const ach = state ? _ensureAchievementState(state) : { unlocked: {}, progress: {}, claimed: {} };
    const byCategory = {};
    for (const cat of ACHIEVEMENT_CATEGORIES) {
      byCategory[cat.id] = { id: cat.id, label: cat.label, color: cat.color, unlocked: 0, total: 0 };
    }
    const items = [];
    let unlockedCount = 0;

    for (const def of ACHIEVEMENT_CATALOG) {
      const unlocked = Boolean(ach.unlocked[def.id]);
      const claimed = Boolean(ach.claimed[def.id]);
      const rawProgress = state
        ? _computeAchievementProgress(def, state, globalState, {})
        : 0;
      const progress = unlocked ? def.target : Math.min(def.target, Math.max(0, Math.floor(Number(rawProgress) || 0)));
      if (unlocked) unlockedCount += 1;
      if (byCategory[def.category]) {
        byCategory[def.category].total += 1;
        if (unlocked) byCategory[def.category].unlocked += 1;
      }
      items.push({
        ...def,
        unlocked,
        unlockedAt: unlocked ? ach.unlocked[def.id] : 0,
        claimed,
        progress
      });
    }

    const totalCount = ACHIEVEMENT_CATALOG.length;
    return {
      unlockedCount,
      totalCount,
      pct: totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0,
      byCategory,
      items
    };
  }

  const RunSummary = (() => {
    const KEYSTONE_ORDER = Object.freeze([
      'glass_cannon',
      'ancestral_bond',
      'chaos_inoculation',
      'avatar_of_fire',
      'crimson_dance'
    ]);

    const KEYSTONE_NAMES = Object.freeze({
      glass_cannon: 'Overclocked Core',
      ancestral_bond: 'Autonomous Architect',
      chaos_inoculation: 'Synthetic Singularity',
      avatar_of_fire: 'Absolute Ignition',
      crimson_dance: 'Hemorrhaging Nanobots'
    });

    const HARMONIC_SEQUENCE_ORDER = (() => {
      const ids = [...Object.keys(HARMONIC_SEQUENCES)];
      for (const el of SHARD_ELEMENTS) {
        ids.push(`pure_${el}`);
      }
      for (let i = 0; i < SHARD_ELEMENTS.length; i++) {
        for (let j = i + 1; j < SHARD_ELEMENTS.length; j++) {
          const a = SHARD_ELEMENTS[i];
          const b = SHARD_ELEMENTS[j];
          if (HARMONIC_SEQUENCES[`${a}+${b}`] || HARMONIC_SEQUENCES[`${b}+${a}`]) continue;
          const pair = [a, b].sort();
          ids.push(`dual_${pair[0]}+${pair[1]}`);
        }
      }
      return Object.freeze(ids);
    })();

    const RELIC_ORDER = Object.freeze([
      ...Object.keys(SIGNATURE_CATALOG),
      ...Object.keys(APEX_RELIC_CATALOG)
    ]);

    const FRACTURE_KEY_ORDER = Object.freeze(['', ...FRACTURE_KEY_IDS]);
    const OUTCOMES = Object.freeze([
      'ARCHITECT CLEARED',
      'SAFE EXTRACTION',
      'CRUCIBLE FALL',
      'SYSTEM FAILURE'
    ]);
    const MODES = Object.freeze(['overworld', 'daily', 'descent']);

    function _sanitizeSeed(rawSeed) {
      const cleaned = String(rawSeed || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
      return cleaned || '0';
    }

    function _getHarmonicSequenceName(id) {
      if (typeof id !== 'string' || !id) return '';
      if (HARMONIC_SEQUENCES[id]) return HARMONIC_SEQUENCES[id].name;
      if (id.startsWith('pure_')) {
        const el = id.slice(5);
        return `Pure ${_capFirst(el)} Resonance`;
      }
      if (id.startsWith('dual_')) return 'Dual Harmonic Link';
      return id;
    }

    function _getRelicName(id) {
      if (typeof id !== 'string' || !id) return '';
      const def = SIGNATURE_CATALOG[id] || APEX_RELIC_CATALOG[id];
      return def ? def.name : id;
    }

    function _fnv1a16Hex(payload) {
      let hash = 0x811c9dc5;
      const text = String(payload || '');
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
      }
      const folded = ((hash >>> 16) ^ (hash & 0xffff)) & 0xffff;
      return folded.toString(16).toUpperCase().padStart(4, '0');
    }

    /** Computes DPS, EHP and effective barrier with exact src/main.js parity. */
    function _computeDpsAndEhp(stats) {
      if (!stats || typeof stats !== 'object') return { dps: 0, ehp: 0, shield: 0 };
      const projCount = Math.max(1, stats.projectileCount || 1);
      const critAvg = 1 + (stats.critChance || 0) * ((stats.critMultiplier || 2) - 1);
      const procAvg = 1
        + 0.45 * (stats.splitChance || 0)
        + 0.45 * (stats.forkChance || 0)
        + 0.40 * (stats.rockShardChance || 0)
        + 0.30 * (stats.ricochetChance || 0);
      const dps = (stats.damage || 0) * (stats.fireRate || 1) * projCount * critAvg * procAvg;
      const perkShield = (stats.specialEffects && stats.specialEffects.energyShield)
        ? (30 + Math.floor((stats.maxHp || 100) * 0.25) * (Number(stats.specialEffects.energyShield.level) || 0))
        : 0;
      const shield = perkShield + (stats.bonusEnergyShield || 0);
      const hpPool = Math.max(1, (stats.maxHp || 1) + shield);
      const mitFactor = Math.max(0.48, 1 - Math.min(0.52, stats.damageMitigation || 0));
      const evadeFactor = Math.max(0.74, 1 - Math.min(0.26, stats.phaseEvasion || 0));
      const ehp = (hpPool / (mitFactor * evadeFactor)) + (stats.rawAttenuation || 0) * 1.5;
      return { dps, ehp, shield };
    }

    function _readMetaStateNoMutate(metaObj) {
      if (!metaObj || typeof metaObj !== 'object') return null;
      return (metaObj.data && typeof metaObj.data === 'object') ? metaObj.data : metaObj;
    }

    function _orderedUnique(items, orderList) {
      const set = new Set(items);
      const out = [];
      for (const id of orderList) {
        if (set.has(id)) out.push(id);
      }
      return out;
    }

    /** Encodes a RunSummary snapshot into a checksummed NC2 signal string. */
    function encodeBuildCode(snapshot) {
      const s = (snapshot && typeof snapshot === 'object') ? snapshot : {};
      const mChar = s.mode === 'daily' ? 'D' : (s.mode === 'descent' ? 'C' : 'O');
      const seed = _sanitizeSeed(s.seed);
      const phase = _clampInt(s.phase, 1, 4, 1);
      const sing = _clampInt(s.singularityLevel, 1, 5, 1);
      const depth = _clampInt(s.descentDepth, 1, 9999, 1);

      let kMask = 0;
      if (Array.isArray(s.activeKeystoneIds)) {
        for (let i = 0; i < KEYSTONE_ORDER.length; i++) {
          if (s.activeKeystoneIds.includes(KEYSTONE_ORDER[i])) kMask |= (1 << i);
        }
      }
      let hMask = 0;
      if (Array.isArray(s.harmonicSequenceIds)) {
        for (let i = 0; i < HARMONIC_SEQUENCE_ORDER.length; i++) {
          if (s.harmonicSequenceIds.includes(HARMONIC_SEQUENCE_ORDER[i])) hMask |= (1 << i);
        }
      }
      let rMask = 0;
      if (Array.isArray(s.relicIds)) {
        for (let i = 0; i < RELIC_ORDER.length; i++) {
          if (s.relicIds.includes(RELIC_ORDER[i])) rMask |= (1 << i);
        }
      }
      const rawKeyIdx = FRACTURE_KEY_ORDER.indexOf(typeof s.fractureKeyId === 'string' ? s.fractureKeyId : '');
      const keyIdx = rawKeyIdx >= 0 ? rawKeyIdx : 0;

      const body = `NC2-${mChar}${seed}-P${phase}S${sing}D${depth}-K${(kMask >>> 0).toString(16).toUpperCase()}-H${(hMask >>> 0).toString(16).toUpperCase()}-R${(rMask >>> 0).toString(16).toUpperCase()}-F${keyIdx}`;
      return `${body}-${_fnv1a16Hex(body)}`;
    }

    /** Validates and decodes an NC2 build code purely client-side. */
    function decodeBuildCode(rawCode) {
      const clean = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
      if (!clean) return { valid: false, reason: 'empty' };
      const parts = clean.split('-');
      if (parts.length !== 8 || parts[0] !== 'NC2') {
        return { valid: false, reason: 'format' };
      }

      const modeSeedMatch = /^([ODC])([A-Z0-9]{1,16})$/.exec(parts[1]);
      if (!modeSeedMatch) return { valid: false, reason: 'mode_seed' };
      const mChar = modeSeedMatch[1];
      const mode = mChar === 'D' ? 'daily' : (mChar === 'C' ? 'descent' : 'overworld');
      const seed = modeSeedMatch[2];

      const psdMatch = /^P([1-4])S([1-5])D(\d{1,4})$/.exec(parts[2]);
      if (!psdMatch) return { valid: false, reason: 'phase_sing_depth' };
      const phase = parseInt(psdMatch[1], 10);
      const singularityLevel = parseInt(psdMatch[2], 10);
      const descentDepth = parseInt(psdMatch[3], 10);
      if (descentDepth < 1) return { valid: false, reason: 'depth_range' };

      const kMatch = /^K([0-9A-F]{1,2})$/.exec(parts[3]);
      if (!kMatch) return { valid: false, reason: 'keystone_hex' };
      const kMask = parseInt(kMatch[1], 16);
      if (kMask > ((1 << KEYSTONE_ORDER.length) - 1)) return { valid: false, reason: 'keystone_range' };

      const hMatch = /^H([0-9A-F]{1,7})$/.exec(parts[4]);
      if (!hMatch) return { valid: false, reason: 'harmonic_hex' };
      const hMask = parseInt(hMatch[1], 16);
      if (hMask > ((1 << HARMONIC_SEQUENCE_ORDER.length) - 1)) return { valid: false, reason: 'harmonic_range' };

      const rMatch = /^R([0-9A-F]{1,3})$/.exec(parts[5]);
      if (!rMatch) return { valid: false, reason: 'relic_hex' };
      const rMask = parseInt(rMatch[1], 16);
      if (rMask > ((1 << RELIC_ORDER.length) - 1)) return { valid: false, reason: 'relic_range' };

      const fMatch = /^F([0-3])$/.exec(parts[6]);
      if (!fMatch) return { valid: false, reason: 'fracture_key' };
      const keyIdx = parseInt(fMatch[1], 10);
      const fractureKeyId = FRACTURE_KEY_ORDER[keyIdx] || '';

      if (!/^[0-9A-F]{4}$/.test(parts[7])) return { valid: false, reason: 'checksum_format' };
      const expectedChecksum = _fnv1a16Hex(parts.slice(0, 7).join('-'));
      if (parts[7] !== expectedChecksum) return { valid: false, reason: 'checksum_mismatch' };

      const activeKeystoneIds = [];
      for (let i = 0; i < KEYSTONE_ORDER.length; i++) {
        if ((kMask & (1 << i)) !== 0) activeKeystoneIds.push(KEYSTONE_ORDER[i]);
      }
      const harmonicSequenceIds = [];
      for (let i = 0; i < HARMONIC_SEQUENCE_ORDER.length; i++) {
        if ((hMask & (1 << i)) !== 0) harmonicSequenceIds.push(HARMONIC_SEQUENCE_ORDER[i]);
      }
      const relicIds = [];
      for (let i = 0; i < RELIC_ORDER.length; i++) {
        if ((rMask & (1 << i)) !== 0) relicIds.push(RELIC_ORDER[i]);
      }

      return {
        valid: true,
        version: 'NC2',
        code: clean,
        mode,
        seed,
        phase,
        singularityLevel,
        descentDepth,
        activeKeystoneIds,
        harmonicSequenceIds,
        relicIds,
        fractureKeyId,
        checksum: parts[7]
      };
    }

    /** Captures a deterministic, null-safe run summary snapshot. */
    function captureRunSnapshot(game, meta, opts = {}) {
      const g = (game && typeof game === 'object') ? game : null;
      const m = (meta && typeof meta === 'object') ? meta : null;
      const o = (opts && typeof opts === 'object') ? opts : {};
      const metaState = _readMetaStateNoMutate(m);

      let mode = 'overworld';
      if (o.mode === 'daily' || o.isDailyRun || (g && g.isDailyRun)) {
        mode = 'daily';
      } else if (o.mode === 'descent' || o.isDescentMode || (g && g.isDescentMode)) {
        mode = 'descent';
      }

      let outcome = mode === 'descent' ? 'CRUCIBLE FALL' : 'SYSTEM FAILURE';
      if (o.architectDefeated || (g && g._architectDefeatedThisRun)) {
        outcome = 'ARCHITECT CLEARED';
      } else if (o.extracted || o.safeExtracted || (g && g.safeExtractBonus > 0)) {
        outcome = 'SAFE EXTRACTION';
      } else if (o.outcome && OUTCOMES.includes(o.outcome)) {
        outcome = o.outcome;
      }

      const rawSeed = mode === 'daily'
        ? (o.dailySeed ?? (g && g.dailySeed) ?? (m && typeof m.getTodaySeedKey === 'function' ? m.getTodaySeedKey() : '') ?? (g && g.runSeed) ?? '0')
        : (o.seed ?? (g && g.runSeed) ?? '0');
      const seed = _sanitizeSeed(rawSeed);

      const phaseCfg = (g && typeof g.getActivePhaseConfig === 'function') ? g.getActivePhaseConfig() : null;
      const phase = _clampInt(o.phase ?? (phaseCfg && phaseCfg.phase) ?? (metaState && metaState.selectedPhase), 1, 4, 1);
      const singularityLevel = _clampInt(o.singularityLevel ?? (phaseCfg && phaseCfg.singularityLevel) ?? (metaState && metaState.singularityLevel), 1, 5, 1);
      const descentDepth = _clampInt(o.descentDepth ?? (g && g.descentDepth), 1, 9999, 1);
      const playerLevel = _clampInt(o.playerLevel ?? (g && g.player && g.player.level), 1, 999, 1);
      const runTime = Math.max(0, Math.floor(Number(o.runTime ?? (g && g.runTime) ?? 0) || 0));
      const enemiesKilled = Math.max(0, Math.floor(Number(o.enemiesKilled ?? (g && g.enemiesKilled) ?? 0) || 0));
      const bestKillStreak = Math.max(0, Math.floor(Number(o.bestKillStreak ?? (g && g.bestKillStreak) ?? 0) || 0));
      const extractionStreak = Math.max(0, Math.floor(Number(o.extractionStreak ?? (metaState && metaState.extractionStreak) ?? 0) || 0));
      const gearPower = Math.max(0, Math.round(Number(o.gearPower ?? (m ? getEquippedGearPower(m) : 0)) || 0));

      const stats = o.stats || (g && g.statManager && typeof g.statManager.getCurrentStats === 'function' ? g.statManager.getCurrentStats() : null);
      const metrics = _computeDpsAndEhp(stats);
      const dps = stats ? Math.max(0, Math.round(metrics.dps || 0)) : Math.max(0, Math.round(Number(o.dps) || 0));
      const ehp = stats ? Math.max(0, Math.round(metrics.ehp || 0)) : Math.max(0, Math.round(Number(o.ehp) || 0));
      const shield = stats ? Math.max(0, Math.round(metrics.shield || 0)) : Math.max(0, Math.round(Number(o.shield) || 0));

      const featSnap = m ? getAchievementProgressSnapshot(m) : null;
      const featsUnlocked = _clampInt(o.featsUnlocked ?? (featSnap && featSnap.unlockedCount), 0, ACHIEVEMENT_CATALOG.length, 0);
      const featsTotal = _clampInt(o.featsTotal ?? (featSnap && featSnap.totalCount), 1, 999, ACHIEVEMENT_CATALOG.length);

      const rawKeystones = [];
      if (Array.isArray(o.activeKeystoneIds)) {
        for (const k of o.activeKeystoneIds) {
          if (KEYSTONE_ORDER.includes(k)) rawKeystones.push(k);
        }
      }
      const fx = (stats && stats.specialEffects && typeof stats.specialEffects === 'object') ? stats.specialEffects : {};
      const perksList = (g && g.statManager && Array.isArray(g.statManager.perks)) ? g.statManager.perks : [];
      if (fx.glassCannon || perksList.some(p => p && p.id === 'glass_cannon')) rawKeystones.push('glass_cannon');
      if (fx.ancestralBond || perksList.some(p => p && p.id === 'ancestral_bond')) rawKeystones.push('ancestral_bond');
      if (fx.chaosInoculation || perksList.some(p => p && p.id === 'chaos_inoculation')) rawKeystones.push('chaos_inoculation');
      if (fx.avatarOfFire || perksList.some(p => p && p.id === 'avatar_of_fire')) rawKeystones.push('avatar_of_fire');
      if (fx.crimsonDance || perksList.some(p => p && p.id === 'crimson_dance')) rawKeystones.push('crimson_dance');
      const activeKeystoneIds = _orderedUnique(rawKeystones, KEYSTONE_ORDER);

      const rawHarmonicIds = [];
      const rawRelicIds = [];
      const equipped = (metaState && metaState.equippedModules && typeof metaState.equippedModules === 'object')
        ? metaState.equippedModules
        : null;
      if (equipped) {
        for (const slot of ALL_SLOT_KEYS) {
          const mod = equipped[slot];
          if (!mod || typeof mod !== 'object') continue;
          const seq = detectHarmonicSequence(mod);
          if (seq && seq.id && HARMONIC_SEQUENCE_ORDER.includes(seq.id)) {
            rawHarmonicIds.push(seq.id);
          }
          if (typeof mod.signatureId === 'string' && SIGNATURE_CATALOG[mod.signatureId]) {
            rawRelicIds.push(mod.signatureId);
          }
          if (typeof mod.relicId === 'string' && APEX_RELIC_CATALOG[mod.relicId]) {
            rawRelicIds.push(mod.relicId);
          }
        }
      }
      if (stats && Array.isArray(stats.harmonicSequences)) {
        for (const seq of stats.harmonicSequences) {
          if (seq && typeof seq.id === 'string' && HARMONIC_SEQUENCE_ORDER.includes(seq.id)) {
            rawHarmonicIds.push(seq.id);
          }
        }
      }
      if (Array.isArray(o.harmonicSequenceIds)) {
        for (const seqId of o.harmonicSequenceIds) {
          if (typeof seqId === 'string' && HARMONIC_SEQUENCE_ORDER.includes(seqId)) {
            rawHarmonicIds.push(seqId);
          }
        }
      }
      if (Array.isArray(o.relicIds)) {
        for (const relId of o.relicIds) {
          if (typeof relId === 'string' && RELIC_ORDER.includes(relId)) {
            rawRelicIds.push(relId);
          }
        }
      }

      const harmonicSequenceIds = _orderedUnique(rawHarmonicIds, HARMONIC_SEQUENCE_ORDER);
      const harmonicSequenceNames = harmonicSequenceIds.map(_getHarmonicSequenceName);
      const relicIds = _orderedUnique(rawRelicIds, RELIC_ORDER);
      const relicNames = relicIds.map(_getRelicName);

      const rawFractureKey = o.fractureKeyId ?? (g && g.activeFractureKeyId) ?? (metaState && metaState.activeFractureKey) ?? '';
      const fractureKeyId = (typeof rawFractureKey === 'string' && FRACTURE_KEY_DEFS[rawFractureKey]) ? rawFractureKey : '';
      const fractureKeyName = fractureKeyId ? FRACTURE_KEY_DEFS[fractureKeyId].name : '';

      const outcomeBonus = outcome === 'ARCHITECT CLEARED' ? 2500 : (outcome === 'SAFE EXTRACTION' ? 1200 : 0);
      const score = Math.max(0, Math.floor(
        runTime * 10
        + enemiesKilled * 4
        + bestKillStreak * 25
        + Math.round(dps * 0.6)
        + Math.round(ehp * 0.25)
        + gearPower * 3
        + phase * 400
        + (singularityLevel - 1) * 350
        + (mode === 'descent' ? descentDepth * 320 : 0)
        + outcomeBonus
        + activeKeystoneIds.length * 300
        + harmonicSequenceIds.length * 250
        + relicIds.length * 200
        + (fractureKeyId ? 450 : 0)
      ));

      const snapshot = {
        version: 'NC2',
        outcome,
        mode,
        seed,
        phase,
        singularityLevel,
        descentDepth,
        playerLevel,
        runTime,
        enemiesKilled,
        bestKillStreak,
        extractionStreak,
        gearPower,
        dps,
        ehp,
        shield,
        featsUnlocked,
        featsTotal,
        activeKeystoneIds,
        harmonicSequenceIds,
        harmonicSequenceNames,
        relicIds,
        relicNames,
        fractureKeyId,
        fractureKeyName,
        score,
        buildCode: ''
      };
      snapshot.buildCode = encodeBuildCode(snapshot);
      return snapshot;
    }

    function _collectBuildPillars(snap) {
      const pillars = [];
      if (Array.isArray(snap.activeKeystoneIds)) {
        for (const kId of snap.activeKeystoneIds) {
          if (KEYSTONE_NAMES[kId]) pillars.push(KEYSTONE_NAMES[kId]);
        }
      }
      if (Array.isArray(snap.harmonicSequenceNames) && snap.harmonicSequenceNames.length > 0) {
        for (const name of snap.harmonicSequenceNames) {
          if (typeof name === 'string' && name) pillars.push(name);
        }
      } else if (Array.isArray(snap.harmonicSequenceIds)) {
        for (const hId of snap.harmonicSequenceIds) {
          const hName = _getHarmonicSequenceName(hId);
          if (hName) pillars.push(hName);
        }
      }
      if (Array.isArray(snap.relicNames) && snap.relicNames.length > 0) {
        for (const rName of snap.relicNames) {
          if (typeof rName === 'string' && rName) pillars.push(rName);
        }
      } else if (Array.isArray(snap.relicIds)) {
        for (const rId of snap.relicIds) {
          const rName = _getRelicName(rId);
          if (rName) pillars.push(rName);
        }
      }
      if (snap.fractureKeyName) {
        pillars.push(snap.fractureKeyName);
      } else if (snap.fractureKeyId && FRACTURE_KEY_DEFS[snap.fractureKeyId]) {
        pillars.push(FRACTURE_KEY_DEFS[snap.fractureKeyId].name);
      }
      return pillars;
    }

    /** Formats a 4-line Discord/Reddit plain-text summary without mode-leak strings. */
    function formatShareText(snapshot) {
      const s = (snapshot && typeof snapshot === 'object') ? snapshot : captureRunSnapshot(null, null);
      const modeLabel = s.mode === 'daily' ? 'DAILY' : (s.mode === 'descent' ? 'CRUCIBLE' : 'OVERWORLD');
      const outcome = OUTCOMES.includes(s.outcome) ? s.outcome : 'SYSTEM FAILURE';
      const seed = _sanitizeSeed(s.seed);
      const phase = _clampInt(s.phase, 1, 4, 1);
      const sing = _clampInt(s.singularityLevel, 1, 5, 1);
      const depth = _clampInt(s.descentDepth, 1, 9999, 1);
      const runTime = Math.max(0, Math.floor(Number(s.runTime) || 0));
      const mm = String(Math.floor(runTime / 60)).padStart(2, '0');
      const ss = String(runTime % 60).padStart(2, '0');
      const dps = Math.max(0, Math.round(Number(s.dps) || 0));
      const ehp = Math.max(0, Math.round(Number(s.ehp) || 0));
      const kills = Math.max(0, Math.floor(Number(s.enemiesKilled) || 0));
      const streak = Math.max(0, Math.floor(Number(s.bestKillStreak) || 0));
      const buildCode = (typeof s.buildCode === 'string' && decodeBuildCode(s.buildCode).valid)
        ? s.buildCode
        : encodeBuildCode(s);
      const pillars = _collectBuildPillars(s);
      const buildLine = pillars.length > 0 ? pillars.slice(0, 5).join(' • ') : 'BASELINE CHASSIS';

      const line1 = `[NEONCORE] ${outcome} // ${modeLabel} P${phase}·S${sing}${s.mode === 'descent' ? ` D${depth}` : ''} // SEED ${seed}`;
      const line2 = `DPS ${dps} | EHP ${ehp} | TIME ${mm}:${ss} | KILLS ${kills} (${streak}x)`;
      const line3 = `BUILD: ${buildLine}`;
      const line4 = `SIGNAL: ${buildCode}`;
      return `${line1}\n${line2}\n${line3}\n${line4}`;
    }

    /** Renders an 800x420 Neon-Vector Trading Card (zero shadowBlur, headless-safe). */
    function renderSummaryCardPng(snapshot, opts = {}) {
      const s = (snapshot && typeof snapshot === 'object') ? snapshot : captureRunSnapshot(null, null);
      const buildCode = (typeof s.buildCode === 'string' && decodeBuildCode(s.buildCode).valid)
        ? s.buildCode
        : encodeBuildCode(s);
      const shareText = formatShareText({ ...s, buildCode });
      const width = 800;
      const height = 420;

      let canvas = null;
      let ctx = null;
      if (opts && opts.ctx && typeof opts.ctx.fillRect === 'function' && typeof opts.ctx.fillText === 'function') {
        ctx = opts.ctx;
        canvas = opts.canvas || null;
      } else if (opts && opts.canvas && typeof opts.canvas.getContext === 'function') {
        canvas = opts.canvas;
        canvas.width = width;
        canvas.height = height;
        ctx = canvas.getContext('2d');
      } else if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
        canvas = document.createElement('canvas');
        if (canvas) {
          canvas.width = width;
          canvas.height = height;
          ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
        }
      }

      if (!ctx) {
        return { ok: false, width, height, buildCode, shareText, dataUrl: null, drawOps: 0 };
      }

      let drawOps = 0;
      const accent = s.outcome === 'ARCHITECT CLEARED'
        ? '#ffd700'
        : (s.outcome === 'SAFE EXTRACTION'
            ? '#00eeff'
            : (s.mode === 'descent' ? '#ff22ee' : (s.mode === 'daily' ? '#ffaa00' : '#ff3366')));
      const secondary = s.singularityLevel >= 3 ? '#ff88ff' : '#44aaff';

      if (typeof ctx.save === 'function') ctx.save();
      ctx.shadowBlur = 0;

      // Deep Vector Card Background & Tactical Grid
      ctx.fillStyle = '#050a18';
      ctx.fillRect(0, 0, width, height);
      drawOps++;

      ctx.strokeStyle = 'rgba(0, 238, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let gx = 40; gx < width; gx += 40) {
        ctx.beginPath(); ctx.moveTo(gx, 12); ctx.lineTo(gx, height - 12); ctx.stroke();
        drawOps++;
      }
      for (let gy = 40; gy < height; gy += 40) {
        ctx.beginPath(); ctx.moveTo(12, gy); ctx.lineTo(width - 12, gy); ctx.stroke();
        drawOps++;
      }

      // Outer Frame + Left Accent Stripe
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, width - 20, height - 20);
      drawOps++;
      ctx.fillStyle = accent;
      ctx.fillRect(10, 10, 8, height - 20);
      drawOps++;

      // Procedural Vector Core Emblem (top-right)
      const embX = 720;
      const embY = 74;
      const sides = Math.min(10, Math.max(5, 4 + (_clampInt(s.phase, 1, 4, 1))));
      for (const rad of [38, 26, 14]) {
        ctx.strokeStyle = rad === 26 ? secondary : accent;
        ctx.lineWidth = rad === 38 ? 2 : 1.4;
        ctx.beginPath();
        for (let i = 0; i <= sides; i++) {
          const ang = (Math.PI * 2 * i) / sides - Math.PI * 0.5;
          const vx = embX + Math.cos(ang) * rad;
          const vy = embY + Math.sin(ang) * rad;
          if (i === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        }
        ctx.stroke();
        drawOps++;
      }
      const spokeCount = Math.min(8, Math.max(3, (Array.isArray(s.harmonicSequenceIds) ? s.harmonicSequenceIds.length : 0) + 3));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      for (let i = 0; i < spokeCount; i++) {
        const ang = (Math.PI * 2 * i) / spokeCount;
        ctx.beginPath();
        ctx.moveTo(embX + Math.cos(ang) * 14, embY + Math.sin(ang) * 14);
        ctx.lineTo(embX + Math.cos(ang) * 38, embY + Math.sin(ang) * 38);
        ctx.stroke();
        drawOps++;
      }

      // Header Section
      const modeLabel = s.mode === 'daily' ? 'DAILY' : (s.mode === 'descent' ? 'CRUCIBLE' : 'OVERWORLD');
      const phase = _clampInt(s.phase, 1, 4, 1);
      const sing = _clampInt(s.singularityLevel, 1, 5, 1);
      const depth = _clampInt(s.descentDepth, 1, 9999, 1);
      const lvl = _clampInt(s.playerLevel, 1, 999, 1);
      const seed = _sanitizeSeed(s.seed);
      const featsUnlocked = Math.max(0, Math.floor(Number(s.featsUnlocked) || 0));
      const featsTotal = Math.max(1, Math.floor(Number(s.featsTotal) || ACHIEVEMENT_CATALOG.length));
      const score = Math.max(0, Math.floor(Number(s.score) || 0));

      ctx.textAlign = 'left';
      ctx.fillStyle = accent;
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`NEONCORE SIGNAL CARD // ${modeLabel} • P${phase} • S${sing}${s.mode === 'descent' ? ` • D${depth}` : ''}`, 34, 42, 620);
      drawOps++;

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px monospace';
      ctx.fillText(String(s.outcome || 'SYSTEM FAILURE'), 34, 78, 620);
      drawOps++;

      ctx.fillStyle = '#aaddff';
      ctx.font = '13px monospace';
      ctx.fillText(`SEED #${seed}  •  CORE LVL ${lvl}  •  FEATS ${featsUnlocked}/${featsTotal}  •  SCORE ${score}`, 34, 104, 620);
      drawOps++;

      // 4 Stat Tiles (DPS / EHP / TIME / KILLS)
      const runTime = Math.max(0, Math.floor(Number(s.runTime) || 0));
      const mm = String(Math.floor(runTime / 60)).padStart(2, '0');
      const ss = String(runTime % 60).padStart(2, '0');
      const tiles = [
        { label: 'EST. DPS', value: String(Math.max(0, Math.round(Number(s.dps) || 0))), sub: `GEAR ${Math.max(0, Math.round(Number(s.gearPower) || 0))}`, col: '#ffaa00' },
        { label: 'EFFECTIVE EHP', value: String(Math.max(0, Math.round(Number(s.ehp) || 0))), sub: `SHIELD ${Math.max(0, Math.round(Number(s.shield) || 0))}`, col: '#00eeff' },
        { label: 'SURVIVAL TIME', value: `${mm}:${ss}`, sub: `EXT STREAK ${Math.max(0, Math.floor(Number(s.extractionStreak) || 0))}`, col: '#00ffaa' },
        { label: 'HOSTILES PURGED', value: String(Math.max(0, Math.floor(Number(s.enemiesKilled) || 0))), sub: `MAX STREAK ${Math.max(0, Math.floor(Number(s.bestKillStreak) || 0))}x`, col: '#ff4488' }
      ];
      const tileW = 172;
      const tileH = 92;
      const tileGap = 14;
      const tileY = 132;
      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        const tx = 34 + i * (tileW + tileGap);
        ctx.fillStyle = 'rgba(10, 20, 44, 0.92)';
        ctx.fillRect(tx, tileY, tileW, tileH);
        ctx.strokeStyle = t.col;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(tx, tileY, tileW, tileH);
        drawOps += 2;

        ctx.textAlign = 'left';
        ctx.fillStyle = t.col;
        ctx.font = 'bold 11px monospace';
        ctx.fillText(t.label, tx + 12, tileY + 22, tileW - 24);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px monospace';
        ctx.fillText(t.value, tx + 12, tileY + 56, tileW - 24);
        ctx.fillStyle = '#8cb4d8';
        ctx.font = '11px monospace';
        ctx.fillText(t.sub, tx + 12, tileY + 78, tileW - 24);
        drawOps += 3;
      }

      // Curated Build Pillars Strip
      ctx.fillStyle = '#9ec7eb';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('SIGNATURE BUILD PILLARS', 34, 254, 730);
      drawOps++;

      const pillars = _collectBuildPillars(s).slice(0, 6);
      const badges = pillars.length > 0 ? pillars : ['BASELINE CHASSIS'];
      const cols = 3;
      const badgeW = 236;
      const badgeH = 34;
      for (let i = 0; i < badges.length; i++) {
        const colIdx = i % cols;
        const rowIdx = Math.floor(i / cols);
        const bx = 34 + colIdx * (badgeW + 12);
        const by = 266 + rowIdx * (badgeH + 10);
        ctx.fillStyle = 'rgba(12, 24, 52, 0.94)';
        ctx.fillRect(bx, by, badgeW, badgeH);
        ctx.strokeStyle = i === 0 ? accent : 'rgba(0, 238, 255, 0.48)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(bx, by, badgeW, badgeH);
        ctx.fillStyle = '#eef8ff';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(badges[i], bx + 10, by + 21, badgeW - 20);
        drawOps += 3;
      }

      // Footer NC2 Code Strip
      ctx.fillStyle = 'rgba(6, 14, 34, 0.96)';
      ctx.fillRect(34, 360, 732, 36);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(34, 360, 732, 36);
      ctx.fillStyle = accent;
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`BUILD SIGNAL: ${buildCode}`, 48, 383, 704);
      drawOps += 3;

      if (typeof ctx.restore === 'function') ctx.restore();

      let dataUrl = null;
      if (canvas && typeof canvas.toDataURL === 'function') {
        try {
          dataUrl = canvas.toDataURL('image/png');
        } catch {
          dataUrl = null;
        }
      }
      return { ok: true, width, height, buildCode, shareText, dataUrl, drawOps };
    }

    return {
      KEYSTONE_ORDER,
      HARMONIC_SEQUENCE_ORDER,
      RELIC_ORDER,
      FRACTURE_KEY_ORDER,
      OUTCOMES,
      MODES,
      _computeDpsAndEhp,
      captureRunSnapshot,
      encodeBuildCode,
      decodeBuildCode,
      formatShareText,
      renderSummaryCardPng
    };
  })();

  return {
    MAX_MODULE_INVENTORY,
    ATTRIBUTE_DEFS,
    ATTRIBUTE_KEYS,
    ATTRIBUTE_MILESTONES,
    MODULE_SLOTS,
    ALL_EQUIPMENT_SLOTS,
    SLOT_IMPLICITS,
    SYNERGY_AFFIX_DEFS,
    MODULE_QUALITIES,
    MODULE_PROPERTIES,
    SIGNATURE_CATALOG,
    APEX_RELIC_CATALOG,
    SHARD_ELEMENTS,
    HARMONIC_SEQUENCES,
    WORLD_PHASES,
    ELITE_MODIFIER_DEFS,
    FRACTURE_KEY_DEFS,
    CONTRACT_TYPES,
    _hyp,
    hyp: _hyp,
    getPhaseConfig,
    getOverclockSyncCost,
    getEffectiveAttributes,
    detectHarmonicSequence,
    formatModuleProperty,
    generateModule,
    generateApexRelic,
    addModuleToInventory,
    equipModule,
    unequipModule,
    salvageModule,
    socketShard,
    unsocketShard,
    synthesizeShards,
    autoSynthesizeAllShards,
    addFrequencyShard,
    getAutoResonanceBonuses,
    getModuleUpgradeCost,
    upgradeModuleLevel,
    autoEquipBestModules,
    salvageWorseModules,
    saveLoadoutPreset,
    applyLoadoutPreset,
    recalibrateModule,
    amplifyModule,
    overdriveModule,
    buyBrokerCapsule,
    ensureContracts,
    recordContractEvent,
    claimContract,
    claimAllCompletedContracts,
    getModulePowerScore,
    getEquippedGearPower,
    applyAttributesAndModules,
    LORE_TRANSMISSIONS,
    getLoreTransmission,
    getLoreTransmissionsByCategory,
    getTransmissionProgress,
    ACHIEVEMENT_CATEGORIES,
    ACHIEVEMENT_CATALOG,
    getAchievementDef,
    getAchievementProgressSnapshot,
    evaluateAchievements,
    formatAchievementReward,
    compactInPlace,
    createCombatBroadphase,
    createSignalTelemetry,
    SignalEchoes,
    RunSummary
  };
})();

if (typeof globalThis !== 'undefined') globalThis.NeonSystems = NeonSystems;
if (typeof window !== 'undefined') window.NeonSystems = NeonSystems;
if (typeof Meta !== 'undefined' && Meta && Meta.data && typeof Meta.sanitizeSlotData === 'function') {
  Meta.sanitizeSlotData();
}
if (typeof module !== 'undefined' && module.exports) module.exports = NeonSystems;
