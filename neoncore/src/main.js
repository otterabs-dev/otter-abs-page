// src/main.js

const STATE = {
  MENU: 0,
  SHOP: 1,
  PLAYING: 2,
  LEVEL_UP: 3,
  GAME_OVER: 4,
  PAUSED: 5,
  CHARACTER: 6,
  ARSENAL: 7,
  SANCTUM_HUB: 8
};

let currentState = STATE.MENU;
let lastTime = 0;
let game = null;
let currentPerkChoices = [];
let revivesUsed = 0; // Track revives in the current run
let currentRerollCount = 0;
let currentRerollChoices = 3;
let currentLevelUpIgnoreMinLevel = false;
let currentPerkTab = 'void';
let hasDoubledCurrency = false;
let currentCarouselSlot = 1;

function _ensureNeonNoticeUi() {
  if (typeof document === 'undefined' || !document.head || !document.body) return null;
  if (!document.getElementById('neonNoticeStyles')) {
    const style = document.createElement('style');
    style.id = 'neonNoticeStyles';
    style.textContent = `
      #neonNoticeHost {
        position: fixed;
        top: calc(env(safe-area-inset-top, 0px) + 18px);
        left: 50%;
        transform: translateX(-50%);
        z-index: 12000;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        width: min(92vw, 440px);
        pointer-events: none;
      }
      .nc-notice-card {
        position: relative;
        width: 100%;
        pointer-events: auto;
        background: linear-gradient(155deg, rgba(8, 17, 36, 0.96), rgba(4, 9, 22, 0.94));
        border: 1px solid var(--nc-tone, #00ffff);
        border-radius: 12px;
        padding: 13px 16px 15px 16px;
        color: #e6f6ff;
        font-family: 'Orbitron', 'Rajdhani', system-ui, -apple-system, sans-serif;
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.65), 0 0 18px color-mix(in srgb, var(--nc-tone, #00ffff) 28%, transparent);
        overflow: hidden;
        cursor: pointer;
        opacity: 0;
        transform: translateY(-10px) scale(0.98);
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      .nc-notice-card.show {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .nc-notice-title {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 1.6px;
        text-transform: uppercase;
        color: var(--nc-tone, #00ffff);
        margin-bottom: 4px;
      }
      .nc-notice-msg {
        font-size: 13px;
        line-height: 1.42;
        color: #dceeff;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        font-weight: 500;
      }
      .nc-notice-bar {
        position: absolute;
        left: 0;
        bottom: 0;
        height: 3px;
        width: 100%;
        background: var(--nc-tone, #00ffff);
        transform-origin: left center;
        animation: ncNoticeDrain var(--nc-dur, 3200ms) linear forwards;
      }
      @keyframes ncNoticeDrain {
        from { transform: scaleX(1); }
        to { transform: scaleX(0); }
      }
      #neonConfirmBackdrop {
        position: fixed;
        inset: 0;
        z-index: 12500;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(2, 6, 16, 0.78);
        backdrop-filter: blur(8px);
      }
      .nc-confirm-dialog {
        width: min(92vw, 430px);
        background: linear-gradient(160deg, rgba(10, 20, 42, 0.98), rgba(5, 10, 24, 0.97));
        border: 1px solid var(--nc-tone, #ff3366);
        border-radius: 14px;
        padding: 22px 20px 18px 20px;
        color: #eef7ff;
        box-shadow: 0 22px 60px rgba(0, 0, 0, 0.75), 0 0 24px color-mix(in srgb, var(--nc-tone, #ff3366) 28%, transparent);
      }
      .nc-confirm-title {
        font-family: 'Orbitron', system-ui, sans-serif;
        font-size: 15px;
        font-weight: 800;
        letter-spacing: 1.4px;
        text-transform: uppercase;
        color: var(--nc-tone, #ff3366);
        margin-bottom: 10px;
      }
      .nc-confirm-msg {
        font-size: 14px;
        line-height: 1.5;
        color: #cfe6ff;
        margin-bottom: 20px;
      }
      .nc-confirm-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      }
      .nc-confirm-btn {
        min-height: 40px;
        padding: 9px 18px;
        border-radius: 8px;
        font-family: 'Orbitron', system-ui, sans-serif;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 1px;
        cursor: pointer;
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: rgba(15, 28, 52, 0.85);
        color: #cbd5e1;
      }
      .nc-confirm-btn.primary {
        border-color: var(--nc-tone, #ff3366);
        background: color-mix(in srgb, var(--nc-tone, #ff3366) 22%, rgba(8, 16, 32, 0.95));
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);
  }
  let host = document.getElementById('neonNoticeHost');
  if (!host) {
    host = document.createElement('div');
    host.id = 'neonNoticeHost';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  return host;
}

function showNeonNotice(message, opts = {}) {
  const toneColors = {
    info: '#00ffff',
    warn: '#ffb703',
    danger: '#ff3366',
    success: '#22ffaa'
  };
  const tone = opts.tone || 'warn';
  const toneColor = toneColors[tone] || toneColors.warn;
  const title = opts.title || (tone === 'danger' ? 'SYSTEM ALERT' : (tone === 'info' ? 'SYSTEM NOTICE' : 'NOTICE'));
  const duration = Math.max(1400, Number(opts.duration) || 3200);
  if (typeof NeonAudio !== 'undefined' && NeonAudio && typeof NeonAudio.playClick === 'function') {
    try { NeonAudio.playClick(); } catch (_) {}
  }
  const host = _ensureNeonNoticeUi();
  if (!host) return null;
  while (host.children.length >= 2) {
    host.removeChild(host.firstChild);
  }
  const card = document.createElement('div');
  card.className = 'nc-notice-card';
  card.style.setProperty('--nc-tone', toneColor);
  card.style.setProperty('--nc-dur', `${duration}ms`);

  const titleEl = document.createElement('div');
  titleEl.className = 'nc-notice-title';
  titleEl.textContent = title;
  const msgEl = document.createElement('div');
  msgEl.className = 'nc-notice-msg';
  msgEl.textContent = String(message || '');
  const barEl = document.createElement('div');
  barEl.className = 'nc-notice-bar';

  card.appendChild(titleEl);
  card.appendChild(msgEl);
  card.appendChild(barEl);
  host.appendChild(card);

  const dismiss = () => {
    if (!card.parentNode) return;
    card.classList.remove('show');
    setTimeout(() => {
      if (card.parentNode) card.parentNode.removeChild(card);
    }, 200);
  };
  card.addEventListener('click', dismiss);
  requestAnimationFrame(() => card.classList.add('show'));
  setTimeout(dismiss, duration);
  return card;
}

function showNeonConfirm(opts = {}) {
  const host = _ensureNeonNoticeUi();
  if (!host || typeof document === 'undefined' || !document.body) {
    return Promise.resolve(false);
  }
  const prev = document.getElementById('neonConfirmBackdrop');
  if (prev && prev.parentNode) prev.parentNode.removeChild(prev);

  const toneColors = {
    info: '#00ffff',
    warn: '#ffb703',
    danger: '#ff3366'
  };
  const toneColor = toneColors[opts.tone || 'danger'] || toneColors.danger;

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.id = 'neonConfirmBackdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    const dialog = document.createElement('div');
    dialog.className = 'nc-confirm-dialog';
    dialog.style.setProperty('--nc-tone', toneColor);

    const titleEl = document.createElement('div');
    titleEl.className = 'nc-confirm-title';
    titleEl.textContent = opts.title || 'CONFIRM ACTION';

    const msgEl = document.createElement('div');
    msgEl.className = 'nc-confirm-msg';
    msgEl.textContent = String(opts.message || '');

    const actions = document.createElement('div');
    actions.className = 'nc-confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'nc-confirm-btn';
    cancelBtn.textContent = opts.cancelLabel || 'CANCEL';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'nc-confirm-btn primary';
    confirmBtn.textContent = opts.confirmLabel || 'CONFIRM';

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    dialog.appendChild(titleEl);
    dialog.appendChild(msgEl);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('keydown', onKey);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      resolve(Boolean(ok));
    };
    const onKey = (ev) => {
      if (ev.code === 'Escape') finish(false);
    };
    window.addEventListener('keydown', onKey);
    cancelBtn.addEventListener('click', () => finish(false));
    confirmBtn.addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', (ev) => {
      if (ev.target === backdrop) finish(false);
    });
  });
}

if (typeof window !== 'undefined') {
  window.showNeonNotice = showNeonNotice;
  window.showNeonConfirm = showNeonConfirm;
}

function _applyNativeShellSafeAreaFix(force = false) {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.documentElement) return false;
  const isNative = Boolean(force || window.OtterAdsChannel || window.OtterStorageChannel || window.OtterHapticsChannel);
  if (!isNative) return false;
  document.documentElement.classList.add('nc-native-shell');
  if (document.head && !document.getElementById('neonNativeShellFix')) {
    const style = document.createElement('style');
    style.id = 'neonNativeShellFix';
    style.textContent = `
      html.nc-native-shell #inGameHud {
        padding-top: 0px !important;
        padding-bottom: 0px !important;
      }
      html.nc-native-shell #inGameHud .hud-top {
        padding-top: 4px !important;
      }
      html.nc-native-shell #shopMenu:not(.hidden),
      html.nc-native-shell #arsenalMenu:not(.hidden),
      html.nc-native-shell #sanctumHubMenu:not(.hidden),
      html.nc-native-shell #mainMenu:not(.hidden),
      html.nc-native-shell #pauseMenu:not(.hidden),
      html.nc-native-shell #levelUpMenu:not(.hidden) {
        padding-top: 12px !important;
        padding-bottom: 12px !important;
      }
      html.nc-native-shell #menuCurrencyBadge { top: 10px !important; }
      html.nc-native-shell .btn-floating { top: 12px !important; }
      html.nc-native-shell #neonNoticeHost { top: 12px !important; }
    `;
    document.head.appendChild(style);
  }
  return true;
}

if (typeof window !== 'undefined') {
  window._applyNativeShellSafeAreaFix = _applyNativeShellSafeAreaFix;
  _applyNativeShellSafeAreaFix(false);
}

let _adReqSeq = 0;
const _pendingAdCallbacks = new Map();

if (typeof window !== 'undefined') {
  window.__onOtterAdResult = (requestId, granted) => {
    const entry = _pendingAdCallbacks.get(requestId);
    if (!entry) return;
    _pendingAdCallbacks.delete(requestId);
    if (entry.timer) clearTimeout(entry.timer);
    entry.resolve(Boolean(granted));
  };
}

const NeonAds = {
  WEB_INTERSTITIAL_COOLDOWN_MS: 7 * 60 * 1000,
  _lastWebInterstitialAt: 0,
  _adPlaybackSuspended: false,
  _savedMasterGain: null,

  isNativeApp() {
    return (
      typeof window !== 'undefined' &&
      Boolean(window.OtterAdsChannel && typeof window.OtterAdsChannel.postMessage === 'function')
    );
  },

  isWebH5AdsReady() {
    return typeof window !== 'undefined' && typeof window.adBreak === 'function';
  },

  isRewardedAvailable() {
    return this.isNativeApp() || this.isWebH5AdsReady();
  },

  syncWebAdConfig() {
    if (this.isNativeApp() || typeof window === 'undefined' || typeof window.adConfig !== 'function') return;
    try {
      const muted = typeof Meta !== 'undefined' && Boolean(Meta.isSoundMuted && Meta.isSoundMuted());
      window.adConfig({
        preloadAdBreaks: 'on',
        sound: muted ? 'off' : 'on'
      });
    } catch (_) {}
  },

  _setAdPlaybackSuspended(active) {
    const shouldSuspend = Boolean(active);
    if (shouldSuspend) {
      if (this._adPlaybackSuspended) return;
      this._adPlaybackSuspended = true;
      if (typeof NeonAudio !== 'undefined') {
        if (NeonAudio.master && NeonAudio.master.gain) {
          this._savedMasterGain = NeonAudio.master.gain.value;
          NeonAudio.master.gain.value = 0;
        }
        if (NeonAudio.ctx && NeonAudio.ctx.state === 'running' && typeof NeonAudio.ctx.suspend === 'function') {
          NeonAudio.ctx.suspend().catch(() => {});
        }
      }
      if (typeof Input !== 'undefined') {
        Input.paused = true;
        if (Input.reset) Input.reset();
      }
      return;
    }

    if (!this._adPlaybackSuspended) return;
    this._adPlaybackSuspended = false;
    if (typeof NeonAudio !== 'undefined') {
      const muted = typeof NeonAudio._isMuted === 'function' && NeonAudio._isMuted();
      if (NeonAudio.master && NeonAudio.master.gain && this._savedMasterGain !== null) {
        NeonAudio.master.gain.value = muted ? 0 : this._savedMasterGain;
      }
      this._savedMasterGain = null;
      if (!muted && NeonAudio.ctx && NeonAudio.ctx.state === 'suspended' && typeof NeonAudio.ctx.resume === 'function') {
        NeonAudio.ctx.resume().catch(() => {});
      }
    }
    if (typeof Input !== 'undefined') {
      Input.paused = !(typeof currentState !== 'undefined' && typeof STATE !== 'undefined' && currentState === STATE.PLAYING);
      if (Input.reset) Input.reset();
    }
    if (typeof performance !== 'undefined') {
      lastTime = performance.now();
    }
  },

  async showRewarded(placement) {
    if (typeof Input !== 'undefined' && Input.reset) Input.reset();

    if (this.isNativeApp()) {
      const requestId = `ad_${++_adReqSeq}`;
      const granted = await new Promise((resolve) => {
        const timer = setTimeout(() => {
          _pendingAdCallbacks.delete(requestId);
          resolve(false);
        }, 65000);
        _pendingAdCallbacks.set(requestId, { resolve, timer });
        try {
          window.OtterAdsChannel.postMessage(
            JSON.stringify({ action: 'showRewarded', placement, requestId })
          );
        } catch (_) {
          clearTimeout(timer);
          _pendingAdCallbacks.delete(requestId);
          resolve(false);
        }
      });
      lastTime = performance.now();
      return Boolean(granted);
    }

    if (this.isWebH5AdsReady()) {
      if (typeof window !== 'undefined' && window.__neonAdSenseScriptFailed) {
        if (typeof showNeonNotice === 'function') {
          showNeonNotice('Werbung aktuell nicht verfügbar (AdBlocker aktiv?)', 'info');
        }
        return false;
      }
      this.syncWebAdConfig();
      const result = await new Promise((resolve) => {
        let settled = false;
        let adStarted = false;
        let initTimer = null;
        let maxTimer = null;
        const finish = (ok, reason = 'done') => {
          if (settled) return;
          settled = true;
          if (initTimer) clearTimeout(initTimer);
          if (maxTimer) clearTimeout(maxTimer);
          this._setAdPlaybackSuspended(false);
          resolve({ ok: Boolean(ok), reason });
        };
        initTimer = setTimeout(() => {
          if (!adStarted) finish(false, 'unavailable');
        }, 4500);
        maxTimer = setTimeout(() => finish(false, 'timeout'), 65000);
        try {
          window.adBreak({
            type: 'reward',
            name: placement,
            beforeAd: () => {
              adStarted = true;
              if (initTimer) clearTimeout(initTimer);
              this._setAdPlaybackSuspended(true);
            },
            afterAd: () => {
              this._setAdPlaybackSuspended(false);
            },
            beforeReward: (showAdFn) => {
              adStarted = true;
              if (initTimer) clearTimeout(initTimer);
              if (typeof showAdFn === 'function') showAdFn();
              else finish(false, 'unavailable');
            },
            adViewed: () => finish(true, 'viewed'),
            adDismissed: () => finish(false, 'dismissed'),
            adBreakDone: (info) => {
              this._setAdPlaybackSuspended(false);
              if (!settled) {
                finish(
                  Boolean(info && info.breakStatus === 'viewed'),
                  (info && info.breakStatus) || 'done'
                );
              }
            }
          });
        } catch (_) {
          finish(false, 'error');
        }
      });
      if (!result.ok && result.reason !== 'dismissed' && typeof showNeonNotice === 'function') {
        showNeonNotice('Werbespot gerade nicht verfügbar — bitte später erneut versuchen.', 'info');
      }
      lastTime = performance.now();
      return Boolean(result.ok);
    }

    return false;
  },

  async maybeShowInterstitial(placement) {
    if (this.isNativeApp()) {
      const requestId = `int_${++_adReqSeq}`;
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          _pendingAdCallbacks.delete(requestId);
          resolve(false);
        }, 45000);
        _pendingAdCallbacks.set(requestId, { resolve, timer });
        try {
          window.OtterAdsChannel.postMessage(
            JSON.stringify({ action: 'showInterstitial', placement, requestId })
          );
        } catch (_) {
          clearTimeout(timer);
          _pendingAdCallbacks.delete(requestId);
          resolve(false);
        }
      });
      lastTime = performance.now();
      return;
    }

    if (this.isWebH5AdsReady()) {
      if (typeof window !== 'undefined' && window.__neonAdSenseScriptFailed) return;
      const now = Date.now();
      if (this._lastWebInterstitialAt && (now - this._lastWebInterstitialAt) < this.WEB_INTERSTITIAL_COOLDOWN_MS) {
        return;
      }
      this.syncWebAdConfig();
      await new Promise((resolve) => {
        let settled = false;
        let adStarted = false;
        let initTimer = null;
        let maxTimer = null;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (initTimer) clearTimeout(initTimer);
          if (maxTimer) clearTimeout(maxTimer);
          this._setAdPlaybackSuspended(false);
          resolve();
        };
        initTimer = setTimeout(() => {
          if (!adStarted) finish();
        }, 4500);
        maxTimer = setTimeout(finish, 20000);
        try {
          window.adBreak({
            type: 'next',
            name: placement,
            beforeAd: () => {
              adStarted = true;
              if (initTimer) clearTimeout(initTimer);
              this._setAdPlaybackSuspended(true);
            },
            afterAd: () => {
              this._setAdPlaybackSuspended(false);
            },
            adBreakDone: (info) => {
              if (info && (info.breakStatus === 'viewed' || info.breakStatus === 'dismissed')) {
                this._lastWebInterstitialAt = Date.now();
              }
              finish();
            }
          });
        } catch (_) {
          finish();
        }
      });
      lastTime = performance.now();
    }
  },

  syncAdButtonsUI() {
    const avail = this.isRewardedAvailable();
    if (btnStartAd) btnStartAd.style.display = avail ? '' : 'none';
    if (btnReroll) btnReroll.style.display = avail ? '' : 'none';
    if (typeof btnAdCrystal !== 'undefined' && btnAdCrystal) btnAdCrystal.style.display = avail ? '' : 'none';
    if (typeof btnBrokerAdCrystal !== 'undefined' && btnBrokerAdCrystal) btnBrokerAdCrystal.style.display = avail ? '' : 'none';
    if (btnDoubleCurrencyAd) {
      btnDoubleCurrencyAd.style.display = avail && !hasDoubledCurrency ? 'block' : 'none';
      const matterAmt = (typeof game !== 'undefined' && game) ? Math.floor(game.currencyCollected || 0) : 0;
      btnDoubleCurrencyAd.innerText = matterAmt > 0 ? `MATTER x2 (+${matterAmt}) (Ad)` : 'MATTER x2 (Ad)';
    }
    if (btnRevive) {
      btnRevive.innerText = revivesUsed === 0 && avail ? 'REVIVE (Ad)' : 'REVIVE (1 Crystal)';
    }
  }
};

const NeonAudio = {
  ctx: null,
  master: null,
  compressor: null,
  combatBus: null,
  priorityBus: null,
  noiseBuffer: null,
  _noiseBufferCtx: null,
  activeVoices: 0,
  maxActiveVoices: 24,
  xpChainIndex: 0,
  lastXpTime: 0,
  lastShotTime: 0,
  lastHitTime: 0,
  lastKillTime: 0,
  lastCritTime: 0,
  lastStreakTime: 0,
  lastDropTime: 0,
  currentBiome: 'void',
  _lastBiomeTransitionTime: -10000,
  _lastImpactTime: -10000,
  _lastTelegraphTime: -10000,
  _lastShieldBreakTime: -10000,

  BIOME_AUDIO_PROFILES: {
    void: { rootHz: 293.66, scale: [1, 1.1892, 1.3348, 1.4983, 1.7818], wave: 'sine', filterType: 'lowpass', cutoffHz: 950 },
    singularity_descent: { rootHz: 110.0, scale: [1, 1.0595, 1.4142, 1.4983, 1.8877], wave: 'sawtooth', filterType: 'bandpass', cutoffHz: 680 },
    fire: { rootHz: 164.81, scale: [1, 1.0595, 1.2599, 1.4983, 1.5874], wave: 'sawtooth', filterType: 'lowpass', cutoffHz: 1450 },
    frost: { rootHz: 523.25, scale: [1, 1.1225, 1.2599, 1.4142, 1.4983], wave: 'triangle', filterType: 'bandpass', cutoffHz: 2600 },
    storm: { rootHz: 392.0, scale: [1, 1.1225, 1.1892, 1.4983, 1.6818], wave: 'square', filterType: 'highpass', cutoffHz: 1950 },
    toxin: { rootHz: 246.94, scale: [1, 1.1225, 1.2599, 1.4142, 1.6818], wave: 'triangle', filterType: 'bandpass', cutoffHz: 1120 },
    blood: { rootHz: 146.83, scale: [1, 1.1892, 1.3348, 1.5874, 1.8877], wave: 'triangle', filterType: 'lowpass', cutoffHz: 540 },
    holy: { rootHz: 440.0, scale: [1, 1.2599, 1.4983, 1.7818, 2.0], wave: 'sine', filterType: 'highpass', cutoffHz: 1620 },
    earth: { rootHz: 98.0, scale: [1, 1.1892, 1.3348, 1.4983, 1.6818], wave: 'sawtooth', filterType: 'lowpass', cutoffHz: 420 }
  },

  _resolveBiomeId(id) {
    const raw = typeof id === 'string' ? id.trim().toLowerCase() : '';
    const mapped = raw === 'ice' ? 'frost' : (raw === 'lightning' ? 'storm' : (raw === 'poison' ? 'toxin' : raw));
    if (mapped && this.BIOME_AUDIO_PROFILES[mapped]) return mapped;
    return (typeof this.currentBiome === 'string' && this.BIOME_AUDIO_PROFILES[this.currentBiome]) ? this.currentBiome : 'void';
  },

  setBiome(sectorId) {
    this.currentBiome = this._resolveBiomeId(sectorId);
    return this.currentBiome;
  },

  playBiomeTransition(sectorId, ring = 0) {
    if (this._isMuted()) return;
    const now = this._nowMs();
    if (now - this._lastBiomeTransitionTime < 1800) return;
    this._lastBiomeTransitionTime = now;
    const biomeId = this.setBiome(sectorId);
    const profile = this.BIOME_AUDIO_PROFILES[biomeId] || this.BIOME_AUDIO_PROFILES.void;
    this.duckCombat(0.45, 0.32);
    const r = Math.max(0, Math.min(4, Number.isFinite(Number(ring)) ? Number(ring) : 0));
    const ringMult = 1 + r * 0.04;
    const root = profile.rootHz * ringMult;
    const interval = (Array.isArray(profile.scale) && profile.scale[2]) ? profile.scale[2] : 1.4983;
    this._tone(root, root * 1.015, 0.30, profile.wave, 0.14, 0, 'priority', 0.01);
    this._tone(root * interval, root * interval * 1.02, 0.34, 'triangle', 0.11, 0.045, 'priority', 0.01);
    const cutEnd = Math.max(80, profile.cutoffHz * (profile.filterType === 'highpass' ? 0.68 : 1.38) * (1 + r * 0.04));
    this._noiseBurst(profile.filterType, profile.cutoffHz, cutEnd, 2.2, 0.24, 0.09, 'priority', 0);
  },

  _nowMs() {
    return Date.now();
  },

  _isMuted() {
    return typeof Meta !== 'undefined' && Boolean(Meta.isSoundMuted && Meta.isSoundMuted());
  },

  _ensureCtx() {
    if (typeof window === 'undefined' || this._isMuted()) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22;
        this.master.connect(this.ctx.destination);

        let mixTarget = this.master;
        this.compressor = null;
        if (typeof this.ctx.createDynamicsCompressor === 'function') {
          try {
            const comp = this.ctx.createDynamicsCompressor();
            if (comp.threshold) comp.threshold.value = -14;
            if (comp.knee) comp.knee.value = 12;
            if (comp.ratio) comp.ratio.value = 6;
            if (comp.attack) comp.attack.value = 0.004;
            if (comp.release) comp.release.value = 0.14;
            comp.connect(this.master);
            this.compressor = comp;
            mixTarget = comp;
          } catch (_) {
            this.compressor = null;
            mixTarget = this.master;
          }
        }

        this.combatBus = this.ctx.createGain();
        this.combatBus.gain.value = 0.85;
        this.combatBus.connect(mixTarget);

        this.priorityBus = this.ctx.createGain();
        this.priorityBus.gain.value = 1.0;
        this.priorityBus.connect(mixTarget);
      }
      if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch (_) {
      return null;
    }
  },

  _getBus(targetBus = 'combat') {
    if (targetBus === 'priority') return this.priorityBus || this.master;
    return this.combatBus || this.master;
  },

  _acquireVoiceSlot() {
    const cap = this.maxActiveVoices || 24;
    if (this.activeVoices >= cap) return null;
    this.activeVoices += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    };
  },

  _getNoiseBuffer() {
    const ctx = this._ensureCtx();
    if (!ctx) return null;
    if (this.noiseBuffer && this._noiseBufferCtx === ctx) return this.noiseBuffer;
    if (typeof ctx.createBuffer !== 'function') return null;
    try {
      const sampleRate = Math.max(8000, Number(ctx.sampleRate) || 44100);
      const length = Math.max(1, Math.floor(sampleRate * 0.18));
      const buffer = ctx.createBuffer(1, length, sampleRate);
      if (buffer && typeof buffer.getChannelData === 'function') {
        const data = buffer.getChannelData(0);
        if (data) {
          for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() * 2 - 1;
          }
        }
      }
      this.noiseBuffer = buffer;
      this._noiseBufferCtx = ctx;
      return this.noiseBuffer;
    } catch (_) {
      return null;
    }
  },

  duckCombat(level = 0.28, durationSec = 0.45) {
    if (this._isMuted()) return;
    const ctx = this._ensureCtx();
    if (!ctx || !this.combatBus || !this.combatBus.gain) return;
    try {
      const t0 = Number.isFinite(ctx.currentTime) ? ctx.currentTime : 0;
      const targetGain = Math.max(0.0001, Math.min(0.85, Number.isFinite(level) ? level : 0.28));
      const dur = Math.max(0.05, Number.isFinite(durationSec) ? durationSec : 0.45);
      const dipTime = t0 + Math.min(0.025, dur * 0.15);
      const g = this.combatBus.gain;
      const curVal = Math.max(0.0001, Number.isFinite(g.value) ? g.value : 0.85);
      if (typeof g.cancelScheduledValues === 'function') g.cancelScheduledValues(t0);
      if (typeof g.setValueAtTime === 'function') g.setValueAtTime(curVal, t0);
      if (typeof g.linearRampToValueAtTime === 'function') {
        g.linearRampToValueAtTime(targetGain, dipTime);
      } else {
        g.value = targetGain;
      }
      if (typeof g.exponentialRampToValueAtTime === 'function') {
        g.exponentialRampToValueAtTime(0.85, t0 + dur);
      } else if (typeof g.linearRampToValueAtTime === 'function') {
        g.linearRampToValueAtTime(0.85, t0 + dur);
      }
    } catch (_) {}
  },

  unlock() {
    this._ensureCtx();
  },

  _tone(freqStart, freqEnd, durationSec, type = 'sine', gainPeak = 0.25, delaySec = 0, targetBus = 'combat', pitchJitter = 0.02) {
    const ctx = this._ensureCtx();
    if (!ctx || !this.master) return;
    const releaseVoice = this._acquireVoiceSlot();
    if (!releaseVoice) return;
    try {
      const dur = Math.max(0.015, Number.isFinite(durationSec) ? durationSec : 0.1);
      const delay = Math.max(0, Number.isFinite(delaySec) ? delaySec : 0);
      const peak = Math.max(0.0001, Math.min(1.0, Number.isFinite(gainPeak) ? gainPeak : 0.25));
      const jitter = Math.max(0, Math.min(0.15, Number.isFinite(pitchJitter) ? pitchJitter : 0.02));
      const pitchMult = jitter > 0 ? (1 + (Math.random() * 2 - 1) * jitter) : 1;
      const f0 = Math.max(30, (Number.isFinite(freqStart) ? freqStart : 220) * pitchMult);
      const f1 = Math.max(30, (Number.isFinite(freqEnd) ? freqEnd : f0) * pitchMult);
      const baseTime = Number.isFinite(ctx.currentTime) ? ctx.currentTime : 0;
      const t0 = baseTime + delay;
      const attack = Math.min(0.008, dur * 0.35);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(f0, t0);
      if (f1 !== f0) {
        osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      }
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(this._getBus(targetBus));
      osc.onended = releaseVoice;
      osc.start(t0);
      osc.stop(t0 + dur + 0.01);
    } catch (_) {
      releaseVoice();
    }
  },

  _noiseBurst(filterType = 'lowpass', freqStart = 1200, freqEnd = 400, q = 1.5, durationSec = 0.06, gainPeak = 0.12, bus = 'combat', delaySec = 0) {
    if (this._isMuted()) return;
    const ctx = this._ensureCtx();
    if (!ctx || !this.master || typeof ctx.createBufferSource !== 'function') return;
    const buffer = this._getNoiseBuffer();
    if (!buffer) return;
    const releaseVoice = this._acquireVoiceSlot();
    if (!releaseVoice) return;
    try {
      const dur = Math.max(0.015, Math.min(1.0, Number.isFinite(durationSec) ? durationSec : 0.06));
      const delay = Math.max(0, Number.isFinite(delaySec) ? delaySec : 0);
      const f0 = Math.max(30, Number.isFinite(freqStart) ? freqStart : 1200);
      const f1 = Math.max(30, Number.isFinite(freqEnd) ? freqEnd : f0);
      const qVal = Math.max(0.1, Math.min(30, Number.isFinite(q) ? q : 1.5));
      const peak = Math.max(0.0001, Math.min(1.0, Number.isFinite(gainPeak) ? gainPeak : 0.12));
      const baseTime = Number.isFinite(ctx.currentTime) ? ctx.currentTime : 0;
      const t0 = baseTime + delay;
      const attack = Math.min(0.006, dur * 0.3);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      if (dur > 0.18) src.loop = true;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      if (typeof ctx.createBiquadFilter === 'function') {
        const filter = ctx.createBiquadFilter();
        filter.type = filterType || 'lowpass';
        if (filter.Q) {
          if (typeof filter.Q.setValueAtTime === 'function') filter.Q.setValueAtTime(qVal, t0);
          else filter.Q.value = qVal;
        }
        if (filter.frequency) {
          filter.frequency.setValueAtTime(f0, t0);
          if (f1 !== f0) {
            filter.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
          }
        }
        src.connect(filter);
        filter.connect(gain);
      } else {
        src.connect(gain);
      }

      gain.connect(this._getBus(bus));
      src.onended = releaseVoice;
      src.start(t0);
      src.stop(t0 + dur + 0.01);
    } catch (_) {
      releaseVoice();
    }
  },

  haptic(level = 'light') {
    if (
      typeof window !== 'undefined' &&
      window.OtterHapticsChannel &&
      typeof window.OtterHapticsChannel.postMessage === 'function'
    ) {
      try {
        window.OtterHapticsChannel.postMessage(JSON.stringify({ level }));
      } catch (_) {}
    }
  },

  playShoot(element = 'none') {
    if (this._isMuted()) return;
    const now = this._nowMs();
    if (now - this.lastShotTime < 85) return;
    this.lastShotTime = now;
    const alias = element === 'ice' ? 'frost' : (element === 'lightning' ? 'storm' : (element === 'poison' ? 'toxin' : element));
    switch (alias) {
      case 'fire':
        this._noiseBurst('lowpass', 1100, 320, 1.4, 0.065, 0.08, 'combat');
        this._tone(265, 130, 0.055, 'sawtooth', 0.065, 0, 'combat', 0.03);
        break;
      case 'frost':
        this._noiseBurst('bandpass', 2800, 1900, 7.5, 0.05, 0.075, 'combat');
        this._tone(880, 740, 0.05, 'sine', 0.06, 0, 'combat', 0.025);
        this._tone(1245, 1080, 0.045, 'triangle', 0.045, 0.004, 'combat', 0.025);
        break;
      case 'storm':
        this._noiseBurst('highpass', 2400, 900, 2.2, 0.032, 0.095, 'combat');
        this._tone(780, 185, 0.042, 'square', 0.05, 0, 'combat', 0.035);
        break;
      case 'toxin':
        this._noiseBurst('bandpass', 620, 1350, 6.5, 0.07, 0.09, 'combat');
        this._tone(240, 340, 0.055, 'triangle', 0.055, 0, 'combat', 0.03);
        break;
      case 'blood':
        this._tone(190, 62, 0.075, 'triangle', 0.11, 0, 'combat', 0.025);
        this._noiseBurst('lowpass', 480, 160, 2.0, 0.045, 0.06, 'combat');
        break;
      case 'holy':
        this._tone(523.25, 587.33, 0.065, 'sine', 0.065, 0, 'combat', 0.015);
        this._tone(783.99, 880.0, 0.065, 'triangle', 0.045, 0.008, 'combat', 0.015);
        break;
      case 'earth':
        this._noiseBurst('lowpass', 360, 110, 1.8, 0.085, 0.105, 'combat');
        this._tone(145, 58, 0.08, 'sawtooth', 0.07, 0, 'combat', 0.025);
        break;
      default:
        this._tone(320, 210, 0.042, 'triangle', 0.08, 0, 'combat', 0.03);
        break;
    }
  },

  playXpPickup() {
    if (this._isMuted()) return;
    const now = this._nowMs();
    if (now - this.lastXpTime > 450) {
      this.xpChainIndex = 0;
    } else if (now - this.lastXpTime < 28) {
      return;
    } else {
      this.xpChainIndex = Math.min(11, this.xpChainIndex + 1);
    }
    this.lastXpTime = now;

    // D-minor pentatonic escalation for magnetic vacuum cascades
    const scale = [587.33, 659.25, 698.46, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1396.91, 1567.98, 1760.0, 2093.0];
    const freq = scale[this.xpChainIndex] || 880.0;
    this._tone(freq, freq * 1.03, 0.075, 'triangle', 0.16, 0, 'combat', 0);
  },

  playCrit(element = null) {
    if (this._isMuted()) return;
    const now = this._nowMs();
    if (now - this.lastCritTime < 75) return;
    this.lastCritTime = now;
    if (!element || element === 'none') {
      this._tone(1046.5, 1567.98, 0.055, 'triangle', 0.16, 0, 'priority', 0.025);
      this._tone(1567.98, 2093.0, 0.065, 'sine', 0.13, 0.012, 'priority', 0.025);
      return;
    }
    const raw = typeof element === 'string' ? element.trim().toLowerCase() : '';
    const mapped = raw === 'ice' ? 'frost' : (raw === 'lightning' ? 'storm' : (raw === 'poison' ? 'toxin' : raw));
    const profile = this.BIOME_AUDIO_PROFILES[mapped];
    if (!profile) {
      this._tone(1046.5, 1567.98, 0.055, 'triangle', 0.16, 0, 'priority', 0.025);
      this._tone(1567.98, 2093.0, 0.065, 'sine', 0.13, 0.012, 'priority', 0.025);
      return;
    }
    const base = profile.rootHz < 220 ? profile.rootHz * 4 : (profile.rootHz < 380 ? profile.rootHz * 2 : profile.rootHz);
    const deg1 = (Array.isArray(profile.scale) && profile.scale[2]) ? profile.scale[2] : 1.3348;
    const deg2 = (Array.isArray(profile.scale) && profile.scale[3]) ? profile.scale[3] : 1.4983;
    const wave1 = profile.wave === 'square' ? 'triangle' : (profile.wave || 'triangle');
    this._tone(base, base * deg1, 0.055, wave1, 0.16, 0, 'priority', 0.025);
    this._tone(base * deg1, base * deg2 * 1.5, 0.065, 'sine', 0.13, 0.012, 'priority', 0.025);
  },

  playStreakMilestone(streak = 15) {
    if (this._isMuted()) return;
    const now = this._nowMs();
    if (now - this.lastStreakTime < 120) return;
    this.lastStreakTime = now;
    const s = Number(streak) || 15;
    const tier = s >= 50 ? 3 : (s >= 40 ? 2 : (s >= 25 ? 1 : 0));
    const roots = [587.33, 698.46, 880.0, 1174.66];
    const root = roots[tier];
    this._tone(root, root * 1.01, 0.14, 'triangle', 0.17, 0, 'priority', 0);
    this._tone(root * 1.5, root * 1.5, 0.18, 'sine', 0.15, 0.045, 'priority', 0);
    if (tier >= 2) {
      this._tone(root * 2.0, root * 2.0, 0.22, 'sine', 0.12, 0.09, 'priority', 0);
    }
    if (tier >= 3) {
      this.duckCombat(0.45, 0.25);
    }
    this.haptic(tier >= 2 ? 'medium' : 'light');
  },

  playSignatureDrop(quality = 'signature') {
    if (this._isMuted()) return;
    const now = this._nowMs();
    if (now - this.lastDropTime < 180) return;
    this.lastDropTime = now;
    const q = quality === 'mythic' ? 'mythic' : (quality === 'harmonic' ? 'harmonic' : 'signature');
    this.duckCombat(0.35, 0.55);
    this._tone(146.83, 73.42, 0.34, 'triangle', q === 'mythic' ? 0.28 : 0.24, 0, 'priority', 0);
    const notes = q === 'mythic'
      ? [293.66, 349.23, 440.0, 587.33, 1174.66]
      : (q === 'signature' ? [293.66, 349.23, 440.0, 587.33, 880.0] : [293.66, 349.23, 440.0, 587.33]);
    notes.forEach((n, idx) => {
      this._tone(n, n * 1.005, 0.26, idx % 2 === 0 ? 'triangle' : 'sine', 0.17, idx * 0.055, 'priority', 0);
    });
    this.haptic(q === 'harmonic' ? 'medium' : 'heavy');
  },

  playPhaseShift(phase = 2) {
    if (this._isMuted()) return;
    const p = Math.max(1, Number(phase) || 2);
    this.duckCombat(0.24, 0.60);
    this._tone(p >= 3 ? 130 : 110, 42, 0.55, 'sawtooth', 0.24, 0, 'priority', 0.01);
    this._noiseBurst('bandpass', 420, 1600, 4.5, 0.32, 0.14, 'priority', 0);
    const chord = p >= 3 ? [293.66, 415.30, 587.33] : [293.66, 349.23, 440.0];
    chord.forEach((freq, idx) => {
      this._tone(freq, freq * (p >= 3 ? 1.04 : 1.015), 0.38, 'triangle', 0.15, 0.08 + idx * 0.03, 'priority', 0);
    });
    this.haptic('heavy');
  },

  playKill(isElite = false, isBoss = false) {
    if (this._isMuted()) return;
    const now = this._nowMs();
    if (!isElite && !isBoss && now - this.lastKillTime < 38) return;
    this.lastKillTime = now;
    const targetBus = isBoss ? 'priority' : 'combat';
    if (isBoss) {
      this.duckCombat(0.28, 0.45);
    }
    this._tone(isBoss ? 140 : 115, 44, isBoss ? 0.22 : 0.08, 'sine', isBoss ? 0.35 : 0.15, 0, targetBus, 0.02);
    if (isBoss) {
      this._tone(587.33, 880.0, 0.24, 'triangle', 0.26, 0.04, 'priority', 0.015);
      this.haptic('heavy');
    } else if (isElite) {
      this._tone(440.0, 659.25, 0.14, 'triangle', 0.18, 0.02, 'combat', 0.015);
      this.haptic('medium');
    }
  },

  playDamage() {
    if (this._isMuted()) return;
    const now = this._nowMs();
    if (now - this.lastHitTime < 240) return;
    this.lastHitTime = now;
    this._tone(115, 52, 0.11, 'sawtooth', 0.22, 0, 'combat', 0.02);
    this.haptic('light');
  },

  playLevelUp() {
    const notes = [293.66, 349.23, 440.0, 587.33];
    notes.forEach((n, idx) => {
      this._tone(n, n, 0.22, 'triangle', 0.2, idx * 0.055, 'priority', 0);
    });
    this.haptic('medium');
  },

  playRelicOrShrine() {
    this._tone(330, 990, 0.24, 'triangle', 0.24, 0, 'combat', 0.01);
    this._tone(660, 1320, 0.2, 'sine', 0.14, 0.08, 'combat', 0.01);
    this.haptic('medium');
  },

  playBossPrelude() {
    this.duckCombat(0.22, 0.70);
    this._tone(110, 52, 0.65, 'sawtooth', 0.22, 0, 'priority', 0.01);
    this._tone(165, 82, 0.55, 'triangle', 0.14, 0.12, 'priority', 0.01);
    this.haptic('heavy');
  },

  playSwarmFormation() {
    this._tone(240, 480, 0.18, 'triangle', 0.15, 0, 'combat', 0.02);
    this._tone(360, 540, 0.18, 'sine', 0.12, 0.09, 'combat', 0.02);
    this.haptic('light');
  },

  playReviveShockwave() {
    this.duckCombat(0.24, 0.50);
    this._tone(180, 42, 0.35, 'sawtooth', 0.32, 0, 'priority', 0.01);
    this._tone(440, 880, 0.3, 'triangle', 0.25, 0.06, 'priority', 0.01);
    this.haptic('heavy');
  },

  playBossTelegraph(kind = 'attack') {
    const heavyDuck = kind === 'shatter' || kind === 'expose' || kind === 'slam';
    this.duckCombat(heavyDuck ? 0.26 : 0.32, 0.40);
    if (kind === 'teleport') {
      this._tone(520, 190, 0.22, 'sine', 0.18, 0, 'priority', 0.025);
      this._tone(920, 340, 0.2, 'triangle', 0.14, 0.05, 'priority', 0.025);
      this.haptic('light');
    } else if (kind === 'shatter') {
      this._tone(780, 160, 0.28, 'sawtooth', 0.24, 0, 'priority', 0.025);
      this._tone(220, 620, 0.24, 'triangle', 0.2, 0.04, 'priority', 0.025);
      this.haptic('heavy');
    } else if (kind === 'expose' || kind === 'slam') {
      this._tone(160, 52, 0.26, 'sawtooth', 0.26, 0, 'priority', 0.025);
      this._tone(660, 990, 0.2, 'triangle', 0.2, 0.05, 'priority', 0.025);
      this.haptic('heavy');
    } else {
      this._tone(240, 560, 0.22, 'sawtooth', 0.18, 0, 'priority', 0.025);
      this._tone(140, 110, 0.25, 'triangle', 0.14, 0.04, 'priority', 0.025);
      this.haptic('medium');
    }
  },

  playHitFeedback(kind = 'armor') {
    if (this._isMuted()) return;
    if (this.activeVoices >= (this.maxActiveVoices || 24) - 4) return;
    const now = this._nowMs();
    if (now - this._lastImpactTime < 65) return;
    this._lastImpactTime = now;
    if (kind === 'shield') {
      this._noiseBurst('bandpass', 2400, 1450, 7.0, 0.055, 0.095, 'combat');
      this._tone(920, 620, 0.06, 'triangle', 0.10, 0, 'combat', 0.025);
    } else if (kind === 'weakspot') {
      this._tone(740, 1480, 0.055, 'sawtooth', 0.14, 0, 'priority', 0.02);
      this._tone(1480, 2217.46, 0.065, 'sine', 0.12, 0.012, 'priority', 0.02);
    } else if (kind === 'shatter') {
      this._noiseBurst('highpass', 2800, 1200, 4.5, 0.075, 0.10, 'combat');
      this._tone(1318.51, 880, 0.07, 'triangle', 0.11, 0, 'combat', 0.03);
      this._tone(1760, 1046.5, 0.065, 'sine', 0.085, 0.014, 'combat', 0.03);
    } else {
      this._noiseBurst('lowpass', 520, 180, 2.2, 0.06, 0.11, 'combat');
      this._tone(135, 68, 0.07, 'sine', 0.13, 0, 'combat', 0.02);
    }
  },

  playPlayerShieldBreak() {
    if (this._isMuted()) return;
    const now = this._nowMs();
    if (now - this._lastShieldBreakTime < 180) return;
    this._lastShieldBreakTime = now;
    this.duckCombat(0.35, 0.35);
    this._noiseBurst('highpass', 3200, 720, 3.0, 0.16, 0.14, 'priority', 0);
    this._tone(880, 196, 0.22, 'sawtooth', 0.22, 0, 'priority', 0.015);
    this._tone(587.33, 146.83, 0.26, 'triangle', 0.18, 0.035, 'priority', 0.015);
    this.haptic('medium');
  },

  playEnemyTelegraph(kind = 'aim_lock') {
    if (this._isMuted()) return;
    if (this.activeVoices >= (this.maxActiveVoices || 24) - 4) return;
    const now = this._nowMs();
    if (now - this._lastTelegraphTime < 220) return;
    this._lastTelegraphTime = now;
    if (kind === 'fuse') {
      this._tone(520, 980, 0.075, 'triangle', 0.11, 0, 'combat', 0.015);
      this._tone(780, 1320, 0.065, 'sine', 0.085, 0.045, 'combat', 0.015);
    } else {
      this._tone(1180, 1680, 0.045, 'sine', 0.095, 0, 'combat', 0.01);
      this._tone(1680, 1680, 0.035, 'triangle', 0.07, 0.032, 'combat', 0.01);
    }
  }
};

if (typeof window !== 'undefined') {
  window.NeonAds = NeonAds;
  window.NeonAudio = NeonAudio;
  window.__onOtterBridgeReady = () => {
    _applyNativeShellSafeAreaFix(true);
    NeonAds.syncAdButtonsUI();
    if (typeof document !== 'undefined') {
      const badge = document.getElementById('ncWebBuildBadge');
      if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
    }
  };
}

function initWebLiveUpdateBadge() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (NeonAds.isNativeApp()) return;
  const mainMenu = document.getElementById('mainMenu');
  if (!mainMenu || document.getElementById('ncWebBuildBadge')) return;

  if (document.head && !document.getElementById('ncWebBuildBadgeStyle')) {
    const style = document.createElement('style');
    style.id = 'ncWebBuildBadgeStyle';
    style.textContent = `
      .nc-web-build-badge {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        margin: -6px auto 12px auto;
        padding: 7px 14px;
        max-width: min(92vw, 380px);
        border-radius: 999px;
        background: rgba(0, 22, 34, 0.78);
        border: 1px solid rgba(0, 255, 255, 0.38);
        box-shadow: 0 0 14px rgba(0, 255, 255, 0.14);
        color: #cffafe;
        font-size: 11px;
        line-height: 1.3;
        text-align: center;
        backdrop-filter: blur(6px);
      }
      .nc-web-build-badge-top {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 6px;
        font-weight: 700;
        letter-spacing: 0.06em;
      }
      .nc-web-build-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #34d399;
        box-shadow: 0 0 8px #34d399;
        animation: ncWebPulse 1.8s ease-in-out infinite;
        flex-shrink: 0;
      }
      .nc-web-build-meta {
        color: #93c5fd;
        font-weight: 500;
        letter-spacing: 0.02em;
      }
      .nc-web-build-note {
        font-size: 10px;
        color: rgba(207, 250, 254, 0.78);
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .nc-web-build-home {
        color: #67e8f9;
        text-decoration: none;
        border-bottom: 1px dotted rgba(103, 232, 249, 0.55);
      }
      .nc-web-build-home:hover { color: #ffffff; }
      @keyframes ncWebPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.45; transform: scale(0.85); }
      }
    `;
    document.head.appendChild(style);
  }

  const badge = document.createElement('div');
  badge.id = 'ncWebBuildBadge';
  badge.className = 'nc-web-build-badge';

  const renderBadge = (info) => {
    badge.textContent = '';
    const top = document.createElement('div');
    top.className = 'nc-web-build-badge-top';

    const dot = document.createElement('span');
    dot.className = 'nc-web-build-dot';
    top.appendChild(dot);

    const label = document.createElement('span');
    label.textContent = (info && info.channel) ? String(info.channel) : 'LIVE WEB • TÄGLICHE UPDATES';
    top.appendChild(label);

    if (info && info.updatedDate) {
      const meta = document.createElement('span');
      meta.className = 'nc-web-build-meta';
      const timePart = info.updatedTime ? ` ${info.updatedTime}` : '';
      meta.textContent = `• Update: ${info.updatedDate}${timePart}`;
      top.appendChild(meta);
    }

    const homeLink = document.createElement('a');
    homeLink.className = 'nc-web-build-home';
    homeLink.href = '../';
    homeLink.textContent = 'otterabs.dev';
    top.appendChild(homeLink);

    badge.appendChild(top);

    if (info && info.headline) {
      const rawHeadline = String(info.headline).trim();
      if (rawHeadline) {
        const note = document.createElement('div');
        note.className = 'nc-web-build-note';
        note.title = rawHeadline;
        note.textContent = rawHeadline.length > 58 ? `${rawHeadline.slice(0, 55)}...` : rawHeadline;
        badge.appendChild(note);
      }
    }
  };

  renderBadge(null);

  const titleEl = mainMenu.querySelector('h1.title');
  if (titleEl && titleEl.parentNode === mainMenu) {
    mainMenu.insertBefore(badge, titleEl.nextSibling);
  } else {
    mainMenu.insertBefore(badge, mainMenu.firstChild);
  }

  if (typeof fetch === 'function') {
    fetch(`./build-info.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => (res && res.ok ? res.json() : null))
      .then((info) => {
        if (info && !NeonAds.isNativeApp()) {
          renderBadge(info);
        }
      })
      .catch(() => {});
  }
}

