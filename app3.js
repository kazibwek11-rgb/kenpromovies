// ============================================================
//  KENMOVIES — app.js v3.3
//  VJ rows • Horizontal scroll • Search overlay • Admin edit only
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
const FAVS_KEY   = 'kp_favs';
const ADMIN_KEY  = 'kp_admin';

const VJS = ['VJ Junior','VJ Emmy','VJ Ice P','VJ Sammy','VJ Little T','VJ Jingo','VJ ULIO','VJ HD','VJ SMK','VJ KEVO','VJ UNCLE T','VJ KISULE','VJ SHIELD','VJ MARK','VJ MOON','VJ KEVIN','VJ HEAVY Q','VJ KRISS SWEET','VJ SHAO KHAN','VJ MOSCO','VJ MUBA','VJ RONNIE','VJ IVO','VJ TONNY','VJ KS','VJ TOM','VJ SOUL','VJ NELLY','VJ BANKS','VJ RYAN','VJ KIMULI','VJ MOX'];

let comingSoon = [];
let dlHistory  = [];
let subscribers = [];
let payments   = [];
let carouselIdx = 0;
let carouselTimer = null;

let allContent   = [];
let favs         = [];
let curPlay      = null;
let curSection   = 'home';
let adminUnlocked = false;
let secretCount  = 0;
let secretTimer  = null;
let searchFilter = 'all';
let libFilter    = 'all';
let editingId    = null;
let pendingDelId = null;
let deferredInstall = null;

// ── PWA ──────────────────────────────────────────────────────
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstall = e;
  const b = document.getElementById('install-btn');
  if (b) { b.style.display = 'flex'; b.classList.add('highlight'); }
  // Show install banner
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

// ── Local storage ─────────────────────────────────────────────
function loadLocal() {
  try { favs = JSON.parse(localStorage.getItem(FAVS_KEY) || '[]'); } catch(e) { favs = []; }
  adminUnlocked = localStorage.getItem(ADMIN_KEY) === '1';
  if (adminUnlocked) revealAdmin();
}
function saveFavs() { try { localStorage.setItem(FAVS_KEY, JSON.stringify(favs)); } catch(e){} }

// ── Firebase listener ─────────────────────────────────────────
function startFirebase() {
  if (!window._fbReady) { document.addEventListener('fb-ready', startFirebase, { once:true }); return; }
  const { collection, onSnapshot, orderBy, query, doc } = window._fb;
  const db = window._db;
  let newC = [], oldC = [], newDone = false, oldDone = false;

  function merge() {
    if (!newDone || !oldDone) return;
    const combined = [...oldC];
    newC.forEach(n => { if (!combined.find(o => o.id === n.id)) combined.push(n); });
    allContent = combined;
    renderAll();
  }

  // New content collection
  onSnapshot(query(collection(db,'content'), orderBy('createdAt','desc')), snap => {
    newC = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    newDone = true; merge();
  }, err => { console.warn('content:', err.code); newDone = true; merge(); });

  // Legacy settings/movies
  onSnapshot(doc(db,'settings','movies'), snap => {
    if (snap.exists()) {
      const raw = snap.data();
      const list = raw.list || raw.movies || [];
      oldC = list.map((m,i) => ({
        id:'legacy-'+i, title:m.title||m.name||'Untitled',
        cat:m.cat||(m.seriesName?'series':'movie'),
        vj:m.vj||m.VJ||'', genre:m.genre||'', year:m.year||'',
        desc:m.desc||m.description||'',
        thumb:m.thumb||m.thumbnail||m.poster||'',
        play:m.play||m.playLink||m.link||m.url||'',
        dl:m.dl||m.dlLink||m.downloadLink||'',
        seriesName:m.seriesName||'', season:m.season||1,
        epNum:m.epNum||m.episode||1, epTitle:m.epTitle||'',
        createdAt:m.createdAt||i,
      }));
    } else oldC = [];
    oldDone = true; merge();
  }, err => { console.warn('settings/movies:', err.code); oldDone = true; merge(); });
}

// ── Section nav ───────────────────────────────────────────────
function showSection(sec) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.snav,.bnav').forEach(b => b.classList.remove('active'));
  const pg = document.getElementById('page-'+sec); if (pg) pg.classList.add('active');
  const sn = document.getElementById('snav-'+sec); if (sn) sn.classList.add('active');
  const bn = document.getElementById('bnav-'+sec); if (bn) bn.classList.add('active');
  curSection = sec;
  if (sec==='downloads') renderDownloadsPage();
  if (sec==='indian')    { renderVJRows('indian','indian'); }
  if (sec==='indian')     renderVJRows('indian','indian');
  if (sec==='favs')     renderFavs();
  if (sec==='home')     renderComingSoon();
  if (sec==='settings') updateStats();
  if (sec==='admin') { renderLib(); renderSubs(); renderPayments(); }
  document.getElementById('content').scrollTop = 0;
}

// ── Render all ────────────────────────────────────────────────
function renderAll() {
  renderVJRows('home',      null);
  renderVJRows('movies',    'movie');
  renderVJRows('series',    'series');
  renderVJRows('animation', 'animation');
  renderVJRows('indian',    'indian');
  if (curSection==='favs')    renderFavs();
  if (curSection==='settings') updateStats();
  if (curSection==='admin')   renderLib();
  if (curSection==='detail') {
    const h = document.getElementById('sd-container');
    if (h && h.dataset.sname) openSeriesDetail(h.dataset.sname);
  }
}

// ── VJ Rows (horizontal scroll per VJ) ───────────────────────
function renderVJRows(pageId, cat) {
  const container = document.getElementById('vj-rows-'+pageId);
  if (!container) return;

  let base = cat ? allContent.filter(m => m.cat===cat) : allContent;

  // For series page: deduplicate by series name
  if (cat==='series') {
    const seen = {};
    base = [];
    allContent.filter(m => m.cat==='series').forEach(m => {
      const name = m.seriesName||m.title;
      if (!seen[name]) { seen[name] = true; base.push({ ...m, _isSeriesGroup:true, _sname:name }); }
    });
  }

  if (!base.length) { container.innerHTML = '<div class="empty-page">No content yet.</div>'; return; }

  let html = '';

  // For home: show "Latest" row first (all recent), then per-VJ
  if (pageId==='home') {
    const recent = [...allContent].sort((a,b) => (b.createdAt||0)-(a.createdAt||0)).slice(0,20);
    html += buildRow('Latest', recent, 'movie');
    VJS.forEach(vj => {
      const items = allContent.filter(m => m.vj===vj);
      if (items.length) html += buildRow(vj, items, 'home');
    });
  } else if (cat==='series') {
    // All series in one row, then per-VJ
    html += buildRow('All Series', base, 'series');
    VJS.forEach(vj => {
      const vjSeen = {};
      const vjItems = [];
      allContent.filter(m => m.cat==='series' && m.vj===vj).forEach(m => {
        const name = m.seriesName||m.title;
        if (!vjSeen[name]) { vjSeen[name]=true; vjItems.push({ ...m, _isSeriesGroup:true, _sname:name }); }
      });
      if (vjItems.length) html += buildRow(vj, vjItems, 'series');
    });
  } else {
    // Latest row
    html += buildRow('Latest', base.slice(0,20), cat);
    // Per VJ rows
    VJS.forEach(vj => {
      const items = base.filter(m => m.vj===vj);
      if (items.length) html += buildRow(vj, items, cat);
    });
  }

  container.innerHTML = html || '<div class="empty-page">No content yet.</div>';
}

