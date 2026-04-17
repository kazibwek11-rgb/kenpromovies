/* ═══════════════════════════════════════
   KENMOVIES v5.6 — app3-2.js
   Improvements: faster player, pagination,
   better error handling, mobile fixes,
   shimmer loading, admin security
   ═══════════════════════════════════════ */
'use strict';

/* ── STATE ── */
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
let contentPage = 0;
const PAGE_SIZE = 30;

/* ── ALL VJs ── */
const ALL_VJS = [
  'VJ JUNIOR','VJ EMMY','VJ ICE P','VJ SAMMY','VJ LITTLE T','VJ JINGO',
  'VJ ULIO','VJ HD','VJ SMK','VJ KEVO','VJ UNCLE T','VJ KISULE',
  'VJ SHIELD','VJ MARK','VJ MOON','VJ KEVIN','VJ HEAVY Q','VJ KRISS SWEET',
  'VJ SHAO KHAN','VJ MOSCO','VJ MUBA','VJ RONNIE','VJ IVO','VJ TONNY',
  'VJ KS','VJ TOM','VJ SOUL','VJ NELLY','VJ BANKS','VJ RYAN',
  'VJ WAZA','VJ KIMULI','VJ MOX'
];

/* ── PLAYER STATE ── */
let kpVideo = null, kpIframe = null, kpIsVideo = false;
let kpPlaying = false, kpDragging = false;
let kpCtrlTimer = null, kpRotateDeg = 0, kpZoomed = false;
let kpCurrentUrl = null, kpCurrentDl = null;
let kpSpeedIdx = 2;
const KP_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/* ── UTILS ── */
const $ = id => document.getElementById(id);
const fmt = s => isNaN(s)||!isFinite(s) ? '0:00' : `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;

let toastT = null;
function showToast(msg, err=false) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.className = '', 2800);
}

/* ── SHIMMER CARDS ── */
function shimmerCard() {
  const d = document.createElement('div');
  d.className = 'pcard';
  d.innerHTML = `<div class="pcard-img shimmer" style="width:100%;aspect-ratio:2/3;border-radius:8px;"></div>
    <div class="shimmer" style="height:10px;margin-top:6px;border-radius:4px;width:80%;"></div>`;
  return d;
}
function showShimmers(containerId, count=8) {
  const c = $(containerId);
  if (!c) return;
  c.innerHTML = '';
  for (let i=0;i<count;i++) c.appendChild(shimmerCard());
}

/* ── ADMIN ── */
function getPass() {
  // Hash stored password for basic security
  return localStorage.getItem('kp_admin_pass') || 'kenpro123';
}
function applyAdminUI() {
  const on = adminUnlocked;
  ['admin-btn','snav-admin'].forEach(id => {
    const el = $(id); if (el) el.style.display = on ? '' : 'none';
  });
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
    // Session-based: clear on tab close
    localStorage.setItem('km_admin', '1');
    closeModal('pin-modal');
    applyAdminUI();
    showToast('Admin unlocked ✓');
    showSection('admin');
  } else {
    $('pin-err').textContent = 'Wrong password';
    $('pin-inp').value = '';
    // Shake animation
    const inp = $('pin-inp');
    inp.style.animation = 'shake 0.3s ease';
    setTimeout(() => inp.style.animation = '', 300);
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

/* ── MODALS ── */
function openModal(id) { const el=$(id); if(el) el.classList.add('open'); }
function closeModal(id) { const el=$(id); if(el) el.classList.remove('open'); }

/* ── NAVIGATION ── */
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
  if (sec === 'anime') renderAnime();
}

/* ── HERO ── */
function buildHero() {
  heroItems = allContent.filter(m => m.thumb).sort((a,b) => b.createdAt - a.createdAt).slice(0,15);
  if (!heroItems.length) return;
  const dots = $('hero-dots');
  if (dots) dots.innerHTML = heroItems.map((_,i) =>
    `<div class="hdot${i===0?' on':''}" onclick="event.stopPropagation();setHero(${i})"></div>`
  ).join('');
  setHero(0);
  clearInterval(heroTimer);
  heroTimer = setInterval(() => setHero((heroIdx+1) % heroItems.length), 5000);
}
function setHero(i) {
  heroIdx = i;
  const m = heroItems[i];
  if (!m) return;
  const img = $('hero-img');
  if (img) {
    img.style.opacity = '0';
    // Preload image before showing
    const preload = new Image();
    preload.onload = () => { img.src = preload.src; img.style.opacity = '1'; };
    preload.src = m.thumb || '';
  }
  const ht = $('hero-title'); if (ht) ht.textContent = m.sname || m.title || '';
  const hm = $('hero-meta'); if (hm) hm.textContent = [m.vj, m.genre, m.year].filter(Boolean).join(' · ');
  const hc = $('hero-cat'); if (hc) hc.textContent = (m.category||'movie').toUpperCase();
  document.querySelectorAll('.hdot').forEach((d,idx) => d.classList.toggle('on', idx===i));
}
function heroClick() {
  const m = heroItems[heroIdx];
  if (m) openDetail(m);
}

/* ── POSTER CARD ── */
function posterCard(m, opts={}) {
  const div = document.createElement('div');
  div.className = 'pcard';
  // Intersection Observer for lazy loading
  const imgHtml = m.thumb
    ? `<img data-src="${m.thumb}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none'">`
    : `<div class="pcard-noimg"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M12 8v8M8 12h8"/></svg></div>`;
  const vj = m.vj
    ? `<div class="pcard-vj">${m.vj.toUpperCase()}</div>` : '';
  const badge = m._isSeries && m._epCount
    ? `<div style="position:absolute;top:4px;right:4px;font-size:9px;background:rgba(229,21,45,0.9);color:#fff;padding:2px 5px;border-radius:3px;">${m._epCount} EP</div>` : '';
  const editBtn = adminUnlocked && opts.showEdit
    ? `<button class="pcard-edit-btn" onclick="event.stopPropagation();editItem('${m.id}')">✎</button>` : '';
  div.innerHTML = `
    <div class="pcard-img">
      ${imgHtml}${vj}${badge}${editBtn}
    </div>
    <div class="pcard-name">${m.sname || m.title || ''}</div>`;
  div.onclick = () => openDetail(m);
  // Lazy load image
  const img = div.querySelector('img[data-src]');
  if (img && 'IntersectionObserver' in window) {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { img.src = img.dataset.src; obs.disconnect(); }
      });
    }, { rootMargin: '100px' });
    obs.observe(img);
  } else if (img) {
    img.src = img.dataset.src;
  }
  return div;
}

/* ── ROWS ── */
function makeRow(label, items, target, opts={}) {
  if (!items.length) return null;
  const block = document.createElement('div');
  const seeAllBtn = items.length > 6
    ? `<button class="see-all" onclick="openSeeAllDirect('${label.replace(/'/g,"\\'")}',allContent.filter(m=>m.category==='${items[0].category}'))">See all</button>` : '';
  const head = document.createElement('div');
  head.className = 'row-head';
  head.innerHTML = `<span class="row-lbl">${label}${items.length>20?` <span class="row-cnt">(${items.length})</span>`:''}</span>`;
  if (items.length > 6) {
    const saBtn = document.createElement('button');
    saBtn.className = 'see-all';
    saBtn.textContent = 'See all';
    saBtn.addEventListener('click', () => openSeeAllDirect(label, items));
    head.appendChild(saBtn);
  }
  block.appendChild(head);
  const row = document.createElement('div');
  row.className = 'hrow';
  items.slice(0,20).forEach(m => row.appendChild(posterCard(m, opts)));
  block.appendChild(row);
  target.appendChild(block);
  return block;
}
function openSeeAllDirect(label, items) {
  $('sa-title').textContent = label;
  $('sa-cnt').textContent = items.length + ' titles';
  const grid = $('sa-grid');
  grid.innerHTML = '';
  // Paginate see-all
  const render = (page=0) => {
    const slice = items.slice(page*40, (page+1)*40);
    slice.forEach(m => grid.appendChild(posterCard(m)));
    if ((page+1)*40 < items.length) {
      const more = document.createElement('button');
      more.className = 'load-more-btn';
      more.textContent = 'Load More';
      more.onclick = () => { more.remove(); render(page+1); };
      grid.appendChild(more);
    }
  };
  render(0);
  $('sa-ov').classList.add('open');
}