// DOM Elements
const canvas = document.getElementById('gameCanvas');
const uiMainMenu = document.getElementById('mainMenu');
const uiShopMenu = document.getElementById('shopMenu');
const uiInGameHud = document.getElementById('inGameHud');
const uiLevelUp = document.getElementById('levelUpMenu');
const uiGameOver = document.getElementById('gameOverMenu');

const btnStartGame = document.getElementById('btnStartGame');
const btnStartAI = document.getElementById('btnStartAI');
const btnStartAd = document.getElementById('btnStartAd');
const btnOpenShop = document.getElementById('btnOpenShop');
const btnShopBack = document.getElementById('btnShopBack');
const btnBuyPremium = document.getElementById('btnBuyPremium');
const btnSynthCrystal1 = document.getElementById('btnSynthCrystal1');
const btnSynthCrystal5 = document.getElementById('btnSynthCrystal5');
const btnAdCrystal = document.getElementById('btnAdCrystal');
const btnReroll = document.getElementById('btnReroll');
const btnDoubleCurrencyAd = document.getElementById('btnDoubleCurrencyAd');
const btnRevive = document.getElementById('btnRevive');
const btnToMenu = document.getElementById('btnToMenu');

const txtMenuCurrency = document.getElementById('menuCurrency');
const txtMenuPremium = document.getElementById('menuPremium');
const txtMenuBossCores = document.getElementById('menuPerkPoints');
const txtMenuGlobalLevel = document.getElementById('menuGlobalLevel');
const barMenuGlobalXp = document.getElementById('menuGlobalXpBar');
const txtShopCurrency = document.getElementById('shopCurrency');
const txtShopPremium = document.getElementById('shopPremium');
const txtShopPerkPoints = document.getElementById('shopPerkPoints');
const shopContainer = document.getElementById('shopItemsContainer');

const btnOpenCharacter = document.getElementById('btnOpenCharacter');
const uiCharacterMenu = document.getElementById('characterMenu');
const btnCharBack = document.getElementById('btnCharBack');
const txtCharPerkPoints = document.getElementById('charPerkPoints');
const perkTreeContent = document.getElementById('perkTreeContent');
const perkTreeInfo = document.getElementById('perkTreeInfo');
const btnRerollPremium = document.getElementById('btnRerollPremium');

