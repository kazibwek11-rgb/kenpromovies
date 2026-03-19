// ============================================================
//  KENMOVIES — app3.js v4.1 (hero + latest + autocomplete fix)
// ============================================================
window.onerror = function(msg, src, line, col, err) {
  document.body.style.background = '#0a0a0a';
  document.body.style.color = '#ff4444';
  document.body.style.fontFamily = 'monospace';
  document.body.style.padding = '20px';
  document.body.innerHTML = '<h2>App Error</h2><p>' + msg + '</p><p>Line: ' + line + '</p><p>' + (err ? err.stack : '') + '</p>';
};
const DEFAULT_PASS = 'kenpro123';
const PASS_KEY = 'kp_admin_pass';
function getAdminPass() { return localStorage.getItem(PASS_KEY) || DEFAULT_PASS; }
function setAdminPass(p) { localStorage.setItem(PASS_KEY, p); }
const FAVS_KEY  = 'kp_favs';
const ADMIN_KEY = 'kp_admin';

const VJS = ['VJ Junior','VJ Emmy','VJ Ice P','VJ Sammy','VJ Little T','VJ Jingo','VJ ULIO','VJ HD','VJ SMK','VJ KEVO','VJ UNCLE T','VJ KISULE','VJ SHIELD','VJ MARK','VJ MOON','VJ KEVIN','VJ HEAVY Q','VJ KRISS SWEET','VJ SHAO KHAN','VJ MOSCO','VJ MUBA','VJ RONNIE','VJ IVO','VJ TONNY','VJ KS','VJ TOM','VJ SOUL','VJ NELLY','VJ BANKS','VJ RYAN','VJ KIMULI','VJ MOX'];

let comingSoon = [], dlHistory = [], subscribers = [], payments = [];
let carouselIdx = 0, carouselTimer = null;
let allContent = [], favs = [], curPlay = null, curSection = 'home';
let adminUnlocked = false, secretCount = 0, secretTimer = null;
let searchFilter = 'all', libFilter = 'all';
let editingId = null, pendingDelId = null, deferredInstall = null;

// ── ARCHIVE.ORG CACHE ────────────────────────────────────────
const _archiveCache = {};

function preFetchArchiveMetadata() {
  allContent.filter(m => m.play && m.play.includes('archive.org')).slice(0, 10).forEach(m => {
    const match = m.play.match(/archive\.org\/(?:details|download|embed)\/([^/?#/]+)/);
    if (match && !_archiveCache[match[1]]) setTimeout(() => getArchiveDirectUrl(match[1]), 2000);
  });
}

// ── PWA ──────────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstall = e;
  const b = document.getElementById('install-btn');
  if (b) { b.style.display = 'flex'; b.classList.add('highlight'); }
  const banner = document.getElementById('install-banner');
  if (banner && !localStorage.getItem('kp_install_dismissed')) banner.style.display = 'flex';
});
function dismissInstallBanner() {
  const banner = document.getElementById('install-banner');
  if (banner) banner.style.display = 'none';
  localStorage.setItem('kp_install_dismissed', '1');
}
window.addEventListener('appinstalled', () => {
  const banner = document.getElementById('install-banner');
  if (banner) banner.style.display = 'none';
  deferredInstall = null;
});
function triggerInstall() {
  if (!deferredInstall) { alert('Use your browser menu → "Add to Home Screen"'); return; }
  deferredInstall.prompt();
  deferredInstall.userChoice.then(() => { deferredInstall = null; });
}

// ── LOCAL STORAGE ────────────────────────────────────────────
function loadLocal() {
  try { favs = JSON.parse(localStorage.getItem(FAVS_KEY) || '[]'); } catch(e) { favs = []; }
  adminUnlocked = localStorage.getItem(ADMIN_KEY) === '1';
  if (adminUnlocked) revealAdmin();
}
function saveFavs() { try { localStorage.setItem(FAVS_KEY, JSON.stringify(favs)); } catch(e) {} }

// ── FIREBASE ─────────────────────────────────────────────────
function startFirebase() {
  if (!window._fbReady) { document.addEventListener('fb-ready', startFirebase, { once: true }); return; }
  const { collection, onSnapshot, orderBy, query, doc } = window._fb;
  const db = window._db;
  let newC = [], oldC = [], newDone = false, oldDone = false;
  function merge() {
    if (!newDone || !oldDone) return;
    const combined = [...oldC];
    newC.forEach(n => { if (!combined.find(o => o.id === n.id)) combined.push(n); });
    // ── FIX: ensure every item has a numeric createdAt for sorting ──
    allContent = combined.map(m => ({
      ...m,
      createdAt: typeof m.createdAt === 'number' ? m.createdAt
               : typeof m.createdAt === 'string' ? new Date(m.createdAt).getTime() || 0
               : 0
    }));
    renderAll();
    setTimeout(preFetchArchiveMetadata, 3000);
  }
  onSnapshot(query(collection(db, 'content'), orderBy('createdAt', 'desc')), snap => {
    newC = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    newDone = true; merge();
  }, err => { console.warn('content:', err.code); newDone = true; merge(); });
  onSnapshot(doc(db, 'settings', 'movies'), snap => {
    if (snap.exists()) {
      const raw = snap.data(), list = raw.list || raw.movies || [];
      oldC = list.map((m, i) => ({
        id: 'legacy-' + i, title: m.title || m.name || 'Untitled',
        cat: m.cat || (m.seriesName ? 'series' : 'movie'),
        vj: m.vj || m.VJ || '', genre: m.genre || '', year: m.year || '',
        desc: m.desc || m.description || '',
        thumb: m.thumb || m.thumbnail || m.poster || '',
        play: m.play || m.playLink || m.link || m.url || '',
        dl: m.dl || m.dlLink || m.downloadLink || '',
        seriesName: m.seriesName || '', season: m.season || 1,
        epNum: m.epNum || m.episode || 1, epTitle: m.epTitle || '',
        createdAt: typeof m.createdAt === 'number' ? m.createdAt : i,
      }));
    } else oldC = [];
    oldDone = true; merge();
  }, err => { console.warn('settings/movies:', err.code); oldDone = true; merge(); });
}

// ── SECTION NAV ──────────────────────────────────────────────
function showSection(sec) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.snav,.bnav').forEach(b => b.classList.remove('active'));
  const pg = document.getElementById('page-' + sec); if (pg) pg.classList.add('active');
  const sn = document.getElementById('snav-' + sec); if (sn) sn.classList.add('active');
  const bn = document.getElementById('bnav-' + sec); if (bn) bn.classList.add('active');
  curSection = sec;
  if (sec === 'downloads') renderDownloadsPage();
  if (sec === 'indian')    renderVJRows('indian', 'indian');
  if (sec === 'favs')      renderFavs();
  if (sec === 'home')      { renderComingSoon(); setTimeout(function(){ if(typeof initHero==='function') initHero(); }, 50); }
  if (sec === 'settings')  updateStats();
  if (sec === 'admin') { renderLib(); renderSubs(); renderPayments(); }
  const c = document.getElementById('content'); if (c) c.scrollTop = 0;
}

// ── RENDER ALL ───────────────────────────────────────────────
function renderAll() {
  renderVJRows('home', null);
  renderVJRows('movies', 'movie');
  renderVJRows('series', 'series');
  renderVJRows('animation', 'animation');
  renderVJRows('indian', 'indian');
  if (curSection === 'favs')     renderFavs();
  if (curSection === 'settings') updateStats();
  if (curSection === 'admin')    renderLib();
  if (curSection === 'detail') {
    const h = document.getElementById('sd-container');
    if (h && h.dataset.sname) openSeriesDetail(h.dataset.sname);
  }
  // Init hero after content loads
  setTimeout(() => { if (typeof initHero === 'function') initHero(); }, 100);
}

// ── VJ ROWS ──────────────────────────────────────────────────
function renderVJRows(pageId, cat) {
  const container = document.getElementById('vj-rows-' + pageId);
  if (!container) return;
  let base = cat ? allContent.filter(m => m.cat === cat) : allContent;
  if (cat === 'series') {
    const seen = {};
    base = [];
    allContent.filter(m => m.cat === 'series').forEach(m => {
      const name = m.seriesName || m.title;
      if (!seen[name]) { seen[name] = true; base.push({ ...m, _isSeriesGroup: true, _sname: name }); }
    });
  }
  if (!base.length) { container.innerHTML = '<div class="empty-page">No content yet.</div>'; return; }
  let html = '';
  if (pageId === 'home') {
    // ── FIX: sort by createdAt descending so newest appears first in Latest
    const recent = [...allContent]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 20);
    html += buildRow('Latest', recent, 'home');
    VJS.forEach(vj => {
      const items = allContent.filter(m => m.vj === vj);
      if (items.length) html += buildRow(vj, items, 'home');
    });
  } else if (cat === 'series') {
    html += buildRow('All Series', base, 'series');
    VJS.forEach(vj => {
      const vjSeen = {}, vjItems = [];
      allContent.filter(m => m.cat === 'series' && m.vj === vj).forEach(m => {
        const name = m.seriesName || m.title;
        if (!vjSeen[name]) { vjSeen[name] = true; vjItems.push({ ...m, _isSeriesGroup: true, _sname: name }); }
      });
      if (vjItems.length) html += buildRow(vj, vjItems, 'series');
    });
  } else {
    // ── FIX: Latest within each category also sorted by createdAt
    const catLatest = [...base].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 20);
    html += buildRow('Latest', catLatest, cat);
    VJS.forEach(vj => {
      const items = base.filter(m => m.vj === vj);
      if (items.length) html += buildRow(vj, items, cat);
    });
  }
  container.innerHTML = html || '<div class="empty-page">No content yet.</div>';
}