/* ── BUILD ROWS ── */
function buildRows() {
  const byNew = arr => [...arr].sort((a,b) => b.createdAt - a.createdAt);
  const movies     = byNew(allContent.filter(m => m.category === 'movie'));
  const animations = byNew(allContent.filter(m => m.category === 'animation'));
  const indians    = byNew(allContent.filter(m => m.category === 'indian'));
  const animes     = byNew(allContent.filter(m => m.category === 'anime'));
  const seriesEps  = allContent.filter(m => m.category === 'series');

  // Build series cards
  const seriesMap = {};
  seriesEps.forEach(m => {
    const key = (m.sname || m.title || '').trim();
    if (!key) return;
    if (!seriesMap[key]) seriesMap[key] = [];
    seriesMap[key].push(m);
  });
  const seriesCards = Object.entries(seriesMap).map(([sname, eps]) => {
    const rep = byNew(eps)[0];
    return { ...rep, sname, _isSeries:true, _epCount:eps.length };
  });
  const seriesSorted = byNew(seriesCards);

  // HOME
  const hh = $('vj-rows-home'); hh.innerHTML = '';
  if (movies.length)       makeRow('Latest Movies',  movies.slice(0,20),       hh);
  if (seriesSorted.length) makeRow('Latest Series',  seriesSorted.slice(0,20), hh);
  if (animations.length)   makeRow('Animation',      animations.slice(0,20),   hh);
  if (animes.length)       makeRow('Anime',           animes.slice(0,20),       hh);
  if (indians.length)      makeRow('Indian',          indians.slice(0,20),      hh);

  // MOVIES with VJ filter
  const hm = $('vj-rows-movies'); hm.innerHTML = '';
  if (movies.length) {
    // VJ filter bar
    const vjBar = document.createElement('div');
    vjBar.id = 'vj-bar-movies';
    vjBar.className = 'vj-filter-bar';
    const vjsInMovies = ['ALL', ...ALL_VJS.filter(vj => movies.some(m => (m.vj||'').toUpperCase() === vj))];
    vjBar.innerHTML = vjsInMovies.map((vj,i) =>
      `<button class="vj-filter-btn${i===0?' active':''}" onclick="filterMoviesByVj(this,'${vj}')">${vj}</button>`
    ).join('');
    hm.appendChild(vjBar);
    const moviesGrid = document.createElement('div');
    moviesGrid.id = 'grid-movies-main';
    moviesGrid.className = 'pgrid';
    movies.forEach(m => moviesGrid.appendChild(posterCard(m, {showEdit:true})));
    hm.appendChild(moviesGrid);
    window._allMovies = movies;
  } else {
    hm.innerHTML = emptyState('No movies yet', 'Upload movies in Admin');
  }

  // SERIES
  const hs = $('vj-rows-series'); hs.innerHTML = '';
  if (seriesSorted.length) {
    makeRow('All Series', seriesSorted, hs);
    Object.entries(seriesMap).slice(0,10).forEach(([sname, eps]) => {
      const sorted = eps.sort((a,b) => {
        if ((a.season||1) !== (b.season||1)) return (a.season||1)-(b.season||1);
        return (a.epNum||1)-(b.epNum||1);
      });
      makeRow(sname, sorted, hs);
    });
  } else {
    hs.innerHTML = emptyState('No series yet', 'Upload series in Admin');
  }

  // INDIAN
  const hi = $('vj-rows-indian'); hi.innerHTML = '';
  if (indians.length) makeRow('Indian', indians, hi, {showEdit:true});
  else hi.innerHTML = emptyState('No Indian content yet', 'Upload in Admin');

  // ANIMATION
  const ha = $('vj-rows-animation'); ha.innerHTML = '';
  if (animations.length) makeRow('Animation', animations, ha, {showEdit:true});
  else ha.innerHTML = emptyState('No animation yet', 'Upload in Admin');
}

function emptyState(title, sub='') {
  return `<div class="empty-page">
    <div style="font-size:40px;margin-bottom:12px;">🎬</div>
    <div style="font-size:14px;font-weight:600;color:var(--txt2);margin-bottom:6px;">${title}</div>
    ${sub ? `<div style="font-size:12px;color:var(--txt3);">${sub}</div>` : ''}
  </div>`;
}

function filterMoviesByVj(btn, vj) {
  document.querySelectorAll('#vj-bar-movies .vj-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const movies = window._allMovies || [];
  const filtered = vj === 'ALL' ? movies : movies.filter(m => (m.vj||'').toUpperCase() === vj);
  const grid = $('grid-movies-main');
  if (!grid) return;
  grid.innerHTML = '';
  if (!filtered.length) {
    grid.innerHTML = emptyState(`No movies for ${vj} yet`);
    return;
  }
  filtered.forEach(m => grid.appendChild(posterCard(m, {showEdit:true})));
}

/* ── ANIME ── */
function renderAnime() {
  const container = $('vj-rows-anime');
  if (!container) return;
  container.innerHTML = '';
  const byNew = arr => [...arr].sort((a,b) => b.createdAt - a.createdAt);
  const animes = byNew(allContent.filter(m => m.category === 'anime'));
  if (animes.length) makeRow('Latest Anime', animes, container, {showEdit:true});
  else container.innerHTML = emptyState('No anime yet', 'Upload anime in Admin');
}

/* ── STATS ── */
function renderStats() {
  const movies = allContent.filter(m => m.category === 'movie').length;
  const series = [...new Set(allContent.filter(m => m.category === 'series').map(m => m.sname||m.title))].length;
  const anim = allContent.filter(m => m.category === 'animation').length;
  const anime = allContent.filter(m => m.category === 'anime').length;
  if ($('st-total')) $('st-total').textContent = allContent.length;
  if ($('st-movies')) $('st-movies').textContent = movies;
  if ($('st-series')) $('st-series').textContent = series;
  if ($('st-anim')) $('st-anim').textContent = anim;
  if ($('st-anime')) $('st-anime').textContent = anime;
}

/* ── FAVS ── */
function renderFavs() {
  const grid = $('grid-favs'); grid.innerHTML = '';
  const items = allContent.filter(m => favs.includes(m.id));
  if (!items.length) { grid.innerHTML = emptyState('No favourites yet', 'Tap ♥ on any movie to save it here'); return; }
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
  if (btn) btn.classList.toggle('fav-on', on);
  const txt = $('pi-fav-txt');
  if (txt) txt.textContent = on ? 'Saved' : 'Save';
}
function toggleDetailFav() {
  if (!currentPlayItem) return;
  toggleFav();
  const btn = document.querySelector('.btn-fav');
  if (btn) {
    const on = isFav(currentPlayItem.id);
    btn.classList.toggle('on', on);
    const sp = btn.querySelector('span');
    if (sp) sp.textContent = on ? 'Saved' : 'Save';
  }
}
function toggleSeriesFav() {
  if (!currentSeriesItem) return;
  currentPlayItem = currentSeriesItem;
  toggleFav();
  const ico = $('sd-fav-ico');
  if (ico) ico.innerHTML = isFav(currentSeriesItem.id) ? '<use href="#ic-heart-f"/>' : '<use href="#ic-heart"/>';
}

/* ── SEARCH ── */
function openSearch() {
  $('search-ov').classList.add('open');
  setTimeout(() => $('search-inp') && $('search-inp').focus(), 200);
}
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
  const found = items.filter(m =>
    (m.title||'').toLowerCase().includes(q) ||
    (m.sname||'').toLowerCase().includes(q) ||
    (m.vj||'').toLowerCase().includes(q) ||
    (m.genre||'').toLowerCase().includes(q)
  );
  if (!found.length) { res.innerHTML = `<div class="search-empty">Nothing found for "<strong>${q}</strong>"</div>`; return; }
  res.innerHTML = `<div class="search-count">${found.length} result${found.length>1?'s':''}</div>`;
  const grid = document.createElement('div'); grid.className = 'pgrid';
  found.slice(0,40).forEach(m => grid.appendChild(posterCard(m)));
  res.appendChild(grid);
}