const perkContainer = document.getElementById('perkContainer');
const hudLevel = document.getElementById('hudLevel');
const hudTime = document.getElementById('hudTime');
const hudHpText = document.getElementById('hudHpText');
const hudHpFill = document.getElementById('hudHpFill');
const hudShieldFill = document.getElementById('hudShieldFill');
const hudMatter = document.getElementById('hudMatter');
const btnHudPause = document.getElementById('btnHudPause');
const pauseOverlayBar = document.getElementById('pauseOverlayBar');
const btnPauseResume = document.getElementById('btnPauseResume');
const btnPauseArsenal = document.getElementById('btnPauseArsenal');
const btnExtractRun = document.getElementById('btnExtractRun');
const xpBar = document.getElementById('xpBar');
const goTitle = document.getElementById('goTitle');
const goTime = document.getElementById('goTime');
const goKills = document.getElementById('goKills');
const goStreak = document.getElementById('goStreak');
const goCurrency = document.getElementById('goCurrency');
const goPerkPoints = document.getElementById('goPerkPoints');
const goProgressHint = document.getElementById('goProgressHint');
const goBuildRecap = document.getElementById('goBuildRecap');
const btnFastRetry = document.getElementById('btnFastRetry');

const btnPrevVoid = document.getElementById('btnPrevVoid');
const btnNextVoid = document.getElementById('btnNextVoid');
const btnResetVoid = document.getElementById('btnResetVoid');

// v2.0 + v3.0 Command Hub, Core Arsenal, Sanctum Hub & Neural Lockpick DOM references
const ncUnifiedHubBar = document.getElementById('ncUnifiedHubBar');
const btnOpenHub = document.getElementById('btnOpenHub');
const hubMainBadge = document.getElementById('hubMainBadge');
const hubNavCore = document.getElementById('hubNavCore');
const hubNavPerks = document.getElementById('hubNavPerks');
const hubNavGear = document.getElementById('hubNavGear');
const hubNavSanctum = document.getElementById('hubNavSanctum');
const hubBadgeCore = document.getElementById('hubBadgeCore');
const hubBadgePerks = document.getElementById('hubBadgePerks');
const hubBadgeGear = document.getElementById('hubBadgeGear');
const hubBadgeSanctum = document.getElementById('hubBadgeSanctum');
const btnHubClose = document.getElementById('btnHubClose');
const goQuickBar = document.getElementById('goQuickBar');
const btnGoUpgrades = document.getElementById('btnGoUpgrades');
const goUpgradeBadge = document.getElementById('goUpgradeBadge');
const arsMatterReadout = document.getElementById('arsMatterReadout');
const arsCrystalReadout = document.getElementById('arsCrystalReadout');
const coreAugsMount = document.getElementById('coreAugsMount');
const btnCoreSynth1 = document.getElementById('btnCoreSynth1');
const btnCoreSynth5 = document.getElementById('btnCoreSynth5');
const gearPresetBar = document.getElementById('gearPresetBar');
const btnAutoEquipBest = document.getElementById('btnAutoEquipBest');
const btnSalvageWorse = document.getElementById('btnSalvageWorse');
const btnClaimAllContracts = document.getElementById('btnClaimAllContracts');
const biomeMasterySummaryBar = document.getElementById('biomeMasterySummaryBar');
const biomeMasteryContainer = document.getElementById('biomeMasteryContainer');
const sanctumPhasesMount = document.getElementById('sanctumPhasesMount');

const btnOpenArsenal = document.getElementById('btnOpenArsenal');
const btnOpenSanctumHub = document.getElementById('btnOpenSanctumHub');
const uiArsenalMenu = document.getElementById('arsenalMenu');
const arsUnspentAttr = document.getElementById('arsUnspentAttr');
const tabBtnAttrs = document.getElementById('tabBtnAttrs');
const tabBtnModules = document.getElementById('tabBtnModules');
const tabBtnPhases = document.getElementById('tabBtnPhases');
const arsTabAttrs = document.getElementById('arsTabAttrs');
const attrCardsContainer = document.getElementById('attrCardsContainer');
const btnRespecAttrs = document.getElementById('btnRespecAttrs');
const arsTabModules = document.getElementById('arsTabModules');
const equippedSlotsContainer = document.getElementById('equippedSlotsContainer');
const shardInventoryBar = document.getElementById('shardInventoryBar');
const moduleInventoryContainer = document.getElementById('moduleInventoryContainer');
const arsTabPhases = document.getElementById('arsTabPhases');
const phaseCardsContainer = document.getElementById('phaseCardsContainer');
const fractureKeyContainer = document.getElementById('fractureKeyContainer');
const descentPanel = document.getElementById('descentPanel');
const btnArsenalBack = document.getElementById('btnArsenalBack');

const uiSanctumHubMenu = document.getElementById('sanctumHubMenu');
const hubCurrency = document.getElementById('hubCurrency');
const hubPremium = document.getElementById('hubPremium');
const tabBtnArchivist = document.getElementById('tabBtnArchivist');
const tabBtnArtificer = document.getElementById('tabBtnArtificer');
const tabBtnBroker = document.getElementById('tabBtnBroker');
const hubTabArchivist = document.getElementById('hubTabArchivist');
const contractsContainer = document.getElementById('contractsContainer');
const codexContainer = document.getElementById('codexContainer');
const hubTabArtificer = document.getElementById('hubTabArtificer');
const artificerStatusBanner = document.getElementById('artificerStatusBanner');
const artificerModuleSelect = document.getElementById('artificerModuleSelect');
const overclockMinigameBox = document.getElementById('overclockMinigameBox');

let hubReturnTarget = 'menu';
let activeUnifiedHubTab = 'core';
let unifiedHubActive = false;
const overclockCursor = document.getElementById('overclockCursor');
const btnOverclockStrike = document.getElementById('btnOverclockStrike');
const overclockStatus = document.getElementById('overclockStatus');
const artificerActions = document.getElementById('artificerActions');
const hubTabBroker = document.getElementById('hubTabBroker');
const brokerStatusBanner = document.getElementById('brokerStatusBanner');
const btnBrokerCrystal1 = document.getElementById('btnBrokerCrystal1');
const btnBrokerCrystal5 = document.getElementById('btnBrokerCrystal5');
const btnBrokerAdCrystal = document.getElementById('btnBrokerAdCrystal');
const btnBrokerCapsule = document.getElementById('btnBrokerCapsule');
const brokerResultBox = document.getElementById('brokerResultBox');
const signalMatrixGrid = document.getElementById('signalMatrixGrid');
const signalMatrixStatus = document.getElementById('signalMatrixStatus');
const btnMatrixStart = document.getElementById('btnMatrixStart');
const btnMatrixCashout = document.getElementById('btnMatrixCashout');
const btnSanctumBack = document.getElementById('btnSanctumBack');

const vaultHackWidget = document.getElementById('vaultHackWidget');
const vaultHackTitle = document.getElementById('vaultHackTitle');
const vaultHackNodes = document.getElementById('vaultHackNodes');
const vaultHackStatus = document.getElementById('vaultHackStatus');

let activeArsenalTab = 'arsTabAttrs';
let activeHubTab = 'hubTabArchivist';
let activeSocketShard = null;
let selectedArtificerModUid = null;
let sanctumReturnToGame = false;
let arsenalReturnToGame = false;
let overclockPos = 50;
let overclockBonusQuality = false;
let overclockLocked = false;
let overclockRetries = 0;
let overclockRafId = null;

const matrixState = {
  active: false,
  mines: new Set(),
  revealed: new Set(),
  steps: 0,
  stake: 30
};

let activeVaultHack = null;
let vaultHackHideTimer = null;
let extractArmed = false;
let extractResetTimer = null;
let lastPauseOpenedAt = 0;

function resetExtractButton() {
  extractArmed = false;
  if (extractResetTimer) {
    clearTimeout(extractResetTimer);
    extractResetTimer = null;
  }
  if (btnExtractRun) {
    if (btnExtractRun.classList) btnExtractRun.classList.remove('confirming');
    btnExtractRun.innerText = 'EXTRACT RUN';
  }
}

function resumeFromPause() {
  resetExtractButton();
  if (pauseOverlayBar && pauseOverlayBar.classList) pauseOverlayBar.classList.add('hidden');
  if (typeof Input !== 'undefined') Input.paused = false;
  resumeGame();
}

function triggerVoluntaryExtraction() {
  resetExtractButton();
  if (pauseOverlayBar && pauseOverlayBar.classList) pauseOverlayBar.classList.add('hidden');
  if (typeof Input !== 'undefined') Input.paused = false;
  if (game) game.gameOver = true;
  showGameOver(true);
}

async function handleAdCrystalGrant() {
  const ok = await NeonAds.showRewarded('crystal_grant');
  if (!ok) return false;
  Meta.addPremium(2);
  if (game) game.voidFlickerTimer = 0.5;
  if (typeof NeonAudio !== 'undefined') NeonAudio.playRelicOrShrine();
  syncCrystalExchangeUI();
  if (unifiedHubActive) {
    renderArsenal();
    renderSanctumHub();
  } else if (currentState === STATE.SHOP) renderShop();
  else if (currentState === STATE.SANCTUM_HUB) renderSanctumHub();
  updateHubBadges();
  return true;
}

function syncCrystalExchangeUI() {
  const matter = typeof Meta !== 'undefined' ? Meta.getCurrency() : 0;
  const crystals = typeof Meta !== 'undefined' ? Meta.getPremium() : 0;
  if (txtMenuCurrency) txtMenuCurrency.innerText = matter;
  if (txtMenuPremium) txtMenuPremium.innerText = crystals;
  if (txtShopCurrency) txtShopCurrency.innerText = matter;
  if (txtShopPremium) txtShopPremium.innerText = crystals;
  if (hubCurrency) hubCurrency.textContent = matter;
  if (hubPremium) hubPremium.textContent = crystals;
  if (arsMatterReadout) arsMatterReadout.textContent = matter;
  if (arsCrystalReadout) arsCrystalReadout.textContent = crystals;
  if (btnSynthCrystal1) btnSynthCrystal1.disabled = matter < 100;
  if (btnSynthCrystal5) btnSynthCrystal5.disabled = matter < 450;
  if (btnCoreSynth1) btnCoreSynth1.disabled = matter < 100;
  if (btnCoreSynth5) btnCoreSynth5.disabled = matter < 450;
  if (btnBrokerCrystal1) btnBrokerCrystal1.disabled = matter < 100;
  if (btnBrokerCrystal5) btnBrokerCrystal5.disabled = matter < 450;
  NeonAds.syncAdButtonsUI();
}

function handleSynthesizeCrystals(matterCost, crystalGain) {
  if (typeof Meta === 'undefined' || !Meta.spendCurrency(matterCost)) return false;
  Meta.addPremium(crystalGain);
  if (game) game.voidFlickerTimer = 0.5;
  if (typeof NeonAudio !== 'undefined') NeonAudio.playRelicOrShrine();
  syncCrystalExchangeUI();
  if (unifiedHubActive) {
    renderArsenal();
    renderSanctumHub();
  } else if (currentState === STATE.SHOP) renderShop();
  else if (currentState === STATE.SANCTUM_HUB) renderSanctumHub();
  updateHubBadges();
  return true;
}

function pauseGameWithOverlay() {
  currentState = STATE.PAUSED;
  lastPauseOpenedAt = Date.now();
  resetExtractButton();
  if (uiInGameHud && uiInGameHud.classList) uiInGameHud.classList.add('hidden');
  if (pauseOverlayBar && pauseOverlayBar.classList) pauseOverlayBar.classList.remove('hidden');
  if (typeof Input !== 'undefined') {
    Input.paused = true;
    if (Input.reset) Input.reset();
  }
  if (game && typeof game.openPauseWorldMap === 'function') {
    game.openPauseWorldMap();
  }
  if (game && typeof game.drawPauseWorldMap === 'function') {
    game.drawPauseWorldMap();
    return;
  }
  const ctx = game.ctx;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);
  ctx.fillStyle = 'white';
  ctx.font = '40px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', game.canvas.width / 2, game.canvas.height / 2);
}

if (typeof window !== 'undefined') {
  window.__handleAndroidBack = () => {
    if (unifiedHubActive) {
      closeCommandHub();
      return 'handled';
    }
    if (currentState === STATE.ARSENAL) {
      closeArsenal();
      return 'handled';
    }
    if (currentState === STATE.SANCTUM_HUB) {
      closeSanctumHub();
      return 'handled';
    }
    if (currentState === STATE.SHOP) {
      closeShop();
      return 'handled';
    }
    if (currentState === STATE.CHARACTER) {
      closeCharacter();
      return 'handled';
    }
    if (currentState === STATE.PLAYING) {
      pauseGameWithOverlay();
      return 'handled';
    }
    if (currentState === STATE.PAUSED) {
      resumeFromPause();
      return 'handled';
    }
    return 'exit';
  };
}

function init() {
  const canvas = document.getElementById('gameCanvas');
  Input.init(canvas);
  game = new Game(canvas);
  game.onOpenSanctumEntity = (entityId) => {
    if (entityId === 'arsenalConduit') {
      openArsenal('arsTabModules');
      return;
    }
    const tabMap = {
      archivist: 'hubTabArchivist',
      artificer: 'hubTabArtificer',
      broker: 'hubTabBroker'
    };
    openSanctumHub(tabMap[entityId] || 'hubTabArchivist');
  };
  game.onVaultHackPrompt = (vault) => {
    startVaultHack(vault);
  };

  if (btnStartAI) btnStartAI.style.display = 'none';
  if (btnStartGame) {
    btnStartGame.addEventListener('click', () => {
      startGame();
    });
  }

  if (btnStartAd) btnStartAd.addEventListener('click', startWithAdPerk);
  if (btnOpenShop) btnOpenShop.addEventListener('click', openShop);
  if (btnShopBack) btnShopBack.addEventListener('click', closeShop);
  if (btnOpenCharacter) btnOpenCharacter.addEventListener('click', openCharacter);
  if (btnCharBack) btnCharBack.addEventListener('click', closeCharacter);

  // v2.0 Core Arsenal & Sanctum Hub wiring
  if (btnOpenArsenal) btnOpenArsenal.addEventListener('click', () => openArsenal('arsTabAttrs'));
  if (btnArsenalBack) btnArsenalBack.addEventListener('click', closeArsenal);
  if (tabBtnAttrs) tabBtnAttrs.addEventListener('click', () => switchArsenalTab('arsTabAttrs'));
  if (tabBtnModules) tabBtnModules.addEventListener('click', () => switchArsenalTab('arsTabModules'));
  if (tabBtnPhases) tabBtnPhases.addEventListener('click', () => switchArsenalTab('arsTabPhases'));
  if (btnRespecAttrs) {
    btnRespecAttrs.addEventListener('click', () => {
      if (typeof Meta !== 'undefined' && typeof Meta.respecAttributes === 'function') {
        Meta.respecAttributes();
        renderArsenal();
      }
    });
  }

  if (btnOpenSanctumHub) btnOpenSanctumHub.addEventListener('click', () => openSanctumHub('hubTabArchivist'));
  if (btnSanctumBack) btnSanctumBack.addEventListener('click', closeSanctumHub);
  if (tabBtnArchivist) tabBtnArchivist.addEventListener('click', () => switchSanctumTab('hubTabArchivist'));
  if (tabBtnArtificer) tabBtnArtificer.addEventListener('click', () => switchSanctumTab('hubTabArtificer'));
  if (tabBtnBroker) tabBtnBroker.addEventListener('click', () => switchSanctumTab('hubTabBroker'));
  if (btnOverclockStrike) btnOverclockStrike.addEventListener('click', handleOverclockStrike);
  if (btnBrokerCapsule) btnBrokerCapsule.addEventListener('click', handleBuyBrokerCapsule);
  if (btnMatrixStart) btnMatrixStart.addEventListener('click', startSignalMatrix);
  if (btnMatrixCashout) btnMatrixCashout.addEventListener('click', cashoutSignalMatrix);

  if (typeof document !== 'undefined' && document.querySelectorAll) {
    const matrixCells = document.querySelectorAll('#signalMatrixGrid .nc-matrix-cell');
    matrixCells.forEach((cell) => {
      cell.addEventListener('click', () => {
        const rawIdx = cell.getAttribute ? cell.getAttribute('data-idx') : null;
        const idx = Number(rawIdx);
        if (Number.isInteger(idx)) handleSignalMatrixCell(idx);
      });
    });

    const hackNodes = document.querySelectorAll('#vaultHackNodes .nc-hack-node');
    hackNodes.forEach((node) => {
      node.addEventListener('click', () => {
        const rawIdx = node.getAttribute ? node.getAttribute('data-idx') : null;
        const idx = Number(rawIdx);
        if (Number.isInteger(idx)) handleVaultHackNodeClick(idx);
      });
    });
  }

  if (btnPrevVoid) btnPrevVoid.addEventListener('click', () => rotateCarousel(-1));
  if (btnNextVoid) btnNextVoid.addEventListener('click', () => rotateCarousel(1));
  if (btnResetVoid) btnResetVoid.addEventListener('click', handleResetVoid);

  updateCarouselVisuals();

  // Setup pan and zoom for the perk tree
  setupPanZoom();

  const hasBillingBridge =
    typeof window !== 'undefined' &&
    Boolean(window.OtterBillingChannel && typeof window.OtterBillingChannel.postMessage === 'function');
  if (btnBuyPremium) {
    btnBuyPremium.style.display = hasBillingBridge ? '' : 'none';
    if (hasBillingBridge) {
      btnBuyPremium.addEventListener('click', () => {
        try {
          window.OtterBillingChannel.postMessage(JSON.stringify({ action: 'buyCrystals10' }));
        } catch (_) {}
      });
    }
  }

  if (btnSynthCrystal1) btnSynthCrystal1.addEventListener('click', () => handleSynthesizeCrystals(100, 1));
  if (btnSynthCrystal5) btnSynthCrystal5.addEventListener('click', () => handleSynthesizeCrystals(450, 5));
  if (btnCoreSynth1) btnCoreSynth1.addEventListener('click', () => handleSynthesizeCrystals(100, 1));
  if (btnCoreSynth5) btnCoreSynth5.addEventListener('click', () => handleSynthesizeCrystals(450, 5));
  if (btnAdCrystal) btnAdCrystal.addEventListener('click', handleAdCrystalGrant);
  if (btnBrokerCrystal1) btnBrokerCrystal1.addEventListener('click', () => handleSynthesizeCrystals(100, 1));
  if (btnBrokerCrystal5) btnBrokerCrystal5.addEventListener('click', () => handleSynthesizeCrystals(450, 5));
  if (btnBrokerAdCrystal) btnBrokerAdCrystal.addEventListener('click', handleAdCrystalGrant);

  // v3.0 Command Hub Navigation & Smart Gear Actions
  if (btnOpenHub) btnOpenHub.addEventListener('click', () => openCommandHub('core', 'menu'));
  if (btnGoUpgrades) btnGoUpgrades.addEventListener('click', () => openCommandHub('core', 'gameover'));
  if (hubNavCore) hubNavCore.addEventListener('click', () => switchCommandHubTab('core'));
  if (hubNavPerks) hubNavPerks.addEventListener('click', () => switchCommandHubTab('perks'));
  if (hubNavGear) hubNavGear.addEventListener('click', () => switchCommandHubTab('gear'));
  if (hubNavSanctum) hubNavSanctum.addEventListener('click', () => switchCommandHubTab('sanctum'));
  if (btnHubClose) btnHubClose.addEventListener('click', closeCommandHub);

  if (btnAutoEquipBest) {
    btnAutoEquipBest.addEventListener('click', () => {
      if (typeof NeonSystems === 'undefined' || !NeonSystems.autoEquipBestModules) return;
      const inRunLevel = (arsenalReturnToGame && game && game.player) ? (game.player.level || 0) : 0;
      NeonSystems.autoEquipBestModules(Meta, { inRunLevel });
      renderArsenal();
    });
  }
  if (btnSalvageWorse) {
    btnSalvageWorse.addEventListener('click', () => {
      if (typeof NeonSystems === 'undefined' || !NeonSystems.salvageWorseModules) return;
      const inRunLevel = (arsenalReturnToGame && game && game.player) ? (game.player.level || 0) : 0;
      NeonSystems.salvageWorseModules(Meta, { inRunLevel });
      renderArsenal();
    });
  }
  if (btnClaimAllContracts) {
    btnClaimAllContracts.addEventListener('click', () => {
      if (typeof NeonSystems === 'undefined' || !NeonSystems.claimAllCompletedContracts) return;
      NeonSystems.claimAllCompletedContracts(Meta);
      renderSanctumHub();
    });
  }

  if (btnHudPause) {
    btnHudPause.addEventListener('pointerdown', (e) => { if (e.stopPropagation) e.stopPropagation(); });
    btnHudPause.addEventListener('touchstart', (e) => { if (e.stopPropagation) e.stopPropagation(); }, { passive: true });
    btnHudPause.addEventListener('click', (e) => {
      if (e.stopPropagation) e.stopPropagation();
      if (currentState === STATE.PLAYING) pauseGameWithOverlay();
      else if (currentState === STATE.PAUSED) resumeFromPause();
    });
  }
  if (btnPauseResume) btnPauseResume.addEventListener('click', resumeFromPause);
  if (btnPauseArsenal) {
    btnPauseArsenal.addEventListener('click', () => {
      resetExtractButton();
      if (pauseOverlayBar && pauseOverlayBar.classList) pauseOverlayBar.classList.add('hidden');
      openArsenal('arsTabModules');
    });
  }
  if (btnExtractRun) {
    btnExtractRun.addEventListener('click', () => {
      if (currentState !== STATE.PAUSED && currentState !== STATE.PLAYING) return;
      if (!extractArmed) {
        extractArmed = true;
        if (btnExtractRun.classList) btnExtractRun.classList.add('confirming');
        const bankedM = game ? Math.floor(game.currencyCollected || 0) : 0;
        btnExtractRun.innerText = `CONFIRM? (+${bankedM}M)`;
        if (extractResetTimer) clearTimeout(extractResetTimer);
        extractResetTimer = setTimeout(() => resetExtractButton(), 4500);
      } else {
        triggerVoluntaryExtraction();
      }
    });
  }

  let runRewardsCommitted = false;
  const commitRunRewardsOnce = () => {
    if (runRewardsCommitted) return;
    runRewardsCommitted = true;
    Meta.addCurrency(Math.floor(game.currencyCollected || 0));
    Meta.addPerkPoints(game.perkPointsCollected || 0);
    const rawRunXp = Math.floor(game.totalXpEarned || 0);
    const masterXp = typeof Meta.computeMasterXpFromRun === 'function' ? Meta.computeMasterXpFromRun(rawRunXp) : rawRunXp;
    Meta.addGlobalXp(masterXp);
  };

  let fastRetryPending = false;
  if (btnFastRetry) {
    btnFastRetry.addEventListener('click', async () => {
      if (fastRetryPending) return;
      fastRetryPending = true;
      try {
        commitRunRewardsOnce();
        await NeonAds.maybeShowInterstitial('instant_restart');
        runRewardsCommitted = false;
        startGame({
          dailySeed: (game && game.isDailyRun) ? game.dailySeed : '',
          mode: (game && game.isDescentMode) ? 'descent' : undefined
        });
      } finally {
        fastRetryPending = false;
      }
    });
  }

  if (btnToMenu) {
    btnToMenu.addEventListener('click', async () => {
      commitRunRewardsOnce();
      if ((game.runTime || 0) >= 90) {
        await NeonAds.maybeShowInterstitial('game_over');
      }
      runRewardsCommitted = false;
      showMenu();
    });
  }

  const handleReroll = async (isPremium) => {
    const playerLevel = (game && game.player) ? game.player.level : 1;
    const isBonusLvl = Boolean(currentLevelUpIgnoreMinLevel || (game && game.lastLevelWasBonusPerk));
    const isMilestoneLvl = playerLevel >= 5 && playerLevel % 5 === 0;
    if (!isBonusLvl && !isMilestoneLvl) return;
    const eligiblePerks = PerkPool.filter(p => {
      if (!Meta.isPerkUnlocked(p.id)) return false;
      if (p.element && p.element !== 'void' && typeof Meta.isSectorConquered === 'function' && !Meta.isSectorConquered(p.element)) return false;
      if (p.worldHidden && typeof Meta.isMapPerkFound === 'function' && !Meta.isMapPerkFound(p.id)) return false;
      if (!currentLevelUpIgnoreMinLevel && (p.minLevel || 1) > playerLevel) return false;
      if (currentLevelUpIgnoreMinLevel && p.isKeystone) return false;
      const ownedCount = game.statManager.perks.reduce((sum, cp) => sum + (cp.id === p.id ? 1 : 0), 0);
      if (p.unique && ownedCount > 0) return false;
      if (typeof MAX_PERK_STACKS !== 'undefined' && MAX_PERK_STACKS[p.id] !== undefined && ownedCount >= MAX_PERK_STACKS[p.id]) return false;
      return true;
    });
    if (eligiblePerks.length <= currentPerkChoices.length) {
      showNeonNotice("No other perks available to reroll!", { title: "REROLL UNAVAILABLE", tone: "info" });
      return;
    }

    if (isPremium) {
      if (!Meta.spendPremium(1)) {
        showNeonNotice("Not enough Crystals! Collect Crystals from Guardians, Rift Rewards, or daily clears.", { title: "CRYSTALS REQUIRED", tone: "warn" });
        return;
      }
    } else {
      const ok = await NeonAds.showRewarded('perk_reroll');
      if (!ok) return;
    }

    currentRerollCount++;
    if (!isPremium && currentRerollChoices > 1) {
      currentRerollChoices--;
    }
    showLevelUp(isPremium ? 3 : currentRerollChoices, currentRerollCount, currentLevelUpIgnoreMinLevel);
  };

  if (btnReroll) btnReroll.addEventListener('click', () => handleReroll(false));
  if (btnRerollPremium) btnRerollPremium.addEventListener('click', () => handleReroll(true));

  if (btnDoubleCurrencyAd) {
    btnDoubleCurrencyAd.addEventListener('click', async () => {
      if (hasDoubledCurrency) return;
      const ok = await NeonAds.showRewarded('double_matter');
      if (!ok) return;
      game.currencyCollected *= 2;
      goCurrency.innerText = Math.floor(game.currencyCollected);
      hasDoubledCurrency = true;
      btnDoubleCurrencyAd.style.display = 'none';
    });
  }

  if (btnRevive) {
    btnRevive.addEventListener('click', async () => {
      if (revivesUsed === 0 && NeonAds.isRewardedAvailable()) {
        const ok = await NeonAds.showRewarded('revive');
        if (ok) executeRevive();
      } else {
        if (Meta.spendPremium(1)) {
          executeRevive();
        } else {
          showNeonNotice("Not enough Crystals! You need 1 Crystal for an extra Revive.", { title: "CRYSTALS REQUIRED", tone: "warn" });
        }
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    NeonAudio.unlock();
    if (e.code === 'Escape') {
      if (currentState === STATE.ARSENAL) {
        closeArsenal();
        return;
      }
      if (currentState === STATE.SANCTUM_HUB) {
        closeSanctumHub();
        return;
      }
      if (currentState === STATE.SHOP) {
        closeShop();
        return;
      }
      if (currentState === STATE.CHARACTER) {
        closeCharacter();
        return;
      }
    }
    if (e.code === 'Space' || e.code === 'KeyP' || e.code === 'Escape') {
      if (currentState === STATE.PLAYING) {
        pauseGameWithOverlay();
      } else if (currentState === STATE.PAUSED) {
        resumeFromPause();
      }
    } else if (currentState === STATE.PAUSED && game) {
      if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        if (e.preventDefault) e.preventDefault();
        if (game.zoomPauseMap) game.zoomPauseMap(1.35);
      } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        if (e.preventDefault) e.preventDefault();
        if (game.zoomPauseMap) game.zoomPauseMap(1 / 1.35);
      } else if (e.code === 'Digit0' || e.code === 'Numpad0') {
        if (game.setPauseMapZoomPreset) game.setPauseMapZoomPreset('all');
      } else if (e.code === 'KeyC') {
        if (game.setPauseMapZoomPreset) game.setPauseMapZoomPreset('centerPlayer');
      } else if (e.code === 'KeyZ') {
        if (game.setPauseMapZoomPreset) game.setPauseMapZoomPreset('cycleRadar');
      }
    } else if (e.code === 'KeyI') {
      if (currentState === STATE.PLAYING) {
        openArsenal('arsTabModules');
      } else if (currentState === STATE.ARSENAL && arsenalReturnToGame) {
        closeArsenal();
      }
    } else if (e.code === 'KeyM') {
      const muted = Meta.toggleSoundMuted();
      if (game && game.floatingTexts && game.player && typeof FloatingText !== 'undefined') {
        game.floatingTexts.push(
          new FloatingText(game.player.x, game.player.y - 36, muted ? 'AUDIO: MUTED' : 'AUDIO: ON', '#aaddff', 1.1, 1.2)
        );
      }
    }
  });

  if (canvas && canvas.addEventListener) {
    const toCanvasCoords = (clientX, clientY) => {
      const rect = typeof canvas.getBoundingClientRect === 'function'
        ? canvas.getBoundingClientRect()
        : { left: 0, top: 0, width: canvas.width || 1, height: canvas.height || 1 };
      return {
        x: ((clientX - rect.left) / (rect.width || 1)) * (canvas.width || 1),
        y: ((clientY - rect.top) / (rect.height || 1)) * (canvas.height || 1)
      };
    };

    const mapGesture = {
      dragging: false,
      pinching: false,
      lastX: 0,
      lastY: 0,
      moved: 0,
      pinchDist: 0,
      pinchMidX: 0,
      pinchMidY: 0,
      lastTouchAt: 0
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (currentState === STATE.PLAYING && game && game._radarRect && typeof canvas.getBoundingClientRect === 'function') {
        const pt = toCanvasCoords(e.clientX, e.clientY);
        const rr = game._radarRect;
        if (pt.x >= rr.x - 8 && pt.x <= rr.x + rr.size + 8 && pt.y >= rr.y - 8 && pt.y <= rr.y + rr.size + 20) {
          mapGesture.dragging = false;
          mapGesture.pinching = false;
          pauseGameWithOverlay();
        }
      }
    });

    canvas.addEventListener('touchstart', (e) => {
      if (currentState !== STATE.PAUSED || !game) return;
      if (e.preventDefault) e.preventDefault();
      mapGesture.lastTouchAt = Date.now();
      if (e.touches && e.touches.length >= 2) {
        const p0 = toCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
        const p1 = toCanvasCoords(e.touches[1].clientX, e.touches[1].clientY);
        mapGesture.pinching = true;
        mapGesture.dragging = false;
        mapGesture.pinchDist = Math.max(10, Math.hypot(p1.x - p0.x, p1.y - p0.y));
        mapGesture.pinchMidX = (p0.x + p1.x) * 0.5;
        mapGesture.pinchMidY = (p0.y + p1.y) * 0.5;
        mapGesture.moved = 999;
      } else if (e.touches && e.touches.length === 1) {
        const p0 = toCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
        mapGesture.dragging = true;
        mapGesture.pinching = false;
        mapGesture.lastX = p0.x;
        mapGesture.lastY = p0.y;
        mapGesture.moved = 0;
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (currentState !== STATE.PAUSED || !game) return;
      if (e.preventDefault) e.preventDefault();
      mapGesture.lastTouchAt = Date.now();
      if (e.touches && e.touches.length >= 2) {
        const p0 = toCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
        const p1 = toCanvasCoords(e.touches[1].clientX, e.touches[1].clientY);
        const dist = Math.max(10, Math.hypot(p1.x - p0.x, p1.y - p0.y));
        const midX = (p0.x + p1.x) * 0.5;
        const midY = (p0.y + p1.y) * 0.5;
        if (!mapGesture.pinching) {
          mapGesture.pinching = true;
          mapGesture.pinchDist = dist;
          mapGesture.pinchMidX = midX;
          mapGesture.pinchMidY = midY;
        } else {
          if (game.panPauseMapByScreenDelta) {
            game.panPauseMapByScreenDelta(midX - mapGesture.pinchMidX, midY - mapGesture.pinchMidY);
          }
          if (game.zoomPauseMap && mapGesture.pinchDist > 0) {
            game.zoomPauseMap(dist / mapGesture.pinchDist, midX, midY);
          }
          mapGesture.pinchDist = dist;
          mapGesture.pinchMidX = midX;
          mapGesture.pinchMidY = midY;
        }
        mapGesture.moved = 999;
      } else if (e.touches && e.touches.length === 1 && mapGesture.dragging && !mapGesture.pinching) {
        const p0 = toCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
        const dx = p0.x - mapGesture.lastX;
        const dy = p0.y - mapGesture.lastY;
        mapGesture.moved += Math.hypot(dx, dy);
        if (mapGesture.moved > 5 && game.panPauseMapByScreenDelta) {
          game.panPauseMapByScreenDelta(dx, dy);
        }
        mapGesture.lastX = p0.x;
        mapGesture.lastY = p0.y;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      if (currentState !== STATE.PAUSED || !game) {
        mapGesture.dragging = false;
        mapGesture.pinching = false;
        return;
      }
      if (e.preventDefault) e.preventDefault();
      mapGesture.lastTouchAt = Date.now();
      const remaining = e.touches ? e.touches.length : 0;
      if (!mapGesture.pinching && mapGesture.dragging && mapGesture.moved <= 10 && remaining === 0) {
        const act = game.handlePauseMapTap ? game.handlePauseMapTap(mapGesture.lastX, mapGesture.lastY) : null;
        if (act === 'close') resumeFromPause();
      }
      if (remaining === 0) {
        mapGesture.dragging = false;
        mapGesture.pinching = false;
      } else if (remaining === 1) {
        const p0 = toCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
        mapGesture.pinching = false;
        mapGesture.dragging = true;
        mapGesture.lastX = p0.x;
        mapGesture.lastY = p0.y;
        mapGesture.moved = 999;
      }
    }, { passive: false });

    canvas.addEventListener('touchcancel', () => {
      mapGesture.dragging = false;
      mapGesture.pinching = false;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (Date.now() - mapGesture.lastTouchAt < 650) return;
      if (Date.now() - lastPauseOpenedAt < 80) return;
      if (currentState !== STATE.PAUSED || !game) return;
      const pt = toCanvasCoords(e.clientX, e.clientY);
      mapGesture.dragging = true;
      mapGesture.pinching = false;
      mapGesture.lastX = pt.x;
      mapGesture.lastY = pt.y;
      mapGesture.moved = 0;
    });

    canvas.addEventListener('mousemove', (e) => {
      if (Date.now() - mapGesture.lastTouchAt < 650) return;
      if (currentState !== STATE.PAUSED || !game || !mapGesture.dragging) return;
      const pt = toCanvasCoords(e.clientX, e.clientY);
      const dx = pt.x - mapGesture.lastX;
      const dy = pt.y - mapGesture.lastY;
      mapGesture.moved += Math.hypot(dx, dy);
      if (mapGesture.moved > 5 && game.panPauseMapByScreenDelta) {
        game.panPauseMapByScreenDelta(dx, dy);
      }
      mapGesture.lastX = pt.x;
      mapGesture.lastY = pt.y;
    });

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('mouseup', () => {
        if (!mapGesture.dragging) return;
        const shouldTap = currentState === STATE.PAUSED && game && mapGesture.moved <= 8;
        const tx = mapGesture.lastX;
        const ty = mapGesture.lastY;
        mapGesture.dragging = false;
        if (shouldTap) {
          const act = game.handlePauseMapTap ? game.handlePauseMapTap(tx, ty) : null;
          if (act === 'close') resumeFromPause();
        }
      });
    }

    canvas.addEventListener('wheel', (e) => {
      if (currentState !== STATE.PAUSED || !game) return;
      if (e.preventDefault) e.preventDefault();
      const pt = toCanvasCoords(e.clientX, e.clientY);
      const factor = e.deltaY < 0 ? 1.25 : (1 / 1.25);
      if (game.zoomPauseMap) game.zoomPauseMap(factor, pt.x, pt.y);
    }, { passive: false });
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('pointerdown', () => NeonAudio.unlock());
    document.addEventListener('touchstart', () => NeonAudio.unlock(), { passive: true });
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('load', () => {
      NeonAds.syncWebAdConfig();
      NeonAds.syncAdButtonsUI();
    });
  }

  NeonAds.syncWebAdConfig();
  NeonAds.syncAdButtonsUI();
  initWebLiveUpdateBadge();
  requestAnimationFrame(loop);
  showMenu();
}

