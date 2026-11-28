// src/game.js

const _isMarkedForDeletion = (item) => !item || item.markedForDeletion;
const _isConsumedPortal = (portal) => !portal || portal.consumed;

function createSeededRng(seedStr) {
  let h = 2166136261 >>> 0;
  const seedText = String(seedStr || '0');
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Game {
  constructor(canvas) {
    globalThis.game = this;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.arenaSize = 1500;
    this.worldSize = 96000;
    
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.reset();
  }

  resize() {
    const cw = this.canvas ? (this.canvas.clientWidth || 0) : 0;
    const ch = this.canvas ? (this.canvas.clientHeight || 0) : 0;
    if (cw > 0 && ch > 0) {
      const isPortrait = ch >= cw;
      const shortEdge = isPortrait ? 740 : 860;
      if (isPortrait) {
        this.canvas.width = shortEdge;
        this.canvas.height = Math.round(shortEdge * (ch / cw));
      } else {
        this.canvas.height = shortEdge;
        this.canvas.width = Math.round(shortEdge * (cw / ch));
      }
      const cssScale = this.canvas.width / Math.max(320, cw);
      this.hudScale = Math.max(1.0, Math.min(2.1, cssScale));
    } else {
      // Fixed logical resolution for headless tests / zero-sized containers
      this.canvas.width = this.arenaSize || 1500;
      this.canvas.height = this.arenaSize || 1500;
      this.hudScale = 1.0;
    }
  }

  getScaledRadarSize(vw = 1280, vh = 720) {
    const hs = Math.min(1.85, this.hudScale || 1.0);
    const base = Math.min(132, Math.max(96, Math.floor(Math.min(vw, vh) * 0.18)));
    return Math.min(Math.floor(vw * 0.34), Math.round(base * hs));
  }

  getBiomeAffinityText(sectorId) {
    if (!sectorId || sectorId === 'void' || typeof BIOME_ELEMENTAL_AFFINITY === 'undefined') return null;
    const aff = BIOME_ELEMENTAL_AFFINITY[sectorId];
    if (!aff) return null;
    const code = (el) => ({ fire: 'FIR', frost: 'ICE', storm: 'STM', toxin: 'TOX', earth: 'ERT', blood: 'BLD', holy: 'HLY' }[el] || el.toUpperCase());
    return {
      weak: aff.weak.map(code).join('/'),
      resist: aff.resist.map(code).join('/'),
      weakFull: aff.weak.map(e => e.toUpperCase()).join('/'),
      resistFull: aff.resist.map(e => e.toUpperCase()).join('/')
    };
  }

  reset(options = {}) {
    globalThis.game = this;
    this.arenaSize = 1500;
    this.worldSize = 96000;
    this.resize();

    this.isDailyRun = Boolean(options && options.dailySeed);
    this.dailySeed = options && options.dailySeed ? String(options.dailySeed) : '';
    this._rngFn = this.isDailyRun ? createSeededRng(this.dailySeed) : Math.random;
    this.rng = () => this._rngFn();
    Game._runSeedSeq = (Game._runSeedSeq || 0) + 1;
    this.runSeed = this.isDailyRun
      ? this.dailySeed
      : ((Date.now() ^ Math.imul(Game._runSeedSeq, 2654435761)) >>> 0).toString(36).toUpperCase().padStart(6, '0');
    this._architectDefeatedThisRun = false;

    this.isDescentMode = Boolean(options && options.mode === 'descent');
    this.descentBoundSize = this.isDescentMode ? 2600 : 0;
    this.descentDepth = 1;
    this.descentWaveTimer = 0.6;
    this.descentWaveMaxTimer = 14.0;
    this.descentWaveSpawned = false;
    this._descentWaveCompressed = false;

    this.activeFractureKeyId = '';
    if (
      typeof Meta !== 'undefined' && Meta.data && Meta.data.activeFractureKey &&
      typeof NeonSystems !== 'undefined' && NeonSystems && NeonSystems.FRACTURE_KEY_DEFS
    ) {
      const kId = Meta.data.activeFractureKey;
      const count = Meta.data.fractureKeys ? (Meta.data.fractureKeys[kId] || 0) : 0;
      if (NeonSystems.FRACTURE_KEY_DEFS[kId] && count > 0) {
        this.activeFractureKeyId = kId;
        if (options && options.consumeFractureKey) {
          Meta.data.fractureKeys[kId] = Math.max(0, count - 1);
          if (Meta.data.fractureKeys[kId] <= 0) {
            Meta.data.activeFractureKey = '';
          }
          if (typeof Meta.save === 'function') Meta.save();
        }
      }
    }

    this.world = (typeof VoidWorld !== 'undefined')
      ? new VoidWorld(this.worldSize, () => this.rng(), this.isDescentMode ? { mode: 'descent', boundSize: this.descentBoundSize } : null)
      : null;
    const spawnPos = this.world ? this.world.center : (this.canvas.width / 2);
    this.player = new Player(spawnPos, spawnPos);
    this.camera = { x: this.player.x, y: this.player.y, zoom: 1.0, targetZoom: 1.0, shakeTimer: 0, shakeIntensity: 0 };

    this.enemies = [];
    this.projectiles = [];
    this.xpOrbs = [];
    this.bossOrbs = [];
    this.supplyDrops = [];
    this.moduleDrops = [];
    this.floatingTexts = [];
    this.turrets = [];
    this.echoQueue = [];
    this.particles = [];
    this.lightnings = [];
    this.blackHoles = [];
    this.acidPools = [];
    this.iceTrails = [];
    this.meteors = [];
    this.enemyProjectiles = [];
    this.enemyExplosions = [];
    this.enemyAcidPools = [];

    this._broadphase = (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.createCombatBroadphase === 'function')
      ? NeonSystems.createCombatBroadphase()
      : null;
    this._signalTelemetry = (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.createSignalTelemetry === 'function')
      ? NeonSystems.createSignalTelemetry()
      : null;
    this._inUpdateLoop = false;
    this._broadphaseProjScratch = [];
    this._broadphaseProcScratch = [];
    this._broadphasePulseScratch = [];
    this._broadphaseAuraScratch = [];
    this._broadphaseEntityScratch = [];

    
    this.statManager = new StatManager();
    this.updatePlayerStats();

    this.player.hp = this.player.maxHp;
    this.player.energyShield = this.player.maxEnergyShield;

    this.runTime = 0;
    this.lastFireTime = 0;
    this.currencyCollected = 0;
    this.perkPointsCollected = 0;
    this.totalXpEarned = 0;
    this.enemiesKilled = 0;
    this.pendingBonusLevelUps = 0;
    this.lastLevelWasBonusPerk = false;
    this.chronoPulseTimer = 0;
    this.hitsLanded = 0;
    this.killHasteTimer = 0;
    this.evasiveBurstTimer = 0;
    this.secondWindUsed = false;
    this.blackHoleCooldown = 0;
    this.igniteHitCounter = 0;
    this.freezeHitCounter = 0;
    this.overchargeTimer = 0;
    this.frenzyTimer = 0;
    this.killStreak = 0;
    this.killStreakTimer = 0;
    this.bestKillStreak = 0;
    this.currentSectorId = this.isDescentMode ? 'singularity_descent' : 'void';
    if (typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.setBiome === 'function') {
      NeonAudio.setBiome(this.currentSectorId);
    }
    this.alertFlashTimer = 0;
    this.alertFlashColor = '#ff00ff';
    this._damageFlashTimer = 0;
    this._damageFlashColor = '#ff2244';
    this._damageSourceAngle = null;
    this._critShakeCd = 0;
    this._killShakeCd = 0;
    this.lastSanctumReturnAt = -999;
    this.safeExtractBonus = 0;
    this.returnPortals = [];
    this.shockwaves = [];
    this.signalCourier = null;
    this.courierSpawnTimer = 68.0;
    const phaseCfg = this.getActivePhaseConfig();
    this.sectorBanner = this.isDescentMode
      ? { text: 'SINGULARITY CRUCIBLE', sub: `DEPTH 1 • ${phaseCfg.name.toUpperCase()}`, color: '#ff22ee', timer: 4.0, priority: 1 }
      : (this.isDailyRun
          ? { text: `DAILY RIFT #${this.dailySeed}`, sub: 'SEEDED CHALLENGE • 2X FIRST CLEAR', color: '#ffd700', timer: 4.0, priority: 1 }
          : { text: 'VOID SANCTUM', sub: phaseCfg.phase > 1 ? `${phaseCfg.name.toUpperCase()} • FOLLOW CENTER ARROWS` : 'FOLLOW CENTER ARROWS • SEEK MONOLITHS', color: '#00ffff', timer: 4.0, priority: 1 });
    
    this.enemySpawnTimer = 0;
    this.isRelaxedPhase = true;
    this.cocktailTimer = 25.0;
    this.currentCocktail = 'standard';
    this.specialEnemiesQuota = 0;
    this.stressLevel = 50;
    this.directorTimer = 0;
    this.recentKills = 0;
    this.recentDamageTaken = 0;
    this.shotsFired = 0;
    this.postReviveTimer = 0;
    
    this.auraTimer = 0;
    this.regenTimer = 0;
    this.repulsionTimer = 0;
    this.vacuumTimer = 0;
    this.divineShieldCooldown = 0;
    this.codtCooldown = 0;
    this.bloodNovaCooldown = 0;
    this.frostNovaCooldown = 0;
    this.evasionCooldown = 0;
    this.holyWardCooldown = 0;
    this.phasingCooldown = 0;
    this._loiterAnchorX = this.player ? this.player.x : 48000;
    this._loiterAnchorY = this.player ? this.player.y : 48000;
    this._loiterTime = 0;
    this._campAmbushCooldown = 0;
    this._holdingObjectiveThisTick = false;
    this._runOutcomeRecorded = false;
    this.ambushActiveTimer = 0;
    this.ambushWarningActive = false;
    this.siphonWindowTimer = 0;
    this.siphonHealedThisSec = 0;
    this.harmonicBlessingTimer = 0;
    this.activeVolatilePact = null;
    this._codexKillBuffer = 0;
    this.staticChargeValue = 0;
    this.earthquakeTimer = 0;
    this.iceTrailTimer = 0;
    this.lastIcePos = null;
    this.aimAngle = 0;
    this.smoothInput = { x: 0, y: 0 };

    this.gameOver = false;
    this.phasingTimer = 0;
    this.shattersThisFrame = 0; // Prevent shatter crash

    this.event15Triggered = false;
    this.event25Triggered = false;
    this.event35Triggered = false;
    this.wavePauseTimer = 0;

    this.swarmMode = 'HUNT';
    this.swarmPattern = 0;
    this.swarmTimer = 0;
    this.swarmCooldown = 12.0; // Allow initial buildup before first tactical formation
    this.patternTime = 0;

    // Boss Pre-Fight Dramaturgy & Biome Infusion State (v2.2)
    this.bossPrelude = null;
    this.pendingBossQueue = [];
    this.activeBossEncounter = null;
    this.playerInfusionChillTimer = 0;
    this.bossTelegraphs = [];
    this.signalCut = null;
    this.warpArrivalPulse = null;
    this._lastSectorCutAt = -10;
    this._lastRevealRect = null;

    // Ecology, Patrols, Chasms/Gates & Hazards (v1.3)
    this.populatedCells = new Map();
    this.nextPackId = 1;
    this.ecologyTimer = 0;
    this.gateNoticeCooldown = 0;
    this.warpArrivalCooldown = 0;
    this.ambushTimer = 90.0;
    this.playerInCryo = false;
    this.playerOnBoost = false;
    this.playerBoostMult = 1.55;
    this.playerBloodOverdrive = false;
    this.currentSectorRing = 0;
    this._initialCampsPopulated = false;
    if (this.player) {
      this.player._allowInwardGateReturn = true;
      this.player._inwardGateCrossing = false;
      this.player._prevCenterDist = this.world ? Math.hypot(this.player.x - this.world.center, this.player.y - this.world.center) : 0;
    }

    this.wanderer = null;
    if (!this.isDescentMode && this.world) {
      const wp = this.world._polar(30500, 1.25);
      this.wanderer = { x: wp.x, y: wp.y, radius: 55, visited: false, color: '#00ffaa', pulse: 0 };
    }

    // Clockwork Boss Arena, Overdrive Jump, Sector Bounties & Nemesis Vendetta State (v3.0)
    this.activeBossArena = null;
    this.overdriveChain = 0;
    this.activeSectorBounty = null;
    this._bountyCooldown = 0;
    this.nemesisSpawnedThisRun = false;
    this.activeNemesisRef = null;
    this.lastDamageSource = null;

    // Tactical Pause Map & Mini-Radar Zoom State (v2.6.1)
    this.mapZoom = this.isDescentMode ? 1.0 : (this.mapZoom || 2.6);
    this.mapCamX = this.world ? this.world.center : 48000;
    this.mapCamY = this.world ? this.world.center : 48000;
    this.mapSelectedPoi = null;
    this._pauseMapRect = null;
    this._pauseMapButtons = [];
    this._pauseMapPoiHits = [];
    this._lastMapTap = null;
    this.miniRadarRanges = [3200, 5800, 10500];
    this.miniRadarZoomIdx = (this.miniRadarZoomIdx !== undefined) ? this.miniRadarZoomIdx : 1;

    this._transmissionQueue = [];
    this.activeTransmission = null;
    this._spokenEchoIds = new Set();
    this._lastEchoId = null;
    this._echoCooldown = 0;
    this._lastTransmissionRect = null;
    this.mapLogsOpen = false;
    this.mapLogIndex = 0;
    this.mapCardMode = 'logs';
    this.mapCardSource = 'live';
    this._cardActionToast = '';
    this._cardActionToastUntil = 0;
    this.mapFeatIndex = 0;
    this._bossFightActive = false;
    this._bossFightHullDamaged = false;
    this._bossFightStartedAt = 0;
    this._runWandererMet = false;
    this._runMythicVault = false;
    this._runNemesisOrCourier = false;
    this._daily60Evaluated = false;
    this._deathAchievementsEvaluated = false;
    this._pauseMapLoreRect = null;
    this._pauseMapInspectorRect = null;
    this._pauseMapTelemetryRect = null;

    if (this.isDescentMode) {
      this.queueTransmission('descent_crucible_entry');
    } else {
      this.queueTransmission(`phase_${phaseCfg.phase}`);
    }
  }

  getActiveArenaBounds() {
    if (this.isDescentMode && this.descentBoundSize) {
      const half = this.descentBoundSize / 2;
      const cx = this.world ? this.world.center : 48000;
      return { minX: cx - half, minY: cx - half, maxX: cx + half, maxY: cx + half };
    }
    return {
      minX: 0,
      minY: 0,
      maxX: this.worldSize || (this.canvas ? this.canvas.width : 1500),
      maxY: this.worldSize || (this.canvas ? this.canvas.height : 1500)
    };
  }

  getVoidInstability() {
    const t = this.runTime || 0;
    if (t <= 95) {
      return { hpMult: 1.0, dmgMult: 1.0, spdMult: 1.0, sustainMult: 1.0, minZoneFloor: 1 };
    }
    const mins = (t - 95) / 60;
    const hpMult = 1 + mins * 0.12 + Math.pow(Math.max(0, mins - 5), 1.50) * 0.14;
    const dmgMult = 1 + mins * 0.16 + Math.pow(Math.max(0, mins - 5), 1.58) * 0.18;
    const spdMult = Math.min(1.70, 1 + mins * 0.036);
    const sustainMult = 1 / (1 + Math.max(0, (t - 360) / 300));
    const minZoneFloor = Math.max(1, Math.floor(((this.player && this.player.level) ? this.player.level : 1) * 0.85));
    return { hpMult, dmgMult, spdMult, sustainMult, minZoneFloor };
  }

  getAdaptiveScaling() {
    let gearPower = 0;
    let metaLv = 1;
    let unlockedCount = 6;
    let runCount = 0;
    let extStreak = 0;
    let attrTotal = 0;
    if (typeof Meta !== 'undefined' && Meta && Meta.data) {
      metaLv = typeof Meta.getGlobalLevel === 'function' ? Meta.getGlobalLevel() : (Meta.data.globalLevel || 1);
      unlockedCount = Array.isArray(Meta.data.unlockedPerks) ? Meta.data.unlockedPerks.length : 6;
      runCount = Meta.data.runCount || 0;
      extStreak = Meta.data.extractionStreak || 0;
      if (Meta.data.spentAttributes) {
        for (const v of Object.values(Meta.data.spentAttributes)) attrTotal += (Number(v) || 0);
      }
      if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.getEquippedGearPower === 'function') {
        gearPower = NeonSystems.getEquippedGearPower(Meta);
      }
    }
    const inRunLv = (this.player && this.player.level) ? this.player.level : 1;
    const powerIndex = Math.max(
      0,
      gearPower / 40 +
      Math.max(0, metaLv - 1) * 0.25 +
      Math.max(0, unlockedCount - 6) * 0.08 +
      attrTotal * 0.015 +
      Math.max(0, inRunLv - 1) * 0.14 +
      Math.min(4.0, runCount * 0.06) +
      Math.min(3.0, extStreak * 0.55)
    );
    return {
      powerIndex,
      hpMult: 1 + 0.16 * Math.log1p(powerIndex * 0.85),
      dmgMult: 1 + 0.12 * Math.log1p(powerIndex * 0.75),
      spdMult: Math.min(1.22, 1 + 0.045 * Math.log1p(powerIndex * 0.60))
    };
  }

  _getZoneScaling(x, y, minLevel = 1) {
    const sec = this.world ? this.world.getSectorAt(x, y) : null;
    const inst = this.getVoidInstability();
    const adapt = this.getAdaptiveScaling();
    const baseZ = Math.max(minLevel, sec ? (sec.zoneLevel || minLevel) : minLevel);
    const z = Math.max(baseZ, inst.minZoneFloor || 1);
    const hpScaling = (27.5 + (z - 1) * 9.5 + Math.pow(Math.max(0, z - 1), 1.50) * 1.15) * inst.hpMult * adapt.hpMult;
    const dmgMult = (1 + (z - 1) * 0.105 + Math.pow(Math.max(0, z - 1), 1.25) * 0.042) * inst.dmgMult * adapt.dmgMult;
    const speedScaling = Math.min(345, Math.min(255, 74 + z * 2.25) * inst.spdMult * adapt.spdMult);
    return { sec, z, hpScaling, dmgMult, speedScaling, adapt };
  }

  applyPackPaceVariance(en) {
    if (!en || en.isBoss || en.isBossPylon || en._paceVarianceApplied) return en;
    en._paceVarianceApplied = true;
    const roll = typeof this.rng === 'function' ? this.rng() : Math.random();
    const r2 = typeof this.rng === 'function' ? this.rng() : Math.random();
    const sec = this.world ? this.world.getSectorAt(en.x, en.y) : null;
    const earlyZone = sec && (sec.zoneLevel || 1) <= 4;
    if (roll < 0.26) {
      // Fast flanker / rusher variant
      en.baseSpeed *= earlyZone ? (1.12 + r2 * 0.10) : (1.18 + r2 * 0.12);
      en._paceTier = 'fast';
    } else if (roll < 0.74) {
      // Standard variant with light spread
      en.baseSpeed *= 0.96 + r2 * 0.12;
      en._paceTier = 'standard';
    } else {
      // Heavy stalker variant: slightly slower, hits harder
      en.baseSpeed *= 0.84 + r2 * 0.10;
      en.damage *= 1.12;
      en._paceTier = 'heavy';
    }
    return en;
  }

  _resolveActiveBossArenaBoundary(entity, isBoss = false) {
    const arena = this.activeBossArena;
    if (!arena || !entity) return false;
    const dx = entity.x - arena.cx;
    const dy = entity.y - arena.cy;
    const dist = Math.hypot(dx, dy);
    const maxAllowed = Math.max(40, arena.radius - (entity.radius || 15));
    if (dist > maxAllowed) {
      const nx = dist > 0.001 ? dx / dist : 1;
      const ny = dist > 0.001 ? dy / dist : 0;
      entity.x = arena.cx + nx * maxAllowed;
      entity.y = arena.cy + ny * maxAllowed;
      if (isBoss && entity._bossDash) {
        entity._hitWallThisTick = true;
      }
      return true;
    }
    return false;
  }

  setBanner(text, sub = '', color = '#00ffff', timer = 3.2, priority = 1, alertFlash = false) {
    const prio = priority || 1;
    if (this.sectorBanner && this.sectorBanner.timer > 0.35 && (this.sectorBanner.priority || 1) > prio) {
      return false;
    }
    this.sectorBanner = { text, sub, color, timer, priority: prio };
    if (alertFlash) {
      this.alertFlashTimer = Math.max(this.alertFlashTimer || 0, 1.35);
      this.alertFlashColor = color || '#ff00ff';
    }
    return true;
  }

  triggerSignalCut(kind = 'warp', color = '#00ffff', duration = 0.34, label = '', meta = null) {
    const maxDur = this.isDescentMode ? 0.34 : 0.45;
    const dur = Math.max(0.10, Math.min(maxDur, Number(duration) || 0.34));
    this.signalCut = {
      kind: String(kind || 'warp'),
      color: color || '#00ffff',
      label: label ? String(label) : '',
      meta: (meta && typeof meta === 'object') ? meta : null,
      timer: dur,
      maxTimer: dur,
      seed: ((this.runTime || 0) * 13.7 + (this.enemiesKilled || 0) * 0.7) % 100
    };
    return this.signalCut;
  }

  queueTransmission(id) {
    if (!id || typeof NeonSystems === 'undefined' || !NeonSystems || typeof NeonSystems.getLoreTransmission !== 'function') {
      return false;
    }
    const entry = NeonSystems.getLoreTransmission(id);
    if (!entry) return false;
    const expectedScope = this.isDescentMode ? 'descent' : 'overworld';
    if (entry.modeScope !== expectedScope) return false;
    if (typeof Meta === 'undefined' || !Meta || typeof Meta.unlockTransmission !== 'function') {
      return false;
    }
    if (!Meta.unlockTransmission(entry.id)) return false;

    const payload = {
      id: entry.id,
      speaker: entry.speaker,
      channelTag: entry.channelTag,
      color: entry.color,
      title: entry.title,
      text: entry.text,
      modeScope: entry.modeScope,
      timer: 4.8,
      maxTimer: 4.8
    };
    if (!Array.isArray(this._transmissionQueue)) this._transmissionQueue = [];
    const preludeBlocks = Boolean(this.bossPrelude && !this.isDescentMode);
    if (!this.activeTransmission && !preludeBlocks) {
      this.activeTransmission = payload;
    } else {
      this._transmissionQueue.push(payload);
    }
    return true;
  }

  _wrapCanvasText(ctx, text, maxWidth, fontPx = 11, maxLines = 4) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    const words = raw.split(/\s+/);
    const safeMaxW = Math.max(60, Number(maxWidth) || 200);
    const estCharW = Math.max(5.0, (Number(fontPx) || 11) * 0.56);
    const measure = (s) => {
      const piece = String(s || '');
      const est = piece.length * estCharW;
      if (ctx && typeof ctx.measureText === 'function') {
        const m = ctx.measureText(piece);
        const mw = m && Number.isFinite(m.width) ? m.width : 0;
        if (mw > 18 || piece.length <= 2) return Math.max(mw, est * 0.90);
      }
      return est;
    };
    const lines = [];
    let current = '';
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const candidate = current ? `${current} ${w}` : w;
      if (!current || measure(candidate) <= safeMaxW) {
        current = candidate;
      } else {
        lines.push(current);
        current = w;
        if (lines.length >= maxLines) break;
      }
    }
    if (lines.length < maxLines && current) {
      lines.push(current);
    } else if (lines.length >= maxLines && current) {
      let tail = lines[maxLines - 1];
      if (!tail.endsWith('...')) tail += '...';
      while (tail.length > 4 && measure(tail) > safeMaxW) {
        tail = tail.slice(0, -4).trimEnd() + '...';
      }
      lines[maxLines - 1] = tail;
    }
    return lines;
  }

  _getPauseMapLorePool() {
    if (typeof NeonSystems === 'undefined' || !NeonSystems || !Array.isArray(NeonSystems.LORE_TRANSMISSIONS)) {
      return [];
    }
    const list = NeonSystems.LORE_TRANSMISSIONS;
    return this.isDescentMode ? list.filter(t => t && t.modeScope === 'descent') : list.slice();
  }

  _stepPauseMapLog(delta = 1) {
    const pool = this._getPauseMapLorePool();
    if (!pool.length) return;
    const cur = Number.isFinite(this.mapLogIndex) ? this.mapLogIndex : 0;
    this.mapLogIndex = ((cur + delta) % pool.length + pool.length) % pool.length;
  }

  _openLoreDecoderById(id) {
    const pool = this._getPauseMapLorePool();
    if (!pool.length) return false;
    const idx = pool.findIndex(t => t && t.id === id);
    if (idx !== -1) this.mapLogIndex = idx;
    this.mapCardMode = 'logs';
    this.mapLogsOpen = true;
    return true;
  }

  _stepPauseMapFeat(delta = 1) {
    const pool = (typeof NeonSystems !== 'undefined' && NeonSystems && Array.isArray(NeonSystems.ACHIEVEMENT_CATALOG))
      ? NeonSystems.ACHIEVEMENT_CATALOG
      : [];
    if (!pool.length) return;
    const cur = Number.isFinite(this.mapFeatIndex) ? this.mapFeatIndex : 0;
    this.mapFeatIndex = ((cur + delta) % pool.length + pool.length) % pool.length;
  }

  _getAvailablePauseMapCardSources() {
    const sources = ['live'];
    if (typeof Meta !== 'undefined' && Meta && Meta.data) {
      if (Meta.data.lastRunSummary) sources.push('last');
      if (Meta.data.bestRunSummary) sources.push('best');
    }
    return sources;
  }

  _stepPauseMapCardSource() {
    const sources = this._getAvailablePauseMapCardSources();
    const cur = sources.indexOf(this.mapCardSource);
    const nextIdx = cur === -1 ? 0 : (cur + 1) % sources.length;
    this.mapCardSource = sources[nextIdx];
    this._cardActionToast = '';
    this._cardActionToastUntil = 0;
    return this.mapCardSource;
  }

  _getActivePauseMapCardSnapshot() {
    const available = this._getAvailablePauseMapCardSources();
    const src = available.includes(this.mapCardSource) ? this.mapCardSource : 'live';
    if (src === 'last' && typeof Meta !== 'undefined' && Meta && Meta.data && Meta.data.lastRunSummary) {
      return Meta.data.lastRunSummary;
    }
    if (src === 'best' && typeof Meta !== 'undefined' && Meta && Meta.data && Meta.data.bestRunSummary) {
      return Meta.data.bestRunSummary;
    }
    if (
      typeof NeonSystems !== 'undefined' &&
      NeonSystems &&
      NeonSystems.RunSummary &&
      typeof NeonSystems.RunSummary.captureRunSnapshot === 'function'
    ) {
      return NeonSystems.RunSummary.captureRunSnapshot(this, typeof Meta !== 'undefined' ? Meta : null);
    }
    return null;
  }

  _copyRunSummaryShareText() {
    const snap = this._getActivePauseMapCardSnapshot();
    if (!snap || typeof NeonSystems === 'undefined' || !NeonSystems || !NeonSystems.RunSummary) return false;
    const shareText = NeonSystems.RunSummary.formatShareText(snap);
    this._lastCopiedRunSummary = shareText;
    let copied = false;
    if (typeof navigator !== 'undefined' && navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        const res = navigator.clipboard.writeText(shareText);
        if (res && typeof res.catch === 'function') res.catch(() => {});
        copied = true;
      } catch {
        copied = false;
      }
    }
    this._cardActionToast = copied ? 'SIGNAL COPIED' : 'COPY READY';
    this._cardActionToastUntil = Date.now() + 2600;
    if (typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.playSignatureDrop === 'function') {
      NeonAudio.playSignatureDrop('harmonic');
    }
    return true;
  }

  _exportRunSummaryCardPng() {
    const snap = this._getActivePauseMapCardSnapshot();
    if (!snap || typeof NeonSystems === 'undefined' || !NeonSystems || !NeonSystems.RunSummary) return null;
    const res = NeonSystems.RunSummary.renderSummaryCardPng(snap);
    this._lastExportedRunCard = res;
    if (
      res &&
      res.ok &&
      res.dataUrl &&
      typeof document !== 'undefined' &&
      document &&
      typeof document.createElement === 'function'
    ) {
      try {
        const link = document.createElement('a');
        if (link) {
          link.href = res.dataUrl;
          link.download = `neoncore-${snap.seed || 'run'}.png`;
          if (document.body && typeof document.body.appendChild === 'function' && typeof document.body.removeChild === 'function') {
            document.body.appendChild(link);
            if (typeof link.click === 'function') link.click();
            document.body.removeChild(link);
          } else if (typeof link.click === 'function') {
            link.click();
          }
        }
        this._cardActionToast = 'PNG EXPORTED';
      } catch {
        this._cardActionToast = 'CARD READY';
      }
    } else {
      this._cardActionToast = (res && res.ok) ? 'CARD READY' : 'CODE READY';
    }
    this._cardActionToastUntil = Date.now() + 2600;
    if (typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.playSignatureDrop === 'function') {
      NeonAudio.playSignatureDrop('harmonic');
    }
    return res;
  }

  _queueAchievementSignal(def) {
    if (!def || !def.id) return false;
    let catLabel = String(def.category || 'FEAT').toUpperCase();
    if (typeof NeonSystems !== 'undefined' && NeonSystems && Array.isArray(NeonSystems.ACHIEVEMENT_CATEGORIES)) {
      const catDef = NeonSystems.ACHIEVEMENT_CATEGORIES.find(c => c && c.id === def.category);
      if (catDef && catDef.label) catLabel = catDef.label;
    }
    const rewardPrefix = (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.formatAchievementReward === 'function')
      ? NeonSystems.formatAchievementReward(def.reward)
      : '';
    const payload = {
      id: `feat_${def.id}`,
      kind: 'achievement',
      speaker: 'FEAT UNLOCKED',
      channelTag: `[${catLabel}]`,
      color: def.color || '#ffd700',
      title: def.title,
      text: rewardPrefix ? `${rewardPrefix} — ${def.hint}` : def.hint,
      modeScope: this.isDescentMode ? 'descent' : 'overworld',
      timer: 4.8,
      maxTimer: 4.8
    };
    if (!Array.isArray(this._transmissionQueue)) this._transmissionQueue = [];
    if (
      (this.activeTransmission && this.activeTransmission.id === payload.id) ||
      this._transmissionQueue.some(q => q && q.id === payload.id)
    ) {
      return false;
    }
    const preludeBlocks = Boolean(this.bossPrelude && !this.isDescentMode);
    if (!this.activeTransmission && !preludeBlocks) {
      this.activeTransmission = payload;
    } else {
      this._transmissionQueue.push(payload);
    }
    if (typeof NeonAudio !== 'undefined' && typeof NeonAudio.playSignatureDrop === 'function') {
      NeonAudio.playSignatureDrop('harmonic');
    }
    return true;
  }

  _getActiveKeystoneIds(activeStats = null) {
    const stats = activeStats || (this.statManager ? this.statManager.getCurrentStats() : null);
    const perksList = (this.statManager && Array.isArray(this.statManager.perks)) ? this.statManager.perks : [];
    const fx = (stats && stats.specialEffects) ? stats.specialEffects : {};
    const activeKeystoneIds = [];
    if (fx.glassCannon || perksList.some(p => p && p.id === 'glass_cannon')) activeKeystoneIds.push('glass_cannon');
    if (fx.ancestralBond || perksList.some(p => p && p.id === 'ancestral_bond')) activeKeystoneIds.push('ancestral_bond');
    if (fx.avatarOfFire || perksList.some(p => p && p.id === 'avatar_of_fire')) activeKeystoneIds.push('avatar_of_fire');
    if (fx.chaosInoculation || perksList.some(p => p && p.id === 'chaos_inoculation')) activeKeystoneIds.push('chaos_inoculation');
    if (fx.crimsonDance || perksList.some(p => p && p.id === 'crimson_dance')) activeKeystoneIds.push('crimson_dance');
    return activeKeystoneIds;
  }

  /** Opportunistically pushes a reactive Signal Echo onto the idle ticker without displacing Lore/Feats. */
  queueSignalEcho(trigger, extraCtx = {}) {
    if (
      !trigger ||
      typeof NeonSystems === 'undefined' || !NeonSystems ||
      !NeonSystems.SignalEchoes || typeof NeonSystems.SignalEchoes.selectReactiveEcho !== 'function'
    ) {
      return false;
    }
    if (this.bossPrelude && !this.isDescentMode) return false;
    if (this.activeTransmission) return false;
    if (Array.isArray(this._transmissionQueue) && this._transmissionQueue.length > 0) return false;
    if (trigger !== 'sanctum_entity' && (this._echoCooldown || 0) > 0) return false;

    const extra = (extraCtx && typeof extraCtx === 'object') ? extraCtx : {};
    const activeStats = extra.stats || (this.statManager ? this.statManager.getCurrentStats() : null);
    const activeKeystoneIds = Array.isArray(extra.activeKeystoneIds)
      ? extra.activeKeystoneIds
      : this._getActiveKeystoneIds(activeStats);
    const hasHarmonicSequence = extra.hasHarmonicSequence !== undefined
      ? Boolean(extra.hasHarmonicSequence)
      : Boolean(activeStats && Array.isArray(activeStats.harmonicSequences) && activeStats.harmonicSequences.length > 0);
    const metaData = (typeof Meta !== 'undefined' && Meta && Meta.data) ? Meta.data : null;
    const hasNemesis = extra.hasNemesis !== undefined ? Boolean(extra.hasNemesis) : Boolean(metaData && metaData.nemesis);
    const extractionStreak = Math.max(0, Math.floor(Number(extra.streak ?? extra.extractionStreak ?? (metaData && metaData.extractionStreak)) || 0));
    const runCount = Math.max(0, Math.floor(Number(extra.runCount ?? (metaData && metaData.runCount)) || 0));
    const phaseCfg = (typeof this.getActivePhaseConfig === 'function') ? this.getActivePhaseConfig() : null;
    const phase = Math.max(1, Math.floor(Number(extra.phase ?? (phaseCfg && phaseCfg.phase) ?? (metaData && metaData.selectedPhase)) || 1));
    const depth = Math.max(1, Math.floor(Number(extra.depth ?? extra.descentDepth ?? this.descentDepth) || 1));
    const expectedScope = this.isDescentMode ? 'descent' : 'overworld';

    if (!(this._spokenEchoIds instanceof Set)) this._spokenEchoIds = new Set();

    const echo = NeonSystems.SignalEchoes.selectReactiveEcho(trigger, {
      ...extra,
      mode: expectedScope,
      modeScope: expectedScope,
      activeKeystoneIds,
      hasHarmonicSequence,
      hasNemesis,
      streak: extractionStreak,
      extractionStreak,
      runCount,
      phase,
      depth,
      descentDepth: depth,
      seenIds: this._spokenEchoIds,
      lastId: this._lastEchoId
    });

    if (!echo || echo.modeScope !== expectedScope) return false;

    this._spokenEchoIds.add(echo.id);
    this._lastEchoId = echo.id;
    this._echoCooldown = 8.0;
    this.activeTransmission = {
      id: echo.id,
      kind: 'echo',
      speaker: echo.speaker,
      channelTag: echo.channelTag,
      color: echo.color,
      title: echo.title,
      text: echo.text,
      modeScope: echo.modeScope,
      timer: 4.2,
      maxTimer: 4.2
    };
    return true;
  }

  _evaluateRunAchievements(extraCtx = {}) {
    if (
      typeof Meta === 'undefined' || !Meta ||
      typeof NeonSystems === 'undefined' || !NeonSystems ||
      typeof NeonSystems.evaluateAchievements !== 'function'
    ) {
      return [];
    }
    if (
      (this.runTime || 0) <= 0 &&
      (this.enemiesKilled || 0) <= 0 &&
      !extraCtx.bossDefeated &&
      !extraCtx.extracted &&
      !extraCtx.safeExtracted &&
      !extraCtx.forceEvent
    ) {
      return [];
    }

    const activeStats = extraCtx.stats || (this.statManager ? this.statManager.getCurrentStats() : null);
    const activeKeystoneIds = this._getActiveKeystoneIds(activeStats);

    const hasHarmonicSequence = Boolean(activeStats && Array.isArray(activeStats.harmonicSequences) && activeStats.harmonicSequences.length > 0);
    const hasFractureKey = Boolean(this.activeFractureKeyId || (typeof this.getActiveFractureKeyDef === 'function' && this.getActiveFractureKeyDef()));

    const res = NeonSystems.evaluateAchievements(Meta, {
      mode: this.isDescentMode ? 'descent' : 'overworld',
      isDailyRun: Boolean(this.isDailyRun),
      runTime: this.runTime || 0,
      enemiesKilled: this.enemiesKilled || 0,
      killStreak: this.killStreak || 0,
      bestKillStreak: this.bestKillStreak || 0,
      descentDepth: this.descentDepth || 1,
      runWandererMet: Boolean(this._runWandererMet),
      runMythicVault: Boolean(this._runMythicVault),
      runNemesisOrCourier: Boolean(this._runNemesisOrCourier),
      activeKeystoneIds,
      hasHarmonicSequence,
      hasFractureKey,
      ...extraCtx
    });

    const newlyUnlocked = (res && Array.isArray(res.newlyUnlocked)) ? res.newlyUnlocked : [];
    for (let i = 0; i < newlyUnlocked.length; i++) {
      this._queueAchievementSignal(newlyUnlocked[i]);
    }
    return newlyUnlocked;
  }

  teleportPlayerTo(tx, ty, label = 'WARP COMPLETE', color = '#00ffff') {
    if (!this.player) return;
    this.player._inwardGateCrossing = false;
    this.player._prevCenterDist = this.world ? Math.hypot(tx - this.world.center, ty - this.world.center) : 0;
    this.player.x = tx;
    this.player.y = ty;
    if (this.camera) {
      this.camera.x = tx;
      this.camera.y = ty;
    }
    for (const t of this.turrets) {
      t.x = tx;
      t.y = ty;
    }
    this.phasingTimer = Math.max(this.phasingTimer || 0, 2.5);
    this.warpArrivalCooldown = 3.5;
    this._lastSectorCutAt = this.runTime || 0;
    const pulseColor = color || '#00ffff';
    this._pushShockwave({
      x: tx,
      y: ty,
      r: 18,
      maxR: 155,
      color: pulseColor,
      life: 0.42,
      maxLife: 0.42
    }, true);
    this._pushShockwave({
      x: tx,
      y: ty,
      r: 10,
      maxR: 250,
      color: '#ffffff',
      life: 0.58,
      maxLife: 0.58
    }, true);
    this.warpArrivalPulse = {
      x: tx,
      y: ty,
      color: pulseColor,
      timer: 0.95,
      maxTimer: 0.95,
      isThreat: false
    };
    this.triggerSignalCut('warp', pulseColor, 0.34, label || 'WARP COMPLETE');
    this.triggerShake(5, 0.25);
    if (typeof NeonAudio !== 'undefined') NeonAudio.playRelicOrShrine();
    if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
      this.floatingTexts.push(new FloatingText(tx, ty - 40, label, color, 1.2, 2.5));
    }
  }

  triggerCubeAmbush(count = 20, radius = 470) {
    if (!this.player || this.enemies.length >= 175) return 0;
    const n = Math.max(8, Math.min(count, 180 - this.enemies.length));
    const phaseCfg = this.getActivePhaseConfig();
    const { sec, hpScaling, dmgMult, speedScaling } = this._getZoneScaling(this.player.x, this.player.y, Math.max(1, this.player.level || 1));
    const cubeTypes = (sec && sec.enemies && sec.enemies.length > 0)
      ? [...sec.enemies, 'sentinel', 'shieldbearer', 'rogue']
      : ['sentinel', 'shieldbearer', 'grunt', 'rogue'];
    let spawned = 0;
    const baseRot = (this.rng ? this.rng() : Math.random()) * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const ang = baseRot + (Math.PI * 2 * i) / n;
      let ex = this.player.x + Math.cos(ang) * radius;
      let ey = this.player.y + Math.sin(ang) * radius;
      if (this.isDescentMode) {
        const ab = this.getActiveArenaBounds();
        ex = Math.max(ab.minX + 80, Math.min(ab.maxX - 80, ex));
        ey = Math.max(ab.minY + 80, Math.min(ab.maxY - 80, ey));
        if (this.world && this.world.findClearPoint) {
          const pt = this.world.findClearPoint(ex, ey, 56);
          ex = pt.x;
          ey = pt.y;
        }
      } else if (this.world && this.world.size) {
        ex = Math.max(120, Math.min(this.world.size - 120, ex));
        ey = Math.max(120, Math.min(this.world.size - 120, ey));
        if (Math.hypot(ex - this.world.center, ey - this.world.center) < (this.world.sanctumRadius || 1300) + 120) {
          continue;
        }
      }
      const cType = cubeTypes[i % cubeTypes.length];
      const isLeader = i === 0 || (n >= 16 && i === Math.floor(n / 2));
      const en = new Enemy(ex, ey, hpScaling * 0.96, speedScaling * 1.12, false, isLeader, cType);
      en.damage *= dmgMult;
      if (sec && sec.id && sec.id !== 'void') en.biomeElement = sec.id;
      this.applyPhaseAndModifiersToEnemy(en, isLeader ? Math.max(1, phaseCfg.eliteMods || 0) : 0);
      this.applyPackPaceVariance(en);
      if (sec && sec.id && sec.id !== 'void' && typeof en.applyBiomeInfusion === 'function' && phaseCfg.phase >= 2 && i % 4 === 0) {
        en.applyBiomeInfusion(sec.id);
      }
      en.aggroed = true;
      en.aggroAlertTimer = 2.0;
      this.enemies.push(en);
      spawned++;
    }
    if (spawned > 0) {
      this.swarmMode = 'REGROUP';
      this.swarmPattern = Math.random() < 0.5 ? 1 : 7;
      this.swarmTimer = 2.8;
      this.patternTime = 0;
      this.swarmCooldown = 14.0;
      this.ambushActiveTimer = 7.0;
      this._campAmbushCooldown = Math.max(this._campAmbushCooldown || 0, 45.0);
      if (this.shockwaves) {
        this._pushShockwave({ x: this.player.x, y: this.player.y, r: 24, maxR: radius, color: '#ff00ff', life: 0.65, maxLife: 0.65 }, true);
      }
      this.setBanner('AMBUSH // ENCIRCLEMENT', `${spawned} HOSTILES CONVERGING — KEEP MOVING!`, '#ff00ff', 4.0, 3, true);
      this.triggerShake(7, 0.30);
      if (typeof NeonAudio !== 'undefined' && typeof NeonAudio.playSwarmFormation === 'function') {
        NeonAudio.playSwarmFormation();
      }
    }
    return spawned;
  }

  resetLoiterState(graceSec = 14.0) {
    if (this.player) {
      this._loiterAnchorX = this.player.x;
      this._loiterAnchorY = this.player.y;
    }
    this._loiterTime = 0;
    this.ambushWarningActive = false;
    this._campAmbushCooldown = Math.max(this._campAmbushCooldown || 0, graceSec || 0);
  }

  getTargetCameraZoom(stats) {
    const lvl = this.player ? Math.max(1, this.player.level || 1) : 1;
    const lvlNorm = Math.min(1, Math.max(0, (lvl - 1) / 28));
    const projCount = (stats && Number.isFinite(stats.projectileCount)) ? stats.projectileCount : 1;
    const spd = (stats && Number.isFinite(stats.speed)) ? stats.speed : 200;
    const perkCount = (this.statManager && Array.isArray(this.statManager.perks)) ? this.statManager.perks.length : 0;
    const projFactor = Math.max(0, projCount - 1) * 0.14;
    const speedFactor = Math.max(0, spd - 210) / 420;
    const perkFactor = Math.min(0.45, perkCount * 0.03);
    const sectorFactor = this.isDescentMode
      ? Math.min(0.35, Math.max(0, (this.descentDepth || 1) - 1) * 0.04)
      : Math.min(0.35, Math.max(0, this.currentSectorRing || 0) * 0.09);
    const powerNorm = Math.min(1, projFactor + speedFactor + perkFactor + sectorFactor);
    const t = Math.max(0, Math.min(1, lvlNorm * 0.55 + powerNorm * 0.45));
    const eased = Math.max(0, Math.min(1, t * (1.25 - 0.25 * t)));
    return Math.max(0.70, Math.min(1.0, 1.0 - eased * 0.30));
  }

  _findSafePortalSpot(anchorX, anchorY, preferredAngle = 0, extraAvoid = []) {
    const worldMax = this.world && this.world.size ? this.world.size - 260 : 95740;
    const clampCoord = (v) => Math.max(260, Math.min(worldMax, v));
    const obstacles = [];
    if (this.world) {
      const lists = [
        this.world.monoliths,
        this.world.outpostBeacons,
        this.world.deepBeacons,
        this.world.shrines,
        this.world.perkVaults,
        this.world.rescueChambers,
        this.world.volatilePacts,
        this.world.extractorRigs,
        this.world.strongholds,
        this.world.slotForges,
        this.world.mythicVaults,
        this.world.crystalGeodes,
        this.world.abyssalAnomalies
      ];
      for (let li = 0; li < lists.length; li++) {
        const arr = lists[li];
        if (!Array.isArray(arr)) continue;
        for (let i = 0; i < arr.length; i++) {
          const obj = arr[i];
          if (obj && Number.isFinite(obj.x) && Number.isFinite(obj.y)) {
            obstacles.push(obj);
          }
        }
      }
    }
    const existingPortals = [];
    if (Array.isArray(this.returnPortals)) {
      for (let i = 0; i < this.returnPortals.length; i++) {
        const p = this.returnPortals[i];
        if (p && !p.consumed) existingPortals.push(p);
      }
    }
    if (this.world && Array.isArray(this.world.rimPortals)) {
      for (let i = 0; i < this.world.rimPortals.length; i++) {
        const p = this.world.rimPortals[i];
        if (p && !p.consumed) existingPortals.push(p);
      }
    }

    const rings = [205, 270, 340, 420, 510, 610];
    const angleOffsets = [0, 0.35, -0.35, 0.72, -0.72, 1.15, -1.15, 1.6, -1.6, 2.15, -2.15, Math.PI];
    const passes = [
      { poiClear: 220, portalClear: 280, wallClear: 96 },
      { poiClear: 155, portalClear: 220, wallClear: 55 }
    ];
    const center = this.world ? this.world.center : 48000;
    const minSanctumR = ((this.world && this.world.sanctumRadius) || 1300) + 180;

    for (let pi = 0; pi < passes.length; pi++) {
      const rule = passes[pi];
      for (let ri = 0; ri < rings.length; ri++) {
        const dist = rings[ri];
        for (let ai = 0; ai < angleOffsets.length; ai++) {
          const ang = preferredAngle + angleOffsets[ai];
          const cx = anchorX + Math.cos(ang) * dist;
          const cy = anchorY + Math.sin(ang) * dist;
          if (cx < 260 || cx > worldMax || cy < 260 || cy > worldMax) continue;
          if (this.world && Math.hypot(cx - center, cy - center) <= minSanctumR) continue;
          if (this.world && typeof this.world.isPointClear === 'function' && !this.world.isPointClear(cx, cy, rule.wallClear)) continue;

          let blocked = false;
          for (let oi = 0; oi < obstacles.length; oi++) {
            if (Math.hypot(cx - obstacles[oi].x, cy - obstacles[oi].y) < rule.poiClear) {
              blocked = true;
              break;
            }
          }
          if (blocked) continue;

          for (let qi = 0; qi < existingPortals.length; qi++) {
            if (Math.hypot(cx - existingPortals[qi].x, cy - existingPortals[qi].y) < rule.portalClear) {
              blocked = true;
              break;
            }
          }
          if (blocked) continue;

          if (Array.isArray(extraAvoid)) {
            for (let ei = 0; ei < extraAvoid.length; ei++) {
              const ex = extraAvoid[ei];
              if (ex && Math.hypot(cx - ex.x, cy - ex.y) < (ex.minDist || 160)) {
                blocked = true;
                break;
              }
            }
          }
          if (!blocked) {
            return { x: cx, y: cy };
          }
        }
      }
    }

    return {
      x: clampCoord(anchorX + Math.cos(preferredAngle) * 210),
      y: clampCoord(anchorY + Math.sin(preferredAngle) * 210)
    };
  }

  spawnReturnPortal(x, y, label = 'CITADEL RETURN PORTAL', color = '#00ffff', accent = null, opts = null) {
    if (!this.returnPortals) this.returnPortals = [];
    const worldMax = this.world && this.world.size ? this.world.size - 160 : 95840;
    const px = Math.max(160, Math.min(worldMax, x));
    const py = Math.max(160, Math.min(worldMax, y));
    this.returnPortals.push({
      id: `${(opts && opts.portalKind === 'overdrive') ? 'od_portal' : 'ret_portal'}_${Date.now()}_${this.returnPortals.length}`,
      name: label,
      portalKind: (opts && opts.portalKind) || 'return',
      targetElement: (opts && opts.targetElement) || null,
      color,
      accent: accent || color,
      x: px,
      y: py,
      radius: 82,
      progress: 0,
      holdRequired: (opts && opts.holdRequired) || 1.5,
      spawnGrace: (opts && Number.isFinite(opts.spawnGrace)) ? opts.spawnGrace : 0,
      _isFocused: false
    });
    if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
      const floatMsg = (opts && opts.portalKind === 'overdrive') ? 'OVERDRIVE PORTAL OPENED!' : 'RETURN PORTAL OPENED!';
      this.floatingTexts.push(new FloatingText(px, py - 46, floatMsg, color, 1.2, 2.2));
    }
  }

  spawnOverdrivePortal(x, y, nextSec, opts = null) {
    if (!nextSec) return null;
    this.spawnReturnPortal(
      x,
      y,
      `OVERDRIVE → ${nextSec.name}`,
      '#ff44ff',
      nextSec.color || '#ffd700',
      {
        portalKind: 'overdrive',
        targetElement: nextSec.id,
        holdRequired: (opts && opts.holdRequired) || 1.5,
        spawnGrace: (opts && Number.isFinite(opts.spawnGrace)) ? opts.spawnGrace : 0
      }
    );
    return this.returnPortals[this.returnPortals.length - 1];
  }

  _isEchoPadUnlocked(pad) {
    if (!pad) return false;
    if (pad.kind === 'outpost') {
      const metaDisc = typeof Meta !== 'undefined' && Meta.data && Array.isArray(Meta.data.discoveredSectors) && Meta.data.discoveredSectors.includes(`outpost_${pad.element}`);
      const beaconActive = Boolean(this.world && this.world.outpostBeacons && this.world.outpostBeacons.some(ob => ob.element === pad.element && ob.activatedThisRun));
      const conquered = typeof Meta !== 'undefined' && Meta.isSectorConquered && Meta.isSectorConquered(pad.element);
      return Boolean(metaDisc || beaconActive || conquered);
    }
    if (pad.kind === 'deep') {
      return Boolean(typeof Meta !== 'undefined' && Meta.isDeepBeaconUnlocked && Meta.isDeepBeaconUnlocked(pad.element));
    }
    return Boolean(typeof Meta !== 'undefined' && Meta.isSectorConquered && Meta.isSectorConquered(pad.element));
  }

  getActivePhaseConfig() {
    const phase = (typeof Meta !== 'undefined' && Meta.data && Meta.data.selectedPhase) ? Meta.data.selectedPhase : 1;
    const sing = (typeof Meta !== 'undefined' && Meta.data && Meta.data.singularityLevel) ? Meta.data.singularityLevel : 1;
    if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.getPhaseConfig === 'function') {
      return NeonSystems.getPhaseConfig(phase, sing);
    }
    return { phase: 1, singularityLevel: 1, name: 'Phase I: Harmonic', hpMult: 1.0, dmgMult: 1.0, attenuationPenalty: 0, rewardMult: 1.0, eliteMods: 0 };
  }

  getActiveFractureKeyDef() {
    if (typeof NeonSystems === 'undefined' || !NeonSystems || !NeonSystems.FRACTURE_KEY_DEFS) return null;
    const keyId = this.activeFractureKeyId || (typeof Meta !== 'undefined' && Meta.data ? Meta.data.activeFractureKey : '');
    return (keyId && NeonSystems.FRACTURE_KEY_DEFS[keyId]) ? NeonSystems.FRACTURE_KEY_DEFS[keyId] : null;
  }

  applyPhaseAndModifiersToEnemy(en, forceModCount = null) {
    if (!en) return en;
    const phaseCfg = this.getActivePhaseConfig();
    if (phaseCfg.hpMult && phaseCfg.hpMult !== 1) {
      en.maxHp *= phaseCfg.hpMult;
      en.hp = en.maxHp;
    }
    if (phaseCfg.dmgMult && phaseCfg.dmgMult !== 1) {
      en.damage *= phaseCfg.dmgMult;
    }
    if (en.isElite && typeof en.applyEliteModifiers === 'function') {
      const modCount = forceModCount != null ? forceModCount : (phaseCfg.eliteMods || 0);
      if (modCount > 0 && typeof NeonSystems !== 'undefined' && NeonSystems && NeonSystems.ELITE_MODIFIER_DEFS) {
        const keys = Object.keys(NeonSystems.ELITE_MODIFIER_DEFS);
        for (let i = keys.length - 1; i > 0; i--) {
          const j = Math.floor(this.rng() * (i + 1));
          const tmp = keys[i];
          keys[i] = keys[j];
          keys[j] = tmp;
        }
        en.applyEliteModifiers(keys.slice(0, Math.min(modCount, keys.length)));
      }
    }
    return en;
  }

  _pushShockwave(spec, priority = false) {
    if (!this.shockwaves || !spec) return false;
    if (this.shockwaves.length >= 14) {
      if (!priority) return false;
      this.shockwaves.shift();
    }
    this.shockwaves.push(spec);
    return true;
  }

  _emitCounterplayShockwave(boss, maxR = 155, life = 0.36) {
    if (!boss) return false;
    return this._pushShockwave({
      x: boss.x,
      y: boss.y,
      r: Math.max(14, boss.radius || 24),
      maxR,
      color: '#00ffaa',
      life,
      maxLife: life
    }, true);
  }

  triggerShake(intensity = 5, duration = 0.2) {
    if (!this.camera) return;
    if ((this.camera.shakeTimer || 0) > 0) {
      this.camera.shakeIntensity = Math.max(this.camera.shakeIntensity || 0, intensity);
    } else {
      this.camera.shakeIntensity = intensity;
    }
    this.camera.shakeTimer = Math.max(this.camera.shakeTimer || 0, duration);
  }

  activateDailyRift() {
    const seed = (typeof Meta !== 'undefined' && Meta.getTodaySeedKey) ? Meta.getTodaySeedKey() : '20261122';
    this.isDailyRun = true;
    this.dailySeed = seed;
    this.runSeed = String(seed);
    this._rngFn = createSeededRng(seed);
    if (this.world) {
      if (this.world.dailyPad) this.world.dailyPad.active = true;
      for (let i = 0; i < this.world.shrines.length; i++) {
        const s = this.world.shrines[i];
        if (!s.completed) {
          s.kind = ((i + (this.rng() < 0.5 ? 0 : 1)) % 2 === 0) ? 'convergence' : 'volatile';
          s.color = s.kind === 'convergence' ? '#00ffff' : '#ff0055';
          s.holdRequired = s.kind === 'convergence' ? 8.0 : 1.5;
        }
      }
    }
    this.player.hp = this.player.maxHp;
    this.player.energyShield = this.player.maxEnergyShield;
    this.phasingTimer = Math.max(this.phasingTimer || 0, 1.5);
    const hasDailyBonus = typeof Meta !== 'undefined' && Meta.canClaimDailyBonus && Meta.canClaimDailyBonus();
    this.setBanner(
      `DAILY RIFT #${seed}`,
      hasDailyBonus ? 'SURVIVE 60s FOR 2X MATTER BONUS' : 'SEEDED DAILY CHALLENGE ACTIVE',
      '#ffd700',
      4.0,
      2,
      false
    );
    this.triggerShake(6, 0.25);
    if (typeof NeonAudio !== 'undefined') NeonAudio.playRelicOrShrine();
  }

  updatePlayerStats() {
    const stats = this.statManager.getCurrentStats();
    
    // Keystones & HP scaling
    if (stats.specialEffects.glassCannon || stats.specialEffects.chaosInoculation) {
        this.player.maxHp = 1;
        this.player.hp = Math.min(Math.max(1, this.player.hp), 1);
    } else {
        const gainedMaxHp = Math.max(0, stats.maxHp - this.player.maxHp);
        this.player.maxHp = stats.maxHp;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + gainedMaxHp);
    }
    
    const aegis = stats.specialEffects.energyShield
      ? (30 + Math.floor(stats.maxHp * 0.25) * stats.specialEffects.energyShield.level)
      : 0;
    const newMaxShield = aegis + (stats.bonusEnergyShield || 0);
    if (newMaxShield > this.player.maxEnergyShield) {
        this.player.energyShield = Math.min(newMaxShield, this.player.energyShield + (newMaxShield - this.player.maxEnergyShield));
    }
    this.player.maxEnergyShield = newMaxShield;
    this.player.energyShield = Math.min(this.player.maxEnergyShield, this.player.energyShield);
  }

  _getSustainBasePool(stats) {
    const fx = stats && stats.specialEffects ? stats.specialEffects : null;
    if (fx && fx.chaosInoculation && !fx.glassCannon && this.player && (this.player.maxEnergyShield || 0) > 0) {
      return this.player.maxEnergyShield;
    }
    return (stats && stats.maxHp) || (this.player ? this.player.maxHp : 0) || 100;
  }

  _hasSustainHeadroom(stats) {
    if (!this.player) return false;
    const fx = stats && stats.specialEffects ? stats.specialEffects : null;
    if (fx && fx.glassCannon) return false;
    if (fx && fx.chaosInoculation) {
      return (this.player.maxEnergyShield || 0) > 0 && (this.player.energyShield || 0) < this.player.maxEnergyShield;
    }
    return (this.player.hp || 0) < (this.player.maxHp || 0);
  }

  _applySustainHeal(rawAmount, stats, opts = {}) {
    if (!this.player || !Number.isFinite(rawAmount) || rawAmount <= 0) return 0;
    const fx = stats && stats.specialEffects ? stats.specialEffects : null;
    if (fx && fx.glassCannon) return 0;

    if (fx && fx.chaosInoculation) {
      const maxShield = this.player.maxEnergyShield || 0;
      if (maxShield <= 0) return 0;
      const curShield = this.player.energyShield || 0;
      if (curShield >= maxShield) return 0;
      let heal = rawAmount * 0.60;
      if (opts && opts.useSiphonCap) {
        const inst = opts.instability || this.getVoidInstability();
        const capPerSec = Math.max(3, maxShield * 0.055 * inst.sustainMult);
        const remainingCap = Math.max(0, capPerSec - (this.siphonHealedThisSec || 0));
        if (remainingCap <= 0) return 0;
        heal = Math.min(remainingCap, heal);
      }
      const nextShield = Math.min(maxShield, curShield + heal);
      const gained = Math.max(0, nextShield - curShield);
      this.player.energyShield = nextShield;
      if (opts && opts.useSiphonCap && gained > 0) {
        this.siphonHealedThisSec = (this.siphonHealedThisSec || 0) + gained;
      }
      return gained;
    }

    const maxHp = this.player.maxHp || 0;
    const curHp = this.player.hp || 0;
    if (maxHp <= 0 || curHp >= maxHp) return 0;
    let heal = rawAmount;
    if (opts && opts.useSiphonCap) {
      const baseHull = (stats && stats.maxHp) || maxHp || 100;
      const inst = opts.instability || this.getVoidInstability();
      const capPerSec = Math.max(3, baseHull * 0.042 * inst.sustainMult);
      const remainingCap = Math.max(0, capPerSec - (this.siphonHealedThisSec || 0));
      if (remainingCap <= 0) return 0;
      heal = Math.min(remainingCap, heal);
    }
    const nextHp = Math.min(maxHp, curHp + heal);
    const gained = Math.max(0, nextHp - curHp);
    this.player.hp = nextHp;
    if (opts && opts.useSiphonCap && gained > 0) {
      this.siphonHealedThisSec = (this.siphonHealedThisSec || 0) + gained;
    }
    return gained;
  }

  _restoreEmergencySavePool(stats) {
    if (!this.player) return;
    const fx = stats && stats.specialEffects ? stats.specialEffects : null;
    const maxShield = this.player.maxEnergyShield || 0;
    if (fx && fx.chaosInoculation && !fx.glassCannon && maxShield > 0) {
      this.player.hp = 1;
      this.player.energyShield = Math.min(
        maxShield,
        Math.max(this.player.energyShield || 0, Math.max(1, Math.round(maxShield * 0.25)))
      );
      return;
    }
    this.player.hp = Math.max(1, Math.round(((stats && stats.maxHp) || this.player.maxHp || 1) * 0.25));
  }

  triggerRevive() {
    this._deathAchievementsEvaluated = false;
    this.player.hp = this.player.maxHp;
    this.player.energyShield = this.player.maxEnergyShield;
    this.postReviveTimer = 5.0;
    this.vacuumTimer = Math.max(this.vacuumTimer || 0, 2.5);
    if (this.enemies) {
      for (const e of this.enemies) {
        if (e.markedForDeletion) continue;
        const dx = e.x - this.player.x;
        const dy = e.y - this.player.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 380 && !e.isBossPylon) {
          const nx = dist > 0 ? dx / dist : 1;
          const ny = dist > 0 ? dy / dist : 0;
          const kbScale = e.isBoss ? ((e._bossDash || (e._bossLockHeading || 0) > 0) ? 0 : 0.14) : 1.0;
          e.kbX = nx * 650 * kbScale;
          e.kbY = ny * 650 * kbScale;
          if (!e.isBoss || (e._ccImmuneTimer || 0) <= 0) {
            const freezeDur = e.isBoss ? 0.55 : 2.0;
            e.status.frozen = Math.max(e.status.frozen || 0, freezeDur);
            if (e.isBoss) e._ccImmuneTimer = 3.6;
          }
        }
      }
    }
    for (let i = 0; i < 32; i++) {
      this._pushParticle(this.player.x, this.player.y, '#ffd700', false);
    }
    if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
      this.floatingTexts.push(new FloatingText(this.player.x, this.player.y - 42, 'VOID REBOOT!', '#ffd700', 1.25, 1.5));
    }
    this.triggerShake(10, 0.45);
    if (typeof NeonAudio !== 'undefined') NeonAudio.playReviveShockwave();
  }

  handleDamageTaken(amount, stats, meta = {}) {
      if (this.postReviveTimer > 0 || this.phasingTimer > 0) return; // Invincible
      
      if (stats.specialEffects.divineShield && (this.divineShieldCooldown || 0) <= 0) {
          this.divineShieldCooldown = 20.0;
          for (let i = 0; i < 20; i++) this._pushParticle(this.player.x, this.player.y, '#ffffaa', false);
          return;
      }

      if ((stats.phaseEvasion || 0) > 0 && (this.evasionCooldown || 0) <= 0 && Math.random() < stats.phaseEvasion) {
          this.evasionCooldown = 1.1;
          if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
              this.floatingTexts.push(new FloatingText(this.player.x, this.player.y - 30, 'EVADED', '#00eeff', 0.95, 0.85));
          }
          return;
      }

      const hullBefore = this.player ? (this.player.hp || 0) : 0;
      let wardOrSecondWindSaved = false;

      let mitigated = amount;
      if (meta && meta.isHazard) {
          const hazardRes = Math.min(0.85, (stats.hazardResist || 0) + (stats.signatureTraits?.hazardResist || 0));
          if (hazardRes > 0) mitigated *= (1 - hazardRes);
      }
      if ((stats.damageMitigation || 0) > 0) {
          mitigated *= (1 - Math.min(0.52, stats.damageMitigation));
      }

      const preShield = this.player.energyShield || 0;
      let dmg = mitigated;
      if (this.player.energyShield > 0) {
          if (this.player.energyShield >= dmg) {
              this.player.energyShield -= dmg;
              dmg = 0;
          } else {
              dmg -= this.player.energyShield;
              this.player.energyShield = 0;
          }
      }

      const hasHolyWard = Boolean(
          stats.signatureTraits?.holyWard ||
          (typeof Meta !== 'undefined' && Meta.data && Meta.data.equippedModules && Meta.data.equippedModules.shell && Meta.data.equippedModules.shell.signatureId === 'sig_holy_shell')
      );
      if (dmg > 0 && this.player.hp - dmg <= 0 && hasHolyWard && (this.holyWardCooldown || 0) <= 0) {
          this.holyWardCooldown = 45.0;
          this.phasingTimer = Math.max(this.phasingTimer || 0, 1.5);
          this._restoreEmergencySavePool(stats);
          dmg = 0;
          wardOrSecondWindSaved = true;
          for (let i = 0; i < 20; i++) this._pushParticle(this.player.x, this.player.y, '#ffee88', false);
          if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
              this.floatingTexts.push(new FloatingText(this.player.x, this.player.y - 36, 'BASTION WARD!', '#ffee88', 1.25, 1.5));
          }
      } else if (dmg > 0 && this.player.hp - dmg <= 0 && stats.attributeMilestones && stats.attributeMilestones.sv50 && !this.secondWindUsed) {
          this.secondWindUsed = true;
          this.phasingTimer = Math.max(this.phasingTimer || 0, 1.5);
          this._restoreEmergencySavePool(stats);
          dmg = 0;
          wardOrSecondWindSaved = true;
          this.triggerLocalKineticPulse(this.player.x, this.player.y, 180, (stats.damage || 10) * 1.4, '#44ffaa', stats);
          for (let i = 0; i < 20; i++) this._pushParticle(this.player.x, this.player.y, '#44ffaa', false);
          if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
              this.floatingTexts.push(new FloatingText(this.player.x, this.player.y - 36, 'SECOND WIND!', '#44ffaa', 1.25, 1.5));
          }
      }
      
      const shieldBroken = preShield > 0 && (this.player.energyShield || 0) <= 0;
      if (shieldBroken || dmg > 0) {
          if (shieldBroken && typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.playPlayerShieldBreak === 'function') {
              NeonAudio.playPlayerShieldBreak();
          }
          this._damageFlashTimer = 0.22;
          this._damageFlashColor = shieldBroken ? '#00eeff' : '#ff2244';
          const src = (meta && meta.sourceEnemy)
              ? meta.sourceEnemy
              : ((meta && Number.isFinite(meta.sourceX) && Number.isFinite(meta.sourceY)) ? { x: meta.sourceX, y: meta.sourceY } : null);
          if (src && this.player && Number.isFinite(src.x) && Number.isFinite(src.y)) {
              const sdx = src.x - this.player.x;
              const sdy = src.y - this.player.y;
              this._damageSourceAngle = (Math.abs(sdx) > 0.01 || Math.abs(sdy) > 0.01) ? Math.atan2(sdy, sdx) : null;
          } else {
              this._damageSourceAngle = null;
          }
      }

      this.player.hp -= dmg; this.recentDamageTaken = (this.recentDamageTaken || 0) + dmg;
      if (this._bossFightActive && (hullBefore > this.player.hp || dmg > 0 || wardOrSecondWindSaved)) {
          this._bossFightHullDamaged = true;
      }
      if (dmg > 0) {
          if (meta && meta.sourceEnemy) {
              const se = meta.sourceEnemy;
              const seSec = this.world ? this.world.getSectorAt(se.x || this.player.x, se.y || this.player.y) : null;
              this.lastDamageSource = {
                  type: se.type || 'brute',
                  isElite: Boolean(se.isElite),
                  isBoss: Boolean(se.isBoss),
                  color: se.baseColor || se.color || (seSec ? seSec.color : '#ff3366'),
                  sectorId: seSec ? seSec.id : (this.currentSectorId || 'void'),
                  zoneLevel: seSec ? (seSec.zoneLevel || 1) : 1
              };
          }
          if (dmg >= 4 && (this.killStreak || 0) > 0) {
              this.killStreak = Math.max(0, Math.floor(this.killStreak * 0.5));
          }
          if (typeof NeonAudio !== 'undefined') NeonAudio.playDamage();
          this.triggerShake(4, 0.14);
          if (stats.attributeMilestones && stats.attributeMilestones.kc30) {
              this.evasiveBurstTimer = Math.max(this.evasiveBurstTimer || 0, 1.8);
          }
          if (meta && meta.sourceEnemy && meta.sourceEnemy.eliteModifiers && meta.sourceEnemy.eliteModifiers.includes('siphon_field')) {
              meta.sourceEnemy.hp = Math.min(meta.sourceEnemy.maxHp, meta.sourceEnemy.hp + Math.max(1, dmg * 0.45));
          }
          if (this.activeVolatilePact && !this.activeVolatilePact.failed) {
              this.activeVolatilePact.failed = true;
              this.activeVolatilePact = null;
              if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
                  this.floatingTexts.push(new FloatingText(this.player.x, this.player.y - 44, 'PACT BROKEN!', '#ff3366', 1.2, 1.4));
              }
          }
      }
      const baseShieldDelay = (stats.specialEffects && stats.specialEffects.chaosInoculation) ? 3.4 : 5.4;
      const instabilityShieldDelay = this.runTime > 480 ? Math.min(2.0, (this.runTime - 480) / 300) : 0;
      this.player.shieldRechargeTimer = baseShieldDelay + instabilityShieldDelay;

      // Thorns
      if (stats.specialEffects.thorns && dmg > 0) {
          // Dealt automatically on collision
      }

      // Phasing
      if (stats.specialEffects.phasing && (this.phasingCooldown || 0) <= 0) {
          this.phasingTimer = Math.max(this.phasingTimer || 0, 1.1);
          this.phasingCooldown = 7.0;
      }
      
      // Cast on Damage Taken
      if (stats.specialEffects.castOnDamageTaken && (this.codtCooldown || 0) <= 0) {
          this.codtCooldown = 2.0;
          this.firePoisonNova(stats, 1);
      }
      
      if (stats.specialEffects.frostNova && (this.frostNovaCooldown || 0) <= 0) {
          this.frostNovaCooldown = 2.0;
          this.fireFrostNova(stats);
      }
      
      if (stats.specialEffects.bloodNova && (this.bloodNovaCooldown || 0) <= 0) {
          this.bloodNovaCooldown = 3.0;
          this.fireBloodNova(stats);
      }
  }

  getElemDamageMult(stats, el) {
      if (!stats || !stats.elemBonuses || !el) return 1.0;
      const alias = el === 'ice' ? 'frost' : el === 'lightning' ? 'storm' : el === 'poison' ? 'toxin' : el;
      return 1.0 + Math.max(0, Number(stats.elemBonuses[alias]) || 0);
  }

  getPulseRadiusMult(stats) {
      return (stats && stats.attributeMilestones && stats.attributeMilestones.dp30) ? 1.25 : 1.0;
  }

  _resolveProcElement(stats, baseEl = 'none') {
      if (stats && stats.specialEffects && stats.specialEffects.avatarOfFire) return 'fire';
      return baseEl;
  }

  _triggerThermalFlare(e, stats, wasBurning, dmgOpts = null) {
      if (!e || e.markedForDeletion || e.hp <= 0) return false;
      if (!stats?.specialEffects?.avatarOfFire || !wasBurning) return false;
      const now = this.runTime || 0;
      if ((now - (e._lastThermalFlareAt ?? -10)) < 0.9) return false;
      e._lastThermalFlareAt = now;
      const flareDmg = stats.damage * 0.45 * (stats.burnDamageMult || 1.0) * this.getElemDamageMult(stats, 'fire');
      e.takeDamage(flareDmg, dmgOpts);
      if (this.particles && typeof Particle !== 'undefined') {
          for (let i = 0; i < 4; i++) this._pushParticle(e.x, e.y, '#ff5522', false);
      }
      if (typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.playHitFeedback === 'function') {
          NeonAudio.playHitFeedback('shatter');
      }
      return true;
  }

  _getBroadphase() {
      if (!this._broadphase && typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.createCombatBroadphase === 'function') {
          this._broadphase = NeonSystems.createCombatBroadphase();
      }
      if (!this._broadphase) return null;
      const len = this.enemies ? this.enemies.length : 0;
      if (!this._inUpdateLoop || this._broadphase.sourceRef !== this.enemies || this._broadphase.sourceLen !== len) {
          this._broadphase.rebuild(this.enemies);
      }
      return this._broadphase;
  }

  getParticleBudget() {
      const b = this._signalTelemetry ? this._signalTelemetry.getParticleBudget() : 250;
      return Math.min(250, Math.max(60, b || 250));
  }

  _pushParticle(x, y, color, priority = false, opts = null) {
      if (!this.particles || typeof Particle === 'undefined') return null;
      const cap = priority ? 250 : this.getParticleBudget();
      if (this.particles.length >= cap) return null;
      const pt = new Particle(x, y, color, opts);
      this.particles.push(pt);
      return pt;
  }

  tryAutoEquipModule(mod) {
      if (!mod || !mod.uid || typeof Meta === 'undefined' || !Meta.data || !Meta.data.equippedModules) return null;
      if (typeof NeonSystems === 'undefined' || typeof NeonSystems.equipModule !== 'function') return null;
      const eq = Meta.data.equippedModules;
      const isUnlocked = (slot) => {
          if (slot === 'auxiliary' || slot === 'relic') {
              return typeof Meta.isSlotUnlocked === 'function' ? Meta.isSlotUnlocked(slot) : Boolean(Meta.data.unlockedSlots && Meta.data.unlockedSlots[slot]);
          }
          return true;
      };
      let targetSlot = null;
      if (mod.slot && !eq[mod.slot] && isUnlocked(mod.slot)) {
          targetSlot = mod.slot;
      } else if (mod.slot !== 'relic' && !eq.auxiliary && isUnlocked('auxiliary')) {
          targetSlot = 'auxiliary';
      }
      if (!targetSlot) return null;
      const eqRes = NeonSystems.equipModule(Meta, mod.uid, targetSlot, { inRunLevel: (this.player && this.player.level) || 1 });
      if (eqRes && eqRes.ok) {
          this.updatePlayerStats();
          return targetSlot;
      }
      if (eqRes && eqRes.reason === 'level_too_low' && typeof FloatingText !== 'undefined' && this.floatingTexts && this.player) {
          this.floatingTexts.push(new FloatingText(this.player.x, this.player.y - 38, `ARCHIVED (REQ LVL ${eqRes.reqLevel})`, '#ffd700', 1.05, 1.7));
      }
      return null;
  }

  fireBloodNova(stats) {
      const radius = 200 * this.getPulseRadiusMult(stats);
      const dmg = stats.damage * this.getElemDamageMult(stats, 'blood');
      const dmgOpts = (stats && stats.attributeMilestones && stats.attributeMilestones.dp50) ? { ignoreShieldAndResist: 0.25 } : null;
      for (let i = 0; i < 30; i++) this._pushParticle(this.player.x, this.player.y, '#ff0055', false);
      let hitCount = 0;
      const bp = this._getBroadphase();
      const list = bp
        ? bp.queryRadiusInto(this.player.x, this.player.y, radius, this._broadphaseAuraScratch, true)
        : this.enemies;
      for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (!e || e.markedForDeletion) continue;
          if (Math.hypot(this.player.x - e.x, this.player.y - e.y) < radius) {
              e.takeDamage(dmg, dmgOpts);
              hitCount++;
          }
      }
      if (hitCount > 0 && this.player.hp < this.player.maxHp) {
          const maxHp = stats.maxHp || this.player.maxHp || 100;
          const sv30Amp = (stats.attributeMilestones && stats.attributeMilestones.sv30) ? 1.30 : 1.0;
          const perHit = Math.max(1.5, maxHp * 0.009);
          const heal = Math.min(maxHp * 0.035, hitCount * perHit) * sv30Amp;
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
      }
  }

  fireFrostNova(stats) {
      const radius = 150 * this.getPulseRadiusMult(stats);
      const dmg = stats.damage * this.getElemDamageMult(stats, 'frost');
      const statusMult = (stats && stats.attributeMilestones && stats.attributeMilestones.sr15) ? 1.30 : 1.0;
      const dmgOpts = (stats && stats.attributeMilestones && stats.attributeMilestones.dp50) ? { ignoreShieldAndResist: 0.25 } : null;
      for (let i = 0; i < 30; i++) this._pushParticle(this.player.x, this.player.y, '#00ffff', false);
      const bp = this._getBroadphase();
      const list = bp
        ? bp.queryRadiusInto(this.player.x, this.player.y, radius, this._broadphaseAuraScratch, true)
        : this.enemies;
      for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (!e || e.markedForDeletion) continue;
          if (Math.hypot(this.player.x - e.x, this.player.y - e.y) < radius) {
              if (!e.isBossPylon && (!e.isBoss || (e._ccImmuneTimer || 0) <= 0)) {
                  e.status.frozen = Math.max(e.status.frozen || 0, e.isBoss ? 0.55 : (2.0 * statusMult));
                  if (e.isBoss) e._ccImmuneTimer = 3.6;
              }
              e.takeDamage(dmg, dmgOpts);
          }
      }
  }

  getActiveCombatProjectileCount() {
    let count = 0;
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (p && !p.markedForDeletion && !p.isOrbiting) count++;
    }
    return count;
  }

  triggerLocalKineticPulse(px, py, radius, dmg, color = '#00eeff', stats = null) {
    const cleanDmg = Math.max(1, dmg || 0);
    const activeStats = stats || this.currentStats;
    const effectiveRadius = (radius || 0) * this.getPulseRadiusMult(activeStats);
    const dmgOpts = (activeStats && activeStats.attributeMilestones && activeStats.attributeMilestones.dp50) ? { ignoreShieldAndResist: 0.25 } : null;
    const bp = this._getBroadphase();
    const candidates = bp
      ? bp.queryRadiusInto(px, py, effectiveRadius, this._broadphasePulseScratch, true)
      : this.enemies;
    for (let i = 0; i < candidates.length; i++) {
      const e = candidates[i];
      if (!e || e.markedForDeletion || e.hp <= 0) continue;
      if (Math.hypot(e.x - px, e.y - py) <= effectiveRadius + (e.radius || 14)) {
        e.takeDamage(cleanDmg, dmgOpts);
      }
    }
    if (this.particles) {
      for (let i = 0; i < 6; i++) {
        this._pushParticle(px, py, color, false);
      }
    }
  }

  firePoisonNova(stats, levelMult = 1, sx = null, sy = null) {
      const originX = Number.isFinite(sx) ? sx : (this.player ? this.player.x : 0);
      const originY = Number.isFinite(sy) ? sy : (this.player ? this.player.y : 0);
      const level = (stats.specialEffects.poisonNova?.level || 1) * levelMult;
      const toxMult = this.getElemDamageMult(stats, 'toxin');
      const room = Math.max(0, 24 - this.getActiveCombatProjectileCount());
      const projectileCount = Math.min(room, level >= 2 ? 8 : 6);
      if (projectileCount <= 0) {
        this.triggerLocalKineticPulse(originX, originY, 170, stats.damage * 0.9 * toxMult, '#33ff66', stats);
        return;
      }
      const bonusBounce = Math.min(2, level >= 4 ? (level - 3) : 0);

      for(let i=0; i<projectileCount; i++) {
        const angle = (Math.PI * 2 / projectileCount) * i;
        const novaEffects = {
          ...stats.specialEffects,
          applyPoison: true,
          castOnCrit: null,
          split: null,
          fork: null
        };
        const childStats = {
          ...stats,
          damage: stats.damage * 0.55 * toxMult,
          pierce: Math.min(3, stats.pierce + 1),
          bounce: Math.min(2, stats.bounce + bonusBounce),
          specialEffects: novaEffects
        };

        this.projectiles.push(new Projectile(
          originX, originY,
          Math.cos(angle) * stats.projectileSpeed, Math.sin(angle) * stats.projectileSpeed,
          childStats,
          false,
          0,
          'toxin'
        ));
      }
  }

  update(dt, inputVector) {
    if (this._signalTelemetry) {
      this._signalTelemetry.recordFrame(dt * 1000, this.enemies ? this.enemies.length : 0);
    }
    this._inUpdateLoop = true;
    try {
    if (this._broadphase) {
      this._broadphase.rebuild(this.enemies);
    }
    this.runTime += dt;
    this.shattersThisFrame = 0;
    const stats = this.statManager.getCurrentStats();

    if (this.overchargeTimer > 0) this.overchargeTimer = Math.max(0, this.overchargeTimer - dt);
    if (this.frenzyTimer > 0) this.frenzyTimer = Math.max(0, this.frenzyTimer - dt);
    if (this.killHasteTimer > 0) this.killHasteTimer = Math.max(0, this.killHasteTimer - dt);
    if (this.evasiveBurstTimer > 0) this.evasiveBurstTimer = Math.max(0, this.evasiveBurstTimer - dt);
    if (this.blackHoleCooldown > 0) this.blackHoleCooldown = Math.max(0, this.blackHoleCooldown - dt);
    if (this.playerInfusionChillTimer > 0) this.playerInfusionChillTimer = Math.max(0, this.playerInfusionChillTimer - dt);
    if (this.evasionCooldown > 0) this.evasionCooldown = Math.max(0, this.evasionCooldown - dt);
    if (this.holyWardCooldown > 0) this.holyWardCooldown = Math.max(0, this.holyWardCooldown - dt);
    if (this.phasingCooldown > 0) this.phasingCooldown = Math.max(0, this.phasingCooldown - dt);
    if (this.harmonicBlessingTimer > 0) this.harmonicBlessingTimer = Math.max(0, this.harmonicBlessingTimer - dt);
    if (this._echoCooldown > 0) this._echoCooldown = Math.max(0, this._echoCooldown - dt);
    if (this.alertFlashTimer > 0) this.alertFlashTimer = Math.max(0, this.alertFlashTimer - dt);
    if (this._critShakeCd > 0) this._critShakeCd = Math.max(0, this._critShakeCd - dt);
    if (this._killShakeCd > 0) this._killShakeCd = Math.max(0, this._killShakeCd - dt);
    if (this.player && this.player._muzzleFlashTimer > 0) {
      this.player._muzzleFlashTimer = Math.max(0, this.player._muzzleFlashTimer - dt);
    }
    if (this._damageFlashTimer > 0) {
      this._damageFlashTimer = Math.max(0, this._damageFlashTimer - dt);
      if (this._damageFlashTimer === 0) this._damageSourceAngle = null;
    }
    if (this.signalCut) {
      this.signalCut.timer = Math.max(0, (this.signalCut.timer || 0) - dt);
      if (this.signalCut.timer <= 0) {
        this.signalCut = null;
      }
    }
    if (this.warpArrivalPulse) {
      this.warpArrivalPulse.timer = Math.max(0, (this.warpArrivalPulse.timer || 0) - dt);
      if (this.warpArrivalPulse.timer <= 0) {
        this.warpArrivalPulse = null;
      }
    }
    if (this.ambushActiveTimer > 0) this.ambushActiveTimer = Math.max(0, this.ambushActiveTimer - dt);
    if (this._campAmbushCooldown > 0) this._campAmbushCooldown = Math.max(0, this._campAmbushCooldown - dt);

    // Expanding shockwaves visual update
    if (this.shockwaves && this.shockwaves.length > 0) {
      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const sw = this.shockwaves[i];
        sw.life -= dt;
        const p = 1 - Math.max(0, sw.life / Math.max(0.05, sw.maxLife || 0.5));
        sw.r = 16 + (sw.maxR || 200) * p;
        if (sw.life <= 0) this.shockwaves.splice(i, 1);
      }
    }

    // Boss Pre-Fight Dramaturgy state progression
    let bossPreludeCompletedThisTick = false;
    if (this.bossPrelude) {
      this.phasingTimer = Math.max(this.phasingTimer || 0, 0.35);
      this.bossPrelude.timer -= dt;
      if (this.bossPrelude.timer <= 0) {
        bossPreludeCompletedThisTick = true;
        this._completeBossPrelude();
      }
    } else if (this.activeBossEncounter) {
      const bRef = this.activeBossEncounter.bossRef;
      if (!bRef || bRef.markedForDeletion || bRef.hp <= 0) {
        this.activeBossEncounter = null;
        this.activeBossArena = null;
        if (this.pendingBossQueue && this.pendingBossQueue.length > 0) {
          this.queueBossEncounter(this.pendingBossQueue.shift());
        }
      }
    }
    if (this._bountyCooldown > 0) this._bountyCooldown = Math.max(0, this._bountyCooldown - dt);
    this._updateSectorBounty(dt, stats);
    this._spawnNemesisIfDue();
    this.siphonWindowTimer = (this.siphonWindowTimer || 0) + dt;
    if (this.siphonWindowTimer >= 1.0) {
      this.siphonWindowTimer = 0;
      this.siphonHealedThisSec = 0;
    }
    if (this.killStreakTimer > 0) {
      this.killStreakTimer -= dt;
      if (this.killStreakTimer <= 0) this.killStreak = 0;
    }
    if (this.warpArrivalCooldown > 0) this.warpArrivalCooldown = Math.max(0, this.warpArrivalCooldown - dt);
    if (this.sectorBanner && this.sectorBanner.timer > 0) {
      this.sectorBanner.timer = Math.max(0, this.sectorBanner.timer - dt);
    }
    const preludePausesTicker = Boolean(this.bossPrelude && !this.isDescentMode);
    if (!preludePausesTicker) {
      if (this.activeTransmission) {
        this.activeTransmission.timer = Math.max(0, (this.activeTransmission.timer || 0) - dt);
        if (this.activeTransmission.timer <= 0) {
          this.activeTransmission = null;
        }
      }
      if (!this.activeTransmission && Array.isArray(this._transmissionQueue) && this._transmissionQueue.length > 0) {
        this.activeTransmission = this._transmissionQueue.shift();
      }
    }
    if (this.isDailyRun && !this._daily60Evaluated && this.runTime >= 60) {
      this._daily60Evaluated = true;
      this._evaluateRunAchievements({ isDailyRun: true, runTime: this.runTime, forceEvent: true });
      if (typeof Meta !== 'undefined' && typeof Meta.recordRunSurvival === 'function') {
        Meta.recordRunSurvival(Math.floor(this.runTime), true);
      }
    }

    // Periodic + Anti-Loiter Ambush Director outside Void Sanctum
    if (!this.isDescentMode && !this.bossPrelude && !this.activeBossEncounter && !this.activeBossArena && this.world) {
      const distCenterAmb = Math.hypot(this.player.x - this.world.center, this.player.y - this.world.center);
      if (distCenterAmb > (this.world.sanctumRadius || 1300) + 180) {
        const cooldownFree = (this._campAmbushCooldown || 0) <= 0 && (this.ambushActiveTimer || 0) <= 0;
        if (cooldownFree) {
          this.ambushTimer = (this.ambushTimer ?? 90.0) - dt;
          if (this.ambushTimer <= 0) {
            this.ambushTimer = 95.0 + (this.rng ? this.rng() : Math.random()) * 30.0;
            this._campAmbushCooldown = 48.0;
            this._loiterTime = 0;
            this.ambushWarningActive = false;
            this.triggerCubeAmbush(16, 460);
          }
        }

        const anchorDist = Math.hypot(this.player.x - (this._loiterAnchorX || this.player.x), this.player.y - (this._loiterAnchorY || this.player.y));
        const inputMag = Math.hypot((inputVector && inputVector.x) || 0, (inputVector && inputVector.y) || 0);
        const isMovingOrCapturing = inputMag > 0.15 || anchorDist > 180 || this._holdingObjectiveThisTick;
        if (isMovingOrCapturing) {
          if (anchorDist > 180) {
            this._loiterAnchorX = this.player.x;
            this._loiterAnchorY = this.player.y;
          }
          this._loiterTime = Math.max(0, (this._loiterTime || 0) - dt * 2.5);
          if (this._loiterTime < 3.0) {
            this.ambushWarningActive = false;
          }
        } else if (cooldownFree) {
          this._loiterTime = (this._loiterTime || 0) + dt;
          if (this._loiterTime >= 6.5 && !this.ambushWarningActive) {
            this.ambushWarningActive = true;
            this.setBanner('HOSTILE LOCK // KEEP MOVING', 'LOITERING IN THE WILD DRAWS AMBUSHES', '#ffaa00', 2.8, 2, false);
          }
          if (this._loiterTime >= 9.8) {
            this._loiterAnchorX = this.player.x;
            this._loiterAnchorY = this.player.y;
            this._loiterTime = 0;
            this.ambushWarningActive = false;
            this._campAmbushCooldown = 48.0;
            this.ambushTimer = Math.max(this.ambushTimer || 0, 75.0);
            this.triggerCubeAmbush(14, 460);
          }
        }
      } else {
        this._loiterAnchorX = this.player.x;
        this._loiterAnchorY = this.player.y;
        this._loiterTime = 0;
        this.ambushWarningActive = false;
      }
    }

    // Crisp frame-rate independent movement smoothing (Cryo zone lowers traction)
    if (!this.smoothInput) this.smoothInput = { x: 0, y: 0 };
    const rawInX = (inputVector && Number.isFinite(inputVector.x)) ? inputVector.x : 0;
    const rawInY = (inputVector && Number.isFinite(inputVector.y)) ? inputVector.y : 0;
    const rawMag = Math.hypot(rawInX, rawInY);
    const turnRate = this.playerInCryo ? 5.5 : (rawMag < 0.05 ? 44.0 : 36.0);
    const lerpAlpha = 1 - Math.exp(-turnRate * dt);
    this.smoothInput.x += (rawInX - this.smoothInput.x) * lerpAlpha;
    this.smoothInput.y += (rawInY - this.smoothInput.y) * lerpAlpha;
    if (!this.playerInCryo && rawMag < 0.05 && Math.hypot(this.smoothInput.x, this.smoothInput.y) < 0.03) {
      this.smoothInput.x = 0;
      this.smoothInput.y = 0;
    }

    // Check Storm Conduit, Outer Hyper-Conduit & Crucible Slipstream Boost Strips before movement
    this.playerOnBoost = false;
    this.playerBoostMult = 1.55;
    if (this.world && this.world.boostStrips && typeof closestPointOnWallSegment === 'function') {
      const pr = this.player.radius || 15;
      for (const bs of this.world.boostStrips) {
        if (
          this.player.x + pr < bs.minX ||
          this.player.x - pr > bs.maxX ||
          this.player.y + pr < bs.minY ||
          this.player.y - pr > bs.maxY
        ) {
          continue;
        }
        const cp = closestPointOnWallSegment(this.player.x, this.player.y, bs.x1, bs.y1, bs.x2, bs.y2);
        if (Math.hypot(this.player.x - cp.x, this.player.y - cp.y) <= bs.width * 0.5 + pr) {
          this.playerOnBoost = true;
          this.playerBoostMult = Math.max(this.playerBoostMult, bs.speedMult || 1.55);
        }
      }
    }

    // Movement inside persistent VoidWorld (or Singularity Descent arena)
    this._isPlayerMoving = Math.hypot(inputVector.x || 0, inputVector.y || 0) > 0.25 || Math.hypot(this.smoothInput.x, this.smoothInput.y) > 0.25;
    if (Math.hypot(this.smoothInput.x, this.smoothInput.y) > 0.15) {
      this.player.facingAngle = Math.atan2(this.smoothInput.y, this.smoothInput.x);
    } else if (this.aimAngle !== undefined) {
      this.player.facingAngle = this.aimAngle;
    }
    const streakSpd = Math.min(0.18, (this.killStreak || 0) * 0.004);
    let speed = stats.speed
      * (1 + streakSpd)
      * (this.overchargeTimer > 0 ? 1.28 : 1.0)
      * (this.evasiveBurstTimer > 0 ? 1.30 : 1.0)
      * (this.playerInCryo ? 1.28 : 1.0)
      * (this.playerOnBoost ? (this.playerBoostMult || 1.55) : 1.0)
      * (this.harmonicBlessingTimer > 0 ? 1.20 : 1.0)
      * (this.playerInfusionChillTimer > 0 ? 0.78 : 1.0);
    const ab = this.getActiveArenaBounds();
    const boundW = ab.maxX;
    const boundH = ab.maxY;
    this.player._allowInwardGateReturn = true;
    if (this.world) {
      this.player._prevCenterDist = Math.hypot(this.player.x - this.world.center, this.player.y - this.world.center);
    }
    this.player.x += this.smoothInput.x * speed * dt;
    this.player.y += this.smoothInput.y * speed * dt;
    this.player.x = Math.max(ab.minX + this.player.radius + 10, Math.min(boundW - this.player.radius - 10, this.player.x));
    this.player.y = Math.max(ab.minY + this.player.radius + 10, Math.min(boundH - this.player.radius - 10, this.player.y));
    if (this.gateNoticeCooldown > 0) this.gateNoticeCooldown -= dt;
    if (this.world) {
      this.world.resolveCircleWalls(this.player);
      if (this.isDescentMode && this.world.clampPointToDescentOctagon) {
        const clampedP = this.world.clampPointToDescentOctagon(this.player.x, this.player.y, (this.player.radius || 15) + 14);
        this.player.x = clampedP.x;
        this.player.y = clampedP.y;
      }
      if (this.world.resolveCircleChasms) {
        this.world.resolveCircleChasms(this.player, (this.phasingTimer || 0) > 0);
      }
      if (this.world.resolveForceGates) {
        const hitGate = this.world.resolveForceGates(this.player);
        if (hitGate && this.gateNoticeCooldown <= 0) {
          this.gateNoticeCooldown = 2.5;
          if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
            this.floatingTexts.push(
              new FloatingText(this.player.x, this.player.y - 36, `SEALED: DEFEAT ${hitGate.element.toUpperCase()} BOSS`, hitGate.color, 1.15, 1.8)
            );
          }
        }
      }
    }
    if (this.activeBossArena) {
      this._resolveActiveBossArenaBoundary(this.player, false);
    }

    // Smooth camera follow + boss prelude focus pan + shake decay
    if (this.camera) {
      let targetX = this.player.x;
      let targetY = this.player.y;
      let maxPan = Infinity;
      if (this.bossPrelude && !this.isDescentMode && Number.isFinite(this.bossPrelude.x) && Number.isFinite(this.bossPrelude.y)) {
        const bp = this.bossPrelude;
        const vw = (this.canvas && this.canvas.width) || 1280;
        const vh = (this.canvas && this.canvas.height) || 720;
        maxPan = Math.min(vw * 0.24, vh * 0.22, 260);
        const prog = 1 - Math.max(0, Math.min(1, bp.timer / (bp.maxTimer || 2.6)));
        const smooth = (t) => {
          const u = Math.max(0, Math.min(1, t));
          return u * u * (3 - 2 * u);
        };
        let focusWeight = 1;
        if (prog < 0.28) {
          focusWeight = smooth(prog / 0.28);
        } else if (prog > 0.72) {
          focusWeight = 1 - smooth((prog - 0.72) / 0.28);
        }
        const dx = bp.x - this.player.x;
        const dy = bp.y - this.player.y;
        const dist = Math.hypot(dx, dy);
        const clampedScale = (dist > maxPan && dist > 0) ? (maxPan / dist) : 1;
        targetX = this.player.x + dx * clampedScale * focusWeight;
        targetY = this.player.y + dy * clampedScale * focusWeight;
      }
      const camAlpha = 1 - Math.exp(-14.5 * dt);
      this.camera.x += (targetX - this.camera.x) * camAlpha;
      this.camera.y += (targetY - this.camera.y) * camAlpha;
      if (Number.isFinite(maxPan)) {
        const camDx = this.camera.x - this.player.x;
        const camDy = this.camera.y - this.player.y;
        const camDist = Math.hypot(camDx, camDy);
        if (camDist > maxPan && camDist > 0) {
          this.camera.x = this.player.x + (camDx / camDist) * maxPan;
          this.camera.y = this.player.y + (camDy / camDist) * maxPan;
        }
      }
      if (this.camera.shakeTimer > 0) {
        this.camera.shakeTimer = Math.max(0, this.camera.shakeTimer - dt);
        if (this.camera.shakeTimer === 0) {
          this.camera.shakeIntensity = 0;
        }
      }
      const targetZoom = this.getTargetCameraZoom(stats);
      this.camera.targetZoom = targetZoom;
      const curZoom = Number.isFinite(this.camera.zoom) ? this.camera.zoom : 1.0;
      const zoomAlpha = 1 - Math.exp(-2.8 * dt);
      this.camera.zoom = Math.max(0.70, Math.min(1.0, curZoom + (targetZoom - curZoom) * zoomAlpha));
    }

    this.handleWorldInteractions(dt, stats);
    this._updateSignalCourier(dt, stats);
    this.updateWorldHazards(dt, stats);
    
    // Glacial Path & Static Charge (movement-triggered)
    const dmgOpts = (stats.attributeMilestones && stats.attributeMilestones.dp50) ? { ignoreShieldAndResist: 0.25 } : null;
    const statusDurMult = (stats.attributeMilestones && stats.attributeMilestones.sr15) ? 1.30 : 1.0;
    const isMoving = inputVector.x !== 0 || inputVector.y !== 0;
    if (isMoving) {
        if (stats.specialEffects.glacialPath) {
            if (!this.lastIcePos) {
                this.lastIcePos = {x: this.player.x, y: this.player.y};
                this.iceTrailTimer = 0;
            }
            this.iceTrailTimer += dt;
            if (this.iceTrailTimer >= 0.2) {
                this.iceTrails.push(new IceTrail(this.lastIcePos.x, this.lastIcePos.y, this.player.x, this.player.y, stats.specialEffects.glacialPath.level + (stats.frostMastery || 0) * 0.5));
                this.lastIcePos = {x: this.player.x, y: this.player.y};
                this.iceTrailTimer = 0;
            }
        } else {
            this.lastIcePos = null;
        }
        if (stats.specialEffects.staticCharge) {
            this.staticChargeValue = (this.staticChargeValue || 0) + dt;
            if (this.staticChargeValue >= 5.0) {
                this.staticChargeValue = 0;
                const scRange = 350 * this.getPulseRadiusMult(stats);
                const bpSc = this._getBroadphase();
                const scCandidates = bpSc
                  ? bpSc.queryRadiusInto(this.player.x, this.player.y, scRange, this._broadphaseAuraScratch, true)
                  : this.enemies;
                const inRange = [];
                for (let si = 0; si < scCandidates.length; si++) {
                    const e = scCandidates[si];
                    if (!e || e.markedForDeletion) continue;
                    if (e.x < 0 || e.x > boundW || e.y < 0 || e.y > boundH) continue;
                    const dist = Math.hypot(this.player.x - e.x, this.player.y - e.y);
                    if (dist <= scRange) inRange.push({ e, dist });
                }
                inRange.sort((a, b) => a.dist - b.dist);
                const targets = inRange.slice(0, 5);
                const isFireConv = Boolean(stats.specialEffects && stats.specialEffects.avatarOfFire);
                const scEl = this._resolveProcElement(stats, 'storm');
                const beamColor = isFireConv ? '#ff6622' : '#00ffff';
                const scDmg = stats.damage * (1.5 + (stats.stormMastery || 0) * 0.5) * this.getElemDamageMult(stats, scEl);
                for (const item of targets) {
                    const e = item.e;
                    this.lightnings.push(new Lightning(this.player.x, this.player.y, e.x, e.y, beamColor, true));
                    if (isFireConv) {
                        const wasBurn = Boolean(e.dots && e.dots.some(d => d.type === 'burn'));
                        e.takeDamage(scDmg, dmgOpts);
                        e.applyDot(Math.max(2, scDmg * 0.6 * (stats.burnDamageMult || 1.0)), 3.0 * statusDurMult, "burn");
                        this._triggerThermalFlare(e, stats, wasBurn, dmgOpts);
                    } else {
                        e.takeDamage(scDmg, dmgOpts);
                        e.status.shocked = Math.max(e.status.shocked || 0, 2.0 * statusDurMult);
                    }
                }
            }
        }
    }

    // Earthquake (periodic regardless of movement)
    if (stats.specialEffects.earthquake) {
        this.earthquakeTimer = (this.earthquakeTimer || 0) + dt;
        if (this.earthquakeTimer >= 2.5) {
            this.earthquakeTimer = 0;
            const isFireConv = Boolean(stats.specialEffects && stats.specialEffects.avatarOfFire);
            const eqRadius = 150 * this.getPulseRadiusMult(stats);
            const eqEl = this._resolveProcElement(stats, 'earth');
            const eqDmg = stats.damage * (1.2 + (stats.earthMastery || 0) * 0.2) * this.getElemDamageMult(stats, eqEl);
            const eqColor = isFireConv ? '#ff6622' : '#cc8844';
            for (let i = 0; i < 30; i++) this._pushParticle(this.player.x, this.player.y, eqColor, false);
            const bpEq = this._getBroadphase();
            const eqCandidates = bpEq
              ? bpEq.queryRadiusInto(this.player.x, this.player.y, eqRadius, this._broadphaseAuraScratch, true)
              : this.enemies;
            for (let ei = 0; ei < eqCandidates.length; ei++) {
                const e = eqCandidates[ei];
                if (!e || e.markedForDeletion || e.isBossPylon) continue;
                if (Math.hypot(this.player.x - e.x, this.player.y - e.y) < eqRadius) {
                    if (isFireConv) {
                        const wasBurn = Boolean(e.dots && e.dots.some(d => d.type === 'burn'));
                        e.takeDamage(eqDmg, dmgOpts);
                        e.applyDot(Math.max(2, eqDmg * 0.6 * (stats.burnDamageMult || 1.0)), 3.0 * statusDurMult, "burn");
                        this._triggerThermalFlare(e, stats, wasBurn, dmgOpts);
                    } else {
                        if (!e.isBoss || (e._ccImmuneTimer || 0) <= 0) {
                            e.status.petrified = Math.max(e.status.petrified || 0, e.isBoss ? 0.65 : (1.2 * statusDurMult));
                            if (e.isBoss) e._ccImmuneTimer = 3.6;
                        }
                        e.takeDamage(eqDmg, dmgOpts);
                    }
                }
            }
        }
    }

    if (this.divineShieldCooldown > 0) this.divineShieldCooldown -= dt;
    if (this.codtCooldown > 0) this.codtCooldown -= dt;
    if (this.bloodNovaCooldown > 0) this.bloodNovaCooldown -= dt;
    if (this.frostNovaCooldown > 0) this.frostNovaCooldown -= dt;

    // Timers
    if (this.postReviveTimer > 0) {
      this.postReviveTimer -= dt;
      for (let i = 0; i < this.particles.length; i++) this.particles[i].update(dt);
      if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.compactInPlace === 'function') {
        NeonSystems.compactInPlace(this.particles, _isMarkedForDeletion);
      }
      if (this.floatingTexts) {
        for (let i = 0; i < this.floatingTexts.length; i++) this.floatingTexts[i].update(dt);
        if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.compactInPlace === 'function') {
          NeonSystems.compactInPlace(this.floatingTexts, _isMarkedForDeletion);
        }
      }
      return true;
    }
    
    if (!bossPreludeCompletedThisTick && this.phasingTimer > 0) {
      this.phasingTimer = Math.max(this.bossPrelude ? 0.35 : 0, this.phasingTimer - dt);
    }

    // Energy Shield Regen & Void Instability Sustain Decay
    const instability = this.getVoidInstability();
    if (this.player.shieldRechargeTimer > 0) {
        this.player.shieldRechargeTimer -= dt;
    } else if (this.player.energyShield < this.player.maxEnergyShield) {
        const rechargeMult = stats.shieldRechargeMult || 1.0;
        this.player.energyShield = Math.min(this.player.maxEnergyShield, this.player.energyShield + this.player.maxEnergyShield * 0.09 * rechargeMult * instability.sustainMult * dt);
    }

    // Survival Milestone 15: Continuous 0.4% Max Hull/sec regen (channeled to Barrier under chaosInoculation)
    if (stats.attributeMilestones && stats.attributeMilestones.sv15 && this._hasSustainHeadroom(stats)) {
        const sv30Amp = (stats.attributeMilestones.sv30) ? 1.30 : 1.0;
        const basePool = this._getSustainBasePool(stats);
        this._applySustainHeal(basePool * 0.004 * sv30Amp * instability.sustainMult * dt, stats);
    }

    // Regen Perk
    if (stats.specialEffects.regen) {
        this.regenTimer -= dt;
        if (this.regenTimer <= 0) {
            const sv30Amp = (stats.attributeMilestones && stats.attributeMilestones.sv30) ? 1.30 : 1.0;
            const healAmt = (1.5 + Math.floor(this.player.maxHp * 0.012) * stats.specialEffects.regen.level) * sv30Amp * instability.sustainMult;
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
            this.regenTimer = 4.0;
        }
    }

    // Auras & Fields
    this.auraTimer -= dt;
    if (this.auraTimer <= 0) {
        this.auraTimer = 0.5; // Tick twice a second
        const burnMult = stats.burnDamageMult || 1.0;
        const auraRadius = 150 * this.getPulseRadiusMult(stats);
        if (stats.specialEffects.flameAura) {
            const fireAuraDmg = stats.damage * 0.5 * stats.specialEffects.flameAura.level * burnMult * this.getElemDamageMult(stats, 'fire');
            const bpFa = this._getBroadphase();
            const faCandidates = bpFa
              ? bpFa.queryRadiusInto(this.player.x, this.player.y, auraRadius, this._broadphaseAuraScratch, true)
              : this.enemies;
            for (let fi = 0; fi < faCandidates.length; fi++) {
                const e = faCandidates[fi];
                if (!e || e.markedForDeletion) continue;
                if (Math.hypot(this.player.x - e.x, this.player.y - e.y) < auraRadius) {
                    e.applyDot(fireAuraDmg, 1.0 * statusDurMult, "burn");
                }
            }
        }
        if (stats.specialEffects.consecration) {
            if (this._hasSustainHeadroom(stats)) {
                const sv30Amp = (stats.attributeMilestones && stats.attributeMilestones.sv30) ? 1.30 : 1.0;
                const basePool = this._getSustainBasePool(stats);
                const consecHeal = Math.max(1, basePool * 0.008) * (stats.specialEffects.consecration.level || 1) * sv30Amp * instability.sustainMult;
                this._applySustainHeal(consecHeal, stats);
            }
            const consecEl = this._resolveProcElement(stats, 'holy');
            const consecDmg = stats.damage * 0.5 * burnMult * this.getElemDamageMult(stats, consecEl);
            for (let i = 0; i < 5; i++) this._pushParticle(this.player.x + (Math.random() - 0.5) * auraRadius, this.player.y + (Math.random() - 0.5) * auraRadius, '#ffffaa', false);
            const bpCo = this._getBroadphase();
            const coCandidates = bpCo
              ? bpCo.queryRadiusInto(this.player.x, this.player.y, auraRadius, this._broadphaseAuraScratch, true)
              : this.enemies;
            for (let ci = 0; ci < coCandidates.length; ci++) {
                const e = coCandidates[ci];
                if (!e || e.markedForDeletion) continue;
                if (Math.hypot(this.player.x - e.x, this.player.y - e.y) < auraRadius) {
                    e.applyDot(consecDmg, 1.0 * statusDurMult, "burn");
                }
            }
        }
    }

    // Repulsion
    if (stats.specialEffects.repulsion) {
        this.repulsionTimer -= dt;
        if (this.repulsionTimer <= 0) {
            this.repulsionTimer = 3.0;
            const bpRep = this._getBroadphase();
            const repCandidates = bpRep
              ? bpRep.queryRadiusInto(this.player.x, this.player.y, 150, this._broadphaseAuraScratch, true)
              : this.enemies;
            for (let ri = 0; ri < repCandidates.length; ri++) {
                const e = repCandidates[ri];
                if (!e || e.markedForDeletion || e.isBossPylon) continue;
                const dist = Math.hypot(this.player.x - e.x, this.player.y - e.y);
                const kbScale = e.isBoss ? ((e._bossDash || (e._bossLockHeading || 0) > 0) ? 0 : 0.08) : 1.0;
                if (dist > 0 && dist < 150) {
                    e.kbX = ((e.x - this.player.x) / dist) * 500 * kbScale;
                    e.kbY = ((e.y - this.player.y) / dist) * 500 * kbScale;
                } else if (dist === 0) {
                    e.kbX = 500 * kbScale;
                    e.kbY = 0;
                }
            }
        }
    }

    // Chrono-Singularity Heart (Mythic Relic Periodic Stagger & Chill Pulse)
    if (stats.signatureTraits && stats.signatureTraits.chronoPulseInterval > 0) {
        this.chronoPulseTimer = (this.chronoPulseTimer || 0) + dt;
        if (this.chronoPulseTimer >= stats.signatureTraits.chronoPulseInterval) {
            this.chronoPulseTimer = 0;
            const pulseR = stats.signatureTraits.chronoPulseRadius || 220;
            const pulseDmg = stats.damage * 0.75;
            const bpChr = this._getBroadphase();
            const chrCandidates = bpChr
              ? bpChr.queryRadiusInto(this.player.x, this.player.y, pulseR, this._broadphaseAuraScratch, true)
              : this.enemies;
            for (let ci = 0; ci < chrCandidates.length; ci++) {
                const e = chrCandidates[ci];
                if (!e || e.markedForDeletion || e.hp <= 0 || e.isBossPylon) continue;
                const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
                if (d <= pulseR + (e.radius || 14)) {
                    e.status.chilled = Math.max(e.status.chilled || 0, e.isBoss ? 1.1 : 2.2);
                    e.takeDamage(pulseDmg);
                    if (d > 1) {
                        const kbScale = e.isBoss ? ((e._bossDash || (e._bossLockHeading || 0) > 0) ? 0 : 0.08) : 1.0;
                        e.kbX = ((e.x - this.player.x) / d) * 320 * kbScale;
                        e.kbY = ((e.y - this.player.y) / d) * 320 * kbScale;
                    }
                }
            }
            if (this.particles) {
                for (let k = 0; k < 10; k++) {
                    const a = (Math.PI * 2 * k) / 10;
                    this._pushParticle(this.player.x + Math.cos(a) * (pulseR * 0.45), this.player.y + Math.sin(a) * (pulseR * 0.45), '#00eeff', false);
                }
            }
        }
    }

    // Process Echo Queue (55% echo damage, frame-rate independent)
    if (this.echoQueue && this.echoQueue.length > 0) {
        for (let i = this.echoQueue.length - 1; i >= 0; i--) {
            this.echoQueue[i].timer -= dt;
            if (this.echoQueue[i].timer <= 0) {
                const echoItem = this.echoQueue.splice(i, 1)[0];
                const isTurretEcho = Boolean(echoItem.fromTurret);
                const srcEnt = (isTurretEcho && Array.isArray(this.turrets) && Number.isInteger(echoItem.turretIndex) && this.turrets[echoItem.turretIndex]) || this.player;
                if (!srcEnt) continue;
                const tx = srcEnt.x + Math.cos(echoItem.angle) * 100;
                const ty = srcEnt.y + Math.sin(echoItem.angle) * 100;
                const echoStats = { ...stats, damage: stats.damage * (isTurretEcho ? 0.75 * 0.55 : 0.55) };
                this.fireProjectiles(echoStats, tx, ty, srcEnt.x, srcEnt.y, isTurretEcho);
            }
        }
    }

    // Maintain Orbiters
    if (stats.specialEffects.orbiting) {
        let orbiterCount = 0;
        for (let i = 0; i < this.projectiles.length; i++) {
            if (this.projectiles[i].isOrbiting) orbiterCount++;
        }
        const maxOrbiters = stats.specialEffects.orbiting.level * 2;
        if (orbiterCount < maxOrbiters) {
            const orbiterElement = this.getWeightedRandomElement(stats);
            const orbiterEffects = { ...stats.specialEffects };
            delete orbiterEffects.split;
            delete orbiterEffects.fork;
            delete orbiterEffects.returnToSender;
            const orbiterStats = {
                ...stats,
                pierce: Infinity,
                specialEffects: orbiterEffects
            };
            const orbAngle = (Math.PI * 2 / maxOrbiters) * orbiterCount;
            this.projectiles.push(new Projectile(
                this.player.x, this.player.y, 0, 0, orbiterStats, true, orbAngle, orbiterElement
            ));
        }
    }

    // Autonomous Architect Turrets
    if (stats.specialEffects.ancestralBond) {
        if (this.turrets.length === 0) {
            this.turrets.push(new Turret(0, 2), new Turret(1, 2));
        }
        for (let i = 0; i < this.turrets.length; i++) this.turrets[i].update(dt, this, stats);
    } else if (this.turrets.length > 0) {
        this.turrets = [];
    }

    // Auto-fire
    this.handleFiring(dt, stats);
    this.handleSpawning(dt);
    this.handleSwarm(dt);

    // Update entities
    const projBpArg = this._getBroadphase() || this.enemies;
    for (let i = 0; i < this.projectiles.length; i++) {
        const p = this.projectiles[i];
        p.update(dt, this.canvas, this.player, projBpArg, this._broadphaseEntityScratch);
        if (p.specialEffects.fireTrail && !p.isOrbiting) {
             p.fireTrailTimer = (p.fireTrailTimer || 0) + dt;
             if (p.fireTrailTimer >= 0.15) {
                 p.fireTrailTimer = 0;
                 let firePoolCount = 0;
                 for (const ap of this.acidPools) {
                     if (ap.type === "fire") firePoolCount++;
                 }
                 if (firePoolCount < 35) {
                     this.acidPools.push(new AcidPool(
                         p.x,
                         p.y,
                         p.specialEffects.fireTrail.level + (stats.fireMastery || 0) * 0.5,
                         "fire",
                         stats.damage * 0.32 * this.getElemDamageMult(stats, 'fire')
                     ));
                 }
             }
        }
    }
    const totalEnemies = this.enemies.length;
    const isForming = this.swarmMode === 'REGROUP' || this.swarmMode === 'FLEE' || this.swarmMode === 'PATTERN' || this.swarmMode === 'CONVERGE';
    let formationTotal = 0;
    if (isForming) {
        for (const en of this.enemies) {
            if (!en.markedForDeletion && !en.isBoss && !en.retreatingForBoss && en.aggroed !== false) formationTotal++;
        }
    }
    formationTotal = Math.max(1, formationTotal);
    let formationCursor = 0;

    this._lodTick = ((this._lodTick || 0) + 1) | 0;
    const lodPx = this.player ? this.player.x : 0;
    const lodPy = this.player ? this.player.y : 0;

    const preEnemyLen = this.enemies.length;
    for (let i = 0; i < preEnemyLen; i++) {
        const e = this.enemies[i];
        if (!e) continue;
        const isDistantDormant = !e.isBoss
            && !e.isBossPylon
            && e.aggroed === false
            && !e.markedForDeletion
            && (Math.abs(e.x - lodPx) > 1550 || Math.abs(e.y - lodPy) > 1550);
        if (isDistantDormant && ((this._lodTick + i) & 3) !== 0) {
            e._lodSkipThisTick = true;
            continue;
        }
        e._lodSkipThisTick = false;
        const simDt = isDistantDormant ? dt * 4 : dt;
        const useForm = isForming && !e.isBoss && !e.retreatingForBoss && e.aggroed !== false;
        const unitIdx = useForm ? formationCursor++ : i;
        const unitTotal = useForm ? formationTotal : totalEnemies;
        e.update(simDt, this.player.x, this.player.y, this.swarmMode, this.swarmPattern, unitIdx, unitTotal, this.patternTime);
        if (this.activeBossArena && !e.markedForDeletion) {
            this._resolveActiveBossArenaBoundary(e, Boolean(e.isBoss));
        }
        if (isDistantDormant) {
            e._lodSkipThisTick = true;
        }
    }

    if (this._broadphase) {
        this._broadphase.rebuild(this.enemies);
    }

    const auraScratch = this._broadphaseAuraScratch;
    for (let i = 0; i < preEnemyLen; i++) {
        const e = this.enemies[i];
        if (!e || e.retreatingForBoss || e.markedForDeletion || e._lodSkipThisTick) continue;

        // Medic and Commander abilities
        if (!e.isBossPylon && e.type === 'medic' && e.status.frozen <= 0) {
            const medicList = this._broadphase
              ? this._broadphase.queryRadiusInto(e.x, e.y, 200, auraScratch, false)
              : this.enemies;
            for (let j = 0; j < medicList.length; j++) {
                const oe = medicList[j];
                if (oe !== e && !oe.markedForDeletion && !oe.isBossPylon && oe.hp < oe.maxHp && Math.hypot(oe.x - e.x, oe.y - e.y) < 200) {
                    oe.hp = Math.min(oe.maxHp, oe.hp + 20 * dt);
                    if (Math.random() < 0.1) this._pushParticle(oe.x, oe.y, '#00ff00', false);
                }
            }
        } else if (!e.isBossPylon && e.type === 'commander' && e.status.frozen <= 0) {
            const cmdList = this._broadphase
              ? this._broadphase.queryRadiusInto(e.x, e.y, 250, auraScratch, false)
              : this.enemies;
            for (let j = 0; j < cmdList.length; j++) {
                const oe = cmdList[j];
                if (oe !== e && !oe.markedForDeletion && !oe.isBossPylon && Math.hypot(oe.x - e.x, oe.y - e.y) < 250) {
                    oe.buffs.speedTimer = 0.5;
                    oe.buffs.damageTimer = 0.5;
                }
            }
        }

        // Unified Tactical Boss Mechanics (Telegraphed Attacks, Anti-Kite Teleport, Resonance Pylons & Counterplay)
        if (e.isBoss) {
            this.updateBossMechanics(dt, e, stats);
        }

        if (stats.specialEffects.decay && !e.isBossPylon) {
            const mag = Math.hypot(e.vx || 0, e.vy || 0);
            if (mag > 0) {
                const decayEl = this._resolveProcElement(stats, 'toxin');
                const decayDmg = stats.damage * 0.16 * Math.min(2.6, mag / 100) * (stats.specialEffects.decay.level || 1) * this.getElemDamageMult(stats, decayEl) * dt;
                e.takeDamage(decayDmg, { ...(dmgOpts || {}), isDot: true });
            }
        }
    }
    this.updateBossTelegraphs(dt, stats);
    for (let i = 0; i < this.xpOrbs.length; i++) this.xpOrbs[i].update(dt, this.canvas);
    for (let i = 0; i < this.bossOrbs.length; i++) this.bossOrbs[i].update(dt, this.canvas);
    for (let i = 0; i < this.particles.length; i++) this.particles[i].update(dt);
    for (let i = 0; i < this.lightnings.length; i++) this.lightnings[i].update(dt);
    const bpEntityArg = this._broadphase || this.enemies;
    for (let i = 0; i < this.blackHoles.length; i++) this.blackHoles[i].update(dt, bpEntityArg, this._broadphaseEntityScratch);
    for (let i = 0; i < this.acidPools.length; i++) this.acidPools[i].update(dt, bpEntityArg, this._broadphaseEntityScratch);
    for (let i = 0; i < this.iceTrails.length; i++) this.iceTrails[i].update(dt, bpEntityArg, this._broadphaseEntityScratch);
    for (let i = 0; i < this.meteors.length; i++) this.meteors[i].update(dt, bpEntityArg, this.particles, this._broadphaseEntityScratch);
    for (let i = 0; i < this.enemyProjectiles.length; i++) this.enemyProjectiles[i].update(dt, this);
    for (let i = 0; i < this.enemyExplosions.length; i++) this.enemyExplosions[i].update(dt, this);
    for (let i = 0; i < this.enemyAcidPools.length; i++) this.enemyAcidPools[i].update(dt, this);
    if (this._broadphase) {
        this._broadphase.rebuild(this.enemies);
    }
    
    // Spawn new projectiles from splits (expiration - primary shots only, 28% damage; capped at <18 active)
    const preSplitLen = this.projectiles.length;
    let activeProjForSplits = this.getActiveCombatProjectileCount();
    for (let si = 0; si < preSplitLen; si++) {
        const sp = this.projectiles[si];
        if (!sp || !sp.triggerDeathSplit) continue;
        sp.triggerDeathSplit = false;
        if (sp.isSplitChild || sp.willSplit === false) continue;
        const splitDmg = sp.baseDamage * (sp.pierceDamageMult || 1.0) * 0.28 * this.getElemDamageMult(stats, sp.element);
        if (activeProjForSplits >= 18) {
            this.triggerLocalKineticPulse(sp.x, sp.y, 70, splitDmg * 1.15, '#ff66ff', stats);
            continue;
        }
        for (let i = 0; i < 2; i++) {
            if (activeProjForSplits >= 18) break;
            const angle = Math.random() * Math.PI * 2;
            const childStats = {
                ...stats,
                damage: splitDmg,
                pierce: 0,
                bounce: 0,
                specialEffects: {
                    ...stats.specialEffects,
                    split: null,
                    fork: null,
                    rockShard: null,
                    castOnCrit: null,
                    orbiting: null,
                    returnToSender: null
                }
            };
            const child = new Projectile(
                sp.x, sp.y,
                Math.cos(angle) * stats.projectileSpeed * 0.55, Math.sin(angle) * stats.projectileSpeed * 0.55,
                childStats,
                false,
                0,
                sp.element
            );
            child.isSplitChild = true;
            this.projectiles.push(child);
            activeProjForSplits++;
        }
    }

    this.handleCollisions(dt, stats);
    
    // Process deaths
    for (const e of this.enemies) {
        if (e.hp <= 0 && !e.deathProcessed) {
            e.deathProcessed = true;
            this.processEnemyDeath(e, stats);
        }
    }

    // Cleanup (zero-alloc in-place compaction)
    if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.compactInPlace === 'function') {
        const compact = NeonSystems.compactInPlace;
        compact(this.projectiles, _isMarkedForDeletion);
        compact(this.enemies, _isMarkedForDeletion);
        compact(this.xpOrbs, _isMarkedForDeletion);
        compact(this.bossOrbs, _isMarkedForDeletion);
        if (this.supplyDrops) compact(this.supplyDrops, _isMarkedForDeletion);
        if (this.moduleDrops) compact(this.moduleDrops, _isMarkedForDeletion);
        if (this.floatingTexts) compact(this.floatingTexts, _isMarkedForDeletion);
        compact(this.particles, _isMarkedForDeletion);
        compact(this.lightnings, _isMarkedForDeletion);
        compact(this.blackHoles, _isMarkedForDeletion);
        compact(this.acidPools, _isMarkedForDeletion);
        compact(this.iceTrails, _isMarkedForDeletion);
        compact(this.meteors, _isMarkedForDeletion);
        compact(this.enemyProjectiles, _isMarkedForDeletion);
        compact(this.enemyExplosions, _isMarkedForDeletion);
        compact(this.enemyAcidPools, _isMarkedForDeletion);
    }

    // Late-game 60-FPS entity caps
    if (this.particles.length > 250) {
        this.particles.splice(0, this.particles.length - 250);
    }
    if (this.projectiles.length > 300) {
        let toDrop = this.projectiles.length - 300;
        let writeIdx = 0;
        for (let i = 0; i < this.projectiles.length; i++) {
            const p = this.projectiles[i];
            if (!p.isOrbiting && toDrop > 0) {
                toDrop--;
                continue;
            }
            this.projectiles[writeIdx++] = p;
        }
        this.projectiles.length = writeIdx;
    }
    
    if (this.player && this.player.hp <= 0 && !this._deathAchievementsEvaluated) {
      this._deathAchievementsEvaluated = true;
      if ((this.runTime || 0) > 0 || (this.enemiesKilled || 0) > 0) {
        this._evaluateRunAchievements({ runEnded: true });
      }
    }

    return this.player.hp > 0;
    } finally {
      this._inUpdateLoop = false;
    }
  }

  handleWorldInteractions(dt, stats) {
    this._holdingObjectiveThisTick = false;
    if (!this.world) return;

    const RING_LOOT_CURVE = [1.0, 1.18, 1.35, 1.52, 1.70];
    const phaseCfg = this.getActivePhaseConfig();
    const keyDef = this.getActiveFractureKeyDef();
    const overdriveLootMult = 1 + (this.overdriveChain || 0) * 0.50;
    const matterMult = (stats.matterMult || 1.0) * (phaseCfg.rewardMult || 1.0) * (1 + (keyDef?.matterBonus || 0)) * overdriveLootMult;

    if (!this.isDescentMode) {
      // 1. Sector transitions & first discovery reward
      const sec = this.world.getSectorAt(this.player.x, this.player.y);
      if (sec.id !== this.currentSectorId || sec.ring !== this.currentSectorRing) {
        const prevSectorId = this.currentSectorId;
        const sectorChanged = sec.id !== this.currentSectorId;
        this.currentSectorId = sec.id;
        this.currentSectorRing = sec.ring;
        if (sectorChanged && typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.setBiome === 'function') {
          NeonAudio.setBiome(sec.id);
        }
        const nowRunTime = this.runTime || 0;
        if (nowRunTime > 0.5 && !this.bossPrelude && typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.playBiomeTransition === 'function') {
          NeonAudio.playBiomeTransition(sec.id, sec.ring);
        }
        if (nowRunTime > 0.5 && (nowRunTime - (this._lastSectorCutAt ?? -10)) >= 2.0) {
          this._lastSectorCutAt = nowRunTime;
          this.triggerSignalCut('sector', sec.color || '#00ffff', 0.28, sec.name || '', {
            isSanctumThreshold: Boolean(sectorChanged && (prevSectorId === 'void' || sec.id === 'void')),
            prevSectorId,
            sectorId: sec.id
          });
        }
        const firstDiscovered = sectorChanged && typeof Meta !== 'undefined' && Meta.markSectorDiscovered && Meta.markSectorDiscovered(sec.id);
        if (firstDiscovered && sec.id !== 'void') {
          this.currencyCollected += Math.round(15 * (stats.matterMult || 1));
          if (typeof FloatingText !== 'undefined') {
            this.floatingTexts.push(new FloatingText(this.player.x, this.player.y - 38, `DISCOVERED ${sec.name} +15 MATTER`, sec.color, 1.1, 1.6));
          }
        }
        if (sectorChanged && sec.id !== 'void') {
          this.queueTransmission(`biome_${sec.id}`);
          this._evaluateRunAchievements({ stats });
        }
        const ringIdx = Math.max(0, Math.min(4, sec.ring || 0));
        const affInfo = this.getBiomeAffinityText(sec.id);
        const affSuffix = affInfo ? ` • WEAK ${affInfo.weak} • RES ${affInfo.resist}` : '';
        this.setBanner(
          sec.name,
          sec.id === 'void'
            ? (phaseCfg.phase > 1 ? `${phaseCfg.name.toUpperCase()} • SAFE SANCTUM` : 'SAFE SANCTUM')
            : `${sec.ringName || 'SECTOR'} • LVL ${sec.zoneLevel} • x${RING_LOOT_CURVE[ringIdx].toFixed(2)}${affSuffix}`,
          sec.color,
          4.0,
          1
        );
        if (sec.id !== 'void' && (sec.ring || 0) >= 1 && !this.activeBossArena) {
          this._maybeStartSectorBounty(sec);
        }
      }

      // 1a. Outer-Rim & Boss Return Portals -> Teleport to Void Sanctum center
      this._handleReturnPortals(dt, stats);

      // 1b. Sanctum Echo Entities & Architect Conduit
      if (this.world.sanctumEntities) {
        for (const ent of this.world.sanctumEntities) {
          if (ent.cooldown > 0) ent.cooldown = Math.max(0, ent.cooldown - dt);
          if (ent.hintCooldown > 0) ent.hintCooldown = Math.max(0, ent.hintCooldown - dt);
          const dist = Math.hypot(this.player.x - ent.x, this.player.y - ent.y);
          if (dist <= ent.radius + this.player.radius) {
            if (ent.id === 'architectConduit') {
              if (ent.summonedThisRun) continue;
              const conqueredCount = (typeof Meta !== 'undefined' && Meta.data && Array.isArray(Meta.data.conqueredSectors))
                ? Meta.data.conqueredSectors.length
                : this.world.monoliths.filter(m => m.state === 'conquered').length;
              if (conqueredCount < 7) {
                if (!ent.hintCooldown && typeof FloatingText !== 'undefined') {
                  ent.hintCooldown = 2.5;
                  this.floatingTexts.push(new FloatingText(ent.x, ent.y - 44, `CONQUER ALL 7 CITADELS (${conqueredCount}/7)`, '#ffffff', 1.1, 1.6));
                }
                continue;
              }
              ent.progress += dt;
              if (ent.progress >= ent.holdRequired) {
                ent.progress = 0;
                ent.summonedThisRun = true;
                this.spawnArchitectBoss(ent.x, ent.y - 240);
              }
            } else {
              const rescued = typeof Meta !== 'undefined' && Meta.isEntityRescued ? (Meta.isEntityRescued(ent.id) || ent.id === 'arsenalConduit') : (ent.id === 'archivist' || ent.id === 'arsenalConduit');
              if (!rescued) {
                if (!ent.hintCooldown && typeof FloatingText !== 'undefined') {
                  ent.hintCooldown = 2.6;
                  this.floatingTexts.push(new FloatingText(ent.x, ent.y - 38, `LOCKED: RESCUE ${ent.label} IN WORLD PRISON`, ent.color, 1.05, 1.6));
                }
                continue;
              }
              if (ent.cooldown > 0) continue;
              ent.progress += dt;
              if (ent.progress >= ent.holdRequired) {
                ent.progress = 0;
                ent.cooldown = 3.5;
                if (ent.id === 'archivist' || ent.id === 'artificer' || ent.id === 'broker') {
                  if (this.queueTransmission(`entity_${ent.id}`)) {
                    this._evaluateRunAchievements({ stats });
                  } else {
                    this.queueSignalEcho('sanctum_entity', { entityId: ent.id, stats });
                  }
                }
                if (typeof this.onOpenSanctumEntity === 'function') {
                  this.onOpenSanctumEntity(ent.id);
                }
              }
            }
          } else if (ent.progress > 0) {
            ent.progress = Math.max(0, ent.progress - dt * 1.4);
          }
        }
      }

      // 2. Sanctum Echo Warp Pads (Outpost + Citadel + Deep Abyss Warps, bidirectional repeatable)
      for (const pad of this.world.echoPads) {
        if (!this._isEchoPadUnlocked(pad)) continue;
        const dist = Math.hypot(this.player.x - pad.x, this.player.y - pad.y);
        if (pad._cooldown > 0) {
          pad._cooldown = Math.max(0, pad._cooldown - dt);
          if (dist > pad.radius + this.player.radius + 35) pad._cooldown = 0;
          continue;
        }
        if (dist <= pad.radius + this.player.radius) {
          this._holdingObjectiveThisTick = true;
          pad.progress += dt;
          if (pad.progress >= pad.holdRequired) {
            const firstUse = !pad.usedThisRun;
            pad.usedThisRun = true;
            pad.progress = 0;
            pad._cooldown = 2.0;
            this.teleportPlayerTo(pad.targetX, pad.targetY, `WARPED: ${pad.name}`, pad.color);
            if (firstUse) {
              const orbCount = pad.kind === 'deep' ? 10 : (pad.kind === 'citadel' ? 6 : 4);
              const orbVal = pad.kind === 'deep' ? 16 : (pad.kind === 'citadel' ? 10 : 6);
              for (let i = 0; i < orbCount; i++) {
                const a = ((Math.PI * 2) / orbCount) * i;
                this.xpOrbs.push(new XPOrb(pad.targetX + Math.cos(a) * 52, pad.targetY + Math.sin(a) * 52, orbVal));
              }
            }
            break;
          }
        } else if (pad.progress > 0) {
          pad.progress = Math.max(0, pad.progress - dt * 1.5);
        }
      }

      // 2a. Outpost Beacons (r = 9200 — unlock & return warp to Sanctum)
      if (this.world.outpostBeacons) {
        for (const b of this.world.outpostBeacons) {
          if (b._postUnlockDelay > 0) b._postUnlockDelay = Math.max(0, b._postUnlockDelay - dt);
          const alreadyDisc = b.activatedThisRun || (typeof Meta !== 'undefined' && Meta.data && Array.isArray(Meta.data.discoveredSectors) && Meta.data.discoveredSectors.includes(`outpost_${b.element}`));
          if (alreadyDisc) b.activatedThisRun = true;
          const dist = Math.hypot(this.player.x - b.x, this.player.y - b.y);
          if (!alreadyDisc) {
            if (dist <= b.radius + this.player.radius) {
              this._holdingObjectiveThisTick = true;
              b.progress += dt;
              if (b.progress >= b.holdRequired) {
                b.activatedThisRun = true;
                if (typeof Meta !== 'undefined' && Meta.markSectorDiscovered) {
                  Meta.markSectorDiscovered(`outpost_${b.element}`);
                }
                if (typeof Meta !== 'undefined' && Meta.markBiomeOutpost) {
                  Meta.markBiomeOutpost(b.element);
                }
                this.currencyCollected += Math.round(15 * (stats.matterMult || 1));
                b._postUnlockDelay = 2.8;
                if (typeof NeonAudio !== 'undefined') NeonAudio.playRelicOrShrine();
                if (typeof FloatingText !== 'undefined') {
                  this.floatingTexts.push(new FloatingText(b.x, b.y - 38, 'OUTPOST WARP UNLOCKED! +15 MATTER', b.color, 1.18, 2.2));
                }
              }
            } else if (b.progress > 0) {
              b.progress = Math.max(0, b.progress - dt * 1.2);
            }
          } else if ((this.warpArrivalCooldown || 0) <= 0 && (b._postUnlockDelay || 0) <= 0) {
            if (dist <= b.radius + this.player.radius) {
              b.returnProgress = (b.returnProgress || 0) + dt;
              if (b.returnProgress >= 1.6) {
                b.returnProgress = 0;
                this.teleportPlayerTo(this.world.center, this.world.center, 'WARPED TO VOID SANCTUM', '#00ffff');
                break;
              }
            } else if ((b.returnProgress || 0) > 0) {
              b.returnProgress = Math.max(0, b.returnProgress - dt * 1.4);
            }
          }
        }
      }

      // 2b. Deep Abyss Beacons (r = 31500 — unlock & return warp to Sanctum)
      if (this.world.deepBeacons) {
        for (const b of this.world.deepBeacons) {
          if (b._postUnlockDelay > 0) b._postUnlockDelay = Math.max(0, b._postUnlockDelay - dt);
          const alreadyUnlocked = b.activatedThisRun || (typeof Meta !== 'undefined' && Meta.isDeepBeaconUnlocked && Meta.isDeepBeaconUnlocked(b.element));
          if (alreadyUnlocked) b.activatedThisRun = true;
          const dist = Math.hypot(this.player.x - b.x, this.player.y - b.y);
          if (!alreadyUnlocked) {
            if (dist <= b.radius + this.player.radius) {
              this._holdingObjectiveThisTick = true;
              b.progress += dt;
              if (b.progress >= b.holdRequired) {
                b.activatedThisRun = true;
                if (typeof Meta !== 'undefined' && Meta.unlockDeepBeacon && Meta.unlockDeepBeacon(b.element)) {
                  this.currencyCollected += Math.round(25 * (stats.matterMult || 1));
                }
                if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.recordContractEvent === 'function' && typeof Meta !== 'undefined') {
                  NeonSystems.recordContractEvent(Meta, 'collect_vault', { count: 1 });
                }
                b._postUnlockDelay = 2.8;
                if (typeof NeonAudio !== 'undefined') NeonAudio.playRelicOrShrine();
                if (typeof FloatingText !== 'undefined') {
                  this.floatingTexts.push(new FloatingText(b.x, b.y - 38, 'DEEP WARP BEACON UNLOCKED! +25 MATTER', b.color, 1.2, 2.2));
                }
              }
            } else if (b.progress > 0) {
              b.progress = Math.max(0, b.progress - dt * 1.2);
            }
          } else if ((this.warpArrivalCooldown || 0) <= 0 && (b._postUnlockDelay || 0) <= 0) {
            if (dist <= b.radius + this.player.radius) {
              b.returnProgress = (b.returnProgress || 0) + dt;
              if (b.returnProgress >= 1.6) {
                b.returnProgress = 0;
                this.teleportPlayerTo(this.world.center, this.world.center, 'WARPED TO VOID SANCTUM', '#00ffff');
                break;
              }
            } else if ((b.returnProgress || 0) > 0) {
              b.returnProgress = Math.max(0, b.returnProgress - dt * 1.4);
            }
          }
        }
      }

      // 3. Daily Seeded Rift Pad in Void Sanctum (first 30s)
      const dp = this.world.dailyPad;
      if (dp && !this.isDailyRun && !dp.active && this.runTime < 30) {
        const dist = Math.hypot(this.player.x - dp.x, this.player.y - dp.y);
        if (dist <= dp.radius + this.player.radius) {
          dp.progress += dt;
          if (dp.progress >= dp.holdRequired) {
            this.activateDailyRift();
          }
        } else if (dp.progress > 0) {
          dp.progress = Math.max(0, dp.progress - dt * 1.5);
        }
      }

      // 4. Elemental Monoliths & Guardians (conquered monoliths also serve as return warps to Sanctum)
      for (const m of this.world.monoliths) {
        const isConquered = m.state === 'conquered' || (typeof Meta !== 'undefined' && Meta.isSectorConquered && Meta.isSectorConquered(m.element));
        if (isConquered) {
          m.state = 'conquered';
          const portalBusy = Boolean(this._activePortalId);
          const recentConquest = ((this.runTime || 0) - (m._conqueredAt || -999)) < 3.5;
          if ((this.warpArrivalCooldown || 0) <= 0 && !portalBusy && !recentConquest) {
            const distRet = Math.hypot(this.player.x - m.x, this.player.y - m.y);
            if (distRet <= m.radius + this.player.radius) {
              m.returnProgress = (m.returnProgress || 0) + dt;
              if (m.returnProgress >= 1.6) {
                m.returnProgress = 0;
                this.teleportPlayerTo(this.world.center, this.world.center, 'WARPED TO VOID SANCTUM', '#00ffff');
                break;
              }
            } else if ((m.returnProgress || 0) > 0) {
              m.returnProgress = Math.max(0, m.returnProgress - dt * 1.4);
            }
          } else if ((m.returnProgress || 0) > 0) {
            m.returnProgress = 0;
          }
          continue;
        }
        if (m.state === 'awakening') continue;
        if (m.state === 'guardian_active') {
          if (!m.guardianRef || m.guardianRef.markedForDeletion) {
            m.state = 'conquered';
          }
          continue;
        }
        const dist = Math.hypot(this.player.x - m.x, this.player.y - m.y);
        if (dist <= m.radius) {
          this._holdingObjectiveThisTick = true;
          m.state = 'charging';
          m.progress += dt;
          if (m.progress >= m.holdRequired) {
            m.state = 'awakening';
            m.progress = m.holdRequired;
            this.queueBossEncounter({
              kind: 'monolith',
              monolith: m,
              x: Math.min(this.worldSize - 60, m.x + 170),
              y: m.y,
              title: m.bossTitle || `${m.name} GUARDIAN`,
              sub: `${m.name} • CITADEL GUARDIAN`,
              color: m.color
            });
          }
        } else {
          if (m.progress > 0) {
            m.progress = Math.max(0, m.progress - dt * 0.6);
          }
          if (m.progress === 0) m.state = 'dormant';
        }
      }

      // 5. Risk/Reward World Shrines
      for (const s of this.world.shrines) {
        if (s.completed) continue;
        const dist = Math.hypot(this.player.x - s.x, this.player.y - s.y);
        if (dist <= s.radius) {
          this._holdingObjectiveThisTick = true;
          s.progress += dt;
          if (s.progress >= s.holdRequired) {
            s.completed = true;
            if (typeof NeonAudio !== 'undefined') NeonAudio.playRelicOrShrine();
            if (s.kind === 'convergence') {
              this.pendingBonusLevelUps = (this.pendingBonusLevelUps || 0) + 1;
              this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * (s.isMega ? 0.5 : 0.3));
              this.vacuumTimer = Math.max(this.vacuumTimer || 0, 1.5);
              if (s.isMega) this.currencyCollected += Math.round(40 * (stats.matterMult || 1));
              if (typeof FloatingText !== 'undefined') {
                this.floatingTexts.push(new FloatingText(s.x, s.y - 36, s.isMega ? 'MEGA CONVERGENCE! +1 PERK & +40 MATTER' : 'CONVERGENCE! +1 BONUS PERK', '#00ffff', 1.2, 1.8));
              }
            } else {
              this.frenzyTimer = s.isMega ? 25.0 : 20.0;
              this.triggerShake(6, 0.3);
              if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.recordContractEvent === 'function' && typeof Meta !== 'undefined') {
                NeonSystems.recordContractEvent(Meta, 'clear_shrines', { count: 1 });
              }
              if (typeof SupplyDrop !== 'undefined') {
                this.supplyDrops.push(new SupplyDrop(s.x - 45, s.y, 'matter_cache', Math.round((s.isMega ? 75 : 35) * matterMult)));
                this.supplyDrops.push(new SupplyDrop(s.x + 45, s.y, 'overcharge', 1));
                if (s.isMega) this.supplyDrops.push(new SupplyDrop(s.x, s.y + 45, 'vacuum', 1));
              }
              if (typeof FloatingText !== 'undefined') {
                this.floatingTexts.push(new FloatingText(s.x, s.y - 36, s.isMega ? 'ABYSSAL SURGE! 2.5X MATTER (25s)' : 'VOLATILE SURGE! 2.5X MATTER (20s)', '#ff0055', 1.2, 1.9));
              }
            }
          }
        } else if (s.progress > 0) {
          s.progress = Math.max(0, s.progress - dt * 0.7);
        }
      }

      // 5b. Hidden World Perk Vaults (16 unlockable Blueprints + Keystone Wardens + Neural Lockpick)
      if (this.world.perkVaults) {
        for (const v of this.world.perkVaults) {
          if (v.collectedThisRun) continue;
          const dist = Math.hypot(this.player.x - v.x, this.player.y - v.y);
          if (v.isKeystone && !v.wardenSpawned && dist <= 550) {
            v.wardenSpawned = true;
            const { hpScaling: baseHp, dmgMult, speedScaling } = this._getZoneScaling(v.x, v.y, 10);
            const hpScaling = baseHp * 2.0;
            const warden = new Enemy(Math.min(this.worldSize - 60, v.x + 90), v.y, hpScaling, speedScaling * 0.85, false, true, 'sentinel');
            warden.damage *= dmgMult;
            warden.baseColor = v.color;
            warden.color = v.color;
            this.applyPhaseAndModifiersToEnemy(warden);
            this.enemies.push(warden);
            if (keyDef && keyDef.id === 'twin_wardens') {
              const twinW = new Enemy(Math.max(60, v.x - 90), v.y, hpScaling * 0.85, speedScaling * 0.9, false, true, 'sentinel');
              twinW.damage *= dmgMult * 0.9;
              twinW.baseColor = v.color;
              twinW.color = v.color;
              this.applyPhaseAndModifiersToEnemy(twinW, Math.max(1, phaseCfg.eliteMods || 1));
              this.enemies.push(twinW);
            }
            if (typeof FloatingText !== 'undefined') {
              this.floatingTexts.push(new FloatingText(v.x, v.y - 44, 'VAULT WARDEN AWAKENED!', '#ffd700', 1.2, 1.8));
            }
          }

          if (dist <= v.radius + this.player.radius) {
            if ((v.isTimedBonus || v.isKeystone) && !v._hackPromptedThisRun && typeof this.onVaultHackPrompt === 'function') {
              v._hackPromptedThisRun = true;
              this.onVaultHackPrompt(v);
            }
            v.progress += dt;
            this._holdingObjectiveThisTick = true;
            if (v.progress >= v.holdRequired) {
              v.collectedThisRun = true;
              const newlyFound = typeof Meta !== 'undefined' && Meta.discoverMapPerk && Meta.discoverMapPerk(v.perkId);
              const bonusMult = v._hackBonusClaimed ? 2 : 1;
              if (newlyFound) {
                this.perkPointsCollected = (this.perkPointsCollected || 0) + 1;
                this.currencyCollected += Math.round(30 * bonusMult * (stats.matterMult || 1));
              } else {
                this.currencyCollected += Math.round(25 * bonusMult * (stats.matterMult || 1));
              }
              if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.recordContractEvent === 'function' && typeof Meta !== 'undefined') {
                NeonSystems.recordContractEvent(Meta, 'collect_vault', { count: 1 });
              }
              if (typeof PerkPool !== 'undefined') {
                const perkObj = PerkPool.find(p => p.id === v.perkId);
                if (perkObj) {
                  const alreadyOwned = perkObj.unique && this.statManager.perks.some(cp => cp.id === perkObj.id);
                  const conflictsOneHp =
                    ['hp_up', 'regen', 'vampirism', 'hemomancy', 'blood_nova'].includes(perkObj.id) &&
                    this.statManager.perks.some(cp => cp.id === 'glass_cannon' || cp.id === 'chaos_inoculation');
                  if (!alreadyOwned && !conflictsOneHp && !perkObj.isKeystone) {
                    this.statManager.addPerk(perkObj);
                    this.updatePlayerStats();
                  }
                }
              }
              this.triggerShake(8, 0.35);
              if (typeof NeonAudio !== 'undefined') NeonAudio.playLevelUp();
              if (typeof FloatingText !== 'undefined') {
                this.floatingTexts.push(
                  new FloatingText(
                    v.x,
                    v.y - 42,
                    newlyFound ? `BLUEPRINT UNSEALED: ${v.perkName.toUpperCase()}!` : `${v.perkName.toUpperCase()} CACHE +${25 * bonusMult} MATTER`,
                    v.color,
                    1.25,
                    2.2
                  )
                );
              }
            }
          } else if (v.progress > 0) {
            v.progress = Math.max(0, v.progress - dt * 1.1);
          }
        }
      }

      // 5c. Rescue Chambers (Artificer & Broker Prison Rings)
      if (this.world.rescueChambers) {
        for (const rc of this.world.rescueChambers) {
          if (typeof Meta !== 'undefined' && Meta.isEntityRescued && Meta.isEntityRescued(rc.entityId)) {
            rc.rescuedThisRun = true;
            continue;
          }
          if (rc.rescuedThisRun) continue;
          const dist = Math.hypot(this.player.x - rc.x, this.player.y - rc.y);
          if (!rc.wardenSpawned && dist <= 460) {
            rc.wardenSpawned = true;
            const { hpScaling: baseHp, dmgMult, speedScaling } = this._getZoneScaling(rc.x, rc.y, 1);
            const hpS = Math.max(90, baseHp * 1.6);
            const warden = new Enemy(Math.min(this.worldSize - 80, rc.x + 110), rc.y, hpS, Math.max(85, speedScaling * 0.9), false, true, 'sentinel');
            warden.damage *= dmgMult;
            warden.baseColor = rc.color;
            warden.color = rc.color;
            this.applyPhaseAndModifiersToEnemy(warden, Math.max(1, phaseCfg.eliteMods || 1));
            this.enemies.push(warden);
          }
          if (dist <= rc.radius + this.player.radius) {
            this._holdingObjectiveThisTick = true;
            rc.progress += dt;
            if (rc.progress >= rc.holdRequired) {
              rc.rescuedThisRun = true;
              if (typeof Meta !== 'undefined' && Meta.rescueEntity) {
                Meta.rescueEntity(rc.entityId);
              }
              if (rc.entityId === 'artificer' || rc.entityId === 'broker') {
                this.queueTransmission(`entity_${rc.entityId}`);
              }
              this._evaluateRunAchievements({ stats });
              this.currencyCollected += Math.round(50 * (stats.matterMult || 1));
              this.triggerShake(7, 0.3);
              if (typeof NeonAudio !== 'undefined') NeonAudio.playLevelUp();
              if (typeof FloatingText !== 'undefined') {
                this.floatingTexts.push(new FloatingText(rc.x, rc.y - 42, `RESCUED THE ${rc.entityId.toUpperCase()}! +50 MATTER`, rc.color, 1.25, 2.2));
              }
            }
          } else if (rc.progress > 0) {
            rc.progress = Math.max(0, rc.progress - dt * 1.2);
          }
        }
      }

      // 5d. Volatile Pact Obelisks (12 kills without hull damage -> Harmonic/Signature Module)
      if (this.world.volatilePacts) {
        for (const pact of this.world.volatilePacts) {
          if (pact.completedThisRun) continue;
          const dist = Math.hypot(this.player.x - pact.x, this.player.y - pact.y);
          if (dist <= pact.radius + this.player.radius) {
            this._holdingObjectiveThisTick = true;
            pact.progress += dt;
            if (pact.progress >= pact.holdRequired) {
              pact.completedThisRun = true;
              this.activeVolatilePact = { id: pact.id, killsRemaining: 12, failed: false };
              const { hpScaling: baseHp, dmgMult, speedScaling } = this._getZoneScaling(pact.x, pact.y, 1);
              const hpS = Math.max(45, baseHp * 1.45);
              for (let k = 0; k < 8; k++) {
                const a = ((Math.PI * 2) / 8) * k;
                const eType = k === 0 ? 'brute' : (k % 2 === 0 ? 'rogue' : 'ranger');
                const en = new Enemy(
                  Math.max(80, Math.min(this.worldSize - 80, pact.x + Math.cos(a) * 245)),
                  Math.max(80, Math.min(this.worldSize - 80, pact.y + Math.sin(a) * 245)),
                  hpS, Math.max(96, speedScaling * 1.08), false, k === 0, eType
                );
                en.damage *= dmgMult;
                en.aggroed = true;
                this.applyPhaseAndModifiersToEnemy(en);
                this.enemies.push(en);
              }
              this.setBanner('VOLATILE PACT AMBUSH!', '12 KILLS WITHOUT HULL DAMAGE', '#ff3366', 3.4, 2, true);
              this.triggerShake(7, 0.28);
              if (typeof NeonAudio !== 'undefined') NeonAudio.playRelicOrShrine();
              if (typeof FloatingText !== 'undefined') {
                this.floatingTexts.push(new FloatingText(pact.x, pact.y - 40, 'VOLATILE PACT: 12 KILLS NO HULL DMG!', '#ff3366', 1.2, 2.1));
              }
            }
          } else if (pact.progress > 0) {
            pact.progress = Math.max(0, pact.progress - dt * 1.1);
          }
        }
      }

      // 5e. The Wanderer (Ring 3 encounter)
      if (this.wanderer && !this.wanderer.visited) {
        this.wanderer.pulse += dt * 3;
        const dist = Math.hypot(this.player.x - this.wanderer.x, this.player.y - this.wanderer.y);
        if (dist <= this.wanderer.radius + this.player.radius) {
          this.wanderer.visited = true;
          this._runWandererMet = true;
          this.harmonicBlessingTimer = 45.0;
          const wandererLoreQueued = this.queueTransmission('encounter_wanderer');
          if (typeof Meta !== 'undefined' && typeof Meta.recordLifetimeStat === 'function') {
            Meta.recordLifetimeStat('wanderersMet', 1, 'inc', true);
          }
          const wandererFeats = this._evaluateRunAchievements({ stats, forceEvent: true });
          if (!wandererLoreQueued && (!wandererFeats || wandererFeats.length === 0)) {
            this.queueSignalEcho('wanderer_echo', { stats });
          }
          this.currencyCollected += Math.round(20 * (stats.matterMult || 1));
          let shardEl = 'storm';
          if (typeof NeonSystems !== 'undefined' && NeonSystems && NeonSystems.SHARD_ELEMENTS && typeof Meta !== 'undefined' && Meta.data && Meta.data.frequencyShards) {
            shardEl = NeonSystems.SHARD_ELEMENTS[Math.floor(this.rng() * NeonSystems.SHARD_ELEMENTS.length)];
            if (!Array.isArray(Meta.data.frequencyShards[shardEl])) Meta.data.frequencyShards[shardEl] = [0, 0];
            Meta.data.frequencyShards[shardEl][0] += 1;
            if (typeof Meta.save === 'function') Meta.save();
          }
          if (typeof NeonAudio !== 'undefined') NeonAudio.playRelicOrShrine();
          if (typeof FloatingText !== 'undefined') {
            this.floatingTexts.push(new FloatingText(this.wanderer.x, this.wanderer.y - 40, `WANDERER BLESSING! +20 MATTER & ${shardEl.toUpperCase()} SHARD`, '#00ffaa', 1.2, 2.2));
          }
        }
      }

      // 5f. Void Extractor Rigs (7 Ring-1 POIs -> +30 Matter, Overcharge Drop & Bonus Perk)
      if (this.world.extractorRigs) {
        for (const rig of this.world.extractorRigs) {
          if (rig.capturedThisRun) continue;
          const dist = Math.hypot(this.player.x - rig.x, this.player.y - rig.y);
          if (!rig.guardsSpawned && dist <= 560) {
            rig.guardsSpawned = true;
            const { hpScaling, dmgMult, speedScaling } = this._getZoneScaling(rig.x, rig.y, 1);
            const sec = this.world.getSectorAt(rig.x, rig.y);
            const pool = sec && sec.enemies ? sec.enemies : ['grunt'];
            for (let k = 0; k < 6; k++) {
              const a = (Math.PI * 2 * k) / 6;
              const gx = rig.x + Math.cos(a) * 165;
              const gy = rig.y + Math.sin(a) * 165;
              const guard = new Enemy(gx, gy, hpScaling * 1.18, speedScaling * 1.06, false, k === 0, pool[k % pool.length]);
              guard.damage *= dmgMult;
              this.applyPhaseAndModifiersToEnemy(guard);
              guard.aggroed = true;
              guard.poiGuardId = rig.id;
              this.enemies.push(guard);
            }
            this.setBanner('EXTRACTOR AMBUSH!', 'DEFENDERS CONVERGING ON RIG', rig.color, 3.0, 2, true);
            this._campAmbushCooldown = Math.max(this._campAmbushCooldown || 0, 35.0);
          }
          if (dist <= rig.radius + this.player.radius) {
            this._holdingObjectiveThisTick = true;
            rig.progress += dt;
            if (rig.progress >= rig.holdRequired) {
              rig.capturedThisRun = true;
              const matterGain = Math.round(30 * (stats.matterMult || 1));
              this.currencyCollected += matterGain;
              this.pendingBonusLevelUps = (this.pendingBonusLevelUps || 0) + 1;
              if (this.supplyDrops) {
                this.supplyDrops.push(new SupplyDrop(rig.x + 28, rig.y, 'overcharge', 1));
              }
              this.triggerShake(6, 0.25);
              if (typeof NeonAudio !== 'undefined') NeonAudio.playRelicOrShrine();
              if (typeof FloatingText !== 'undefined') {
                this.floatingTexts.push(new FloatingText(rig.x, rig.y - 42, `EXTRACTOR CAPTURED! +${matterGain} MATTER & BONUS PERK`, rig.color, 1.2, 2.2));
              }
            }
          } else if (rig.progress > 0) {
            rig.progress = Math.max(0, rig.progress - dt * 1.1);
          }
        }
      }

      // 5g. Warband Strongholds (7 Ring-2 POIs -> Congregated Pack + Elite + Module + Shard + 45 Matter)
      if (this.world.strongholds) {
        for (const sh of this.world.strongholds) {
          if (sh.capturedThisRun) continue;
          const dist = Math.hypot(this.player.x - sh.x, this.player.y - sh.y);
          if (!sh.garrisonSpawned && dist <= 760) {
            sh.garrisonSpawned = true;
            const { hpScaling, dmgMult, speedScaling } = this._getZoneScaling(sh.x, sh.y, 1);
            const sec = this.world.getSectorAt(sh.x, sh.y);
            const pool = sec && sec.enemies ? sec.enemies : ['grunt'];
            const packId = this.nextPackId++;
            for (let k = 0; k < 10; k++) {
              const isWarlord = k === 0;
              const a = isWarlord ? 0 : ((Math.PI * 2 * (k - 1)) / 9);
              const rOff = isWarlord ? 0 : 185;
              const gx = sh.x + Math.cos(a) * rOff;
              const gy = sh.y + Math.sin(a) * rOff;
              const gt = isWarlord ? (sec?.guardianType || pool[0]) : pool[k % pool.length];
              const guard = new Enemy(gx, gy, hpScaling * (isWarlord ? 1.9 : 1.08), speedScaling * (isWarlord ? 1.02 : 1.08), false, isWarlord, gt);
              guard.damage *= dmgMult * (isWarlord ? 1.18 : 1.02);
              if (sec && sec.id && sec.id !== 'void') guard.biomeElement = sec.id;
              this.applyPhaseAndModifiersToEnemy(guard, isWarlord ? Math.max(1, phaseCfg.eliteMods || 1) : 0);
              guard.aggroed = true;
              guard.packId = packId;
              guard.poiGuardId = sh.id;
              this.enemies.push(guard);
            }
            this.setBanner('STRONGHOLD AMBUSH!', 'GARRISON & WARLORD CLOSING IN', sh.color, 3.6, 3, true);
            this._campAmbushCooldown = Math.max(this._campAmbushCooldown || 0, 35.0);
            if (typeof FloatingText !== 'undefined') {
              this.floatingTexts.push(new FloatingText(sh.x, sh.y - 46, 'STRONGHOLD AMBUSH!', sh.color, 1.25, 1.9));
            }
          }
          if (dist <= sh.radius + this.player.radius) {
            this._holdingObjectiveThisTick = true;
            const guardsAlive = this.enemies.some(e => !e.markedForDeletion && e.hp > 0 && e.poiGuardId === sh.id);
            sh.progress += dt * (guardsAlive ? 0.65 : 1.55);
            if (sh.progress >= sh.holdRequired) {
              sh.capturedThisRun = true;
              const matterGain = Math.round(45 * (stats.matterMult || 1));
              this.currencyCollected += matterGain;
              if (typeof NeonSystems !== 'undefined' && NeonSystems && this.moduleDrops) {
                const dropZ = Math.max(1, sh.zoneLevel || (this.world.getSectorAt(sh.x, sh.y)?.zoneLevel) || 5);
                const mod = NeonSystems.generateModule({ itemTier: Math.max(2, phaseCfg.phase), quality: 'refined', zoneLevel: dropZ, rng: () => this.rng() });
                this.moduleDrops.push(new ModuleDrop(sh.x, sh.y + 30, mod));
              }
              if (typeof Meta !== 'undefined' && Meta.data && Meta.data.frequencyShards) {
                const el = sh.element || 'fire';
                if (!Array.isArray(Meta.data.frequencyShards[el])) Meta.data.frequencyShards[el] = [0, 0];
                Meta.data.frequencyShards[el][0] += 1;
                if (typeof Meta.save === 'function') Meta.save();
              }
              this.triggerShake(7, 0.3);
              if (typeof NeonAudio !== 'undefined') NeonAudio.playLevelUp();
              if (typeof FloatingText !== 'undefined') {
                this.floatingTexts.push(new FloatingText(sh.x, sh.y - 44, `STRONGHOLD CLEARED! +${matterGain} MATTER & ${String(sh.element).toUpperCase()} SHARD`, sh.color, 1.25, 2.2));
              }
            }
          } else if (sh.progress > 0) {
            sh.progress = Math.max(0, sh.progress - dt * 0.9);
          }
        }
      }

      // 5h. Equipment-Slot Forges (Auxiliary Core & Apex Relic permanent unlocks)
      if (this.world.slotForges) {
        for (const fg of this.world.slotForges) {
          if (fg.unlockedThisRun) continue;
          const dist = Math.hypot(this.player.x - fg.x, this.player.y - fg.y);
          if (!fg.wardenSpawned && dist <= 650) {
            fg.wardenSpawned = true;
            const { hpScaling, dmgMult, speedScaling } = this._getZoneScaling(fg.x, fg.y, 1);
            for (let k = 0; k < 6; k++) {
              const isWarden = k === 0;
              const a = (Math.PI * 2 * k) / 6;
              const gx = fg.x + Math.cos(a) * (isWarden ? 115 : 175);
              const gy = fg.y + Math.sin(a) * (isWarden ? 115 : 175);
              const en = new Enemy(gx, gy, hpScaling * (isWarden ? 2.15 : 1.08), speedScaling * 1.04, false, isWarden, isWarden ? 'sentinel' : (k % 2 === 0 ? 'rogue' : 'ranger'));
              en.damage *= dmgMult * (isWarden ? 1.15 : 1.0);
              this.applyPhaseAndModifiersToEnemy(en, isWarden ? Math.max(1, phaseCfg.eliteMods || 1) : 0);
              en.aggroed = true;
              this.enemies.push(en);
            }
            this.setBanner('FORGE WARDEN AMBUSH!', 'ELITE PROTECTORS ACTIVATED', fg.color, 3.0, 2, true);
            this._campAmbushCooldown = Math.max(this._campAmbushCooldown || 0, 35.0);
          }
          if (dist <= fg.radius + this.player.radius) {
            this._holdingObjectiveThisTick = true;
            fg.progress += dt;
            if (fg.progress >= fg.holdRequired) {
              fg.unlockedThisRun = true;
              const firstUnlock = typeof Meta !== 'undefined' && Meta.unlockEquipmentSlot && Meta.unlockEquipmentSlot(fg.slotKey);
              const matterGain = Math.round(45 * (stats.matterMult || 1));
              this.currencyCollected += matterGain;
              if (firstUnlock && typeof NeonSystems !== 'undefined' && NeonSystems && this.moduleDrops) {
                const fgZ = Math.max(1, (this.world.getSectorAt(fg.x, fg.y)?.zoneLevel) || 5);
                const giftMod = NeonSystems.generateModule({ itemTier: 2, quality: 'refined', zoneLevel: fgZ, rng: () => this.rng() });
                this.moduleDrops.push(new ModuleDrop(fg.x + 32, fg.y, giftMod));
              }
              this.triggerShake(8, 0.35);
              if (typeof NeonAudio !== 'undefined') NeonAudio.playLevelUp();
              if (typeof FloatingText !== 'undefined') {
                const msg = firstUnlock
                  ? `SLOT UNLOCKED: ${fg.slotKey.toUpperCase()} CORE!`
                  : `${fg.label} RECHARGED +${matterGain} MATTER`;
                this.floatingTexts.push(new FloatingText(fg.x, fg.y - 44, msg, fg.color, 1.3, 2.4));
              }
            }
          } else if (fg.progress > 0) {
            fg.progress = Math.max(0, fg.progress - dt * 1.1);
          }
        }
      }

      // 5i. Mythic Super-Item Vaults (3 Unique Outer-World Apex Relics)
      if (this.world.mythicVaults) {
        for (const mv of this.world.mythicVaults) {
          if (mv.collectedThisRun) continue;
          const dist = Math.hypot(this.player.x - mv.x, this.player.y - mv.y);
          if (!mv.wardenSpawned && dist <= 680) {
            mv.wardenSpawned = true;
            const { hpScaling, dmgMult, speedScaling } = this._getZoneScaling(mv.x, mv.y, 1);
            for (let k = 0; k < 4; k++) {
              const a = (Math.PI * 2 * k) / 4;
              const gx = mv.x + Math.cos(a) * 155;
              const gy = mv.y + Math.sin(a) * 155;
              const en = new Enemy(gx, gy, hpScaling * 2.35, speedScaling * 1.05, false, k < 2, k === 0 ? 'golem' : (k === 1 ? 'commander' : 'sentinel'));
              en.damage *= dmgMult * 1.18;
              this.applyPhaseAndModifiersToEnemy(en, k < 2 ? Math.max(1, phaseCfg.eliteMods || 1) : 0);
              en.aggroed = true;
              this.enemies.push(en);
            }
            this.setBanner('MYTHIC VAULT AMBUSH!', 'VAULT GUARDIANS AWAKENED', '#ffcc33', 3.4, 3, true);
            this._campAmbushCooldown = Math.max(this._campAmbushCooldown || 0, 35.0);
            if (typeof FloatingText !== 'undefined') {
              this.floatingTexts.push(new FloatingText(mv.x, mv.y - 46, 'MYTHIC VAULT GUARDIANS AWAKENED!', '#ffcc33', 1.25, 2.0));
            }
          }
          if (dist <= mv.radius + this.player.radius) {
            this._holdingObjectiveThisTick = true;
            mv.progress += dt;
            if (mv.progress >= mv.holdRequired) {
              mv.collectedThisRun = true;
              this._runMythicVault = true;
              this.queueTransmission('encounter_mythic_vault');
              if (typeof Meta !== 'undefined' && typeof Meta.recordLifetimeStat === 'function') {
                Meta.recordLifetimeStat('mythicVaultsOpened', 1, 'inc', true);
              }
              if (typeof Meta !== 'undefined' && Meta.unlockEquipmentSlot) {
                Meta.unlockEquipmentSlot('relic');
              }
              const alreadyOwned = typeof Meta !== 'undefined' && Meta.data && (
                (Meta.data.equippedModules && Meta.data.equippedModules.relic && Meta.data.equippedModules.relic.relicId === mv.relicId) ||
                (Array.isArray(Meta.data.moduleInventory) && Meta.data.moduleInventory.some(m => m && m.relicId === mv.relicId))
              );
              let bannerMsg = `MYTHIC RELIC RECOVERED: ${mv.name.toUpperCase()}!`;
              const mvZ = Math.max(1, (this.world.getSectorAt(mv.x, mv.y)?.zoneLevel) || 24);
              if (!alreadyOwned && typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.generateApexRelic === 'function') {
                const relic = NeonSystems.generateApexRelic(mv.relicId, () => this.rng(), {
                  itemLevel: Math.min(99, mvZ + 12),
                  reqLevel: Math.max(1, Math.min(12, Math.floor(mvZ / 4)))
                });
                if (typeof Meta !== 'undefined') {
                  NeonSystems.addModuleToInventory(Meta, relic);
                  const eqSlot = this.tryAutoEquipModule(relic);
                  if (eqSlot) bannerMsg = `RELIC EQUIPPED [${eqSlot.toUpperCase()}]: ${mv.name.toUpperCase()}!`;
                  if (Meta.addPremium) Meta.addPremium(3);
                }
                this.currencyCollected += Math.round(60 * (stats.matterMult || 1));
              } else {
                const matterGain = Math.round(90 * (stats.matterMult || 1));
                this.currencyCollected += matterGain;
                if (typeof Meta !== 'undefined' && Meta.addPremium) Meta.addPremium(1);
                if (typeof NeonSystems !== 'undefined' && NeonSystems && this.moduleDrops) {
                  const mod = NeonSystems.generateModule({ itemTier: Math.max(3, phaseCfg.phase), quality: 'harmonic', zoneLevel: mvZ, rng: () => this.rng() });
                  this.moduleDrops.push(new ModuleDrop(mv.x, mv.y + 32, mod));
                }
                bannerMsg = `MYTHIC CACHE +${matterGain} MATTER & +1 CRYSTAL`;
              }
              if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.recordContractEvent === 'function' && typeof Meta !== 'undefined') {
                NeonSystems.recordContractEvent(Meta, 'collect_vault', { count: 1 });
              }
              this.triggerShake(9, 0.4);
              if (typeof NeonAudio !== 'undefined') {
                if (typeof NeonAudio.playSignatureDrop === 'function') {
                  NeonAudio.playSignatureDrop(!alreadyOwned ? 'mythic' : 'harmonic');
                } else {
                  NeonAudio.playLevelUp();
                }
              }
              if (typeof FloatingText !== 'undefined') {
                this.floatingTexts.push(new FloatingText(mv.x, mv.y - 46, bannerMsg, '#ffcc33', 1.3, 2.5));
              }
              this._evaluateRunAchievements({ stats, forceEvent: true });
            }
          } else if (mv.progress > 0) {
            mv.progress = Math.max(0, mv.progress - dt * 1.1);
          }
        }
      }

      // 5j. Outer Rim Crystal Geodes (14 nodes awarding Crystals + Matter + Modules)
      if (this.world.crystalGeodes) {
        for (const cg of this.world.crystalGeodes) {
          if (cg.collectedThisRun) continue;
          const dist = Math.hypot(this.player.x - cg.x, this.player.y - cg.y);
          if (!cg.wardensSpawned && dist <= 340) {
            cg.wardensSpawned = true;
            const { hpScaling, dmgMult, speedScaling } = this._getZoneScaling(cg.x, cg.y, 1);
            for (let k = 0; k < 2; k++) {
              const angW = k * Math.PI + 0.5;
              const wx = cg.x + Math.cos(angW) * 115;
              const wy = cg.y + Math.sin(angW) * 115;
              const en = new Enemy(wx, wy, hpScaling * 1.65, speedScaling * 0.95, false, true, k === 0 ? 'sentinel' : 'shieldbearer');
              en.damage *= dmgMult * 1.08;
              this.applyPhaseAndModifiersToEnemy(en, Math.max(1, phaseCfg.eliteMods || 0));
              en.aggroed = true;
              this.enemies.push(en);
            }
            if (typeof FloatingText !== 'undefined') {
              this.floatingTexts.push(new FloatingText(cg.x, cg.y - 42, 'GEODE GUARDIANS DEPLOYED!', '#ffd700', 1.18, 2.2));
            }
          }
          if (dist <= cg.radius + this.player.radius) {
            this._holdingObjectiveThisTick = true;
            cg.progress += dt;
            if (cg.progress >= cg.holdRequired) {
              cg.collectedThisRun = true;
              const crysGain = cg.crystals || 1;
              if (typeof Meta !== 'undefined' && Meta.addPremium) Meta.addPremium(crysGain);
              const matterGain = Math.round(65 * matterMult);
              this.currencyCollected += matterGain;
              if (typeof NeonSystems !== 'undefined' && NeonSystems && this.moduleDrops) {
                const cgZ = Math.max(1, (this.world.getSectorAt(cg.x, cg.y)?.zoneLevel) || 20);
                const mod = NeonSystems.generateModule({ itemTier: Math.max(2, phaseCfg.phase), quality: crysGain >= 2 ? 'harmonic' : 'refined', zoneLevel: cgZ, rng: () => this.rng() });
                this.moduleDrops.push(new ModuleDrop(cg.x + 26, cg.y + 18, mod));
              }
              this.triggerShake(6, 0.25);
              if (typeof NeonAudio !== 'undefined') NeonAudio.playRelicOrShrine();
              if (typeof FloatingText !== 'undefined') {
                this.floatingTexts.push(new FloatingText(cg.x, cg.y - 44, `+${crysGain} CRYSTAL${crysGain > 1 ? 'S' : ''} & +${matterGain} MATTER!`, '#ffd700', 1.25, 2.4));
              }
            }
          } else if (cg.progress > 0) {
            cg.progress = Math.max(0, cg.progress - dt * 1.1);
          }
        }
      }

      // 5k. Outer Rim Abyssal Anomalies (7 high-intensity Singularity Rifts in Ring 4)
      if (this.world.abyssalAnomalies) {
        for (const aa of this.world.abyssalAnomalies) {
          if (aa.clearedThisRun) continue;
          const dist = Math.hypot(this.player.x - aa.x, this.player.y - aa.y);
          if (!aa.ambushSpawned && dist <= 380) {
            aa.ambushSpawned = true;
            this.triggerCubeAmbush(14, 340);
          }
          if (dist <= aa.radius + this.player.radius) {
            this._holdingObjectiveThisTick = true;
            aa.progress += dt;
            if (aa.progress >= aa.holdRequired) {
              aa.clearedThisRun = true;
              const matterGain = Math.round(90 * matterMult);
              this.currencyCollected += matterGain;
              if (typeof NeonSystems !== 'undefined' && NeonSystems && this.moduleDrops) {
                const aaZ = Math.max(1, (this.world.getSectorAt(aa.x, aa.y)?.zoneLevel) || 35);
                const mod = NeonSystems.generateModule({ itemTier: Math.min(4, Math.max(3, phaseCfg.phase)), quality: 'harmonic', zoneLevel: aaZ, rng: () => this.rng() });
                this.moduleDrops.push(new ModuleDrop(aa.x - 24, aa.y + 20, mod));
                const sEl = aa.element && NeonSystems.SHARD_ELEMENTS.includes(aa.element) ? aa.element : 'storm';
                this.moduleDrops.push(new ModuleDrop(aa.x + 24, aa.y + 20, null, sEl, 2));
              }
              if (typeof Meta !== 'undefined' && Meta.data && Meta.data.fractureKeys && this.rng() < 0.5) {
                const kChoices = ['dense_lattice', 'twin_wardens', 'volatile_flux'];
                const kPick = kChoices[Math.floor(this.rng() * kChoices.length)];
                Meta.data.fractureKeys[kPick] = (Meta.data.fractureKeys[kPick] || 0) + 1;
                if (typeof Meta.save === 'function') Meta.save();
              }
              this.triggerShake(8, 0.35);
              if (typeof NeonAudio !== 'undefined') NeonAudio.playLevelUp();
              this.spawnReturnPortal(aa.x + 95, aa.y, 'CITADEL RETURN PORTAL', '#00ffff', aa.accent);
              if (typeof FloatingText !== 'undefined') {
                this.floatingTexts.push(new FloatingText(aa.x, aa.y - 46, `ABYSSAL RIFT CLEARED! +${matterGain} MATTER`, '#ff00ff', 1.28, 2.5));
              }
              this.queueSignalEcho('abyssal_rift', { element: aa.element, stats });
            }
          } else if (aa.progress > 0) {
            aa.progress = Math.max(0, aa.progress - dt * 1.1);
          }
        }
      }
    }

    // 6. SupplyDrops update & pickup
    const pullRange = Math.max(115, stats.pickupRange * 1.25);
    if (this.supplyDrops) {
      for (const drop of this.supplyDrops) {
        drop.update(dt);
        const dist = Math.hypot(this.player.x - drop.x, this.player.y - drop.y);
        if (dist < pullRange) {
          const pull = Math.min(1, dt * 11);
          drop.x += (this.player.x - drop.x) * pull;
          drop.y += (this.player.y - drop.y) * pull;
        }
        if (dist < this.player.radius + drop.radius + 10) {
          drop.markedForDeletion = true;
          if (typeof NeonAudio !== 'undefined') NeonAudio.playRelicOrShrine();
          if (drop.kind === 'vacuum') {
            this.vacuumTimer = Math.max(this.vacuumTimer || 0, 3.0);
            if (typeof FloatingText !== 'undefined') {
              this.floatingTexts.push(new FloatingText(drop.x, drop.y - 24, 'VOID VACUUM!', '#00ffff', 1.15, 1.3));
            }
          } else if (drop.kind === 'overcharge') {
            this.overchargeTimer = Math.max(this.overchargeTimer || 0, 10.0);
            if (typeof FloatingText !== 'undefined') {
              this.floatingTexts.push(new FloatingText(drop.x, drop.y - 24, 'OVERCHARGE 10s!', '#ff00ff', 1.15, 1.3));
            }
          } else {
            const gainedMatter = Math.round(drop.amount * (stats.matterMult || 1));
            this.currencyCollected += gainedMatter;
            if (typeof FloatingText !== 'undefined') {
              this.floatingTexts.push(new FloatingText(drop.x, drop.y - 24, `+${gainedMatter} MATTER`, '#ffd700', 1.15, 1.3));
            }
          }
        }
      }
    }

    // 6b. ModuleDrops & Frequency Shard pickups
    const modPullRange = Math.max(135, stats.pickupRange * 1.35);
    if (this.moduleDrops) {
      for (const drop of this.moduleDrops) {
        drop.update(dt);
        const dist = Math.hypot(this.player.x - drop.x, this.player.y - drop.y);
        if (dist < modPullRange) {
          const pull = Math.min(1, dt * 12);
          drop.x += (this.player.x - drop.x) * pull;
          drop.y += (this.player.y - drop.y) * pull;
        }
        if (dist < this.player.radius + drop.radius + 10) {
          drop.markedForDeletion = true;
          const dropQuality = drop.mod && drop.mod.quality;
          if (typeof NeonAudio !== 'undefined') {
            if ((dropQuality === 'signature' || dropQuality === 'harmonic' || dropQuality === 'mythic') && typeof NeonAudio.playSignatureDrop === 'function') {
              NeonAudio.playSignatureDrop(dropQuality);
            } else {
              NeonAudio.playRelicOrShrine();
            }
          }
          if (drop.mod && typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.addModuleToInventory === 'function' && typeof Meta !== 'undefined') {
            const res = NeonSystems.addModuleToInventory(Meta, drop.mod);
            const autoEqSlot = (res && res.added) ? this.tryAutoEquipModule(drop.mod) : null;
            if (typeof FloatingText !== 'undefined') {
              const txt = (!res.added && res.autoSalvaged)
                ? `ARCHIVE FULL +${res.matterGained || 12} MATTER`
                : autoEqSlot
                  ? `${drop.mod.name.toUpperCase()} [EQUIPPED]`
                  : `${drop.mod.name.toUpperCase()}`;
              this.floatingTexts.push(new FloatingText(drop.x, drop.y - 28, txt, drop.color, 1.18, 1.8));
            }
          } else if (drop.shardElement && typeof Meta !== 'undefined' && Meta.data && Meta.data.frequencyShards) {
            let shardRes = null;
            if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.addFrequencyShard === 'function') {
              shardRes = NeonSystems.addFrequencyShard(Meta, drop.shardElement, drop.shardTier === 2 ? 2 : 1, { autoMerge: true });
            } else {
              if (!Array.isArray(Meta.data.frequencyShards[drop.shardElement])) {
                Meta.data.frequencyShards[drop.shardElement] = [0, 0];
              }
              const tIdx = drop.shardTier === 2 ? 1 : 0;
              Meta.data.frequencyShards[drop.shardElement][tIdx] += 1;
              if (typeof Meta.save === 'function') Meta.save();
            }
            if (typeof FloatingText !== 'undefined') {
              const fusedTxt = (shardRes && shardRes.merged > 0) ? ' (AUTO-FUSED T2!)' : '';
              this.floatingTexts.push(new FloatingText(drop.x, drop.y - 24, `+1 ${drop.shardElement.toUpperCase()} T${drop.shardTier} SHARD${fusedTxt}`, drop.color, 1.1, 1.5));
            }
          }
        }
      }
    }

    // 7. Floating texts
    if (this.floatingTexts) {
      this.floatingTexts.forEach(ft => ft.update(dt));
    }
  }

  _handleReturnPortals(dt, stats) {
    if (!this.world || !this.player || this.isDescentMode) {
      this._activePortalId = null;
      return;
    }
    const allPortals = [];
    if (Array.isArray(this.world.rimPortals)) allPortals.push(...this.world.rimPortals);
    if (Array.isArray(this.returnPortals)) allPortals.push(...this.returnPortals);

    let bestPortal = null;
    let bestDist = Infinity;
    for (let i = 0; i < allPortals.length; i++) {
      const portal = allPortals[i];
      if (!portal || portal.consumed) continue;
      if ((portal.spawnGrace || 0) > 0) {
        portal.spawnGrace = Math.max(0, portal.spawnGrace - dt);
      }
      portal._isFocused = false;
      if ((portal.spawnGrace || 0) > 0) continue;
      const dist = Math.hypot(this.player.x - portal.x, this.player.y - portal.y);
      if (dist <= portal.radius + this.player.radius && dist < bestDist) {
        bestDist = dist;
        bestPortal = portal;
      }
    }

    this._activePortalId = bestPortal ? bestPortal.id : null;
    if (bestPortal) {
      bestPortal._isFocused = true;
    }

    for (let i = 0; i < allPortals.length; i++) {
      const portal = allPortals[i];
      if (!portal || portal.consumed) continue;
      if (portal === bestPortal) {
        portal.progress = (portal.progress || 0) + dt;
        if (portal.progress >= (portal.holdRequired || 1.6)) {
          portal.progress = 0;
          portal._isFocused = false;
          this._activePortalId = null;
          if (!portal.id || !String(portal.id).startsWith('rim_portal_')) {
            portal.consumed = true;
          }
          if (portal.portalKind === 'overdrive' && this.world.sectorDefs) {
            const nextSec = this.world.sectorDefs.find(s => s.id === portal.targetElement) || this.world.sectorDefs[0];
            const entryDist = 3600;
            let tx = this.world.center + Math.cos(nextSec.angle) * entryDist;
            let ty = this.world.center + Math.sin(nextSec.angle) * entryDist;
            if (typeof this.world.isPointClear === 'function' && !this.world.isPointClear(tx, ty, 50)) {
              for (let k = 1; k <= 8; k++) {
                const tryDist = entryDist + k * 140;
                const cx = this.world.center + Math.cos(nextSec.angle) * tryDist;
                const cy = this.world.center + Math.sin(nextSec.angle) * tryDist;
                if (this.world.isPointClear(cx, cy, 50)) {
                  tx = cx;
                  ty = cy;
                  break;
                }
              }
            }
            const maxHull = stats.maxHp || this.player.maxHp || 100;
            this.player.hp = Math.min(maxHull, this.player.hp + Math.round(maxHull * 0.25));
            if (this.player.maxEnergyShield > 0) this.player.energyShield = this.player.maxEnergyShield;
            this.overdriveChain = (this.overdriveChain || 0) + 1;
            this.overchargeTimer = Math.max(this.overchargeTimer || 0, 8.0);
            this.teleportPlayerTo(tx, ty, `OVERDRIVE JUMP x${this.overdriveChain}! (+25% HULL)`, '#ff44ff');
            this.setBanner(`OVERDRIVE JUMP x${this.overdriveChain}!`, `${nextSec.name} • +${this.overdriveChain * 50}% MATTER & LOOT`, '#ff44ff', 4.2, 3, true);
            break;
          }
          const maxHull = stats.maxHp || this.player.maxHp || 100;
          this.player.hp = Math.min(maxHull, this.player.hp + Math.round(maxHull * 0.20));
          if (this.player.maxEnergyShield > 0) {
            this.player.energyShield = this.player.maxEnergyShield;
          }
          this.lastSanctumReturnAt = this.runTime || 0;
          this.teleportPlayerTo(this.world.center, this.world.center, 'SANCTUM RETURN PORTAL (+20% HULL)', '#00ffff');
          this.setBanner('RETURNED TO SANCTUM', 'OPEN PAUSE MENU TO EXTRACT (+20% BONUS) OR WARP OUT', '#00ffff', 4.0, 2, false);
          break;
        }
      } else if (portal.progress > 0) {
        portal.progress = Math.max(0, portal.progress - dt * 1.8);
      }
    }
    if (Array.isArray(this.returnPortals)) {
      if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.compactInPlace === 'function') {
        NeonSystems.compactInPlace(this.returnPortals, _isConsumedPortal);
      } else {
        this.returnPortals = this.returnPortals.filter(p => p && !p.consumed);
      }
    }
  }

  _updateSignalCourier(dt, stats) {
    if (this.isDescentMode || !this.world || !this.player) return;
    if (this.signalCourier) {
      const c = this.signalCourier;
      if (c.markedForDeletion || c.hp <= 0) {
        this.signalCourier = null;
        return;
      }
      c.courierLife = (c.courierLife ?? 22.0) - dt;
      if (c.courierLife <= 0) {
        c.markedForDeletion = true;
        this.signalCourier = null;
        this.setBanner('SIGNAL COURIER ESCAPED', 'DESTROY COURIERS FAST FOR MATTER & SHARDS', '#ffd700', 2.4, 1, false);
        return;
      }
    }
    if (this.bossPrelude || this.activeBossEncounter) return;
    const distFromCenter = Math.hypot(this.player.x - this.world.center, this.player.y - this.world.center);
    if (distFromCenter <= (this.world.sanctumRadius || 1300) + 260) return;

    this.courierSpawnTimer = (this.courierSpawnTimer ?? 68.0) - dt;
    if (this.courierSpawnTimer <= 0 && !this.signalCourier && this.enemies.length < 170) {
      this.courierSpawnTimer = 68.0 + (this.rng ? this.rng() : Math.random()) * 22.0;
      const ang = (this.rng ? this.rng() : Math.random()) * Math.PI * 2;
      const ab = this.getActiveArenaBounds();
      const sx = Math.max(ab.minX + 120, Math.min(ab.maxX - 120, this.player.x + Math.cos(ang) * 440));
      const sy = Math.max(ab.minY + 120, Math.min(ab.maxY - 120, this.player.y + Math.sin(ang) * 440));
      const { hpScaling, dmgMult, speedScaling } = this._getZoneScaling(sx, sy, Math.max(1, this.player.level || 1));
      const courier = new Enemy(sx, sy, hpScaling * 2.2, speedScaling * 1.18, false, true, 'wraith');
      courier.isCourier = true;
      courier.color = '#ffd700';
      courier.baseColor = '#ffd700';
      courier.damage *= dmgMult * 0.65;
      courier.courierLife = 22.0;
      courier.aggroed = true;
      this.applyPhaseAndModifiersToEnemy(courier, 1);
      this.enemies.push(courier);
      this.signalCourier = courier;
      this.setBanner('SIGNAL COURIER SPOTTED!', 'INTERCEPT WITHIN 22s FOR BONUS CACHE', '#ffd700', 3.4, 2, false);
    }
  }

  _maybeStartSectorBounty(sec) {
    if (this.isDescentMode || !sec || !sec.id || sec.id === 'void') return;
    if (this.activeSectorBounty || (this._bountyCooldown || 0) > 0) return;
    if (this.bossPrelude || this.activeBossEncounter || this.activeBossArena) return;
    const roll = this.rng ? this.rng() : Math.random();
    if (roll > 0.72) return;
    const pick = roll < 0.28 ? 'slay_fast' : (roll < 0.52 ? 'streak_surge' : 'elite_hunt');
    if (pick === 'slay_fast') {
      this.activeSectorBounty = {
        kind: 'slay_fast',
        sectorId: sec.id,
        color: sec.color || '#ffd700',
        label: `${sec.name.split(' ')[0].toUpperCase()} SWEEP: SLAY 14`,
        progress: 0,
        target: 14,
        timer: 32,
        maxTimer: 32
      };
    } else if (pick === 'streak_surge') {
      this.activeSectorBounty = {
        kind: 'streak_surge',
        sectorId: sec.id,
        color: sec.color || '#00ffaa',
        label: 'OVERDRIVE TEST: 20x STREAK',
        progress: this.killStreak || 0,
        target: Math.max(20, (this.killStreak || 0) + 12),
        timer: 35,
        maxTimer: 35
      };
    } else {
      this.activeSectorBounty = {
        kind: 'elite_hunt',
        sectorId: sec.id,
        color: sec.color || '#ff55aa',
        label: 'APEX HUNT: SLAY 2 ELITES',
        progress: 0,
        target: 2,
        timer: 45,
        maxTimer: 45
      };
    }
    this._bountyCooldown = 55;
    this.setBanner('SECTOR BOUNTY ACTIVE', this.activeSectorBounty.label, this.activeSectorBounty.color, 3.0, 2, false);
  }

  _updateSectorBounty(dt, stats) {
    if ((this._bountyCooldown || 0) > 0) this._bountyCooldown = Math.max(0, this._bountyCooldown - dt);
    const b = this.activeSectorBounty;
    if (!b) return;
    b.timer -= dt;
    if (b.kind === 'streak_surge') {
      b.progress = Math.max(b.progress, this.killStreak || 0);
      if (b.progress >= b.target) {
        this._completeSectorBounty(stats);
        return;
      }
    }
    if (b.timer <= 0) {
      this.activeSectorBounty = null;
      this.setBanner('BOUNTY EXPIRED', 'KEEP MOVING TO TRIGGER NEW CONTRACTS', '#ff8866', 2.2, 1, false);
    }
  }

  _completeSectorBounty(stats) {
    const b = this.activeSectorBounty;
    if (!b || !this.player) return;
    this.activeSectorBounty = null;
    const matterMult = (stats && stats.matterMult) || 1;
    const streakMult = (typeof Meta !== 'undefined' && Meta.getExtractionStreakMult) ? Meta.getExtractionStreakMult() : 1;
    const bonusMatter = Math.round(35 * matterMult * streakMult);
    this.currencyCollected += bonusMatter;
    if (typeof Meta !== 'undefined' && typeof Meta.addPremium === 'function') {
      Meta.addPremium(1);
    }
    if (typeof ModuleDrop !== 'undefined' && this.moduleDrops && typeof NeonSystems !== 'undefined' && NeonSystems) {
      const sec = this.world ? this.world.getSectorAt(this.player.x, this.player.y) : null;
      const z = sec ? Math.max(1, sec.zoneLevel || 1) : 4;
      const tier = Math.min(4, Math.max(2, Math.ceil(z / 12)));
      const mod = NeonSystems.generateModule({ itemTier: tier, quality: 'harmonic', zoneLevel: z + 2, rng: () => this.rng() });
      this.moduleDrops.push(new ModuleDrop(this.player.x + 28, this.player.y, mod));
    }
    if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
      this.floatingTexts.push(new FloatingText(this.player.x, this.player.y - 48, `BOUNTY CLEARED! +${bonusMatter} MATTER & +1 CRYSTAL`, b.color || '#ffd700', 1.3, 2.4));
    }
    this.setBanner('SECTOR BOUNTY CLEARED!', `+${bonusMatter} MATTER • +1 CRYSTAL • HARMONIC DROP`, '#ffd700', 3.2, 2, true);
  }

  _spawnNemesisIfDue() {
    if (this.isDescentMode || this.nemesisSpawnedThisRun || !this.world || !this.player) return;
    if (this.bossPrelude || this.activeBossEncounter || this.activeBossArena) return;
    if (typeof Meta === 'undefined' || !Meta.data || !Meta.data.nemesis) return;
    const distCenter = Math.hypot(this.player.x - this.world.center, this.player.y - this.world.center);
    if (distCenter <= (this.world.sanctumRadius || 1300) + 350) return;

    const nem = Meta.data.nemesis;
    this.nemesisSpawnedThisRun = true;
    const ang = (this.rng ? this.rng() : Math.random()) * Math.PI * 2;
    const ab = this.getActiveArenaBounds();
    const sx = Math.max(ab.minX + 120, Math.min(ab.maxX - 120, this.player.x + Math.cos(ang) * 420));
    const sy = Math.max(ab.minY + 120, Math.min(ab.maxY - 120, this.player.y + Math.sin(ang) * 420));
    const { hpScaling, dmgMult, speedScaling } = this._getZoneScaling(sx, sy, Math.max(1, this.player.level || 1));
    const eType = nem.enemyType || nem.type || 'commander';
    const mob = new Enemy(sx, sy, hpScaling * 2.9, speedScaling * 1.15, false, true, eType);
    mob.damage *= dmgMult * 1.15;
    mob.isNemesis = true;
    mob.nemesisCallsign = nem.callsign || 'HUNTER';
    mob.color = '#ff2266';
    mob.baseColor = '#ff2266';
    mob.aggroed = true;
    this.applyPhaseAndModifiersToEnemy(mob, 2);
    if (this.world) {
      this.world.resolveCircleWalls(mob);
      if (this.world.resolveCircleChasms) this.world.resolveCircleChasms(mob, mob.type === 'wraith');
      if (this.world.resolveForceGates) this.world.resolveForceGates(mob);
    }
    this.enemies.push(mob);
    this.activeNemesisRef = mob;
    this.queueTransmission('encounter_nemesis');
    this.setBanner(`NEMESIS INBOUND: ${mob.nemesisCallsign}`, 'VENGEANCE HUNT — SLAY FOR +2 CRYSTALS & HARMONIC LOOT', '#ff2266', 4.0, 3, true);
  }

  queueBossEncounter(spec) {
    if (!spec) return;
    const ab = this.getActiveArenaBounds();
    const bx = Math.max(ab.minX + 80, Math.min(ab.maxX - 80, spec.x ?? (this.player.x + 420)));
    const by = Math.max(ab.minY + 80, Math.min(ab.maxY - 80, spec.y ?? this.player.y));
    const queued = { ...spec, x: bx, y: by };

    if (this.isDescentMode) {
      this.bossPrelude = { ...queued, timer: 0, maxTimer: 0.1 };
      this._completeBossPrelude();
      return;
    }

    if (this.bossPrelude || this.activeBossEncounter) {
      if (!this.pendingBossQueue) this.pendingBossQueue = [];
      this.pendingBossQueue.push(queued);
      return;
    }

    this.bossPrelude = { ...queued, timer: 2.6, maxTimer: 2.6 };
    this.phasingTimer = Math.max(this.phasingTimer || 0, 0.35);
    this.swarmMode = 'HUNT';
    this.swarmTimer = 0;
    this.patternTime = 0;

    for (const e of this.enemies) {
      if (e.markedForDeletion || e.isBoss || e.monolithElement) continue;
      if (Math.hypot(e.x - this.player.x, e.y - this.player.y) <= 2400) {
        e.retreatingForBoss = true;
        e.retreatTimer = 1.25;
        e.aggroed = true;
      }
    }

    this.setBanner('SILENCE FALLS...', queued.sub || 'APEX SIGNATURE INBOUND', queued.color || '#ff0055', 3.8, 3, true);
    if (typeof NeonAudio !== 'undefined' && typeof NeonAudio.playBossPrelude === 'function') {
      NeonAudio.playBossPrelude();
    }
  }

  _completeBossPrelude() {
    const bp = this.bossPrelude;
    this.bossPrelude = null;
    if (!bp) return;

    const ab = this.getActiveArenaBounds();
    const phaseCfg = this.getActivePhaseConfig();
    const keyDef = this.getActiveFractureKeyDef();
    let bx = bp.x;
    let by = bp.y;

    if (bp.kind === 'milestone' && Math.hypot(bx - this.player.x, by - this.player.y) > 760) {
      const ang = this.rng() * Math.PI * 2;
      bx = Math.max(ab.minX + 80, Math.min(ab.maxX - 80, this.player.x + Math.cos(ang) * 520));
      by = Math.max(ab.minY + 80, Math.min(ab.maxY - 80, this.player.y + Math.sin(ang) * 520));
    }

    let boss = null;
    let retinuePool = ['grunt', 'kamikaze'];
    let retinueCount = 4;
    let retinueScale = null;

    if (bp.kind === 'monolith' && bp.monolith) {
      const m = bp.monolith;
      m.state = 'guardian_active';
      const arenaR = 740;
      const spawnBossX = Math.max(ab.minX + 80, Math.min(ab.maxX - 80, m.x + 240));
      const spawnBossY = Math.max(ab.minY + 80, Math.min(ab.maxY - 80, m.y));
      const scale = this._getZoneScaling(m.x, m.y, 5);
      retinueScale = scale;
      const hpScaling = scale.hpScaling * 0.95;
      boss = new Enemy(spawnBossX, spawnBossY, hpScaling, scale.speedScaling * 1.15, true, false, m.guardianType);
      boss.damage *= scale.dmgMult;
      boss.monolithElement = m.element;
      boss.bossKit = m.element || boss.type;
      boss.hasDirectionalArmor = (m.guardianType === 'golem' || m.guardianType === 'brute' || m.guardianType === 'sentinel' || m.guardianType === 'shieldbearer');
      boss.baseColor = m.color;
      boss.color = m.color;
      this.applyPhaseAndModifiersToEnemy(boss);
      m.guardianRef = boss;
      this.enemies.push(boss);

      // Seal Dedicated Citadel Boss Arena & suppress ground hazards during battle
      this.activeBossArena = {
        monolith: m,
        element: m.element,
        color: m.color,
        cx: m.x,
        cy: m.y,
        radius: arenaR,
        bossRef: boss
      };
      this.player.x = Math.max(ab.minX + 80, Math.min(ab.maxX - 80, m.x - 240));
      this.player.y = Math.max(ab.minY + 80, Math.min(ab.maxY - 80, m.y));
      if (this.enemyAcidPools) this.enemyAcidPools.length = 0;
      if (this.enemyProjectiles) this.enemyProjectiles.length = 0;
      if (this.enemyExplosions) this.enemyExplosions.length = 0;
      for (const oe of this.enemies) {
        if (oe !== boss && !oe.isBoss && !oe.isBossRetinue && Math.hypot(oe.x - m.x, oe.y - m.y) <= 1600) {
          oe.markedForDeletion = true;
        }
      }
      bx = spawnBossX;
      by = spawnBossY;

      if (keyDef && keyDef.id === 'twin_wardens') {
        const twin = new Enemy(Math.max(ab.minX + 60, m.x + 170), m.y - 140, hpScaling * 0.75, scale.speedScaling * 0.88, false, true, m.guardianType);
        twin.damage *= scale.dmgMult * 0.85;
        twin.baseColor = m.color;
        twin.color = m.color;
        this.applyPhaseAndModifiersToEnemy(twin, Math.max(1, phaseCfg.eliteMods || 1));
        this.enemies.push(twin);
      }

      if (scale.sec && scale.sec.enemies && scale.sec.enemies.length > 0) {
        retinuePool = scale.sec.enemies;
      }
      retinueCount = 5;
      if (typeof FloatingText !== 'undefined') {
        this.floatingTexts.push(new FloatingText(m.x, m.y - 45, `${m.name} CITADEL ARENA SEALED!`, m.color, 1.25, 1.8));
      }
    } else if (bp.kind === 'architect') {
      const baseHp = Math.max(900, (14 + this.runTime * 0.35 + Math.pow(Math.max(0, this.runTime - 40) / 13, 2.2)) * 3.8);
      boss = new Enemy(bx, by, baseHp, 138, true, false, 'commander');
      boss.radius = 50;
      boss.damage *= 1.65;
      boss.isArchitectBoss = true;
      boss.bossKit = 'architect';
      boss.hasDirectionalArmor = true;
      boss.baseColor = '#ffffff';
      boss.color = '#ffffff';
      this.applyPhaseAndModifiersToEnemy(boss);
      this.enemies.push(boss);
      retinuePool = ['sentinel', 'rogue', 'shieldbearer', 'commander'];
      retinueCount = 4;
      retinueScale = { hpScaling: Math.max(45, baseHp * 0.04), dmgMult: 1.4, speedScaling: 112 };
    } else {
      const scale = this._getZoneScaling(this.player.x, this.player.y, Math.max(1, bp.level || this.player.level || 1));
      retinueScale = scale;
      const mBossType = bp.bossType || 'brute';
      boss = new Enemy(bx, by, scale.hpScaling, scale.speedScaling * 1.12, true, false, mBossType);
      boss.damage *= scale.dmgMult;
      boss.bossKit = boss.type;
      boss.hasDirectionalArmor = (mBossType === 'golem' || mBossType === 'brute' || mBossType === 'sentinel' || mBossType === 'shieldbearer');
      this.applyPhaseAndModifiersToEnemy(boss);
      this.enemies.push(boss);
      if (scale.sec && scale.sec.enemies && scale.sec.enemies.length > 0) {
        retinuePool = scale.sec.enemies;
      }
      retinueCount = (bp.level || 10) >= 20 ? 5 : 4;
    }

    // Spawn curated Biome Retinue Escorts on geometric ring around arriving Boss
    if (boss && retinueScale && !this.isDescentMode) {
      for (let i = 0; i < retinueCount; i++) {
        const ang = ((Math.PI * 2) / retinueCount) * i + 0.3;
        const rx = Math.max(ab.minX + 60, Math.min(ab.maxX - 60, bx + Math.cos(ang) * 155));
        const ry = Math.max(ab.minY + 60, Math.min(ab.maxY - 60, by + Math.sin(ang) * 155));
        const rType = retinuePool[i % retinuePool.length];
        const esc = new Enemy(rx, ry, retinueScale.hpScaling * 0.85, retinueScale.speedScaling * 0.96, false, bp.kind === 'architect' && i % 2 === 0, rType);
        esc.damage *= retinueScale.dmgMult * 0.85;
        esc.isBossRetinue = true;
        esc.aggroed = true;
        this.applyPhaseAndModifiersToEnemy(esc);
        if (this.world) {
          this.world.resolveCircleWalls(esc);
          if (this.world.resolveCircleChasms) this.world.resolveCircleChasms(esc, esc.type === 'wraith');
          if (this.world.resolveForceGates) this.world.resolveForceGates(esc);
        }
        this.enemies.push(esc);
      }
    }

    this.phasingTimer = Math.max(this.phasingTimer || 0, 1.4);
    this.activeBossEncounter = { bossRef: boss, kind: bp.kind, color: bp.color || (boss ? boss.color : '#ffd700') };
    if (boss) {
      this._bossFightActive = true;
      this._bossFightHullDamaged = false;
      this._bossFightStartedAt = this.runTime || 0;
    }
    this.setBanner(
      bp.title || 'APEX ANOMALY AWAKENS',
      bp.sub || 'DEFEAT BOSS & RETINUE',
      bp.color || '#ff0055',
      4.2,
      3,
      true
    );
    this.triggerShake(10, 0.45);
    if (typeof NeonAudio !== 'undefined') NeonAudio.playLevelUp();
    if (bp.kind === 'architect') {
      this.queueSignalEcho('architect_summon', { stats: this.statManager ? this.statManager.getCurrentStats() : null });
    }
  }

  spawnArchitectBoss(x, y) {
    const phaseCfg = this.getActivePhaseConfig();
    this.queueBossEncounter({
      kind: 'architect',
      x,
      y,
      title: 'THE ARCHITECT AWAKENS',
      sub: `${phaseCfg.name.toUpperCase()} • WORLD BOSS`,
      color: '#ffd700'
    });
  }

  completeVaultHack(vaultId, success) {
    if (!this.world || !this.world.perkVaults) return;
    const v = this.world.perkVaults.find(item => item.id === vaultId);
    if (!v) return;
    if (success) {
      v._hackBonusClaimed = true;
      const stats = this.statManager ? this.statManager.getCurrentStats() : { matterMult: 1 };
      const bonusMatter = Math.round(30 * (stats.matterMult || 1));
      this.currencyCollected += bonusMatter;
      if (typeof Meta !== 'undefined' && Meta.data && Meta.data.fractureKeys && typeof NeonSystems !== 'undefined' && NeonSystems.FRACTURE_KEY_DEFS) {
        const keyIds = Object.keys(NeonSystems.FRACTURE_KEY_DEFS);
        const picked = keyIds[Math.floor(this.rng() * keyIds.length)];
        Meta.data.fractureKeys[picked] = (Meta.data.fractureKeys[picked] || 0) + 1;
        if (typeof Meta.save === 'function') Meta.save();
      }
      if (!v.collectedThisRun) {
        v.progress = v.holdRequired;
      }
      if (typeof NeonAudio !== 'undefined') NeonAudio.playLevelUp();
      if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
        this.floatingTexts.push(new FloatingText(this.player.x, this.player.y - 44, `NEURAL BREACH! +${bonusMatter} MATTER & +1 KEY`, '#00ffaa', 1.25, 2.0));
      }
    }
  }

  handleFiring(dt, stats) {
    if (this.aimAngle === undefined) this.aimAngle = 0;

    const boundW = this.worldSize || this.canvas.width;
    const boundH = this.worldSize || this.canvas.height;
    const sightRange = Math.max(850, Math.hypot(this.canvas.width, this.canvas.height) * 0.65);

    let nearestEnemy = null;
    let minDist = Infinity;
    let nearestLosEnemy = null;
    let minLosDist = Infinity;
    const checkLos = this.world && typeof this.world.hitWall === 'function' && !this.isDescentMode;
    const hasLineOfSight = (ex, ey, dist) => {
      if (!checkLos) return true;
      const steps = Math.max(2, Math.ceil(dist / 45));
      const dx = ex - this.player.x;
      const dy = ey - this.player.y;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        if (this.world.hitWall(this.player.x + dx * t, this.player.y + dy * t, 6)) return false;
      }
      return true;
    };
    const bp = this._getBroadphase();
    const sightList = bp
      ? bp.queryRadiusInto(this.player.x, this.player.y, sightRange, this._broadphaseEntityScratch, false)
      : this.enemies;
    for (let si = 0; si < sightList.length; si++) {
      const e = sightList[si];
      if (!e || e.markedForDeletion || e.x < 0 || e.x > boundW || e.y < 0 || e.y > boundH) continue;
      const dist = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      if (e.aggroed === false && dist > (e.aggroRadius || 430) + 25) continue;
      if (dist <= sightRange) {
        if (dist < minDist) {
          minDist = dist;
          nearestEnemy = e;
        }
        if (dist < minLosDist && hasLineOfSight(e.x, e.y, dist)) {
          minLosDist = dist;
          nearestLosEnemy = e;
        }
      }
    }
    if (nearestLosEnemy) {
      nearestEnemy = nearestLosEnemy;
      minDist = minLosDist;
    }

    if (nearestEnemy) {
      // Predictive Aiming (Kinematics)
      const projSpeed = stats.projectileSpeed || 380;
      const timeToImpact = Math.min(0.35, minDist / projSpeed);
      
      const futureX = nearestEnemy.x + (nearestEnemy.vx || 0) * timeToImpact;
      const futureY = nearestEnemy.y + (nearestEnemy.vy || 0) * timeToImpact;
      
      this.aimAngle = Math.atan2(futureY - this.player.y, futureX - this.player.x);
    }

    if (stats.specialEffects && stats.specialEffects.ancestralBond) return;

    const effectiveFireRate = this.getEffectiveFireRate(stats);
    const fireInterval = 1 / effectiveFireRate;
    if (this.runTime - this.lastFireTime >= fireInterval) {
      if (nearestEnemy) {
        this.lastFireTime = this.runTime;
        this.shotsFired = (this.shotsFired || 0) + 1;
        
        const tx = this.player.x + Math.cos(this.aimAngle) * 100;
        const ty = this.player.y + Math.sin(this.aimAngle) * 100;

        const prevProjLen = Array.isArray(this.projectiles) ? this.projectiles.length : 0;
        this.fireProjectiles(stats, tx, ty, this.player.x, this.player.y);
        const activeEl = this._playShotAudio(stats, prevProjLen, this.player.x, this.player.y);

        const muzzlePalette = {
          fire: '#ff6622',
          frost: '#99ddff',
          storm: '#00eeff',
          toxin: '#33ff66',
          blood: '#ff2255',
          holy: '#ffee88',
          earth: '#cc8844',
          none: '#00ffff'
        };
        const muzzleCol = muzzlePalette[activeEl] || '#00ffff';
        if (this.player) {
          this.player._muzzleFlashTimer = 0.08;
          this.player._muzzleAngle = this.aimAngle;
          this.player._muzzleColor = muzzleCol;
        }
        if (this.particles && this.particles.length < 180) {
          const muzR = (this.player ? this.player.radius : 15) + 4;
          const muzX = (this.player ? this.player.x : 0) + Math.cos(this.aimAngle) * muzR;
          const muzY = (this.player ? this.player.y : 0) + Math.sin(this.aimAngle) * muzR;
          const shotJitter = (((this.shotsFired || 0) % 5) - 2) * 0.04;
          for (let k = 0; k < 2 && this.particles.length < 180; k++) {
            const spread = (k === 0 ? -0.18 : 0.18) + shotJitter * (k === 0 ? 1 : -1);
            const spd = 210 + ((this.shotsFired || 0) % 3) * 28 + k * 25;
            this._pushParticle(muzX, muzY, k === 0 ? muzzleCol : '#ffffff', false, {
              vx: Math.cos(this.aimAngle + spread) * spd,
              vy: Math.sin(this.aimAngle + spread) * spd,
              life: 0.14,
              radius: 2.0
            });
          }
        }

        this._triggerShotProcs(stats, this.player.x, this.player.y, this.aimAngle, nearestEnemy, false, 0);
      }
    }
  }

  getEffectiveFireRate(stats) {
    const safeStats = stats || {};
    let moveFireBoost = 1.0;
    if (safeStats.attributeMilestones && safeStats.attributeMilestones.kc15 && this._isPlayerMoving) {
      moveFireBoost = 1.12;
    }
    const hasteMult = 1 + (this.killHasteTimer > 0 && safeStats.synergyBonuses ? (safeStats.synergyBonuses.killHaste || 0) : 0);
    const streakRateBoost = 1 + Math.min(0.22, (this.killStreak || 0) * 0.004);
    return Math.max(0.1, (safeStats.fireRate || 0.25) * (this.overchargeTimer > 0 ? 1.6 : 1.0) * moveFireBoost * hasteMult * streakRateBoost);
  }

  _playShotAudio(stats, prevProjLen, sx, sy) {
    const startIdx = Math.max(0, Number.isFinite(prevProjLen) ? prevProjLen : 0);
    if (!Array.isArray(this.projectiles) || this.projectiles.length <= startIdx) return 'none';
    let activeEl = 'none';
    for (let i = startIdx; i < this.projectiles.length; i++) {
      if (this.projectiles[i] && this.projectiles[i].element && this.projectiles[i].element !== 'none') {
        activeEl = this.projectiles[i].element;
        break;
      }
    }
    if (activeEl === 'none' && typeof this.getWeightedRandomElement === 'function') {
      activeEl = this.getWeightedRandomElement(stats) || 'none';
    }
    if (activeEl === 'none' && !this.isDescentMode) {
      const originX = Number.isFinite(sx) ? sx : (this.player ? this.player.x : 0);
      const originY = Number.isFinite(sy) ? sy : (this.player ? this.player.y : 0);
      const secId = (this.world && typeof this.world.getSectorAt === 'function')
        ? this.world.getSectorAt(originX, originY)?.id
        : this.currentSectorId;
      if (secId && secId !== 'void') activeEl = secId;
    }
    if (typeof NeonAudio !== 'undefined' && typeof NeonAudio.playShoot === 'function') {
      NeonAudio.playShoot(activeEl);
    }
    return activeEl;
  }

  _triggerShotProcs(stats, sx, sy, aimAngle, targetEnemy, fromTurret = false, turretIndex = 0) {
    if (!stats) return;
    const bp = typeof this._getBroadphase === 'function' ? this._getBroadphase() : null;
    const procStats = fromTurret ? { ...stats, damage: (stats.damage || 0) * 0.75 } : stats;
    const fx = procStats.specialEffects || {};
    const originX = Number.isFinite(sx) ? sx : (this.player ? this.player.x : 0);
    const originY = Number.isFinite(sy) ? sy : (this.player ? this.player.y : 0);

    if (procStats.attributeMilestones && procStats.attributeMilestones.kc50 && (this.shotsFired || 0) % 5 === 0 && this.getActiveCombatProjectileCount() < 24) {
      const rapidStats = {
        ...procStats,
        damage: procStats.damage * 0.72,
        projectileSpeed: procStats.projectileSpeed * 1.25,
        bounce: 0,
        specialEffects: { ...fx, split: null, fork: null, rockShard: null }
      };
      const rapidEl = this.getWeightedRandomElement(rapidStats);
      const rapidAngle = aimAngle + (Math.random() - 0.5) * 0.14;
      const rapidProj = new Projectile(
        originX, originY,
        Math.cos(rapidAngle) * rapidStats.projectileSpeed,
        Math.sin(rapidAngle) * rapidStats.projectileSpeed,
        rapidStats,
        false,
        0,
        rapidEl
      );
      rapidProj.willSplit = false;
      this.projectiles.push(rapidProj);
    }

    const arcEvery = procStats.signatureTraits?.stormArcEvery || 0;
    if (arcEvery > 0 && (this.shotsFired || 0) % arcEvery === 0 && targetEnemy) {
      const arcTargets = procStats.signatureTraits?.stormArcTargets || 2;
      const arcFactor = procStats.signatureTraits?.stormArcDmgFactor || 0.65;
      const isFireConv = Boolean(fx.avatarOfFire);
      const arcEl = this._resolveProcElement(procStats, 'storm');
      const arcDmg = procStats.damage * arcFactor * this.getElemDamageMult(procStats, arcEl);
      const arcOpts = (procStats.attributeMilestones && procStats.attributeMilestones.dp50) ? { ignoreShieldAndResist: 0.25 } : null;
      const statusDurMult = (procStats.attributeMilestones && procStats.attributeMilestones.sr15) ? 1.30 : 1.0;
      const arcColor = isFireConv ? '#ff6622' : '#00eeff';
      const candidates = [];
      const arcList = bp
        ? bp.queryRadiusInto(targetEnemy.x, targetEnemy.y, 380, this._broadphaseProcScratch || this._broadphaseEntityScratch, false)
        : this.enemies;
      for (let ai = 0; ai < arcList.length; ai++) {
        const oe = arcList[ai];
        if (!oe || oe.markedForDeletion) continue;
        const d = Math.hypot(oe.x - targetEnemy.x, oe.y - targetEnemy.y);
        if (d <= 380) candidates.push({ oe, d });
      }
      candidates.sort((a, b) => a.d - b.d);
      let prevX = originX;
      let prevY = originY;
      for (let k = 0; k < Math.min(arcTargets, candidates.length); k++) {
        const tgt = candidates[k].oe;
        this.lightnings.push(new Lightning(prevX, prevY, tgt.x, tgt.y, arcColor, false));
        if (isFireConv) {
          const wasBurn = Boolean(tgt.dots && tgt.dots.some(d => d.type === 'burn'));
          tgt.takeDamage(arcDmg, arcOpts);
          tgt.applyDot(Math.max(2, arcDmg * 0.6 * (procStats.burnDamageMult || 1.0)), 3.0 * statusDurMult, "burn");
          this._triggerThermalFlare(tgt, procStats, wasBurn, arcOpts);
        } else {
          tgt.takeDamage(arcDmg, arcOpts);
          tgt.status.shocked = Math.max(tgt.status.shocked || 0, 1.5 * statusDurMult);
        }
        prevX = tgt.x;
        prevY = tgt.y;
      }
    }

    const lanceEvery = procStats.signatureTraits?.starforgeLanceEvery || 0;
    if (lanceEvery > 0 && (this.shotsFired || 0) % lanceEvery === 0 && this.getActiveCombatProjectileCount() < 24) {
      const lanceMult = procStats.signatureTraits?.starforgeLanceDmgMult || 1.45;
      const lanceEl = this._resolveProcElement(procStats, 'holy');
      const lanceStats = {
        ...procStats,
        damage: procStats.damage * lanceMult * this.getElemDamageMult(procStats, lanceEl),
        pierce: 4,
        bounce: 0,
        projectileSpeed: procStats.projectileSpeed * 1.45,
        specialEffects: { ...fx, split: null, fork: null, rockShard: null }
      };
      const lanceProj = new Projectile(
        originX, originY,
        Math.cos(aimAngle) * lanceStats.projectileSpeed,
        Math.sin(aimAngle) * lanceStats.projectileSpeed,
        lanceStats,
        false,
        0,
        lanceEl
      );
      lanceProj.willSplit = false;
      this.projectiles.push(lanceProj);
    }

    if (fx.echo && (fromTurret || !fx.ancestralBond)) {
      this.echoQueue.push({
        timer: 0.5,
        angle: aimAngle,
        fromTurret: Boolean(fromTurret),
        turretIndex: Number.isInteger(turretIndex) ? turretIndex : 0
      });
    }

    if (fx.poisonNova && (this.shotsFired || 0) % (fx.poisonNova.value || 3) === 0) {
      this.firePoisonNova(procStats, 1, originX, originY);
    }

    if (fx.meteor && (this.shotsFired || 0) % 10 === 0 && targetEnemy) {
      this.meteors.push(new Meteor(targetEnemy.x, targetEnemy.y, procStats.damage * 6 * (1 + (procStats.fireMastery || 0) * 0.15) * this.getElemDamageMult(procStats, 'fire')));
    }
  }

  getWeightedRandomElement(stats) {
      if (stats.specialEffects && stats.specialEffects.avatarOfFire) return 'fire'; // Absolute Ignition forces fire

      const canUse = (el) => typeof Meta === 'undefined' || !Meta.isSectorConquered || Meta.isSectorConquered(el);
      const eb = (stats && stats.elemBonuses) ? stats.elemBonuses : {};
      const elWeight = (el) => (canUse(el) ? (stats[el + 'Mastery'] || 0) * 15 : 0) + Math.round(Math.max(0, eb[el] || 0) * 520);
      let weights = {
          'none': 100,
          'fire': elWeight('fire'),
          'frost': elWeight('frost'),
          'toxin': elWeight('toxin'),
          'storm': elWeight('storm'),
          'blood': elWeight('blood'),
          'holy': elWeight('holy'),
          'earth': elWeight('earth')
      };

      let totalWeight = 0;
      for (const el in weights) totalWeight += weights[el];

      let random = Math.random() * totalWeight;
      for (const el in weights) {
          if (random < weights[el]) return el;
          random -= weights[el];
      }
      return 'none';
  }

  fireProjectiles(stats, tx, ty, sx, sy, fromTurret = false) {
        if (stats.specialEffects.ancestralBond && !fromTurret) return; // Cannot shoot

        const wantedCount = Math.max(1, Math.min(4, Math.floor(stats.projectileCount || 1)));
        const room = Math.max(0, 24 - this.getActiveCombatProjectileCount());
        const spawnCount = Math.min(wantedCount, room);
        if (spawnCount <= 0) return;

        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.hypot(dx, dy);
        const dirX = dist > 0 ? dx / dist : 1;
        const dirY = dist > 0 ? dy / dist : 0;

        const isShotgun = stats.specialEffects.shotgun;
        const spreadAngle = isShotgun ? 0.3 : 0.1;

        const volleyScale = spawnCount < wantedCount ? (wantedCount / spawnCount) : 1.0;
        let dmgMult = (this.playerBloodOverdrive ? 1.25 : 1.0) * volleyScale;
        if (this.harmonicBlessingTimer > 0) dmgMult *= 1.20;
        const lowHullMult = stats.lowHullDmgMult || 1.0;
        const lowHullThresh = stats.signatureTraits?.lowHullThreshold || 0.65;
        if (lowHullMult > 1.0 && this.player && this.player.hp <= (this.player.maxHp || 100) * lowHullThresh) {
            dmgMult *= lowHullMult;
        }
        const shotStats = { ...stats, damage: stats.damage * dmgMult, projectileCount: spawnCount };

        for (let i = 0; i < spawnCount; i++) {
          const angleOffset = (i - (spawnCount - 1) / 2) * spreadAngle;
          const currentAngle = Math.atan2(dirY, dirX) + angleOffset;
          const element = this.getWeightedRandomElement(shotStats);
          const boltBounce = (shotStats.bounce > 0 && Math.random() < (shotStats.ricochetChance || 0)) ? shotStats.bounce : 0;
          const boltStats = boltBounce === shotStats.bounce ? shotStats : { ...shotStats, bounce: boltBounce };
          const proj = new Projectile(
            sx, sy,
            Math.cos(currentAngle) * shotStats.projectileSpeed, Math.sin(currentAngle) * shotStats.projectileSpeed,
            boltStats,
            false,
            0,
            element
          );
          proj.willSplit = Boolean(shotStats.specialEffects && shotStats.specialEffects.split)
            ? (Math.random() < (shotStats.splitChance || 0))
            : false;
          this.projectiles.push(proj);
        }
  }

  updateWorldHazards(dt, stats) {
    this.playerInCryo = false;
    this.playerBloodOverdrive = false;
    if (!this.world || !this.world.hazards || this.isDescentMode) return;
    if (this.activeBossArena) {
      for (const h of this.world.hazards) h.state = 'dormant';
      return;
    }

    const keyDef = this.getActiveFractureKeyDef();
    const hazardDt = dt * (keyDef && keyDef.hazardRateMult ? keyDef.hazardRateMult : 1.0);

    for (const h of this.world.hazards) {
      const prevTimer = h.timer ?? h.phase ?? 0;
      const nextTimer = (prevTimer + hazardDt) % h.period;
      h.timer = nextTimer;

      if (Math.abs(h.x - this.player.x) > 1500 || Math.abs(h.y - this.player.y) > 1500) {
        h.state = 'dormant';
        continue;
      }

      const secTier = (this.world.getSectorAt(h.x, h.y)?.tier) || 1.5;
      const pDist = Math.hypot(this.player.x - h.x, this.player.y - h.y);
      const playerInside = pDist <= h.radius + (this.player.radius || 15);
      const pulseThreshold = h.period - 0.15;
      const crossedPulse = prevTimer < pulseThreshold && (nextTimer >= pulseThreshold || nextTimer < prevTimer);

      if (h.kind === 'cryo_patch') {
        h.state = 'active';
        if (playerInside) this.playerInCryo = true;
        for (const e of this.enemies) {
          if (!e.markedForDeletion && Math.hypot(e.x - h.x, e.y - h.y) <= h.radius) {
            e.status.chilled = Math.max(e.status.chilled, 0.5);
          }
        }
      } else if (h.kind === 'miasma_pool') {
        h.state = 'active';
        if (playerInside && !stats.specialEffects?.chaosInoculation && (this.phasingTimer || 0) <= 0) {
          this.handleDamageTaken(8 * secTier * dt, stats, { isHazard: true });
        }
        if (crossedPulse) {
          for (const e of this.enemies) {
            if (!e.markedForDeletion && Math.hypot(e.x - h.x, e.y - h.y) <= h.radius) {
              e.applyDot(12 * secTier, 2.0, 'poison');
            }
          }
        }
      } else if (h.kind === 'sanguine_altar') {
        h.state = 'active';
        if (playerInside) {
          this.playerBloodOverdrive = true;
          if (this.player.hp > 1) {
            this.player.hp = Math.max(1, this.player.hp - 4 * dt);
          }
        }
      } else if (h.kind === 'magma_vent') {
        h.state = nextTimer < 2.2 ? 'dormant' : (nextTimer < 3.3 ? 'telegraph' : 'active');
        if (h.state === 'active') {
          if (playerInside && (this.phasingTimer || 0) <= 0) {
            this.handleDamageTaken(12 * secTier * dt, stats, { isHazard: true });
          }
          for (const e of this.enemies) {
            if (!e.markedForDeletion && e.type !== 'wraith' && Math.hypot(e.x - h.x, e.y - h.y) <= h.radius) {
              e.takeDamage(28 * secTier * dt, { isDot: true });
            }
          }
        }
      } else {
        // Pulsed hazards: arc_pylon, solar_flare, seismic_fault
        h.state = nextTimer >= h.period - 1.2 && nextTimer < pulseThreshold ? 'telegraph' : 'dormant';
        if (crossedPulse) {
          h.state = 'active';
          if (playerInside && (this.phasingTimer || 0) <= 0) {
            const pDmg = h.kind === 'seismic_fault' ? 8 * secTier : (h.kind === 'arc_pylon' ? 14 * secTier : 16 * secTier);
            this.handleDamageTaken(pDmg, stats, { isHazard: true });
            if (h.kind === 'seismic_fault' && this.smoothInput) {
              this.smoothInput.x *= 0.25;
              this.smoothInput.y *= 0.25;
            }
          }
          for (const e of this.enemies) {
            if (!e.markedForDeletion && Math.hypot(e.x - h.x, e.y - h.y) <= h.radius) {
              if (h.kind === 'arc_pylon') {
                e.takeDamage(35 * secTier);
                e.status.shocked = Math.max(e.status.shocked, 2.5);
                if (typeof Lightning !== 'undefined') this.lightnings.push(new Lightning(h.x, h.y, e.x, e.y, h.color, false));
              } else if (h.kind === 'solar_flare') {
                e.takeDamage(45 * secTier);
              } else if (h.kind === 'seismic_fault') {
                e.takeDamage(25 * secTier);
                if (!e.isBossPylon && (!e.isBoss || (e._ccImmuneTimer || 0) <= 0)) {
                  e.status.petrified = Math.max(e.status.petrified, e.isBoss ? 0.65 : 1.4);
                  if (e.isBoss) e._ccImmuneTimer = 3.6;
                }
              }
            }
          }
        }
      }
    }
  }

  populateNearbyWorldCamps() {
    if (!this.world || this.isDescentMode) return;
    if (this.bossPrelude) return; // Dramatic pre-boss hush suppresses new camp spawns
    if (!this.populatedCells) this.populatedCells = new Map();
    const cellSize = this.world.cellSize || 1600;
    const maxCol = (this.world.gridCols || Math.ceil(this.world.size / cellSize)) - 1;
    const pcx = Math.max(0, Math.min(maxCol, Math.floor(this.player.x / cellSize)));
    const pcy = Math.max(0, Math.min(maxCol, Math.floor(this.player.y / cellSize)));
    const wardSafeR = (this.world.sanctumRadius || 1300) + 220;

    const candidateCells = [];
    for (let gy = Math.max(0, pcy - 2); gy <= Math.min(maxCol, pcy + 2); gy++) {
      for (let gx = Math.max(0, pcx - 2); gx <= Math.min(maxCol, pcx + 2); gx++) {
        const d2 = (gx - pcx) * (gx - pcx) + (gy - pcy) * (gy - pcy);
        candidateCells.push({ gx, gy, d2 });
      }
    }
    candidateCells.sort((a, b) => a.d2 - b.d2);

    const phaseCfg = this.getActivePhaseConfig();
    const keyDef = this.getActiveFractureKeyDef();

    for (const cellInfo of candidateCells) {
      const { gx, gy } = cellInfo;
      const key = `${gx},${gy}`;
      const existing = this.populatedCells.get(key);
      if (existing && (existing.active || this.runTime - existing.clearedAt < 90)) continue;

      let nonBossCount = 0;
      for (const en of this.enemies) if (!en.isBoss) nonBossCount++;
      if (nonBossCount >= 85) return;

      const cx = (gx + 0.5) * cellSize;
      const cy = (gy + 0.5) * cellSize;
      if (Math.hypot(cx - this.player.x, cy - this.player.y) > 2500) continue;
      if (this.activeBossEncounter && Math.hypot(cx - this.player.x, cy - this.player.y) < 2400) {
        continue;
      }
      const distCenter = Math.hypot(cx - this.world.center, cy - this.world.center);
      if (distCenter + cellSize * 0.72 < wardSafeR) {
        this.populatedCells.set(key, { active: true, clearedAt: 0 });
        continue;
      }

      const { sec, z, hpScaling, dmgMult, speedScaling } = this._getZoneScaling(cx, cy, 1);
      const pool = (sec && sec.enemies && sec.enemies.length > 0) ? sec.enemies : ['grunt', 'kamikaze'];
      const campCount = (sec && sec.ring >= 2 && this.rng() < 0.72) ? 2 : 1;

      for (let c = 0; c < campCount; c++) {
        let ax = 0;
        let ay = 0;
        let foundSpot = false;
        for (let attempt = 0; attempt < 14; attempt++) {
          const candX = Math.max(150, Math.min(this.world.size - 150, cx + (this.rng() - 0.5) * cellSize * 0.88));
          const candY = Math.max(150, Math.min(this.world.size - 150, cy + (this.rng() - 0.5) * cellSize * 0.88));
          if (Math.hypot(candX - this.world.center, candY - this.world.center) < wardSafeR) continue;
          if (!this.world.isPointClear(candX, candY, 70)) continue;
          const distP = Math.hypot(candX - this.player.x, candY - this.player.y);
          if (distP < 520 || distP > 2150) continue;
          ax = candX;
          ay = candY;
          foundSpot = true;
          break;
        }
        if (!foundSpot) continue;

        const campScale = this._getZoneScaling(ax, ay, 1);
        const campSec = campScale.sec;
        const campZ = campScale.z;
        const campPool = (campSec && campSec.enemies && campSec.enemies.length > 0) ? campSec.enemies : pool;

        const packId = this.nextPackId++;
        const ringTier = campSec ? (campSec.ring || 1) : 1;
        const baseCampSize = ringTier >= 3
          ? 9 + Math.floor(this.rng() * 5)
          : (ringTier >= 2 ? 7 + Math.floor(this.rng() * 4) : 5 + Math.floor(this.rng() * 4));
        const campSize = Math.round(baseCampSize * (keyDef && keyDef.packMult ? keyDef.packMult : 1.0));
        const aggroR = 420;

        for (let m = 0; m < campSize; m++) {
          const ang = ((Math.PI * 2) / campSize) * m + this.rng() * 0.4;
          const rad = 36 + this.rng() * 72;
          const mx = Math.max(120, Math.min(this.world.size - 120, ax + Math.cos(ang) * rad));
          const my = Math.max(120, Math.min(this.world.size - 120, ay + Math.sin(ang) * rad));
          if (Math.hypot(mx - this.world.center, my - this.world.center) < wardSafeR - 120) continue;
          if (!this.world.isPointClear(mx, my, 24)) continue;

          const picked = (campSec && typeof this.world.pickBiomeEnemy === 'function')
            ? this.world.pickBiomeEnemy(campSec.id, phaseCfg.phase, phaseCfg.singularityLevel, () => this.rng())
            : { type: campPool[Math.floor(this.rng() * campPool.length)], leaked: false, infusionElement: null };

          const eliteRate = (campSec && campSec.ring >= 3 ? 0.25 : (campSec && campSec.ring >= 2 ? 0.14 : 0.05)) * (keyDef && keyDef.eliteMult ? keyDef.eliteMult : 1.0);
          const isElite = (campZ >= 6 && m === 0 && this.rng() < eliteRate);
          const en = new Enemy(mx, my, campScale.hpScaling, campScale.speedScaling * (isElite ? 1.06 : 1.0), false, isElite, picked.type);
          en.damage *= campScale.dmgMult;
          if (campSec && campSec.id && campSec.id !== 'void') {
            en.biomeElement = campSec.id;
          }
          this.applyPhaseAndModifiersToEnemy(en);
          this.applyPackPaceVariance(en);
          if (picked.leaked && picked.infusionElement && typeof en.applyBiomeInfusion === 'function') {
            en.applyBiomeInfusion(picked.infusionElement);
          }
          en.setStationary(mx, my, aggroR, packId);
          en.cellKey = key;
          this.enemies.push(en);
        }
      }

      // Fixed-Route Biome Scout Patrol in every 4th cell (2 units patrolling 700px route)
      if (Math.abs(gx + gy) % 4 === 0) {
        const baseAng = this.rng() * Math.PI * 2;
        for (let attempt = 0; attempt < 4; attempt++) {
          const pAng = baseAng + (attempt * Math.PI) / 4;
          const ptA = {
            x: Math.max(160, Math.min(this.world.size - 160, cx - Math.cos(pAng) * 350)),
            y: Math.max(160, Math.min(this.world.size - 160, cy - Math.sin(pAng) * 350))
          };
          const ptB = {
            x: Math.max(160, Math.min(this.world.size - 160, cx + Math.cos(pAng) * 350)),
            y: Math.max(160, Math.min(this.world.size - 160, cy + Math.sin(pAng) * 350))
          };
          if (
            Math.hypot(ptA.x - this.world.center, ptA.y - this.world.center) < wardSafeR ||
            Math.hypot(ptB.x - this.world.center, ptB.y - this.world.center) < wardSafeR
          ) {
            continue;
          }
          const dA = Math.hypot(ptA.x - this.player.x, ptA.y - this.player.y);
          const dB = Math.hypot(ptB.x - this.player.x, ptB.y - this.player.y);
          if (dA < 500 || dB < 500 || dA > 2200 || dB > 2200) {
            continue;
          }
          if (
            this.world.isPointClear(ptA.x, ptA.y, 45) &&
            this.world.isPointClear(ptB.x, ptB.y, 45) &&
            this.world.isPointClear((ptA.x + ptB.x) * 0.5, (ptA.y + ptB.y) * 0.5, 30)
          ) {
            const scoutPackId = this.nextPackId++;
            for (let s = 0; s < 3; s++) {
              const sx = ptA.x + (s - 1) * 18;
              const sy = ptA.y + (s % 2 === 0 ? -12 : 12);
              const pickedS = (sec && typeof this.world.pickBiomeEnemy === 'function')
                ? this.world.pickBiomeEnemy(sec.id, phaseCfg.phase, phaseCfg.singularityLevel, () => this.rng())
                : { type: pool[Math.floor(this.rng() * pool.length)], leaked: false, infusionElement: null };
              const scout = new Enemy(sx, sy, hpScaling, speedScaling * 1.12, false, false, pickedS.type);
              scout.damage *= dmgMult;
              if (sec && sec.id && sec.id !== 'void') scout.biomeElement = sec.id;
              this.applyPhaseAndModifiersToEnemy(scout);
              this.applyPackPaceVariance(scout);
              if (pickedS.leaked && pickedS.infusionElement && typeof scout.applyBiomeInfusion === 'function') {
                scout.applyBiomeInfusion(pickedS.infusionElement);
              }
              scout.setPatrol([ptA, ptB], 410, scoutPackId);
              scout.cellKey = key;
              this.enemies.push(scout);
            }
            break;
          }
        }
      }

      this.populatedCells.set(key, { active: true, clearedAt: 0 });
    }
  }

  handleSwarm(dt) {
    if (this.bossPrelude || this.activeBossEncounter) {
        this.swarmMode = 'HUNT';
        this.swarmTimer = 0;
        this.patternTime = 0;
        return;
    }

    const PATTERN_NAMES = [
      'HELIX SPIRAL', 'CONSTRICTING HALO', 'ROTATING CROSSHAIR', 'TWIN PINCER VICE',
      'SWEEPING PHALANX', 'HARMONIC PULSAR', 'STARBURST DIVE', 'ROTATING LATTICE',
      'TWIN HOURGLASS', 'ORBITAL SATELLITES'
    ];

    let aggroCount = 0;
    for (const e of this.enemies) {
      if (
        !e.markedForDeletion &&
        !e.isBoss &&
        !e.retreatingForBoss &&
        e.aggroed !== false &&
        Math.hypot(e.x - this.player.x, e.y - this.player.y) <= 1400
      ) {
        aggroCount++;
      }
    }

    const distFromCenter = this.world ? Math.hypot(this.player.x - this.world.center, this.player.y - this.world.center) : 9999;
    const isOutsideSanctum = !this.world || distFromCenter > (this.world.sanctumRadius || 1300) + 180;
    const minTrigger = isOutsideSanctum ? 6 : 8;

    if (this.swarmMode === 'HUNT') {
        if (aggroCount >= minTrigger && this.swarmCooldown <= 0) {
            // Rally nearby dormant camp mobs up to 24 so every formation forms a dense multi-unit constellation
            const nearbyDormant = [];
            let currentParticipants = aggroCount;
            if (currentParticipants < 24) {
                for (const oe of this.enemies) {
                    if (oe.markedForDeletion || oe.isBoss || oe.aggroed !== false) continue;
                    const d = Math.hypot(oe.x - this.player.x, oe.y - this.player.y);
                    if (d <= 1400) nearbyDormant.push({ oe, d });
                }
                nearbyDormant.sort((a, b) => a.d - b.d);
                for (const item of nearbyDormant) {
                    if (currentParticipants >= 24) break;
                    item.oe.triggerAggro(this, false);
                    currentParticipants++;
                }
            }
            if (!this.isDescentMode && isOutsideSanctum && currentParticipants < 20 && this.enemies.length < 150) {
                const need = Math.min(20 - currentParticipants, 160 - this.enemies.length);
                const cubePool = ['sentinel', 'grunt', 'shieldbearer'];
                const { hpScaling, dmgMult, speedScaling } = this._getZoneScaling(this.player.x, this.player.y, Math.max(1, this.player.level || 1));
                const phaseCfg = this.getActivePhaseConfig();
                for (let k = 0; k < need; k++) {
                    const ang = ((Math.PI * 2) / Math.max(1, need)) * k;
                    let sx = this.player.x + Math.cos(ang) * 580;
                    let sy = this.player.y + Math.sin(ang) * 580;
                    if (this.world && this.world.size) {
                        sx = Math.max(120, Math.min(this.world.size - 120, sx));
                        sy = Math.max(120, Math.min(this.world.size - 120, sy));
                        if (Math.hypot(sx - this.world.center, sy - this.world.center) < (this.world.sanctumRadius || 1300) + 100) continue;
                    }
                    const en = new Enemy(sx, sy, hpScaling * 0.90, speedScaling * 1.06, false, false, cubePool[k % cubePool.length]);
                    en.damage *= dmgMult;
                    this.applyPhaseAndModifiersToEnemy(en, phaseCfg.phase >= 3 && k === 0 ? 1 : 0);
                    this.applyPackPaceVariance(en);
                    en.aggroed = true;
                    this.enemies.push(en);
                    currentParticipants++;
                }
            }

            this.swarmMode = 'REGROUP';
            this.swarmTimer = 2.4;
            this.patternTime = 0;
            this.swarmPattern = Math.floor((this.rng ? this.rng() : Math.random()) * 10);
            this.setBanner(
              'TACTICAL FORMATION',
              `${PATTERN_NAMES[this.swarmPattern] || 'SWARM MANEUVER'} (${currentParticipants} UNITS)`,
              '#ff00ff',
              2.4,
              2,
              false
            );
            if (typeof NeonAudio !== 'undefined' && typeof NeonAudio.playSwarmFormation === 'function') {
                NeonAudio.playSwarmFormation();
            }
        } else if (this.swarmCooldown > 0) {
            this.swarmCooldown -= dt;
        }
    } else if (this.swarmMode === 'REGROUP' || this.swarmMode === 'FLEE') {
        this.swarmTimer -= dt;
        if (this.swarmTimer <= 0) {
            this.swarmMode = 'PATTERN';
            this.swarmTimer = 12.6;
            this.patternTime = 0;
        }
    } else if (this.swarmMode === 'PATTERN') {
        this.swarmTimer -= dt;
        this.patternTime += dt;
        if (this.swarmTimer <= 0) {
            this.swarmMode = 'CONVERGE';
            this.swarmTimer = 3.0;
        }
    } else if (this.swarmMode === 'CONVERGE') {
        this.swarmTimer -= dt;
        this.patternTime += dt;
        if (this.swarmTimer <= 0) {
            this.swarmMode = 'HUNT';
            this.swarmCooldown = 26.0;
        }
    }
  }

  _resolveDescentPoint(x, y, ab, clearance = 62, margin = 60) {
    let px = ab ? Math.max(ab.minX + margin, Math.min(ab.maxX - margin, x)) : x;
    let py = ab ? Math.max(ab.minY + margin, Math.min(ab.maxY - margin, y)) : y;
    if (this.world && this.world.clampPointToDescentOctagon) {
      const clamped = this.world.clampPointToDescentOctagon(px, py, margin);
      px = clamped.x;
      py = clamped.y;
    }
    if (this.world && this.world.findClearPoint) {
      const clearPt = this.world.findClearPoint(px, py, clearance);
      px = clearPt.x;
      py = clearPt.y;
    }
    return { x: px, y: py };
  }

  _spawnCrucibleEnemy(rawX, rawY, ab, opts = {}) {
    const clearance = opts.clearance ?? (opts.isBoss ? 86 : 62);
    const margin = opts.margin ?? 60;
    const pt = this._resolveDescentPoint(rawX, rawY, ab, clearance, margin);
    const en = new Enemy(
      pt.x,
      pt.y,
      opts.hpScaling,
      opts.speedScaling,
      Boolean(opts.isBoss),
      Boolean(opts.isElite),
      opts.type || 'grunt'
    );
    en.damage *= (opts.dmgScaling || 1) * (opts.damageMult || 1);
    if (this.world && this.world.resolveCircleWalls) {
      this.world.resolveCircleWalls(en);
    }
    if (this.world && this.world.clampPointToDescentOctagon) {
      const finalClamp = this.world.clampPointToDescentOctagon(en.x, en.y, Math.max(48, (en.radius || 16) + 18));
      en.x = finalClamp.x;
      en.y = finalClamp.y;
    } else if (ab) {
      en.x = Math.max(ab.minX + 60, Math.min(ab.maxX - 60, en.x));
      en.y = Math.max(ab.minY + 60, Math.min(ab.maxY - 60, en.y));
    }
    this.applyPhaseAndModifiersToEnemy(en, opts.forceEliteMods ?? null);
    this.applyPackPaceVariance(en);
    this.enemies.push(en);
    return en;
  }

  _grantCrucibleWaveClearRewards(phaseCfg, keyDef) {
    const stats = this.statManager ? this.statManager.getCurrentStats() : { matterMult: 1, discoveryMult: 1 };
    const clearedDepth = this.descentDepth;
    const keyMatterMult = 1 + (keyDef?.matterBonus || 0);
    let tempoBonusMult = 1.0;
    let tempoSurged = false;
    if (!this._descentWaveCompressed && this.descentWaveTimer > 0) {
      const maxWin = Math.max(1, this.descentWaveMaxTimer || 14.0);
      const remRatio = Math.max(0, Math.min(1, this.descentWaveTimer / maxWin));
      tempoBonusMult = 1 + 0.10 + 0.15 * remRatio;
      if (remRatio >= 0.40) {
        this.overchargeTimer = (this.overchargeTimer || 0) + 1.2;
        tempoSurged = true;
      }
    }
    const matterReward = Math.round((12 + clearedDepth * 8) * (stats.matterMult || 1) * (phaseCfg.rewardMult || 1) * keyMatterMult * tempoBonusMult);
    this.currencyCollected += matterReward;

    if (typeof Meta !== 'undefined' && typeof Meta.updateBestDescentDepth === 'function') {
      Meta.updateBestDescentDepth(clearedDepth);
    }
    if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.recordContractEvent === 'function' && typeof Meta !== 'undefined') {
      NeonSystems.recordContractEvent(Meta, 'reach_depth', { depth: clearedDepth });
    }

    if (typeof ModuleDrop !== 'undefined' && this.moduleDrops && typeof NeonSystems !== 'undefined' && NeonSystems) {
      const itemTier = Math.min(4, 1 + Math.floor(clearedDepth / 3));
      const qRoll = Math.min(0.9999, this.rng() + (keyDef?.discoveryBonus || 0) * 0.25);
      let quality = 'refined';
      if (qRoll > 0.90 || clearedDepth % 5 === 0) quality = 'signature';
      else if (qRoll > 0.60) quality = 'harmonic';
      if (this.moduleDrops.length < 24) {
        const mod = NeonSystems.generateModule({ itemTier, quality, rng: () => this.rng() });
        const rawDropX = this.player.x + (this.rng() - 0.5) * 90;
        const rawDropY = this.player.y + (this.rng() - 0.5) * 90;
        const dropPt = (this.world && this.world.findClearPoint) ? this.world.findClearPoint(rawDropX, rawDropY, 42) : { x: rawDropX, y: rawDropY };
        this.moduleDrops.push(new ModuleDrop(dropPt.x, dropPt.y, mod));
      }
      if (clearedDepth % 5 === 0 && keyDef?.guaranteedBossHarmonic && this.moduleDrops.length < 24) {
        const bonusQuality = this.rng() < 0.25 ? 'signature' : 'harmonic';
        const bonusMod = NeonSystems.generateModule({ itemTier, quality: bonusQuality, rng: () => this.rng() });
        const rawBonusX = this.player.x + (this.rng() - 0.5) * 90;
        const rawBonusY = this.player.y + (this.rng() - 0.5) * 90;
        const bonusPt = (this.world && this.world.findClearPoint) ? this.world.findClearPoint(rawBonusX, rawBonusY, 42) : { x: rawBonusX, y: rawBonusY };
        this.moduleDrops.push(new ModuleDrop(bonusPt.x, bonusPt.y, bonusMod));
      }
      if (clearedDepth % 2 === 0 && NeonSystems.SHARD_ELEMENTS && this.moduleDrops.length < 28) {
        const el = NeonSystems.SHARD_ELEMENTS[Math.floor(this.rng() * NeonSystems.SHARD_ELEMENTS.length)];
        const shardPt = (this.world && this.world.findClearPoint) ? this.world.findClearPoint(this.player.x + 48, this.player.y, 42) : { x: this.player.x + 48, y: this.player.y };
        this.moduleDrops.push(new ModuleDrop(shardPt.x, shardPt.y, null, el, clearedDepth >= 8 ? 2 : 1));
      }
    }

    if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
      this.floatingTexts.push(new FloatingText(this.player.x, this.player.y - 44, `DEPTH ${clearedDepth} CLEARED! +${matterReward} MATTER`, '#ff00ff', 1.25, 1.9));
      if (tempoSurged) {
        this.floatingTexts.push(new FloatingText(this.player.x, this.player.y - 68, 'TEMPO SURGE!', '#00ffff', 1.15, 1.5));
      }
    }
    this.descentDepth += 1;
    this.phasingTimer = Math.max(this.phasingTimer || 0, 0.35);
    if (this.descentDepth % 5 !== 0) {
      this.triggerSignalCut('depth', '#ff00ff', 0.34, `DEPTH ${this.descentDepth}`);
    }
  }

  _triggerCrucibleCompression() {
    this._descentWaveCompressed = true;
    this.descentWaveTimer = 10.0;
    for (const en of this.enemies) {
      if (en && !en.isBoss && !en.isBossPylon && !en.markedForDeletion && (en.hp === undefined || en.hp > 0) && !en._crucibleEnraged) {
        en._crucibleEnraged = true;
        en._crucibleBaseSpeed = Number.isFinite(en._crucibleBaseSpeed) ? en._crucibleBaseSpeed : (en.baseSpeed || 100);
        en.baseSpeed = Math.min(en._crucibleBaseSpeed * 1.25, (en.baseSpeed || 100) * 1.10);
      }
    }
    const ab = this.getActiveArenaBounds();
    const depth = this.descentDepth || 1;
    const hpScaling = (18 + depth * 12) * Math.pow(1.16, Math.max(0, depth - 1));
    const dmgScaling = (1.15 + depth * 0.14) * Math.pow(1.045, Math.max(0, depth - 1));
    const speedScaling = Math.min(200, 65 + depth * 4.5);
    const flankPool = ['rogue', 'grunt', 'ranger', 'wraith'];
    const camZoom = Math.max(0.70, Math.min(1.0, (this.camera && Number.isFinite(this.camera.zoom)) ? this.camera.zoom : 1.0));
    for (let r = 0; r < 2 && this.enemies.length < 24; r++) {
      const ang = this.rng() * Math.PI * 2;
      const dist = (480 + this.rng() * 320) / camZoom;
      const flankType = flankPool[Math.floor(this.rng() * flankPool.length)];
      this._spawnCrucibleEnemy(
        this.player.x + Math.cos(ang) * dist,
        this.player.y + Math.sin(ang) * dist,
        ab,
        { hpScaling, speedScaling, dmgScaling, isBoss: false, isElite: false, type: flankType, clearance: 62 }
      );
    }
    this.setBanner('CRUCIBLE COMPRESSION', 'CLEAR HOSTILES', '#ff6644', 2.8, 2, false);
    if (typeof FloatingText !== 'undefined' && this.floatingTexts && this.player) {
      this.floatingTexts.push(new FloatingText(this.player.x, this.player.y - 54, 'CRUCIBLE COMPRESSION // CLEAR HOSTILES', '#ff6644', 1.1, 1.6));
    }
  }

  _spawnCrucibleVolatileFluxPools(depth, phaseCfg, ab) {
    if (typeof EnemyAcidPool === 'undefined' || !this.enemyAcidPools || !this.player) return;
    const fluxDmg = Math.max(8, (10 + depth * 1.8) * (phaseCfg.dmgMult || 1));
    const baseFluxAng = this.rng() * Math.PI * 2;
    for (let p = 0; p < 2 && this.enemyAcidPools && this.enemyAcidPools.length < 24; p++) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const ang = baseFluxAng + p * Math.PI + attempt * 0.85 + (this.rng() - 0.5) * 0.45;
        const dist = 280 + this.rng() * 340;
        let px = Math.max(ab.minX + 72, Math.min(ab.maxX - 72, this.player.x + Math.cos(ang) * dist));
        let py = Math.max(ab.minY + 72, Math.min(ab.maxY - 72, this.player.y + Math.sin(ang) * dist));
        let pt = (this.world && this.world.clampPointToDescentOctagon)
          ? this.world.clampPointToDescentOctagon(px, py, 72)
          : { x: px, y: py };
        if (this.world && this.world.findClearPoint) {
          pt = this.world.findClearPoint(pt.x, pt.y, 56);
        }
        const safeDist = Math.hypot(pt.x - this.player.x, pt.y - this.player.y) >= 220;
        const clearWall = !this.world || !this.world.hitWall || !this.world.hitWall(pt.x, pt.y, 16);
        if (safeDist && clearWall) {
          this.enemyAcidPools.push(new EnemyAcidPool(pt.x, pt.y, 52, fluxDmg, 6.5, '#ff44aa'));
          break;
        }
      }
    }
  }

  handleDescentSpawning(dt) {
    this.descentWaveTimer -= dt;
    const waveCleared = this.descentWaveSpawned && this.enemies.length === 0;
    if (this.descentWaveSpawned && !waveCleared && this.descentWaveTimer <= 0) {
      this._triggerCrucibleCompression();
      return;
    }
    if (!this.descentWaveSpawned || waveCleared) {
      const phaseCfg = this.getActivePhaseConfig();
      const keyDef = this.getActiveFractureKeyDef();
      let descentAdvanced = false;
      if (waveCleared) {
        descentAdvanced = true;
        this._grantCrucibleWaveClearRewards(phaseCfg, keyDef);
      }

      this.descentWaveSpawned = true;
      this._descentWaveCompressed = false;
      const waveWindow = 14.0 + (Math.max(1, phaseCfg.phase || 1) - 1) * 3.0;
      this.descentWaveTimer = waveWindow;
      this.descentWaveMaxTimer = waveWindow;
      const depth = this.descentDepth;
      const lore5 = depth >= 5 ? this.queueTransmission('descent_depth_5') : false;
      const lore10 = depth >= 10 ? this.queueTransmission('descent_depth_10') : false;
      const unlockedDescentFeats = (descentAdvanced || depth >= 5)
        ? this._evaluateRunAchievements({ descentDepth: depth, forceEvent: true })
        : [];
      const ab = this.getActiveArenaBounds();
      const count = Math.min(32, Math.round((6 + Math.min(20, depth * 2)) * (keyDef?.packMult || 1)));
      const hpScaling = (18 + depth * 12) * Math.pow(1.16, Math.max(0, depth - 1));
      const dmgScaling = (1.15 + depth * 0.14) * Math.pow(1.045, Math.max(0, depth - 1));
      const speedScaling = Math.min(200, 65 + depth * 4.5);
      const pool = depth >= 3
        ? ['grunt', 'rogue', 'brute', 'ranger', 'sentinel', 'wraith', 'shieldbearer', 'slime', 'artillery', 'kamikaze', 'commander']
        : ['grunt', 'rogue', 'brute', 'ranger', 'sentinel', 'wraith', 'shieldbearer', 'slime'];

      const camZoom = Math.max(0.70, Math.min(1.0, (this.camera && Number.isFinite(this.camera.zoom)) ? this.camera.zoom : 1.0));
      const eliteMult = keyDef?.eliteMult || 1;
      let spawnedWarden = null;
      for (let i = 0; i < count; i++) {
        const ang = ((Math.PI * 2) / count) * i + this.rng() * 0.2;
        const dist = (520 + this.rng() * 340) / camZoom;
        const isBoss = (depth % 5 === 0 && i === 0);
        const isElite = !isBoss && depth >= 2 && (Math.floor((i + 4) * 0.20 * eliteMult) > Math.floor((i + 3) * 0.20 * eliteMult));
        const type = isBoss ? 'commander' : pool[Math.floor(this.rng() * pool.length)];
        const en = this._spawnCrucibleEnemy(
          this.player.x + Math.cos(ang) * dist,
          this.player.y + Math.sin(ang) * dist,
          ab,
          {
            hpScaling,
            speedScaling: speedScaling * (isBoss ? 1.15 : (isElite ? 0.9 : 1)),
            dmgScaling,
            damageMult: isBoss ? 1.35 : 1.0,
            isBoss,
            isElite,
            type,
            clearance: isBoss ? 86 : 62
          }
        );
        if (isBoss) {
          en.bossKit = depth % 10 === 0 ? 'architect' : 'storm';
          en.hasDirectionalArmor = true;
          en.isCrucibleWarden = true;
          this._bossFightActive = true;
          this._bossFightHullDamaged = false;
          this._bossFightStartedAt = this.runTime || 0;
          spawnedWarden = en;
        }
      }

      if (spawnedWarden) {
        const wardenCol = depth % 10 === 0 ? '#ffd700' : '#ff2266';
        this.phasingTimer = Math.max(this.phasingTimer || 0, 0.65);
        this.triggerSignalCut('warden', wardenCol, 0.34, `WARDEN DEPTH ${depth}`, { depth, isBossWave: true });
        this._pushShockwave({
          x: spawnedWarden.x,
          y: spawnedWarden.y,
          r: Math.max(20, spawnedWarden.radius || 28),
          maxR: 220,
          color: wardenCol,
          life: 0.48,
          maxLife: 0.48
        }, true);
        this.warpArrivalPulse = {
          x: spawnedWarden.x,
          y: spawnedWarden.y,
          color: wardenCol,
          timer: 0.85,
          maxTimer: 0.85,
          isThreat: true
        };
        if (keyDef?.id === 'twin_wardens' && depth % 5 === 0) {
          const twinAng = Math.atan2(spawnedWarden.y - this.player.y, spawnedWarden.x - this.player.x) + Math.PI * 0.65;
          const twinDist = (520 + this.rng() * 300) / camZoom;
          this._spawnCrucibleEnemy(
            this.player.x + Math.cos(twinAng) * twinDist,
            this.player.y + Math.sin(twinAng) * twinDist,
            ab,
            {
              hpScaling: hpScaling * 2.625,
              speedScaling: speedScaling * 0.92,
              dmgScaling,
              damageMult: 1.10,
              isBoss: false,
              isElite: true,
              type: 'commander',
              clearance: 72,
              margin: 72,
              forceEliteMods: Math.max(1, phaseCfg.eliteMods || 1)
            }
          );
        }
      }

      if (keyDef?.id === 'volatile_flux') {
        this._spawnCrucibleVolatileFluxPools(depth, phaseCfg, ab);
      }

      this.setBanner(
        `SINGULARITY DEPTH ${depth}`,
        depth % 5 === 0 ? 'WARDEN WAVE INBOUND' : 'ELIMINATE ALL HOSTILES',
        '#ff00ff',
        3.8,
        2,
        false
      );
      if (depth % 5 === 0 && !lore5 && !lore10 && (!unlockedDescentFeats || unlockedDescentFeats.length === 0)) {
        this.queueSignalEcho('crucible_warden', { depth });
      }
    }
  }

  _pointToSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq)) : 0;
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  spawnBossTelegraph(spec) {
    if (!spec || !spec.boss || spec.boss.markedForDeletion || spec.boss.hp <= 0) return null;
    this.bossTelegraphs = this.bossTelegraphs || [];
    if (this.bossTelegraphs.length >= 20) this.bossTelegraphs.shift();
    const tg = {
      kind: spec.kind || 'circle',
      boss: spec.boss,
      x: spec.x ?? spec.boss.x,
      y: spec.y ?? spec.boss.y,
      tx: spec.tx ?? spec.x ?? spec.boss.x,
      ty: spec.ty ?? spec.y ?? spec.boss.y,
      radius: spec.radius || 155,
      innerRadius: spec.innerRadius || 0,
      angle: spec.angle || 0,
      length: spec.length || 520,
      width: spec.width || 38,
      duration: Math.max(0.25, spec.duration || 0.95),
      elapsed: 0,
      damage: Math.max(5, spec.damage || spec.boss.damage || 30),
      dashDuration: spec.dashDuration || 0.34,
      color: spec.color || spec.boss.baseColor || '#ff3366',
      statusEffect: spec.statusEffect || null,
      exposeOnMiss: Boolean(spec.exposeOnMiss),
      exposeOnInside: Boolean(spec.exposeOnInside),
      burstCount: spec.burstCount || 0,
      acidPool: Boolean(spec.acidPool)
    };
    if (tg.kind === 'line_dash' || tg.kind === 'line_beam') {
      spec.boss._bossLockHeading = Math.max(spec.boss._bossLockHeading || 0, tg.duration);
      spec.boss.facingAngle = tg.angle;
    }
    this.bossTelegraphs.push(tg);
    if (typeof NeonAudio !== 'undefined' && NeonAudio.playBossTelegraph) {
      NeonAudio.playBossTelegraph(tg.kind === 'teleport_rift' ? 'teleport' : 'attack');
    }
    return tg;
  }

  updateBossTelegraphs(dt, stats) {
    if (!this.bossTelegraphs || this.bossTelegraphs.length === 0) return;
    const pRadius = (this.player && this.player.radius) ? this.player.radius : 12;
    for (let i = this.bossTelegraphs.length - 1; i >= 0; i--) {
      const tg = this.bossTelegraphs[i];
      if (!tg || !tg.boss || tg.boss.markedForDeletion || tg.boss.hp <= 0) {
        this.bossTelegraphs.splice(i, 1);
        continue;
      }
      tg.elapsed += dt;
      if (tg.kind === 'teleport_rift' && tg.elapsed < tg.duration) {
        if (this.particles && Math.random() < 0.35) {
          const sa = Math.random() * Math.PI * 2;
          this._pushParticle(tg.tx + Math.cos(sa) * 32, tg.ty + Math.sin(sa) * 32, tg.color, false);
        }
        continue;
      }
      if (tg.elapsed < tg.duration) continue;

      const boss = tg.boss;
      if (tg.kind === 'teleport_rift') {
        boss.x = tg.tx;
        boss.y = tg.ty;
        boss.kbX = 0;
        boss.kbY = 0;
        boss._bossDash = null;
        boss._activeDashMeta = null;
        boss._bossLockHeading = 0;
        if (this.world && this.world.resolveCircleWalls) this.world.resolveCircleWalls(boss);
        if (this.world && this.world.resolveCircleChasms) this.world.resolveCircleChasms(boss, boss.type === 'wraith');
        boss.facingAngle = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
        const arrivalDist = Math.hypot(this.player.x - boss.x, this.player.y - boss.y);
        if (arrivalDist <= 95 + pRadius) {
          this.handleDamageTaken(tg.damage, stats, { sourceEnemy: boss });
        }
        if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
          this.floatingTexts.push(new FloatingText(boss.x, boss.y - 44, 'PHASE SHIFT!', tg.color, 1.15, 1.3));
        }
        if (this.particles) {
          for (let k = 0; k < 12; k++) this._pushParticle(boss.x, boss.y, tg.color, false);
        }
      } else if (tg.kind === 'circle') {
        const dist = Math.hypot(this.player.x - tg.x, this.player.y - tg.y);
        if (dist <= tg.radius + pRadius * 0.7) {
          this.handleDamageTaken(tg.damage, stats, { sourceEnemy: boss });
          if (tg.statusEffect === 'chill') {
            this.playerInfusionChillTimer = Math.max(this.playerInfusionChillTimer || 0, 2.2);
          }
        } else if (tg.exposeOnMiss) {
          boss.exposedTimer = Math.max(boss.exposedTimer || 0, 2.0);
          if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
            this.floatingTexts.push(new FloatingText(boss.x, boss.y - 44, 'DODGED! EXPOSED!', '#00ffaa', 1.15, 1.5));
          }
          this._emitCounterplayShockwave(boss, 155, 0.36);
        }
        if (tg.burstCount > 0) {
          for (let k = 0; k < tg.burstCount; k++) {
            const a = ((Math.PI * 2) / tg.burstCount) * k;
            this.enemyProjectiles.push(new EnemyProjectile(tg.x, tg.y, Math.cos(a) * 260, Math.sin(a) * 260, tg.damage * 0.55, false, 0, 0, 7, tg.color, 900));
          }
        }
        if (tg.acidPool && typeof EnemyAcidPool !== 'undefined' && this.enemyAcidPools.length < 24) {
          this.enemyAcidPools.push(new EnemyAcidPool(tg.x, tg.y, Math.min(115, tg.radius * 0.68), tg.damage * 0.42, 5.5, '#00ff66'));
        }
        if (this.particles) {
          for (let k = 0; k < 10; k++) this._pushParticle(tg.x, tg.y, tg.color, false);
        }
        this.triggerShake(5, 0.16);
      } else if (tg.kind === 'ring_donut') {
        const dist = Math.hypot(this.player.x - tg.x, this.player.y - tg.y);
        if (dist >= tg.innerRadius && dist <= tg.radius) {
          this.handleDamageTaken(tg.damage, stats, { sourceEnemy: boss });
          if (tg.statusEffect === 'chill') {
            this.playerInfusionChillTimer = Math.max(this.playerInfusionChillTimer || 0, 2.4);
          }
        } else if (tg.exposeOnInside && dist < tg.innerRadius) {
          boss.exposedTimer = Math.max(boss.exposedTimer || 0, 2.0);
          if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
            this.floatingTexts.push(new FloatingText(boss.x, boss.y - 44, 'INSIDE SAFE RING! EXPOSED!', '#00ffaa', 1.15, 1.5));
          }
          this._emitCounterplayShockwave(boss, 165, 0.38);
        }
        if (this.particles) {
          for (let k = 0; k < 14; k++) {
            const a = ((Math.PI * 2) / 14) * k;
            const rr = (tg.innerRadius + tg.radius) * 0.5;
            this._pushParticle(tg.x + Math.cos(a) * rr, tg.y + Math.sin(a) * rr, tg.color, false);
          }
        }
        this.triggerShake(5, 0.16);
      } else if (tg.kind === 'line_beam') {
        const ex = tg.x + Math.cos(tg.angle) * tg.length;
        const ey = tg.y + Math.sin(tg.angle) * tg.length;
        const pDist = this._pointToSegDist(this.player.x, this.player.y, tg.x, tg.y, ex, ey);
        if (pDist <= (tg.width * 0.5) + pRadius * 0.45) {
          this.handleDamageTaken(tg.damage, stats, { sourceEnemy: boss });
        }
        if (typeof Lightning !== 'undefined') {
          this.lightnings.push(new Lightning(tg.x, tg.y, ex, ey, tg.color, true));
        }
        if (this.particles) {
          for (let k = 1; k <= 5; k++) {
            const frac = k / 6;
            this._pushParticle(tg.x + (ex - tg.x) * frac, tg.y + (ey - tg.y) * frac, tg.color, false);
          }
        }
        this.triggerShake(4, 0.14);
      } else if (tg.kind === 'line_dash') {
        const dashDur = tg.dashDuration || 0.34;
        const dashSpeed = (tg.length || 440) / dashDur;
        const dashObj = {
          vx: Math.cos(tg.angle) * dashSpeed,
          vy: Math.sin(tg.angle) * dashSpeed,
          timer: dashDur,
          damage: tg.damage,
          hitPlayer: false
        };
        boss._bossDash = dashObj;
        boss._activeDashMeta = dashObj;
        boss._bossLockHeading = dashDur;
        boss.facingAngle = tg.angle;
      }

      this.bossTelegraphs.splice(i, 1);
    }
  }

  _triggerBossPhaseShift(boss, spec) {
    if (!boss || !spec) return false;
    if (spec.flag) boss[spec.flag] = true;
    if (Number.isFinite(spec.speedMult) && spec.speedMult > 0) {
      boss.baseSpeed = (boss.baseSpeed || 0) * spec.speedMult;
    }
    if (spec.recolor) {
      boss.color = spec.recolor;
      boss.baseColor = spec.recolor;
    }

    const haltDur = Math.max(0.35, Math.min(0.45, Number(spec.haltDur) || 0.38));
    boss._phaseShiftTimer = Math.max(boss._phaseShiftTimer || 0, haltDur);
    boss._bossDash = null;
    boss._activeDashMeta = null;
    boss._bossLockHeading = 0;
    boss.kbX = 0;
    boss.kbY = 0;

    if (Array.isArray(this.bossTelegraphs)) {
      for (let i = this.bossTelegraphs.length - 1; i >= 0; i--) {
        const tg = this.bossTelegraphs[i];
        if (!tg || tg.boss === boss) {
          this.bossTelegraphs.splice(i, 1);
        }
      }
    }

    if (Array.isArray(this.enemyProjectiles) && this.player && Number.isFinite(this.player.x) && Number.isFinite(this.player.y)) {
      const px = this.player.x;
      const py = this.player.y;
      for (let i = 0; i < this.enemyProjectiles.length; i++) {
        const ep = this.enemyProjectiles[i];
        if (!ep || ep.markedForDeletion) continue;
        if (Math.hypot((ep.x || 0) - px, (ep.y || 0) - py) <= 240) {
          ep.markedForDeletion = true;
        }
      }
    }

    this.phasingTimer = Math.max(this.phasingTimer || 0, 0.50);

    const fxCol = spec.cutColor || spec.recolor || boss.baseColor || '#ff3366';
    const baseR = Math.max(20, boss.radius || 28);
    this._pushShockwave({
      x: boss.x,
      y: boss.y,
      r: baseR,
      maxR: baseR + 180,
      color: fxCol,
      life: 0.42,
      maxLife: 0.42
    }, true);
    this._pushShockwave({
      x: boss.x,
      y: boss.y,
      r: Math.max(12, baseR * 0.6),
      maxR: baseR + 280,
      color: '#ffffff',
      life: 0.56,
      maxLife: 0.56
    }, true);

    this.triggerSignalCut('phase', fxCol, spec.cutDur || 0.34, spec.cutLabel || 'PHASE SHIFT', {
      bossPhase: spec.audioPhase || 2,
      isArchitect: Boolean(boss.isArchitectBoss)
    });
    if (spec.transmissionId) {
      this.queueTransmission(spec.transmissionId);
    }
    if (Number.isFinite(spec.shakeIntensity) && Number.isFinite(spec.shakeDuration)) {
      this.triggerShake(spec.shakeIntensity, spec.shakeDuration);
    }
    if (typeof NeonAudio !== 'undefined' && typeof NeonAudio.playPhaseShift === 'function') {
      NeonAudio.playPhaseShift(spec.audioPhase || 2);
    }
    if (spec.floatText && typeof FloatingText !== 'undefined' && this.floatingTexts) {
      this.floatingTexts.push(new FloatingText(
        boss.x,
        boss.y - (spec.floatOffsetY || 52),
        spec.floatText,
        spec.floatColor || fxCol,
        spec.floatScale || 1.25,
        spec.floatDur || 1.8
      ));
    }
    return true;
  }

  updateBossMechanics(dt, e, stats) {
    if (!e || !e.isBoss || e.retreatingForBoss || e.markedForDeletion || e.hp <= 0) return;

    e._bossUptime = (e._bossUptime || 0) + dt;
    if (e._bossActionTimer > 0) e._bossActionTimer = Math.max(0, e._bossActionTimer - dt);
    if (e._bossTeleportCd > 0) e._bossTeleportCd = Math.max(0, e._bossTeleportCd - dt);
    if (e._bossPylonCd > 0) e._bossPylonCd = Math.max(0, e._bossPylonCd - dt);
    if ((e._phaseShiftTimer || 0) > 0) e._phaseShiftTimer = Math.max(0, e._phaseShiftTimer - dt);

    // Keep active pylon count strictly synced to live minions
    let livePylons = 0;
    for (const oe of this.enemies) {
      if (oe && oe.isBossPylon && oe.parentBoss === e && !oe.markedForDeletion && oe.hp > 0) {
        livePylons++;
      }
    }
    e._activePylonCount = livePylons;

    // Handle active Boss Dash: Neon Wall Slam vs Player hit vs Dodged Exposure
    const pRadius = (this.player && this.player.radius) ? this.player.radius : 12;
    if (e._bossDash) {
      let slammedWall = Boolean(e._hitWallThisTick);
      e._hitWallThisTick = false;
      if (this.world && this.world.resolveCircleWalls && this.world.resolveCircleWalls(e)) {
        slammedWall = true;
      }
      if (this.world && this.world.resolveCircleChasms) {
        this.world.resolveCircleChasms(e, false);
      }
      if (slammedWall) {
        e._bossDash = null;
        e._activeDashMeta = null;
        e._bossLockHeading = 0;
        e.kbX = 0;
        e.kbY = 0;
        const slamDmg = Math.max(20, e.maxHp * 0.08);
        e.takeDamage(slamDmg, { bypassPylonShield: true });
        e.exposedTimer = Math.max(e.exposedTimer || 0, 3.0);
        if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
          this.floatingTexts.push(new FloatingText(e.x, e.y - 48, 'WALL SLAM! -8% HP • EXPOSED!', '#00ffaa', 1.3, 1.9));
        }
        this._emitCounterplayShockwave(e, 210, 0.44);
        if (typeof NeonAudio !== 'undefined' && NeonAudio.playBossTelegraph) NeonAudio.playBossTelegraph('slam');
        this.triggerShake(8, 0.25);
        if (this.particles) {
          for (let k = 0; k < 14; k++) this._pushParticle(e.x, e.y, '#00ffaa', false);
        }
        if (e.hp <= 0 && !e.markedForDeletion) {
          e.markedForDeletion = true;
          this.processEnemyDeath(e, stats);
        }
        return;
      }
      const pd = Math.hypot(this.player.x - e.x, this.player.y - e.y);
      if (!e._bossDash.hitPlayer && pd <= e.radius + pRadius + 8) {
        e._bossDash.hitPlayer = true;
        this.handleDamageTaken(e._bossDash.damage, stats, { sourceEnemy: e });
      }
      e._bossDash.timer -= dt;
      if (e._bossDash.timer <= 0) {
        if (!e._bossDash.hitPlayer) {
          e.exposedTimer = Math.max(e.exposedTimer || 0, 1.8);
          if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
            this.floatingTexts.push(new FloatingText(e.x, e.y - 42, 'DODGED! EXPOSED!', '#00ffaa', 1.1, 1.4));
          }
          this._emitCounterplayShockwave(e, 155, 0.36);
        }
        e._bossDash = null;
        e._activeDashMeta = null;
        e._bossLockHeading = 0;
      }
      return;
    } else if (e._activeDashMeta) {
      const pd = Math.hypot(this.player.x - e.x, this.player.y - e.y);
      if (!e._activeDashMeta.hitPlayer && pd <= e.radius + pRadius + 8) {
        e._activeDashMeta.hitPlayer = true;
        this.handleDamageTaken(e._activeDashMeta.damage, stats, { sourceEnemy: e });
      }
      if (!e._activeDashMeta.hitPlayer) {
        e.exposedTimer = Math.max(e.exposedTimer || 0, 1.8);
        if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
          this.floatingTexts.push(new FloatingText(e.x, e.y - 42, 'DODGED! EXPOSED!', '#00ffaa', 1.1, 1.4));
        }
        this._emitCounterplayShockwave(e, 155, 0.36);
      }
      e._activeDashMeta = null;
      e._bossLockHeading = 0;
    }

    // Phase Transitions (Architect 3-Phase / Other Bosses 50% Overdrive Enrage)
    if (e.isArchitectBoss) {
      if (e.hp <= e.maxHp * 0.65 && !e._enteredPhase2) {
        this._triggerBossPhaseShift(e, {
          flag: '_enteredPhase2',
          speedMult: 1.18,
          recolor: '#ffd700',
          haltDur: 0.38,
          cutColor: '#ffd700',
          cutDur: 0.34,
          cutLabel: 'PHASE II: OVERDRIVE',
          transmissionId: 'architect_phase2',
          shakeIntensity: 9,
          shakeDuration: 0.35,
          audioPhase: 2,
          floatText: 'ARCHITECT PHASE II: OVERDRIVE!',
          floatColor: '#ffd700',
          floatScale: 1.3,
          floatDur: 1.9,
          floatOffsetY: 54
        });
      }
      if (e.hp <= e.maxHp * 0.30 && !e._bossEnraged) {
        this._triggerBossPhaseShift(e, {
          flag: '_bossEnraged',
          speedMult: 1.16,
          recolor: '#ff00ff',
          haltDur: 0.42,
          cutColor: '#ff00ff',
          cutDur: 0.38,
          cutLabel: 'PHASE III: SINGULARITY',
          transmissionId: 'architect_phase3',
          shakeIntensity: 10,
          shakeDuration: 0.4,
          audioPhase: 3,
          floatText: 'ARCHITECT PHASE III: SINGULARITY!',
          floatColor: '#ff00ff',
          floatScale: 1.35,
          floatDur: 2.0,
          floatOffsetY: 56
        });
      }
    } else if (e.hp <= e.maxHp * 0.50 && !e._bossEnraged) {
      this._triggerBossPhaseShift(e, {
        flag: '_bossEnraged',
        speedMult: 1.22,
        recolor: null,
        haltDur: 0.36,
        cutColor: e.baseColor || '#ff3366',
        cutDur: 0.32,
        cutLabel: 'APEX OVERDRIVE',
        transmissionId: null,
        shakeIntensity: 6,
        shakeDuration: 0.22,
        audioPhase: 2,
        floatText: 'APEX OVERDRIVE!',
        floatColor: '#ff3366',
        floatScale: 1.25,
        floatDur: 1.7,
        floatOffsetY: 48
      });
    }

    if ((e._phaseShiftTimer || 0) > 0) return;
    if (e.status.frozen > 0 || e.status.petrified > 0) return;

    const kit = e.bossKit || (e.isArchitectBoss ? 'architect' : (e.monolithElement || e.type || 'brute'));
    const kitColor = e.baseColor || '#ff3366';
    const hasPendingTelegraph = this.bossTelegraphs && this.bossTelegraphs.some(tg => tg && tg.boss === e);
    const dx = this.player.x - e.x;
    const dy = this.player.y - e.y;
    const dist = Math.hypot(dx, dy);
    const angToPlayer = Math.atan2(dy, dx);
    const ab = this.getActiveArenaBounds();

    // Anti-Kite Phase Teleport when player kites too far away
    if (!hasPendingTelegraph && (e._bossTeleportCd || 0) <= 0 && dist > 620) {
      const flankSign = ((e._bossActionStep || 0) % 2 === 0) ? 1 : -1;
      const landAng = angToPlayer + flankSign * 0.35;
      const jumpDist = 200;
      const tmp = {
        x: Math.max(ab.minX + 70, Math.min(ab.maxX - 70, this.player.x - Math.cos(landAng) * jumpDist)),
        y: Math.max(ab.minY + 70, Math.min(ab.maxY - 70, this.player.y - Math.sin(landAng) * jumpDist)),
        radius: e.radius
      };
      if (this.world && this.world.resolveCircleWalls) this.world.resolveCircleWalls(tmp);
      if (this.world && this.world.resolveCircleChasms) this.world.resolveCircleChasms(tmp, e.type === 'wraith');
      this.spawnBossTelegraph({
        kind: 'teleport_rift',
        boss: e,
        tx: tmp.x,
        ty: tmp.y,
        duration: 0.72,
        damage: e.damage * 0.85,
        color: kitColor
      });
      e._bossTeleportCd = e._bossEnraged ? 5.2 : 7.0;
      return;
    }

    // Resonance Aegis Pylon Deployment
    const pylonDelay = e.isArchitectBoss ? 2.5 : 5.2;
    if ((e._bossUptime || 0) >= pylonDelay && (e._bossPylonCd || 0) <= 0 && e._activePylonCount === 0 && (e._pylonsSummoned || 0) < 2 && (!e.isArchitectBoss || e._enteredPhase2) && this.enemies.length < 135) {
      let spawned = 0;
      const perp = angToPlayer + Math.PI / 2;
      for (const side of [-1, 1]) {
        const px = Math.max(ab.minX + 60, Math.min(ab.maxX - 60, e.x + Math.cos(perp) * 175 * side));
        const py = Math.max(ab.minY + 60, Math.min(ab.maxY - 60, e.y + Math.sin(perp) * 175 * side));
        const pylon = new Enemy(px, py, Math.max(85, e.maxHp * 0.14), 0, false, false, 'sentinel');
        pylon.isBossPylon = true;
        pylon.parentBoss = e;
        pylon.isBoss = false;
        pylon.isElite = false;
        pylon.type = 'pylon';
        pylon.radius = 22;
        pylon.hp = Math.max(85, e.maxHp * 0.14);
        pylon.maxHp = pylon.hp;
        pylon.baseSpeed = 0;
        pylon.rawSpeed = 0;
        pylon.damage = 0;
        pylon.color = '#00ffff';
        pylon.baseColor = '#00ffff';
        pylon.aggroed = true;
        if (this.world && this.world.resolveCircleWalls) this.world.resolveCircleWalls(pylon);
        this.enemies.push(pylon);
        spawned++;
      }
      e._activePylonCount = spawned;
      e._pylonsSummoned = (e._pylonsSummoned || 0) + 1;
      e._bossPylonCd = 24.0;
      if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
        this.floatingTexts.push(new FloatingText(e.x, e.y - 52, 'AEGIS PYLONS DEPLOYED!', '#00ffff', 1.2, 1.7));
      }
    }

    // Architect Phase II+ occasional construct summons
    if (e.isArchitectBoss && e._enteredPhase2) {
      e._archSummonTimer = (e._archSummonTimer ?? 7.0) - dt;
      if (e._archSummonTimer <= 0 && this.enemies.length < 135) {
        e._archSummonTimer = e._bossEnraged ? 7.5 : 10.0;
        for (let s = 0; s < 2; s++) {
          const sa = angToPlayer + (s === 0 ? -0.9 : 0.9);
          const construct = new Enemy(e.x + Math.cos(sa) * 105, e.y + Math.sin(sa) * 105, Math.max(40, e.maxHp * 0.045), 125, false, s === 0, s === 0 ? 'sentinel' : 'rogue');
          construct.aggroed = true;
          this.applyPhaseAndModifiersToEnemy(construct, s === 0 ? 1 : 0);
          if (this.world && this.world.resolveCircleWalls) this.world.resolveCircleWalls(construct);
          this.enemies.push(construct);
        }
      }
    }

    if (hasPendingTelegraph || (e._bossActionTimer || 0) > 0) return;

    e._bossActionStep = (e._bossActionStep || 0) + 1;
    const step = e._bossActionStep;
    const cd = kit === 'architect' ? (e._bossEnraged ? 1.8 : 2.35) : (e._bossEnraged ? 2.1 : 2.85);
    e._bossActionTimer = cd;

    const fireFan = (count, spread, speed, projDmgMult = 0.62) => {
      for (let k = 0; k < count; k++) {
        const offset = count === 1 ? 0 : ((k / (count - 1)) - 0.5) * spread;
        const a = angToPlayer + offset;
        this.enemyProjectiles.push(new EnemyProjectile(e.x, e.y, Math.cos(a) * speed, Math.sin(a) * speed, e.damage * projDmgMult, false, 0, 0, 7, kitColor, 1100));
      }
    };

    if (kit === 'architect') {
      const m = step % 4;
      if (m === 1) {
        for (const off of [-0.24, 0, 0.24]) {
          this.spawnBossTelegraph({ kind: 'line_beam', boss: e, angle: angToPlayer + off, length: 640, width: 32, duration: 0.9, damage: e.damage * 1.15, color: kitColor });
        }
      } else if (m === 2) {
        this.spawnBossTelegraph({ kind: 'ring_donut', boss: e, innerRadius: 135, radius: 345, duration: 1.05, damage: e.damage * 1.25, color: kitColor, exposeOnInside: true });
      } else if (m === 3) {
        this.spawnBossTelegraph({ kind: 'line_dash', boss: e, angle: angToPlayer, length: 460, width: 52, duration: 0.85, dashDuration: 0.34, damage: e.damage * 1.35, color: kitColor });
      } else {
        this.spawnBossTelegraph({ kind: 'circle', boss: e, x: e.x, y: e.y, radius: 195, duration: 1.0, damage: e.damage * 1.2, color: kitColor, burstCount: e._enteredPhase2 ? 12 : 8, exposeOnMiss: true });
      }
    } else if (kit === 'earth' || kit === 'golem' || kit === 'brute' || kit === 'shieldbearer') {
      const m = step % 3;
      if (m === 1) {
        this.spawnBossTelegraph({ kind: 'line_dash', boss: e, angle: angToPlayer, length: 450, width: 54, duration: 0.88, dashDuration: 0.35, damage: e.damage * 1.4, color: kitColor });
      } else if (m === 2) {
        this.spawnBossTelegraph({ kind: 'circle', boss: e, x: e.x, y: e.y, radius: 185, duration: 0.95, damage: e.damage * 1.3, color: kitColor, exposeOnMiss: true });
      } else {
        this.spawnBossTelegraph({ kind: 'ring_donut', boss: e, innerRadius: 135, radius: 330, duration: 1.05, damage: e.damage * 1.2, color: kitColor, exposeOnInside: true });
      }
    } else if (kit === 'frost') {
      const m = step % 3;
      if (m === 1) {
        this.spawnBossTelegraph({ kind: 'ring_donut', boss: e, innerRadius: 135, radius: 340, duration: 1.0, damage: e.damage * 1.15, color: '#44ddff', statusEffect: 'chill', exposeOnInside: true });
      } else if (m === 2) {
        this.spawnBossTelegraph({ kind: 'line_beam', boss: e, angle: angToPlayer, length: 620, width: 38, duration: 0.88, damage: e.damage * 1.15, color: '#44ddff' });
      } else {
        this.spawnBossTelegraph({ kind: 'line_dash', boss: e, angle: angToPlayer, length: 420, width: 46, duration: 0.85, dashDuration: 0.32, damage: e.damage * 1.2, color: '#44ddff' });
      }
    } else if (kit === 'storm') {
      const m = step % 3;
      if (m === 1) {
        for (const off of [-0.18, 0.18]) {
          this.spawnBossTelegraph({ kind: 'line_beam', boss: e, angle: angToPlayer + off, length: 640, width: 32, duration: 0.85, damage: e.damage * 1.15, color: '#ffdd00' });
        }
      } else if (m === 2) {
        this.spawnBossTelegraph({ kind: 'line_dash', boss: e, angle: angToPlayer, length: 470, width: 44, duration: 0.8, dashDuration: 0.3, damage: e.damage * 1.25, color: '#ffdd00' });
      } else {
        fireFan(5, 0.75, 290, 0.55);
        this.spawnBossTelegraph({ kind: 'circle', boss: e, x: this.player.x, y: this.player.y, radius: 135, duration: 0.95, damage: e.damage * 1.15, color: '#ffdd00', exposeOnMiss: true });
      }
    } else if (kit === 'fire') {
      const m = step % 3;
      if (m === 1) {
        this.spawnBossTelegraph({ kind: 'circle', boss: e, x: this.player.x, y: this.player.y, radius: 155, duration: 0.92, damage: e.damage * 1.25, color: '#ff5500', burstCount: 8, exposeOnMiss: true });
      } else if (m === 2) {
        this.spawnBossTelegraph({ kind: 'line_beam', boss: e, angle: angToPlayer, length: 600, width: 42, duration: 0.88, damage: e.damage * 1.2, color: '#ff5500' });
      } else {
        this.spawnBossTelegraph({ kind: 'line_dash', boss: e, angle: angToPlayer, length: 440, width: 48, duration: 0.85, dashDuration: 0.33, damage: e.damage * 1.3, color: '#ff5500' });
      }
    } else if (kit === 'toxin' || kit === 'hive') {
      const m = step % 3;
      if (m === 1) {
        this.spawnBossTelegraph({ kind: 'circle', boss: e, x: this.player.x, y: this.player.y, radius: 145, duration: 0.92, damage: e.damage * 1.15, color: '#00ff66', acidPool: true, exposeOnMiss: true });
      } else if (m === 2) {
        fireFan(5, 0.85, 245, 0.52);
        this.spawnBossTelegraph({ kind: 'ring_donut', boss: e, innerRadius: 135, radius: 320, duration: 1.0, damage: e.damage * 1.15, color: '#00ff66', exposeOnInside: true });
      } else {
        this.spawnBossTelegraph({ kind: 'line_dash', boss: e, angle: angToPlayer, length: 410, width: 44, duration: 0.86, dashDuration: 0.34, damage: e.damage * 1.2, color: '#00ff66' });
      }
    } else if (kit === 'holy' || kit === 'sentinel') {
      const m = step % 3;
      if (m === 1) {
        this.spawnBossTelegraph({ kind: 'line_beam', boss: e, angle: angToPlayer, length: 640, width: 34, duration: 0.88, damage: e.damage * 1.2, color: '#ffeeaa' });
        this.spawnBossTelegraph({ kind: 'line_beam', boss: e, angle: angToPlayer + Math.PI / 2, length: 560, width: 34, duration: 0.88, damage: e.damage * 1.1, color: '#ffeeaa' });
      } else if (m === 2) {
        this.spawnBossTelegraph({ kind: 'ring_donut', boss: e, innerRadius: 135, radius: 345, duration: 1.0, damage: e.damage * 1.2, color: '#ffeeaa', exposeOnInside: true });
      } else {
        this.spawnBossTelegraph({ kind: 'circle', boss: e, x: this.player.x, y: this.player.y, radius: 150, duration: 0.92, damage: e.damage * 1.2, color: '#ffeeaa', exposeOnMiss: true });
      }
    } else {
      // blood / commander / wraith / general Apex kits
      const m = step % 3;
      if (m === 1) {
        this.spawnBossTelegraph({ kind: 'line_dash', boss: e, angle: angToPlayer, length: 440, width: 48, duration: 0.84, dashDuration: 0.32, damage: e.damage * 1.3, color: kitColor });
      } else if (m === 2) {
        fireFan(5, 0.72, 265, 0.56);
        this.spawnBossTelegraph({ kind: 'line_beam', boss: e, angle: angToPlayer, length: 600, width: 36, duration: 0.9, damage: e.damage * 1.15, color: kitColor });
      } else {
        this.spawnBossTelegraph({ kind: 'circle', boss: e, x: e.x, y: e.y, radius: 180, duration: 0.95, damage: e.damage * 1.25, color: kitColor, burstCount: 6, exposeOnMiss: true });
      }
    }
  }

  handleSpawning(dt) {
    if (this.isDescentMode) {
        this.handleDescentSpawning(dt);
        return;
    }

    if (this.wavePauseTimer > 0) {
        this.wavePauseTimer -= dt;
        return;
    }

    if (this.bossPrelude) {
        return; // Dramatic silence before boss arrival
    }

    this.directorTimer = (this.directorTimer || 0) + dt;
    if (this.directorTimer >= 5.0) {
        const dpsStress = Math.min(50, (this.recentKills || 0) * 2); 
        const hpStress = Math.min(50, ((this.recentDamageTaken || 0) / (this.player.maxHp || 1)) * 100); 
        this.stressLevel = this.stressLevel ?? 50;
        if (hpStress > 30) this.stressLevel -= 20;
        else if (dpsStress > 30) this.stressLevel += 20;
        else this.stressLevel += 5;
        this.stressLevel = Math.max(0, Math.min(100, this.stressLevel));
        this.recentKills = 0;
        this.recentDamageTaken = 0;
        this.directorTimer = 0;
    }

    const directorMult = 0.85 + ((this.stressLevel ?? 50) / 100) * 0.30;
    const effectiveTime = this.runTime * directorMult;
    this.cocktailTimer -= dt;
    
    // Check if we can end the challenge phase early
    if (!this.isRelaxedPhase && this.specialEnemiesQuota <= 0) {
        const specialAlive = this.enemies.some(e => e.type !== 'grunt');
        if (!specialAlive) {
            this.isRelaxedPhase = true;
            this.currentCocktail = 'standard';
            this.cocktailTimer = 25.0;
        }
    }

    if (this.cocktailTimer <= 0) {
        this.isRelaxedPhase = !this.isRelaxedPhase;
        
        if (!this.isRelaxedPhase) {
            this.cocktailTimer = 35.0;
            const challenges = ['slime_tide'];
            if (effectiveTime >= 20) challenges.push('phalanx');
            if (effectiveTime >= 45) challenges.push('zerg');
            if (effectiveTime >= 75) challenges.push('sentinel_core');
            if (effectiveTime >= 110) challenges.push('assassin');
            if (effectiveTime >= 140) challenges.push('minefield');
            if (effectiveTime >= 180) challenges.push('vanguard');
            this.currentCocktail = challenges[Math.floor(Math.random() * challenges.length)];
            this.specialEnemiesQuota = 6 + Math.floor(effectiveTime / 25);
        } else {
            this.cocktailTimer = 25.0;
            this.currentCocktail = 'standard';
        }
    }

    // Seed nearby stationary world camps on first update and periodically as player explores
    if (!this._initialCampsPopulated) {
      this._initialCampsPopulated = true;
      if (this.world) this.populateNearbyWorldCamps();
    }
    this.ecologyTimer = (this.ecologyTimer || 0) + dt;
    if (this.ecologyTimer >= 0.6) {
      this.ecologyTimer = 0;
      if (this.world) this.populateNearbyWorldCamps();
    }

    // Recycle distant dormant (> 2,600 px) or far aggroed (> 3,200 px) non-boss enemies with hysteresis + cull distant XP orbs
    for (const en of this.enemies) {
      if (en.markedForDeletion) continue;
      const distToPlayer = Math.hypot(en.x - this.player.x, en.y - this.player.y);
      const recycleLimit = en.aggroed === false ? 2600 : 3200;
      if (!en.isBoss && !en.monolithElement && !en.isBossRetinue && distToPlayer > recycleLimit) {
        en.markedForDeletion = true;
        if (en.cellKey && this.populatedCells) {
          this.populatedCells.delete(en.cellKey);
        }
      } else if (en.isBoss && distToPlayer > 1800) {
        const pullAng = this.rng() * Math.PI * 2;
        const boundW = this.worldSize || this.canvas.width;
        const boundH = this.worldSize || this.canvas.height;
        en.x = Math.max(80, Math.min(boundW - 80, this.player.x + Math.cos(pullAng) * 650));
        en.y = Math.max(80, Math.min(boundH - 80, this.player.y + Math.sin(pullAng) * 650));
      }
    }
    if (this.xpOrbs && this.xpOrbs.length > 0) {
      for (const orb of this.xpOrbs) {
        if (!orb.markedForDeletion && Math.hypot(orb.x - this.player.x, orb.y - this.player.y) > 3000) {
          orb.markedForDeletion = true;
        }
      }
    }
  }

  handleCollisions(dt, stats) {
    const newProjectiles = [];
    const buildChildEffects = (srcEffects, extra = {}) => {
        const eff = { ...srcEffects, split: null, fork: null, rockShard: null, castOnCrit: null, orbiting: null, returnToSender: null, ...extra };
        return eff;
    };
    
    const bp = this._getBroadphase();

    // Projectiles hit Enemies
    for (let pi = 0; pi < this.projectiles.length; pi++) {
      const p = this.projectiles[pi];
      const hitCandidates = bp
        ? bp.queryRadiusInto(p.x, p.y, p.radius || 4, this._broadphaseProjScratch, true)
        : this.enemies;
      for (let ei = 0; ei < hitCandidates.length; ei++) {
        const e = hitCandidates[ei];
        const hitCountOnE = p.enemyHitCounts ? (p.enemyHitCounts.get(e) || 0) : 0;
        if (!e.markedForDeletion && !e.retreatingForBoss && !p.piercedEnemies.has(e) && hitCountOnE < 2) {
          const dist = Math.hypot(p.x - e.x, p.y - e.y);
          if (dist < p.radius + e.radius) {
            if (p.enemyHitCounts) p.enemyHitCounts.set(e, hitCountOnE + 1);
            const effectiveEl = (stats.specialEffects && stats.specialEffects.avatarOfFire) ? 'fire' : p.element;
            const dmgOpts = (stats.attributeMilestones && stats.attributeMilestones.dp50) ? { ignoreShieldAndResist: 0.25 } : null;
            const statusDurMult = (stats.attributeMilestones && stats.attributeMilestones.sr15) ? 1.30 : 1.0;

            let dmg = p.damage * (effectiveEl && effectiveEl !== 'none' ? this.getElemDamageMult(stats, effectiveEl) : 1.0);
            const defEl = e.biomeElement || e.monolithElement || e.biomeInfusion || null;
            if (typeof getElementalAffinityMultiplier === 'function') {
              const aff = getElementalAffinityMultiplier(effectiveEl, defEl, {
                penetration: stats.elementalPenetration || 0,
                resistShred: (e.resistShredTimer || 0) > 0 ? (e.resistShredAmount || 0.35) : 0
              });
              dmg *= aff.mult;
              if (aff.state !== 'neutral' && typeof FloatingText !== 'undefined' && this.floatingTexts && (this.runTime - (e._lastAffFloatAt || -5)) >= 1.15) {
                e._lastAffFloatAt = this.runTime;
                if (aff.state === 'weak') {
                  this.floatingTexts.push(new FloatingText(e.x, e.y - 34, 'WEAK!', '#ffee44', 1.0, 0.75));
                } else if (aff.state === 'resist') {
                  this.floatingTexts.push(new FloatingText(e.x, e.y - 32, 'RESIST', '#9aa8ba', 0.85, 0.65));
                }
              }
            }
            if (effectiveEl === 'holy') {
              e.holyMarkedTimer = Math.max(e.holyMarkedTimer || 0, 4.0 * statusDurMult);
            }
            const preBurning = Boolean(e.dots && e.dots.some(d => d.type === 'burn'));
            const preChillFreeze = Boolean((e.status && e.status.chilled > 0) || (e.status && e.status.frozen > 0));
            const preToxShock = Boolean((e.status && e.status.shocked > 0) || (e.dots && e.dots.some(d => d.type === 'poison')));

            const syn = stats.synergyBonuses || {};
            let condMult = 1.0;
            if (preBurning && syn.vsBurning > 0) condMult += syn.vsBurning;
            if (preChillFreeze && syn.vsChilled > 0) condMult += syn.vsChilled;
            if (preToxShock && syn.vsToxShock > 0) condMult += syn.vsToxShock;
            const eliteBoost = (syn.eliteSlayer || 0) + ((stats.attributeMilestones && stats.attributeMilestones.dp15) ? 0.15 : 0);
            if ((e.isElite || e.isBoss) && eliteBoost > 0) condMult += eliteBoost;
            dmg *= condMult;

            this.hitsLanded = (this.hitsLanded || 0) + 1;
            if (syn.kineticNovaEvery > 0 && this.hitsLanded % syn.kineticNovaEvery === 0) {
                this.triggerLocalKineticPulse(e.x, e.y, 95, stats.damage * 0.85, '#00eeff', stats);
            }
            if ((stats.socketedShardCount || 0) > 0 && this.hitsLanded % 6 === 0) {
                const domEl = stats.dominantShardElement || 'storm';
                const pulseBonus = (stats.elemBonuses && stats.elemBonuses[domEl]) || 0.07;
                const shardPulseColors = { fire: '#ff4422', frost: '#44aaff', storm: '#00eeff', toxin: '#33ff66', blood: '#ff0055', holy: '#ffee88', earth: '#cc8844' };
                this.triggerLocalKineticPulse(
                    e.x,
                    e.y,
                    76,
                    stats.damage * Math.min(0.42, 0.20 + pulseBonus * 0.35),
                    shardPulseColors[domEl] || '#00eeff',
                    stats
                );
            }
            
            // Check if shielded
            if (e.type === 'shieldbearer' && e.shieldCapacity > 0) {
                const angleToPlayer = Math.atan2(p.y - e.y, p.x - e.x);
                let angleDiff = Math.abs(angleToPlayer - e.shieldAngle);
                if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
                
                const spread = (Math.PI / 4) * e.shieldCapacity;
                if (angleDiff < spread) {
                    // Hit the shield!
                    e.shieldCapacity -= 0.15; // Breaks completely after ~7 hits
                    if (e.shieldCapacity < 0) e.shieldCapacity = 0;
                    dmg *= 0.15; // Only 15% damage penetrates the shield
                    
                    for (let i = 0; i < 5; i++) {
                        this._pushParticle(p.x, p.y, '#4444ff', false);
                    }
                    if (typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.playHitFeedback === 'function') {
                        NeonAudio.playHitFeedback('shield');
                    }
                }
            }

            // Directional Boss Armor: Front Aegis (0.65x when not Exposed) vs Rear Weakspot (1.60x)
            if (e.isBoss && e.hasDirectionalArmor && !e.markedForDeletion) {
                const hdx = p.x - e.x;
                const hdy = p.y - e.y;
                const hLen = Math.hypot(hdx, hdy);
                const pSpd = Math.hypot(p.vx || 0, p.vy || 0) || 1;
                const dirX = hLen > 1 ? hdx / hLen : -(p.vx || 0) / pSpd;
                const dirY = hLen > 1 ? hdy / hLen : -(p.vy || 0) / pSpd;
                const fx = Math.cos(e.facingAngle || 0);
                const fy = Math.sin(e.facingAngle || 0);
                const dot = dirX * fx + dirY * fy;
                if (dot >= 0.38 && (e.exposedTimer || 0) <= 0) {
                    dmg *= 0.65;
                    for (let i = 0; i < 3; i++) this._pushParticle(p.x, p.y, '#ffd700', false);
                    if (typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.playHitFeedback === 'function') {
                        NeonAudio.playHitFeedback('armor');
                    }
                } else if (dot <= -0.35) {
                    dmg *= 1.60;
                    for (let i = 0; i < 4; i++) this._pushParticle(p.x, p.y, '#00ffaa', false);
                    if (typeof FloatingText !== 'undefined' && this.floatingTexts && this.runTime - (e._weakspotFloatAt || -5) >= 0.9) {
                        e._weakspotFloatAt = this.runTime;
                        this.floatingTexts.push(new FloatingText(e.x, e.y - 38, 'WEAKSPOT x1.60!', '#00ffaa', 0.95, 0.8));
                    }
                    if (typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.playHitFeedback === 'function') {
                        NeonAudio.playHitFeedback('weakspot');
                    }
                } else if ((e.exposedTimer || 0) > 0) {
                    if (typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.playHitFeedback === 'function') {
                        NeonAudio.playHitFeedback('weakspot');
                    }
                }
            } else if (e.isBoss && !e.markedForDeletion && (e.exposedTimer || 0) > 0) {
                if (typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.playHitFeedback === 'function') {
                    NeonAudio.playHitFeedback('weakspot');
                }
            }

            // Crit logic
            let isCrit = false;
            if (Math.random() < stats.critChance) {
              isCrit = true;
              if (typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.playCrit === 'function') {
                NeonAudio.playCrit((p && p.element && p.element !== 'none') ? p.element : (this.currentSectorId || null));
              }
              if (stats.attributeMilestones && stats.attributeMilestones.sr30 && Math.random() < 0.18) {
                  this.currencyCollected += Math.round(2 * (stats.matterMult || 1));
              }
              if (stats.specialEffects.crimsonDance) {
                  if (stats.specialEffects.avatarOfFire) {
                      e.applyDot(dmg * 0.35 * stats.critMultiplier * (stats.burnDamageMult || 1.0) * this.getElemDamageMult(stats, 'fire'), 4.0 * statusDurMult, "burn");
                  } else {
                      const bloodMult = this.getElemDamageMult(stats, 'blood');
                      e.applyDot(dmg * 0.35 * stats.critMultiplier * bloodMult, 4.0 * statusDurMult, "bleed");
                      let bleedStacks = 0;
                      if (e.dots) {
                          for (let bi = 0; bi < e.dots.length; bi++) {
                              if (e.dots[bi].type === 'bleed') bleedStacks++;
                          }
                      }
                      if (bleedStacks >= 4 && (this.runTime - (e._lastRuptureAt ?? -10)) >= 0.35) {
                          e._lastRuptureAt = this.runTime;
                          e.takeDamage(dmg * 0.65 * stats.critMultiplier * bloodMult, dmgOpts);
                          if (this.particles && this.particles.length < 245) {
                              for (let ri = 0; ri < 5; ri++) this._pushParticle(e.x, e.y, '#ff0044', false);
                          }
                      }
                  }
              } else {
                  dmg *= stats.critMultiplier;
              }
              
              if (stats.specialEffects.castOnCrit && !p.isTriggered) {
                  let cocTarget = e;
                  let minCocDist = Infinity;
                  for (const oe of this.enemies) {
                      if (oe !== e && !oe.markedForDeletion) {
                          const cd = Math.hypot(oe.x - this.player.x, oe.y - this.player.y);
                          if (cd < minCocDist) {
                              minCocDist = cd;
                              cocTarget = oe;
                          }
                      }
                  }
                  const cocAngle = Math.atan2(cocTarget.y - this.player.y, cocTarget.x - this.player.x);
                  const cocStats = { ...stats, damage: stats.damage * 0.85, pierce: stats.pierce + 1, specialEffects: buildChildEffects(stats.specialEffects) };
                  const cocProj = new Projectile(this.player.x, this.player.y, Math.cos(cocAngle) * stats.projectileSpeed, Math.sin(cocAngle) * stats.projectileSpeed, cocStats, false, 0, this.getWeightedRandomElement(stats));
                  cocProj.isTriggered = true;
                  cocProj.willSplit = false;
                  newProjectiles.push(cocProj);
              }
              if (stats.specialEffects.thunderstrike) {
                  const isFireConv = Boolean(stats.specialEffects && stats.specialEffects.avatarOfFire);
                  const tsEl = this._resolveProcElement(stats, 'storm');
                  const tsElemMult = this.getElemDamageMult(stats, tsEl);
                  const tsColor = isFireConv ? '#ff6622' : '#00ffff';
                  this.lightnings.push(new Lightning(e.x, e.y - 500, e.x, e.y, tsColor));
                  dmg += stats.damage * 2 * tsElemMult;
                  for (let i = 0; i < 10; i++) this._pushParticle(e.x, e.y, tsColor, false);
                  const tsRange = 150 * this.getPulseRadiusMult(stats);
                  const tsList = bp
                    ? bp.queryRadiusInto(e.x, e.y, tsRange, this._broadphaseProcScratch, false)
                    : this.enemies;
                  for (let ti = 0; ti < tsList.length; ti++) {
                      const other = tsList[ti];
                      if (other !== e && !other.markedForDeletion && Math.hypot(other.x - e.x, other.y - e.y) < tsRange) {
                          this.lightnings.push(new Lightning(e.x, e.y, other.x, other.y, tsColor));
                          const tsArcDmg = stats.damage * 1.2 * tsElemMult;
                          if (isFireConv) {
                              const otherWasBurn = Boolean(other.dots && other.dots.some(d => d.type === 'burn'));
                              other.takeDamage(tsArcDmg, dmgOpts);
                              other.applyDot(Math.max(2, tsArcDmg * 0.6 * (stats.burnDamageMult || 1.0)), 3.0 * statusDurMult, "burn");
                              this._triggerThermalFlare(other, stats, otherWasBurn, dmgOpts);
                          } else {
                              other.takeDamage(tsArcDmg, dmgOpts);
                              other.status.shocked = Math.max(other.status.shocked || 0, 2.0 * statusDurMult);
                          }
                      }
                  }
              }
            }
            
            const hasProjVel = Math.hypot(p.vx || 0, p.vy || 0) >= 1;
            let hitAngle = 0;
            if (hasProjVel) {
                hitAngle = Math.atan2(p.vy, p.vx);
            } else if (this.player) {
                const pdx = e.x - this.player.x;
                const pdy = e.y - this.player.y;
                hitAngle = (Math.abs(pdx) > 1e-4 || Math.abs(pdy) > 1e-4) ? Math.atan2(pdy, pdx) : 0;
            }
            const hitOpts = isCrit
                ? { ...(dmgOpts || {}), isCrit: true, hitAngle }
                : (dmgOpts ? { ...dmgOpts, hitAngle } : { hitAngle });
            if (isCrit) {
                if (this.particles && this.particles.length < 245) {
                    const baseAng = hitAngle;
                    const sparkCount = (e.isBoss || e.isElite) ? 5 : 4;
                    for (let k = 0; k < sparkCount && this.particles.length < 250; k++) {
                        const spread = (Math.random() - 0.5) * 0.72;
                        const spd = 210 + Math.random() * 140;
                        const sp = this._pushParticle(e.x, e.y, k % 2 === 0 ? '#ffee66' : '#ffffff', true);
                        if (sp) {
                          sp.vx = Math.cos(baseAng + spread) * spd;
                          sp.vy = Math.sin(baseAng + spread) * spd;
                          sp.life = 0.34;
                        }
                    }
                }
                if ((e.isBoss || e.isElite) && (this._critShakeCd || 0) <= 0) {
                    this._critShakeCd = 0.14;
                    this.triggerShake(2.8, 0.07);
                }
            }

            const burnMult = stats.burnDamageMult || 1.0;
            if (stats.specialEffects.avatarOfFire) {
                e.applyDot(Math.max(2, dmg * 0.6 * burnMult * this.getElemDamageMult(stats, 'fire')), 3.0 * statusDurMult, "burn");
                this._triggerThermalFlare(e, stats, preBurning, dmgOpts);
            }

            e.takeDamage(dmg, hitOpts);

            if (!stats.specialEffects.avatarOfFire && p.stats && p.stats.signatureTraits && p.stats.signatureTraits.chillOnHitSec) {
                e.status.chilled = Math.max(e.status.chilled || 0, p.stats.signatureTraits.chillOnHitSec * statusDurMult);
            }
            
            if (stats.lifesteal > 0 && this._hasSustainHeadroom(stats)) {
                if (Math.random() < stats.lifesteal) {
                    const basePool = this._getSustainBasePool(stats);
                    const inst = this.getVoidInstability();
                    const sv30Amp = (stats.attributeMilestones && stats.attributeMilestones.sv30) ? 1.30 : 1.0;
                    const rawHeal = Math.max(1, (basePool * 0.014 + dmg * 0.035) * sv30Amp * inst.sustainMult);
                    this._applySustainHeal(rawHeal, stats, { useSiphonCap: true, instability: inst });
                }
            }
            if (!stats.specialEffects.avatarOfFire && p.specialEffects.smite && Math.random() < 0.2 * p.specialEffects.smite.level) {
                this.lightnings.push(new Lightning(e.x, e.y - 500, e.x, e.y, '#ffffaa', true));
                e.takeDamage(stats.damage * 3 * this.getElemDamageMult(stats, 'holy'), hitOpts);
            }
            
            if (stats.specialEffects.cullingStrike && !e.isBoss && e.hp > 0 && (e.hp / e.maxHp) <= 0.1) {
                e.takeDamage(e.hp, hitOpts); // Execute
            }
            
            p.piercedEnemies.add(e);
            if (p.specialEffects.sniper) {
                p.pierceDamageMult *= 0.7;
                p.damage *= 0.7;
            } else if (p.pierce > 0) {
                p.pierceDamageMult *= 0.80;
                p.damage *= 0.80;
            }

            if (p.piercedEnemies.size === 1) {
              if (stats.specialEffects.avatarOfFire) {
                  const fireElemMult = this.getElemDamageMult(stats, 'fire');
                  if (p.specialEffects.ignite) {
                      this.igniteHitCounter = (this.igniteHitCounter || 0) + 1;
                      const ignChance = Math.min(0.60, 0.28 + ((p.specialEffects.ignite.level || 1) - 1) * 0.10);
                      if (this.igniteHitCounter % 4 === 0 || Math.random() < ignChance) {
                          e.applyDot(dmg * 0.28 * (1 + (stats.fireMastery || 0) * 0.1) * burnMult * fireElemMult, 3.0 * statusDurMult, "burn");
                      }
                  }
                  if (stats.fireMastery > 0) {
                      e.applyDot(stats.fireMastery * (2 + stats.damage * 0.08) * burnMult * fireElemMult, 3.0 * statusDurMult, "burn");
                  }
              } else if (e.type !== 'golem') {
                  // Element Mastery Hit Effects
                  switch (p.element) {
                      case 'fire':
                          if (stats.fireMastery > 0) e.applyDot(stats.fireMastery * (2 + stats.damage * 0.08) * burnMult * this.getElemDamageMult(stats, 'fire'), 3.0 * statusDurMult, "burn");
                          break;
                      case 'toxin':
                          if (stats.toxinMastery > 0) e.applyDot(stats.toxinMastery * (2 + stats.damage * 0.08) * this.getElemDamageMult(stats, 'toxin'), 4.0 * statusDurMult, "poison");
                          break;
                      case 'frost':
                          if (stats.frostMastery > 0) {
                              e.takeDamage(stats.frostMastery * (2 + stats.damage * 0.06) * this.getElemDamageMult(stats, 'frost'), hitOpts);
                              e.status.chilled = Math.max(e.status.chilled || 0, 1.0 * statusDurMult);
                          }
                          break;
                      case 'storm':
                          if (stats.stormMastery > 0) {
                              e.takeDamage(stats.stormMastery * (2.5 + stats.damage * 0.08) * this.getElemDamageMult(stats, 'storm'), hitOpts);
                              e.status.shocked = Math.max(e.status.shocked || 0, 1.0 * statusDurMult);
                          }
                          break;
                      case 'blood':
                          if (stats.bloodMastery > 0) e.applyDot(stats.bloodMastery * (2 + stats.damage * 0.08) * this.getElemDamageMult(stats, 'blood'), 3.0 * statusDurMult, "bleed");
                          break;
                      case 'holy':
                          if (stats.holyMastery > 0) e.takeDamage(stats.holyMastery * (3 + stats.damage * 0.1) * this.getElemDamageMult(stats, 'holy'), hitOpts);
                          break;
                      case 'earth':
                          if (stats.earthMastery > 0) e.takeDamage(stats.earthMastery * (3 + stats.damage * 0.1) * this.getElemDamageMult(stats, 'earth'), hitOpts);
                          break;
                  }

                  // Perk Effects
                  if (p.specialEffects.applyPoison) e.applyDot(dmg * 0.2 * (1 + (stats.toxinMastery || 0) * 0.2) * this.getElemDamageMult(stats, 'toxin'), 5.0 * statusDurMult, "poison");
                  if (p.specialEffects.ignite) {
                      this.igniteHitCounter = (this.igniteHitCounter || 0) + 1;
                      const ignChance = Math.min(0.60, 0.28 + ((p.specialEffects.ignite.level || 1) - 1) * 0.10);
                      if (this.igniteHitCounter % 4 === 0 || Math.random() < ignChance) {
                          e.applyDot(dmg * 0.28 * (1 + (stats.fireMastery || 0) * 0.1) * burnMult * this.getElemDamageMult(stats, 'fire'), 3.0 * statusDurMult, "burn");
                      }
                  }
                  if (p.specialEffects.chill && !e.isBossPylon) e.status.chilled = Math.max(e.status.chilled || 0, 2.0 * (1 + (stats.frostMastery || 0) * 0.5) * statusDurMult);
                  if (p.specialEffects.freeze && !e.isBossPylon) {
                      this.freezeHitCounter = (this.freezeHitCounter || 0) + 1;
                      const frzChance = e.isBoss ? 0.14 : Math.min(0.45, 0.22 + ((p.specialEffects.freeze.level || 1) - 1) * 0.08);
                      if (e.isBoss ? Math.random() < frzChance : (this.freezeHitCounter % 6 === 0 || Math.random() < frzChance)) {
                          if (!e.isBoss || (e._ccImmuneTimer || 0) <= 0) {
                              const frzDur = e.isBoss ? 0.55 : ((2.0 + (stats.frostMastery || 0) * 0.3) * statusDurMult);
                              e.status.frozen = Math.max(e.status.frozen || 0, frzDur);
                              if (e.isBoss) e._ccImmuneTimer = 3.6;
                          }
                      }
                  }
                  if (p.specialEffects.shock) e.status.shocked = Math.max(e.status.shocked || 0, 2.0 * statusDurMult);
                  if (p.specialEffects.petrify && !e.isBossPylon) {
                      const petChance = e.isBoss ? 0.12 : Math.min(0.50, 0.24 + ((p.specialEffects.petrify.level || 1) - 1) * 0.08);
                      if (Math.random() < petChance) {
                          if (!e.isBoss || (e._ccImmuneTimer || 0) <= 0) {
                              const petDur = e.isBoss ? 0.65 : ((3.0 + (stats.earthMastery || 0) * 0.3) * statusDurMult);
                              e.status.petrified = Math.max(e.status.petrified || 0, petDur);
                              if (e.isBoss) e._ccImmuneTimer = 3.6;
                              for (let i = 0; i < 5; i++) this._pushParticle(e.x, e.y, '#cc8844', false);
                          }
                      }
                  }
              }

              // Cross-Elemental Reactions (throttled per enemy >= 1.4s)
              if (effectiveEl && effectiveEl !== 'none' && (this.runTime - (e._lastReactionAt || -10)) >= 1.4) {
                  if ((effectiveEl === 'storm' && preChillFreeze) || (effectiveEl === 'frost' && e.status && e.status.shocked > 0)) {
                      e._lastReactionAt = this.runTime;
                      e.resistShredTimer = Math.max(e.resistShredTimer || 0, 5.0);
                      e.resistShredAmount = Math.max(e.resistShredAmount || 0, 0.35);
                      this.triggerLocalKineticPulse(e.x, e.y, 120, dmg * 0.65, '#66eeff', stats);
                      if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
                          this.floatingTexts.push(new FloatingText(e.x, e.y - 24, 'SUPERCONDUCT! -35% RES', '#66eeff', 1.02, 1.0));
                      }
                  } else if ((effectiveEl === 'fire' && e.dots && e.dots.some(d => d.type === 'poison')) || (effectiveEl === 'toxin' && preBurning)) {
                      e._lastReactionAt = this.runTime;
                      this.triggerLocalKineticPulse(e.x, e.y, 130, dmg * 0.85, '#ff8822', stats);
                      if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
                          this.floatingTexts.push(new FloatingText(e.x, e.y - 24, 'VOLATILE DETONATE!', '#ff8822', 1.02, 0.95));
                      }
                  } else if ((effectiveEl === 'holy' && e.dots && e.dots.some(d => d.type === 'bleed')) || (effectiveEl === 'blood' && (e.holyMarkedTimer || 0) > 0)) {
                      e._lastReactionAt = this.runTime;
                      e.takeDamage(dmg * 0.75, isCrit ? { ignoreShieldAndResist: 0.65, isCrit: true } : { ignoreShieldAndResist: 0.65 });
                      if (this._hasSustainHeadroom(stats)) {
                          const heal = Math.max(2, Math.round(this._getSustainBasePool(stats) * 0.03));
                          this._applySustainHeal(heal, stats);
                      }
                      if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
                          this.floatingTexts.push(new FloatingText(e.x, e.y - 24, 'ECLIPSE!', '#ffe899', 1.05, 0.95));
                      }
                  } else if ((effectiveEl === 'fire' && preChillFreeze) || (effectiveEl === 'frost' && preBurning)) {
                      e._lastReactionAt = this.runTime;
                      this.triggerLocalKineticPulse(e.x, e.y, 110, dmg * 0.75, '#ffaa44', stats);
                      if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
                          this.floatingTexts.push(new FloatingText(e.x, e.y - 24, 'THERMAL DETONATION!', '#ffaa44', 1.0, 0.9));
                      }
                  } else if ((effectiveEl === 'storm' && e.dots && e.dots.some(d => d.type === 'poison')) || (effectiveEl === 'toxin' && preToxShock && e.status && e.status.shocked > 0)) {
                      e._lastReactionAt = this.runTime;
                      let zaps = 0;
                      const bioRange = 220 * this.getPulseRadiusMult(stats);
                      const bioList = bp
                        ? bp.queryRadiusInto(e.x, e.y, bioRange, this._broadphaseProcScratch, false)
                        : this.enemies;
                      for (let bi = 0; bi < bioList.length; bi++) {
                          const oe = bioList[bi];
                          if (oe !== e && !oe.markedForDeletion && Math.hypot(oe.x - e.x, oe.y - e.y) <= bioRange) {
                              oe.takeDamage(dmg * 0.55, dmgOpts);
                              oe.status.shocked = Math.max(oe.status.shocked || 0, 1.5 * statusDurMult);
                              this.lightnings.push(new Lightning(e.x, e.y, oe.x, oe.y, '#55ffaa', false));
                              zaps++;
                              if (zaps >= 2) break;
                          }
                      }
                      if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
                          this.floatingTexts.push(new FloatingText(e.x, e.y - 24, 'BIO-CONDUCTANCE!', '#55ffaa', 1.0, 0.9));
                      }
                  } else if (effectiveEl === 'earth' && e.status && (e.status.frozen > 0 || e.status.petrified > 0)) {
                      e._lastReactionAt = this.runTime;
                      e.takeDamage(dmg * 0.65, hitOpts);
                      this.triggerLocalKineticPulse(e.x, e.y, 95, dmg * 0.50, '#d4a259', stats);
                      if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
                          this.floatingTexts.push(new FloatingText(e.x, e.y - 24, 'TECTONIC RUPTURE!', '#d4a259', 1.0, 0.9));
                      }
                  }
              }
            }

            if (!stats.specialEffects.avatarOfFire && p.specialEffects.chainLightning) {
                const conduitLevel = p.specialEffects.conduit?.level || 0;
                const zapTargets = 1 + p.specialEffects.chainLightning.level + (stats.stormMastery || 0) + conduitLevel * 2;
                const zapRange = 120 * (1 + conduitLevel * 0.5) * this.getPulseRadiusMult(stats);
                const zapDmg = dmg * 0.5 * this.getElemDamageMult(stats, 'storm');
                let zapped = 0;
                const zapList = bp
                  ? bp.queryRadiusInto(e.x, e.y, zapRange, this._broadphaseProcScratch, false)
                  : this.enemies;
                for (let zi = 0; zi < zapList.length; zi++) {
                    const oe = zapList[zi];
                    if (oe !== e && !oe.markedForDeletion && Math.hypot(oe.x - e.x, oe.y - e.y) < zapRange) {
                        oe.takeDamage(zapDmg, dmgOpts);
                        this.lightnings.push(new Lightning(e.x, e.y, oe.x, oe.y));
                        zapped++;
                        if (zapped >= zapTargets) break;
                    }
                }
            }
            
            // Knockback (Bosses have 92% Poise Resistance and full immunity during dash/windup; Pylons anchored)
            const bossKbScale = e.isBossPylon ? 0 : (e.isBoss ? ((e._bossDash || (e._bossLockHeading || 0) > 0) ? 0 : 0.08) : 1.0);
            const kbMult = (stats.knockbackMult || 1.0) * (e._infusionKbMult !== undefined ? e._infusionKbMult : 1.0);
            if (p.specialEffects.knockback || p.specialEffects.sniper) {
                e.kbX = p.vx * 0.5 * kbMult * bossKbScale;
                e.kbY = p.vy * 0.5 * kbMult * bossKbScale;
            } else if (kbMult > 1.05) {
                e.kbX = p.vx * 0.25 * (kbMult - 1) * bossKbScale;
                e.kbY = p.vy * 0.25 * (kbMult - 1) * bossKbScale;
            }

            for (let i = 0; i < 3; i++) this._pushParticle(e.x, e.y, isCrit ? '#ffffff' : '#ff3366', false);

            // Split on first hit (primary projectiles only when proc succeeds, 32% damage; pulse fallback at >= 18 active)
            if (!p.isSplitChild && p.willSplit !== false && p.piercedEnemies.size === 1 && p.specialEffects.split && p.specialEffects.split.level > 0 && !p.hasSplitOnHit) {
                p.hasSplitOnHit = true;
                const splitDmg = (p.baseDamage || stats.damage) * (p.pierceDamageMult || 1.0) * 0.32 * this.getElemDamageMult(stats, p.element);
                const activeNow = this.getActiveCombatProjectileCount() + newProjectiles.length;
                if (activeNow >= 18) {
                    this.triggerLocalKineticPulse(e.x, e.y, 72, splitDmg * 1.15, '#ff66ff', stats);
                } else {
                    const angle = Math.atan2(p.vy, p.vx);
                    const speed = Math.hypot(p.vx, p.vy);
                    const spread = 0.5; // radians
                    for (let i = -1; i <= 1; i += 2) {
                        if (this.getActiveCombatProjectileCount() + newProjectiles.length >= 18) break;
                        const childStats = { ...stats, damage: splitDmg, pierce: 0, bounce: 0, specialEffects: buildChildEffects(p.specialEffects) };
                        const child = new Projectile(e.x, e.y, Math.cos(angle + i * spread) * speed * 0.8, Math.sin(angle + i * spread) * speed * 0.8, childStats, false, 0, p.element);
                        child.isSplitChild = true;
                        child.piercedEnemies.add(e);
                        newProjectiles.push(child);
                    }
                }
            }

            // Projectile life evaluation
            if (p.piercedEnemies.size > p.pierce) {
              if (!p.isSplitChild && !p._hasForked && p.specialEffects.fork && p.specialEffects.fork.level > 0 && Math.random() < (stats.forkChance || 0)) {
                  p._hasForked = true;
                  const forkDmg = (p.baseDamage || stats.damage) * (p.pierceDamageMult || 1.0) * 0.42 * this.getElemDamageMult(stats, p.element);
                  const activeNow = this.getActiveCombatProjectileCount() + newProjectiles.length;
                  if (activeNow >= 18) {
                      this.triggerLocalKineticPulse(e.x, e.y, 72, forkDmg * 1.15, '#00eeff', stats);
                  } else {
                      const numForks = Math.min(2, 1 + p.specialEffects.fork.level);
                      const speed = Math.hypot(p.vx, p.vy);
                      const baseAngle = Math.atan2(p.vy, p.vx);
                      const childStats = {
                          ...stats,
                          damage: forkDmg,
                          pierce: 0,
                          bounce: 0,
                          specialEffects: buildChildEffects(p.specialEffects)
                      };
                      const spread = 1.0;
                      for (let i = 0; i < numForks; i++) {
                          if (this.getActiveCombatProjectileCount() + newProjectiles.length >= 18) break;
                          const angleOffset = (i - (numForks - 1) / 2) * (spread / (numForks > 1 ? numForks - 1 : 1));
                          const child = new Projectile(e.x, e.y, Math.cos(baseAngle + angleOffset) * speed, Math.sin(baseAngle + angleOffset) * speed, childStats, false, 0, p.element);
                          child.isSplitChild = true;
                          child.piercedEnemies.add(e);
                          newProjectiles.push(child);
                      }
                  }
              }
              if (!p.isSplitChild && !p._hasShattered && p.specialEffects.rockShard && p.specialEffects.rockShard.level > 0 && Math.random() < (stats.rockShardChance || 0)) {
                  p._hasShattered = true;
                  const shardElem = (p.element && p.element !== 'none') ? p.element : 'earth';
                  const shardDmg = (p.baseDamage || stats.damage) * (p.pierceDamageMult || 1.0) * 0.30 * this.getElemDamageMult(stats, shardElem);
                  const activeNow = this.getActiveCombatProjectileCount() + newProjectiles.length;
                  if (activeNow >= 18) {
                      this.triggerLocalKineticPulse(e.x, e.y, 76, shardDmg * 1.35, '#cc8844', stats);
                  } else {
                      const numShards = Math.min(3, 3 * p.specialEffects.rockShard.level);
                      const speed = Math.hypot(p.vx, p.vy);
                      const childStats = { ...stats, damage: shardDmg, pierce: 0, bounce: 0, specialEffects: buildChildEffects(p.specialEffects, { knockback: { level: 1 } }) };
                      for (let i = 0; i < numShards; i++) {
                          if (this.getActiveCombatProjectileCount() + newProjectiles.length >= 18) break;
                          const angle = Math.random() * Math.PI * 2;
                          const child = new Projectile(e.x, e.y, Math.cos(angle) * speed * 0.8, Math.sin(angle) * speed * 0.8, childStats, false, 0, p.element);
                          child.isSplitChild = true;
                          child.piercedEnemies.add(e);
                          newProjectiles.push(child);
                      }
                  }
              }
              p.markedForDeletion = true;
              break;
            }
          }
        }
      }
    }
    
    this.projectiles.push(...newProjectiles);

    // Enemies hit Player (frame-rate independent contact DPS)
    if (this.phasingTimer <= 0 && this.player) {
      const contactRadius = (this.player.radius || 15) + 22;
      const contactList = bp
        ? bp.queryRadiusInto(this.player.x, this.player.y, contactRadius, this._broadphaseProjScratch, true)
        : this.enemies;
      for (let ci = 0; ci < contactList.length; ci++) {
        const e = contactList[ci];
        if (!e || e.markedForDeletion || e.retreatingForBoss) continue;
        const dist = Math.hypot(this.player.x - e.x, this.player.y - e.y);
        if (dist < this.player.radius + e.radius) {
          const bloodEnrage = (e.biomeInfusion === 'blood' && e.hp < e.maxHp * 0.5) ? 1.18 : 1.0;
          const dashMult = e._isDashing ? 1.28 : 1.0;
          const contactDps = e.damage * (e.buffs.damageTimer > 0 ? 1.25 : 1) * bloodEnrage * dashMult * 2.2;
          this.handleDamageTaken(contactDps * dt, stats, { sourceEnemy: e });
          if (e.biomeInfusion === 'frost') {
              this.playerInfusionChillTimer = Math.max(this.playerInfusionChillTimer || 0, 1.0);
          } else if (e.biomeInfusion === 'blood' && (e._crimsonSiphonCd || 0) <= 0 && e.hp < e.maxHp) {
              e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.10);
              e._crimsonSiphonCd = 1.0;
          }
          if (stats.specialEffects.thorns) {
              e.takeDamage((e.damage * 15 + stats.damage * 2) * stats.specialEffects.thorns.level * dt, { isDot: true });
          }
          if (this.player.hp <= 0) break;
        }
        if (e.type === 'sentinel' && e.status.frozen <= 0 && e.status.petrified <= 0) {
            for (let i = 0; i < 3; i++) {
                const orbAngle = e.orbitAngle + (Math.PI * 2 / 3) * i;
                const ox = e.x + Math.cos(orbAngle) * (e.radius + 15);
                const oy = e.y + Math.sin(orbAngle) * (e.radius + 15);
                if (Math.hypot(this.player.x - ox, this.player.y - oy) < this.player.radius + 6) {
                    this.handleDamageTaken(e.damage * 2.5 * dt, stats, { sourceEnemy: e });
                    if (this.player.hp <= 0) break;
                }
            }
            if (this.player.hp <= 0) break;
        }
      }
    }
    
    // Enemy Projectiles hit Player
    for (const ep of this.enemyProjectiles) {
      if (this.phasingTimer > 0) break;
      const dist = Math.hypot(this.player.x - ep.x, this.player.y - ep.y);
      if (dist < this.player.radius + ep.radius) {
          this.handleDamageTaken(ep.damage, stats, { sourceX: ep.x, sourceY: ep.y });
          if (ep.biomeInfusion === 'frost') {
              this.playerInfusionChillTimer = Math.max(this.playerInfusionChillTimer || 0, 1.0);
          }
          ep.markedForDeletion = true;
          if (this.player.hp <= 0) break;
      }
    }

    // XP Pickups & Magnetism Vacuum
    const currentPickupRange = this.vacuumTimer > 0 ? 5000 : stats.pickupRange;
    if (this.vacuumTimer > 0) this.vacuumTimer -= dt;

    const orbPhaseCfg = this.getActivePhaseConfig();
    const orbKeyDef = this.getActiveFractureKeyDef();
    const orbMatterMult = (stats.matterMult || 1.0) * (orbPhaseCfg.rewardMult || 1.0) * (1 + (orbKeyDef?.matterBonus || 0));

    for (const xp of this.xpOrbs) {
      const dist = Math.hypot(this.player.x - xp.x, this.player.y - xp.y);
      if (dist < currentPickupRange) {
        const pull = Math.min(1, dt * (this.vacuumTimer > 0 ? 25 : 10));
        xp.x += (this.player.x - xp.x) * pull;
        xp.y += (this.player.y - xp.y) * pull;
      }
      if (dist < this.player.radius + xp.radius + 10) {
        xp.markedForDeletion = true;
        const xpMult = 1 + 0.2 * (stats.specialEffects?.xpBurst?.level || 0);
        const gained = xp.value * xpMult;
        this.player.xp += gained;
        this.totalXpEarned += gained * 1.85;
        this.currencyCollected += gained * 0.04 * orbMatterMult;
        if (typeof NeonAudio !== 'undefined') NeonAudio.playXpPickup();
        if (stats.specialEffects?.vacuum && Math.random() < 0.06) {
            this.vacuumTimer = 1.2;
        }
      }
    }

    // Boss Core Orb Pickups
    const orbPickupRange = Math.max(150, currentPickupRange * 1.5);
    for (const orb of this.bossOrbs) {
      const dist = Math.hypot(this.player.x - orb.x, this.player.y - orb.y);
      if (dist < orbPickupRange) {
        const pull = Math.min(1, dt * 12);
        orb.x += (this.player.x - orb.x) * pull;
        orb.y += (this.player.y - orb.y) * pull;
      }
      if (dist < this.player.radius + orb.radius + 10) {
        orb.markedForDeletion = true;
        this.perkPointsCollected = (this.perkPointsCollected || 0) + 1;
        if (typeof NeonAudio !== 'undefined') NeonAudio.playRelicOrShrine();
        if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
          this.floatingTexts.push(new FloatingText(orb.x, orb.y - 24, '+1 PERK POINT', '#c424ff', 1.2, 1.4));
        }
        for (let i = 0; i < 15; i++) this._pushParticle(orb.x, orb.y, '#c424ff', false);
      }
    }
  }

  draw() {
    const ctx = this.ctx;
    const vw = this.canvas.width;
    const vh = this.canvas.height;
    ctx.clearRect(0, 0, vw, vh);

    const cam = this.camera || { x: this.player.x, y: this.player.y, zoom: 1.0, shakeTimer: 0, shakeIntensity: 0 };
    const camZoom = Math.max(0.70, Math.min(1.0, Number.isFinite(cam.zoom) ? cam.zoom : 1.0));
    let shakeX = 0;
    let shakeY = 0;
    if (cam.shakeTimer > 0) {
      shakeX = (Math.random() - 0.5) * cam.shakeIntensity * 2;
      shakeY = (Math.random() - 0.5) * cam.shakeIntensity * 2;
    }

    const halfViewW = (vw * 0.5) / camZoom;
    const halfViewH = (vh * 0.5) / camZoom;
    const viewMinX = cam.x - halfViewW - 260;
    const viewMaxX = cam.x + halfViewW + 260;
    const viewMinY = cam.y - halfViewH - 260;
    const viewMaxY = cam.y + halfViewH + 260;

    ctx.save();
    ctx.translate(vw * 0.5, vh * 0.5);
    if (camZoom !== 1 && typeof ctx.scale === 'function') {
      ctx.scale(camZoom, camZoom);
    }
    ctx.translate(-(cam.x + shakeX), -(cam.y + shakeY));

    if (this.world) {
      const sec = this.world.getSectorAt(this.player.x, this.player.y);

      if (this.isDescentMode) {
        this._drawDescentArenaGround(ctx, cam, vw, vh, viewMinX, viewMaxX, viewMinY, viewMaxY);
      } else {
        // Textured high-contrast parallax ground, motion ticks & Sanctum lanes
        this._drawTexturedGround(ctx, cam, vw, vh, viewMinX, viewMaxX, viewMinY, viewMaxY, sec);
        this._drawSanctumCenterSignposts(ctx, viewMinX, viewMaxX, viewMinY, viewMaxY);
      }

      // Storm Conduit Accelerator Boost Strips
      if (this.world.boostStrips) {
        for (const bs of this.world.boostStrips) {
          if (bs.maxX < viewMinX || bs.minX > viewMaxX || bs.maxY < viewMinY || bs.minY > viewMaxY) continue;
          this._drawBoostStrip(ctx, bs, this.runTime);
        }
      }

      // Biome Environmental Decor Props
      if (this.world.decorProps) {
        for (const prop of this.world.decorProps) {
          if (prop.x + 120 < viewMinX || prop.x - 120 > viewMaxX || prop.y + 120 < viewMinY || prop.y - 120 > viewMaxY) continue;
          this._drawDecorProp(ctx, prop, this.runTime);
        }
      }

      // Void Chasms (projectiles & wraiths pass freely, ground units detour over Bridges)
      if (this.world.getChasmsInRect) {
        const visibleChasms = this.world.getChasmsInRect(viewMinX - 120, viewMinY - 120, viewMaxX + 120, viewMaxY + 120);
        for (const ch of visibleChasms) {
          ctx.save();
          ctx.lineCap = 'round';
          ctx.strokeStyle = ch.color || '#7722ff';
          ctx.globalAlpha = 0.42;
          ctx.lineWidth = ch.halfWidth * 2 + 6;
          ctx.beginPath();
          ctx.moveTo(ch.x1, ch.y1);
          ctx.lineTo(ch.x2, ch.y2);
          ctx.stroke();

          ctx.globalAlpha = 0.96;
          ctx.strokeStyle = '#010208';
          ctx.lineWidth = ch.halfWidth * 2;
          ctx.beginPath();
          ctx.moveTo(ch.x1, ch.y1);
          ctx.lineTo(ch.x2, ch.y2);
          ctx.stroke();

          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = ch.color || '#7722ff';
          ctx.lineWidth = 2;
          if (ctx.setLineDash) ctx.setLineDash([12, 16]);
          ctx.beginPath();
          ctx.moveTo(ch.x1, ch.y1);
          ctx.lineTo(ch.x2, ch.y2);
          ctx.stroke();
          if (ctx.setLineDash) ctx.setLineDash([]);
          ctx.restore();
        }
      }

      // Neon Bridges (safe glowing walkways across Chasms)
      if (this.world.bridges) {
        for (const b of this.world.bridges) {
          if (b.maxX < viewMinX || b.minX > viewMaxX || b.maxY < viewMinY || b.minY > viewMaxY) continue;
          const dx = b.x2 - b.x1;
          const dy = b.y2 - b.y1;
          const len = Math.hypot(dx, dy) || 1;
          const nx = (-dy / len) * (b.width * 0.45);
          const ny = (dx / len) * (b.width * 0.45);
          ctx.save();
          ctx.strokeStyle = b.color || '#00eeff';
          ctx.globalAlpha = 0.14;
          ctx.lineWidth = b.width;
          ctx.beginPath();
          ctx.moveTo(b.x1, b.y1);
          ctx.lineTo(b.x2, b.y2);
          ctx.stroke();

          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(b.x1 + nx, b.y1 + ny);
          ctx.lineTo(b.x2 + nx, b.y2 + ny);
          ctx.moveTo(b.x1 - nx, b.y1 - ny);
          ctx.lineTo(b.x2 - nx, b.y2 - ny);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Elemental Sector Hazards (Procedural Vector Art — Hidden while Citadel Boss Arena is sealed)
      if (this.world.hazards && !this.activeBossArena) {
        for (const h of this.world.hazards) {
          if (h.x + h.radius + 30 < viewMinX || h.x - h.radius - 30 > viewMaxX || h.y + h.radius + 30 < viewMinY || h.y - h.radius - 30 > viewMaxY) continue;
          this._drawWorldHazard(ctx, h, this.runTime);
        }
      }

      // 7 Grand Biome Gateways along Sanctum Rim
      if (!this.isDescentMode && this.world.biomeGateways) {
        this._drawBiomeGateways(ctx, viewMinX, viewMaxX, viewMinY, viewMaxY, this.runTime);
      }

      // Boss Forcefield Gates (r = 7160 Great Abyssal Bridges)
      if (!this.isDescentMode && this.world.forceGates) {
        for (const g of this.world.forceGates) {
          if (g.maxX < viewMinX || g.minX > viewMaxX || g.maxY < viewMinY || g.minY > viewMaxY) continue;
          const isOpen = this.world.isForceGateOpen && this.world.isForceGateOpen(g);
          ctx.save();
          if (!isOpen) {
            ctx.strokeStyle = g.color;
            ctx.globalAlpha = 0.24;
            ctx.lineWidth = 12;
            ctx.beginPath();
            ctx.moveTo(g.x1, g.y1);
            ctx.lineTo(g.x2, g.y2);
            ctx.stroke();

            ctx.globalAlpha = 0.85;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(g.x1, g.y1);
            ctx.lineTo(g.x2, g.y2);
            ctx.stroke();

            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(g.x1, g.y1);
            ctx.lineTo(g.x2, g.y2);
            ctx.stroke();

            ctx.fillStyle = g.color;
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`SEALED GATE [${g.element.toUpperCase()}]`, g.cx, g.cy - 18);
          } else {
            ctx.fillStyle = g.color;
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.arc(g.x1, g.y1, 10, 0, Math.PI * 2);
            ctx.arc(g.x2, g.y2, 10, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      // Sanctum Echo Warp Pads (Outpost, Citadel & Deep Abyss — Bidirectional Repeatable)
      if (!this.isDescentMode && this.world.echoPads) {
        for (const pad of this.world.echoPads) {
          if (pad.x + 80 < viewMinX || pad.x - 80 > viewMaxX || pad.y + 80 < viewMinY || pad.y - 80 > viewMaxY) continue;
          const unlocked = this._isEchoPadUnlocked(pad);
          ctx.save();
          ctx.globalAlpha = unlocked ? ((this.warpArrivalCooldown || 0) > 0 ? 0.38 : 0.88) : 0.18;
          ctx.strokeStyle = pad.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pad.x, pad.y, pad.radius, 0, Math.PI * 2);
          ctx.stroke();
          if (pad.progress > 0 && unlocked) {
            ctx.beginPath();
            ctx.arc(pad.x, pad.y, pad.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, pad.progress / pad.holdRequired));
            ctx.lineWidth = 3;
            ctx.stroke();
          }
          ctx.fillStyle = pad.color;
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          const prefix = pad.kind === 'deep' ? 'DEEP:' : (pad.kind === 'outpost' ? 'OUTPOST:' : 'WARP:');
          ctx.fillText(unlocked ? `⇄ ${prefix}${pad.element.toUpperCase()}` : `${prefix}LOCKED`, pad.x, pad.y + 4);
          ctx.restore();
        }
      }

      // Outpost Beacons (r = 9200 — Return to Sanctum when linked)
      if (!this.isDescentMode && this.world.outpostBeacons) {
        for (const b of this.world.outpostBeacons) {
          if (b.x + b.radius + 30 < viewMinX || b.x - b.radius - 30 > viewMaxX || b.y + b.radius + 30 < viewMinY || b.y - b.radius - 30 > viewMaxY) continue;
          const linked = b.activatedThisRun || (typeof Meta !== 'undefined' && Meta.data && Array.isArray(Meta.data.discoveredSectors) && Meta.data.discoveredSectors.includes(`outpost_${b.element}`));
          ctx.save();
          ctx.strokeStyle = b.color;
          ctx.fillStyle = b.color;
          ctx.globalAlpha = linked ? 0.65 : 0.82;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.stroke();
          if (linked) {
            ctx.strokeStyle = '#00ffff';
            ctx.globalAlpha = 0.75;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(b.x, b.y, 16, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = b.color;
          }
          ctx.globalAlpha = linked ? 0.55 : 0.85;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y - 16);
          ctx.lineTo(b.x + 14, b.y + 10);
          ctx.lineTo(b.x - 14, b.y + 10);
          ctx.closePath();
          ctx.fill();
          if (b.progress > 0 && !linked) {
            ctx.globalAlpha = 0.95;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, b.progress / b.holdRequired));
            ctx.stroke();
          } else if ((b.returnProgress || 0) > 0 && linked) {
            ctx.globalAlpha = 0.95;
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, b.returnProgress / 1.6));
            ctx.stroke();
          }
          ctx.fillStyle = linked ? '#00ffff' : b.color;
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(linked ? ((b.returnProgress || 0) > 0 ? 'WARPING TO SANCTUM...' : `${b.name} [⇄ SANCTUM]`) : `SYNC ${b.name}`, b.x, b.y - 28);
          ctx.restore();
        }
      }

      // Daily Seeded Rift Pad
      const dp = this.world.dailyPad;
      if (!this.isDescentMode && dp && dp.x >= viewMinX && dp.x <= viewMaxX && dp.y >= viewMinY && dp.y <= viewMaxY && (this.isDailyRun || this.runTime < 30)) {
        ctx.save();
        ctx.globalAlpha = dp.active ? 0.9 : 0.75;
        ctx.strokeStyle = dp.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, dp.radius, 0, Math.PI * 2);
        ctx.stroke();
        if (dp.progress > 0 && !dp.active) {
          ctx.beginPath();
          ctx.arc(dp.x, dp.y, dp.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (dp.progress / dp.holdRequired));
          ctx.stroke();
        }
        ctx.fillStyle = dp.color;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.isDailyRun ? 'DAILY ACTIVE' : 'DAILY RIFT', dp.x, dp.y + 4);
        ctx.restore();
      }

      // Elemental Monoliths (conquered monoliths warp back to Sanctum)
      if (!this.isDescentMode && this.world.monoliths) {
        for (const m of this.world.monoliths) {
          if (m.x + m.radius < viewMinX || m.x - m.radius > viewMaxX || m.y + m.radius < viewMinY || m.y - m.radius > viewMaxY) continue;
          const isConquered = m.state === 'conquered' || (typeof Meta !== 'undefined' && Meta.isSectorConquered && Meta.isSectorConquered(m.element));
          ctx.save();
          ctx.strokeStyle = m.color;
          ctx.fillStyle = m.color;
          ctx.globalAlpha = isConquered ? 0.55 : 0.7;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
          ctx.stroke();
          if (isConquered) {
            ctx.strokeStyle = '#00ffff';
            ctx.globalAlpha = 0.75;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(m.x, m.y, 16, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = m.color;
          }

          // Center hex pillar
          ctx.globalAlpha = isConquered ? 0.45 : 0.78;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k * Math.PI) / 3;
            const px = m.x + Math.cos(a) * 24;
            const py = m.y + Math.sin(a) * 24;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();

          if (m.progress > 0 && (m.state === 'charging' || m.state === 'dormant')) {
            ctx.globalAlpha = 0.95;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, m.progress / m.holdRequired));
            ctx.stroke();
          } else if (isConquered && (m.returnProgress || 0) > 0) {
            ctx.globalAlpha = 0.95;
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, m.returnProgress / 1.6));
            ctx.stroke();
          }
          const statusTxt = isConquered
            ? ((m.returnProgress || 0) > 0 ? 'WARPING TO SANCTUM...' : `${m.name} [⇄ SANCTUM]`)
            : (m.state === 'guardian_active' ? 'DEFEAT GUARDIAN!' : `HOLD MONOLITH (${m.name})`);
          this._drawWorldLabel(ctx, statusTxt, m.x, m.y - 34, isConquered ? '#00ffff' : m.color);
          ctx.restore();
        }
      }

      // Deep Abyss Beacons (r = 31500 — Return to Sanctum when linked)
      if (!this.isDescentMode && this.world.deepBeacons) {
        for (const b of this.world.deepBeacons) {
          if (b.x + b.radius + 30 < viewMinX || b.x - b.radius - 30 > viewMaxX || b.y + b.radius + 30 < viewMinY || b.y - b.radius - 30 > viewMaxY) continue;
          const linked = b.activatedThisRun || (typeof Meta !== 'undefined' && Meta.isDeepBeaconUnlocked && Meta.isDeepBeaconUnlocked(b.element));
          ctx.save();
          ctx.strokeStyle = b.color;
          ctx.fillStyle = b.color;
          ctx.globalAlpha = linked ? 0.65 : 0.78;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.stroke();
          if (linked) {
            ctx.strokeStyle = '#00ffff';
            ctx.globalAlpha = 0.75;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(b.x, b.y, 16, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = b.color;
          }
          ctx.globalAlpha = linked ? 0.55 : 0.85;
          ctx.beginPath();
          for (let k = 0; k < 4; k++) {
            const a = (k * Math.PI) / 2;
            const px = b.x + Math.cos(a) * 18;
            const py = b.y + Math.sin(a) * 18;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          if (b.progress > 0 && !linked) {
            ctx.globalAlpha = 0.95;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, b.progress / b.holdRequired));
            ctx.stroke();
          } else if ((b.returnProgress || 0) > 0 && linked) {
            ctx.globalAlpha = 0.95;
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, b.returnProgress / 1.6));
            ctx.stroke();
          }
          this._drawWorldLabel(
            ctx,
            linked ? ((b.returnProgress || 0) > 0 ? 'WARPING TO SANCTUM...' : `${b.name} [⇄ SANCTUM]`) : `SYNC ${b.name}`,
            b.x,
            b.y - 30,
            linked ? '#00ffff' : b.color
          );
          ctx.restore();
        }
      }

      // Hidden Perk Vaults (16 across the Void Megalattice)
      if (!this.isDescentMode && this.world.perkVaults) {
        for (const v of this.world.perkVaults) {
          if (v.x + v.radius + 40 < viewMinX || v.x - v.radius - 40 > viewMaxX || v.y + v.radius + 40 < viewMinY || v.y - v.radius - 40 > viewMaxY) continue;
          const foundMeta = typeof Meta !== 'undefined' && Meta.isMapPerkFound && Meta.isMapPerkFound(v.perkId);
          ctx.save();
          ctx.strokeStyle = v.color;
          ctx.fillStyle = v.color;
          ctx.globalAlpha = v.collectedThisRun ? 0.22 : 0.85;
          ctx.lineWidth = v.isKeystone ? 3 : 2;
          ctx.beginPath();
          ctx.arc(v.x, v.y, v.radius, 0, Math.PI * 2);
          ctx.stroke();

          if (v.isKeystone && !v.collectedThisRun) {
            ctx.globalAlpha = 0.45 + 0.25 * Math.sin(this.runTime * 4);
            if (ctx.setLineDash) ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.arc(v.x, v.y, v.radius + 12, 0, Math.PI * 2);
            ctx.stroke();
            if (ctx.setLineDash) ctx.setLineDash([]);
          }

          ctx.globalAlpha = v.collectedThisRun ? 0.35 : 0.95;
          ctx.beginPath();
          ctx.moveTo(v.x, v.y - 18);
          ctx.lineTo(v.x + 14, v.y);
          ctx.lineTo(v.x, v.y + 18);
          ctx.lineTo(v.x - 14, v.y);
          ctx.closePath();
          ctx.fill();

          if (v.progress > 0 && !v.collectedThisRun) {
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(v.x, v.y, v.radius + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, v.progress / v.holdRequired));
            ctx.stroke();
          }

          const vLabel = v.collectedThisRun
            ? `${v.perkName.toUpperCase()} [COLLECTED]`
            : `${foundMeta ? 'CACHE' : 'BLUEPRINT'}: ${v.perkName.toUpperCase()}`;
          this._drawWorldLabel(ctx, vLabel, v.x, v.y - 32, v.color);
          ctx.restore();
        }
      }

      // Risk/Reward World Shrines
      if (!this.isDescentMode && this.world.shrines) {
        for (const s of this.world.shrines) {
          if (s.completed) continue;
          if (s.x + s.radius < viewMinX || s.x - s.radius > viewMaxX || s.y + s.radius < viewMinY || s.y - s.radius > viewMaxY) continue;
          ctx.save();
          ctx.strokeStyle = s.color;
          ctx.fillStyle = s.color;
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = s.isMega ? 3 : 2;
          const shrinkFactor = s.kind === 'convergence' ? Math.max(0.35, 1 - 0.55 * (s.progress / s.holdRequired)) : 1;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius * shrinkFactor, 0, Math.PI * 2);
          ctx.stroke();
          if (s.progress > 0) {
            ctx.globalAlpha = 0.95;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(s.x, s.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, s.progress / s.holdRequired));
            ctx.stroke();
          }
          const prefix = s.isMega ? 'MEGA ' : '';
          this._drawWorldLabel(ctx, s.kind === 'convergence' ? `${prefix}CONVERGENCE RING` : `${prefix}VOLATILE SHRINE`, s.x, s.y - 32, s.color);
          ctx.restore();
        }
      }

      // Sanctum Echo Entity Pads & Architect Conduit
      if (!this.isDescentMode && this.world.sanctumEntities) {
        for (const ent of this.world.sanctumEntities) {
          if (ent.x + 120 < viewMinX || ent.x - 120 > viewMaxX || ent.y + 120 < viewMinY || ent.y - 120 > viewMaxY) continue;
          const isConduit = ent.id === 'architectConduit';
          const rescued = isConduit || (typeof Meta !== 'undefined' && Meta.isEntityRescued ? Meta.isEntityRescued(ent.id) : ent.id === 'archivist');
          ctx.save();
          ctx.strokeStyle = ent.color;
          ctx.fillStyle = ent.color;
          ctx.globalAlpha = rescued ? 0.85 : 0.25;
          ctx.lineWidth = isConduit ? 3 : 2;
          ctx.beginPath();
          ctx.arc(ent.x, ent.y, ent.radius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k * Math.PI) / 3 + this.runTime * 0.6;
            const rIn = isConduit ? 18 : 12;
            const px = ent.x + Math.cos(a) * rIn;
            const py = ent.y + Math.sin(a) * rIn;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();

          if (ent.progress > 0) {
            ctx.globalAlpha = 0.95;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(ent.x, ent.y, ent.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ent.progress / ent.holdRequired));
            ctx.stroke();
          }
          const lbl = isConduit
            ? (ent.summonedThisRun ? 'CONDUIT SPENT' : 'ARCHITECT CONDUIT')
            : (rescued ? ent.label : `${ent.label} [LOCKED]`);
          this._drawWorldLabel(ctx, lbl, ent.x, ent.y - ent.radius - 10, ent.color);
          ctx.restore();
        }
      }

      // Rescue Chambers (Prison Rings)
      if (!this.isDescentMode && this.world.rescueChambers) {
        for (const rc of this.world.rescueChambers) {
          if (rc.x + rc.radius + 40 < viewMinX || rc.x - rc.radius - 40 > viewMaxX || rc.y + rc.radius + 40 < viewMinY || rc.y - rc.radius - 40 > viewMaxY) continue;
          const rescued = rc.rescuedThisRun || (typeof Meta !== 'undefined' && Meta.isEntityRescued && Meta.isEntityRescued(rc.entityId));
          ctx.save();
          ctx.strokeStyle = rc.color;
          ctx.fillStyle = rc.color;
          ctx.globalAlpha = rescued ? 0.2 : 0.8;
          ctx.lineWidth = 2.5;
          if (ctx.setLineDash && !rescued) ctx.setLineDash([10, 6]);
          ctx.beginPath();
          ctx.arc(rc.x, rc.y, rc.radius, 0, Math.PI * 2);
          ctx.stroke();
          if (ctx.setLineDash) ctx.setLineDash([]);
          if (rc.progress > 0 && !rescued) {
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(rc.x, rc.y, rc.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, rc.progress / rc.holdRequired));
            ctx.stroke();
          }
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(rescued ? `${rc.label} [FREED]` : `RESCUE ${rc.entityId.toUpperCase()}`, rc.x, rc.y - 16);
          ctx.restore();
        }
      }

      // Volatile Pact Obelisks
      if (!this.isDescentMode && this.world.volatilePacts) {
        for (const pact of this.world.volatilePacts) {
          if (pact.completedThisRun) continue;
          if (pact.x + pact.radius + 40 < viewMinX || pact.x - pact.radius - 40 > viewMaxX || pact.y + pact.radius + 40 < viewMinY || pact.y - pact.radius - 40 > viewMaxY) continue;
          ctx.save();
          ctx.strokeStyle = pact.color;
          ctx.fillStyle = pact.color;
          ctx.globalAlpha = 0.78;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(pact.x, pact.y, pact.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(pact.x, pact.y - 20);
          ctx.lineTo(pact.x + 14, pact.y + 12);
          ctx.lineTo(pact.x - 14, pact.y + 12);
          ctx.closePath();
          ctx.fill();
          if (pact.progress > 0) {
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(pact.x, pact.y, pact.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, pact.progress / pact.holdRequired));
            ctx.stroke();
          }
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('VOLATILE PACT [NO HULL DMG]', pact.x, pact.y - 30);
          ctx.restore();
        }
      }

      // The Wanderer
      if (!this.isDescentMode && this.wanderer && !this.wanderer.visited) {
        const w = this.wanderer;
        if (w.x + 80 >= viewMinX && w.x - 80 <= viewMaxX && w.y + 80 >= viewMinY && w.y - 80 <= viewMaxY) {
          ctx.save();
          ctx.strokeStyle = w.color;
          ctx.fillStyle = w.color;
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(w.x, w.y, w.radius + Math.sin(w.pulse || 0) * 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(w.x, w.y, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('THE WANDERER', w.x, w.y - 28);
          ctx.restore();
        }
      }

      // v2.3 Void Extractor Rigs
      if (!this.isDescentMode && this.world.extractorRigs) {
        const spin = this.runTime * 1.4;
        for (const rig of this.world.extractorRigs) {
          if (rig.x + rig.radius + 50 < viewMinX || rig.x - rig.radius - 50 > viewMaxX || rig.y + rig.radius + 50 < viewMinY || rig.y - rig.radius - 50 > viewMaxY) continue;
          ctx.save();
          ctx.strokeStyle = rig.capturedThisRun ? '#446677' : rig.color;
          ctx.fillStyle = rig.capturedThisRun ? '#446677' : rig.color;
          ctx.globalAlpha = rig.capturedThisRun ? 0.35 : 0.85;
          ctx.lineWidth = 2;
          ctx.setLineDash([7, 5]);
          ctx.beginPath();
          ctx.arc(rig.x, rig.y, rig.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          for (let k = 0; k < 4; k++) {
            const a = spin + (k * Math.PI) / 2;
            ctx.beginPath();
            ctx.moveTo(rig.x, rig.y);
            ctx.lineTo(rig.x + Math.cos(a) * 26, rig.y + Math.sin(a) * 26);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(rig.x, rig.y, 12, 0, Math.PI * 2);
          ctx.fill();
          if (!rig.capturedThisRun && rig.progress > 0) {
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(rig.x, rig.y, rig.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, rig.progress / rig.holdRequired));
            ctx.stroke();
          }
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(rig.capturedThisRun ? 'EXTRACTOR DRAINED' : `${rig.name} [HOLD]`, rig.x, rig.y - 34);
          ctx.restore();
        }
      }

      // v2.3 Warband Strongholds
      if (!this.isDescentMode && this.world.strongholds) {
        for (const sh of this.world.strongholds) {
          if (sh.x + sh.radius + 50 < viewMinX || sh.x - sh.radius - 50 > viewMaxX || sh.y + sh.radius + 50 < viewMinY || sh.y - sh.radius - 50 > viewMaxY) continue;
          ctx.save();
          ctx.strokeStyle = sh.capturedThisRun ? '#446677' : sh.color;
          ctx.fillStyle = sh.capturedThisRun ? '#446677' : sh.color;
          ctx.globalAlpha = sh.capturedThisRun ? 0.35 : 0.85;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI * 2 * k) / 6;
            const px = sh.x + Math.cos(a) * sh.radius;
            const py = sh.y + Math.sin(a) * sh.radius;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.fillRect(sh.x - 14, sh.y - 14, 28, 28);
          if (!sh.capturedThisRun && sh.progress > 0) {
            ctx.lineWidth = 4.5;
            ctx.beginPath();
            ctx.arc(sh.x, sh.y, sh.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, sh.progress / sh.holdRequired));
            ctx.stroke();
          }
          this._drawWorldLabel(ctx, sh.capturedThisRun ? `${sh.name} [CLAIMED]` : `${sh.name} (LVL ${sh.zoneLevel})`, sh.x, sh.y - 26, sh.color || '#ff4422');
          ctx.restore();
        }
      }

      // v2.3 Equipment-Slot Forges
      if (!this.isDescentMode && this.world.slotForges) {
        const pulse = Math.sin(this.runTime * 3.2) * 5;
        for (const fg of this.world.slotForges) {
          if (fg.x + fg.radius + 50 < viewMinX || fg.x - fg.radius - 50 > viewMaxX || fg.y + fg.radius + 50 < viewMinY || fg.y - fg.radius - 50 > viewMaxY) continue;
          ctx.save();
          ctx.strokeStyle = fg.unlockedThisRun ? '#446677' : fg.color;
          ctx.fillStyle = fg.unlockedThisRun ? '#446677' : fg.color;
          ctx.globalAlpha = fg.unlockedThisRun ? 0.4 : 0.92;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(fg.x, fg.y, fg.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(fg.x, fg.y - 24 - pulse * 0.4);
          ctx.lineTo(fg.x + 20, fg.y);
          ctx.lineTo(fg.x, fg.y + 24 + pulse * 0.4);
          ctx.lineTo(fg.x - 20, fg.y);
          ctx.closePath();
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(fg.x, fg.y, 9, 0, Math.PI * 2);
          ctx.fill();
          if (!fg.unlockedThisRun && fg.progress > 0) {
            ctx.lineWidth = 4.5;
            ctx.beginPath();
            ctx.arc(fg.x, fg.y, fg.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, fg.progress / fg.holdRequired));
            ctx.stroke();
          }
          this._drawWorldLabel(ctx, fg.unlockedThisRun ? `${fg.label} [FORGED]` : fg.label, fg.x, fg.y - 34, fg.unlockedThisRun ? '#446677' : fg.color);
          ctx.restore();
        }
      }

      // v2.3 Mythic Super-Item Vaults
      if (!this.isDescentMode && this.world.mythicVaults) {
        const starRot = this.runTime * 1.1;
        for (const mv of this.world.mythicVaults) {
          if (mv.x + mv.radius + 60 < viewMinX || mv.x - mv.radius - 60 > viewMaxX || mv.y + mv.radius + 60 < viewMinY || mv.y - mv.radius - 60 > viewMaxY) continue;
          ctx.save();
          ctx.strokeStyle = mv.collectedThisRun ? '#446677' : mv.color;
          ctx.fillStyle = mv.collectedThisRun ? '#446677' : mv.color;
          ctx.globalAlpha = mv.collectedThisRun ? 0.35 : 0.94;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(mv.x, mv.y, mv.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          for (let k = 0; k < 8; k++) {
            const a = starRot + (Math.PI * 2 * k) / 8;
            const r = k % 2 === 0 ? 30 : 12;
            const px = mv.x + Math.cos(a) * r;
            const py = mv.y + Math.sin(a) * r;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          if (!mv.collectedThisRun && mv.progress > 0) {
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(mv.x, mv.y, mv.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, mv.progress / mv.holdRequired));
            ctx.stroke();
          }
          this._drawWorldLabel(ctx, mv.collectedThisRun ? `${mv.name.toUpperCase()} [CLAIMED]` : `MYTHIC VAULT // ${mv.name.toUpperCase()}`, mv.x, mv.y - 38, mv.collectedThisRun ? '#446677' : mv.color);
          ctx.restore();
        }
      }

      // v2.5 Outer Rim Crystal Geodes (14 nodes -> +Crystals & Modules)
      if (!this.isDescentMode && this.world.crystalGeodes) {
        const geodeRot = this.runTime * 0.9;
        for (const cg of this.world.crystalGeodes) {
          if (cg.x + cg.radius + 60 < viewMinX || cg.x - cg.radius - 60 > viewMaxX || cg.y + cg.radius + 60 < viewMinY || cg.y - cg.radius - 60 > viewMaxY) continue;
          ctx.save();
          ctx.strokeStyle = cg.collectedThisRun ? '#446677' : '#ffd700';
          ctx.fillStyle = cg.collectedThisRun ? '#446677' : '#ffd700';
          ctx.globalAlpha = cg.collectedThisRun ? 0.32 : 0.92;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(cg.x, cg.y, cg.radius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = geodeRot + (Math.PI * 2 * k) / 6;
            const r = k % 2 === 0 ? 26 : 14;
            const px = cg.x + Math.cos(a) * r;
            const py = cg.y + Math.sin(a) * r;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();

          if (!cg.collectedThisRun && cg.progress > 0) {
            ctx.lineWidth = 4.5;
            ctx.beginPath();
            ctx.arc(cg.x, cg.y, cg.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, cg.progress / cg.holdRequired));
            ctx.stroke();
          }
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(cg.collectedThisRun ? `${cg.name} [HARVESTED]` : `${cg.name} [+${cg.crystals || 1} CRYSTAL]`, cg.x, cg.y - 36);
          ctx.restore();
        }
      }

      // v2.5 Outer Rim Abyssal Anomaly Rifts (7 high-intensity nodes)
      if (!this.isDescentMode && this.world.abyssalAnomalies) {
        const riftSpin = this.runTime * 1.6;
        for (const aa of this.world.abyssalAnomalies) {
          if (aa.x + aa.radius + 60 < viewMinX || aa.x - aa.radius - 60 > viewMaxX || aa.y + aa.radius + 60 < viewMinY || aa.y - aa.radius - 60 > viewMaxY) continue;
          ctx.save();
          ctx.strokeStyle = aa.clearedThisRun ? '#445566' : '#ff33cc';
          ctx.fillStyle = aa.clearedThisRun ? '#445566' : '#ff33cc';
          ctx.globalAlpha = aa.clearedThisRun ? 0.30 : 0.88;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(aa.x, aa.y, aa.radius, 0, Math.PI * 2);
          ctx.stroke();

          if (ctx.setLineDash && !aa.clearedThisRun) ctx.setLineDash([10, 6]);
          ctx.beginPath();
          ctx.arc(aa.x, aa.y, aa.radius * 0.62, riftSpin, riftSpin + Math.PI * 1.8);
          ctx.stroke();
          if (ctx.setLineDash) ctx.setLineDash([]);

          ctx.beginPath();
          ctx.arc(aa.x, aa.y, 14, 0, Math.PI * 2);
          ctx.fill();

          if (!aa.clearedThisRun && aa.progress > 0) {
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(aa.x, aa.y, aa.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, aa.progress / aa.holdRequired));
            ctx.stroke();
          }
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(aa.clearedThisRun ? `${aa.name} [STABILIZED]` : `${aa.name} [HOLD FOR SHARD & MOD]`, aa.x, aa.y - 38);
          ctx.restore();
        }
      }

      // Outer-Rim & Boss Return Portals (Distinct Silhouettes & Exclusive Charge Focus)
      const portalList = [];
      if (this.world.rimPortals) portalList.push(...this.world.rimPortals);
      if (this.returnPortals) portalList.push(...this.returnPortals);
      if (!this.isDescentMode && portalList.length > 0) {
        const spin = this.runTime * 2.2;
        const hasAnyFocused = Boolean(this._activePortalId);
        for (const portal of portalList) {
          if (!portal || portal.consumed) continue;
          if (portal.x + portal.radius + 90 < viewMinX || portal.x - portal.radius - 90 > viewMaxX || portal.y + portal.radius + 90 < viewMinY || portal.y - portal.radius - 90 > viewMaxY) continue;
          ctx.save();
          const isOverdrive = portal.portalKind === 'overdrive';
          const isFocused = Boolean(portal._isFocused);
          const isDimmed = hasAnyFocused && !isFocused;
          const isCalibrating = (portal.spawnGrace || 0) > 0;
          const pCol = isOverdrive ? '#ff44ff' : '#00ffff';
          const pFill = isOverdrive ? 'rgba(255, 68, 255, 0.20)' : 'rgba(0, 238, 255, 0.16)';
          const baseAlpha = isDimmed ? 0.52 : 1.0;

          if (isFocused) {
            ctx.strokeStyle = '#ffffff';
            ctx.globalAlpha = 0.22;
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.arc(portal.x, portal.y, portal.radius + 13, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.strokeStyle = pCol;
          ctx.globalAlpha = 0.24 * baseAlpha;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(portal.x, portal.y, portal.radius + 6, 0, Math.PI * 2);
          ctx.stroke();

          // Distinct Polygon Frame: Octagon for Overdrive Vortex, Hexagon for Return Gate
          const sides = isOverdrive ? 8 : 6;
          const polyR = portal.radius;
          const rotOff = isOverdrive ? (spin * 0.45) : (-spin * 0.22);
          ctx.globalAlpha = baseAlpha;
          ctx.fillStyle = pFill;
          ctx.lineWidth = isFocused ? 4 : 3;
          ctx.beginPath();
          for (let s = 0; s < sides; s++) {
            const ang = rotOff + (s * Math.PI * 2) / sides;
            const vx = portal.x + Math.cos(ang) * polyR;
            const vy = portal.y + Math.sin(ang) * polyR;
            if (s === 0) ctx.moveTo(vx, vy);
            else ctx.lineTo(vx, vy);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.strokeStyle = portal.accent || '#ffffff';
          ctx.lineWidth = 2.2;
          if (isOverdrive) {
            for (let a = 0; a < 4; a++) {
              const ang = -spin * 1.35 + (a * Math.PI) / 2;
              ctx.beginPath();
              ctx.arc(portal.x, portal.y, portal.radius * 0.62, ang, ang + 0.9);
              ctx.stroke();
            }
            // Outward double chevron icon
            ctx.beginPath();
            ctx.moveTo(portal.x - 14, portal.y + 4);
            ctx.lineTo(portal.x, portal.y - 12);
            ctx.lineTo(portal.x + 14, portal.y + 4);
            ctx.moveTo(portal.x - 10, portal.y + 14);
            ctx.lineTo(portal.x, portal.y + 2);
            ctx.lineTo(portal.x + 10, portal.y + 14);
            ctx.stroke();
          } else {
            for (let a = 0; a < 3; a++) {
              const ang = spin + (a * Math.PI * 2) / 3;
              ctx.beginPath();
              ctx.arc(portal.x, portal.y, portal.radius * 0.62, ang, ang + 1.15);
              ctx.stroke();
            }
            // Home-node beacon diamond
            ctx.beginPath();
            ctx.moveTo(portal.x, portal.y - 16);
            ctx.lineTo(portal.x + 14, portal.y);
            ctx.lineTo(portal.x, portal.y + 16);
            ctx.lineTo(portal.x - 14, portal.y);
            ctx.closePath();
            ctx.stroke();
          }

          const holdReq = portal.holdRequired || 1.6;
          const pct = Math.max(0, Math.min(1, (portal.progress || 0) / holdReq));
          if (pct > 0) {
            ctx.strokeStyle = isOverdrive ? '#ffdd55' : '#ffffff';
            ctx.globalAlpha = 1;
            ctx.lineWidth = 5.5;
            ctx.beginPath();
            ctx.arc(portal.x, portal.y, portal.radius + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
            ctx.stroke();

            const barW = 92;
            const barH = 6;
            const barX = portal.x - barW * 0.5;
            const barY = portal.y - portal.radius - 30;
            ctx.fillStyle = 'rgba(4, 10, 22, 0.88)';
            ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
            ctx.fillStyle = isOverdrive ? '#ffdd55' : '#00ffff';
            ctx.fillRect(barX, barY, barW * pct, barH);
          }

          let portalHint = isOverdrive
            ? `${portal.name} [NEXT BIOME +50% LOOT]`
            : `${portal.name} [SANCTUM +20% HULL]`;
          let hintColor = isOverdrive ? '#ff99ff' : '#7df9ff';
          if (isCalibrating) {
            portalHint = `${portal.name} [CALIBRATING...]`;
            hintColor = '#94a3b8';
          } else if (isFocused && pct > 0) {
            const rem = Math.max(0.1, holdReq - (portal.progress || 0)).toFixed(1);
            portalHint = isOverdrive
              ? `ACTIVATING ${rem}s → NEXT BIOME (+50% LOOT)`
              : `ACTIVATING ${rem}s → VOID SANCTUM (+20% HULL)`;
            hintColor = isOverdrive ? '#ffdd55' : '#ffffff';
          }
          const labelY = (pct > 0) ? (portal.y - portal.radius - 36) : (portal.y - portal.radius - 16);
          this._drawWorldLabel(ctx, portalHint, portal.x, labelY, hintColor);
          ctx.restore();
        }
      }

      // Dedicated Citadel Boss Arena Dome Ring
      if (this.activeBossArena) {
        const arena = this.activeBossArena;
        ctx.save();
        ctx.strokeStyle = arena.color || '#00ffff';
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(arena.cx, arena.cy, arena.radius + 7, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(2, 6, 18, 0.28)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(arena.cx, arena.cy, arena.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        if (ctx.setLineDash) ctx.setLineDash([14, 10]);
        ctx.beginPath();
        ctx.arc(arena.cx, arena.cy, arena.radius - 14, 0, Math.PI * 2);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        this._drawWorldLabel(ctx, 'CITADEL BOSS ARENA // GROUND HAZARDS SUSPENDED', arena.cx, arena.cy - arena.radius + 24, arena.color || '#00ffff');
        ctx.restore();
      }

      // Minimalist Neon Walls & Radial Biome Dividers (O(1) spatial hash viewport query)
      const visibleWalls = this.world.getWallsInRect
        ? this.world.getWallsInRect(viewMinX, viewMinY, viewMaxX, viewMaxY)
        : this.world.walls;
      for (const w of visibleWalls) {
        if (w.maxX < viewMinX || w.minX > viewMaxX || w.maxY < viewMinY || w.minY > viewMaxY) continue;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = w.isSectorDivider ? '#33ddff' : w.color;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = w.thickness * (w.isSectorDivider ? 2.1 : 1.9);
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1);
        ctx.lineTo(w.x2, w.y2);
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.lineWidth = w.thickness * (w.isSectorDivider ? 1.55 : 1.4);
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1);
        ctx.lineTo(w.x2, w.y2);
        ctx.stroke();

        ctx.strokeStyle = w.isSectorDivider ? '#aaffff' : '#ffffff';
        ctx.lineWidth = w.isSectorDivider ? 3.0 : 2.5;
        if (w.isSectorDivider && ctx.setLineDash) ctx.setLineDash([18, 10]);
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1);
        ctx.lineTo(w.x2, w.y2);
        ctx.stroke();
        if (w.isSectorDivider && ctx.setLineDash) ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // World-space Boss Arrival Sigil during dramatic pre-fight prelude
    if (this.bossPrelude) {
      const bp = this.bossPrelude;
      const prog = 1 - Math.max(0, Math.min(1, bp.timer / (bp.maxTimer || 2.6)));
      const bCol = bp.color || '#ff0055';
      ctx.save();
      ctx.strokeStyle = bCol;
      ctx.globalAlpha = 0.35 + 0.55 * prog;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, 130 - prog * 55, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = 2;
      if (ctx.setLineDash) ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, 68 + Math.sin(this.runTime * 10) * 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
      ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);

      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(bp.x - 28, bp.y);
      ctx.lineTo(bp.x + 28, bp.y);
      ctx.moveTo(bp.x, bp.y - 28);
      ctx.lineTo(bp.x, bp.y + 28);
      ctx.stroke();
      ctx.restore();
    }

    // Tactical Formation Lattice Link Lines (visually connecting active geometric swarm)
    if (this.swarmMode === 'PATTERN' || this.swarmMode === 'CONVERGE' || this.swarmMode === 'REGROUP') {
      const members = [];
      for (const e of this.enemies) {
        if (!e.markedForDeletion && !e.isBoss && !e.retreatingForBoss && e.aggroed !== false) {
          members.push(e);
        }
      }
      if (members.length >= 2) {
        ctx.save();
        ctx.strokeStyle = this.swarmMode === 'CONVERGE' ? '#ff2255' : '#ff00ff';
        ctx.globalAlpha = this.swarmMode === 'CONVERGE' ? 0.36 : 0.26;
        ctx.lineWidth = 1.9;
        ctx.beginPath();
        for (let m = 0; m < members.length; m++) {
          const a = members[m];
          const b = members[(m + 1) % members.length];
          if (Math.hypot(a.x - b.x, a.y - b.y) <= 360) {
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // Expanding shockwaves (ambushes / elemental pulses)
    if (this.shockwaves && this.shockwaves.length > 0) {
      for (const sw of this.shockwaves) {
        const alpha = Math.max(0, sw.life / Math.max(0.05, sw.maxLife || 0.5));
        ctx.save();
        ctx.globalAlpha = alpha * 0.72;
        ctx.strokeStyle = sw.color || '#ff00ff';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, Math.max(4, sw.r), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // World-space Warp/Warden Arrival Materialization Diamond & Directional Orientation Chevron
    if (this.warpArrivalPulse && (this.warpArrivalPulse.timer || 0) > 0) {
      const wp = this.warpArrivalPulse;
      const frac = Math.max(0, Math.min(1, wp.timer / Math.max(0.08, wp.maxTimer || 0.95)));
      const wpCol = wp.color || '#00ffff';
      const outerR = 30 + 38 * frac;
      const innerR = 16 + 18 * (1 - frac);

      ctx.save();
      ctx.strokeStyle = wpCol;
      ctx.globalAlpha = 0.85 * frac;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(wp.x, wp.y - outerR);
      ctx.lineTo(wp.x + outerR, wp.y);
      ctx.lineTo(wp.x, wp.y + outerR);
      ctx.lineTo(wp.x - outerR, wp.y);
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.65 * frac;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(wp.x, wp.y - innerR);
      ctx.lineTo(wp.x + innerR, wp.y);
      ctx.lineTo(wp.x, wp.y + innerR);
      ctx.lineTo(wp.x - innerR, wp.y);
      ctx.closePath();
      ctx.stroke();

      if (this.player && Number.isFinite(this.player.x) && Number.isFinite(this.player.y)) {
        let targetX = null;
        let targetY = null;
        let chevCol = wpCol;
        if (wp.isThreat) {
          targetX = wp.x;
          targetY = wp.y;
        } else {
          const obj = this.getNearestObjective();
          if (obj && Number.isFinite(obj.x) && Number.isFinite(obj.y)) {
            targetX = obj.x;
            targetY = obj.y;
            chevCol = obj.color || wpCol;
          }
        }

        if (targetX !== null && targetY !== null) {
          const distToTarget = Math.hypot(targetX - this.player.x, targetY - this.player.y);
          if (distToTarget > 48) {
            const ang = Math.atan2(targetY - this.player.y, targetX - this.player.x);
            const baseDist = (this.player.radius || 15) + 42;
            const tipDist = baseDist + 14;
            const cx = this.player.x + Math.cos(ang) * tipDist;
            const cy = this.player.y + Math.sin(ang) * tipDist;

            if (typeof ctx.setLineDash === 'function') ctx.setLineDash([5, 5]);
            ctx.strokeStyle = chevCol;
            ctx.globalAlpha = 0.45 * frac;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(this.player.x + Math.cos(ang) * ((this.player.radius || 15) + 18), this.player.y + Math.sin(ang) * ((this.player.radius || 15) + 18));
            ctx.lineTo(this.player.x + Math.cos(ang) * baseDist, this.player.y + Math.sin(ang) * baseDist);
            ctx.stroke();
            if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);

            const wingAngle = 0.55;
            const wingLen = 13;
            ctx.strokeStyle = chevCol;
            ctx.globalAlpha = 0.92 * frac;
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            ctx.moveTo(cx - Math.cos(ang - wingAngle) * wingLen, cy - Math.sin(ang - wingAngle) * wingLen);
            ctx.lineTo(cx, cy);
            ctx.lineTo(cx - Math.cos(ang + wingAngle) * wingLen, cy - Math.sin(ang + wingAngle) * wingLen);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

    // Momentum Streak ring around player when >= 15 kills
    if ((this.killStreak || 0) >= 15 && this.player) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = this.killStreak >= 40 ? '#ff3366' : '#ffd700';
      ctx.lineWidth = 2.2;
      if (ctx.setLineDash) ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, (this.player.radius || 15) + 13, 0, Math.PI * 2);
      ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
      ctx.restore();
    }

    this.iceTrails.forEach(it => it.draw(ctx));
    this.enemyAcidPools.forEach(ap => ap.draw(ctx));
    this.acidPools.forEach(ap => ap.draw(ctx));
    this.blackHoles.forEach(bh => bh.draw(ctx));
    this.meteors.forEach(m => m.draw(ctx));
    this.xpOrbs.forEach(xp => xp.draw(ctx));
    this.bossOrbs.forEach(orb => orb.draw(ctx));
    if (this.supplyDrops) this.supplyDrops.forEach(sd => sd.draw(ctx));
    if (this.moduleDrops) this.moduleDrops.forEach(md => md.draw(ctx));
    this._drawBossTelegraphs(ctx);
    this.projectiles.forEach(p => p.draw(ctx));
    this.enemyProjectiles.forEach(p => p.draw(ctx));
    this.enemies.forEach(e => {
      const cullPad = (e._fireTelegraphProg > 0) ? 380 : 90;
      if (!e.isBoss && !e._pendingBlink && (e.x + cullPad < viewMinX || e.x - cullPad > viewMaxX || e.y + cullPad < viewMinY || e.y - cullPad > viewMaxY)) {
        return;
      }
      e.draw(ctx);
    });
    this.turrets.forEach(t => t.draw(ctx));
    this.enemyExplosions.forEach(ex => ex.draw(ctx));
    this.particles.forEach(p => p.draw(ctx));
    this.lightnings.forEach(l => l.draw(ctx));
    
    if (this.postReviveTimer > 0) {
      const revR = this.player.radius + 10 + Math.sin(this.runTime * 10) * 5;
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, revR + 3, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffff00';
      ctx.globalAlpha = 0.26;
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, revR, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    
    if (this.phasingTimer > 0) {
      ctx.globalAlpha = 0.5;
    }

    this.player.draw(ctx);
    ctx.globalAlpha = 1.0;

    if (this.floatingTexts) {
      for (let i = 0; i < this.floatingTexts.length; i++) {
        const ft = this.floatingTexts[i];
        if (!ft._stacked) {
          for (let j = 0; j < i; j++) {
            const prev = this.floatingTexts[j];
            if (Math.abs(ft.x - prev.x) < 92 && Math.abs(ft.y - prev.y) < 22) {
              ft.y -= 22;
            }
          }
          ft._stacked = true;
        }
      }
      this.floatingTexts.forEach(ft => ft.draw(ctx));
    }
    ctx.restore();

    // Screen-space Minimal Edge Beacons, Threat Edge Pings, Overlays & Mini-Radar
    this._drawEdgeBeacons(ctx, cam, vw, vh);
    this._drawThreatEdgePings(ctx, cam, vw, vh);
    this._drawScreenOverlays(ctx, vw, vh);
    this._drawMiniRadar(ctx, vw, vh);
  }

  _drawBoostStrip(ctx, bs, t) {
    const dx = bs.x2 - bs.x1;
    const dy = bs.y2 - bs.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    const halfW = (bs.width || 110) * 0.5;
    ctx.save();
    ctx.translate(bs.x1, bs.y1);
    ctx.rotate(ang);

    ctx.fillStyle = bs.color || '#00eeff';
    ctx.globalAlpha = 0.11;
    ctx.fillRect(0, -halfW, len, halfW * 2);

    ctx.strokeStyle = bs.color || '#00eeff';
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -halfW);
    ctx.lineTo(len, -halfW);
    ctx.moveTo(0, halfW);
    ctx.lineTo(len, halfW);
    ctx.stroke();

    const step = 64;
    const offset = (t * 150) % step;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    for (let x = offset; x < len - 24; x += step) {
      ctx.moveTo(x - 12, -halfW * 0.55);
      ctx.lineTo(x + 14, 0);
      ctx.lineTo(x - 12, halfW * 0.55);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawDecorProp(ctx, p, t) {
    const sc = p.scale || 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot || 0);
    ctx.scale(sc, sc);
    const col = p.color || '#00ffff';

    switch (p.kind) {
      case 'obsidian_pillar': {
        ctx.fillStyle = '#180c0a';
        ctx.strokeStyle = '#552218';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          const r = k % 2 === 0 ? 28 : 20;
          if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.65 + 0.25 * Math.sin(t * 2.5 + p.x);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-12, -6);
        ctx.lineTo(0, 2);
        ctx.lineTo(14, -4);
        ctx.moveTo(0, 2);
        ctx.lineTo(-4, 15);
        ctx.stroke();
        break;
      }
      case 'ice_crystal': {
        for (let s = -1; s <= 1; s++) {
          ctx.save();
          ctx.rotate(s * 0.45);
          ctx.fillStyle = 'rgba(40, 140, 230, 0.26)';
          ctx.strokeStyle = '#99ddff';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(0, -28 + Math.abs(s) * 6);
          ctx.lineTo(9, 0);
          ctx.lineTo(0, 16);
          ctx.lineTo(-9, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        break;
      }
      case 'pcb_node': {
        ctx.fillStyle = 'rgba(0, 28, 40, 0.72)';
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        ctx.fillRect(-14, -14, 28, 28);
        ctx.strokeRect(-14, -14, 28, 28);
        ctx.beginPath();
        ctx.moveTo(-26, -6); ctx.lineTo(-14, -6);
        ctx.moveTo(14, 6); ctx.lineTo(26, 6);
        ctx.moveTo(6, -26); ctx.lineTo(6, -14);
        ctx.moveTo(-6, 14); ctx.lineTo(-6, 26);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 4 + p.y);
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'spore_pod': {
        const pods = [[-9, 4, 11], [9, 6, 9], [0, -8, 12]];
        for (const [ox, oy, pr] of pods) {
          ctx.fillStyle = 'rgba(14, 58, 24, 0.65)';
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(ox, oy, pr, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#99ffaa';
          ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 3 + ox + p.x);
          ctx.beginPath();
          ctx.arc(ox, oy, pr * 0.32, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'blood_obelisk': {
        ctx.strokeStyle = 'rgba(255, 0, 85, 0.4)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#240410';
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, -26);
        ctx.lineTo(13, 0);
        ctx.lineTo(0, 26);
        ctx.lineTo(-13, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'astral_star': {
        const bob = Math.sin(t * 2.2 + p.x * 0.01) * 3;
        ctx.translate(0, bob);
        ctx.strokeStyle = 'rgba(255, 238, 136, 0.45)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 238, 136, 0.25)';
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4 + t * 0.4;
          const r = k % 2 === 0 ? 18 : 6;
          if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'singularity_conduit': {
        ctx.fillStyle = 'rgba(22, 4, 38, 0.78)';
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          const r = k % 2 === 0 ? 24 : 15;
          if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.48 + 0.36 * Math.sin(t * 3.4 + p.x);
        ctx.beginPath();
        ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'rift_anchor': {
        const pulse = Math.sin(t * 2.8 + p.y * 0.01) * 2.5;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        ctx.arc(0, 0, 18 + pulse * 0.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(130, 40, 255, 0.35)';
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo(14, 0);
        ctx.lineTo(0, 14);
        ctx.lineTo(-14, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'tectonic_monolith':
      default: {
        ctx.fillStyle = '#241a10';
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(-20, -8);
        ctx.lineTo(-6, -24);
        ctx.lineTo(18, -14);
        ctx.lineTo(24, 10);
        ctx.lineTo(2, 22);
        ctx.lineTo(-22, 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#ffaa44';
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(-10, -10);
        ctx.lineTo(2, 0);
        ctx.lineTo(12, 10);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  _drawBiomeGateways(ctx, viewMinX, viewMaxX, viewMinY, viewMaxY, t) {
    for (const gw of this.world.biomeGateways) {
      if (gw.x + 420 < viewMinX || gw.x - 420 > viewMaxX || gw.y + 420 < viewMinY || gw.y - 420 > viewMaxY) continue;
      const ux = Math.cos(gw.angle);
      const uy = Math.sin(gw.angle);
      const px = -uy;
      const py = ux;
      const span = 240;
      const lx = gw.x - px * span;
      const ly = gw.y - py * span;
      const rx = gw.x + px * span;
      const ry = gw.y + py * span;

      ctx.save();
      ctx.strokeStyle = gw.color;
      ctx.globalAlpha = 0.32 + 0.12 * Math.sin(t * 2.5);
      ctx.lineWidth = 3;
      if (ctx.setLineDash) ctx.setLineDash([14, 10]);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(rx, ry);
      ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);

      for (const [gx, gy] of [[lx, ly], [rx, ry]]) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#040a16';
        ctx.strokeStyle = gw.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3 + t * 0.4;
          const vx = gx + Math.cos(a) * 22;
          const vy = gy + Math.sin(a) * 22;
          if (k === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      const labelX = gw.x + ux * 40;
      const labelY = gw.y + uy * 40;
      ctx.globalAlpha = 0.95;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      if (typeof ctx.strokeText === 'function') {
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = 'rgba(2, 6, 16, 0.90)';
        ctx.strokeText(`${gw.name} • ${gw.levelLabel}`, labelX, labelY);
      }
      ctx.fillStyle = gw.color;
      ctx.fillText(`${gw.name} • ${gw.levelLabel}`, labelX, labelY);
      ctx.restore();
    }
  }

  _drawWorldHazard(ctx, h, t) {
    const r = h.radius || 220;
    const isActive = h.state === 'active';
    const isTelegraph = h.state === 'telegraph';
    const intensity = isActive ? 1.0 : (isTelegraph ? 0.65 : 0.35);

    ctx.save();
    ctx.translate(h.x, h.y);

    switch (h.kind) {
      case 'magma_vent': {
        // Volcanic basalt crater + branching glowing magma cracks + rising bubbles
        ctx.fillStyle = '#180806';
        ctx.strokeStyle = isActive ? '#ff6622' : '#552211';
        ctx.lineWidth = isActive ? 4 : 2.5;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        for (let k = 0; k < 12; k++) {
          const a = (k * Math.PI * 2) / 12;
          const cr = r * (0.90 + 0.08 * Math.sin(k * 2.7 + h.x));
          if (k === 0) ctx.moveTo(Math.cos(a) * cr, Math.sin(a) * cr);
          else ctx.lineTo(Math.cos(a) * cr, Math.sin(a) * cr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const grad = ctx.createRadialGradient(0, 0, r * 0.08, 0, 0, r * 0.72);
        grad.addColorStop(0, isActive ? 'rgba(255, 220, 90, 0.68)' : 'rgba(255, 80, 20, 0.34)');
        grad.addColorStop(0.55, isActive ? 'rgba(255, 68, 20, 0.42)' : 'rgba(180, 36, 12, 0.16)');
        grad.addColorStop(1, 'rgba(30, 8, 4, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
        ctx.fill();

        // Branching magma cracks
        ctx.strokeStyle = isActive ? '#ffdd66' : '#ff5511';
        ctx.lineWidth = isActive ? 3 : 1.8;
        ctx.globalAlpha = isActive ? 0.95 : (isTelegraph ? 0.75 : 0.45);
        for (let k = 0; k < 7; k++) {
          const a = (k * Math.PI * 2) / 7 + 0.25;
          const midA = a + Math.sin(k * 3.1) * 0.16;
          const x1 = Math.cos(a) * r * 0.20;
          const y1 = Math.sin(a) * r * 0.20;
          const xm = Math.cos(midA) * r * 0.52;
          const ym = Math.sin(midA) * r * 0.52;
          const x2 = Math.cos(a - 0.08) * r * 0.86;
          const y2 = Math.sin(a - 0.08) * r * 0.86;
          const xb = Math.cos(midA + 0.24) * r * 0.76;
          const yb = Math.sin(midA + 0.24) * r * 0.76;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(xm, ym);
          ctx.lineTo(x2, y2);
          ctx.moveTo(xm, ym);
          ctx.lineTo(xb, yb);
          ctx.stroke();
        }

        // Rising magma bubbles
        for (let b = 0; b < 5; b++) {
          const cycle = (t * (isActive ? 1.4 : 0.75) + b * 0.23) % 1;
          const ba = b * 1.35 + h.y * 0.01;
          const bd = r * 0.15 + cycle * r * 0.42;
          const br = 4 + cycle * 9;
          ctx.strokeStyle = '#ffaa33';
          ctx.lineWidth = 1.6;
          ctx.globalAlpha = (1 - cycle) * intensity;
          ctx.beginPath();
          ctx.arc(Math.cos(ba) * bd, Math.sin(ba) * bd, br, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 'cryo_patch': {
        // Faceted crystal sheet + 6-branch snowflake lattice + sheen
        ctx.fillStyle = 'rgba(12, 52, 92, 0.44)';
        ctx.strokeStyle = '#66ccff';
        ctx.lineWidth = 2.2;
        ctx.globalAlpha = 0.82;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4 + 0.2;
          const cr = r * (k % 2 === 0 ? 0.96 : 0.84);
          if (k === 0) ctx.moveTo(Math.cos(a) * cr, Math.sin(a) * cr);
          else ctx.lineTo(Math.cos(a) * cr, Math.sin(a) * cr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Facet lines
        ctx.strokeStyle = 'rgba(180, 235, 255, 0.25)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a1 = (k * Math.PI) / 2 + 0.2;
          const a2 = a1 + Math.PI * 0.75;
          ctx.moveTo(Math.cos(a1) * r * 0.82, Math.sin(a1) * r * 0.82);
          ctx.lineTo(Math.cos(a2) * r * 0.82, Math.sin(a2) * r * 0.82);
        }
        ctx.stroke();

        // 6-branch snowflake lattice
        ctx.strokeStyle = '#aae8ff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          ctx.moveTo(0, 0);
          ctx.lineTo(ca * r * 0.84, sa * r * 0.84);
          for (const frac of [0.42, 0.68]) {
            const bx = ca * r * frac;
            const by = sa * r * frac;
            const bLen = r * 0.16;
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + Math.cos(a + 0.65) * bLen, by + Math.sin(a + 0.65) * bLen);
            ctx.moveTo(bx, by);
            ctx.lineTo(bx + Math.cos(a - 0.65) * bLen, by + Math.sin(a - 0.65) * bLen);
          }
        }
        ctx.stroke();

        // Specular ice sheen sweep
        const sweep = Math.sin(t * 1.4 + h.x * 0.01) * r * 0.45;
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(sweep - r * 0.35, -r * 0.45);
        ctx.lineTo(sweep + r * 0.35, r * 0.45);
        ctx.stroke();
        break;
      }
      case 'arc_pylon': {
        // Tri-pylon capacitor + live jagged arcs
        ctx.strokeStyle = h.color;
        ctx.globalAlpha = isActive ? 0.85 : (isTelegraph ? 0.55 : 0.24);
        ctx.lineWidth = isActive ? 3 : 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();

        const pylons = [];
        for (let k = 0; k < 3; k++) {
          const a = (k * Math.PI * 2) / 3 + t * 0.18;
          pylons.push({ x: Math.cos(a) * r * 0.66, y: Math.sin(a) * r * 0.66 });
        }

        // Jagged arcs between pylons and core
        const tick = Math.floor(t * (isActive ? 22 : 12));
        const drawArcSeg = (ax, ay, bx, by, seed) => {
          const segs = 5;
          const dx = bx - ax;
          const dy = by - ay;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          for (let s = 1; s < segs; s++) {
            const frac = s / segs;
            const jitter = Math.sin(tick * 3.7 + s * 5.3 + seed) * (isActive ? 16 : 9);
            ctx.lineTo(ax + dx * frac + nx * jitter, ay + dy * frac + ny * jitter);
          }
          ctx.lineTo(bx, by);
          ctx.stroke();
        };

        ctx.strokeStyle = isActive ? '#ffffff' : '#00eeff';
        ctx.lineWidth = isActive ? 3 : 1.8;
        ctx.globalAlpha = isActive ? 0.95 : (isTelegraph ? 0.82 : 0.45);
        for (let k = 0; k < 3; k++) {
          const pA = pylons[k];
          const pB = pylons[(k + 1) % 3];
          drawArcSeg(pA.x, pA.y, pB.x, pB.y, k + 1);
          if (isTelegraph || isActive) {
            drawArcSeg(pA.x, pA.y, 0, 0, k + 10);
          }
        }

        for (const py of pylons) {
          ctx.fillStyle = '#061a24';
          ctx.strokeStyle = '#00eeff';
          ctx.lineWidth = 2.2;
          ctx.globalAlpha = 0.92;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k * Math.PI) / 3;
            const px = py.x + Math.cos(a) * 18;
            const ppy = py.y + Math.sin(a) * 18;
            if (k === 0) ctx.moveTo(px, ppy);
            else ctx.lineTo(px, ppy);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isActive ? '#ffffff' : '#00eeff';
          ctx.beginPath();
          ctx.arc(py.x, py.y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'miasma_pool': {
        // Multi-lobe toxic bog + bubbles
        const lobes = [
          [0, 0, r * 0.62],
          [r * 0.40, -r * 0.14, r * 0.52],
          [-r * 0.36, -r * 0.24, r * 0.50],
          [-r * 0.32, r * 0.32, r * 0.50],
          [r * 0.28, r * 0.34, r * 0.48],
          [0, -r * 0.42, r * 0.46]
        ];
        ctx.fillStyle = 'rgba(8, 42, 16, 0.56)';
        ctx.strokeStyle = '#33ff66';
        ctx.lineWidth = 2;
        for (const [lx, ly, lr] of lobes) {
          ctx.globalAlpha = 0.45;
          ctx.beginPath();
          ctx.arc(lx, ly, lr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.68;
        for (const [lx, ly, lr] of lobes) {
          ctx.beginPath();
          ctx.arc(lx, ly, lr, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Caustic ripples & popping spore bubbles
        ctx.strokeStyle = '#66ff99';
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.32 + 0.12 * Math.sin(t * 2)), 0, Math.PI * 2);
        ctx.stroke();
        for (let b = 0; b < 6; b++) {
          const prog = (t * 0.7 + b * 0.17) % 1;
          const ba = b * 1.1 + h.x * 0.01;
          const bd = r * (0.14 + 0.55 * ((b * 0.37) % 1));
          ctx.fillStyle = 'rgba(102, 255, 136, 0.35)';
          ctx.strokeStyle = '#99ffaa';
          ctx.globalAlpha = (1 - prog) * 0.85;
          ctx.beginPath();
          ctx.arc(Math.cos(ba) * bd, Math.sin(ba) * bd, 4 + prog * 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        break;
      }
      case 'sanguine_altar': {
        // Rotating double-hexagram + crimson nodes
        ctx.fillStyle = 'rgba(32, 4, 14, 0.52)';
        ctx.strokeStyle = '#ff0055';
        ctx.lineWidth = 2.2;
        ctx.globalAlpha = 0.78;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.94, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const drawHexagram = (rad, rot, col, lw) => {
          ctx.strokeStyle = col;
          ctx.lineWidth = lw;
          for (let tri = 0; tri < 2; tri++) {
            ctx.beginPath();
            for (let v = 0; v < 3; v++) {
              const a = rot + (tri * Math.PI) / 3 + (v * Math.PI * 2) / 3;
              const px = Math.cos(a) * rad;
              const py = Math.sin(a) * rad;
              if (v === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
          }
        };
        ctx.globalAlpha = 0.85;
        drawHexagram(r * 0.82, t * 0.32, '#ff0055', 2);
        drawHexagram(r * 0.50, -t * 0.52, '#ff6688', 1.6);

        for (let k = 0; k < 6; k++) {
          const a = t * 0.32 + (k * Math.PI) / 3;
          ctx.fillStyle = '#ff2266';
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, 7, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#ff0055';
        ctx.globalAlpha = 0.45 + 0.3 * Math.sin(t * 4);
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'solar_flare': {
        // Golden astrolabe rings + 8 sun-rays
        ctx.fillStyle = 'rgba(42, 34, 6, 0.32)';
        ctx.strokeStyle = '#ffee88';
        ctx.lineWidth = 2;
        ctx.globalAlpha = isActive ? 0.92 : (isTelegraph ? 0.72 : 0.45);
        for (const [ringR, spd] of [[r * 0.90, 0.25], [r * 0.62, -0.4], [r * 0.34, 0.65]]) {
          ctx.beginPath();
          ctx.arc(0, 0, ringR, 0, Math.PI * 2);
          ctx.stroke();
          for (let n = 0; n < 8; n++) {
            const a = t * spd + (n * Math.PI) / 4;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * (ringR - 6), Math.sin(a) * (ringR - 6));
            ctx.lineTo(Math.cos(a) * (ringR + 6), Math.sin(a) * (ringR + 6));
            ctx.stroke();
          }
        }
        ctx.fillStyle = isActive ? 'rgba(255, 245, 170, 0.55)' : 'rgba(255, 230, 120, 0.24)';
        for (let k = 0; k < 8; k++) {
          const a = t * 0.25 + (k * Math.PI) / 4;
          const tipR = r * (isActive ? 1.02 : (isTelegraph ? 0.92 : 0.78));
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - 0.10) * r * 0.28, Math.sin(a - 0.10) * r * 0.28);
          ctx.lineTo(Math.cos(a) * tipR, Math.sin(a) * tipR);
          ctx.lineTo(Math.cos(a + 0.10) * r * 0.28, Math.sin(a + 0.10) * r * 0.28);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        break;
      }
      case 'seismic_fault':
      default: {
        // Shifting octagonal rock plates + amber cracks
        const shake = (isTelegraph || isActive) ? Math.sin(t * 28) * 5 : 0;
        const plates = 6;
        for (let k = 0; k < plates; k++) {
          const a0 = (k * Math.PI * 2) / plates + 0.08;
          const a1 = ((k + 1) * Math.PI * 2) / plates - 0.08;
          const am = (a0 + a1) * 0.5;
          const shift = (isActive ? 14 : (isTelegraph ? 7 : 3)) + shake * (k % 2 === 0 ? 1 : -1);
          const ox = Math.cos(am) * shift;
          const oy = Math.sin(am) * shift;
          ctx.fillStyle = '#20160c';
          ctx.strokeStyle = isActive ? '#ffbb55' : '#cc8844';
          ctx.lineWidth = isActive ? 2.6 : 1.8;
          ctx.globalAlpha = 0.88;
          ctx.beginPath();
          ctx.moveTo(ox + Math.cos(am) * r * 0.18, oy + Math.sin(am) * r * 0.18);
          ctx.lineTo(ox + Math.cos(a0) * r * 0.86, oy + Math.sin(a0) * r * 0.86);
          ctx.lineTo(ox + Math.cos(am) * r * 0.94, oy + Math.sin(am) * r * 0.94);
          ctx.lineTo(ox + Math.cos(a1) * r * 0.86, oy + Math.sin(a1) * r * 0.86);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.strokeStyle = isActive ? '#ffdd77' : '#ff9933';
        ctx.lineWidth = isActive ? 3 : 1.8;
        ctx.globalAlpha = isActive ? 0.95 : (isTelegraph ? 0.8 : 0.48);
        for (let k = 0; k < plates; k++) {
          const a = (k * Math.PI * 2) / plates;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a + 0.04) * r * 0.45, Math.sin(a + 0.04) * r * 0.45);
          ctx.lineTo(Math.cos(a) * r * 0.90, Math.sin(a) * r * 0.90);
          ctx.stroke();
        }
        break;
      }
    }

    if (isTelegraph) {
      ctx.strokeStyle = h.color;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 2;
      if (ctx.setLineDash) ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.58, 0, Math.PI * 2);
      ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
    }
    ctx.restore();
  }

  _drawWorldLabel(ctx, text, x, y, color = '#ffffff', bgAlpha = 0.78) {
    ctx.save();
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    const measured = typeof ctx.measureText === 'function' ? ctx.measureText(text).width : text.length * 7.2;
    const pw = measured + 14;
    ctx.fillStyle = `rgba(3, 7, 18, ${bgAlpha})`;
    ctx.fillRect(x - pw / 2, y - 12, pw, 17);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.60;
    ctx.lineWidth = 1.1;
    ctx.strokeRect(x - pw / 2, y - 12, pw, 17);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }

  getHudSafeTop(vh = 900) {
    let hudTopPx = 72;
    if (typeof document !== 'undefined' && document.querySelector && this.canvas && this.canvas.getBoundingClientRect) {
      const hudBar = document.querySelector('#inGameHud .hud-top');
      const cRect = this.canvas.getBoundingClientRect();
      if (hudBar && hudBar.getBoundingClientRect && cRect.height > 0 && vh > 0) {
        const hRect = hudBar.getBoundingClientRect();
        if (hRect.height > 0) {
          const mappedBottom = ((hRect.bottom - cRect.top) / cRect.height) * vh;
          if (Number.isFinite(mappedBottom) && mappedBottom > 0) {
            hudTopPx = Math.max(hudTopPx, Math.ceil(mappedBottom) + 8);
          }
        }
      }
    }
    const proportionalMin = Math.round(Math.max(72, Math.min(118, vh * 0.088)));
    return Math.max(hudTopPx, proportionalMin);
  }

  getNearestObjective() {
    if (!this.world || !this.player || this.isDescentMode) return null;
    const px = this.player.x;
    const py = this.player.y;
    const distFromSanctum = Math.hypot(px - this.world.center, py - this.world.center);
    const inSanctum = distFromSanctum <= (this.world.sanctumRadius || 1300) + 60;

    if (this.signalCourier && !this.signalCourier.markedForDeletion && this.signalCourier.hp > 0) {
      const d = Math.hypot(this.signalCourier.x - px, this.signalCourier.y - py);
      return { label: 'SIGNAL COURIER', dist: d, color: '#ffd700', x: this.signalCourier.x, y: this.signalCourier.y };
    }

    if (this.player.hp < (this.player.maxHp || 100) * 0.35 && !inSanctum) {
      const portals = [...(this.returnPortals || []), ...(this.world.rimPortals || [])];
      let bestP = null;
      let bestPd = Infinity;
      for (const p of portals) {
        if (!p || p.consumed) continue;
        const d = Math.hypot(p.x - px, p.y - py);
        if (d < bestPd) { bestPd = d; bestP = p; }
      }
      if (bestP && bestPd <= 5500) {
        return { label: 'RETURN PORTAL', dist: bestPd, color: '#00ffff', x: bestP.x, y: bestP.y };
      }
    }

    if (inSanctum && this.world.sectorDefs && this.world.sectorDefs.length > 0) {
      const em = this.world.sectorDefs[0];
      const d = Math.hypot((this.world.center + Math.cos(em.angle) * 1300) - px, (this.world.center + Math.sin(em.angle) * 1300) - py);
      return { label: `NORTH: ${em.name} (${em.levelLabel})`, dist: d, color: em.color, x: this.world.center, y: this.world.center - 1300 };
    }

    let best = null;
    let bestD = Infinity;
    const check = (x, y, label, color) => {
      const d = Math.hypot(x - px, y - py);
      if (d < bestD) { bestD = d; best = { label, dist: d, color, x, y }; }
    };
    if (this.world.monoliths) {
      for (const m of this.world.monoliths) {
        const conquered = m.state === 'conquered' || (typeof Meta !== 'undefined' && Meta.isSectorConquered && Meta.isSectorConquered(m.element));
        if (!conquered) check(m.x, m.y, `${m.element.toUpperCase()} CITADEL`, m.color);
      }
    }
    if (this.world.strongholds) {
      for (const sh of this.world.strongholds) {
        if (!sh.capturedThisRun && Math.hypot(sh.x - px, sh.y - py) <= 6000) {
          check(sh.x, sh.y, 'WARBAND STRONGHOLD', sh.color || '#ff4422');
        }
      }
    }
    if (this.world.extractorRigs) {
      for (const rig of this.world.extractorRigs) {
        if (!rig.capturedThisRun && Math.hypot(rig.x - px, rig.y - py) <= 4500) {
          check(rig.x, rig.y, 'VOID EXTRACTOR', rig.color || '#00eeff');
        }
      }
    }
    return best;
  }

  _getDescentDepthTheme() {
    const idx = Math.floor((Math.max(1, this.descentDepth || 1) - 1) / 5) % 4;
    if (idx === 1) return { primary: '#ff2266', secondary: '#ff6622', grid: '#ff4477', name: 'CRIMSON COLLAPSE' };
    if (idx === 2) return { primary: '#9944ff', secondary: '#00eeff', grid: '#aa66ff', name: 'ULTRAVIOLET RIFT' };
    if (idx === 3) return { primary: '#ffaa00', secondary: '#ff22cc', grid: '#ffbb33', name: 'SOLAR SINGULARITY' };
    return { primary: '#ff22ee', secondary: '#8833ff', grid: '#d944ff', name: 'EVENT HORIZON' };
  }

  _drawDescentArenaGround(ctx, cam, vw, vh, viewMinX, viewMaxX, viewMinY, viewMaxY) {
    if (!this.world) return;
    const cx = this.world.center;
    const cy = this.world.center;
    const poly = this.world.descentPolygon || [];
    const theme = this._getDescentDepthTheme();
    const t = this.runTime || 0;
    const half = (this.descentBoundSize || this.world.descentBoundSize || 2600) * 0.5;

    // Layer 1: Deep obsidian outer void + drifting rift-ember parallax stars
    ctx.save();
    ctx.fillStyle = '#020109';
    ctx.fillRect(viewMinX, viewMinY, viewMaxX - viewMinX, viewMaxY - viewMinY);
    ctx.restore();

    const emberLayers = [
      { factor: 0.72, cell: 300, size: 1.9, alpha: 0.25, color: theme.secondary },
      { factor: 0.88, cell: 220, size: 2.4, alpha: 0.36, color: theme.primary }
    ];
    for (let li = 0; li < emberLayers.length; li++) {
      const layer = emberLayers[li];
      const shiftX = cam.x * (1 - layer.factor);
      const shiftY = cam.y * (1 - layer.factor);
      const lx0 = Math.floor((viewMinX - shiftX) / layer.cell);
      const lx1 = Math.ceil((viewMaxX - shiftX) / layer.cell);
      const ly0 = Math.floor((viewMinY - shiftY) / layer.cell);
      const ly1 = Math.ceil((viewMaxY - shiftY) / layer.cell);
      ctx.save();
      ctx.fillStyle = layer.color;
      ctx.globalAlpha = layer.alpha;
      for (let gx = lx0; gx <= lx1; gx++) {
        for (let gy = ly0; gy <= ly1; gy++) {
          const h1 = Math.sin(gx * 137.3 + gy * 293.7 + li * 41.1) * 43758.5453;
          const h2 = Math.sin(gx * 251.9 + gy * 179.1 + li * 23.7) * 28461.1234;
          const fx = h1 - Math.floor(h1);
          const fy = h2 - Math.floor(h2);
          ctx.fillRect(shiftX + (gx + fx) * layer.cell, shiftY + (gy + fy) * layer.cell, layer.size, layer.size);
        }
      }
      ctx.restore();
    }

    const traceOctagon = () => {
      ctx.beginPath();
      if (poly.length >= 3) {
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.closePath();
      } else {
        ctx.rect(cx - half, cy - half, half * 2, half * 2);
      }
    };

    // Layer 2: Crucible floor fill + ambient radial depth gradient
    ctx.save();
    traceOctagon();
    ctx.fillStyle = '#070314';
    ctx.fill();
    if (typeof ctx.createRadialGradient === 'function') {
      const grad = ctx.createRadialGradient(cx, cy, 40, cx, cy, half * 0.98);
      grad.addColorStop(0, theme.primary);
      grad.addColorStop(0.55, theme.secondary);
      grad.addColorStop(1, 'rgba(4, 1, 14, 0)');
      ctx.globalAlpha = 0.11;
      ctx.fillStyle = grad;
      traceOctagon();
      ctx.fill();
    }
    ctx.restore();

    // Layer 3: Clipped Crucible interior floor geometry (diamond lattice, gravity rings, core vortex, pylon pads)
    ctx.save();
    if (typeof ctx.clip === 'function') {
      traceOctagon();
      ctx.clip();
    }

    // 45-degree rotated diamond energy lattice (distinct from Sanctum orthogonal grid)
    const span = half * 2 + 200;
    const step = 190;
    ctx.strokeStyle = theme.grid;
    ctx.globalAlpha = 0.11;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let u = -span; u <= span; u += step) {
      ctx.moveTo(cx + u - span, cy - span);
      ctx.lineTo(cx + u + span, cy + span);
      ctx.moveTo(cx + u + span, cy - span);
      ctx.lineTo(cx + u - span, cy + span);
    }
    ctx.stroke();

    // Radial containment vectors to vertices
    if (poly.length > 0) {
      ctx.strokeStyle = theme.secondary;
      ctx.globalAlpha = 0.11;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const pt of poly) {
        const vx = pt.x - cx;
        const vy = pt.y - cy;
        const len = Math.hypot(vx, vy) || 1;
        ctx.moveTo(cx + (vx / len) * 220, cy + (vy / len) * 220);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }

    // Concentric gravitational harmonic rings
    const ringSpecs = [
      { r: 220, col: theme.primary, alpha: 0.22, dash: false },
      { r: 520, col: theme.secondary, alpha: 0.16, dash: false },
      { r: 740, col: theme.primary, alpha: 0.19, dash: true },
      { r: 920, col: theme.secondary, alpha: 0.15, dash: false },
      { r: 1180, col: theme.primary, alpha: 0.13, dash: false }
    ];
    for (const rg of ringSpecs) {
      if (cx + rg.r + 30 < viewMinX || cx - rg.r - 30 > viewMaxX || cy + rg.r + 30 < viewMinY || cy - rg.r - 30 > viewMaxY) continue;
      ctx.strokeStyle = rg.col;
      ctx.globalAlpha = rg.alpha;
      ctx.lineWidth = 1.8;
      if (rg.dash && typeof ctx.setLineDash === 'function') ctx.setLineDash([14, 12]);
      ctx.beginPath();
      ctx.arc(cx, cy, rg.r, 0, Math.PI * 2);
      ctx.stroke();
      if (rg.dash && typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
    }

    // Central Singularity Core Vortex & Floor Watermark
    if (cx + 220 >= viewMinX && cx - 220 <= viewMaxX && cy + 220 >= viewMinY && cy - 220 <= viewMaxY) {
      ctx.fillStyle = '#02000a';
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.arc(cx, cy, 102, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = theme.primary;
      ctx.globalAlpha = 0.55 + 0.2 * Math.sin(t * 2.6);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(cx, cy, 104, 0, Math.PI * 2);
      ctx.stroke();

      if (typeof ctx.setLineDash === 'function') ctx.setLineDash([24, 16]);
      ctx.strokeStyle = theme.secondary;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      for (let a = 0; a < 3; a++) {
        const sAng = t * 0.45 + (a * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 134, sAng, sAng + 1.35);
        ctx.stroke();
      }
      ctx.strokeStyle = theme.primary;
      ctx.globalAlpha = 0.36;
      for (let a = 0; a < 4; a++) {
        const sAng = -t * 0.32 + (a * Math.PI * 2) / 4;
        ctx.beginPath();
        ctx.arc(cx, cy, 174, sAng, sAng + 1.05);
        ctx.stroke();
      }
      if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);

      ctx.textAlign = 'center';
      ctx.fillStyle = theme.primary;
      ctx.globalAlpha = 0.28;
      ctx.font = 'bold 12px monospace';
      ctx.fillText('SINGULARITY CRUCIBLE', cx, cy - 6);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px monospace';
      ctx.fillText(`DEPTH ${this.descentDepth || 1}`, cx, cy + 14);
    }

    // Cover Pylon Foundation Anchor Pads underneath solid cover walls
    if (this.world.descentPillars) {
      for (const pil of this.world.descentPillars) {
        if (pil.x + 140 < viewMinX || pil.x - 140 > viewMaxX || pil.y + 140 < viewMinY || pil.y - 140 > viewMaxY) continue;
        ctx.save();
        ctx.translate(pil.x, pil.y);
        ctx.rotate(pil.angle || 0);
        const spanW = (pil.halfSpan || 84) + 14;
        ctx.fillStyle = 'rgba(20, 6, 36, 0.72)';
        ctx.strokeStyle = pil.color || theme.primary;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.6;
        ctx.fillRect(-30, -spanW, 60, spanW * 2);
        ctx.strokeRect(-30, -spanW, 60, spanW * 2);
        ctx.restore();
      }
    }
    ctx.restore();

    // Layer 4: Luminous Octagonal Containment Rim (Vector-Halo)
    ctx.save();
    traceOctagon();
    ctx.strokeStyle = theme.primary;
    ctx.lineWidth = 13;
    ctx.globalAlpha = 0.22;
    ctx.stroke();

    ctx.lineWidth = 7;
    ctx.globalAlpha = 0.9;
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.82;
    ctx.stroke();
    ctx.restore();
  }

  _drawTexturedGround(ctx, cam, vw, vh, viewMinX, viewMaxX, viewMinY, viewMaxY, sec) {
    const secCol = (sec && sec.color) ? sec.color : '#00ffff';

    // Subtle radial ambient biome floor glow under camera
    ctx.save();
    if (typeof ctx.createRadialGradient === 'function') {
      const camZoom = Math.max(0.70, Math.min(1.0, (cam && Number.isFinite(cam.zoom)) ? cam.zoom : 1.0));
      const grad = ctx.createRadialGradient(cam.x, cam.y, 40, cam.x, cam.y, (Math.max(vw, vh) * 0.75) / camZoom);
      grad.addColorStop(0, secCol);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalAlpha = 0.055;
      ctx.fillStyle = grad;
      ctx.fillRect(viewMinX, viewMinY, viewMaxX - viewMinX, viewMaxY - viewMinY);
    }
    ctx.restore();

    // Parallax void dust / stars (creates clear velocity & motion feel)
    const parallaxLayers = [
      { factor: 0.72, cell: 320, size: 1.8, alpha: 0.24 },
      { factor: 0.88, cell: 240, size: 2.3, alpha: 0.34 }
    ];
    for (let li = 0; li < parallaxLayers.length; li++) {
      const layer = parallaxLayers[li];
      const shiftX = cam.x * (1 - layer.factor);
      const shiftY = cam.y * (1 - layer.factor);
      const lx0 = Math.floor((viewMinX - shiftX) / layer.cell);
      const lx1 = Math.ceil((viewMaxX - shiftX) / layer.cell);
      const ly0 = Math.floor((viewMinY - shiftY) / layer.cell);
      const ly1 = Math.ceil((viewMaxY - shiftY) / layer.cell);
      ctx.save();
      ctx.fillStyle = li === 1 ? secCol : '#9be8ff';
      ctx.globalAlpha = layer.alpha;
      for (let gx = lx0; gx <= lx1; gx++) {
        for (let gy = ly0; gy <= ly1; gy++) {
          const h1 = Math.sin(gx * 127.1 + gy * 311.7 + li * 53.3) * 43758.5453;
          const h2 = Math.sin(gx * 269.5 + gy * 183.3 + li * 19.7) * 28461.1234;
          const fx = h1 - Math.floor(h1);
          const fy = h2 - Math.floor(h2);
          const px = shiftX + (gx + fx) * layer.cell;
          const py = shiftY + (gy + fy) * layer.cell;
          ctx.fillRect(px, py, layer.size, layer.size);
        }
      }
      ctx.restore();
    }

    // Textured 180px floor tiles + 360px crosshair ticks + subtle alternating plates
    const gridStep = 180;
    const startX = Math.max(0, Math.floor(viewMinX / gridStep) * gridStep);
    const endX = Math.min(this.world.size, Math.ceil(viewMaxX / gridStep) * gridStep);
    const startY = Math.max(0, Math.floor(viewMinY / gridStep) * gridStep);
    const endY = Math.min(this.world.size, Math.ceil(viewMaxY / gridStep) * gridStep);

    ctx.save();
    ctx.strokeStyle = secCol;
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = startX; gx <= endX; gx += gridStep) {
      ctx.moveTo(gx, startY);
      ctx.lineTo(gx, endY);
    }
    for (let gy = startY; gy <= endY; gy += gridStep) {
      ctx.moveTo(startX, gy);
      ctx.lineTo(endX, gy);
    }
    ctx.stroke();

    ctx.globalAlpha = 0.24;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let gx = startX; gx <= endX; gx += gridStep) {
      if ((Math.round(gx / gridStep) & 1) !== 0) continue;
      for (let gy = startY; gy <= endY; gy += gridStep) {
        if ((Math.round(gy / gridStep) & 1) !== 0) continue;
        ctx.moveTo(gx - 7, gy);
        ctx.lineTo(gx + 7, gy);
        ctx.moveTo(gx, gy - 7);
        ctx.lineTo(gx, gy + 7);
      }
    }
    ctx.stroke();

    ctx.globalAlpha = 0.045;
    ctx.fillStyle = secCol;
    for (let gx = startX; gx < endX; gx += gridStep) {
      const ix = Math.round(gx / gridStep);
      for (let gy = startY; gy < endY; gy += gridStep) {
        const iy = Math.round(gy / gridStep);
        if (((ix + iy) & 1) === 0 && ((ix * 3 + iy) % 5 === 0)) {
          ctx.fillRect(gx + 6, gy + 6, gridStep - 12, gridStep - 12);
        }
      }
    }

    // World outer boundary
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, this.world.size, this.world.size);

    // Sanctum perimeter ring & Megalattice ring boundaries
    const sRad = this.world.sanctumRadius || 1300;
    if (
      this.world.center + sRad + 50 >= viewMinX &&
      this.world.center - sRad - 50 <= viewMaxX &&
      this.world.center + sRad + 50 >= viewMinY &&
      this.world.center - sRad - 50 <= viewMaxY
    ) {
      ctx.globalAlpha = 0.26;
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(this.world.center, this.world.center, sRad, 0, Math.PI * 2);
      ctx.stroke();

      if (this.world.sectorDefs) {
        for (const def of this.world.sectorDefs) {
          ctx.strokeStyle = def.color || '#00ffff';
          ctx.globalAlpha = 0.18;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(this.world.center + Math.cos(def.angle) * 140, this.world.center + Math.sin(def.angle) * 140);
          ctx.lineTo(this.world.center + Math.cos(def.angle) * (sRad - 40), this.world.center + Math.sin(def.angle) * (sRad - 40));
          ctx.stroke();
        }
      }
    }
    const ringGuides = [
      { r: 14500, color: '#00ffff', alpha: 0.10 },
      { r: 26500, color: '#ff00ff', alpha: 0.10 },
      { r: 39000, color: '#ffd700', alpha: 0.12 }
    ];
    for (const rg of ringGuides) {
      if (
        this.world.center + rg.r + 40 < viewMinX ||
        this.world.center - rg.r - 40 > viewMaxX ||
        this.world.center + rg.r + 40 < viewMinY ||
        this.world.center - rg.r - 40 > viewMaxY
      ) continue;
      ctx.globalAlpha = rg.alpha;
      ctx.strokeStyle = rg.color;
      ctx.lineWidth = 2;
      if (ctx.setLineDash) ctx.setLineDash([18, 18]);
      ctx.beginPath();
      ctx.arc(this.world.center, this.world.center, rg.r, 0, Math.PI * 2);
      ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
    }
    ctx.restore();
  }

  _drawSanctumCenterSignposts(ctx, viewMinX, viewMaxX, viewMinY, viewMaxY) {
    if (!this.world || !this.world.sectorDefs) return;
    const cx = this.world.center;
    const cy = this.world.center;
    if (cx + 420 < viewMinX || cx - 420 > viewMaxX || cy + 420 < viewMinY || cy - 420 > viewMaxY) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 238, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 155, 0, Math.PI * 2);
    ctx.stroke();

    for (const def of this.world.sectorDefs) {
      const ang = def.angle;
      const ax = cx + Math.cos(ang) * 135;
      const ay = cy + Math.sin(ang) * 135;
      const tx = cx + Math.cos(ang) * 182;
      const ty = cy + Math.sin(ang) * 182;

      ctx.strokeStyle = def.color || '#00ffff';
      ctx.fillStyle = def.color || '#00ffff';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(tx + Math.cos(ang) * 9, ty + Math.sin(ang) * 9);
      ctx.lineTo(tx + Math.cos(ang + 2.4) * 8, ty + Math.sin(ang + 2.4) * 8);
      ctx.lineTo(tx + Math.cos(ang - 2.4) * 8, ty + Math.sin(ang - 2.4) * 8);
      ctx.closePath();
      ctx.fill();

      const lx = cx + Math.cos(ang) * 246;
      const ly = cy + Math.sin(ang) * 246;
      const txt = `${def.name} (${def.levelLabel})`;
      const affInfo = this.getBiomeAffinityText(def.id);
      const subTxt = affInfo ? `WEAK ${affInfo.weak} • RES ${affInfo.resist}` : '';
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const tw1 = typeof ctx.measureText === 'function' ? ctx.measureText(txt).width : txt.length * 6.8;
      const tw2 = subTxt ? (typeof ctx.measureText === 'function' ? ctx.measureText(subTxt).width : subTxt.length * 6.0) : 0;
      const tw = Math.max(tw1, tw2);
      const boxH = subTxt ? 30 : 18;
      ctx.fillStyle = 'rgba(4, 9, 22, 0.90)';
      ctx.fillRect(lx - tw / 2 - 7, ly - 11, tw + 14, boxH);
      ctx.strokeStyle = def.color || '#00ffff';
      ctx.lineWidth = 1.3;
      ctx.strokeRect(lx - tw / 2 - 7, ly - 11, tw + 14, boxH);
      ctx.fillStyle = def.color || '#ffffff';
      ctx.fillText(txt, lx, ly + 1);
      if (subTxt) {
        ctx.font = 'bold 9.5px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#d4f3ff';
        ctx.fillText(subTxt, lx, ly + 14);
      }
    }
    ctx.restore();
  }

  _drawEdgeBeacons(ctx, cam, vw, vh) {
    if (!this.world) return;
    const targets = [];

    for (const e of this.enemies) {
      if (e.isBoss && !e.markedForDeletion) {
        targets.push({ x: e.x, y: e.y, color: e.color || '#c424ff' });
      }
    }
    if (this.isDescentMode) {
      if (this.moduleDrops) {
        for (const md of this.moduleDrops) {
          if (!md.markedForDeletion) {
            targets.push({ x: md.x, y: md.y, color: md.color || '#ffd700' });
          }
        }
      }
    } else {
      for (const m of this.world.monoliths) {
        if (m.state !== 'conquered' && Math.hypot(m.x - this.player.x, m.y - this.player.y) <= 5800) {
          targets.push({ x: m.x, y: m.y, color: m.color });
        }
      }
      for (const s of this.world.shrines) {
        if (!s.completed && Math.hypot(s.x - this.player.x, s.y - this.player.y) <= 3200) {
          targets.push({ x: s.x, y: s.y, color: s.color });
        }
      }
      if (this.world.perkVaults) {
        for (const v of this.world.perkVaults) {
          const metaFound = typeof Meta !== 'undefined' && Meta.isMapPerkFound && Meta.isMapPerkFound(v.perkId);
          if (!v.collectedThisRun && !metaFound && Math.hypot(v.x - this.player.x, v.y - this.player.y) <= 4800) {
            targets.push({ x: v.x, y: v.y, color: v.color || '#ffd700' });
          }
        }
      }
      if (this.world.outpostBeacons) {
        for (const b of this.world.outpostBeacons) {
          const unlocked = b.activatedThisRun || (typeof Meta !== 'undefined' && Meta.data && Array.isArray(Meta.data.discoveredSectors) && Meta.data.discoveredSectors.includes(`outpost_${b.element}`));
          if (!unlocked && Math.hypot(b.x - this.player.x, b.y - this.player.y) <= 3600) {
            targets.push({ x: b.x, y: b.y, color: b.color });
          }
        }
      }
      if (this.world.deepBeacons) {
        for (const b of this.world.deepBeacons) {
          const unlocked = b.activatedThisRun || (typeof Meta !== 'undefined' && Meta.isDeepBeaconUnlocked && Meta.isDeepBeaconUnlocked(b.element));
          if (!unlocked && Math.hypot(b.x - this.player.x, b.y - this.player.y) <= 3600) {
            targets.push({ x: b.x, y: b.y, color: b.color });
          }
        }
      }
    }
    if (!this.isDescentMode && this.world.slotForges) {
      for (const fg of this.world.slotForges) {
        const slotOpen = typeof Meta !== 'undefined' && Meta.isSlotUnlocked && Meta.isSlotUnlocked(fg.slotKey);
        if (!fg.unlockedThisRun && !slotOpen && Math.hypot(fg.x - this.player.x, fg.y - this.player.y) <= 5200) {
          targets.push({ x: fg.x, y: fg.y, color: fg.color || '#00ffaa' });
        }
      }
    }
    if (!this.isDescentMode && this.world.mythicVaults) {
      for (const mv of this.world.mythicVaults) {
        if (!mv.collectedThisRun && Math.hypot(mv.x - this.player.x, mv.y - this.player.y) <= 5400) {
          targets.push({ x: mv.x, y: mv.y, color: mv.color || '#ffcc33' });
        }
      }
    }
    if (!this.isDescentMode && this.world.extractorRigs) {
      for (const rig of this.world.extractorRigs) {
        if (!rig.capturedThisRun && Math.hypot(rig.x - this.player.x, rig.y - this.player.y) <= 2600) {
          targets.push({ x: rig.x, y: rig.y, color: rig.color });
        }
      }
    }
    if (!this.isDescentMode && this.world.strongholds) {
      for (const sh of this.world.strongholds) {
        if (!sh.capturedThisRun && Math.hypot(sh.x - this.player.x, sh.y - this.player.y) <= 2800) {
          targets.push({ x: sh.x, y: sh.y, color: sh.color });
        }
      }
    }
    if (!this.isDescentMode && this.world.crystalGeodes) {
      for (const cg of this.world.crystalGeodes) {
        if (!cg.collectedThisRun && Math.hypot(cg.x - this.player.x, cg.y - this.player.y) <= 4400) {
          targets.push({ x: cg.x, y: cg.y, color: '#ffd700' });
        }
      }
    }
    if (!this.isDescentMode && this.world.abyssalAnomalies) {
      for (const aa of this.world.abyssalAnomalies) {
        if (!aa.clearedThisRun && Math.hypot(aa.x - this.player.x, aa.y - this.player.y) <= 4800) {
          targets.push({ x: aa.x, y: aa.y, color: '#ff33cc' });
        }
      }
    }
    if (!this.isDescentMode && this.signalCourier && !this.signalCourier.markedForDeletion) {
      targets.push({ x: this.signalCourier.x, y: this.signalCourier.y, color: '#ffd700' });
    }
    if (!this.isDescentMode && this.returnPortals) {
      for (const rp of this.returnPortals) {
        if (rp && !rp.consumed && Math.hypot(rp.x - this.player.x, rp.y - this.player.y) <= 5200) {
          targets.push({ x: rp.x, y: rp.y, color: rp.portalKind === 'overdrive' ? '#ff44ff' : '#00ffff' });
        }
      }
    }

    const safeTop = this.getHudSafeTop(vh);
    const minY = safeTop + 14;
    const radarSize = this.getScaledRadarSize(vw, vh);
    const radarX0 = vw - radarSize - Math.round(24 * (this.hudScale || 1));
    const radarY1 = safeTop + Math.round(14 * (this.hudScale || 1)) + radarSize + Math.round(22 * (this.hudScale || 1));
    const camZoom = Math.max(0.70, Math.min(1.0, (cam && Number.isFinite(cam.zoom)) ? cam.zoom : ((this.camera && Number.isFinite(this.camera.zoom)) ? this.camera.zoom : 1.0)));
    const halfW = vw / 2 - 22;
    const halfH = vh / 2 - 22;
    for (const t of targets) {
      const dx = (t.x - cam.x) * camZoom;
      const dy = (t.y - cam.y) * camZoom;
      if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) continue;
      const scale = Math.min(halfW / (Math.abs(dx) || 1), halfH / (Math.abs(dy) || 1));
      const bx = vw / 2 + dx * scale;
      const by = Math.max(minY, Math.min(vh - 22, vh / 2 + dy * scale));
      if (bx >= radarX0 && by <= radarY1) continue;
      const ang = Math.atan2(dy, dx);

      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(ang);
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-6, -5);
      ctx.lineTo(-6, 5);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(2, 6, 16, 0.90)';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }
  }

  _drawThreatEdgePings(ctx, cam, vw, vh) {
    if (!ctx || vw <= 0 || vh <= 0 || this.state === 'MENU') return;
    const camPos = cam || this.camera || this.player || { x: 0, y: 0 };
    const camZoom = Math.max(0.70, Math.min(1.0, (camPos && Number.isFinite(camPos.zoom)) ? camPos.zoom : ((this.camera && Number.isFinite(this.camera.zoom)) ? this.camera.zoom : 1.0)));
    const refX = this.player ? this.player.x : camPos.x;
    const refY = this.player ? this.player.y : camPos.y;
    const safeTop = this.getHudSafeTop(vh);
    const minY = safeTop + 14;
    const radarSize = this.getScaledRadarSize(vw, vh);
    const radarX0 = vw - radarSize - Math.round(24 * (this.hudScale || 1));
    const radarY1 = safeTop + Math.round(14 * (this.hudScale || 1)) + radarSize + Math.round(22 * (this.hudScale || 1));
    const halfW = vw / 2 - 22;
    const halfH = vh / 2 - 22;
    if (halfW <= 0 || halfH <= 0) return;

    const pings = [];
    if (this.bossTelegraphs && this.bossTelegraphs.length > 0) {
      for (let i = 0; i < this.bossTelegraphs.length; i++) {
        const tg = this.bossTelegraphs[i];
        if (!tg || !tg.boss || tg.boss.markedForDeletion || tg.boss.hp <= 0) continue;
        const tx = tg.kind === 'teleport_rift' ? tg.tx : tg.x;
        const ty = tg.kind === 'teleport_rift' ? tg.ty : tg.y;
        const dx = (tx - camPos.x) * camZoom;
        const dy = (ty - camPos.y) * camZoom;
        if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) continue;
        const prog = Math.max(0, Math.min(1, tg.elapsed / Math.max(0.05, tg.duration)));
        pings.push({
          dx,
          dy,
          color: tg.color || tg.boss.baseColor || '#ff3366',
          prog,
          isBoss: true
        });
      }
    }

    if (this.enemies && this.enemies.length > 0) {
      const rangedPings = [];
      const maxThreatDist = Math.round(950 / camZoom);
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i];
        if (!e || e.markedForDeletion || e.isBoss || e.retreatingForBoss) continue;
        if (e.type !== 'ranger' && e.type !== 'artillery') continue;
        const prog = e._fireTelegraphProg || 0;
        if (prog < 0.68) continue;
        const dist = Math.hypot(e.x - refX, e.y - refY);
        if (dist > maxThreatDist) continue;
        const dx = (e.x - camPos.x) * camZoom;
        const dy = (e.y - camPos.y) * camZoom;
        if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) continue;
        rangedPings.push({
          dx,
          dy,
          dist,
          color: e.type === 'ranger' ? '#ffee55' : '#ff8822',
          prog: Math.min(1, prog),
          isBoss: false
        });
      }
      if (rangedPings.length > 10) {
        rangedPings.sort((a, b) => a.dist - b.dist);
        rangedPings.length = 10;
      }
      for (let i = 0; i < rangedPings.length; i++) pings.push(rangedPings[i]);
    }

    if (pings.length === 0) return;
    const pulse = 0.5 + 0.5 * Math.sin((this.runTime || 0) * 18);

    for (let i = 0; i < pings.length; i++) {
      const p = pings[i];
      const scale = Math.min(halfW / (Math.abs(p.dx) || 1), halfH / (Math.abs(p.dy) || 1));
      const bx = Math.max(22, Math.min(vw - 22, vw / 2 + p.dx * scale));
      const by = Math.max(minY, Math.min(vh - 22, vh / 2 + p.dy * scale));
      if (bx >= radarX0 && by <= radarY1) continue;

      const ang = Math.atan2(p.dy, p.dx);
      const triR = p.isBoss ? 11 : 8.5;
      const ringR = triR + 2.5 + pulse * 2.2;
      const drawCol = (p.prog >= 0.85 && pulse > 0.55) ? '#ffffff' : p.color;

      ctx.save();
      ctx.translate(bx, by);

      ctx.strokeStyle = drawCol;
      ctx.lineWidth = p.isBoss ? 2.0 : 1.6;
      ctx.globalAlpha = 0.58 + 0.36 * pulse;
      ctx.beginPath();
      ctx.arc(0, 0, ringR, 0, Math.PI * 2);
      ctx.moveTo(-ringR - 3, 0);
      ctx.lineTo(-ringR + 2, 0);
      ctx.moveTo(ringR - 2, 0);
      ctx.lineTo(ringR + 3, 0);
      ctx.moveTo(0, -ringR - 3);
      ctx.lineTo(0, -ringR + 2);
      ctx.moveTo(0, ringR - 2);
      ctx.lineTo(0, ringR + 3);
      ctx.stroke();

      ctx.rotate(ang);
      ctx.globalAlpha = 0.85 + 0.15 * pulse;
      ctx.fillStyle = drawCol;
      ctx.strokeStyle = 'rgba(2, 6, 16, 0.92)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(triR, 0);
      ctx.lineTo(-triR * 0.65, -triR * 0.62);
      ctx.lineTo(-triR * 0.65, triR * 0.62);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }
  }

  _drawBossTelegraphs(ctx) {
    if (!this.bossTelegraphs || this.bossTelegraphs.length === 0) return;
    for (let i = 0; i < this.bossTelegraphs.length; i++) {
      const tg = this.bossTelegraphs[i];
      if (!tg || !tg.boss || tg.boss.markedForDeletion) continue;
      const prog = Math.max(0, Math.min(1, tg.elapsed / Math.max(0.05, tg.duration)));
      ctx.save();
      if (tg.kind === 'circle') {
        ctx.strokeStyle = tg.color;
        ctx.fillStyle = tg.color;
        ctx.lineWidth = 2.2;
        if (ctx.setLineDash) ctx.setLineDash([7, 5]);
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.arc(tg.x, tg.y, tg.radius, 0, Math.PI * 2);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.globalAlpha = 0.14 + 0.16 * prog;
        ctx.beginPath();
        ctx.arc(tg.x, tg.y, Math.max(8, tg.radius * prog), 0, Math.PI * 2);
        ctx.fill();
        if (prog >= 0.75) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.6;
          ctx.globalAlpha = 0.65 + 0.35 * ((prog - 0.75) / 0.25);
          ctx.beginPath();
          ctx.arc(tg.x, tg.y, tg.radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (tg.kind === 'ring_donut') {
        ctx.strokeStyle = '#00ffaa';
        ctx.lineWidth = 2;
        if (ctx.setLineDash) ctx.setLineDash([5, 5]);
        ctx.globalAlpha = 0.72;
        ctx.beginPath();
        ctx.arc(tg.x, tg.y, tg.innerRadius, 0, Math.PI * 2);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.strokeStyle = tg.color;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(tg.x, tg.y, tg.radius, 0, Math.PI * 2);
        ctx.stroke();
        const curR = tg.innerRadius + (tg.radius - tg.innerRadius) * prog;
        ctx.globalAlpha = 0.25 + 0.25 * prog;
        ctx.lineWidth = Math.max(4, (tg.radius - tg.innerRadius) * 0.22);
        ctx.beginPath();
        ctx.arc(tg.x, tg.y, curR, 0, Math.PI * 2);
        ctx.stroke();
        if (prog >= 0.75) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.6;
          ctx.globalAlpha = 0.65 + 0.35 * ((prog - 0.75) / 0.25);
          ctx.beginPath();
          ctx.arc(tg.x, tg.y, tg.radius, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (tg.exposeOnInside) {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = '#00ffaa';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('SAFE INSIDE', tg.x, tg.y + tg.innerRadius * 0.55);
        }
      } else if (tg.kind === 'line_beam' || tg.kind === 'line_dash') {
        const cos = Math.cos(tg.angle);
        const sin = Math.sin(tg.angle);
        const ex = tg.x + cos * tg.length;
        const ey = tg.y + sin * tg.length;
        const halfW = tg.width * 0.5;
        const nx = -sin * halfW;
        const ny = cos * halfW;
        const locked = prog >= 0.72;

        ctx.lineCap = 'butt';
        ctx.strokeStyle = tg.color;
        ctx.lineWidth = tg.width;
        ctx.globalAlpha = 0.16 + 0.12 * prog;
        if (tg.kind === 'line_dash' && ctx.setLineDash) ctx.setLineDash([12, 8]);
        ctx.beginPath();
        ctx.moveTo(tg.x, tg.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);

        ctx.lineWidth = Math.max(3, tg.width * prog);
        ctx.globalAlpha = tg.kind === 'line_beam' ? (0.35 + 0.35 * prog) : (0.28 + 0.25 * prog);
        ctx.beginPath();
        ctx.moveTo(tg.x, tg.y);
        ctx.lineTo(tg.x + cos * tg.length * (tg.kind === 'line_dash' ? prog : 1), tg.y + sin * tg.length * (tg.kind === 'line_dash' ? prog : 1));
        ctx.stroke();

        // Crisp outer collision corridor rails + Lock-In white border flash
        ctx.strokeStyle = locked ? '#ffffff' : tg.color;
        ctx.lineWidth = locked ? 2.4 : 1.8;
        ctx.globalAlpha = locked ? (0.72 + 0.25 * ((prog - 0.72) / 0.28)) : (0.52 + 0.30 * prog);
        ctx.beginPath();
        ctx.moveTo(tg.x + nx, tg.y + ny);
        ctx.lineTo(ex + nx, ey + ny);
        ctx.moveTo(tg.x - nx, tg.y - ny);
        ctx.lineTo(ex - nx, ey - ny);
        ctx.stroke();

        // 3 directional chevrons along the vector corridor
        const chevHalf = Math.max(6, Math.min(18, tg.width * 0.34));
        const tipReach = chevHalf * 0.85;
        const ux = -sin;
        const uy = cos;
        ctx.strokeStyle = locked ? '#ffffff' : tg.color;
        ctx.lineWidth = 2.0;
        ctx.globalAlpha = 0.55 + 0.40 * prog;
        ctx.beginPath();
        for (let c = 0; c < 3; c++) {
          const frac = 0.22 + c * 0.26 + prog * 0.08;
          const cx = tg.x + cos * (tg.length * frac);
          const cy = tg.y + sin * (tg.length * frac);
          ctx.moveTo(cx - cos * tipReach + ux * chevHalf, cy - sin * tipReach + uy * chevHalf);
          ctx.lineTo(cx + cos * tipReach, cy + sin * tipReach);
          ctx.lineTo(cx - cos * tipReach - ux * chevHalf, cy - sin * tipReach - uy * chevHalf);
        }
        ctx.stroke();
      } else if (tg.kind === 'teleport_rift') {
        const ox = Number.isFinite(tg.x) ? tg.x : tg.boss.x;
        const oy = Number.isFinite(tg.y) ? tg.y : tg.boss.y;
        if (Math.hypot(tg.tx - ox, tg.ty - oy) > 4) {
          ctx.strokeStyle = tg.color;
          ctx.lineWidth = 2.0;
          ctx.globalAlpha = 0.42 + 0.36 * prog;
          if (ctx.setLineDash) ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(tg.tx, tg.ty);
          ctx.stroke();
          if (ctx.setLineDash) ctx.setLineDash([]);
        }
        const rr = 44 * (1 - prog * 0.6) + 12;
        ctx.strokeStyle = tg.color;
        ctx.lineWidth = 2.4;
        ctx.globalAlpha = 0.5 + 0.4 * prog;
        if (ctx.setLineDash) ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(tg.tx, tg.ty, rr, 0, Math.PI * 2);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(tg.tx - 16, tg.ty);
        ctx.lineTo(tg.tx + 16, tg.ty);
        ctx.moveTo(tg.tx, tg.ty - 16);
        ctx.lineTo(tg.tx, tg.ty + 16);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawScreenOverlays(ctx, vw, vh = 900) {
    const hs = this.hudScale || 1.0;
    const fontScale = Math.min(1.85, hs);
    const uiFont = 'system-ui, -apple-system, sans-serif';
    const safeTop = this.getHudSafeTop(vh);
    const radarSize = this.getScaledRadarSize(vw, vh);
    const textCenterX = vw / 2;
    const isBossPrelude = Boolean(this.bossPrelude && !this.isDescentMode);
    const topBarH = Math.min(14, Math.max(4, safeTop - 4));
    const bottomBarH = isBossPrelude ? Math.round(Math.max(12, Math.min(34, vh * 0.052))) : 0;
    const radarBottom = safeTop + Math.round(14 * Math.min(1.75, hs)) + radarSize + Math.round(24 * Math.min(1.6, hs));

    if (isBossPrelude) {
      const bp = this.bossPrelude;
      const prog = 1 - Math.max(0, Math.min(1, bp.timer / (bp.maxTimer || 2.6)));
      const bCol = bp.color || '#ff0055';
      const easeIn = Math.min(1, prog / 0.18);
      const easeOut = prog > 0.85 ? Math.max(0, (1 - prog) / 0.15) : 1;
      const barAlpha = Math.min(easeIn, easeOut);
      const curTopH = Math.max(2, Math.round(topBarH * barAlpha));
      const curBotH = Math.max(2, Math.round(bottomBarH * barAlpha));

      ctx.save();
      ctx.fillStyle = `rgba(2, 4, 10, ${(0.18 + 0.16 * Math.sin(prog * Math.PI)).toFixed(3)})`;
      ctx.fillRect(0, 0, vw, vh);

      // Top signal accent strip strictly above safeTop (y = 0..topBarH) + 2px neon scanline edge
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = 'rgba(3, 6, 14, 0.94)';
      ctx.fillRect(0, 0, vw, curTopH);
      ctx.fillStyle = bCol;
      ctx.fillRect(0, Math.max(0, curTopH - 2), vw, 2);

      // Bottom letterbox bar (y = vh - bottomBarH..vh)
      ctx.fillStyle = 'rgba(3, 6, 14, 0.94)';
      ctx.fillRect(0, vh - curBotH, vw, curBotH);
      ctx.fillStyle = bCol;
      ctx.fillRect(0, vh - curBotH, vw, 2);

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Low-HP crimson pulse & Ambush alert flash border vignette
    if (this.player && this.player.hp > 0 && this.player.hp < (this.player.maxHp || 100) * 0.30) {
      ctx.save();
      const pulse = 0.22 + 0.14 * Math.sin((this.runTime || 0) * 7);
      ctx.strokeStyle = '#ff2244';
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, vw - 10, vh - 10);
      ctx.restore();
    }
    if ((this.alertFlashTimer || 0) > 0) {
      ctx.save();
      const a = Math.min(1, this.alertFlashTimer / 1.35);
      ctx.strokeStyle = this.alertFlashColor || '#ff00ff';
      ctx.globalAlpha = 0.45 * a;
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, vw - 8, vh - 8);
      ctx.restore();
    }
    if ((this._damageFlashTimer || 0) > 0) {
      const frac = Math.max(0, Math.min(1, this._damageFlashTimer / 0.22));
      const fCol = this._damageFlashColor || '#ff2244';
      ctx.save();
      ctx.strokeStyle = fCol;
      ctx.globalAlpha = 0.58 * frac;
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, vw - 10, vh - 10);
      ctx.globalAlpha = 0.22 * frac;
      ctx.lineWidth = 22;
      ctx.strokeRect(12, 12, vw - 24, vh - 24);
      if (Number.isFinite(this._damageSourceAngle)) {
        const arcR = Math.min(vw, vh) * 0.22;
        ctx.strokeStyle = fCol;
        ctx.lineWidth = 5;
        ctx.globalAlpha = 0.82 * frac;
        ctx.beginPath();
        ctx.arc(vw * 0.5, vh * 0.5, arcR, this._damageSourceAngle - 0.34, this._damageSourceAngle + 0.34);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Top-Left Non-Overlapping Column: Nearest Objective + Mode/Affinity/Streak Chips (strictly left of radar & below HUD bar)
    const leftPad = Math.round(10 * Math.min(1.4, hs));
    const leftMaxW = Math.max(140, vw - radarSize - Math.round(28 * Math.min(1.4, hs)));
    const chipFontPx = Math.round(11 * fontScale);
    const objBoxH = Math.round(21 * fontScale);
    const chipH = Math.round(18 * fontScale);
    const rowStep = Math.round(22 * fontScale);
    let leftY = safeTop + Math.round(14 * fontScale);
    let leftColRight = leftPad;
    let leftColBottom = safeTop;
    const obj = this.getNearestObjective();
    if (obj) {
      ctx.save();
      const distLabel = obj.dist >= 1000 ? `${(obj.dist / 1000).toFixed(1)}k` : `${Math.round(obj.dist)}m`;
      const objTxt = `▸ ${obj.label} (${distLabel})`;
      ctx.font = `bold ${chipFontPx}px ${uiFont}`;
      const textW = typeof ctx.measureText === 'function' ? ctx.measureText(objTxt).width : objTxt.length * (chipFontPx * 0.62);
      const boxW = Math.min(leftMaxW, textW + Math.round(18 * Math.min(1.4, hs)));
      ctx.fillStyle = 'rgba(4, 10, 22, 0.88)';
      ctx.fillRect(leftPad, leftY - Math.round(14 * fontScale), boxW, objBoxH);
      ctx.strokeStyle = obj.color || '#00ffff';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(leftPad, leftY - Math.round(14 * fontScale), boxW, objBoxH);
      ctx.fillStyle = obj.color || '#00ffff';
      ctx.textAlign = 'left';
      ctx.fillText(objTxt, leftPad + Math.round(8 * Math.min(1.4, hs)), leftY + Math.round(2 * fontScale), Math.max(40, boxW - Math.round(14 * Math.min(1.4, hs))));
      ctx.restore();
      leftColRight = Math.max(leftColRight, leftPad + boxW);
      leftY += Math.round(25 * fontScale);
      leftColBottom = leftY - 3;
    }

    const badges = [];
    const curSec = this.world && this.player ? this.world.getSectorAt(this.player.x, this.player.y) : null;
    if (!this.isDescentMode && curSec && curSec.id !== 'void') {
      const affInfo = this.getBiomeAffinityText(curSec.id);
      if (affInfo) {
        badges.push({ label: `${curSec.id.toUpperCase()} • WEAK ${affInfo.weak} | RES ${affInfo.resist}`, color: curSec.color || '#00eeff' });
      }
    }
    const phaseCfg = this.getActivePhaseConfig();
    if (this.isDescentMode) {
      badges.push({ label: `DESCENT ${this.descentDepth} • ${Math.max(0, this.descentWaveTimer).toFixed(1)}s`, color: '#ff00ff' });
    }
    if ((this.overdriveChain || 0) > 0) {
      badges.push({ label: `OVERDRIVE x${this.overdriveChain} (+${this.overdriveChain * 50}% LOOT)`, color: '#ff44ff' });
    }
    if (phaseCfg.phase > 1) {
      badges.push({ label: phaseCfg.name.toUpperCase(), color: '#00eeff' });
    }
    if (this.runTime > 120) {
      const inst = this.getVoidInstability();
      badges.push({ label: `INSTABILITY x${inst.dmgMult.toFixed(1)} DMG • HEAL ${Math.round(inst.sustainMult * 100)}%`, color: '#ff7744' });
    }
    if (this.activeVolatilePact && !this.activeVolatilePact.failed) {
      badges.push({ label: `VOLATILE PACT: ${this.activeVolatilePact.killsRemaining} KILLS`, color: '#ff3366' });
    }
    if (this.activeSectorBounty) {
      const sb = this.activeSectorBounty;
      badges.push({ label: `${sb.label} (${sb.progress}/${sb.target}) • ${Math.max(0, sb.timer).toFixed(0)}s`, color: sb.color || '#ffd700' });
    }
    if (typeof Meta !== 'undefined' && typeof Meta.getExtractionStreakMult === 'function') {
      const esMult = Meta.getExtractionStreakMult();
      if (esMult > 1.001) {
        badges.push({ label: `STREAK BONUS x${esMult.toFixed(2)} MATTER`, color: '#00ffaa' });
      }
    }
    if (this.activeBossArena) {
      badges.push({ label: `CITADEL ARENA // HAZARDS SUSPENDED`, color: this.activeBossArena.color || '#00ffff' });
    }
    if (this.killStreak >= 8) {
      const tier = this.killStreak >= 50 ? 'OVERDRIVE' : (this.killStreak >= 25 ? 'SURGE' : 'MOMENTUM');
      badges.push({ label: `${this.killStreak}x ${tier} (+MATTER/SPD)`, color: '#ffd700' });
    }
    if (this.frenzyTimer > 0) badges.push({ label: `2.5X FRENZY ${this.frenzyTimer.toFixed(1)}s`, color: '#ff3366' });
    if (this.overchargeTimer > 0) badges.push({ label: `OVERCHARGE ${this.overchargeTimer.toFixed(1)}s`, color: '#ff00ff' });
    if (this.harmonicBlessingTimer > 0) badges.push({ label: `BLESSING ${this.harmonicBlessingTimer.toFixed(1)}s`, color: '#00ffaa' });
    if (this.playerOnBoost) {
      const boostPct = Math.round(((this.playerBoostMult || 1.55) - 1) * 100);
      badges.push({ label: `CONDUIT +${boostPct}% SPD`, color: '#00eeff' });
    }
    if (this.playerInfusionChillTimer > 0) badges.push({ label: `CRYO CHILL ${this.playerInfusionChillTimer.toFixed(1)}s`, color: '#44aaff' });
    if (this.bossPrelude) badges.push({ label: `APEX ARRIVAL ${Math.max(0, this.bossPrelude.timer).toFixed(1)}s`, color: this.bossPrelude.color || '#ff0055' });

    const maxChips = vw <= 780 ? Math.min(badges.length, 4) : Math.min(badges.length, 6);
    for (let i = 0; i < maxChips; i++) {
      const chipY = leftY + i * rowStep;
      ctx.save();
      ctx.font = `bold ${chipFontPx}px ${uiFont}`;
      ctx.textAlign = 'left';
      const lbl = badges[i].label;
      const cwText = typeof ctx.measureText === 'function' ? ctx.measureText(lbl).width : lbl.length * (chipFontPx * 0.62);
      const cw = Math.min(leftMaxW, cwText + Math.round(16 * Math.min(1.4, hs)));
      const boxTop = chipY - Math.round(13 * fontScale);
      ctx.fillStyle = 'rgba(4, 10, 22, 0.86)';
      ctx.fillRect(leftPad, boxTop, cw, chipH);
      ctx.strokeStyle = badges[i].color;
      ctx.globalAlpha = 0.62;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(leftPad, boxTop, cw, chipH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = badges[i].color;
      ctx.fillText(lbl, leftPad + Math.round(7 * Math.min(1.4, hs)), boxTop + chipH - Math.round(5 * fontScale), Math.max(40, cw - Math.round(14 * Math.min(1.4, hs))));
      ctx.restore();
      leftColRight = Math.max(leftColRight, leftPad + cw);
      leftColBottom = Math.max(leftColBottom, boxTop + chipH + 4);
    }
    this._lastLeftHudRect = {
      x: leftPad,
      y: safeTop,
      w: Math.max(0, leftColRight - leftPad),
      h: Math.max(0, leftColBottom - safeTop)
    };

    // Compact Top-Docked Banner (Stays strictly out of center combat sightline, never overlapping HUD or Radar)
    if (this.sectorBanner && this.sectorBanner.timer > 0) {
      const bScale = Math.min(1.25, Math.max(0.85, hs * 0.92));
      const alpha = this.sectorBanner.timer > 0.65 ? 1.0 : Math.max(0, this.sectorBanner.timer / 0.65);
      const isUrgent = (this.sectorBanner.priority || 1) >= 2;
      const bannerH = this.sectorBanner.sub
        ? Math.round((isUrgent ? 38 : 34) * bScale)
        : Math.round(24 * bScale);
      const radarLeft = vw - radarSize - Math.round(24 * hs);
      const leftSlotW = radarLeft - leftPad - 10;
      const centerAvailW = radarLeft - leftColRight - 28;
      const fitsCenterBetween = vw >= 900 && centerAvailW >= 240;

      let pillW;
      let bannerX;
      let bannerY;
      let alignLeft = false;
      if (fitsCenterBetween) {
        pillW = Math.min(360, centerAvailW);
        bannerX = textCenterX - pillW / 2;
        bannerY = safeTop + 6;
      } else if (leftSlotW >= 150) {
        pillW = Math.min(leftSlotW, 300);
        bannerX = leftPad;
        bannerY = leftColBottom + 6;
        alignLeft = true;
      } else {
        pillW = Math.min(vw - 24, 280);
        bannerX = textCenterX - pillW / 2;
        bannerY = Math.max(radarBottom + 6, leftColBottom + 8);
      }

      this._lastBannerRect = { x: bannerX, y: bannerY, w: pillW, h: bannerH };
      const bColor = this.sectorBanner.color || '#00ffff';

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = isUrgent ? 'rgba(16, 4, 24, 0.72)' : 'rgba(3, 8, 20, 0.66)';
      ctx.fillRect(bannerX, bannerY, pillW, bannerH);
      ctx.strokeStyle = bColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bannerX, bannerY, pillW, bannerH);
      ctx.fillStyle = bColor;
      ctx.fillRect(bannerX, bannerY, isUrgent ? 4 : 3, bannerH);

      ctx.textAlign = alignLeft ? 'left' : 'center';
      const titlePx = Math.round((vw < 500 ? (isUrgent ? 12 : 11) : (isUrgent ? 14 : 13)) * bScale);
      ctx.font = `bold ${titlePx}px ${uiFont}`;
      const textX = alignLeft ? (bannerX + 10) : (bannerX + pillW / 2);
      const bannerTitleY = bannerY + Math.round((isUrgent ? 16 : 14.5) * bScale);
      const bannerTextMaxW = Math.max(70, pillW - (alignLeft ? 18 : 20));
      if (typeof ctx.strokeText === 'function') {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(2, 6, 16, 0.85)';
        ctx.strokeText(this.sectorBanner.text, textX, bannerTitleY, bannerTextMaxW);
      }
      ctx.fillStyle = bColor;
      ctx.fillText(this.sectorBanner.text, textX, bannerTitleY, bannerTextMaxW);
      if (this.sectorBanner.sub) {
        const subPx = Math.round(9.5 * bScale);
        ctx.font = `bold ${subPx}px ${uiFont}`;
        ctx.fillStyle = '#dceeff';
        ctx.fillText(this.sectorBanner.sub, textX, bannerY + Math.round((isUrgent ? 30 : 27) * bScale), bannerTextMaxW);
      }
      ctx.restore();
    } else {
      this._lastBannerRect = null;
    }

    // Non-overlapping centered Boss-Title-Reveal band during Boss Prelude
    if (isBossPrelude) {
      const bp = this.bossPrelude;
      const prog = 1 - Math.max(0, Math.min(1, bp.timer / (bp.maxTimer || 2.6)));
      const bCol = bp.color || '#ff0055';
      const bannerBottom = this._lastBannerRect ? (this._lastBannerRect.y + this._lastBannerRect.h) : 0;
      const topFloorY = Math.max(safeTop, leftColBottom, radarBottom, bannerBottom);
      const availH = Math.max(0, (vh - bottomBarH - 6) - (topFloorY + 6));
      if (availH >= 20) {
        const revealW = Math.min(vw - 24, vw < 780 ? vw - 24 : 440);
        const revealH = availH >= 28
          ? Math.min(Math.round(Math.max(44, Math.min(78, vh * 0.11))), availH)
          : Math.max(20, availH);
        const minRevealY = topFloorY + 6;
        const maxRevealY = Math.max(minRevealY, vh - bottomBarH - revealH - 6);
        const revealX = Math.round(textCenterX - revealW / 2);
        const revealY = Math.max(minRevealY, Math.min(maxRevealY, minRevealY));
        this._lastRevealRect = { x: revealX, y: revealY, w: revealW, h: revealH };

        const revealTitle = String(bp.title || 'APEX ANOMALY').toUpperCase();
        const defaultEpithet = bp.kind === 'architect'
          ? 'PRIMORDIAL LATTICE SOVEREIGN'
          : (bp.kind === 'monolith' ? 'CITADEL FREQUENCY KEEPER' : 'SECTOR OVERLORD SIGNATURE');
        const revealSub = String(bp.epithet || bp.sub || defaultEpithet).toUpperCase();
        const fadeIn = Math.min(1, prog / 0.16);
        const fadeOut = prog > 0.84 ? Math.max(0, (1 - prog) / 0.16) : 1;
        const revealAlpha = Math.max(0.18, Math.min(fadeIn, fadeOut));
        const hasSub = revealH >= 38;
        const titlePx = Math.max(10, Math.min(22, Math.round(revealH * (hasSub ? 0.30 : 0.46))));
        const subPx = Math.max(8, Math.min(13, Math.round(revealH * 0.17)));
        const padX = Math.max(10, Math.round(revealW * 0.04));

        ctx.save();
        ctx.globalAlpha = revealAlpha;
        ctx.fillStyle = 'rgba(4, 10, 22, 0.90)';
        ctx.fillRect(revealX, revealY, revealW, revealH);
        ctx.strokeStyle = bCol;
        ctx.lineWidth = 2;
        ctx.strokeRect(revealX, revealY, revealW, revealH);

        ctx.fillStyle = bCol;
        ctx.fillRect(revealX, revealY, 5, revealH);
        ctx.fillRect(revealX + revealW - 5, revealY, 5, revealH);

        ctx.textAlign = 'center';
        ctx.font = `bold ${titlePx}px ${uiFont}`;
        const titleY = hasSub
          ? Math.round(revealY + revealH * 0.46)
          : Math.round(revealY + revealH * 0.65);
        const revealTextMaxW = Math.max(60, revealW - padX * 2);
        if (typeof ctx.strokeText === 'function') {
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(2, 6, 16, 0.90)';
          ctx.strokeText(revealTitle, textCenterX, titleY, revealTextMaxW);
        }
        ctx.fillStyle = bCol;
        ctx.fillText(revealTitle, textCenterX, titleY, revealTextMaxW);

        if (hasSub) {
          ctx.font = `bold ${subPx}px ${uiFont}`;
          ctx.fillStyle = '#e8f7ff';
          const subY = Math.round(revealY + revealH * 0.80);
          ctx.fillText(revealSub, textCenterX, subY, revealTextMaxW);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      } else {
        this._lastRevealRect = null;
      }
    } else {
      this._lastRevealRect = null;
    }

    // Dedicated Tactical Boss HUD Bar at BOTTOM-CENTER (never overlaps HUD, minimap, or banners)
    let hasActiveBossBar = false;
    if (this.player && this.enemies && this.enemies.length > 0) {
      let nearestBoss = null;
      let nearestDist = 1650;
      for (let i = 0; i < this.enemies.length; i++) {
        const en = this.enemies[i];
        if (!en || !en.isBoss || en.retreatingForBoss || en.markedForDeletion || en.hp <= 0) continue;
        const d = Math.hypot(en.x - this.player.x, en.y - this.player.y);
        if (d <= nearestDist) {
          nearestDist = d;
          nearestBoss = en;
        }
      }
      if (nearestBoss) {
        hasActiveBossBar = true;
        const bScale = Math.min(1.55, hs);
        const hpRatio = Math.max(0, Math.min(1, nearestBoss.hp / Math.max(1, nearestBoss.maxHp)));
        const hpPct = Math.max(1, Math.round(hpRatio * 100));
        const baseName = nearestBoss.isArchitectBoss
          ? 'THE ARCHITECT'
          : (nearestBoss.monolithElement
              ? `${nearestBoss.monolithElement.toUpperCase()} CITADEL GUARDIAN`
              : (nearestBoss.type === 'commander' && this.isDescentMode
                  ? 'SINGULARITY WARDEN'
                  : `APEX ${(nearestBoss.type || 'OVERLORD').toUpperCase()}`));
        const phaseSuffix = nearestBoss.isArchitectBoss
          ? (nearestBoss._bossEnraged ? ' • PHASE III' : (nearestBoss._enteredPhase2 ? ' • PHASE II' : ''))
          : (nearestBoss._bossEnraged ? ' • OVERDRIVE' : '');
        const barW = Math.min(Math.round(380 * bScale), Math.max(220, vw - 44));
        const barH = Math.round(13 * bScale);
        const bx = textCenterX - barW / 2;
        const by = vh - Math.round(48 * bScale);
        const activeColor = nearestBoss._activePylonCount > 0
          ? '#00ffff'
          : ((nearestBoss.exposedTimer || 0) > 0 ? '#00ffaa' : (nearestBoss._bossEnraged ? '#ff3366' : (nearestBoss.baseColor || '#ff4466')));

        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(11.5 * bScale)}px ${uiFont}`;
        const bossHudTitle = `${baseName}${phaseSuffix}  ${hpPct}%`;
        const bossHudTitleY = by - Math.round(7 * bScale);
        if (typeof ctx.strokeText === 'function') {
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(2, 6, 16, 0.90)';
          ctx.strokeText(bossHudTitle, textCenterX, bossHudTitleY, barW);
        }
        ctx.fillStyle = activeColor;
        ctx.fillText(bossHudTitle, textCenterX, bossHudTitleY, barW);

        ctx.fillStyle = 'rgba(4, 10, 22, 0.90)';
        ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 1.6;
        ctx.strokeRect(bx - 1, by - 1, barW + 2, barH + 2);

        ctx.fillStyle = activeColor;
        ctx.fillRect(bx + 1, by + 1, Math.max(0, (barW - 2) * hpRatio), barH - 2);

        let statusText = 'DODGE TELEGRAPHS TO EXPOSE CORE';
        let statusColor = '#ffd0e0';
        if (nearestBoss._activePylonCount > 0) {
          statusText = `AEGIS SHIELD -70% DMG • DESTROY ${nearestBoss._activePylonCount} PYLON${nearestBoss._activePylonCount > 1 ? 'S' : ''}`;
          statusColor = '#00ffff';
        } else if ((nearestBoss.exposedTimer || 0) > 0) {
          statusText = `EXPOSED! x1.85 DMG (${nearestBoss.exposedTimer.toFixed(1)}s)`;
          statusColor = '#00ffaa';
        } else if (nearestBoss.hasDirectionalArmor) {
          statusText = 'FLANK REAR WEAKSPOT x1.60 OR BAIT WALL SLAM';
          statusColor = '#ffd700';
        }
        ctx.font = `bold ${Math.round(10 * bScale)}px ${uiFont}`;
        ctx.fillStyle = statusColor;
        ctx.fillText(statusText, textCenterX, by + barH + Math.round(14 * bScale), barW);
        ctx.restore();
      }
    }

    const bannerBottom = this._lastBannerRect ? (this._lastBannerRect.y + this._lastBannerRect.h) : 0;
    this._drawTransmissionTicker(ctx, vw, vh, {
      hs,
      uiFont,
      textCenterX,
      safeTop,
      leftColBottom,
      radarBottom,
      bannerBottom,
      hasActiveBossBar
    });

    // Non-blocking Katana-ZERO-inspired horizontal Signal-Cut scanlines / split-bars
    if (this.signalCut && (this.signalCut.timer || 0) > 0) {
      const sc = this.signalCut;
      const frac = Math.max(0, Math.min(1, sc.timer / Math.max(0.08, sc.maxTimer || 0.34)));
      const sCol = sc.color || '#00ffff';
      const bandCount = 5;
      const seed = sc.seed || 1.3;
      const isApertureKind = sc.kind === 'warp' || sc.kind === 'depth' || (sc.kind === 'sector' && Boolean(sc.meta && sc.meta.isSanctumThreshold));
      const isThreatCutKind = sc.kind === 'phase' || sc.kind === 'warden';

      ctx.save();

      for (let i = 0; i < bandCount; i++) {
        const phase = Math.sin(seed * (i + 1.7) + (1 - frac) * 14.0);
        const yFrac = (i + 0.5 + phase * 0.18) / bandCount;
        const barH = Math.max(2, Math.round((i % 2 === 0 ? 5 : 3) * frac + 1));
        const barY = Math.max(0, Math.min(vh - barH, Math.round(vh * yFrac)));
        const shiftX = Math.round(phase * 38 * frac);
        const barW = Math.round(vw * (0.48 + 0.42 * Math.abs(Math.cos(seed + i * 2.1))));
        const barX = Math.round((vw - barW) * 0.5 + shiftX);

        ctx.globalAlpha = Math.min(0.62, (isThreatCutKind ? 0.62 : 0.55) * frac);
        ctx.fillStyle = sCol;
        ctx.fillRect(barX, barY, barW, barH);

        ctx.globalAlpha = Math.min(0.42, (isThreatCutKind ? 0.42 : 0.38) * frac);
        ctx.fillStyle = (i % 2 === 0) ? '#ffffff' : '#00ffff';
        ctx.fillRect(barX - Math.round(shiftX * 0.4), barY + (i % 2 === 0 ? -2 : 2), Math.round(barW * 0.55), Math.max(1, Math.floor(barH * 0.6)));
      }

      if (isApertureKind) {
        const insetX = Math.round(14 + (1 - frac) * 18);
        const insetTop = Math.max(safeTop + 6, Math.round(safeTop + 8 + (1 - frac) * 14));
        const insetBot = Math.min(vh - 12, vh - Math.round(14 + (1 - frac) * 14));
        const arm = Math.max(14, Math.min(34, Math.round(Math.min(vw, vh) * 0.045)));
        if (vw - insetX * 2 > arm * 2 + 8 && insetBot - insetTop > arm * 2 + 8) {
          ctx.strokeStyle = sCol;
          ctx.lineWidth = 2.2;
          ctx.globalAlpha = Math.min(0.85, 0.78 * frac);
          ctx.beginPath();
          ctx.moveTo(insetX, insetTop + arm);
          ctx.lineTo(insetX, insetTop);
          ctx.lineTo(insetX + arm, insetTop);
          ctx.moveTo(vw - insetX - arm, insetTop);
          ctx.lineTo(vw - insetX, insetTop);
          ctx.lineTo(vw - insetX, insetTop + arm);
          ctx.moveTo(insetX, insetBot - arm);
          ctx.lineTo(insetX, insetBot);
          ctx.lineTo(insetX + arm, insetBot);
          ctx.moveTo(vw - insetX - arm, insetBot);
          ctx.lineTo(vw - insetX, insetBot);
          ctx.lineTo(vw - insetX, insetBot - arm);
          ctx.stroke();
        }
      } else if (isThreatCutKind) {
        const tearSpread = Math.round((1 - frac) * 28 + 10);
        const midY = Math.max(safeTop + 18, Math.min(vh - 18, Math.round(vh * 0.5)));
        const railY1 = Math.max(safeTop + 4, midY - tearSpread);
        const railY2 = Math.min(vh - 6, midY + tearSpread);
        const tearOff = Math.round(Math.sin(seed * 3.1 + frac * 12) * 24 * frac);
        const railW = Math.max(20, vw - Math.abs(tearOff));
        ctx.globalAlpha = Math.min(0.82, 0.72 * frac);
        ctx.fillStyle = sCol;
        ctx.fillRect(Math.max(0, tearOff), railY1, railW, 2);
        ctx.fillRect(Math.max(0, -tearOff), railY2, railW, 2);
        ctx.globalAlpha = Math.min(0.65, 0.55 * frac);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(vw * 0.12) + tearOff, railY1 + 2, Math.round(vw * 0.76), 1);
        ctx.fillRect(Math.round(vw * 0.12) - tearOff, railY2 - 1, Math.round(vw * 0.76), 1);
      }

      ctx.globalAlpha = Math.min(0.75, 0.65 * frac);
      ctx.fillStyle = sCol;
      ctx.fillRect(0, 0, vw, 2);
      ctx.fillRect(0, vh - 2, vw, 2);

      if (sc.label && !this.bossPrelude && !this.activeBossEncounter) {
        const tagFontPx = Math.max(10, Math.min(13, Math.round(11 * fontScale)));
        ctx.globalAlpha = Math.min(0.92, frac * 1.35);
        ctx.font = `bold ${tagFontPx}px ${uiFont}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`// ${sc.label}`, textCenterX, Math.max(safeTop + 18, vh - 16), Math.max(80, vw - 40));
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  _drawTransmissionTicker(ctx, vw, vh, layout) {
    const tr = this.activeTransmission;
    const isBossPrelude = Boolean(this.bossPrelude && !this.isDescentMode);
    if (isBossPrelude || !tr || !(tr.timer > 0)) {
      this._lastTransmissionRect = null;
      return;
    }

    const { hs, uiFont, textCenterX, safeTop, leftColBottom, radarBottom, bannerBottom, hasActiveBossBar } = layout;
    const topBound = Math.max(safeTop, leftColBottom, radarBottom, bannerBottom) + 8;
    const bossBarReserve = hasActiveBossBar ? Math.round(74 * Math.min(1.55, hs)) : 28;
    const bottomLimit = vh - bossBarReserve;
    const availH = bottomLimit - topBound;
    if (availH < 36) {
      this._lastTransmissionRect = null;
      return;
    }

    const stdBodyPx = Math.min(13, Math.round(11 * Math.min(1.35, hs)));
    const stdLineH = stdBodyPx + 4;
    const twoLineMinH = 6 + 18 + stdBodyPx + stdLineH + 4;
    const compact = availH < twoLineMinH;
    const cardW = Math.max(120, Math.min(vw - 24, vw < 780 ? vw - 24 : 460));
    const tColor = tr.color || '#00eeff';
    const bodyPx = compact ? 10 : stdBodyPx;
    const hdrPx = compact ? 9 : Math.min(11, Math.round(9.5 * Math.min(1.35, hs)));
    const padX = 12;
    const maxTextW = Math.max(80, cardW - padX * 2 - 4);

    ctx.save();
    ctx.font = `${bodyPx}px ${uiFont}`;
    const lines = this._wrapCanvasText(ctx, tr.text, maxTextW, bodyPx, compact ? 1 : 2);
    const lineH = bodyPx + 4;
    const hdrH = compact ? 15 : 18;
    const cardH = Math.min(availH, Math.max(36, 8 + hdrH + Math.max(1, lines.length) * lineH + 6));
    const cardX = Math.round(textCenterX - cardW / 2);
    const cardY = Math.max(topBound, bottomLimit - cardH);
    this._lastTransmissionRect = { x: cardX, y: cardY, w: cardW, h: cardH };

    const maxDur = Math.max(0.5, tr.maxTimer || 4.8);
    const elapsed = maxDur - tr.timer;
    const alpha = Math.min(1, elapsed < 0.25 ? elapsed / 0.25 : 1, tr.timer < 0.55 ? tr.timer / 0.55 : 1);

    ctx.globalAlpha = Math.max(0.15, alpha);
    ctx.fillStyle = 'rgba(3, 8, 20, 0.90)';
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.strokeStyle = tColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cardX, cardY, cardW, cardH);
    ctx.fillStyle = tColor;
    ctx.fillRect(cardX, cardY, 4, cardH);

    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.font = `bold ${hdrPx}px ${uiFont}`;
    ctx.fillStyle = tColor;
    const hdrLabel = `${tr.speaker || 'SIGNAL'} ${tr.channelTag || ''} • ${tr.title || ''}`;
    ctx.fillText(hdrLabel, cardX + padX, cardY + 6 + hdrPx, maxTextW);

    ctx.font = `${bodyPx}px ${uiFont}`;
    ctx.fillStyle = '#e4f4ff';
    const bodyStartY = cardY + 6 + hdrH + bodyPx;
    for (let i = 0; i < lines.length; i++) {
      const ly = bodyStartY + i * lineH;
      if (ly <= cardY + cardH - 4) {
        ctx.fillText(lines[i], cardX + padX, ly, maxTextW);
      }
    }
    ctx.restore();
  }

  _drawMiniRadar(ctx, vw, vh) {
    if (!this.world || !this.player || this.state === 'MENU') return;
    const hs = Math.min(1.75, this.hudScale || 1.0);
    const uiFont = 'system-ui, -apple-system, sans-serif';
    const size = this.getScaledRadarSize(vw, vh);
    const rx = vw - size - Math.round(12 * Math.min(1.4, hs));
    const ry = this.getHudSafeTop(vh) + Math.round(14 * hs);
    const ranges = this.isDescentMode ? [1150, 1550, 2100] : (this.miniRadarRanges || [3200, 5800, 10500]);
    const rIdx = Math.max(0, Math.min(ranges.length - 1, this.miniRadarZoomIdx !== undefined ? this.miniRadarZoomIdx : 1));
    const scanRadius = ranges[rIdx] || (this.isDescentMode ? 1550 : 5800);
    const scale = (size * 0.5) / scanRadius;
    const cx = rx + size / 2;
    const cy = ry + size / 2;
    const pxW = this.player.x;
    const pyW = this.player.y;
    const sec = this.world.getSectorAt(pxW, pyW);
    const descentTheme = this.isDescentMode ? this._getDescentDepthTheme() : null;
    this._radarRect = { x: rx, y: ry, size };

    const toSX = (wx) => cx + (wx - pxW) * scale;
    const toSY = (wy) => cy + (wy - pyW) * scale;
    const inScan = (wx, wy) => Math.abs(wx - pxW) <= scanRadius && Math.abs(wy - pyW) <= scanRadius;

    ctx.save();
    ctx.fillStyle = this.isDescentMode ? 'rgba(6, 2, 16, 0.84)' : 'rgba(2, 5, 13, 0.82)';
    ctx.fillRect(rx, ry, size, size);

    ctx.save();
    if (typeof ctx.clip === 'function') {
      ctx.beginPath();
      ctx.rect(rx, ry, size, size);
      ctx.clip();
    }

    if (this.isDescentMode && this.world.descentPolygon && this.world.descentPolygon.length >= 3) {
      const poly = this.world.descentPolygon;
      ctx.beginPath();
      ctx.moveTo(toSX(poly[0].x), toSY(poly[0].y));
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo(toSX(poly[i].x), toSY(poly[i].y));
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(22, 6, 40, 0.58)';
      ctx.fill();
      ctx.strokeStyle = descentTheme.primary;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Scanner range rings
    ctx.strokeStyle = this.isDescentMode ? 'rgba(255, 110, 240, 0.16)' : 'rgba(170, 221, 255, 0.12)';
    ctx.lineWidth = 1;
    for (const rr of [scanRadius * 0.5, scanRadius * 0.96]) {
      ctx.beginPath();
      ctx.arc(cx, cy, rr * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Local Chasms
    if (this.world.getChasmsInRect) {
      const localChasms = this.world.getChasmsInRect(pxW - scanRadius, pyW - scanRadius, pxW + scanRadius, pyW + scanRadius);
      ctx.strokeStyle = 'rgba(130, 60, 255, 0.65)';
      ctx.lineWidth = 2.2;
      for (const ch of localChasms) {
        ctx.beginPath();
        ctx.moveTo(toSX(ch.x1), toSY(ch.y1));
        ctx.lineTo(toSX(ch.x2), toSY(ch.y2));
        ctx.stroke();
      }
    }

    // Local Bridges
    if (this.world.bridges) {
      ctx.strokeStyle = '#00eeff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      for (const b of this.world.bridges) {
        if (b.maxX < pxW - scanRadius || b.minX > pxW + scanRadius || b.maxY < pyW - scanRadius || b.minY > pyW + scanRadius) continue;
        ctx.beginPath();
        ctx.moveTo(toSX(b.x1), toSY(b.y1));
        ctx.lineTo(toSX(b.x2), toSY(b.y2));
        ctx.stroke();
      }
    }

    // Local Boost Strips
    if (this.world.boostStrips) {
      ctx.strokeStyle = '#00eeff';
      ctx.lineWidth = 1.8;
      ctx.globalAlpha = 0.65;
      for (const bs of this.world.boostStrips) {
        if (bs.maxX < pxW - scanRadius || bs.minX > pxW + scanRadius || bs.maxY < pyW - scanRadius || bs.minY > pyW + scanRadius) continue;
        ctx.beginPath();
        ctx.moveTo(toSX(bs.x1), toSY(bs.y1));
        ctx.lineTo(toSX(bs.x2), toSY(bs.y2));
        ctx.stroke();
      }
    }

    // Local Walls
    if (this.world.getWallsInRect) {
      const localWalls = this.world.getWallsInRect(pxW - scanRadius, pyW - scanRadius, pxW + scanRadius, pyW + scanRadius);
      ctx.lineWidth = 1.3;
      ctx.globalAlpha = 0.65;
      for (const w of localWalls) {
        ctx.strokeStyle = w.color || '#00ffff';
        ctx.beginPath();
        ctx.moveTo(toSX(w.x1), toSY(w.y1));
        ctx.lineTo(toSX(w.x2), toSY(w.y2));
        ctx.stroke();
      }
    }

    // Local Forcefield Gates
    if (this.world.forceGates) {
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.95;
      for (const g of this.world.forceGates) {
        if (this.world.isForceGateOpen && this.world.isForceGateOpen(g)) continue;
        if (!inScan(g.cx, g.cy)) continue;
        ctx.strokeStyle = g.color;
        ctx.beginPath();
        ctx.moveTo(toSX(g.x1), toSY(g.y1));
        ctx.lineTo(toSX(g.x2), toSY(g.y2));
        ctx.stroke();
      }
    }

    // Biome Gateways
    if (this.world.biomeGateways) {
      for (const gw of this.world.biomeGateways) {
        if (!inScan(gw.x, gw.y)) continue;
        ctx.fillStyle = gw.color;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(toSX(gw.x), toSY(gw.y), 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Monoliths, Beacons, Vaults, Shrines, Rescue, Pacts, Wanderer
    for (const m of this.world.monoliths) {
      if (!inScan(m.x, m.y)) continue;
      const conquered = m.state === 'conquered' || (typeof Meta !== 'undefined' && Meta.isSectorConquered && Meta.isSectorConquered(m.element));
      ctx.fillStyle = m.color;
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = conquered ? 0.9 : 0.85;
      ctx.fillRect(toSX(m.x) - 3, toSY(m.y) - 3, 6, 6);
      if (conquered) ctx.strokeRect(toSX(m.x) - 3, toSY(m.y) - 3, 6, 6);
    }

    if (this.world.outpostBeacons) {
      for (const ob of this.world.outpostBeacons) {
        if (!inScan(ob.x, ob.y)) continue;
        ctx.fillStyle = ob.color;
        ctx.globalAlpha = ob.activatedThisRun ? 0.5 : 0.9;
        ctx.beginPath();
        ctx.arc(toSX(ob.x), toSY(ob.y), 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this.world.deepBeacons) {
      for (const db of this.world.deepBeacons) {
        if (!inScan(db.x, db.y)) continue;
        ctx.fillStyle = db.color;
        ctx.globalAlpha = db.activatedThisRun ? 0.5 : 0.9;
        ctx.beginPath();
        ctx.arc(toSX(db.x), toSY(db.y), 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this.world.shrines) {
      for (const s of this.world.shrines) {
        if (s.completed || !inScan(s.x, s.y)) continue;
        ctx.fillStyle = s.color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(toSX(s.x) - 1.5, toSY(s.y) - 1.5, 3, 3);
      }
    }

    if (this.world.perkVaults) {
      for (const v of this.world.perkVaults) {
        const found = v.collectedThisRun || (typeof Meta !== 'undefined' && Meta.isMapPerkFound && Meta.isMapPerkFound(v.perkId));
        if (found || !inScan(v.x, v.y)) continue;
        ctx.fillStyle = v.isKeystone ? '#ffd700' : '#ffffff';
        ctx.globalAlpha = 0.9;
        ctx.fillRect(toSX(v.x) - 1.6, toSY(v.y) - 1.6, 3.2, 3.2);
      }
    }

    if (!this.isDescentMode && this.world.rescueChambers) {
      for (const rc of this.world.rescueChambers) {
        if (rc.rescuedThisRun || !inScan(rc.x, rc.y)) continue;
        ctx.fillStyle = rc.color || '#ff00ff';
        ctx.globalAlpha = 0.95;
        ctx.fillRect(toSX(rc.x) - 1.8, toSY(rc.y) - 1.8, 3.6, 3.6);
      }
    }
    if (!this.isDescentMode && this.world.volatilePacts) {
      for (const pact of this.world.volatilePacts) {
        if (pact.completedThisRun || !inScan(pact.x, pact.y)) continue;
        ctx.fillStyle = pact.color || '#ff3366';
        ctx.globalAlpha = 0.9;
        ctx.fillRect(toSX(pact.x) - 1.6, toSY(pact.y) - 1.6, 3.2, 3.2);
      }
    }
    if (!this.isDescentMode && this.wanderer && !this.wanderer.visited && inScan(this.wanderer.x, this.wanderer.y)) {
      ctx.fillStyle = '#00ffaa';
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(toSX(this.wanderer.x), toSY(this.wanderer.y), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!this.isDescentMode && this.world.extractorRigs) {
      for (const rig of this.world.extractorRigs) {
        if (rig.capturedThisRun || !inScan(rig.x, rig.y)) continue;
        ctx.fillStyle = rig.color || '#00eeff';
        ctx.globalAlpha = 0.88;
        ctx.fillRect(toSX(rig.x) - 1.5, toSY(rig.y) - 1.5, 3, 3);
      }
    }
    if (!this.isDescentMode && this.world.strongholds) {
      for (const sh of this.world.strongholds) {
        if (sh.capturedThisRun || !inScan(sh.x, sh.y)) continue;
        ctx.strokeStyle = sh.color || '#ff4422';
        ctx.lineWidth = 1.1;
        ctx.globalAlpha = 0.92;
        ctx.strokeRect(toSX(sh.x) - 2.2, toSY(sh.y) - 2.2, 4.4, 4.4);
      }
    }
    if (!this.isDescentMode && this.world.slotForges) {
      for (const fg of this.world.slotForges) {
        if (fg.unlockedThisRun || !inScan(fg.x, fg.y)) continue;
        ctx.fillStyle = fg.color || '#00ffaa';
        ctx.globalAlpha = 0.96;
        ctx.beginPath();
        ctx.arc(toSX(fg.x), toSY(fg.y), 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (!this.isDescentMode && this.world.mythicVaults) {
      for (const mv of this.world.mythicVaults) {
        if (mv.collectedThisRun || !inScan(mv.x, mv.y)) continue;
        ctx.fillStyle = mv.color || '#ffcc33';
        ctx.globalAlpha = 0.98;
        ctx.beginPath();
        ctx.arc(toSX(mv.x), toSY(mv.y), 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (!this.isDescentMode && this.world.crystalGeodes) {
      for (const cg of this.world.crystalGeodes) {
        if (cg.collectedThisRun || !inScan(cg.x, cg.y)) continue;
        ctx.fillStyle = '#ffd700';
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.arc(toSX(cg.x), toSY(cg.y), 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (!this.isDescentMode && this.world.abyssalAnomalies) {
      for (const aa of this.world.abyssalAnomalies) {
        if (aa.clearedThisRun || !inScan(aa.x, aa.y)) continue;
        ctx.strokeStyle = '#ff33cc';
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.arc(toSX(aa.x), toSY(aa.y), 3.0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (this.moduleDrops) {
      for (const md of this.moduleDrops) {
        if (md.markedForDeletion || !inScan(md.x, md.y)) continue;
        ctx.fillStyle = md.color || '#ffd700';
        ctx.globalAlpha = 0.95;
        ctx.fillRect(toSX(md.x) - 1.5, toSY(md.y) - 1.5, 3, 3);
      }
    }

    // Units: dormant amber (#ffaa00), active red (#ff3366), bosses (#ff3366 + white rim)
    for (const e of this.enemies) {
      if (e.markedForDeletion || !inScan(e.x, e.y)) continue;
      if (e.isBoss) {
        const bx = toSX(e.x);
        const by = toSY(e.y);
        ctx.fillStyle = '#ff3366';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(bx, by, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = e.aggroed === false ? '#ffaa00' : '#ff3366';
        ctx.globalAlpha = e.aggroed === false ? 0.65 : 0.92;
        ctx.fillRect(toSX(e.x) - 1.2, toSY(e.y) - 1.2, 2.4, 2.4);
      }
    }

    // Player at scanner center
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 5.0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Scanner frame
    ctx.strokeStyle = this.isDescentMode ? descentTheme.primary : (sec ? (sec.color || '#00ffff') : '#00ffff');
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, size, size);

    // Direction Ticks on Scanner Rim toward Sanctum & nearby Citadel
    const drawRimTick = (tx, ty, color) => {
      const dx = tx - pxW;
      const dy = ty - pyW;
      const maxC = Math.max(Math.abs(dx), Math.abs(dy));
      if (maxC <= 1) return;
      const half = size * 0.5 - 3;
      const tickX = cx + (dx / maxC) * half;
      const tickY = cy + (dy / maxC) * half;
      const ang = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(tickX, tickY);
      ctx.rotate(ang);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(4.5, 0);
      ctx.lineTo(-3.5, -3);
      ctx.lineTo(-3.5, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    if (!this.isDescentMode) {
      if (Math.hypot(pxW - this.world.center, pyW - this.world.center) > (this.world.sanctumRadius || 1300)) {
        drawRimTick(this.world.center, this.world.center, '#00ffff');
      }
      const portals = [...(this.world.rimPortals || []), ...(this.returnPortals || [])];
      for (const p of portals) {
        if (!p || p.consumed || !inScan(p.x, p.y)) continue;
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = 0.96;
        ctx.beginPath();
        ctx.arc(toSX(p.x), toSY(p.y), 3.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (this.signalCourier && !this.signalCourier.markedForDeletion && inScan(this.signalCourier.x, this.signalCourier.y)) {
        ctx.fillStyle = '#ffd700';
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(toSX(this.signalCourier.x), toSY(this.signalCourier.y), 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      let nearestCit = null;
      let nearestCitDist = Infinity;
      for (const m of this.world.monoliths) {
        const conquered = m.state === 'conquered' || (typeof Meta !== 'undefined' && Meta.isSectorConquered && Meta.isSectorConquered(m.element));
        if (conquered) continue;
        const d = Math.hypot(m.x - pxW, m.y - pyW);
        if (d < nearestCitDist) {
          nearestCitDist = d;
          nearestCit = m;
        }
      }
      if (nearestCit && !inScan(nearestCit.x, nearestCit.y)) {
        drawRimTick(nearestCit.x, nearestCit.y, nearestCit.color);
      }
    }

    // Header & Footer Readouts (scaled by hudScale)
    const rScale = Math.min(1.70, hs);
    const hdrH = Math.round(14 * rScale);
    const ftrH = Math.round(13 * rScale);
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(2, 6, 16, 0.90)';
    ctx.fillRect(rx, ry - hdrH - 2, size, hdrH);
    ctx.fillRect(rx, ry + size + 2, size, ftrH);

    ctx.globalAlpha = 0.98;
    ctx.fillStyle = this.isDescentMode ? descentTheme.primary : (sec ? (sec.color || '#00ffff') : '#00ffff');
    ctx.font = `bold ${Math.round(9.5 * rScale)}px ${uiFont}`;
    ctx.textAlign = 'center';
    const headerLabel = this.isDescentMode
      ? `CRUCIBLE DEPTH ${this.descentDepth || 1}`
      : (sec && sec.id !== 'void' ? `${sec.name} LVL ${sec.zoneLevel || 1}` : 'VOID SANCTUM LVL 0');
    ctx.fillText(headerLabel, cx, ry - Math.round(5 * rScale), size - 6);

    ctx.fillStyle = 'rgba(200, 235, 255, 0.94)';
    ctx.font = `bold ${Math.round(8.5 * rScale)}px ${uiFont}`;
    ctx.fillText('TAP: ZOOM MAP', cx, ry + size + Math.round(11 * rScale), size - 6);
    ctx.restore();
  }

  _ensurePauseMapState() {
    const worldSize = this.world ? this.world.size : 96000;
    const center = this.world ? this.world.center : worldSize * 0.5;
    if (!Number.isFinite(this.mapZoom) || this.mapZoom < 1) this.mapZoom = this.isDescentMode ? 1.0 : 2.6;
    if (!Number.isFinite(this.mapCamX)) this.mapCamX = center;
    if (!Number.isFinite(this.mapCamY)) this.mapCamY = center;
    if (!Array.isArray(this.miniRadarRanges)) this.miniRadarRanges = [3200, 5800, 10500];
    if (!Number.isInteger(this.miniRadarZoomIdx)) this.miniRadarZoomIdx = 1;
  }

  _getPauseMapLayout() {
    this._ensurePauseMapState();
    const vw = this.canvas ? this.canvas.width : 800;
    const vh = this.canvas ? this.canvas.height : 600;
    const chCss = (this.canvas && this.canvas.clientHeight) || vh;
    const cssScale = vh / Math.max(1, chCss);
    const mx = Math.max(10, Math.floor(vw * 0.025));
    const my = 60;
    const mapW = Math.max(200, vw - mx * 2);
    const bottomClear = Math.max(76, Math.round(70 * cssScale));
    const mapH = Math.max(200, vh - my - bottomClear);
    const worldSize = this.isDescentMode
      ? ((this.descentBoundSize || 2600) * 1.18)
      : (this.world ? this.world.size : 96000);
    const baseScale = (Math.min(mapW, mapH) * (this.isDescentMode ? 0.90 : 0.94)) / worldSize;
    const zoom = Math.max(1.0, Math.min(16.0, this.mapZoom || (this.isDescentMode ? 1.0 : 2.6)));
    const scale = baseScale * zoom;
    return { vw, vh, mx, my, mapW, mapH, baseScale, scale, cx: mx + mapW * 0.5, cy: my + mapH * 0.5 };
  }

  _clampPauseMapCamera() {
    const worldSize = this.world ? this.world.size : 96000;
    const center = this.world ? this.world.center : worldSize * 0.5;
    if ((this.mapZoom || 1) <= 1.03) {
      this.mapZoom = 1.0;
      this.mapCamX = center;
      this.mapCamY = center;
    } else if (this.isDescentMode) {
      const halfSpan = (this.descentBoundSize || 2600) * 0.55;
      this.mapCamX = Math.max(center - halfSpan, Math.min(center + halfSpan, this.mapCamX));
      this.mapCamY = Math.max(center - halfSpan, Math.min(center + halfSpan, this.mapCamY));
    } else {
      this.mapCamX = Math.max(0, Math.min(worldSize, this.mapCamX));
      this.mapCamY = Math.max(0, Math.min(worldSize, this.mapCamY));
    }
  }

  openPauseWorldMap() {
    this._ensurePauseMapState();
    const center = this.world ? this.world.center : 48000;
    if (this.isDescentMode) {
      this.mapZoom = 1.0;
      this.mapCamX = center;
      this.mapCamY = center;
    } else if (this.mapZoom > 1.03 && this.player) {
      this.mapCamX = this.player.x;
      this.mapCamY = this.player.y;
    } else {
      this.mapCamX = center;
      this.mapCamY = center;
    }
    this._clampPauseMapCamera();
    this.mapSelectedPoi = null;
    this.mapLogsOpen = false;
    this.mapCardMode = 'logs';
    this.mapCardSource = 'live';
    this._cardActionToast = '';
    this._cardActionToastUntil = 0;
  }

  zoomPauseMap(factor, anchorSX = null, anchorSY = null) {
    this._ensurePauseMapState();
    const layout = this._getPauseMapLayout();
    const newZoom = Math.max(1.0, Math.min(16.0, (this.mapZoom || 2.6) * (factor || 1)));
    if (anchorSX !== null && anchorSY !== null && Number.isFinite(anchorSX) && Number.isFinite(anchorSY)) {
      const wx = this.mapCamX + (anchorSX - layout.cx) / layout.scale;
      const wy = this.mapCamY + (anchorSY - layout.cy) / layout.scale;
      this.mapZoom = newZoom;
      const newScale = layout.baseScale * newZoom;
      this.mapCamX = wx - (anchorSX - layout.cx) / newScale;
      this.mapCamY = wy - (anchorSY - layout.cy) / newScale;
    } else {
      this.mapZoom = newZoom;
    }
    this._clampPauseMapCamera();
  }

  setPauseMapZoomPreset(preset) {
    this._ensurePauseMapState();
    const center = this.world ? this.world.center : 48000;
    const px = this.player ? this.player.x : center;
    const py = this.player ? this.player.y : center;
    if (preset === 'all') {
      this.mapZoom = 1.0;
      this.mapCamX = center;
      this.mapCamY = center;
    } else if (preset === 'sector') {
      this.mapZoom = 3.0;
      this.mapCamX = px;
      this.mapCamY = py;
    } else if (preset === 'local') {
      this.mapZoom = 7.0;
      this.mapCamX = px;
      this.mapCamY = py;
    } else if (preset === 'centerPlayer') {
      this.mapCamX = px;
      this.mapCamY = py;
      if (this.mapZoom < 2.2) this.mapZoom = 2.8;
    } else if (preset === 'cycleRadar') {
      const len = (this.miniRadarRanges || [3200, 5800, 10500]).length;
      this.miniRadarZoomIdx = ((this.miniRadarZoomIdx !== undefined ? this.miniRadarZoomIdx : 1) + 1) % len;
    }
    this._clampPauseMapCamera();
  }

  panPauseMapByScreenDelta(dxScreen, dyScreen) {
    this._ensurePauseMapState();
    if ((this.mapZoom || 1) <= 1.03) {
      this.mapZoom = 1.6;
    }
    const { scale } = this._getPauseMapLayout();
    this.mapCamX -= (dxScreen || 0) / scale;
    this.mapCamY -= (dyScreen || 0) / scale;
    this._clampPauseMapCamera();
  }

  handlePauseMapTap(sx, sy, nowMs = Date.now()) {
    this._ensurePauseMapState();
    if (this._pauseMapButtons && this._pauseMapButtons.length > 0) {
      for (const b of this._pauseMapButtons) {
        if (sx >= b.x - 4 && sx <= b.x + b.w + 4 && sy >= b.y - 4 && sy <= b.y + b.h + 4) {
          if ((b.id === 'logsPrev' || b.id === 'logsNext' || b.id === 'logsClose' || b.id === 'toggleCardMode' || b.id === 'cardSource') && !this.mapLogsOpen) continue;
          if (b.id === 'close') return 'close';
          if (b.id === 'toggleLogs') this.mapLogsOpen = !this.mapLogsOpen;
          else if (b.id === 'toggleCardMode' && this.mapLogsOpen) {
            this.mapCardMode = this.mapCardMode === 'logs'
              ? 'feats'
              : (this.mapCardMode === 'feats' ? 'card' : 'logs');
          } else if (b.id === 'cardSource' && this.mapLogsOpen && this.mapCardMode === 'card') {
            this._stepPauseMapCardSource();
          } else if (b.id === 'logsPrev' && this.mapLogsOpen) {
            if (this.mapCardMode === 'card') this._copyRunSummaryShareText();
            else if (this.mapCardMode === 'feats') this._stepPauseMapFeat(-1);
            else this._stepPauseMapLog(-1);
          } else if (b.id === 'logsNext' && this.mapLogsOpen) {
            if (this.mapCardMode === 'card') this._exportRunSummaryCardPng();
            else if (this.mapCardMode === 'feats') this._stepPauseMapFeat(1);
            else this._stepPauseMapLog(1);
          } else if (b.id === 'logsClose' && this.mapLogsOpen) this.mapLogsOpen = false;
          else if (b.id === 'zoomIn') this.zoomPauseMap(1.5);
          else if (b.id === 'zoomOut') this.zoomPauseMap(1 / 1.5);
          else if (b.id === 'centerPlayer') this.setPauseMapZoomPreset('centerPlayer');
          else if (b.id === 'presetAll') this.setPauseMapZoomPreset('all');
          else if (b.id === 'presetLocal') this.setPauseMapZoomPreset(this.mapZoom < 5.5 ? 'local' : 'sector');
          else if (b.id === 'cycleRadar') this.setPauseMapZoomPreset('cycleRadar');
          return 'button';
        }
      }
    }

    const lr = this._pauseMapLoreRect;
    if (this.mapLogsOpen && lr && sx >= lr.x && sx <= lr.x + lr.w && sy >= lr.y && sy <= lr.y + lr.h) {
      this._lastMapTap = null;
      return 'lore';
    }

    const ir = this._pauseMapInspectorRect;
    if (ir && sx >= ir.x && sx <= ir.x + ir.w && sy >= ir.y && sy <= ir.y + ir.h) {
      const sel = this.mapSelectedPoi;
      if (
        sel &&
        sel.transmissionId &&
        typeof Meta !== 'undefined' &&
        typeof Meta.isTransmissionUnlocked === 'function' &&
        Meta.isTransmissionUnlocked(sel.transmissionId)
      ) {
        this._openLoreDecoderById(sel.transmissionId);
        this._lastMapTap = null;
        return 'lore';
      }
    }

    const r = this._pauseMapRect;
    if (r && sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) {
      if (this._pauseMapPoiHits && this._pauseMapPoiHits.length > 0) {
        let best = null;
        let bestDist = 22;
        for (const p of this._pauseMapPoiHits) {
          const d = Math.hypot(p.x - sx, p.y - sy);
          if (d < bestDist) {
            bestDist = d;
            best = p;
          }
        }
        if (best) {
          const wasSameSelected = Boolean(
            this.mapSelectedPoi &&
            this.mapSelectedPoi.title === best.title &&
            Math.hypot((this.mapSelectedPoi.wx || 0) - (best.wx || 0), (this.mapSelectedPoi.wy || 0) - (best.wy || 0)) < 2
          );
          if (
            wasSameSelected &&
            best.transmissionId &&
            typeof Meta !== 'undefined' &&
            typeof Meta.isTransmissionUnlocked === 'function' &&
            Meta.isTransmissionUnlocked(best.transmissionId)
          ) {
            this._openLoreDecoderById(best.transmissionId);
          }
          this.mapSelectedPoi = best;
          this._lastMapTap = null;
          return 'poi';
        }
      }

      if (
        this._lastMapTap &&
        (nowMs - this._lastMapTap.time) < 320 &&
        Math.hypot(sx - this._lastMapTap.x, sy - this._lastMapTap.y) < 28
      ) {
        this._lastMapTap = null;
        if (this.mapZoom >= 11.0) this.setPauseMapZoomPreset('all');
        else this.zoomPauseMap(1.85, sx, sy);
        return 'doubletap';
      }

      this._lastMapTap = { x: sx, y: sy, time: nowMs };
      this.mapSelectedPoi = null;
      return 'map';
    }

    return 'outside';
  }

  _drawDescentPauseMapContents(ctx, helpers) {
    const { scale, toMX, toMY, inView, inRect, recordPoi, iconScale, theme } = helpers;
    const wcx = toMX(this.world.center);
    const wcy = toMY(this.world.center);
    const poly = this.world.descentPolygon || [];

    // Octagonal Crucible Arena Perimeter
    ctx.beginPath();
    if (poly.length >= 3) {
      ctx.moveTo(toMX(poly[0].x), toMY(poly[0].y));
      for (let i = 1; i < poly.length; i++) ctx.lineTo(toMX(poly[i].x), toMY(poly[i].y));
      ctx.closePath();
    } else {
      const h = ((this.descentBoundSize || 2600) * 0.5) * scale;
      ctx.rect(wcx - h, wcy - h, h * 2, h * 2);
    }
    ctx.fillStyle = 'rgba(20, 6, 38, 0.55)';
    ctx.fill();
    ctx.strokeStyle = theme.primary;
    ctx.lineWidth = Math.min(3.5, 2.0 * iconScale);
    ctx.stroke();

    // 45-degree Crucible Floor Lattice lines on Tactical Map
    const halfSpan = ((this.descentBoundSize || 2600) * 0.5) * scale;
    ctx.strokeStyle = 'rgba(217, 68, 255, 0.09)';
    ctx.lineWidth = 1;
    const step = 380 * scale;
    if (step >= 8) {
      ctx.beginPath();
      for (let u = -halfSpan; u <= halfSpan; u += step) {
        ctx.moveTo(wcx + u - halfSpan * 0.5, wcy - halfSpan);
        ctx.lineTo(wcx + u + halfSpan * 0.5, wcy + halfSpan);
        ctx.moveTo(wcx + u + halfSpan * 0.5, wcy - halfSpan);
        ctx.lineTo(wcx + u - halfSpan * 0.5, wcy + halfSpan);
      }
      ctx.stroke();
    }

    // Concentric Gravity Rings
    for (const rW of [220, 520, 740, 920]) {
      ctx.strokeStyle = rW === 740 ? 'rgba(255, 68, 238, 0.28)' : 'rgba(136, 51, 255, 0.24)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(wcx, wcy, rW * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Center Singularity Core Node
    ctx.fillStyle = '#04010c';
    ctx.strokeStyle = theme.primary;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(wcx, wcy, Math.max(4, 102 * scale), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    recordPoi('SINGULARITY CORE', `Depth ${this.descentDepth || 1} Crucible Center`, wcx, wcy, this.world.center, this.world.center, theme.primary, 'descent_crucible_entry');

    // Slipstream Boost Lanes
    if (this.world.boostStrips) {
      ctx.strokeStyle = '#ff66ee';
      ctx.lineWidth = Math.min(4.2, 2.2 * iconScale);
      ctx.globalAlpha = 0.85;
      for (const bs of this.world.boostStrips) {
        ctx.beginPath();
        ctx.moveTo(toMX(bs.x1), toMY(bs.y1));
        ctx.lineTo(toMX(bs.x2), toMY(bs.y2));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Cover Monoliths & Chamfer Bulkheads
    for (const w of this.world.walls) {
      ctx.strokeStyle = w.color || theme.secondary;
      ctx.lineWidth = w.isDescentPerimeter ? Math.min(4, 2.2 * iconScale) : Math.min(5, 2.8 * iconScale);
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.moveTo(toMX(w.x1), toMY(w.y1));
      ctx.lineTo(toMX(w.x2), toMY(w.y2));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Uncollected Module & Shard Drops
    if (this.moduleDrops) {
      for (const md of this.moduleDrops) {
        if (!md || md.markedForDeletion || !inView(md.x, md.y)) continue;
        const sx = toMX(md.x);
        const sy = toMY(md.y);
        const col = md.color || '#ffd700';
        ctx.fillStyle = col;
        ctx.fillRect(sx - 2.4 * iconScale, sy - 2.4 * iconScale, 4.8 * iconScale, 4.8 * iconScale);
        recordPoi(md.mod ? md.mod.name.toUpperCase() : 'FREQUENCY SHARD', ' Crucible Drop', sx, sy, md.x, md.y, col);
      }
    }

    // Live Crucible Hostiles (always visible inside tactical Crucible map)
    if (this.enemies) {
      for (const en of this.enemies) {
        if (!en || en.markedForDeletion || en.hp <= 0 || !inView(en.x, en.y)) continue;
        const ex = toMX(en.x);
        const ey = toMY(en.y);
        if (en.isBoss) {
          ctx.strokeStyle = '#ff0055';
          ctx.fillStyle = '#ffd700';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ex, ey, 6 * iconScale, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillRect(ex - 2.5, ey - 2.5, 5, 5);
          if (inRect(ex, ey)) {
            ctx.font = 'bold 9px monospace';
            ctx.fillStyle = '#ff3366';
            ctx.fillText('WARDEN', ex, ey - 8 * iconScale);
          }
          recordPoi('CRUCIBLE WARDEN', `Depth ${this.descentDepth || 1} Boss`, ex, ey, en.x, en.y, '#ff3366', (this.descentDepth || 1) >= 10 ? 'descent_depth_10' : 'descent_depth_5');
        } else if (en.isElite) {
          ctx.fillStyle = '#ffcc33';
          ctx.fillRect(ex - 2.4, ey - 2.4, 4.8, 4.8);
        } else {
          ctx.fillStyle = 'rgba(255, 68, 120, 0.82)';
          ctx.fillRect(ex - 1.6, ey - 1.6, 3.2, 3.2);
        }
      }
    }
  }

  drawPauseWorldMap() {
    if (!this.world || !this.ctx || !this.canvas) return;
    this._ensurePauseMapState();
    this._clampPauseMapCamera();
    const ctx = this.ctx;
    const { vw, vh, mx, my, mapW, mapH, scale, cx, cy } = this._getPauseMapLayout();
    const sec = this.world.getSectorAt(this.player.x, this.player.y);
    const descentTheme = this.isDescentMode ? this._getDescentDepthTheme() : null;

    this._pauseMapRect = { x: mx, y: my, w: mapW, h: mapH };
    this._pauseMapButtons = [];
    this._pauseMapPoiHits = [];
    this._pauseMapLoreRect = null;
    this._pauseMapInspectorRect = null;
    this._pauseMapTelemetryRect = null;

    const toMX = (wx) => cx + (wx - this.mapCamX) * scale;
    const toMY = (wy) => cy + (wy - this.mapCamY) * scale;
    const halfW = (mapW * 0.5) / scale + 1800;
    const halfH = (mapH * 0.5) / scale + 1800;
    const inView = (wx, wy) => Math.abs(wx - this.mapCamX) <= halfW && Math.abs(wy - this.mapCamY) <= halfH;
    const segInView = (x1, y1, x2, y2) => !(
      Math.max(x1, x2) < this.mapCamX - halfW ||
      Math.min(x1, x2) > this.mapCamX + halfW ||
      Math.max(y1, y2) < this.mapCamY - halfH ||
      Math.min(y1, y2) > this.mapCamY + halfH
    );
    const inRect = (sx, sy) => sx >= mx + 2 && sx <= mx + mapW - 2 && sy >= my + 2 && sy <= my + mapH - 2;
    const recordPoi = (title, sub, sx, sy, wx, wy, color, transmissionId = null) => {
      if (inRect(sx, sy)) this._pauseMapPoiHits.push({ title, sub, x: sx, y: sy, wx, wy, color, transmissionId });
    };
    const iconScale = Math.min(2.4, 1 + Math.log2(Math.max(1, this.mapZoom)) * 0.42);

    const lorePool = this._getPauseMapLorePool();
    const logsTotal = lorePool.length || (this.isDescentMode ? 3 : 24);
    const logsUnlocked = lorePool.filter(
      t => t && typeof Meta !== 'undefined' && typeof Meta.isTransmissionUnlocked === 'function' && Meta.isTransmissionUnlocked(t.id)
    ).length;

    const foundCount = this.world.perkVaults
      ? this.world.perkVaults.filter(v => typeof Meta !== 'undefined' && Meta.isMapPerkFound && Meta.isMapPerkFound(v.perkId)).length
      : 0;
    const totalVaults = this.world.perkVaults ? this.world.perkVaults.length : 0;
    const citCount = this.world.monoliths
      ? this.world.monoliths.filter(m => typeof Meta !== 'undefined' && Meta.isSectorConquered && Meta.isSectorConquered(m.element)).length
      : 0;
    const deepCount = this.world.deepBeacons
      ? this.world.deepBeacons.filter(b => typeof Meta !== 'undefined' && Meta.isDeepBeaconUnlocked && Meta.isDeepBeaconUnlocked(b.element)).length
      : 0;

    ctx.save();
    ctx.fillStyle = 'rgba(2, 5, 13, 0.94)';
    ctx.fillRect(0, 0, vw, vh);

    // Header + Top-Left Logs Toggle + Top-Right Close Button
    const logsBtn = { id: 'toggleLogs', x: mx, y: 14, w: vw < 420 ? 78 : 86, h: 32 };
    const closeBtn = { id: 'close', x: vw - 92, y: 14, w: 80, h: 32 };
    const headerLeft = logsBtn.x + logsBtn.w + 8;
    const headerRight = closeBtn.x - 8;
    const headerMaxW = Math.max(100, headerRight - headerLeft);
    const titleX = (headerLeft + headerRight) * 0.5;
    const headerCol = this.isDescentMode ? descentTheme.primary : '#00ffff';

    this._pauseMapButtons.push(logsBtn);
    ctx.fillStyle = this.mapLogsOpen ? 'rgba(0, 238, 255, 0.24)' : 'rgba(6, 16, 36, 0.90)';
    ctx.strokeStyle = this.mapLogsOpen ? '#ffffff' : headerCol;
    ctx.lineWidth = 1.6;
    ctx.fillRect(logsBtn.x, logsBtn.y, logsBtn.w, logsBtn.h);
    ctx.strokeRect(logsBtn.x, logsBtn.y, logsBtn.w, logsBtn.h);
    ctx.textAlign = 'center';
    ctx.fillStyle = this.mapLogsOpen ? '#ffffff' : headerCol;
    ctx.font = `bold ${vw < 420 ? 10 : 11}px monospace`;
    ctx.fillText(`LOGS ${logsUnlocked}/${logsTotal}`, logsBtn.x + logsBtn.w * 0.5, logsBtn.y + 20, logsBtn.w - 6);

    ctx.textAlign = 'center';
    ctx.font = `bold ${vw < 480 ? 14 : 17}px monospace`;
    const mapHeaderTitle = this.isDescentMode
      ? `SINGULARITY CRUCIBLE // ${this.mapZoom.toFixed(1)}x`
      : `TACTICAL MAP // ${this.mapZoom.toFixed(1)}x`;
    if (typeof ctx.strokeText === 'function') {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(2, 6, 16, 0.90)';
      ctx.strokeText(mapHeaderTitle, titleX, 24, headerMaxW);
    }
    ctx.fillStyle = headerCol;
    ctx.fillText(mapHeaderTitle, titleX, 24, headerMaxW);

    ctx.font = `${vw < 480 ? 9 : 11}px monospace`;
    ctx.fillStyle = '#d0eeff';
    if (this.isDescentMode) {
      const liveEnemies = this.enemies ? this.enemies.filter(e => !e.markedForDeletion && e.hp > 0).length : 0;
      const bestDepth = (typeof Meta !== 'undefined' && Meta.data && Meta.data.bestDescentDepth) || 0;
      ctx.fillText(
        `DEPTH ${this.descentDepth || 1} • ${descentTheme.name} | HOSTILES ${liveEnemies} | WAVE ${Math.max(0, this.descentWaveTimer || 0).toFixed(1)}s | BEST ${bestDepth}`,
        titleX,
        38,
        headerMaxW
      );
    } else {
      ctx.fillText(
        `${sec.name} | LVL ${sec.zoneLevel || 0} | CIT ${citCount}/7 | DEEP ${deepCount}/7 | VAULTS ${foundCount}/${totalVaults}`,
        titleX,
        38,
        headerMaxW
      );
    }

    // Compact Diegetic Signal Telemetry Sub-Pill (strictly above mapFrame my = 60)
    const sigCompact = vw < 640;
    const sigTelemetry = this._signalTelemetry;
    const sigText = sigTelemetry
      ? sigTelemetry.formatTelemetryBadge(sigCompact)
      : (sigCompact ? 'SIG 60Hz [RES]' : 'SIG 60Hz [RESONANT]');
    const sigColor = sigTelemetry ? sigTelemetry.getFidelityColor() : '#00ffaa';
    let pillFontPx = sigCompact ? 9 : 10;
    ctx.font = `bold ${pillFontPx}px monospace`;
    let measuredSigW = typeof ctx.measureText === 'function'
      ? ctx.measureText(sigText).width
      : (sigText.length * pillFontPx * 0.72);
    if (measuredSigW > headerMaxW - 10 && pillFontPx > 8) {
      pillFontPx = 8;
      ctx.font = `bold ${pillFontPx}px monospace`;
      measuredSigW = typeof ctx.measureText === 'function'
        ? ctx.measureText(sigText).width
        : (sigText.length * pillFontPx * 0.72);
    }
    const pillPad = 10;
    const pillW = Math.min(headerMaxW, Math.max(84, Math.ceil(measuredSigW + pillPad)));
    const pillH = 13;
    const pillY = 45;
    const pillX = Math.round(titleX - pillW * 0.5);
    const pillMaxTextW = Math.max(40, pillW - 6);
    this._pauseMapTelemetryRect = {
      x: pillX,
      y: pillY,
      w: pillW,
      h: pillH,
      text: sigText,
      textWidth: measuredSigW,
      maxWidth: pillMaxTextW
    };
    ctx.fillStyle = 'rgba(4, 12, 26, 0.92)';
    ctx.fillRect(pillX, pillY, pillW, pillH);
    ctx.strokeStyle = sigColor;
    ctx.lineWidth = 1.1;
    ctx.strokeRect(pillX, pillY, pillW, pillH);
    ctx.textAlign = 'center';
    ctx.fillStyle = sigColor;
    ctx.fillText(sigText, titleX, pillY + 10, pillMaxTextW);

    this._pauseMapButtons.push(closeBtn);
    ctx.fillStyle = 'rgba(255, 51, 102, 0.22)';
    ctx.strokeStyle = '#ff3366';
    ctx.lineWidth = 1.6;
    ctx.fillRect(closeBtn.x, closeBtn.y, closeBtn.w, closeBtn.h);
    ctx.strokeRect(closeBtn.x, closeBtn.y, closeBtn.w, closeBtn.h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('✕ CLOSE', closeBtn.x + closeBtn.w * 0.5, closeBtn.y + 20);

    // Map Frame
    ctx.fillStyle = this.isDescentMode ? 'rgba(8, 3, 18, 0.98)' : 'rgba(5, 10, 22, 0.98)';
    ctx.strokeStyle = this.isDescentMode ? descentTheme.primary : 'rgba(0, 255, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.fillRect(mx, my, mapW, mapH);
    ctx.strokeRect(mx, my, mapW, mapH);

    // Clipped Map Content
    ctx.save();
    if (typeof ctx.clip === 'function') {
      ctx.beginPath();
      ctx.rect(mx, my, mapW, mapH);
      ctx.clip();
    }

    if (this.isDescentMode) {
      this._drawDescentPauseMapContents(ctx, { scale, toMX, toMY, inView, inRect, recordPoi, iconScale, theme: descentTheme });
    } else {
    const worldW = this.world.size * scale;
    const w0x = toMX(0);
    const w0y = toMY(0);
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.25)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(w0x, w0y, worldW, worldW);

    // Tactical grid when zoomed in >= 2.0x
    if (this.mapZoom >= 2.0) {
      const stepW = this.mapZoom >= 5.5 ? 2000 : 4000;
      const startGX = Math.max(0, Math.floor((this.mapCamX - halfW) / stepW) * stepW);
      const endGX = Math.min(this.world.size, Math.ceil((this.mapCamX + halfW) / stepW) * stepW);
      const startGY = Math.max(0, Math.floor((this.mapCamY - halfH) / stepW) * stepW);
      const endGY = Math.min(this.world.size, Math.ceil((this.mapCamY + halfH) / stepW) * stepW);
      ctx.strokeStyle = 'rgba(0, 238, 255, 0.065)';
      ctx.lineWidth = 1;
      for (let gx = startGX; gx <= endGX; gx += stepW) {
        const sx = toMX(gx);
        ctx.beginPath(); ctx.moveTo(sx, my); ctx.lineTo(sx, my + mapH); ctx.stroke();
      }
      for (let gy = startGY; gy <= endGY; gy += stepW) {
        const sy = toMY(gy);
        ctx.beginPath(); ctx.moveTo(mx, sy); ctx.lineTo(mx + mapW, sy); ctx.stroke();
      }
    }

    const wcx = toMX(this.world.center);
    const wcy = toMY(this.world.center);

    // Rings (96k continuum)
    const sanctumR = this.world.sanctumRadius || 1300;
    const ringMeta = [
      { r: sanctumR, color: 'rgba(0,255,255,0.42)' },
      { r: 14500, color: 'rgba(0,255,255,0.22)' },
      { r: 20500, color: 'rgba(255,255,255,0.14)' },
      { r: 26500, color: 'rgba(255,0,255,0.28)' },
      { r: 39000, color: 'rgba(255,215,0,0.28)' }
    ];
    for (const rg of ringMeta) {
      ctx.strokeStyle = rg.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(wcx, wcy, rg.r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Sector dividers & labels
    const sCount = this.world.sectorDefs.length;
    const sStep = (Math.PI * 2) / sCount;
    for (let i = 0; i < sCount; i++) {
      const def = this.world.sectorDefs[i];
      const divAng = def.angle + sStep / 2;
      ctx.strokeStyle = 'rgba(170, 221, 255, 0.14)';
      ctx.beginPath();
      ctx.moveTo(wcx + Math.cos(divAng) * sanctumR * scale, wcy + Math.sin(divAng) * sanctumR * scale);
      ctx.lineTo(wcx + Math.cos(divAng) * 46500 * scale, wcy + Math.sin(divAng) * 46500 * scale);
      ctx.stroke();

      const lblR = 23600 * scale;
      const lx = wcx + Math.cos(def.angle) * lblR;
      const ly = wcy + Math.sin(def.angle) * lblR;
      if (inRect(lx, ly)) {
        const affInfo = this.getBiomeAffinityText(def.id);
        ctx.fillStyle = def.color;
        ctx.font = `bold ${Math.min(13, Math.round(9 * iconScale))}px system-ui, -apple-system, sans-serif`;
        ctx.fillText(`${def.id.toUpperCase()} (${def.levelLabel || ''})`, lx, ly + 3);
        if (affInfo) {
          ctx.font = `bold ${Math.min(11, Math.round(7.5 * iconScale))}px system-ui, -apple-system, sans-serif`;
          ctx.fillStyle = '#d4f3ff';
          ctx.fillText(`W:${affInfo.weak} R:${affInfo.resist}`, lx, ly + 15);
        }
      }
    }

    // Culled wall silhouettes, sector dividers, boost strips, chasms, bridges, forcegates & hazards
    for (const w of this.world.walls) {
      if (!segInView(w.x1, w.y1, w.x2, w.y2)) continue;
      ctx.lineWidth = w.isSectorDivider ? Math.min(4.2, 1.8 * iconScale) : Math.min(3.2, 1 * iconScale);
      ctx.strokeStyle = w.isSectorDivider ? '#33ddff' : w.color;
      ctx.globalAlpha = w.isSectorDivider ? 0.65 : 0.34;
      ctx.beginPath();
      ctx.moveTo(toMX(w.x1), toMY(w.y1));
      ctx.lineTo(toMX(w.x2), toMY(w.y2));
      ctx.stroke();
    }
    if (this.world.boostStrips) {
      ctx.strokeStyle = '#00eeff';
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = Math.min(3.6, 1.8 * iconScale);
      for (const bs of this.world.boostStrips) {
        if (!segInView(bs.x1, bs.y1, bs.x2, bs.y2)) continue;
        ctx.beginPath();
        ctx.moveTo(toMX(bs.x1), toMY(bs.y1));
        ctx.lineTo(toMX(bs.x2), toMY(bs.y2));
        ctx.stroke();
      }
    }
    if (this.world.chasms) {
      ctx.strokeStyle = '#7733ff';
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = Math.min(4.8, 2.4 * iconScale);
      for (const ch of this.world.chasms) {
        if (!segInView(ch.x1, ch.y1, ch.x2, ch.y2)) continue;
        ctx.beginPath();
        ctx.moveTo(toMX(ch.x1), toMY(ch.y1));
        ctx.lineTo(toMX(ch.x2), toMY(ch.y2));
        ctx.stroke();
      }
    }
    if (this.world.bridges) {
      ctx.strokeStyle = '#00eeff';
      ctx.globalAlpha = 0.92;
      ctx.lineWidth = Math.min(4.2, 2.1 * iconScale);
      for (const b of this.world.bridges) {
        if (!segInView(b.x1, b.y1, b.x2, b.y2)) continue;
        ctx.beginPath();
        ctx.moveTo(toMX(b.x1), toMY(b.y1));
        ctx.lineTo(toMX(b.x2), toMY(b.y2));
        ctx.stroke();
      }
    }
    if (this.world.forceGates) {
      ctx.lineWidth = Math.min(4.4, 2.4 * iconScale);
      for (const g of this.world.forceGates) {
        if (!segInView(g.x1, g.y1, g.x2, g.y2)) continue;
        const open = this.world.isForceGateOpen && this.world.isForceGateOpen(g);
        ctx.strokeStyle = open ? 'rgba(255,255,255,0.22)' : g.color;
        ctx.globalAlpha = open ? 0.35 : 1;
        ctx.beginPath();
        ctx.moveTo(toMX(g.x1), toMY(g.y1));
        ctx.lineTo(toMX(g.x2), toMY(g.y2));
        ctx.stroke();
      }
    }
    if (this.world.hazards) {
      for (const h of this.world.hazards) {
        if (!inView(h.x, h.y)) continue;
        ctx.fillStyle = h.color;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(toMX(h.x), toMY(h.y), Math.max(1.8, 1.6 * iconScale), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Warp route links at zoom >= 1.8x
    if (this.mapZoom >= 1.8 && this.world.echoPads) {
      ctx.save();
      if (ctx.setLineDash) ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.2;
      for (const pad of this.world.echoPads) {
        if (!this._isEchoPadUnlocked(pad) || !Number.isFinite(pad.targetX)) continue;
        if (!segInView(pad.x, pad.y, pad.targetX, pad.targetY)) continue;
        ctx.strokeStyle = pad.color || '#00ffff';
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.moveTo(toMX(pad.x), toMY(pad.y));
        ctx.lineTo(toMX(pad.targetX), toMY(pad.targetY));
        ctx.stroke();
      }
      ctx.restore();
    }

    // Outpost Beacons
    if (this.world.outpostBeacons) {
      for (const ob of this.world.outpostBeacons) {
        if (!inView(ob.x, ob.y)) continue;
        const sx = toMX(ob.x);
        const sy = toMY(ob.y);
        ctx.fillStyle = ob.color;
        ctx.beginPath();
        ctx.arc(sx, sy, 2.3 * iconScale, 0, Math.PI * 2);
        ctx.fill();
        recordPoi(`${(ob.element || 'SECTOR').toUpperCase()} OUTPOST`, 'Bidirectional Warp Beacon', sx, sy, ob.x, ob.y, ob.color, ob.element ? `biome_${ob.element}` : null);
      }
    }

    // Shrines
    for (const s of this.world.shrines) {
      if (s.completed || !inView(s.x, s.y)) continue;
      const sx = toMX(s.x);
      const sy = toMY(s.y);
      const hs = 1.6 * iconScale;
      ctx.fillStyle = s.color;
      ctx.fillRect(sx - hs, sy - hs, hs * 2, hs * 2);
      recordPoi(`SHRINE (${(s.kind || 'BLESSING').toUpperCase()})`, 'Hold to Activate', sx, sy, s.x, s.y, s.color);
      if (this.mapZoom >= 4.2 && inRect(sx, sy)) {
        ctx.font = '8px monospace';
        ctx.fillStyle = s.color;
        ctx.fillText((s.kind || 'SHRINE').toUpperCase(), sx, sy - hs - 4);
      }
    }

    // Deep Beacons
    if (this.world.deepBeacons) {
      for (const b of this.world.deepBeacons) {
        if (!inView(b.x, b.y)) continue;
        const bx = toMX(b.x);
        const by = toMY(b.y);
        const r = 3.6 * iconScale;
        const unlocked = b.activatedThisRun || (typeof Meta !== 'undefined' && Meta.isDeepBeaconUnlocked && Meta.isDeepBeaconUnlocked(b.element));
        ctx.fillStyle = b.color;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(bx, by - r);
        ctx.lineTo(bx + r * 0.9, by + r * 0.75);
        ctx.lineTo(bx - r * 0.9, by + r * 0.75);
        ctx.closePath();
        if (unlocked) ctx.fill();
        else ctx.stroke();
        recordPoi(`${b.element.toUpperCase()} DEEP BEACON`, unlocked ? 'Unlocked Warp Node' : 'Hold to Unlock', bx, by, b.x, b.y, b.color);
        if (this.mapZoom >= 2.4 && inRect(bx, by)) {
          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = b.color;
          ctx.fillText(`DEEP ${b.element.toUpperCase()}`, bx, by - r - 4);
        }
      }
    }

    // Citadel Monoliths
    for (const m of this.world.monoliths) {
      if (!inView(m.x, m.y)) continue;
      const ix = toMX(m.x);
      const iy = toMY(m.y);
      const hs = 4 * iconScale;
      const cleared = m.state === 'conquered' || (typeof Meta !== 'undefined' && Meta.isSectorConquered && Meta.isSectorConquered(m.element));
      ctx.fillStyle = m.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.fillRect(ix - hs, iy - hs, hs * 2, hs * 2);
      if (cleared) ctx.strokeRect(ix - hs, iy - hs, hs * 2, hs * 2);
      recordPoi(`${m.element.toUpperCase()} CITADEL`, cleared ? 'Conquered • Warp Ready' : 'Citadel Guardian Boss', ix, iy, m.x, m.y, m.color, cleared ? 'citadel_first_clear' : `biome_${m.element}`);
      if (this.mapZoom >= 2.2 && inRect(ix, iy)) {
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${m.element.toUpperCase()} CITADEL`, ix, iy - hs - 4);
      }
    }

    // Perk Vaults
    if (this.world.perkVaults) {
      for (const v of this.world.perkVaults) {
        if (!inView(v.x, v.y)) continue;
        const vx = toMX(v.x);
        const vy = toMY(v.y);
        const found = v.collectedThisRun || (typeof Meta !== 'undefined' && Meta.isMapPerkFound && Meta.isMapPerkFound(v.perkId));
        const r = (v.isKeystone ? 4.8 : 3.4) * iconScale;
        const col = v.isKeystone ? '#ffd700' : (found ? '#00ff88' : '#ffffff');
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(vx, vy - r);
        ctx.lineTo(vx + r, vy);
        ctx.lineTo(vx, vy + r);
        ctx.lineTo(vx - r, vy);
        ctx.closePath();
        ctx.fill();
        recordPoi(v.isKeystone ? `KEYSTONE: ${v.perkName || v.perkId}` : `VAULT: ${v.perkName || v.perkId}`, found ? 'Blueprint Unlocked' : 'Security Vault', vx, vy, v.x, v.y, col);
      }
    }

    // Sanctum Echo Entities, Rescue Chambers, Volatile Pacts & Wanderer
    if (this.world.sanctumEntities) {
      for (const ent of this.world.sanctumEntities) {
        if (!inView(ent.x, ent.y)) continue;
        const sx = toMX(ent.x);
        const sy = toMY(ent.y);
        ctx.fillStyle = ent.color || '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, sy, 2.2 * iconScale, 0, Math.PI * 2);
        ctx.fill();
        let entTransId = null;
        if (ent.id === 'archivist' || ent.id === 'artificer' || ent.id === 'broker') {
          entTransId = `entity_${ent.id}`;
        } else if (ent.id === 'architectConduit') {
          const isUnl = (id) => typeof Meta !== 'undefined' && typeof Meta.isTransmissionUnlocked === 'function' && Meta.isTransmissionUnlocked(id);
          entTransId = isUnl('architect_shattered') ? 'architect_shattered' : (isUnl('architect_phase3') ? 'architect_phase3' : (isUnl('architect_phase2') ? 'architect_phase2' : 'architect_shattered'));
        }
        recordPoi((ent.name || ent.id || 'SANCTUM TERMINAL').toUpperCase(), 'Sanctum Terminal', sx, sy, ent.x, ent.y, ent.color || '#ffffff', entTransId);
      }
    }
    if (this.world.rescueChambers) {
      for (const rc of this.world.rescueChambers) {
        if (rc.rescuedThisRun || !inView(rc.x, rc.y)) continue;
        const sx = toMX(rc.x);
        const sy = toMY(rc.y);
        ctx.strokeStyle = rc.color || '#ff00ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.6 * iconScale, 0, Math.PI * 2);
        ctx.stroke();
        recordPoi('RESCUE CHAMBER', 'Free Allied Unit (+Reward)', sx, sy, rc.x, rc.y, rc.color || '#ff00ff', (rc.entityId === 'artificer' || rc.entityId === 'broker') ? `entity_${rc.entityId}` : null);
      }
    }
    if (this.world.volatilePacts) {
      for (const pact of this.world.volatilePacts) {
        if (pact.completedThisRun || !inView(pact.x, pact.y)) continue;
        const sx = toMX(pact.x);
        const sy = toMY(pact.y);
        const hs = 2 * iconScale;
        ctx.fillStyle = pact.color || '#ff3366';
        ctx.fillRect(sx - hs, sy - hs, hs * 2, hs * 2);
        recordPoi('VOLATILE PACT', 'High-Risk Kill Challenge', sx, sy, pact.x, pact.y, pact.color || '#ff3366');
      }
    }
    if (this.wanderer && !this.wanderer.visited && inView(this.wanderer.x, this.wanderer.y)) {
      const sx = toMX(this.wanderer.x);
      const sy = toMY(this.wanderer.y);
      ctx.fillStyle = '#00ffaa';
      ctx.beginPath();
      ctx.arc(sx, sy, 3 * iconScale, 0, Math.PI * 2);
      ctx.fill();
      recordPoi('VOID WANDERER', 'Traveling Merchant & Lore', sx, sy, this.wanderer.x, this.wanderer.y, '#00ffaa', 'encounter_wanderer');
    }

    // World POIs
    if (this.world.extractorRigs) {
      for (const rig of this.world.extractorRigs) {
        if (rig.capturedThisRun || !inView(rig.x, rig.y)) continue;
        const sx = toMX(rig.x);
        const sy = toMY(rig.y);
        ctx.fillStyle = rig.color || '#00eeff';
        ctx.beginPath();
        ctx.arc(sx, sy, 2.2 * iconScale, 0, Math.PI * 2);
        ctx.fill();
        recordPoi('EXTRACTOR RIG', 'Defend for Matter Cache', sx, sy, rig.x, rig.y, rig.color || '#00eeff');
      }
    }
    if (this.world.strongholds) {
      for (const sh of this.world.strongholds) {
        if (sh.capturedThisRun || !inView(sh.x, sh.y)) continue;
        const sx = toMX(sh.x);
        const sy = toMY(sh.y);
        const hs = 2.6 * iconScale;
        ctx.strokeStyle = sh.color || '#ff4422';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(sx - hs, sy - hs, hs * 2, hs * 2);
        recordPoi('SECTOR STRONGHOLD', 'Clear Garrison & Claim Loot', sx, sy, sh.x, sh.y, sh.color || '#ff4422');
      }
    }
    if (this.world.slotForges) {
      for (const fg of this.world.slotForges) {
        if (!inView(fg.x, fg.y)) continue;
        const sx = toMX(fg.x);
        const sy = toMY(fg.y);
        const unlocked = fg.unlockedThisRun || (typeof Meta !== 'undefined' && Meta.isSlotUnlocked && Meta.isSlotUnlocked(fg.slotKey));
        const col = unlocked ? '#00ff88' : (fg.color || '#00ffaa');
        ctx.fillStyle = col;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.6 * iconScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        recordPoi(`FORGE: ${(fg.slotKey || 'SLOT').toUpperCase()}`, unlocked ? 'Slot Unlocked' : 'Unlock Extra Module Slot', sx, sy, fg.x, fg.y, col);
        if (this.mapZoom >= 2.4 && inRect(sx, sy)) {
          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = col;
          ctx.fillText(`FORGE`, sx, sy - 3.6 * iconScale - 4);
        }
      }
    }
    if (this.world.mythicVaults) {
      for (const mv of this.world.mythicVaults) {
        if (!inView(mv.x, mv.y)) continue;
        const pxM = toMX(mv.x);
        const pyM = toMY(mv.y);
        const r = 5.2 * iconScale;
        const col = mv.collectedThisRun ? '#00ff88' : (mv.color || '#ffcc33');
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(pxM, pyM - r);
        ctx.lineTo(pxM + r, pyM);
        ctx.lineTo(pxM, pyM + r);
        ctx.lineTo(pxM - r, pyM);
        ctx.closePath();
        ctx.fill();
        recordPoi(`MYTHIC: ${mv.name || 'RELIC VAULT'}`, mv.collectedThisRun ? 'Collected' : 'Guarded Relic Vault', pxM, pyM, mv.x, mv.y, col, 'encounter_mythic_vault');
        if (this.mapZoom >= 2.4 && inRect(pxM, pyM)) {
          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = col;
          ctx.fillText((mv.name || 'MYTHIC').toUpperCase(), pxM, pyM - r - 4);
        }
      }
    }
    if (this.world.crystalGeodes) {
      for (const cg of this.world.crystalGeodes) {
        if (cg.collectedThisRun || !inView(cg.x, cg.y)) continue;
        const sx = toMX(cg.x);
        const sy = toMY(cg.y);
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(sx, sy, 2.5 * iconScale, 0, Math.PI * 2);
        ctx.fill();
        recordPoi('CRYSTAL GEODE', '+Crystals, Matter & Module', sx, sy, cg.x, cg.y, '#ffd700');
        if (this.mapZoom >= 4.2 && inRect(sx, sy)) {
          ctx.font = '8px monospace';
          ctx.fillStyle = '#ffd700';
          ctx.fillText('GEODE', sx, sy - 2.5 * iconScale - 4);
        }
      }
    }
    if (this.world.abyssalAnomalies) {
      for (const aa of this.world.abyssalAnomalies) {
        if (aa.clearedThisRun || !inView(aa.x, aa.y)) continue;
        const sx = toMX(aa.x);
        const sy = toMY(aa.y);
        ctx.strokeStyle = '#ff33cc';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.2 * iconScale, 0, Math.PI * 2);
        ctx.stroke();
        recordPoi(aa.name || 'ABYSSAL RIFT', 'Hold to Stabilize', sx, sy, aa.x, aa.y, '#ff33cc');
      }
    }
    const mapPortals = [...(this.world.rimPortals || []), ...(this.returnPortals || [])];
    for (const p of mapPortals) {
      if (!p || p.consumed || !inView(p.x, p.y)) continue;
      const sx = toMX(p.x);
      const sy = toMY(p.y);
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(sx, sy, 4.0 * iconScale, 0, Math.PI * 2);
      ctx.stroke();
      recordPoi(p.name || 'SANCTUM RETURN PORTAL', 'Warp Back to Void Sanctum (+20% Safe Bonus)', sx, sy, p.x, p.y, '#00ffff');
      if (this.mapZoom >= 2.2 && inRect(sx, sy)) {
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#00ffff';
        ctx.fillText('PORTAL', sx, sy - 4.2 * iconScale - 3);
      }
    }

    // Live Enemies & Bosses when zoomed >= 3.5x
    if (this.mapZoom >= 3.5 && this.enemies) {
      for (const en of this.enemies) {
        if (!en || en.markedForDeletion || en.hp <= 0 || !inView(en.x, en.y)) continue;
        const ex = toMX(en.x);
        const ey = toMY(en.y);
        if (en.isBoss) {
          ctx.strokeStyle = '#ff0055';
          ctx.fillStyle = '#ffd700';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ex, ey, 6.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillRect(ex - 2.5, ey - 2.5, 5, 5);
          ctx.font = 'bold 9px monospace';
          ctx.fillStyle = '#ff3366';
          ctx.fillText('BOSS', ex, ey - 9);
        } else if (en.isElite) {
          ctx.fillStyle = '#ffcc33';
          ctx.fillRect(ex - 2, ey - 2, 4, 4);
        } else {
          ctx.fillStyle = 'rgba(255, 68, 102, 0.55)';
          ctx.fillRect(ex - 1, ey - 1, 2, 2);
        }
      }
    }

    // Selected POI Target Reticle
    } // end overworld pause map block
    if (this.mapSelectedPoi) {
      const selX = toMX(this.mapSelectedPoi.wx);
      const selY = toMY(this.mapSelectedPoi.wy);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(selX, selY, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(selX - 18, selY); ctx.lineTo(selX - 9, selY);
      ctx.moveTo(selX + 9, selY); ctx.lineTo(selX + 18, selY);
      ctx.moveTo(selX, selY - 18); ctx.lineTo(selX, selY - 9);
      ctx.moveTo(selX, selY + 9); ctx.lineTo(selX, selY + 18);
      ctx.stroke();
    }

    // Player Marker + Facing Chevron (or offscreen pointer if panned away)
    const px = toMX(this.player.x);
    const py = toMY(this.player.y);
    if (px >= mx - 6 && px <= mx + mapW + 6 && py >= my - 6 && py <= my + mapH + 6) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.stroke();
      const angP = Number.isFinite(this.player.facingAngle) ? this.player.facingAngle : 0;
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(angP) * 14, py + Math.sin(angP) * 14);
      ctx.lineTo(px + Math.cos(angP + 2.4) * 7, py + Math.sin(angP + 2.4) * 7);
      ctx.lineTo(px + Math.cos(angP - 2.4) * 7, py + Math.sin(angP - 2.4) * 7);
      ctx.closePath();
      ctx.fillStyle = '#00ffff';
      ctx.fill();
    } else {
      const pAng = Math.atan2(py - cy, px - cx);
      const ex = Math.max(mx + 14, Math.min(mx + mapW - 62, cx + Math.cos(pAng) * (mapW * 0.45)));
      const ey = Math.max(my + 16, Math.min(my + mapH - 36, cy + Math.sin(pAng) * (mapH * 0.45)));
      ctx.fillStyle = '#00ffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('▶ YOU', ex, ey);
    }

    ctx.restore(); // end clip

    // On-Map Floating Zoom & Preset Rail (right side inside map frame)
    const btnW = vw < 480 ? 50 : 54;
    const btnH = 30;
    const gap = 5;
    const rxBtn = mx + mapW - btnW - 8;
    let ryBtn = my + 8;
    const curRadarRange = (this.isDescentMode ? [1150, 1550, 2100] : (this.miniRadarRanges || [3200, 5800, 10500]))[this.miniRadarZoomIdx ?? 1] || 5800;
    const railItems = [
      { id: 'zoomIn', label: '+', color: '#00ffff' },
      { id: 'zoomReadout', label: `${this.mapZoom.toFixed(1)}x`, color: '#ffd700', readonly: true },
      { id: 'zoomOut', label: '−', color: '#00ffff' },
      { id: 'centerPlayer', label: '◎ ME', color: '#00ffaa' },
      { id: 'presetAll', label: '1x ALL', color: this.mapZoom <= 1.05 ? '#ffffff' : '#aaddff' },
      { id: 'presetLocal', label: this.mapZoom < 5.5 ? '7x NEAR' : '3x SEC', color: '#aaddff' },
      { id: 'cycleRadar', label: `R:${(curRadarRange / 1000).toFixed(1)}k`, color: '#ff88ff' }
    ];
    for (const item of railItems) {
      if (ryBtn + btnH > my + mapH - 30) break;
      if (!item.readonly) {
        this._pauseMapButtons.push({ id: item.id, x: rxBtn, y: ryBtn, w: btnW, h: btnH });
      }
      ctx.fillStyle = item.readonly ? 'rgba(2, 6, 16, 0.78)' : 'rgba(6, 16, 36, 0.90)';
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.readonly ? 1 : 1.4;
      ctx.fillRect(rxBtn, ryBtn, btnW, btnH);
      ctx.strokeRect(rxBtn, ryBtn, btnW, btnH);
      ctx.fillStyle = item.color;
      ctx.font = `bold ${item.label.length > 5 ? 9 : 11}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(item.label, rxBtn + btnW * 0.5, ryBtn + btnH * 0.5 + 4);
      ryBtn += btnH + gap;
    }

    if (this.mapLogsOpen) {
      this._drawPauseMapLoreCard(ctx, { mx, my, mapW, mapH, btnW, accentColor: headerCol });
    }

    // Bottom Inspector / Controls Banner inside Map Frame (strictly single-line 24px)
    this._pauseMapInspectorRect = { x: mx + 2, y: my + mapH - 26, w: mapW - 4, h: 24 };
    ctx.fillStyle = 'rgba(2, 6, 16, 0.88)';
    ctx.fillRect(mx + 2, my + mapH - 26, mapW - 4, 24);
    ctx.textAlign = 'center';
    if (this.mapSelectedPoi) {
      const sp = this.mapSelectedPoi;
      const dist = Math.round(Math.hypot(sp.wx - this.player.x, sp.wy - this.player.y));
      let statusPart = sp.sub;
      if (sp.transmissionId) {
        const isDec = typeof Meta !== 'undefined' && typeof Meta.isTransmissionUnlocked === 'function' && Meta.isTransmissionUnlocked(sp.transmissionId);
        statusPart = isDec ? 'DECODED' : 'ENCRYPTED';
      }
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = sp.color || '#00ffff';
      ctx.fillText(`${sp.title} • ${statusPart} • ${dist}m`, cx, my + mapH - 10, Math.max(140, mapW - 16));
    } else {
      ctx.font = `${vw < 480 ? 9 : 10}px monospace`;
      ctx.fillStyle = '#aaddff';
      ctx.fillText('PINCH / WHEEL / +− ZOOM • DRAG PAN • TAP POI INFO • [C] ME', cx, my + mapH - 10, Math.max(140, mapW - 16));
    }

    ctx.restore();
  }

  _drawPauseMapLoreCard(ctx, opts) {
    const { mx, my, mapW, mapH, btnW, accentColor } = opts;
    const cardMode = this.mapCardMode === 'feats' ? 'feats' : (this.mapCardMode === 'card' ? 'card' : 'logs');
    const lorePool = this._getPauseMapLorePool();
    const featPool = (typeof NeonSystems !== 'undefined' && NeonSystems && Array.isArray(NeonSystems.ACHIEVEMENT_CATALOG))
      ? NeonSystems.ACHIEVEMENT_CATALOG
      : [];
    const pool = cardMode === 'feats' ? featPool : lorePool;
    if (cardMode !== 'card' && !pool.length) {
      this._pauseMapLoreRect = null;
      return;
    }

    const cardX = mx + 10;
    const cardY = my + 10;
    const cardW = Math.max(180, mapW - btnW - 28);
    const cardH = Math.max(110, Math.min(248, mapH - 42));
    this._pauseMapLoreRect = { x: cardX, y: cardY, w: cardW, h: cardH };

    const padX = 12;
    const maxTextW = Math.max(120, cardW - padX * 2);
    const counterReserve = cardMode === 'card' ? 44 : 40;
    const toggleW = Math.min(84, Math.max(62, Math.floor(cardW * (cardMode === 'card' ? 0.29 : 0.30))));
    const toggleH = 18;
    const toggleY = cardY + 6;
    const toggleX = Math.max(Math.round(cardX + cardW * 0.48), cardX + cardW - padX - counterReserve - toggleW);
    const speakerMaxW = Math.max(60, toggleX - 6 - (cardX + padX));

    const featSnap = (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.getAchievementProgressSnapshot === 'function')
      ? NeonSystems.getAchievementProgressSnapshot(typeof Meta !== 'undefined' ? Meta : null)
      : null;
    const featsUnlockedCount = featSnap ? featSnap.unlockedCount : 0;
    const featsTotalCount = featSnap ? featSnap.totalCount : (featPool.length || 28);
    const loreUnlockedCount = lorePool.filter(
      t => t && typeof Meta !== 'undefined' && typeof Meta.isTransmissionUnlocked === 'function' && Meta.isTransmissionUnlocked(t.id)
    ).length;

    let idx = 0;
    let isUnlocked = false;
    let cardCol = accentColor || '#00ffff';
    let speakerLine = '';
    let titleLine = '';
    let bodyText = '';
    let activeCardSource = 'live';

    if (cardMode === 'card') {
      const availSources = this._getAvailablePauseMapCardSources();
      activeCardSource = availSources.includes(this.mapCardSource) ? this.mapCardSource : 'live';
      const snap = this._getActivePauseMapCardSnapshot();
      const modeLabel = snap
        ? (snap.mode === 'daily' ? 'DAILY' : (snap.mode === 'descent' ? 'CRUCIBLE' : 'OVERWORLD'))
        : (this.isDescentMode ? 'CRUCIBLE' : 'OVERWORLD');
      const srcTag = activeCardSource === 'best' ? 'BEST CARD' : (activeCardSource === 'last' ? 'LAST CARD' : 'LIVE CARD');
      isUnlocked = true;
      cardCol = (snap && snap.outcome === 'ARCHITECT CLEARED')
        ? '#ffd700'
        : ((snap && snap.mode === 'descent') ? '#ff22ee' : (accentColor || '#00eeff'));
      speakerLine = snap
        ? `${srcTag} // ${modeLabel} P${snap.phase}·S${snap.singularityLevel}${snap.mode === 'descent' ? ` D${snap.descentDepth}` : ''}`
        : `${srcTag} // ${modeLabel}`;
      titleLine = snap ? `${snap.outcome} • #${snap.seed}` : 'NO SIGNAL DATA';
      if (snap) {
        const mm = String(Math.floor((snap.runTime || 0) / 60)).padStart(2, '0');
        const ss = String((snap.runTime || 0) % 60).padStart(2, '0');
        const pillars = [];
        if (Array.isArray(snap.activeKeystoneIds)) {
          const kNames = {
            glass_cannon: 'Overclocked Core',
            ancestral_bond: 'Autonomous Architect',
            chaos_inoculation: 'Synthetic Singularity',
            avatar_of_fire: 'Absolute Ignition',
            crimson_dance: 'Hemorrhaging Nanobots'
          };
          for (const kId of snap.activeKeystoneIds) {
            if (kNames[kId]) pillars.push(kNames[kId]);
          }
        }
        if (Array.isArray(snap.harmonicSequenceNames)) {
          for (const hn of snap.harmonicSequenceNames) {
            if (hn) pillars.push(hn);
          }
        }
        if (Array.isArray(snap.relicNames)) {
          for (const rn of snap.relicNames) {
            if (rn) pillars.push(rn);
          }
        }
        if (snap.fractureKeyName) pillars.push(snap.fractureKeyName);
        const pillarStr = pillars.length > 0 ? pillars.slice(0, 4).join(' • ') : 'Baseline Chassis';
        bodyText = `DPS ${snap.dps} • EHP ${snap.ehp} • ${mm}:${ss} • ${snap.enemiesKilled} KILLS (${snap.bestKillStreak}x) | ${pillarStr} | FEATS ${snap.featsUnlocked}/${snap.featsTotal} | ${snap.buildCode}`;
      } else {
        bodyText = 'Run telemetry offline.';
      }
    } else if (cardMode === 'feats') {
      idx = ((Number.isFinite(this.mapFeatIndex) ? this.mapFeatIndex : 0) % pool.length + pool.length) % pool.length;
      this.mapFeatIndex = idx;
      const curFeat = pool[idx];
      const snapItem = (featSnap && featSnap.items && featSnap.items[idx]) ? featSnap.items[idx] : { unlocked: false, progress: 0 };
      isUnlocked = Boolean(snapItem.unlocked);
      cardCol = isUnlocked ? (curFeat.color || '#ffd700') : (this.isDescentMode ? '#cc44ff' : '#557799');
      let catLabel = String(curFeat.category || 'FEAT').toUpperCase();
      if (typeof NeonSystems !== 'undefined' && NeonSystems && Array.isArray(NeonSystems.ACHIEVEMENT_CATEGORIES)) {
        const catObj = NeonSystems.ACHIEVEMENT_CATEGORIES.find(c => c && c.id === curFeat.category);
        if (catObj && catObj.label) catLabel = catObj.label;
      }
      const rewardStr = (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.formatAchievementReward === 'function')
        ? NeonSystems.formatAchievementReward(curFeat.reward)
        : '';
      const curProg = snapItem.progress || 0;
      speakerLine = isUnlocked ? `[${catLabel}] • UNLOCKED` : `[${catLabel}] • LOCKED (${curProg}/${curFeat.target})`;
      titleLine = curFeat.title;
      bodyText = isUnlocked
        ? (rewardStr ? `UNLOCKED (${rewardStr}) — ${curFeat.hint}` : `UNLOCKED — ${curFeat.hint}`)
        : `${curFeat.hint} (${curProg}/${curFeat.target}${rewardStr ? ` • ${rewardStr}` : ''})`;
    } else {
      idx = ((Number.isFinite(this.mapLogIndex) ? this.mapLogIndex : 0) % pool.length + pool.length) % pool.length;
      this.mapLogIndex = idx;
      const cur = pool[idx];
      isUnlocked = Boolean(
        cur && typeof Meta !== 'undefined' && typeof Meta.isTransmissionUnlocked === 'function' && Meta.isTransmissionUnlocked(cur.id)
      );
      cardCol = isUnlocked ? (cur.color || accentColor || '#00ffff') : (this.isDescentMode ? '#cc44ff' : '#557799');
      speakerLine = isUnlocked
        ? `${cur.speaker} ${cur.channelTag}`
        : (this.isDescentMode ? 'CRUCIBLE SIGNAL // ENCRYPTED' : 'SIGNAL // ENCRYPTED');
      titleLine = isUnlocked
        ? cur.title
        : (this.isDescentMode ? 'ENCRYPTED CRUCIBLE LOG' : 'ENCRYPTED SIGNAL LOG');
      bodyText = isUnlocked
        ? cur.text
        : (this.isDescentMode
            ? 'Advance deeper into the Singularity Crucible to decrypt this signal.'
            : 'Explore sectors, Sanctum terminals, and Vaults to decrypt this signal.');
    }

    ctx.save();
    ctx.fillStyle = 'rgba(3, 8, 20, 0.96)';
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.strokeStyle = cardCol;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(cardX, cardY, cardW, cardH);
    ctx.fillStyle = cardCol;
    ctx.fillRect(cardX, cardY, 4, cardH);

    ctx.textAlign = 'left';
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = cardCol;
    ctx.fillText(speakerLine, cardX + padX, cardY + 20, speakerMaxW);

    const toggleLabel = cardMode === 'card'
      ? `LOGS ${loreUnlockedCount}/${lorePool.length}`
      : (cardMode === 'feats' ? 'RUN CARD' : `FEATS ${featsUnlockedCount}/${featsTotalCount}`);
    this._pauseMapButtons.push({ id: 'toggleCardMode', x: toggleX, y: toggleY, w: toggleW, h: toggleH });
    ctx.fillStyle = cardMode === 'feats'
      ? 'rgba(255, 215, 0, 0.18)'
      : (cardMode === 'card' ? 'rgba(0, 255, 170, 0.16)' : 'rgba(0, 238, 255, 0.14)');
    ctx.strokeStyle = cardMode === 'feats' ? '#ffd700' : (cardMode === 'card' ? '#00ffaa' : '#00eeff');
    ctx.lineWidth = 1.2;
    ctx.fillRect(toggleX, toggleY, toggleW, toggleH);
    ctx.strokeRect(toggleX, toggleY, toggleW, toggleH);
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(toggleLabel, toggleX + toggleW * 0.5, toggleY + 12, toggleW - 6);

    if (cardMode === 'card') {
      const srcW = 40;
      const srcH = 18;
      const srcX = cardX + cardW - padX - srcW;
      const srcY = toggleY;
      const srcLabel = activeCardSource.toUpperCase();
      const srcCol = activeCardSource === 'best' ? '#ffd700' : (activeCardSource === 'last' ? '#00eeff' : '#00ffaa');
      this._pauseMapButtons.push({ id: 'cardSource', x: srcX, y: srcY, w: srcW, h: srcH });
      ctx.fillStyle = activeCardSource === 'best' ? 'rgba(255, 215, 0, 0.18)' : 'rgba(0, 255, 170, 0.14)';
      ctx.strokeStyle = srcCol;
      ctx.lineWidth = 1.2;
      ctx.fillRect(srcX, srcY, srcW, srcH);
      ctx.strokeRect(srcX, srcY, srcW, srcH);
      ctx.textAlign = 'center';
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(srcLabel, srcX + srcW * 0.5, srcY + 12, srcW - 4);
    } else {
      ctx.textAlign = 'right';
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#aaddff';
      ctx.fillText(`${idx + 1}/${pool.length}`, cardX + cardW - padX, cardY + 20, 38);
    }

    ctx.textAlign = 'left';
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(titleLine, cardX + padX, cardY + 40, maxTextW);

    const toastActive = Boolean(cardMode === 'card' && this._cardActionToast && (this._cardActionToastUntil || 0) > Date.now());
    const bodyPx = 11;
    const lineH = 15;
    const footerH = (cardMode === 'card' && toastActive) ? 48 : 34;
    const bodyTop = cardY + 58;
    const maxLines = Math.max(2, Math.floor((cardY + cardH - footerH - bodyTop) / lineH));
    ctx.font = `${bodyPx}px system-ui, -apple-system, sans-serif`;
    const lines = this._wrapCanvasText(ctx, bodyText, maxTextW, bodyPx, maxLines);

    ctx.fillStyle = isUnlocked ? '#dff2ff' : '#8da6be';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], cardX + padX, bodyTop + i * lineH, maxTextW);
    }

    const btnY = cardY + cardH - 34;
    if (toastActive) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#00ffaa';
      ctx.fillText(this._cardActionToast, cardX + cardW * 0.5, btnY - 5, maxTextW);
    }
    const btnH = 24;
    const subBtnW = Math.min(76, Math.floor((cardW - 36) / 3));
    const btns = [
      { id: 'logsPrev', label: cardMode === 'card' ? 'COPY' : 'PREV', x: cardX + 10, y: btnY, w: subBtnW, h: btnH, color: cardMode === 'card' ? '#00ffaa' : '#00eeff' },
      { id: 'logsNext', label: cardMode === 'card' ? 'PNG' : 'NEXT', x: cardX + 18 + subBtnW, y: btnY, w: subBtnW, h: btnH, color: cardMode === 'card' ? '#ffd700' : '#00eeff' },
      { id: 'logsClose', label: 'CLOSE', x: cardX + cardW - 10 - subBtnW, y: btnY, w: subBtnW, h: btnH, color: '#ff3366' }
    ];
    for (const b of btns) {
      this._pauseMapButtons.push({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h });
      ctx.fillStyle = b.id === 'logsClose' ? 'rgba(255, 51, 102, 0.22)' : 'rgba(6, 18, 40, 0.92)';
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1.4;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.textAlign = 'center';
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(b.label, b.x + b.w * 0.5, b.y + 16, b.w - 4);
    }

    ctx.restore();
  }

  checkLevelUp() {
    if (this.pendingBonusLevelUps > 0) {
      this.pendingBonusLevelUps--;
      this.lastLevelWasBonusPerk = true;
      return true;
    }
    if (this.player.xp >= this.player.xpToNextLevel) {
      this.player.xp -= this.player.xpToNextLevel;
      this.player.level++;
      this.lastLevelWasBonusPerk = false;
      this.player.xpToNextLevel = (typeof getXpForLevel === 'function')
        ? getXpForLevel(this.player.level)
        : Math.round(90 + (this.player.level - 1) * 70 + Math.pow(this.player.level - 1, 1.85) * 14);
      
      if (this.player.level === 15 && !this.event15Triggered) {
        this.triggerArenaEvent(15);
        this.event15Triggered = true;
      } else if (this.player.level === 25 && !this.event25Triggered) {
        this.triggerArenaEvent(25);
        this.event25Triggered = true;
      } else if (this.player.level === 35 && !this.event35Triggered) {
        this.triggerArenaEvent(35);
        this.event35Triggered = true;
      }
      if (this.player.level % 10 === 0) {
        const bossTypes = ['brute', 'sentinel', 'hive', 'golem'];
        let bossType = 'brute';
        if (this.player.level === 20) bossType = 'sentinel';
        else if (this.player.level === 30) bossType = 'hive';
        else if (this.player.level >= 40) bossType = bossTypes[(Math.floor(this.player.level / 10) - 1) % bossTypes.length];
        const ang = this.rng() * Math.PI * 2;
        const ab = this.getActiveArenaBounds();
        let x = Math.max(ab.minX + 80, Math.min(ab.maxX - 80, this.player.x + Math.cos(ang) * 520));
        let y = Math.max(ab.minY + 80, Math.min(ab.maxY - 80, this.player.y + Math.sin(ang) * 520));
        if (this.isDescentMode && this.world && this.world.findClearPoint) {
          const bossPt = this.world.findClearPoint(x, y, 86);
          x = bossPt.x;
          y = bossPt.y;
        }
        this.queueBossEncounter({
          kind: 'milestone',
          level: this.player.level,
          bossType,
          x,
          y,
          title: `APEX ANOMALY (LVL ${this.player.level})`,
          sub: 'OVERLORD & RETINUE INBOUND',
          color: '#ff0055'
        });
      }
      
      return true;
    }
    return false;
  }

  triggerArenaEvent(level) {
    const { hpScaling, dmgMult, speedScaling } = this._getZoneScaling(this.player.x, this.player.y, Math.max(1, level || 1));

    const ab = this.getActiveArenaBounds();
    const waveSize = Math.min(24, level);
    for (let i = 0; i < waveSize; i++) {
        const angle = (Math.PI * 2 / waveSize) * i;
        const dist = 580;
        let ex = Math.max(ab.minX + 60, Math.min(ab.maxX - 60, this.player.x + Math.cos(angle) * dist));
        let ey = Math.max(ab.minY + 60, Math.min(ab.maxY - 60, this.player.y + Math.sin(angle) * dist));
        if (this.isDescentMode && this.world && this.world.findClearPoint) {
          const ePt = this.world.findClearPoint(ex, ey, 62);
          ex = ePt.x;
          ey = ePt.y;
        }
        const elite = new Enemy(ex, ey, hpScaling, speedScaling * 0.9, false, true);
        if (this.isDescentMode && this.world && this.world.resolveCircleWalls) {
          this.world.resolveCircleWalls(elite);
        }
        elite.damage *= dmgMult;
        this.applyPhaseAndModifiersToEnemy(elite);
        this.enemies.push(elite);
    }

    this.setBanner(`VOID SURGE (LVL ${level})`, 'ELITE RING INBOUND', '#ff00ff', 4.0, 2, true);
    this.triggerShake(8, 0.35);
    this.wavePauseTimer = 5.0;
  }

  processEnemyDeath(e, stats) {
      let shouldEvalAchievements = false;
      let bossDefeatedThisDeath = false;
      let pactFulfilledThisDeath = false;
      let citadelElementThisDeath = null;
      let citadelLoreQueued = false;
      let architectLoreQueued = false;
      this.enemiesKilled++;
      this.recentKills = (this.recentKills || 0) + 1;
      this.killStreak = (this.killStreak || 0) + 1;
      this.killStreakTimer = 3.2;
      this.bestKillStreak = Math.max(this.bestKillStreak || 0, this.killStreak);
      if (this.bestKillStreak >= 35 && typeof Meta !== 'undefined' && typeof Meta.recordLifetimeStat === 'function') {
          Meta.recordLifetimeStat('bestKillStreak', this.bestKillStreak, 'max', true);
          if (this.killStreak === 35) shouldEvalAchievements = true;
      }
      if (
        (this.killStreak === 15 || this.killStreak === 25 || this.killStreak === 40 || this.killStreak === 50) &&
        typeof NeonAudio !== 'undefined' && typeof NeonAudio.playStreakMilestone === 'function'
      ) {
          NeonAudio.playStreakMilestone(this.killStreak);
      }
      if (stats.synergyBonuses && stats.synergyBonuses.killHaste > 0) {
          this.killHasteTimer = 2.5;
      }
      if (e.cellKey && this.populatedCells) {
          const aliveInCell = this.enemies.some(oe => oe !== e && !oe.markedForDeletion && oe.cellKey === e.cellKey);
          if (!aliveInCell) {
              this.populatedCells.set(e.cellKey, { active: false, clearedAt: this.runTime });
          }
      }
      if (typeof NeonAudio !== 'undefined') NeonAudio.playKill(e.isElite, e.isBoss);
      if (e.isElite || e.isBoss || e.isNemesis || (this.killStreak > 0 && this.killStreak % 5 === 0)) {
          const isHigh = Boolean(e.isElite || e.isBoss || e.isNemesis);
          const swLife = e.isBoss ? 0.58 : (isHigh ? 0.44 : 0.34);
          const swMaxR = e.isBoss ? 260 : (e.isNemesis ? 210 : (e.isElite ? 160 : 105));
          const swColor = e.isBoss
              ? (e.baseColor || '#c424ff')
              : (e.isNemesis ? '#ffd700' : (e.isElite ? '#ff44ff' : (e.baseColor || e.color || '#00eeff')));
          this._pushShockwave({
              x: e.x,
              y: e.y,
              r: Math.max(10, e.radius || 12),
              maxR: swMaxR,
              color: swColor,
              life: swLife,
              maxLife: swLife
          }, isHigh);
      }
      if ((e.isElite || e.isNemesis) && !e.isBoss) {
          this.triggerShake(3.5, 0.11);
      }
      
      if (stats.specialEffects.corpseExplosion) {
          const ceRadius = 150 * this.getPulseRadiusMult(stats);
          const ceOpts = (stats.attributeMilestones && stats.attributeMilestones.dp50) ? { ignoreShieldAndResist: 0.25 } : null;
          for (let i = 0; i < 15; i++) this._pushParticle(e.x, e.y, '#ff0055', false);
          const ceBp = this._getBroadphase();
          const ceList = ceBp
            ? ceBp.queryRadiusInto(e.x, e.y, ceRadius, this._broadphaseEntityScratch, false)
            : this.enemies;
          for (let ci = 0; ci < ceList.length; ci++) {
              const oe = ceList[ci];
              if (oe !== e && !oe.markedForDeletion && Math.hypot(oe.x - e.x, oe.y - e.y) < ceRadius) {
                  oe.takeDamage(e.maxHp * 0.15, ceOpts);
              }
          }
      }
      
      if (this.particles && typeof Particle !== 'undefined') {
          let shatterAngle = 0;
          if (Number.isFinite(e._lastHitAngle)) {
              shatterAngle = e._lastHitAngle;
          } else if (this.player) {
              const sdx = e.x - this.player.x;
              const sdy = e.y - this.player.y;
              shatterAngle = (Math.abs(sdx) > 1e-4 || Math.abs(sdy) > 1e-4) ? Math.atan2(sdy, sdx) : 0;
          }
          const isTierHigh = Boolean(!e.isBoss && (e.isElite || e.isNemesis));
          const shardCount = e.isBoss ? 16 : (isTierHigh ? 12 : 8);
          const backCount = (e.isBoss || isTierHigh) ? 3 : 2;
          const baseCol = e.color || e.baseColor || '#ff3366';
          const baseSpd = e.isBoss ? 240 : (isTierHigh ? 210 : 185);
          const shardRad = e.isBoss ? 3.2 : (isTierHigh ? 2.8 : 2.3);

          for (let i = 0; i < shardCount; i++) {
              const t = shardCount > 1 ? (i / (shardCount - 1)) * 2 - 1 : 0;
              const coneOffset = Math.max(-0.52, Math.min(0.52, t * 0.44 + (Math.random() - 0.5) * 0.16));
              const ang = shatterAngle + coneOffset;
              const spd = baseSpd + Math.random() * 135;
              const col = (e._lastHitWasCrit && i % 3 === 0) ? '#ffee66' : baseCol;
              if (!this._pushParticle(e.x, e.y, col, false, {
                  vx: Math.cos(ang) * spd,
                  vy: Math.sin(ang) * spd,
                  life: 0.28 + Math.random() * 0.16,
                  radius: shardRad
              })) break;
          }
          for (let b = 0; b < backCount; b++) {
              const bt = backCount > 1 ? (b / (backCount - 1)) * 2 - 1 : 0;
              const bAng = shatterAngle + Math.PI + bt * 0.42 + (Math.random() - 0.5) * 0.22;
              const bSpd = 95 + Math.random() * 75;
              if (!this._pushParticle(e.x, e.y, baseCol, false, {
                  vx: Math.cos(bAng) * bSpd,
                  vy: Math.sin(bAng) * bSpd,
                  life: 0.22 + Math.random() * 0.12,
                  radius: 1.8
              })) break;
          }
      }
      if (e._lastHitWasCrit) {
          this._pushShockwave({
              x: e.x,
              y: e.y,
              r: Math.max(8, e.radius || 10),
              maxR: e.isBoss ? 140 : (e.isElite ? 96 : 68),
              color: '#ffee66',
              life: 0.24,
              maxLife: 0.24
          }, false);
          if ((this._killShakeCd || 0) <= 0) {
              this._killShakeCd = 0.12;
              this.triggerShake(2.4, 0.06);
          }
      }
      
      let baseXp = 9;
      if (e.type === 'zergling') baseXp = 2;
      else if (e.type === 'slime') baseXp = 5;
      else if (e.type === 'minislime') baseXp = 2;
      else if (e.type === 'brute' || e.type === 'ranger' || e.type === 'rogue') baseXp = 14;
      else if (e.type === 'shieldbearer' || e.type === 'medic' || e.type === 'kamikaze' || e.type === 'sentinel') baseXp = 20;
      else if (e.type === 'golem' || e.type === 'commander' || e.type === 'artillery' || e.type === 'wraith') baseXp = 32;
      else if (e.type === 'hive') baseXp = 52;

      const RING_LOOT_CURVE = [1.0, 1.18, 1.35, 1.52, 1.70];
      const sec = this.world ? this.world.getSectorAt(e.x, e.y) : null;
      const ringIdx = sec ? Math.max(0, Math.min(4, sec.ring || 0)) : 0;
      const sectorLootMult = RING_LOOT_CURVE[ringIdx];
      const z = sec ? Math.max(1, sec.zoneLevel || 1) : 1;
      const effZoneLvl = Math.min(z, Math.max(1, (this.player?.level || 1) + (typeof Meta !== 'undefined' && Meta.getGlobalLevel ? Meta.getGlobalLevel() : 1) + 12));
      const zoneXpMult = 1 + (effZoneLvl - 1) * 0.025;
      const zoneMatterMult = 1 + (effZoneLvl - 1) * 0.04;

      const phaseCfg = this.getActivePhaseConfig();
      const keyDef = this.getActiveFractureKeyDef();
      const extractionMult = (typeof Meta !== 'undefined' && typeof Meta.getExtractionStreakMult === 'function') ? Meta.getExtractionStreakMult() : 1.0;
      const overdriveLootMult = 1 + (this.overdriveChain || 0) * 0.50;
      const matterMult = (stats.matterMult || 1.0) * (phaseCfg.rewardMult || 1.0) * (1 + (keyDef?.matterBonus || 0)) * extractionMult * overdriveLootMult;
      const discMult = (stats.discoveryMult || 1.0) * (1 + (keyDef?.discoveryBonus || 0));

      const streakMult = 1 + Math.min(0.35, Math.floor((this.killStreak || 0) / 10) * 0.07);
      const streakMatterMult = 1 + Math.min(0.45, Math.floor((this.killStreak || 0) / 15) * 0.15);
      const frenzyMult = this.frenzyTimer > 0 ? 2.5 : 1.0;
      baseXp = Math.round(baseXp * sectorLootMult * zoneXpMult * streakMult);
      
      if (e.isElite) {
          baseXp *= 4;
          this.currencyCollected += 3 * sectorLootMult * zoneMatterMult * frenzyMult * matterMult * streakMatterMult;
      }
      if (e.isNemesis) {
          baseXp += Math.round(140 * sectorLootMult * zoneXpMult);
          const nemMatter = Math.round(65 * matterMult);
          this.currencyCollected += nemMatter;
          if (typeof Meta !== 'undefined') {
              if (typeof Meta.clearNemesis === 'function') Meta.clearNemesis();
              if (typeof Meta.addPremium === 'function') Meta.addPremium(2);
          }
          if (typeof ModuleDrop !== 'undefined' && this.moduleDrops && typeof NeonSystems !== 'undefined' && NeonSystems) {
              const nMod = NeonSystems.generateModule({ itemTier: Math.min(4, Math.max(2, phaseCfg.phase || 1)), quality: 'harmonic', zoneLevel: z + 4, rng: () => this.rng() });
              this.moduleDrops.push(new ModuleDrop(e.x, e.y, nMod));
              const sEl = (sec && NeonSystems.SHARD_ELEMENTS && NeonSystems.SHARD_ELEMENTS.includes(sec.id)) ? sec.id : 'storm';
              this.moduleDrops.push(new ModuleDrop(e.x + 26, e.y, null, sEl, 2));
          }
          this.activeNemesisRef = null;
          this._runNemesisOrCourier = true;
          if (typeof Meta !== 'undefined' && typeof Meta.recordLifetimeStat === 'function') {
              Meta.recordLifetimeStat('nemesisSlain', 1, 'inc', true);
          }
          shouldEvalAchievements = true;
          this.queueTransmission('encounter_nemesis');
          this.setBanner('VENDETTA COMPLETE!', `NEMESIS SHATTERED +${nemMatter} MATTER & +2 CRYSTALS`, '#ffd700', 3.6, 3, true);
      }
      if (e.isCourier) {
          baseXp += Math.round(90 * sectorLootMult * zoneXpMult);
          const courierMatter = Math.round(25 * sectorLootMult * matterMult * streakMatterMult);
          this.currencyCollected += courierMatter;
          if (this.supplyDrops) {
              this.supplyDrops.push(new SupplyDrop(e.x, e.y, this.rng() < 0.5 ? 'overcharge' : 'vacuum', 1));
          }
          if (typeof ModuleDrop !== 'undefined' && this.moduleDrops && typeof NeonSystems !== 'undefined' && NeonSystems) {
              const sEl = (sec && NeonSystems.SHARD_ELEMENTS && NeonSystems.SHARD_ELEMENTS.includes(sec.id)) ? sec.id : 'storm';
              this.moduleDrops.push(new ModuleDrop(e.x + 22, e.y, null, sEl, 1));
          }
          this.setBanner('SIGNAL COURIER INTERCEPTED!', `+${courierMatter} MATTER, SHARD & SUPPLY DROP`, '#ffd700', 3.0, 2, false);
          this.signalCourier = null;
          this._runNemesisOrCourier = true;
          if (typeof Meta !== 'undefined' && typeof Meta.recordLifetimeStat === 'function') {
              Meta.recordLifetimeStat('couriersIntercepted', 1, 'inc', true);
          }
          shouldEvalAchievements = true;
      }
      if (e.isBossPylon) {
          baseXp = Math.round(35 * sectorLootMult * zoneXpMult);
          const pb = e.parentBoss;
          if (pb && !pb.markedForDeletion && pb.hp > 0) {
              let remainingPylons = 0;
              for (let pi = 0; pi < this.enemies.length; pi++) {
                  const oe = this.enemies[pi];
                  if (oe && oe !== e && oe.isBossPylon && oe.parentBoss === pb && !oe.markedForDeletion && oe.hp > 0) {
                      remainingPylons++;
                  }
              }
              pb._activePylonCount = remainingPylons;
              if (remainingPylons === 0) {
                  const shatterDmg = Math.max(25, pb.maxHp * 0.12);
                  pb.takeDamage(shatterDmg, { bypassPylonShield: true });
                  pb.exposedTimer = Math.max(pb.exposedTimer || 0, 3.2);
                  if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
                      this.floatingTexts.push(new FloatingText(pb.x, pb.y - 54, 'AEGIS SHATTER! -12% HP • EXPOSED!', '#00ffaa', 1.35, 2.0));
                  }
                  if (typeof NeonAudio !== 'undefined' && NeonAudio.playBossTelegraph) NeonAudio.playBossTelegraph('shatter');
                  this.triggerShake(7, 0.25);
                  if (this.particles) {
                      for (let k = 0; k < 14; k++) this._pushParticle(pb.x, pb.y, '#00ffaa', false);
                  }
                  if (pb.hp <= 0 && !pb.markedForDeletion) {
                      pb.markedForDeletion = true;
                      this.processEnemyDeath(pb, stats);
                  }
              }
          }
      }
      if (e.isBoss) {
          bossDefeatedThisDeath = true;
          shouldEvalAchievements = true;
          if (typeof Meta !== 'undefined' && typeof Meta.recordLifetimeStat === 'function') {
              Meta.recordLifetimeStat('bossesDefeated', 1, 'inc', true);
              if (this._bossFightActive && !this._bossFightHullDamaged) {
                  Meta.recordLifetimeStat('flawlessBosses', 1, 'inc', true);
              }
              if ((e.exposedTimer || 0) > 0) {
                  Meta.recordLifetimeStat('exposedBossKills', 1, 'inc', true);
              }
              if (e.monolithElement && this._bossFightActive) {
                  const elapsedBossSec = Math.max(1, Math.round((this.runTime || 0) - (this._bossFightStartedAt || 0)));
                  Meta.recordLifetimeStat('fastestCitadelSec', elapsedBossSec, 'min_positive', true);
              }
              if (e.isCrucibleWarden) {
                  Meta.recordLifetimeStat('crucibleWardensSlain', 1, 'inc', true);
              }
              if (stats && Array.isArray(stats.harmonicSequences) && stats.harmonicSequences.length > 0) {
                  Meta.recordLifetimeStat('harmonicBossClears', 1, 'inc', true);
              }
              if (this.activeFractureKeyId || (typeof this.getActiveFractureKeyDef === 'function' && this.getActiveFractureKeyDef())) {
                  Meta.recordLifetimeStat('fractureBossClears', 1, 'inc', true);
              }
          }
          this._bossFightActive = false;
          baseXp = Math.round(450 * sectorLootMult * zoneXpMult);
          this.currencyCollected += 15 * zoneMatterMult * frenzyMult * matterMult;
          this.bossOrbs.push(new BossCoreOrb(e.x, e.y));
          this.triggerShake(8, 0.3);
          this.triggerSignalCut('boss_clear', e.baseColor || (sec ? sec.color : '#ffd700'), 0.36, 'APEX NEUTRALIZED');
          for (const oe of this.enemies) {
              if (oe && oe.isBossPylon && oe.parentBoss === e) oe.markedForDeletion = true;
          }
          if (this.activeBossEncounter && this.activeBossEncounter.bossRef === e) {
              this.activeBossEncounter = null;
              this.wavePauseTimer = Math.max(this.wavePauseTimer || 0, 2.5);
          }
          if (!this.isDescentMode && this.world && Math.hypot(e.x - this.world.center, e.y - this.world.center) > (this.world.sanctumRadius || 1300) + 300) {
              const baseAng = (this.player && (Math.abs(e.x - this.player.x) > 1 || Math.abs(e.y - this.player.y) > 1))
                ? (Math.atan2(e.y - this.player.y, e.x - this.player.x) + Math.PI * 0.5)
                : 0;
              const extraAvoid = [{ x: e.x, y: e.y, minDist: 160 }];
              const retPt = this._findSafePortalSpot(e.x, e.y, baseAng + Math.PI, extraAvoid);
              this.spawnReturnPortal(retPt.x, retPt.y, 'SANCTUM RETURN PORTAL', '#00ffff', sec ? sec.color : '#00ffff', { portalKind: 'return', holdRequired: 1.5, spawnGrace: 0.30 });
              if (this.world.sectorDefs && this.world.sectorDefs.length > 1) {
                const curIdx = sec ? this.world.sectorDefs.findIndex(s => s.id === sec.id) : -1;
                const nextSec = this.world.sectorDefs[(curIdx >= 0 ? curIdx + 1 : 0) % this.world.sectorDefs.length];
                if (nextSec) {
                  const odPt = this._findSafePortalSpot(e.x, e.y, baseAng, extraAvoid);
                  this.spawnOverdrivePortal(odPt.x, odPt.y, nextSec, { holdRequired: 1.5, spawnGrace: 0.30 });
                }
              }
          }
      }

      // Cross-Biome Leakage Infusion death effects
      if (e.biomeInfusion === 'fire' && this.enemyExplosions) {
          this.enemyExplosions.push(new EnemyExplosion(e.x, e.y, 65, Math.max(8, e.damage * 0.85)));
      } else if (e.biomeInfusion === 'toxin' && this.enemyAcidPools) {
          this.enemyAcidPools.push(new EnemyAcidPool(e.x, e.y, 38, Math.max(6, e.damage * 0.45)));
      }

      // Vital Siphon (scales proportionally with active sustain pool & sv30, tightened per rolling 1s window & Void Instability)
      if ((stats.vitalSiphon || 0) > 0 && this._hasSustainHeadroom(stats)) {
          const basePool = this._getSustainBasePool(stats);
          const inst = this.getVoidInstability();
          const sv30Amp = (stats.attributeMilestones && stats.attributeMilestones.sv30) ? 1.30 : 1.0;
          const rawSiphon = (stats.vitalSiphon + basePool * 0.0045 * stats.vitalSiphon) * sv30Amp * inst.sustainMult;
          this._applySustainHeal(rawSiphon, stats, { useSiphonCap: true, instability: inst });
      }

      // Split Lattice Elite modifier
      if (e.eliteModifiers && e.eliteModifiers.includes('split_lattice') && !e._isSplitFragment && this.enemies.length < 155) {
          for (let s = 0; s < 2; s++) {
              const frag = new Enemy(
                  e.x + (s === 0 ? -18 : 18),
                  e.y + (s === 0 ? -12 : 12),
                  Math.max(15, e.maxHp * 0.28),
                  Math.max(85, e.baseSpeed * 1.15),
                  false,
                  false,
                  'zergling'
              );
              frag.damage = Math.max(frag.damage, e.damage * 0.45);
              frag._isSplitFragment = true;
              this.enemies.push(frag);
          }
      }

      // Codex & Contract kill tracking
      if (typeof Meta !== 'undefined' && typeof Meta.recordCodexKill === 'function') {
          Meta.recordCodexKill(e.isArchitectBoss ? 'architect' : e.type, true);
          this._codexKillBuffer = (this._codexKillBuffer || 0) + 1;
          if (e.isBoss || e.isElite || this._codexKillBuffer >= 25) {
              this._codexKillBuffer = 0;
              if (typeof Meta.save === 'function') Meta.save();
          }
      }
      if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.recordContractEvent === 'function' && typeof Meta !== 'undefined') {
          if (sec && sec.id && sec.id !== 'void') {
              NeonSystems.recordContractEvent(Meta, 'kill_sector', { element: sec.id, count: 1 });
          }
      }
      if (typeof Meta !== 'undefined' && typeof Meta.recordBiomeKill === 'function') {
          const killEl = (sec && sec.id && sec.id !== 'void') ? sec.id : (e.biomeElement || null);
          if (killEl) Meta.recordBiomeKill(killEl, 1, true);
      }

      // Active Sector Bounty progress
      if (this.activeSectorBounty) {
          const b = this.activeSectorBounty;
          if (b.kind === 'slay_fast' && sec && sec.id === b.sectorId) {
              b.progress += 1;
              if (b.progress >= b.target) this._completeSectorBounty(stats);
          } else if (b.kind === 'elite_hunt' && (e.isElite || e.isBoss)) {
              b.progress += 1;
              if (b.progress >= b.target) this._completeSectorBounty(stats);
          }
      }

      // Active Volatile Pact progress
      if (this.activeVolatilePact && !this.activeVolatilePact.failed) {
          this.activeVolatilePact.killsRemaining -= 1;
          if (this.activeVolatilePact.killsRemaining <= 0) {
              this.activeVolatilePact = null;
              pactFulfilledThisDeath = true;
              if (typeof Meta !== 'undefined' && typeof Meta.recordLifetimeStat === 'function') {
                  Meta.recordLifetimeStat('pactsFulfilled', 1, 'inc', true);
              }
              shouldEvalAchievements = true;
              if (typeof ModuleDrop !== 'undefined' && this.moduleDrops && typeof NeonSystems !== 'undefined' && NeonSystems) {
                  const pTier = Math.min(4, Math.max(2, phaseCfg.phase || 1));
                  const q = this.rng() < 0.30 ? 'signature' : 'harmonic';
                  const pMod = NeonSystems.generateModule({ itemTier: pTier, quality: q, zoneLevel: z, rng: () => this.rng() });
                  this.moduleDrops.push(new ModuleDrop(e.x, e.y, pMod));
              }
              if (typeof NeonAudio !== 'undefined') NeonAudio.playLevelUp();
              if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
                  this.floatingTexts.push(new FloatingText(e.x, e.y - 44, 'PACT FULFILLED! HARMONIC MODULE', '#ffd700', 1.25, 2.2));
              }
          }
      }

      if (e.monolithElement && this.world) {
          citadelElementThisDeath = e.monolithElement;
          const mono = this.world.monoliths.find(m => m.element === e.monolithElement);
          if (mono) {
              mono.state = 'conquered';
              mono._conqueredAt = this.runTime || 0;
              mono.returnProgress = 0;
          }
          if (this.activeBossArena && this.activeBossArena.element === e.monolithElement) {
              this.activeBossArena = null;
          }
          const firstClear = typeof Meta !== 'undefined' && Meta.markSectorConquered && Meta.markSectorConquered(e.monolithElement);
          this.triggerSignalCut('citadel_clear', (mono && mono.color) || e.baseColor || '#ffd700', 0.42, firstClear ? 'CITADEL ATTUNED' : 'CITADEL CLEARED');
          const crystalReward = firstClear ? 2 : 1;
          if (typeof Meta !== 'undefined' && typeof Meta.addPremium === 'function') {
              Meta.addPremium(crystalReward);
          }
          citadelLoreQueued = this.queueTransmission('citadel_first_clear');
          if (firstClear) {
              this.perkPointsCollected = (this.perkPointsCollected || 0) + 2;
              this.currencyCollected += Math.round(50 * (stats.matterMult || 1));
              const masteryKey = `${e.monolithElement}Mastery`;
              if (typeof Meta !== 'undefined' && Meta.getUpgradeLevel && Meta.upgrade && Meta.getUpgradeLevel(masteryKey) === 0) {
                  Meta.upgrade(masteryKey);
              }
              if (this.updatePlayerStats) this.updatePlayerStats();
              if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
                  this.floatingTexts.push(new FloatingText(e.x, e.y - 40, 'ELEMENT ATTUNED! +2 PTS, +2 CRYSTALS & WARP', '#ffd700', 1.25, 2.4));
              }
          } else if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
              this.floatingTexts.push(new FloatingText(e.x, e.y - 40, 'GUARDIAN DEFEATED! +1 CRYSTAL', '#ffd700', 1.2, 2.2));
          }
          if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.recordContractEvent === 'function' && typeof Meta !== 'undefined') {
              NeonSystems.recordContractEvent(Meta, 'defeat_boss', { element: e.monolithElement });
          }
          if (typeof Meta !== 'undefined' && typeof Meta.markBiomeBoss === 'function') {
              Meta.markBiomeBoss(e.monolithElement);
          }
      }

      // The Architect World Boss defeat
      if (e.isArchitectBoss) {
          this._architectDefeatedThisRun = true;
          this.triggerSignalCut('architect_clear', '#ffd700', 0.45, 'ARCHITECT SHATTERED');
          architectLoreQueued = this.queueTransmission('architect_shattered');
          if (typeof Meta !== 'undefined' && typeof Meta.markArchitectDefeated === 'function') {
              const archRes = Meta.markArchitectDefeated(phaseCfg.phase, phaseCfg.singularityLevel);
              const archCrystals = (archRes && archRes.firstClear) ? 5 : 2;
              if (typeof Meta.addPremium === 'function') {
                  Meta.addPremium(archCrystals);
              }
              if (archRes && archRes.firstClear) {
                  this.perkPointsCollected = (this.perkPointsCollected || 0) + 2;
                  if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
                      this.floatingTexts.push(new FloatingText(e.x, e.y - 54, 'ARCHITECT SHATTERED! +2 PERK, +2 ATTR & +5 CRYSTALS', '#ffd700', 1.3, 2.6));
                  }
              } else if (typeof FloatingText !== 'undefined' && this.floatingTexts) {
                  this.floatingTexts.push(new FloatingText(e.x, e.y - 54, 'ARCHITECT SHATTERED! +2 CRYSTALS', '#ffd700', 1.25, 2.4));
              }
              if (Meta.data && Meta.data.fractureKeys) {
                  Meta.data.fractureKeys.volatile_flux = (Meta.data.fractureKeys.volatile_flux || 0) + 1;
                  if (typeof Meta.save === 'function') Meta.save();
              }
          }
          if (typeof NeonSystems !== 'undefined' && NeonSystems && typeof NeonSystems.recordContractEvent === 'function' && typeof Meta !== 'undefined') {
              NeonSystems.recordContractEvent(Meta, 'defeat_boss', { anyElement: true });
          }
          if (typeof ModuleDrop !== 'undefined' && this.moduleDrops && typeof NeonSystems !== 'undefined' && NeonSystems) {
              const sigId = this.rng() < 0.5 ? 'sig_architect_prism' : 'sig_architect_relay';
              const aMod = this.rng() < 0.65
                  ? NeonSystems.generateModule({ itemTier: 4, forceSignatureId: sigId, zoneLevel: z + 6, rng: () => this.rng() })
                  : NeonSystems.generateModule({ itemTier: 4, quality: 'harmonic', zoneLevel: z + 6, rng: () => this.rng() });
              this.moduleDrops.push(new ModuleDrop(e.x, e.y, aMod));
              const shardEl = NeonSystems.SHARD_ELEMENTS[Math.floor(this.rng() * NeonSystems.SHARD_ELEMENTS.length)];
              this.moduleDrops.push(new ModuleDrop(e.x + 42, e.y, null, shardEl, 2));
          }
      }

      // Module & Frequency Shard Drops
      if (typeof ModuleDrop !== 'undefined' && this.moduleDrops && typeof NeonSystems !== 'undefined' && NeonSystems) {
          const dropTier = Math.min(4, Math.max(1, Math.max(phaseCfg.phase || 1, ringIdx >= 3 ? 3 : (ringIdx >= 2 ? 2 : 1))));
          const sectorElem = (sec && NeonSystems.SHARD_ELEMENTS && NeonSystems.SHARD_ELEMENTS.includes(sec.id))
              ? sec.id
              : NeonSystems.SHARD_ELEMENTS[Math.floor(this.rng() * NeonSystems.SHARD_ELEMENTS.length)];

          if (e.monolithElement) {
              const bossDropChance = (keyDef && keyDef.guaranteedBossHarmonic) ? 1.0 : 0.65;
              if (this.rng() < bossDropChance) {
                  const bossSigs = Object.values(NeonSystems.SIGNATURE_CATALOG || {}).filter(s => s.bossElement === e.monolithElement);
                  const useSig = bossSigs.length > 0 && this.rng() < 0.45;
                  const bMod = useSig
                      ? NeonSystems.generateModule({ itemTier: Math.max(2, dropTier), forceSignatureId: bossSigs[0].id, zoneLevel: z + 4, rng: () => this.rng() })
                      : NeonSystems.generateModule({ itemTier: Math.max(2, dropTier), quality: 'harmonic', zoneLevel: z + 4, rng: () => this.rng() });
                  this.moduleDrops.push(new ModuleDrop(e.x - 28, e.y, bMod));
              }
              this.moduleDrops.push(new ModuleDrop(e.x + 28, e.y, null, e.monolithElement, phaseCfg.phase >= 3 ? 2 : 1));
              if (typeof Meta !== 'undefined' && Meta.data && Meta.data.fractureKeys && this.rng() < 0.5) {
                  const kChoices = ['dense_lattice', 'twin_wardens', 'volatile_flux'];
                  const kPick = kChoices[Math.floor(this.rng() * kChoices.length)];
                  Meta.data.fractureKeys[kPick] = (Meta.data.fractureKeys[kPick] || 0) + 1;
                  if (typeof Meta.save === 'function') Meta.save();
              }
          } else if (e.isElite && this.moduleDrops.length < 24) {
              if (this.rng() < Math.min(0.65, 0.18 * discMult)) {
                  const qRoll = this.rng();
                  const q = qRoll > 0.88 ? 'harmonic' : (qRoll > 0.45 ? 'refined' : 'standard');
                  this.moduleDrops.push(new ModuleDrop(e.x, e.y, NeonSystems.generateModule({ itemTier: dropTier, quality: q, zoneLevel: z, rng: () => this.rng() })));
              }
              if (this.rng() < Math.min(0.75, 0.35 * discMult)) {
                  this.moduleDrops.push(new ModuleDrop(e.x + 18, e.y - 12, null, sectorElem, 1));
              }
          } else if (!e.isBoss && this.moduleDrops.length < 20) {
              if (this.rng() < 0.012 * discMult) {
                  this.moduleDrops.push(new ModuleDrop(e.x, e.y, NeonSystems.generateModule({ itemTier: dropTier, quality: this.rng() < 0.25 ? 'refined' : 'standard', zoneLevel: z, rng: () => this.rng() })));
              } else if (this.rng() < 0.025 * discMult) {
                  this.moduleDrops.push(new ModuleDrop(e.x, e.y, null, sectorElem, 1));
              }
          }
      }

      if (typeof SupplyDrop !== 'undefined' && this.supplyDrops && this.supplyDrops.length < 6) {
          const dropChance = e.isElite ? 0.32 : 0.012;
          if (this.rng() < dropChance) {
              const kinds = ['vacuum', 'overcharge', 'matter_cache'];
              const picked = kinds[Math.floor(this.rng() * kinds.length)];
              this.supplyDrops.push(new SupplyDrop(e.x, e.y, picked, picked === 'matter_cache' ? Math.round(18 * sectorLootMult * matterMult) : 1));
          }
      }
      
      this.xpOrbs.push(new XPOrb(e.x, e.y, baseXp));
      
      if (e.type === 'slime') {
          for(let i=0; i<3; i++) {
              const ms = new Enemy(e.x + (Math.random()-0.5)*20, e.y + (Math.random()-0.5)*20, e.maxHp*0.3, e.baseSpeed*1.2, false, false, 'minislime');
              ms.damage = Math.max(ms.damage, e.damage * 0.6);
              this.enemies.push(ms);
          }
      }
      
      if (stats.specialEffects.blackHole && (this.blackHoleCooldown || 0) <= 0 && this.blackHoles.length < 3 && (e.isElite || Math.random() < Math.min(0.24, 0.10 + ((stats.specialEffects.blackHole.level || 1) - 1) * 0.05))) {
          this.blackHoleCooldown = 3.0;
          const bhLevel = stats.specialEffects.blackHole.level || 1;
          const bhEl = this._resolveProcElement(stats, 'none');
          const bhElemMult = bhEl !== 'none' ? this.getElemDamageMult(stats, bhEl) : 1.0;
          this.blackHoles.push(new BlackHole(e.x, e.y, bhLevel, stats.damage * 1.15 * bhLevel * bhElemMult));
      }
      const statusDurMult = (stats.attributeMilestones && stats.attributeMilestones.sr15) ? 1.30 : 1.0;
      if (stats.specialEffects.combustion && e.dots.some(d => d.type === "burn")) {
          const radius = 100 * (1 + (stats.fireMastery || 0) * 0.1) * this.getPulseRadiusMult(stats);
          const dmg = stats.damage * 0.48 * (1 + (stats.fireMastery || 0) * 0.1) * (stats.burnDamageMult || 1.0) * this.getElemDamageMult(stats, 'fire');
          for (let i = 0; i < 20; i++) this._pushParticle(e.x, e.y, '#ff6600', false);
          for (const oe of this.enemies) {
              if (oe !== e && Math.hypot(oe.x - e.x, oe.y - e.y) < radius) {
                  oe.applyDot(dmg, 3.0 * statusDurMult, "burn");
              }
          }
      }
      if (stats.specialEffects.shatter && (e.status.frozen > 0 || e.status.chilled > 0) && this.shattersThisFrame < 10) {
          this.shattersThisFrame++;
          const isFrozen = e.status.frozen > 0;
          if (isFrozen && typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.playHitFeedback === 'function') {
              NeonAudio.playHitFeedback('shatter');
          }
          const shatterEl = this._resolveProcElement(stats, 'frost');
          const isFireConv = shatterEl === 'fire';
          const shardDmg = stats.damage * (isFrozen ? 0.75 : 0.4) * this.getElemDamageMult(stats, shatterEl);
          const activeNow = this.getActiveCombatProjectileCount();
          if (activeNow >= 18) {
              this.triggerLocalKineticPulse(e.x, e.y, 85, shardDmg * 1.25, isFireConv ? '#ff5522' : '#88ddff', stats);
          } else {
              const room = Math.max(0, 18 - activeNow);
              const shardCount = Math.min(room, isFrozen ? 6 : 4);
              const shardEffects = isFireConv ? { ignite: { level: 1 } } : { chill: { level: 1 } };
              for (let i = 0; i < shardCount; i++) {
                  const angle = (Math.PI * 2 / shardCount) * i;
                  const shardProj = new Projectile(
                      e.x, e.y,
                      Math.cos(angle) * 300, Math.sin(angle) * 300,
                      { ...stats, damage: shardDmg, pierce: Math.min(3, stats.pierce + 1), bounce: 0, specialEffects: shardEffects },
                      false, 0, shatterEl
                  );
                  shardProj.willSplit = false;
                  this.projectiles.push(shardProj);
              }
          }
      }
      if (!stats.specialEffects.avatarOfFire && stats.specialEffects.plague && e.dots.some(d => d.type === "poison")) {
          let spread = 0;
          const radius = 150 * (1 + (stats.toxinMastery || 0) * 0.1) * this.getPulseRadiusMult(stats);
          const dmg = stats.damage * 0.2 * (1 + (stats.toxinMastery || 0) * 0.2) * this.getElemDamageMult(stats, 'toxin');
          for (const oe of this.enemies) {
              if (oe !== e && Math.hypot(oe.x - e.x, oe.y - e.y) < radius) {
                  oe.applyDot(dmg, 5.0 * statusDurMult, "poison");
                  spread++;
                  if(spread >= 2) break;
              }
          }
      }
      if (stats.specialEffects.acidPool) {
          const poolEl = this._resolveProcElement(stats, 'toxin');
          const poolType = poolEl === 'fire' ? 'fire' : 'acid';
          const acidLevel = (stats.specialEffects.acidPool.level || 1) + (stats.toxinMastery || 0) * 0.5;
          const acidBaseDmg = stats.damage * 0.45 * acidLevel * this.getElemDamageMult(stats, poolEl);
          let poolCount = 0;
          for (const ap of this.acidPools) {
              if (poolType === 'fire' ? ap.type === 'fire' : ap.type !== 'fire') poolCount++;
          }
          const poolCap = poolType === 'fire' ? 35 : 24;
          if (poolCount < poolCap) {
              this.acidPools.push(new AcidPool(e.x, e.y, acidLevel, poolType, acidBaseDmg));
          }
      }
      
      if (stats.specialEffects.vampirism) {
          if (e.isBoss || e.isElite || Math.random() < 0.08) {
              const instVamp = this.getVoidInstability();
              const sv30Amp = (stats.attributeMilestones && stats.attributeMilestones.sv30) ? 1.30 : 1.0;
              const healAmt = Math.max(1, Math.round(this.player.maxHp * 0.016 * sv30Amp * instVamp.sustainMult));
              this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
          }
      }
      if (stats.signatureTraits && stats.signatureTraits.harvesterSurgeDmg > 0) {
          this.triggerLocalKineticPulse(e.x, e.y, 95, stats.damage * stats.signatureTraits.harvesterSurgeDmg, '#ff66cc', stats);
      }
      if (this.enemiesKilled > 0 && this.enemiesKilled % 50 === 0) {
          shouldEvalAchievements = true;
      }
      const unlockedFeatsThisDeath = shouldEvalAchievements
          ? this._evaluateRunAchievements({
              stats,
              bossDefeated: bossDefeatedThisDeath,
              forceEvent: bossDefeatedThisDeath
          })
          : [];
      if (!unlockedFeatsThisDeath || unlockedFeatsThisDeath.length === 0) {
          if (e.isArchitectBoss && !architectLoreQueued) {
              this.queueSignalEcho('architect_clear', { stats });
          } else if (citadelElementThisDeath && !citadelLoreQueued) {
              this.queueSignalEcho('citadel_clear', { element: citadelElementThisDeath, stats });
          } else if (pactFulfilledThisDeath) {
              this.queueSignalEcho('pact_fulfilled', { stats });
          }
      }
  }

  calculatePowerLevel(data) {
    if (!data) return 0;
    let rawPower = data.unlockedPerks ? data.unlockedPerks.length : 0;
    if (data.upgrades) {
        rawPower += Object.values(data.upgrades).reduce((a, b) => a + b, 0);
    }
    rawPower += (data.globalLevel || 1) * 2;
    rawPower += (data.perkPoints || 0) * 0.2;
    return Math.min(50, Math.sqrt(rawPower) * 6);
  }

  drawMenuVoid(dt, isShop = false) {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const powerLevel = this.calculatePowerLevel(Meta.data);
    
    this.menuRunTime = (this.menuRunTime || 0) + dt;
    if (this.voidFlickerTimer > 0) {
        this.voidFlickerTimer -= dt;
    } else {
        this.voidFlickerTimer = 0;
    }
    
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height * 0.15;
    
    this.renderVoidGraphic(this.ctx, centerX, centerY, powerLevel, isShop, this.voidFlickerTimer > 0, this.menuRunTime);
  }

  renderVoidGraphic(ctx, centerX, centerY, powerLevel, isShop, isFlickering, timeStr) {
    let brightnessMult = 1.0;
    if (isShop) {
        if (isFlickering) {
            brightnessMult = 1.8;
        } else {
            brightnessMult = 0.15;
        }
    }
    
    const baseRadius = 25;
    const radiusBonus = powerLevel * (isShop && !isFlickering ? 0.9 : 1.0);
    const radius = baseRadius + radiusBonus;
    
    const pulse = Math.sin(timeStr * 2) * (3 + powerLevel * 0.1);
    const glowStrength = (15 + powerLevel * 1.2) * brightnessMult;
    
    const alphaMult = isShop && !isFlickering ? 0.2 : 1.0;

    ctx.beginPath();
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 2.2);
    gradient.addColorStop(0, `rgba(0, 255, 255, ${Math.min(0.6, 0.1 + powerLevel * 0.01) * alphaMult})`);
    gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.arc(centerX, centerY, radius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(1, radius + pulse), 0, Math.PI * 2);
    ctx.fillStyle = isShop && !isFlickering ? '#003333' : '#00ffff';
    ctx.shadowBlur = glowStrength;
    ctx.shadowColor = '#00ffff';
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(1, (radius + pulse) * 0.6), 0, Math.PI * 2);
    ctx.fillStyle = isShop && !isFlickering ? '#001111' : '#ffffff';
    ctx.fill();

    if (powerLevel > 10) {
        const rings = Math.min(4, Math.floor(powerLevel / 12));
        for(let r = 1; r <= rings; r++) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, Math.max(1, radius + pulse + 12 * r + Math.sin(timeStr * (3 + r)) * 5), 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 255, 255, ${(0.1 + Math.min(0.4, powerLevel * 0.005)) * alphaMult})`;
            ctx.lineWidth = 1 + powerLevel * 0.03;
            ctx.stroke();
        }
    }
    
    if (powerLevel > 5) {
       const orbiters = Math.min(30, Math.floor(powerLevel * 0.8));
       for(let i=0; i<orbiters; i++) {
           const speed = 1 + (i % 3) * 0.5;
           const angle = timeStr * speed + (Math.PI * 2 / orbiters) * i;
           const dist = radius + 20 + (i % 4) * 10 + Math.sin(timeStr * 3 + i) * 8 + powerLevel * 0.2;
           const ox = centerX + Math.cos(angle) * dist;
           const oy = centerY + Math.sin(angle) * dist;
           
           const orbSize = 1.5 + powerLevel * 0.02 + Math.sin(timeStr * 5 + i);
           
           const colors = ['#00ffff', '#c424ff', '#ff00ff', '#ffffff'];
           let color = colors[i % colors.length];
           
           if (isShop && !isFlickering) {
               color = (i % 2 === 0) ? '#003333' : '#330033';
           }
           
           ctx.beginPath();
           ctx.arc(ox, oy, Math.max(1, orbSize), 0, Math.PI * 2);
           ctx.fillStyle = color;
           ctx.shadowBlur = (5 + powerLevel * 0.1) * brightnessMult;
           ctx.shadowColor = color;
           ctx.fill();
           ctx.shadowBlur = 0;
           
           if (powerLevel > 20 && i > 0 && i % 3 === 0) {
               const prevAngle = timeStr * speed + (Math.PI * 2 / orbiters) * (i - 1);
               const prevDist = radius + 20 + ((i-1) % 4) * 10 + Math.sin(timeStr * 3 + (i-1)) * 8 + powerLevel * 0.2;
               const pox = centerX + Math.cos(prevAngle) * prevDist;
               const poy = centerY + Math.sin(prevAngle) * prevDist;
               ctx.beginPath();
               ctx.moveTo(ox, oy);
               ctx.lineTo(pox, poy);
               ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 * alphaMult})`;
               ctx.lineWidth = 1;
               ctx.stroke();
           }
       }
    }
  }
}