function buildRow(label, items, rowType) {
  if (!items.length) return '';
  const cards = items.map(m => {
    if (m._isSeriesGroup || (m.cat==='series' && rowType==='series')) {
      return seriesGroupCard(m);
    }
    return movieCard(m);
  }).join('');
  const safeLabel = label.replace(/'/g, "\'");
  const seeAllBtn = label !== 'Latest'
    ? '<button class="see-all-btn" onclick="showSeeAll(\'' + safeLabel + '\')">See All</button>'
    : '<span class="vj-row-count">' + items.length + ' title' + (items.length!==1?'s':'') + '</span>';
  return `<div class="vj-row-block">
    <div class="vj-row-head">
      <span class="vj-row-label">${label}</span>
      ${seeAllBtn}
    </div>
    <div class="hscroll-row">${cards}</div>
  </div>`;
}

// ── Movie card ────────────────────────────────────────────────
function movieCard(m) {
  const editBtn = adminUnlocked
    ? `<button class="mc-edit" onclick="event.stopPropagation();startEdit('${m.id}')"><svg width="11" height="11"><use href="#i-edit"/></svg></button>`
    : '';
  return `<div class="mcard" onclick="playItem('${m.id}')">
    <div class="mcard-thumb">
      ${m.thumb?`<img src="${m.thumb}" loading="lazy" onerror="this.style.display='none'"/>`:`<svg class="mcard-noimg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`}
      <div class="mcard-overlay"><div class="mcard-play-ico"><svg width="14" height="14" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></div></div>
    </div>
    <div class="mcard-body">
      <div class="mcard-title">${m.title}</div>
      ${m.vj?`<div class="mcard-vj">${m.vj}</div>`:''}
      <div class="mcard-sub">${[m.year,m.genre].filter(Boolean).join(' · ')}</div>
    </div>
    <div class="mcard-btns">
      <button class="mc-btn mc-watch" onclick="event.stopPropagation();playItem('${m.id}')">
        <svg width="11" height="11" fill="currentColor"><polygon points="3,2 13,8 3,14"/></svg> Watch
      </button>
      <button class="mc-btn mc-dl" onclick="event.stopPropagation();downloadItem('${m.id}')">
        <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M8 2v7"/><polyline points="5 7 8 10 11 7"/><line x1="3" y1="13" x2="13" y2="13"/></svg> Download
      </button>
      ${editBtn}
    </div>
  </div>`;
}

// ── Series group card ─────────────────────────────────────────
function seriesGroupCard(m) {
  const sname = m._sname || m.seriesName || m.title;
  const eps   = allContent.filter(c => c.cat==='series' && (c.seriesName||c.title)===sname);
  const seasons = [...new Set(eps.map(e=>e.season||1))].length;
  const editBtn = adminUnlocked
    ? `<button class="mc-edit" onclick="event.stopPropagation();startEdit('${m.id}')"><svg width="11" height="11"><use href="#i-edit"/></svg></button>`
    : '';
  return `<div class="mcard" onclick="openSeriesDetail('${sname.replace(/'/g,"\\'")}')">
    <div class="mcard-thumb">
      ${m.thumb?`<img src="${m.thumb}" loading="lazy" onerror="this.style.display='none'"/>`:`<svg class="mcard-noimg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>`}
      <div class="mcard-overlay"><div class="mcard-play-ico"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="14" height="11" rx="1"/><polyline points="11 2 8 7 5 2"/></svg></div></div>
    </div>
    <div class="mcard-body">
      <div class="mcard-title">${sname}</div>
      ${m.vj?`<div class="mcard-vj">${m.vj}</div>`:''}
      <div class="mcard-sub">${[m.year,m.genre].filter(Boolean).join(' · ')}</div>
      <div class="mcard-eps">${seasons} Season${seasons!==1?'s':''} · ${eps.length} Ep${eps.length!==1?'s':''}</div>
    </div>
    <div class="mcard-btns">
      <button class="mc-btn mc-watch" style="flex:2" onclick="event.stopPropagation();openSeriesDetail('${sname.replace(/'/g,"\\'")}')">
        <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="14" height="11" rx="1"/><polyline points="11 2 8 7 5 2"/></svg> View Episodes
      </button>
      ${editBtn}
    </div>
  </div>`;
}

// ── Series detail ─────────────────────────────────────────────
// ── Series detail — cinematic like Kawogo ────────────────────
let _sdEps = [];
let _sdSeasons = {};
let _sdActiveSeason = 1;
let _sdSname = '';

function openSeriesDetail(sname) {
  _sdSname = sname;
  _sdEps = allContent.filter(m => m.cat==='series' && (m.seriesName||m.title)===sname)
    .sort((a,b)=>(a.season||1)-(b.season||1)||(a.epNum||1)-(b.epNum||1));
  if (!_sdEps.length) return;
  const first = _sdEps[0];

  // Group by season
  _sdSeasons = {};
  _sdEps.forEach(ep => { const sn=ep.season||1; if(!_sdSeasons[sn]) _sdSeasons[sn]=[]; _sdSeasons[sn].push(ep); });
  const snKeys = Object.keys(_sdSeasons).sort((a,b)=>+a - +b);
  _sdActiveSeason = +snKeys[0];

  // Backdrop
  const backdrop = document.getElementById('sd-backdrop');
  if (first.thumb) {
    backdrop.style.backgroundImage = `url('${first.thumb}')`;
  } else {
    backdrop.style.backgroundImage = 'none';
    backdrop.style.background = 'var(--s2)';
  }
  document.getElementById('sd-container').dataset.sname = sname;

  // Info
  document.getElementById('sd-title').textContent = sname;
  const vjEl = document.getElementById('sd-vj');
  vjEl.textContent = first.vj || '';
  vjEl.style.display = first.vj ? 'inline-block' : 'none';
  document.getElementById('sd-genres').textContent = [first.year, first.genre].filter(Boolean).join('  ·  ');
  document.getElementById('sd-desc').textContent = first.desc || '';

  // Fav state
  const favKey = 'series-' + sname;
  const isFav = favs.includes(favKey);
  document.getElementById('sd-fav-ico').innerHTML = `<use href="${isFav ? '#i-heart-f' : '#i-heart'}"/>`;
  document.getElementById('sd-fav-btn').dataset.favkey = favKey;

  // Season menu
  const menu = document.getElementById('sd-season-menu');
  menu.innerHTML = snKeys.map(sn => `
    <div class="sd-season-item ${+sn===_sdActiveSeason?'active':''}" onclick="selectSeason(${sn})">
      ${first.thumb ? `<img class="sd-season-thumb" src="${first.thumb}" onerror="this.style.display='none'"/>` : '<div class="sd-season-thumb-placeholder"></div>'}
      <div class="sd-season-item-info">
        <div class="sd-season-item-name">Season ${sn}</div>
        <div class="sd-season-item-count">${_sdSeasons[sn].length} Episode${_sdSeasons[sn].length!==1?'s':''}</div>
      </div>
    </div>`).join('');
  document.getElementById('sd-season-label').textContent = `Season ${_sdActiveSeason}`;
  document.getElementById('sd-season-menu').classList.remove('open');
  document.getElementById('sd-season-chevron').style.transform = 'rotate(90deg)';

  // Render episodes for active season
  renderSDEpisodes();

  // Show page
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.snav,.bnav').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-detail').classList.add('active');
  document.getElementById('snav-series').classList.add('active');
  document.getElementById('bnav-series').classList.add('active');
  document.getElementById('content').scrollTop = 0;
  curSection = 'detail';
}

function renderSDEpisodes() {
  const eps = _sdSeasons[_sdActiveSeason] || [];
  const row = document.getElementById('sd-ep-row');
  if (!eps.length) { row.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:10px">No episodes yet.</div>'; return; }
  row.innerHTML = eps.map(ep => {
    const editBtn = adminUnlocked
      ? `<button class="sd-ep-edit" onclick="event.stopPropagation();startEdit('${ep.id}')"><svg width="12" height="12"><use href="#i-edit"/></svg></button>`
      : '';
    return `<div class="sd-ep-card" onclick="playEpisode('${ep.id}')">
      <div class="sd-ep-thumb">
        ${ep.thumb ? `<img src="${ep.thumb}" onerror="this.style.display='none'"/>` : ''}
        <div class="sd-ep-overlay">
          <div class="sd-ep-play-btn"><svg width="18" height="18" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></div>
        </div>
        <div class="sd-ep-duration">S${ep.season||1} E${ep.epNum||1}</div>
      </div>
      <div class="sd-ep-meta">
        <div class="sd-ep-code">S${ep.season||1} E${ep.epNum||1}</div>
        <div class="sd-ep-name">${ep.epTitle||ep.title||'Episode '+(ep.epNum||1)}</div>
      </div>
      <div class="sd-ep-btns">
        <button class="sd-ep-btn watch" onclick="event.stopPropagation();playEpisode('${ep.id}')">
          <svg width="11" height="11" fill="currentColor"><polygon points="3,2 13,8 3,14"/></svg> Watch
        </button>
        <button class="sd-ep-btn dl" onclick="event.stopPropagation();downloadItem('${ep.id}')">
          <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M8 2v7"/><polyline points="5 7 8 10 11 7"/><line x1="3" y1="13" x2="13" y2="13"/></svg> Download
        </button>
        ${editBtn}
      </div>
    </div>`;
  }).join('');
}

function selectSeason(sn) {
  _sdActiveSeason = +sn;
  document.querySelectorAll('.sd-season-item').forEach(el => el.classList.toggle('active', +el.dataset.sn === sn));
  // rebuild menu active state
  document.querySelectorAll('.sd-season-item').forEach(el => {
    const elSn = parseInt(el.querySelector('.sd-season-item-name').textContent.replace('Season ',''));
    el.classList.toggle('active', elSn === +sn);
  });
  document.getElementById('sd-season-label').textContent = `Season ${sn}`;
  toggleSeasonMenu(); // close menu
  renderSDEpisodes();
}

function toggleSeasonMenu() {
  const menu = document.getElementById('sd-season-menu');
  const chevron = document.getElementById('sd-season-chevron');
  const open = menu.classList.toggle('open');
  chevron.style.transform = open ? 'rotate(270deg)' : 'rotate(90deg)';
}

function toggleSeriesFav() {
  const btn = document.getElementById('sd-fav-btn');
  const key = btn.dataset.favkey || ('series-' + _sdSname);
  const i = favs.indexOf(key);
  if (i>=0) {
    favs.splice(i,1);
    document.getElementById('sd-fav-ico').innerHTML = '<use href="#i-heart"/>';
  } else {
    favs.push(key);
    document.getElementById('sd-fav-ico').innerHTML = '<use href="#i-heart-f"/>';
  }
  saveFavs();
}

// ── Play ──────────────────────────────────────────────────────
function playItem(id) {
  const m = allContent.find(c=>c.id===id);
  if (!m) return;
  if (m.cat==='series') { playEpisode(id); return; }
  curPlay = { type:'movie', id };
  document.getElementById('pl-title') && (document.getElementById('pl-title').textContent = m.title);
  document.getElementById('kp-top-title') && (document.getElementById('kp-top-title').textContent = m.title);
  document.getElementById('kp-top-ep') && (document.getElementById('kp-top-ep').textContent = '');
  document.getElementById('pi-title').textContent = m.title;
  document.getElementById('pi-ep').textContent    = '';
  document.getElementById('pi-meta').textContent  = [m.vj,m.year,m.genre].filter(Boolean).join(' · ');
  document.getElementById('pi-tags').innerHTML    = buildTags(m.vj,m.cat,m.genre,m.year);
  document.getElementById('ep-nav').style.display = 'none';
  setFavUI('item-'+id);
  buildPlayer(m.play);
  renderMoreLike(id, m.cat, m.vj);
  document.getElementById('player-overlay').classList.add('open');
}

function playEpisode(id) {
  const ep = allContent.find(c=>c.id===id); if (!ep) return;
  const sname  = ep.seriesName||ep.title;
  const allEps = allContent.filter(c=>c.cat==='series'&&(c.seriesName||c.title)===sname)
    .sort((a,b)=>(a.season||1)-(b.season||1)||(a.epNum||1)-(b.epNum||1));
  const idx = allEps.findIndex(e=>e.id===id);
  curPlay = { type:'episode', id, sname, allEps, idx };
  const lbl = `Season ${ep.season||1} · Episode ${ep.epNum||1}`;
  document.getElementById('pl-title') && (document.getElementById('pl-title').textContent = `${sname} — ${lbl}`);
  document.getElementById('kp-top-title') && (document.getElementById('kp-top-title').textContent = sname);
  document.getElementById('kp-top-ep') && (document.getElementById('kp-top-ep').textContent = lbl);
  document.getElementById('pi-title').textContent = sname;
  document.getElementById('pi-ep').textContent    = lbl+(ep.epTitle?` — ${ep.epTitle}`:'');
  document.getElementById('pi-meta').textContent  = [ep.vj,ep.year,ep.genre].filter(Boolean).join(' · ');
  document.getElementById('pi-tags').innerHTML    = buildTags(ep.vj,'series',ep.genre,ep.year);
  const nav = document.getElementById('ep-nav');
  nav.style.display = 'flex';
  document.getElementById('ep-nav-label').textContent = `${idx+1} / ${allEps.length}`;
  document.getElementById('ep-prev').disabled = idx<=0;
  document.getElementById('ep-next').disabled = idx>=allEps.length-1;
  setFavUI('item-'+id);
  buildPlayer(ep.play);
  renderMoreLike(id, 'series', ep.vj);
  const po = document.getElementById('player-overlay');
  po.classList.add('open');
  po.scrollTop = 0;
}

function playAdjacentEp(dir) {
  if (!curPlay||curPlay.type!=='episode') return;
  const next = curPlay.allEps[curPlay.idx+dir];
  if (next) playEpisode(next.id);
}

function buildTags(vj,cat,genre,year) {
  let t='';
  if(vj)    t+=`<span class="pi-tag teal">${vj}</span>`;
  if(cat)   t+=`<span class="pi-tag">${cat}</span>`;
  if(genre) t+=`<span class="pi-tag">${genre}</span>`;
  if(year)  t+=`<span class="pi-tag">${year}</span>`;
  return t;
}

function buildPlayer(url) {
  const box = document.getElementById('player-video');
  box.innerHTML = '';
  if (!url) {
    box.innerHTML = '<div style="width:100%;height:100%;background:#0a0a0a;display:flex;align-items:center;justify-content:center;min-height:200px;color:#444;font-size:13px">No play link added yet</div>';
    return;
  }

  // Direct video file — play natively (best for mobile)
  if (/\.(mp4|webm|mov|mkv|avi|m3u8)(\?|$)/i.test(url)) {
    playNativeVideo(box, url);
    return;
  }

  // archive.org — try to get direct mp4 link first
  if (url.includes('archive.org')) {
    // Extract the item identifier
    let itemId = '';
    const m1 = url.match(/archive\.org\/(?:details|download|embed)\/([^/?#\/]+)/);
    if (m1) itemId = m1[1];

    if (itemId) {
      // Try to fetch the direct video URL from archive.org API
      box.innerHTML = '<div style="width:100%;height:100%;background:#0a0a0a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-height:200px"><div style="width:44px;height:44px;border:3px solid #222;border-top-color:#00e5c3;border-radius:50%;animation:spin .8s linear infinite"></div><div style="color:#444;font-size:12px;font-weight:600;letter-spacing:.04em">Loading...</div></div>';

      fetch(`https://archive.org/metadata/${itemId}`)
        .then(r => r.json())
        .then(data => {
          // Find mp4 or video files
          const files = data.files || [];
          const video = files.find(f => /\.mp4$/i.test(f.name)) ||
                        files.find(f => /\.mkv$/i.test(f.name)) ||
                        files.find(f => /\.avi$/i.test(f.name)) ||
                        files.find(f => f.format && f.format.toLowerCase().includes('mpeg4')) ||
                        files.find(f => f.source === 'original' && /video/i.test(f.format||''));
          if (video) {
            const directUrl = `https://archive.org/download/${itemId}/${video.name}`;
            playNativeVideo(box, directUrl);
          } else {
            // Fallback to embed
            playEmbed(box, `https://archive.org/embed/${itemId}?autoplay=1`);
          }
        })
        .catch(() => {
          // If fetch fails, fallback to embed
          playEmbed(box, `https://archive.org/embed/${itemId}?autoplay=1`);
        });
      return;
    }
  }

  // YouTube
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const m1 = url.match(/[?&]v=([^&]+)/);
    const m2 = url.match(/youtu\.be\/([^?]+)/);
    const vid = (m1 && m1[1]) || (m2 && m2[1]);
    if (vid) { playEmbed(box, `https://www.youtube.com/embed/${vid}?autoplay=1`); return; }
  }

  // Any other URL — try as embed iframe
  playEmbed(box, url);
}