function executeRevive() {
  revivesUsed++;
  game.triggerRevive();
  resumeGame();
}

function showMenu() {
  window.menuEntryTime = Date.now();
  currentState = STATE.MENU;
  resetExtractButton();
  if (pauseOverlayBar && pauseOverlayBar.classList) pauseOverlayBar.classList.add('hidden');
  stopOverclockLoop();
  hideVaultHackWidget();
  if (typeof Input !== 'undefined') {
    Input.paused = false;
    if (Input.reset) Input.reset();
  }
  uiMainMenu.classList.remove('hidden');
  uiShopMenu.classList.add('hidden');
  if (uiCharacterMenu && uiCharacterMenu.classList) uiCharacterMenu.classList.add('hidden');
  if (ncUnifiedHubBar && ncUnifiedHubBar.classList) ncUnifiedHubBar.classList.add('hidden');
  unifiedHubActive = false;
  uiInGameHud.classList.add('hidden');
  uiLevelUp.classList.add('hidden');
  uiGameOver.classList.add('hidden');
  if (uiArsenalMenu) uiArsenalMenu.classList.add('hidden');
  if (uiSanctumHubMenu) uiSanctumHubMenu.classList.add('hidden');
  
  syncCrystalExchangeUI();
  txtMenuBossCores.innerText = Meta.getPerkPoints();
  txtMenuGlobalLevel.innerText = Meta.getGlobalLevel();
  const xp = Meta.data.currentLevelXp || 0;
  const next = Meta.data.xpForNextLevel || 1000;
  barMenuGlobalXp.style.width = `${Math.min(100, (xp / next) * 100)}%`;
  if (typeof updateHubBadges === 'function') updateHubBadges();
}

function rotateCarousel(dir) {
    currentCarouselSlot += dir;
    if (currentCarouselSlot < 1) currentCarouselSlot = 3;
    if (currentCarouselSlot > 3) currentCarouselSlot = 1;
    
    Meta.loadSlot(currentCarouselSlot);
    updateCarouselVisuals();
    showMenu();
}

function updateCarouselVisuals() {
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById('voidSlot' + i);
        if (!el) continue;
        
        let pos = "center";
        if (i === currentCarouselSlot) pos = "center";
        else if (i === (currentCarouselSlot % 3) + 1) pos = "right";
        else pos = "left";
        
        el.setAttribute('data-pos', pos);
    }
}

async function handleResetVoid() {
    const confirmed = await showNeonConfirm({
        title: `RESET VOID ${currentCarouselSlot}`,
        message: `Reset Void ${currentCarouselSlot}? All slot progress will be permanently deleted. Crystals are kept.`,
        confirmLabel: 'RESET VOID',
        cancelLabel: 'CANCEL',
        tone: 'danger'
    });
    if (confirmed) {
        Meta.hardResetSlot(currentCarouselSlot);
        showMenu();
        showNeonNotice(`Void ${currentCarouselSlot} has been reset.`, { title: 'VOID RESET', tone: 'info' });
    }
}

function openShop() {
  openCommandHub('core', 'menu');
}

function closeShop() {
  closeCommandHub();
}

function openCharacter() {
  openCommandHub('perks', 'menu');
}

function closeCharacter() {
  closeCommandHub();
}

// We no longer use charContainer or characterUpgrades array for basic rendering.
// We map PerkPool to tree coordinates dynamically based on element and tier.
// --- CONSTELLATION HEX GRID LOGIC ---
  const elementsList = ['void', 'fire', 'frost', 'storm', 'toxin', 'blood', 'holy', 'earth'];
  const icons = { 'void': '🌀', 'fire': '🔥', 'frost': '❄️', 'storm': '⚡', 'toxin': '☠️', 'blood': '🩸', 'holy': '✨', 'earth': '🪨', 'empty': '' };
  const colors = { 'void': '#ffffff', 'fire': '#ff4444', 'frost': '#44aaff', 'storm': '#ddaaff', 'toxin': '#44ff44', 'blood': '#ff0055', 'holy': '#ffffaa', 'earth': '#cc8844', 'empty': '#222' };

  let constellationGenerated = false;
  let screenPositions = {}; 
  let constellationNodesById = {};
  let currentFocusedNodeId = null;
  
  function getDepth(nodesById, id) {
      let depth = 0; let current = nodesById[id];
      while (current && current.parent) { depth++; current = nodesById[current.parent]; }
      return depth;
  }
  
  function hexDistance(q1, r1, q2, r2) { return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2; }

  function buildConstellationLayout() {
      const canvasArea = document.getElementById('canvasArea');
      if (!canvasArea) return;
      canvasArea.innerHTML = '<svg id="linesSvg"></svg>'; // Clear

      const masteries = [
          { id: 'voidMastery', name: 'The Void', element: 'void', parent: null, reqGlobalLevel: 1, desc: 'Master Core. +4% Damage, +8 Max Hull & +4 Attenuation per Rank. Unlocks Elemental Affinities & deeper Perk Tiers.', costBase: 1, costMult: 1.5 },
          { id: 'fireMastery', name: 'Fire Affinity', element: 'fire', parent: 'voidMastery', reqGlobalLevel: 2, desc: 'Requires Void Core Rank 1+. Boosts Fire damage, Burn power, projectile tint & Fire perk odds.', costBase: 1, costMult: 1.5 },
          { id: 'frostMastery', name: 'Frost Affinity', element: 'frost', parent: 'voidMastery', reqGlobalLevel: 3, desc: 'Requires Void Core Rank 1+. Boosts Frost damage, Chill/Freeze, projectile tint & Frost perk odds.', costBase: 1, costMult: 1.5 },
          { id: 'stormMastery', name: 'Storm Affinity', element: 'storm', parent: 'voidMastery', reqGlobalLevel: 4, desc: 'Requires Void Core Rank 1+. Boosts Storm damage, Chain targets, projectile tint & Storm perk odds.', costBase: 1, costMult: 1.5 },
          { id: 'toxinMastery', name: 'Toxin Affinity', element: 'toxin', parent: 'voidMastery', reqGlobalLevel: 5, desc: 'Requires Void Core Rank 1+. Boosts Toxin damage, Poison power, projectile tint & Toxin perk odds.', costBase: 1, costMult: 1.5 },
          { id: 'bloodMastery', name: 'Blood Affinity', element: 'blood', parent: 'voidMastery', reqGlobalLevel: 6, desc: 'Requires Void Core Rank 1+. Boosts Blood damage, Bleed power, projectile tint & Blood perk odds.', costBase: 1, costMult: 1.5 },
          { id: 'holyMastery', name: 'Holy Affinity', element: 'holy', parent: 'voidMastery', reqGlobalLevel: 7, desc: 'Requires Void Core Rank 1+. Boosts Holy damage, Smite power, projectile tint & Holy perk odds.', costBase: 1, costMult: 1.5 },
          { id: 'earthMastery', name: 'Earth Affinity', element: 'earth', parent: 'voidMastery', reqGlobalLevel: 8, desc: 'Requires Void Core Rank 1+. Boosts Earth damage, Petrify power, projectile tint & Earth perk odds.', costBase: 1, costMult: 1.5 }
      ];
      
      let allPerks = [];
      masteries.forEach(m => {
          allPerks.push({ id: m.id, name: m.name, element: m.element, desc: m.desc, parent: m.parent || null, reqGlobalLevel: m.reqGlobalLevel || 1, costBase: m.costBase, costMult: m.costMult, isMastery: true });
      });
      PerkPool.forEach(p => {
          allPerks.push({ id: p.id, name: p.name, element: p.element || 'void', desc: p.description, parent: p.treeNode ? p.treeNode.parent : null, cost: p.treeNode ? p.treeNode.cost : 1, isMastery: false, reqGlobalLevel: p.reqGlobalLevel || 1, worldHidden: Boolean(p.worldHidden), vaultHint: p.vaultHint || '' });
      });

      const nodesById = {}; allPerks.forEach(p => nodesById[p.id] = p);
      constellationNodesById = nodesById;
      const perksByElement = {}; elementsList.forEach(e => perksByElement[e] = []);
      allPerks.forEach(p => perksByElement[p.element].push(p));
      allPerks.forEach(p => p.treeDepth = getDepth(nodesById, p.id));

      const occupiedGlobal = new Set();
      const allRenderNodes = [];
      
      // BUILD VOID CORE
      const voidNodes = perksByElement['void'];
      const rootId = 'voidMastery';
      const placedVoidNodes = {};
      
      function placeVoidNode(id, q, r) {
          occupiedGlobal.add(`${q},${r}`);
          placedVoidNodes[id] = { q, r, data: nodesById[id] };
          allRenderNodes.push({ q, r, data: nodesById[id], element: 'void' });
      }
      placeVoidNode(rootId, 0, 0);

      const voidQueue = voidNodes.filter(p => p.id !== rootId).sort((a, b) => {
          if (a.treeDepth !== b.treeDepth) return a.treeDepth - b.treeDepth;
          return a.id.localeCompare(b.id);
      });

      const voidSearchSpace = [];
      for (let q = -5; q <= 5; q++) {
          for (let r = Math.max(-5, -q - 5); r <= Math.min(5, -q + 5); r++) {
              voidSearchSpace.push({q, r});
          }
      }

      voidQueue.forEach(node => {
          const parentPos = placedVoidNodes[node.parent] || {q:0, r:0};
          let bestHex = null, bestScore = Infinity;

          voidSearchSpace.forEach(hex => {
              if (occupiedGlobal.has(`${hex.q},${hex.r}`)) return;
              const distToParent = hexDistance(hex.q, hex.r, parentPos.q, parentPos.r);
              const distToCenter = hexDistance(hex.q, hex.r, 0, 0);
              const parentDistToCenter = hexDistance(parentPos.q, parentPos.r, 0, 0);
              let score = distToParent * 10;
              const expectedCenterDist = parentDistToCenter + 1;
              const centerDistDiff = distToCenter - expectedCenterDist;
              if (centerDistDiff < 0) score += Math.abs(centerDistDiff) * 50; 
              else score += centerDistDiff * 5; 
              if (parentDistToCenter > 0) {
                  const parentAngle = Math.atan2(parentPos.r, parentPos.q + parentPos.r/2);
                  const hexAngle = Math.atan2(hex.r, hex.q + hex.r/2);
                  let angleDiff = Math.abs(parentAngle - hexAngle);
                  if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
                  score += angleDiff * 2;
              }
              if (score < bestScore) { bestScore = score; bestHex = hex; }
          });
          if (bestHex) placeVoidNode(node.id, bestHex.q, bestHex.r);
      });

      // BUILD ELEMENTAL MANTLE
      const MACRO_RADIUS = 5; 
      const availableMantleHexes = [];
      for (let q = -MACRO_RADIUS; q <= MACRO_RADIUS; q++) {
          for (let r = Math.max(-MACRO_RADIUS, -q - MACRO_RADIUS); r <= Math.min(MACRO_RADIUS, -q + MACRO_RADIUS); r++) {
              if (!occupiedGlobal.has(`${q},${r}`)) availableMantleHexes.push({q, r});
          }
      }

      availableMantleHexes.sort((a, b) => {
          const angleA = Math.atan2(3/2 * a.r, Math.sqrt(3) * (a.q + a.r/2));
          const angleB = Math.atan2(3/2 * b.r, Math.sqrt(3) * (b.q + b.r/2));
          return angleA - angleB;
      });

      let mantleIndex = 0;
      const satElements = ['fire', 'frost', 'storm', 'toxin', 'blood', 'holy', 'earth'];
      satElements.forEach(elem => {
          const perks = perksByElement[elem];
          const count = perks.length;
          const assignedHexes = availableMantleHexes.slice(mantleIndex, mantleIndex + count);
          mantleIndex += count;
          assignedHexes.sort((a, b) => hexDistance(a.q, a.r, 0, 0) - hexDistance(b.q, b.r, 0, 0));
          perks.sort((a, b) => {
              if (a.isMastery) return -1;
              if (b.isMastery) return 1;
              return a.treeDepth - b.treeDepth;
          });
          perks.forEach((p, i) => {
              if (assignedHexes[i]) {
                  allRenderNodes.push({ q: assignedHexes[i].q, r: assignedHexes[i].r, data: p, element: elem });
                  occupiedGlobal.add(`${assignedHexes[i].q},${assignedHexes[i].r}`);
              }
          });
      });

      // Omit decorative empty hex DOM nodes to keep Perk Tree crisp at 60 FPS on mobile

      // RENDER
      const HEX_SIZE = 45; 
      const SPACING = 50; 
      const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
      const HEX_HEIGHT = 2 * HEX_SIZE;
      const canvasW = Math.sqrt(3) * SPACING * 15; 
      const canvasH = SPACING * 1.5 * 15;
      
      canvasArea.style.width = canvasW + 'px';
      canvasArea.style.height = canvasH + 'px';
      const centerX = canvasW / 2;
      const centerY = canvasH / 2;

      screenPositions = {}; 
      allRenderNodes.forEach(item => {
          const { q, r, data, element } = item;
          const x = centerX + SPACING * Math.sqrt(3) * (q + r / 2);
          const y = centerY + SPACING * 3/2 * r;
          if (data) screenPositions[data.id] = { x, y, data, element };

          const hex = document.createElement('div');
          hex.className = 'hex-node ' + (data ? 'filled' : 'empty');
          hex.style.width = HEX_WIDTH + 'px';
          hex.style.height = HEX_HEIGHT + 'px';
          hex.style.left = x + 'px';
          hex.style.top = y + 'px';

          const c = colors[element];
          if (data) {
              hex.id = 'node-' + data.id;
              hex.style.setProperty('--node-color', c);
              if (data.isMastery) {
                  hex.classList.add('is-mastery');
              }
              hex.innerHTML = `
                  <div class="hex-scale-wrapper">
                      <div class="hex-inner">
                          <span class="icon">${icons[element]}</span>
                          <span class="title" style="color:${c}">${data.name}</span>
                          <div class="hex-level" id="level-${data.id}" style="display:none;"></div>
                      </div>
                  </div>
              `;
              hex.addEventListener('click', (e) => { e.stopPropagation(); handleNodeClick(data.id, c); });
          } else {
              hex.innerHTML = `<div class="hex-scale-wrapper"><div class="hex-inner"></div></div>`;
          }
          canvasArea.appendChild(hex);
      });

      // HIERARCHY LINES
      const linesSvg = document.getElementById('linesSvg');
      Object.values(screenPositions).forEach(node => {
          if (node.data.parent) {
              const pPos = screenPositions[node.data.parent];
              const cPos = node;
              if (pPos && cPos) {
                  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                  line.setAttribute('x1', pPos.x); line.setAttribute('y1', pPos.y);
                  line.setAttribute('x2', cPos.x); line.setAttribute('y2', cPos.y);
                  line.setAttribute('class', 'hierarchy-line');
                  line.id = `line-${node.data.id}`;
                  line.style.stroke = colors[node.element];
                  line.style.opacity = 0.25;
                  linesSvg.appendChild(line);
              }
          }
      });
  }

  function updateCharacterHeaderSummary() {
      if (typeof document === 'undefined' || !txtCharPerkPoints || !txtCharPerkPoints.parentElement) return;
      let summaryEl = document.getElementById('charMasterSummary');
      if (!summaryEl && document.createElement) {
          summaryEl = document.createElement('span');
          summaryEl.id = 'charMasterSummary';
          summaryEl.style.marginLeft = '10px';
          summaryEl.style.color = '#aaddff';
          summaryEl.style.fontSize = '0.9em';
          txtCharPerkPoints.parentElement.appendChild(summaryEl);
      }
      if (summaryEl) {
          const masterLvl = Meta.getGlobalLevel();
          const voidRank = Meta.getUpgradeLevel('voidMastery');
          const usedSlots = typeof Meta.getUnlockedTreePerkCount === 'function' ? Meta.getUnlockedTreePerkCount() : 0;
          const maxSlots = typeof Meta.getMaxUnlockableTreePerks === 'function' ? Meta.getMaxUnlockableTreePerks() : 4;
          summaryEl.innerText = ` • Lv ${masterLvl} • Core ${voidRank} • Slots ${usedSlots}/${maxSlots}`;
      }
  }

  function updateCharacterUI() {
      // Update statuses of all nodes based on strict Meta hierarchy & Master Level gating
      Object.values(screenPositions).forEach(pos => {
          const el = document.getElementById('node-' + pos.data.id);
          if (!el) return;

          const d = pos.data;
          const ev = typeof Meta.evaluateTreeNode === 'function'
            ? Meta.evaluateTreeNode(d, constellationNodesById)
            : { isUnlocked: false, isAvailable: false, canBuy: false, statusClass: 'locked', statusText: 'LOCKED', cost: d.cost || 1 };

          el.classList.remove('locked', 'available', 'unlocked');
          el.classList.add(ev.statusClass || 'locked');

          el.dataset.isUnlocked = String(Boolean(ev.isUnlocked));
          el.dataset.isAvailable = String(Boolean(ev.isAvailable));

          const levelEl = document.getElementById('level-' + d.id);
          if (levelEl) {
              if (d.isMastery && (ev.rank || 0) > 0) {
                  levelEl.style.display = 'block';
                  levelEl.innerText = 'RANK ' + ev.rank;
                  levelEl.style.color = '#ffaa00';
                  levelEl.style.borderColor = '#ffaa00';
              } else if (d.isMastery && d.id === 'voidMastery') {
                  levelEl.style.display = 'block';
                  levelEl.innerText = 'CORE';
                  levelEl.style.color = '#00ffff';
                  levelEl.style.borderColor = '#00ffff';
              } else if (!d.isMastery && ev.isUnlocked) {
                  levelEl.style.display = 'block';
                  levelEl.innerText = 'ACTIVE';
                  levelEl.style.color = '#00ffaa';
                  levelEl.style.borderColor = '#00ffaa';
              } else {
                  levelEl.style.display = 'none';
              }
          }
      });
      updateCharacterHeaderSummary();
  }

  function handleNodeClick(id, color) {
      if (currentFocusedNodeId === id) {
          clearFocus();
          return;
      }
      currentFocusedNodeId = id;
      
      const canvasArea = document.getElementById('canvasArea');
      canvasArea.classList.add('focus-mode');
      canvasArea.style.setProperty('--focus-color', color);

      // Reset previous focus
      document.querySelectorAll('.chain-highlight').forEach(el => el.classList.remove('chain-highlight'));
      document.querySelectorAll('.chain-line-active').forEach(el => {
          el.classList.remove('chain-line-active');
          el.style.opacity = 0.25;
      });

      // Highlight path to root
      let currentId = id;
      while (currentId) {
          const el = document.getElementById('node-' + currentId);
          if (el) el.classList.add('chain-highlight');

          const lineEl = document.getElementById('line-' + currentId);
          if (lineEl) {
              lineEl.classList.add('chain-line-active');
              lineEl.style.stroke = color;
              lineEl.style.opacity = 1;
              document.getElementById('linesSvg').appendChild(lineEl);
          }
          
          const pos = screenPositions[currentId];
          if (!pos) break;
          currentId = pos.data.parent;
      }

      // Populate Details Panel using authoritative Meta tree evaluator
      const pos = screenPositions[id];
      if (!pos) return;
      const d = pos.data;
      const ev = typeof Meta.evaluateTreeNode === 'function'
        ? Meta.evaluateTreeNode(d, constellationNodesById)
        : { isUnlocked: false, isAvailable: false, canBuy: false, statusClass: 'locked', statusText: 'LOCKED', lockReason: '', cost: d.cost || 1 };

      document.getElementById('det-title').innerText = d.name;
      document.getElementById('det-title').style.color = color;

      const detStatus = document.getElementById('det-status');
      detStatus.className = 'skill-status status-' + (ev.statusClass || 'locked');
      detStatus.innerText = ev.statusText || 'LOCKED';

      let descText = d.desc;
      if (d.isMastery) {
          const level = Meta.getUpgradeLevel(d.id);
          const maxR = typeof Meta.getMaxMasteryRank === 'function' ? Meta.getMaxMasteryRank(d.id) : 10;
          descText = `Rank ${level} / ${maxR}\n` + descText;
      }
      if (ev.lockReason) {
          descText += `\n\n[REQUIREMENT]: ${ev.lockReason}`;
      }
      document.getElementById('det-desc').innerText = descText;

      const actionsDiv = document.getElementById('det-actions');
      actionsDiv.innerHTML = '';

      if (ev.canBuy) {
          const cost = ev.cost;
          const btn = document.createElement('button');
          btn.className = 'btn-buy-skill';
          btn.innerHTML = `${d.isMastery && Meta.getUpgradeLevel(d.id) > 0 ? 'UPGRADE RANK' : 'UNLOCK'} (${cost} ${cost === 1 ? 'Point' : 'Points'})`;
          btn.addEventListener('click', () => {
              const res = Meta.purchaseTreeNode(d, constellationNodesById);
              if (res && res.ok) {
                  updateCharacterUI();
                  txtCharPerkPoints.innerText = Meta.getPerkPoints();
                  updateCharacterHeaderSummary();
                  if (typeof updateHubBadges === 'function') updateHubBadges();
                  currentFocusedNodeId = null;
                  handleNodeClick(id, color); // Refresh panel live
              } else if (res && res.reason === 'NO_POINTS') {
                  showNeonNotice('Not enough Perk Points! Level up in runs or defeat Citadel Guardians to earn more.', { title: 'INSUFFICIENT PERK POINTS', tone: 'warn' });
              } else if (res && res.eval && res.eval.lockReason) {
                  showNeonNotice(res.eval.lockReason, { title: 'NODE LOCKED', tone: 'warn' });
                  updateCharacterUI();
                  currentFocusedNodeId = null;
                  handleNodeClick(id, color);
              }
          });
          actionsDiv.appendChild(btn);
      }

      document.getElementById('detailsPanel').classList.add('open');
  }

  function clearFocus() {
      currentFocusedNodeId = null;
      const canvasArea = document.getElementById('canvasArea');
      if (canvasArea) canvasArea.classList.remove('focus-mode');
      document.querySelectorAll('.chain-highlight').forEach(el => el.classList.remove('chain-highlight'));
      document.querySelectorAll('.chain-line-active').forEach(el => {
          el.classList.remove('chain-line-active');
          el.style.opacity = 0.25;
      });
      const panel = document.getElementById('detailsPanel');
      if (panel) panel.classList.remove('open');
  }

  function renderCharacter() {
      txtCharPerkPoints.innerText = Meta.getPerkPoints();
      if (!constellationGenerated) {
          buildConstellationLayout();
          constellationGenerated = true;
          const tc = document.getElementById('treeContainer');
          if(tc) tc.addEventListener('click', clearFocus);
      }
      updateCharacterUI();
      updateCharacterHeaderSummary();
  }

  function setupPanZoom() {
      const container = document.getElementById('treeContainer');
      const canvasArea = document.getElementById('canvasArea');
      if (!container || !canvasArea) return;

      let scale = 0.6, translateX = 0, translateY = 0, isDragging = false, startX = 0, startY = 0;
      let rafPending = false;
      let cachedRect = null;
      const applyTransform = () => {
          rafPending = false;
          canvasArea.style.transform = `translate3d(${translateX.toFixed(1)}px, ${translateY.toFixed(1)}px, 0) scale(${scale})`;
      };
      const scheduleTransform = () => {
          if (typeof requestAnimationFrame !== 'function') {
              applyTransform();
              return;
          }
          if (!rafPending) {
              rafPending = true;
              requestAnimationFrame(applyTransform);
          }
      };

      // Center initially
      window.centerPerkTree = () => {
          const SPACING = 50;
          const canvasW = Math.sqrt(3) * SPACING * 15;
          const canvasH = SPACING * 1.5 * 15;
          translateX = (container.clientWidth - canvasW * scale) / 2;
          translateY = (container.clientHeight - canvasH * scale) / 2;
          applyTransform();
      };

      setTimeout(window.centerPerkTree, 100);

      const stopPan = () => {
          isDragging = false;
          initialPinchDistance = null;
          cachedRect = null;
          container.style.cursor = 'default';
          if (canvasArea.classList) canvasArea.classList.remove('is-panning');
      };

      container.addEventListener('mousedown', (e) => {
          isDragging = true;
          startX = e.clientX - translateX;
          startY = e.clientY - translateY;
          container.style.cursor = 'grabbing';
      });
      window.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          if (canvasArea.classList) canvasArea.classList.add('is-panning');
          translateX = e.clientX - startX;
          translateY = e.clientY - startY;
          scheduleTransform();
      });
      window.addEventListener('mouseup', stopPan);

      container.addEventListener('wheel', (e) => {
          e.preventDefault();
          const delta = -e.deltaY * 0.001;
          const newScale = Math.min(Math.max(0.2, scale + delta), 2.5);
          const rect = container.getBoundingClientRect();
          const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
          translateX = mouseX - (mouseX - translateX) * (newScale / scale);
          translateY = mouseY - (mouseY - translateY) * (newScale / scale);
          scale = newScale;
          scheduleTransform();
      }, { passive: false });

      let initialPinchDistance = null, initialScale = scale, lastTouchX = 0, lastTouchY = 0;
      container.addEventListener('touchstart', (e) => {
          cachedRect = container.getBoundingClientRect();
          if (e.touches.length === 1) {
              isDragging = true;
              lastTouchX = e.touches[0].clientX;
              lastTouchY = e.touches[0].clientY;
          } else if (e.touches.length === 2) {
              isDragging = false;
              initialPinchDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
              initialScale = scale;
              if (canvasArea.classList) canvasArea.classList.add('is-panning');
          }
      }, { passive: false });
      container.addEventListener('touchmove', (e) => {
          e.preventDefault();
          if (e.touches.length === 1 && isDragging) {
              const dx = e.touches[0].clientX - lastTouchX;
              const dy = e.touches[0].clientY - lastTouchY;
              if ((Math.abs(dx) > 2 || Math.abs(dy) > 2) && canvasArea.classList) {
                  canvasArea.classList.add('is-panning');
              }
              translateX += dx;
              translateY += dy;
              lastTouchX = e.touches[0].clientX;
              lastTouchY = e.touches[0].clientY;
              scheduleTransform();
          } else if (e.touches.length === 2 && initialPinchDistance > 0) {
              const currentDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
              const newScale = Math.min(Math.max(0.2, initialScale * (currentDistance / initialPinchDistance)), 2.5);
              const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2, centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
              const rect = cachedRect || container.getBoundingClientRect();
              const mouseX = centerX - rect.left, mouseY = centerY - rect.top;
              translateX = mouseX - (mouseX - translateX) * (newScale / scale);
              translateY = mouseY - (mouseY - translateY) * (newScale / scale);
              scale = newScale;
              scheduleTransform();
          }
      }, { passive: false });
      container.addEventListener('touchend', (e) => {
          if (e.touches.length < 2) initialPinchDistance = null;
          if (e.touches.length === 0) stopPan();
      });
      container.addEventListener('touchcancel', stopPan);
  }
  
  const shopUpgrades = [
  { id: 'baseHp', name: '+15 Start HP', costBase: 15, costMult: 1.4, currencyType: 'currency', reqGlobalLevel: 1 },
  { id: 'baseDamage', name: '+2 Base Damage', costBase: 20, costMult: 1.45, currencyType: 'currency', reqGlobalLevel: 1 },
  { id: 'baseSpeed', name: '+8 Speed', costBase: 15, costMult: 1.4, currencyType: 'currency', reqGlobalLevel: 1 },
  { id: 'magnetism', name: '+15 XP Pickup Range', costBase: 15, costMult: 1.45, currencyType: 'currency', reqGlobalLevel: 1 },
  { id: 'baseFireRate', name: '+8% Fire Rate', costBase: 25, costMult: 1.45, currencyType: 'currency', reqGlobalLevel: 1 },
  { id: 'baseCritChance', name: '+2% Crit Chance', costBase: 30, costMult: 1.5, currencyType: 'currency', reqGlobalLevel: 1 },
  { id: 'basePierce', name: '+1 Pierce', costBase: 150, costMult: 2.2, currencyType: 'currency', reqGlobalLevel: 4, maxLevel: 5 },
  { id: 'baseBounce', name: '+1 Bounce', costBase: 200, costMult: 2.2, currencyType: 'currency', reqGlobalLevel: 6, maxLevel: 5 }
];