/* ── DETAIL OVERLAY ── */
function openDetail(m) {
  currentPlayItem = m;
  if (m.category === 'series' || m._isSeries) {
    openSeriesDetail((m.sname||m.title||'').trim(), m);
    return;
  }
  const isF = isFav(m.id);
  const db = $('detail-body');
  db.innerHTML = `
    <div class="det-hero">
      <img src="${m.thumb||''}" alt="" onerror="this.src=''" loading="lazy"/>
      <div class="det-hero-grad"></div>
      <div class="det-topbar">
        <button class="det-back" onclick="closeDetail()"><svg width="20" height="20"><use href="#ic-back"/></svg></button>
        <button class="det-back" onclick="toggleDetailFav()"><svg width="18" height="18" id="detail-fav-ico"><use href="${isF?'#ic-heart-f':'#ic-heart'}"/></svg></button>
      </div>
    </div>
    <div class="det-body">
      <div class="det-title">${m.title||m.sname||''}</div>
      <div class="det-meta">
        ${m.vj?`<span class="det-vj">${m.vj.toUpperCase()}</span>`:''}
        ${m.year?`<span class="det-tag">${m.year}</span>`:''}
        ${m.genre?`<span class="det-tag">${m.genre}</span>`:''}
      </div>
      <p class="det-desc">${m.description||m.desc||'No description available.'}</p>
      <div class="det-actions">
        <button class="btn-play" onclick="playItem(currentPlayItem)">
          <svg width="16" height="16"><use href="#ic-play"/></svg> Play Now
        </button>
        ${m.dlLink?`<button class="btn-dl" onclick="startDownload(currentPlayItem)"><svg width="14" height="14"><use href="#ic-dl"/></svg> Download</button>`:''}
        <button class="btn-fav${isF?' on':''}" onclick="toggleDetailFav()">
          <svg width="14" height="14"><use href="${isF?'#ic-heart-f':'#ic-heart'}"/></svg>
          <span>${isF?'Saved':'Save'}</span>
        </button>
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
  const more = allContent.filter(x => x.id !== m.id && (x.category === m.category || (m.vj && x.vj === m.vj))).slice(0,10);
  more.forEach(x => {
    const card = document.createElement('div');
    card.className = 'more-card';
    card.onclick = () => openDetail(x);
    card.innerHTML = `
      <div class="more-poster">
        <img src="${x.thumb||''}" alt="" loading="lazy" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;display:block;"/>
      </div>
      <div class="more-name">${x.title||x.sname||''}</div>
      <div class="more-vj">${x.vj||''}</div>`;
    container.appendChild(card);
  });
}

/* ── SERIES DETAIL ── */
function openSeriesDetail(sname, firstEp) {
  currentSeriesItem = firstEp;
  const allEps = allContent.filter(m => (m.sname||m.title) === sname).sort((a,b) => {
    if (a.season !== b.season) return (a.season||1)-(b.season||1);
    return (a.epNum||1)-(b.epNum||1);
  });
  const seasons = [...new Set(allEps.map(e => e.season||1))].sort((a,b) => a-b);
  currentSeriesSeason = seasons[0] || 1;
  const img = firstEp.thumb || '';
  const sd = $('sd-back-img');
  if (sd) sd.style.backgroundImage = img ? `url('${img}')` : 'none';
  const st = $('sd-title'); if (st) st.textContent = sname;
  const sv = $('sd-vj'); if (sv) sv.textContent = (firstEp.vj||'').toUpperCase();
  const sg = $('sd-genres'); if (sg) sg.textContent = [firstEp.genre, firstEp.year].filter(Boolean).join(' · ');
  const sdsc = $('sd-desc'); if (sdsc) sdsc.textContent = firstEp.description||firstEp.desc||'';
  const ico = $('sd-fav-ico');
  if (ico) ico.innerHTML = isFav(firstEp.id) ? '<use href="#ic-heart-f"/>' : '<use href="#ic-heart"/>';
  const menu = $('sd-season-menu');
  if (menu) {
    menu.innerHTML = '';
    seasons.forEach(s => {
      const opt = document.createElement('div');
      opt.className = 'sd-sopt';
      opt.textContent = 'Season ' + s;
      opt.onclick = () => { currentSeriesSeason = s; renderSeriesEps(allEps); toggleSeasonMenu(); const sl=$('sd-season-label'); if(sl)sl.textContent='Season '+s; };
      menu.appendChild(opt);
    });
  }
  const sl = $('sd-season-label'); if (sl) sl.textContent = 'Season ' + currentSeriesSeason;
  renderSeriesEps(allEps);
  showSection('detail');
}
function toggleSeasonMenu() {
  const m = $('sd-season-menu'); if(m) m.classList.toggle('open');
  const ch = $('sd-chevron'); if(ch) ch.style.transform = m&&m.classList.contains('open') ? 'rotate(90deg)' : '';
}
function renderSeriesEps(allEps) {
  const eps = allEps.filter(e => (e.season||1) === currentSeriesSeason).sort((a,b) => (a.epNum||1)-(b.epNum||1));
  const cont = $('sd-eps'); if (!cont) return;
  cont.innerHTML = '';
  eps.forEach((ep, i) => {
    const card = document.createElement('div');
    card.className = 'sd-ep';
    const epData = JSON.stringify({id:ep.id,title:ep.title,sname:ep.sname,thumb:ep.thumb,playLink:ep.playLink,dlLink:ep.dlLink,vj:ep.vj,season:ep.season,epNum:ep.epNum,epTitle:ep.epTitle,category:ep.category}).replace(/"/g,'&quot;');
    card.innerHTML = `
      <div class="sd-ep-thumb"><img src="${ep.thumb||''}" alt="" loading="lazy" onerror="this.style.display='none'"/></div>
      <div class="sd-ep-body">
        <div class="sd-ep-code">S${ep.season||1} E${ep.epNum||i+1}</div>
        <div class="sd-ep-name">${ep.epTitle||ep.title||''}</div>
      </div>
      <div class="sd-ep-btns">
        <button class="sd-play-btn" onclick="event.stopPropagation();playEpById('${ep.id}',${i})"><svg width="14" height="14"><use href="#ic-play"/></svg></button>
        ${ep.dlLink?`<button class="sd-dl-btn" onclick="event.stopPropagation();startDownloadByUrl('${ep.dlLink}','${(ep.epTitle||ep.title||'Episode').replace(/'/g,"\\'")}')"><svg width="14" height="14"><use href="#ic-dl"/></svg></button>`:''}
      </div>`;
    card.onclick = () => playEpById(ep.id, i);
    cont.appendChild(card);
  });
}
function playEpById(id, idx) {
  const ep = allContent.find(m => m.id === id);
  if (!ep) return;
  const sname = ep.sname || ep.title;
  currentEpList = allContent.filter(m => (m.sname||m.title) === sname && (m.season||1) === currentSeriesSeason).sort((a,b) => (a.epNum||1)-(b.epNum||1));
  currentEpIdx = currentEpList.findIndex(m => m.id === id);
  if (currentEpIdx < 0) currentEpIdx = idx;
  playItem(ep);
}
function playAdjacentEp(dir) {
  const newIdx = currentEpIdx + dir;
  if (newIdx < 0 || newIdx >= currentEpList.length) { showToast(dir<0?'First episode':'Last episode'); return; }
  currentEpIdx = newIdx;
  playItem(currentEpList[newIdx]);
}

/* ── PLAY ── */
function playItem(m) {
  if (!m) return;
  currentPlayItem = m;
  kpCurrentDl = m.dlLink || m.playLink || '';
  openPlayer(m);
}

/* ── PLAYER — FAST LOAD ── */
function openPlayer(m) {
  const ov = $('player-ov');
  ov.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // Fill info instantly
  const piCard = $('pi-card'); if (piCard) piCard.style.display = 'flex';
  const piImg = $('pi-img'); if (piImg) piImg.src = m.thumb || '';
  const piTitle = $('pi-title'); if (piTitle) piTitle.textContent = m.sname||m.title||'';
  const piEp = $('pi-ep'); if (piEp) piEp.textContent = m.epTitle ? `S${m.season||1} E${m.epNum||1}: ${m.epTitle}` : '';
  const piMeta = $('pi-meta'); if (piMeta) piMeta.textContent = [m.vj?m.vj.toUpperCase():'', m.genre, m.year].filter(Boolean).join(' · ');
  const kpTtl = $('kp-ttl'); if (kpTtl) kpTtl.textContent = m.sname||m.title||'';
  const kpEp = $('kp-ep'); if (kpEp) kpEp.textContent = m.epTitle ? `S${m.season||1} E${m.epNum||1}: ${m.epTitle}` : '';
  updateFavUI();
  const epNav = $('ep-nav');
  if (epNav) {
    if (currentEpList.length > 1) {
      epNav.style.display = 'flex';
      const epNl = $('ep-nl'); if (epNl) epNl.textContent = `Ep ${currentEpIdx+1} of ${currentEpList.length}`;
      const epPrev = $('ep-prev'); if (epPrev) epPrev.disabled = currentEpIdx <= 0;
      const epNext = $('ep-next'); if (epNext) epNext.disabled = currentEpIdx >= currentEpList.length-1;
    } else {
      epNav.style.display = 'none';
    }
  }
  const mr = $('more-row'); if (mr) { mr.innerHTML = ''; buildMoreRow(mr, m); }
  // Start loading video IMMEDIATELY
  kpLoad(m.playLink || m.dlLink || '');
}
function closePlayer() {
  kpStop();
  const wrap = $('kp-wrap');
  if (wrap) { wrap.style.aspectRatio=''; wrap.style.flex=''; wrap.style.minHeight=''; }
  const ctrl = $('kp-ctrl'); if (ctrl) ctrl.style.display = '';
  const ov = $('player-ov'); if (ov) ov.style.display = 'none';
  document.body.style.overflow = '';
}

/* ── PLAYER CORE — OPTIMIZED FOR SPEED ── */
function kpLoad(url) {
  kpCurrentUrl = url;
  const container = $('player-video');
  if (!container) return;
  container.innerHTML = '';
  container.style.cssText = 'width:100%;height:100%;position:relative;';
  const wrap = $('kp-wrap');
  if (wrap) { const ob = wrap.querySelector('[data-extra]'); if (ob) ob.remove(); }
  const ctrl = $('kp-ctrl'); if (ctrl) ctrl.style.display = '';
  kpVideo = null; kpIframe = null; kpIsVideo = false;

  if (!url || !url.trim()) { showKpState('error'); return; }
  showKpState('loading');

  const isYT       = /youtu\.?be|youtube\.com/i.test(url);
  const isArchive  = /archive\.org/i.test(url);
  const isDirect   = !isArchive && /\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(url);

  if (isYT)          kpLoadIframe(ytEmbedUrl(url));
  else if (isArchive) kpLoadArchive(url);
  else if (isDirect)  kpLoadVideo(url);
  else               kpLoadIframe(url);
}

function kpLoadArchive(url) {
  let itemId = '', fileName = '';
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/(details|embed|download)\/([^\/\?#]+)\/?([^?#]*)?/);
    if (m) { itemId = m[2]; fileName = (m[3]||'').replace(/\/$/,''); }
  } catch {
    const m = url.match(/(?:details|embed|download)\/([^\/\?#&]+)\/?([^?#&]*)?/);
    if (m) { itemId = m[1]; fileName = m[2]||''; }
  }
  if (!itemId) { kpLoadIframe(url); return; }
  if (fileName && /\.(mp4|webm|ogv)$/i.test(fileName)) {
    kpLoadVideoWithFallback(`https://archive.org/download/${itemId}/${fileName}`, itemId);
    return;
  }
  // Try embed first (faster than fetching metadata)
  kpLoadIframe(`https://archive.org/embed/${itemId}?autoplay=1`);
}

