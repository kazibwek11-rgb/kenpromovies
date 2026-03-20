/* ═══════════════════════════════════════
   KENMOVIES v5.2  —  app3-2.js
   Fixed: archive.org blank screen, player bugs,
          series/movies separation, poster cards,
          hero overlap, Firebase errors
   ═══════════════════════════════════════ */
'use strict';

/* ── STATE ─────────────────────────────── */
let allContent = [];
let favs = JSON.parse(localStorage.getItem('km_favs') || '[]');
let adminUnlocked = localStorage.getItem('km_admin') === '1';
let currentSection = 'home';
let heroItems = [], heroIdx = 0, heroTimer = null;
let libFilter = 'all', searchFilter = 'all';
let editId = null, deleteId = null;
let currentPlayItem = null, currentEpList = [], currentEpIdx = -1;
let currentSeriesItem = null, currentSeriesSeason = 1;
let deferredInstall = null;
let secretTaps = 0, secretTimer = null;

/* player state */
let kpVideo = null, kpIframe = null, kpIsVideo = false;
let kpPlaying = false, kpDragging = false;
let kpCtrlTimer = null, kpRotateDeg = 0, kpZoomed = false;
let kpCurrentUrl = null, kpCurrentDl = null;
let kpSpeedIdx = 2;
const KP_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/* ── UTILS ─────────────────────────────── */
const $ = id => document.getElementById(id);
const fmt = s => isNaN(s) || !isFinite(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

let toastT = null;
function showToast(msg, err = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.className = '', 2800);
}

/* ── ADMIN ─────────────────────────────── */
function getPass() { return localStorage.getItem('kp_admin_pass') || 'kenpro123'; }
function applyAdminUI() {
  const on = adminUnlocked;
  ['admin-btn', 'snav-admin'].forEach(id => { const el = $(id); if (el) el.style.display = on ? '' : 'none'; });
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = on ? '' : 'none');
}
function openPinModal() {
  if (adminUnlocked) {
    if (confirm('Hide admin panel?')) {
      adminUnlocked = false;
      localStorage.removeItem('km_admin');
      applyAdminUI();
      showToast('Admin hidden');
    }
    return;
  }
  $('pin-inp').value = ''; $('pin-err').textContent = '';
  openModal('pin-modal');
  setTimeout(() => $('pin-inp').focus(), 300);
}
function checkPin() {
  const v = $('pin-inp').value.trim();
  if (v === getPass()) {
    adminUnlocked = true;
    localStorage.setItem('km_admin', '1');
    closeModal('pin-modal');
    applyAdminUI();
    showToast('Admin unlocked ✓');
    showSection('admin');
  } else {
    $('pin-err').textContent = 'Wrong password';
    $('pin-inp').value = '';
  }
}
function goAdmin() {
  if (!adminUnlocked) { openPinModal(); return; }
  showSection('admin');
}
function togglePwEye() {
  const inp = $('pin-inp');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}
function submitChangePass() {
  const cur = $('cp-cur').value, nw = $('cp-new').value, conf = $('cp-conf').value;
  const err = $('cp-err');
  if (cur !== getPass()) { err.textContent = 'Wrong current password'; return; }
  if (nw.length < 4) { err.textContent = 'Min 4 characters'; return; }
  if (nw !== conf) { err.textContent = 'Passwords do not match'; return; }
  localStorage.setItem('kp_admin_pass', nw);
  closeModal('change-pass-modal');
  showToast('Password changed ✓');
}
function setATab(btn, tab) {
  document.querySelectorAll('.atab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.admin-sec').forEach(s => s.classList.remove('active'));
  btn.classList.add('active');
  const sec = $('admin-' + tab);
  if (sec) sec.classList.add('active');
  if (tab === 'library') renderLibrary();
  if (tab === 'subscribers') renderSubscribers();
  if (tab === 'payments') renderPayments();
}

/* ── MODALS ─────────────────────────────── */
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

/* ── NAVIGATION ─────────────────────────── */
function showSection(sec) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = $('page-' + sec);
  if (pg) { pg.classList.add('active'); $('content').scrollTop = 0; }
  currentSection = sec;
  document.querySelectorAll('.snav').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bnav').forEach(b => b.classList.remove('active'));
  const sn = $('snav-' + sec); if (sn) sn.classList.add('active');
  const bn = $('bnav-' + sec); if (bn) bn.classList.add('active');
  if (sec === 'favs') renderFavs();
  if (sec === 'downloads') renderDownloads();
  if (sec === 'settings') renderStats();
}

/* ── HERO ─────────────────────────────── */
function buildHero() {
  heroItems = allContent.filter(m => m.thumb).sort((a, b) => b.createdAt - a.createdAt).slice(0, 15);
  if (!heroItems.length) return;
  const heroSection = $('hero-section') || document.querySelector('.hero-section');
  if (heroSection) {
    heroSection.style.position = 'relative';
    heroSection.style.zIndex = '1';
    heroSection.style.marginBottom = '8px';
  }
  const dots = $('hero-dots');
  dots.innerHTML = heroItems.map((_, i) => `<div class="hdot${i === 0 ? ' on' : ''}" onclick="event.stopPropagation();setHero(${i})"></div>`).join('');
  setHero(0);
  clearInterval(heroTimer);
  heroTimer = setInterval(() => setHero((heroIdx + 1) % heroItems.length), 5000);
}
function setHero(i) {
  heroIdx = i;
  const m = heroItems[i];
  const img = $('hero-img');
  img.style.opacity = '0';
  img.onload = () => { img.style.opacity = '1'; };
  img.src = m.thumb || '';
  $('hero-title').textContent = m.sname || m.title || '';
  $('hero-meta').textContent = [m.vj, m.genre, m.year].filter(Boolean).join(' · ');
  document.querySelectorAll('.hdot').forEach((d, idx) => d.classList.toggle('on', idx === i));
}
function heroClick() {
  const m = heroItems[heroIdx];
  if (!m) return;
  openDetail(m);
}

/* ── POSTER CARD ─────────────────────────── */
function posterCard(m, opts = {}) {
  const div = document.createElement('div');
  div.className = 'pcard';
  div.style.cssText = 'overflow:hidden;position:relative;cursor:pointer;';
  div.onclick = () => openDetail(m);
  const img = m.thumb
    ? `<img src="${m.thumb}" alt="" onerror="this.style.display='none'" loading="lazy"
         style="width:100%;height:100%;object-fit:cover;display:block;"/>`
    : `<div class="pcard-noimg" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#1a1a2e;">
         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
           <rect x="2" y="2" width="20" height="20" rx="2"/>
           <path d="M12 8v8M8 12h8"/>
         </svg>
       </div>`;
  const vj = m.vj ? `<div class="pcard-vj" style="position:absolute;bottom:4px;left:4px;font-size:10px;background:rgba(0,0,0,0.7);color:#00e676;padding:2px 5px;border-radius:3px;">${m.vj}</div>` : '';
  const badge = m._isSeries && m._epCount
    ? `<div style="position:absolute;top:4px;right:4px;font-size:9px;background:rgba(229,9,20,0.9);color:#fff;padding:2px 5px;border-radius:3px;pointer-events:none;">${m._epCount} EP</div>`
    : '';
  const editBtn = (adminUnlocked && opts.showEdit)
    ? `<button class="pcard-edit-btn" onclick="event.stopPropagation();editItem('${m.id}')" style="position:absolute;top:4px;left:4px;z-index:2;">✎</button>`
    : '';
  div.innerHTML = `<div class="pcard-img" style="width:100%;height:100%;position:relative;">${img}${vj}${badge}${editBtn}</div>`;
  return div;
}