function buildRow(label, items, rowType) {
  if (!items.length) return '';
  const cards = items.map(m => {
    if (m._isSeriesGroup || (m.cat === 'series' && rowType === 'series')) return seriesGroupCard(m);
    return movieCard(m);
  }).join('');
  const safeLabel = label.replace(/'/g, "\\'");
  const seeAllBtn = label !== 'Latest'
    ? '<button class="see-all-btn" onclick="showSeeAll(\'' + safeLabel + '\')">See All</button>'
    : '<span class="vj-row-count">' + items.length + ' title' + (items.length !== 1 ? 's' : '') + '</span>';
  return '<div class="vj-row-block"><div class="row-head"><span class="row-label">' + label + '</span>' + seeAllBtn + '</div><div class="hrow">' + cards + '</div></div>';
}

// ── POSTER CARD ───────────────────────────────────────────────
function movieCard(m) {
  const sname = m._sname || m.seriesName || m.title;
  const isSeries = m._isSeriesGroup || m.cat === 'series';
  const click = isSeries
    ? "openSeriesDetail('" + sname.replace(/'/g, "\\'") + "')"
    : "openDetailOverlay('" + m.id + "','movie')";
  const editBtn = adminUnlocked
    ? '<button class="pc-edit" onclick="event.stopPropagation();startEdit(\'' + m.id + '\')">E</button>'
    : '';
  const thumb = m.thumb || '';
  return '<div class="pcard" onclick="' + click + '">'
    + '<div class="pcard-poster">'
    + (thumb ? '<img src="' + thumb + '" loading="lazy" onerror="this.style.display=\'none\'"/>' : '')
    + (!thumb ? '<div class="pcard-noimg"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/></svg></div>' : '')
    + '<div class="pcard-hover"><div class="pcard-hover-title">' + (m.seriesName || m.title || '') + '</div>'
    + (m.vj ? '<div class="pcard-hover-vj">' + m.vj + '</div>' : '')
    + '</div>'
    + (m.vj ? '<div class="pcard-vj-tag">' + m.vj + '</div>' : '')
    + editBtn
    + '</div>'
    + '<div class="pcard-label">'
    + '<div class="pcard-title">' + (m.seriesName || m.title || '') + '</div>'
    + (m.year || m.genre ? '<div class="pcard-sub">' + [m.year, m.genre].filter(Boolean).join(' · ') + '</div>' : '')
    + '</div></div>';
}

function seriesGroupCard(m) { return movieCard({ ...m, _isSeriesGroup: true }); }

// ── SERIES DETAIL ────────────────────────────────────────────
let _sdEps = [], _sdSeasons = {}, _sdActiveSeason = 1, _sdSname = '';

function openSeriesDetail(sname) {
  if (window.openDetailOverlay) { window.openDetailOverlay(sname, 'series'); return; }
  _sdSname = sname;
  _sdEps = allContent.filter(m => m.cat === 'series' && (m.seriesName || m.title) === sname)
    .sort((a, b) => (a.season || 1) - (b.season || 1) || (a.epNum || 1) - (b.epNum || 1));
  if (!_sdEps.length) return;
  const first = _sdEps[0];
  _sdSeasons = {};
  _sdEps.forEach(ep => { const sn = ep.season || 1; if (!_sdSeasons[sn]) _sdSeasons[sn] = []; _sdSeasons[sn].push(ep); });
  const snKeys = Object.keys(_sdSeasons).sort((a, b) => +a - +b);
  _sdActiveSeason = +snKeys[0];
  const backdrop = document.getElementById('sd-backdrop');
  if (backdrop) {
    if (first.thumb) backdrop.style.backgroundImage = "url('" + first.thumb + "')";
    else { backdrop.style.backgroundImage = 'none'; backdrop.style.background = 'var(--bg2)'; }
  }
  const cont = document.getElementById('sd-container'); if (cont) cont.dataset.sname = sname;
  const titleEl = document.getElementById('sd-title'); if (titleEl) titleEl.textContent = sname;
  const vjEl = document.getElementById('sd-vj');
  if (vjEl) { vjEl.textContent = first.vj || ''; vjEl.style.display = first.vj ? 'inline-block' : 'none'; }
  const genEl = document.getElementById('sd-genres'); if (genEl) genEl.textContent = [first.year, first.genre].filter(Boolean).join('  ·  ');
  const descEl = document.getElementById('sd-desc'); if (descEl) descEl.textContent = first.desc || '';
  const favKey = 'series-' + sname;
  const isFav = favs.includes(favKey);
  const favIco = document.getElementById('sd-fav-ico'); if (favIco) favIco.innerHTML = '<use href="' + (isFav ? '#i-heart-f' : '#i-heart') + '"/>';
  const favBtn = document.getElementById('sd-fav-btn'); if (favBtn) favBtn.dataset.favkey = favKey;
  const menu = document.getElementById('sd-season-menu');
  if (menu) {
    menu.innerHTML = snKeys.map(sn =>
      '<div class="sd-season-item ' + (+sn === _sdActiveSeason ? 'active' : '') + '" onclick="selectSeason(' + sn + ')">'
      + (first.thumb ? '<img class="sd-season-thumb" src="' + first.thumb + '" onerror="this.style.display=\'none\'"/>' : '<div class="sd-season-thumb-placeholder"></div>')
      + '<div class="sd-season-item-info"><div class="sd-season-item-name">Season ' + sn + '</div>'
      + '<div class="sd-season-item-count">' + _sdSeasons[sn].length + ' Episode' + (_sdSeasons[sn].length !== 1 ? 's' : '') + '</div></div></div>'
    ).join('');
  }
  const labelEl = document.getElementById('sd-season-label'); if (labelEl) labelEl.textContent = 'Season ' + _sdActiveSeason;
  const smenu = document.getElementById('sd-season-menu'); if (smenu) smenu.classList.remove('open');
  const chev = document.getElementById('sd-chevron'); if (chev) chev.style.transform = 'rotate(90deg)';
  renderSDEpisodes();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.snav,.bnav').forEach(b => b.classList.remove('active'));
  const pd = document.getElementById('page-detail'); if (pd) pd.classList.add('active');
  const ss = document.getElementById('snav-series'); if (ss) ss.classList.add('active');
  const bs = document.getElementById('bnav-series'); if (bs) bs.classList.add('active');
  const c = document.getElementById('content'); if (c) c.scrollTop = 0;
  curSection = 'detail';
}

function renderSDEpisodes() {
  const eps = _sdSeasons[_sdActiveSeason] || [];
  const row = document.getElementById('sd-ep-row');
  if (!row) return;
  if (!eps.length) { row.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:10px">No episodes yet.</div>'; return; }
  row.innerHTML = eps.map(ep => {
    const editBtn = adminUnlocked
      ? '<button class="sd-ep-edit" onclick="event.stopPropagation();startEdit(\'' + ep.id + '\')"><svg width="12" height="12"><use href="#i-edit"/></svg></button>'
      : '';
    return '<div class="sd-ep-card" onclick="playItem(\'' + ep.id + '\')">'
      + '<div class="sd-ep-thumb">'
      + (ep.thumb ? '<img src="' + ep.thumb + '" onerror="this.style.display=\'none\'"/>' : '')
      + '<div class="sd-ep-overlay"><div class="sd-ep-play-btn"><svg width="18" height="18" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></div></div>'
      + '<div class="sd-ep-duration">S' + (ep.season || 1) + ' E' + (ep.epNum || 1) + '</div>'
      + '</div>'
      + '<div class="sd-ep-meta"><div class="sd-ep-code">S' + (ep.season || 1) + ' E' + (ep.epNum || 1) + '</div>'
      + '<div class="sd-ep-name">' + (ep.epTitle || ep.title || 'Episode ' + (ep.epNum || 1)) + '</div></div>'
      + '<div class="sd-ep-btns">'
      + '<button class="sd-ep-btn watch" onclick="event.stopPropagation();playItem(\'' + ep.id + '\')"><svg width="11" height="11" fill="currentColor"><polygon points="3,2 13,8 3,14"/></svg> Watch</button>'
      + '<button class="sd-ep-btn dl" onclick="event.stopPropagation();downloadItem(\'' + ep.id + '\')"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M8 2v7"/><polyline points="5 7 8 10 11 7"/><line x1="3" y1="13" x2="13" y2="13"/></svg> Download</button>'
      + editBtn + '</div></div>';
  }).join('');
}

function selectSeason(sn) {
  _sdActiveSeason = +sn;
  document.querySelectorAll('.sd-season-item').forEach(el => {
    const n = el.querySelector('.sd-season-item-name');
    if (n) el.classList.toggle('active', parseInt(n.textContent.replace('Season ', '')) === +sn);
  });
  const lbl = document.getElementById('sd-season-label'); if (lbl) lbl.textContent = 'Season ' + sn;
  toggleSeasonMenu();
  renderSDEpisodes();
}

function toggleSeasonMenu() {
  const menu = document.getElementById('sd-season-menu');
  const chevron = document.getElementById('sd-chevron');
  if (!menu) return;
  const open = menu.classList.toggle('open');
  if (chevron) chevron.style.transform = open ? 'rotate(270deg)' : 'rotate(90deg)';
}

function toggleSeriesFav() {
  const btn = document.getElementById('sd-fav-btn');
  const key = (btn && btn.dataset.favkey) || ('series-' + _sdSname);
  const i = favs.indexOf(key);
  if (i >= 0) favs.splice(i, 1); else favs.push(key);
  const ico = document.getElementById('sd-fav-ico');
  if (ico) ico.innerHTML = '<use href="' + (favs.includes(key) ? '#i-heart-f' : '#i-heart') + '"/>';
  saveFavs();
}

// ── PLAY ─────────────────────────────────────────────────────
function playItem(id) {
  const m = allContent.find(c => c.id === id);
  if (!m) return;
  if (m.cat === 'series') { playEpisode(id); return; }
  curPlay = { type: 'movie', id };

  function safeSet(elId, val) { const el = document.getElementById(elId); if (el) el.textContent = val || ''; }
  function safeHtml(elId, val) { const el = document.getElementById(elId); if (el) el.innerHTML = val || ''; }

  const el = document.getElementById('pl-title'); if (el) el.textContent = m.title;
  safeSet('kp-top-title', m.title);
  safeSet('kp-top-ep', '');
  safeSet('pi-title', m.title);
  safeSet('pi-ep', '');
  safeSet('pi-meta', [m.vj, m.year, m.genre].filter(Boolean).join(' · '));
  safeHtml('pi-tags', buildTags(m.vj, m.cat, m.genre, m.year));

  const nav = document.getElementById('ep-nav'); if (nav) nav.style.display = 'none';
  setFavUI('item-' + id);
  buildPlayer(m.play);
  renderMoreLike(id, m.cat, m.vj);
  const po = document.getElementById('player-overlay');
  if (po) { po.classList.add('open'); po.scrollTop = 0; }
}

function playEpisode(id) {
  const ep = allContent.find(c => c.id === id); if (!ep) return;
  const sname = ep.seriesName || ep.title;
  const allEps = allContent.filter(c => c.cat === 'series' && (c.seriesName || c.title) === sname)
    .sort((a, b) => (a.season || 1) - (b.season || 1) || (a.epNum || 1) - (b.epNum || 1));
  const idx = allEps.findIndex(e => e.id === id);
  curPlay = { type: 'episode', id, sname, allEps, idx };

  function safeSet(elId, val) { const el = document.getElementById(elId); if (el) el.textContent = val || ''; }
  function safeHtml(elId, val) { const el = document.getElementById(elId); if (el) el.innerHTML = val || ''; }

  const lbl = 'Season ' + (ep.season || 1) + ' · Episode ' + (ep.epNum || 1);
  const pltEl = document.getElementById('pl-title'); if (pltEl) pltEl.textContent = sname + ' — ' + lbl;
  safeSet('kp-top-title', sname);
  safeSet('kp-top-ep', lbl);
  safeSet('pi-title', sname);
  safeSet('pi-ep', lbl + (ep.epTitle ? ' — ' + ep.epTitle : ''));
  safeSet('pi-meta', [ep.vj, ep.year, ep.genre].filter(Boolean).join(' · '));
  safeHtml('pi-tags', buildTags(ep.vj, 'series', ep.genre, ep.year));

  const nav = document.getElementById('ep-nav'); if (nav) nav.style.display = 'flex';
  safeSet('ep-nav-label', (idx + 1) + ' / ' + allEps.length);
  const prev = document.getElementById('ep-prev'); if (prev) prev.disabled = idx <= 0;
  const next = document.getElementById('ep-next'); if (next) next.disabled = idx >= allEps.length - 1;

  setFavUI('item-' + id);
  buildPlayer(ep.play);
  renderMoreLike(id, 'series', ep.vj);
  const po = document.getElementById('player-overlay');
  if (po) { po.classList.add('open'); po.scrollTop = 0; }
}

function playAdjacentEp(dir) {
  if (!curPlay || curPlay.type !== 'episode') return;
  const next = curPlay.allEps[curPlay.idx + dir];
  if (next) playEpisode(next.id);
}

function buildTags(vj, cat, genre, year) {
  let t = '';
  if (vj)    t += '<span class="pi-tag teal">' + vj + '</span>';
  if (cat)   t += '<span class="pi-tag">' + cat + '</span>';
  if (genre) t += '<span class="pi-tag">' + genre + '</span>';
  if (year)  t += '<span class="pi-tag">' + year + '</span>';
  return t;
}

// ── PLAYER BUILD ─────────────────────────────────────────────
function buildPlayer(url) {
  const box = document.getElementById('player-video');
  if (!box) return;
  box.innerHTML = '';

  if (!url) {
    box.innerHTML = '<div style="width:100%;height:100%;background:#0a0a0a;display:flex;align-items:center;justify-content:center;min-height:200px;color:#555;font-size:13px;text-align:center;padding:20px">No play link added yet.<br><br>Add an archive.org or .mp4 link in Admin.</div>';
    return;
  }

  // 1. Direct .mp4 / .webm / .m3u8
  if (/\.(mp4|webm|m3u8)(\?|$)/i.test(url)) {
    playNativeVideo(box, url);
    return;
  }

  // 2. archive.org
  if (url.includes('archive.org')) {
    if (url.includes('/download/') && /\.(mp4|webm|mkv|avi)(\?|$)/i.test(url)) {
      playNativeVideo(box, url);
      return;
    }
    const m = url.match(/archive\.org\/(?:details|download|embed)\/([^/?#\s]+)/);
    const itemId = m ? m[1] : null;
    if (itemId) {
      box.innerHTML = '<div id="kp-loading" style="width:100%;height:100%;background:#060608;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;min-height:200px">'
        + '<div style="width:46px;height:46px;border:3px solid #1a1a1a;border-top-color:#00e5c3;border-radius:50%;animation:spin .8s linear infinite"></div>'
        + '<div style="color:#666;font-size:12px;font-weight:600">Loading video...</div></div>';
      getArchiveDirectUrl(itemId).then(function(directUrl) {
        if (!document.getElementById('player-overlay') || !document.getElementById('player-overlay').classList.contains('open')) return;
        if (document.getElementById('kp-loading')) playNativeVideo(box, directUrl);
      }).catch(function() {
        playEmbed(box, 'https://archive.org/embed/' + itemId + '?autoplay=1&playlist=0');
        kpHideControls();
      });
      return;
    }
  }

  // 3. YouTube
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const m1 = url.match(/[?&]v=([^&]+)/), m2 = url.match(/youtu\.be\/([^?]+)/);
    const vid = (m1 && m1[1]) || (m2 && m2[1]);
    if (vid) { playEmbed(box, 'https://www.youtube.com/embed/' + vid + '?autoplay=1'); return; }
  }

  // 4. Fallback
  playNativeVideo(box, url);
}

function playNativeVideo(box, url) {
  box.innerHTML = ''
    + '<video id="kp-video" autoplay playsinline webkit-playsinline'
    + ' x5-playsinline x5-video-player-type="h5" x5-video-player-fullscreen="true"'
    + ' controls-list="nodownload" disablePictureInPicture'
    + ' style="width:100%;height:100%;background:#000;display:block;object-fit:contain;max-width:100%">'
    + '<source src="' + url + '" type="video/mp4"/>'
    + '<source src="' + url + '" type="video/webm"/>'
    + '<source src="' + url + '"/>'
    + '</video>';

  const v = box.querySelector('video');
  if (!v) return;
  v.removeAttribute('controls');

  v.addEventListener('error', function() {
    console.warn('Video error:', url);
    const itemId = (url.match(/archive\.org\/download\/([^/]+)/) || [])[1];
    if (itemId) {
      playEmbed(box, 'https://archive.org/embed/' + itemId + '?autoplay=1&playlist=0');
      kpHideControls();
    } else {
      box.innerHTML = '<div style="width:100%;height:100%;background:#0a0a0a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center">'
        + '<div style="font-size:32px">⚠️</div>'
        + '<div style="color:#ff6060;font-size:14px;font-weight:700">Video failed to load</div>'
        + '<div style="color:#555;font-size:11px;line-height:1.6">The video link may be expired or unavailable.<br>Try another movie or contact admin.</div>'
        + '<a href="' + url + '" target="_blank" style="color:#00e5c3;font-size:11px;margin-top:4px">Open direct link ↗</a>'
        + '</div>';
    }
  }, { once: true });

  v.addEventListener('loadedmetadata', kpUpdateTime);
  v.addEventListener('timeupdate', kpUpdateTime);
  v.addEventListener('play',  function() { kpSetPlayIcon(false); kpShowControls(); });
  v.addEventListener('pause', function() { kpSetPlayIcon(true);  kpShowControls(); });
  v.addEventListener('ended', function() { kpSetPlayIcon(true); });

  var playPromise = v.play();
  if (playPromise !== undefined) {
    playPromise.catch(function() { kpSetPlayIcon(true); kpShowControls(); });
  }
  kpShowControls();
}

function playEmbed(box, embedUrl) {
  box.innerHTML = '<iframe src="' + embedUrl
    + '" allowfullscreen allow="autoplay;fullscreen;picture-in-picture;encrypted-media"'
    + ' style="width:100%;height:100%;border:none;background:#000;display:block"></iframe>';
}

// ── getArchiveDirectUrl ───────────────────────────────────────
async function getArchiveDirectUrl(itemId) {
  if (_archiveCache[itemId]) return _archiveCache[itemId];
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
  const fetch_p = fetch('https://archive.org/metadata/' + itemId)
    .then(r => r.json())
    .then(data => {
      const files = data.files || [];
      const vid = files.find(f => /\.mp4$/i.test(f.name) && f.source === 'original')
               || files.find(f => /\.mp4$/i.test(f.name))
               || files.find(f => /\.mkv$/i.test(f.name))
               || files.find(f => /\.(webm|avi|mov)$/i.test(f.name));
      if (!vid) throw new Error('no video file found');
      const url = 'https://archive.org/download/' + itemId + '/' + encodeURIComponent(vid.name);
      _archiveCache[itemId] = url;
      return url;
    });
  return Promise.race([fetch_p, timeout]);
}

// ── CUSTOM PLAYER CONTROLS ───────────────────────────────────
let kpControlsTimer = null;
function kpGetVideo() { return document.getElementById('kp-video'); }

function kpShowControls() {
  const c = document.getElementById('kp-controls'); if (!c) return;
  c.classList.remove('hidden');
  clearTimeout(kpControlsTimer);
  kpControlsTimer = setTimeout(() => {
    const v = kpGetVideo();
    if (v && !v.paused) c.classList.add('hidden');
  }, 3000);
}
function kpHideControls() { const c = document.getElementById('kp-controls'); if (c) c.classList.add('hidden'); }

function kpTogglePlay() {
  const v = kpGetVideo(); if (!v) return;
  if (v.paused) v.play(); else v.pause();
  kpShowControls();
}

function kpSeek(secs) {
  const v = kpGetVideo(); if (!v) return;
  v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + secs));
  kpShowControls();
}

function kpSeekClick(e) {
  const v = kpGetVideo(); if (!v || !v.duration) return;
  const wrap = document.getElementById('kp-progress'); if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  v.currentTime = pct * v.duration;
  kpShowControls();
}

function kpUpdateTime() {
  const v = kpGetVideo(); if (!v) return;
  const cur = v.currentTime || 0, dur = v.duration || 0;
  const pct = dur > 0 ? (cur / dur) * 100 : 0;
  const fill  = document.getElementById('kp-prog-fill');  if (fill)  fill.style.width = pct + '%';
  const thumb = document.getElementById('kp-prog-thumb'); if (thumb) thumb.style.left = pct + '%';
  const time  = document.getElementById('kp-time');
  if (time) time.textContent = fmtTime(cur) + ' / ' + fmtTime(dur);
}

function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function kpSetPlayIcon(isPaused) {
  const ico = document.getElementById('kp-play-ico'); if (!ico) return;
  ico.innerHTML = isPaused
    ? '<polygon points="5,3 19,12 5,21"/>'
    : '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
}

function toggleQualityMenu() {}

// ── MORE LIKE THESE ──────────────────────────────────────────
function renderMoreLike(currentId, cat, vj) {
  const row = document.getElementById('more-row'); if (!row) return;
  let similar = allContent.filter(m => m.id !== currentId && m.cat === cat);
  const sameVJ = similar.filter(m => m.vj === vj);
  const others = similar.filter(m => m.vj !== vj);
  similar = [...sameVJ, ...others].slice(0, 15);
  if (cat === 'series') {
    const seen = {};
    similar = similar.filter(m => { const name = m.seriesName || m.title; if (seen[name]) return false; seen[name] = true; return true; });
  }
  if (!similar.length) { if (row.parentElement) row.parentElement.style.display = 'none'; return; }
  if (row.parentElement) row.parentElement.style.display = 'block';
  row.innerHTML = similar.map(m =>
    '<div class="more-card" onclick="openDetailOverlay(\'' + (m.cat==='series'?(m.seriesName||m.title).replace(/'/g,"\\'"):m.id) + '\',\'' + (m.cat==='series'?'series':'movie') + '\')">'
    + '<div class="more-poster">' + (m.thumb ? '<img src="' + m.thumb + '" loading="lazy" onerror="this.style.display=\'none\'"/>' : '') + '</div>'
    + '<div class="more-card-title">' + (m.seriesName || m.title) + '</div>'
    + '<div class="more-card-vj">' + (m.vj || '') + '</div></div>'
  ).join('');
}

// ── CLOSE PLAYER ─────────────────────────────────────────────
function closePlayer() {
  const v = kpGetVideo(); if (v) v.pause();
  const box = document.getElementById('player-video'); if (box) box.innerHTML = '';
  const po = document.getElementById('player-overlay'); if (po) po.classList.remove('open');
  document.body.style.overflow = '';
  kpHideControls();
  curPlay = null;
  const card = document.getElementById('pi-card'); if (card) card.style.display = 'none';
}

// ── DOWNLOADS ────────────────────────────────────────────────
const DL_KEY = 'kp_downloads';
function loadDlHistory() { try { dlHistory = JSON.parse(localStorage.getItem(DL_KEY) || '[]'); } catch(e) { dlHistory = []; } }
function saveDlHistory() { try { localStorage.setItem(DL_KEY, JSON.stringify(dlHistory)); } catch(e) {} }
function removeDownload(id) { dlHistory = dlHistory.filter(d => d.id !== id); saveDlHistory(); renderDownloadsPage(); }

async function getDirectMp4(itemId) {
  try {
    const url = await getArchiveDirectUrl(itemId);
    const name = decodeURIComponent(url.split('/').pop()) || itemId + '.mp4';
    return { url, name };
  } catch(e) { return null; }
}

async function downloadItem(id) {
  const m = allContent.find(c => c.id === id); if (!m) return;
  const rawUrl = m.dl || m.play;
  if (!rawUrl) { showToast('No download link for this movie yet', true); return; }
  showToast('Getting download link...');
  let finalUrl = rawUrl, fileName = (m.epTitle || m.title || 'movie').replace(/[^a-z0-9 .-]/gi, '_') + '.mp4';
  if (/\.mp4(\?|$)/i.test(rawUrl)) {
    finalUrl = rawUrl; const parts = rawUrl.split('/'); fileName = decodeURIComponent(parts[parts.length - 1]) || fileName;
  } else if (rawUrl.includes('archive.org')) {
    const archiveMatch = rawUrl.match(/archive\.org\/(?:details|download|embed)\/([^/?#/]+)/);
    if (archiveMatch) { const result = await getDirectMp4(archiveMatch[1]); if (result) { finalUrl = result.url; fileName = result.name; } }
  }
  const dlEntry = { id, title: m.epTitle || m.title, vj: m.vj || '', thumb: m.thumb || '', fileName, fileUrl: finalUrl, time: Date.now(), status: 'downloading', loaded: 0, total: 0, speed: 0 };
  dlHistory = dlHistory.filter(d => d.id !== id); dlHistory.unshift(dlEntry); saveDlHistory();
  showSection('downloads'); renderDownloadsPage();
  try {
    const res = await fetch(finalUrl); if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = parseInt(res.headers.get('content-length') || '0'); dlEntry.total = total;
    const reader = res.body.getReader(); const chunks = []; let loaded = 0, lastTime = Date.now(), lastLoaded = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      chunks.push(value); loaded += value.length; dlEntry.loaded = loaded;
      const now = Date.now();
      if (now - lastTime > 500) { dlEntry.speed = Math.round((loaded - lastLoaded) / ((now - lastTime) / 1000)); lastTime = now; lastLoaded = loaded; saveDlHistory(); renderDownloadsPage(); }
    }
    const blob = new Blob(chunks), blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = blobUrl; a.download = fileName; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(blobUrl); document.body.removeChild(a); }, 1000);
    dlEntry.status = 'done'; dlEntry.speed = 0; saveDlHistory(); renderDownloadsPage(); showToast((m.epTitle || m.title) + ' downloaded! 📥');
  } catch(e) {
    dlEntry.status = 'done'; saveDlHistory(); renderDownloadsPage();
    const a = document.createElement('a'); a.href = finalUrl; a.download = fileName; a.target = '_blank'; document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 500);
    showToast('Download started — check Downloads folder 📥');
  }
}

function downloadGate() {
  const id = curPlay ? curPlay.id : null;
  if (id) downloadItem(id); else showToast('Nothing playing', true);
}

// ── FAVOURITES ───────────────────────────────────────────────
function setFavUI(key) {
  const on = favs.includes(key);
  const ico = document.getElementById('fav-ico'); if (ico) ico.innerHTML = '<use href="' + (on ? '#i-heart-f' : '#i-heart') + '"/>';
  const txt = document.getElementById('fav-txt'); if (txt) txt.textContent = on ? 'In Favourites' : 'Add to Favourites';
  const btn = document.getElementById('pi-fav'); if (btn) { btn.classList.toggle('active', on); btn.dataset.key = key; }
}
function toggleFav() {
  const key = document.getElementById('pi-fav') && document.getElementById('pi-fav').dataset.key; if (!key) return;
  const i = favs.indexOf(key); if (i >= 0) favs.splice(i, 1); else favs.push(key);
  saveFavs(); setFavUI(key);
}
function renderFavs() {
  const ids = favs.map(k => k.replace('item-', ''));
  const list = allContent.filter(m => ids.includes(m.id));
  const g = document.getElementById('grid-favs'); if (!g) return;
  if (!list.length) { g.innerHTML = '<div class="empty-page" style="padding:30px">No favourites yet.</div>'; return; }
  g.innerHTML = list.map(m => movieCard(m)).join('');
}

// ── SEARCH ───────────────────────────────────────────────────
function openSearch() { const s = document.getElementById('search-overlay'); if(s) s.classList.add('open'); setTimeout(() => { const i = document.getElementById('search-input'); if(i) i.focus(); }, 100); }
function closeSearch() {
  const s = document.getElementById('search-overlay'); if(s) s.classList.remove('open');
  const i = document.getElementById('search-input'); if(i) i.value = '';
  const r = document.getElementById('search-results'); if(r) r.innerHTML = '<div class="search-empty">Start typing to search...</div>';
  const c = document.getElementById('s-clear-btn'); if(c) c.style.display = 'none';
}
function clearSearch() { const i = document.getElementById('search-input'); if(i) i.value = ''; const r = document.getElementById('search-results'); if(r) r.innerHTML = '<div class="search-empty">Start typing to search...</div>'; const c = document.getElementById('s-clear-btn'); if(c) c.style.display = 'none'; }
function setSF(el, f) {
  searchFilter = f; document.querySelectorAll('.sf-tab').forEach(t => t.classList.toggle('active', t.dataset.f === f));
  const i = document.getElementById('search-input'); doSearch(i ? i.value : '');
}
function doSearch(q) {
  const clr = document.getElementById('s-clear-btn'); if (clr) clr.style.display = q ? 'flex' : 'none';
  const g = document.getElementById('search-results'); if (!g) return;
  if (!q.trim()) { g.innerHTML = '<div class="search-empty">Start typing to search...</div>'; return; }
  const ql = q.toLowerCase();
  let list = allContent.filter(m =>
    (m.title || '').toLowerCase().includes(ql) || (m.vj || '').toLowerCase().includes(ql) ||
    (m.genre || '').toLowerCase().includes(ql) || (m.seriesName || '').toLowerCase().includes(ql) ||
    (m.epTitle || '').toLowerCase().includes(ql) || (m.desc || '').toLowerCase().includes(ql));
  if (searchFilter !== 'all') list = list.filter(m => m.cat === searchFilter);
  if (!list.length) { g.innerHTML = '<div class="search-empty">No results found.</div>'; return; }
  const seen = {}, deduped = [];
  list.forEach(m => { if (m.cat === 'series') { const sn = m.seriesName || m.title; if (!seen[sn]) { seen[sn] = true; deduped.push({ ...m, _isSeriesGroup: true, _sname: sn }); } } else deduped.push(m); });
  g.innerHTML = '<div class="search-count">' + deduped.length + ' result' + (deduped.length !== 1 ? 's' : '') + '</div><div class="search-grid">' + deduped.map(m => movieCard(m)).join('') + '</div>';
}

// ── STATS ────────────────────────────────────────────────────
function updateStats() {
  const safeSet = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  safeSet('st-total',  allContent.length);
  safeSet('st-movies', allContent.filter(m => m.cat === 'movie').length);
  safeSet('st-series', [...new Set(allContent.filter(m => m.cat === 'series').map(m => m.seriesName || m.title))].length);
  safeSet('st-anim',   allContent.filter(m => m.cat === 'animation').length);
}

// ── SECRET TAP ───────────────────────────────────────────────
function secretTap() {
  secretCount++;
  const el = document.getElementById('secret-count');
  if (el) { el.style.color = secretCount >= 5 ? 'var(--teal)' : 'transparent'; el.textContent = secretCount; }
  clearTimeout(secretTimer);
  if (secretCount >= 7) {
    secretCount = 0;
    if (el) { el.style.color = 'transparent'; el.textContent = '0'; }
    if (!adminUnlocked) goAdmin(); else { adminUnlocked = false; localStorage.removeItem(ADMIN_KEY); hideAdmin(); showToast('Admin hidden'); }
    return;
  }
  secretTimer = setTimeout(() => { secretCount = 0; if (el) { el.style.color = 'transparent'; el.textContent = '0'; } }, 2500);
}
function revealAdmin() {
  const ab = document.getElementById('admin-btn'); if(ab) ab.style.display = 'flex';
  const lb = document.getElementById('lock-btn'); if(lb) lb.style.display = 'none';
  const sb = document.getElementById('snav-admin'); if(sb) sb.style.display = 'flex';
  renderComingSoon();
}
function hideAdmin() {
  const ab = document.getElementById('admin-btn'); if(ab) ab.style.display = 'none';
  const lb = document.getElementById('lock-btn'); if(lb) lb.style.display = 'flex';
  const sb = document.getElementById('snav-admin'); if(sb) sb.style.display = 'none';
}

// ── ADMIN PIN ────────────────────────────────────────────────
function goAdmin() {
  if (adminUnlocked) { showSection('admin'); return; }
  openModal('pin-modal');
  const inp = document.getElementById('pin-inp'); if(inp) inp.value = '';
  const err = document.getElementById('pin-err'); if(err) err.textContent = '';
  setTimeout(() => { const i = document.getElementById('pin-inp'); if(i) i.focus(); }, 150);
}
function openPinModal() { goAdmin(); }
function checkPin() {
  const inp = document.getElementById('pin-inp'); if(!inp) return;
  if (inp.value === getAdminPass()) {
    closeModal('pin-modal');
    adminUnlocked = true;
    localStorage.setItem(ADMIN_KEY, '1');
    revealAdmin();
    showSection('admin');
  } else {
    const err = document.getElementById('pin-err'); if(err) err.textContent = 'Wrong password.';
    inp.value = ''; inp.focus();
  }
}
function togglePwEye() {
  const inp = document.getElementById('pin-inp'); if(!inp) return;
  const ico = document.getElementById('eye-ico');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (ico) ico.innerHTML = '<use href="' + (inp.type === 'password' ? '#i-eye' : '#i-x') + '"/>';
}

// ── ADMIN FORM ───────────────────────────────────────────────
function setCat(el, cat) {
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const fc = document.getElementById('f-cat'); if(fc) fc.value = cat;
  const sf = document.getElementById('series-only-fields'); if(sf) sf.style.display = cat === 'series' ? 'flex' : 'none';
  const tl = document.getElementById('title-label'); if(tl) tl.textContent = cat === 'series' ? 'Episode Title' : cat === 'animation' ? 'Animation Title' : 'Movie Title';
}

// ── FIX: Turn off autocomplete on admin inputs on page load ──
function disableAdminAutocomplete() {
  const ids = ['f-title','f-series-name','f-genre','f-year','f-thumb','f-play','f-dl','f-desc'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.setAttribute('autocomplete', 'off');
      el.setAttribute('autocorrect', 'off');
      el.setAttribute('autocapitalize', 'off');
      el.setAttribute('spellcheck', 'false');
      // Clear any browser-prefilled value on focus
      el.addEventListener('focus', function() {
        if (this.value && !editingId && this.dataset.userTyped !== '1') this.value = '';
      });
      el.addEventListener('input', function() { this.dataset.userTyped = '1'; });
    }
  });
  // Also clear the whole form when switching to Upload tab or after save
  const form = document.querySelector('.upload-form');
  if (form) form.setAttribute('autocomplete', 'off');
}

function previewThumb(url) {
  const wrap = document.getElementById('thumb-preview'), img = document.getElementById('thumb-preview-img');
  if (!wrap || !img) return;
  if (url && url.startsWith('http')) {
    img.src = url; img.onload = () => wrap.style.display = 'block'; img.onerror = () => wrap.style.display = 'none';
  } else wrap.style.display = 'none';
}

function previewDlLink(val) {
  const hint = document.getElementById('dl-link-hint'); if (!hint) return;
  if (!val) { hint.style.color = 'var(--muted)'; hint.textContent = 'Paste direct .mp4 URL from archive.org'; return; }
  if (/\.mp4(\?|$)/i.test(val)) { hint.style.color = 'var(--teal)'; hint.textContent = '✓ Good — direct .mp4 link detected'; }
  else if (val.includes('archive.org/details')) { hint.style.color = '#ff9800'; hint.textContent = '⚠ Use archive.org/download/... not /details/'; }
  else { hint.style.color = 'var(--muted2)'; hint.textContent = 'Custom URL'; }
}

async function submitContent() {
  const fTitle = document.getElementById('f-title'), fPlay = document.getElementById('f-play'), fCat = document.getElementById('f-cat');
  const title = fTitle ? fTitle.value.trim() : '', play = fPlay ? fPlay.value.trim() : '', cat = fCat ? fCat.value : 'movie';
  if (!title) { showToast('Enter a title', true); return; }
  const btn = document.getElementById('submit-btn'), lbl = document.getElementById('submit-label');
  if(btn) btn.disabled = true; if(lbl) lbl.textContent = 'Saving...';
  try {
    const fThumb = document.getElementById('f-thumb'), fVj = document.getElementById('f-vj'), fYear = document.getElementById('f-year'), fGenre = document.getElementById('f-genre'), fDesc = document.getElementById('f-desc'), fDl = document.getElementById('f-dl');
    const data = {
      title, cat, play,
      vj: fVj ? fVj.value : '', year: fYear ? fYear.value.trim() : '', genre: fGenre ? fGenre.value.trim() : '',
      desc: fDesc ? fDesc.value.trim() : '', dl: fDl ? fDl.value.trim() : '', thumb: fThumb ? fThumb.value.trim() : '',
      updatedAt: Date.now()
    };
    const fSn = document.getElementById('f-series-name'), fSeason = document.getElementById('f-season'), fEp = document.getElementById('f-epnum');
    if (cat === 'series') {
      data.seriesName = fSn ? (fSn.value.trim() || title) : title;
      data.season = fSeason ? (parseInt(fSeason.value) || 1) : 1;
      data.epNum = fEp ? (parseInt(fEp.value) || 1) : 1;
      data.epTitle = title;
    }
    const editIdEl = document.getElementById('edit-id'), editId = editIdEl ? editIdEl.value : '';
    if (editId) {
      if (editId.startsWith('legacy-')) {
        data.createdAt = Date.now();
        const { collection, addDoc, doc: fbDoc, getDoc, updateDoc } = window._fb;
        await addDoc(collection(window._db, 'content'), data);
        const ref = fbDoc(window._db, 'settings', 'movies'), snap = await getDoc(ref);
        if (snap.exists()) { const raw = snap.data(), list = raw.list || raw.movies || []; list.splice(parseInt(editId.replace('legacy-', '')), 1); await updateDoc(ref, { list }); }
      } else {
        const { doc: fbDoc, updateDoc } = window._fb;
        await updateDoc(fbDoc(window._db, 'content', editId), data);
      }
      showToast('Updated!'); cancelEdit();
    } else {
      // ── FIX: always set createdAt to current timestamp so Latest sorts correctly
      data.createdAt = Date.now();
      const { collection, addDoc } = window._fb;
      await addDoc(collection(window._db, 'content'), data);
      showToast('✓ Added: ' + title);
      if (cat === 'series') {
        if(fEp) fEp.value = (parseInt(fEp.value) || 1) + 1;
        if(fTitle) { fTitle.value = ''; fTitle.dataset.userTyped = '0'; }
        const fd = document.getElementById('f-desc'); if(fd) { fd.value = ''; fd.dataset.userTyped = '0'; }
      } else {
        resetUploadForm();
      }
    }
  } catch(err) { showToast('Error: ' + err.message, true); }
  finally { if(btn) btn.disabled = false; if(lbl) lbl.textContent = editingId ? 'Save Changes' : 'Add to Library'; }
}

function startEdit(id) {
  const m = allContent.find(c => c.id === id); if (!m) return;
  editingId = id; showSection('admin');
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === m.cat));
  const fc = document.getElementById('f-cat'); if(fc) fc.value = m.cat;
  const sf = document.getElementById('series-only-fields'); if(sf) sf.style.display = m.cat === 'series' ? 'flex' : 'none';
  const ei = document.getElementById('edit-id'); if(ei) ei.value = id;
  const setV = (id, v) => { const el = document.getElementById(id); if(el) { el.value = v || ''; el.dataset.userTyped = '1'; } };
  setV('f-title', m.epTitle || m.title || '');
  setV('f-vj', m.vj); setV('f-year', m.year); setV('f-genre', m.genre); setV('f-desc', m.desc);
  setV('f-play', m.play); setV('f-dl', m.dl); setV('f-thumb', m.thumb);
  if (m.cat === 'series') { setV('f-series-name', m.seriesName); setV('f-season', m.season || 1); setV('f-epnum', m.epNum || 1); }
  if (m.thumb) previewThumb(m.thumb);
  const fml = document.getElementById('form-mode-label'); if(fml) fml.textContent = 'Edit Content';
  const ceb = document.getElementById('cancel-edit-btn'); if(ceb) ceb.style.display = 'inline-block';
  const sl = document.getElementById('submit-label'); if(sl) sl.textContent = 'Save Changes';
  const c = document.getElementById('content'); if(c) c.scrollTop = 0;
}

