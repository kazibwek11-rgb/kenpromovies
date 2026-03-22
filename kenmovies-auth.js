/* ═══════════════════════════════════════
   KENMOVIES AUTH SYSTEM
   Login, Signup, Subscription-based Downloads
   Add this to your app3.js file
   ═══════════════════════════════════════ */

/* ── AUTH STATE ─────────────────────────── */
let currentUser = null;

/* Load user from localStorage on startup */
function loadAuthState() {
  const saved = localStorage.getItem('km_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      updateAuthUI();
    } catch { currentUser = null; }
  }
}

/* ── AUTH UI ─────────────────────────────── */
function updateAuthUI() {
  const loginBtn = document.getElementById('auth-login-btn');
  const userBtn = document.getElementById('auth-user-btn');
  const userName = document.getElementById('auth-user-name');
  const subBadge = document.getElementById('auth-sub-badge');

  if (currentUser) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (userBtn) userBtn.style.display = 'flex';
    if (userName) userName.textContent = currentUser.name || currentUser.phone || 'User';
    if (subBadge) {
      subBadge.textContent = currentUser.subscribed ? '⭐ PRO' : 'Free';
      subBadge.className = 'auth-sub-badge ' + (currentUser.subscribed ? 'pro' : 'free');
    }
  } else {
    if (loginBtn) loginBtn.style.display = 'flex';
    if (userBtn) userBtn.style.display = 'none';
  }

  /* Update download buttons based on subscription */
  updateDownloadButtons();
}

function updateDownloadButtons() {
  /* Show/hide all download buttons based on subscription */
  document.querySelectorAll('.btn-dl, .sd-dl-btn, .kp-dl-btn').forEach(btn => {
    if (!currentUser) {
      btn.style.display = 'none';
    } else if (currentUser.subscribed) {
      btn.style.display = '';
    } else {
      btn.style.display = 'none';
    }
  });

  /* Show subscribe prompt if logged in but not subscribed */
  const subPrompt = document.getElementById('sub-prompt');
  if (subPrompt) {
    subPrompt.style.display = (currentUser && !currentUser.subscribed) ? 'block' : 'none';
  }
}

/* ── OPEN/CLOSE AUTH MODALS ─────────────── */
function openLoginModal() {
  document.getElementById('login-modal').classList.add('open');
  document.getElementById('login-phone').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-err').textContent = '';
}

function closeLoginModal() {
  document.getElementById('login-modal').classList.remove('open');
}

function openSignupModal() {
  closeLoginModal();
  document.getElementById('signup-modal').classList.add('open');
  document.getElementById('signup-name').value = '';
  document.getElementById('signup-phone').value = '';
  document.getElementById('signup-pass').value = '';
  document.getElementById('signup-conf').value = '';
  document.getElementById('signup-err').textContent = '';
}

function closeSignupModal() {
  document.getElementById('signup-modal').classList.remove('open');
}

function openSubscribeModal() {
  if (!currentUser) { openLoginModal(); return; }
  document.getElementById('subscribe-modal').classList.add('open');
  document.getElementById('pay-name').value = currentUser.name || '';
  document.getElementById('pay-phone').value = currentUser.phone || '';
  document.getElementById('pay-txn').value = '';
  document.getElementById('pay-err').textContent = '';
}

function closeSubscribeModal() {
  document.getElementById('subscribe-modal').classList.remove('open');
}

function openUserMenu() {
  document.getElementById('user-menu-modal').classList.add('open');
  const nameEl = document.getElementById('um-name');
  const phoneEl = document.getElementById('um-phone');
  const statusEl = document.getElementById('um-status');
  if (nameEl) nameEl.textContent = currentUser?.name || 'User';
  if (phoneEl) phoneEl.textContent = currentUser?.phone || '';
  if (statusEl) {
    statusEl.textContent = currentUser?.subscribed ? '⭐ PRO Subscriber' : 'Free Account';
    statusEl.className = 'um-status ' + (currentUser?.subscribed ? 'pro' : 'free');
  }
}

function closeUserMenu() {
  document.getElementById('user-menu-modal').classList.remove('open');
}