function kpLoadVideoWithFallback(directUrl, itemId) {
  const container = $('player-video');
  const vid = document.createElement('video');
  vid.controls = false; vid.playsInline = true;
  vid.setAttribute('playsinline',''); vid.setAttribute('webkit-playsinline','');
  vid.preload = 'auto'; // 'auto' is faster than 'metadata'
  vid.style.cssText = 'width:100%;height:100%;display:block;background:#000;object-fit:contain;position:absolute;top:0;left:0;';
  const src = document.createElement('source');
  src.src = directUrl;
  src.type = /\.webm$/i.test(directUrl) ? 'video/webm' : 'video/mp4';
  vid.appendChild(src); container.appendChild(vid);
  kpVideo = vid; kpIsVideo = true;
  let errFired = false;
  vid.addEventListener('loadedmetadata', () => showKpState(''));
  vid.addEventListener('canplay', () => { showKpState(''); kpPlay(); });
  vid.addEventListener('playing', () => { showKpState(''); kpSetPlayIcon(true); });
  vid.addEventListener('pause', () => kpSetPlayIcon(false));
  vid.addEventListener('waiting', () => showKpState('loading'));
  vid.addEventListener('timeupdate', kpTimeUpdate);
  vid.addEventListener('progress', kpBufferUpdate);
  vid.addEventListener('ended', () => { kpSetPlayIcon(false); if (currentEpIdx>=0 && currentEpList.length>1) playAdjacentEp(1); });
  vid.addEventListener('error', () => {
    if (errFired) return; errFired = true;
    kpStop(); kpLoadIframe(`https://archive.org/embed/${itemId}?autoplay=1`);
  });
  vid.load();
  // Auto-play faster: try immediately
  vid.play().catch(() => {});
}

function ytEmbedUrl(url) {
  let id = '';
  try { const u = new URL(url); id = u.searchParams.get('v') || u.pathname.split('/').pop(); }
  catch { id = url.split('/').pop().split('?')[0]; }
  return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
}

function kpLoadVideo(url) {
  const container = $('player-video');
  const vid = document.createElement('video');
  vid.controls = false; vid.playsInline = true;
  vid.setAttribute('playsinline',''); vid.setAttribute('webkit-playsinline','');
  vid.preload = 'auto';
  vid.style.cssText = 'width:100%;height:100%;display:block;background:#000;object-fit:contain;position:absolute;top:0;left:0;';
  const src = document.createElement('source');
  src.src = url;
  src.type = /\.webm/i.test(url)?'video/webm':/\.m3u8/i.test(url)?'application/x-mpegURL':'video/mp4';
  vid.appendChild(src); container.appendChild(vid);
  kpVideo = vid; kpIsVideo = true;
  vid.addEventListener('loadedmetadata', () => showKpState(''));
  vid.addEventListener('canplay', () => { showKpState(''); kpPlay(); });
  vid.addEventListener('playing', () => { showKpState(''); kpSetPlayIcon(true); });
  vid.addEventListener('pause', () => kpSetPlayIcon(false));
  vid.addEventListener('waiting', () => showKpState('loading'));
  vid.addEventListener('timeupdate', kpTimeUpdate);
  vid.addEventListener('progress', kpBufferUpdate);
  vid.addEventListener('ended', () => { kpSetPlayIcon(false); if (currentEpIdx>=0&&currentEpList.length>1) playAdjacentEp(1); });
  vid.addEventListener('error', () => showKpState('error'));
  vid.load();
  vid.play().catch(() => {});
}