function renderShop() {
  syncCrystalExchangeUI();
  txtShopPerkPoints.innerText = Meta.getPerkPoints();
  shopContainer.innerHTML = '';
  
  shopUpgrades.forEach(upg => {
    const level = Meta.getUpgradeLevel(upg.id);
    const isMaxed = upg.maxLevel && level >= upg.maxLevel;
    const cost = Math.floor(upg.costBase * Math.pow(upg.costMult, level));
    const isPerkPoint = upg.currencyType === 'perkPoints';
    const playerAmount = isPerkPoint ? Meta.getPerkPoints() : Meta.getCurrency();
    const canAfford = playerAmount >= cost;
    const reqLevel = upg.reqGlobalLevel || 1;
    const meetsReq = Meta.getGlobalLevel() >= reqLevel;
    const canBuy = canAfford && meetsReq && !isMaxed;
    
    const div = document.createElement('div');
    div.className = `shop-item ${canBuy ? '' : 'disabled'}`;
    div.innerHTML = `
      <div class="item-name">${upg.name}</div>
      <div class="item-desc">Level: ${level}${upg.maxLevel ? ` / ${upg.maxLevel}` : ''}</div>
      <div class="item-footer">
        <span>Cost: ${isMaxed ? 'MAX' : `${cost} ${isPerkPoint ? 'Pts' : 'Matter'}`}</span>
        <span class="nc-chip nc-shop-status">${isMaxed ? 'MAXED' : (!meetsReq ? `REQ LVL ${reqLevel}` : (canAfford ? 'UPGRADE' : 'NEED MATTER'))}</span>
      </div>
    `;

    if (canBuy) {
      div.addEventListener('click', () => {
        if (isPerkPoint) {
          if (Meta.spendPerkPoints(cost)) {
            Meta.upgrade(upg.id);
            if (game) game.voidFlickerTimer = 0.5;
            renderShop();
            if (unifiedHubActive) renderAttributesTab();
            updateHubBadges();
          }
        } else if (Meta.spendCurrency(cost)) {
          Meta.upgrade(upg.id);
          if (game) game.voidFlickerTimer = 0.5;
          renderShop();
          if (unifiedHubActive) renderAttributesTab();
          updateHubBadges();
        }
      });
    }

    shopContainer.appendChild(div);
  });

  if (coreAugsMount) {
    coreAugsMount.innerHTML = '';
    const matter = Meta.getCurrency();
    const gLvl = Meta.getGlobalLevel();
    shopUpgrades.forEach((upg) => {
      const level = Meta.getUpgradeLevel(upg.id);
      const isMaxed = upg.maxLevel && level >= upg.maxLevel;
      const cost = Math.floor(upg.costBase * Math.pow(upg.costMult, level));
      const reqLevel = upg.reqGlobalLevel || 1;
      const meetsReq = gLvl >= reqLevel;
      const canBuy = !isMaxed && meetsReq && matter >= cost;

      const card = document.createElement('div');
      card.className = `nc-aug-card${canBuy ? ' affordable' : ''}`;
      card.innerHTML = `
        <div class="nc-aug-info">
          <strong>${upg.name}</strong>
          <span>Lv ${level}${upg.maxLevel ? `/${upg.maxLevel}` : ''}</span>
        </div>
      `;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `neon-button small${canBuy ? '' : ' secondary'}`;
      btn.disabled = !canBuy;
      btn.textContent = isMaxed ? 'MAX' : (!meetsReq ? `LV ${reqLevel}` : `${cost}M`);
      btn.addEventListener('click', () => {
        if (Meta.spendCurrency(cost)) {
          Meta.upgrade(upg.id);
          if (game) game.voidFlickerTimer = 0.5;
          renderShop();
          renderAttributesTab();
          updateHubBadges();
        }
      });
      card.appendChild(btn);
      coreAugsMount.appendChild(card);
    });
  }
}

function getEffectiveShieldTotal(s) {
  if (!s) return 0;
  const perkShield = (s.specialEffects && s.specialEffects.energyShield)
    ? (30 + Math.floor((s.maxHp || 100) * 0.25) * s.specialEffects.energyShield.level)
    : 0;
  return perkShield + (s.bonusEnergyShield || 0);
}

function simulateArsenalStats(equippedOverride = null, extraPerk = null) {
  if (typeof StatManager === 'undefined' || typeof Meta === 'undefined' || !Meta.data) return null;
  const basePerks = (arsenalReturnToGame && game && game.statManager && Array.isArray(game.statManager.perks))
    ? [...game.statManager.perks]
    : [];
  if (extraPerk) basePerks.push(extraPerk);
  const prevEq = Meta.data.equippedModules;
  if (equippedOverride) Meta.data.equippedModules = equippedOverride;
  let computed = null;
  try {
    const sm = new StatManager();
    sm.perks = basePerks;
    computed = sm.getCurrentStats();
  } finally {
    if (equippedOverride) Meta.data.equippedModules = prevEq;
  }
  return computed;
}

function computeStatsDpsAndEhp(s) {
  if (!s) return { dps: 0, ehp: 0, shield: 0 };
  const projCount = Math.max(1, s.projectileCount || 1);
  const critAvg = 1 + (s.critChance || 0) * ((s.critMultiplier || 2) - 1);
  const procAvg = 1
    + 0.45 * (s.splitChance || 0)
    + 0.45 * (s.forkChance || 0)
    + 0.40 * (s.rockShardChance || 0)
    + 0.30 * (s.ricochetChance || 0);
  const dps = (s.damage || 0) * (s.fireRate || 1) * projCount * critAvg * procAvg;
  const shield = getEffectiveShieldTotal(s);
  const hpPool = Math.max(1, (s.maxHp || 1) + shield);
  const mitFactor = Math.max(0.48, 1 - Math.min(0.52, s.damageMitigation || 0));
  const evadeFactor = Math.max(0.74, 1 - Math.min(0.26, s.phaseEvasion || 0));
  const ehp = (hpPool / (mitFactor * evadeFactor)) + (s.rawAttenuation || 0) * 1.5;
  return { dps, ehp, shield };
}

function buildPerkPreviewBadges(before, after, beforeMetrics, afterMetrics) {
  if (!before || !after) return '';
  const badges = [];
  if (after.maxHp !== before.maxHp) {
    badges.push(`Hull ${Math.round(before.maxHp)}→${Math.round(after.maxHp)}`);
  }
  if (afterMetrics.shield !== beforeMetrics.shield) {
    badges.push(`Shield ${Math.round(beforeMetrics.shield)}→${Math.round(afterMetrics.shield)}`);
  }
  if (beforeMetrics.dps > 0) {
    const dpsPct = Math.round(((afterMetrics.dps - beforeMetrics.dps) / beforeMetrics.dps) * 100);
    if (Math.abs(dpsPct) >= 1) {
      badges.push(`Est DPS ${dpsPct > 0 ? '+' : ''}${dpsPct}%`);
    }
  }
  if (Math.round(after.fireRate * 100) !== Math.round(before.fireRate * 100)) {
    badges.push(`Cadence ${before.fireRate.toFixed(2)}→${after.fireRate.toFixed(2)}/s`);
  }
  if (Math.round(after.speed) !== Math.round(before.speed)) {
    badges.push(`Speed ${Math.round(before.speed)}→${Math.round(after.speed)}`);
  }
  if (Math.round((after.critChance || 0) * 100) !== Math.round((before.critChance || 0) * 100)) {
    badges.push(`Crit ${Math.round((before.critChance || 0) * 100)}%→${Math.round((after.critChance || 0) * 100)}%`);
  }
  const procPairs = [
    ['Split', 'splitChance'],
    ['Fork', 'forkChance'],
    ['Shards', 'rockShardChance'],
    ['Ricochet', 'ricochetChance']
  ];
  for (const [label, key] of procPairs) {
    const bPct = Math.round((before[key] || 0) * 100);
    const aPct = Math.round((after[key] || 0) * 100);
    if (aPct !== bPct) badges.push(`${label} ${bPct}%→${aPct}%`);
  }
  if (Math.round(after.pickupRange) !== Math.round(before.pickupRange)) {
    badges.push(`Magnet ${Math.round(before.pickupRange)}→${Math.round(after.pickupRange)}`);
  }
  if (badges.length === 0) return '';
  return `<div class="nc-perk-preview">${badges.slice(0, 3).map(b => `<span class="nc-perk-preview-badge">${b}</span>`).join('')}</div>`;
}

function startGame(options = {}) {
  revivesUsed = 0;
  hasDoubledCurrency = false;
  sanctumReturnToGame = false;
  arsenalReturnToGame = false;
  resetExtractButton();
  if (pauseOverlayBar && pauseOverlayBar.classList) pauseOverlayBar.classList.add('hidden');
  stopOverclockLoop();
  hideVaultHackWidget();
  if (typeof Input !== 'undefined') {
    if (Input.reset) Input.reset();
    Input.paused = false;
  }
  game.reset({ ...options, consumeFractureKey: true });
  currentState = STATE.PLAYING;
  lastTime = performance.now();

  if (uiMainMenu && uiMainMenu.classList) uiMainMenu.classList.add('hidden');
  if (uiGameOver && uiGameOver.classList) uiGameOver.classList.add('hidden');
  if (uiLevelUp && uiLevelUp.classList) uiLevelUp.classList.add('hidden');
  if (uiShopMenu && uiShopMenu.classList) uiShopMenu.classList.add('hidden');
  if (uiCharacterMenu && uiCharacterMenu.classList) uiCharacterMenu.classList.add('hidden');
  if (uiArsenalMenu && uiArsenalMenu.classList) uiArsenalMenu.classList.add('hidden');
  if (uiSanctumHubMenu && uiSanctumHubMenu.classList) uiSanctumHubMenu.classList.add('hidden');
  unifiedHubActive = false;
  if (ncUnifiedHubBar && ncUnifiedHubBar.classList) ncUnifiedHubBar.classList.add('hidden');
  if (uiInGameHud && uiInGameHud.classList) uiInGameHud.classList.remove('hidden');
  updateHUD();
}

async function startWithAdPerk() {
  const ok = await NeonAds.showRewarded('starter_perk');
  if (!ok) return;
  startGame();
  game.overchargeTimer = 10.0;
  if (typeof FloatingText !== 'undefined' && game.floatingTexts) {
    game.floatingTexts.push(new FloatingText(game.player.x, game.player.y - 40, 'STARTER OVERCHARGE!', '#00ffff', 1.2, 1.8));
  }
  // Immediately show level up screen for the free perk
  showLevelUp(3, 0, true);
}

function showLevelUp(choices = 3, rerolls = 0, ignoreMinLevel = false) {
  if (rerolls === 0) {
    currentRerollChoices = 3;
    currentRerollCount = 0;
    currentLevelUpIgnoreMinLevel = ignoreMinLevel;
    NeonAudio.playLevelUp();
  }
  
  currentState = STATE.LEVEL_UP;
  if (pauseOverlayBar && pauseOverlayBar.classList) pauseOverlayBar.classList.add('hidden');
  if (typeof Input !== 'undefined' && Input.reset) Input.reset();
  if (typeof game !== 'undefined' && game && typeof game.resetLoiterState === 'function') {
    game.resetLoiterState(14.0);
  }
  if (uiGameOver && uiGameOver.classList) uiGameOver.classList.add('hidden');
  uiInGameHud.classList.add('hidden');
  uiLevelUp.classList.remove('hidden');

  const pLvl = (game && game.player) ? (game.player.level || 1) : 1;
  const isSpecialChoiceLevel = Boolean(ignoreMinLevel || (game && game.lastLevelWasBonusPerk) || (pLvl >= 5 && pLvl % 5 === 0));
  const lvlSub = uiLevelUp ? uiLevelUp.querySelector('.subtitle') : null;
  if (lvlSub && game && game.player) {
    if (ignoreMinLevel || game.lastLevelWasBonusPerk) {
      lvlSub.textContent = 'Bonus Synergy Signal — Choose Special Perk';
    } else if (pLvl >= 5 && pLvl % 5 === 0) {
      lvlSub.textContent = `Milestone Level ${pLvl}! Choose Special Perk`;
    } else {
      lvlSub.textContent = `Level ${pLvl} Calibration — Core Attributes (Next Special: Lv ${Math.ceil(Math.max(1, pLvl) / 5) * 5})`;
    }
  }
  
  // Pass current perks for RNG weights (Keystone logic)
  currentPerkChoices = getRandomPerks(choices, game.statManager.perks, rerolls, currentLevelUpIgnoreMinLevel);
  perkContainer.innerHTML = '';

  const beforeStats = (game && game.statManager) ? game.statManager.getCurrentStats() : null;
  const beforeMetrics = computeStatsDpsAndEhp(beforeStats);
  
  currentPerkChoices.forEach((perk, i) => {
    const div = document.createElement('div');
    const isKeystone = perk.isKeystone;
    let previewHtml = '';
    if (beforeStats && game && game.statManager) {
      const savedPerks = game.statManager.perks;
      let afterStats = null;
      try {
        game.statManager.perks = [...savedPerks, perk];
        afterStats = game.statManager.getCurrentStats();
      } finally {
        game.statManager.perks = savedPerks;
      }
      if (afterStats) {
        previewHtml = buildPerkPreviewBadges(beforeStats, afterStats, beforeMetrics, computeStatsDpsAndEhp(afterStats));
      }
    }
    div.className = `perk-card ${isKeystone ? 'keystone-card' : ''}`;
    div.id = `perkCard${i}`;
    div.innerHTML = `
      <div class="item-name" style="${isKeystone ? 'color: gold; text-shadow: 0 0 15px gold;' : ''}">${perk.name}</div>
      <div class="item-desc">${perk.description}</div>
      ${previewHtml}
    `;
    div.addEventListener('click', () => {
      NeonAudio.haptic('selection');
      game.statManager.addPerk(perk);
      game.updatePlayerStats();
      resumeGame();
    });
    perkContainer.appendChild(div);
  });

  NeonAds.syncAdButtonsUI();
  if (!isSpecialChoiceLevel) {
    if (btnReroll) btnReroll.style.display = 'none';
    if (btnRerollPremium) btnRerollPremium.style.display = 'none';
  }
}