/* ── ROWS ─────────────────────────────── */
function makeRow(label, items, target, opts = {}) {
  if (!items.length) return null;
  const block = document.createElement('div');
  block.innerHTML = `<div class="row-head"><span class="row-lbl">${label}${items.length > 20 ? ` <span class="row-cnt">(${items.length})</span>` : ''}</span>${items.length > 6 ? `<button class="see-all">See all</button>` : ''}</div>`;
  block._items = items;
  block._label = label;
  const seeAllBtn = block.querySelector('.see-all');
  if (seeAllBtn) seeAllBtn.addEventListener('click', () => openSeeAllDirect(label, items));
  const row = document.createElement('div');
  row.className = 'hrow';
  items.slice(0, 20).forEach(m => row.appendChild(posterCard(m, opts)));
  block.appendChild(row);
  target.appendChild(block);
  return block;
}
function openSeeAllDirect(label, items) {
  $('sa-title').textContent = label;
  $('sa-cnt').textContent = items.length + ' titles';
  const grid = $('sa-grid'); grid.innerHTML = '';
  items.forEach(m => grid.appendChild(posterCard(m)));
  $('sa-ov').classList.add('open');
}

function buildRows() {
  const byNew = arr => [...arr].sort((a, b) => b.createdAt - a.createdAt);
  const movies     = byNew(allContent.filter(m => m.category === 'movie'));
  const animations = byNew(allContent.filter(m => m.category === 'animation'));
  const indians    = byNew(allContent.filter(m => m.category === 'indian'));
  const seriesEps  = allContent.filter(m => m.category === 'series');

  const seriesMap = {};
  seriesEps.forEach(m => {
    const key = (m.sname || m.title || '').trim();
    if (!key) return;
    if (!seriesMap[key]) seriesMap[key] = [];
    seriesMap[key].push(m);
  });
  const seriesCards = Object.entries(seriesMap).map(([sname, eps]) => {
    const rep = byNew(eps)[0];
    return { ...rep, sname, _isSeries: true, _epCount: eps.length };
  });
  const seriesSorted = byNew(seriesCards);

  const vjMapMovies = {};
  movies.forEach(m => {
    const vj = (m.vj || 'Other').trim();
    if (!vjMapMovies[vj]) vjMapMovies[vj] = [];
    vjMapMovies[vj].push(m);
  });

  /* HOME */
  const hh = $('vj-rows-home'); hh.innerHTML = '';
  if (movies.length)       makeRow('Latest Movies',  movies,       hh);
  if (seriesSorted.length) makeRow('Latest Series',  seriesSorted, hh);
  if (animations.length)   makeRow('Animation',      animations,   hh);
  if (indians.length)      makeRow('Indian',          indians,      hh);
  Object.entries(vjMapMovies).forEach(([vj, items]) => {
    if (items.length >= 2) makeRow(vj, byNew(items), hh);
  });

  /* MOVIES PAGE */
  const hm = $('vj-rows-movies'); hm.innerHTML = '';
  if (movies.length) {
    const vjsM = [...new Set(movies.map(m => m.vj || 'Other'))];
    vjsM.forEach(vj => {
      const items = movies.filter(m => (m.vj || 'Other') === vj);
      if (items.length) makeRow(vj, byNew(items), hm, { showEdit: true });
    });
  } else {
    hm.innerHTML = '<div class="empty-page">No movies yet.</div>';
  }

  /* SERIES PAGE */
  const hs = $('vj-rows-series'); hs.innerHTML = '';
  if (seriesSorted.length) {
    makeRow('All Series', seriesSorted, hs);
    Object.entries(seriesMap).forEach(([sname, eps]) => {
      const sorted = eps.sort((a, b) => {
        if ((a.season || 1) !== (b.season || 1)) return (a.season || 1) - (b.season || 1);
        return (a.epNum || 1) - (b.epNum || 1);
      });
      makeRow(sname, sorted, hs);
    });
  } else {
    hs.innerHTML = '<div class="empty-page">No series yet.</div>';
  }

  /* INDIAN */
  const hi = $('vj-rows-indian'); hi.innerHTML = '';
  if (indians.length) makeRow('Indian', indians, hi, { showEdit: true });
  else hi.innerHTML = '<div class="empty-page">No Indian content yet.</div>';

  /* ANIMATION */
  const ha = $('vj-rows-animation'); ha.innerHTML = '';
  if (animations.length) makeRow('Animation', animations, ha, { showEdit: true });
  else ha.innerHTML = '<div class="empty-page">No animation yet.</div>';
}

/* ── STATS ─────────────────────────────── */
function renderStats() {
  const movies = allContent.filter(m => m.category === 'movie').length;
  const series = [...new Set(allContent.filter(m => m.category === 'series').map(m => m.sname || m.title))].length;
  const anim = allContent.filter(m => m.category === 'animation').length;
  if ($('st-total')) $('st-total').textContent = allContent.length;
  if ($('st-movies')) $('st-movies').textContent = movies;
  if ($('st-series')) $('st-series').textContent = series;
  if ($('st-anim')) $('st-anim').textContent = anim;
}

/* ── FAVS ─────────────────────────────── */
function renderFavs() {
  const grid = $('grid-favs'); grid.innerHTML = '';
  const items = allContent.filter(m => favs.includes(m.id));
  if (!items.length) { grid.innerHTML = '<div class="empty-page">No favourites yet. Heart a movie to save it here.</div>'; return; }
  items.forEach(m => grid.appendChild(posterCard(m)));
}
function isFav(id) { return favs.includes(id); }
function toggleFav() {
  if (!currentPlayItem) return;
  const id = currentPlayItem.id;
  if (isFav(id)) favs = favs.filter(f => f !== id);
  else favs.push(id);
  localStorage.setItem('km_favs', JSON.stringify(favs));
  updateFavUI();
}
function updateFavUI() {
  if (!currentPlayItem) return;
  const on = isFav(currentPlayItem.id);
  const ico = $('pi-fav-ico');
  if (ico) ico.innerHTML = on ? '<use href="#ic-heart-f"/>' : '<use href="#ic-heart"/>';
  const btn = $('pi-fav-btn');
if (btn) { btn.classList.toggle('fav-on', on); }
 const txt = $('pi-fav-txt');
   if (txt) txt.textContent = on ? 'Saved' : 'Save';
}
function toggleDetailFav() {
  if (!currentPlayItem) return;
  toggleFav();
  const btn = document.querySelector('.btn-fav');
  if (btn) { const on = isFav(currentPlayItem.id); btn.classList.toggle('on', on); btn.querySelector('span').textContent = on ? 'Saved' : 'Save'; }
}
function toggleSeriesFav() {
  if (!currentSeriesItem) return;
  currentPlayItem = currentSeriesItem;
  toggleFav();
  const ico = $('sd-fav-ico');
  if (ico) ico.innerHTML = isFav(currentSeriesItem.id) ? '<use href="#ic-heart-f"/>' : '<use href="#ic-heart"/>';
}

/* ── SEARCH ─────────────────────────────── */
function openSearch() { $('search-ov').classList.add('open'); setTimeout(() => $('search-inp').focus(), 200); }
function closeSearch() { $('search-ov').classList.remove('open'); }
function clearSearch() { $('search-inp').value = ''; doSearch(''); }
function setSF(btn, f) {
  searchFilter = f;
  document.querySelectorAll('.sf').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  doSearch($('search-inp').value);
}
function doSearch(q) {
  const res = $('search-results');
  q = q.trim().toLowerCase();
  if (!q) { res.innerHTML = '<div class="search-empty">Start typing to search...</div>'; return; }
  let items = allContent;
  if (searchFilter !== 'all') items = items.filter(m => m.category === searchFilter);
  const found = items.filter(m => (m.title || '').toLowerCase().includes(q) || (m.sname || '').toLowerCase().includes(q) || (m.vj || '').toLowerCase().includes(q) || (m.genre || '').toLowerCase().includes(q));
  if (!found.length) { res.innerHTML = '<div class="search-empty">Nothing found for "' + q + '"</div>'; return; }
  res.innerHTML = `<div class="search-count">${found.length} result${found.length > 1 ? 's' : ''}</div>`;
  const grid = document.createElement('div'); grid.className = 'pgrid';
  found.forEach(m => grid.appendChild(posterCard(m)));
  res.appendChild(grid);
}