function playNativeVideo(box, url) {
  box.innerHTML = `<video id="kp-video" autoplay playsinline webkit-playsinline x5-playsinline
    style="width:100%;height:100%;background:#000;display:block;object-fit:contain">
    <source src="${url}" type="video/mp4"/>
    <source src="${url}"/>
  </video>`;
  const v = box.querySelector('video');
  if (v) {
    v.addEventListener('error', () => {
      const itemId = url.match(/archive\.org\/download\/([^/]+)/)?.[1];
      if (itemId) { playEmbed(box, `https://archive.org/embed/${itemId}?autoplay=1`); kpHideControls(); }
    });
    v.addEventListener('loadedmetadata', () => kpUpdateTime());
    v.addEventListener('timeupdate', () => kpUpdateTime());
    v.addEventListener('play',  () => kpSetPlayIcon(false));
    v.addEventListener('pause', () => kpSetPlayIcon(true));
    v.addEventListener('ended', () => kpSetPlayIcon(true));
    // Show controls on tap
    kpShowControls();
  }
}

// ── CUSTOM PLAYER CONTROLS ───────────────────────────────────
let kpControlsTimer = null;

function kpGetVideo() { return document.getElementById('kp-video'); }

function kpShowControls() {
  const c = document.getElementById('kp-controls');
  if (!c) return;
  c.classList.add('visible');
  clearTimeout(kpControlsTimer);
  kpControlsTimer = setTimeout(() => {
    const v = kpGetVideo();
    if (v && !v.paused) c.classList.remove('visible');
  }, 3000);
}