function resumeGame() {
  currentState = STATE.PLAYING;
  if (typeof Input !== 'undefined') Input.paused = false;
  if (typeof game !== 'undefined' && game && typeof game.resetLoiterState === 'function') {
    game.resetLoiterState(14.0);
  }
  uiLevelUp.classList.add('hidden');
  uiGameOver.classList.add('hidden');
  uiInGameHud.classList.remove('hidden');
  lastTime = performance.now();
}

function showGameOver(extracted = false) {
  currentState = STATE.GAME_OVER;
  sanctumReturnToGame = false;
  arsenalReturnToGame = false;
  resetExtractButton();
  if (pauseOverlayBar && pauseOverlayBar.classList) pauseOverlayBar.classList.add('hidden');
  stopOverclockLoop();
  hideVaultHackWidget();
  if (typeof Input !== 'undefined' && Input.reset) Input.reset();
  uiInGameHud.classList.add('hidden');
  uiGameOver.classList.remove('hidden');

  if (game.isDailyRun && game.runTime >= 60 && Meta.canClaimDailyBonus()) {
    Meta.claimDailyBonus();
    game.currencyCollected *= 2;
  }

  let safeExtractBonus = 0;
  if (extracted && game && game.world && game.player) {
    const dxS = game.player.x - game.world.center;
    const dyS = game.player.y - game.world.center;
    const inSanctum = (dxS * dxS + dyS * dyS) <= (game.world.sanctumRadius || 1300) * (game.world.sanctumRadius || 1300);
    const recentReturn = (game.runTime - (game.lastSanctumReturnAt || -999)) <= 20;
    if (inSanctum || recentReturn) {
      safeExtractBonus = Math.floor((game.currencyCollected || 0) * 0.20);
      game.currencyCollected = (game.currencyCollected || 0) + safeExtractBonus;
    }
  }
  if (game) game.safeExtractBonus = safeExtractBonus;

  if (goTitle) {
    if (extracted) {
      goTitle.innerText = safeExtractBonus > 0 ? 'SAFE EXTRACTION (+20%)' : 'EXTRACTION COMPLETE';
    } else {
      goTitle.innerText = 'SYSTEM FAILURE';
    }
    if (goTitle.classList) {
      if (extracted) goTitle.classList.remove('error');
      else goTitle.classList.add('error');
    }
  }

  Meta.recordRunSurvival(Math.floor(game.runTime || 0), Boolean(game.isDailyRun));
  if (typeof Meta.recordRunOutcome === 'function' && game && !game._runOutcomeRecorded) {
    game._runOutcomeRecorded = true;
    Meta.recordRunOutcome({
      extracted: Boolean(extracted),
      safeExtracted: safeExtractBonus > 0,
      killer: (!extracted && game.lastDamageSource) ? game.lastDamageSource : null
    });
  }

  const m = Math.floor(game.runTime / 60).toString().padStart(2, '0');
  const s = Math.floor(game.runTime % 60).toString().padStart(2, '0');
  goTime.innerText = `${m}:${s}`;
  if (goKills) goKills.innerText = Math.floor(game.enemiesKilled || 0);
  if (goStreak) goStreak.innerText = `${Math.floor(game.bestKillStreak || 0)}x`;
  goCurrency.innerText = Math.floor(game.currencyCollected) + (safeExtractBonus > 0 ? ` (+${safeExtractBonus} Safe)` : '');
  
  const rawRunXp = Math.floor(game.totalXpEarned || 0);
  const masterXp = typeof Meta.computeMasterXpFromRun === 'function' ? Meta.computeMasterXpFromRun(rawRunXp) : rawRunXp;
  const earnedLevelPoints = Meta.previewLevelUpPerkPoints(masterXp);
  goPerkPoints.innerText = earnedLevelPoints + (game.perkPointsCollected || 0);

  if (goProgressHint && typeof Meta !== 'undefined' && Meta.data) {
    const curLv = Meta.getGlobalLevel();
    const curXp = Math.floor((Meta.data.currentLevelXp || 0) + masterXp);
    const reqXp = Math.max(1, Meta.data.xpForNextLevel || Meta.getXpRequirementForLevel(curLv));
    const remXp = Math.max(0, reqXp - curXp);
    if (safeExtractBonus > 0) {
      goProgressHint.innerText = `Safe Citadel Extraction Bonus: +${safeExtractBonus} Matter | Master Lv ${curLv} (${remXp} XP to next)`;
    } else if (remXp > 0) {
      goProgressHint.innerText = `Master Lv ${curLv}: ${remXp} XP left to Level ${curLv + 1}. Return via a Rim Portal for +20% Safe Extraction!`;
    } else {
      goProgressHint.innerText = `Master Level-Up ready! Visit the Arsenal & Tree before your next deployment.`;
    }
  }

  if (goBuildRecap && game && game.statManager) {
    const runStats = game.statManager.getCurrentStats();
    const metrics = computeStatsDpsAndEhp(runStats);
    const gearPower = (typeof NeonSystems !== 'undefined' && NeonSystems.getEquippedGearPower)
      ? Math.round(NeonSystems.getEquippedGearPower(Meta))
      : 0;
    const extStreak = (Meta.data && Meta.data.extractionStreak) || 0;
    const extMult = (typeof Meta.getExtractionStreakMult === 'function') ? Meta.getExtractionStreakMult() : 1.0;
    const nemInfo = (Meta.data && Meta.data.nemesis)
      ? `<div class="nc-recap-nemesis">NEMESIS BOUNTY: ${Meta.data.nemesis.callsign} (+2 Crystals next run)</div>`
      : '';
    goBuildRecap.innerHTML = `
      <div class="nc-recap-row"><span>Build: <strong>${Math.round(metrics.dps)} DPS</strong> / <strong>${Math.round(metrics.ehp)} EHP</strong></span><span>Lv ${game.player ? game.player.level : 1}</span></div>
      <div class="nc-recap-row"><span>Gear: <strong>${gearPower}</strong></span><span>Streak: <strong>${extStreak}</strong> (x${extMult.toFixed(2)} M)</span></div>
      ${nemInfo}
    `;
  }

  NeonAds.syncAdButtonsUI();
  if (btnRevive) {
    btnRevive.style.display = extracted ? 'none' : '';
  }
  renderGameOverQuickBar();
  updateHubBadges();
}

function getUpgradeNotifications() {
  const counts = { core: 0, perks: 0, gear: 0, sanctum: 0, total: 0 };
  if (typeof Meta === 'undefined' || !Meta.data) return counts;

  const matter = Meta.getCurrency ? Meta.getCurrency() : (Meta.data.currency || 0);
  const gLvl = Meta.getGlobalLevel ? Meta.getGlobalLevel() : (Meta.data.globalLevel || 1);
  if (Meta.getAvailableAttributePoints && Meta.getAvailableAttributePoints() > 0) {
    counts.core += 1;
  }
  for (const upg of shopUpgrades) {
    const lv = Meta.getUpgradeLevel(upg.id);
    if (upg.maxLevel && lv >= upg.maxLevel) continue;
    if (gLvl < (upg.reqGlobalLevel || 1)) continue;
    const cost = Math.floor(upg.costBase * Math.pow(upg.costMult, lv));
    if (matter >= cost) counts.core += 1;
  }

  const perkPts = Meta.getPerkPoints ? Meta.getPerkPoints() : 0;
  if (perkPts > 0) {
    if (!constellationGenerated) {
      buildConstellationLayout();
      constellationGenerated = true;
    }
    if (constellationNodesById && typeof Meta.evaluateTreeNode === 'function') {
      for (const n of Object.values(constellationNodesById)) {
        const ev = Meta.evaluateTreeNode(n, constellationNodesById);
        if (ev && ev.canBuy) counts.perks += 1;
      }
    } else {
      counts.perks = perkPts;
    }
  }

  if (typeof NeonSystems !== 'undefined' && NeonSystems.getModulePowerScore) {
    const eq = Meta.data.equippedModules || {};
    const inv = Meta.data.moduleInventory || [];
    for (const mod of inv) {
      if (!mod || !mod.slot) continue;
      if (mod.slot === 'relic' && !(Meta.isSlotUnlocked && Meta.isSlotUnlocked('relic'))) continue;
      if (Math.max(1, Number(mod.reqLevel) || 1) > gLvl) continue;
      const candScore = NeonSystems.getModulePowerScore(mod);
      const curSlotScore = eq[mod.slot] ? NeonSystems.getModulePowerScore(eq[mod.slot]) : 0;
      const auxOpen = mod.slot !== 'relic' && Meta.isSlotUnlocked && Meta.isSlotUnlocked('auxiliary');
      const auxScore = auxOpen && eq.auxiliary ? NeonSystems.getModulePowerScore(eq.auxiliary) : Infinity;
      if (!eq[mod.slot] || candScore > curSlotScore || (auxOpen && (!eq.auxiliary || candScore > auxScore))) {
        counts.gear += 1;
      }
    }
  }

  if (typeof NeonSystems !== 'undefined' && NeonSystems.ensureContracts) {
    const contracts = NeonSystems.ensureContracts(Meta);
    for (const c of contracts) {
      if (c && c.completed) counts.sanctum += 1;
    }
  }

  counts.total = counts.core + counts.perks + counts.gear + counts.sanctum;
  return counts;
}

function updateHubBadges() {
  const c = getUpgradeNotifications();
  const applyDot = (el, val) => {
    if (!el) return;
    el.textContent = val > 9 ? '9+' : String(val);
    if (el.classList) {
      if (val > 0) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  };
  applyDot(hubMainBadge, c.total);
  applyDot(goUpgradeBadge, c.total);
  applyDot(hubBadgeCore, c.core);
  applyDot(hubBadgePerks, c.perks);
  applyDot(hubBadgeGear, c.gear);
  applyDot(hubBadgeSanctum, c.sanctum);
}

function renderGameOverQuickBar() {
  if (!goQuickBar || typeof Meta === 'undefined' || !Meta.data) return;
  goQuickBar.innerHTML = '';
  const chips = [];
  const notif = getUpgradeNotifications();

  if (notif.sanctum > 0 && typeof NeonSystems !== 'undefined' && NeonSystems.claimAllCompletedContracts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nc-quick-chip nc-quick-gold';
    btn.textContent = `✓ CLAIM ${notif.sanctum} CONTRACT${notif.sanctum > 1 ? 'S' : ''}`;
    btn.addEventListener('click', () => {
      NeonSystems.claimAllCompletedContracts(Meta);
      renderGameOverQuickBar();
      updateHubBadges();
    });
    chips.push(btn);
  }

  if (notif.gear > 0 && typeof NeonSystems !== 'undefined' && NeonSystems.autoEquipBestModules) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nc-quick-chip nc-quick-cyan';
    btn.textContent = `▲ AUTO-EQUIP BEST (${notif.gear})`;
    btn.addEventListener('click', () => {
      NeonSystems.autoEquipBestModules(Meta);
      renderGameOverQuickBar();
      updateHubBadges();
    });
    chips.push(btn);
  }

  if (notif.perks > 0) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nc-quick-chip nc-quick-magenta';
    btn.textContent = `★ ${Meta.getPerkPoints()} PERK PT → TREE`;
    btn.addEventListener('click', () => openCommandHub('perks', 'gameover'));
    chips.push(btn);
  } else if (notif.core > 0) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nc-quick-chip nc-quick-cyan';
    btn.textContent = `⚡ ${notif.core} CORE UPGRADE${notif.core > 1 ? 'S' : ''}`;
    btn.addEventListener('click', () => openCommandHub('core', 'gameover'));
    chips.push(btn);
  }

  if (chips.length > 0) {
    for (const ch of chips.slice(0, 3)) goQuickBar.appendChild(ch);
    if (goQuickBar.classList) goQuickBar.classList.remove('hidden');
  } else if (goQuickBar.classList) {
    goQuickBar.classList.add('hidden');
  }
}

function openCommandHub(tab = 'core', returnTarget = null) {
  const fromGame = (currentState === STATE.PLAYING || currentState === STATE.PAUSED);
  if (returnTarget) hubReturnTarget = returnTarget;
  else if (fromGame) hubReturnTarget = 'game';
  else if (currentState === STATE.GAME_OVER) hubReturnTarget = 'gameover';
  else hubReturnTarget = 'menu';

  arsenalReturnToGame = (hubReturnTarget === 'game');
  sanctumReturnToGame = (hubReturnTarget === 'game');
  unifiedHubActive = true;

  resetExtractButton();
  if (pauseOverlayBar && pauseOverlayBar.classList) pauseOverlayBar.classList.add('hidden');
  if (typeof Input !== 'undefined' && Input.reset) Input.reset();
  if (uiMainMenu && uiMainMenu.classList) uiMainMenu.classList.add('hidden');
  if (uiGameOver && uiGameOver.classList) uiGameOver.classList.add('hidden');
  if (uiInGameHud && uiInGameHud.classList) uiInGameHud.classList.add('hidden');
  if (uiShopMenu && uiShopMenu.classList) uiShopMenu.classList.add('hidden');
  if (ncUnifiedHubBar && ncUnifiedHubBar.classList) ncUnifiedHubBar.classList.remove('hidden');

  if (hubNavSanctum) hubNavSanctum.style.display = arsenalReturnToGame ? 'none' : '';
  switchCommandHubTab(tab || 'core');
}