/* ── DETAIL OVERLAY ─────────────────────── */
function openDetail(m) {
  currentPlayItem = m;
  if (m.category === 'series' || m._isSeries) {
    openSeriesDetail((m.sname || m.title || '').trim(), m);
    return;
  }
  const isF = isFav(m.id);
  const db = $('detail-body');
  db.innerHTML = `
    <div class="det-hero">
      <img src="${m.thumb || ''}" alt="" onerror="this.src=''"/>
      <div class="det-hero-grad"></div>
      <div class="det-topbar">
        <button class="det-back" onclick="closeDetail()"><svg width="20" height="20"><use href="#ic-back"/></svg></button>
        <button class="det-back" id="detail-fav-btn" onclick="toggleDetailFav()"><svg width="18" height="18" id="detail-fav-ico"><use href="${isF ? '#ic-heart-f' : '#ic-heart'}"/></svg></button>
      </div>
    </div>
    <div class="det-body">
      <div class="det-title">${m.title || m.sname || ''}</div>
      <div class="det-meta">
        ${m.vj ? `<span class="det-vj">${m.vj}</span>` : ''}
        ${m.year ? `<span class="det-tag">${m.year}</span>` : ''}
        ${m.genre ? `<span class="det-tag">${m.genre}</span>` : ''}
      </div>
      <p class="det-desc">${m.description || m.desc || 'No description available.'}</p>
      <div class="det-actions">
        <button class="btn-play" onclick="playItem(currentPlayItem)"><svg width="16" height="16"><use href="#ic-play"/></svg> Play Now</button>
        ${m.dlLink ? `<button class="btn-dl" onclick="startDownload(currentPlayItem)"><svg width="14" height="14"><use href="#ic-dl"/></svg> Download</button>` : ''}
        <button class="btn-fav${isF ? ' on' : ''}" onclick="toggleDetailFav()"><svg width="14" height="14"><use href="${isF ? '#ic-heart-f' : '#ic-heart'}"/></svg> <span>${isF ? 'Saved' : 'Save'}</span></button>
      </div>
      <div class="more-title">More like these</div>
      <div class="more-row" id="det-more-row"></div>
    </div>`;
  $('detail-ov').classList.add('open');
  buildMoreRow($('det-more-row'), m);
}
function closeDetail() { $('detail-ov').classList.remove('open'); }
function buildMoreRow(container, m) {
  if (!container) return;
  const more = allContent.filter(x => x.id !== m.id && (x.category === m.category || (m.vj && x.vj === m.vj))).slice(0, 10);
  more.forEach(x => {
    const card = document.createElement('div'); card.className = 'more-card';
    card.onclick = () => openDetail(x);
    card.style.cssText = 'position:relative;overflow:hidden;cursor:pointer;flex:0 0 auto;';
    card.innerHTML = `
      <div class="more-poster" style="position:relative;width:100%;height:100%;">
        <img src="${x.thumb || ''}" alt="" onerror="this.style.display='none'" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;"/>
        <div style="position:absolute;bottom:0;left:0;right:0;padding:4px 6px;background:linear-gradient(transparent,rgba(0,0,0,0.85));font-size:10px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${x.title || x.sname || ''}</div>
      </div>`;
    container.appendChild(card);
  });
}

/* ── SERIES DETAIL ─────────────────────── */
function openSeriesDetail(sname, firstEp) {
  currentSeriesItem = firstEp;
  const allEps = allContent.filter(m => (m.sname || m.title) === sname).sort((a, b) => {
    if (a.season !== b.season) return (a.season || 1) - (b.season || 1);
    return (a.epNum || 1) - (b.epNum || 1);
  });
  const seasons = [...new Set(allEps.map(e => e.season || 1))].sort((a, b) => a - b);
  currentSeriesSeason = seasons[0] || 1;
  const img = firstEp.thumb || '';
  const sd = $('sd-back-img');
  sd.style.backgroundImage = img ? `url('${img}')` : 'none';
  $('sd-title').textContent = sname;
  $('sd-vj').textContent = firstEp.vj || '';
  $('sd-genres').textContent = [firstEp.genre, firstEp.year].filter(Boolean).join(' · ');
  $('sd-desc').textContent = firstEp.description || firstEp.desc || '';
  const ico = $('sd-fav-ico');
  ico.innerHTML = isFav(firstEp.id) ? '<use href="#ic-heart-f"/>' : '<use href="#ic-heart"/>';
  const menu = $('sd-season-menu'); menu.innerHTML = '';
  seasons.forEach(s => {
    const opt = document.createElement('div'); opt.className = 'sd-sopt';
    opt.textContent = 'Season ' + s; opt.onclick = () => { currentSeriesSeason = s; renderSeriesEps(allEps); toggleSeasonMenu(); $('sd-season-label').textContent = 'Season ' + s; };
    menu.appendChild(opt);
  });
  $('sd-season-label').textContent = 'Season ' + currentSeriesSeason;
  renderSeriesEps(allEps);
  showSection('detail');
}
function toggleSeasonMenu() {
  const m = $('sd-season-menu'); m.classList.toggle('open');
  const ch = $('sd-chevron'); ch.style.transform = m.classList.contains('open') ? 'rotate(90deg)' : '';
}
function renderSeriesEps(allEps) {
  const eps = allEps.filter(e => (e.season || 1) === currentSeriesSeason).sort((a, b) => (a.epNum || 1) - (b.epNum || 1));
  const cont = $('sd-eps'); cont.innerHTML = '';
  eps.forEach((ep, i) => {
    const card = document.createElement('div'); card.className = 'sd-ep';
    card.innerHTML = `<div class="sd-ep-thumb"><img src="${ep.thumb || ''}" alt="" onerror="this.style.display='none'" loading="lazy"/></div><div class="sd-ep-body"><div class="sd-ep-code">S${ep.season || 1} E${ep.epNum || i + 1}</div><div class="sd-ep-name">${ep.epTitle || ep.title || ''}</div></div><div class="sd-ep-btns"><button class="sd-play-btn" onclick="event.stopPropagation();playEp(${JSON.stringify(ep).replace(/"/g, '&quot;')},${i},${JSON.stringify(eps.map(e => e.id)).replace(/"/g, '&quot;')})"><svg width="14" height="14"><use href="#ic-play"/></svg></button>${ep.dlLink ? `<button class="sd-dl-btn" onclick="event.stopPropagation();startDownloadByUrl('${ep.dlLink}','${ep.epTitle || ep.title || 'Episode'}')"><svg width="14" height="14"><use href="#ic-dl"/></svg></button>` : ''}</div>`;
    card.onclick = () => playEp(ep, i, eps);
    cont.appendChild(card);
  });
}
function playEp(ep, idx, epList) {
  currentEpList = Array.isArray(epList) ? epList : allContent.filter(m => m.sname === ep.sname).sort((a, b) => (a.season - b.season) || ((a.epNum || 0) - (b.epNum || 0)));
  currentEpIdx = idx;
  playItem(ep);
}
function playAdjacentEp(dir) {
  const newIdx = currentEpIdx + dir;
  if (newIdx < 0 || newIdx >= currentEpList.length) { showToast(dir < 0 ? 'First episode' : 'Last episode'); return; }
  currentEpIdx = newIdx;
  playItem(currentEpList[newIdx]);
}