function cancelEdit() {
  editingId = null; resetUploadForm();
  const fml = document.getElementById('form-mode-label'); if(fml) fml.textContent = 'Add Content';
  const ceb = document.getElementById('cancel-edit-btn'); if(ceb) ceb.style.display = 'none';
  const sl = document.getElementById('submit-label'); if(sl) sl.textContent = 'Add to Library';
}

function resetUploadForm() {
  const ids = ['f-title','f-vj','f-year','f-genre','f-desc','f-play','f-dl','f-series-name','f-thumb'];
  ids.forEach(id => { const el = document.getElementById(id); if(el) { el.value = ''; el.dataset.userTyped = '0'; } });
  const fs = document.getElementById('f-season'); if(fs) fs.value = '1';
  const fe = document.getElementById('f-epnum'); if(fe) fe.value = '1';
  const fc = document.getElementById('f-cat'); if(fc) fc.value = 'movie';
  const tp = document.getElementById('thumb-preview'); if(tp) tp.style.display = 'none';
  const sf = document.getElementById('series-only-fields'); if(sf) sf.style.display = 'none';
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === 'movie'));
  const tl = document.getElementById('title-label'); if(tl) tl.textContent = 'Title';
  const ei = document.getElementById('edit-id'); if(ei) ei.value = '';
}

