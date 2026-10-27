/**
 * Cádiz Explorer & Rallye – Main Application Logic
 * Mobile-First PWA · 0 External API Keys · LocalStorage + URL Base64 Sync
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'cadiz_rallye_state_v1';
  const DATA = window.CADIZ_DATA;

  // Calculate maximum base points from all 7 stations (130 Pkt)
  const MAX_STATION_POINTS = DATA.stations.reduce(
    (sum, st) => sum + st.tasks.reduce((s, t) => s + t.points, 0),
    0
  );
  const TOTAL_TASKS_COUNT = DATA.stations.reduce((sum, st) => sum + st.tasks.length, 0);

  // Default persistent state
  function getDefaultState() {
    return {
      completedTasks: {},     // { [taskId]: true }
      taskNotes: {},          // { [taskId]: "string" }
      taskWinners: {},        // { [taskId]: playerId }
      guesses: {},            // { [stationId]: "string" }
      revealedSolutions: {},  // { [stationId]: true }
      players: [],            // [{ id, name, avatar, bonusPoints }]
      groupBonusPoints: 0,    // Manual bonus/penalty points for the whole group
      scoreLog: []            // [{ id, ts, label, points, targetName }]
    };
  }

  let state = loadStateFromStorage();

  // UI & Runtime state (not persisted in URL sync)
  let currentTab = 'rallye'; // 'rallye' | 'radar' | 'map' | 'score'
  let stationFilter = 'all'; // 'all' | 'open' | 'done'
  let radarCategory = 'Alle'; // 'Alle' | 'Sehenswertes' | 'Tapas & Eis' | 'Hidden Gems' | 'Parken'
  let bonusTargetId = 'group'; // 'group' or player.id
  let selectedAvatar = DATA.avatars[0];

  // Geolocation state
  let gpsState = {
    active: false,         // true when watchPosition is delivering live coordinates
    isSimulated: false,    // true when user picked a simulated point or fallback is active
    lat: DATA.fallbackCoords.lat,
    lng: DATA.fallbackCoords.lng,
    accuracy: null,
    label: DATA.fallbackCoords.label,
    watchId: null,
    permissionDenied: false
  };

  // Leaflet Map references
  let map = null;
  let tileLayer = null;
  let mapStyle = 'voyager'; // 'voyager' | 'satellite'
  let userMarker = null;
  let userAccuracyCircle = null;
  let mapMarkers = {}; // { [id]: L.Marker }
  let routePolyline = null;
  let activeBottomSheetId = null;

  // Speech Synthesis state
  let currentlySpeakingId = null;

  // ============================================================================
  // 1. STATE PERSISTENCE & BASE64 URL SYNC
  // ============================================================================

  function loadStateFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getDefaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(getDefaultState(), parsed);
    } catch (e) {
      console.warn('Could not load state from localStorage:', e);
      return getDefaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Could not save state to localStorage:', e);
    }
  }

  // UTF-8 safe Base64 URL encoding
  function encodeStateToBase64(stateObj) {
    const compact = {
      c: stateObj.completedTasks || {},
      n: stateObj.taskNotes || {},
      w: stateObj.taskWinners || {},
      g: stateObj.guesses || {},
      r: stateObj.revealedSolutions || {},
      p: stateObj.players || [],
      b: stateObj.groupBonusPoints || 0,
      l: (stateObj.scoreLog || []).slice(0, 15)
    };
    const jsonStr = JSON.stringify(compact);
    const bytes = new TextEncoder().encode(jsonStr);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeStateFromBase64(b64Str) {
    let normalized = b64Str.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4 !== 0) {
      normalized += '=';
    }
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const jsonStr = new TextDecoder().decode(bytes);
    const compact = JSON.parse(jsonStr);

    // Support both compact format and full format
    if (compact.c || compact.p !== undefined) {
      return {
        completedTasks: compact.c || {},
        taskNotes: compact.n || {},
        taskWinners: compact.w || {},
        guesses: compact.g || {},
        revealedSolutions: compact.r || {},
        players: Array.isArray(compact.p) ? compact.p : [],
        groupBonusPoints: Number(compact.b) || 0,
        scoreLog: Array.isArray(compact.l) ? compact.l : []
      };
    }
    return Object.assign(getDefaultState(), compact);
  }

  function checkUrlSyncParameter() {
    try {
      const url = new URL(window.location.href);
      const syncParam = url.searchParams.get('sync');
      if (!syncParam) return;

      const imported = decodeStateFromBase64(syncParam);
      state = Object.assign(getDefaultState(), imported);
      saveState();

      // Clean URL parameter so reloads don't overwrite future local progress
      url.searchParams.delete('sync');
      window.history.replaceState({}, document.title, url.toString());

      setTimeout(() => {
        triggerConfetti('sync');
        showToast('🔗 Gruppen-Spielstand erfolgreich synchronisiert!', 'success');
      }, 350);
    } catch (e) {
      console.error('Invalid sync link parameter:', e);
      showToast('⚠️ Sync-Link konnte nicht gelesen werden.', 'error');
    }
  }

  function buildSyncUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('sync', encodeStateToBase64(state));
    return url.toString();
  }

  async function shareSyncLink() {
    const syncUrl = buildSyncUrl();
    const scoreInfo = calculateScores();
    const shareData = {
      title: 'Cádiz Explorer & Rallye – Spielstand-Sync',
      text: `☀️ Unser aktueller Cádiz-Rallye-Stand (${scoreInfo.totalGroupPoints} Punkte, ${scoreInfo.completedStationsCount}/7 Stationen). Klicke auf den Link zum Synchronisieren:`,
      url: syncUrl
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        showToast('🔗 Sync-Link geteilt!', 'success');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    await copyTextToClipboard(syncUrl, '🔗 Sync-Link in die Zwischenablage kopiert!');
  }

  async function copyTextToClipboard(text, successMsg) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        showToast(successMsg || '📋 In die Zwischenablage kopiert!', 'success');
        return true;
      }
    } catch (_) {
      // Fallback below
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast(successMsg || '📋 In die Zwischenablage kopiert!', 'success');
    } catch (_) {
      showToast('⚠️ Kopieren fehlgeschlagen.', 'error');
    }
    document.body.removeChild(ta);
    return true;
  }

  // ============================================================================
  // 2. HAVERSINE DISTANCE, COMPASS BEARING & LIVE GEOLOCATION
  // ============================================================================

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function toDeg(rad) {
    return (rad * 180) / Math.PI;
  }

  /**
   * Exact Haversine distance in meters
   */
  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  /**
   * Initial compass bearing (0° = North, 90° = East, 180° = South, 270° = West)
   */
  function calculateBearing(lat1, lon1, lat2, lon2) {
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const deltaLon = toRad(lon2 - lon1);

    const y = Math.sin(deltaLon) * Math.cos(phi2);
    const x =
      Math.cos(phi1) * Math.sin(phi2) -
      Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLon);
    const theta = Math.atan2(y, x);
    const brng = (toDeg(theta) + 360) % 360;

    const directions = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
    const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
    const idx = Math.round(brng / 45) % 8;

    return {
      degrees: Math.round(brng),
      cardinal: directions[idx],
      arrow: arrows[idx]
    };
  }

  function formatDistance(meters) {
    if (meters < 1000) {
      return `${meters} m`;
    }
    if (meters < 15000) {
      return `${meters} m (${(meters / 1000).toFixed(1).replace('.', ',')} km)`;
    }
    return `${(meters / 1000).toFixed(0)} km`;
  }

  function getDistanceInfoTo(targetLat, targetLng) {
    const meters = haversineMeters(gpsState.lat, gpsState.lng, targetLat, targetLng);
    const bearing = calculateBearing(gpsState.lat, gpsState.lng, targetLat, targetLng);
    return {
      meters,
      formatted: formatDistance(meters),
      bearing
    };
  }

  function activateLiveGps(fromUserClick) {
    closeLocationModal();
    if (!('geolocation' in navigator)) {
      showToast('⚠️ Dein Browser unterstützt kein GPS. Nutze Kathedrale als Fallback.', 'error');
      return;
    }

    if (gpsState.watchId !== null) {
      navigator.geolocation.clearWatch(gpsState.watchId);
      gpsState.watchId = null;
    }

    if (fromUserClick) {
      showToast('📡 Suche Live-GPS-Signal...', 'info');
    }

    gpsState.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        // Check distance to Cádiz center: if user is > 30 km away and hasn't explicitly forced outside-Cádiz GPS,
        // still allow real GPS or notify them so they can test with Cádiz coordinates if desired.
        const distToCadiz = haversineMeters(
          latitude,
          longitude,
          DATA.fallbackCoords.lat,
          DATA.fallbackCoords.lng
        );

        gpsState.active = true;
        gpsState.isSimulated = false;
        gpsState.permissionDenied = false;
        gpsState.lat = latitude;
        gpsState.lng = longitude;
        gpsState.accuracy = Math.round(accuracy || 10);
        gpsState.label =
          distToCadiz > 25000
            ? `Live-GPS (${Math.round(distToCadiz / 1000)} km von Cádiz)`
            : `Live-GPS (±${gpsState.accuracy} m)`;

        updateUserMarkerOnMap();
        refreshDistanceDependentUI();
      },
      (err) => {
        gpsState.active = false;
        gpsState.permissionDenied = err.code === 1;
        if (fromUserClick) {
          showToast(
            '📍 GPS noch nicht freigegeben – nutze Kathedrale (36.5290, -6.2952) als Fallback.',
            'info'
          );
        }
        refreshDistanceDependentUI();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000
      }
    );
  }

  function setSimulatedLocation(lat, lng, label) {
    if (gpsState.watchId !== null) {
      navigator.geolocation.clearWatch(gpsState.watchId);
      gpsState.watchId = null;
    }
    gpsState.active = false;
    gpsState.isSimulated = true;
    gpsState.lat = lat;
    gpsState.lng = lng;
    gpsState.accuracy = 5;
    gpsState.label = label;

    closeLocationModal();
    updateUserMarkerOnMap();
    if (map) {
      map.flyTo([lat, lng], 17, { duration: 0.8 });
    }
    refreshDistanceDependentUI();
    showToast(`📍 Standort gesetzt auf: ${label}`, 'success');
  }

  function requestGpsOrOpenLocationModal() {
    renderGpsPresetModalList();
    const modal = document.getElementById('gps-modal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeLocationModal() {
    const modal = document.getElementById('gps-modal');
    if (modal) modal.classList.add('hidden');
  }

  function renderGpsPresetModalList() {
    const container = document.getElementById('gps-preset-list');
    if (!container) return;

    const presets = [
      {
        label: '⛪ Kathedrale (Standard-Fallback)',
        lat: DATA.fallbackCoords.lat,
        lng: DATA.fallbackCoords.lng
      },
      ...DATA.stations.map((s) => ({
        label: `${s.number}. ${s.shortTitle}`,
        lat: s.lat,
        lng: s.lng
      }))
    ];

    container.innerHTML = presets
      .map(
        (p) => `
      <button
        onclick="window.CadizApp.setSimulatedLocation(${p.lat}, ${p.lng}, '${escapeHtml(p.label)}')"
        class="w-full text-left px-3 py-2 rounded-xl bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-xs font-bold text-slate-800 flex items-center justify-between transition"
      >
        <span class="truncate">${escapeHtml(p.label)}</span>
        <span class="text-[10px] text-slate-400 font-mono shrink-0 ml-2">${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</span>
      </button>
    `
      )
      .join('');
  }

  // ============================================================================
  // 3. SCORE CALCULATION & GAME PROGRESS
  // ============================================================================

  function isStationCompleted(station) {
    return station.tasks.every((t) => Boolean(state.completedTasks[t.id]));
  }

  function calculateScores() {
    let taskPoints = 0;
    let completedTasksCount = 0;
    let completedStationsCount = 0;

    // Player points map
    const playerPointsMap = {};
    state.players.forEach((p) => {
      playerPointsMap[p.id] = Number(p.bonusPoints) || 0;
    });

    DATA.stations.forEach((station) => {
      let allDone = true;
      station.tasks.forEach((task) => {
        if (state.completedTasks[task.id]) {
          taskPoints += task.points;
          completedTasksCount += 1;
          const winnerId = state.taskWinners[task.id];
          if (winnerId && playerPointsMap[winnerId] !== undefined) {
            playerPointsMap[winnerId] += task.points;
          }
        } else {
          allDone = false;
        }
      });
      if (allDone) completedStationsCount += 1;
    });

    const playersTotalBonus = state.players.reduce((s, p) => s + (Number(p.bonusPoints) || 0), 0);
    const totalBonus = (Number(state.groupBonusPoints) || 0) + playersTotalBonus;
    const totalGroupPoints = taskPoints + totalBonus;

    // Determine rank title
    let rank = '🏖️ Cádiz-Frischlinge';
    if (totalGroupPoints >= 120) rank = '👑 Legenden von Gadir (1104 v. Chr.)';
    else if (totalGroupPoints >= 85) rank = '🔭 Meister-Späher des Torre Tavira';
    else if (totalGroupPoints >= 50) rank = '🍤 Tapas- & Gassen-Connaisseurs';
    else if (totalGroupPoints >= 20) rank = '🧭 El Pópulo Entdecker-Crew';

    return {
      taskPoints,
      totalBonus,
      totalGroupPoints,
      maxStationPoints: MAX_STATION_POINTS,
      completedTasksCount,
      totalTasksCount: TOTAL_TASKS_COUNT,
      completedStationsCount,
      totalStationsCount: DATA.stations.length,
      playerPointsMap,
      rank
    };
  }

  function findNearestStation() {
    // Prefer nearest uncompleted station; if all are done, return nearest overall
    const uncompleted = DATA.stations.filter((s) => !isStationCompleted(s));
    const pool = uncompleted.length > 0 ? uncompleted : DATA.stations;

    let best = null;
    pool.forEach((st) => {
      const distInfo = getDistanceInfoTo(st.lat, st.lng);
      if (!best || distInfo.meters < best.distInfo.meters) {
        best = { station: st, distInfo };
      }
    });
    return best;
  }

  // ============================================================================
  // 4. CONFETTI & WEB SPEECH API (VORLESEN)
  // ============================================================================

  function triggerConfetti(type) {
    if (typeof window.confetti !== 'function') return;

    const colors = ['#0284c7', '#eab308', '#e11d48', '#16a34a', '#fef08a'];
    if (type === 'station') {
      window.confetti({
        particleCount: 95,
        spread: 80,
        origin: { y: 0.65 },
        colors
      });
      setTimeout(() => {
        window.confetti({
          particleCount: 60,
          spread: 100,
          origin: { y: 0.55 },
          colors
        });
      }, 220);
    } else {
      window.confetti({
        particleCount: 55,
        spread: 65,
        origin: { y: 0.7 },
        colors
      });
    }
  }

  function toggleSpeakStation(stationId) {
    if (!('speechSynthesis' in window)) {
      showToast('⚠️ Dein Browser unterstützt leider keine Sprachausgabe.', 'error');
      return;
    }

    if (currentlySpeakingId === stationId && window.speechSynthesis.speaking) {
      stopSpeech();
      return;
    }

    const station = DATA.stations.find((s) => s.id === stationId);
    const poi = !station ? DATA.pois.find((p) => p.id === stationId) : null;
    if (!station && !poi) return;

    window.speechSynthesis.cancel();

    let textToSpeak = '';
    let label = '';
    if (station) {
      label = station.shortTitle;
      textToSpeak = `${station.title}. ${station.story} Schätzfrage an die Gruppe: ${station.question}`;
    } else if (poi) {
      label = poi.title;
      textToSpeak = `${poi.title}. ${poi.info} Unser Tipp: ${poi.tip}`;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'de-DE';
    utterance.rate = 1.02;

    const voices = window.speechSynthesis.getVoices();
    const deVoice =
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('de') && v.name.includes('Google')) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('de'));
    if (deVoice) utterance.voice = deVoice;

    currentlySpeakingId = stationId;
    updateSpeechBanner(true, label);
    renderRallyeTab();

    utterance.onend = () => {
      currentlySpeakingId = null;
      updateSpeechBanner(false);
      renderRallyeTab();
    };
    utterance.onerror = () => {
      currentlySpeakingId = null;
      updateSpeechBanner(false);
      renderRallyeTab();
    };

    window.speechSynthesis.speak(utterance);
  }

  function speakSpanishPhrase(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
    showToast('🇪🇸 Spanische Aussprache wird abgespielt!', 'info');
  }

  function stopSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    currentlySpeakingId = null;
    updateSpeechBanner(false);
    renderRallyeTab();
  }

  function updateSpeechBanner(show, title) {
    const banner = document.getElementById('speech-banner');
    const textEl = document.getElementById('speech-banner-text');
    if (!banner) return;
    if (show) {
      banner.classList.remove('hidden');
      if (textEl) textEl.textContent = `🔊 ${title}`;
    } else {
      banner.classList.add('hidden');
    }
  }

  // ============================================================================
  // 5. HEADER & NAVIGATION RENDERING
  // ============================================================================

  function updateHeader() {
    const scores = calculateScores();

    const scoreTextEl = document.getElementById('header-score-text');
    if (scoreTextEl) {
      scoreTextEl.textContent = `${scores.totalGroupPoints} / ${scores.maxStationPoints} Pkt`;
    }

    const rankEl = document.getElementById('header-rank-label');
    if (rankEl) {
      rankEl.textContent = scores.rank;
    }

    const stProgEl = document.getElementById('header-stations-progress');
    if (stProgEl) {
      stProgEl.textContent = `${scores.completedStationsCount} von ${scores.totalStationsCount} Hauptstationen erledigt`;
    }

    const taskProgEl = document.getElementById('header-tasks-progress');
    if (taskProgEl) {
      taskProgEl.textContent = `${scores.completedTasksCount} / ${scores.totalTasksCount} Aufgaben`;
    }

    const barEl = document.getElementById('header-progress-bar');
    if (barEl) {
      const pct = Math.min(
        100,
        Math.round((scores.completedTasksCount / scores.totalTasksCount) * 100)
      );
      barEl.style.width = `${pct}%`;
    }

    // Nearest station live GPS indicator
    const nearest = findNearestStation();
    const nearestEl = document.getElementById('header-nearest-station');
    if (nearest && nearestEl) {
      nearestEl.textContent = `📍 Nächste Station: ${nearest.station.shortTitle} (${nearest.distInfo.meters} m ${nearest.distInfo.bearing.arrow} ${nearest.distInfo.bearing.cardinal})`;
    }

    const gpsDot = document.getElementById('header-gps-dot');
    const gpsModeLabel = document.getElementById('header-gps-mode-label');
    if (gpsDot && gpsModeLabel) {
      if (gpsState.active) {
        gpsDot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0';
        gpsModeLabel.textContent = `📡 Live-GPS`;
      } else if (gpsState.isSimulated) {
        gpsDot.className = 'w-2 h-2 rounded-full bg-cathedral-400 shrink-0';
        gpsModeLabel.textContent = `📍 Vorschau-Ort`;
      } else {
        gpsDot.className = 'w-2 h-2 rounded-full bg-amber-400 shrink-0';
        gpsModeLabel.textContent = `📍 GPS starten`;
      }
    }

    // Check if any POI/Station is < 100m away for Radar badge
    const allItems = getAllRadarItemsWithDistance();
    const hasUnder100m = allItems.some((item) => item.distInfo.meters < 100);
    const nearbyBadge = document.getElementById('nav-radar-nearby-badge');
    if (nearbyBadge) {
      nearbyBadge.classList.toggle('hidden', !hasUnder100m);
    }
  }

  function switchTab(tabName) {
    currentTab = tabName;
    const tabs = ['rallye', 'radar', 'map', 'score'];

    tabs.forEach((t) => {
      const sec = document.getElementById(`tab-${t}`);
      const btn = document.getElementById(`nav-btn-${t}`);
      if (sec) {
        sec.classList.toggle('hidden', t !== tabName);
      }
      if (btn) {
        if (t === tabName) {
          btn.className =
            'flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all text-atlantic-600 bg-atlantic-50/90 font-extrabold relative';
        } else {
          btn.className =
            'flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all text-slate-500 hover:text-slate-800 font-semibold relative';
        }
      }
    });

    if (tabName === 'rallye') {
      renderRallyeTab();
    } else if (tabName === 'radar') {
      renderRadarTab();
    } else if (tabName === 'map') {
      initOrRefreshMap();
    } else if (tabName === 'score') {
      renderScoreTab();
    }
  }

  function jumpToNearestStation() {
    const nearest = findNearestStation();
    if (!nearest) return;
    if (currentTab !== 'rallye') {
      switchTab('rallye');
    }
    scrollToStationCard(nearest.station.id);
  }

  function scrollToStationCard(stationId) {
    if (stationFilter !== 'all') {
      stationFilter = 'all';
      renderRallyeTab();
    }
    setTimeout(() => {
      const el = document.getElementById(`card-${stationId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('ring-4', 'ring-cathedral-400');
        setTimeout(() => el.classList.remove('ring-4', 'ring-cathedral-400'), 1800);
      }
    }, 60);
  }

  // ============================================================================
  // 6. TAB 1: 🎯 DIE STADTRALLYE (7 HAUPTSTATIONEN)
  // ============================================================================

  function setStationFilter(filter) {
    stationFilter = filter;
    ['all', 'open', 'done'].forEach((f) => {
      const btn = document.getElementById(`station-filter-${f}`);
      if (btn) {
        btn.className =
          f === filter
            ? 'px-2 py-0.5 rounded-lg font-bold bg-atlantic-600 text-white transition'
            : 'px-2 py-0.5 rounded-lg font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition';
      }
    });
    renderRallyeTab();
  }

  function renderRallyeTab() {
    // 1. Render Jump Chips 1-7
    const jumpBar = document.getElementById('station-jump-bar');
    if (jumpBar) {
      jumpBar.innerHTML = DATA.stations
        .map((st) => {
          const done = isStationCompleted(st);
          const doneCount = st.tasks.filter((t) => state.completedTasks[t.id]).length;
          const partial = !done && doneCount > 0;
          let classes =
            'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300';
          if (done) {
            classes = 'bg-emerald-600 text-white border-emerald-700 shadow-sm';
          } else if (partial) {
            classes = 'bg-cathedral-400 text-slate-950 border-cathedral-600';
          }
          return `
            <button
              onclick="window.CadizApp.scrollToStationCard('${st.id}')"
              class="h-9 rounded-xl border font-extrabold text-xs flex items-center justify-center gap-0.5 transition active:scale-95 ${classes}"
              title="${escapeHtml(st.title)}"
            >
              <span>${st.number}</span>
              ${done ? '<span class="text-[10px]">✓</span>' : ''}
            </button>
          `;
        })
        .join('');
    }

    // 2. Filter Stations
    const container = document.getElementById('stations-list');
    if (!container) return;

    const filteredStations = DATA.stations.filter((st) => {
      const done = isStationCompleted(st);
      if (stationFilter === 'open') return !done;
      if (stationFilter === 'done') return done;
      return true;
    });

    if (filteredStations.length === 0) {
      container.innerHTML = `
        <div class="bg-white rounded-3xl p-8 text-center border border-amber-200 shadow-sm">
          <div class="text-4xl mb-2">🎉</div>
          <h3 class="font-display font-bold text-lg text-slate-800">Keine Stationen in diesem Filter</h3>
          <p class="text-xs text-slate-500 mt-1">Wechsle zurück auf „Alle (7)“, um alle Stationen zu sehen.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filteredStations.map((st) => renderStationCardHTML(st)).join('');
  }

  function renderStationCardHTML(st) {
    const done = isStationCompleted(st);
    const distInfo = getDistanceInfoTo(st.lat, st.lng);
    const isNear = distInfo.meters < 100;
    const isSpeaking = currentlySpeakingId === st.id;
    const revealed = Boolean(state.revealedSolutions[st.id]);
    const currentGuess = state.guesses[st.id] || '';
    const stationPointsEarned = st.tasks.reduce(
      (sum, t) => sum + (state.completedTasks[t.id] ? t.points : 0),
      0
    );
    const stationPointsMax = st.tasks.reduce((sum, t) => sum + t.points, 0);

    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lng}&travelmode=walking`;

    return `
      <article
        id="card-${st.id}"
        class="bg-white rounded-3xl shadow-md border-2 transition-all overflow-hidden ${
          done
            ? 'border-emerald-500/80'
            : isNear
            ? 'border-emerald-500 pulse-green-card'
            : 'border-amber-200/90'
        }"
      >
        <!-- Card Top Banner -->
        <div class="${
          done
            ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
            : 'bg-gradient-to-r from-atlantic-700 via-atlantic-600 to-sky-600'
        } px-4 py-3 text-white flex items-start justify-between gap-2">
          <div class="flex items-start gap-2.5 min-w-0">
            <div class="w-9 h-9 rounded-2xl ${
              done ? 'bg-white text-emerald-700' : 'bg-cathedral-400 text-slate-950'
            } font-display font-extrabold text-base flex items-center justify-center shrink-0 shadow-md">
              ${done ? '✅' : st.number}
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-1.5 mb-0.5">
                <span class="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
                  ${escapeHtml(st.badge)}
                </span>
                <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-black/25 text-amber-200">
                  ${stationPointsEarned} / ${stationPointsMax} Pkt
                </span>
              </div>
              <h2 class="font-display font-extrabold text-base sm:text-lg leading-snug text-white">
                ${escapeHtml(st.title)}
              </h2>
            </div>
          </div>

          <!-- Live Distance & Compass Pill -->
          <div
            data-distance-target="${st.id}"
            class="shrink-0 text-right ${
              isNear
                ? 'bg-emerald-400 text-slate-950 animate-pulse'
                : 'bg-slate-950/35 text-sand border border-white/20'
            } px-2.5 py-1 rounded-xl text-xs font-extrabold flex flex-col items-end"
          >
            <span class="flex items-center gap-1">
              <span>${distInfo.bearing.arrow}</span>
              <span>${distInfo.meters} m</span>
            </span>
            <span class="text-[9px] font-semibold opacity-90">
              ${isNear ? 'Direkt hier!' : `Richtung ${distInfo.bearing.cardinal}`}
            </span>
          </div>
        </div>

        <!-- 3 Quick Action Buttons -->
        <div class="grid grid-cols-3 gap-1.5 px-3.5 pt-3">
          <button
            onclick="window.CadizApp.showOnAppMap('${st.id}')"
            class="py-2 px-2 rounded-xl bg-atlantic-50 hover:bg-atlantic-100 active:scale-95 text-atlantic-800 border border-atlantic-200 font-bold text-[11px] flex items-center justify-center gap-1 transition"
          >
            <span>🗺️</span>
            <span class="truncate">Auf App-Karte</span>
          </button>

          <a
            href="${gmapsUrl}"
            target="_blank"
            rel="noopener noreferrer"
            class="py-2 px-2 rounded-xl bg-amber-50 hover:bg-amber-100 active:scale-95 text-amber-950 border border-amber-200 font-bold text-[11px] flex items-center justify-center gap-1 transition"
          >
            <span>🧭</span>
            <span class="truncate">Google Fußweg</span>
          </a>

          <button
            onclick="window.CadizApp.toggleSpeakStation('${st.id}')"
            class="py-2 px-2 rounded-xl ${
              isSpeaking
                ? 'bg-tapas-600 text-white border-tapas-700 animate-pulse'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
            } active:scale-95 border font-bold text-[11px] flex items-center justify-center gap-1 transition"
          >
            <span>${isSpeaking ? '⏹️' : '🔊'}</span>
            <span class="truncate">${isSpeaking ? 'Stoppen' : 'Story vorlesen'}</span>
          </button>
        </div>

        <div class="p-4 space-y-4">
          <!-- Wissens- & Insider-Box -->
          <div class="bg-sand/80 rounded-2xl p-3.5 border border-amber-200/80">
            <div class="text-[11px] font-extrabold uppercase tracking-wider text-amber-800 mb-1 flex items-center gap-1">
              <span>📜</span> Story & Insider-Fakten
            </div>
            <p class="text-xs sm:text-sm text-slate-700 leading-relaxed">
              ${escapeHtml(st.story)}
            </p>
          </div>

          <!-- Das Schätz-Duell (Spoiler-geschützt) -->
          <div class="bg-gradient-to-br from-sky-50 to-indigo-50/60 rounded-2xl p-3.5 border border-sky-200">
            <div class="flex items-center justify-between gap-2 mb-1.5">
              <span class="text-[11px] font-extrabold uppercase tracking-wider text-atlantic-700 flex items-center gap-1">
                <span>🎲</span> Das Schätz-Duell (Spoiler-geschützt)
              </span>
              <span class="text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">
                Erst raten!
              </span>
            </div>

            <p class="text-xs sm:text-sm font-bold text-slate-900 leading-snug mb-2.5">
              ${escapeHtml(st.question)}
            </p>

            <!-- Group Guess Input -->
            <div class="mb-2.5">
              <input
                type="text"
                value="${escapeHtml(currentGuess)}"
                oninput="window.CadizApp.saveStationGuess('${st.id}', this.value)"
                placeholder="✍️ Eure Tipps hier notieren (z. B. Alex: 800 v.Chr., Lea: 1200 v.Chr.)..."
                class="w-full px-3 py-2 rounded-xl bg-white border border-sky-200 focus:border-atlantic-600 focus:outline-none text-xs text-slate-800 placeholder:text-slate-400"
              />
            </div>

            <!-- Spoiler Button & Solution -->
            <button
              onclick="window.CadizApp.toggleRevealSolution('${st.id}')"
              class="w-full py-2 px-3 rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-1.5 ${
                revealed
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                  : 'bg-atlantic-600 hover:bg-atlantic-700 text-white shadow-sm'
              }"
            >
              <span>${revealed ? '🙈' : '👁️'}</span>
              <span>${revealed ? 'Lösung wieder verbergen' : 'Lösung aufdecken'}</span>
            </button>

            <div
              id="solution-box-${st.id}"
              class="${revealed ? 'mt-2.5' : 'hidden'} bg-emerald-50 border border-emerald-300 rounded-xl p-3 text-xs text-emerald-950 font-semibold leading-relaxed"
            >
              <span class="font-extrabold text-emerald-700 uppercase text-[10px] block mb-0.5">✅ Richtige Antwort:</span>
              ${escapeHtml(st.answer)}
            </div>
          </div>

          <!-- Interaktive Aufgaben (Checkboxes mit Punkten) -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1">
                <span>🎯</span> Interaktive Rallye-Aufgaben
              </h3>
              <span class="text-[11px] font-bold text-slate-500">
                Abhaken = Konfetti & Punkte!
              </span>
            </div>

            ${st.tasks.map((task) => renderTaskItemHTML(st, task)).join('')}
          </div>
        </div>
      </article>
    `;
  }

  function renderTaskItemHTML(st, task) {
    const checked = Boolean(state.completedTasks[task.id]);
    const note = state.taskNotes[task.id] || '';
    const winnerId = state.taskWinners[task.id] || '';

    // Extra Spanish cheat sheet for Station 4 Task s4_t2 ("No Hablo Alemán")
    const isSpanishTask = task.id === 's4_t2';

    return `
      <div
        class="rounded-2xl p-3.5 border-2 transition-all ${
          checked
            ? 'bg-emerald-50/70 border-emerald-400 shadow-sm'
            : 'bg-slate-50/90 hover:bg-amber-50/40 border-slate-200'
        }"
      >
        <label class="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            ${checked ? 'checked' : ''}
            onchange="window.CadizApp.toggleTask('${st.id}', '${task.id}', this.checked)"
            class="mt-0.5 w-6 h-6 rounded-lg border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0 accent-emerald-600"
          />
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-1.5 mb-1">
              <span class="px-2 py-0.5 rounded-lg text-[11px] font-extrabold ${
                checked
                  ? 'bg-emerald-600 text-white'
                  : 'bg-cathedral-400 text-slate-950'
              }">
                +${task.points} Pkt
              </span>
              <span class="font-extrabold text-xs sm:text-sm ${
                checked ? 'line-through text-emerald-900' : 'text-slate-900'
              }">
                ${escapeHtml(task.title)}
              </span>
            </div>
            <p class="text-xs text-slate-600 leading-relaxed">
              ${escapeHtml(task.description)}
            </p>
          </div>
        </label>

        ${
          isSpanishTask
            ? `
          <div class="mt-2.5 pl-9">
            <div class="bg-amber-100/80 border border-amber-300 rounded-xl p-2.5 text-[11px] text-amber-950 flex items-center justify-between gap-2">
              <div>
                <span class="font-extrabold block">🇪🇸 Spickzettel für die Markthalle:</span>
                <em class="text-slate-800">„¡Hola! Dos cervezas bien frías y una ración de tortillitas de camarones, por favor.“</em>
              </div>
              <button
                type="button"
                onclick="window.CadizApp.speakSpanishPhrase('Hola! Dos cervezas bien frías y una ración de tortillitas de camarones, por favor.')"
                class="shrink-0 bg-amber-500 hover:bg-amber-600 text-white font-bold px-2.5 py-1.5 rounded-lg text-[11px]"
              >
                🔊 Spanisch
              </button>
            </div>
          </div>
        `
            : ''
        }

        <!-- Optional Note & Winner Attribution -->
        <div class="mt-2.5 pl-9 space-y-2">
          <input
            type="text"
            value="${escapeHtml(note)}"
            oninput="window.CadizApp.saveTaskNote('${task.id}', this.value)"
            placeholder="📝 Notiz zur Aufgabe (z. B. Wer hat gewonnen? Lustiges Foto-Detail...)"
            class="w-full px-3 py-1.5 rounded-xl bg-white border border-slate-200 focus:border-atlantic-600 focus:outline-none text-xs text-slate-700 placeholder:text-slate-400"
          />

          ${
            state.players.length > 0
              ? `
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[10px] font-bold text-slate-500">🏅 Punkte auch für:</span>
              <button
                type="button"
                onclick="window.CadizApp.assignTaskWinner('${task.id}', '')"
                class="px-2 py-0.5 rounded-full text-[10px] font-bold border transition ${
                  !winnerId
                    ? 'bg-atlantic-600 text-white border-atlantic-600'
                    : 'bg-white text-slate-600 border-slate-200'
                }"
              >
                👥 Nur Gruppe
              </button>
              ${state.players
                .map(
                  (p) => `
                <button
                  type="button"
                  onclick="window.CadizApp.assignTaskWinner('${task.id}', '${p.id}')"
                  class="px-2 py-0.5 rounded-full text-[10px] font-bold border transition ${
                    winnerId === p.id
                      ? 'bg-cathedral-500 text-slate-950 border-cathedral-600 font-extrabold'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }"
                >
                  ${p.avatar} ${escapeHtml(p.name)}
                </button>
              `
                )
                .join('')}
            </div>
          `
              : ''
          }
        </div>
      </div>
    `;
  }

  function toggleTask(stationId, taskId, isChecked) {
    if (isChecked) {
      state.completedTasks[taskId] = true;
    } else {
      delete state.completedTasks[taskId];
    }
    saveState();

    const station = DATA.stations.find((s) => s.id === stationId);
    const stationNowDone = station && isStationCompleted(station);

    if (isChecked) {
      if (stationNowDone) {
        triggerConfetti('station');
        showToast(`🎉 ${station.shortTitle} komplett abgeschlossen!`, 'success');
      } else {
        triggerConfetti('task');
      }
    }

    updateHeader();
    renderRallyeTab();
    refreshMapMarkers();
  }

  function saveTaskNote(taskId, noteText) {
    if (noteText && noteText.trim().length > 0) {
      state.taskNotes[taskId] = noteText;
    } else {
      delete state.taskNotes[taskId];
    }
    saveState();
  }

  function assignTaskWinner(taskId, playerId) {
    if (playerId) {
      state.taskWinners[taskId] = playerId;
    } else {
      delete state.taskWinners[taskId];
    }
    saveState();
    renderRallyeTab();
  }

  function saveStationGuess(stationId, guessText) {
    if (guessText && guessText.trim().length > 0) {
      state.guesses[stationId] = guessText;
    } else {
      delete state.guesses[stationId];
    }
    saveState();
  }

  function toggleRevealSolution(stationId) {
    state.revealedSolutions[stationId] = !state.revealedSolutions[stationId];
    saveState();
    renderRallyeTab();
  }

  // ============================================================================
  // 7. TAB 2: 📡 LIVE-RADAR ("WAS IST GERADE UM UNS HERUM?")
  // ============================================================================

  function getAllRadarItemsWithDistance() {
    const items = [];

    // 1. Add the 7 Main Stations (Category: Sehenswertes)
    DATA.stations.forEach((st) => {
      const distInfo = getDistanceInfoTo(st.lat, st.lng);
      items.push({
        id: st.id,
        isStation: true,
        stationNumber: st.number,
        title: st.title,
        shortTitle: st.shortTitle,
        category: 'Sehenswertes',
        badge: `🎯 Rallye-Station ${st.number}`,
        lat: st.lat,
        lng: st.lng,
        info: st.radarWhy || st.story,
        tip: st.radarMustSee,
        done: isStationCompleted(st),
        distInfo
      });
    });

    // 2. Add the 12 Live-Radar POIs
    DATA.pois.forEach((poi) => {
      const distInfo = getDistanceInfoTo(poi.lat, poi.lng);
      let badge = '🏛️ Sehenswertes';
      if (poi.category === 'Tapas & Eis') badge = '🍤 Tapas & Eis';
      else if (poi.category === 'Hidden Gems') badge = '💎 Hidden Gem';
      else if (poi.category === 'Parken') badge = '🅿️ Parkhaus';

      items.push({
        id: poi.id,
        isStation: false,
        title: poi.title,
        shortTitle: poi.title,
        category: poi.category,
        badge,
        lat: poi.lat,
        lng: poi.lng,
        info: poi.info,
        tip: poi.tip,
        done: false,
        distInfo
      });
    });

    // Sort dynamically by shortest distance to current GPS coordinates
    items.sort((a, b) => a.distInfo.meters - b.distInfo.meters);
    return items;
  }

  function setRadarCategory(cat) {
    radarCategory = cat;
    renderRadarTab();
  }

  function renderRadarTab() {
    // 1. GPS Hero Banner
    const gpsCard = document.getElementById('radar-gps-card');
    if (gpsCard) {
      if (gpsState.active) {
        gpsCard.className =
          'rounded-2xl p-3.5 shadow-sm border bg-emerald-50/90 border-emerald-300 flex items-center justify-between gap-3';
        gpsCard.innerHTML = `
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-lg shrink-0 shadow-sm animate-pulse">
              📡
            </div>
            <div class="min-w-0">
              <div class="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                <span>Live-Radar aktiv</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900">±${gpsState.accuracy || 10} m</span>
              </div>
              <p class="text-[11px] text-emerald-800 truncate">
                Alle 19 Orte werden live nach Entfernung zu euch sortiert!
              </p>
            </div>
          </div>
          <button
            onclick="window.CadizApp.requestGpsOrOpenLocationModal()"
            class="shrink-0 px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs"
          >
            Standort
          </button>
        `;
      } else {
        gpsCard.className =
          'rounded-2xl p-4 shadow-md border-2 bg-gradient-to-br from-atlantic-600 to-atlantic-800 border-cathedral-400 text-white space-y-2.5';
        gpsCard.innerHTML = `
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <span class="inline-block text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cathedral-400 text-slate-950">
                📍 Standort-Fallback: ${escapeHtml(gpsState.label)}
              </span>
              <h2 class="font-display font-extrabold text-base leading-snug">
                Was liegt gerade direkt neben euch?
              </h2>
              <p class="text-xs text-sky-100 leading-relaxed">
                Aktiviere dein Smartphone-GPS für Echtzeit-Distanz & Kompass-Pfeil (aktuell berechnet ab Kathedrale <code class="text-amber-200">36.5290, -6.2952</code>).
              </p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 pt-1">
            <button
              onclick="window.CadizApp.activateLiveGps(true)"
              class="flex-1 py-2.5 px-4 rounded-xl bg-cathedral-400 hover:bg-cathedral-500 active:scale-95 transition text-slate-950 font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5"
            >
              <span>📍</span>
              <span>Live-Radar aktivieren</span>
            </button>
            <button
              onclick="window.CadizApp.requestGpsOrOpenLocationModal()"
              class="py-2.5 px-3 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs border border-white/20"
            >
              Ort wählen
            </button>
          </div>
        `;
      }
    }

    // 2. Filter Pills
    const pillsContainer = document.getElementById('radar-filter-pills');
    const categories = [
      { id: 'Alle', label: 'Alle (19)' },
      { id: 'Sehenswertes', label: '🏛️ Sehenswertes' },
      { id: 'Tapas & Eis', label: '🍤 Tapas & Eis' },
      { id: 'Hidden Gems', label: '💎 Hidden Gems' },
      { id: 'Parken', label: '🅿️ Parken' }
    ];
    if (pillsContainer) {
      pillsContainer.innerHTML = categories
        .map((c) => {
          const active = radarCategory === c.id;
          return `
            <button
              onclick="window.CadizApp.setRadarCategory('${c.id}')"
              class="shrink-0 px-3.5 py-2 rounded-2xl font-extrabold text-xs border transition active:scale-95 ${
                active
                  ? 'bg-atlantic-600 text-white border-atlantic-700 shadow-sm'
                  : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-50'
              }"
            >
              ${c.label}
            </button>
          `;
        })
        .join('');
    }

    // 3. Sorted Radar List
    const listContainer = document.getElementById('radar-list');
    if (!listContainer) return;

    const allItems = getAllRadarItemsWithDistance();
    const filtered =
      radarCategory === 'Alle'
        ? allItems
        : allItems.filter((item) => item.category === radarCategory);

    listContainer.innerHTML = filtered.map((item) => renderRadarCardHTML(item)).join('');
  }

  function renderRadarCardHTML(item) {
    const isNear = item.distInfo.meters < 100;
    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}&travelmode=walking`;

    // Category color accents
    let badgeClasses = 'bg-amber-100 text-amber-900 border-amber-300';
    let tipBoxClasses = 'bg-amber-50/90 border-amber-200 text-amber-950';
    if (item.category === 'Tapas & Eis') {
      badgeClasses = 'bg-tapas-100 text-tapas-700 border-tapas-200';
      tipBoxClasses = 'bg-tapas-50 border-tapas-200 text-rose-950';
    } else if (item.category === 'Hidden Gems') {
      badgeClasses = 'bg-purple-100 text-purple-800 border-purple-200';
      tipBoxClasses = 'bg-purple-50 border-purple-200 text-purple-950';
    } else if (item.category === 'Parken') {
      badgeClasses = 'bg-blue-100 text-blue-800 border-blue-200';
      tipBoxClasses = 'bg-blue-50 border-blue-200 text-blue-950';
    }

    return `
      <div
        class="bg-white rounded-3xl p-4 shadow-sm border-2 transition-all ${
          isNear
            ? 'border-emerald-500 ring-2 ring-emerald-400/40 pulse-green-card'
            : 'border-amber-200/80'
        }"
      >
        <div class="flex items-start justify-between gap-2.5">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-1.5 mb-1">
              <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${badgeClasses}">
                ${escapeHtml(item.badge)}
              </span>
              ${
                isNear
                  ? `<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-600 text-white flex items-center gap-1 animate-bounce">
                       🟢 Direkt neben euch!
                     </span>`
                  : ''
              }
              ${
                item.done
                  ? `<span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                       ✅ Erledigt
                     </span>`
                  : ''
              }
            </div>
            <h3 class="font-display font-extrabold text-base text-slate-900 leading-snug">
              ${escapeHtml(item.title)}
            </h3>
          </div>

          <!-- Exact Live Distance + Compass Bearing -->
          <div
            class="shrink-0 text-right px-2.5 py-1.5 rounded-2xl font-extrabold text-xs ${
              isNear
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-900 border border-slate-200'
            }"
          >
            <div class="flex items-center justify-end gap-1 whitespace-nowrap">
              <span>${item.distInfo.bearing.arrow}</span>
              <span>${item.distInfo.meters} m entfernt</span>
            </div>
            <div class="text-[10px] font-semibold opacity-75">
              Kompass: ${item.distInfo.bearing.cardinal} (${item.distInfo.bearing.degrees}°)
            </div>
          </div>
        </div>

        <p class="text-xs text-slate-600 leading-relaxed mt-2">
          ${escapeHtml(item.info)}
        </p>

        ${
          item.tip
            ? `
          <div class="mt-2.5 rounded-2xl p-2.5 border text-xs leading-relaxed ${tipBoxClasses}">
            <span class="font-extrabold uppercase text-[10px] block mb-0.5">
              ${item.category === 'Tapas & Eis' ? '🍤 Was man hier bestellen muss:' : '✨ Was man hier sehen muss / Tipp:'}
            </span>
            ${escapeHtml(item.tip)}
          </div>
        `
            : ''
        }

        <div class="mt-3 flex items-center gap-2">
          <a
            href="${gmapsUrl}"
            target="_blank"
            rel="noopener noreferrer"
            class="flex-1 py-2 px-3 rounded-xl bg-atlantic-600 hover:bg-atlantic-700 active:scale-95 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
          >
            <span>🧭</span>
            <span>Google Maps Fußweg</span>
          </a>

          <button
            onclick="window.CadizApp.showOnAppMap('${item.id}')"
            class="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-800 font-bold text-xs border border-slate-200 transition"
          >
            🗺️ Karte
          </button>

          ${
            item.isStation
              ? `
            <button
              onclick="window.CadizApp.openStationFromMap('${item.id}')"
              class="py-2 px-3 rounded-xl bg-cathedral-400 hover:bg-cathedral-500 active:scale-95 text-slate-950 font-extrabold text-xs transition"
            >
              🎯 Aufgabe
            </button>
          `
              : ''
          }
        </div>
      </div>
    `;
  }

  // ============================================================================
  // 8. TAB 3: 🗺️ INTERAKTIVE LIVE-KARTE (LEAFLET)
  // ============================================================================

  function initOrRefreshMap() {
    if (!window.L) {
      showToast('⚠️ Karten-Bibliothek wird noch geladen...', 'info');
      return;
    }

    if (!map) {
      map = L.map('leaflet-map', {
        zoomControl: false,
        attributionControl: true
      }).setView([DATA.fallbackCoords.lat, DATA.fallbackCoords.lng], 15);

      L.control.zoom({ position: 'topleft' }).addTo(map);

      setMapTileLayer('voyager');

      // Draw dashed Walking-Route Polyline connecting Stations 1 -> 7
      const routeCoords = DATA.stations.map((s) => [s.lat, s.lng]);
      routePolyline = L.polyline(routeCoords, {
        color: '#0284c7',
        weight: 4,
        opacity: 0.85,
        dashArray: '10, 10',
        lineCap: 'round'
      }).addTo(map);

      refreshMapMarkers();
      updateUserMarkerOnMap();
      fitFullRouteOnMap();

      map.on('click', () => {
        closeMapBottomSheet();
      });
    } else {
      setTimeout(() => {
        map.invalidateSize();
        refreshMapMarkers();
        updateUserMarkerOnMap();
      }, 80);
    }
  }

  function setMapTileLayer(style) {
    if (!map || !window.L) return;
    if (tileLayer) {
      map.removeLayer(tileLayer);
    }
    mapStyle = style;
    const btn = document.getElementById('map-style-btn');

    if (style === 'satellite') {
      tileLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 19,
          attribution: '&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
        }
      ).addTo(map);
      if (btn) btn.textContent = '🗺️ Straßenkarte';
    } else {
      // CartoDB Voyager (sunny, high-contrast labels, 0 API keys)
      tileLayer = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        {
          subdomains: 'abcd',
          maxZoom: 20,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        }
      ).addTo(map);
      if (btn) btn.textContent = '🛰️ Satellit';
    }
  }

  function toggleMapStyle() {
    setMapTileLayer(mapStyle === 'voyager' ? 'satellite' : 'voyager');
  }

  function createCustomMarkerIcon(type, label, isDone) {
    let bg = '#eab308'; // Gold for stations
    let size = 36;
    let fontSize = '14px';

    if (type === 'station') {
      bg = isDone ? '#16a34a' : '#eab308';
      size = 38;
    } else if (type === 'Tapas & Eis') {
      bg = '#e11d48'; // Coral Red
      size = 32;
      fontSize = '15px';
    } else if (type === 'Hidden Gems' || type === 'Sehenswertes') {
      bg = '#9333ea'; // Purple
      size = 32;
      fontSize = '15px';
    } else if (type === 'Parken') {
      bg = '#2563eb'; // Blue
      size = 30;
      fontSize = '14px';
    }

    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div class="cadiz-marker-pin" style="width:${size}px;height:${size}px;background:${bg};font-size:${fontSize};">${label}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  function refreshMapMarkers() {
    if (!map || !window.L) return;

    // Remove existing markers
    Object.values(mapMarkers).forEach((m) => map.removeLayer(m));
    mapMarkers = {};

    // 1. Add 7 Rallye Station markers (numbered 1-7, turn green ✅ when done)
    DATA.stations.forEach((st) => {
      const done = isStationCompleted(st);
      const icon = createCustomMarkerIcon('station', done ? '✓' : st.number, done);
      const marker = L.marker([st.lat, st.lng], { icon, zIndexOffset: 500 }).addTo(map);
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        openMapBottomSheet(st.id);
      });
      mapMarkers[st.id] = marker;
    });

    // 2. Add 12 POI markers
    DATA.pois.forEach((poi) => {
      let emoji = '💎';
      if (poi.category === 'Tapas & Eis') emoji = '🍤';
      else if (poi.category === 'Parken') emoji = '🅿️';
      else if (poi.category === 'Sehenswertes') emoji = '🏛️';

      const icon = createCustomMarkerIcon(poi.category, emoji, false);
      const marker = L.marker([poi.lat, poi.lng], { icon, zIndexOffset: 200 }).addTo(map);
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        openMapBottomSheet(poi.id);
      });
      mapMarkers[poi.id] = marker;
    });

    if (activeBottomSheetId) {
      openMapBottomSheet(activeBottomSheetId);
    }
  }

  function updateUserMarkerOnMap() {
    if (!map || !window.L) return;

    const pos = [gpsState.lat, gpsState.lng];

    if (!userMarker) {
      const gpsIcon = L.divIcon({
        className: 'user-gps-div-icon',
        html: `
          <div class="relative flex items-center justify-center w-7 h-7">
            <span class="absolute w-7 h-7 rounded-full bg-sky-500 gps-sonar-ring"></span>
            <span class="relative w-4 h-4 rounded-full bg-sky-600 border-2 border-white shadow-md"></span>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      userMarker = L.marker(pos, { icon: gpsIcon, zIndexOffset: 1000 }).addTo(map);
      userMarker.bindTooltip('📍 Euer Standort', { direction: 'top', offset: [0, -10] });
    } else {
      userMarker.setLatLng(pos);
    }

    if (gpsState.active && gpsState.accuracy) {
      if (!userAccuracyCircle) {
        userAccuracyCircle = L.circle(pos, {
          radius: gpsState.accuracy,
          color: '#0284c7',
          fillColor: '#38bdf8',
          fillOpacity: 0.12,
          weight: 1
        }).addTo(map);
      } else {
        userAccuracyCircle.setLatLng(pos);
        userAccuracyCircle.setRadius(gpsState.accuracy);
      }
    }
  }

  function showOnAppMap(itemId) {
    switchTab('map');
    setTimeout(() => {
      const st = DATA.stations.find((s) => s.id === itemId);
      const poi = !st ? DATA.pois.find((p) => p.id === itemId) : null;
      const target = st || poi;
      if (target && map) {
        map.flyTo([target.lat, target.lng], 17, { duration: 0.7 });
        openMapBottomSheet(itemId);
      }
    }, 120);
  }

  function centerMapOnUser() {
    if (!gpsState.active && !gpsState.isSimulated) {
      activateLiveGps(true);
    }
    if (map) {
      map.flyTo([gpsState.lat, gpsState.lng], 17, { duration: 0.7 });
    }
  }

  function fitFullRouteOnMap() {
    if (!map || !window.L) return;
    const allCoords = [
      ...DATA.stations.map((s) => [s.lat, s.lng]),
      ...DATA.pois.map((p) => [p.lat, p.lng])
    ];
    const bounds = L.latLngBounds(allCoords);
    map.fitBounds(bounds, { padding: [32, 32] });
  }

  function openMapBottomSheet(itemId) {
    activeBottomSheetId = itemId;
    const sheet = document.getElementById('map-bottom-sheet');
    if (!sheet) return;

    const st = DATA.stations.find((s) => s.id === itemId);
    const poi = !st ? DATA.pois.find((p) => p.id === itemId) : null;
    const item = st || poi;
    if (!item) return;

    const distInfo = getDistanceInfoTo(item.lat, item.lng);
    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}&travelmode=walking`;
    const isSpeaking = currentlySpeakingId === item.id;

    if (st) {
      const done = isStationCompleted(st);
      const doneTasks = st.tasks.filter((t) => state.completedTasks[t.id]).length;
      sheet.innerHTML = `
        <div class="flex items-start justify-between gap-2 mb-2">
          <div>
            <div class="flex items-center gap-1.5 mb-0.5">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                done ? 'bg-emerald-600 text-white' : 'bg-cathedral-400 text-slate-950'
              }">
                ${done ? '✅ Station erledigt' : `🎯 Station ${st.number} (${doneTasks}/${st.tasks.length} Aufgaben)`}
              </span>
              <span class="text-xs font-extrabold text-atlantic-700">
                ${distInfo.bearing.arrow} ${distInfo.meters} m (${distInfo.bearing.cardinal})
              </span>
            </div>
            <h3 class="font-display font-extrabold text-base text-slate-900">
              ${escapeHtml(st.title)}
            </h3>
          </div>
          <button
            onclick="window.CadizApp.closeMapBottomSheet()"
            class="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs shrink-0"
          >
            ✕
          </button>
        </div>

        <p class="text-xs text-slate-600 leading-relaxed line-clamp-3 mb-3">
          ${escapeHtml(st.story)}
        </p>

        <div class="grid grid-cols-3 gap-1.5">
          <button
            onclick="window.CadizApp.openStationFromMap('${st.id}')"
            class="py-2.5 px-2 rounded-xl bg-cathedral-400 hover:bg-cathedral-500 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1 shadow-sm"
          >
            <span>🎯</span>
            <span>Zur Aufgabe</span>
          </button>
          <a
            href="${gmapsUrl}"
            target="_blank"
            rel="noopener noreferrer"
            class="py-2.5 px-2 rounded-xl bg-atlantic-600 hover:bg-atlantic-700 text-white font-extrabold text-xs flex items-center justify-center gap-1 shadow-sm"
          >
            <span>🧭</span>
            <span>Fußweg</span>
          </a>
          <button
            onclick="window.CadizApp.toggleSpeakStation('${st.id}')"
            class="py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1"
          >
            <span>${isSpeaking ? '⏹️' : '🔊'}</span>
            <span>${isSpeaking ? 'Stopp' : 'Vorlesen'}</span>
          </button>
        </div>
      `;
    } else if (poi) {
      sheet.innerHTML = `
        <div class="flex items-start justify-between gap-2 mb-2">
          <div>
            <div class="flex items-center gap-1.5 mb-0.5">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-tapas-100 text-tapas-700">
                ${escapeHtml(poi.category)}
              </span>
              <span class="text-xs font-extrabold text-atlantic-700">
                ${distInfo.bearing.arrow} ${distInfo.meters} m (${distInfo.bearing.cardinal})
              </span>
            </div>
            <h3 class="font-display font-extrabold text-base text-slate-900">
              ${escapeHtml(poi.title)}
            </h3>
          </div>
          <button
            onclick="window.CadizApp.closeMapBottomSheet()"
            class="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs shrink-0"
          >
            ✕
          </button>
        </div>

        <p class="text-xs text-slate-600 leading-relaxed mb-2">
          ${escapeHtml(poi.info)}
        </p>

        ${
          poi.tip
            ? `<div class="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-950 mb-3">
                 <strong class="font-extrabold">💡 Tipp:</strong> ${escapeHtml(poi.tip)}
               </div>`
            : ''
        }

        <div class="grid grid-cols-2 gap-2">
          <a
            href="${gmapsUrl}"
            target="_blank"
            rel="noopener noreferrer"
            class="py-2.5 px-3 rounded-xl bg-atlantic-600 hover:bg-atlantic-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm"
          >
            <span>🧭</span>
            <span>Google Maps Fußweg</span>
          </a>
          <button
            onclick="window.CadizApp.toggleSpeakStation('${poi.id}')"
            class="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5"
          >
            <span>${isSpeaking ? '⏹️' : '🔊'}</span>
            <span>${isSpeaking ? 'Stopp' : 'Info vorlesen'}</span>
          </button>
        </div>
      `;
    }

    sheet.classList.remove('hidden');
  }

  function closeMapBottomSheet() {
    activeBottomSheetId = null;
    const sheet = document.getElementById('map-bottom-sheet');
    if (sheet) sheet.classList.add('hidden');
  }

  function openStationFromMap(stationId) {
    closeMapBottomSheet();
    switchTab('rallye');
    scrollToStationCard(stationId);
  }

  // ============================================================================
  // 9. TAB 4: 🏆 SCOREBOARD, SPIELER & WHATSAPP-EXPORT
  // ============================================================================

  function generateWhatsAppSummary() {
    const scores = calculateScores();
    const lines = [];
    lines.push('☀️🧭 *CÁDIZ EXPLORER & RALLYE – ZWISCHENSTAND* 🧭☀️');
    lines.push(`🏆 *Gruppen-Score:* ${scores.totalGroupPoints} / ${scores.maxStationPoints} Punkte`);
    lines.push(`🎖️ *Rang:* ${scores.rank}`);
    lines.push(
      `📍 *Fortschritt:* ${scores.completedStationsCount}/7 Hauptstationen (${scores.completedTasksCount}/${scores.totalTasksCount} Aufgaben)`
    );

    // Completed stations list
    const doneStations = DATA.stations.filter((s) => isStationCompleted(s));
    if (doneStations.length > 0) {
      lines.push(
        `✅ *Erledigt:* ${doneStations.map((s) => s.shortTitle).join(', ')}`
      );
    }

    // Player / Team Leaderboard
    if (state.players.length > 0) {
      lines.push('');
      lines.push('👑 *SPIELER / TEAM-RANGLISTE:*');
      const rankedPlayers = [...state.players]
        .map((p) => ({
          ...p,
          total: scores.playerPointsMap[p.id] || 0
        }))
        .sort((a, b) => b.total - a.total);

      const medals = ['🥇', '🥈', '🥉'];
      rankedPlayers.forEach((p, idx) => {
        const prefix = medals[idx] || `${idx + 1}.`;
        lines.push(`${prefix} ${p.avatar} *${p.name}*: ${p.total} Pkt`);
      });
    }

    // Highlights from task notes
    const notesEntries = Object.entries(state.taskNotes).filter(
      ([, txt]) => txt && txt.trim().length > 0
    );
    if (notesEntries.length > 0) {
      lines.push('');
      lines.push('📸 *RALLYE-HIGHLIGHTS & NOTIZEN:*');
      notesEntries.slice(0, 5).forEach(([taskId, txt]) => {
        let taskTitle = taskId;
        DATA.stations.forEach((s) => {
          const found = s.tasks.find((t) => t.id === taskId);
          if (found) taskTitle = found.title;
        });
        lines.push(`• _${taskTitle}:_ ${txt.trim()}`);
      });
    }

    lines.push('');
    lines.push('🦦 _Live getrackt auf otterabs.dev_');
    return lines.join('\n');
  }

  function renderScoreTab() {
    const container = document.getElementById('scoreboard-container');
    if (!container) return;

    const scores = calculateScores();
    const whatsappText = generateWhatsAppSummary();

    // Sort players by total points
    const rankedPlayers = [...state.players]
      .map((p) => ({
        ...p,
        total: scores.playerPointsMap[p.id] || 0
      }))
      .sort((a, b) => b.total - a.total);

    container.innerHTML = `
      <!-- 1. Hero Score Summary Card -->
      <div class="bg-gradient-to-br from-atlantic-700 via-atlantic-600 to-sky-700 rounded-3xl p-5 text-white shadow-lg border border-cathedral-400/40">
        <div class="flex items-center justify-between gap-3">
          <div>
            <span class="text-[11px] font-extrabold uppercase tracking-wider text-amber-200 block">
              🏆 Aktueller Gruppen-Score
            </span>
            <div class="font-display font-extrabold text-3xl sm:text-4xl text-sand mt-0.5">
              ${scores.totalGroupPoints} <span class="text-lg font-sans font-bold text-sky-200">/ ${scores.maxStationPoints} Pkt</span>
            </div>
            <p class="text-xs font-bold text-amber-300 mt-1">
              ${escapeHtml(scores.rank)}
            </p>
          </div>
          <div class="w-16 h-16 rounded-3xl bg-cathedral-400/20 border border-cathedral-300/50 flex flex-col items-center justify-center shrink-0">
            <span class="text-xl font-extrabold text-cathedral-300">${scores.completedStationsCount}/7</span>
            <span class="text-[10px] font-bold text-sky-100">Stationen</span>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/15 text-center text-xs">
          <div class="bg-black/20 rounded-xl p-2">
            <div class="font-extrabold text-sand text-sm">${scores.taskPoints} Pkt</div>
            <div class="text-[10px] text-sky-200">Aus Aufgaben</div>
          </div>
          <div class="bg-black/20 rounded-xl p-2">
            <div class="font-extrabold text-sand text-sm">${scores.totalBonus >= 0 ? `+${scores.totalBonus}` : scores.totalBonus} Pkt</div>
            <div class="text-[10px] text-sky-200">Bonus / Strafen</div>
          </div>
          <div class="bg-black/20 rounded-xl p-2">
            <div class="font-extrabold text-sand text-sm">${scores.completedTasksCount}/${scores.totalTasksCount}</div>
            <div class="text-[10px] text-sky-200">Challenges</div>
          </div>
        </div>
      </div>

      <!-- 2. WhatsApp & URL Sync Export Card -->
      <div class="bg-white rounded-3xl p-4 shadow-sm border border-amber-200 space-y-3">
        <h2 class="font-display font-extrabold text-base text-slate-900 flex items-center gap-2">
          <span>📲</span> Teilen & Gruppen-Sync
        </h2>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onclick="window.CadizApp.copyWhatsAppSummary()"
            class="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2"
          >
            <span>📲</span>
            <span>Zwischenstand für WhatsApp kopieren</span>
          </button>

          <button
            onclick="window.CadizApp.shareSyncLink()"
            class="w-full py-3 px-4 rounded-2xl bg-atlantic-600 hover:bg-atlantic-700 active:scale-95 transition text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2"
          >
            <span>🔗</span>
            <span>Spielstand per Link mit Gruppe synchronisieren</span>
          </button>
        </div>

        <details class="group bg-slate-50 rounded-2xl border border-slate-200 p-3">
          <summary class="text-xs font-bold text-slate-700 cursor-pointer flex items-center justify-between">
            <span>👁️ WhatsApp-Vorschau anzeigen / direkt in WhatsApp öffnen</span>
            <span class="text-slate-400 group-open:rotate-180 transition">▼</span>
          </summary>
          <pre class="mt-2 text-[11px] font-mono whitespace-pre-wrap bg-white p-3 rounded-xl border border-slate-200 text-slate-800">${escapeHtml(whatsappText)}</pre>
          <a
            href="https://wa.me/?text=${encodeURIComponent(whatsappText)}"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-2 w-full py-2 px-3 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-extrabold text-xs flex items-center justify-center gap-1.5"
          >
            <span>💬</span> Direkt in WhatsApp öffnen
          </a>
        </details>
      </div>

      <!-- 3. Spieler & Teams Verwaltung -->
      <div class="bg-white rounded-3xl p-4 shadow-sm border border-amber-200 space-y-3.5">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="font-display font-extrabold text-base text-slate-900 flex items-center gap-1.5">
              <span>👥</span> Spieler & Teams
            </h2>
            <p class="text-[11px] text-slate-500">
              Spielt gemeinsam im Koop-Modus oder legt Einzelspieler/Teams fürs Ranking an!
            </p>
          </div>
        </div>

        <!-- Avatar Picker + Name Input -->
        <div class="space-y-2 bg-sand/70 p-3 rounded-2xl border border-amber-200/80">
          <div class="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1">
            ${DATA.avatars
              .map(
                (av) => `
              <button
                type="button"
                onclick="window.CadizApp.selectPlayerAvatar('${av}')"
                class="w-8 h-8 rounded-xl text-base flex items-center justify-center shrink-0 transition ${
                  selectedAvatar === av
                    ? 'bg-cathedral-400 ring-2 ring-amber-600 scale-105'
                    : 'bg-white hover:bg-amber-100 border border-slate-200'
                }"
              >
                ${av}
              </button>
            `
              )
              .join('')}
          </div>

          <form onsubmit="window.CadizApp.addPlayerFromForm(event)" class="flex gap-2">
            <input
              type="text"
              id="new-player-name"
              placeholder="Name von Spieler oder Team..."
              class="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-200 focus:border-atlantic-600 focus:outline-none text-xs font-semibold"
            />
            <button
              type="submit"
              class="px-4 py-2 rounded-xl bg-atlantic-600 hover:bg-atlantic-700 text-white font-extrabold text-xs shrink-0 shadow-sm"
            >
              + Hinzufügen
            </button>
          </form>
        </div>

        <!-- Leaderboard List -->
        ${
          rankedPlayers.length === 0
            ? `
          <div class="text-center py-4 px-3 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500">
            🦦 Aktuell im <strong>Gruppen-Koop-Modus</strong>. Fügt oben Namen hinzu, wenn ihr zusätzlich ein Einzel- oder Team-Ranking führen wollt!
          </div>
        `
            : `
          <div class="space-y-2">
            ${rankedPlayers
              .map((p, idx) => {
                const medals = ['🥇', '🥈', '🥉'];
                const rankBadge = medals[idx] || `${idx + 1}.`;
                return `
                  <div class="flex items-center justify-between gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <span class="text-base font-extrabold w-6 text-center">${rankBadge}</span>
                      <span class="text-xl">${p.avatar}</span>
                      <div class="min-w-0">
                        <div class="font-extrabold text-xs sm:text-sm text-slate-900 truncate">
                          ${escapeHtml(p.name)}
                        </div>
                        <div class="text-[10px] text-slate-500">
                          Gesamt: <strong class="text-atlantic-700">${p.total} Pkt</strong> (Bonus: ${p.bonusPoints >= 0 ? `+${p.bonusPoints}` : p.bonusPoints})
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-1 shrink-0">
                      <button
                        onclick="window.CadizApp.applyBonusPoints(-5, 'Strafpunkte (-5)', '${p.id}')"
                        class="px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-extrabold text-xs"
                        title="-5 Punkte"
                      >
                        -5
                      </button>
                      <button
                        onclick="window.CadizApp.applyBonusPoints(5, 'Bonuspunkte (+5)', '${p.id}')"
                        class="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-extrabold text-xs"
                        title="+5 Punkte"
                      >
                        +5
                      </button>
                      <button
                        onclick="window.CadizApp.removePlayer('${p.id}')"
                        class="p-1 text-slate-400 hover:text-rose-600 text-xs ml-1"
                        title="Spieler entfernen"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        `
        }
      </div>

      <!-- 4. Manuelle Bonus- & Strafpunkte -->
      <div class="bg-white rounded-3xl p-4 shadow-sm border border-amber-200 space-y-3">
        <div>
          <h2 class="font-display font-extrabold text-base text-slate-900 flex items-center gap-1.5">
            <span>⚡</span> Bonus- & Strafpunkte vergeben
          </h2>
          <p class="text-[11px] text-slate-500">
            Für spontane Heldentaten, beste Schnappschüsse oder Nörgeln in der Sonne!
          </p>
        </div>

        <!-- Target Selector -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-[11px] font-bold text-slate-500 mr-1">Vergeben an:</span>
          <button
            onclick="window.CadizApp.setBonusTarget('group')"
            class="px-2.5 py-1 rounded-xl text-xs font-extrabold border transition ${
              bonusTargetId === 'group'
                ? 'bg-atlantic-600 text-white border-atlantic-700'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }"
          >
            👥 Ganze Gruppe
          </button>
          ${state.players
            .map(
              (p) => `
            <button
              onclick="window.CadizApp.setBonusTarget('${p.id}')"
              class="px-2.5 py-1 rounded-xl text-xs font-extrabold border transition ${
                bonusTargetId === p.id
                  ? 'bg-cathedral-400 text-slate-950 border-cathedral-600'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }"
            >
              ${p.avatar} ${escapeHtml(p.name)}
            </button>
          `
            )
            .join('')}
        </div>

        <!-- Preset Buttons Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          ${DATA.bonusPresets
            .map((preset) => {
              const isPos = preset.points > 0;
              return `
                <button
                  onclick="window.CadizApp.applyBonusPoints(${preset.points}, '${escapeHtml(preset.label)}')"
                  class="p-2.5 rounded-2xl border text-left flex items-center justify-between gap-2 transition active:scale-95 ${
                    isPos
                      ? 'bg-emerald-50/70 hover:bg-emerald-100/80 border-emerald-200 text-emerald-950'
                      : 'bg-rose-50/70 hover:bg-rose-100/80 border-rose-200 text-rose-950'
                  }"
                >
                  <span class="text-xs font-bold truncate">${escapeHtml(preset.label)}</span>
                  <span class="px-2 py-0.5 rounded-lg text-xs font-extrabold shrink-0 ${
                    isPos ? 'bg-emerald-600 text-white' : 'bg-tapas-600 text-white'
                  }">
                    ${isPos ? `+${preset.points}` : preset.points} Pkt
                  </span>
                </button>
              `;
            })
            .join('')}
        </div>

        ${
          state.scoreLog && state.scoreLog.length > 0
            ? `
          <div class="pt-2 border-t border-slate-100">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1.5">
              Letzte Wertungen:
            </span>
            <div class="space-y-1 max-h-36 overflow-y-auto">
              ${state.scoreLog
                .slice(0, 8)
                .map(
                  (entry) => `
                <div class="flex items-center justify-between text-[11px] bg-slate-50 px-2.5 py-1.5 rounded-xl">
                  <span class="truncate text-slate-700">
                    <strong>${escapeHtml(entry.targetName)}:</strong> ${escapeHtml(entry.label)}
                  </span>
                  <span class="font-extrabold ml-2 shrink-0 ${
                    entry.points >= 0 ? 'text-emerald-600' : 'text-tapas-600'
                  }">
                    ${entry.points >= 0 ? `+${entry.points}` : entry.points} Pkt
                  </span>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        `
            : ''
        }
      </div>

      <!-- 5. Reset Option -->
      <div class="text-center pt-2 pb-4">
        <button
          onclick="window.CadizApp.resetAllProgress()"
          class="text-xs font-semibold text-slate-400 hover:text-rose-600 underline transition"
        >
          Spielstand komplett zurücksetzen
        </button>
      </div>
    `;
  }

  function selectPlayerAvatar(av) {
    selectedAvatar = av;
    renderScoreTab();
  }

  function addPlayerFromForm(event) {
    event.preventDefault();
    const input = document.getElementById('new-player-name');
    if (!input) return;
    const name = input.value.trim();
    if (!name) {
      showToast('Bitte einen Namen eingeben!', 'info');
      return;
    }

    const newPlayer = {
      id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name,
      avatar: selectedAvatar,
      bonusPoints: 0
    };
    state.players.push(newPlayer);
    bonusTargetId = newPlayer.id;

    // Pick next avatar automatically
    const nextIdx = (DATA.avatars.indexOf(selectedAvatar) + 1) % DATA.avatars.length;
    selectedAvatar = DATA.avatars[nextIdx];

    saveState();
    updateHeader();
    renderScoreTab();
    showToast(`${newPlayer.avatar} ${newPlayer.name} ist dabei!`, 'success');
  }

  function removePlayer(playerId) {
    state.players = state.players.filter((p) => p.id !== playerId);
    if (bonusTargetId === playerId) bonusTargetId = 'group';
    saveState();
    updateHeader();
    renderScoreTab();
  }

  function setBonusTarget(targetId) {
    bonusTargetId = targetId;
    renderScoreTab();
  }

  function applyBonusPoints(points, label, explicitTargetId) {
    const targetId = explicitTargetId || bonusTargetId;
    let targetName = 'Gruppe';

    if (targetId === 'group') {
      state.groupBonusPoints = (Number(state.groupBonusPoints) || 0) + points;
    } else {
      const player = state.players.find((p) => p.id === targetId);
      if (player) {
        player.bonusPoints = (Number(player.bonusPoints) || 0) + points;
        targetName = `${player.avatar} ${player.name}`;
      } else {
        state.groupBonusPoints = (Number(state.groupBonusPoints) || 0) + points;
      }
    }

    state.scoreLog.unshift({
      id: Date.now(),
      ts: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      label,
      points,
      targetName
    });

    saveState();
    if (points > 0) {
      triggerConfetti('task');
    }
    updateHeader();
    renderScoreTab();
    showToast(
      `${points > 0 ? '🎉 +' + points : '⚡ ' + points} Pkt (${targetName}): ${label}`,
      points > 0 ? 'success' : 'info'
    );
  }

  async function copyWhatsAppSummary() {
    const text = generateWhatsAppSummary();
    await copyTextToClipboard(text, '📲 WhatsApp-Zwischenstand kopiert! Jetzt im Chat einfügen.');
  }

  function resetAllProgress() {
    const confirmed = window.confirm(
      'Möchtet ihr wirklich den gesamten Spielstand (alle erledigten Aufgaben, Punkte und Notizen) auf 0 zurücksetzen?'
    );
    if (!confirmed) return;

    state = getDefaultState();
    saveState();
    updateHeader();
    renderScoreTab();
    renderRallyeTab();
    refreshMapMarkers();
    showToast('🔄 Spielstand wurde zurückgesetzt.', 'info');
  }

  // ============================================================================
  // 10. HELPERS, LIVE UI REFRESH & INITIALIZATION
  // ============================================================================

  function refreshDistanceDependentUI() {
    updateHeader();
    if (currentTab === 'rallye') {
      // Update distance badges in-place if possible so user input focus is never disturbed
      const badges = document.querySelectorAll('[data-distance-target]');
      if (badges.length > 0) {
        badges.forEach((el) => {
          const stId = el.getAttribute('data-distance-target');
          const st = DATA.stations.find((s) => s.id === stId);
          if (!st) return;
          const distInfo = getDistanceInfoTo(st.lat, st.lng);
          const isNear = distInfo.meters < 100;
          el.innerHTML = `
            <span class="flex items-center gap-1">
              <span>${distInfo.bearing.arrow}</span>
              <span>${distInfo.meters} m</span>
            </span>
            <span class="text-[9px] font-semibold opacity-90">
              ${isNear ? 'Direkt hier!' : `Richtung ${distInfo.bearing.cardinal}`}
            </span>
          `;
        });
      } else {
        renderRallyeTab();
      }
    } else if (currentTab === 'radar') {
      renderRadarTab();
    } else if (currentTab === 'map' && activeBottomSheetId) {
      openMapBottomSheet(activeBottomSheetId);
    }
  }

  function showToast(message, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    let colorClasses = 'bg-slate-900/95 text-white border-slate-700';
    if (type === 'success') {
      colorClasses = 'bg-emerald-700/95 text-white border-emerald-400';
    } else if (type === 'error') {
      colorClasses = 'bg-tapas-600/95 text-white border-rose-300';
    }

    toast.className = `pointer-events-auto px-4 py-2.5 rounded-2xl shadow-xl border text-xs font-extrabold backdrop-blur-md transition-all duration-300 transform translate-y-0 opacity-100 ${colorClasses}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3200);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  // Expose public API for inline event handlers
  window.CadizApp = {
    switchTab,
    setStationFilter,
    scrollToStationCard,
    jumpToNearestStation,
    toggleTask,
    saveTaskNote,
    assignTaskWinner,
    saveStationGuess,
    toggleRevealSolution,
    toggleSpeakStation,
    speakSpanishPhrase,
    stopSpeech,
    setRadarCategory,
    activateLiveGps,
    setSimulatedLocation,
    requestGpsOrOpenLocationModal,
    closeLocationModal,
    showOnAppMap,
    centerMapOnUser,
    fitFullRouteOnMap,
    toggleMapStyle,
    openMapBottomSheet,
    closeMapBottomSheet,
    openStationFromMap,
    selectPlayerAvatar,
    addPlayerFromForm,
    removePlayer,
    setBonusTarget,
    applyBonusPoints,
    copyWhatsAppSummary,
    shareSyncLink,
    resetAllProgress
  };

  // Boot application
  document.addEventListener('DOMContentLoaded', () => {
    checkUrlSyncParameter();
    updateHeader();
    renderRallyeTab();
    activateLiveGps(false);
    registerServiceWorker();
  });
})();