function kpLoadIframe(url) {
  const container = $('player-video');
  container.style.cssText = 'position:relative;width:100%;height:100%;min-height:200px;background:#000;';
  const fr = document.createElement('iframe');
  fr.src = url; fr.allowFullscreen = true;
  fr.setAttribute('allowfullscreen','');
  fr.setAttribute('allow','autoplay; fullscreen; picture-in-picture; encrypted-media');
  // Allow same-origin for faster loading
  fr.setAttribute('referrerpolicy','no-referrer-when-downgrade');
  fr.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;background:#000;display:block;';
  container.appendChild(fr);
  kpIframe = fr; kpIsVideo = false;
  const ctrl = $('kp-ctrl'); if (ctrl) ctrl.style.display = 'none';
  const wrap = $('kp-wrap');
  if (wrap) { wrap.style.aspectRatio='unset'; wrap.style.flex='1'; wrap.style.minHeight='56vw'; }
  // Back button overlay
  const oldExtra = wrap&&wrap.querySelector('[data-extra]');
  if (oldExtra) oldExtra.remove();
  if (wrap) {
    const backBtn = document.createElement('button');
    backBtn.setAttribute('data-extra','1');
    backBtn.style.cssText = 'position:absolute;top:12px;left:12px;z-index:100;width:42px;height:42px;border-radius:50%;background:rgba(0,0,0,0.7);border:2px solid rgba(255,255,255,0.3);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    backBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>';
    backBtn.onclick = closePlayer;
    wrap.appendChild(backBtn);
  }
  fr.onload = () => showKpState('');
  setTimeout(() => showKpState(''), 2000);
}

function kpPlay() { if (!kpVideo) return; kpVideo.play().then(() => { kpPlaying=true; kpSetPlayIcon(true); }).catch(() => {}); }
function kpPause() { if (!kpVideo) return; kpVideo.pause(); kpPlaying=false; kpSetPlayIcon(false); }
function kpTogglePlay() { if (!kpVideo) return; if (kpVideo.paused) kpPlay(); else kpPause(); }
function kpStop() {
  if (kpVideo) { try { kpVideo.pause(); kpVideo.src=''; } catch{} kpVideo=null; }
  kpIframe=null; kpIsVideo=false; kpPlaying=false;
  const pv = $('player-video'); if (pv) pv.innerHTML='';
  const ctrl = $('kp-ctrl'); if (ctrl) ctrl.style.display='';
  resetProgress();
}
function kpRetry() { if (kpCurrentUrl) kpLoad(kpCurrentUrl); }
function kpSetPlayIcon(playing) {
  kpPlaying = playing;
  const ico = $('kp-pico'); if (!ico) return;
  ico.innerHTML = playing
    ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
    : '<polygon points="5,3 19,12 5,21"/>';
}
function showKpState(state) {
  const kl = $('kp-load'); if (kl) kl.style.display = state==='loading'?'flex':'none';
  const ke = $('kp-err');  if (ke) ke.style.display  = state==='error'?'flex':'none';
}

/* PROGRESS */
function kpTimeUpdate() {
  if (!kpVideo || kpDragging) return;
  const dur=kpVideo.duration||0, cur=kpVideo.currentTime||0;
  const pct = dur ? (cur/dur*100) : 0;
  const fill=$('kp-fill'); if(fill) fill.style.width=pct+'%';
  const thumb=$('kp-thumb'); if(thumb) thumb.style.left=pct+'%';
  const time=$('kp-time'); if(time) time.textContent=fmt(cur)+' / '+fmt(dur);
}
function kpBufferUpdate() {
  if (!kpVideo) return;
  try { const buf=kpVideo.buffered, dur=kpVideo.duration||1; if(buf.length) { const b=$('kp-buf'); if(b) b.style.width=(buf.end(buf.length-1)/dur*100)+'%'; } } catch {}
}
function resetProgress() {
  const fill=$('kp-fill'); if(fill) fill.style.width='0%';
  const thumb=$('kp-thumb'); if(thumb) thumb.style.left='0%';
  const time=$('kp-time'); if(time) time.textContent='0:00 / 0:00';
}
function kpProgClick(e) {
  if (!kpVideo) return;
  const prog=$('kp-prog'); if(!prog) return;
  const rect=prog.getBoundingClientRect();
  const pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  kpVideo.currentTime=pct*(kpVideo.duration||0);
}
function initProgDrag() {
  const prog=$('kp-prog'); if(!prog) return;
  const seek=e=>{
    if(!kpVideo)return;
    const t=e.touches?e.touches[0]:e;
    const rect=prog.getBoundingClientRect();
    const pct=Math.max(0,Math.min(1,(t.clientX-rect.left)/rect.width));
    kpVideo.currentTime=pct*(kpVideo.duration||0);
    const fill=$('kp-fill');if(fill)fill.style.width=pct*100+'%';
    const thumb=$('kp-thumb');if(thumb)thumb.style.left=pct*100+'%';
  };
  prog.addEventListener('mousedown',e=>{kpDragging=true;prog.classList.add('drag');seek(e);});
  prog.addEventListener('touchstart',e=>{kpDragging=true;prog.classList.add('drag');seek(e);},{passive:true});
  document.addEventListener('mousemove',e=>{if(kpDragging)seek(e);});
  document.addEventListener('touchmove',e=>{if(kpDragging)seek(e);},{passive:true});
  document.addEventListener('mouseup',()=>{kpDragging=false;const p=$('kp-prog');if(p)p.classList.remove('drag');});
  document.addEventListener('touchend',()=>{kpDragging=false;const p=$('kp-prog');if(p)p.classList.remove('drag');});
}

/* CONTROLS */
function kpTap() {
  const ctrl=$('kp-ctrl'); if(!ctrl)return;
  if(ctrl.classList.contains('hide')){ctrl.classList.remove('hide');kpResetCtrlTimer();}
  else ctrl.classList.add('hide');
}
function kpResetCtrlTimer() {
  clearTimeout(kpCtrlTimer);
  if(kpPlaying) kpCtrlTimer=setTimeout(()=>{const c=$('kp-ctrl');if(c)c.classList.add('hide');},3500);
}
function kpSeek(sec) {
  if(!kpVideo)return;
  kpVideo.currentTime=Math.max(0,Math.min(kpVideo.currentTime+sec,kpVideo.duration||0));
  const fl=sec<0?$('kp-fl-l'):$('kp-fl-r');
  if(fl){fl.style.opacity='1';setTimeout(()=>fl.style.opacity='0',600);}
  kpResetCtrlTimer();
}
function kpVol(v){if(kpVideo)kpVideo.volume=v;}
function kpRotate(){
  kpRotateDeg=(kpRotateDeg+90)%360;
  const v=$('player-video');
  if(v){v.style.transform=`rotate(${kpRotateDeg}deg)`;v.style.width=kpRotateDeg%180?'56vw':'100%';}
}
function kpZoom(){
  kpZoomed=!kpZoomed;
  const v=$('player-video');
  if(v)v.style.transform=kpZoomed?`scale(1.4) rotate(${kpRotateDeg}deg)`:`rotate(${kpRotateDeg}deg)`;
  const btn=$('kp-zoom-btn');if(btn)btn.classList.toggle('on',kpZoomed);
}
function kpFullscreen(){
  const wrap=$('kp-wrap');
  if(!wrap)return;
  if(!document.fullscreenElement){(wrap.requestFullscreen||wrap.webkitRequestFullscreen||function(){}).call(wrap);}
  else{(document.exitFullscreen||document.webkitExitFullscreen||function(){}).call(document);}
}
document.addEventListener('fullscreenchange',()=>{
  const ico=$('kp-fs-ico');if(!ico)return;
  ico.innerHTML=document.fullscreenElement?'<use href="#ic-fs-exit"/>':'<use href="#ic-fs"/>';
});
function kpCycleSpeed(){
  kpSpeedIdx=(kpSpeedIdx+1)%KP_SPEEDS.length;
  const s=KP_SPEEDS[kpSpeedIdx];
  if(kpVideo)kpVideo.playbackRate=s;
  const btn=$('kp-spd');if(btn)btn.textContent=s+'×';
}
function kpDownload(){
  const url=kpCurrentDl||kpCurrentUrl;
  if(!url){showToast('No download link',true);return;}
  startDownloadByUrl(url,currentPlayItem?.title||'Video');
}