function kpHideControls() {
  const c = document.getElementById('kp-controls');
  if (c) c.classList.remove('visible');
}

function kpTogglePlay() {
  const v = kpGetVideo(); if (!v) return;
  if (v.paused) { v.play(); kpShowControls(); }
  else { v.pause(); kpShowControls(); }
}

function kpSeek(secs) {
  const v = kpGetVideo(); if (!v) return;
  v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + secs));
  kpShowControls();
}

function kpSeekClick(e) {
  const v = kpGetVideo(); if (!v || !v.duration) return;
  const wrap = document.getElementById('kp-progress-wrap');
  const rect = wrap.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  v.currentTime = pct * v.duration;
  kpShowControls();
}

function kpUpdateTime() {
  const v = kpGetVideo(); if (!v) return;
  const cur = v.currentTime || 0;
  const dur = v.duration   || 0;
  const pct = dur > 0 ? (cur / dur) * 100 : 0;
  const fill = document.getElementById('kp-progress-fill');
  const thumb = document.getElementById('kp-progress-thumb');
  const time  = document.getElementById('kp-time');
  if (fill)  fill.style.width = pct + '%';
  if (thumb) thumb.style.left = pct + '%';
  if (time)  time.textContent = fmtTime(cur) + ' / ' + fmtTime(dur);
}

function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function kpSetPlayIcon(isPaused) {
  const ico = document.getElementById('kp-play-ico');
  if (!ico) return;
  ico.innerHTML = isPaused
    ? '<polygon points="5,3 19,12 5,21"/>'
    : '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
}

function kpToggleFullscreen() {
  const wrap = document.getElementById('kp-player-wrap');
  if (!wrap) return;
  if (!document.fullscreenElement) {
    (wrap.requestFullscreen || wrap.webkitRequestFullscreen || wrap.mozRequestFullScreen).call(wrap);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen).call(document);
  }
}

function toggleQualityMenu() { /* future: quality selection */ }

function playEmbed(box, embedUrl) {
  box.innerHTML = `<iframe src="${embedUrl}"
    allowfullscreen allow="autoplay;fullscreen;picture-in-picture"
    style="width:100%;height:100%;border:none;background:#000;display:block"></iframe>`;
}

function renderMoreLike(currentId, cat, vj) {
  const row = document.getElementById('more-row');
  if (!row) return;
  // Get similar content - same category, exclude current
  let similar = allContent.filter(m => m.id !== currentId && m.cat === cat);
  // Prioritize same VJ
  const sameVJ = similar.filter(m => m.vj === vj);
  const others = similar.filter(m => m.vj !== vj);
  similar = [...sameVJ, ...others].slice(0, 15);
  // For series, deduplicate by series name
  if (cat === 'series') {
    const seen = {};
    similar = similar.filter(m => {
      const name = m.seriesName || m.title;
      if (seen[name]) return false;
      seen[name] = true; return true;
    });
  }
  if (!similar.length) { row.parentElement.style.display = 'none'; return; }
  row.parentElement.style.display = 'block';
  row.innerHTML = similar.map(m => {
    // Always play directly — click any card and it plays
    const onclick = `playItem('${m.id}')`;
    return `<div class="more-card" onclick="${onclick}">
      <div class="more-thumb">
        ${m.thumb ? `<img src="${m.thumb}" loading="lazy" onerror="this.style.display='none'"/>` : '<div style="width:100%;height:100%;background:var(--s3);border-radius:6px"></div>'}
        <div class="more-thumb-play"><svg width="22" height="22" fill="var(--teal)"><polygon points="5,3 19,12 5,21"/></svg></div>
      </div>
      <div class="more-card-title">${m.seriesName || m.title}</div>
      <div class="more-card-vj">${m.vj || ''}</div>
    </div>`;
  }).join('');
}

function closePlayer() {
  const v = kpGetVideo(); if (v) v.pause();
  document.getElementById('player-video').innerHTML = '';
  document.getElementById('player-overlay').classList.remove('open');
  kpHideControls();
  curPlay = null;
}
// ── DOWNLOAD TRACKING ────────────────────────────────────────
const DL_KEY = 'kp_downloads';
function loadDlHistory() { try { dlHistory = JSON.parse(localStorage.getItem(DL_KEY)||'[]'); } catch(e){ dlHistory=[]; } }
function saveDlHistory() { try { localStorage.setItem(DL_KEY, JSON.stringify(dlHistory)); } catch(e){} }

function addToDownloadHistory(m, fileName, fileUrl) {
  // Remove duplicate
  dlHistory = dlHistory.filter(d => d.id !== m.id);
  dlHistory.unshift({
    id: m.id, title: m.epTitle||m.title, vj: m.vj||'', thumb: m.thumb||'',
    fileName, fileUrl, time: Date.now(), status: 'downloading'
  });
  saveDlHistory();
  renderDownloadsPage();
}

function markDownloadDone(id) {
  const d = dlHistory.find(d => d.id === id);
  if (d) { d.status = 'done'; saveDlHistory(); renderDownloadsPage(); }
}

function removeDownload(id) {
  dlHistory = dlHistory.filter(d => d.id !== id);
  saveDlHistory();
  renderDownloadsPage();
}

// ── DOWNLOAD LOGIC ────────────────────────────────────────────
// Get direct mp4 URL from archive.org metadata API
async function getDirectMp4(itemId) {
  try {
    const res = await fetch(`https://archive.org/metadata/${itemId}`);
    const data = await res.json();
    const files = data.files || [];
    // Prefer original mp4 over derivative
    const vid = files.find(f => /\.mp4$/i.test(f.name) && f.source === 'original') ||
                files.find(f => /\.mp4$/i.test(f.name)) ||
                files.find(f => /\.mkv$/i.test(f.name)) ||
                files.find(f => /\.avi$/i.test(f.name));
    if (vid) return {
      url: `https://archive.org/download/${itemId}/${encodeURIComponent(vid.name)}`,
      name: vid.name
    };
  } catch(e) {}
  return null;
}

