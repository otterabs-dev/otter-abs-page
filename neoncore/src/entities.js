// src/entities.js

function getWorldBounds(gameOrCanvas) {
  const g = (typeof game !== 'undefined' && game) ? game : globalThis.game;
  if (g && g.isDescentMode && g.descentBoundSize) {
    const half = g.descentBoundSize / 2;
    const cx = g.world ? g.world.center : 48000;
    return { minX: cx - half, minY: cx - half, w: cx + half, h: cx + half, g };
  }
  const w = (g && g.worldSize) ? g.worldSize : ((gameOrCanvas && gameOrCanvas.width) || 1500);
  const h = (g && g.worldSize) ? g.worldSize : ((gameOrCanvas && gameOrCanvas.height) || 1500);
  return { minX: 0, minY: 0, w, h, g };
}

const _entityQueryScratch = [];

function _isBroadphase(enemiesOrBroadphase) {
  return Boolean(enemiesOrBroadphase && typeof enemiesOrBroadphase.queryRadiusInto === 'function');
}

function _pushEntityParticle(activeGame, x, y, color, priority = false) {
  if (!activeGame) return null;
  if (typeof activeGame._pushParticle === 'function') {
    return activeGame._pushParticle(x, y, color, priority);
  }
  if (activeGame.particles && activeGame.particles.length < 250 && typeof Particle !== 'undefined') {
    const pt = new Particle(x, y, color);
    activeGame.particles.push(pt);
    return pt;
  }
  return null;
}

class Entity {
  constructor(x, y, radius, color) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color;
    this.baseColor = color;
    this.vx = 0;
    this.vy = 0;
    this.markedForDeletion = false;
  }

  draw(ctx) {
    const prevAlpha = Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1;
    const r = Math.max(0, this.radius || 0);
    if (r > 0) {
      ctx.globalAlpha = prevAlpha * 0.24;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + Math.min(5, Math.max(2, r * 0.45)), 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
    ctx.globalAlpha = prevAlpha;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }

  update(dt, canvas) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}

function getXpForLevel(level) {
  const L = Math.max(1, Math.floor(Number(level) || 1));
  return Math.round(90 + (L - 1) * 70 + Math.pow(L - 1, 1.85) * 14);
}
if (typeof globalThis !== 'undefined') globalThis.getXpForLevel = getXpForLevel;

class Player extends Entity {
  constructor(x, y) {
    super(x, y, 15, '#00ffff');
    this.hp = 100;
    this.maxHp = 100;
    this.energyShield = 0;
    this.maxEnergyShield = 0;
    this.shieldRechargeTimer = 0;
    this.xp = 0;
    this.level = 1;
    this.xpToNextLevel = getXpForLevel(1);
    this.facingAngle = -Math.PI / 2;
    this._muzzleFlashTimer = 0;
    this._muzzleAngle = -Math.PI / 2;
    this._muzzleColor = '#00ffff';
  }

  draw(ctx) {
    const flashFrac = this._muzzleFlashTimer > 0 ? Math.max(0, Math.min(1, this._muzzleFlashTimer / 0.08)) : 0;
    const muzAng = Number.isFinite(this._muzzleAngle) ? this._muzzleAngle : -Math.PI / 2;
    const recoilOffset = flashFrac > 0 ? (-2.2 * flashFrac) : 0;
    const rx = Math.cos(muzAng) * recoilOffset;
    const ry = Math.sin(muzAng) * recoilOffset;

    ctx.save();
    if (rx !== 0 || ry !== 0) ctx.translate(rx, ry);

    // Soft outer halo so player always reads against busy combat
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 238, 255, 0.14)';
    ctx.fill();
    ctx.restore();

    super.draw(ctx);

    // Sleek directional aim/movement tick on perimeter
    const ang = Number.isFinite(this.facingAngle) ? this.facingAngle : -Math.PI / 2;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(this.radius + 7, 0);
    ctx.lineTo(this.radius - 2, -4.5);
    ctx.lineTo(this.radius - 2, 4.5);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    ctx.restore();

    if (flashFrac > 0) {
      const muzCol = this._muzzleColor || '#00ffff';
      const tipDist = this.radius + 11 + 4 * flashFrac;
      const wingDist = this.radius + 4;
      const wingSpread = 5.5 + 2.0 * flashFrac;
      ctx.save();
      ctx.translate(this.x + rx, this.y + ry);
      ctx.rotate(muzAng);
      ctx.globalAlpha = 0.85 * flashFrac;
      ctx.strokeStyle = muzCol;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(wingDist, -wingSpread);
      ctx.lineTo(tipDist, 0);
      ctx.lineTo(wingDist, wingSpread);
      ctx.stroke();

      ctx.globalAlpha = 0.95 * flashFrac;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(this.radius + 2, 0);
      ctx.lineTo(tipDist - 1.5, 0);
      ctx.stroke();
      ctx.restore();
    }

    // Subtle orbital hardware glyph arcs for Harmonic (#ffd700), Signature (#ff6622), and Mythic (#ffcc33) modules
    if (typeof Meta !== 'undefined' && Meta.data && Meta.data.equippedModules) {
      const slots = ['emitter', 'lens', 'shell', 'relay', 'auxiliary', 'relic'];
      const t = (typeof game !== 'undefined' && game && Number.isFinite(game.runTime))
        ? game.runTime
        : (Date.now() * 0.001);
      let ringIdx = 0;
      for (const s of slots) {
        const mod = Meta.data.equippedModules[s];
        if (!mod || (mod.quality !== 'harmonic' && mod.quality !== 'signature' && mod.quality !== 'mythic')) continue;
        const ringR = this.radius + 7 + ringIdx * 3.5;
        const baseAng = t * (ringIdx % 2 === 0 ? 1.65 : -1.35) + ringIdx * 1.15;
        ctx.save();
        ctx.strokeStyle = mod.quality === 'mythic' ? '#ffcc33' : (mod.quality === 'signature' ? '#ff6622' : '#ffd700');
        ctx.lineWidth = mod.quality === 'mythic' ? 2.0 : 1.5;
        ctx.globalAlpha = 0.85;
        for (let seg = 0; seg < 2; seg++) {
          const a0 = baseAng + seg * Math.PI;
          ctx.beginPath();
          ctx.arc(this.x, this.y, ringR, a0, a0 + Math.PI * 0.45);
          ctx.stroke();
        }
        ctx.restore();
        ringIdx++;
      }
    }

    // Crisp outlined world-space HP bar
    const hpRatio = Math.max(0, Math.min(1, (this.hp || 0) / Math.max(1, this.maxHp || 1)));
    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 20, 0.88)';
    ctx.fillRect(this.x - 17, this.y + 24, 34, 5);
    ctx.fillStyle = hpRatio < 0.30 ? '#ff3355' : '#00f088';
    ctx.fillRect(this.x - 17, this.y + 24, 34 * hpRatio, 5);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x - 17, this.y + 24, 34, 5);

    // Draw Energy Shield bar
    if (this.maxEnergyShield > 0) {
      const shRatio = Math.max(0, Math.min(1, (this.energyShield || 0) / Math.max(1, this.maxEnergyShield)));
      ctx.fillStyle = 'rgba(6, 14, 34, 0.88)';
      ctx.fillRect(this.x - 17, this.y + 30, 34, 4);
      ctx.fillStyle = '#00eeff';
      ctx.fillRect(this.x - 17, this.y + 30, 34 * shRatio, 4);
      ctx.strokeStyle = 'rgba(0, 238, 255, 0.55)';
      ctx.strokeRect(this.x - 17, this.y + 30, 34, 4);
    }
    ctx.restore();
  }
}

class Enemy extends Entity {
  constructor(x, y, hp, speed, isBoss = false, isElite = false, type = 'grunt') {
    const rawSpeed = speed;
    let radius = 12;
    let color = '#ff3366';
    let damage = 16;

    switch(type) {
        case 'grunt': radius = 12; color = '#ff3366'; damage = 18; break;
        case 'brute': radius = 20; color = '#ff0000'; hp *= 3; speed *= 0.76; damage = 44; break;
        case 'ranger': radius = 10; color = '#ffff00'; hp *= 0.8; speed *= 1.16; damage = 22; break;
        case 'rogue': radius = 8; color = '#00ffff'; hp *= 0.6; speed *= 1.60; damage = 20; break;
        case 'golem': radius = 25; color = '#888888'; hp *= 5; speed *= 0.54; damage = 42; break;
        case 'zergling': radius = 6; color = '#ff9900'; hp *= 0.2; speed *= 1.56; damage = 11; break;
        case 'shieldbearer': radius = 15; color = '#4444ff'; hp *= 2; speed *= 0.84; damage = 26; break;
        case 'medic': radius = 12; color = '#00ff00'; hp *= 0.8; speed *= 1.06; damage = 13; break;
        case 'commander': radius = 16; color = '#ff00ff'; hp *= 2; speed *= 0.65; damage = 25; break;
        case 'hive': radius = 30; color = '#990099'; hp *= 4; speed *= 0.46; damage = 30; break;
        case 'artillery': radius = 14; color = '#aa5500'; hp *= 1.2; speed *= 0.68; damage = 30; break;
        case 'kamikaze': radius = 10; color = '#ff6600'; hp *= 0.5; speed *= 1.72; damage = 54; break;
        case 'wraith': radius = 12; color = '#aaaaff'; hp *= 0.7; speed *= 1.10; damage = 26; break;
        case 'sentinel': radius = 18; color = '#eeeeee'; hp *= 1.5; speed *= 0.88; damage = 24; break;
        case 'slime': radius = 15; color = '#33cc33'; hp *= 1.5; speed *= 0.86; damage = 19; break;
        case 'minislime': radius = 8; color = '#55ff55'; hp *= 0.3; speed *= 1.50; damage = 12; break;
    }

    if (isElite) { radius *= 1.4; color = '#ff00ff'; hp *= 4; damage *= 1.8; }
    if (isBoss) {
        radius *= 2.4;
        color = '#c424ff';
        hp *= 14;
        damage *= 4.4;
        speed = Math.max(speed * 1.85, rawSpeed * 1.12);
    }

    super(x, y, radius, color);
    this.type = type;
    this.hp = hp;
    this.maxHp = hp;
    this.baseSpeed = speed;
    this.isBoss = isBoss;
    this.isElite = isElite;
    this.damage = damage;
    this.facingAngle = 0;
    
    // Type specific states
    this.stateTimer = 0;
    this.fireTimer = Math.random() * 1.4;
    this.dodgeCooldown = 0;
    this.teleportCooldown = 2.8 + Math.random() * 2.2;
    this.spawnTimer = 0;
    this.shieldAngle = 0; 
    this.orbitAngle = 0;
    this._strafeDir = Math.random() < 0.5 ? 1 : -1;
    this._isDashing = false;
    this._dodgeDashTimer = 0;
    this._dodgeDashDirX = 0;
    this._dodgeDashDirY = 0;
    this._lungeCooldown = 1.8 + Math.random() * 1.1;
    this._lungeWindupTimer = 0;
    this._lungeTimer = 0;
    this._burstRemaining = 0;
    this._burstTimer = 0;
    this._burstAngle = 0;
    this._burstDmg = 0;
    this._strafePhase = Math.random() * Math.PI * 2;

    // Status Effects
    this.dots = []; 
    this.status = { frozen: 0, chilled: 0, shocked: 0, petrified: 0 };
    
    // Buffs (from commander)
    this.buffs = { speedTimer: 0, damageTimer: 0 };
    
    // Knockback
    this.kbX = 0;
    this.kbY = 0;
    this.enteredArena = false;

    // Ecology / Aggro AI
    this.aiRole = 'hunter';
    this.aggroed = true;
    this.aggroRadius = 430;
    this.packId = 0;
    this.aggroAlertTimer = 0;
    this.respectsSanctumWard = false;

    // Elite Modifiers, Biome Infusion & Boss State
    this.eliteModifiers = [];
    this.matrixShield = 0;
    this.maxMatrixShield = 0;
    this._novaTimer = 1.8 + Math.random() * 2.0;
    this._blinkTimer = 2.2 + Math.random() * 2.5;
    this._tetherTimer = 0;
    this._siphonTimer = 0;
    this._novaPulseVisual = 0;
    this._isSplitFragment = false;
    this.isArchitectBoss = false;
    this.biomeInfusion = null;
    this._infusionDmgResist = 0;
    this._infusionKbMult = 1.0;
    this._infusionSurgeTimer = 2.2 + Math.random() * 2.0;
    this._infusionMendTimer = 2.4 + Math.random() * 1.4;
    this._crimsonSiphonCd = 0;
    this.retreatingForBoss = false;
    this.retreatTimer = 0;
    this.isBossRetinue = false;
    this.isBossPylon = false;
    this.parentBoss = null;
    this.exposedTimer = 0;
    this.biomeElement = null;
    this.resistShredTimer = 0;
    this.resistShredAmount = 0;
    this.holyMarkedTimer = 0;
    this._ccImmuneTimer = 0;
    this._bossEnraged = false;
    this._bossUptime = 0;
    this._bossActionTimer = 1.6;
    this._bossTeleportCd = 4.8;
    this._bossPylonCd = 5.2;
    this._pylonsSummoned = 0;
    this._activePylonCount = 0;
    this._bossDash = null;
    this._bossLockHeading = 0;
    this.bossKit = null;
    this.hasDirectionalArmor = Boolean(isBoss && ['golem', 'brute', 'sentinel', 'shieldbearer'].includes(type));
    this.hitFlashTimer = 0;
    this._hitPulseTimer = 0;
    this._lastHitWasCrit = false;
    this._lastHitAngle = null;
    this._chargeTelegraphProg = 0;
    this._chargeLockAngle = null;
    this._novaTelegraphProg = 0;
    this._pendingBlink = null;
    this._fireTelegraphProg = 0;
    this._fireLockAngle = null;
    this._fireLockTargetX = null;
    this._fireLockTargetY = null;
    this._firePreviewAngle = null;
    this._firePreviewTargetX = null;
    this._firePreviewTargetY = null;
    this._fuseWarningFrac = 0;
    this._aimLockAudioPlayed = false;
    this._fuseAudioPlayed = false;
    this._navDetourTimer = 0;
    this._navDetourSign = Math.random() < 0.5 ? 1 : -1;
    this._navStuckTimer = 0;
    this._navLastX = x;
    this._navLastY = y;
    this.isNemesis = false;
    this.nemesisCallsign = '';
  }

  applyBiomeInfusion(elementId) {
    if (!elementId || elementId === 'void') return this;
    this.biomeInfusion = elementId;
    if (elementId === 'fire') {
      this.baseSpeed *= 1.15;
    } else if (elementId === 'frost') {
      const addShield = Math.max(4, Math.round(this.maxHp * 0.22));
      this.maxMatrixShield += addShield;
      this.matrixShield += addShield;
    } else if (elementId === 'storm') {
      this.baseSpeed *= 1.25;
    } else if (elementId === 'holy') {
      const addShield = Math.max(5, Math.round(this.maxHp * 0.25));
      this.maxMatrixShield += addShield;
      this.matrixShield += addShield;
    } else if (elementId === 'earth') {
      this.maxHp *= 1.22;
      this.hp = this.maxHp;
      this._infusionDmgResist = 0.15;
      this._infusionKbMult = 0.5;
    }
    return this;
  }

  applyEliteModifiers(mods) {
    const list = Array.isArray(mods) ? mods.filter(Boolean) : [];
    this.eliteModifiers = list;
    if (list.includes('barrier_matrix')) {
      this.maxMatrixShield = Math.max(1, Math.round(this.maxHp * 0.35));
      this.matrixShield = this.maxMatrixShield;
    } else {
      this.maxMatrixShield = 0;
      this.matrixShield = 0;
    }
    return this;
  }

  setStationary(anchorX, anchorY, aggroRadius = 430, packId = 0) {
    this.aiRole = 'stationary';
    this.aggroed = false;
    this.respectsSanctumWard = true;
    this.anchorX = anchorX;
    this.anchorY = anchorY;
    this.aggroRadius = aggroRadius;
    this.packId = packId;
    this.idlePhase = Math.random() * Math.PI * 2;
    this.enteredArena = true;
    return this;
  }

  setPatrol(waypoints, aggroRadius = 490, packId = 0) {
    this.aiRole = 'patrol';
    this.aggroed = false;
    this.respectsSanctumWard = true;
    this.waypoints = waypoints || [];
    this.wpIndex = 0;
    this.wpTimer = 0;
    this.aggroRadius = aggroRadius;
    this.packId = packId;
    this.enteredArena = true;
    return this;
  }

  triggerAggro(activeGame, chain = true) {
    if (this.aggroed) return;
    this.aggroed = true;
    this.aggroAlertTimer = 0.85;
    if (chain && activeGame && activeGame.enemies) {
      for (const oe of activeGame.enemies) {
        if (!oe || oe === this || oe.markedForDeletion || oe.aggroed) continue;
        const d = Math.hypot(oe.x - this.x, oe.y - this.y);
        if ((this.packId > 0 && oe.packId === this.packId && d <= 520) || d <= 260) {
          oe.triggerAggro(activeGame, false);
        }
      }
    }
  }

  _queueBlink(tx, ty, color, activeGame) {
    const { minX = 0, minY = 0, w: bw, h: bh } = getWorldBounds(activeGame ? activeGame.canvas : null);
    const tmp = {
      x: Math.max(minX + this.radius, Math.min(bw - this.radius, tx)),
      y: Math.max(minY + this.radius, Math.min(bh - this.radius, ty)),
      radius: this.radius
    };
    if (activeGame && activeGame.world) {
      activeGame.world.resolveCircleWalls(tmp);
      if (activeGame.world.resolveCircleChasms) activeGame.world.resolveCircleChasms(tmp, this.type === 'wraith');
      if (activeGame.world.resolveForceGates) activeGame.world.resolveForceGates(tmp);
      if (activeGame.world.resolveSanctumWard) activeGame.world.resolveSanctumWard(tmp);
    }
    if (activeGame && activeGame.activeBossArena && typeof activeGame._resolveActiveBossArenaBoundary === 'function') {
      activeGame._resolveActiveBossArenaBoundary(tmp, Boolean(this.isBoss));
    }
    this._pendingBlink = {
      tx: tmp.x,
      ty: tmp.y,
      timer: 0.40,
      maxTimer: 0.40,
      color: color || '#aa66ff',
      _fresh: true
    };
  }

  _updatePendingBlink(dt, activeGame) {
    if (!this._pendingBlink) return;
    if (this.retreatingForBoss || !this.aggroed || this.status.frozen > 0 || this.status.petrified > 0) {
      this._pendingBlink = null;
      return;
    }
    if (this._pendingBlink._fresh) {
      this._pendingBlink._fresh = false;
      return;
    }
    this._pendingBlink.timer -= dt;
    if (this._pendingBlink.timer > 1e-6) return;

    const blink = this._pendingBlink;
    this._pendingBlink = null;
    const { minX = 0, minY = 0, w: bw, h: bh } = getWorldBounds(activeGame ? activeGame.canvas : null);
    this.x = Math.max(minX + this.radius, Math.min(bw - this.radius, blink.tx));
    this.y = Math.max(minY + this.radius, Math.min(bh - this.radius, blink.ty));
    if (activeGame && activeGame.world) {
      activeGame.world.resolveCircleWalls(this);
      if (activeGame.world.resolveCircleChasms) activeGame.world.resolveCircleChasms(this, this.type === 'wraith');
      if (activeGame.world.resolveForceGates) activeGame.world.resolveForceGates(this);
      if (activeGame.world.resolveSanctumWard) activeGame.world.resolveSanctumWard(this);
    }
    if (activeGame && activeGame.activeBossArena && typeof activeGame._resolveActiveBossArenaBoundary === 'function') {
      activeGame._resolveActiveBossArenaBoundary(this, Boolean(this.isBoss));
    }
    if (activeGame && activeGame.particles) {
      for (let k = 0; k < 6; k++) {
        _pushEntityParticle(activeGame, this.x, this.y, blink.color || '#aa66ff', false);
      }
    }
    if (this.type === 'wraith' && activeGame && activeGame.player && activeGame.enemyProjectiles && typeof EnemyProjectile !== 'undefined') {
      const dxP = activeGame.player.x - this.x;
      const dyP = activeGame.player.y - this.y;
      const distP = Math.hypot(dxP, dyP);
      if (distP > 1 && distP < 480) {
        const bSpd = 380;
        const ep = new EnemyProjectile(
          this.x,
          this.y,
          (dxP / distP) * bSpd,
          (dyP / distP) * bSpd,
          this.damage * 1.45 * (this.buffs && this.buffs.damageTimer > 0 ? 1.25 : 1),
          false,
          0,
          0,
          6.5,
          '#aa88ff'
        );
        ep.biomeInfusion = this.biomeInfusion;
        activeGame.enemyProjectiles.push(ep);
      }
    }
  }

  _resetFireTelegraph() {
    this._fireTelegraphProg = 0;
    this._fireLockAngle = null;
    this._fireLockTargetX = null;
    this._fireLockTargetY = null;
    this._firePreviewAngle = null;
    this._firePreviewTargetX = null;
    this._firePreviewTargetY = null;
    this._aimLockAudioPlayed = false;
  }

  _resetCombatTelegraphs() {
    this._resetFireTelegraph();
    this._fuseWarningFrac = 0;
    this._fuseAudioPlayed = false;
  }

  update(dt, playerX, playerY, swarmMode = 'HUNT', patternType = 0, idx = 0, total = 1, pTime = 0) {
    const activeGame = (typeof game !== 'undefined' && game) ? game : globalThis.game;
    const pRadius = (activeGame && activeGame.player) ? activeGame.player.radius : 15;

    if (this.aggroAlertTimer > 0) {
      this.aggroAlertTimer = Math.max(0, this.aggroAlertTimer - dt);
    }
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    }
    if (this._hitPulseTimer > 0) {
      this._hitPulseTimer = Math.max(0, this._hitPulseTimer - dt);
      if (this._hitPulseTimer === 0) this._lastHitWasCrit = false;
    }
    if (this._crimsonSiphonCd > 0) {
      this._crimsonSiphonCd = Math.max(0, this._crimsonSiphonCd - dt);
    }
    if (this.exposedTimer > 0) this.exposedTimer = Math.max(0, this.exposedTimer - dt);
    if (this._ccImmuneTimer > 0) this._ccImmuneTimer = Math.max(0, this._ccImmuneTimer - dt);
    if (this._bossLockHeading > 0) this._bossLockHeading = Math.max(0, this._bossLockHeading - dt);
    if (this.resistShredTimer > 0) this.resistShredTimer = Math.max(0, this.resistShredTimer - dt);
    if (this.holyMarkedTimer > 0) this.holyMarkedTimer = Math.max(0, this.holyMarkedTimer - dt);

    // Status & buff timers
    if (this.status.frozen > 0) this.status.frozen -= dt;
    if (this.status.chilled > 0) this.status.chilled -= dt;
    if (this.status.shocked > 0) this.status.shocked -= dt;
    if (this.status.petrified > 0) this.status.petrified -= dt;
    if (this.buffs.speedTimer > 0) this.buffs.speedTimer -= dt;
    if (this.buffs.damageTimer > 0) this.buffs.damageTimer -= dt;

    if (this.isBossPylon) {
      this._resetCombatTelegraphs();
      if (!this.parentBoss || this.parentBoss.markedForDeletion || this.parentBoss.hp <= 0) {
        this.markedForDeletion = true;
        return;
      }
      this.aggroed = true;
      this.vx = 0;
      this.vy = 0;
      this.kbX = 0;
      this.kbY = 0;
      for (let i = this.dots.length - 1; i >= 0; i--) {
        const dot = this.dots[i];
        dot.timer -= dt;
        dot.tickTimer -= dt;
        while (dot.tickTimer <= 0) {
          this.takeDamage(dot.damage * dot.tickInterval, { isDot: true });
          dot.tickTimer += dot.tickInterval;
        }
        if (dot.timer <= 0) this.dots.splice(i, 1);
      }
      return;
    }

    // Pre-boss dramaturgy: ordinary mobs scatter & dissolve into the void
    if (this.retreatingForBoss && !this.isBoss) {
      this._chargeTelegraphProg = 0;
      this._chargeLockAngle = null;
      this._novaTelegraphProg = 0;
      this._pendingBlink = null;
      this._resetCombatTelegraphs();
      this.aggroed = true;
      this.retreatTimer = (this.retreatTimer || 0) - dt;
      const dxR = this.x - playerX;
      const dyR = this.y - playerY;
      const dR = Math.hypot(dxR, dyR);
      const fallbackA = (idx * 0.91) % (Math.PI * 2);
      const rx = dR > 1 ? dxR / dR : Math.cos(fallbackA);
      const ry = dR > 1 ? dyR / dR : Math.sin(fallbackA);
      const fleeSpeed = Math.max(130, this.baseSpeed * 1.85);
      this.vx = rx * fleeSpeed;
      this.vy = ry * fleeSpeed;
      this.facingAngle = Math.atan2(ry, rx);
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      const { minX = 0, minY = 0, w: arenaW, h: arenaH } = getWorldBounds(activeGame ? activeGame.canvas : null);
      this.x = Math.max(minX + this.radius, Math.min(arenaW - this.radius, this.x));
      this.y = Math.max(minY + this.radius, Math.min(arenaH - this.radius, this.y));
      if (activeGame && activeGame.world) {
        activeGame.world.resolveCircleWalls(this);
        if (activeGame.world.resolveForceGates) activeGame.world.resolveForceGates(this);
      }

      if (this.retreatTimer <= 0) {
        this.markedForDeletion = true;
        if (activeGame && this.cellKey && activeGame.populatedCells) {
          activeGame.populatedCells.delete(this.cellKey);
        }
      }
      return;
    }