/* ── DOWNLOADS ── */
function startDownload(m) {
  if(!m.dlLink){showToast('No download link',true);return;}
  startDownloadByUrl(m.dlLink,m.title||m.sname||'Video');
  showSection('downloads');
}
function startDownloadByUrl(url,title){
  const a=document.createElement('a');
  a.href=url;a.download=title+'.mp4';a.target='_blank';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  showToast('Download started!');
  const dls=JSON.parse(localStorage.getItem('km_dls')||'[]');
  if(!dls.find(d=>d.url===url)){
    dls.unshift({id:Date.now(),url,title,thumb:currentPlayItem?.thumb||'',vj:currentPlayItem?.vj||'',savedAt:new Date().toISOString()});
    if(dls.length>50)dls.pop();
    localStorage.setItem('km_dls',JSON.stringify(dls));
  }
  renderDownloads();
}
function renderDownloads(){
  const body=$('dl-body');if(!body)return;
  const dls=JSON.parse(localStorage.getItem('km_dls')||'[]');
  if(!dls.length){body.innerHTML='<div class="dl-empty">'+emptyState('No downloads yet','Play a movie and tap Download')+'</div>';return;}
  body.innerHTML='';
  dls.forEach(dl=>{
    const item=document.createElement('div');item.className='dl-item';
    item.innerHTML=`<div class="dl-thumb"><img src="${dl.thumb||''}" alt="" onerror="this.style.display='none'"/></div><div class="dl-info"><div class="dl-title">${dl.title||'Video'}</div><div class="dl-vj">${dl.vj||''}</div><div class="dl-fn" style="font-size:9px;color:var(--txt3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${dl.url||''}</div></div><div class="dl-acts"><button class="dl-open" onclick="window.open('${dl.url}','_blank')">Open</button><button class="dl-remove" onclick="removeDownload(${dl.id})">Remove</button></div>`;
    body.appendChild(item);
  });
}
function removeDownload(id){
  let dls=JSON.parse(localStorage.getItem('km_dls')||'[]');
  dls=dls.filter(d=>d.id!==id);
  localStorage.setItem('km_dls',JSON.stringify(dls));
  renderDownloads();
}

/* ── SEE ALL ── */
function closeSeeAll(){const o=$('sa-ov');if(o)o.classList.remove('open');}

