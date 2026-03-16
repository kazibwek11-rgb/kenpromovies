// ============================================================
//  KENPRO MOVIES — app.js v3.3
//  VJ rows • Horizontal scroll • Search overlay • Admin edit only
// ============================================================
const ADMIN_PASS = 'kenpro123';
const FAVS_KEY   = 'kp_favs';
const ADMIN_KEY  = 'kp_admin';

const VJS = ['VJ Junior','VJ Emmy','VJ Ice P','VJ Sammy','VJ Little T','VJ Jingo','VJ Ulio','VJ HD','VJ SMK'];

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
  if (sec==='favs')     renderFavs();
  if (sec==='settings') updateStats();
  if (sec==='admin')    renderLib();
  document.getElementById('content').scrollTop = 0;
}

// ── Render all ────────────────────────────────────────────────
function renderAll() {
  renderVJRows('home',      null);
  renderVJRows('movies',    'movie');
  renderVJRows('series',    'series');
  renderVJRows('animation', 'animation');
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
  return `<div class="vj-row-block">
    <div class="vj-row-head">
      <span class="vj-row-label">${label}</span>
      <span class="vj-row-count">${items.length} title${items.length!==1?'s':''}</span>
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
      <button class="mc-btn mc-dl" onclick="event.stopPropagation();downloadGate()">
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
        <button class="sd-ep-btn dl" onclick="event.stopPropagation();downloadGate()">
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
  document.getElementById('pl-title').textContent = m.title;
  document.getElementById('pi-title').textContent = m.title;
  document.getElementById('pi-ep').textContent    = '';
  document.getElementById('pi-meta').textContent  = [m.vj,m.year,m.genre].filter(Boolean).join(' · ');
  document.getElementById('pi-tags').innerHTML    = buildTags(m.vj,m.cat,m.genre,m.year);
  document.getElementById('ep-nav').style.display = 'none';
  setFavUI('item-'+id);
  buildPlayer(m.play);
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
  document.getElementById('pl-title').textContent = `${sname} — ${lbl}`;
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
  document.getElementById('player-overlay').classList.add('open');
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
  const isVid = /\.(mp4|webm|mkv|avi|mov)(\?|$)/i.test(url);
  if (isVid) {
    box.innerHTML = `<video controls autoplay playsinline style="width:100%;height:100%;background:#000"><source src="${url}"/>Your browser does not support this video.</video>`;
  } else {
    let embed = url;
    if (url.includes('archive.org') && !url.includes('/embed/')) {
      const m = url.match(/archive\.org\/(?:details|download)\/([^/?#]+)/);
      if (m) embed = 'https://archive.org/embed/'+m[1];
    }
    box.innerHTML = `<iframe src="${embed}" allowfullscreen allow="autoplay;fullscreen" style="width:100%;height:100%;border:none;background:#000"></iframe>`;
  }
}

function closePlayer() {
  document.getElementById('player-video').innerHTML = '';
  document.getElementById('player-overlay').classList.remove('open');
  curPlay = null;
}
function downloadGate() { openModal('dl-modal'); }

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
  if (document.getElementById('pin-inp').value===ADMIN_PASS) {
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

// ── Init ──────────────────────────────────────────────────────
loadLocal();
startFirebase();
showSection('home');