    let currentSpeed = this.baseSpeed;
    if (!this.isBoss && (this.status.frozen > 0 || this.status.petrified > 0)) {
      currentSpeed = 0;
    } else if (this.isBoss && (this.status.frozen > 0 || this.status.petrified > 0) && !(this._bossDash && this._bossDash.timer > 0)) {
      currentSpeed = 0;
    } else {
      if (this.status.chilled > 0) currentSpeed *= (this.isBoss ? 0.85 : 0.65);
      if (this.isBoss && this.exposedTimer > 0 && !(this._bossDash && this._bossDash.timer > 0)) currentSpeed *= 0.55;
      if (this.buffs.speedTimer > 0) currentSpeed *= 1.25;
      if (this.biomeInfusion === 'blood' && this.hp < this.maxHp * 0.5) currentSpeed *= 1.20;
    }

    const rawPlayerDist = Math.hypot(playerX - this.x, playerY - this.y);
    if (!this.aggroed && rawPlayerDist <= (this.aggroRadius || 430)) {
      this.triggerAggro(activeGame, true);
    }

    if (!this.aggroed) {
      this._chargeTelegraphProg = 0;
      this._chargeLockAngle = null;
      this._novaTelegraphProg = 0;
      this._pendingBlink = null;
      this._resetCombatTelegraphs();
      let idleDirX = 0;
      let idleDirY = 0;
      let idleSpd = 0;
      if (currentSpeed > 0) {
        if (this.aiRole === 'stationary') {
          this.idlePhase = (this.idlePhase || 0) + dt * 0.85;
          const gx = (this.anchorX ?? this.x) + Math.cos(this.idlePhase) * 24;
          const gy = (this.anchorY ?? this.y) + Math.sin(this.idlePhase) * 24;
          const gd = Math.hypot(gx - this.x, gy - this.y);
          if (gd > 4) {
            idleDirX = (gx - this.x) / gd;
            idleDirY = (gy - this.y) / gd;
            idleSpd = currentSpeed * (gd > 80 ? 0.75 : 0.22);
            this.facingAngle = Math.atan2(idleDirY, idleDirX);
          }
        } else if (this.aiRole === 'patrol' && this.waypoints && this.waypoints.length > 0) {
          this.wpTimer = (this.wpTimer || 0) + dt;
          const wp = this.waypoints[this.wpIndex % this.waypoints.length];
          const wd = Math.hypot(wp.x - this.x, wp.y - this.y);
          if (wd < 42 || this.wpTimer > 5.0) {
            this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
            this.wpTimer = 0;
          } else if (wd > 0) {
            idleDirX = (wp.x - this.x) / wd;
            idleDirY = (wp.y - this.y) / wd;
            idleSpd = currentSpeed * 0.72;
            this.facingAngle = Math.atan2(idleDirY, idleDirX);
          }
        }
      }

      this.vx = idleDirX * idleSpd;
      this.vy = idleDirY * idleSpd;
      this.x += (this.vx + this.kbX) * dt;
      this.y += (this.vy + this.kbY) * dt;
      const kbDecay = Math.exp(-8 * dt);
      this.kbX *= kbDecay;
      this.kbY *= kbDecay;

      const { w: arenaW, h: arenaH } = getWorldBounds(activeGame ? activeGame.canvas : null);
      this.x = Math.max(this.radius, Math.min(arenaW - this.radius, this.x));
      this.y = Math.max(this.radius, Math.min(arenaH - this.radius, this.y));

      if (activeGame && activeGame.world) {
        activeGame.world.resolveCircleWalls(this);
        if (activeGame.world.resolveCircleChasms) activeGame.world.resolveCircleChasms(this, this.type === 'wraith');
        if (activeGame.world.resolveForceGates) activeGame.world.resolveForceGates(this);
        if (activeGame.world.resolveSanctumWard) activeGame.world.resolveSanctumWard(this);
      }

      for (let i = this.dots.length - 1; i >= 0; i--) {
        const dot = this.dots[i];
        dot.timer -= dt;
        dot.tickTimer -= dt;
        while (dot.tickTimer <= 0) {
          this.takeDamage(dot.damage * dot.tickInterval, { isDot: true });
          dot.tickTimer += dot.tickInterval;
        }
        if (dot.timer <= 0) this.dots.splice(i, 1);
      }
      if (this.dots.some(d => d.type === "poison")) this.color = '#00ff66';
      else if (this.dots.some(d => d.type === "burn")) this.color = '#ff6600';
      else if (this.dots.some(d => d.type === "bleed")) this.color = '#aa0000';
      else this.color = this.baseColor;
      return;
    }

    if (
      (this.aiRole === 'stationary' || this.aiRole === 'patrol') &&
      !this.isBoss &&
      !this.monolithElement &&
      rawPlayerDist > 1400
    ) {
      this.aggroed = false;
    }

    let targetX = playerX;
    let targetY = playerY;
    let mode = this.isBoss ? 'HUNT' : swarmMode;