/* ── PLAY ─────────────────────────────── */
function playItem(m) {
  if (!m) return;
  currentPlayItem = m;
  kpCurrentDl = m.dlLink || m.playLink || '';
  openPlayer(m);
}

/* ── PLAYER ─────────────────────────────── */
function openPlayer(m) {
  const ov = $('player-ov'); ov.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  /* Show info card */
  const piCard = $('pi-card');
  if (piCard) piCard.style.display = 'flex';

  /* Poster */
  const piImg = $('pi-img');
  if (piImg) piImg.src = m.thumb || '';

  /* Titles */
  const piTitle = $('pi-title');
  if (piTitle) piTitle.textContent = m.sname || m.title || '';

  const piEp = $('pi-ep');
  if (piEp) piEp.textContent = m.epTitle ? `S${m.season || 1} E${m.epNum || 1}: ${m.epTitle}` : '';

  const piMeta = $('pi-meta');
  if (piMeta) piMeta.textContent = [m.vj, m.genre, m.year].filter(Boolean).join(' · ');

  const kpTtl = $('kp-ttl');
  if (kpTtl) kpTtl.textContent = m.sname || m.title || '';

  const kpEp = $('kp-ep');
  if (kpEp) kpEp.textContent = m.epTitle ? `S${m.season || 1} E${m.epNum || 1}: ${m.epTitle}` : '';

  updateFavUI();

  /* Episode nav */
  const epNav = $('ep-nav');
  if (epNav) {
    if (currentEpList.length > 1) {
      epNav.style.display = 'flex';
      const epNl = $('ep-nl');
      if (epNl) epNl.textContent = `Ep ${currentEpIdx + 1} of ${currentEpList.length}`;
      const epPrev = $('ep-prev');
      if (epPrev) epPrev.disabled = currentEpIdx <= 0;
      const epNext = $('ep-next');
      if (epNext) epNext.disabled = currentEpIdx >= currentEpList.length - 1;
    } else {
      epNav.style.display = 'none';
    }
  }

  /* More like these */
  const mr = $('more-row');
  if (mr) { mr.innerHTML = ''; buildMoreRow(mr, m); }

  kpLoad(m.playLink || m.dlLink || '');
}
function closePlayer() {
  kpStop();
  const wrap = $('kp-wrap');
  wrap.style.aspectRatio = '';
  wrap.style.flex = '';
  wrap.style.minHeight = '';
  $('kp-ctrl').style.display = '';
  $('player-ov').style.display = 'none';
  document.body.style.overflow = '';
}

/* ════════════════════════════════════════════
   FIXED VIDEO PLAYER — v5.2
   Full archive.org support with filename extraction
   ════════════════════════════════════════════ */

function kpLoad(url) {
  console.log('[KP] kpLoad:', url);
  kpCurrentUrl = url;
  const container = $('player-video');
  if (!container) return;
  container.innerHTML = '';
  const wrap = $('kp-wrap');
  if (wrap) { const ob = wrap.querySelector('[data-extra]'); if (ob) ob.remove(); }
  const ctrl = $('kp-ctrl'); if (ctrl) ctrl.style.display = '';
  kpVideo = null; kpIframe = null; kpIsVideo = false;
  showKpState('loading');

  if (!url || !url.trim()) { showKpState('error'); return; }

  const isYT         = /youtu\.?be|youtube\.com/i.test(url);
  const isArchiveAny = /archive\.org/i.test(url);
  const isDirect     = !isArchiveAny && /\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(url);

  if (isYT) {
    kpLoadIframe(ytEmbedUrl(url));
  } else if (isArchiveAny) {
    kpLoadArchive(url);
  } else if (isDirect) {
    kpLoadVideo(url);
  } else {
    kpLoadIframe(url);
  }
}

/* ── ARCHIVE.ORG HANDLER ─────────────────
   Extracts itemId AND filename from any archive.org URL format:
   - https://archive.org/details/ITEM_ID
   - https://archive.org/embed/ITEM_ID
   - https://archive.org/download/ITEM_ID/file.mp4
   - https://ia902345.us.archive.org/NN/items/ITEM_ID/file.mp4
   ────────────────────────────────────────── */