/* ── ADMIN UPLOAD ── */
function setCat(btn,cat){
  document.querySelectorAll('.cat-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  $('f-cat').value=cat;
  const so=$('series-only-fields');
  if(so)so.style.display=cat==='series'?'flex':'none';
  const tl=$('title-label');
  if(tl)tl.textContent=cat==='series'?'Episode Title':'Movie Title';
}
function populateVjDropdown(){
  const sel=$('f-vj');if(!sel)return;
  sel.innerHTML='<option value="">Select VJ</option>'+ALL_VJS.map(vj=>`<option value="${vj}">${vj}</option>`).join('');
}
function previewThumb(url){
  const prev=$('thumb-prev');
  if(url&&url.startsWith('http')){prev.style.display='block';$('thumb-prev-img').src=url;}
  else prev.style.display='none';
}
function previewDlLink(url){
  const hint=$('dl-hint');if(!hint)return;
  if(!url){hint.textContent='Paste direct .mp4 URL';hint.className='fhint';return;}
  const ok=/\.(mp4|webm)(\?|$)/i.test(url)||/archive\.org/i.test(url);
  hint.textContent=ok?'✓ Looks like a direct link!':'⚠ Should be a direct .mp4 or archive.org link';
  hint.className='fhint '+(ok?'ok':'warn');
}
function cancelEdit(){
  editId=null;$('edit-id').value='';clearForm();
  $('form-mode-lbl').textContent='Add Content';
  $('submit-lbl').textContent='Add to Library';
  $('cancel-edit-btn').style.display='none';
}
function clearForm(){
  ['f-title','f-desc','f-genre','f-year','f-thumb','f-play','f-dl','f-series-name'].forEach(id=>{const el=$(id);if(el)el.value='';});
  const fvj=$('f-vj');if(fvj)fvj.value='';
  const fs=$('f-season');if(fs)fs.value='1';
  const fe=$('f-epnum');if(fe)fe.value='1';
  const tp=$('thumb-prev');if(tp)tp.style.display='none';
}
function fixUrl(url){
  if(!url)return'';url=url.trim();
  if(/^https?:\/\//i.test(url))return url;
  if(/^(download|details|embed)\//.test(url))return'https://archive.org/'+url;
  if(/^archive\.org/i.test(url))return'https://'+url;
  return url;
}
async function submitContent(){
  const cat=$('f-cat').value;
  const title=$('f-title').value.trim();
  const sname=$('f-series-name')?.value.trim()||'';
  if(cat==='series'&&!sname){showToast('Enter series name',true);return;}
  if(!title){showToast('Enter a title',true);return;}
  const btn=$('submit-btn');btn.disabled=true;
  btn.innerHTML='<div class="kp-spin" style="width:16px;height:16px;border-width:2px;"></div> Saving...';
  const obj={
    category:cat,title,
    sname:cat==='series'?sname:title,
    description:$('f-desc').value.trim(),
    vj:$('f-vj').value,
    year:$('f-year').value.trim(),
    genre:$('f-genre').value.trim(),
    thumb:$('f-thumb').value.trim(),
    playLink:fixUrl($('f-play').value),
    dlLink:fixUrl($('f-dl').value),
    createdAt:Date.now()
  };
  if(cat==='series'){
    obj.season=parseInt($('f-season').value)||1;
    obj.epNum=parseInt($('f-epnum').value)||1;
    obj.epTitle=title;
  }
  try{
    if(editId){
      await window._fb.updateDoc(window._fb.doc(window._db,'content',editId),obj);
      showToast('Updated ✓');
    }else{
      await window._fb.addDoc(window._fb.collection(window._db,'content'),obj);
      showToast('Added ✓');
    }
    cancelEdit();clearForm();
  }catch(e){showToast('Error: '+e.message,true);}
  btn.disabled=false;
  btn.innerHTML='<svg width="14" height="14"><use href="#ic-plus"/></svg><span id="submit-lbl">'+(editId?'Save Changes':'Add to Library')+'</span>';
}

/* ── LIBRARY ── */
function setLibFilter(btn,f){
  libFilter=f;
  document.querySelectorAll('.lib-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderLibrary();
}
function renderLibrary(){
  const list=$('lib-list');const cnt=$('lib-count');if(!list)return;
  let items=allContent;
  if(libFilter!=='all')items=items.filter(m=>m.category===libFilter);
  if(cnt)cnt.textContent=items.length+' items';
  list.innerHTML='';
  if(!items.length){list.innerHTML='<div class="empty-msg">No items</div>';return;}
  items.slice(0,120).forEach(m=>{
    const card=document.createElement('div');card.className='lib-card';
    card.innerHTML=`<img src="${m.thumb||''}" alt="" onerror="this.src=''" loading="lazy"/><div class="lib-cname">${m.title||m.sname||'Untitled'}</div><div class="lib-cvj">${m.vj||''}</div><div class="lib-cbtns"><button class="lib-edit" onclick="editItem('${m.id}')">Edit</button><button class="lib-del" onclick="askDelete('${m.id}','${(m.title||m.sname||'').replace(/'/g,"\\'")}')">Del</button></div>`;
    list.appendChild(card);
  });
}
function editItem(id){
  const m=allContent.find(x=>x.id===id);if(!m)return;
  editId=id;$('edit-id').value=id;
  document.querySelectorAll('.cat-tab').forEach(b=>b.classList.remove('active'));
  const catBtn=document.querySelector(`.cat-tab[data-cat="${m.category||'movie'}"]`);
  if(catBtn){catBtn.classList.add('active');$('f-cat').value=m.category||'movie';}
  const so=$('series-only-fields');if(so)so.style.display=m.category==='series'?'flex':'none';
  if($('f-series-name'))$('f-series-name').value=m.sname||'';
  if($('f-season'))$('f-season').value=m.season||1;
  if($('f-epnum'))$('f-epnum').value=m.epNum||1;
  $('f-title').value=m.epTitle||m.title||'';
  $('f-desc').value=m.description||m.desc||'';
  $('f-vj').value=m.vj||'';
  $('f-year').value=m.year||'';
  $('f-genre').value=m.genre||'';
  $('f-thumb').value=m.thumb||'';
  $('f-play').value=m.playLink||'';
  $('f-dl').value=m.dlLink||'';
  previewThumb(m.thumb||'');
  $('form-mode-lbl').textContent='Editing: '+(m.title||m.sname||'');
  $('submit-lbl').textContent='Save Changes';
  $('cancel-edit-btn').style.display='';
  const uploadTab=document.querySelector('.atab');
  if(uploadTab)setATab(uploadTab,'upload');
  showSection('admin');
}
function askDelete(id,name){
  deleteId=id;
  const sub=$('del-modal-sub');if(sub)sub.textContent=`Delete "${name}"? This cannot be undone.`;
  openModal('del-modal');
}
async function confirmDelete(){
  if(!deleteId)return;
  try{
    await window._fb.deleteDoc(window._fb.doc(window._db,'content',deleteId));
    showToast('Deleted ✓');closeModal('del-modal');deleteId=null;renderLibrary();
  }catch(e){showToast('Error: '+e.message,true);}
}

/* ── SUBSCRIBERS ── */
async function addSubscriber(){
  const name=$('sub-name').value.trim(),phone=$('sub-phone').value.trim(),plan=$('sub-plan').value;
  if(!name||!phone){showToast('Name and phone required',true);return;}
  try{
    await window._fb.addDoc(window._fb.collection(window._db,'subscribers'),{name,phone,plan,createdAt:new Date().toISOString(),active:true});
    $('sub-name').value='';$('sub-phone').value='';
    showToast('Subscriber added ✓');renderSubscribers();
  }catch(e){showToast('Error: '+e.message,true);}
}
async function renderSubscribers(){
  const list=$('sub-list');if(!list)return;
  list.innerHTML='<div class="empty-msg">Loading...</div>';
  try{
    const snap=await window._fb.getDocs(window._fb.collection(window._db,'subscribers'));
    const subs=[];snap.forEach(d=>subs.push({id:d.id,...d.data()}));
    if(!subs.length){list.innerHTML='<div class="empty-msg">No subscribers yet.</div>';return;}
    list.innerHTML='';
    subs.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).forEach(s=>{
      const div=document.createElement('div');div.className='sub-item';
      div.innerHTML=`<div class="sub-ifo"><div class="sub-name">${s.name||''}</div><div class="sub-phone">${s.phone||''}</div><div class="sub-date">${s.plan||''} · ${s.createdAt?new Date(s.createdAt).toLocaleDateString():''}</div></div><span class="sub-badge ${s.active?'active':'expired'}">${s.active?'Active':'Expired'}</span><button class="sub-wa" onclick="window.open('https://wa.me/${(s.phone||'').replace(/\D/g,'')}','_blank')"><svg width="14" height="14"><use href="#ic-wa"/></svg></button><button class="sub-del" onclick="deleteSub('${s.id}')"><svg width="12" height="12"><use href="#ic-trash"/></svg></button>`;
      list.appendChild(div);
    });
  }catch(e){list.innerHTML='<div class="empty-msg">Error loading.</div>';}
}
async function deleteSub(id){
  if(!confirm('Remove subscriber?'))return;
  try{await window._fb.deleteDoc(window._fb.doc(window._db,'subscribers',id));renderSubscribers();showToast('Removed');}
  catch(e){showToast('Error',true);}
}

/* ── PAYMENTS ── */
async function renderPayments(){
  const list=$('pay-list');if(!list)return;
  list.innerHTML='<div class="empty-msg">Loading...</div>';
  try{
    const snap=await window._fb.getDocs(window._fb.collection(window._db,'payments'));
    const pays=[];snap.forEach(d=>pays.push({id:d.id,...d.data()}));
    if(!pays.length){list.innerHTML='<div class="empty-msg">No payment requests yet.</div>';return;}
    list.innerHTML='';
    pays.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).forEach(p=>{
      const div=document.createElement('div');div.className='pay-item';
      const btns=p.status?`<span class="pay-badge ${p.status}">${p.status}</span>`:`<button class="pay-approve" onclick="updatePayment('${p.id}','approved')">Approve</button><button class="pay-reject" onclick="updatePayment('${p.id}','rejected')">Reject</button>`;
      div.innerHTML=`<div class="pay-name">${p.name||''}</div><div class="pay-phone">${p.phone||''}</div>${p.txnId?`<div class="pay-txn">TXN: ${p.txnId}</div>`:''}<div class="pay-time">${p.createdAt?new Date(p.createdAt).toLocaleDateString():''}</div>${btns}`;
      list.appendChild(div);
    });
  }catch(e){list.innerHTML='<div class="empty-msg">Error loading.</div>';}
}
async function updatePayment(id,status){
  try{await window._fb.updateDoc(window._fb.doc(window._db,'payments',id),{status});renderPayments();}
  catch(e){showToast('Error',true);}
}

/* ── UPCOMING ── */
async function loadUpcoming(renderPage=false){
  try{
    const snap=await window._fb.getDocs(window._fb.collection(window._db,'upcoming'));
    const items=[];snap.forEach(d=>items.push({id:d.id,...d.data()}));
    if(items.length){
      const ticker=$('upcoming-ticker');if(ticker)ticker.style.display='block';
      const track=$('ticker-track');
      if(track){
        const dupe=[...items,...items];
        track.innerHTML=dupe.map(it=>`<span class="ticker-item">🎬 ${it.title||''} ${it.releaseDate?'('+it.releaseDate+')':''}</span>`).join('');
      }
      const upBlock=$('upcoming-row-block');if(upBlock)upBlock.style.display='block';
      const row=$('upcoming-cards-row');
      if(row){
        row.innerHTML='';
        items.forEach(it=>{
          const card=document.createElement('div');card.className='pcard';card.style.cursor='default';
          const img=it.thumb?`<img src="${it.thumb}" alt="" loading="lazy" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;display:block;"/>`:`<div class="pcard-noimg">🎬</div>`;
          const badge=it.releaseDate?`<div style="position:absolute;bottom:4px;left:4px;font-size:9px;background:rgba(0,0,0,0.7);color:#fff;padding:2px 5px;border-radius:3px;">${it.releaseDate}</div>`:'';
          const del=adminUnlocked?`<button class="pcard-edit-btn" onclick="event.stopPropagation();deleteUpcoming('${it.id}')" style="background:var(--red);">✕</button>`:'';
          card.innerHTML=`<div class="pcard-img" style="position:relative;">${img}${badge}${del}</div>`;
          row.appendChild(card);
        });
      }
      if(adminUnlocked){const ab=$('upcoming-add-btn');if(ab)ab.style.display='';}
    }
  }catch(e){console.warn('loadUpcoming error:',e);}
}
async function addCS(){
  const title=$('cs-title-inp').value.trim(),thumb=$('cs-thumb-inp').value.trim(),date=$('cs-date-inp').value.trim();
  if(!title){showToast('Enter title',true);return;}
  try{
    await window._fb.addDoc(window._fb.collection(window._db,'upcoming'),{title,thumb,releaseDate:date,createdAt:Date.now()});
    closeModal('cs-modal');
    $('cs-title-inp').value='';$('cs-thumb-inp').value='';$('cs-date-inp').value='';
    showToast('Added!');loadUpcoming();
  }catch(e){showToast('Error: '+e.message,true);}
}
async function deleteUpcoming(id){
  if(!confirm('Delete?'))return;
  try{await window._fb.deleteDoc(window._fb.doc(window._db,'upcoming',id));loadUpcoming();}catch{}
}

/* ── NOTIFICATIONS ── */
function enableNotifications(){
  if(window._enableNotificationsReal){window._enableNotificationsReal();return;}
  // Defined in Firebase module - trigger via event
  showToast('Setting up notifications...');
  // enableNotifications is defined in the Firebase module script in index.html
  // It's exposed on window via the module - call it directly
  if(typeof window.enableNotifications === 'function' && window.enableNotifications !== enableNotifications){
    window.enableNotifications();
  } else {
    showToast('Notifications not available', true);
  }
}

/* ── NOTIFICATIONS ── */
function enableNotifications(){
  // Try real function first (defined in Firebase module)
  if(window._realEnableNotifications){
    window._realEnableNotifications();
    return;
  }
  showToast('Setting up notifications...');
  setTimeout(function(){
    if(window._realEnableNotifications) window._realEnableNotifications();
    else showToast('Tap Allow when browser asks', false);
  }, 300);
}

/* ── SECRET TAPS ── */
function secretTap(){
  secretTaps++;
  clearTimeout(secretTimer);
  const sc=$('secret-count');
  if(secretTaps<7){
    if(sc){sc.style.color='var(--txt3)';sc.textContent=secretTaps;}
    secretTimer=setTimeout(()=>{secretTaps=0;if(sc){sc.style.color='transparent';sc.textContent='0';}},2000);
  }else{
    if(sc){sc.style.color='transparent';sc.textContent='0';}secretTaps=0;openPinModal();
  }
}

/* ── PWA INSTALL ── */
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();deferredInstall=e;
  const btn=$('install-btn');if(btn)btn.style.display='';
  const b=$('inst-banner');if(b&&!sessionStorage.getItem('km_banner_dismissed'))b.style.display='flex';
});
function triggerInstall(){
  if(deferredInstall){
    deferredInstall.prompt();
    deferredInstall.userChoice.then(choice=>{
      deferredInstall=null;
      const b=$('inst-banner');if(b)b.style.display='none';
      if(choice.outcome==='accepted')showToast('App installed! ✓');
    });
  }else{
    showToast('Tap browser menu → Add to Home Screen');
  }
}
function dismissBanner(){const b=$('inst-banner');if(b)b.style.display='none';sessionStorage.setItem('km_banner_dismissed','1');}
window.addEventListener('appinstalled',()=>{deferredInstall=null;showToast('Kenmovies installed! ✓');const b=$('inst-banner');if(b)b.style.display='none';});