function askDelete(id) {
  const m = allContent.find(c => c.id === id); if (!m) return;
  pendingDelId = id;
  const sub = document.getElementById('del-modal-sub'); if(sub) sub.textContent = 'Delete "' + (m.epTitle || m.title) + '"? This cannot be undone.';
  openModal('del-modal');
}
async function confirmDelete() {
  if (!pendingDelId) return;
  closeModal('del-modal');
  try {
    if (pendingDelId.startsWith('legacy-')) {
      const { doc: fbDoc, getDoc, updateDoc } = window._fb;
      const ref = fbDoc(window._db, 'settings', 'movies'), snap = await getDoc(ref);
      if (snap.exists()) { const raw = snap.data(), list = raw.list || raw.movies || []; list.splice(parseInt(pendingDelId.replace('legacy-', '')), 1); await updateDoc(ref, { list }); }
    } else { const { doc: fbDoc, deleteDoc } = window._fb; await deleteDoc(fbDoc(window._db, 'content', pendingDelId)); }
    favs = favs.filter(f => f !== 'item-' + pendingDelId); saveFavs();
    if (editingId === pendingDelId) cancelEdit();
    showToast('Deleted.');
  } catch(err) { showToast('Error: ' + err.message, true); }
  pendingDelId = null;
}

// ── LIBRARY ──────────────────────────────────────────────────
function setLibFilter(el, f) {
  libFilter = f;
  document.querySelectorAll('.lib-tab').forEach(t => t.classList.toggle('active', t.dataset.f === f));
  renderLib();
}
function renderLib() {
  const el = document.getElementById('lib-list'); if(!el) return;
  let list = libFilter === 'all' ? allContent : allContent.filter(m => m.cat === libFilter);
  const cnt = document.getElementById('lib-count'); if(cnt) cnt.textContent = list.length + ' item' + (list.length !== 1 ? 's' : '');
  if (!list.length) { el.innerHTML = '<div class="empty-msg">Nothing here yet.</div>'; return; }
  el.innerHTML = list.map(m =>
    '<div class="lib-pcard">'
    + '<div class="lib-poster">' + (m.thumb ? '<img src="' + m.thumb + '" onerror="this.style.display=\'none\'"/>' : '<div class="lib-poster-empty">' + (m.epTitle || m.title) + '</div>') + '</div>'
    + '<div class="lib-card-title">' + (m.cat === 'series' ? '<span style="color:var(--teal);font-size:7px">' + (m.seriesName || '') + ' S' + (m.season || 1) + 'E' + (m.epNum || 1) + ' · </span>' : '') + (m.epTitle || m.title) + '</div>'
    + (m.vj ? '<div class="lib-card-vj">' + m.vj + '</div>' : '')
    + '<button class="lib-edit" onclick="event.stopPropagation();startEdit(\'' + m.id + '\')">E</button>'
    + '<button class="lib-del"  onclick="event.stopPropagation();askDelete(\'' + m.id + '\')">&#215;</button>'
    + '</div>'
  ).join('');
}