/* ── HASH PASSWORD (simple) ─────────────── */
function hashPass(pass) {
  let hash = 0;
  for (let i = 0; i < pass.length; i++) {
    const char = pass.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'km_' + Math.abs(hash).toString(36) + pass.length;
}

/* ── SIGNUP ─────────────────────────────── */
async function submitSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const phone = document.getElementById('signup-phone').value.trim();
  const pass = document.getElementById('signup-pass').value;
  const conf = document.getElementById('signup-conf').value;
  const err = document.getElementById('signup-err');

  if (!name) { err.textContent = 'Enter your name'; return; }
  if (!phone || phone.length < 9) { err.textContent = 'Enter a valid phone number'; return; }
  if (pass.length < 4) { err.textContent = 'Password must be at least 4 characters'; return; }
  if (pass !== conf) { err.textContent = 'Passwords do not match'; return; }

  const btn = document.getElementById('signup-btn');
  btn.disabled = true;
  btn.textContent = 'Creating account...';

  try {
    const { collection, addDoc, getDocs } = window._fb;

    /* Check if phone already exists */
    const snap = await getDocs(collection(window._db, 'users'));
    let exists = false;
    snap.forEach(d => { if (d.data().phone === phone) exists = true; });

    if (exists) {
      err.textContent = 'Phone number already registered. Please login.';
      btn.disabled = false;
      btn.textContent = 'Create Account';
      return;
    }

    /* Create user */
    const userDoc = await addDoc(collection(window._db, 'users'), {
      name,
      phone,
      passHash: hashPass(pass),
      subscribed: false,
      plan: 'free',
      createdAt: new Date().toISOString()
    });

    currentUser = { id: userDoc.id, name, phone, subscribed: false, plan: 'free' };
    localStorage.setItem('km_user', JSON.stringify(currentUser));
    closeSignupModal();
    updateAuthUI();
    showToast('Welcome to Kenmovies, ' + name + '! 🎬');

  } catch (e) {
    err.textContent = 'Error: ' + e.message;
  }

  btn.disabled = false;
  btn.textContent = 'Create Account';
}

/* ── LOGIN ─────────────────────────────── */
async function submitLogin() {
  const phone = document.getElementById('login-phone').value.trim();
  const pass = document.getElementById('login-pass').value;
  const err = document.getElementById('login-err');

  if (!phone) { err.textContent = 'Enter your phone number'; return; }
  if (!pass) { err.textContent = 'Enter your password'; return; }

  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = 'Logging in...';

  try {
    const { collection, getDocs } = window._fb;
    const snap = await getDocs(collection(window._db, 'users'));

    let foundUser = null;
    snap.forEach(d => {
      const data = d.data();
      if (data.phone === phone && data.passHash === hashPass(pass)) {
        foundUser = { id: d.id, ...data };
      }
    });

    if (!foundUser) {
      err.textContent = 'Wrong phone number or password';
      btn.disabled = false;
      btn.textContent = 'Login';
      return;
    }

    /* Check subscription status from subscribers collection */
    const subSnap = await getDocs(collection(window._db, 'subscribers'));
    let isSubscribed = false;
    subSnap.forEach(d => {
      const sub = d.data();
      if (sub.phone === phone && sub.active === true) isSubscribed = true;
    });

    currentUser = {
      id: foundUser.id,
      name: foundUser.name,
      phone: foundUser.phone,
      subscribed: isSubscribed,
      plan: isSubscribed ? 'pro' : 'free'
    };

    localStorage.setItem('km_user', JSON.stringify(currentUser));
    closeLoginModal();
    updateAuthUI();
    showToast('Welcome back, ' + currentUser.name + '! 🎬');

  } catch (e) {
    err.textContent = 'Error: ' + e.message;
  }

  btn.disabled = false;
  btn.textContent = 'Login';
}

/* ── LOGOUT ─────────────────────────────── */
function logout() {
  currentUser = null;
  localStorage.removeItem('km_user');
  closeUserMenu();
  updateAuthUI();
  showToast('Logged out');
}