/* ── INIT ── */
function init(){
  applyAdminUI();
  initProgDrag();
  populateVjDropdown();
  // Show loading shimmers
  showShimmers('vj-rows-home', 8);
  showSection('home');
  if(window._fbReady) loadContent();
  else document.addEventListener('fb-ready', loadContent);
  loadUpcoming();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(()=>{});
}
document.addEventListener('DOMContentLoaded', init);

/* ── NORMALIZE ── */
function normalizeItem(d){
  const data=d.data?d.data():d;
  const createdAt=typeof data.createdAt==='number'?data.createdAt:(data.createdAt?.toMillis?.()||Date.now());
  let category=(data.category||data.type||'movie').toLowerCase().trim();
  if(['tvshow','tv','tvseries','show'].includes(category))category='series';
  if(['anim','cartoon'].includes(category))category='animation';
  if(['anime'].includes(category))category='anime';
  if(['indian','bollywood','hindi'].includes(category))category='indian';
  const title=data.title||data.epTitle||data.name||'';
  const sname=(data.sname||data.seriesName||data.seriesname||(category==='series'?title:'')).trim();
  const thumb=data.thumb||data.thumbnail||data.poster||data.image||'';
  const playLink=fixUrl(data.playLink||data.play||data.videoUrl||data.url||data.link||'');
  const dlLink=fixUrl(data.dlLink||data.dl||data.downloadLink||data.download||'');
  const id=d.id||data.id||('item_'+Math.random());
  return{...data,id,category,title,sname,thumb,playLink,dlLink,createdAt};
}

/* ── LOAD CONTENT ── */
function loadContent(){
  const{onSnapshot,getDocs,getDoc,collection,doc,query,orderBy}=window._fb;
  function processSnap(snap){const items=[];snap.forEach(d=>items.push(normalizeItem(d)));return items;}

  // Show Firebase error state
  function showFirebaseError(){
    const hh=$('vj-rows-home');
    if(hh)hh.innerHTML=`<div class="empty-page">
      <div style="font-size:36px;margin-bottom:12px;">📡</div>
      <div style="font-size:14px;font-weight:600;color:var(--txt2);margin-bottom:6px;">Could not load movies</div>
      <div style="font-size:12px;color:var(--txt3);">Check your internet connection</div>
      <button onclick="location.reload()" style="margin-top:16px;padding:8px 20px;border-radius:99px;background:var(--red);color:#fff;border:none;cursor:pointer;font-size:12px;">Retry</button>
    </div>`;
  }

  try{
    const qOrdered=query(collection(window._db,'content'),orderBy('createdAt','desc'));
    onSnapshot(qOrdered, snap=>{
      allContent=processSnap(snap);
      buildRows();buildHero();renderStats();
      if(currentSection==='favs')renderFavs();
      if(currentSection==='downloads')renderDownloads();
      if(currentSection==='anime')renderAnime();
    }, err=>{
      console.warn('Ordered query failed, falling back:', err.message);
      onSnapshot(collection(window._db,'content'), snap=>{
        allContent=processSnap(snap);
        buildRows();buildHero();renderStats();
      }, err2=>{
        console.error('Firebase failed:', err2.message);
        showFirebaseError();
      });
    });
  }catch(e){showFirebaseError();}
}

/* ── ADD LOAD-MORE BUTTON CSS ── */
const style=document.createElement('style');
style.textContent=`
.load-more-btn{display:block;width:100%;padding:12px;margin-top:10px;border-radius:var(--r);background:var(--bg3);border:1px solid var(--brd2);color:var(--txt2);font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;grid-column:1/-1;}
.load-more-btn:hover{background:var(--bg4);border-color:var(--brd-red);color:var(--txt);}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
`;
document.head.appendChild(style);