function kpLoadArchive(url) {
  let itemId = '';
  let fileName = '';

  try {
    const u = new URL(url);
    const host = u.hostname; // e.g. "archive.org" or "ia902345.us.archive.org"
    const path = u.pathname;

    if (/^ia\d+\./i.test(host)) {
      /* ia subdomain: /NN/items/ITEM_ID/file.mp4 */
      const m = path.match(/\/items\/([^\/]+)\/(.+)/);
      if (m) { itemId = m[1]; fileName = m[2]; }
    } else {
      /* archive.org/details|embed|download/ITEM_ID/optional_file */
      const m = path.match(/\/(details|embed|download)\/([^\/\?#]+)\/?([^?#]*)?/);
      if (m) {
        itemId   = m[2];
        fileName = (m[3] || '').replace(/\/$/, ''); // strip trailing slash
      }
    }
  } catch {
    /* URL parse failed — try regex fallback */
    const m = url.match(/(?:details|embed|download)\/([^\/\?#&]+)\/?([^?#&]*)?/);
    if (m) { itemId = m[1]; fileName = (m[2] || ''); }
  }

  if (!itemId) {
    /* Cannot determine item ID — try iframe with original URL */
    kpLoadIframe(url);
    return;
  }

  /* If we have a filename that is a direct video file, try native player first.
     It loads faster and gives us full controls (seek, speed, etc.) */
  if (fileName && /\.(mp4|webm|ogv)$/i.test(fileName)) {
    const directUrl = `https://archive.org/download/${itemId}/${fileName}`;
    kpLoadVideoWithFallback(directUrl, itemId, fileName);
    return;
  }

  /* No filename or non-video path — use embed iframe */
  const embedUrl = `https://archive.org/embed/${itemId}?autoplay=1`;
  kpLoadIframe(embedUrl);
}

/* Try native video; if it errors (CORS / range issues) fall back to embed iframe */
function kpLoadVideoWithFallback(directUrl, itemId, fileName) {
  const container = $('player-video');
  const vid = document.createElement('video');
  vid.controls = false;
  vid.playsInline = true;
  vid.setAttribute('playsinline', '');
  vid.setAttribute('webkit-playsinline', '');
  vid.preload = 'metadata';
  vid.style.cssText = 'width:100%;height:100%;display:block;background:#000;object-fit:contain';

  const src = document.createElement('source');
  src.src = directUrl;
  src.type = /\.webm$/i.test(directUrl) ? 'video/webm' : 'video/mp4';
  vid.appendChild(src);
  container.appendChild(vid);
  kpVideo = vid;
  kpIsVideo = true;

  let errFired = false;

  vid.addEventListener('loadedmetadata', () => { showKpState(''); });
  vid.addEventListener('canplay', () => { showKpState(''); kpPlay(); });
  vid.addEventListener('playing', () => { showKpState(''); kpSetPlayIcon(true); });
  vid.addEventListener('pause', () => kpSetPlayIcon(false));
  vid.addEventListener('waiting', () => showKpState('loading'));
  vid.addEventListener('timeupdate', kpTimeUpdate);
  vid.addEventListener('progress', kpBufferUpdate);
  vid.addEventListener('ended', () => {
    kpSetPlayIcon(false);
    if (currentEpIdx >= 0 && currentEpList.length > 1) playAdjacentEp(1);
  });
  vid.addEventListener('error', () => {
    if (errFired) return;
    errFired = true;
    /* Native video failed — fall back to embed iframe */
    kpStop();
    const embedUrl = `https://archive.org/embed/${itemId}?autoplay=1`;
    kpLoadIframe(embedUrl);
  });

  vid.load();
  setTimeout(() => {
    if (kpVideo && !kpPlaying) {
      vid.play().catch(() => {
        /* Autoplay blocked — show controls, user taps play */
        showKpState('');
        kpSetPlayIcon(false);
      });
    }
  }, 600);
}

function ytEmbedUrl(url) {
  let id = '';
  try {
    const u = new URL(url);
    id = u.searchParams.get('v') || u.pathname.split('/').pop();
  } catch { id = url.split('/').pop().split('?')[0]; }
  return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
}

function kpLoadVideo(url) {
  const container = $('player-video');
  const vid = document.createElement('video');
  vid.controls = false;
  vid.playsInline = true;
  vid.setAttribute('playsinline', '');
  vid.setAttribute('webkit-playsinline', '');
  vid.preload = 'metadata';
  vid.style.cssText = 'width:100%;height:100%;display:block;background:#000;object-fit:contain';
  const src = document.createElement('source');
  src.src = url;
  src.type = url.includes('.webm') ? 'video/webm' : url.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4';
  vid.appendChild(src);
  container.appendChild(vid);
  kpVideo = vid;
  kpIsVideo = true;

  vid.addEventListener('loadedmetadata', () => { showKpState(''); });
  vid.addEventListener('canplay', () => { showKpState(''); kpPlay(); });
  vid.addEventListener('playing', () => { showKpState(''); kpSetPlayIcon(true); });
  vid.addEventListener('pause', () => kpSetPlayIcon(false));
  vid.addEventListener('waiting', () => showKpState('loading'));
  vid.addEventListener('timeupdate', kpTimeUpdate);
  vid.addEventListener('progress', kpBufferUpdate);
  vid.addEventListener('ended', () => {
    kpSetPlayIcon(false);
    if (currentEpIdx >= 0 && currentEpList.length > 1) playAdjacentEp(1);
  });
  vid.addEventListener('error', () => showKpState('error'));
  vid.load();
  setTimeout(() => {
    if (!kpPlaying && kpVideo) {
      vid.play().catch(() => { showKpState(''); kpSetPlayIcon(false); });
    }
  }, 800);
}

function kpLoadIframe(url) {
  const container = $('player-video');
  const fr = document.createElement('iframe');
  fr.src = url;
  fr.allowFullscreen = true;
  fr.setAttribute('allowfullscreen', '');
  fr.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
  fr.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;background:#000;display:block;';
  container.style.cssText = 'position:relative;width:100%;height:100%;min-height:240px;background:#000;';
  container.appendChild(fr);
  kpIframe = fr;
  kpIsVideo = false;
  $('kp-ctrl').style.display = 'none';
  const wrap = $('kp-wrap');
  wrap.style.aspectRatio = 'unset';
  wrap.style.flex = '1';
  wrap.style.minHeight = '56vw';
  const oldExtra = wrap.querySelector('[data-extra]');
  if (oldExtra) oldExtra.remove();
  const backBtn = document.createElement('button');
  backBtn.setAttribute('data-extra', '1');
  backBtn.style.cssText = 'position:absolute;top:12px;left:12px;z-index:100;width:42px;height:42px;border-radius:50%;background:rgba(0,0,0,0.7);border:2px solid rgba(255,255,255,0.3);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;';
  backBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
  backBtn.onclick = closePlayer;
  wrap.appendChild(backBtn);
  fr.onload = () => showKpState('');
  setTimeout(() => showKpState(''), 2500);
}

function kpPlay() {
  if (!kpVideo) return;
  kpVideo.play().then(() => { kpPlaying = true; kpSetPlayIcon(true); }).catch(() => showKpState('error'));
}
function kpPause() {
  if (!kpVideo) return;
  kpVideo.pause(); kpPlaying = false; kpSetPlayIcon(false);
}
function kpTogglePlay() {
  if (!kpVideo) return;
  if (kpVideo.paused) kpPlay(); else kpPause();
}
function kpStop() {
  if (kpVideo) { kpVideo.pause(); kpVideo.src = ''; kpVideo = null; }
  kpIframe = null; kpIsVideo = false; kpPlaying = false;
  $('player-video').innerHTML = '';
  $('kp-ctrl').style.display = '';
  resetProgress();
}
function kpRetry() { if (kpCurrentUrl) kpLoad(kpCurrentUrl); }

function kpSetPlayIcon(playing) {
  kpPlaying = playing;
  const ico = $('kp-pico');
  if (!ico) return;
  ico.innerHTML = playing
    ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
    : '<polygon points="5,3 19,12 5,21"/>';
}

function showKpState(state) {
  $('kp-load').style.display = state === 'loading' ? 'flex' : 'none';
  $('kp-err').style.display  = state === 'error'   ? 'flex' : 'none';
}

/* PROGRESS */
function kpTimeUpdate() {
  if (!kpVideo || kpDragging) return;
  const dur = kpVideo.duration || 0, cur = kpVideo.currentTime || 0;
  const pct = dur ? (cur / dur * 100) : 0;
  $('kp-fill').style.width = pct + '%';
  $('kp-thumb').style.left = pct + '%';
  $('kp-time').textContent = fmt(cur) + ' / ' + fmt(dur);
}
function kpBufferUpdate() {
  if (!kpVideo) return;
  try {
    const buf = kpVideo.buffered, dur = kpVideo.duration || 1;
    if (buf.length) $('kp-buf').style.width = (buf.end(buf.length - 1) / dur * 100) + '%';
  } catch {}
}
function resetProgress() {
  if ($('kp-fill')) $('kp-fill').style.width = '0%';
  if ($('kp-thumb')) $('kp-thumb').style.left = '0%';
  if ($('kp-time')) $('kp-time').textContent = '0:00 / 0:00';
}
function kpProgClick(e) {
  if (!kpVideo) return;
  const rect = $('kp-prog').getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  kpVideo.currentTime = pct * (kpVideo.duration || 0);
}

/* PROG DRAG */
function initProgDrag() {
  const prog = $('kp-prog');
  if (!prog) return;
  const seek = e => {
    if (!kpVideo) return;
    const t = e.touches ? e.touches[0] : e;
    const rect = prog.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width));
    kpVideo.currentTime = pct * (kpVideo.duration || 0);
    $('kp-fill').style.width = pct * 100 + '%';
    $('kp-thumb').style.left = pct * 100 + '%';
  };
  prog.addEventListener('mousedown', e => { kpDragging = true; prog.classList.add('drag'); seek(e); });
  prog.addEventListener('touchstart', e => { kpDragging = true; prog.classList.add('drag'); seek(e); }, { passive: true });
  document.addEventListener('mousemove', e => { if (kpDragging) seek(e); });
  document.addEventListener('touchmove', e => { if (kpDragging) seek(e); }, { passive: true });
  document.addEventListener('mouseup', () => { kpDragging = false; if ($('kp-prog')) $('kp-prog').classList.remove('drag'); });
  document.addEventListener('touchend', () => { kpDragging = false; if ($('kp-prog')) $('kp-prog').classList.remove('drag'); });
}

/* CONTROLS */
function kpTap() {
  const ctrl = $('kp-ctrl');
  if (ctrl.classList.contains('hide')) { ctrl.classList.remove('hide'); kpResetCtrlTimer(); }
  else { ctrl.classList.add('hide'); }
}
function kpResetCtrlTimer() {
  clearTimeout(kpCtrlTimer);
  if (kpPlaying) kpCtrlTimer = setTimeout(() => { const c = $('kp-ctrl'); if (c) c.classList.add('hide'); }, 3500);
}
function kpSeek(sec) {
  if (!kpVideo) return;
  kpVideo.currentTime = Math.max(0, Math.min(kpVideo.currentTime + sec, kpVideo.duration || 0));
  const fl = sec < 0 ? $('kp-fl-l') : $('kp-fl-r');
  fl.style.opacity = '1'; setTimeout(() => fl.style.opacity = '0', 600);
  kpResetCtrlTimer();
}
function kpVol(v) { if (kpVideo) kpVideo.volume = v; }
function kpRotate() {
  kpRotateDeg = (kpRotateDeg + 90) % 360;
  const v = $('player-video');
  v.style.transform = `rotate(${kpRotateDeg}deg)`;
  v.style.width = kpRotateDeg % 180 ? '56vw' : '100%';
}
function kpZoom() {
  kpZoomed = !kpZoomed;
  const v = $('player-video');
  v.style.transform = kpZoomed ? `scale(1.4) rotate(${kpRotateDeg}deg)` : `rotate(${kpRotateDeg}deg)`;
  const btn = $('kp-zoom-btn'); if (btn) btn.classList.toggle('on', kpZoomed);
}
function kpFullscreen() {
  const wrap = $('kp-wrap');
  if (!document.fullscreenElement) {
    (wrap.requestFullscreen || wrap.webkitRequestFullscreen || wrap.mozRequestFullScreen || function () {}).call(wrap);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || function () {}).call(document);
  }
}
document.addEventListener('fullscreenchange', () => {
  const ico = $('kp-fs-ico'); if (!ico) return;
  ico.innerHTML = document.fullscreenElement ? '<use href="#ic-fs-exit"/>' : '<use href="#ic-fs"/>';
});
function kpCycleSpeed() {
  kpSpeedIdx = (kpSpeedIdx + 1) % KP_SPEEDS.length;
  const s = KP_SPEEDS[kpSpeedIdx];
  if (kpVideo) kpVideo.playbackRate = s;
  const btn = $('kp-spd'); if (btn) btn.textContent = s + '×';
}
function kpDownload() {
  const url = kpCurrentDl || kpCurrentUrl;
  if (!url) { showToast('No download link', true); return; }
  startDownloadByUrl(url, currentPlayItem?.title || 'Video');
}

/* ── DOWNLOAD SYSTEM ─────────────────────── */
function startDownload(m) {
  if (!m.dlLink) { showToast('No download link', true); return; }
  startDownloadByUrl(m.dlLink, m.title || m.sname || 'Video');
  showSection('downloads');
}
function startDownloadByUrl(url, title) {
  const a = document.createElement('a');
  a.href = url; a.download = title + '.mp4';
  a.target = '_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showToast('Download started!');
  const dls = JSON.parse(localStorage.getItem('km_dls') || '[]');
  const existing = dls.find(d => d.url === url);
  if (!existing) {
    dls.unshift({ id: Date.now(), url, title, thumb: currentPlayItem?.thumb || '', vj: currentPlayItem?.vj || '', savedAt: new Date().toISOString() });
    if (dls.length > 50) dls.pop();
    localStorage.setItem('km_dls', JSON.stringify(dls));
  }
  renderDownloads();
}
function renderDownloads() {
  const body = $('dl-body'); if (!body) return;
  const dls = JSON.parse(localStorage.getItem('km_dls') || '[]');
  if (!dls.length) { body.innerHTML = '<div class="dl-empty">No downloads yet.</div>'; return; }
  body.innerHTML = '';
  dls.forEach(dl => {
    const item = document.createElement('div'); item.className = 'dl-item';
    item.innerHTML = `<div class="dl-thumb"><img src="${dl.thumb || ''}" alt="" onerror="this.style.display='none'"/></div><div class="dl-info"><div class="dl-title">${dl.title || 'Video'}</div><div class="dl-vj">${dl.vj || ''}</div><div class="dl-fn">${dl.url || ''}</div></div><div class="dl-acts"><button class="dl-open" onclick="window.open('${dl.url}','_blank')">Open</button><button class="dl-remove" onclick="removeDownload(${dl.id})">Remove</button></div>`;
    body.appendChild(item);
  });
}
function removeDownload(id) {
  let dls = JSON.parse(localStorage.getItem('km_dls') || '[]');
  dls = dls.filter(d => d.id !== id);
  localStorage.setItem('km_dls', JSON.stringify(dls));
  renderDownloads();
}

/* ── SEE ALL ─────────────────────────────── */
function openSeeAll(label, ids) {
  $('sa-title').textContent = label;
  const items = Array.isArray(ids)
    ? ids.map(id => allContent.find(m => m.id === id)).filter(Boolean)
    : allContent.filter(m => m.category === label);
  $('sa-cnt').textContent = items.length + ' titles';
  const grid = $('sa-grid'); grid.innerHTML = '';
  items.forEach(m => grid.appendChild(posterCard(m)));
  $('sa-ov').classList.add('open');
}
function closeSeeAll() { $('sa-ov').classList.remove('open'); }

/* ── ADMIN UPLOAD ─────────────────────────── */
function setCat(btn, cat) {
  document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  $('f-cat').value = cat;
  const so = $('series-only-fields');
  so.style.display = cat === 'series' ? 'flex' : 'none';
  $('title-label').textContent = cat === 'series' ? 'Episode Title' : 'Movie Title';
}
function previewThumb(url) {
  const prev = $('thumb-prev');
  if (url && url.startsWith('http')) { prev.style.display = 'block'; $('thumb-prev-img').src = url; }
  else prev.style.display = 'none';
}
function previewDlLink(url) {
  const hint = $('dl-hint');
  if (!hint) return;
  if (!url) { hint.textContent = 'Paste direct .mp4 URL'; hint.className = 'fhint'; return; }
  const isMp4 = /\.(mp4|webm)(\?|$)/i.test(url) || /archive\.org\//i.test(url);
  if (isMp4) { hint.textContent = '✓ Looks like a direct link!'; hint.className = 'fhint ok'; }
  else { hint.textContent = '⚠ Should be a direct .mp4 or archive.org link'; hint.className = 'fhint warn'; }
}
function cancelEdit() {
  editId = null; $('edit-id').value = '';
  clearForm();
  $('form-mode-lbl').textContent = 'Add Content';
  $('submit-lbl').textContent = 'Add to Library';
  $('cancel-edit-btn').style.display = 'none';
}
function clearForm() {
  ['f-title', 'f-desc', 'f-genre', 'f-year', 'f-thumb', 'f-play', 'f-dl', 'f-series-name'].forEach(id => { const el = $(id); if (el) el.value = ''; });
  $('f-vj').value = ''; $('f-season').value = '1'; $('f-epnum').value = '1';
  $('thumb-prev').style.display = 'none';
}

/* Auto-fix partial archive.org URLs */
function fixUrl(url) {
  if (!url) return '';
  url = url.trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (/^(download|details|embed)\//.test(url)) return 'https://archive.org/' + url;
  if (/^archive\.org/i.test(url)) return 'https://' + url;
  return url;
}

async function submitContent() {
  const cat = $('f-cat').value;
  const title = $('f-title').value.trim();
  const sname = $('f-series-name')?.value.trim() || '';
  if (cat === 'series' && !sname) { showToast('Enter series name', true); return; }
  if (!title && cat !== 'series') { showToast('Enter a title', true); return; }
  if (cat === 'series' && !title) { showToast('Enter episode title', true); return; }
  const btn = $('submit-btn'); btn.disabled = true;

  const obj = {
    category: cat,
    title,
    sname: cat === 'series' ? sname : title,
    description: $('f-desc').value.trim(),
    vj: $('f-vj').value,
    year: $('f-year').value.trim(),
    genre: $('f-genre').value.trim(),
    thumb: $('f-thumb').value.trim(),
    playLink: fixUrl($('f-play').value),
    dlLink: fixUrl($('f-dl').value),
    createdAt: Date.now()
  };
  if (cat === 'series') {
    obj.season  = parseInt($('f-season').value) || 1;
    obj.epNum   = parseInt($('f-epnum').value) || 1;
    obj.epTitle = title;
  }

  try {
    if (editId) {
      await window._fb.updateDoc(window._fb.doc(window._db, 'content', editId), obj);
      showToast('Updated ✓');
    } else {
      await window._fb.addDoc(window._fb.collection(window._db, 'content'), obj);
      showToast('Added ✓');
    }
    cancelEdit(); clearForm();
  } catch (e) { showToast('Error: ' + e.message, true); }
  btn.disabled = false;
}

/* ── LIBRARY ─────────────────────────────── */
function setLibFilter(btn, f) {
  libFilter = f;
  document.querySelectorAll('.lib-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderLibrary();
}
function renderLibrary() {
  const list = $('lib-list'); const cnt = $('lib-count'); if (!list) return;
  let items = allContent;
  if (libFilter !== 'all') items = items.filter(m => m.category === libFilter);
  cnt.textContent = items.length + ' items'; list.innerHTML = '';
  items.slice(0, 100).forEach(m => {
    const card = document.createElement('div'); card.className = 'lib-card';
    card.innerHTML = `<img src="${m.thumb || ''}" alt="" onerror="this.src=''" loading="lazy"/><div class="lib-cname">${m.title || m.sname || 'Untitled'}</div><div class="lib-cvj">${m.vj || ''}</div><div class="lib-cbtns"><button class="lib-edit" onclick="editItem('${m.id}')">Edit</button><button class="lib-del" onclick="askDelete('${m.id}','${(m.title || m.sname || '').replace(/'/g, "\\'")}')">Del</button></div>`;
    list.appendChild(card);
  });
}
function editItem(id) {
  const m = allContent.find(x => x.id === id); if (!m) return;
  editId = id; $('edit-id').value = id;
  document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
  const catBtn = document.querySelector(`.cat-tab[data-cat="${m.category || 'movie'}"]`);
  if (catBtn) { catBtn.classList.add('active'); $('f-cat').value = m.category || 'movie'; }
  const so = $('series-only-fields');
  so.style.display = m.category === 'series' ? 'flex' : 'none';
  if ($('f-series-name')) $('f-series-name').value = m.sname || '';
  if ($('f-season')) $('f-season').value = m.season || 1;
  if ($('f-epnum')) $('f-epnum').value = m.epNum || 1;
  $('f-title').value = m.epTitle || m.title || '';
  $('f-desc').value = m.description || m.desc || '';
  $('f-vj').value = m.vj || '';
  $('f-year').value = m.year || '';
  $('f-genre').value = m.genre || '';
  $('f-thumb').value = m.thumb || '';
  $('f-play').value = m.playLink || '';
  $('f-dl').value = m.dlLink || '';
  previewThumb(m.thumb || '');
  $('form-mode-lbl').textContent = 'Editing: ' + (m.title || m.sname || '');
  $('submit-lbl').textContent = 'Save Changes';
  $('cancel-edit-btn').style.display = '';
  const uploadTab = document.querySelector('.atab');
  if (uploadTab) setATab(uploadTab, 'upload');
  showSection('admin');
  $('admin-upload').style.display = 'block';
}
function askDelete(id, name) {
  deleteId = id;
  $('del-modal-sub').textContent = 'Delete "' + name + '"? This cannot be undone.';
  openModal('del-modal');
}
async function confirmDelete() {
  if (!deleteId) return;
  try {
    await window._fb.deleteDoc(window._fb.doc(window._db, 'content', deleteId));
    showToast('Deleted ✓'); closeModal('del-modal'); deleteId = null; renderLibrary();
  } catch (e) { showToast('Error: ' + e.message, true); }
}

/* ── SUBSCRIBERS ─────────────────────────── */
async function addSubscriber() {
  const name = $('sub-name').value.trim(), phone = $('sub-phone').value.trim(), plan = $('sub-plan').value;
  if (!name || !phone) { showToast('Name and phone required', true); return; }
  try {
    await window._fb.addDoc(window._fb.collection(window._db, 'subscribers'), { name, phone, plan, createdAt: new Date().toISOString(), active: true });
    $('sub-name').value = ''; $('sub-phone').value = '';
    showToast('Subscriber added ✓'); renderSubscribers();
  } catch (e) { showToast('Error: ' + e.message, true); }
}
async function renderSubscribers() {
  const list = $('sub-list'); if (!list) return;
  try {
    const snap = await window._fb.getDocs(window._fb.collection(window._db, 'subscribers'));
    const subs = []; snap.forEach(d => subs.push({ id: d.id, ...d.data() }));
    if (!subs.length) { list.innerHTML = '<div class="empty-msg">No subscribers yet.</div>'; return; }
    list.innerHTML = '';
    subs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach(s => {
      const div = document.createElement('div'); div.className = 'sub-item';
      div.innerHTML = `<div class="sub-ifo"><div class="sub-name">${s.name || ''}</div><div class="sub-phone">${s.phone || ''}</div><div class="sub-date">${s.plan || ''} · ${s.createdAt ? new Date(s.createdAt).toLocaleDateString() : ''}</div></div><span class="sub-badge ${s.active ? 'active' : 'expired'}">${s.active ? 'Active' : 'Expired'}</span><button class="sub-wa" onclick="window.open('https://wa.me/${(s.phone || '').replace(/\D/g, '')}','_blank')"><svg width="14" height="14"><use href="#ic-wa"/></svg></button><button class="sub-del" onclick="deleteSub('${s.id}')"><svg width="12" height="12"><use href="#ic-trash"/></svg></button>`;
      list.appendChild(div);
    });
  } catch (e) { list.innerHTML = '<div class="empty-msg">Error loading.</div>'; }
}
async function deleteSub(id) {
  if (!confirm('Remove subscriber?')) return;
  try { await window._fb.deleteDoc(window._fb.doc(window._db, 'subscribers', id)); renderSubscribers(); showToast('Removed'); }
  catch (e) { showToast('Error', true); }
}

/* ── PAYMENTS ─────────────────────────────── */
async function renderPayments() {
  const list = $('pay-list'); if (!list) return;
  try {
    const snap = await window._fb.getDocs(window._fb.collection(window._db, 'payments'));
    const pays = []; snap.forEach(d => pays.push({ id: d.id, ...d.data() }));
    if (!pays.length) { list.innerHTML = '<div class="empty-msg">No payment requests yet.</div>'; return; }
    list.innerHTML = '';
    pays.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach(p => {
      const div = document.createElement('div'); div.className = 'pay-item';
      const btns = p.status ? `<span class="pay-badge ${p.status}">${p.status}</span>` : `<button class="pay-approve" onclick="updatePayment('${p.id}','approved')">Approve</button><button class="pay-reject" onclick="updatePayment('${p.id}','rejected')">Reject</button>`;
      div.innerHTML = `<div class="pay-name">${p.name || ''}</div><div class="pay-phone">${p.phone || ''}</div>${p.txnId ? `<div class="pay-txn">TXN: ${p.txnId}</div>` : ''}<div class="pay-time">${p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''}</div>${btns}`;
      list.appendChild(div);
    });
  } catch (e) { list.innerHTML = '<div class="empty-msg">Error loading.</div>'; }
}
async function updatePayment(id, status) {
  try { await window._fb.updateDoc(window._fb.doc(window._db, 'payments', id), { status }); renderPayments(); }
  catch (e) { showToast('Error', true); }
}

/* ── UPCOMING / COMING SOON ─────────────────── */
async function loadUpcoming() {
  try {
    const snap = await window._fb.getDocs(window._fb.collection(window._db, 'upcoming'));
    const items = []; snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    if (!items.length) return;
    $('upcoming-ticker').style.display = 'block';
    const track = $('ticker-track');
    const dupe = [...items, ...items];
    track.innerHTML = dupe.map(it => `<span class="ticker-item">🎬 ${it.title || ''} ${it.releaseDate ? '(' + it.releaseDate + ')' : ''}</span>`).join('');
    $('upcoming-row-block').style.display = 'block';
    const row = $('upcoming-cards-row'); row.innerHTML = '';
    items.forEach(it => {
      const card = document.createElement('div'); card.className = 'pcard';
      card.style.cssText = 'overflow:hidden;position:relative;cursor:default;';
      const img = it.thumb
        ? `<img src="${it.thumb}" alt="" onerror="this.style.display='none'" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;"/>`
        : `<div class="pcard-noimg" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#1a1a2e;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/></svg></div>`;
      const badge = it.releaseDate ? `<div style="position:absolute;bottom:4px;left:4px;font-size:9px;background:rgba(0,0,0,0.7);color:#fff;padding:2px 5px;border-radius:3px;">${it.releaseDate}</div>` : '';
      const del = adminUnlocked ? `<button class="pcard-edit-btn" onclick="event.stopPropagation();deleteUpcoming('${it.id}')" style="position:absolute;top:4px;right:4px;">✕</button>` : '';
      card.innerHTML = `<div class="pcard-img" style="width:100%;height:100%;position:relative;">${img}${badge}${del}</div>`;
      row.appendChild(card);
    });
    if (adminUnlocked) $('upcoming-add-btn').style.display = '';
  } catch {}
}
async function addCS() {
  const title = $('cs-title-inp').value.trim(), thumb = $('cs-thumb-inp').value.trim(), date = $('cs-date-inp').value.trim();
  if (!title) { showToast('Enter title', true); return; }
  try {
    await window._fb.addDoc(window._fb.collection(window._db, 'upcoming'), { title, thumb, releaseDate: date, createdAt: Date.now() });
    closeModal('cs-modal'); $('cs-title-inp').value = ''; $('cs-thumb-inp').value = ''; $('cs-date-inp').value = '';
    showToast('Added!'); loadUpcoming();
  } catch (e) { showToast('Error: ' + e.message, true); }
}
async function deleteUpcoming(id) {
  if (!confirm('Delete?')) return;
  try { await window._fb.deleteDoc(window._fb.doc(window._db, 'upcoming', id)); loadUpcoming(); } catch {}
}

/* ── SECRET TAPS ─────────────────────────── */
function secretTap() {
  secretTaps++;
  clearTimeout(secretTimer);
  const sc = $('secret-count');
  if (secretTaps < 7) {
    sc.style.color = 'var(--muted)'; sc.textContent = secretTaps;
    secretTimer = setTimeout(() => { secretTaps = 0; sc.style.color = 'transparent'; sc.textContent = '0'; }, 2000);
  } else {
    sc.style.color = 'transparent'; sc.textContent = '0'; secretTaps = 0; openPinModal();
  }
}

/* ── PWA INSTALL ─────────────────────────── */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstall = e;
  $('install-btn').style.display = '';
  const b = $('inst-banner'); if (b && !sessionStorage.getItem('km_banner_dismissed')) b.style.display = 'flex';
});
function triggerInstall() {
  if (deferredInstall) { deferredInstall.prompt(); deferredInstall.userChoice.then(() => { deferredInstall = null; $('inst-banner').style.display = 'none'; }); }
  else showToast('Open in browser to install', '');
}
function dismissBanner() { $('inst-banner').style.display = 'none'; sessionStorage.setItem('km_banner_dismissed', '1'); }

/* ── INIT ─────────────────────────────── */
function init() {
  applyAdminUI();
  initProgDrag();
  showSection('home');
  if (window._fbReady) loadContent();
  else document.addEventListener('fb-ready', loadContent);
  loadUpcoming();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

document.addEventListener('DOMContentLoaded', init);

/* ── NORMALIZE ─────────────────────────────── */
function normalizeItem(d) {
  const data = d.data ? d.data() : d;
  const createdAt = typeof data.createdAt === 'number'
    ? data.createdAt
    : (data.createdAt?.toMillis?.() || Date.now());
  let category = (data.category || data.type || 'movie').toLowerCase().trim();
  if (['tvshow', 'tv', 'tvseries', 'show'].includes(category)) category = 'series';
  if (['anim', 'cartoon', 'anime'].includes(category)) category = 'animation';
  const title = data.title || data.epTitle || data.name || '';
  const sname = (data.sname || data.seriesName || data.seriesname || (category === 'series' ? title : '')).trim();
  const thumb = data.thumb || data.thumbnail || data.poster || data.image || '';
  const playLink = fixUrl(data.playLink || data.play || data.videoUrl || data.url || data.link || '');
  const dlLink   = fixUrl(data.dlLink || data.dl || data.downloadLink || data.download || '');
  const id = d.id || data.id || ('item_' + Math.random());
  return { ...data, id, category, title, sname, thumb, playLink, dlLink, createdAt };
}

/* ── LOAD CONTENT ─────────────────────────── */
function loadContent() {
  const { onSnapshot, getDocs, getDoc, collection, doc, query, orderBy } = window._fb;

  function processSnap(snap) {
    const items = [];
    snap.forEach(d => items.push(normalizeItem(d)));
    return items;
  }

  async function fetchExtras() {
    let extras = [];
    for (const col of ['movies', 'videos', 'media', 'tvshows', 'series']) {
      try {
        const s = await getDocs(collection(window._db, col));
        s.forEach(d => extras.push(normalizeItem(d)));
      } catch {}
    }
    try {
      const sd = await getDoc(doc(window._db, 'settings', 'movies'));
      if (sd.exists()) {
        const data = sd.data();
        const list = data.list || data.movies || data.items || [];
        if (Array.isArray(list)) {
          list.forEach((m, i) => extras.push(normalizeItem({
            data: () => ({ ...m, id: 'legacy_' + i, createdAt: m.createdAt || Date.now() - i * 1000 }),
            id: 'legacy_' + i
          })));
        }
      }
    } catch {}
    return extras;
  }

  function applyContent(primary, extras) {
    allContent = [...primary, ...extras];
    buildRows();
    buildHero();
    renderStats();
    if (currentSection === 'favs') renderFavs();
    if (currentSection === 'downloads') renderDownloads();
  }

  let unsubOrdered = null;
  try {
    const qOrdered = query(collection(window._db, 'content'), orderBy('createdAt', 'desc'));
    unsubOrdered = onSnapshot(qOrdered, async snap => {
      const primary = processSnap(snap);
      const extras  = primary.length === 0 ? await fetchExtras() : [];
      applyContent(primary, extras);
    }, async err => {
      console.warn('Ordered query failed, falling back:', err.message);
      if (unsubOrdered) { try { unsubOrdered(); } catch {} }
      onSnapshot(collection(window._db, 'content'), async snap => {
        const primary = processSnap(snap);
        const extras  = primary.length === 0 ? await fetchExtras() : [];
        applyContent(primary, extras);
      }, err2 => {
        console.error('Firestore fallback also failed:', err2.message);
        showToast('Could not load content. Check connection.', true);
      });
    });
  } catch (e) {
    console.error('loadContent setup error:', e);
  }
}

/* ── COMPATIBILITY ALIASES ── */
window.openDetailOverlay = function (id) {
  const m = allContent.find(x => x.id === id);
  if (m) openDetail(m);
};
window.openDetail = openDetail;
window.playItem = playItem;
window.showSection = showSection;
window.openModal = openModal;
window.closeModal = closeModal;
window.showToast = showToast;