function switchCommandHubTab(tab = 'core') {
  activeUnifiedHubTab = tab;
  unifiedHubActive = true;
  stopOverclockLoop();

  if (uiArsenalMenu && uiArsenalMenu.classList) uiArsenalMenu.classList.add('hidden');
  if (uiCharacterMenu && uiCharacterMenu.classList) uiCharacterMenu.classList.add('hidden');
  if (uiSanctumHubMenu && uiSanctumHubMenu.classList) uiSanctumHubMenu.classList.add('hidden');

  const navMap = [
    [hubNavCore, 'core'],
    [hubNavPerks, 'perks'],
    [hubNavGear, 'gear'],
    [hubNavSanctum, 'sanctum']
  ];
  for (const [btn, id] of navMap) {
    if (btn && btn.classList) {
      if (id === tab) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  }

  if (tab === 'core') {
    currentState = STATE.ARSENAL;
    if (uiArsenalMenu && uiArsenalMenu.classList) uiArsenalMenu.classList.remove('hidden');
    switchArsenalTab('arsTabAttrs');
    renderShop();
  } else if (tab === 'perks') {
    currentState = STATE.CHARACTER;
    if (uiCharacterMenu && uiCharacterMenu.classList) uiCharacterMenu.classList.remove('hidden');
    renderCharacter();
    if (window.centerPerkTree) setTimeout(window.centerPerkTree, 10);
  } else if (tab === 'gear') {
    currentState = STATE.ARSENAL;
    if (uiArsenalMenu && uiArsenalMenu.classList) uiArsenalMenu.classList.remove('hidden');
    switchArsenalTab('arsTabModules');
  } else if (tab === 'sanctum') {
    currentState = STATE.SANCTUM_HUB;
    if (uiSanctumHubMenu && uiSanctumHubMenu.classList) uiSanctumHubMenu.classList.remove('hidden');
    switchSanctumTab('hubTabArchivist');
    renderPhasesTab();
    if (sanctumPhasesMount && arsTabPhases) {
      while (arsTabPhases.firstChild) {
        sanctumPhasesMount.appendChild(arsTabPhases.firstChild);
      }
    }
  }
  updateHubBadges();
}

function closeCommandHub() {
  stopOverclockLoop();
  unifiedHubActive = false;
  if (ncUnifiedHubBar && ncUnifiedHubBar.classList) ncUnifiedHubBar.classList.add('hidden');
  if (uiArsenalMenu && uiArsenalMenu.classList) uiArsenalMenu.classList.add('hidden');
  if (uiCharacterMenu && uiCharacterMenu.classList) uiCharacterMenu.classList.add('hidden');
  if (uiSanctumHubMenu && uiSanctumHubMenu.classList) uiSanctumHubMenu.classList.add('hidden');
  if (uiShopMenu && uiShopMenu.classList) uiShopMenu.classList.add('hidden');
  if (hubNavSanctum) hubNavSanctum.style.display = '';

  if (hubReturnTarget === 'game' || arsenalReturnToGame || sanctumReturnToGame) {
    arsenalReturnToGame = false;
    sanctumReturnToGame = false;
    if (game && typeof game.updatePlayerStats === 'function') game.updatePlayerStats();
    resumeGame();
  } else if (hubReturnTarget === 'gameover' && uiGameOver) {
    currentState = STATE.GAME_OVER;
    uiGameOver.classList.remove('hidden');
    renderGameOverQuickBar();
    updateHubBadges();
  } else {
    showMenu();
  }
}

function updateHUD() {
  hudLevel.innerText = game.player.level;
  xpBar.style.width = `${Math.min(100, (game.player.xp / Math.max(1, game.player.xpToNextLevel)) * 100)}%`;
  
  const m = Math.floor(game.runTime / 60).toString().padStart(2, '0');
  const s = Math.floor(game.runTime % 60).toString().padStart(2, '0');
  hudTime.innerText = `${m}:${s}`;

  if (game && game.player) {
    const hpVal = Math.max(0, Math.ceil(game.player.hp || 0));
    const maxHpVal = Math.max(1, Math.round(game.player.maxHp || 100));
    const shVal = Math.max(0, Math.round(game.player.energyShield || 0));
    const maxShVal = Math.max(1, Math.round(game.player.maxEnergyShield || maxHpVal));
    const hpPct = Math.max(0, Math.min(100, (hpVal / maxHpVal) * 100));
    const shPct = shVal > 0 ? Math.max(0, Math.min(100, (shVal / maxShVal) * 100)) : 0;
    if (hudHpFill) {
      hudHpFill.style.width = `${hpPct}%`;
      if (hudHpFill.classList) {
        if (hpPct < 30) hudHpFill.classList.add('low');
        else hudHpFill.classList.remove('low');
      }
    }
    if (hudShieldFill) {
      hudShieldFill.style.width = `${shPct}%`;
    }
    if (hudHpText) {
      hudHpText.innerText = shVal > 0 ? `HP ${hpVal}/${maxHpVal} +${shVal}S` : `HP ${hpVal}/${maxHpVal}`;
    }
  }
  if (hudMatter && game) {
    hudMatter.innerText = `+${Math.floor(game.currencyCollected || 0)}M`;
  }
}

function loop(timestamp) {
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  if (currentState === STATE.PLAYING) {
    const isAlive = game.update(Math.min(dt, 0.1), Input.moveVector || {x:0, y:0});
    game.draw();
    updateHUD();

    if (game.checkLevelUp()) {
      showLevelUp();
    } else if (!isAlive) {
      showGameOver();
    }
  } else if (currentState === STATE.PAUSED) {
    if (game && typeof game.drawPauseWorldMap === 'function') {
      game.drawPauseWorldMap();
    }
  } else if (
    currentState === STATE.MENU ||
    currentState === STATE.SHOP
  ) {
    const clampedDt = Math.min(dt, 0.1);
    if (game) {
        if (currentState === STATE.SHOP) {
            game.drawMenuVoid(clampedDt, true);
        } else {
            game.ctx.clearRect(0, 0, game.canvas.width, game.canvas.height);
            game.menuRunTime = (game.menuRunTime || 0) + clampedDt;
        }

        if (currentState === STATE.MENU) {
            for(let i=1; i<=3; i++) {
                const c = document.getElementById('carouselCanvas' + i);
                if (c) {
                    const ctx = c.getContext('2d');
                    ctx.clearRect(0, 0, c.width, c.height);
                    const pwr = Meta.getSlotPower(i);
                    // Scale up by 1.5 to make it look epic within the 600x600 logical canvas
                    ctx.save();
                    ctx.translate(c.width/2, c.height/2);
                    ctx.scale(1.5, 1.5);
                    ctx.translate(-c.width/2, -c.height/2);
                    if (game.renderVoidGraphic) {
                        game.renderVoidGraphic(ctx, c.width/2, c.height/2, pwr, false, false, game.menuRunTime);
                    }
                    ctx.restore();
                }
            }
        }
    }
  }

  requestAnimationFrame(loop);
}

// =========================================================
// v2.0 CORE ARSENAL UI
// =========================================================

const SHARD_COLORS = {
  fire: '#ff6b4a',
  frost: '#5cc4ff',
  storm: '#00eeff',
  toxin: '#33ff66',
  blood: '#ff4d88',
  holy: '#ffee88',
  earth: '#e0a462'
};

function openArsenal(tabId = 'arsTabAttrs') {
  const fromGame = (currentState === STATE.PLAYING || currentState === STATE.PAUSED);
  const mappedTab = tabId === 'arsTabModules' ? 'gear' : (tabId === 'arsTabPhases' ? 'sanctum' : 'core');
  openCommandHub(mappedTab, fromGame ? 'game' : null);
}

function closeArsenal() {
  closeCommandHub();
}

function switchArsenalTab(tabId) {
  activeArsenalTab = tabId;
  const pairs = [
    [tabBtnAttrs, arsTabAttrs, 'arsTabAttrs'],
    [tabBtnModules, arsTabModules, 'arsTabModules'],
    [tabBtnPhases, arsTabPhases, 'arsTabPhases']
  ];
  for (const [btn, panel, id] of pairs) {
    const isMatch = id === tabId;
    if (btn && btn.classList) {
      if (isMatch) btn.classList.add('active');
      else btn.classList.remove('active');
    }
    if (panel && panel.classList) {
      if (isMatch) panel.classList.remove('hidden');
      else panel.classList.add('hidden');
    }
  }
  renderArsenal();
}

function renderArsenal() {
  if (typeof NeonSystems === 'undefined' || !NeonSystems || typeof Meta === 'undefined' || !Meta.data) return;
  syncCrystalExchangeUI();
  if (arsUnspentAttr) {
    arsUnspentAttr.textContent = Meta.getAvailableAttributePoints();
  }
  if (activeArsenalTab === 'arsTabAttrs') {
    renderAttributesTab();
    renderShop();
  } else if (activeArsenalTab === 'arsTabModules') {
    renderModulesTab();
  } else if (activeArsenalTab === 'arsTabPhases') {
    renderPhasesTab();
  }
  updateHubBadges();
}

function renderAttributesTab() {
  if (!attrCardsContainer || typeof NeonSystems === 'undefined') return;
  attrCardsContainer.innerHTML = '';

  const liveStats = simulateArsenalStats();
  if (liveStats) {
    const liveM = computeStatsDpsAndEhp(liveStats);
    const bar = document.createElement('div');
    bar.className = 'nc-live-stats-bar';
    const items = [
      `DMG <strong>${Math.round(liveStats.damage)}</strong>`,
      `CADENCE <strong>${liveStats.fireRate.toFixed(2)}/s</strong>`,
      `EST DPS <strong style="color:#00ffaa;">${Math.round(liveM.dps)}</strong>`,
      `HULL <strong style="color:#ff6688;">${Math.round(liveStats.maxHp)}</strong>`,
      `SHIELD <strong style="color:#66ccff;">${Math.round(liveM.shield)}</strong>`,
      `ATTEN <strong>${Math.round(liveStats.rawAttenuation || 0)}</strong>`,
      `CRIT <strong>${Math.round((liveStats.critChance || 0) * 100)}% (x${(liveStats.critMultiplier || 2).toFixed(2)})</strong>`
    ];
    if ((liveStats.splitChance || 0) > 0) items.push(`SPLIT <strong>${Math.round(liveStats.splitChance * 100)}%</strong>`);
    if ((liveStats.forkChance || 0) > 0) items.push(`FORK <strong>${Math.round(liveStats.forkChance * 100)}%</strong>`);
    if ((liveStats.rockShardChance || 0) > 0) items.push(`SHARDS <strong>${Math.round(liveStats.rockShardChance * 100)}%</strong>`);
    if ((liveStats.ricochetChance || 0) > 0) items.push(`RICOCHET <strong>${Math.round(liveStats.ricochetChance * 100)}%</strong>`);
    if ((liveStats.socketedShardCount || 0) > 0) {
      const domEl = liveStats.dominantShardElement || 'void';
      const elemPct = Math.round(((liveStats.elemBonuses && liveStats.elemBonuses[domEl]) || 0) * 100);
      items.push(`SHARD PULSE <strong style="color:${SHARD_COLORS[domEl] || '#ffd700'};">${domEl.toUpperCase()} +${elemPct}% (${liveStats.socketedShardCount}x)</strong>`);
    }
    bar.innerHTML = items.map(it => `<span class="nc-live-stat-item">${it}</span>`).join('');
    attrCardsContainer.appendChild(bar);
  }

  const avail = Meta.getAvailableAttributePoints();
  const baseSpent = Meta.data.spentAttributes || {};
  const effective = NeonSystems.getEffectiveAttributes(Meta);

  for (const key of NeonSystems.ATTRIBUTE_KEYS) {
    const def = NeonSystems.ATTRIBUTE_DEFS[key];
    const pts = baseSpent[key] || 0;
    const effPts = effective[key] || 0;
    const bonusPts = Math.max(0, effPts - pts);
    const barPct = Math.min(100, Math.round((effPts / 60) * 100));
    const milestones = (NeonSystems.ATTRIBUTE_MILESTONES && NeonSystems.ATTRIBUTE_MILESTONES[key]) || [];
    const milestoneHtml = milestones.map(m => {
      const unlocked = effPts >= m.threshold;
      return `<div class="nc-milestone-pill${unlocked ? ' unlocked' : ''}">${unlocked ? '✓' : '○'} [${m.threshold}] ${m.label}</div>`;
    }).join('');

    const card = document.createElement('div');
    card.className = 'nc-attr-card';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <strong style="color:#ffffff;">${def.name}</strong>
        <span class="nc-chip">${pts}${bonusPts > 0 ? ` (+${bonusPts})` : ''} PTS</span>
      </div>
      <div style="font-size:0.8rem;color:#b8d9f0;">${def.desc}</div>
      <div class="nc-attr-bar"><div class="nc-attr-bar-fill" style="width:${barPct}%;"></div></div>
      ${milestoneHtml ? `<div class="nc-milestone-list">${milestoneHtml}</div>` : ''}
    `;

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';

    for (const amt of [1, 5]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `+${amt}`;
      btn.disabled = avail < amt;
      btn.addEventListener('click', () => {
        if (Meta.spendAttribute(key, amt)) {
          renderArsenal();
        }
      });
      btnRow.appendChild(btn);
    }
    card.appendChild(btnRow);
    attrCardsContainer.appendChild(card);
  }
}

function buildModuleCardElement(mod, isEquipped, equippedSlotKey = null) {
  const qDef = NeonSystems.MODULE_QUALITIES[mod.quality] || NeonSystems.MODULE_QUALITIES.standard;
  const allSlots = NeonSystems.ALL_EQUIPMENT_SLOTS || NeonSystems.MODULE_SLOTS;
  const slotName = allSlots[mod.slot] || mod.slot;
  const isAuxEquipped = equippedSlotKey === 'auxiliary';
  const seq = NeonSystems.detectHarmonicSequence(mod);
  const sig = (mod.signatureId && NeonSystems.SIGNATURE_CATALOG[mod.signatureId])
    ? NeonSystems.SIGNATURE_CATALOG[mod.signatureId]
    : ((mod.relicId && NeonSystems.APEX_RELIC_CATALOG && NeonSystems.APEX_RELIC_CATALOG[mod.relicId])
      ? NeonSystems.APEX_RELIC_CATALOG[mod.relicId]
      : null);

  const card = document.createElement('div');
  card.className = `nc-mod-card nc-q-${mod.quality}${mod.slot === 'relic' ? ' nc-slot-relic' : ''}`;

  const effLevel = Math.max(
    (typeof Meta !== 'undefined' && Meta.getGlobalLevel) ? Meta.getGlobalLevel() : 1,
    (typeof game !== 'undefined' && game && game.player && typeof currentState !== 'undefined' && currentState !== STATE.MENU) ? (game.player.level || 0) : 0
  );
  const iLvl = Math.max(1, Math.floor(mod.itemLevel || ((mod.itemTier || 1) * 5)));
  const reqLv = Math.max(1, Math.floor(mod.reqLevel || 1));
  const reqLocked = !isEquipped && effLevel < reqLv;

  const header = document.createElement('div');
  header.className = 'nc-mod-header';
  header.innerHTML = `
    <strong class="nc-mod-title" style="color:${qDef.color};">${mod.name}${mod.overdriven ? ' [OD]' : ''}</strong>
    <div class="nc-mod-badges">
      <span class="nc-chip nc-ilvl-chip">iLv ${iLvl}</span>
      ${reqLv > 1 ? `<span class="nc-chip${reqLocked ? ' nc-req-locked' : ''}">REQ ${reqLv}</span>` : ''}
      <span class="nc-chip">${isAuxEquipped ? 'AUX • ' : ''}T${mod.itemTier} ${slotName}</span>
    </div>
  `;
  card.appendChild(header);

  const propsList = document.createElement('div');
  propsList.style.fontSize = '0.78rem';
  propsList.style.color = '#d8f4ff';
  const lines = (mod.properties || []).map(p => `<div>${NeonSystems.formatModuleProperty(p)}</div>`);
  if (mod.implicit && mod.implicit.label) {
    lines.unshift(`<div class="nc-implicit-line">◆ ${mod.implicit.label}</div>`);
  }
  if (mod.synergyAffix && mod.synergyAffix.label) {
    lines.push(`<div class="nc-synergy-line">✦ ${mod.synergyAffix.label}</div>`);
  }
  if (sig) {
    lines.push(`<div style="color:#ffd700;">★ ${sig.positiveText}</div>`);
    lines.push(`<div style="color:#ff7788;">▼ ${sig.tradeoffText}</div>`);
  }
  if (mod.stabilityPenalty > 0) {
    lines.push(`<div style="color:#ff7788;">▼ -${Math.round(mod.stabilityPenalty * 100)}% Move Speed (Unstable)</div>`);
  }
  if (seq) {
    lines.push(`<div style="color:#00ffaa;">◈ Harmonic: ${seq.name} (${seq.desc})</div>`);
  }
  propsList.innerHTML = lines.join('');
  card.appendChild(propsList);

  if (!isEquipped && mod.slot && typeof Meta !== 'undefined' && Meta.data && Meta.data.equippedModules) {
    const curStats = simulateArsenalStats();
    const nextEq = { ...Meta.data.equippedModules, [mod.slot]: mod };
    const nextStats = simulateArsenalStats(nextEq);
    if (curStats && nextStats) {
      const curM = computeStatsDpsAndEhp(curStats);
      const nextM = computeStatsDpsAndEhp(nextStats);
      const deltas = [];
      if (curM.dps > 0) {
        const dpsPct = Math.round(((nextM.dps - curM.dps) / curM.dps) * 100);
        if (Math.abs(dpsPct) >= 1) {
          deltas.push(`<span class="nc-delta-pill ${dpsPct > 0 ? 'nc-delta-up' : 'nc-delta-down'}">DPS ${dpsPct > 0 ? '+' : ''}${dpsPct}%</span>`);
        }
      }
      if (curM.ehp > 0) {
        const ehpPct = Math.round(((nextM.ehp - curM.ehp) / curM.ehp) * 100);
        if (Math.abs(ehpPct) >= 1) {
          deltas.push(`<span class="nc-delta-pill ${ehpPct > 0 ? 'nc-delta-up' : 'nc-delta-down'}">EHP ${ehpPct > 0 ? '+' : ''}${ehpPct}%</span>`);
        }
      }
      if (deltas.length > 0) {
        const deltaRow = document.createElement('div');
        deltaRow.className = 'nc-delta-row';
        deltaRow.innerHTML = deltas.join('');
        card.appendChild(deltaRow);
      }
    }
  }

  const filledSockets = Array.isArray(mod.sockets) ? mod.sockets.filter(Boolean) : [];
  if (filledSockets.length > 0) {
    const legacyRow = document.createElement('div');
    legacyRow.style.display = 'flex';
    legacyRow.style.flexWrap = 'wrap';
    legacyRow.style.gap = '6px';
    legacyRow.innerHTML = filledSockets.map(sock =>
      `<span class="nc-chip" style="border-color:${SHARD_COLORS[sock.element] || '#00eeff'};color:${SHARD_COLORS[sock.element] || '#ffffff'};">◆ ${sock.element.toUpperCase()} T${sock.tier}</span>`
    ).join('');
    card.appendChild(legacyRow);
  }

  const actions = document.createElement('div');
  actions.className = 'nc-mod-actions';

  if (isEquipped) {
    if (typeof NeonSystems.upgradeModuleLevel === 'function' && typeof NeonSystems.getModuleUpgradeCost === 'function') {
      const upCount = mod.upgradeCount || 0;
      const upCost = NeonSystems.getModuleUpgradeCost(mod);
      const canUp = upCount < 10 && (typeof Meta.getCurrency === 'function' ? Meta.getCurrency() >= upCost : true);
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = canUp ? 'nc-btn-upgrade-hot' : '';
      upBtn.disabled = !canUp;
      upBtn.textContent = upCount >= 10 ? 'MAX +iLv' : `UPGRADE +2 iLv (${upCost}M)`;
      upBtn.addEventListener('click', () => {
        const res = NeonSystems.upgradeModuleLevel(Meta, mod.uid);
        if (res && res.ok) renderArsenal();
      });
      actions.appendChild(upBtn);
    }

    const unequipBtn = document.createElement('button');
    unequipBtn.type = 'button';
    unequipBtn.textContent = 'UNEQUIP';
    unequipBtn.addEventListener('click', () => {
      const res = NeonSystems.unequipModule(Meta, equippedSlotKey || mod.slot);
      if (!res.ok && res.reason === 'inventory_full') showNeonNotice('Module Archive is full (max 36)! Salvage weaker modules to free space.', { title: 'ARCHIVE FULL', tone: 'warn' });
      renderArsenal();
    });
    actions.appendChild(unequipBtn);
  } else {
    const equipBtn = document.createElement('button');
    equipBtn.type = 'button';
    const isRelicLocked = mod.slot === 'relic' && !(Meta.isSlotUnlocked && Meta.isSlotUnlocked('relic'));
    const eqBlocked = isRelicLocked || reqLocked;
    equipBtn.textContent = isRelicLocked ? 'RELIC LOCKED' : (reqLocked ? `REQ LV ${reqLv}` : 'EQUIP');
    if (eqBlocked) equipBtn.className = 'nc-btn-req-locked';
    equipBtn.disabled = eqBlocked;
    equipBtn.addEventListener('click', () => {
      const inRunLevel = (typeof game !== 'undefined' && game && game.player && typeof currentState !== 'undefined' && currentState !== STATE.MENU) ? (game.player.level || 0) : 0;
      NeonSystems.equipModule(Meta, mod.uid, undefined, { inRunLevel });
      renderArsenal();
    });
    actions.appendChild(equipBtn);

    if (mod.slot !== 'relic' && Meta.isSlotUnlocked && Meta.isSlotUnlocked('auxiliary')) {
      const auxBtn = document.createElement('button');
      auxBtn.type = 'button';
      auxBtn.textContent = reqLocked ? `AUX REQ ${reqLv}` : 'EQUIP AUX';
      if (reqLocked) auxBtn.className = 'nc-btn-req-locked';
      auxBtn.disabled = reqLocked;
      auxBtn.addEventListener('click', () => {
        const inRunLevel = (typeof game !== 'undefined' && game && game.player && typeof currentState !== 'undefined' && currentState !== STATE.MENU) ? (game.player.level || 0) : 0;
        NeonSystems.equipModule(Meta, mod.uid, 'auxiliary', { inRunLevel });
        renderArsenal();
      });
      actions.appendChild(auxBtn);
    }

    const salvBtn = document.createElement('button');
    salvBtn.type = 'button';
    salvBtn.textContent = `SALVAGE (+${qDef.salvageMatter})`;
    salvBtn.addEventListener('click', () => {
      NeonSystems.salvageModule(Meta, mod.uid);
      renderArsenal();
    });
    actions.appendChild(salvBtn);
  }
  card.appendChild(actions);
  return card;
}

function renderModulesTab() {
  if (!equippedSlotsContainer || !shardInventoryBar || !moduleInventoryContainer) return;

  if (gearPresetBar && Meta && Meta.data) {
    gearPresetBar.innerHTML = '';
    const activeIdx = Meta.data.activePresetIndex || 0;
    const presets = Array.isArray(Meta.data.loadoutPresets) ? Meta.data.loadoutPresets : [null, null, null];
    for (let i = 0; i < 3; i++) {
      const p = presets[i];
      const pBtn = document.createElement('button');
      pBtn.type = 'button';
      pBtn.className = `nc-preset-btn${i === activeIdx ? ' active' : ''}`;
      pBtn.textContent = p ? `${p.name}${i === activeIdx ? ' ✓' : ''}` : `SET ${i + 1} (EMPTY)`;
      pBtn.addEventListener('click', () => {
        if (!p) {
          if (NeonSystems.saveLoadoutPreset) NeonSystems.saveLoadoutPreset(Meta, i);
        } else if (NeonSystems.applyLoadoutPreset) {
          const inRunLevel = (arsenalReturnToGame && game && game.player) ? (game.player.level || 0) : 0;
          NeonSystems.applyLoadoutPreset(Meta, i, { inRunLevel });
        }
        renderArsenal();
      });
      gearPresetBar.appendChild(pBtn);
    }
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'nc-preset-btn nc-preset-save';
    saveBtn.textContent = `SAVE → SET ${activeIdx + 1}`;
    saveBtn.addEventListener('click', () => {
      if (NeonSystems.saveLoadoutPreset) NeonSystems.saveLoadoutPreset(Meta, activeIdx);
      renderArsenal();
    });
    gearPresetBar.appendChild(saveBtn);
  }

  // 1. Equipped Slots (4 Core + 2 Unlockable: Auxiliary Core & Apex Relic)
  equippedSlotsContainer.innerHTML = '';
  const eq = Meta.data.equippedModules || {};
  const allSlots = NeonSystems.ALL_EQUIPMENT_SLOTS || NeonSystems.MODULE_SLOTS;
  const unlockHints = {
    auxiliary: 'LOCKED — Capture the Southern Equipment Forge (~22.5k South) to permanently unlock a 5th Core slot.',
    relic: 'LOCKED — Capture the North-East Equipment Forge (~24.2k NE) or Breach a Mythic Vault to unlock Apex Relics.'
  };

  for (const slot of Object.keys(allSlots)) {
    const mod = eq[slot];
    const unlocked = !(Meta.isSlotUnlocked) || Meta.isSlotUnlocked(slot);
    if (mod) {
      equippedSlotsContainer.appendChild(buildModuleCardElement(mod, true, slot));
    } else if (!unlocked) {
      const locked = document.createElement('div');
      locked.className = 'nc-mod-card nc-slot-card nc-slot-locked';
      locked.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <strong style="color:#ffc878;">${allSlots[slot]}</strong>
          <span class="nc-chip">LOCKED SLOT</span>
        </div>
        <div class="nc-slot-lock-msg">${unlockHints[slot] || 'Unlock this slot in the world.'}</div>
      `;
      equippedSlotsContainer.appendChild(locked);
    } else {
      const empty = document.createElement('div');
      empty.className = `nc-mod-card nc-slot-card${slot === 'relic' ? ' nc-slot-relic' : ''}`;
      const emptyDesc = slot === 'auxiliary'
        ? 'Empty Auxiliary Core — use "EQUIP AUX" on any Core module in Archive.'
        : (slot === 'relic'
          ? 'Empty Apex Relic Slot — recover Mythic Relics from Outer World Vaults.'
          : `Empty Core Slot — equip a ${slot} module from archive.`);
      empty.innerHTML = `
        <strong style="color:${slot === 'relic' ? '#ffcc33' : '#88b8d8'};">${allSlots[slot]}</strong>
        <div style="font-size:0.78rem;color:#a8c8e4;">${emptyDesc}</div>
      `;
      equippedSlotsContainer.appendChild(empty);
    }
  }

  // 2. Auto-Resonance Shards (auto-merged 3xT1 -> T2, passive Element Bonus & Attenuation)
  if (typeof NeonSystems.autoSynthesizeAllShards === 'function') {
    NeonSystems.autoSynthesizeAllShards(Meta);
  }
  shardInventoryBar.innerHTML = '';
  const shards = Meta.data.frequencyShards || {};
  const autoRes = (typeof NeonSystems.getAutoResonanceBonuses === 'function') ? NeonSystems.getAutoResonanceBonuses(Meta) : { elemBonuses: {}, rawAttenuation: 0, totalUnits: 0 };
  for (const el of NeonSystems.SHARD_ELEMENTS) {
    const pair = shards[el] || [0, 0];
    const bonusPct = Math.round(((autoRes.elemBonuses && autoRes.elemBonuses[el]) || 0) * 100);
    const chipWrap = document.createElement('div');
    chipWrap.className = 'nc-shard-chip';
    chipWrap.style.borderColor = SHARD_COLORS[el] || '#00eeff';

    const label = document.createElement('span');
    label.style.color = SHARD_COLORS[el] || '#ffffff';
    label.textContent = `${el.toUpperCase()} T1:${pair[0]} T2:${pair[1]}${bonusPct > 0 ? ` (+${bonusPct}%)` : ''}`;
    chipWrap.appendChild(label);
    shardInventoryBar.appendChild(chipWrap);
  }

  // Active Auto-Resonance + Socketed Shards Readout
  const shardStats = simulateArsenalStats();
  const activeShardSummary = document.createElement('div');
  if (shardStats && ((autoRes.totalUnits || 0) > 0 || (shardStats.socketedShardCount || 0) > 0)) {
    activeShardSummary.className = 'nc-live-stats-bar';
    activeShardSummary.style.width = '100%';
    const activeParts = [];
    for (const el of NeonSystems.SHARD_ELEMENTS) {
      const bonus = (shardStats.elemBonuses && shardStats.elemBonuses[el]) || 0;
      if (bonus > 0) {
        activeParts.push(`<span class="nc-live-stat-item" style="color:${SHARD_COLORS[el] || '#ffffff'};">${el.toUpperCase()} +${Math.round(bonus * 100)}%</span>`);
      }
    }
    const penPct = Math.round((shardStats.elementalPenetration || 0) * 100);
    activeShardSummary.innerHTML = `<span class="nc-live-stat-item">AUTO-RESONANCE ATTEN <strong>+${autoRes.rawAttenuation || 0}</strong>${penPct > 0 ? ` • PEN <strong>${penPct}%</strong>` : ''}</span>${activeParts.join('')}`;
  } else {
    activeShardSummary.className = 'nc-info-note';
    activeShardSummary.innerHTML = 'Collected Shards automatically fuse (3x T1 → T2) and grant passive Elemental DMG + Attenuation. No manual socketing needed!';
  }
  shardInventoryBar.appendChild(activeShardSummary);

  // 3. Module Inventory (sorted by Power Score descending)
  moduleInventoryContainer.innerHTML = '';
  const inv = [...(Meta.data.moduleInventory || [])].sort((a, b) => (NeonSystems.getModulePowerScore ? NeonSystems.getModulePowerScore(b) - NeonSystems.getModulePowerScore(a) : 0));
  if (inv.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'nc-mod-card';
    empty.innerHTML = '<div style="font-size:0.86rem;color:#9ab8d4;">No Modules in Archive yet. Defeat Elites, Citadel Bosses, or visit Sanctum!</div>';
    moduleInventoryContainer.appendChild(empty);
  } else {
    for (const mod of inv) {
      moduleInventoryContainer.appendChild(buildModuleCardElement(mod, false));
    }
  }
}