// ── MODALS ───────────────────────────────────────────────────
function openModal(id)  { const el = document.getElementById(id); if(el) el.classList.add('open'); }
function closeModal(id) { const el = document.getElementById(id); if(el) el.classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); }));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    const po = document.getElementById('player-overlay'); if (po && po.classList.contains('open')) closePlayer();
    const so = document.getElementById('search-overlay'); if (so && so.classList.contains('open')) closeSearch();
  }
});

// ── TOAST ────────────────────────────────────────────────────
function showToast(msg, isErr = false) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1c1c1c;color:#f0f0f0;border:1px solid rgba(255,255,255,.1);border-radius:99px;padding:10px 20px;font-size:12px;font-weight:700;z-index:9999;white-space:nowrap;pointer-events:none;transition:opacity .3s'; document.body.appendChild(t); }
  t.textContent = msg;
  t.style.borderColor = isErr ? 'rgba(255,68,68,.4)' : 'rgba(0,229,195,.3)';
  t.style.color = isErr ? '#ff7070' : '#f0f0f0';
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => t.style.opacity = '0', 3000);
}

// ── DOWNLOADS PAGE ───────────────────────────────────────────
function fmtBytes(b) { if (!b) return '0 B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
function fmtSpeed(s) { if (!s) return ''; if (s < 1048576) return (s / 1024).toFixed(0) + ' KB/s'; return (s / 1048576).toFixed(1) + ' MB/s'; }

function renderDownloadsPage() {
  const list = document.getElementById('dl-movie-list'), count = document.getElementById('dl-page-count');
  if (!list) return;
  const active = dlHistory.filter(d => d.status === 'downloading').length, done = dlHistory.filter(d => d.status === 'done').length;
  if (count) count.textContent = active ? active + ' active · ' + done + ' completed' : (done ? done + ' completed' : '');
  if (!dlHistory.length) {
    list.innerHTML = '<div class="dl-empty"><div class="dl-empty-title">No downloads yet</div><div class="dl-empty-desc">Tap Download on any movie to start</div></div>'; return;
  }
  list.innerHTML = dlHistory.map(d => {
    const isDone = d.status === 'done', pct = d.total > 0 ? Math.round((d.loaded / d.total) * 100) : (isDone ? 100 : 0);
    return '<div class="dl-item ' + (isDone ? 'done' : 'active') + '">'
      + '<div class="dl-item-thumb">' + (d.thumb ? '<img src="' + d.thumb + '" onerror="this.style.display=\'none\'"/>' : '') + (isDone ? '<div class="dl-done-check">✓</div>' : '') + '</div>'
      + '<div class="dl-item-info"><div class="dl-item-title">' + (d.title || 'Unknown') + '</div>'
      + '<div class="dl-item-sub">' + (d.vj || '') + '</div>'
      + '<div class="dl-item-filename">' + (d.fileName || '') + '</div>'
      + (!isDone ? '<div class="dl-progress-wrap"><div class="dl-progress-bar" style="width:' + pct + '%"></div></div><div class="dl-progress-info"><span>' + fmtBytes(d.loaded) + (d.total ? ' / ' + fmtBytes(d.total) : '') + '</span><span>' + pct + '%</span>' + (d.speed ? '<span>' + fmtSpeed(d.speed) + '</span>' : '') + '</div><span class="dl-status-badge active">Downloading</span>' : '<span class="dl-status-badge done">Completed</span>')
      + '</div><div class="dl-item-actions">'
      + (isDone ? '<button class="dl-open-btn" onclick="window.open(\'' + d.fileUrl + '\',\'_blank\')">Open</button>' : '')
      + '<button class="dl-remove-btn" onclick="removeDownload(\'' + d.id + '\')">✕</button></div></div>';
  }).join('');
}

// ── SEE ALL ──────────────────────────────────────────────────
function showSeeAll(label) {
  let items = VJS.includes(label) ? allContent.filter(m => m.vj === label) : allContent.filter(m => (m.seriesName || m.title) === label || m.vj === label);
  const seen = {}, deduped = [];
  items.forEach(m => { if (m.cat === 'series') { const sn = m.seriesName || m.title; if (!seen[sn]) { seen[sn] = true; deduped.push({ ...m, _isSeriesGroup: true, _sname: sn }); } } else deduped.push(m); });
  let overlay = document.getElementById('see-all-overlay');
  if (!overlay) { overlay = document.createElement('div'); overlay.id = 'see-all-overlay'; overlay.className = 'see-all-overlay'; document.body.appendChild(overlay); }
  overlay.innerHTML = '<div class="see-all-header"><button class="see-all-back" onclick="closeSeeAll()"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button><span class="see-all-title">' + label + '</span><span class="see-all-count">' + deduped.length + ' title' + (deduped.length !== 1 ? 's' : '') + '</span></div><div class="see-all-grid">' + deduped.map(m => movieCard(m)).join('') + '</div>';
  overlay.classList.add('open');
}
function closeSeeAll() { const o = document.getElementById('see-all-overlay'); if (o) o.classList.remove('open'); }

// ── UPCOMING / COMING SOON ───────────────────────────────────
const CS_KEY = 'kp_coming_soon';
function loadCS() { try { comingSoon = JSON.parse(localStorage.getItem(CS_KEY) || '[]'); } catch(e) { comingSoon = []; } }
function saveCS() { try { localStorage.setItem(CS_KEY, JSON.stringify(comingSoon)); } catch(e) {} }

function renderComingSoon() {
  renderUpcomingTicker();
}

function renderUpcomingTicker() {
  const ticker = document.getElementById('upcoming-ticker'), track = document.getElementById('ticker-track');
  const rowBlock = document.getElementById('upcoming-row-block'), cardsRow = document.getElementById('upcoming-cards-row');
  const addBtn = document.getElementById('upcoming-add-btn');
  if (addBtn) addBtn.style.display = adminUnlocked ? 'flex' : 'none';
  if (!comingSoon.length) { if (ticker) ticker.style.display = 'none'; if (rowBlock) rowBlock.style.display = 'none'; return; }
  if (ticker && track) {
    ticker.style.display = 'flex';
    const items = [...comingSoon, ...comingSoon];
    track.innerHTML = items.map(c => '<span class="ticker-item">' + c.title + (c.date ? ' — ' + c.date : '') + '</span>').join('');
    track.style.animationDuration = Math.max(15, comingSoon.length * 6) + 's';
  }
  if (rowBlock && cardsRow) {
    rowBlock.style.display = 'block';
    cardsRow.innerHTML = comingSoon.map((c, i) =>
      '<div class="pcard"><div class="pcard-poster">' + (c.thumb ? '<img src="' + c.thumb + '" loading="lazy" onerror="this.style.display=\'none\'"/>' : '') + '<div class="pcard-vj-tag">Soon</div></div><div class="pcard-label"><div class="pcard-title">' + c.title + '</div>' + (c.date ? '<div class="pcard-sub">' + c.date + '</div>' : '') + (adminUnlocked ? '</div><button class="upload-btn" style="margin-top:4px;padding:5px;font-size:9px" onclick="removeCS(' + i + ')">✕ Remove</button>' : '</div>') + '</div>'
    ).join('');
  }
}

function openCSAdmin() { openModal('cs-modal'); }
function addComingSoon() {
  const t = document.getElementById('cs-title-inp'), th = document.getElementById('cs-thumb-inp'), d = document.getElementById('cs-date-inp');
  if (!t || !t.value.trim()) { showToast('Enter a title', true); return; }
  comingSoon.push({ title: t.value.trim(), thumb: th ? th.value.trim() : '', date: d ? d.value.trim() : '' });
  saveCS(); renderComingSoon(); closeModal('cs-modal');
  if(t) t.value = ''; if(th) th.value = ''; if(d) d.value = '';
  showToast('Added!');
}
function removeCS(i) { comingSoon.splice(i, 1); saveCS(); renderComingSoon(); }

// ── SUBSCRIBERS ──────────────────────────────────────────────
const SUB_KEY = 'kp_subscribers';
function loadSubs() { try { subscribers = JSON.parse(localStorage.getItem(SUB_KEY) || '[]'); } catch(e) { subscribers = []; } }
function saveSubs() { try { localStorage.setItem(SUB_KEY, JSON.stringify(subscribers)); } catch(e) {} }
function addSubscriber() {
  const name = document.getElementById('sub-name'), phone = document.getElementById('sub-phone'), plan = document.getElementById('sub-plan');
  if (!name || !name.value.trim() || !phone || !phone.value.trim()) { showToast('Enter name and phone', true); return; }
  const months = plan && plan.value === 'yearly' ? 12 : plan && plan.value === '3months' ? 3 : 1;
  subscribers.push({ id: Date.now(), name: name.value.trim(), phone: phone.value.trim(), plan: plan ? plan.value : 'monthly', joined: Date.now(), expires: Date.now() + months * 30 * 24 * 60 * 60 * 1000 });
  saveSubs(); name.value = ''; phone.value = ''; renderSubs(); showToast('Subscriber added!');
}
function deleteSubscriber(id) { subscribers = subscribers.filter(s => s.id !== id); saveSubs(); renderSubs(); }
function renderSubs() {
  const el = document.getElementById('sub-list'); if (!el) return;
  if (!subscribers.length) { el.innerHTML = '<div class="empty-msg">No subscribers yet.</div>'; return; }
  const now = Date.now();
  el.innerHTML = subscribers.map(s => {
    const isActive = s.expires > now, expDate = new Date(s.expires).toLocaleDateString();
    const planLabel = s.plan === 'yearly' ? 'Yearly' : s.plan === '3months' ? '3 Months' : 'Monthly';
    const phone = s.phone.replace(/\D/g, '');
    return '<div class="sub-item"><div class="sub-info"><div class="sub-name">' + s.name + '</div><div class="sub-phone">' + s.phone + ' · ' + planLabel + '</div><div class="sub-date">' + (isActive ? 'Expires' : 'Expired') + ': ' + expDate + '</div></div>'
      + '<span class="sub-badge ' + (isActive ? 'active' : 'expired') + '">' + (isActive ? 'Active' : 'Expired') + '</span>'
      + '<button class="sub-wa-btn" onclick="window.open(\'https://wa.me/' + phone + '\',\'_blank\')"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg> Chat</button>'
      + '<button class="sub-del-btn" onclick="deleteSubscriber(' + s.id + ')"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button></div>';
  }).join('');
}

// ── PAYMENTS ─────────────────────────────────────────────────
const PAY_KEY = 'kp_payments';
function loadPayments() { try { payments = JSON.parse(localStorage.getItem(PAY_KEY) || '[]'); } catch(e) { payments = []; } }
function savePayments() { try { localStorage.setItem(PAY_KEY, JSON.stringify(payments)); } catch(e) {} }
function approvePayment(id) {
  const p = payments.find(p => p.id === id); if (!p) return;
  p.status = 'approved'; savePayments();
  const months = p.plan === 'yearly' ? 12 : p.plan === '3months' ? 3 : 1;
  subscribers.push({ id: Date.now(), name: p.name, phone: p.phone, plan: p.plan, joined: Date.now(), expires: Date.now() + months * 30 * 24 * 60 * 60 * 1000 });
  saveSubs(); renderPayments(); renderSubs(); showToast(p.name + ' approved!');
}
function rejectPayment(id) { const p = payments.find(p => p.id === id); if (!p) return; p.status = 'rejected'; savePayments(); renderPayments(); showToast('Payment rejected.'); }
function renderPayments() {
  const el = document.getElementById('pay-list'); if (!el) return;
  if (!payments.length) { el.innerHTML = '<div class="empty-msg">No payment requests yet.</div>'; return; }
  const sorted = [...payments].sort((a, b) => b.time - a.time);
  el.innerHTML = sorted.map(p => {
    const planLabel = p.plan === 'yearly' ? 'Yearly' : p.plan === '3months' ? '3 Months' : 'Monthly';
    return '<div class="pay-item ' + p.status + '"><div class="pay-row"><div class="pay-name">' + p.name + '</div><span class="pay-plan">' + planLabel + '</span></div><div class="pay-phone">' + p.phone + '</div><div class="pay-txn">TXN: ' + p.txn + '</div><div class="pay-time">' + new Date(p.time).toLocaleString() + '</div>'
      + (p.status === 'pending' ? '<div class="pay-status-row"><button class="pay-approve" onclick="approvePayment(' + p.id + ')">✓ Approve</button><button class="pay-reject" onclick="rejectPayment(' + p.id + ')">✗ Reject</button></div>' : '<span class="pay-badge ' + p.status + '">' + p.status + '</span>')
      + '</div>';
  }).join('');
}

// ── CHANGE PASSWORD ──────────────────────────────────────────
function openChangePass() {
  openModal('change-pass-modal');
  ['cp-current','cp-new','cp-confirm'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  const err = document.getElementById('cp-err'); if(err) err.textContent = '';
}
function submitChangePass() {
  const cur = document.getElementById('cp-current'), np = document.getElementById('cp-new'), conf = document.getElementById('cp-confirm'), err = document.getElementById('cp-err');
  if (!cur || !np || !conf) return;
  if (cur.value !== getAdminPass()) { if(err) err.textContent = 'Current password is wrong.'; return; }
  if (!np.value || np.value.length < 4) { if(err) err.textContent = 'New password must be at least 4 characters.'; return; }
  if (np.value !== conf.value) { if(err) err.textContent = 'Passwords do not match.'; return; }
  setAdminPass(np.value); closeModal('change-pass-modal'); showToast('Password changed successfully!');
}

// ── HERO / AUTO STRIP ────────────────────────────────────────
function initAutoStrip() {
  const movies = allContent.filter(m => m.thumb);
  if (!movies.length) return;
  const shuffled = [...movies].sort(() => Math.random() - 0.5);
  const strip1Items = [...shuffled, ...shuffled];
  const strip2Items = [...shuffled].reverse();
  const strip2Double = [...strip2Items, ...strip2Items];

  function buildStrip(items) {
    return items.map(m => {
      const click = m.cat === 'series'
        ? "openDetailOverlay('" + (m.seriesName || m.title).replace(/'/g, "\\'") + "','series')"
        : "openDetailOverlay('" + m.id + "','movie')";
      return '<div class="strip-card" onclick="' + click + '">'
        + (m.thumb ? '<img src="' + m.thumb + '" loading="lazy" onerror="this.style.display=\'none\'"/>' : '')
        + '</div>';
    }).join('');
  }

  const s1 = document.getElementById('auto-strip-1');
  const s2 = document.getElementById('auto-strip-2');
  if (s1) s1.innerHTML = buildStrip(strip1Items);
  if (s2) s2.innerHTML = buildStrip(strip2Double);

  // Also set hero-bg to a random movie poster for the blurred background
  const heroBg = document.getElementById('hero-bg');
  if (heroBg && movies.length) {
    const pick = movies[Math.floor(Math.random() * Math.min(movies.length, 10))];
    if (pick.thumb) heroBg.style.backgroundImage = "url('" + pick.thumb + "')";
  }

  // Update hero text with latest movie
  const latest = allContent.find(m => m.thumb);
  if (latest) {
    const titleEl = document.getElementById('hero-title');
    const metaEl  = document.getElementById('hero-meta');
    if (titleEl) titleEl.textContent = latest.seriesName || latest.title || 'KENMOVIES';
    if (metaEl)  metaEl.textContent  = [latest.vj, latest.genre, latest.year].filter(Boolean).join(' · ') || 'Free Ugandan movies and series';
  }
}

function initHero() { initAutoStrip(); }
function updateHero() {}
function heroGoTo() {}
function heroClick() {
  // Click hero → open latest movie detail
  const latest = allContent.find(m => m.thumb);
  if (latest && window.openDetailOverlay) {
    if (latest.cat === 'series') window.openDetailOverlay(latest.seriesName || latest.title, 'series');
    else window.openDetailOverlay(latest.id, 'movie');
  }
}

// ── INIT ─────────────────────────────────────────────────────
loadLocal(); loadDlHistory(); loadCS(); loadSubs(); loadPayments();

// Disable autocomplete on admin inputs after DOM ready
document.addEventListener('DOMContentLoaded', function() {
  disableAdminAutocomplete();
});

startFirebase(); showSection('home');
