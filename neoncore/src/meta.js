// src/meta.js
// Handles meta-progression saving and loading using localStorage.

const LEGACY_SAVE_KEY = 'voidcore_save_v1';
const GLOBAL_SAVE_KEY = 'voidcore_global_v1';
const SLOT_SAVE_KEY_PREFIX = 'voidcore_slot_';

const defaultGlobalSave = {
  premiumCurrency: 0,
  soundMuted: false,
  lastDailyClearDate: '',
  bestDailySurvivalSec: 0
};

const defaultSave = {
  currency: 0,
  perkPoints: 0,
  globalXp: 0,
  globalLevel: 1,
  conqueredSectors: [],
  discoveredSectors: ['void'],
  foundMapPerks: [],
  unlockedDeepBeacons: [],
  bestSurvivalSec: 0,
  upgrades: {
    baseHp: 0,
    baseDamage: 0,
    baseSpeed: 0,
    baseFireRate: 0,
    baseCritChance: 0,
    basePierce: 0,
    baseBounce: 0,
    magnetism: 0,
    fireMastery: 0,
    frostMastery: 0,
    stormMastery: 0,
    toxinMastery: 0,
    voidMastery: 0,
    bloodMastery: 0,
    holyMastery: 0,
    earthMastery: 0
  },
  unlockedPerks: ["hp_up", "dmg_up", "speed_up", "fire_rate_up", "crit_chance_up", "crit_dmg_up"],
  spentAttributes: {
    destructivePower: 0,
    kineticCadence: 0,
    structuralVitality: 0,
    signalResonance: 0
  },
  bonusAttributePoints: 0,
  equippedModules: {
    emitter: null,
    lens: null,
    shell: null,
    relay: null,
    auxiliary: null,
    relic: null
  },
  unlockedSlots: {
    auxiliary: false,
    relic: false
  },
  moduleInventory: [],
  frequencyShards: {
    fire: [0, 0],
    frost: [0, 0],
    storm: [0, 0],
    toxin: [0, 0],
    blood: [0, 0],
    holy: [0, 0],
    earth: [0, 0]
  },
  selectedPhase: 1,
  maxUnlockedPhase: 1,
  architectDefeatedPhase: 0,
  singularityLevel: 1,
  maxSingularityLevel: 1,
  rescuedEntities: ['archivist'],
  activeContracts: [],
  completedContracts: 0,
  codexKills: {},
  fractureKeys: {
    dense_lattice: 1,
    twin_wardens: 0,
    volatile_flux: 0
  },
  activeFractureKey: '',
  bestDescentDepth: 0,
  runCount: 0,
  extractionStreak: 0,
  bestExtractionStreak: 0,
  nemesis: null,
  loadoutPresets: [null, null, null],
  activePresetIndex: 0,
  biomeMastery: {
    fire:  { kills: 0, outpostCleared: false, bossDefeated: false },
    frost: { kills: 0, outpostCleared: false, bossDefeated: false },
    storm: { kills: 0, outpostCleared: false, bossDefeated: false },
    toxin: { kills: 0, outpostCleared: false, bossDefeated: false },
    blood: { kills: 0, outpostCleared: false, bossDefeated: false },
    holy:  { kills: 0, outpostCleared: false, bossDefeated: false },
    earth: { kills: 0, outpostCleared: false, bossDefeated: false }
  },
  unlockedTransmissions: [],
  achievements: {
    unlocked: {},
    progress: {},
    claimed: {}
  },
  lifetimeStats: {
    runsCompleted: 0,
    safeExtractions: 0,
    bossesDefeated: 0,
    flawlessBosses: 0,
    exposedBossKills: 0,
    pactsFulfilled: 0,
    nemesisSlain: 0,
    mythicVaultsOpened: 0,
    wanderersMet: 0,
    couriersIntercepted: 0,
    bestKillStreak: 0,
    harmonicBossClears: 0,
    fractureBossClears: 0,
    fastestCitadelSec: 0,
    crucibleWardensSlain: 0
  },
  lastRunSummary: null,
  bestRunSummary: null
};

const STARTER_PERKS = ["hp_up", "dmg_up", "speed_up", "fire_rate_up", "crit_chance_up", "crit_dmg_up"];
const VALID_ATTRIBUTE_KEYS = ['destructivePower', 'kineticCadence', 'structuralVitality', 'signalResonance'];
const VALID_MODULE_SLOTS = ['emitter', 'lens', 'shell', 'relay', 'relic'];
const VALID_MODULE_QUALITIES = ['standard', 'refined', 'harmonic', 'signature', 'mythic'];
const VALID_SHARD_ELEMENTS = ['fire', 'frost', 'storm', 'toxin', 'blood', 'holy', 'earth'];
const VALID_FRACTURE_KEYS = ['dense_lattice', 'twin_wardens', 'volatile_flux'];

function sanitizeNonNegInt(val, fallback = 0) {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

function sanitizeModuleEntry(mod, expectedSlot = null) {
  if (!mod || typeof mod !== 'object' || typeof mod.uid !== 'string' || !mod.uid) return null;
  const slot = VALID_MODULE_SLOTS.includes(mod.slot) ? mod.slot : null;
  if (!slot || (expectedSlot && slot !== expectedSlot)) return null;
  const quality = VALID_MODULE_QUALITIES.includes(mod.quality) ? mod.quality : 'standard';
  const itemTier = Math.min(4, Math.max(1, sanitizeNonNegInt(mod.itemTier, 1)));
  const defaultIlvl = itemTier === 1 ? 1 : (itemTier === 2 ? 10 : (itemTier === 3 ? 25 : 45));
  const itemLevel = Math.max(1, Math.min(99, sanitizeNonNegInt(mod.itemLevel, defaultIlvl)));
  const reqLevel = Math.max(1, Math.min(99, sanitizeNonNegInt(mod.reqLevel, 1)));
  const properties = Array.isArray(mod.properties)
    ? mod.properties
        .filter(p => p && typeof p === 'object' && typeof p.key === 'string' && Number.isFinite(Number(p.value)))
        .map(p => {
          const entry = { key: p.key, value: Number(p.value) };
          if (p.secondaryValue !== undefined && Number.isFinite(Number(p.secondaryValue))) {
            entry.secondaryValue = Number(p.secondaryValue);
          }
          return entry;
        })
    : [];
  const sockets = Array.isArray(mod.sockets)
    ? mod.sockets.map(s => {
        if (!s || typeof s !== 'object' || !VALID_SHARD_ELEMENTS.includes(s.element)) return null;
        return { element: s.element, tier: Number(s.tier) === 2 ? 2 : 1 };
      })
    : [];
  const stab = Number(mod.stabilityPenalty);
  let implicit = null;
  if (mod.implicit && typeof mod.implicit === 'object' && typeof mod.implicit.key === 'string' && Number.isFinite(Number(mod.implicit.value))) {
    implicit = {
      key: mod.implicit.key,
      value: Number(mod.implicit.value),
      label: typeof mod.implicit.label === 'string' ? mod.implicit.label : ''
    };
    if (typeof mod.implicit.secondaryKey === 'string' && Number.isFinite(Number(mod.implicit.secondaryValue))) {
      implicit.secondaryKey = mod.implicit.secondaryKey;
      implicit.secondaryValue = Number(mod.implicit.secondaryValue);
    }
  }
  let synergyAffix = null;
  if (mod.synergyAffix && typeof mod.synergyAffix === 'object' && typeof mod.synergyAffix.id === 'string' && Number.isFinite(Number(mod.synergyAffix.value))) {
    synergyAffix = {
      id: mod.synergyAffix.id,
      value: Number(mod.synergyAffix.value),
      label: typeof mod.synergyAffix.label === 'string' ? mod.synergyAffix.label : ''
    };
  }
  return {
    uid: mod.uid,
    name: typeof mod.name === 'string' ? mod.name : 'Core Module',
    slot,
    quality,
    itemTier,
    itemLevel,
    reqLevel,
    properties,
    sockets,
    implicit,
    synergyAffix,
    signatureId: typeof mod.signatureId === 'string' ? mod.signatureId : null,
    relicId: typeof mod.relicId === 'string' ? mod.relicId : null,
    overdriven: Boolean(mod.overdriven),
    upgradeCount: Math.min(10, sanitizeNonNegInt(mod.upgradeCount, 0)),
    stabilityPenalty: Number.isFinite(stab) && stab > 0 ? stab : 0
  };
}

const VALID_SUMMARY_OUTCOMES = ['ARCHITECT CLEARED', 'SAFE EXTRACTION', 'CRUCIBLE FALL', 'SYSTEM FAILURE'];
const VALID_SUMMARY_MODES = ['overworld', 'daily', 'descent'];
const SUMMARY_BUILD_CODE_RE = /^NC2-[ODC][A-Z0-9]{1,16}-P[1-4]S[1-5]D\d{1,4}-K[0-9A-F]{1,2}-H[0-9A-F]{1,7}-R[0-9A-F]{1,3}-F[0-3]-[0-9A-F]{4}$/;

function sanitizeRunSummary(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.outcome !== 'string' || !VALID_SUMMARY_OUTCOMES.includes(raw.outcome)) return null;
  if (typeof raw.mode !== 'string' || !VALID_SUMMARY_MODES.includes(raw.mode)) return null;

  const seed = (typeof raw.seed === 'string'
    ? raw.seed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)
    : '') || '0';
  const phase = Math.min(4, Math.max(1, sanitizeNonNegInt(raw.phase, 1)));
  const singularityLevel = Math.min(5, Math.max(1, sanitizeNonNegInt(raw.singularityLevel, 1)));
  const descentDepth = Math.max(1, Math.min(9999, sanitizeNonNegInt(raw.descentDepth, 1)));
  const playerLevel = Math.max(1, Math.min(999, sanitizeNonNegInt(raw.playerLevel, 1)));

  const cleanStrArr = (arr, allowList = null) => {
    if (!Array.isArray(arr)) return [];
    const out = [];
    const seen = new Set();
    for (const item of arr) {
      if (typeof item !== 'string') continue;
      const clean = item.trim().slice(0, 64);
      if (!clean || seen.has(clean)) continue;
      if (allowList && !allowList.includes(clean)) continue;
      seen.add(clean);
      out.push(clean);
      if (out.length >= 6) break;
    }
    return out;
  };

  const rs = (typeof NeonSystems !== 'undefined' && NeonSystems && NeonSystems.RunSummary) ? NeonSystems.RunSummary : null;
  const activeKeystoneIds = cleanStrArr(raw.activeKeystoneIds, rs && Array.isArray(rs.KEYSTONE_ORDER) ? rs.KEYSTONE_ORDER : null);
  const harmonicSequenceIds = cleanStrArr(raw.harmonicSequenceIds, rs && Array.isArray(rs.HARMONIC_SEQUENCE_ORDER) ? rs.HARMONIC_SEQUENCE_ORDER : null);
  const harmonicSequenceNames = cleanStrArr(raw.harmonicSequenceNames);
  const relicIds = cleanStrArr(raw.relicIds, rs && Array.isArray(rs.RELIC_ORDER) ? rs.RELIC_ORDER : null);
  const relicNames = cleanStrArr(raw.relicNames);
  const fractureKeyId = (typeof raw.fractureKeyId === 'string' && VALID_FRACTURE_KEYS.includes(raw.fractureKeyId.trim()))
    ? raw.fractureKeyId.trim()
    : '';
  const fractureKeyName = typeof raw.fractureKeyName === 'string' ? raw.fractureKeyName.trim().slice(0, 48) : '';

  let buildCode = typeof raw.buildCode === 'string' ? raw.buildCode.trim().toUpperCase() : '';
  if (!SUMMARY_BUILD_CODE_RE.test(buildCode)) {
    buildCode = '';
  }

  const summary = {
    version: 'NC2',
    outcome: raw.outcome,
    mode: raw.mode,
    seed,
    phase,
    singularityLevel,
    descentDepth,
    playerLevel,
    runTime: sanitizeNonNegInt(raw.runTime, 0),
    enemiesKilled: sanitizeNonNegInt(raw.enemiesKilled, 0),
    bestKillStreak: sanitizeNonNegInt(raw.bestKillStreak, 0),
    extractionStreak: sanitizeNonNegInt(raw.extractionStreak, 0),
    gearPower: sanitizeNonNegInt(raw.gearPower, 0),
    dps: sanitizeNonNegInt(raw.dps, 0),
    ehp: sanitizeNonNegInt(raw.ehp, 0),
    shield: sanitizeNonNegInt(raw.shield, 0),
    featsUnlocked: sanitizeNonNegInt(raw.featsUnlocked, 0),
    featsTotal: Math.max(1, sanitizeNonNegInt(raw.featsTotal, 28)),
    activeKeystoneIds,
    harmonicSequenceIds,
    harmonicSequenceNames,
    relicIds,
    relicNames,
    fractureKeyId,
    fractureKeyName,
    score: sanitizeNonNegInt(raw.score, 0),
    buildCode
  };

  if (rs && typeof rs.decodeBuildCode === 'function' && typeof rs.encodeBuildCode === 'function') {
    if (summary.buildCode) {
      const decoded = rs.decodeBuildCode(summary.buildCode);
      if (!decoded || !decoded.valid) {
        summary.buildCode = '';
      }
    }
    summary.buildCode = rs.encodeBuildCode(summary);
  }

  return summary;
}