async function downloadItem(id) {
  const m = allContent.find(c => c.id === id);
  if (!m) return;
  const rawUrl = m.dl || m.play;
  if (!rawUrl) { showToast('No download link for this movie yet', true); return; }

  showToast('Getting download link...');

  let finalUrl = rawUrl;
  let fileName = (m.epTitle || m.title || 'movie').replace(/[^a-z0-9 .-]/gi, '_') + '.mp4';

  if (/\.mp4(\?|$)/i.test(rawUrl)) {
    finalUrl = rawUrl;
    const parts = rawUrl.split('/');
    fileName = decodeURIComponent(parts[parts.length-1]) || fileName;
  } else if (rawUrl.includes('archive.org')) {
    const archiveMatch = rawUrl.match(/archive\.org\/(?:details|download|embed)\/([^/?#\/]+)/);
    if (archiveMatch) {
      const result = await getDirectMp4(archiveMatch[1]);
      if (result) { finalUrl = result.url; fileName = result.name; }
    }
  }

  // Add to history with downloading status
  const dlEntry = { id, title: m.epTitle||m.title, vj: m.vj||'', thumb: m.thumb||'',
    fileName, fileUrl: finalUrl, time: Date.now(), status: 'downloading',
    loaded: 0, total: 0, speed: 0 };
  dlHistory = dlHistory.filter(d => d.id !== id);
  dlHistory.unshift(dlEntry);
  saveDlHistory();
  showSection('downloads');
  renderDownloadsPage();

  // Stream download with progress tracking
  try {
    const res = await fetch(finalUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = parseInt(res.headers.get('content-length') || '0');
    dlEntry.total = total;

    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    let lastTime = Date.now();
    let lastLoaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      dlEntry.loaded = loaded;

      // Calculate speed every 500ms
      const now = Date.now();
      if (now - lastTime > 500) {
        dlEntry.speed = Math.round((loaded - lastLoaded) / ((now - lastTime) / 1000));
        lastTime = now; lastLoaded = loaded;
        saveDlHistory();
        renderDownloadsPage();
      }
    }

    // Combine chunks into blob
    const blob = new Blob(chunks);
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl; a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(blobUrl); document.body.removeChild(a); }, 1000);

    dlEntry.status = 'done'; dlEntry.speed = 0;
    saveDlHistory(); renderDownloadsPage();
    showToast(m.epTitle||m.title + ' downloaded! 📥');

  } catch(e) {
    // CORS blocked — fallback: open direct link
    dlEntry.status = 'done';
    saveDlHistory(); renderDownloadsPage();
    const a = document.createElement('a');
    a.href = finalUrl; a.download = fileName; a.target = '_blank';
    document.body.appendChild(a); a.click();
    setTimeout(() => document.body.removeChild(a), 500);
    showToast('Download started — check Downloads folder 📥');
  }
}

function downloadGate() {
  const id = curPlay ? curPlay.id : null;
  if (id) downloadItem(id);
  else showToast('Nothing playing', true);
}

// ── Favourites ────────────────────────────────────────────────
function setFavUI(key) {
  const on = favs.includes(key);
  document.getElementById('fav-ico').innerHTML   = `<use href="${on?'#i-heart-f':'#i-heart'}"/>`;
  document.getElementById('fav-txt').textContent = on?'In Favourites':'Add to Favourites';
  document.getElementById('pi-fav').classList.toggle('active',on);
  document.getElementById('pi-fav').dataset.key  = key;
}
function toggleFav() {
  const key = document.getElementById('pi-fav').dataset.key; if(!key) return;
  const i = favs.indexOf(key);
  if (i>=0) favs.splice(i,1); else favs.push(key);
  saveFavs(); setFavUI(key);
}
function renderFavs() {
  const ids  = favs.map(k=>k.replace('item-',''));
  const list = allContent.filter(m=>ids.includes(m.id));
  const g = document.getElementById('grid-favs');
  if (!list.length) { g.innerHTML='<div class="empty-page" style="padding:30px">No favourites yet.</div>'; return; }
  g.innerHTML = list.map(m=>movieCard(m)).join('');
}

// ── Search overlay ────────────────────────────────────────────
function openSearch() {
  document.getElementById('search-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('search-input').focus(),100);
}
function closeSearch() {
  document.getElementById('search-overlay').classList.remove('open');
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '<div class="search-empty">Start typing to search...</div>';
  document.getElementById('s-clear-btn').style.display = 'none';
}
function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '<div class="search-empty">Start typing to search...</div>';
  document.getElementById('s-clear-btn').style.display = 'none';
}
function setSF(el, f) {
  searchFilter = f;
  document.querySelectorAll('.sf-tab').forEach(t=>t.classList.toggle('active',t.dataset.f===f));
  doSearch(document.getElementById('search-input').value);
}
function doSearch(q) {
  const clr = document.getElementById('s-clear-btn');
  if (clr) clr.style.display = q?'flex':'none';
  const g = document.getElementById('search-results');
  if (!q.trim()) { g.innerHTML='<div class="search-empty">Start typing to search...</div>'; return; }
  const ql  = q.toLowerCase();
  const vj  = document.getElementById('sf-vj').value;
  let list  = allContent.filter(m=>
    m.title.toLowerCase().includes(ql)||(m.vj||'').toLowerCase().includes(ql)||
    (m.genre||'').toLowerCase().includes(ql)||(m.seriesName||'').toLowerCase().includes(ql)||
    (m.epTitle||'').toLowerCase().includes(ql)||(m.desc||'').toLowerCase().includes(ql));
  if (searchFilter!=='all') list = list.filter(m=>m.cat===searchFilter);
  if (vj) list = list.filter(m=>m.vj===vj);
  if (!list.length) { g.innerHTML='<div class="search-empty">No results found.</div>'; return; }

  // Deduplicate series
  const seen = {};
  const deduped = [];
  list.forEach(m=>{
    if (m.cat==='series') {
      const sn = m.seriesName||m.title;
      if (!seen[sn]) { seen[sn]=true; deduped.push({...m,_isSeriesGroup:true,_sname:sn}); }
    } else deduped.push(m);
  });

  g.innerHTML = `<div class="search-count">${deduped.length} result${deduped.length!==1?'s':''}</div>
    <div class="search-grid">${deduped.map(m=>m._isSeriesGroup?seriesGroupCard(m):movieCard(m)).join('')}</div>`;
}

// ── Stats ─────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('st-total').textContent  = allContent.length;
  document.getElementById('st-movies').textContent = allContent.filter(m=>m.cat==='movie').length;
  document.getElementById('st-series').textContent = [...new Set(allContent.filter(m=>m.cat==='series').map(m=>m.seriesName||m.title))].length;
  document.getElementById('st-anim').textContent   = allContent.filter(m=>m.cat==='animation').length;
  // Indian counted in total already
}

// ── Admin secret tap ──────────────────────────────────────────
function secretTap() {
  secretCount++;
  const el = document.getElementById('secret-count');
  if (el) { el.style.color = secretCount>=5?'var(--teal)':'transparent'; el.textContent = secretCount; }
  clearTimeout(secretTimer);
  if (secretCount>=7) {
    secretCount=0;
    if (el) { el.style.color='transparent'; el.textContent='0'; }
    if (!adminUnlocked) goAdmin();
    else { adminUnlocked=false; localStorage.removeItem(ADMIN_KEY); hideAdmin(); showToast('Admin hidden'); }
    return;
  }
  secretTimer = setTimeout(()=>{ secretCount=0; if(el){el.style.color='transparent';el.textContent='0';} },2500);
}
function revealAdmin() {
  document.getElementById('admin-btn').style.display='flex';
  const s=document.getElementById('snav-admin'); if(s) s.style.display='flex';
  renderComingSoon();
}
function hideAdmin() {
  document.getElementById('admin-btn').style.display='none';
  const s=document.getElementById('snav-admin'); if(s) s.style.display='none';
}

// ── Admin PIN ─────────────────────────────────────────────────
function goAdmin() {
  if (adminUnlocked) { showSection('admin'); return; }
  openModal('pin-modal');
  document.getElementById('pin-inp').value='';
  document.getElementById('pin-err').textContent='';
  setTimeout(()=>document.getElementById('pin-inp').focus(),150);
}
function checkPin() {
  if (document.getElementById('pin-inp').value===getAdminPass()) {
    closeModal('pin-modal');
    adminUnlocked=true;
    localStorage.setItem(ADMIN_KEY,'1');
    revealAdmin();
    showSection('admin');
  } else {
    document.getElementById('pin-err').textContent='Wrong password.';
    document.getElementById('pin-inp').value='';
    document.getElementById('pin-inp').focus();
  }
}
function togglePwEye() {
  const inp=document.getElementById('pin-inp');
  const ico=document.getElementById('eye-ico');
  inp.type=inp.type==='password'?'text':'password';
  ico.innerHTML=`<use href="${inp.type==='password'?'#i-eye':'#i-x'}"/>`;
}