/* ── SUBMIT PAYMENT REQUEST ─────────────── */
async function submitPayment() {
  const name = document.getElementById('pay-name').value.trim();
  const phone = document.getElementById('pay-phone').value.trim();
  const txn = document.getElementById('pay-txn').value.trim();
  const plan = document.getElementById('pay-plan').value;
  const err = document.getElementById('pay-err');

  if (!name || !phone) { err.textContent = 'Name and phone required'; return; }
  if (!txn) { err.textContent = 'Enter your MTN/Airtel transaction ID'; return; }

  const btn = document.getElementById('pay-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    const { collection, addDoc } = window._fb;
    await addDoc(collection(window._db, 'payments'), {
      name, phone, txnId: txn, plan,
      status: 'pending',
      userId: currentUser?.id || '',
      createdAt: new Date().toISOString()
    });

    closeSubscribeModal();
    showToast('Payment submitted! Admin will activate your account within 24 hours. 🎉');

  } catch (e) {
    err.textContent = 'Error: ' + e.message;
  }

  btn.disabled = false;
  btn.textContent = 'Submit Payment';
}

/* ── OVERRIDE DOWNLOAD FUNCTION ─────────── */
/* Replace the original startDownload to check subscription */
const _originalStartDownload = window.startDownload;
window.startDownload = function(m) {
  if (!currentUser) {
    openLoginModal();
    showToast('Login to download movies', true);
    return;
  }
  if (!currentUser.subscribed) {
    openSubscribeModal();
    showToast('Subscribe to download movies', true);
    return;
  }
  /* User is subscribed — allow download */
  if (_originalStartDownload) _originalStartDownload(m);
};

const _originalStartDownloadByUrl = window.startDownloadByUrl;
window.startDownloadByUrl = function(url, title) {
  if (!currentUser) {
    openLoginModal();
    showToast('Login to download movies', true);
    return;
  }
  if (!currentUser.subscribed) {
    openSubscribeModal();
    showToast('Subscribe to download movies', true);
    return;
  }
  if (_originalStartDownloadByUrl) _originalStartDownloadByUrl(url, title);
};

/* Also override kpDownload */
window.kpDownload = function() {
  if (!currentUser) {
    openLoginModal();
    showToast('Login to download movies', true);
    return;
  }
  if (!currentUser.subscribed) {
    openSubscribeModal();
    showToast('Subscribe to download movies', true);
    return;
  }
  const url = window.kpCurrentDl || window.kpCurrentUrl;
  if (!url) { showToast('No download link', true); return; }
  if (_originalStartDownloadByUrl) _originalStartDownloadByUrl(url, window.currentPlayItem?.title || 'Video');
};

/* ── ADMIN: APPROVE PAYMENT = ACTIVATE SUB ── */
const _originalUpdatePayment = window.updatePayment;
window.updatePayment = async function(id, status) {
  if (status === 'approved') {
    try {
      const { getDoc, doc, getDocs, collection, updateDoc, query, where } = window._fb;
      const payDoc = await getDoc(doc(window._db, 'payments', id));
      if (payDoc.exists()) {
        const pay = payDoc.data();
        /* Add to subscribers */
        const { addDoc } = window._fb;
        await addDoc(collection(window._db, 'subscribers'), {
          name: pay.name,
          phone: pay.phone,
          plan: pay.plan || 'monthly',
          active: true,
          createdAt: new Date().toISOString()
        });
        showToast('Subscriber activated! ✓');
      }
    } catch (e) { console.error(e); }
  }
  if (_originalUpdatePayment) _originalUpdatePayment(id, status);
};

/* ── INIT AUTH ─────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  loadAuthState();
});

/* Export functions to window */
window.openLoginModal = openLoginModal;
window.closeLoginModal = closeLoginModal;
window.openSignupModal = openSignupModal;
window.closeSignupModal = closeSignupModal;
window.openSubscribeModal = openSubscribeModal;
window.closeSubscribeModal = closeSubscribeModal;
window.openUserMenu = openUserMenu;
window.closeUserMenu = closeUserMenu;
window.submitLogin = submitLogin;
window.submitSignup = submitSignup;
window.submitPayment = submitPayment;
window.logout = logout;
window.updateDownloadButtons = updateDownloadButtons;