function renderPhasesTab() {
  if (!phaseCardsContainer || !fractureKeyContainer || !descentPanel) return;

  // 1. World Phases I-IV
  phaseCardsContainer.innerHTML = '';
  const maxPhase = Meta.data.maxUnlockedPhase || 1;
  const selPhase = Meta.data.selectedPhase || 1;
  const singLvl = Meta.data.singularityLevel || 1;
  const maxSing = Meta.data.maxSingularityLevel || 1;

  const lockHints = {
    2: 'Unlock: Defeat The Architect in Phase I.',
    3: 'Unlock: Defeat The Architect in Phase II.',
    4: 'Unlock: Defeat The Architect in Phase III.'
  };

  for (let p = 1; p <= 4; p++) {
    const cfg = NeonSystems.getPhaseConfig(p, p === 4 ? singLvl : 1);
    const unlocked = maxPhase >= p;
    const isSelected = selPhase === p;

    const card = document.createElement('div');
    card.className = `nc-phase-card${unlocked ? '' : ' locked'}${isSelected ? ' selected' : ''}`;
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="color:${unlocked ? '#00eeff' : '#8899aa'};">${cfg.name}</strong>
        <span class="nc-chip">${isSelected ? 'ACTIVE' : (unlocked ? 'READY' : 'LOCKED')}</span>
      </div>
      <div style="font-size:0.78rem;color:#cce6ff;">
        Enemy HP x${cfg.hpMult.toFixed(2)} | Dmg x${cfg.dmgMult.toFixed(2)}<br/>
        Attenuation -${cfg.attenuationPenalty} | Rewards x${cfg.rewardMult.toFixed(2)} | Elite Mods: ${cfg.eliteMods}
      </div>
      ${!unlocked ? `<div style="font-size:0.74rem;color:#ff8899;">${lockHints[p] || ''}</div>` : ''}
    `;

    if (unlocked) {
      card.addEventListener('click', () => {
        Meta.data.selectedPhase = p;
        Meta.save();
        renderPhasesTab();
        updateHubBadges();
      });

      if (p === 4) {
        const stepper = document.createElement('div');
        stepper.style.display = 'flex';
        stepper.style.alignItems = 'center';
        stepper.style.gap = '8px';

        const minus = document.createElement('button');
        minus.type = 'button';
        minus.textContent = 'SING -';
        minus.disabled = singLvl <= 1;
        minus.addEventListener('click', (ev) => {
          ev.stopPropagation();
          Meta.data.singularityLevel = Math.max(1, (Meta.data.singularityLevel || 1) - 1);
          Meta.data.selectedPhase = 4;
          Meta.save();
          renderPhasesTab();
          updateHubBadges();
        });

        const lvlBadge = document.createElement('span');
        lvlBadge.className = 'nc-chip';
        lvlBadge.textContent = `SING +${singLvl} / +${maxSing}`;

        const plus = document.createElement('button');
        plus.type = 'button';
        plus.textContent = 'SING +';
        plus.disabled = singLvl >= maxSing;
        plus.addEventListener('click', (ev) => {
          ev.stopPropagation();
          Meta.data.singularityLevel = Math.min(maxSing, (Meta.data.singularityLevel || 1) + 1);
          Meta.data.selectedPhase = 4;
          Meta.save();
          renderPhasesTab();
          updateHubBadges();
        });

        stepper.appendChild(minus);
        stepper.appendChild(lvlBadge);
        stepper.appendChild(plus);
        card.appendChild(stepper);
      }
    }
    phaseCardsContainer.appendChild(card);
  }

  // 2. Fracture Keys
  fractureKeyContainer.innerHTML = '';
  const activeKey = Meta.data.activeFractureKey || '';
  const keys = Meta.data.fractureKeys || {};

  const noneBtn = document.createElement('button');
  noneBtn.type = 'button';
  noneBtn.className = 'nc-key-card';
  noneBtn.style.borderColor = activeKey === '' ? '#00eeff' : 'rgba(0,238,255,0.35)';
  noneBtn.innerHTML = `
    <span style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <strong style="color:${activeKey === '' ? '#00eeff' : '#d8f8ff'};">STANDARD RUN</strong>
      <span class="nc-chip">${activeKey === '' ? 'ACTIVE' : 'DEFAULT'}</span>
    </span>
    <span style="font-size:0.74rem;color:#b8d9f0;">Baseline deployment with no Fracture Key modifiers.</span>
  `;
  noneBtn.addEventListener('click', () => {
    Meta.data.activeFractureKey = '';
    Meta.save();
    renderPhasesTab();
    updateHubBadges();
  });
  fractureKeyContainer.appendChild(noneBtn);

  for (const [kId, def] of Object.entries(NeonSystems.FRACTURE_KEY_DEFS)) {
    const owned = keys[kId] || 0;
    const isSel = activeKey === kId;
    const keyBtn = document.createElement('button');
    keyBtn.type = 'button';
    keyBtn.className = 'nc-key-card';
    keyBtn.disabled = owned <= 0 && !isSel;
    keyBtn.style.borderColor = isSel ? '#ffd700' : 'rgba(0,238,255,0.45)';
    keyBtn.style.color = isSel ? '#ffd700' : '#d8f8ff';
    keyBtn.innerHTML = `
      <span style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <strong>${def.name}</strong>
        <span class="nc-chip">x${owned}${isSel ? ' • ACTIVE' : ''}</span>
      </span>
      <span style="font-size:0.74rem;color:#b8d9f0;">${def.desc}</span>
    `;
    keyBtn.addEventListener('click', () => {
      if (owned <= 0 && !isSel) return;
      Meta.data.activeFractureKey = isSel ? '' : kId;
      Meta.save();
      renderPhasesTab();
      updateHubBadges();
    });
    fractureKeyContainer.appendChild(keyBtn);
  }

  // 3. Singularity Descent Launcher
  descentPanel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <strong style="color:#ff00ff;">ENDLESS CONTAINMENT TOWER</strong>
        <div style="font-size:0.82rem;color:#d6e9ff;">Survive escalating waves every 14s inside a 2600px arena. Best Depth: <span style="color:#ffd700;">${Meta.data.bestDescentDepth || 0}</span></div>
      </div>
    </div>
  `;
  const launchBtn = document.createElement('button');
  launchBtn.type = 'button';
  launchBtn.className = 'neon-button small';
  launchBtn.style.marginTop = '10px';
  launchBtn.textContent = 'START SINGULARITY DESCENT';
  launchBtn.addEventListener('click', () => {
    startGame({ mode: 'descent' });
  });
  descentPanel.appendChild(launchBtn);
}

// =========================================================
// v2.0 SANCTUM ECHO ENTITIES HUB (ARCHIVIST / ARTIFICER / BROKER)
// =========================================================

const CODEX_INFO = {
  grunt: { name: 'Vector Drone', role: 'Swarm Striker', drops: 'XP Orbs, Rare Matter' },
  brute: { name: 'Siege Juggernaut', role: 'Heavy Charger', drops: 'XP Orbs, Elite Modules' },
  ranger: { name: 'Arc Marksman', role: 'Ranged Kiter', drops: 'XP Orbs, Shards' },
  rogue: { name: 'Phase Stalker', role: 'Evasive Flanker', drops: 'XP Orbs, Shards' },
  golem: { name: 'Monolith Sentinel', role: 'Armored Colossus', drops: 'High XP, Shards' },
  zergling: { name: 'Swarm Fragment', role: 'Fast Skitterer', drops: 'XP Orbs' },
  shieldbearer: { name: 'Aegis Vanguard', role: 'Directional Shield', drops: 'XP Orbs, Modules' },
  medic: { name: 'Repair Conduit', role: 'Allied Healer', drops: 'XP Orbs, Shards' },
  commander: { name: 'Tactical Overlord', role: 'Aura Buffer', drops: 'High XP, Modules' },
  hive: { name: 'Brood Nexus', role: 'Swarm Spawner', drops: 'High XP, Shards' },
  artillery: { name: 'Lobber Mortar', role: 'Acid Siege', drops: 'XP Orbs, Shards' },
  kamikaze: { name: 'Thermal Detonator', role: 'Volatile Rusher', drops: 'XP Orbs' },
  wraith: { name: 'Abyssal Wraith', role: 'Chasm Teleporter', drops: 'XP Orbs, Shards' },
  sentinel: { name: 'Orbital Warden', role: 'Spinning Satellites', drops: 'XP Orbs, Modules' },
  slime: { name: 'Mitosis Core', role: 'Splitting Gel', drops: 'XP Orbs' },
  minislime: { name: 'Gelatinous Shard', role: 'Split Offspring', drops: 'XP Orbs' },
  architect: { name: 'The Architect', role: 'Multi-Phase World Boss', drops: 'Architect Signatures, T2 Shards, Volatile Keys' }
};

function openSanctumHub(tabId = 'hubTabArchivist') {
  const fromGame = (currentState === STATE.PLAYING || currentState === STATE.PAUSED);
  openCommandHub('sanctum', fromGame ? 'game' : null);
}

function closeSanctumHub() {
  closeCommandHub();
}

function switchSanctumTab(tabId) {
  activeHubTab = tabId;
  const pairs = [
    [tabBtnArchivist, hubTabArchivist, 'hubTabArchivist'],
    [tabBtnArtificer, hubTabArtificer, 'hubTabArtificer'],
    [tabBtnBroker, hubTabBroker, 'hubTabBroker']
  ];
  for (const [btn, panel, id] of pairs) {
    const isMatch = id === tabId;
    if (btn && btn.classList) {
      if (isMatch) btn.classList.add('active');
      else btn.classList.remove('active');
    }
    if (panel && panel.classList) {
      if (isMatch) panel.classList.remove('hidden');
      else panel.classList.add('hidden');
    }
  }
  if (tabId === 'hubTabArtificer') startOverclockLoop();
  else stopOverclockLoop();
  renderSanctumHub();
}

function renderBiomeMasterySection() {
  if (!biomeMasteryContainer || typeof Meta === 'undefined' || !Meta.getBiomeMasterySummary) return;
  const summary = Meta.getBiomeMasterySummary();
  if (biomeMasterySummaryBar) {
    biomeMasterySummaryBar.innerHTML = `Milestones: <strong>${summary.totalMilestones}/${summary.maxMilestones}</strong> • Total Elem Penetration: <strong style="color:#00ffaa;">+${Math.round((summary.elementalPenetration || 0) * 100)}%</strong> (Kills & Bosses boost Element DMG; Outposts & Bosses grant Penetration)`;
  }
  const affMap = (typeof BIOME_ELEMENTAL_AFFINITY !== 'undefined') ? BIOME_ELEMENTAL_AFFINITY : {
    fire: { resist: ['fire', 'toxin'], weak: ['frost'] },
    frost: { resist: ['frost', 'fire'], weak: ['storm', 'earth'] },
    storm: { resist: ['storm'], weak: ['earth', 'toxin'] },
    toxin: { resist: ['toxin', 'frost'], weak: ['fire', 'holy'] },
    blood: { resist: ['blood'], weak: ['holy'] },
    holy: { resist: ['holy'], weak: ['blood'] },
    earth: { resist: ['earth', 'storm'], weak: ['toxin', 'frost'] }
  };
  const biomeNames = {
    fire: 'EMBER RIFT',
    frost: 'CRYO SPIRE',
    storm: 'STORM CONDUIT',
    toxin: 'BLIGHT BASIN',
    blood: 'CRIMSON ALTAR',
    holy: 'ASTRAL CHOIR',
    earth: 'TECTONIC VAULT'
  };
  biomeMasteryContainer.innerHTML = '';
  for (const el of NeonSystems.SHARD_ELEMENTS) {
    const m = summary.byElement[el] || { kills: 0, killTarget: 150, m1: false, m2: false, m3: false, completed: 0 };
    const aff = affMap[el] || { weak: [], resist: [] };
    const card = document.createElement('div');
    card.className = 'nc-mastery-card';
    card.style.borderColor = SHARD_COLORS[el] || '#00eeff';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
        <strong style="color:${SHARD_COLORS[el] || '#ffffff'};">${biomeNames[el] || el.toUpperCase()}</strong>
        <span class="nc-chip">${m.completed}/3</span>
      </div>
      <div class="nc-affinity-line">
        <span class="nc-aff-weak">WEAK: ${aff.weak.map(x => x.toUpperCase()).join('/')}</span>
        <span class="nc-aff-res">RES: ${aff.resist.map(x => x.toUpperCase()).join('/')}</span>
      </div>
      <div class="nc-mastery-pips">
        <span class="nc-pip${m.m1 ? ' done' : ''}">${m.m1 ? '✓' : '○'} ${Math.min(m.kills, m.killTarget)}/${m.killTarget} Kills (+6% DMG)</span>
        <span class="nc-pip${m.m2 ? ' done' : ''}">${m.m2 ? '✓' : '○'} Outpost (+4% Pen)</span>
        <span class="nc-pip${m.m3 ? ' done' : ''}">${m.m3 ? '✓' : '○'} Boss (+10% DMG/+3% Pen)</span>
      </div>
    `;
    biomeMasteryContainer.appendChild(card);
  }
}

function renderSanctumHub() {
  if (typeof NeonSystems === 'undefined' || !NeonSystems || typeof Meta === 'undefined' || !Meta.data) return;
  syncCrystalExchangeUI();
  renderArchivistTab();
  renderBiomeMasterySection();
  renderPhasesTab();
  renderArtificerTab();
  renderBrokerTab();
  const contracts = NeonSystems.ensureContracts(Meta);
  const readyCount = contracts.filter(c => c && c.completed).length;
  if (btnClaimAllContracts) {
    btnClaimAllContracts.disabled = readyCount === 0;
    btnClaimAllContracts.textContent = readyCount > 0 ? `CLAIM ALL READY (${readyCount})` : 'NONE READY';
  }
  updateHubBadges();
}

function renderArchivistTab() {
  if (!contractsContainer || !codexContainer) return;
  const contracts = NeonSystems.ensureContracts(Meta);
  contractsContainer.innerHTML = '';

  for (const c of contracts) {
    const pct = Math.min(100, Math.round((c.progress / Math.max(1, c.target)) * 100));
    const card = document.createElement('div');
    card.className = 'nc-contract-card';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
        <strong style="color:#ffd700;">${c.title}</strong>
        <span class="nc-chip">${c.progress}/${c.target}</span>
      </div>
      <div style="font-size:0.8rem;color:#cde8ff;">${c.desc}</div>
      <div style="width:100%;height:7px;background:#071022;border-radius:999px;overflow:hidden;border:1px solid rgba(255,215,0,0.4);">
        <div style="width:${pct}%;height:100%;background:#ffd700;"></div>
      </div>
      <div style="font-size:0.75rem;color:#aaddff;">
        Reward: +${c.rewardMatter} Matter, +${c.rewardAttrPoints || 1} Attr Pt, 1 ${String(c.rewardShardElement || 'fire').toUpperCase()} Shard, 1 Key
      </div>
    `;
    const claimBtn = document.createElement('button');
    claimBtn.type = 'button';
    claimBtn.className = 'neon-button small';
    claimBtn.disabled = !c.completed;
    claimBtn.textContent = c.completed ? 'CLAIM REWARD' : 'IN PROGRESS';
    claimBtn.addEventListener('click', () => {
      const res = NeonSystems.claimContract(Meta, c.id);
      if (res && res.ok) renderSanctumHub();
    });
    card.appendChild(claimBtn);
    contractsContainer.appendChild(card);
  }

  // Codex
  codexContainer.innerHTML = '';
  const kills = Meta.data.codexKills || {};
  for (const [eType, info] of Object.entries(CODEX_INFO)) {
    const count = kills[eType] || 0;
    const discovered = count > 0;
    const card = document.createElement('div');
    card.className = `nc-codex-card ${discovered ? 'discovered' : 'locked'}`;
    if (discovered) {
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <strong style="color:#00eeff;">${info.name}</strong>
          <span class="nc-chip">Kills: ${count}</span>
        </div>
        <div style="font-size:0.76rem;color:#cde8ff;">${info.role}</div>
        <div style="font-size:0.73rem;color:#ffd700;">Drops: ${info.drops}</div>
      `;
    } else {
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <strong style="color:#9eb8d2;">???</strong>
          <span class="nc-chip">Kills: 0</span>
        </div>
        <div style="font-size:0.75rem;color:#9db8d4;">Undiscovered Threat. Encounter in the Void Megalattice.</div>
      `;
    }
    codexContainer.appendChild(card);
  }
}

function startOverclockLoop() {
  stopOverclockLoop();
  if (typeof requestAnimationFrame !== 'function') return;
  const tick = (now) => {
    if (currentState !== STATE.SANCTUM_HUB || activeHubTab !== 'hubTabArtificer') {
      overclockRafId = null;
      return;
    }
    if (!overclockLocked) {
      overclockPos = 50 + Math.sin(now * 0.0038) * 46;
      if (overclockCursor) overclockCursor.style.left = `${overclockPos.toFixed(1)}%`;
    }
    overclockRafId = requestAnimationFrame(tick);
  };
  overclockRafId = requestAnimationFrame(tick);
}

function stopOverclockLoop() {
  if (overclockRafId !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(overclockRafId);
  }
  overclockRafId = null;
}

function updateOverclockControlUI() {
  if (hubCurrency && typeof Meta !== 'undefined' && Meta.getCurrency) {
    hubCurrency.textContent = Meta.getCurrency();
  }
  if (!btnOverclockStrike || typeof NeonSystems === 'undefined') return;
  const cost = NeonSystems.getOverclockSyncCost(overclockRetries);
  if (overclockBonusQuality && overclockLocked) {
    btnOverclockStrike.textContent = 'OPTIMAL SYNC LOCKED';
    btnOverclockStrike.disabled = true;
  } else if (overclockLocked) {
    btnOverclockStrike.textContent = `RETRY SYNC (Next: ${cost} M)`;
    btnOverclockStrike.disabled = false;
  } else {
    btnOverclockStrike.textContent = `SYNC RESONANCE (${cost} M)`;
    btnOverclockStrike.disabled = false;
  }
}

function handleOverclockStrike() {
  if (!Meta.isEntityRescued('artificer')) return;
  if (overclockLocked) {
    if (overclockBonusQuality) return;
    overclockLocked = false;
    const nextCost = NeonSystems.getOverclockSyncCost(overclockRetries);
    if (overclockStatus) {
      overclockStatus.textContent = `Track re-armed. Locking costs ${nextCost} Void Matter.`;
      overclockStatus.style.color = '#cde8ff';
    }
    updateOverclockControlUI();
    return;
  }

  const cost = NeonSystems.getOverclockSyncCost(overclockRetries);
  if (!Meta.spendCurrency(cost)) {
    if (overclockStatus) {
      overclockStatus.textContent = `Insufficient Void Matter (Need ${cost} M to sync)!`;
      overclockStatus.style.color = '#ff6688';
    }
    updateOverclockControlUI();
    return;
  }

  overclockRetries += 1;
  overclockLocked = true;
  const nextCost = NeonSystems.getOverclockSyncCost(overclockRetries);
  if (Math.abs(overclockPos - 50) <= 13) {
    overclockBonusQuality = true;
    if (overclockStatus) {
      overclockStatus.textContent = `OPTIMAL SYNC! (-${cost} M) Next craft empowered!`;
      overclockStatus.style.color = '#00ffaa';
    }
  } else {
    overclockBonusQuality = false;
    if (overclockStatus) {
      overclockStatus.textContent = `STANDARD SYNC (-${cost} M). Retry lock costs ${nextCost} M.`;
      overclockStatus.style.color = '#ffaa66';
    }
  }
  updateOverclockControlUI();
}

function getAllPlayerModules() {
  const out = [];
  const eq = Meta.data.equippedModules || {};
  const allSlots = (typeof NeonSystems !== 'undefined' && NeonSystems.ALL_EQUIPMENT_SLOTS) || NeonSystems.MODULE_SLOTS;
  for (const s of Object.keys(allSlots)) {
    if (eq[s]) out.push({ mod: eq[s], equipped: true, slotKey: s });
  }
  for (const m of (Meta.data.moduleInventory || [])) {
    if (m) out.push({ mod: m, equipped: false, slotKey: m.slot });
  }
  return out;
}

function renderArtificerTab() {
  if (!artificerModuleSelect || !artificerActions || !artificerStatusBanner) return;
  const unlocked = Meta.isEntityRescued('artificer');
  if (!unlocked) {
    artificerStatusBanner.textContent = 'LOCKED: Rescue The Artificer in Ring 1 NE Prison Chamber to unlock!';
    artificerModuleSelect.innerHTML = '';
    artificerActions.innerHTML = '';
    if (overclockMinigameBox) overclockMinigameBox.style.display = 'none';
    return;
  }

  if (overclockMinigameBox) overclockMinigameBox.style.display = '';
  updateOverclockControlUI();
  if (!artificerStatusBanner.textContent || artificerStatusBanner.textContent.startsWith('LOCKED')) {
    artificerStatusBanner.textContent = 'Select a module to Recalibrate, Amplify, or Overdrive.';
  }
  const allMods = getAllPlayerModules();
  if (!selectedArtificerModUid || !allMods.some(item => item.mod.uid === selectedArtificerModUid)) {
    selectedArtificerModUid = allMods.length > 0 ? allMods[0].mod.uid : null;
  }

  artificerModuleSelect.innerHTML = '';
  if (allMods.length === 0) {
    artificerModuleSelect.innerHTML = '<div class="nc-mod-card"><div style="font-size:0.82rem;color:#9ab8d4;">No Modules owned yet.</div></div>';
    artificerActions.innerHTML = '';
    return;
  }

  for (const { mod, equipped } of allMods) {
    const qDef = NeonSystems.MODULE_QUALITIES[mod.quality] || NeonSystems.MODULE_QUALITIES.standard;
    const isSel = mod.uid === selectedArtificerModUid;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `nc-mod-card nc-q-${mod.quality}${isSel ? ' selected' : ''}`;
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;width:100%;">
        <strong style="color:${qDef.color};">${mod.name}${mod.overdriven ? ' [OD]' : ''}</strong>
        <span class="nc-chip">T${mod.itemTier} ${equipped ? 'EQUIPPED' : 'ARCHIVE'}</span>
      </div>
      <div style="font-size:0.74rem;color:#cde8ff;">${(mod.properties || []).map(p => NeonSystems.formatModuleProperty(p)).join(' • ')}</div>
    `;
    card.addEventListener('click', () => {
      selectedArtificerModUid = mod.uid;
      renderSanctumHub();
    });
    artificerModuleSelect.appendChild(card);
  }

  const chosen = allMods.find(item => item.mod.uid === selectedArtificerModUid)?.mod;
  artificerActions.innerHTML = '';
  if (!chosen) return;

  const tier = Math.max(1, Math.min(4, chosen.itemTier || 1));
  const recCost = 35 * tier;
  const ampCost = 60 * tier;
  const odCost = 90 * tier;

  const btnRec = document.createElement('button');
  btnRec.type = 'button';
  btnRec.className = 'neon-button small';
  btnRec.textContent = `RECALIBRATE (${recCost} M)`;
  btnRec.addEventListener('click', () => {
    const res = NeonSystems.recalibrateModule(Meta, chosen.uid, overclockBonusQuality);
    if (res.ok) {
      overclockBonusQuality = false;
      overclockLocked = false;
      overclockRetries = 0;
      artificerStatusBanner.textContent = `Recalibrated ${res.module.name}!`;
    } else {
      artificerStatusBanner.textContent = `Recalibrate failed: ${res.reason}`;
    }
    if (overclockStatus) overclockStatus.textContent = 'Await harmonic alignment.';
    renderSanctumHub();
  });

  const btnAmp = document.createElement('button');
  btnAmp.type = 'button';
  btnAmp.className = 'neon-button small';
  btnAmp.disabled = chosen.quality !== 'standard' && chosen.quality !== 'refined';
  btnAmp.textContent = `AMPLIFY (${ampCost} M + 1 Shard)`;
  btnAmp.addEventListener('click', () => {
    const res = NeonSystems.amplifyModule(Meta, chosen.uid);
    if (res.ok) {
      artificerStatusBanner.textContent = `Amplified to ${res.module.quality.toUpperCase()} (${res.shardUsed.element.toUpperCase()} Shard consumed)!`;
    } else {
      artificerStatusBanner.textContent = `Amplify failed: ${res.reason}`;
    }
    renderSanctumHub();
  });

  const btnOd = document.createElement('button');
  btnOd.type = 'button';
  btnOd.className = 'neon-button small';
  btnOd.disabled = Boolean(chosen.overdriven);
  btnOd.textContent = chosen.overdriven ? 'OVERDRIVEN' : `OVERDRIVE (${odCost} M)`;
  btnOd.addEventListener('click', () => {
    const res = NeonSystems.overdriveModule(Meta, chosen.uid, overclockBonusQuality);
    if (res.ok) {
      overclockBonusQuality = false;
      overclockLocked = false;
      overclockRetries = 0;
      artificerStatusBanner.textContent = `Overdrive Outcome: ${String(res.outcome).toUpperCase()} on ${res.module.name}!`;
    } else {
      artificerStatusBanner.textContent = `Overdrive failed: ${res.reason}`;
    }
    if (overclockStatus) overclockStatus.textContent = 'Await harmonic alignment.';
    renderSanctumHub();
  });

  artificerActions.appendChild(btnRec);
  artificerActions.appendChild(btnAmp);
  artificerActions.appendChild(btnOd);
}

function renderBrokerTab() {
  if (!brokerStatusBanner) return;
  syncCrystalExchangeUI();
  const unlocked = Meta.isEntityRescued('broker');
  if (!unlocked) {
    brokerStatusBanner.textContent = 'LOCKED: Rescue The Broker in Ring 2 Prison Chamber (or synthesize Crystals in Base Augmentations)!';
    if (btnBrokerCapsule) btnBrokerCapsule.disabled = true;
    if (btnMatrixStart) btnMatrixStart.disabled = true;
    if (btnMatrixCashout) btnMatrixCashout.disabled = true;
    if (btnBrokerCrystal1) btnBrokerCrystal1.disabled = true;
    if (btnBrokerCrystal5) btnBrokerCrystal5.disabled = true;
    return;
  }

  brokerStatusBanner.textContent = 'Acquire Mystery Capsules (55 Matter), Synthesize Crystals, or risk Signal Matrix escalation (30 Matter).';
  if (btnBrokerCapsule) {
    btnBrokerCapsule.disabled = Meta.getCurrency() < 55;
    btnBrokerCapsule.textContent = 'OPEN MYSTERY CAPSULE (55 M)';
  }
  if (btnMatrixStart) {
    btnMatrixStart.disabled = matrixState.active || Meta.getCurrency() < matrixState.stake;
    btnMatrixStart.textContent = `START MATRIX (${matrixState.stake} M)`;
  }
  if (btnMatrixCashout) {
    btnMatrixCashout.disabled = !matrixState.active || matrixState.steps <= 0;
  }
}

function handleBuyBrokerCapsule() {
  if (!Meta.isEntityRescued('broker')) return;
  const res = NeonSystems.buyBrokerCapsule(Meta);
  if (!res.ok) {
    if (brokerResultBox) brokerResultBox.textContent = `Insufficient Matter (Need ${res.cost}).`;
    return;
  }
  if (brokerResultBox) {
    const propsText = (res.mod.properties || []).map(p => NeonSystems.formatModuleProperty(p)).join(', ');
    brokerResultBox.innerHTML = `
      <strong style="color:${res.jackpot ? '#ff6622' : '#00eeff'};">${res.jackpot ? 'JACKPOT SIGNATURE! ' : ''}${res.mod.name}</strong>
      <div style="font-size:0.78rem;color:#d6efff;">T${res.mod.itemTier} ${res.mod.quality.toUpperCase()} — ${propsText}</div>
    `;
  }
  renderSanctumHub();
}

function startSignalMatrix() {
  if (!Meta.isEntityRescued('broker') || matrixState.active) return;
  if (!Meta.spendCurrency(matrixState.stake)) {
    if (signalMatrixStatus) signalMatrixStatus.textContent = `Need ${matrixState.stake} Matter to initialize.`;
    return;
  }
  matrixState.active = true;
  matrixState.mines.clear();
  matrixState.revealed.clear();
  matrixState.steps = 0;
  while (matrixState.mines.size < 2) {
    matrixState.mines.add(Math.floor(Math.random() * 9));
  }
  if (typeof document !== 'undefined' && document.querySelectorAll) {
    document.querySelectorAll('#signalMatrixGrid .nc-matrix-cell').forEach((cell) => {
      cell.classList.remove('safe', 'revealed', 'hazard');
      cell.disabled = false;
      cell.textContent = '?';
    });
  }
  if (signalMatrixStatus) signalMatrixStatus.textContent = 'Matrix Active: Pick safe nodes, avoid 2 Spike Mines!';
  renderSanctumHub();
}

function getMatrixPayout(steps) {
  const mults = [1.0, 1.5, 2.2, 3.2, 5.0, 6.8, 8.8, 11.0];
  const m = mults[Math.min(mults.length - 1, Math.max(0, steps))] || 1.0;
  return Math.round(matrixState.stake * m);
}

function handleSignalMatrixCell(idx) {
  if (!matrixState.active || matrixState.revealed.has(idx)) return;
  const cells = typeof document !== 'undefined' && document.querySelectorAll
    ? Array.from(document.querySelectorAll('#signalMatrixGrid .nc-matrix-cell'))
    : [];
  const targetCell = cells.find(c => Number(c.getAttribute('data-idx')) === idx);

  if (matrixState.mines.has(idx)) {
    matrixState.active = false;
    for (const mIdx of matrixState.mines) {
      const mCell = cells.find(c => Number(c.getAttribute('data-idx')) === mIdx);
      if (mCell) {
        mCell.classList.add('hazard');
        mCell.textContent = '✕';
      }
    }
    cells.forEach(c => { c.disabled = true; });
    if (signalMatrixStatus) signalMatrixStatus.textContent = 'SPIKE MINE DETONATED! Stake lost.';
    renderSanctumHub();
    return;
  }

  matrixState.revealed.add(idx);
  matrixState.steps += 1;
  if (targetCell) {
    targetCell.classList.add('safe');
    targetCell.textContent = '✦';
    targetCell.disabled = true;
  }

  const curPayout = getMatrixPayout(matrixState.steps);
  if (matrixState.steps >= 7) {
    cashoutSignalMatrix();
    return;
  }
  if (signalMatrixStatus) {
    signalMatrixStatus.textContent = `Safe (${matrixState.steps}/7)! Current Payout: ${curPayout} Matter`;
  }
  renderSanctumHub();
}

function cashoutSignalMatrix() {
  if (!matrixState.active || matrixState.steps <= 0) return;
  const payout = getMatrixPayout(matrixState.steps);
  matrixState.active = false;
  Meta.addCurrency(payout);
  let shardBonusTxt = '';
  if (matrixState.steps >= 3 && typeof NeonSystems !== 'undefined' && NeonSystems.SHARD_ELEMENTS && Meta.data && Meta.data.frequencyShards) {
    const el = NeonSystems.SHARD_ELEMENTS[Math.floor(Math.random() * NeonSystems.SHARD_ELEMENTS.length)];
    if (!Array.isArray(Meta.data.frequencyShards[el])) Meta.data.frequencyShards[el] = [0, 0];
    Meta.data.frequencyShards[el][0] += 1;
    Meta.save();
    shardBonusTxt = ` + 1 ${el.toUpperCase()} Shard`;
  }
  if (typeof document !== 'undefined' && document.querySelectorAll) {
    document.querySelectorAll('#signalMatrixGrid .nc-matrix-cell').forEach(c => { c.disabled = true; });
  }
  if (signalMatrixStatus) signalMatrixStatus.textContent = `EXTRACTED +${payout} Matter${shardBonusTxt}!`;
  renderSanctumHub();
}

// =========================================================
// v2.0 NEURAL LOCKPICK (#vaultHackWidget)
// =========================================================

function hideVaultHackWidget() {
  if (vaultHackHideTimer) {
    clearTimeout(vaultHackHideTimer);
    vaultHackHideTimer = null;
  }
  activeVaultHack = null;
  if (vaultHackWidget && vaultHackWidget.classList) {
    vaultHackWidget.classList.add('hidden');
  }
}

function startVaultHack(vault) {
  if (!vaultHackWidget || !vault) return;
  if (vaultHackHideTimer) {
    clearTimeout(vaultHackHideTimer);
    vaultHackHideTimer = null;
  }
  const seq = [0, 1, 2];
  for (let i = seq.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = seq[i];
    seq[i] = seq[j];
    seq[j] = tmp;
  }
  activeVaultHack = { vaultId: vault.id, sequence: seq, step: 0, done: false };
  if (vaultHackTitle) vaultHackTitle.textContent = `NEURAL LOCKPICK // ${String(vault.perkName || 'VAULT').toUpperCase()}`;
  vaultHackWidget.classList.remove('hidden');
  updateVaultHackUI();
}

function updateVaultHackUI() {
  if (!activeVaultHack || typeof document === 'undefined' || !document.querySelectorAll) return;
  const targetNodeIdx = activeVaultHack.sequence[activeVaultHack.step];
  const nodes = document.querySelectorAll('#vaultHackNodes .nc-hack-node');
  nodes.forEach((node) => {
    const idx = Number(node.getAttribute ? node.getAttribute('data-idx') : -1);
    node.classList.remove('active', 'target', 'solved', 'error');
    const solvedBefore = activeVaultHack.sequence.slice(0, activeVaultHack.step).includes(idx);
    if (solvedBefore) {
      node.classList.add('solved');
    } else if (!activeVaultHack.done && idx === targetNodeIdx) {
      node.classList.add('active', 'target');
    }
  });
  if (!activeVaultHack.done && vaultHackStatus) {
    vaultHackStatus.textContent = `Tap illuminated node ${targetNodeIdx + 1} (${activeVaultHack.step + 1}/3)`;
  }
}

function handleVaultHackNodeClick(idx) {
  if (!activeVaultHack || activeVaultHack.done) return;
  const expected = activeVaultHack.sequence[activeVaultHack.step];
  if (idx === expected) {
    activeVaultHack.step += 1;
    if (activeVaultHack.step >= activeVaultHack.sequence.length) {
      activeVaultHack.done = true;
      updateVaultHackUI();
      if (vaultHackStatus) vaultHackStatus.textContent = 'BREACH COMPLETE! 2X VAULT + 1 KEY';
      if (game && typeof game.completeVaultHack === 'function') {
        game.completeVaultHack(activeVaultHack.vaultId, true);
      }
      vaultHackHideTimer = setTimeout(() => hideVaultHackWidget(), 1200);
    } else {
      updateVaultHackUI();
    }
  } else {
    activeVaultHack.done = true;
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      document.querySelectorAll('#vaultHackNodes .nc-hack-node').forEach((n) => {
        if (Number(n.getAttribute ? n.getAttribute('data-idx') : -1) === idx) n.classList.add('error');
      });
    }
    if (vaultHackStatus) vaultHackStatus.textContent = 'SIGNAL DESYNC! Breach aborted.';
    if (game && typeof game.completeVaultHack === 'function') {
      game.completeVaultHack(activeVaultHack.vaultId, false);
    }
    vaultHackHideTimer = setTimeout(() => hideVaultHackWidget(), 900);
  }
}

// Start
init();