// ── Admin: category tabs ──────────────────────────────────────
function setCat(el,cat) {
  document.querySelectorAll('.cat-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('f-cat').value=cat;
  document.querySelectorAll('.series-only').forEach(e=>e.style.display=cat==='series'?'flex':'none');
  document.getElementById('title-label').textContent=cat==='series'?'Episode Title':cat==='animation'?'Animation Title':'Movie Title';
}

// ── Admin: thumbnail preview ──────────────────────────────────
function previewThumbUrl(url) {
  const prev=document.getElementById('thumb-prev');
  if (url&&url.startsWith('http')) {
    prev.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:6px" onerror="this.parentNode.innerHTML='<span style=color:var(--muted);font-size:11px;padding:8px>Cannot load — check URL</span>'"/>`;
    prev.style.display='block';
  } else { prev.style.display='none'; prev.innerHTML=''; }
}

// ── Admin: submit ─────────────────────────────────────────────
async function submitContent() {
  const title=document.getElementById('f-title').value.trim();
  const play =document.getElementById('f-play').value.trim();
  const cat  =document.getElementById('f-cat').value;
  if (!title) { showToast('Enter a title',true); return; }
  if (!play)  { showToast('Enter a play link',true); return; }
  const btn=document.getElementById('submit-btn');
  btn.disabled=true;
  btn.innerHTML='<svg width="14" height="14" class="spin"><use href="#i-star"/></svg> Saving...';
  try {
    const thumbUrl=document.getElementById('f-thumb-url').value.trim();
    const data={
      title,cat,play,
      vj:document.getElementById('f-vj').value,
      year:document.getElementById('f-year').value.trim(),
      genre:document.getElementById('f-genre').value.trim(),
      desc:document.getElementById('f-desc').value.trim(),
      dl:document.getElementById('f-dl').value.trim(),
      thumb:thumbUrl, updatedAt:Date.now()
    };
    if (cat==='series') {
      data.seriesName=document.getElementById('f-series-name').value.trim()||title;
      data.season    =parseInt(document.getElementById('f-season').value)||1;
      data.epNum     =parseInt(document.getElementById('f-epnum').value)||1;
      data.epTitle   =title;
    }
    if (editingId) {
      if (editingId.startsWith('legacy-')) {
        data.createdAt=Date.now();
        const {collection,addDoc,doc:fbDoc,getDoc,updateDoc}=window._fb;
        await addDoc(collection(window._db,'content'),data);
        const ref=fbDoc(window._db,'settings','movies');
        const snap=await getDoc(ref);
        if (snap.exists()) {
          const raw=snap.data(); const list=raw.list||raw.movies||[];
          list.splice(parseInt(editingId.replace('legacy-','')),1);
          await updateDoc(ref,{list});
        }
      } else {
        const {doc:fbDoc,updateDoc}=window._fb;
        await updateDoc(fbDoc(window._db,'content',editingId),data);
      }
      showToast('Updated!'); cancelEdit();
    } else {
      data.createdAt=Date.now();
      const {collection,addDoc}=window._fb;
      await addDoc(collection(window._db,'content'),data);
      showToast('Added!');
      if (cat==='series') {
        const n=parseInt(document.getElementById('f-epnum').value)||1;
        document.getElementById('f-epnum').value=n+1;
        document.getElementById('f-title').value='';
        document.getElementById('f-desc').value='';
      } else resetForm();
    }
  } catch(err) { showToast('Error: '+err.message,true); }
  finally {
    btn.disabled=false;
    btn.innerHTML=`<svg width="14" height="14"><use href="${editingId?'#i-save':'#i-plus'}"/></svg> <span id="submit-label">${editingId?'Save Changes':'Add to Library'}</span>`;
  }
}

// ── Admin: edit ───────────────────────────────────────────────
function startEdit(id) {
  const m=allContent.find(c=>c.id===id); if(!m) return;
  editingId=id; showSection('admin');
  document.querySelectorAll('.cat-tab').forEach(t=>t.classList.toggle('active',t.dataset.cat===m.cat));
  document.getElementById('f-cat').value=m.cat;
  document.querySelectorAll('.series-only').forEach(e=>e.style.display=m.cat==='series'?'flex':'none');
  document.getElementById('edit-id').value=id;
  document.getElementById('f-title').value=m.epTitle||m.title||'';
  document.getElementById('f-vj').value=m.vj||'';
  document.getElementById('f-year').value=m.year||'';
  document.getElementById('f-genre').value=m.genre||'';
  document.getElementById('f-desc').value=m.desc||'';
  document.getElementById('f-play').value=m.play||'';
  document.getElementById('f-dl').value=m.dl||'';
  document.getElementById('f-thumb-url').value=m.thumb||'';
  if (m.cat==='series') {
    document.getElementById('f-series-name').value=m.seriesName||'';
    document.getElementById('f-season').value=m.season||1;
    document.getElementById('f-epnum').value=m.epNum||1;
  }
  if (m.thumb) previewThumbUrl(m.thumb);
  document.getElementById('form-mode-label').textContent='Edit Content';
  document.getElementById('cancel-edit-btn').style.display='inline-flex';
  document.getElementById('submit-btn').innerHTML=`<svg width="14" height="14"><use href="#i-save"/></svg> Save Changes`;
  document.getElementById('content').scrollTop=0;
}

function cancelEdit() {
  editingId=null; resetForm();
  document.getElementById('form-mode-label').textContent='Add Content';
  document.getElementById('cancel-edit-btn').style.display='none';
  document.getElementById('submit-btn').innerHTML=`<svg width="14" height="14"><use href="#i-plus"/></svg> <span id="submit-label">Add to Library</span>`;
}

function resetForm() {
  ['f-title','f-vj','f-year','f-genre','f-desc','f-play','f-dl','f-series-name','f-thumb-url'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('f-cat').value='movie';
  document.getElementById('f-season').value='1';
  document.getElementById('f-epnum').value='1';
  document.getElementById('thumb-prev').style.display='none';
  document.getElementById('thumb-prev').innerHTML='';
  document.querySelectorAll('.cat-tab').forEach(t=>t.classList.toggle('active',t.dataset.cat==='movie'));
  document.querySelectorAll('.series-only').forEach(e=>e.style.display='none');
  document.getElementById('title-label').textContent='Title';
}

// ── Admin: delete ─────────────────────────────────────────────
function askDelete(id) {
  const m=allContent.find(c=>c.id===id); if(!m) return;
  pendingDelId=id;
  document.getElementById('del-modal-sub').textContent=`Delete "${m.epTitle||m.title}"? This cannot be undone.`;
  openModal('del-modal');
}
async function confirmDelete() {
  if (!pendingDelId) return;
  closeModal('del-modal');
  try {
    if (pendingDelId.startsWith('legacy-')) {
      const {doc:fbDoc,getDoc,updateDoc}=window._fb;
      const ref=fbDoc(window._db,'settings','movies');
      const snap=await getDoc(ref);
      if (snap.exists()) {
        const raw=snap.data(); const list=raw.list||raw.movies||[];
        list.splice(parseInt(pendingDelId.replace('legacy-','')),1);
        await updateDoc(ref,{list});
      }
    } else {
      const {doc:fbDoc,deleteDoc}=window._fb;
      await deleteDoc(fbDoc(window._db,'content',pendingDelId));
    }
    favs=favs.filter(f=>f!=='item-'+pendingDelId); saveFavs();
    if (editingId===pendingDelId) cancelEdit();
    showToast('Deleted.');
  } catch(err) { showToast('Error: '+err.message,true); }
  pendingDelId=null;
}

// ── Admin: library ────────────────────────────────────────────
function setLibFilter(el,f) {
  libFilter=f;
  document.querySelectorAll('.lib-tab').forEach(t=>t.classList.toggle('active',t.dataset.f===f));
  renderLib();
}
function renderLib() {
  const el=document.getElementById('lib-list');
  let list=libFilter==='all'?allContent:allContent.filter(m=>m.cat===libFilter);
  document.getElementById('lib-count').textContent=allContent.length;
  if (!list.length) { el.innerHTML='<div class="empty-msg">Nothing here yet.</div>'; return; }
  el.innerHTML=list.map(m=>`
    <div class="lib-item">
      <div class="lib-thumb">${m.thumb?`<img src="${m.thumb}" onerror="this.style.display='none'"/>`:''}
      </div>
      <div class="lib-info">
        <div class="lib-title">${m.cat==='series'?`<span style="color:var(--teal);font-size:9px">${m.seriesName||''} S${m.season||1}E${m.epNum||1} · </span>`:''}${m.epTitle||m.title}</div>
        <div class="lib-sub">${[m.year,m.genre].filter(Boolean).join(' · ')}</div>
        <div class="lib-vj">${m.vj||''} <span class="lib-cat">${m.cat}</span></div>
      </div>
      <div class="lib-item-actions">
        <button class="edit-btn" onclick="startEdit('${m.id}')"><svg width="12" height="12"><use href="#i-edit"/></svg></button>
        <button class="del-btn"  onclick="askDelete('${m.id}')"><svg width="12" height="12"><use href="#i-trash"/></svg></button>
      </div>
    </div>`).join('');
}

// ── Helpers ───────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{ if(e.target===o) o.classList.remove('open'); }));
document.addEventListener('keydown',e=>{
  if (e.key==='Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
    if (document.getElementById('player-overlay').classList.contains('open')) closePlayer();
    if (document.getElementById('search-overlay').classList.contains('open')) closeSearch();
  }
});

function showToast(msg,isErr=false) {
  let t=document.getElementById('toast');
  if (!t) { t=document.createElement('div'); t.id='toast'; t.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1c1c1c;color:#f0f0f0;border:1px solid rgba(255,255,255,.1);border-radius:99px;padding:10px 20px;font-size:12px;font-weight:700;z-index:9999;white-space:nowrap;pointer-events:none;transition:opacity .3s'; document.body.appendChild(t); }
  t.textContent=msg;
  t.style.borderColor=isErr?'rgba(255,68,68,.4)':'rgba(0,229,195,.3)';
  t.style.color=isErr?'#ff7070':'#f0f0f0';
  t.style.opacity='1';
  clearTimeout(t._t);
  t._t=setTimeout(()=>t.style.opacity='0',3000);
}

// ── Downloads page ───────────────────────────────────────────
function fmtBytes(b) {
  if (!b) return '0 B';
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  if (b < 1024*1024*1024) return (b/(1024*1024)).toFixed(1) + ' MB';
  return (b/(1024*1024*1024)).toFixed(2) + ' GB';
}
function fmtSpeed(s) {
  if (!s) return '';
  if (s < 1024) return s + ' B/s';
  if (s < 1024*1024) return (s/1024).toFixed(0) + ' KB/s';
  return (s/(1024*1024)).toFixed(1) + ' MB/s';
}

function renderDownloadsPage() {
  const list = document.getElementById('dl-movie-list');
  const count = document.getElementById('dl-page-count');
  if (!list) return;
  const active = dlHistory.filter(d => d.status==='downloading').length;
  const done   = dlHistory.filter(d => d.status==='done').length;
  if (count) count.textContent = active ? `${active} active · ${done} completed` : (done ? done + ' completed' : '');
  if (!dlHistory.length) {
    list.innerHTML = `<div class="dl-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <div class="dl-empty-title">No downloads yet</div>
      <div class="dl-empty-desc">Tap Download on any movie to start downloading</div>
    </div>`;
    return;
  }
  list.innerHTML = dlHistory.map(d => {
    const timeStr = new Date(d.time).toLocaleDateString();
    const isDone = d.status === 'done';
    const pct = d.total > 0 ? Math.round((d.loaded/d.total)*100) : (isDone?100:0);
    const loadedStr = fmtBytes(d.loaded);
    const totalStr  = d.total > 0 ? fmtBytes(d.total) : '';
    const speedStr  = fmtSpeed(d.speed);
    return `<div class="dl-item ${isDone?'done':'active'}">
      <div class="dl-item-thumb">
        ${d.thumb ? `<img src="${d.thumb}" onerror="this.style.display='none'"/>` : ''}
        ${isDone ? '<div class="dl-done-check">✓</div>' : ''}
      </div>
      <div class="dl-item-info">
        <div class="dl-item-title">${d.title||'Unknown'}</div>
        <div class="dl-item-sub">${d.vj}${d.vj?' · ':''}${timeStr}</div>
        <div class="dl-item-filename">${d.fileName}</div>
        ${!isDone ? `
          <div class="dl-progress-wrap">
            <div class="dl-progress-bar" style="width:${pct}%"></div>
          </div>
          <div class="dl-progress-info">
            <span>${loadedStr}${totalStr?' / '+totalStr:''}</span>
            <span>${pct}%</span>
            ${speedStr?`<span>${speedStr}</span>`:''}
          </div>
          <span class="dl-status-badge active">Downloading</span>
        ` : `
          <span class="dl-status-badge done">Completed</span>
        `}
      </div>
      <div class="dl-item-actions">
        ${isDone ? `<button class="dl-open-btn" onclick="window.open('${d.fileUrl}','_blank')">Open</button>` : ''}
        <button class="dl-remove-btn" onclick="removeDownload('${d.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── See All page ─────────────────────────────────────────────
function showSeeAll(label) {
  // Get items for this label
  let items = [];
  if (VJS.includes(label)) {
    items = allContent.filter(m => m.vj === label);
  } else {
    items = allContent.filter(m => (m.seriesName||m.title) === label || m.vj === label);
  }
  // Deduplicate series
  const seen = {};
  const deduped = [];
  items.forEach(m => {
    if (m.cat==='series') {
      const sn = m.seriesName||m.title;
      if (!seen[sn]) { seen[sn]=true; deduped.push({...m,_isSeriesGroup:true,_sname:sn}); }
    } else deduped.push(m);
  });

  // Show in a full page overlay
  let overlay = document.getElementById('see-all-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'see-all-overlay';
    overlay.className = 'see-all-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="see-all-header">
      <button class="see-all-back" onclick="closeSeeAll()">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="see-all-title">${label}</span>
      <span class="see-all-count">${deduped.length} title${deduped.length!==1?'s':''}</span>
    </div>
    <div class="see-all-grid">${deduped.map(m => m._isSeriesGroup ? seriesGroupCard(m) : movieCard(m)).join('')}</div>
  `;
  overlay.classList.add('open');
}

function closeSeeAll() {
  const o = document.getElementById('see-all-overlay');
  if (o) o.classList.remove('open');
}


// ── UPCOMING MOVIES TICKER + ROW ────────────────────────────
function renderUpcomingTicker() {
  const ticker  = document.getElementById('upcoming-ticker');
  const track   = document.getElementById('ticker-track');
  const rowBlock = document.getElementById('upcoming-row-block');
  const cardsRow = document.getElementById('upcoming-cards-row');
  const addBtn  = document.getElementById('upcoming-add-btn');

  if (addBtn) addBtn.style.display = adminUnlocked ? 'flex' : 'none';

  if (!comingSoon.length) {
    if (ticker) ticker.style.display = 'none';
    if (rowBlock) rowBlock.style.display = 'none';
    return;
  }

  // Scrolling ticker banner
  if (ticker && track) {
    ticker.style.display = 'flex';
    const items = [...comingSoon, ...comingSoon];
    track.innerHTML = items.map(c =>
      `<span class="ticker-item">${c.title}${c.date ? ' — ' + c.date : ''}</span>`
    ).join('');
    const speed = Math.max(15, comingSoon.length * 6);
    track.style.animationDuration = speed + 's';
  }

  // Upcoming cards row
  if (rowBlock && cardsRow) {
    rowBlock.style.display = 'block';
    cardsRow.innerHTML = comingSoon.map((c, i) => `
      <div class="mcard upcoming-card">
        <div class="mcard-thumb">
          ${c.thumb ? `<img src="${c.thumb}" loading="lazy" onerror="this.style.display='none'"/>` : `<div style="width:100%;height:100%;background:var(--s3);display:flex;align-items:center;justify-content:center"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".3"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg></div>`}
          <div class="upcoming-badge">Soon</div>
        </div>
        <div class="mcard-body">
          <div class="mcard-title">${c.title}</div>
          ${c.date ? `<div class="mcard-vj">${c.date}</div>` : ''}
        </div>
        ${adminUnlocked ? `<div class="mcard-btns"><button class="mc-btn mc-dl" style="flex:1" onclick="removeCS(${i})">✕ Remove</button></div>` : ''}
      </div>`).join('');
  }
}


// ── CHANGE PASSWORD ───────────────────────────────────────────
function openChangePass() {
  openModal('change-pass-modal');
  document.getElementById('cp-current').value = '';
  document.getElementById('cp-new').value = '';
  document.getElementById('cp-confirm').value = '';
  document.getElementById('cp-err').textContent = '';
}
function submitChangePass() {
  const current = document.getElementById('cp-current').value;
  const newPass  = document.getElementById('cp-new').value.trim();
  const confirm  = document.getElementById('cp-confirm').value.trim();
  const err      = document.getElementById('cp-err');
  if (current !== getAdminPass()) { err.textContent = 'Current password is wrong.'; return; }
  if (!newPass || newPass.length < 4) { err.textContent = 'New password must be at least 4 characters.'; return; }
  if (newPass !== confirm) { err.textContent = 'Passwords do not match.'; return; }
  setAdminPass(newPass);
  closeModal('change-pass-modal');
  showToast('Password changed successfully!');
}

// ── Init ──────────────────────────────────────────────────────
loadLocal();
loadDlHistory();
startFirebase();
showSection('home');

// ── SUBSCRIBER MANAGEMENT ────────────────────────────────────
const SUB_KEY = 'kp_subscribers';

function loadSubs() {
  try { subscribers = JSON.parse(localStorage.getItem(SUB_KEY) || '[]'); } catch(e) { subscribers = []; }
}
function saveSubs() { try { localStorage.setItem(SUB_KEY, JSON.stringify(subscribers)); } catch(e){} }

function addSubscriber() {
  const name  = document.getElementById('sub-name').value.trim();
  const phone = document.getElementById('sub-phone').value.trim();
  const plan  = document.getElementById('sub-plan').value;
  if (!name || !phone) { showToast('Enter name and phone', true); return; }
  const now     = Date.now();
  const months  = plan === 'yearly' ? 12 : plan === '3months' ? 3 : 1;
  const expires = now + months * 30 * 24 * 60 * 60 * 1000;
  subscribers.push({ id: now, name, phone, plan, joined: now, expires });
  saveSubs();
  document.getElementById('sub-name').value  = '';
  document.getElementById('sub-phone').value = '';
  renderSubs();
  showToast('Subscriber added!');
}

function deleteSubscriber(id) {
  subscribers = subscribers.filter(s => s.id !== id);
  saveSubs();
  renderSubs();
}

function renderSubs() {
  const el = document.getElementById('sub-list');
  if (!el) return;
  document.getElementById('sub-count').textContent = subscribers.length;
  if (!subscribers.length) { el.innerHTML = '<div class="empty-msg">No subscribers yet.</div>'; return; }
  const now = Date.now();
  el.innerHTML = subscribers.map(s => {
    const isActive = s.expires > now;
    const expDate  = new Date(s.expires).toLocaleDateString();
    const planLabel = s.plan === 'yearly' ? 'Yearly' : s.plan === '3months' ? '3 Months' : 'Monthly';
    const phone = s.phone.replace(/\D/g,'');
    return `<div class="sub-item">
      <div class="sub-info">
        <div class="sub-name">${s.name}</div>
        <div class="sub-phone">${s.phone} · ${planLabel}</div>
        <div class="sub-date">${isActive ? 'Expires' : 'Expired'}: ${expDate}</div>
      </div>
      <span class="sub-badge ${isActive?'active':'expired'}">${isActive?'Active':'Expired'}</span>
      <button class="sub-wa-btn" onclick="window.open('https://wa.me/${phone}','_blank')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
        Chat
      </button>
      <button class="sub-del-btn" onclick="deleteSubscriber(${s.id})">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>`;
  }).join('');
}

// Load subscribers on init
loadSubs();

// ── MOBILE MONEY PAYMENTS ────────────────────────────────────
const PAY_KEY = 'kp_payments';

function loadPayments() {
  try { payments = JSON.parse(localStorage.getItem(PAY_KEY) || '[]'); } catch(e) { payments = []; }
}
function savePayments() { try { localStorage.setItem(PAY_KEY, JSON.stringify(payments)); } catch(e){} }

function submitPayment() {
  const name  = document.getElementById('momo-name-inp').value.trim();
  const phone = document.getElementById('momo-phone-inp').value.trim();
  const txn   = document.getElementById('momo-txn-inp').value.trim();
  const plan  = document.getElementById('momo-plan-sel').value;
  if (!name)  { alert('Enter your name'); return; }
  if (!phone) { alert('Enter your phone number'); return; }
  if (!txn)   { alert('Enter your transaction ID'); return; }
  payments.push({ id: Date.now(), name, phone, txn, plan, status: 'pending', time: Date.now() });
  savePayments();
  closeModal('dl-modal');
  document.getElementById('momo-name-inp').value  = '';
  document.getElementById('momo-phone-inp').value = '';
  document.getElementById('momo-txn-inp').value   = '';
  showToast('Payment submitted! Admin will confirm shortly.');
}

function approvePayment(id) {
  const p = payments.find(p => p.id === id);
  if (!p) return;
  p.status = 'approved';
  savePayments();
  // Also add as subscriber
  const months = p.plan === 'yearly' ? 12 : p.plan === '3months' ? 3 : 1;
  subscribers.push({ id: Date.now(), name: p.name, phone: p.phone, plan: p.plan, joined: Date.now(), expires: Date.now() + months*30*24*60*60*1000 });
  saveSubs();
  renderPayments();
  renderSubs();
  showToast(p.name + ' approved!');
}

function rejectPayment(id) {
  const p = payments.find(p => p.id === id);
  if (!p) return;
  p.status = 'rejected';
  savePayments();
  renderPayments();
  showToast('Payment rejected.');
}

function renderPayments() {
  const el = document.getElementById('pay-list');
  if (!el) return;
  document.getElementById('pay-count').textContent = payments.filter(p => p.status === 'pending').length;
  if (!payments.length) { el.innerHTML = '<div class="empty-msg">No payment requests yet.</div>'; return; }
  const sorted = [...payments].sort((a,b) => b.time - a.time);
  el.innerHTML = sorted.map(p => {
    const planLabel = p.plan === 'yearly' ? 'Yearly' : p.plan === '3months' ? '3 Months' : 'Monthly';
    const timeStr = new Date(p.time).toLocaleString();
    return `<div class="pay-item ${p.status}">
      <div class="pay-row">
        <div class="pay-name">${p.name}</div>
        <span class="pay-plan">${planLabel}</span>
      </div>
      <div class="pay-phone">${p.phone}</div>
      <div class="pay-txn">TXN: ${p.txn}</div>
      <div class="pay-time">${timeStr}</div>
      ${p.status === 'pending' ? `
      <div class="pay-status-row">
        <button class="pay-approve" onclick="approvePayment(${p.id})">✓ Approve</button>
        <button class="pay-reject"  onclick="rejectPayment(${p.id})">✗ Reject</button>
      </div>` : `<span class="pay-badge ${p.status}">${p.status}</span>`}
    </div>`;
  }).join('');
}

// Load on init
loadPayments();

// ── Admin: download link helper ──────────────────────────────
function previewDlLink(val) {
  const hint = document.getElementById('dl-link-hint');
  if (!hint) return;
  if (!val) { hint.style.color='var(--muted)'; hint.textContent='Paste the direct .mp4 URL from archive.org — not the details page link'; return; }
  if (/\.mp4(\?|$)/i.test(val)) {
    hint.style.color='var(--teal)'; hint.textContent='✓ Good — direct .mp4 link detected';
  } else if (val.includes('archive.org/details')) {
    hint.style.color='#ff9800'; hint.textContent='⚠ This is a details page link — for best downloads, use the direct .mp4 URL from archive.org/download/...';
  } else if (val.includes('archive.org')) {
    hint.style.color='var(--muted2)'; hint.textContent='archive.org link — app will try to find the .mp4 automatically';
  } else {
    hint.style.color='var(--muted2)'; hint.textContent='Custom URL detected';
  }
}

// ── FEATURED CAROUSEL ────────────────────────────────────────
const CS_KEY = 'kp_coming_soon';
function renderComingSoon() {
  const wrap  = document.getElementById('carousel-wrap');
  const track = document.getElementById('carousel-track');
  const dots  = document.getElementById('carousel-dots');
  const addBtn = document.getElementById('carousel-add-btn');
  if (!wrap || !track) return;
  if (addBtn) addBtn.style.display = adminUnlocked ? 'flex' : 'none';
  if (!comingSoon.length) { wrap.style.display = 'none'; stopCarousel(); renderUpcomingTicker(); return; }
  wrap.style.display = 'block';
  track.innerHTML = comingSoon.map((c,i) => `
    <div class="carousel-slide">
      <div class="carousel-bg" ${c.thumb ? `style="background-image:url('${c.thumb}')"` : ''}></div>
      <div class="carousel-overlay"></div>
      <div class="carousel-content">
        <div class="carousel-badge">🎬 Coming Soon</div>
        <div class="carousel-title">${c.title}</div>
        ${c.date ? `<div class="carousel-date">${c.date}</div>` : ''}
        ${adminUnlocked ? `<button class="carousel-del" onclick="removeCS(${i})">✕ Remove</button>` : ''}
      </div>
    </div>`).join('');
  if (dots) dots.innerHTML = comingSoon.map((_,i) =>
    '<span class="carousel-dot ' + (i===carouselIdx?'active':'') + '" onclick="goCarousel(' + i + ')"></span>'
  ).join('');
  goCarousel(Math.min(carouselIdx, comingSoon.length-1));
  startCarousel();
  renderUpcomingTicker();
}

function goCarousel(idx) {
  const track = document.getElementById('carousel-track');
  if (!track) return;
  carouselIdx = idx;
  track.style.transform = 'translateX(-' + (idx * 100) + '%)';
  document.querySelectorAll('.carousel-dot').forEach((d,i) => d.classList.toggle('active', i===idx));
}

function carouselMove(dir) {
  if (!comingSoon.length) return;
  goCarousel((carouselIdx + dir + comingSoon.length) % comingSoon.length);
  restartCarousel();
}

function startCarousel() {
  stopCarousel();
  if (comingSoon.length <= 1) return;
  carouselTimer = setInterval(() => goCarousel((carouselIdx + 1) % comingSoon.length), 5000);
}

function stopCarousel()   { if (carouselTimer) { clearInterval(carouselTimer); carouselTimer = null; } }
function restartCarousel(){ stopCarousel(); startCarousel(); }

function openCSAdmin() { openModal('cs-modal'); }

function addComingSoon() {
  const title = document.getElementById('cs-title-inp').value.trim();
  const thumb = document.getElementById('cs-thumb-inp').value.trim();
  const date  = document.getElementById('cs-date-inp').value.trim();
  if (!title) { showToast('Enter a title', true); return; }
  comingSoon.push({ title, thumb, date });
  saveCS(); renderComingSoon();
  closeModal('cs-modal');
  document.getElementById('cs-title-inp').value = '';
  document.getElementById('cs-thumb-inp').value = '';
  document.getElementById('cs-date-inp').value  = '';
  showToast('Added to carousel!');
}

function removeCS(i) {
  comingSoon.splice(i, 1);
  if (carouselIdx >= comingSoon.length) carouselIdx = 0;
  saveCS(); renderComingSoon();
}

function loadCS() { try { comingSoon = JSON.parse(localStorage.getItem(CS_KEY)||'[]'); } catch(e){ comingSoon=[]; } }
function saveCS() { try { localStorage.setItem(CS_KEY, JSON.stringify(comingSoon)); } catch(e){} }
loadCS();