const Meta = {
  data: null,
  globalData: null,
  activeSlot: 1,

  _readRaw(key) {
    try {
      if (
        typeof window !== 'undefined' &&
        window.__OTTER_NATIVE_STORAGE__ &&
        Object.prototype.hasOwnProperty.call(window.__OTTER_NATIVE_STORAGE__, key)
      ) {
        const val = window.__OTTER_NATIVE_STORAGE__[key];
        if (typeof val === 'string' && val.length > 0) {
          try { localStorage.setItem(key, val); } catch (_) {}
          return val;
        }
        return null;
      }
      const lsVal = localStorage.getItem(key);
      return (typeof lsVal === 'string' && lsVal.length > 0) ? lsVal : null;
    } catch (e) {
      return null;
    }
  },

  _writeRaw(key, jsonStr) {
    try {
      localStorage.setItem(key, jsonStr);
    } catch (e) {}
    try {
      if (typeof window !== 'undefined') {
        if (window.__OTTER_NATIVE_STORAGE__) {
          window.__OTTER_NATIVE_STORAGE__[key] = jsonStr;
        }
        if (window.OtterStorageChannel && typeof window.OtterStorageChannel.postMessage === 'function') {
          window.OtterStorageChannel.postMessage(JSON.stringify({ key, value: jsonStr }));
        }
      }
    } catch (e) {}
  },

  hydrateNativeStorage(storageMap) {
    if (typeof window === 'undefined' || !storageMap || typeof storageMap !== 'object') return;
    window.__OTTER_NATIVE_STORAGE__ = Object.assign(
      {},
      window.__OTTER_NATIVE_STORAGE__ || {},
      storageMap
    );
    this.init();
    if (typeof showMenu === 'function') {
      showMenu();
    }
  },

  init() {
    this.loadGlobal();
    this.loadSlot(this.activeSlot || 1);
  },

  load() {
    this.loadGlobal();
    this.loadSlot(this.activeSlot || 1);
  },

  loadGlobal() {
    try {
      const saved = this._readRaw(GLOBAL_SAVE_KEY);
      if (saved) {
        this.globalData = { ...defaultGlobalSave, ...JSON.parse(saved) };
      } else {
        const legacy = this._readRaw(LEGACY_SAVE_KEY);
        if (legacy) {
           const legacyData = JSON.parse(legacy);
           this.globalData = { premiumCurrency: legacyData.premiumCurrency || 0 };
        } else {
           this.globalData = { ...defaultGlobalSave };
        }
        this.saveGlobal();
      }
    } catch (e) {
      this.globalData = { ...defaultGlobalSave };
    }
    this.globalData.premiumCurrency = sanitizeNonNegInt(this.globalData.premiumCurrency, 0);
    this.globalData.soundMuted = Boolean(this.globalData.soundMuted);
    this.globalData.lastDailyClearDate =
      typeof this.globalData.lastDailyClearDate === 'string'
        ? this.globalData.lastDailyClearDate
        : '';
    this.globalData.bestDailySurvivalSec = sanitizeNonNegInt(
      this.globalData.bestDailySurvivalSec,
      0
    );
  },

  saveGlobal() {
    try {
      this._writeRaw(GLOBAL_SAVE_KEY, JSON.stringify(this.globalData));
    } catch(e) {}
  },

  loadSlot(slotIndex) {
    this.activeSlot = slotIndex;
    const saveKey = SLOT_SAVE_KEY_PREFIX + slotIndex;
    try {
      const saved = this._readRaw(saveKey);
      if (saved) {
        this.data = { ...JSON.parse(JSON.stringify(defaultSave)), ...JSON.parse(saved) };
        if (!this.data.upgrades) {
          this.data.upgrades = { ...defaultSave.upgrades };
        } else {
          this.data.upgrades = { ...defaultSave.upgrades, ...this.data.upgrades };
        }
        if (!Array.isArray(this.data.unlockedPerks)) {
          this.data.unlockedPerks = [...defaultSave.unlockedPerks];
        }
        if (this.data.bossCores !== undefined) {
          this.data.perkPoints = sanitizeNonNegInt(this.data.perkPoints, 0) + sanitizeNonNegInt(this.data.bossCores, 0);
          delete this.data.bossCores;
        }
      } else {
        if (slotIndex === 1) {
            const legacy = this._readRaw(LEGACY_SAVE_KEY);
            if (legacy) {
                this.data = { ...JSON.parse(JSON.stringify(defaultSave)), ...JSON.parse(legacy) };
                if (!this.data.upgrades) {
                  this.data.upgrades = { ...defaultSave.upgrades };
                } else {
                  this.data.upgrades = { ...defaultSave.upgrades, ...this.data.upgrades };
                }
                if (!Array.isArray(this.data.unlockedPerks)) {
                  this.data.unlockedPerks = [...defaultSave.unlockedPerks];
                }
                delete this.data.premiumCurrency;
                // Delete legacy save so it doesn't restore on hard reset
                localStorage.removeItem(LEGACY_SAVE_KEY);
            } else {
                this.data = JSON.parse(JSON.stringify(defaultSave));
            }
        } else {
            this.data = JSON.parse(JSON.stringify(defaultSave));
        }
      }
      this.sanitizeSlotData();
      this.updateGlobalLevel();
    } catch (e) {
      this.data = JSON.parse(JSON.stringify(defaultSave));
      this.sanitizeSlotData();
      this.updateGlobalLevel();
    }
  },

  sanitizeSlotData() {
    this.data.currency = sanitizeNonNegInt(this.data.currency, 0);
    this.data.perkPoints = sanitizeNonNegInt(this.data.perkPoints, 0);
    this.data.globalXp = sanitizeNonNegInt(this.data.globalXp, 0);
    const gl = Number(this.data.globalLevel);
    this.data.globalLevel = Number.isFinite(gl) ? Math.max(1, Math.floor(gl)) : 1;
    if (!Array.isArray(this.data.unlockedPerks)) {
      this.data.unlockedPerks = [...STARTER_PERKS];
    } else {
      for (const perkId of STARTER_PERKS) {
        if (!this.data.unlockedPerks.includes(perkId)) {
          this.data.unlockedPerks.push(perkId);
        }
      }
    }
    if (!Array.isArray(this.data.conqueredSectors)) {
      this.data.conqueredSectors = [];
    } else {
      this.data.conqueredSectors = this.data.conqueredSectors.filter(s => typeof s === 'string');
    }
    if (!Array.isArray(this.data.discoveredSectors)) {
      this.data.discoveredSectors = ['void'];
    } else {
      this.data.discoveredSectors = this.data.discoveredSectors.filter(s => typeof s === 'string');
      if (!this.data.discoveredSectors.includes('void')) {
        this.data.discoveredSectors.unshift('void');
      }
    }
    if (!Array.isArray(this.data.foundMapPerks)) {
      this.data.foundMapPerks = [];
    } else {
      this.data.foundMapPerks = this.data.foundMapPerks.filter(s => typeof s === 'string');
    }
    if (!Array.isArray(this.data.unlockedDeepBeacons)) {
      this.data.unlockedDeepBeacons = [];
    } else {
      this.data.unlockedDeepBeacons = this.data.unlockedDeepBeacons.filter(s => typeof s === 'string');
    }
    this.data.bestSurvivalSec = sanitizeNonNegInt(this.data.bestSurvivalSec, 0);

    // v2 Attribute & Arsenal schema sanitization
    const rawAttrs = (this.data.spentAttributes && typeof this.data.spentAttributes === 'object') ? this.data.spentAttributes : {};
    this.data.spentAttributes = {
      destructivePower: sanitizeNonNegInt(rawAttrs.destructivePower, 0),
      kineticCadence: sanitizeNonNegInt(rawAttrs.kineticCadence, 0),
      structuralVitality: sanitizeNonNegInt(rawAttrs.structuralVitality, 0),
      signalResonance: sanitizeNonNegInt(rawAttrs.signalResonance, 0)
    };
    this.data.bonusAttributePoints = sanitizeNonNegInt(this.data.bonusAttributePoints, 0);

    const rawEq = (this.data.equippedModules && typeof this.data.equippedModules === 'object') ? this.data.equippedModules : {};
    const auxCandidate = sanitizeModuleEntry(rawEq.auxiliary, null);
    this.data.equippedModules = {
      emitter: sanitizeModuleEntry(rawEq.emitter, 'emitter'),
      lens: sanitizeModuleEntry(rawEq.lens, 'lens'),
      shell: sanitizeModuleEntry(rawEq.shell, 'shell'),
      relay: sanitizeModuleEntry(rawEq.relay, 'relay'),
      auxiliary: (auxCandidate && auxCandidate.slot !== 'relic') ? auxCandidate : null,
      relic: sanitizeModuleEntry(rawEq.relic, 'relic')
    };

    this.data.moduleInventory = Array.isArray(this.data.moduleInventory)
      ? this.data.moduleInventory.map(m => sanitizeModuleEntry(m)).filter(Boolean).slice(0, 36)
      : [];

    const rawUnlocked = (this.data.unlockedSlots && typeof this.data.unlockedSlots === 'object') ? this.data.unlockedSlots : {};
    const hasRelic = Boolean(this.data.equippedModules.relic)
      || this.data.moduleInventory.some(m => m && m.slot === 'relic');
    this.data.unlockedSlots = {
      auxiliary: Boolean(rawUnlocked.auxiliary || this.data.equippedModules.auxiliary),
      relic: Boolean(rawUnlocked.relic || hasRelic)
    };

    const rawShards = (this.data.frequencyShards && typeof this.data.frequencyShards === 'object') ? this.data.frequencyShards : {};
    const cleanShards = {};
    for (const el of VALID_SHARD_ELEMENTS) {
      const pair = Array.isArray(rawShards[el]) ? rawShards[el] : [0, 0];
      cleanShards[el] = [sanitizeNonNegInt(pair[0], 0), sanitizeNonNegInt(pair[1], 0)];
    }
    this.data.frequencyShards = cleanShards;

    this.data.architectDefeatedPhase = Math.min(4, sanitizeNonNegInt(this.data.architectDefeatedPhase, 0));
    const maxAllowedPhase = Math.min(4, Math.max(1, this.data.architectDefeatedPhase + 1));
    this.data.maxUnlockedPhase = Math.min(maxAllowedPhase, Math.max(1, sanitizeNonNegInt(this.data.maxUnlockedPhase, 1)));
    this.data.selectedPhase = Math.min(this.data.maxUnlockedPhase, Math.max(1, sanitizeNonNegInt(this.data.selectedPhase, 1)));
    this.data.maxSingularityLevel = Math.min(5, Math.max(1, sanitizeNonNegInt(this.data.maxSingularityLevel, 1)));
    this.data.singularityLevel = Math.min(this.data.maxSingularityLevel, Math.max(1, sanitizeNonNegInt(this.data.singularityLevel, 1)));

    if (!Array.isArray(this.data.rescuedEntities)) {
      this.data.rescuedEntities = ['archivist'];
    } else {
      this.data.rescuedEntities = this.data.rescuedEntities.filter(s => typeof s === 'string' && s.length > 0);
      if (!this.data.rescuedEntities.includes('archivist')) {
        this.data.rescuedEntities.unshift('archivist');
      }
    }

    this.data.completedContracts = sanitizeNonNegInt(this.data.completedContracts, 0);
    this.data.activeContracts = Array.isArray(this.data.activeContracts)
      ? this.data.activeContracts.filter(c => c && typeof c === 'object' && typeof c.id === 'string' && typeof c.type === 'string')
      : [];

    const rawCodex = (this.data.codexKills && typeof this.data.codexKills === 'object' && !Array.isArray(this.data.codexKills))
      ? this.data.codexKills
      : {};
    const cleanCodex = {};
    for (const [k, v] of Object.entries(rawCodex)) {
      if (typeof k === 'string' && k.length > 0) cleanCodex[k] = sanitizeNonNegInt(v, 0);
    }
    this.data.codexKills = cleanCodex;

    const rawKeys = (this.data.fractureKeys && typeof this.data.fractureKeys === 'object') ? this.data.fractureKeys : {};
    this.data.fractureKeys = {
      dense_lattice: sanitizeNonNegInt(rawKeys.dense_lattice, 1),
      twin_wardens: sanitizeNonNegInt(rawKeys.twin_wardens, 0),
      volatile_flux: sanitizeNonNegInt(rawKeys.volatile_flux, 0)
    };
    this.data.activeFractureKey = (typeof this.data.activeFractureKey === 'string' && VALID_FRACTURE_KEYS.includes(this.data.activeFractureKey))
      ? this.data.activeFractureKey
      : '';
    this.data.bestDescentDepth = sanitizeNonNegInt(this.data.bestDescentDepth, 0);
    this.data.runCount = sanitizeNonNegInt(this.data.runCount, 0);
    this.data.extractionStreak = sanitizeNonNegInt(this.data.extractionStreak, 0);
    this.data.bestExtractionStreak = sanitizeNonNegInt(this.data.bestExtractionStreak, 0);
    const rawNem = this.data.nemesis;
    if (
      rawNem && typeof rawNem === 'object' &&
      typeof rawNem.sectorId === 'string' && rawNem.sectorId &&
      typeof rawNem.enemyType === 'string' && rawNem.enemyType &&
      typeof rawNem.callsign === 'string' && rawNem.callsign
    ) {
      this.data.nemesis = {
        sectorId: rawNem.sectorId,
        enemyType: rawNem.enemyType,
        callsign: rawNem.callsign,
        color: typeof rawNem.color === 'string' ? rawNem.color : '#ff3366',
        zoneLevel: Math.max(1, sanitizeNonNegInt(rawNem.zoneLevel, 1)),
        kills: Math.max(1, sanitizeNonNegInt(rawNem.kills, 1))
      };
    } else {
      this.data.nemesis = null;
    }

    const presetSlots = ['emitter', 'lens', 'shell', 'relay', 'auxiliary', 'relic'];
    const rawPresets = Array.isArray(this.data.loadoutPresets) ? this.data.loadoutPresets : [];
    const cleanPresets = [];
    for (let i = 0; i < 3; i++) {
      const p = rawPresets[i];
      if (p && typeof p === 'object' && p.slots && typeof p.slots === 'object') {
        const cleanSlots = {};
        for (const sk of presetSlots) {
          cleanSlots[sk] = (typeof p.slots[sk] === 'string' && p.slots[sk]) ? p.slots[sk] : null;
        }
        cleanPresets.push({
          name: (typeof p.name === 'string' && p.name.trim()) ? p.name.trim().slice(0, 18) : `SET ${i + 1}`,
          slots: cleanSlots
        });
      } else {
        cleanPresets.push(null);
      }
    }
    this.data.loadoutPresets = cleanPresets;
    this.data.activePresetIndex = Math.min(2, Math.max(0, sanitizeNonNegInt(this.data.activePresetIndex, 0)));

    const rawBM = (this.data.biomeMastery && typeof this.data.biomeMastery === 'object') ? this.data.biomeMastery : {};
    const cleanBM = {};
    for (const el of VALID_SHARD_ELEMENTS) {
      const ebm = (rawBM[el] && typeof rawBM[el] === 'object') ? rawBM[el] : {};
      cleanBM[el] = {
        kills: sanitizeNonNegInt(ebm.kills, 0),
        outpostCleared: Boolean(ebm.outpostCleared),
        bossDefeated: Boolean(ebm.bossDefeated)
      };
    }
    this.data.biomeMastery = cleanBM;

    if (!Array.isArray(this.data.unlockedTransmissions)) {
      this.data.unlockedTransmissions = [];
    } else {
      const hasLoreRegistry = typeof NeonSystems !== 'undefined' && NeonSystems && NeonSystems.LORE_TRANSMISSIONS;
      const isValidTransmissionId = (tid) => {
        if (!hasLoreRegistry) return true;
        if (typeof NeonSystems.getLoreTransmission === 'function') {
          return Boolean(NeonSystems.getLoreTransmission(tid));
        }
        if (Array.isArray(NeonSystems.LORE_TRANSMISSIONS)) {
          return NeonSystems.LORE_TRANSMISSIONS.some(entry => entry && entry.id === tid);
        }
        return Boolean(NeonSystems.LORE_TRANSMISSIONS[tid]);
      };
      const seenTrans = new Set();
      const cleanTrans = [];
      for (const rawId of this.data.unlockedTransmissions) {
        if (typeof rawId !== 'string') continue;
        const id = rawId.trim();
        if (!id || seenTrans.has(id) || !isValidTransmissionId(id)) continue;
        seenTrans.add(id);
        cleanTrans.push(id);
      }
      this.data.unlockedTransmissions = cleanTrans;
    }

    const rawLifetime = (this.data.lifetimeStats && typeof this.data.lifetimeStats === 'object' && !Array.isArray(this.data.lifetimeStats))
      ? this.data.lifetimeStats
      : {};
    const cleanLifetime = {};
    for (const k of Object.keys(defaultSave.lifetimeStats)) {
      cleanLifetime[k] = sanitizeNonNegInt(rawLifetime[k], 0);
    }
    this.data.lifetimeStats = cleanLifetime;

    const hasAchRegistry = typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.getAchievementDef === 'function';
    const rawAch = (this.data.achievements && typeof this.data.achievements === 'object' && !Array.isArray(this.data.achievements))
      ? this.data.achievements
      : {};
    const rawUnlockedMap = (rawAch.unlocked && typeof rawAch.unlocked === 'object' && !Array.isArray(rawAch.unlocked)) ? rawAch.unlocked : {};
    const rawProgressMap = (rawAch.progress && typeof rawAch.progress === 'object' && !Array.isArray(rawAch.progress)) ? rawAch.progress : {};
    const rawClaimedMap = (rawAch.claimed && typeof rawAch.claimed === 'object' && !Array.isArray(rawAch.claimed)) ? rawAch.claimed : {};

    const cleanUnlocked = {};
    for (const [rawId, val] of Object.entries(rawUnlockedMap)) {
      if (typeof rawId !== 'string') continue;
      const id = rawId.trim();
      if (!id) continue;
      if (hasAchRegistry && !NeonSystems.getAchievementDef(id)) continue;
      if (val === true || val === 'true') {
        cleanUnlocked[id] = 1;
      } else {
        const num = Number(val);
        if (Number.isFinite(num) && num > 0) {
          cleanUnlocked[id] = Math.floor(num);
        }
      }
    }

    const cleanProgress = {};
    for (const [rawId, val] of Object.entries(rawProgressMap)) {
      if (typeof rawId !== 'string') continue;
      const id = rawId.trim();
      if (!id) continue;
      const def = hasAchRegistry ? NeonSystems.getAchievementDef(id) : null;
      if (hasAchRegistry && !def) continue;
      const cleanVal = sanitizeNonNegInt(val, 0);
      cleanProgress[id] = def ? Math.min(def.target, cleanVal) : cleanVal;
    }

    const cleanClaimed = {};
    for (const [rawId, val] of Object.entries(rawClaimedMap)) {
      if (typeof rawId !== 'string') continue;
      const id = rawId.trim();
      if (!id) continue;
      if (hasAchRegistry && !NeonSystems.getAchievementDef(id)) continue;
      if (val === true || val === 1 || val === 'true') {
        cleanClaimed[id] = true;
      }
    }

    this.data.achievements = {
      unlocked: cleanUnlocked,
      progress: cleanProgress,
      claimed: cleanClaimed
    };

    if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.evaluateAchievements === 'function') {
      NeonSystems.evaluateAchievements(this, { silent: true, retroactive: true, deferSave: true });
    }

    this.data.lastRunSummary = sanitizeRunSummary(this.data.lastRunSummary);
    this.data.bestRunSummary = sanitizeRunSummary(this.data.bestRunSummary);
  },

  hardResetSlot(slotIndex) {
    const saveKey = SLOT_SAVE_KEY_PREFIX + slotIndex;
    try {
        localStorage.removeItem(saveKey);
        if (typeof window !== 'undefined') {
          if (window.__OTTER_NATIVE_STORAGE__) {
            delete window.__OTTER_NATIVE_STORAGE__[saveKey];
          }
          if (window.OtterStorageChannel && typeof window.OtterStorageChannel.postMessage === 'function') {
            window.OtterStorageChannel.postMessage(JSON.stringify({ key: saveKey, value: '' }));
          }
        }
        if (this.activeSlot === slotIndex) {
            this.loadSlot(slotIndex);
        }
    } catch (e) {}
  },

  updateGlobalLevel() {
    let xp = this.data.globalXp || 0;
    let prevLevel = this.data.globalLevel || 1;
    let level = 1;
    while (xp >= this.getXpRequirementForLevel(level)) {
      xp -= this.getXpRequirementForLevel(level);
      level++;
    }
    const levelsGained = level - prevLevel;
    if (levelsGained > 0) {
      this.data.perkPoints = (this.data.perkPoints || 0) + (levelsGained * 3);
    }
    this.data.globalLevel = level;
    this.data.currentLevelXp = xp;
    this.data.xpForNextLevel = this.getXpRequirementForLevel(level);
  },

  getXpRequirementForLevel(level) {
    let xp = 1000;
    for (let i = 1; i < level; i++) {
      const multiplier = 1.22 + Math.min(0.18, (i / 25) * 0.18);
      xp *= multiplier;
    }
    return Math.floor(xp);
  },

  computeMasterXpFromRun(rawRunXp) {
    const cleanRaw = sanitizeNonNegInt(rawRunXp, 0);
    if (cleanRaw <= 0) return 0;
    const compressed = cleanRaw <= 1000
      ? cleanRaw
      : 1000 + Math.round(Math.sqrt(cleanRaw - 1000) * 26);
    const curLv = this.getGlobalLevel();
    const curReq = this.data && this.data.xpForNextLevel ? this.data.xpForNextLevel : this.getXpRequirementForLevel(curLv);
    const curXp = this.data && this.data.currentLevelXp ? this.data.currentLevelXp : 0;
    const curRem = Math.max(200, curReq - curXp);
    const maxRunXp = curRem + Math.floor(this.getXpRequirementForLevel(curLv + 1) * 0.55);
    return Math.min(compressed, maxRunXp);
  },

  addGlobalXp(amount) {
    this.data.globalXp = sanitizeNonNegInt(this.data.globalXp, 0) + sanitizeNonNegInt(amount, 0);
    this.updateGlobalLevel();
    this.save();
  },

  previewLevelUpPerkPoints(addedGlobalXp) {
    const safeAdded = sanitizeNonNegInt(addedGlobalXp, 0);
    let xp = sanitizeNonNegInt(this.data.globalXp, 0) + safeAdded;
    const prevLevel = Math.max(1, sanitizeNonNegInt(this.data.globalLevel, 1));
    let level = 1;
    while (xp >= this.getXpRequirementForLevel(level)) {
      xp -= this.getXpRequirementForLevel(level);
      level++;
    }
    const levelsGained = level - prevLevel;
    return Math.max(0, levelsGained) * 3;
  },

  getGlobalLevel() { return this.data.globalLevel || 1; },
  getSlotPower(slotIndex) {
      const saveKey = SLOT_SAVE_KEY_PREFIX + slotIndex;
      try {
          const saved = this._readRaw(saveKey);
          let data = null;
          if (saved) {
              data = { ...defaultSave, ...JSON.parse(saved) };
          } else if (slotIndex === 1) {
              const legacy = this._readRaw(LEGACY_SAVE_KEY);
              if (legacy) {
                  data = { ...defaultSave, ...JSON.parse(legacy) };
              }
          }
          if (!data) return 0;
          
          let rawPower = data.unlockedPerks ? data.unlockedPerks.length : 0;
          if (data.upgrades) {
              rawPower += Object.values(data.upgrades).reduce((a, b) => a + b, 0);
          }
          rawPower += (data.globalLevel || 1) * 2;
          rawPower += (data.perkPoints || 0) * 0.2;
          return Math.min(50, Math.sqrt(rawPower) * 6);
      } catch(e) {
          return 0;
      }
  },

  save() {
    try {
      this._writeRaw(SLOT_SAVE_KEY_PREFIX + this.activeSlot, JSON.stringify(this.data));
    } catch (e) {
      console.error("Failed to save.", e);
    }
  },

  addCurrency(amount) {
    this.data.currency = sanitizeNonNegInt(this.data.currency, 0) + sanitizeNonNegInt(amount, 0);
    this.save();
  },

  getCurrency() {
    return sanitizeNonNegInt(this.data.currency, 0);
  },
  
  spendCurrency(amount) {
    const cost = sanitizeNonNegInt(amount, 0);
    if (this.getCurrency() >= cost) {
      this.data.currency = this.getCurrency() - cost;
      this.save();
      return true;
    }
    return false;
  },

  addPremium(amount) {
    this.globalData.premiumCurrency = sanitizeNonNegInt(this.globalData.premiumCurrency, 0) + sanitizeNonNegInt(amount, 0);
    this.saveGlobal();
  },

  getPremium() {
    return sanitizeNonNegInt(this.globalData.premiumCurrency, 0);
  },

  spendPremium(amount) {
    const cost = sanitizeNonNegInt(amount, 0);
    if (this.getPremium() >= cost) {
      this.globalData.premiumCurrency = this.getPremium() - cost;
      this.saveGlobal();
      return true;
    }
    return false;
  },
  
  addPerkPoints(amount) {
    this.data.perkPoints = sanitizeNonNegInt(this.data.perkPoints, 0) + sanitizeNonNegInt(amount, 0);
    this.save();
  },

  getPerkPoints() {
    return sanitizeNonNegInt(this.data.perkPoints, 0);
  },

  spendPerkPoints(amount) {
    const cost = sanitizeNonNegInt(amount, 0);
    if (this.getPerkPoints() >= cost) {
      this.data.perkPoints = this.getPerkPoints() - cost;
      this.save();
      return true;
    }
    return false;
  },

  getUpgradeLevel(upgradeId) {
    return this.data.upgrades[upgradeId] || 0;
  },

  upgrade(upgradeId) {
    this.data.upgrades[upgradeId] = (this.data.upgrades[upgradeId] || 0) + 1;
    this.save();
  },

  isPerkUnlocked(perkId) {
    return this.data.unlockedPerks.includes(perkId);
  },

  unlockPerk(perkId) {
    if (!this.isPerkUnlocked(perkId)) {
      this.data.unlockedPerks.push(perkId);
      this.save();
    }
  },

  getUnlockedTreePerkCount() {
    if (!this.data || !Array.isArray(this.data.unlockedPerks)) return 0;
    let count = 0;
    for (const id of this.data.unlockedPerks) {
      if (!STARTER_PERKS.includes(id)) count++;
    }
    return count;
  },

  getMaxUnlockableTreePerks() {
    return 2 + this.getGlobalLevel() * 2;
  },

  getMaxMasteryRank(masteryId) {
    const ml = this.getGlobalLevel();
    if (masteryId === 'voidMastery') {
      return Math.min(15, Math.max(1, Math.floor((ml + 1) / 2)));
    }
    return Math.min(10, Math.max(1, 1 + Math.floor(ml / 4)));
  },

  evaluateTreeNode(node, nodesById = {}) {
    if (!node || !node.id) {
      return {
        isUnlocked: false,
        isAvailable: false,
        canBuy: false,
        statusClass: 'locked',
        statusText: 'LOCKED',
        lockReason: 'Invalid node',
        cost: 0
      };
    }

    const masterLvl = this.getGlobalLevel();
    const getBranchDepth = (n) => {
      let depth = 0;
      let cur = n;
      const seen = new Set();
      while (cur && cur.parent && !seen.has(cur.id)) {
        seen.add(cur.id);
        depth++;
        const p = nodesById[cur.parent];
        if (!p || p.isMastery) break;
        cur = p;
      }
      return depth;
    };

    // 1. Central Core: The Void (voidMastery — upgradable Haupt-Perk)
    if (node.isMastery && (node.id === 'voidMastery' || node.element === 'void')) {
      const rank = this.getUpgradeLevel('voidMastery');
      const maxRank = this.getMaxMasteryRank('voidMastery');
      const cost = Math.floor((node.costBase || 1) * Math.pow(node.costMult || 1.5, rank));
      const isUnlocked = rank > 0;
      if (rank >= maxRank) {
        return {
          isUnlocked,
          isAvailable: false,
          canBuy: false,
          statusClass: 'unlocked',
          statusText: rank >= 15 ? 'MAX RANK 15' : `CAP LVL ${maxRank} (MASTER ${masterLvl + 1}+)`,
          lockReason: rank >= 15
            ? 'Core reached maximum rank 15.'
            : `Master Level ${masterLvl} caps The Void at Rank ${maxRank}. Reach Master Level ${masterLvl + 1}+ to raise cap.`,
          cost,
          rank,
          maxRank
        };
      }
      return {
        isUnlocked,
        isAvailable: true,
        canBuy: true,
        statusClass: isUnlocked ? 'unlocked' : 'available',
        statusText: isUnlocked ? `RANK ${rank}/${maxRank}` : 'UNLOCK CORE',
        lockReason: '',
        cost,
        rank,
        maxRank
      };
    }

    // 2. Elemental Affinities (fireMastery..earthMastery)
    if (node.isMastery) {
      const rank = this.getUpgradeLevel(node.id);
      const maxRank = this.getMaxMasteryRank(node.id);
      const reqMaster = node.reqGlobalLevel || 1;
      const voidRank = this.getUpgradeLevel('voidMastery');
      const reqVoid = Math.max(1, rank);
      const hasElem = this.canAccessElement(node.element);
      const cost = Math.floor((node.costBase || 1) * Math.pow(node.costMult || 1.5, rank));
      const isUnlocked = rank > 0;

      if (!hasElem) {
        return {
          isUnlocked,
          isAvailable: false,
          canBuy: false,
          statusClass: isUnlocked ? 'unlocked' : 'locked',
          statusText: 'BOSS LOCKED',
          lockReason: `Defeat the ${String(node.element || '').toUpperCase()} Citadel Boss in the Void Megalattice first.`,
          cost,
          rank,
          maxRank
        };
      }
      if (voidRank < reqVoid) {
        return {
          isUnlocked,
          isAvailable: false,
          canBuy: false,
          statusClass: isUnlocked ? 'unlocked' : 'locked',
          statusText: `NEED THE VOID LVL ${reqVoid}`,
          lockReason: `Requires Haupt-Perk 'The Void' at Rank ${reqVoid}+.`,
          cost,
          rank,
          maxRank
        };
      }
      if (masterLvl < reqMaster) {
        return {
          isUnlocked,
          isAvailable: false,
          canBuy: false,
          statusClass: isUnlocked ? 'unlocked' : 'locked',
          statusText: `REQ MASTER LVL ${reqMaster}`,
          lockReason: `Requires Master Level ${reqMaster}.`,
          cost,
          rank,
          maxRank
        };
      }
      if (rank >= maxRank) {
        return {
          isUnlocked,
          isAvailable: false,
          canBuy: false,
          statusClass: 'unlocked',
          statusText: `CAP LVL ${maxRank} (MASTER)`,
          lockReason: `Master Level ${masterLvl} caps Affinity at Rank ${maxRank}. Increase Master Level to unlock higher ranks.`,
          cost,
          rank,
          maxRank
        };
      }
      return {
        isUnlocked,
        isAvailable: !isUnlocked,
        canBuy: true,
        statusClass: isUnlocked ? 'unlocked' : 'available',
        statusText: isUnlocked ? `RANK ${rank}/${maxRank}` : 'PURCHASABLE',
        lockReason: '',
        cost,
        rank,
        maxRank
      };
    }

    // 3. Regular & Keystone Perks
    if (this.isPerkUnlocked(node.id)) {
      return {
        isUnlocked: true,
        isAvailable: false,
        canBuy: false,
        statusClass: 'unlocked',
        statusText: 'ACTIVE',
        lockReason: '',
        cost: 0
      };
    }

    const reqMaster = node.reqGlobalLevel || 1;
    const bDepth = getBranchDepth(node);
    const hasElem = this.canAccessElement(node.element);
    const hasBlueprint = !node.worldHidden || this.isMapPerkFound(node.id);
    const cost = node.cost !== undefined ? node.cost : (node.treeNode ? node.treeNode.cost : 1);

    if (!hasElem) {
      return {
        isUnlocked: false,
        isAvailable: false,
        canBuy: false,
        statusClass: 'locked',
        statusText: 'BOSS LOCKED',
        lockReason: `Defeat the ${String(node.element || '').toUpperCase()} Citadel Boss in the Void Megalattice to awaken this element.`,
        cost
      };
    }

    // Strict Affinity / Void Core Rank Gate
    if (node.element && node.element !== 'void') {
      const reqAff = node.isKeystone ? 3 : Math.min(3, Math.max(1, bDepth));
      const curAff = this.getUpgradeLevel(`${node.element}Mastery`);
      if (curAff < reqAff) {
        const elUp = String(node.element).toUpperCase();
        return {
          isUnlocked: false,
          isAvailable: false,
          canBuy: false,
          statusClass: 'locked',
          statusText: `NEED ${elUp} AFFINITY ${reqAff}`,
          lockReason: `Unlock/upgrade ${elUp} Affinity (Rank ${reqAff}) first.`,
          cost
        };
      }
    } else if (bDepth >= 2 || reqMaster >= 5) {
      const reqVoid = node.isKeystone ? 4 : Math.max(bDepth >= 3 ? 2 : 1, reqMaster >= 14 ? 2 : 1);
      if (this.getUpgradeLevel('voidMastery') < reqVoid) {
        return {
          isUnlocked: false,
          isAvailable: false,
          canBuy: false,
          statusClass: 'locked',
          statusText: `NEED THE VOID LVL ${reqVoid}`,
          lockReason: `Upgrade Haupt-Perk 'The Void' to Rank ${reqVoid} first.`,
          cost
        };
      }
    }

    // Full Parent & Ancestor Chain Gate
    let pId = node.parent !== undefined ? node.parent : (node.treeNode ? node.treeNode.parent : null);
    const visited = new Set([node.id]);
    while (pId && !visited.has(pId)) {
      visited.add(pId);
      const pNode = nodesById[pId];
      if (!pNode) {
        return {
          isUnlocked: false,
          isAvailable: false,
          canBuy: false,
          statusClass: 'locked',
          statusText: 'PARENT LOCKED',
          lockReason: 'Prerequisite perk node is locked.',
          cost
        };
      }
      if (pNode.isMastery) {
        if (pNode.id !== 'voidMastery' && this.getUpgradeLevel(pNode.id) <= 0) {
          return {
            isUnlocked: false,
            isAvailable: false,
            canBuy: false,
            statusClass: 'locked',
            statusText: 'MAIN AFFINITY LOCKED',
            lockReason: `Unlock '${pNode.name}' first.`,
            cost
          };
        }
        if (pNode.id === 'voidMastery' && (bDepth >= 2 || reqMaster >= 5) && this.getUpgradeLevel('voidMastery') <= 0) {
          return {
            isUnlocked: false,
            isAvailable: false,
            canBuy: false,
            statusClass: 'locked',
            statusText: 'NEED THE VOID LVL 1',
            lockReason: "Unlock Haupt-Perk 'The Void' first.",
            cost
          };
        }
      } else if (!this.isPerkUnlocked(pNode.id)) {
        return {
          isUnlocked: false,
          isAvailable: false,
          canBuy: false,
          statusClass: 'locked',
          statusText: 'PARENT LOCKED',
          lockReason: `Unlock '${pNode.name}' first.`,
          cost
        };
      }
      pId = pNode.parent !== undefined ? pNode.parent : (pNode.treeNode ? pNode.treeNode.parent : null);
    }

    if (!hasBlueprint) {
      return {
        isUnlocked: false,
        isAvailable: false,
        canBuy: false,
        statusClass: 'locked',
        statusText: 'HIDDEN ON MAP',
        lockReason: node.vaultHint || 'Find this Blueprint hidden in the Void Megalattice.',
        cost
      };
    }

    if (masterLvl < reqMaster) {
      return {
        isUnlocked: false,
        isAvailable: false,
        canBuy: false,
        statusClass: 'locked',
        statusText: `REQ MASTER LVL ${reqMaster}`,
        lockReason: `Requires Master Level ${reqMaster}.`,
        cost
      };
    }

    const usedSlots = this.getUnlockedTreePerkCount();
    const maxSlots = this.getMaxUnlockableTreePerks();
    if (usedSlots >= maxSlots) {
      return {
        isUnlocked: false,
        isAvailable: false,
        canBuy: false,
        statusClass: 'locked',
        statusText: `MASTER CAP (${usedSlots}/${maxSlots})`,
        lockReason: `Master Level ${masterLvl} allows ${maxSlots} unlocked tree perks. Reach Master Level ${masterLvl + 1} for +2 slots.`,
        cost
      };
    }

    return {
      isUnlocked: false,
      isAvailable: true,
      canBuy: true,
      statusClass: 'available',
      statusText: 'PURCHASABLE',
      lockReason: '',
      cost
    };
  },

  purchaseTreeNode(node, nodesById = {}) {
    const ev = this.evaluateTreeNode(node, nodesById);
    if (!ev.canBuy) {
      return { ok: false, reason: ev.statusText, eval: ev };
    }
    if (!this.spendPerkPoints(ev.cost)) {
      return { ok: false, reason: 'NO_POINTS', eval: ev };
    }
    if (node.isMastery) {
      this.upgrade(node.id);
    } else {
      this.unlockPerk(node.id);
    }
    return { ok: true, eval: this.evaluateTreeNode(node, nodesById) };
  },

  isSectorConquered(element) {
    return Array.isArray(this.data.conqueredSectors) && this.data.conqueredSectors.includes(element);
  },

  canAccessElement(element) {
    return !element || element === 'void' || this.isSectorConquered(element);
  },

  isMapPerkFound(perkId) {
    return Array.isArray(this.data.foundMapPerks) && this.data.foundMapPerks.includes(perkId);
  },

  discoverMapPerk(perkId) {
    if (!perkId) return false;
    if (!Array.isArray(this.data.foundMapPerks)) this.data.foundMapPerks = [];
    if (!this.data.foundMapPerks.includes(perkId)) {
      this.data.foundMapPerks.push(perkId);
      this.save();
      return true;
    }
    return false;
  },

  isDeepBeaconUnlocked(element) {
    return Array.isArray(this.data.unlockedDeepBeacons) && this.data.unlockedDeepBeacons.includes(element);
  },

  unlockDeepBeacon(element) {
    if (!element || element === 'void') return false;
    if (!Array.isArray(this.data.unlockedDeepBeacons)) this.data.unlockedDeepBeacons = [];
    if (!this.data.unlockedDeepBeacons.includes(element)) {
      this.data.unlockedDeepBeacons.push(element);
      this.save();
      return true;
    }
    return false;
  },

  markSectorConquered(element) {
    if (!element || element === 'void') return false;
    if (!Array.isArray(this.data.conqueredSectors)) this.data.conqueredSectors = [];
    if (!this.data.conqueredSectors.includes(element)) {
      this.data.conqueredSectors.push(element);
      this.unlockPhaseForProgress();
      this.save();
      return true;
    }
    return false;
  },

  getTotalAttributePoints() {
    if (!this.data) return 0;
    return Math.max(0, (this.getGlobalLevel() - 1) * 3 + sanitizeNonNegInt(this.data.bonusAttributePoints, 0));
  },

  getAvailableAttributePoints() {
    if (!this.data || !this.data.spentAttributes) return this.getTotalAttributePoints();
    let spent = 0;
    for (const key of VALID_ATTRIBUTE_KEYS) {
      spent += sanitizeNonNegInt(this.data.spentAttributes[key], 0);
    }
    return Math.max(0, this.getTotalAttributePoints() - spent);
  },

  spendAttribute(attrKey, amount = 1) {
    if (!this.data || !this.data.spentAttributes || !VALID_ATTRIBUTE_KEYS.includes(attrKey)) return false;
    const amt = sanitizeNonNegInt(amount, 0);
    if (amt <= 0 || this.getAvailableAttributePoints() < amt) return false;
    this.data.spentAttributes[attrKey] = sanitizeNonNegInt(this.data.spentAttributes[attrKey], 0) + amt;
    this.save();
    return true;
  },

  respecAttributes() {
    if (!this.data) return 0;
    this.data.spentAttributes = {
      destructivePower: 0,
      kineticCadence: 0,
      structuralVitality: 0,
      signalResonance: 0
    };
    this.save();
    return this.getAvailableAttributePoints();
  },

  unlockPhaseForProgress() {
    if (!this.data) return false;
    const defeated = sanitizeNonNegInt(this.data.architectDefeatedPhase, 0);
    const allowed = Math.min(4, Math.max(1, defeated + 1));
    if (this.data.maxUnlockedPhase < allowed) {
      this.data.maxUnlockedPhase = allowed;
      this.save();
      return true;
    }
    return false;
  },

  isSlotUnlocked(slotKey) {
    if (slotKey === 'emitter' || slotKey === 'lens' || slotKey === 'shell' || slotKey === 'relay') {
      return true;
    }
    if (!this.data || !this.data.unlockedSlots) return false;
    return Boolean(this.data.unlockedSlots[slotKey]);
  },

  unlockEquipmentSlot(slotKey) {
    if (!this.data || (slotKey !== 'auxiliary' && slotKey !== 'relic')) return false;
    if (!this.data.unlockedSlots || typeof this.data.unlockedSlots !== 'object') {
      this.data.unlockedSlots = { auxiliary: false, relic: false };
    }
    if (!this.data.unlockedSlots[slotKey]) {
      this.data.unlockedSlots[slotKey] = true;
      this.save();
      return true;
    }
    return false;
  },

  markArchitectDefeated(phase, clearedSingularity = null) {
    if (!this.data) return { firstClear: false, maxUnlockedPhase: 1, maxSingularityLevel: 1 };
    const cleanPhase = Math.min(4, Math.max(1, sanitizeNonNegInt(phase, 1)));
    const prevDefeated = sanitizeNonNegInt(this.data.architectDefeatedPhase, 0);
    const firstClear = cleanPhase > prevDefeated;
    if (firstClear) {
      this.data.architectDefeatedPhase = cleanPhase;
      this.data.perkPoints = sanitizeNonNegInt(this.data.perkPoints, 0) + 2;
      this.data.bonusAttributePoints = sanitizeNonNegInt(this.data.bonusAttributePoints, 0) + 2;
    }
    if (cleanPhase < 4) {
      this.data.maxUnlockedPhase = Math.max(sanitizeNonNegInt(this.data.maxUnlockedPhase, 1), cleanPhase + 1);
    } else {
      this.data.maxUnlockedPhase = 4;
      const curMaxSing = Math.max(1, sanitizeNonNegInt(this.data.maxSingularityLevel, 1));
      if (clearedSingularity == null || sanitizeNonNegInt(clearedSingularity, 1) >= curMaxSing) {
        this.data.maxSingularityLevel = Math.min(5, curMaxSing + 1);
      }
    }
    this.save();
    return {
      firstClear,
      maxUnlockedPhase: this.data.maxUnlockedPhase,
      maxSingularityLevel: this.data.maxSingularityLevel
    };
  },

  isEntityRescued(id) {
    return Boolean(id && this.data && Array.isArray(this.data.rescuedEntities) && this.data.rescuedEntities.includes(id));
  },

  rescueEntity(id) {
    if (!id || typeof id !== 'string' || !this.data) return false;
    if (!Array.isArray(this.data.rescuedEntities)) this.data.rescuedEntities = ['archivist'];
    if (!this.data.rescuedEntities.includes(id)) {
      this.data.rescuedEntities.push(id);
      this.save();
      return true;
    }
    return false;
  },

  recordCodexKill(enemyType, deferSave = false) {
    if (!enemyType || typeof enemyType !== 'string' || !this.data) return 0;
    if (!this.data.codexKills || typeof this.data.codexKills !== 'object') this.data.codexKills = {};
    const next = sanitizeNonNegInt(this.data.codexKills[enemyType], 0) + 1;
    this.data.codexKills[enemyType] = next;
    if (!deferSave) this.save();
    return next;
  },

  updateBestDescentDepth(depth) {
    if (!this.data) return false;
    const cleanDepth = sanitizeNonNegInt(depth, 0);
    if (cleanDepth > sanitizeNonNegInt(this.data.bestDescentDepth, 0)) {
      this.data.bestDescentDepth = cleanDepth;
      this.save();
      return true;
    }
    return false;
  },

  markSectorDiscovered(element) {
    if (!element) return false;
    if (!Array.isArray(this.data.discoveredSectors)) this.data.discoveredSectors = ['void'];
    if (!this.data.discoveredSectors.includes(element)) {
      this.data.discoveredSectors.push(element);
      this.save();
      return true;
    }
    return false;
  },

  recordRunSurvival(seconds, isDaily = false) {
    const cleanSec = sanitizeNonNegInt(seconds, 0);
    if (cleanSec > sanitizeNonNegInt(this.data.bestSurvivalSec, 0)) {
      this.data.bestSurvivalSec = cleanSec;
      this.save();
    }
    if (!this.globalData) this.loadGlobal();
    if (isDaily && cleanSec > sanitizeNonNegInt(this.globalData.bestDailySurvivalSec, 0)) {
      this.globalData.bestDailySurvivalSec = cleanSec;
      this.saveGlobal();
    }
    let newlyUnlocked = [];
    if (
      isDaily &&
      cleanSec >= 60 &&
      typeof NeonSystems !== 'undefined' &&
      NeonSystems &&
      typeof NeonSystems.evaluateAchievements === 'function'
    ) {
      const res = NeonSystems.evaluateAchievements(this, {
        isDailyRun: true,
        runTime: cleanSec
      });
      if (res && Array.isArray(res.newlyUnlocked)) {
        newlyUnlocked = res.newlyUnlocked;
      }
    }
    return {
      bestSurvivalSec: this.data.bestSurvivalSec,
      bestDailySurvivalSec: this.globalData ? this.globalData.bestDailySurvivalSec : 0,
      newlyUnlocked
    };
  },

  getExtractionStreakMult() {
    const st = this.data ? sanitizeNonNegInt(this.data.extractionStreak, 0) : 0;
    return 1 + Math.min(0.60, st * 0.15);
  },

  recordRunSummary(summary, opts = {}) {
    if (!this.data) return null;
    const clean = sanitizeRunSummary(summary);
    if (!clean) return null;
    this.data.lastRunSummary = clean;
    const prevBest = sanitizeRunSummary(this.data.bestRunSummary);
    const isBetter = !prevBest
      || clean.score > prevBest.score
      || (clean.score === prevBest.score && (
        clean.phase > prevBest.phase
        || (clean.phase === prevBest.phase && clean.descentDepth > prevBest.descentDepth)
      ));
    this.data.bestRunSummary = isBetter ? clean : prevBest;
    if (!opts || !opts.deferSave) {
      this.save();
    }
    return clean;
  },

  recordRunOutcome({ extracted = false, safeExtracted = false, killer = null, runTime = 0, enemiesKilled = 0, architectDefeated = false } = {}) {
    if (!this.data) return { newlyUnlocked: [], runSummary: null };
    this.data.runCount = sanitizeNonNegInt(this.data.runCount, 0) + 1;
    if (safeExtracted) {
      this.data.extractionStreak = sanitizeNonNegInt(this.data.extractionStreak, 0) + 1;
      this.data.bestExtractionStreak = Math.max(
        sanitizeNonNegInt(this.data.bestExtractionStreak, 0),
        this.data.extractionStreak
      );
    } else if (!extracted) {
      this.data.extractionStreak = 0;
      if (killer && typeof killer === 'object' && killer.sectorId && killer.sectorId !== 'void') {
        const zLvl = Math.max(1, sanitizeNonNegInt(killer.zoneLevel, 1));
        if (killer.isElite || killer.isBoss || zLvl >= 5) {
          const callsigns = ['VEX-PRIME', 'KRONOS-4', 'PYRO-NULL', 'AETHER-7', 'RAVEN-09', 'TALON-X', 'ORION-8'];
          const prev = this.data.nemesis;
          const idx = (this.data.runCount + zLvl) % callsigns.length;
          this.data.nemesis = {
            sectorId: killer.sectorId,
            enemyType: killer.type || 'brute',
            callsign: (prev && prev.sectorId === killer.sectorId && prev.callsign) ? prev.callsign : callsigns[idx],
            color: typeof killer.color === 'string' ? killer.color : '#ff3366',
            zoneLevel: zLvl,
            kills: (prev && prev.sectorId === killer.sectorId) ? (sanitizeNonNegInt(prev.kills, 1) + 1) : 1
          };
        }
      }
    }
    const activeGameObj = (typeof game !== 'undefined' && game)
      ? game
      : ((typeof globalThis !== 'undefined' && globalThis.game) ? globalThis.game : null);
    const effectiveTime = Math.max(Number(runTime) || 0, activeGameObj ? (Number(activeGameObj.runTime) || 0) : 0);
    const effectiveKills = Math.max(Number(enemiesKilled) || 0, activeGameObj ? (Number(activeGameObj.enemiesKilled) || 0) : 0);
    const meaningfulRun = Boolean(extracted || safeExtracted || effectiveTime > 0 || effectiveKills > 0);
    if (meaningfulRun) {
      this.recordLifetimeStat('runsCompleted', 1, 'inc', true);
      if (safeExtracted) {
        this.recordLifetimeStat('safeExtractions', 1, 'inc', true);
      }
    }
    this.save();

    let newlyUnlocked = [];
    if (
      meaningfulRun &&
      typeof NeonSystems !== 'undefined' &&
      NeonSystems &&
      typeof NeonSystems.evaluateAchievements === 'function'
    ) {
      const res = NeonSystems.evaluateAchievements(this, {
        extracted: Boolean(extracted),
        safeExtracted: Boolean(safeExtracted),
        runTime: effectiveTime,
        enemiesKilled: effectiveKills
      });
      if (res && Array.isArray(res.newlyUnlocked)) {
        newlyUnlocked = res.newlyUnlocked;
      }
    }

    let runSummary = null;
    if (
      meaningfulRun &&
      typeof NeonSystems !== 'undefined' &&
      NeonSystems &&
      NeonSystems.RunSummary &&
      typeof NeonSystems.RunSummary.captureRunSnapshot === 'function'
    ) {
      const snap = NeonSystems.RunSummary.captureRunSnapshot(activeGameObj, this, {
        extracted: Boolean(extracted),
        safeExtracted: Boolean(safeExtracted),
        architectDefeated: Boolean(architectDefeated || (activeGameObj && activeGameObj._architectDefeatedThisRun)),
        runTime: effectiveTime,
        enemiesKilled: effectiveKills
      });
      runSummary = this.recordRunSummary(snap);
    }

    return { newlyUnlocked, runSummary };
  },

  clearNemesis() {
    if (!this.data) return;
    this.data.nemesis = null;
    this.save();
  },

  recordBiomeKill(element, count = 1, deferSave = false) {
    if (!this.data || !VALID_SHARD_ELEMENTS.includes(element)) return 0;
    if (!this.data.biomeMastery || typeof this.data.biomeMastery !== 'object') this.data.biomeMastery = {};
    if (!this.data.biomeMastery[element] || typeof this.data.biomeMastery[element] !== 'object') {
      this.data.biomeMastery[element] = { kills: 0, outpostCleared: false, bossDefeated: false };
    }
    const inc = Math.max(1, sanitizeNonNegInt(count, 1));
    this.data.biomeMastery[element].kills = sanitizeNonNegInt(this.data.biomeMastery[element].kills, 0) + inc;
    if (!deferSave) this.save();
    return this.data.biomeMastery[element].kills;
  },

  markBiomeOutpost(element) {
    if (!this.data || !VALID_SHARD_ELEMENTS.includes(element)) return false;
    if (!this.data.biomeMastery || typeof this.data.biomeMastery !== 'object') this.data.biomeMastery = {};
    if (!this.data.biomeMastery[element] || typeof this.data.biomeMastery[element] !== 'object') {
      this.data.biomeMastery[element] = { kills: 0, outpostCleared: false, bossDefeated: false };
    }
    if (!this.data.biomeMastery[element].outpostCleared) {
      this.data.biomeMastery[element].outpostCleared = true;
      this.save();
      return true;
    }
    return false;
  },

  markBiomeBoss(element) {
    if (!this.data || !VALID_SHARD_ELEMENTS.includes(element)) return false;
    if (!this.data.biomeMastery || typeof this.data.biomeMastery !== 'object') this.data.biomeMastery = {};
    if (!this.data.biomeMastery[element] || typeof this.data.biomeMastery[element] !== 'object') {
      this.data.biomeMastery[element] = { kills: 0, outpostCleared: false, bossDefeated: false };
    }
    if (!this.data.biomeMastery[element].bossDefeated) {
      this.data.biomeMastery[element].bossDefeated = true;
      this.save();
      return true;
    }
    return false;
  },

  getBiomeMasterySummary() {
    const raw = (this.data && this.data.biomeMastery) ? this.data.biomeMastery : {};
    const byElement = {};
    const elemDamageBonuses = {};
    let elementalPenetration = 0;
    let totalMilestones = 0;
    for (const el of VALID_SHARD_ELEMENTS) {
      const entry = raw[el] || {};
      const kills = sanitizeNonNegInt(entry.kills, 0);
      const m1 = kills >= 150;
      const m2 = Boolean(entry.outpostCleared);
      const m3 = Boolean(entry.bossDefeated);
      const completed = (m1 ? 1 : 0) + (m2 ? 1 : 0) + (m3 ? 1 : 0);
      totalMilestones += completed;
      elemDamageBonuses[el] = (m1 ? 0.06 : 0) + (m3 ? 0.10 : 0);
      elementalPenetration += (m2 ? 0.04 : 0) + (m3 ? 0.03 : 0);
      byElement[el] = { kills, killTarget: 150, m1, m2, m3, completed };
    }
    elementalPenetration = Math.min(0.25, Number(elementalPenetration.toFixed(3)));
    return {
      byElement,
      elemDamageBonuses,
      elementalPenetration,
      totalMilestones,
      maxMilestones: VALID_SHARD_ELEMENTS.length * 3
    };
  },

  getTodaySeedKey() {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  },

  canClaimDailyBonus() {
    return this.globalData.lastDailyClearDate !== this.getTodaySeedKey();
  },

  claimDailyBonus() {
    const today = this.getTodaySeedKey();
    if (this.globalData.lastDailyClearDate !== today) {
      this.globalData.lastDailyClearDate = today;
      this.saveGlobal();
      return true;
    }
    return false;
  },

  isSoundMuted() {
    return Boolean(this.globalData && this.globalData.soundMuted);
  },

  toggleSoundMuted() {
    this.globalData.soundMuted = !this.isSoundMuted();
    this.saveGlobal();
    return this.globalData.soundMuted;
  },

  isTransmissionUnlocked(id) {
    if (!this.data || typeof id !== 'string') return false;
    const cleanId = id.trim();
    if (!cleanId) return false;
    return Array.isArray(this.data.unlockedTransmissions) && this.data.unlockedTransmissions.includes(cleanId);
  },

  unlockTransmission(id) {
    if (!this.data || typeof id !== 'string') return false;
    const cleanId = id.trim();
    if (!cleanId) return false;
    if (typeof NeonSystems !== 'undefined' && NeonSystems && NeonSystems.LORE_TRANSMISSIONS) {
      const valid = typeof NeonSystems.getLoreTransmission === 'function'
        ? Boolean(NeonSystems.getLoreTransmission(cleanId))
        : (Array.isArray(NeonSystems.LORE_TRANSMISSIONS)
            ? NeonSystems.LORE_TRANSMISSIONS.some(entry => entry && entry.id === cleanId)
            : Boolean(NeonSystems.LORE_TRANSMISSIONS[cleanId]));
      if (!valid) return false;
    }
    if (!Array.isArray(this.data.unlockedTransmissions)) {
      this.data.unlockedTransmissions = [];
    }
    if (this.data.unlockedTransmissions.includes(cleanId)) return false;
    this.data.unlockedTransmissions.push(cleanId);
    this.save();
    return true;
  },

  getUnlockedTransmissions(modeFilter = null) {
    if (!this.data || !Array.isArray(this.data.unlockedTransmissions)) return [];
    const hasLore = typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.getLoreTransmission === 'function';
    const out = [];
    for (const id of this.data.unlockedTransmissions) {
      if (typeof id !== 'string' || !id) continue;
      if (hasLore) {
        const def = NeonSystems.getLoreTransmission(id);
        if (!def) continue;
        if (modeFilter && def.modeScope !== modeFilter) continue;
      }
      out.push(id);
    }
    return out;
  },

  getTransmissionProgress(modeFilter = null) {
    const unlockedIds = this.getUnlockedTransmissions();
    if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.getTransmissionProgress === 'function') {
      return NeonSystems.getTransmissionProgress(unlockedIds, modeFilter);
    }
    const unlocked = unlockedIds.length;
    return {
      unlocked,
      total: 24,
      ratio: unlocked / 24,
      pct: Math.round((unlocked / 24) * 100),
      byScope: {
        overworld: { unlocked, total: 21 },
        descent: { unlocked: 0, total: 3 }
      }
    };
  },

  recordLifetimeStat(key, val = 1, mode = 'inc', deferSave = false) {
    if (!this.data || typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(defaultSave.lifetimeStats, key)) {
      return 0;
    }
    if (!this.data.lifetimeStats || typeof this.data.lifetimeStats !== 'object') {
      this.data.lifetimeStats = { ...defaultSave.lifetimeStats };
    }
    const cur = sanitizeNonNegInt(this.data.lifetimeStats[key], 0);
    const cleanVal = sanitizeNonNegInt(val, 0);
    let next = cur;
    if (mode === 'max') {
      next = Math.max(cur, cleanVal);
    } else if (mode === 'min_positive') {
      if (cleanVal <= 0) return cur;
      next = cur === 0 ? cleanVal : Math.min(cur, cleanVal);
    } else if (mode === 'set') {
      next = cleanVal;
    } else {
      next = cur + cleanVal;
    }
    this.data.lifetimeStats[key] = next;
    if (!deferSave) this.save();
    return next;
  },

  unlockAchievement(id, rewardOverride = null, opts = {}) {
    if (!this.data || typeof id !== 'string') {
      return { unlocked: false, alreadyUnlocked: false, rewardGranted: false, rewards: null };
    }
    const cleanId = id.trim();
    if (!cleanId) {
      return { unlocked: false, alreadyUnlocked: false, rewardGranted: false, rewards: null };
    }
    const hasAchRegistry = typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.getAchievementDef === 'function';
    const def = hasAchRegistry ? NeonSystems.getAchievementDef(cleanId) : null;
    if (hasAchRegistry && !def) {
      return { unlocked: false, alreadyUnlocked: false, rewardGranted: false, rewards: null };
    }
    if (!this.data.achievements || typeof this.data.achievements !== 'object') {
      this.data.achievements = { unlocked: {}, progress: {}, claimed: {} };
    }
    if (!this.data.achievements.unlocked || typeof this.data.achievements.unlocked !== 'object') this.data.achievements.unlocked = {};
    if (!this.data.achievements.progress || typeof this.data.achievements.progress !== 'object') this.data.achievements.progress = {};
    if (!this.data.achievements.claimed || typeof this.data.achievements.claimed !== 'object') this.data.achievements.claimed = {};

    const ach = this.data.achievements;
    const wasUnlocked = Boolean(ach.unlocked[cleanId]);
    const wasClaimed = Boolean(ach.claimed[cleanId]);
    const silent = Boolean(opts && opts.silent);
    const deferSave = Boolean(opts && opts.deferSave);

    if (!wasUnlocked) {
      ach.unlocked[cleanId] = Date.now() || 1;
      if (def && def.target) {
        ach.progress[cleanId] = Math.max(sanitizeNonNegInt(ach.progress[cleanId], 0), def.target);
      }
    }

    const reward = (rewardOverride && typeof rewardOverride === 'object') ? rewardOverride : ((def && def.reward) || null);
    let rewardGranted = false;

    if (silent) {
      if (!wasClaimed) ach.claimed[cleanId] = true;
      if (!deferSave && (!wasUnlocked || !wasClaimed)) {
        this.save();
      }
    } else if (!wasClaimed) {
      ach.claimed[cleanId] = true;
      if (reward && typeof reward === 'object') {
        const attrPts = sanitizeNonNegInt(reward.attrPoints, 0);
        const perkPts = sanitizeNonNegInt(reward.perkPoints, 0);
        const crystals = sanitizeNonNegInt(reward.crystals, 0);
        const matter = sanitizeNonNegInt(reward.matter, 0);
        const hasValidKey = Boolean(reward.fractureKey && VALID_FRACTURE_KEYS.includes(reward.fractureKey));

        if (attrPts > 0) {
          this.data.bonusAttributePoints = sanitizeNonNegInt(this.data.bonusAttributePoints, 0) + attrPts;
        }
        if (perkPts > 0) {
          this.data.perkPoints = sanitizeNonNegInt(this.data.perkPoints, 0) + perkPts;
        }
        if (hasValidKey) {
          if (!this.data.fractureKeys || typeof this.data.fractureKeys !== 'object') {
            this.data.fractureKeys = { dense_lattice: 1, twin_wardens: 0, volatile_flux: 0 };
          }
          this.data.fractureKeys[reward.fractureKey] = sanitizeNonNegInt(this.data.fractureKeys[reward.fractureKey], 0) + 1;
        }
        if (crystals > 0) {
          if (!this.globalData) this.loadGlobal();
          this.addPremium(crystals);
        }
        if (matter > 0) {
          this.addCurrency(matter);
        } else if (!deferSave) {
          this.save();
        }
        rewardGranted = Boolean(attrPts > 0 || perkPts > 0 || crystals > 0 || matter > 0 || hasValidKey);
      } else if (!deferSave) {
        this.save();
      }
    } else if (!wasUnlocked && !deferSave) {
      this.save();
    }

    return {
      unlocked: !wasUnlocked,
      alreadyUnlocked: wasUnlocked,
      rewardGranted,
      rewards: rewardGranted ? reward : null
    };
  },

  getAchievementSummary() {
    if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.getAchievementProgressSnapshot === 'function') {
      return NeonSystems.getAchievementProgressSnapshot(this);
    }
    const unlockedMap = (this.data && this.data.achievements && this.data.achievements.unlocked) ? this.data.achievements.unlocked : {};
    const unlockedCount = Object.keys(unlockedMap).length;
    return {
      unlockedCount,
      totalCount: 28,
      pct: Math.round((unlockedCount / 28) * 100),
      byCategory: {},
      items: []
    };
  }
};

Meta.init();