    if (mode === 'REGROUP' || mode === 'FLEE') {
        const stageAngle = (Math.PI * 2 / Math.max(1, total)) * idx;
        const stageRadius = 520;
        targetX = playerX + Math.cos(stageAngle) * stageRadius;
        targetY = playerY + Math.sin(stageAngle) * stageRadius;
    } else if (mode === 'PATTERN') {
        const t = pTime;
        const safeTotal = Math.max(1, total);
        switch (patternType) {
            case 0: // Helix Spiral (12.6s)
                {
                   const radius = Math.max(135, 540 - t * 30);
                   const angle = (Math.PI * 2 / safeTotal) * idx + t * 0.85;
                   targetX = playerX + Math.cos(angle) * radius;
                   targetY = playerY + Math.sin(angle) * radius;
                }
                break;
            case 1: // Constricting Halo (12.6s)
                {
                   const radius = 160 + 340 * (0.5 + 0.5 * Math.cos(t * 0.45));
                   const angle = (Math.PI * 2 / safeTotal) * idx + t * 0.55;
                   targetX = playerX + Math.cos(angle) * radius;
                   targetY = playerY + Math.sin(angle) * radius;
                }
                break;
            case 2: // Rotating Crosshair (12.6s)
                {
                   const arm = idx % 4;
                   const indexInArm = Math.floor(idx / 4);
                   const totalPerArm = Math.max(1, Math.ceil(safeTotal / 4));
                   const span = Math.max(180, 420 - t * 18);
                   const distFromCenter = 130 + ((indexInArm + 0.5) / totalPerArm) * span;
                   const angle = (Math.PI / 2) * arm + t * 0.55;
                   targetX = playerX + Math.cos(angle) * distFromCenter;
                   targetY = playerY + Math.sin(angle) * distFromCenter;
                }
                break;
            case 3: // Twin Pincer Vice (12.6s)
                {
                   const isLeft = idx % 2 === 0;
                   const sideIndex = Math.floor(idx / 2);
                   const totalPerSide = Math.max(1, Math.ceil(safeTotal / 2));
                   const yOffset = ((sideIndex / totalPerSide) - 0.5) * 620 + Math.sin(t * 1.1) * 45;
                   const xDist = Math.max(140, 520 - t * 28);
                   targetX = playerX + (isLeft ? -xDist : xDist);
                   targetY = playerY + yOffset;
                }
                break;
            case 4: // Sweeping Phalanx Wall (12.6s, 2 alternating passes)
                {
                   const passProgress = (t % 6.3) / 6.3;
                   const sweepDir = Math.floor(t / 6.3) % 2 === 0 ? 1 : -1;
                   const yOffset = (-460 + passProgress * 820) * sweepDir;
                   const xOffset = ((idx / Math.max(1, safeTotal - 1)) - 0.5) * 760;
                   targetX = playerX + xOffset;
                   targetY = playerY + yOffset;
                }
                break;
            case 5: // Harmonic Pulsar (12.6s)
                {
                   const radius = 290 + Math.sin(t * 2.2) * 150;
                   const angle = (Math.PI * 2 / safeTotal) * idx + t * 0.6;
                   targetX = playerX + Math.cos(angle) * radius;
                   targetY = playerY + Math.sin(angle) * radius;
                }
                break;
            case 6: // Starburst Dive (12.6s, 3 dive pulses)
                {
                   const cycle = t % 4.2;
                   const angle = (Math.PI * 2 / safeTotal) * idx + t * 0.35;
                   let radius = 480;
                   if (cycle > 2.2) {
                       const diveProgress = (cycle - 2.2) / 2.0;
                       radius = 480 - diveProgress * 335;
                   }
                   targetX = playerX + Math.cos(angle) * radius;
                   targetY = playerY + Math.sin(angle) * radius;
                }
                break;
            case 7: // Rotating Lattice Grid (12.6s)
                {
                   const cols = Math.max(2, Math.ceil(Math.sqrt(safeTotal)));
                   const rows = Math.max(1, Math.ceil(safeTotal / cols));
                   const row = Math.floor(idx / cols);
                   const col = idx % cols;
                   const spacing = 125;
                   const localX = (col - (cols - 1) * 0.5) * spacing;
                   const localY = (row - (rows - 1) * 0.5) * spacing;
                   const rotAngle = t * 0.42;
                   const breathe = 1.0 - Math.min(0.28, t * 0.02);
                   const rx = (localX * Math.cos(rotAngle) - localY * Math.sin(rotAngle)) * breathe;
                   const ry = (localX * Math.sin(rotAngle) + localY * Math.cos(rotAngle)) * breathe;
                   targetX = playerX + rx;
                   targetY = playerY + ry;
                }
                break;
            case 8: // Twin Hourglass (12.6s)
                {
                   const isTop = idx % 2 === 0;
                   const halfIdx = Math.floor(idx / 2);
                   const row = Math.floor(Math.sqrt(halfIdx * 2));
                   const itemsInRow = row + 1;
                   const col = halfIdx - (row * (row - 1)) / 2;
                   const yDist = Math.max(120, 340 - t * 14) + row * 55;
                   const xOffset = ((col / Math.max(1, itemsInRow)) - 0.5) * (row * 105);
                   const rotAngle = t * 0.65;
                   const localY = isTop ? -yDist : yDist;
                   targetX = playerX + (xOffset * Math.cos(rotAngle) - localY * Math.sin(rotAngle));
                   targetY = playerY + (xOffset * Math.sin(rotAngle) + localY * Math.cos(rotAngle));
                }
                break;
            case 9: // Orbital Satellites (12.6s)
                {
                   const groupCount = Math.min(4, Math.max(2, Math.floor(safeTotal / 3)));
                   const groupIndex = idx % groupCount;
                   const indexInGroup = Math.floor(idx / groupCount);
                   const totalInGroup = Math.max(1, Math.ceil(safeTotal / groupCount));
                   const groupOrbitRadius = Math.max(175, 420 - t * 18);
                   const groupOrbitAngle = (Math.PI * 2 / groupCount) * groupIndex + t * 0.48;
                   const groupCX = playerX + Math.cos(groupOrbitAngle) * groupOrbitRadius;
                   const groupCY = playerY + Math.sin(groupOrbitAngle) * groupOrbitRadius;
                   const localRadius = 85;
                   const localAngle = (Math.PI * 2 / totalInGroup) * indexInGroup - t * 1.9;
                   targetX = groupCX + Math.cos(localAngle) * localRadius;
                   targetY = groupCY + Math.sin(localAngle) * localRadius;
                }
                break;
        }
    }

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);

    let moveDirX = 0;
    let moveDirY = 0;
    if (dist > 0) {
        moveDirX = dx / dist;
        moveDirY = dy / dist;
    }
    if (mode === 'PATTERN' && dist < 10) {
        moveDirX = 0;
        moveDirY = 0;
    }
    
    const playerDx = playerX - this.x;
    const playerDy = playerY - this.y;
    const playerDist = Math.hypot(playerDx, playerDy);
    const desiredHeading = Math.atan2(playerDy, playerDx);
    if (!this.isBoss) {
        this.facingAngle = (this.type === 'brute' && this._chargeLockAngle != null) ? this._chargeLockAngle : desiredHeading;
    } else if (this._bossDash && this._bossDash.timer > 0) {
        this.facingAngle = Math.atan2(this._bossDash.vy, this._bossDash.vx);
    } else if (this._bossLockHeading <= 0) {
        let diff = desiredHeading - this.facingAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = 3.0 * dt;
        this.facingAngle += Math.max(-maxTurn, Math.min(maxTurn, diff));
    }

    // Shield rotation
    if (this.type === 'shieldbearer') {
        if (this.shieldCapacity === undefined) this.shieldCapacity = 1.0;
        
        // Smoothly rotate shield angle towards the player
        let angleDiff = this.facingAngle - this.shieldAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        this.shieldAngle += angleDiff * 1.5 * dt; // Turn speed of 1.5 radians per second
    }

    this._isDashing = false;
    if (this.isBoss && this._bossDash && this._bossDash.timer > 0) {
        this._isDashing = true;
        this.vx = this._bossDash.vx;
        this.vy = this._bossDash.vy;
        this.kbX = 0;
        this.kbY = 0;
    } else if (currentSpeed > 0) {
        if (mode === 'REGROUP' || mode === 'PATTERN' || mode === 'CONVERGE') {
            this._chargeTelegraphProg = 0;
            this._chargeLockAngle = null;
            this._dodgeDashTimer = 0;
            this._lungeWindupTimer = 0;
            this._lungeTimer = 0;
            currentSpeed *= mode === 'CONVERGE' ? 1.32 : (dist > 90 ? 1.45 : 1.18);
        } else if (!this.isBoss) {
            // Specific behaviors during standard HUNT combat (regular mobs)
            if (this.type === 'brute') {
                this.stateTimer += dt;
                if (this.stateTimer < 1.65) {
                    currentSpeed *= 0.25; // Wind-up before charge
                    if (this.stateTimer >= 1.05) {
                        this._chargeTelegraphProg = Math.max(0, Math.min(1, (this.stateTimer - 1.05) / 0.60));
                        if (this.stateTimer >= 1.50) {
                            if (this._chargeLockAngle == null) this._chargeLockAngle = desiredHeading;
                            this.facingAngle = this._chargeLockAngle;
                            moveDirX = Math.cos(this._chargeLockAngle);
                            moveDirY = Math.sin(this._chargeLockAngle);
                        } else {
                            this._chargeLockAngle = null;
                        }
                    } else {
                        this._chargeTelegraphProg = 0;
                        this._chargeLockAngle = null;
                    }
                } else if (this.stateTimer < 2.50) {
                    currentSpeed *= 4.7; // Extended high-speed bull charge (~300-350px reach)
                    this._isDashing = true;
                    this._chargeTelegraphProg = 0;
                    if (this._chargeLockAngle == null) this._chargeLockAngle = desiredHeading;
                    this.facingAngle = this._chargeLockAngle;
                    moveDirX = Math.cos(this._chargeLockAngle);
                    moveDirY = Math.sin(this._chargeLockAngle);
                } else {
                    this.stateTimer = 0; // Reset
                    this._chargeTelegraphProg = 0;
                    this._chargeLockAngle = null;
                }
            } else if (this.type === 'ranger') {
                if (playerDist < 240) {
                    moveDirX = -Math.cos(this.facingAngle); // Back away
                    moveDirY = -Math.sin(this.facingAngle);
                } else if (playerDist < 420) {
                    // Strafe laterally instead of standing still as an easy target
                    moveDirX = -Math.sin(this.facingAngle) * (this._strafeDir || 1);
                    moveDirY = Math.cos(this.facingAngle) * (this._strafeDir || 1);
                    currentSpeed *= 0.82;
                }
            } else if (this.type === 'medic') {
                if (playerDist < 360) {
                    moveDirX = -Math.cos(this.facingAngle); // Run away from player
                    moveDirY = -Math.sin(this.facingAngle);
                } else if (playerDist < 540) {
                    moveDirX = -Math.sin(this.facingAngle) * (this._strafeDir || 1);
                    moveDirY = Math.cos(this.facingAngle) * (this._strafeDir || 1);
                    currentSpeed *= 0.72;
                }
            } else if (this.type === 'artillery') {
                if (playerDist < 460) {
                    moveDirX = -Math.cos(this.facingAngle); moveDirY = -Math.sin(this.facingAngle);
                } else if (playerDist < 620) {
                    moveDirX = 0; moveDirY = 0;
                }
            } else if (this.type === 'rogue') {
                this.stateTimer += dt;
                this.dodgeCooldown -= dt;
                this._lungeCooldown -= dt;
                let dodged = false;
                if (this._dodgeDashTimer > 0) {
                    this._dodgeDashTimer = Math.max(0, this._dodgeDashTimer - dt);
                    moveDirX = this._dodgeDashDirX;
                    moveDirY = this._dodgeDashDirY;
                    currentSpeed *= 2.6;
                    this._isDashing = true;
                    dodged = true;
                } else if (this._lungeWindupTimer > 0) {
                    this._lungeWindupTimer = Math.max(0, this._lungeWindupTimer - dt);
                    if (this._chargeLockAngle == null) this._chargeLockAngle = desiredHeading;
                    this.facingAngle = this._chargeLockAngle;
                    moveDirX = Math.cos(this._chargeLockAngle);
                    moveDirY = Math.sin(this._chargeLockAngle);
                    currentSpeed *= 0.28;
                    this._chargeTelegraphProg = Math.max(0, Math.min(1, 1 - (this._lungeWindupTimer / 0.28)));
                    if (this._lungeWindupTimer <= 0) {
                        this._lungeTimer = 0.45;
                        this._chargeTelegraphProg = 0;
                    }
                    dodged = true;
                } else if (this._lungeTimer > 0) {
                    this._lungeTimer = Math.max(0, this._lungeTimer - dt);
                    if (this._chargeLockAngle == null) this._chargeLockAngle = desiredHeading;
                    this.facingAngle = this._chargeLockAngle;
                    moveDirX = Math.cos(this._chargeLockAngle);
                    moveDirY = Math.sin(this._chargeLockAngle);
                    currentSpeed *= 3.3;
                    this._isDashing = true;
                    this._chargeTelegraphProg = 0;
                    if (this._lungeTimer <= 0) {
                        this._chargeLockAngle = null;
                        this._lungeCooldown = 3.6;
                    }
                    dodged = true;
                } else {
                    if (this.dodgeCooldown <= 0 && activeGame && activeGame.projectiles) {
                        for (let p of activeGame.projectiles) {
                            if (Math.hypot(this.x - p.x, this.y - p.y) < 175) {
                                const perpX = -moveDirY * (this._strafeDir || 1);
                                const perpY = moveDirX * (this._strafeDir || 1);
                                this._dodgeDashDirX = perpX;
                                this._dodgeDashDirY = perpY;
                                this._dodgeDashTimer = 0.16;
                                moveDirX = perpX;
                                moveDirY = perpY;
                                currentSpeed *= 2.6;
                                this._isDashing = true;
                                this.dodgeCooldown = 2.4;
                                dodged = true;
                                break;
                            }
                        }
                    }
                    if (!dodged && this._lungeCooldown <= 0 && playerDist >= 120 && playerDist <= 340) {
                        this._lungeWindupTimer = 0.28;
                        this._chargeLockAngle = desiredHeading;
                        this.facingAngle = this._chargeLockAngle;
                        this._chargeTelegraphProg = 0.05;
                        currentSpeed *= 0.28;
                        dodged = true;
                    }
                }
                if (!dodged && playerDist > 95) {
                    const weave = Math.sin(this.stateTimer * 3.8 + (this._strafePhase || 0)) * 0.42;
                    const wx = moveDirX + (-moveDirY) * weave;
                    const wy = moveDirY + moveDirX * weave;
                    const wLen = Math.hypot(wx, wy) || 1;
                    moveDirX = wx / wLen;
                    moveDirY = wy / wLen;
                }
            } else if (this.type === 'wraith') {
                this.teleportCooldown -= dt;
                if (this.teleportCooldown <= 0 && playerDist > 140 && !this._pendingBlink) {
                    // Queue 0.40s arrival rift around player before warping
                    const tAngle = Math.random() * Math.PI * 2;
                    const tDist = 140 + Math.random() * 80;
                    this._queueBlink(playerX + Math.cos(tAngle) * tDist, playerY + Math.sin(tAngle) * tDist, '#aaaaff', activeGame);
                    this.teleportCooldown = 2.8 + Math.random() * 2.2;
                }
            }
        }

        // Wall & chasm avoidance pathfinding so enemies steer cleanly around obstacles
        if (
            this.aggroed !== false &&
            !this.isBossPylon &&
            !this.isBoss &&
            !((this.type === 'brute' || this.type === 'rogue') && this._chargeLockAngle != null) &&
            Math.hypot(moveDirX, moveDirY) > 0.05 &&
            activeGame &&
            activeGame.world &&
            typeof activeGame.world.isCircleBlocked === 'function'
        ) {
            const worldRef = activeGame.world;
            const canCrossChasm = this.type === 'wraith';
            const movedDist = Math.hypot(this.x - (this._navLastX ?? this.x), this.y - (this._navLastY ?? this.y));
            const expectedStep = Math.max(0.5, currentSpeed * dt);
            if (this._hitWallThisTick || movedDist < expectedStep * 0.25) {
                this._navStuckTimer = (this._navStuckTimer || 0) + dt;
            } else {
                this._navStuckTimer = Math.max(0, (this._navStuckTimer || 0) - dt * 1.6);
            }
            this._navLastX = this.x;
            this._navLastY = this.y;

            const baseAng = Math.atan2(moveDirY, moveDirX);
            const probeR = Math.max(12, this.radius + 3);
            const probeD = Math.max(this.radius * 2.2 + 12, Math.min(78, currentSpeed * 0.45));
            const aheadBlocked = worldRef.isCircleBlocked(
                this.x + Math.cos(baseAng) * probeD,
                this.y + Math.sin(baseAng) * probeD,
                probeR,
                canCrossChasm
            );

            if (this._navDetourTimer > 0) {
                this._navDetourTimer = Math.max(0, this._navDetourTimer - dt);
            }

            if (aheadBlocked || this._navDetourTimer > 0 || this._navStuckTimer > 0.18) {
                const candidateOffsets = [0, 0.52, -0.52, 1.05, -1.05, 1.57, -1.57, 2.15, -2.15];
                let bestAng = baseAng;
                let bestScore = -999;
                let bestOff = 0;
                for (let k = 0; k < candidateOffsets.length; k++) {
                    const off = candidateOffsets[k];
                    const testAng = baseAng + off;
                    const tx = this.x + Math.cos(testAng) * probeD;
                    const ty = this.y + Math.sin(testAng) * probeD;
                    if (worldRef.isCircleBlocked(tx, ty, probeR, canCrossChasm)) continue;
                    const midClear = !worldRef.isCircleBlocked(
                        this.x + Math.cos(testAng) * (probeD * 0.52),
                        this.y + Math.sin(testAng) * (probeD * 0.52),
                        probeR,
                        canCrossChasm
                    );
                    if (!midClear) continue;
                    const farClear = !worldRef.isCircleBlocked(
                        this.x + Math.cos(testAng) * (probeD * 1.75),
                        this.y + Math.sin(testAng) * (probeD * 1.75),
                        probeR,
                        canCrossChasm
                    );
                    const offSign = off >= 0 ? 1 : -1;
                    let score = Math.cos(off) + (farClear ? 0.55 : 0);
                    if (off !== 0 && offSign === this._navDetourSign) score += 0.38;
                    if (score > bestScore) {
                        bestScore = score;
                        bestAng = testAng;
                        bestOff = off;
                    }
                }
                if (bestScore > -900) {
                    moveDirX = Math.cos(bestAng);
                    moveDirY = Math.sin(bestAng);
                    if (Math.abs(bestOff) > 0.1) {
                        this._navDetourSign = bestOff >= 0 ? 1 : -1;
                        this._navDetourTimer = Math.max(this._navDetourTimer || 0, this._navStuckTimer > 0.25 ? 0.72 : 0.26);
                    }
                } else {
                    const fallbackAng = baseAng + (this._navDetourSign || 1) * (Math.PI * 0.62);
                    moveDirX = Math.cos(fallbackAng);
                    moveDirY = Math.sin(fallbackAng);
                    this._navDetourTimer = 0.45;
                    if (this._navStuckTimer > 1.3) {
                        this._navDetourSign = -(this._navDetourSign || 1);
                        this._navStuckTimer = 0.3;
                    }
                }
            }
        }

        this.vx = moveDirX * currentSpeed;
        this.vy = moveDirY * currentSpeed;
    } else {
        this._chargeTelegraphProg = 0;
        this._chargeLockAngle = null;
        this._novaTelegraphProg = 0;
        this._pendingBlink = null;
        this._isDashing = false;
        this._dodgeDashTimer = 0;
        this._lungeWindupTimer = 0;
        this._lungeTimer = 0;
        this._burstRemaining = 0;
        this._resetCombatTelegraphs();
        this.vx = 0;
        this.vy = 0;
    }

    // Interactions from behaviors that spawn things
    if (currentSpeed > 0 && this.status.frozen <= 0) {
        if (this.type === 'kamikaze') {
            const armDist = this.radius + pRadius + 20;
            if (playerDist < armDist && activeGame) {
                this._fuseWarningFrac = 0;
                this._fuseAudioPlayed = false;
                activeGame.enemyExplosions.push(new EnemyExplosion(this.x, this.y, 90, this.damage * 1.8));
                this.markedForDeletion = true;
            } else if (this.aggroed && !this.retreatingForBoss && this.status.petrified <= 0 && playerDist < 175) {
                const span = Math.max(1, 175 - armDist);
                this._fuseWarningFrac = Math.max(0, Math.min(1, (175 - playerDist) / span));
                if (this._fuseWarningFrac >= 0.5 && !this._fuseAudioPlayed) {
                    this._fuseAudioPlayed = true;
                    if (typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.playEnemyTelegraph === 'function') {
                        NeonAudio.playEnemyTelegraph('fuse');
                    }
                }
            } else {
                this._fuseWarningFrac = 0;
                this._fuseAudioPlayed = false;
            }
        } else {
            this._fuseWarningFrac = 0;
            this._fuseAudioPlayed = false;
        }

        // Staggered burst follow-up shots (e.g., Ranger 3-round pulse burst)
        if (!this.isBoss && activeGame && this.status.petrified <= 0 && this.aggroed && !this.retreatingForBoss && this._burstRemaining > 0) {
            this._burstTimer -= dt;
            if (this._burstTimer <= 0) {
                const spread = this._burstRemaining === 2 ? 0.045 : -0.045;
                const bAng = (this._burstAngle || this.facingAngle || 0) + spread;
                const ep = new EnemyProjectile(
                    this.x,
                    this.y,
                    Math.cos(bAng) * 395,
                    Math.sin(bAng) * 395,
                    this._burstDmg || (this.damage * 0.75),
                    false,
                    0,
                    0,
                    5.5,
                    '#ffee44'
                );
                ep.biomeInfusion = this.biomeInfusion;
                activeGame.enemyProjectiles.push(ep);
                this._burstRemaining--;
                this._burstTimer = 0.13;
            }
        } else if (this.status.petrified > 0 || !this.aggroed || this.retreatingForBoss) {
            this._burstRemaining = 0;
        }
        
        // Firing logic
        this.fireTimer -= dt;
        if (!this.isBoss && activeGame && this.status.petrified <= 0) {
            const canFireThisType = (this.type === 'ranger')
                || (this.type === 'artillery')
                || (this.type === 'sentinel' && playerDist < 480)
                || (this.type === 'commander' && playerDist < 620);

            if (!canFireThisType) {
                this._resetFireTelegraph();
            } else {
                const computeLead = () => {
                    const pVx = (activeGame.player && Number.isFinite(activeGame.player.vx)) ? activeGame.player.vx : 0;
                    const pVy = (activeGame.player && Number.isFinite(activeGame.player.vy)) ? activeGame.player.vy : 0;
                    const leadX = playerX + Math.max(-65, Math.min(65, pVx * 0.22));
                    const leadY = playerY + Math.max(-65, Math.min(65, pVy * 0.22));
                    const leadAngle = Math.atan2(leadY - this.y, leadX - this.x);
                    return { leadX, leadY, leadAngle };
                };

                if (this.fireTimer > 0 && this.fireTimer <= 0.38) {
                    this._fireTelegraphProg = Math.max(0, Math.min(1, 1 - (this.fireTimer / 0.38)));
                    if (this.fireTimer <= 0.12) {
                        if (this._fireLockAngle === null) {
                            const lead = computeLead();
                            this._fireLockAngle = lead.leadAngle;
                            this._fireLockTargetX = lead.leadX;
                            this._fireLockTargetY = lead.leadY;
                            if (!this._aimLockAudioPlayed && (this.type === 'ranger' || this.type === 'artillery' || this.type === 'commander') && playerDist <= 780) {
                                this._aimLockAudioPlayed = true;
                                if (typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.playEnemyTelegraph === 'function') {
                                    NeonAudio.playEnemyTelegraph('aim_lock');
                                }
                            }
                        }
                        this._firePreviewAngle = this._fireLockAngle;
                        this._firePreviewTargetX = this._fireLockTargetX;
                        this._firePreviewTargetY = this._fireLockTargetY;
                    } else {
                        const lead = computeLead();
                        this._firePreviewAngle = lead.leadAngle;
                        this._firePreviewTargetX = lead.leadX;
                        this._firePreviewTargetY = lead.leadY;
                        this._fireLockAngle = null;
                        this._fireLockTargetX = null;
                        this._fireLockTargetY = null;
                        this._aimLockAudioPlayed = false;
                    }
                } else if (this.fireTimer <= 0) {
                    const fallbackLead = (this._fireLockAngle === null || this._fireLockTargetX === null || this._fireLockTargetY === null)
                        ? computeLead()
                        : null;
                    const finalAngle = this._fireLockAngle !== null ? this._fireLockAngle : fallbackLead.leadAngle;
                    const finalTargetX = this._fireLockTargetX !== null ? this._fireLockTargetX : fallbackLead.leadX;
                    const finalTargetY = this._fireLockTargetY !== null ? this._fireLockTargetY : fallbackLead.leadY;
                    const fireDirX = Math.cos(finalAngle);
                    const fireDirY = Math.sin(finalAngle);
                    const dmgBuff = this.buffs.damageTimer > 0 ? 1.25 : 1;

                    if (this.type === 'ranger') {
                        const ep = new EnemyProjectile(
                            this.x,
                            this.y,
                            fireDirX * 395,
                            fireDirY * 395,
                            this.damage * 0.85 * dmgBuff,
                            false,
                            0,
                            0,
                            5.5,
                            '#ffee44'
                        );
                        ep.biomeInfusion = this.biomeInfusion;
                        activeGame.enemyProjectiles.push(ep);
                        this._burstRemaining = 2;
                        this._burstTimer = 0.13;
                        this._burstAngle = finalAngle;
                        this._burstDmg = this.damage * 0.75 * dmgBuff;
                        this.fireTimer = 1.45;
                    } else if (this.type === 'sentinel') {
                        const fanOffsets = [-0.17, 0, 0.17];
                        for (let fo = 0; fo < fanOffsets.length; fo++) {
                            const sAng = finalAngle + fanOffsets[fo];
                            const ep = new EnemyProjectile(
                                this.x,
                                this.y,
                                Math.cos(sAng) * 370,
                                Math.sin(sAng) * 370,
                                this.damage * 0.85 * dmgBuff,
                                false,
                                0,
                                0,
                                6,
                                '#ff5577'
                            );
                            ep.biomeInfusion = this.biomeInfusion;
                            activeGame.enemyProjectiles.push(ep);
                        }
                        this.fireTimer = 2.3;
                    } else if (this.type === 'artillery') {
                        const lobVx = (finalTargetX - this.x) / 1.2;
                        const lobVy = (finalTargetY - this.y) / 1.2;
                        const ep = new EnemyProjectile(
                            this.x,
                            this.y,
                            lobVx,
                            lobVy,
                            this.damage * 2.15 * dmgBuff,
                            true,
                            finalTargetX,
                            finalTargetY,
                            9,
                            '#ff7722'
                        );
                        ep.biomeInfusion = this.biomeInfusion;
                        activeGame.enemyProjectiles.push(ep);
                        this.fireTimer = 2.3;
                    } else if (this.type === 'commander') {
                        const ep = new EnemyProjectile(
                            this.x,
                            this.y,
                            fireDirX * 440,
                            fireDirY * 440,
                            this.damage * 2.10 * dmgBuff,
                            false,
                            0,
                            0,
                            8,
                            '#ff44ff',
                            1600
                        );
                        ep.biomeInfusion = this.biomeInfusion;
                        activeGame.enemyProjectiles.push(ep);
                        this.fireTimer = 2.6;
                    }
                    this._resetFireTelegraph();
                } else {
                    this._resetFireTelegraph();
                }
            }
        } else {
            this._resetFireTelegraph();
        }
        
        // Summoning logic
        this.spawnTimer -= dt;
        if (!this.isBoss && this.spawnTimer <= 0 && this.type === 'hive' && activeGame && activeGame.enemies.length < 150) {
            for(let i=0; i<2; i++) {
                const zg = new Enemy(this.x + (Math.random()-0.5)*50, this.y + (Math.random()-0.5)*50, Math.max(10, this.maxHp * 0.05), Math.max(95, this.baseSpeed * 3), false, false, 'zergling');
                zg.damage = Math.max(zg.damage, this.damage * 0.35);
                activeGame.enemies.push(zg);
            }
            this.spawnTimer = 5.8;
        }
        
        // Orbit update
        if (this.type === 'sentinel') {
            this.orbitAngle += dt * 2;
        }
    } else {
        this._isDashing = false;
        this._dodgeDashTimer = 0;
        this._lungeWindupTimer = 0;
        this._lungeTimer = 0;
        this._burstRemaining = 0;
        this._resetCombatTelegraphs();
    }

    if (this._novaPulseVisual > 0) {
        this._novaPulseVisual = Math.max(0, this._novaPulseVisual - dt);
    }

    // Biome Elemental Infusion periodic abilities (Phase II+ Cross-Biome Leakage)
    if (this.biomeInfusion && this.aggroed && this.status.frozen <= 0 && this.status.petrified <= 0) {
        if (this.biomeInfusion === 'storm') {
            this._infusionSurgeTimer -= dt;
            if (this._infusionSurgeTimer <= 0) {
                this._infusionSurgeTimer = 4.5;
                if (playerDist > 110 && mode === 'HUNT') {
                    const stepD = Math.min(75, playerDist - 65);
                    const sAng = Math.atan2(playerY - this.y, playerX - this.x);
                    this.x += Math.cos(sAng) * stepD;
                    this.y += Math.sin(sAng) * stepD;
                    if (activeGame && activeGame.particles) {
                        for (let k = 0; k < 4; k++) _pushEntityParticle(activeGame, this.x, this.y, '#00eeff', false);
                    }
                }
            }
        } else if (this.biomeInfusion === 'holy' && activeGame && activeGame.enemies) {
            this._infusionMendTimer -= dt;
            if (this._infusionMendTimer <= 0) {
                this._infusionMendTimer = 3.5;
                let bestAlly = null;
                let bestDeficit = 0;
                for (const oe of activeGame.enemies) {
                    if (!oe || oe === this || oe.markedForDeletion || oe.retreatingForBoss || oe.hp >= oe.maxHp) continue;
                    if (Math.hypot(oe.x - this.x, oe.y - this.y) <= 220) {
                        const def = oe.maxHp - oe.hp;
                        if (def > bestDeficit) {
                            bestDeficit = def;
                            bestAlly = oe;
                        }
                    }
                }
                if (bestAlly) {
                    bestAlly.hp = Math.min(bestAlly.maxHp, bestAlly.hp + bestAlly.maxHp * 0.10);
                    if (activeGame.particles) {
                        for (let k = 0; k < 4; k++) _pushEntityParticle(activeGame, bestAlly.x, bestAlly.y, '#ffee88', false);
                    }
                }
            }
        }
    }

    // Elite Modifier behaviors (only when aggroed and not frozen/petrified)
    if (this.eliteModifiers && this.eliteModifiers.length > 0 && this.aggroed && this.status.frozen <= 0 && this.status.petrified <= 0) {
        if (this.eliteModifiers.includes('thermal_nova')) {
            this._novaTimer -= dt;
            if (this._novaTimer <= 0) {
                this._novaTimer = 4.0;
                this._novaTelegraphProg = 0;
                this._novaPulseVisual = 0.35;
                if (activeGame) {
                    if (activeGame.particles) {
                        for (let k = 0; k < 10; k++) _pushEntityParticle(activeGame, this.x, this.y, '#ff5522', false);
                    }
                    if (playerDist <= 110 + pRadius && typeof activeGame.handleDamageTaken === 'function' && activeGame.statManager) {
                        activeGame.handleDamageTaken(this.damage * 0.8, activeGame.statManager.getCurrentStats(), { sourceEnemy: this });
                    }
                }
            } else if (this._novaTimer <= 0.75) {
                this._novaTelegraphProg = Math.max(0, Math.min(1, 1 - this._novaTimer / 0.75));
            } else {
                this._novaTelegraphProg = 0;
            }
        }
        if (this.eliteModifiers.includes('phase_blink')) {
            this._blinkTimer -= dt;
            if (this._blinkTimer <= 0) {
                this._blinkTimer = 5.0;
                if (playerDist > 120 && !this._pendingBlink) {
                    const shift = Math.min(90, playerDist - 60);
                    const bAng = Math.atan2(playerY - this.y, playerX - this.x);
                    this._queueBlink(this.x + Math.cos(bAng) * shift, this.y + Math.sin(bAng) * shift, '#aa66ff', activeGame);
                }
            }
        }
        if (this.eliteModifiers.includes('gravity_tether') && activeGame && activeGame.player && playerDist > 20 && playerDist <= 180) {
            const pull = 35 * dt;
            activeGame.player.x += ((this.x - activeGame.player.x) / playerDist) * pull;
            activeGame.player.y += ((this.y - activeGame.player.y) / playerDist) * pull;
            const { minX = 0, minY = 0, w: pw, h: ph } = getWorldBounds(activeGame.canvas);
            const pr = activeGame.player.radius || 15;
            activeGame.player.x = Math.max(minX + pr + 10, Math.min(pw - pr - 10, activeGame.player.x));
            activeGame.player.y = Math.max(minY + pr + 10, Math.min(ph - pr - 10, activeGame.player.y));
            if (activeGame.world) {
                activeGame.world.resolveCircleWalls(activeGame.player);
                if (activeGame.world.resolveCircleChasms) activeGame.world.resolveCircleChasms(activeGame.player, (activeGame.phasingTimer || 0) > 0);
                if (activeGame.world.resolveForceGates) activeGame.world.resolveForceGates(activeGame.player);
            }
        }
        if (this.eliteModifiers.includes('siphon_field') && this.hp < this.maxHp) {
            this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.03 * dt);
        }
    }

    // Apply single movement and frame-rate independent knockback friction
    this.x += (this.vx + this.kbX) * dt;
    this.y += (this.vy + this.kbY) * dt;
    const kbDecay = Math.exp((this.isBoss ? -22 : -8) * dt);
    this.kbX *= kbDecay;
    this.kbY *= kbDecay;

    this._updatePendingBlink(dt, activeGame);

    // Boundary check for enemies
    const { minX = 0, minY = 0, w: arenaW, h: arenaH } = getWorldBounds(activeGame ? activeGame.canvas : null);
    if (!this.enteredArena && this.x >= minX && this.x <= arenaW && this.y >= minY && this.y <= arenaH) {
        this.enteredArena = true;
    }
    
    if (this.enteredArena) {
        this.x = Math.max(minX + this.radius, Math.min(arenaW - this.radius, this.x));
        this.y = Math.max(minY + this.radius, Math.min(arenaH - this.radius, this.y));
    } else {
        this.x = Math.max(minX - 100, Math.min(arenaW + 100, this.x));
        this.y = Math.max(minY - 100, Math.min(arenaH + 100, this.y));
    }

    if (activeGame && activeGame.world) {
        this._hitWallThisTick = false;
        if (activeGame.world.resolveCircleWalls(this)) this._hitWallThisTick = true;
        if (activeGame.world.resolveCircleChasms) activeGame.world.resolveCircleChasms(this, this.type === 'wraith');
        if (activeGame.world.resolveForceGates) activeGame.world.resolveForceGates(this);
        if (activeGame.world.resolveSanctumWard) activeGame.world.resolveSanctumWard(this);
    }

    // Handle DoT
    for (let i = this.dots.length - 1; i >= 0; i--) {
        const dot = this.dots[i];
        dot.timer -= dt;
        dot.tickTimer -= dt;
        while (dot.tickTimer <= 0) {
            this.takeDamage(dot.damage * dot.tickInterval, { isDot: true });
            dot.tickTimer += dot.tickInterval;
        }
        if (dot.timer <= 0) this.dots.splice(i, 1);
    }
    
    if (this.dots.some(d => d.type === "poison")) {
        this.color = '#00ff66';
    } else if (this.dots.some(d => d.type === "burn")) {
        this.color = '#ff6600';
    } else if (this.dots.some(d => d.type === "bleed")) {
        this.color = '#aa0000';
    } else {
        this.color = this.baseColor;
    }
  }

  draw(ctx) {
    if (this.isBossPylon) {
        ctx.save();
        if (this.parentBoss && !this.parentBoss.markedForDeletion) {
            ctx.strokeStyle = '#00eeff';
            ctx.globalAlpha = 0.52;
            ctx.lineWidth = 2;
            if (ctx.setLineDash) ctx.setLineDash([6, 5]);
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.parentBoss.x, this.parentBoss.y);
            ctx.stroke();
            if (ctx.setLineDash) ctx.setLineDash([]);
        }
        ctx.translate(this.x, this.y);
        const pRot = Date.now() * 0.003;
        ctx.rotate(pRot);
        const pr = this.radius || 18;
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#00eeff';
        const hr = pr + 5;
        ctx.beginPath();
        ctx.moveTo(0, -hr);
        ctx.lineTo(hr * 0.78, 0);
        ctx.lineTo(0, hr);
        ctx.lineTo(-hr * 0.78, 0);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = 0.92;
        ctx.fillStyle = '#00eeff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -pr);
        ctx.lineTo(pr * 0.78, 0);
        ctx.lineTo(0, pr);
        ctx.lineTo(-pr * 0.78, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.rotate(-pRot);
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#aaf8ff';
        ctx.fillText('AEGIS PYLON', 0, -pr - 8);
        ctx.restore();
        return;
    }

    // Draw Shield
        if (this.type === 'shieldbearer' && this.shieldCapacity > 0) {
            ctx.beginPath();
            const spread = (Math.PI/4) * this.shieldCapacity;
            ctx.arc(this.x, this.y, this.radius + 5, this.shieldAngle - spread, this.shieldAngle + spread);
            ctx.strokeStyle = `rgba(68, 68, 255, ${0.2 + 0.8 * this.shieldCapacity})`;
            ctx.lineWidth = 4;
            ctx.stroke();
        }
    // Draw Aura
    if (this.type === 'commander') {
        ctx.beginPath();
        ctx.arc(this.x, this.y, 250, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255, 0, 255, 0.1)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 0, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    
    // Draw Orbits
    if (this.type === 'sentinel') {
        for(let i=0; i<3; i++) {
            const angle = this.orbitAngle + (Math.PI * 2 / 3) * i;
            const ox = this.x + Math.cos(angle) * (this.radius + 15);
            const oy = this.y + Math.sin(angle) * (this.radius + 15);
            ctx.beginPath();
            ctx.arc(ox, oy, 5, 0, Math.PI*2);
            ctx.fillStyle = '#ff0000';
            ctx.fill();
        }
    }

    // Custom shape drawing based on type
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.facingAngle);
    let hitPulseFrac = 0;
    if (this._hitPulseTimer > 0) {
        hitPulseFrac = Math.max(0, Math.min(1, this._hitPulseTimer / 0.09));
        const popScale = 1 + 0.14 * hitPulseFrac;
        if (ctx.scale) ctx.scale(popScale, popScale);
    }
    if (this.retreatingForBoss) {
        ctx.globalAlpha = Math.max(0.05, Math.min(1, (this.retreatTimer || 0) / 1.25));
    } else if (this.aggroed === false) {
        ctx.globalAlpha = 0.76;
    }

    const bodyCol = this.hitFlashTimer > 0 ? '#ffffff' : this.color;
    const baseAlpha = Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1;
    ctx.beginPath();

    const drawPolygon = (sides, r) => {
        for (let i = 0; i < sides; i++) {
            const angle = (i * 2 * Math.PI) / sides;
            ctx.lineTo(r * Math.cos(angle), r * Math.sin(angle));
        }
        ctx.closePath();
    };

    const drawStar = (points, outerRadius, innerRadius) => {
        let rot = Math.PI / 2 * 3;
        const step = Math.PI / points;
        for (let i = 0; i < points; i++) {
            ctx.lineTo(Math.cos(rot) * outerRadius, Math.sin(rot) * outerRadius);
            rot += step;
            ctx.lineTo(Math.cos(rot) * innerRadius, Math.sin(rot) * innerRadius);
            rot += step;
        }
        ctx.closePath();
    };

    const r = this.radius;
    
    const constructPath = () => {
        switch (this.type) {
            case 'grunt':
                ctx.rect(-r, -r, r * 2, r * 2);
                break;
            case 'brute':
                drawPolygon(8, r);
                break;
            case 'ranger':
                ctx.moveTo(r, 0);
                ctx.lineTo(-r, -r);
                ctx.lineTo(-r, r);
                ctx.closePath();
                break;
            case 'rogue':
                ctx.moveTo(r, 0);
                ctx.lineTo(0, -r/2);
                ctx.lineTo(-r, 0);
                ctx.lineTo(0, r/2);
                ctx.closePath();
                break;
            case 'golem':
                if (ctx.roundRect) {
                    ctx.roundRect(-r, -r, r * 2, r * 2, r/3);
                } else {
                    ctx.rect(-r, -r, r * 2, r * 2);
                }
                break;
            case 'zergling':
                ctx.moveTo(r, 0);
                ctx.lineTo(-r/2, -r/2);
                ctx.lineTo(-r/4, 0);
                ctx.lineTo(-r/2, r/2);
                ctx.closePath();
                break;
            case 'shieldbearer':
                ctx.arc(0, 0, r, -Math.PI/2, Math.PI/2);
                ctx.lineTo(-r, 0);
                ctx.closePath();
                break;
            case 'medic':
                ctx.moveTo(-r/3, -r); ctx.lineTo(r/3, -r);
                ctx.lineTo(r/3, -r/3); ctx.lineTo(r, -r/3);
                ctx.lineTo(r, r/3); ctx.lineTo(r/3, r/3);
                ctx.lineTo(r/3, r); ctx.lineTo(-r/3, r);
                ctx.lineTo(-r/3, r/3); ctx.lineTo(-r, r/3);
                ctx.lineTo(-r, -r/3); ctx.lineTo(-r/3, -r/3);
                ctx.closePath();
                break;
            case 'commander':
                drawStar(5, r, r/2);
                break;
            case 'hive':
                drawPolygon(6, r);
                break;
            case 'artillery':
                ctx.moveTo(r, -r/2);
                ctx.lineTo(-r, -r);
                ctx.lineTo(-r, r);
                ctx.lineTo(r, r/2);
                ctx.closePath();
                break;
            case 'kamikaze':
                drawStar(8, r, r/3);
                break;
            case 'wraith':
                ctx.moveTo(0, -r);
                ctx.quadraticCurveTo(r, 0, 0, r);
                ctx.quadraticCurveTo(-r, 0, 0, -r);
                break;
            case 'sentinel':
                ctx.moveTo(-r, 0);
                ctx.quadraticCurveTo(0, -r, r, 0);
                ctx.quadraticCurveTo(0, r, -r, 0);
                break;
            case 'slime':
            case 'minislime':
                const time = Date.now() / 150;
                for (let i = 0; i < 8; i++) {
                    const angle = (i * 2 * Math.PI) / 8;
                    const wave = Math.sin(angle * 3 + time) * (r * 0.2);
                    ctx.lineTo((r + wave) * Math.cos(angle), (r + wave) * Math.sin(angle));
                }
                ctx.closePath();
                break;
            default:
                ctx.arc(0, 0, r, 0, Math.PI * 2);
        }
    };

    constructPath();
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth = this.aggroed === false ? 4 : 7;
    ctx.globalAlpha = baseAlpha * (this.aggroed === false ? 0.16 : 0.24);
    ctx.stroke();

    ctx.globalAlpha = baseAlpha;
    ctx.strokeStyle = 'rgba(2, 6, 16, 0.90)';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    ctx.fillStyle = bodyCol;
    ctx.fill();

    if (hitPulseFrac > 0 && this._lastHitWasCrit) {
        ctx.lineWidth = 2.6;
        ctx.strokeStyle = '#ffee66';
        ctx.stroke();
    }

    // Elites and Bosses enhancements
    if (this.isElite || this.isBoss) {
        ctx.lineWidth = this.isBoss ? 4 : 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        
        if (this.isBoss) {
            ctx.beginPath();
            ctx.scale(0.5, 0.5);
            ctx.fillStyle = '#ffffff';
            constructPath();
            ctx.fill();
        }
    }

    ctx.restore();

    // Outer Crit-Rim halo during hit pulse
    if (hitPulseFrac > 0 && this._lastHitWasCrit) {
        ctx.save();
        ctx.strokeStyle = '#ffee66';
        ctx.lineWidth = 2.0;
        ctx.globalAlpha = 0.85 * hitPulseFrac;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * (1 + 0.14 * hitPulseFrac) + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
    
    // Draw buff indicator
    if (this.buffs.damageTimer > 0) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Barrier Matrix cyan outer shield ring
    if (this.matrixShield > 0 && this.maxMatrixShield > 0) {
        const pct = Math.max(0.15, Math.min(1, this.matrixShield / this.maxMatrixShield));
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
        ctx.strokeStyle = '#00ddff';
        ctx.globalAlpha = 0.24;
        ctx.lineWidth = 6;
        ctx.stroke();

        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = '#aaeeff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
    }

    // Biome Elemental Infusion aura (Phase II+ cross-biome leakage)
    if (this.biomeInfusion && !this.retreatingForBoss) {
        const infusionColors = {
            fire: '#ff4422',
            frost: '#44aaff',
            storm: '#00eeff',
            toxin: '#33ff66',
            blood: '#ff0055',
            holy: '#ffee88',
            earth: '#cc8844'
        };
        const infCol = infusionColors[this.biomeInfusion] || '#ffffff';
        ctx.save();
        ctx.globalAlpha = 0.78;
        ctx.strokeStyle = infCol;
        ctx.lineWidth = 2;
        if (ctx.setLineDash) ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.restore();
    }

    // Brute Charge-Korridor / Rogue Lunge Telegraph (dashed vector + pulse ring)
    if (!this.isBoss && (this.type === 'brute' || this.type === 'rogue') && (this._chargeTelegraphProg || 0) > 0 && !this.retreatingForBoss) {
        const prog = Math.max(0, Math.min(1, this._chargeTelegraphProg));
        const isLocked = this._chargeLockAngle != null || prog >= (0.50 / 0.65);
        const vecLen = this.type === 'brute' ? 250 : 190;
        const ang = Number.isFinite(this.facingAngle) ? this.facingAngle : 0;
        const endX = this.x + Math.cos(ang) * vecLen;
        const endY = this.y + Math.sin(ang) * vecLen;
        const tCol = isLocked
            ? (this.type === 'rogue' ? '#00ffff' : '#ffdd55')
            : (this.type === 'rogue' ? '#22ddff' : '#ff4433');
        ctx.save();
        ctx.strokeStyle = tCol;
        ctx.lineWidth = isLocked ? 3.2 : 2.2;
        ctx.globalAlpha = 0.55 + 0.40 * prog;
        if (ctx.setLineDash) ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        // Charge progress fill line & pulse perimeter ring
        ctx.lineWidth = isLocked ? 4.0 : 2.6;
        ctx.globalAlpha = 0.38 + 0.48 * prog;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + Math.cos(ang) * (vecLen * prog), this.y + Math.sin(ang) * (vecLen * prog));
        ctx.stroke();
        const pulseR = this.radius + 6 + (1 - prog) * 10;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(this.x, this.y, pulseR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // Ranged Aim-Lock Telegraph (Ranger/Sentinel/Commander laser line + muzzle charge, Artillery launch arc)
    if (!this.isBoss && !this.retreatingForBoss && (this._fireTelegraphProg || 0) > 0) {
        const prog = Math.max(0, Math.min(1, this._fireTelegraphProg));
        const isLocked = this._fireLockAngle !== null && Number.isFinite(this._fireLockAngle);
        const aimAng = isLocked
            ? this._fireLockAngle
            : (Number.isFinite(this._firePreviewAngle)
                ? this._firePreviewAngle
                : (Number.isFinite(this.facingAngle) ? this.facingAngle : 0));

        if (this.type === 'ranger' || this.type === 'sentinel' || this.type === 'commander') {
            const beamLen = this.type === 'commander' ? 440 : (this.type === 'ranger' ? 380 : 320);
            const muzX = this.x + Math.cos(aimAng) * (this.radius + 2);
            const muzY = this.y + Math.sin(aimAng) * (this.radius + 2);
            const endX = this.x + Math.cos(aimAng) * beamLen;
            const endY = this.y + Math.sin(aimAng) * beamLen;
            const baseTelCol = this.type === 'commander' ? '#ff44ff' : (this.type === 'ranger' ? '#ffee55' : '#ff5577');
            const lockTelCol = this.type === 'commander' ? '#ff66ff' : (this.type === 'ranger' ? '#ffee66' : '#ff3355');

            ctx.save();
            if (!isLocked) {
                ctx.strokeStyle = baseTelCol;
                ctx.lineWidth = 1.4 + 0.6 * prog;
                ctx.globalAlpha = 0.40 + 0.35 * prog;
                if (ctx.setLineDash) ctx.setLineDash([9, 6]);
                ctx.beginPath();
                ctx.moveTo(muzX, muzY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
                if (ctx.setLineDash) ctx.setLineDash([]);
            } else {
                if (ctx.setLineDash) ctx.setLineDash([]);
                ctx.strokeStyle = lockTelCol;
                ctx.lineWidth = 2.6;
                ctx.globalAlpha = 0.88;
                ctx.beginPath();
                ctx.moveTo(muzX, muzY);
                ctx.lineTo(endX, endY);
                ctx.stroke();

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.0;
                ctx.globalAlpha = 0.94;
                ctx.beginPath();
                ctx.moveTo(muzX, muzY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            }

            const chargeR = Math.max(2.5, (1 - prog) * 9 + 3);
            ctx.strokeStyle = isLocked ? '#ffffff' : baseTelCol;
            ctx.lineWidth = isLocked ? 2.0 : 1.5;
            ctx.globalAlpha = 0.55 + 0.40 * prog;
            ctx.beginPath();
            ctx.arc(muzX, muzY, chargeR, 0, Math.PI * 2);
            ctx.stroke();

            if (isLocked) {
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = 0.95;
                ctx.beginPath();
                ctx.arc(muzX, muzY, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        } else if (this.type === 'artillery') {
            const tx = Number.isFinite(this._fireLockTargetX)
                ? this._fireLockTargetX
                : (Number.isFinite(this._firePreviewTargetX)
                    ? this._firePreviewTargetX
                    : (this.x + Math.cos(aimAng) * 220));
            const ty = Number.isFinite(this._fireLockTargetY)
                ? this._fireLockTargetY
                : (Number.isFinite(this._firePreviewTargetY)
                    ? this._firePreviewTargetY
                    : (this.y + Math.sin(aimAng) * 220));
            const arcDist = Math.hypot(tx - this.x, ty - this.y);
            const midX = (this.x + tx) * 0.5;
            const arcLift = Math.max(36, Math.min(95, arcDist * 0.28));
            const midY = (this.y + ty) * 0.5 - arcLift;

            ctx.save();
            ctx.strokeStyle = isLocked ? '#ffcc66' : '#ff8822';
            ctx.lineWidth = isLocked ? 2.4 : 1.7;
            ctx.globalAlpha = 0.45 + 0.45 * prog;
            if (!isLocked && ctx.setLineDash) ctx.setLineDash([7, 5]);
            else if (ctx.setLineDash) ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            if (ctx.quadraticCurveTo) {
                ctx.quadraticCurveTo(midX, midY, tx, ty);
            } else {
                ctx.lineTo(tx, ty);
            }
            ctx.stroke();
            if (ctx.setLineDash) ctx.setLineDash([]);

            const preR = 14 + (1 - prog) * 16;
            ctx.strokeStyle = isLocked ? '#ffffff' : '#ffaa44';
            ctx.lineWidth = isLocked ? 2.0 : 1.5;
            ctx.globalAlpha = 0.50 + 0.42 * prog;
            ctx.beginPath();
            ctx.arc(tx, ty, preR, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = isLocked ? '#ffffff' : '#ff8822';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 4 + (1 - prog) * 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    // Kamikaze Proximity Fuse & 90px Blast Preview Ring
    if (!this.isBoss && !this.retreatingForBoss && this.type === 'kamikaze' && (this._fuseWarningFrac || 0) > 0) {
        const frac = Math.max(0, Math.min(1, this._fuseWarningFrac));
        const blastR = 90;
        const armPulse = 0.72 + 0.28 * Math.sin(frac * Math.PI * 5);
        ctx.save();
        ctx.strokeStyle = frac > 0.65 ? '#ffaa33' : '#ff6600';
        ctx.lineWidth = 1.6 + 1.2 * frac;
        ctx.globalAlpha = (0.30 + 0.50 * frac) * armPulse;
        if (ctx.setLineDash) ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.arc(this.x, this.y, blastR, 0, Math.PI * 2);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);

        const innerR = Math.max(this.radius + 4, blastR * frac);
        ctx.strokeStyle = frac > 0.75 ? '#ffffff' : '#ffcc44';
        ctx.lineWidth = 1.8;
        ctx.globalAlpha = 0.45 + 0.45 * frac;
        ctx.beginPath();
        ctx.arc(this.x, this.y, innerR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ff5500';
        ctx.globalAlpha = 0.06 + 0.14 * frac;
        ctx.beginPath();
        ctx.arc(this.x, this.y, innerR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Thermal Nova pre-windup danger ring (110px)
    if ((this._novaTelegraphProg || 0) > 0 && !this.retreatingForBoss) {
        const prog = Math.max(0, Math.min(1, this._novaTelegraphProg));
        ctx.save();
        ctx.strokeStyle = '#ff5522';
        ctx.lineWidth = 2.2;
        ctx.globalAlpha = 0.48 + 0.45 * prog;
        if (ctx.setLineDash) ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.arc(this.x, this.y, 110, 0, Math.PI * 2);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.fillStyle = '#ff5522';
        ctx.globalAlpha = 0.10 + 0.18 * prog;
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(6, 110 * prog), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Pending Wraith / Phase-Blink arrival rift target reticle
    if (this._pendingBlink && !this.retreatingForBoss) {
        const b = this._pendingBlink;
        const prog = 1 - Math.max(0, Math.min(1, (b.timer || 0) / Math.max(0.05, b.maxTimer || 0.40)));
        const rr = (this.radius + 14) * (1 - prog * 0.55) + 6;
        const bCol = b.color || '#aa66ff';
        ctx.save();
        ctx.strokeStyle = bCol;
        ctx.lineWidth = 2.0;
        ctx.globalAlpha = 0.48 + 0.44 * prog;
        if (ctx.setLineDash) ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(b.tx, b.ty);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(b.tx, b.ty, rr, 0, Math.PI * 2);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(b.tx - 10, b.ty);
        ctx.lineTo(b.tx + 10, b.ty);
        ctx.moveTo(b.tx, b.ty - 10);
        ctx.lineTo(b.tx, b.ty + 10);
        ctx.stroke();
        ctx.restore();
    }

    // Thermal Nova fiery pulse visual
    if (this._novaPulseVisual > 0) {
        const prog = 1 - Math.max(0, this._novaPulseVisual / 0.35);
        ctx.save();
        ctx.globalAlpha = Math.max(0.1, 0.75 * (1 - prog));
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(4, 110 * prog), 0, Math.PI * 2);
        ctx.strokeStyle = '#ff5522';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
    }

    // Gravity Tether subtle range ring
    if (this.aggroed && this.eliteModifiers && this.eliteModifiers.includes('gravity_tether')) {
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.strokeStyle = '#ff44cc';
        ctx.lineWidth = 1.2;
        if (ctx.setLineDash) ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.arc(this.x, this.y, 180, 0, Math.PI * 2);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.restore();
    }

    // Architect Boss aura & Tactical Boss Visuals
    if (this.isBoss) {
        if ((this._activePylonCount || 0) > 0) {
            ctx.save();
            ctx.strokeStyle = '#00eeff';
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.78;
            if (ctx.setLineDash) ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 14, 0, Math.PI * 2);
            ctx.stroke();
            if (ctx.setLineDash) ctx.setLineDash([]);
            ctx.restore();
        }
        if (this.hasDirectionalArmor && (this.exposedTimer || 0) <= 0) {
            ctx.save();
            // Front Aegis Crescent (0.65x frontal dmg)
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 5;
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 8, this.facingAngle - 0.85, this.facingAngle + 0.85);
            ctx.stroke();

            // Rear Weakspot Core (1.60x rear flanking dmg)
            const rearAng = this.facingAngle + Math.PI;
            const wx = this.x + Math.cos(rearAng) * (this.radius + 8);
            const wy = this.y + Math.sin(rearAng) * (this.radius + 8);
            ctx.strokeStyle = '#00ffaa';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 8, rearAng - 0.65, rearAng + 0.65);
            ctx.stroke();
            ctx.fillStyle = '#00ffaa';
            ctx.beginPath();
            ctx.arc(wx, wy, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        if (this._bossEnraged) {
            ctx.save();
            ctx.strokeStyle = '#ff2255';
            ctx.lineWidth = 2.5;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 10, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        if ((this.exposedTimer || 0) > 0) {
            ctx.save();
            ctx.strokeStyle = '#00ffaa';
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.92;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 13, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#00ffaa';
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('EXPOSED x1.85!', this.x, this.y - this.radius - 16);
            ctx.restore();
        }
    }
    if (this.isArchitectBoss) {
        ctx.save();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 14, 0, Math.PI * 2);
        ctx.stroke();
        const barW = 84;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(this.x - barW / 2, this.y - this.radius - 26, barW, 6);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(this.x - barW / 2, this.y - this.radius - 26, barW * Math.max(0, Math.min(1, this.hp / this.maxHp)), 6);
        ctx.restore();
    }

    // Elite modifier pips
    if (this.eliteModifiers && this.eliteModifiers.length > 0) {
        const modColorFallback = {
            thermal_nova: '#ff5522',
            phase_blink: '#aa66ff',
            barrier_matrix: '#00ddff',
            gravity_tether: '#ff44cc',
            siphon_field: '#ff2255',
            split_lattice: '#66ff88'
        };
        const defs = (typeof NeonSystems !== 'undefined' && NeonSystems && NeonSystems.ELITE_MODIFIER_DEFS)
            ? NeonSystems.ELITE_MODIFIER_DEFS
            : null;
        const count = this.eliteModifiers.length;
        const spacing = 9;
        const startX = this.x - ((count - 1) * spacing) / 2;
        const pipY = this.y - this.radius - 11;
        ctx.save();
        for (let k = 0; k < count; k++) {
            const mId = this.eliteModifiers[k];
            const col = (defs && defs[mId] && defs[mId].color) ? defs[mId].color : (modColorFallback[mId] || '#ffffff');
            ctx.beginPath();
            ctx.arc(startX + k * spacing, pipY, 3.2, 0, Math.PI * 2);
            ctx.fillStyle = col;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        ctx.restore();
    }

    // Compact HP & Matrix Shield bar for damaged enemies & elites
    if (!this.isBoss && !this.isArchitectBoss && !this.retreatingForBoss && (this.hp < this.maxHp || this.isElite || (this.matrixShield > 0 && this.maxMatrixShield > 0))) {
        const bw = this.isElite ? Math.max(30, this.radius * 2) : Math.max(22, this.radius * 1.6);
        const bx = this.x - bw / 2;
        const by = this.y + this.radius + 7;
        const hpRatio = Math.max(0, Math.min(1, (this.hp || 0) / Math.max(1, this.maxHp || 1)));
        ctx.save();
        ctx.fillStyle = 'rgba(5, 8, 18, 0.84)';
        ctx.fillRect(bx, by, bw, 3.5);
        ctx.fillStyle = this.isElite ? '#ff44ff' : '#ff3b5c';
        ctx.fillRect(bx, by, bw * hpRatio, 3.5);
        if (this.maxMatrixShield > 0 && this.matrixShield > 0) {
            const shRatio = Math.max(0, Math.min(1, this.matrixShield / this.maxMatrixShield));
            ctx.fillStyle = '#00eeff';
            ctx.fillRect(bx, by + 4, bw * shRatio, 2);
        }
        ctx.restore();
    }

    // Signal Courier pulsing gold halo & escape timer
    if (this.isCourier) {
        ctx.save();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2.4;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`COURIER ${Math.max(1, Math.ceil(this.courierLife || 0))}s`, this.x, this.y - this.radius - 16);
        ctx.restore();
    }

    // Nemesis Rival crimson-gold double crown halo
    if (this.isNemesis) {
        ctx.save();
        ctx.strokeStyle = '#ff2255';
        ctx.lineWidth = 2.6;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`NEMESIS // ${this.nemesisCallsign || 'RIVAL'}`, this.x, this.y - this.radius - 19);
        ctx.restore();
    }

    // Draw aggro alert mark
    if (this.aggroAlertTimer > 0) {
        ctx.save();
        ctx.fillStyle = '#ff3366';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('!', this.x, this.y - this.radius - (this.eliteModifiers && this.eliteModifiers.length > 0 ? 22 : 10));
        ctx.restore();
    }
  }
  
  applyDot(damage, duration, type = "poison") {
    // Immume check done in game.js before calling this, but safe check here too
    if (this.type === 'golem' && type !== 'bleed' && type !== 'burn') return; // Burn exception handled via avatarOfFire logic in game.js
    const cap = type === 'bleed' ? 10 : 5;
    let count = 0;
    let lowest = null;
    for (const d of this.dots) {
      if (d.type === type) {
        count++;
        if (!lowest || d.timer < lowest.timer) {
          lowest = d;
        }
      }
    }
    if (count >= cap && lowest) {
      lowest.timer = Math.max(lowest.timer, duration);
      lowest.damage = Math.max(lowest.damage, damage);
      return;
    }
    this.dots.push({ damage, timer: duration, tickTimer: 0.5, tickInterval: 0.5, type });
  }
  
  takeDamage(amount, options = null) {
    if (!this.aggroed) {
      this.triggerAggro((typeof game !== 'undefined' && game) ? game : globalThis.game, true);
    }
    let finalDamage = amount;
    if (this.isBoss && (this._activePylonCount || 0) > 0 && !(options && options.bypassPylonShield)) {
      finalDamage *= 0.30;
    }
    if ((this.exposedTimer || 0) > 0) {
      finalDamage *= 1.85;
    }
    const pen = (options && options.ignoreShieldAndResist > 0) ? Math.min(0.65, options.ignoreShieldAndResist) : 0;
    if (this._infusionDmgResist > 0) finalDamage *= (1 - this._infusionDmgResist * (1 - pen));
    if (this.status.shocked > 0) finalDamage *= 1.2; 
    if (this.status.petrified > 0) finalDamage *= 1.5;
    
    if (globalThis.game) {
        globalThis.game.frameDamageDealt = (globalThis.game.frameDamageDealt || 0) + finalDamage;
    }

    if (amount > 0 && !(options && options.isDot)) {
        const wasPulsing = this._hitPulseTimer > 0;
        this._hitPulseTimer = 0.09;
        this._lastHitWasCrit = Boolean(options && options.isCrit) || (wasPulsing && this._lastHitWasCrit);
        if (options && Number.isFinite(options.hitAngle)) {
            this._lastHitAngle = options.hitAngle;
        }
    }

    if (this.matrixShield > 0) {
        const shieldBypass = pen > 0 ? finalDamage * pen : 0;
        const shieldAbsorb = finalDamage - shieldBypass;
        if (this.matrixShield >= shieldAbsorb) {
            this.matrixShield -= shieldAbsorb;
            finalDamage = shieldBypass;
            if (finalDamage <= 0) return;
        } else {
            finalDamage = (shieldAbsorb - this.matrixShield) + shieldBypass;
            this.matrixShield = 0;
        }
    }
    
    this.hp -= finalDamage;
    this.hitFlashTimer = 0.08;
    if (this.hp <= 0) {
      this.markedForDeletion = true;
    }
  }
}

class EnemyProjectile extends Entity {
    constructor(x, y, vx, vy, damage, isLobbed = false, targetX = 0, targetY = 0, customRadius = null, customColor = null, maxRange = 1500) {
        super(x, y, customRadius || (isLobbed ? 8 : 5), customColor || (isLobbed ? '#aa5500' : '#ff0000'));
        this.vx = vx;
        this.vy = vy;
        this.damage = damage;
        this.isLobbed = isLobbed;
        this.targetX = targetX;
        this.targetY = targetY;
        this.maxRange = maxRange;
        this.lifeTime = 0;
        this.distanceTraveled = 0;
    }
    update(dt, game) {
        this.lifeTime += dt;
        
        if (this.isLobbed) {
            // Arc logic simplified - speed approaches target
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.hypot(dx, dy);
            
            // Visual sizing effect to simulate arcing
            this.radius = 8 + Math.sin(Math.min(1, this.lifeTime / 1.5) * Math.PI) * 10;
            
            if (dist < 12 || this.lifeTime >= 1.5) {
                this.markedForDeletion = true;
                // Heavy artillery blast + corrosive fallout pool
                if (game && game.enemyExplosions && typeof EnemyExplosion !== 'undefined') {
                    game.enemyExplosions.push(new EnemyExplosion(this.x, this.y, 72, this.damage * 0.55));
                }
                if (game && game.enemyAcidPools && typeof EnemyAcidPool !== 'undefined') {
                    game.enemyAcidPools.push(new EnemyAcidPool(this.x, this.y, 54, this.damage * 0.65));
                }
                return;
            }
        }
        
        const moveDist = Math.hypot(this.vx * dt, this.vy * dt);
        this.distanceTraveled += moveDist;
        super.update(dt);

        const { minX = 0, minY = 0, w: worldW, h: worldH } = getWorldBounds(game ? game.canvas : null);
        const hitWorldWall = game && game.world && !this.isLobbed && game.world.hitWall(this.x, this.y, this.radius);
        if (hitWorldWall || this.x < minX || this.x > worldW || this.y < minY || this.y > worldH || this.distanceTraveled > (this.maxRange || 1500)) {
            this.markedForDeletion = true;
        }
    }
    draw(ctx) {
        if (this.isLobbed && Number.isFinite(this.targetX) && Number.isFinite(this.targetY)) {
            const prog = Math.max(0, Math.min(1, (this.lifeTime || 0) / 1.5));
            const impactR = 72;
            const ringCol = this.color || '#aa5500';
            ctx.save();
            ctx.strokeStyle = ringCol;
            ctx.lineWidth = 2.0;
            ctx.globalAlpha = 0.55 + 0.35 * prog;
            if (ctx.setLineDash) ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.arc(this.targetX, this.targetY, impactR, 0, Math.PI * 2);
            ctx.stroke();
            if (ctx.setLineDash) ctx.setLineDash([]);

            ctx.fillStyle = ringCol;
            ctx.globalAlpha = 0.10 + 0.16 * prog;
            ctx.beginPath();
            ctx.arc(this.targetX, this.targetY, Math.max(3, impactR * prog), 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ffaa44';
            ctx.lineWidth = 1.6;
            ctx.globalAlpha = 0.65 + 0.30 * prog;
            ctx.beginPath();
            ctx.arc(this.targetX, this.targetY, Math.max(3, impactR * prog), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        ctx.save();
        const r = Math.max(4, this.radius || 5);
        ctx.beginPath();
        ctx.arc(this.x, this.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = this.color || '#ff3344';
        ctx.globalAlpha = 0.28;
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fillStyle = this.color || '#ff3344';
        ctx.fill();
        ctx.strokeStyle = 'rgba(2, 6, 16, 0.85)';
        ctx.lineWidth = 1.3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(2, r * 0.45), 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
    }
}

class EnemyExplosion extends Entity {
    constructor(x, y, radius, damage) {
        super(x, y, radius, 'rgba(255, 100, 0, 0.45)');
        this.damage = damage;
        this.life = 0.45;
        this.maxLife = 0.45;
        this.hasDamaged = false;
    }
    update(dt, game) {
        this.life -= dt;
        if (!this.hasDamaged && this.life <= 0.12) {
            this.hasDamaged = true;
            // Damage player
            const dist = Math.hypot(game.player.x - this.x, game.player.y - this.y);
            if (dist < this.radius + game.player.radius) {
                game.handleDamageTaken(this.damage, game.statManager.getCurrentStats(), { sourceX: this.x, sourceY: this.y });
            }
        }
        if (this.life <= 0) this.markedForDeletion = true;
    }
    draw(ctx) {
        const maxL = this.maxLife || 0.45;
        const detWindow = Math.max(0.05, maxL - 0.12);
        const preDetProg = Math.max(0, Math.min(1, (maxL - Math.max(0.12, this.life)) / detWindow));
        const pulse = 0.75 + 0.25 * Math.sin(preDetProg * Math.PI * 6);
        ctx.save();
        if (!this.hasDamaged && this.life > 0.12) {
            ctx.strokeStyle = '#ff6600';
            ctx.lineWidth = 2.4;
            ctx.globalAlpha = 0.72 + 0.25 * preDetProg;
            if (ctx.setLineDash) ctx.setLineDash([8, 5]);
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.stroke();
            if (ctx.setLineDash) ctx.setLineDash([]);

            ctx.fillStyle = '#ff5500';
            ctx.globalAlpha = (0.14 + 0.24 * preDetProg) * pulse;
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(2, this.radius * preDetProg), 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ffcc44';
            ctx.lineWidth = 1.8;
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(2, this.radius * preDetProg), 0, Math.PI * 2);
            ctx.stroke();
        } else {
            const fade = Math.max(0, Math.min(1, this.life / 0.12));
            ctx.fillStyle = '#ffaa44';
            ctx.globalAlpha = 0.35 * fade;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.6;
            ctx.globalAlpha = 0.85 * fade;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * (1 + (1 - fade) * 0.12), 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }
}

class EnemyAcidPool extends Entity {
    constructor(x, y, radius, damage, life = 5.0, customColor = null) {
        super(x, y, radius, customColor || '#aa5500');
        this.damage = damage;
        this.life = life;
        this.maxLife = life;
    }
    update(dt, game) {
        this.life -= dt;
        if (this.life <= 0) {
            this.markedForDeletion = true;
            return;
        }
        const stats = game.statManager.getCurrentStats();
        if (stats.specialEffects && stats.specialEffects.chaosInoculation) return;
        const dist = Math.hypot(game.player.x - this.x, game.player.y - this.y);
        if (dist < this.radius + game.player.radius) {
            game.handleDamageTaken(this.damage * dt, stats, { isHazard: true });
        }
    }
    draw(ctx) {
        const fade = Math.max(0.18, Math.min(1, this.life / Math.max(0.5, this.maxLife || 5)));
        ctx.save();
        ctx.globalAlpha = 0.28 * fade;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color || '#aa5500';
        ctx.fill();
        ctx.globalAlpha = 0.72 * fade;
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.color || '#ff7722';
        ctx.stroke();
        ctx.restore();
    }
}


class Projectile extends Entity {
  constructor(x, y, vx, vy, stats, isOrbiting = false, orbitAngle = 0, element = 'none') {
    super(x, y, 4, '#00ff66');
    this.vx = vx;
    this.vy = vy;
    this.element = element;
    
    // Copy stats
    this.stats = stats;
    this.baseDamage = stats.damage;
    this.damage = stats.damage;
    this.pierceDamageMult = 1.0;
    this.pierce = stats.pierce;
    this.bounce = stats.bounce;
    this.specialEffects = stats.specialEffects || {};
    this.projectileSpeed = stats.projectileSpeed;
    
    // Trajectory Tracking
    this.distanceTraveled = 0;
    this.lifeTime = 0;
    
    // Orbiting
    this.isOrbiting = isOrbiting;
    this.orbitAngle = orbitAngle;
    
    // States
    this.returned = false;
    this.isSplitChild = false;
    this.piercedEnemies = new Set();
    this.enemyHitCounts = new Map();
    this.lastX = x;
    this.lastY = y;
  }

  update(dt, canvas, player, enemiesOrBroadphase, scratchOut = _entityQueryScratch) {
    this.lifeTime += dt;
    
    if (this.isOrbiting) {
        const radius = 100 + (this.specialEffects.orbiting?.level || 1) * 20;
        const speed = 2 + (this.specialEffects.orbiting?.level || 1) * 0.5;
        this.orbitAngle += dt * speed;
        this.x = player.x + Math.cos(this.orbitAngle) * radius;
        this.y = player.y + Math.sin(this.orbitAngle) * radius;
        
        // Reset pierced enemies every second so it can hit again
        if (!this.orbitHitTimer) this.orbitHitTimer = 0;
        this.orbitHitTimer += dt;
        if (this.orbitHitTimer >= 1.0) {
            this.orbitHitTimer = 0;
            this.piercedEnemies.clear();
        }
        return; // Skip standard movement
    }

    // Accelerant Perk
    if (this.specialEffects.accelerant) {
        this.projectileSpeed += 280 * dt;
        const mag = Math.hypot(this.vx, this.vy);
        if (mag > 0) {
            this.vx = (this.vx / mag) * this.projectileSpeed;
            this.vy = (this.vy / mag) * this.projectileSpeed;
        }
    }

    const { minX = 0, minY = 0, w: worldW, h: worldH, g: activeGame } = getWorldBounds(canvas);

    // Homing Perk
    const isBp = _isBroadphase(enemiesOrBroadphase);
    const hasEnemies = isBp
      ? ((enemiesOrBroadphase.sourceLen || 0) > 0)
      : Boolean(enemiesOrBroadphase && enemiesOrBroadphase.length > 0);
    if (this.specialEffects.homing && hasEnemies) {
        const homingList = isBp
          ? enemiesOrBroadphase.queryRadiusInto(this.x, this.y, 350, scratchOut || _entityQueryScratch, false)
          : enemiesOrBroadphase;
        let nearest = null;
        let minDist = Infinity;
        for (const e of homingList) {
            if (e.markedForDeletion || e.x < minX || e.x > worldW || e.y < minY || e.y > worldH) continue;
            const dist = Math.hypot(e.x - this.x, e.y - this.y);
            if (dist < minDist && dist < 350) {
                minDist = dist;
                nearest = e;
            }
        }
        if (nearest) {
            const desiredVx = nearest.x - this.x;
            const desiredVy = nearest.y - this.y;
            const mag = Math.hypot(desiredVx, desiredVy);
            if (mag > 0) {
                const steerStrength = this.projectileSpeed * 3.5 * this.specialEffects.homing.level * dt;
                this.vx += (desiredVx / mag) * steerStrength;
                this.vy += (desiredVy / mag) * steerStrength;
                // Normalize
                const newMag = Math.hypot(this.vx, this.vy);
                if (newMag > 0) {
                    this.vx = (this.vx / newMag) * this.projectileSpeed;
                    this.vy = (this.vy / newMag) * this.projectileSpeed;
                }
            }
        }
    }

    // Point Blank Perk (preserves pierceDamageMult)
    if (this.specialEffects.pointBlank) {
        const dropoff = Math.min(1.0, this.distanceTraveled / 800);
        this.damage = this.baseDamage * this.pierceDamageMult * Math.max(0.5, 1.5 - dropoff);
    } else {
        this.damage = this.baseDamage * this.pierceDamageMult;
    }

    // Return to Sender (Boomerang) Perk
    if (this.specialEffects.returnToSender) {
        if (this.distanceTraveled > 520 && !this.returned) {
            this.returned = true;
            this.pierceDamageMult = (this.pierceDamageMult || 1.0) * 0.65;
            this.piercedEnemies.clear(); // Can hit again at 65% return damage
        }
        if (this.returned) {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const mag = Math.hypot(dx, dy);
            if (mag > 20) {
                const steerStrength = this.projectileSpeed * 6.0 * dt;
                this.vx += (dx / mag) * steerStrength;
                this.vy += (dy / mag) * steerStrength;
                const newMag = Math.hypot(this.vx, this.vy);
                if (newMag > 0) {
                    this.vx = (this.vx / newMag) * this.projectileSpeed;
                    this.vy = (this.vy / newMag) * this.projectileSpeed;
                }
            } else {
                this.markedForDeletion = true; // Caught by player
            }
        }
    }

    this.lastX = this.x;
    this.lastY = this.y;
    const moveDist = Math.hypot(this.vx * dt, this.vy * dt);
    this.distanceTraveled += moveDist;
    super.update(dt, canvas);

    if (activeGame && activeGame.world && !this.specialEffects.returnToSender) {
        const wallResult = activeGame.world.reflectOrCollideProjectile(this);
        if (wallResult === 'bounced') {
            this.bounce--;
            this.pierceDamageMult = (this.pierceDamageMult || 1.0) * 0.72;
            this.piercedEnemies.clear();
            if (activeGame.particles) {
                for (let i = 0; i < 3; i++) _pushEntityParticle(activeGame, this.x, this.y, '#00ffff', false);
            }
        } else if (wallResult === 'blocked') {
            this.markedForDeletion = true;
            if (this.specialEffects.split && !this.isSplitChild) {
                this.triggerDeathSplit = true;
            }
            return;
        }
    }
    
    // Bounds check (Shotgun has shorter range)
    const maxRange = this.specialEffects.shotgun ? 520 : 2000;
    if (this.x < minX || this.x > worldW || this.y < minY || this.y > worldH || this.distanceTraveled > maxRange) {
      this.handleExpiration(canvas, player);
    }
  }
  
  handleExpiration(canvas, player) {
      const { minX = 0, minY = 0, w: worldW, h: worldH } = getWorldBounds(canvas);
      if (this.bounce > 0 && (this.x < minX || this.x > worldW || this.y < minY || this.y > worldH)) {
          if (this.x < minX || this.x > worldW) this.vx *= -1;
          if (this.y < minY || this.y > worldH) this.vy *= -1;
          this.x = Math.max(minX, Math.min(worldW, this.x));
          this.y = Math.max(minY, Math.min(worldH, this.y));
          this.bounce--;
          this.pierceDamageMult = (this.pierceDamageMult || 1.0) * 0.72;
          this.piercedEnemies.clear();
      }
      else if (this.specialEffects.split && !this.isSplitChild) {
          // Splitting is handled in game.js by reading a flag when projectile dies
          this.markedForDeletion = true;
          if (!(this.x < minX || this.x > worldW || this.y < minY || this.y > worldH)) {
              this.triggerDeathSplit = true; 
          }
      }
      else {
          this.markedForDeletion = true;
      }
  }

  draw(ctx) {
    let color = this.color;
    let shadowColor = this.color;
    let radius = this.radius;
    
    if (this.element === 'fire' || this.specialEffects.burn || this.specialEffects.ignite) {
        color = '#ff6600';
        shadowColor = '#ff2200';
    } else if (this.element === 'toxin' || this.specialEffects.poisonNova || this.specialEffects.applyPoison) {
        color = '#00ff22';
        shadowColor = '#00aa00';
    } else if (this.element === 'frost' || this.specialEffects.frostNova || this.specialEffects.chill) {
        color = '#ccddff';
        shadowColor = '#0055ff';
    } else if (this.element === 'blood' || this.specialEffects.vampirism || this.specialEffects.bloodNova) {
        color = '#aa0000';
        shadowColor = '#550000';
    } else if (this.element === 'holy' || this.specialEffects.smite) {
        color = '#ffffff';
        shadowColor = '#ffffaa';
    } else if (this.element === 'earth' || this.specialEffects.tremor || this.specialEffects.earthquake || this.specialEffects.rockShard) {
        color = '#8b5a2b';
        shadowColor = '#5c3a21';
    } else if (this.element === 'storm') {
        color = '#00ffff';
        shadowColor = '#0088ff';
    }
    
    ctx.beginPath();
    ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowBlur = 15;
    ctx.shadowColor = shadowColor;
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Fake trails for certain elements
    if (this.stats.fireMastery > 0 || this.stats.bloodMastery > 0 || this.stats.holyMastery > 0) {
        const mag = Math.hypot(this.vx, this.vy);
        if (mag > 0) {
            const dirX = this.vx / mag;
            const dirY = this.vy / mag;
            ctx.beginPath();
            ctx.arc(this.x - (dirX * 10), this.y - (dirY * 10), radius * 0.7, 0, Math.PI * 2);
            ctx.fillStyle = shadowColor;
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(this.x - (dirX * 20), this.y - (dirY * 20), radius * 0.4, 0, Math.PI * 2);
            ctx.globalAlpha = 0.5;
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }
  }
}

class XPOrb extends Entity {
  constructor(x, y, value) {
    super(x, y, 6, '#ffff00');
    this.value = value;
  }
}

class BossCoreOrb extends Entity {
  constructor(x, y) {
    super(x, y, 12, '#c424ff');
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();

    ctx.globalAlpha = 0.78;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }
}

class Particle extends Entity {
  constructor(x, y, color, opts = null) {
    const r = (opts && Number.isFinite(opts.radius)) ? opts.radius : (Math.random() * 3 + 1);
    super(x, y, r, color);
    if (opts && Number.isFinite(opts.vx) && Number.isFinite(opts.vy)) {
      this.vx = opts.vx;
      this.vy = opts.vy;
    } else {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 100 + 50;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
    }
    this.life = (opts && Number.isFinite(opts.life)) ? opts.life : 1.0;
  }
  update(dt) {
    super.update(dt);
    this.life -= dt;
    if (this.life <= 0) this.markedForDeletion = true;
  }
  draw(ctx) {
    ctx.globalAlpha = Math.max(0, Math.min(1, this.life));
    super.draw(ctx);
    ctx.globalAlpha = 1.0;
  }
}

class Lightning extends Entity {
  constructor(x1, y1, x2, y2, color = '#00ffff', isBeam = false) {
    super(x1, y1, 0, color);
    this.x2 = x2;
    this.y2 = y2;
    this.life = 0.2; 
    this.isBeam = isBeam;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) this.markedForDeletion = true;
  }
  draw(ctx) {
    const baseAlpha = Math.max(0, this.life / 0.2);
    let midX = 0;
    let midY = 0;
    if (!this.isBeam) {
        const dx = this.x2 - this.x;
        const dy = this.y2 - this.y;
        midX = this.x + dx * 0.5 + (Math.random() - 0.5) * 20;
        midY = this.y + dy * 0.5 + (Math.random() - 0.5) * 20;
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    if (!this.isBeam) ctx.lineTo(midX, midY);
    ctx.lineTo(this.x2, this.y2);

    ctx.globalAlpha = baseAlpha * 0.28;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.isBeam ? 18 : 6;
    ctx.stroke();

    ctx.globalAlpha = baseAlpha;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.isBeam ? 10 : 2;
    ctx.stroke();

    if (this.isBeam) {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x2, this.y2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.stroke();
    } else {
        ctx.globalAlpha = baseAlpha * 0.72;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    ctx.restore();
    ctx.globalAlpha = 1.0;
  }
}

class BlackHole extends Entity {
  constructor(x, y, level, baseDamage = null) {
    super(x, y, 20 + level * 5, '#000000');
    this.life = 3.0 + level; 
    this.pullStrength = 100 + level * 50;
    this.damage = Number.isFinite(baseDamage) ? Math.max(20, baseDamage) : 100;
  }
  update(dt, enemiesOrBroadphase, scratchOut = _entityQueryScratch) {
    this.life -= dt;
    if (this.life <= 0) {
      this.markedForDeletion = true;
      return;
    }
    const list = _isBroadphase(enemiesOrBroadphase)
      ? enemiesOrBroadphase.queryRadiusInto(this.x, this.y, this.radius * 5, scratchOut || _entityQueryScratch, false)
      : (enemiesOrBroadphase || []);
    for (const enemy of list) {
      if (enemy.markedForDeletion) continue;
      const dx = this.x - enemy.x;
      const dy = this.y - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0 && dist < this.radius * 5) {
        const bossPull = enemy.isBoss ? ((enemy._bossDash || (enemy._bossLockHeading || 0) > 0) ? 0 : 0.06) : 1.0;
        enemy.x += (dx / dist) * this.pullStrength * bossPull * dt;
        enemy.y += (dy / dist) * this.pullStrength * bossPull * dt;
        if (dist < this.radius) {
            enemy.takeDamage(this.damage * dt, { isDot: true });
        }
      }
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 0, 255, 0.14)';
    ctx.fill();

    ctx.globalAlpha = 0.78;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.strokeStyle = '#ff66ff';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
  }
}

class AcidPool extends Entity {
    constructor(x, y, level, type = "acid", baseDamage = null) {
      let color = 'rgba(0, 255, 0, 0.4)';
      if (type === "fire") color = 'rgba(255, 60, 0, 0.4)'; // Nicer fire color
      if (type === "ice") color = 'rgba(150, 255, 255, 0.1)';
      
      super(x, y, type === "fire" ? 15 : 40 + level * 10, color);
      this.life = type === "fire" ? 4.0 : 3.0; // Fire stays much longer now
      this.damage = Number.isFinite(baseDamage) ? Math.max(10 * level, baseDamage) : 10 * level;
      this.type = type;
    }
    update(dt, enemiesOrBroadphase, scratchOut = _entityQueryScratch) {
      this.life -= dt;
      if (this.life <= 0) {
          this.markedForDeletion = true;
          return;
      }
      const list = _isBroadphase(enemiesOrBroadphase)
        ? enemiesOrBroadphase.queryRadiusInto(this.x, this.y, this.radius, scratchOut || _entityQueryScratch, false)
        : (enemiesOrBroadphase || []);
      for (const enemy of list) {
        if (enemy.markedForDeletion) continue;
        const dist = Math.hypot(this.x - enemy.x, this.y - enemy.y);
        if (dist < this.radius) {
            if (this.type === "fire") {
                enemy.takeDamage(this.damage * 0.6 * dt, { isDot: true });
                if (!enemy.dots.some(d => d.type === "burn")) {
                    enemy.applyDot(this.damage, 1.5, "burn");
                }
            } else if (this.type === "ice") {
                enemy.status.chilled = 0.5;
            } else {
                enemy.takeDamage(this.damage * dt, { isDot: true });
            }
        }
      }
    }
    draw(ctx) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
}

class Meteor extends Entity {
    constructor(x, y, damage) {
        super(x, y, 90, 'rgba(255, 0, 0, 0.2)'); // Target indicator
        this.damage = damage;
        this.life = 0.75; // 0.75s delay
        this.exploded = false;
    }
    update(dt, enemiesOrBroadphase, particles, scratchOut = _entityQueryScratch) {
        this.life -= dt;
        if (this.life <= 0 && !this.exploded) {
            this.exploded = true;
            this.markedForDeletion = true;
            
            const activeGame = (typeof game !== 'undefined' && game) ? game : globalThis.game;
            const pCap = (activeGame && typeof activeGame.getParticleBudget === 'function')
              ? Math.min(250, activeGame.getParticleBudget())
              : 250;
            // Explosion particles
            if (particles) {
                for (let i = 0; i < 30 && particles.length < pCap; i++) {
                    particles.push(new Particle(this.x, this.y, '#ff3300'));
                }
            }
            
            // Damage enemies in radius
            const list = _isBroadphase(enemiesOrBroadphase)
              ? enemiesOrBroadphase.queryRadiusInto(this.x, this.y, this.radius, scratchOut || _entityQueryScratch, false)
              : (enemiesOrBroadphase || []);
            for (const enemy of list) {
                if (Math.hypot(this.x - enemy.x, this.y - enemy.y) < this.radius) {
                    enemy.takeDamage(this.damage);
                    enemy.applyDot(this.damage * 0.3, 3.0, "burn");
                }
            }
        }
    }
    draw(ctx) {
        if (!this.exploded) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            
            // Inner circle zooming in
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(0, this.radius * (this.life / 0.75)), 0, Math.PI * 2);
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
}

class IceTrail extends Entity {
    constructor(x1, y1, x2, y2, level) {
        super(x1, y1, 15 + level * 5, 'rgba(150, 255, 255, 0.2)');
        this.x2 = x2;
        this.y2 = y2;
        this.life = 3.0;
    }
    update(dt, enemiesOrBroadphase, scratchOut = _entityQueryScratch) {
        this.life -= dt;
        if (this.life <= 0) { this.markedForDeletion = true; return; }
        let list = enemiesOrBroadphase || [];
        if (enemiesOrBroadphase && typeof enemiesOrBroadphase.queryXRangeInto === 'function') {
            const pad = this.radius + (enemiesOrBroadphase.maxRadius || 0);
            const minX = Math.min(this.x, this.x2) - pad;
            const maxX = Math.max(this.x, this.x2) + pad;
            list = enemiesOrBroadphase.queryXRangeInto(minX, maxX, scratchOut || _entityQueryScratch);
        }
        for (const enemy of list) {
            if (enemy.markedForDeletion) continue;
            const A = enemy.x - this.x;
            const B = enemy.y - this.y;
            const C = this.x2 - this.x;
            const D = this.y2 - this.y;
            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            let param = -1;
            if (lenSq !== 0) param = dot / lenSq;
            let xx, yy;
            if (param < 0) { xx = this.x; yy = this.y; }
            else if (param > 1) { xx = this.x2; yy = this.y2; }
            else { xx = this.x + param * C; yy = this.y + param * D; }
            if (Math.hypot(enemy.x - xx, enemy.y - yy) < this.radius + enemy.radius) {
                enemy.status.chilled = 0.5;
            }
        }
    }
    draw(ctx) {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x2, this.y2);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.radius * 2;
        ctx.lineCap = 'round';
        ctx.stroke();
    }
}

class Turret extends Entity {
    constructor(index, total) {
        super(0, 0, 10, '#00ffff');
        this.index = index;
        this.total = total;
        this.fireCooldown = index * 0.25;
        this.orbitAngle = (Math.PI * 2 / total) * index;
    }

    update(dt, game, stats) {
        this.orbitAngle += dt * 0.8;
        const targetPosX = game.player.x + Math.cos(this.orbitAngle) * 95;
        const targetPosY = game.player.y + Math.sin(this.orbitAngle) * 95;

        if (this.x === 0 && this.y === 0) {
            this.x = targetPosX;
            this.y = targetPosY;
        } else {
            const lerp = Math.min(1, dt * 8);
            this.x += (targetPosX - this.x) * lerp;
            this.y += (targetPosY - this.y) * lerp;
        }

        this.fireCooldown -= dt;
        if (this.fireCooldown <= 0) {
            const { w: worldW, h: worldH } = getWorldBounds(game ? game.canvas : null);
            const bp = (game && typeof game._getBroadphase === 'function') ? game._getBroadphase() : null;
            const list = bp
              ? bp.queryRadiusInto(this.x, this.y, 780, (game && game._broadphaseEntityScratch) || _entityQueryScratch, false)
              : (game && game.enemies ? game.enemies : []);
            let nearest = null;
            let minDist = Infinity;
            for (const e of list) {
                if (e.markedForDeletion || e.x < 0 || e.x > worldW || e.y < 0 || e.y > worldH) continue;
                if (e.aggroed === false && Math.hypot(e.x - game.player.x, e.y - game.player.y) > (e.aggroRadius || 430) + 25) continue;
                const dist = Math.hypot(e.x - this.x, e.y - this.y);
                if (dist < minDist && dist <= 780) {
                    minDist = dist;
                    nearest = e;
                }
            }
            if (nearest) {
                const rate = (typeof game.getEffectiveFireRate === 'function') ? game.getEffectiveFireRate(stats) : stats.fireRate;
                this.fireCooldown = 1 / Math.max(0.1, rate);
                game.shotsFired = (game.shotsFired || 0) + 1;
                const aimAng = Math.atan2(nearest.y - this.y, nearest.x - this.x);
                const prevProjLen = Array.isArray(game.projectiles) ? game.projectiles.length : 0;
                game.fireProjectiles({ ...stats, damage: stats.damage * 0.75 }, nearest.x, nearest.y, this.x, this.y, true);
                if (typeof game._playShotAudio === 'function') game._playShotAudio(stats, prevProjLen, this.x, this.y);
                if (typeof game._triggerShotProcs === 'function') game._triggerShotProcs(stats, this.x, this.y, aimAng, nearest, true, this.index);
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Outer neon magenta vector halo + crisp ring
        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 0, 255, 0.24)';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner cyan diamond
        ctx.beginPath();
        ctx.moveTo(0, -this.radius);
        ctx.lineTo(this.radius, 0);
        ctx.lineTo(0, this.radius);
        ctx.lineTo(-this.radius, 0);
        ctx.closePath();
        ctx.fillStyle = '#00ffff';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }
}

class SupplyDrop extends Entity {
    constructor(x, y, kind = 'vacuum', amount = 25) {
        const colors = {
            vacuum: '#00ffff',
            overcharge: '#ff00ff',
            matter_cache: '#ffd700'
        };
        super(x, y, 12, colors[kind] || '#00ffff');
        this.kind = kind;
        this.amount = amount;
        this.life = 28.0;
        this.pulsePhase = Math.random() * Math.PI * 2;
    }

    update(dt) {
        this.life -= dt;
        this.pulsePhase += dt * 4.5;
        if (this.life <= 0) {
            this.markedForDeletion = true;
        }
    }

    draw(ctx) {
        const blink = this.life < 5.0 && Math.floor(this.life * 6) % 2 === 0;
        if (blink) return;
        const r = this.radius + Math.sin(this.pulsePhase) * 2.2;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = 0.24;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(2, 6, 16, 0.85)';
        ctx.fillStyle = this.color;
        ctx.lineWidth = 2;

        ctx.beginPath();
        if (this.kind === 'vacuum') {
            for (let i = 0; i < 8; i++) {
                const rad = i % 2 === 0 ? r * 1.25 : r * 0.45;
                const a = (i * Math.PI) / 4 + this.pulsePhase * 0.25;
                const px = Math.cos(a) * rad;
                const py = Math.sin(a) * rad;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
        } else if (this.kind === 'overcharge') {
            ctx.rotate(this.pulsePhase * 0.4);
            ctx.moveTo(0, -r * 1.15);
            ctx.lineTo(r * 0.9, 0);
            ctx.lineTo(0, r * 1.15);
            ctx.lineTo(-r * 0.9, 0);
        } else {
            for (let i = 0; i < 6; i++) {
                const a = (i * Math.PI) / 3;
                const px = Math.cos(a) * r;
                const py = Math.sin(a) * r;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
    }
}

class ModuleDrop extends Entity {
    constructor(x, y, mod = null, shardElement = null, shardTier = 1) {
        const qualityColors = {
            standard: '#aaddff',
            refined: '#00eeff',
            harmonic: '#ffd700',
            signature: '#ff6622'
        };
        const shardColors = {
            fire: '#ff4422',
            frost: '#44aaff',
            storm: '#00eeff',
            toxin: '#33ff66',
            blood: '#ff0055',
            holy: '#ffee88',
            earth: '#cc8844'
        };
        const color = mod
            ? (qualityColors[mod.quality] || '#aaddff')
            : (shardColors[shardElement] || '#00eeff');
        super(x, y, (shardElement && !mod) ? 9 : 13, color);
        this.mod = mod || null;
        this.shardElement = shardElement || null;
        this.shardTier = shardTier === 2 ? 2 : 1;
        this.life = 55.0;
        this.pulsePhase = Math.random() * Math.PI * 2;
    }

    update(dt) {
        this.life -= dt;
        this.pulsePhase += dt * 4.2;
        if (this.life <= 0) {
            this.markedForDeletion = true;
        }
    }

    draw(ctx) {
        const blink = this.life < 6.0 && Math.floor(this.life * 6) % 2 === 0;
        if (blink) return;
        const r = this.radius + Math.sin(this.pulsePhase) * 2.0;

        ctx.save();
        // Vertical light beam for Harmonic (#ffd700) and Signature (#ff6622) modules
        if (this.mod && (this.mod.quality === 'harmonic' || this.mod.quality === 'signature')) {
            const beamHeight = this.mod.quality === 'signature' ? 115 : 88;
            ctx.strokeStyle = this.color;
            ctx.globalAlpha = 0.28 + 0.12 * Math.sin(this.pulsePhase);
            ctx.lineWidth = this.mod.quality === 'signature' ? 6 : 4;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x, this.y - beamHeight);
            ctx.stroke();

            ctx.globalAlpha = 0.65;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x, this.y - beamHeight * 0.85);
            ctx.stroke();
        }

        ctx.translate(this.x, this.y);
        const isHighMod = Boolean(this.mod && (this.mod.quality === 'harmonic' || this.mod.quality === 'signature'));
        ctx.globalAlpha = isHighMod ? 0.28 : 0.22;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = isHighMod ? 3.5 : 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, r + (isHighMod ? 7 : 4), 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(2, 6, 16, 0.85)';
        ctx.fillStyle = this.color;
        ctx.lineWidth = 2;

        ctx.beginPath();
        if (this.shardElement && !this.mod) {
            // Crystalline Frequency Shard prism
            ctx.moveTo(0, -r * 1.25);
            ctx.lineTo(r * 0.8, 0);
            ctx.lineTo(0, r * 1.25);
            ctx.lineTo(-r * 0.8, 0);
        } else {
            // Octagonal Core Module badge
            for (let i = 0; i < 8; i++) {
                const a = (i * Math.PI) / 4 + this.pulsePhase * 0.15;
                const rad = i % 2 === 0 ? r * 1.1 : r * 0.82;
                const px = Math.cos(a) * rad;
                const py = Math.sin(a) * rad;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
    }
}

class FloatingText {
    constructor(x, y, text, color = '#ffffff', scale = 1.0, life = 1.15) {
        this.x = x;
        this.y = y;
        this.vy = -22;
        this.text = text;
        this.color = color;
        this.scale = scale;
        const boostedLife = life <= 0.9 ? 1.45 : Math.max(2.35, life * 1.65);
        this.life = boostedLife;
        this.maxLife = boostedLife;
        this.markedForDeletion = false;
    }

    update(dt) {
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) {
            this.markedForDeletion = true;
        }
    }

    draw(ctx) {
        const remFrac = this.life / (this.maxLife || 2.35);
        const alpha = remFrac >= 0.30 ? 1.0 : Math.max(0, remFrac / 0.30);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${Math.round(15 * this.scale)}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        if (ctx.strokeText) {
            ctx.lineWidth = 3.2;
            ctx.strokeStyle = 'rgba(2, 6, 16, 0.90)';
            ctx.strokeText(this.text, this.x, this.y);
        }
        ctx.fillStyle = this.color;
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

const BIOME_ELEMENTAL_AFFINITY = {
    fire:  { resist: ['fire', 'toxin'],  weak: ['frost'],           weakMult: 1.40, resistBase: 0.40 },
    frost: { resist: ['frost', 'fire'],  weak: ['storm', 'earth'],  weakMult: 1.40, resistBase: 0.40 },
    storm: { resist: ['storm'],          weak: ['earth', 'toxin'],  weakMult: 1.40, resistBase: 0.40 },
    toxin: { resist: ['toxin', 'frost'], weak: ['fire', 'holy'],    weakMult: 1.40, resistBase: 0.40 },
    earth: { resist: ['earth', 'storm'], weak: ['toxin', 'frost'],  weakMult: 1.40, resistBase: 0.40 },
    blood: { resist: ['blood'],          weak: ['holy'],            weakMult: 1.45, resistBase: 0.40 },
    holy:  { resist: ['holy'],           weak: ['blood'],           weakMult: 1.45, resistBase: 0.40 }
};

function getElementalAffinityMultiplier(attackElement, defenderElement, opts = {}) {
    if (!attackElement || attackElement === 'none' || attackElement === 'void') {
        return { mult: 1.0, state: 'neutral' };
    }
    if (!defenderElement || defenderElement === 'void') {
        return { mult: 1.0, state: 'neutral' };
    }
    const def = BIOME_ELEMENTAL_AFFINITY[defenderElement];
    if (!def) return { mult: 1.0, state: 'neutral' };
    if (def.weak.includes(attackElement)) {
        return { mult: def.weakMult, state: 'weak' };
    }
    if (def.resist.includes(attackElement)) {
        const pen = Math.max(0, Number(opts && opts.penetration) || 0);
        const shred = Math.max(0, Number(opts && opts.resistShred) || 0);
        const effResist = Math.max(0, def.resistBase - pen - shred);
        const mult = Math.max(0.25, 1 - effResist);
        return { mult, state: mult < 0.92 ? 'resist' : 'neutral' };
    }
    return { mult: 1.0, state: 'neutral' };
}

if (typeof globalThis !== 'undefined') {
    globalThis.BIOME_ELEMENTAL_AFFINITY = BIOME_ELEMENTAL_AFFINITY;
    globalThis.getElementalAffinityMultiplier = getElementalAffinityMultiplier;
}
if (typeof window !== 'undefined') {
    window.BIOME_ELEMENTAL_AFFINITY = BIOME_ELEMENTAL_AFFINITY;
    window.getElementalAffinityMultiplier = getElementalAffinityMultiplier;
}

function closestPointOnWallSegment(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const lenSq = vx * vx + vy * vy;
    if (lenSq === 0) return { x: x1, y: y1 };
    let t = ((px - x1) * vx + (py - y1) * vy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return { x: x1 + t * vx, y: y1 + t * vy };
}

class VoidWorld {
    constructor(size = 96000, rngFn = Math.random, options = null) {
        this.size = size;
        this.center = size / 2;
        this.isDescentMap = Boolean(options && options.mode === 'descent');
        this.descentBoundSize = this.isDescentMap ? Math.max(1600, Number(options && options.boundSize) || 2600) : 0;
        this.descentCornerChamfer = this.isDescentMap ? 340 : 0;
        this.sanctumRadius = this.isDescentMap ? 0 : 1300;
        this.rng = rngFn;
        this.walls = [];
        this.cellSize = 1600;
        this.gridCols = Math.ceil(this.size / this.cellSize);
        this.wallGrid = Array.from({ length: this.gridCols * this.gridCols }, () => []);
        this._queryStamp = 1;
        this.chasms = [];
        this.chasmGrid = Array.from({ length: this.gridCols * this.gridCols }, () => []);
        this._chasmStamp = 1;
        this.bridges = [];
        this.forceGates = [];
        this.hazards = [];
        this.monoliths = [];
        this.echoPads = [];
        this.deepBeacons = [];
        this.outpostBeacons = [];
        this.biomeGateways = [];
        this.decorProps = [];
        this.boostStrips = [];
        this.shrines = [];
        this.perkVaults = [];
        this.sanctumEntities = [];
        this.rescueChambers = [];
        this.volatilePacts = [];
        this.extractorRigs = [];
        this.strongholds = [];
        this.slotForges = [];
        this.mythicVaults = [];
        this.crystalGeodes = [];
        this.abyssalAnomalies = [];
        this.rimPortals = [];
        this.descentPillars = [];
        this.descentPolygon = [];

        this.sectorDefs = [
            { id: 'fire', name: 'EMBER RIFT', baseZoneLevel: 1, levelLabel: 'LVL 1-12', color: '#ff4422', enemies: ['grunt', 'kamikaze'], enemyWeights: [0.75, 0.25], guardianType: 'brute', bossTitle: 'PYROCLAST COLOSSUS', traitDesc: 'VOLCANIC CALDERAS & LAVA RIFTS' },
            { id: 'frost', name: 'CRYO SPIRE', baseZoneLevel: 11, levelLabel: 'LVL 11-22', color: '#44aaff', enemies: ['ranger', 'shieldbearer'], enemyWeights: [0.55, 0.45], guardianType: 'sentinel', bossTitle: 'GLACIAL SOVEREIGN', traitDesc: 'CRYSTAL PRISM MAZE & GLACIER SHEETS' },
            { id: 'storm', name: 'STORM CONDUIT', baseZoneLevel: 21, levelLabel: 'LVL 21-32', color: '#00eeff', enemies: ['zergling', 'wraith'], enemyWeights: [0.65, 0.35], guardianType: 'wraith', bossTitle: 'TEMPEST ARCHON', traitDesc: 'CIRCUIT CORRIDORS & ACCELERATOR LANES' },
            { id: 'toxin', name: 'BLIGHT BASIN', baseZoneLevel: 31, levelLabel: 'LVL 31-42', color: '#33ff66', enemies: ['slime', 'hive'], enemyWeights: [0.72, 0.28], guardianType: 'hive', bossTitle: 'PLAGUE BROODMOTHER', traitDesc: 'HONEYCOMB POCKETS & SPORE BASINS' },
            { id: 'blood', name: 'CRIMSON ALTAR', baseZoneLevel: 41, levelLabel: 'LVL 41-52', color: '#ff0055', enemies: ['brute', 'rogue', 'commander'], enemyWeights: [0.45, 0.38, 0.17], guardianType: 'commander', bossTitle: 'SANGUINE WARLORD', traitDesc: 'CATHEDRAL COLONNADES & RITUAL COURTS' },
            { id: 'holy', name: 'ASTRAL CHOIR', baseZoneLevel: 51, levelLabel: 'LVL 51-62', color: '#ffee88', enemies: ['sentinel', 'medic'], enemyWeights: [0.70, 0.30], guardianType: 'sentinel', bossTitle: 'SERAPHIC ARBITER', traitDesc: 'SKY ISLANDS OVER STARLIT CHASMS' },
            { id: 'earth', name: 'TECTONIC VAULT', baseZoneLevel: 61, levelLabel: 'LVL 61-72', color: '#cc8844', enemies: ['golem', 'artillery'], enemyWeights: [0.62, 0.38], guardianType: 'golem', bossTitle: 'MONOLITH TITAN', traitDesc: 'STAGGERED BASTIONS & TECTONIC GORGES' }
        ];

        this.dailyPad = this.isDescentMap
            ? null
            : {
                x: this.center,
                y: this.center - 550,
                radius: 44,
                progress: 0,
                holdRequired: 1.4,
                color: '#ffd700',
                active: false
            };

        if (this.isDescentMap) {
            this._buildDescentGeometry();
        } else {
            this._buildGeometry();
        }
    }

    _polar(dist, angle) {
        return {
            x: this.center + Math.cos(angle) * dist,
            y: this.center + Math.sin(angle) * dist
        };
    }

    _pickWeightedFromSector(def, rngFn = this.rng) {
        const list = (def && def.enemies && def.enemies.length > 0) ? def.enemies : ['grunt'];
        const weights = def && Array.isArray(def.enemyWeights) && def.enemyWeights.length === list.length ? def.enemyWeights : null;
        if (!weights) return list[Math.floor(rngFn() * list.length)];
        const total = weights.reduce((s, w) => s + w, 0);
        let roll = rngFn() * (total || 1);
        for (let i = 0; i < list.length; i++) {
            roll -= weights[i];
            if (roll <= 0) return list[i];
        }
        return list[list.length - 1];
    }

    pickBiomeEnemy(sectorId, phase = 1, singularityLevel = 1, rngFn = this.rng) {
        const secDef = this.sectorDefs.find(s => s.id === sectorId) || this.sectorDefs[0];
        if (!secDef || sectorId === 'void' || phase <= 1) {
            return { type: this._pickWeightedFromSector(secDef, rngFn), leaked: false, infusionElement: null };
        }
        let leakChance = 0;
        if (phase === 2) leakChance = 0.24;
        else if (phase === 3) leakChance = 0.38;
        else if (phase >= 4) leakChance = Math.min(0.58, 0.45 + Math.max(0, (singularityLevel || 1) - 1) * 0.03);

        if (rngFn() < leakChance) {
            const others = this.sectorDefs.filter(s => s.id !== secDef.id);
            const foreign = others[Math.floor(rngFn() * others.length)];
            return { type: this._pickWeightedFromSector(foreign, rngFn), leaked: true, infusionElement: secDef.id };
        }
        return { type: this._pickWeightedFromSector(secDef, rngFn), leaked: false, infusionElement: null };
    }

    _addWall(x1, y1, x2, y2, color, thickness = 12, extra = null) {
        const id = this.walls.length;
        const wall = {
            id,
            x1, y1, x2, y2,
            color,
            thickness,
            minX: Math.min(x1, x2) - thickness,
            maxX: Math.max(x1, x2) + thickness,
            minY: Math.min(y1, y2) - thickness,
            maxY: Math.max(y1, y2) + thickness,
            isSectorDivider: Boolean(extra && extra.isSectorDivider),
            _stamp: 0
        };
        this.walls.push(wall);

        const cMin = Math.max(0, Math.floor(wall.minX / this.cellSize));
        const cMax = Math.min(this.gridCols - 1, Math.floor(wall.maxX / this.cellSize));
        const rMin = Math.max(0, Math.floor(wall.minY / this.cellSize));
        const rMax = Math.min(this.gridCols - 1, Math.floor(wall.maxY / this.cellSize));
        for (let gy = rMin; gy <= rMax; gy++) {
            for (let gx = cMin; gx <= cMax; gx++) {
                this.wallGrid[gy * this.gridCols + gx].push(wall);
            }
        }
    }

    _getCandidateWalls(minX, minY, maxX, maxY) {
        const cMin = Math.max(0, Math.floor(minX / this.cellSize));
        const cMax = Math.min(this.gridCols - 1, Math.floor(maxX / this.cellSize));
        const rMin = Math.max(0, Math.floor(minY / this.cellSize));
        const rMax = Math.min(this.gridCols - 1, Math.floor(maxY / this.cellSize));
        const stamp = ++this._queryStamp;
        const out = [];
        for (let gy = rMin; gy <= rMax; gy++) {
            const rowOffset = gy * this.gridCols;
            for (let gx = cMin; gx <= cMax; gx++) {
                const cell = this.wallGrid[rowOffset + gx];
                for (let k = 0; k < cell.length; k++) {
                    const w = cell[k];
                    if (w._stamp !== stamp) {
                        w._stamp = stamp;
                        out.push(w);
                    }
                }
            }
        }
        return out;
    }

    getWallsInRect(minX, minY, maxX, maxY) {
        return this._getCandidateWalls(minX, minY, maxX, maxY);
    }

    _addChasm(x1, y1, x2, y2, halfWidth = 80, color = '#7722ff') {
        const id = this.chasms.length;
        const chasm = {
            id,
            x1, y1, x2, y2,
            halfWidth,
            color,
            minX: Math.min(x1, x2) - halfWidth,
            maxX: Math.max(x1, x2) + halfWidth,
            minY: Math.min(y1, y2) - halfWidth,
            maxY: Math.max(y1, y2) + halfWidth,
            _stamp: 0
        };
        this.chasms.push(chasm);

        const cMin = Math.max(0, Math.floor(chasm.minX / this.cellSize));
        const cMax = Math.min(this.gridCols - 1, Math.floor(chasm.maxX / this.cellSize));
        const rMin = Math.max(0, Math.floor(chasm.minY / this.cellSize));
        const rMax = Math.min(this.gridCols - 1, Math.floor(chasm.maxY / this.cellSize));
        for (let gy = rMin; gy <= rMax; gy++) {
            for (let gx = cMin; gx <= cMax; gx++) {
                this.chasmGrid[gy * this.gridCols + gx].push(chasm);
            }
        }
        return chasm;
    }

    getChasmsInRect(minX, minY, maxX, maxY) {
        const cMin = Math.max(0, Math.floor(minX / this.cellSize));
        const cMax = Math.min(this.gridCols - 1, Math.floor(maxX / this.cellSize));
        const rMin = Math.max(0, Math.floor(minY / this.cellSize));
        const rMax = Math.min(this.gridCols - 1, Math.floor(maxY / this.cellSize));
        const stamp = ++this._chasmStamp;
        const out = [];
        for (let gy = rMin; gy <= rMax; gy++) {
            const rowOffset = gy * this.gridCols;
            for (let gx = cMin; gx <= cMax; gx++) {
                const cell = this.chasmGrid[rowOffset + gx];
                for (let k = 0; k < cell.length; k++) {
                    const ch = cell[k];
                    if (ch._stamp !== stamp) {
                        ch._stamp = stamp;
                        out.push(ch);
                    }
                }
            }
        }
        return out;
    }

    _addBridge(x1, y1, x2, y2, width, color, element) {
        this.bridges.push({
            x1, y1, x2, y2,
            width,
            color,
            element,
            minX: Math.min(x1, x2) - width,
            maxX: Math.max(x1, x2) + width,
            minY: Math.min(y1, y2) - width,
            maxY: Math.max(y1, y2) + width
        });
    }

    _addBoostStrip(x1, y1, x2, y2, width = 110, color = '#00eeff', element = 'storm', speedMult = 1.55) {
        const pad = width * 0.6;
        this.boostStrips.push({
            x1, y1, x2, y2,
            width,
            color,
            element,
            speedMult,
            minX: Math.min(x1, x2) - pad,
            maxX: Math.max(x1, x2) + pad,
            minY: Math.min(y1, y2) - pad,
            maxY: Math.max(y1, y2) + pad
        });
    }

    _addDecorProp(kind, x, y, color, scale = 1, rot = 0) {
        this.decorProps.push({ kind, x, y, color, scale, rot });
    }

    /** Push ward-respecting enemies cleanly outside the sacred Sanctum rim. */
    resolveSanctumWard(entity) {
        if (this.isDescentMap) return false;
        if (!entity || !entity.respectsSanctumWard) return false;
        const dx = entity.x - this.center;
        const dy = entity.y - this.center;
        const dist = Math.hypot(dx, dy);
        if (dist < this.sanctumRadius + 80) {
            const ang = dist > 0.001 ? Math.atan2(dy, dx) : 0;
            const pushR = this.sanctumRadius + 90;
            entity.x = this.center + Math.cos(ang) * pushR;
            entity.y = this.center + Math.sin(ang) * pushR;
            entity.aggroed = false;
            return true;
        }
        return false;
    }

    isForceGateOpen(gate) {
        if (!gate) return true;
        if (typeof Meta !== 'undefined' && Meta.isSectorConquered && Meta.isSectorConquered(gate.element)) {
            return true;
        }
        return this.monoliths.some(m => m.element === gate.element && m.state === 'conquered');
    }

    resolveCircleChasms(entity, canCross = false) {
        if (canCross) return false;
        const r = entity.radius || 10;
        const pad = 110;
        const candidates = this.getChasmsInRect(entity.x - r - pad, entity.y - r - pad, entity.x + r + pad, entity.y + r + pad);
        let collided = false;
        for (const ch of candidates) {
            if (
                entity.x + r < ch.minX ||
                entity.x - r > ch.maxX ||
                entity.y + r < ch.minY ||
                entity.y - r > ch.maxY
            ) {
                continue;
            }
            const cp = closestPointOnWallSegment(entity.x, entity.y, ch.x1, ch.y1, ch.x2, ch.y2);
            const dx = entity.x - cp.x;
            const dy = entity.y - cp.y;
            const dist = Math.hypot(dx, dy);
            const minDist = r + ch.halfWidth;
            if (dist < minDist) {
                let nx, ny;
                if (dist < 0.0001) {
                    const segLen = Math.hypot(ch.x2 - ch.x1, ch.y2 - ch.y1) || 1;
                    nx = -(ch.y2 - ch.y1) / segLen;
                    ny = (ch.x2 - ch.x1) / segLen;
                } else {
                    nx = dx / dist;
                    ny = dy / dist;
                }
                const push = minDist - dist;
                entity.x += nx * push;
                entity.y += ny * push;
                collided = true;
            }
        }
        return collided;
    }

    resolveForceGates(entity) {
        const r = entity.radius || 10;
        const allowInward = Boolean(entity && entity._allowInwardGateReturn);
        const curR = allowInward ? Math.hypot(entity.x - this.center, entity.y - this.center) : 0;
        const prevR = (allowInward && entity._prevCenterDist !== undefined) ? entity._prevCenterDist : curR;
        if (allowInward && entity._inwardGateCrossing && (curR < 26425 || curR > 26575)) {
            entity._inwardGateCrossing = false;
        }
        for (const g of this.forceGates) {
            if (this.isForceGateOpen(g)) continue;
            if (
                entity.x + r + g.thickness < g.minX ||
                entity.x - r - g.thickness > g.maxX ||
                entity.y + r + g.thickness < g.minY ||
                entity.y - r - g.thickness > g.maxY
            ) {
                continue;
            }
            const cp = closestPointOnWallSegment(entity.x, entity.y, g.x1, g.y1, g.x2, g.y2);
            const dx = entity.x - cp.x;
            const dy = entity.y - cp.y;
            const dist = Math.hypot(dx, dy);
            const minDist = r + g.thickness;
            if (dist < minDist) {
                if (allowInward) {
                    const gateR = Math.hypot(g.cx - this.center, g.cy - this.center);
                    if (prevR > gateR + 4 || (entity._inwardGateCrossing && curR <= prevR + 6)) {
                        entity._inwardGateCrossing = true;
                        continue;
                    }
                }
                let nx, ny;
                if (dist < 0.0001) {
                    const segLen = Math.hypot(g.x2 - g.x1, g.y2 - g.y1) || 1;
                    nx = -(g.y2 - g.y1) / segLen;
                    ny = (g.x2 - g.x1) / segLen;
                } else {
                    nx = dx / dist;
                    ny = dy / dist;
                }
                const push = minDist - dist;
                entity.x += nx * push;
                entity.y += ny * push;
                return g;
            }
        }
        return null;
    }

    isPointClear(x, y, clearance = 65) {
        if (this.isDescentMap) {
            return !this.isCircleBlocked(x, y, clearance, true);
        }
        if (x < 120 || x > this.size - 120 || y < 120 || y > this.size - 120) return false;
        const walls = this._getCandidateWalls(x - clearance - 25, y - clearance - 25, x + clearance + 25, y + clearance + 25);
        for (const w of walls) {
            if (x + clearance < w.minX || x - clearance > w.maxX || y + clearance < w.minY || y - clearance > w.maxY) continue;
            const cp = closestPointOnWallSegment(x, y, w.x1, w.y1, w.x2, w.y2);
            if (Math.hypot(x - cp.x, y - cp.y) < clearance + w.thickness) return false;
        }
        const chasms = this.getChasmsInRect(x - clearance - 110, y - clearance - 110, x + clearance + 110, y + clearance + 110);
        for (const ch of chasms) {
            if (x + clearance < ch.minX || x - clearance > ch.maxX || y + clearance < ch.minY || y - clearance > ch.maxY) continue;
            const cp = closestPointOnWallSegment(x, y, ch.x1, ch.y1, ch.x2, ch.y2);
            if (Math.hypot(x - cp.x, y - cp.y) < clearance + ch.halfWidth) return false;
        }
        for (const g of this.forceGates) {
            if (this.isForceGateOpen(g)) continue;
            if (x + clearance < g.minX || x - clearance > g.maxX || y + clearance < g.minY || y - clearance > g.maxY) continue;
            const cp = closestPointOnWallSegment(x, y, g.x1, g.y1, g.x2, g.y2);
            if (Math.hypot(x - cp.x, y - cp.y) < clearance + g.thickness) return false;
        }
        return true;
    }

    findClearPoint(x, y, clearance = 65) {
        const start = this.isDescentMap
            ? this.clampPointToDescentOctagon(x, y, Math.max(clearance + 16, 48))
            : { x, y };
        if (this.isPointClear(start.x, start.y, clearance)) return start;
        for (let ring = 1; ring <= 8; ring++) {
            const rad = ring * Math.max(48, clearance * 0.9);
            for (let k = 0; k < 12; k++) {
                const a = (k * Math.PI * 2) / 12;
                let px = start.x + Math.cos(a) * rad;
                let py = start.y + Math.sin(a) * rad;
                if (this.isDescentMap) {
                    const cPt = this.clampPointToDescentOctagon(px, py, Math.max(clearance + 16, 48));
                    px = cPt.x;
                    py = cPt.y;
                }
                if (this.isPointClear(px, py, clearance)) return { x: px, y: py };
            }
        }
        return start;
    }

    _ensureClearWorldSpot(x, y, clearance = 165) {
        if (this.isPointClear(x, y, clearance)) return { x, y };
        for (let ring = 1; ring <= 10; ring++) {
            const rad = ring * 180;
            for (let k = 0; k < 12; k++) {
                const a = (k * Math.PI * 2) / 12;
                const cx = Math.max(clearance + 160, Math.min(this.size - clearance - 160, x + Math.cos(a) * rad));
                const cy = Math.max(clearance + 160, Math.min(this.size - clearance - 160, y + Math.sin(a) * rad));
                if (this.isPointClear(cx, cy, clearance)) return { x: cx, y: cy };
            }
        }
        return { x, y };
    }

    _addPerkVault(perkId, perkName, x, y, color, tierLabel, isKeystone = false) {
        const inAng = Math.atan2(this.center - y, this.center - x);
        const ar = 135;
        const pt = (offset) => ({
            x: x + Math.cos(inAng + offset) * ar,
            y: y + Math.sin(inAng + offset) * ar
        });
        const p1 = pt(0.36 * Math.PI);
        const p2 = pt(0.78 * Math.PI);
        const p3 = pt(-0.78 * Math.PI);
        const p4 = pt(-0.36 * Math.PI);
        this._addWall(p1.x, p1.y, p2.x, p2.y, color, 10);
        this._addWall(p2.x, p2.y, p3.x, p3.y, color, 10);
        this._addWall(p3.x, p3.y, p4.x, p4.y, color, 10);

        this.perkVaults.push({
            id: `vault_${perkId}`,
            perkId,
            perkName,
            x,
            y,
            radius: 78,
            color,
            tierLabel,
            isKeystone,
            progress: 0,
            holdRequired: isKeystone ? 3.5 : 2.2,
            wardenSpawned: false,
            collectedThisRun: false
        });
    }

    _addArcWall(radius, a0, a1, segs, color, thickness = 12) {
        for (let s = 0; s < segs; s++) {
            const sa = a0 + ((a1 - a0) * s) / segs;
            const sb = a0 + ((a1 - a0) * (s + 1)) / segs;
            const p1 = this._polar(radius, sa);
            const p2 = this._polar(radius, sb);
            this._addWall(p1.x, p1.y, p2.x, p2.y, color, thickness);
        }
    }

    _addArcChasm(radius, a0, a1, segs, halfWidth, color) {
        for (let s = 0; s < segs; s++) {
            const sa = a0 + ((a1 - a0) * s) / segs;
            const sb = a0 + ((a1 - a0) * (s + 1)) / segs;
            const p1 = this._polar(radius, sa);
            const p2 = this._polar(radius, sb);
            this._addChasm(p1.x, p1.y, p2.x, p2.y, halfWidth, color);
        }
    }

    _buildBiomeArchitecture(def) {
        const ang = def.angle;
        const ux = Math.cos(ang);
        const uy = Math.sin(ang);
        const px = -uy;
        const py = ux;

        if (def.id === 'fire') {
            // Caldera ring-wall arcs & twin volcanic lava-river chasms
            this._addArcWall(4600, ang - 0.28, ang - 0.14, 2, def.color, 13);
            this._addArcWall(4600, ang + 0.14, ang + 0.28, 2, def.color, 13);
            this._addArcWall(6000, ang - 0.35, ang - 0.11, 3, def.color, 14);
            this._addArcWall(6000, ang + 0.11, ang + 0.35, 3, def.color, 14);
            for (const r of [11200, 16200]) {
                this._addArcChasm(r, ang - 0.38, ang - 0.03, 3, 105, def.color);
                this._addArcChasm(r, ang + 0.03, ang + 0.38, 3, 105, def.color);
                const b1 = this._polar(r - 220, ang);
                const b2 = this._polar(r + 220, ang);
                this._addBridge(b1.x, b1.y, b2.x, b2.y, 220, def.color, def.id);
            }
        } else if (def.id === 'frost') {
            // 60-degree crystalline diagonal mirror baffles & glacier rift chasm
            for (const r of [5500, 11000, 15500]) {
                for (const side of [-1, 1]) {
                    for (const da of [0.16, 0.29]) {
                        const c = this._polar(r, ang + side * da);
                        const mirrorAng = ang + side * (Math.PI / 3);
                        const dx = Math.cos(mirrorAng) * 320;
                        const dy = Math.sin(mirrorAng) * 320;
                        this._addWall(c.x - dx, c.y - dy, c.x + dx, c.y + dy, def.color, 13);
                    }
                }
            }
            this._addArcChasm(16600, ang - 0.36, ang - 0.03, 3, 105, def.color);
            this._addArcChasm(16600, ang + 0.03, ang + 0.36, 3, 105, def.color);
            const fb1 = this._polar(16380, ang);
            const fb2 = this._polar(16820, ang);
            this._addBridge(fb1.x, fb1.y, fb2.x, fb2.y, 240, def.color, def.id);
        } else if (def.id === 'storm') {
            // Rectilinear 90-degree circuit corridor walls & 4 accelerator boost strips
            for (const r of [6500, 12500]) {
                const bc = this._polar(r, ang);
                for (const side of [-1, 1]) {
                    const latIn = side * 420;
                    const latOut = side * 1150;
                    const x0 = bc.x + px * latIn - ux * 550;
                    const y0 = bc.y + py * latIn - uy * 550;
                    const x1 = bc.x + px * latIn + ux * 550;
                    const y1 = bc.y + py * latIn + uy * 550;
                    const x2 = bc.x + px * latOut + ux * 550;
                    const y2 = bc.y + py * latOut + uy * 550;
                    const x3 = bc.x + px * latOut + ux * 1100;
                    const y3 = bc.y + py * latOut + uy * 1100;
                    this._addWall(x0, y0, x1, y1, def.color, 12);
                    this._addWall(x1, y1, x2, y2, def.color, 12);
                    this._addWall(x2, y2, x3, y3, def.color, 12);
                }
            }
            for (const [rStart, rEnd] of [[5500, 8500], [11000, 14000], [16000, 18500], [27800, 30500]]) {
                const s1 = this._polar(rStart, ang);
                const s2 = this._polar(rEnd, ang);
                this._addBoostStrip(s1.x, s1.y, s2.x, s2.y, 110, def.color, def.id);
            }
        } else if (def.id === 'toxin') {
            // Open hexagonal honeycomb cell wall pockets
            for (const r of [6800, 13200]) {
                for (const [dr, da] of [[0, -0.20], [0, 0.20], [1500, -0.30], [1500, 0.30]]) {
                    const hc = this._polar(r + dr, ang + da);
                    const hexR = 420;
                    const baseRot = ang + (da < 0 ? 0.35 : -0.35);
                    for (let k = 0; k < 3; k++) {
                        const a1 = baseRot + (k * Math.PI) / 3;
                        const a2 = baseRot + ((k + 1) * Math.PI) / 3;
                        this._addWall(
                            hc.x + Math.cos(a1) * hexR,
                            hc.y + Math.sin(a1) * hexR,
                            hc.x + Math.cos(a2) * hexR,
                            hc.y + Math.sin(a2) * hexR,
                            def.color,
                            12
                        );
                    }
                }
            }
        } else if (def.id === 'blood') {
            // Twin parallel crimson cathedral avenue colonnade walls (r = 4800 .. 18200)
            let bay = 0;
            for (let d = 4800; d <= 17600; d += 1400) {
                for (const side of [-1, 1]) {
                    const c1 = this._polar(d, ang);
                    const c2 = this._polar(d + 880, ang);
                    const offX = px * side * 380;
                    const offY = py * side * 380;
                    this._addWall(c1.x + offX, c1.y + offY, c2.x + offX, c2.y + offY, def.color, 13);
                    if (bay % 2 === 0) {
                        const cm = this._polar(d + 440, ang);
                        this._addWall(
                            cm.x + offX, cm.y + offY,
                            cm.x + px * side * 780, cm.y + py * side * 780,
                            def.color,
                            11
                        );
                    }
                }
                bay++;
            }
        } else if (def.id === 'holy') {
            // Twin sky-island moat chasms crossed by golden Light-Bridges
            this._addArcChasm(10500, ang - 0.38, ang - 0.03, 3, 115, def.color);
            this._addArcChasm(10500, ang + 0.03, ang + 0.38, 3, 115, def.color);
            const hb1 = this._polar(10260, ang);
            const hb2 = this._polar(10740, ang);
            this._addBridge(hb1.x, hb1.y, hb2.x, hb2.y, 240, def.color, def.id);

            // Outer sky island moat at r = 16000 with 3 golden Light-Bridges
            this._addArcChasm(16000, ang - 0.38, ang - 0.255, 2, 115, def.color);
            this._addArcChasm(16000, ang - 0.205, ang - 0.03, 2, 115, def.color);
            this._addArcChasm(16000, ang + 0.03, ang + 0.205, 2, 115, def.color);
            this._addArcChasm(16000, ang + 0.255, ang + 0.38, 2, 115, def.color);
            for (const bAng of [ang - 0.23, ang, ang + 0.23]) {
                const s1 = this._polar(15760, bAng);
                const s2 = this._polar(16240, bAng);
                this._addBridge(s1.x, s1.y, s2.x, s2.y, bAng === ang ? 240 : 190, def.color, def.id);
            }
        } else if (def.id === 'earth') {
            // Heavy staggered canyon bastion walls
            for (const r of [5200, 15200]) {
                for (const side of [-1, 1]) {
                    const pIn = this._polar(r + 450, ang + side * 0.045);
                    const pMid = this._polar(r, ang + side * 0.16);
                    this._addWall(pIn.x, pIn.y, pMid.x, pMid.y, def.color, 18);
                    this._addArcWall(r + 220, ang + side * 0.24, ang + side * 0.35, 1, def.color, 18);
                }
            }
            for (const r of [9800, 18400]) {
                for (const side of [-1, 1]) {
                    this._addArcWall(r, ang + side * 0.11, ang + side * 0.33, 2, def.color, 18);
                }
            }
        }

        // Ring 3 Deep Abyss ruin deflectors (framing deep approach without blocking beacons/vaults)
        const d1a = this._polar(28400, ang - 0.09);
        const d1b = this._polar(29900, ang - 0.05);
        const d2a = this._polar(28400, ang + 0.09);
        const d2b = this._polar(29900, ang + 0.05);
        this._addWall(d1a.x, d1a.y, d1b.x, d1b.y, def.color, 13);
        this._addWall(d2a.x, d2a.y, d2b.x, d2b.y, def.color, 13);

        const r1a = this._polar(37200, ang - 0.08);
        const r1b = this._polar(38500, ang - 0.035);
        const r2a = this._polar(37200, ang + 0.08);
        const r2b = this._polar(38500, ang + 0.035);
        this._addWall(r1a.x, r1a.y, r1b.x, r1b.y, def.color, 13);
        this._addWall(r2a.x, r2a.y, r2b.x, r2b.y, def.color, 13);

        // Tactical flanking cover bars across Rings 1-3 for directional cover & kite paths
        const coverSpecs = [
            [3500, -0.25, 190, 0.35],
            [3500, 0.25, 190, -0.35],
            [7400, -0.25, 220, 0.25],
            [10600, -0.20, 210, -0.30],
            [10600, 0.20, 210, 0.30],
            [14200, -0.19, 230, 0.22],
            [14200, 0.19, 230, -0.22],
            [18000, -0.26, 220, 0.40],
            [18000, 0.26, 220, -0.40],
            [28600, -0.26, 240, 0.30],
            [28600, 0.26, 240, -0.30],
            [33400, -0.21, 240, -0.25],
            [33400, 0.21, 240, 0.25],
            [38200, -0.24, 240, 0.35],
            [38200, 0.24, 240, -0.35]
        ];
        for (const [cr, cda, halfSpan, tilt] of coverSpecs) {
            const cPos = this._polar(cr, ang + cda);
            const wallAng = ang + Math.PI / 2 + tilt;
            const wx = Math.cos(wallAng) * halfSpan;
            const wy = Math.sin(wallAng) * halfSpan;
            this._addWall(cPos.x - wx, cPos.y - wy, cPos.x + wx, cPos.y + wy, def.color, 13);
        }
    }

    clampPointToDescentOctagon(x, y, margin = 60) {
        if (!this.isDescentMap) return { x, y };
        const cx = this.center;
        const cy = this.center;
        const half = (this.descentBoundSize || 2600) * 0.5;
        const m = Math.max(20, Math.min(half * 0.6, margin));
        const clampedX = Math.max(cx - half + m, Math.min(cx + half - m, x));
        const clampedY = Math.max(cy - half + m, Math.min(cy + half - m, y));
        let dx = clampedX - cx;
        let dy = clampedY - cy;
        const c = this.descentCornerChamfer || 340;
        const maxManh = half * 2 - c - m * 1.42;
        const manh = Math.abs(dx) + Math.abs(dy);
        if (manh > maxManh && manh > 0.001) {
            const excess = (manh - maxManh) * 0.5;
            dx = Math.sign(dx) * Math.max(0, Math.abs(dx) - excess);
            dy = Math.sign(dy) * Math.max(0, Math.abs(dy) - excess);
        }
        return { x: cx + dx, y: cy + dy };
    }

    _buildDescentGeometry() {
        const cx = this.center;
        const cy = this.center;
        const half = (this.descentBoundSize || 2600) * 0.5;
        const c = this.descentCornerChamfer || 340;
        const minX = cx - half;
        const maxX = cx + half;
        const minY = cy - half;
        const maxY = cy + half;

        this.descentPolygon = [
            { x: minX + c, y: minY },
            { x: maxX - c, y: minY },
            { x: maxX,     y: minY + c },
            { x: maxX,     y: maxY - c },
            { x: maxX - c, y: maxY },
            { x: minX + c, y: maxY },
            { x: minX,     y: maxY - c },
            { x: minX,     y: minY + c }
        ];

        // 4 Corner Event-Horizon Chamfer Bulkheads
        this._addWall(minX, minY + c, minX + c, minY, '#ff22ee', 18, { isDescentPerimeter: true });
        this._addWall(maxX - c, minY, maxX, minY + c, '#ff22ee', 18, { isDescentPerimeter: true });
        this._addWall(maxX, maxY - c, maxX - c, maxY, '#ff22ee', 18, { isDescentPerimeter: true });
        this._addWall(minX + c, maxY, minX, maxY - c, '#ff22ee', 18, { isDescentPerimeter: true });

        // 4 Inner Diagonal Cover Monoliths (r = 520, angles 45/135/225/315 deg)
        for (let k = 0; k < 4; k++) {
            const ang = Math.PI * 0.25 + k * Math.PI * 0.5;
            const pos = this._polar(520, ang);
            const halfSpan = 88;
            const tx = -Math.sin(ang) * halfSpan;
            const ty = Math.cos(ang) * halfSpan;
            this._addWall(pos.x - tx, pos.y - ty, pos.x + tx, pos.y + ty, '#b833ff', 17, { isDescentCover: true });
            this.descentPillars.push({ x: pos.x, y: pos.y, angle: ang, halfSpan, color: '#b833ff', kind: 'inner_monolith' });
        }

        // 4 Outer Cardinal Bastion Baffles (r = 920, angles 0/90/180/270 deg)
        for (let k = 0; k < 4; k++) {
            const ang = k * Math.PI * 0.5;
            const pos = this._polar(920, ang);
            const halfSpan = 82;
            const tx = -Math.sin(ang) * halfSpan;
            const ty = Math.cos(ang) * halfSpan;
            this._addWall(pos.x - tx, pos.y - ty, pos.x + tx, pos.y + ty, '#ff2288', 16, { isDescentCover: true });
            this.descentPillars.push({ x: pos.x, y: pos.y, angle: ang, halfSpan, color: '#ff2288', kind: 'outer_baffle' });
        }

        // 4 Kinetic Slipstream Boost Strips at r = 740 along diagonals
        for (let k = 0; k < 4; k++) {
            const ang = Math.PI * 0.25 + k * Math.PI * 0.5;
            const pos = this._polar(740, ang);
            const halfLen = 100;
            const tx = -Math.sin(ang) * halfLen;
            const ty = Math.cos(ang) * halfLen;
            this._addBoostStrip(pos.x - tx, pos.y - ty, pos.x + tx, pos.y + ty, 84, '#ff44ee', 'descent', 1.48);
        }

        // 8 Procedural Crucible Decor Props (cardinal conduits & corner rift anchors)
        for (let k = 0; k < 4; k++) {
            const cAng = k * Math.PI * 0.5;
            const cPos = this._polar(1135, cAng);
            this._addDecorProp('singularity_conduit', cPos.x, cPos.y, '#ff22ee', 1.1, cAng);

            const rAng = Math.PI * 0.25 + k * Math.PI * 0.5;
            const rPos = this._polar(1100, rAng);
            this._addDecorProp('rift_anchor', rPos.x, rPos.y, '#aa44ff', 1.0, rAng);
        }
    }

    _buildGeometry() {
        const count = this.sectorDefs.length;
        const step = (Math.PI * 2) / count;

        for (let i = 0; i < count; i++) {
            const def = this.sectorDefs[i];
            const ang = i * step - Math.PI / 2;
            def.angle = ang;

            // Ring 0 Sanctum boundary arc segments (r = 1260, leaving open Grand Gateways down each def.angle)
            const bAng = ang + step / 2;
            this._addArcWall(1260, bAng - 0.19, bAng + 0.19, 2, '#00ffff', 14);

            // Strict radial Biome Divider Barriers along bAng from Sanctum r=1260 out to world rim
            const cosB = Math.cos(bAng);
            const sinB = Math.sin(bAng);
            const minBound = 120;
            const maxBound = this.size - 120;
            let maxDivR = this.center - minBound;
            if (Math.abs(cosB) > 1e-6) {
                const tx = cosB > 0 ? (maxBound - this.center) / cosB : (minBound - this.center) / cosB;
                maxDivR = Math.min(maxDivR, tx);
            }
            if (Math.abs(sinB) > 1e-6) {
                const ty = sinB > 0 ? (maxBound - this.center) / sinB : (minBound - this.center) / sinB;
                maxDivR = Math.min(maxDivR, ty);
            }
            maxDivR = Math.max(1300, maxDivR);
            const divSegLen = 2200;
            const divSegCount = Math.max(1, Math.ceil((maxDivR - 1260) / divSegLen));
            for (let ds = 0; ds < divSegCount; ds++) {
                const r0 = 1260 + ((maxDivR - 1260) * ds) / divSegCount;
                const r1 = 1260 + ((maxDivR - 1260) * (ds + 1)) / divSegCount;
                const p0 = this._polar(r0, bAng);
                const p1 = this._polar(r1, bAng);
                this._addWall(p0.x, p0.y, p1.x, p1.y, '#33ddff', 18, { isSectorDivider: true });
            }

            const gp = this._polar(1300, ang);
            this.biomeGateways.push({
                element: def.id,
                name: def.name,
                levelLabel: def.levelLabel,
                color: def.color,
                x: gp.x,
                y: gp.y,
                angle: ang
            });

            // Custom Biome Architecture across Rings 1-3
            this._buildBiomeArchitecture(def);

            // Ring 2 Citadel Fortress & Elemental Boss Monolith (r = 20500, citadelR = 780)
            const monoPos = this._polar(20500, ang);
            const citadelR = 780;
            for (let k = 0; k < 4; k++) {
                const aStart = (k * Math.PI) / 2 + 0.28;
                const aEnd = ((k + 1) * Math.PI) / 2 - 0.28;
                this._addWall(
                    monoPos.x + Math.cos(aStart) * citadelR,
                    monoPos.y + Math.sin(aStart) * citadelR,
                    monoPos.x + Math.cos(aEnd) * citadelR,
                    monoPos.y + Math.sin(aEnd) * citadelR,
                    def.color,
                    16
                );
            }
            this.monoliths.push({
                id: `monolith_${def.id}`,
                element: def.id,
                name: def.name,
                bossTitle: def.bossTitle,
                color: def.color,
                guardianType: def.guardianType,
                x: monoPos.x,
                y: monoPos.y,
                radius: 165,
                progress: 0,
                holdRequired: 4.0,
                state: 'dormant',
                guardianRef: null
            });

            // Outpost Echo Warp Pad (r = 440 -> target r = 9200) & Outpost Beacon (r = 9200, ang + 0.08)
            const outPadPos = this._polar(440, ang);
            const outTarget = this._polar(9200, ang);
            const outBeaconPos = this._polar(9200, ang + 0.08);
            this.echoPads.push({
                kind: 'outpost',
                element: def.id,
                name: `${def.name} OUTPOST`,
                color: def.color,
                x: outPadPos.x,
                y: outPadPos.y,
                targetX: outTarget.x,
                targetY: outTarget.y,
                radius: 34,
                progress: 0,
                holdRequired: 1.2,
                usedThisRun: false
            });
            this.outpostBeacons.push({
                id: `outpost_beacon_${def.id}`,
                element: def.id,
                name: `${def.name} OUTPOST`,
                color: def.color,
                x: outBeaconPos.x,
                y: outBeaconPos.y,
                radius: 75,
                progress: 0,
                holdRequired: 1.2,
                activatedThisRun: false
            });

            // Citadel Echo Warp Pad in Sanctum (r = 680 -> warps to r = 18800)
            const citPadPos = this._polar(680, ang);
            const citTarget = this._polar(18800, ang);
            this.echoPads.push({
                kind: 'citadel',
                element: def.id,
                name: def.name,
                color: def.color,
                x: citPadPos.x,
                y: citPadPos.y,
                targetX: citTarget.x,
                targetY: citTarget.y,
                radius: 36,
                progress: 0,
                holdRequired: 1.2,
                usedThisRun: false
            });

            // Deep Abyss Echo Warp Pad in Sanctum (r = 920 -> warps to r = 31500)
            const deepPadPos = this._polar(920, ang);
            const deepBeaconPos = this._polar(31500, ang);
            this.echoPads.push({
                kind: 'deep',
                element: def.id,
                name: `${def.name} ABYSS`,
                color: def.color,
                x: deepPadPos.x,
                y: deepPadPos.y,
                targetX: deepBeaconPos.x,
                targetY: deepBeaconPos.y,
                radius: 36,
                progress: 0,
                holdRequired: 1.2,
                usedThisRun: false
            });

            // Deep Abyss Beacon at r = 31500
            this.deepBeacons.push({
                id: `deep_beacon_${def.id}`,
                element: def.id,
                name: `${def.name} DEEP BEACON`,
                color: def.color,
                x: deepBeaconPos.x,
                y: deepBeaconPos.y,
                radius: 85,
                progress: 0,
                holdRequired: 1.5,
                activatedThisRun: false
            });

            // Ring 1 Inner Shrine (r = 8200)
            const innerShrinePos = this._polar(8200, ang + 0.24);
            const innerKind = ((i + (this.rng() < 0.5 ? 0 : 1)) % 2 === 0) ? 'convergence' : 'volatile';
            this.shrines.push({
                id: `shrine_inner_${def.id}`,
                kind: innerKind,
                isMega: false,
                element: def.id,
                color: innerKind === 'convergence' ? '#00ffff' : '#ff0055',
                x: innerShrinePos.x,
                y: innerShrinePos.y,
                radius: 150,
                progress: 0,
                holdRequired: innerKind === 'convergence' ? 7.5 : 1.5,
                completed: false
            });

            // Ring 3 Deep Abyss Mega-Shrine (r = 29500)
            const megaPos = this._polar(29500, ang - 0.22);
            const megaKind = i % 2 === 0 ? 'volatile' : 'convergence';
            this.shrines.push({
                id: `shrine_mega_${def.id}`,
                kind: megaKind,
                isMega: true,
                element: def.id,
                color: megaKind === 'convergence' ? '#00ffff' : '#ff0055',
                x: megaPos.x,
                y: megaPos.y,
                radius: 180,
                progress: 0,
                holdRequired: megaKind === 'convergence' ? 8.5 : 1.5,
                completed: false
            });
        }

        // Sanctum Echo Entity Pads inside Void Sanctum (center = 48000, r = 1300)
        this.sanctumEntities = [
            {
                id: 'archivist',
                label: 'ARCHIVIST',
                color: '#00eeff',
                x: this.center - 460,
                y: this.center - 280,
                radius: 44,
                progress: 0,
                holdRequired: 1.3,
                cooldown: 0
            },
            {
                id: 'artificer',
                label: 'ARTIFICER',
                color: '#ff00ff',
                x: this.center + 460,
                y: this.center - 280,
                radius: 44,
                progress: 0,
                holdRequired: 1.3,
                cooldown: 0
            },
            {
                id: 'broker',
                label: 'BROKER',
                color: '#ffd700',
                x: this.center,
                y: this.center + 540,
                radius: 44,
                progress: 0,
                holdRequired: 1.3,
                cooldown: 0
            },
            {
                id: 'architectConduit',
                label: 'ARCHITECT CONDUIT',
                color: '#ffffff',
                x: this.center,
                y: this.center - 1050,
                radius: 58,
                progress: 0,
                holdRequired: 2.0,
                summonedThisRun: false
            },
            {
                id: 'arsenalConduit',
                label: 'CORE ARSENAL',
                color: '#00ffaa',
                x: this.center,
                y: this.center + 310,
                radius: 46,
                progress: 0,
                holdRequired: 1.1,
                cooldown: 0
            }
        ];

        // Rescue Chambers: Artificer in Ember Rift, Broker in Cryo Spire
        const artPos = this._polar(7200, this.sectorDefs[0].angle + 0.22);
        const brkPos = this._polar(13500, this.sectorDefs[1].angle - 0.18);
        this.rescueChambers = [
            {
                id: 'prison_artificer',
                entityId: 'artificer',
                label: 'ARTIFICER PRISON',
                color: '#ff00ff',
                x: artPos.x,
                y: artPos.y,
                radius: 100,
                progress: 0,
                holdRequired: 2.0,
                wardenSpawned: false,
                rescuedThisRun: false
            },
            {
                id: 'prison_broker',
                entityId: 'broker',
                label: 'BROKER PRISON',
                color: '#ffd700',
                x: brkPos.x,
                y: brkPos.y,
                radius: 100,
                progress: 0,
                holdRequired: 2.0,
                wardenSpawned: false,
                rescuedThisRun: false
            }
        ];

        // 3 Volatile Pact Obelisks in Ring 2/3 (strictly inside sector wedges)
        const pactSpecs = [
            { id: 'pact_ring2', r: 15500, ang: -1.36 },
            { id: 'pact_ring3a', r: 28500, ang: 0.85 },
            { id: 'pact_ring3b', r: 33000, ang: -2.5 }
        ];
        for (const ps of pactSpecs) {
            const rawPp = this._polar(ps.r, ps.ang);
            const pp = this._ensureClearWorldSpot(rawPp.x, rawPp.y, 160);
            this.volatilePacts.push({
                id: ps.id,
                label: 'VOLATILE PACT',
                color: '#ff3366',
                x: pp.x,
                y: pp.y,
                radius: 82,
                progress: 0,
                holdRequired: 1.6,
                completedThisRun: false
            });
        }

        // 4 Inner Expanse Void Tech Vaults (r = 11800, positioned safely inside biome wedges)
        const innerVaultSpecs = [
            { idx: 0, id: 'shotgun', name: 'Shotgun', color: '#00ffff' },
            { idx: 2, id: 'homing', name: 'Homing', color: '#00ffff' },
            { idx: 4, id: 'culling_strike', name: 'Execute Threshold', color: '#ff00ff' },
            { idx: 5, id: 'energy_shield', name: 'Aegis Matrix', color: '#aaddff' }
        ];
        for (const spec of innerVaultSpecs) {
            const rawP = this._polar(11800, spec.idx * step - Math.PI / 2 + 0.28);
            const p = this._ensureClearWorldSpot(rawP.x, rawP.y, 170);
            this._addPerkVault(spec.id, spec.name, p.x, p.y, spec.color, 'INNER VAULT', false);
        }

        // 7 Deep Abyss Elemental Apex Vaults (r = 35500, ang + 0.14)
        const deepVaultPerks = [
            { id: 'meteor', name: 'Meteor Strike' },
            { id: 'glacial_path', name: 'Glacial Path' },
            { id: 'lightning_dash', name: 'Static Charge' },
            { id: 'decay', name: 'Decay' },
            { id: 'corpse_explosion', name: 'Corpse Explosion' },
            { id: 'divine_shield', name: 'Divine Shield' },
            { id: 'petrify', name: 'Petrify' }
        ];
        for (let i = 0; i < count; i++) {
            const def = this.sectorDefs[i];
            const dv = deepVaultPerks[i];
            const p = this._polar(35500, def.angle + 0.14);
            this._addPerkVault(dv.id, dv.name, p.x, p.y, def.color, 'DEEP APEX VAULT', false);
        }

        // 5 Outer Rim & Corner Keystone Vaults (kept clear of radial biome dividers)
        this._addPerkVault('glass_cannon', 'Overclocked Core', 4200, 4200, '#ffd700', 'KEYSTONE VAULT', true);
        this._addPerkVault('avatar_of_fire', 'Absolute Ignition', 91800, 4200, '#ff4422', 'KEYSTONE VAULT', true);
        this._addPerkVault('chaos_inoculation', 'Synthetic Singularity', 91800, 91800, '#33ff66', 'KEYSTONE VAULT', true);
        this._addPerkVault('crimson_dance', 'Hemorrhaging Nanobots', 4200, 91800, '#ff0055', 'KEYSTONE VAULT', true);
        const southKRaw = this._polar(43600, this.sectorDefs[3].angle - 0.16);
        const southK = this._ensureClearWorldSpot(southKRaw.x, southKRaw.y, 180);
        this._addPerkVault('ancestral_bond', 'Autonomous Architect', southK.x, southK.y, '#00eeff', 'KEYSTONE VAULT', true);

        // Great Abyssal Moat (r = 26500, halfWidth = 170, bridge gap ±0.032 rad, ForceGate halfSpan = 560)
        for (let i = 0; i < count; i++) {
            const def = this.sectorDefs[i];
            const ang = def.angle;

            const a0 = ang + 0.032;
            const a1 = ang + step - 0.032;
            this._addArcChasm(26500, a0, a1, 6, 170, def.color);

            const gb1 = this._polar(26150, ang);
            const gb2 = this._polar(26850, ang);
            this._addBridge(gb1.x, gb1.y, gb2.x, gb2.y, 280, def.color, def.id);

            const bc = this._polar(26500, ang);
            const tx = -Math.sin(ang);
            const ty = Math.cos(ang);
            const halfSpan = 560;
            const gx1 = bc.x - tx * halfSpan;
            const gy1 = bc.y - ty * halfSpan;
            const gx2 = bc.x + tx * halfSpan;
            const gy2 = bc.y + ty * halfSpan;
            // Side abutment pylons bridge the 560..710 seam between ForceGate tip and moat bank
            this._addWall(bc.x - tx * 710, bc.y - ty * 710, bc.x - tx * 555, bc.y - ty * 555, def.color, 18);
            this._addWall(bc.x + tx * 555, bc.y + ty * 555, bc.x + tx * 710, bc.y + ty * 710, def.color, 18);
            this.forceGates.push({
                id: `gate_${def.id}`,
                element: def.id,
                name: def.name,
                color: def.color,
                cx: bc.x,
                cy: bc.y,
                x1: gx1, y1: gy1,
                x2: gx2, y2: gy2,
                thickness: 20,
                minX: Math.min(gx1, gx2) - 24,
                maxX: Math.max(gx1, gx2) + 24,
                minY: Math.min(gy1, gy2) - 24,
                maxY: Math.max(gy1, gy2) + 24
            });
        }

        // Flanking Causeway Chasms & Bridges guarding the 5 Outer Keystone Vaults (scaled: dist 550, halfWidth 90, bridge width 180)
        for (const v of this.perkVaults) {
            if (!v.isKeystone) continue;
            const inAng = Math.atan2(this.center - v.y, this.center - v.x);
            const acX = v.x + Math.cos(inAng) * 550;
            const acY = v.y + Math.sin(inAng) * 550;
            const px = -Math.sin(inAng);
            const py = Math.cos(inAng);
            this._addChasm(acX + px * 190, acY + py * 190, acX + px * 620, acY + py * 620, 90, v.color);
            this._addChasm(acX - px * 190, acY - py * 190, acX - px * 620, acY - py * 620, 90, v.color);
            this._addBridge(
                v.x + Math.cos(inAng) * 740,
                v.y + Math.sin(inAng) * 740,
                v.x + Math.cos(inAng) * 360,
                v.y + Math.sin(inAng) * 360,
                180,
                v.color,
                'void'
            );
        }

        // Tag 3 Vaults as timed/breachable bonus vaults
        const timedBonusIds = new Set(['homing', 'lightning_dash', 'divine_shield']);
        for (const v of this.perkVaults) {
            v.isTimedBonus = timedBonusIds.has(v.perkId);
        }

        // v2.3 Living World POIs (19 Sites: 7 Extractor Rigs, 7 Warband Strongholds, 2 Slot Forges, 3 Mythic Vaults)
        for (let i = 0; i < count; i++) {
            const def = this.sectorDefs[i];
            const rigRaw = this._polar(6200, def.angle - 0.16);
            const rigPos = this._ensureClearWorldSpot(rigRaw.x, rigRaw.y, 165);
            this.extractorRigs.push({
                id: `rig_${def.id}`,
                element: def.id,
                name: `${def.name} EXTRACTOR`,
                color: def.color,
                x: rigPos.x,
                y: rigPos.y,
                radius: 120,
                progress: 0,
                holdRequired: 4.5,
                guardsSpawned: false,
                capturedThisRun: false
            });

            const shRaw = this._polar(16600, def.angle + 0.16);
            const shPos = this._ensureClearWorldSpot(shRaw.x, shRaw.y, 190);
            this.strongholds.push({
                id: `stronghold_${def.id}`,
                element: def.id,
                name: `${def.name} STRONGHOLD`,
                zoneLevel: (def.baseZoneLevel || 1) + 5,
                color: def.color,
                x: shPos.x,
                y: shPos.y,
                radius: 165,
                progress: 0,
                holdRequired: 3.5,
                garrisonSpawned: false,
                capturedThisRun: false
            });
        }

        const auxRaw = this._polar(9600, this.sectorDefs[3].angle - 0.28);
        const auxPos = this._ensureClearWorldSpot(auxRaw.x, auxRaw.y, 165);
        const relicForgeRaw = this._polar(14900, this.sectorDefs[1].angle + 0.26);
        const relicForgePos = this._ensureClearWorldSpot(relicForgeRaw.x, relicForgeRaw.y, 165);
        this.slotForges.push(
            {
                id: 'forge_auxiliary',
                slotKey: 'auxiliary',
                label: 'AUXILIARY CORE FORGE',
                color: '#00ffaa',
                x: auxPos.x,
                y: auxPos.y,
                radius: 125,
                progress: 0,
                holdRequired: 3.0,
                wardenSpawned: false,
                unlockedThisRun: false
            },
            {
                id: 'forge_relic',
                slotKey: 'relic',
                label: 'APEX RELIC FORGE',
                color: '#ffcc33',
                x: relicForgePos.x,
                y: relicForgePos.y,
                radius: 135,
                progress: 0,
                holdRequired: 3.5,
                wardenSpawned: false,
                unlockedThisRun: false
            }
        );

        const mythicSpecs = [
            {
                id: 'mythic_vault_north',
                relicId: 'relic_aegis_starforge',
                name: 'Aegis Starforge Core',
                color: '#ffcc33',
                r: 30800,
                ang: this.sectorDefs[0].angle + 0.27
            },
            {
                id: 'mythic_vault_sw',
                relicId: 'relic_chrono_singularity',
                name: 'Chrono-Singularity Heart',
                color: '#00eeff',
                r: 32200,
                ang: this.sectorDefs[4].angle - 0.26
            },
            {
                id: 'mythic_vault_se',
                relicId: 'relic_void_harvester',
                name: 'Void Harvester Engine',
                color: '#ff66cc',
                r: 32800,
                ang: this.sectorDefs[3].angle + 0.27
            }
        ];
        for (const ms of mythicSpecs) {
            const rawPt = this._polar(ms.r, ms.ang);
            const pt = this._ensureClearWorldSpot(rawPt.x, rawPt.y, 165);
            this.mythicVaults.push({
                id: ms.id,
                relicId: ms.relicId,
                name: ms.name,
                color: ms.color,
                x: pt.x,
                y: pt.y,
                radius: 135,
                progress: 0,
                holdRequired: 3.5,
                wardenSpawned: false,
                collectedThisRun: false
            });
        }

        // Outer Rim Hyper-Conduits, 14 Astral Crystal Geodes & 7 Abyssal Anomalies (Rings 3-4)
        for (let i = 0; i < count; i++) {
            const def = this.sectorDefs[i];
            const ang = def.angle;

            // Radial Outer Hyper-Conduit (1.75x speed from Ring 3 out to Ring 4)
            const hc1 = this._polar(27800, ang + 0.31);
            const hc2 = this._polar(40800, ang + 0.31);
            this._addBoostStrip(hc1.x, hc1.y, hc2.x, hc2.y, 120, def.color, def.id, 1.75);

            // Intra-Biome Rim Sprint Lane across Ring 4
            const rimStart = this._polar(39800, ang - 0.28);
            const rimEnd = this._polar(39800, ang + 0.28);
            this._addBoostStrip(rimStart.x, rimStart.y, rimEnd.x, rimEnd.y, 115, def.color, def.id, 1.75);

            // 2 Crystal Geodes per sector (Ring 3 + Ring 4 -> 14 total)
            const geodeSpecs = [
                { suffix: 'r3', r: 34200, da: -0.28, crystals: 1 },
                { suffix: 'r4', r: 41800, da: 0.18, crystals: 2 }
            ];
            for (const gs of geodeSpecs) {
                const rawG = this._polar(gs.r, ang + gs.da);
                const gPt = this._ensureClearWorldSpot(rawG.x, rawG.y, 130);
                this.crystalGeodes.push({
                    id: `geode_${def.id}_${gs.suffix}`,
                    element: def.id,
                    name: `${def.name} CRYSTAL GEODE`,
                    color: '#ffd700',
                    accent: def.color,
                    x: gPt.x,
                    y: gPt.y,
                    radius: 95,
                    progress: 0,
                    holdRequired: 2.4,
                    crystals: gs.crystals,
                    wardensSpawned: false,
                    collectedThisRun: false
                });
            }

            // 1 Abyssal Anomaly per sector (Ring 4 -> 7 total)
            const rawA = this._polar(40200, ang - 0.12);
            const aPt = this._ensureClearWorldSpot(rawA.x, rawA.y, 145);
            this.abyssalAnomalies.push({
                id: `anomaly_${def.id}`,
                element: def.id,
                name: `${def.name} ABYSSAL RIFT`,
                color: '#ff00ff',
                accent: def.color,
                x: aPt.x,
                y: aPt.y,
                radius: 115,
                progress: 0,
                holdRequired: 3.0,
                ambushSpawned: false,
                clearedThisRun: false
            });

            // 1 Permanent Outer-Rim Return Portal at outer edge of each biome (r = 44600)
            const rawPortal = this._polar(44600, ang + 0.04);
            const portalPt = this._ensureClearWorldSpot(rawPortal.x, rawPortal.y, 130);
            this.rimPortals.push({
                id: `rim_portal_${def.id}`,
                element: def.id,
                name: `${def.name} RIM RETURN`,
                color: '#00ffff',
                accent: def.color,
                x: portalPt.x,
                y: portalPt.y,
                radius: 92,
                progress: 0,
                holdRequired: 1.6
            });
        }

        // Gather landmarks to keep hazards & decorative props safely clear of interactive pads
        const landmarks = [
            ...this.monoliths,
            ...this.outpostBeacons,
            ...this.deepBeacons,
            ...this.shrines,
            ...this.perkVaults,
            ...this.rescueChambers,
            ...this.volatilePacts,
            ...this.extractorRigs,
            ...this.strongholds,
            ...this.slotForges,
            ...this.mythicVaults,
            ...this.crystalGeodes,
            ...this.abyssalAnomalies,
            ...this.rimPortals
        ];
        const isSpotClearOfLandmarks = (x, y, minPad = 360) => {
            if (!this.isPointClear(x, y, 130)) return false;
            for (const lm of landmarks) {
                if (Math.hypot(x - lm.x, y - lm.y) < minPad) return false;
            }
            for (const bs of this.boostStrips) {
                const cp = closestPointOnWallSegment(x, y, bs.x1, bs.y1, bs.x2, bs.y2);
                if (Math.hypot(x - cp.x, y - cp.y) < 260) return false;
            }
            return true;
        };

        // 56 Procedural Hazards (8 per biome across Rings 1-3, radius: 220..260)
        const hazardKinds = {
            fire: { kind: 'magma_vent', label: 'MAGMA VENT' },
            frost: { kind: 'cryo_patch', label: 'CRYO SLICK' },
            storm: { kind: 'arc_pylon', label: 'ARC PYLON' },
            toxin: { kind: 'miasma_pool', label: 'MIASMA POOL' },
            blood: { kind: 'sanguine_altar', label: 'BLOOD ALTAR' },
            holy: { kind: 'solar_flare', label: 'SOLAR FLARE' },
            earth: { kind: 'seismic_fault', label: 'SEISMIC FAULT' }
        };
        const hazardSpecs = [
            [4900, -0.23], [8800, 0.21], [12600, -0.19],
            [16800, 0.24], [21800, -0.25], [24800, 0.19],
            [29600, 0.23], [34600, -0.21]
        ];
        for (let i = 0; i < count; i++) {
            const def = this.sectorDefs[i];
            const ang = def.angle;
            const hSpec = hazardKinds[def.id] || { kind: 'magma_vent', label: 'HAZARD' };
            for (let hi = 0; hi < hazardSpecs.length; hi++) {
                const [baseR, baseDa] = hazardSpecs[hi];
                let hpPos = this._polar(baseR, ang + baseDa);
                const drList = [0, 380, -380, 760, -760];
                const daList = [0, 0.045, -0.045, 0.09, -0.09];
                let placed = false;
                for (const dr of drList) {
                    for (const da of daList) {
                        const cand = this._polar(baseR + dr, ang + baseDa + da);
                        if (isSpotClearOfLandmarks(cand.x, cand.y, 420)) {
                            hpPos = cand;
                            placed = true;
                            break;
                        }
                    }
                    if (placed) break;
                }
                const rad = 220 + ((i * 19 + hi * 23) % 41);
                this.hazards.push({
                    id: `haz_${def.id}_${hi}`,
                    element: def.id,
                    kind: hSpec.kind,
                    label: hSpec.label,
                    color: def.color,
                    x: hpPos.x,
                    y: hpPos.y,
                    radius: rad,
                    period: 4.4,
                    phase: ((i * 0.7 + hi * 1.1) % 4.4),
                    timer: ((i * 0.7 + hi * 1.1) % 4.4),
                    state: 'dormant'
                });
            }
        }

        // Biome Environmental Decor Props across Rings 1-4
        const propKinds = {
            fire: 'obsidian_pillar',
            frost: 'ice_crystal',
            storm: 'pcb_node',
            toxin: 'spore_pod',
            blood: 'blood_obelisk',
            holy: 'astral_star',
            earth: 'tectonic_monolith'
        };
        const propRadii = [3800, 5600, 7600, 10000, 12800, 15400, 18200, 22400, 24800, 28600, 32600, 36800, 41200];
        const propAngles = [-0.32, -0.17, 0.17, 0.32];
        for (let i = 0; i < count; i++) {
            const def = this.sectorDefs[i];
            const pKind = propKinds[def.id] || 'obsidian_pillar';
            for (let ri = 0; ri < propRadii.length; ri++) {
                for (let ai = 0; ai < propAngles.length; ai++) {
                    if ((ri + ai + i) % 2 !== 0) continue;
                    const r = propRadii[ri] + ((i * 97 + ri * 53 + ai * 31) % 420) - 210;
                    const a = def.angle + propAngles[ai] + (((i + ri) % 3) - 1) * 0.025;
                    const pt = this._polar(r, a);
                    if (!isSpotClearOfLandmarks(pt.x, pt.y, 320)) continue;
                    const scale = 0.85 + ((i * 7 + ri * 11 + ai * 13) % 5) * 0.14;
                    const rot = ((i * 1.3 + ri * 0.7 + ai * 0.9) % (Math.PI * 2));
                    this._addDecorProp(pKind, pt.x, pt.y, def.color, scale, rot);
                }
            }
        }
    }

    getSectorAt(x, y) {
        if (this.isDescentMap) {
            return {
                id: 'singularity_descent',
                name: 'SINGULARITY CRUCIBLE',
                ring: 0,
                ringName: 'ENDLESS ARENA',
                zoneLevel: 1,
                tier: 1.0,
                color: '#ff22ee',
                enemies: ['grunt', 'rogue', 'brute', 'ranger', 'sentinel', 'wraith', 'shieldbearer', 'slime']
            };
        }
        const dx = x - this.center;
        const dy = y - this.center;
        const dist = Math.hypot(dx, dy);
        if (dist < this.sanctumRadius) {
            return {
                id: 'void',
                name: 'VOID SANCTUM',
                ring: 0,
                ringName: 'SAFE SANCTUM',
                zoneLevel: 0,
                tier: 1.0,
                color: '#00ffff',
                enemies: []
            };
        }
        const count = this.sectorDefs.length;
        const step = (Math.PI * 2) / count;
        const rawAngle = Math.atan2(dy, dx);
        const rel = (((rawAngle + Math.PI / 2 + step / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const idx = Math.floor(rel / step) % count;
        const def = this.sectorDefs[idx];

        let ring = 1;
        let ringName = 'FRONTIER MARCHES';
        let zoneLevel = def.baseZoneLevel;
        if (dist < 14500) {
            ring = 1;
            ringName = 'FRONTIER MARCHES';
            const span1 = Math.max(1000, 14500 - this.sanctumRadius);
            const radialOffset = Math.floor(((dist - this.sanctumRadius + 1e-6) / span1) * 6);
            zoneLevel = def.baseZoneLevel + radialOffset;
        } else if (dist < 26500) {
            ring = 2;
            ringName = 'CITADEL EXPANSE';
            const radialOffset = 6 + Math.floor(((dist - 14500 + 1e-6) / 12000) * 6);
            zoneLevel = def.baseZoneLevel + radialOffset;
        } else if (dist < 39000) {
            ring = 3;
            ringName = 'DEEP ABYSS';
            const radialOffset = 14 + Math.floor(((dist - 26500 + 1e-6) / 12500) * 10);
            zoneLevel = def.baseZoneLevel + radialOffset;
        } else {
            ring = 4;
            ringName = 'SINGULARITY RIM';
            zoneLevel = Math.max(75, def.baseZoneLevel + 25 + Math.floor((dist - 39000 + 1e-6) / 1200));
        }

        return {
            id: def.id,
            name: def.name,
            ring,
            ringName,
            baseZoneLevel: def.baseZoneLevel,
            zoneLevel,
            levelLabel: def.levelLabel,
            color: def.color,
            tier: 1 + zoneLevel * 0.12,
            enemies: def.enemies
        };
    }

    resolveCircleWalls(entity) {
        const r = entity.radius || 10;
        const candidates = this._getCandidateWalls(entity.x - r - 20, entity.y - r - 20, entity.x + r + 20, entity.y + r + 20);
        let totalPush = 0;
        for (const w of candidates) {
            if (
                entity.x + r < w.minX ||
                entity.x - r > w.maxX ||
                entity.y + r < w.minY ||
                entity.y - r > w.maxY
            ) {
                continue;
            }
            const cp = closestPointOnWallSegment(entity.x, entity.y, w.x1, w.y1, w.x2, w.y2);
            let dx = entity.x - cp.x;
            let dy = entity.y - cp.y;
            let dist = Math.hypot(dx, dy);
            const minDist = r + w.thickness;
            if (dist < minDist) {
                let nx, ny;
                if (dist < 0.0001) {
                    const segLen = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
                    nx = -(w.y2 - w.y1) / segLen;
                    ny = (w.x2 - w.x1) / segLen;
                } else {
                    nx = dx / dist;
                    ny = dy / dist;
                }
                const push = minDist - dist;
                entity.x += nx * push;
                entity.y += ny * push;
                totalPush += push;
            }
        }
        return totalPush > 0.5;
    }

    hitWall(x, y, radius = 4) {
        const candidates = this._getCandidateWalls(x - radius - 20, y - radius - 20, x + radius + 20, y + radius + 20);
        for (const w of candidates) {
            if (
                x + radius < w.minX ||
                x - radius > w.maxX ||
                y + radius < w.minY ||
                y - radius > w.maxY
            ) {
                continue;
            }
            const cp = closestPointOnWallSegment(x, y, w.x1, w.y1, w.x2, w.y2);
            if (Math.hypot(x - cp.x, y - cp.y) < radius + w.thickness) {
                return true;
            }
        }
        return false;
    }

    isCircleBlocked(x, y, radius = 14, canCrossChasms = false) {
        if (this.isDescentMap) {
            const half = (this.descentBoundSize || 2600) * 0.5;
            const c = this.descentCornerChamfer || 340;
            const dx = Math.abs(x - this.center);
            const dy = Math.abs(y - this.center);
            if (dx > half - radius - 12 || dy > half - radius - 12) {
                return true;
            }
            if (dx + dy > (half * 2 - c - radius * 1.42 - 14)) {
                return true;
            }
            return this.hitWall(x, y, radius);
        }
        if (x < radius + 12 || x > this.size - radius - 12 || y < radius + 12 || y > this.size - radius - 12) {
            return true;
        }
        if (this.hitWall(x, y, radius)) return true;
        if (!canCrossChasms && this.getChasmsInRect) {
            const chasms = this.getChasmsInRect(x - radius - 120, y - radius - 120, x + radius + 120, y + radius + 120);
            for (const ch of chasms) {
                if (x + radius < ch.minX || x - radius > ch.maxX || y + radius < ch.minY || y - radius > ch.maxY) continue;
                const cp = closestPointOnWallSegment(x, y, ch.x1, ch.y1, ch.x2, ch.y2);
                if (Math.hypot(x - cp.x, y - cp.y) < radius + ch.halfWidth) return true;
            }
        }
        for (const g of this.forceGates) {
            if (this.isForceGateOpen(g)) continue;
            if (x + radius + g.thickness < g.minX || x - radius - g.thickness > g.maxX || y + radius + g.thickness < g.minY || y - radius - g.thickness > g.maxY) continue;
            const cp = closestPointOnWallSegment(x, y, g.x1, g.y1, g.x2, g.y2);
            if (Math.hypot(x - cp.x, y - cp.y) < radius + g.thickness) return true;
        }
        return false;
    }

    reflectOrCollideProjectile(proj) {
        const r = proj.radius || 4;
        const candidates = this._getCandidateWalls(proj.x - r - 20, proj.y - r - 20, proj.x + r + 20, proj.y + r + 20);
        for (const w of candidates) {
            if (
                proj.x + r < w.minX ||
                proj.x - r > w.maxX ||
                proj.y + r < w.minY ||
                proj.y - r > w.maxY
            ) {
                continue;
            }
            const cp = closestPointOnWallSegment(proj.x, proj.y, w.x1, w.y1, w.x2, w.y2);
            let dx = proj.x - cp.x;
            let dy = proj.y - cp.y;
            let dist = Math.hypot(dx, dy);
            const minDist = r + w.thickness;
            if (dist < minDist) {
                if (proj._lastWallId === w.id) return 'none';
                if (proj.bounce > 0) {
                    if (dist < 0.0001) {
                        const segLen = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
                        dx = -(w.y2 - w.y1) / segLen;
                        dy = (w.x2 - w.x1) / segLen;
                        dist = 1;
                    }
                    const nx = dx / dist;
                    const ny = dy / dist;
                    proj.x = cp.x + nx * (minDist + 1.5);
                    proj.y = cp.y + ny * (minDist + 1.5);
                    const dot = proj.vx * nx + proj.vy * ny;
                    if (dot < 0) {
                        proj.vx -= 2 * dot * nx;
                        proj.vy -= 2 * dot * ny;
                    }
                    proj._lastWallId = w.id;
                    return 'bounced';
                }
                return 'blocked';
            }
        }
        return 'none';
    }
}


