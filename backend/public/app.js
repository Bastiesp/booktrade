/* ══════════════════════════════════════════════════
   BookSwipe v2 — app.js
   ══════════════════════════════════════════════════ */

const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:4000'
  : '';

/* ── Estado global ──────────────────────────────── */
const state = {
  token:         localStorage.getItem('bs_token'),
  user:          null,
  view:          null,  // null = sin vista cargada todavía
  discoverQueue: [],
  myBooks:       [],
  matches:       [],
  matchCount:    0,
  unreadChats:   {},     // { roomId: count }
  activeFilter:  'Todos',
  cityFilter:    '',
  socket:        null,
  activeChatRoom: null,
};

const GENRES = [
  'Todos','Ficción','No ficción','Ciencia ficción','Fantasía',
  'Terror','Romance','Thriller','Historia','Biografía',
  'Ciencia','Filosofía','Poesía','Infantil','Cómic','Otro'
];
const GENRES_BOOK = GENRES.filter(g => g !== 'Todos');

const COVER_COLORS = [
  '#4A1E2A','#1E3A5F','#1E4A2E','#3D1E5F',
  '#5C2E18','#1E4A4A','#5C3818','#2A1E4A',
];

/* ── Helpers ────────────────────────────────────── */
const $  = id => document.getElementById(id);
const app = () => document.getElementById('app');

function bookColor(str) {
  let h = 0;
  for (const c of (str || '')) h = (h * 31 + c.charCodeAt(0)) & 0xfffffff;
  return COVER_COLORS[h % COVER_COLORS.length];
}
function initials(name) { return (name || '??').slice(0, 2).toUpperCase(); }
function escapeHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeAttr(str) {
  return String(str || '').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function formatTime(date) {
  const d = new Date(date);
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}
function roomId(uid1, uid2) {
  return [uid1, uid2].sort().join('_');
}
function totalUnread() {
  return Object.values(state.unreadChats).reduce((a, b) => a + b, 0);
}

/* ── API Helper ─────────────────────────────────── */
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (state.token) opts.headers['Authorization'] = `Bearer ${state.token}`;
  if (body)        opts.body = JSON.stringify(body);

  const res  = await fetch(`${API_URL}${path}`, opts);
  const data = await res.json().catch(() => ({ error: 'Error de conexión' }));

  /* ── BUG FIX: Solo cerrar sesión en 401 si NO es un endpoint de auth ── */
  if (res.status === 401) {
    const isAuthEndpoint = path.startsWith('/api/auth/');
    if (!isAuthEndpoint && state.token) {
      logout();
      return null;
    }
    // Para auth endpoints, dejar que caiga al throw de abajo
  }
  if (!res.ok) throw new Error(data.error || 'Error desconocido');
  return data;
}

/* ── Toast ──────────────────────────────────────── */
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ── Notificación en pantalla ───────────────────── */
let notifTimer = null;
function showNotifBar(icon, title, sub, onClick) {
  let bar = document.querySelector('.notif-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'notif-bar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `
    <div class="notif-bar-icon">${icon}</div>
    <div class="notif-bar-text">
      <div class="notif-bar-title">${escapeHtml(title)}</div>
      <div class="notif-bar-sub">${escapeHtml(sub)}</div>
    </div>`;
  bar.onclick = () => { hideNotifBar(); onClick?.(); };
  clearTimeout(notifTimer);
  requestAnimationFrame(() => bar.classList.add('show'));
  notifTimer = setTimeout(hideNotifBar, 4000);
}
function hideNotifBar() {
  const bar = document.querySelector('.notif-bar');
  if (bar) bar.classList.remove('show');
}

/* ── Browser Notifications ──────────────────────── */
async function requestNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const p = await Notification.requestPermission();
  return p === 'granted';
}
function sendBrowserNotif(title, body, icon = '📚') {
  if (Notification.permission === 'granted' && document.hidden) {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

/* ── Open Library covers ────────────────────────── */
async function fetchOLCover(title, author) {
  try {
    const q = encodeURIComponent(`${title} ${author}`);
    const r = await fetch(
      `https://openlibrary.org/search.json?q=${q}&limit=1&fields=cover_i`,
      { signal: AbortSignal.timeout(4000) }
    );
    const d  = await r.json();
    const id = d.docs?.[0]?.cover_i;
    return id ? `https://covers.openlibrary.org/b/id/${id}-M.jpg` : null;
  } catch { return null; }
}
function applyBookCover(imgEl, placeholderEl, title, author) {
  fetchOLCover(title, author).then(url => {
    if (!url || !imgEl.isConnected) return;
    imgEl.src = url;
    imgEl.style.display = 'block';
    if (placeholderEl) placeholderEl.style.display = 'none';
    imgEl.onerror = () => {
      imgEl.style.display = 'none';
      if (placeholderEl) placeholderEl.style.display = 'flex';
    };
  });
}

/* ════════════════════════════════════════════════
   SOCKET.IO
   ════════════════════════════════════════════════ */
function initSocket() {
  if (state.socket?.connected) return;
  if (typeof io === 'undefined') return;

  state.socket = io({ auth: { token: state.token } });

  state.socket.on('connect', () => console.log('Socket conectado'));
  state.socket.on('connect_error', e => console.warn('Socket error:', e.message));

  /* Mensaje nuevo */
  state.socket.on('new-message', (msg) => {
    const myId = state.user?._id || state.user?.id;
    const rId  = roomId(myId, msg.sender._id || msg.sender);

    /* Si el chat está abierto, agregar el mensaje */
    if (state.activeChatRoom === rId) {
      appendChatMessage(msg, myId);
    } else {
      /* Si no está abierto, aumentar badge */
      state.unreadChats[rId] = (state.unreadChats[rId] || 0) + 1;
      renderNav();
      updateMatchUnreadBadges();

      /* Mostrar notificación en pantalla */
      const senderName = msg.sender?.username || 'Alguien';
      showNotifBar('💬', `Mensaje de @${senderName}`, msg.text, () => {
        const match = state.matches.find(m => m.matchedUser.id.toString() === (msg.sender._id || msg.sender).toString());
        if (match) openChat(match);
      });

      /* Notificación del sistema */
      sendBrowserNotif(`📚 @${senderName} te escribió`, msg.text);
    }
  });

  /* Typing indicators */
  state.socket.on('user-typing', ({ username }) => {
    const dots = document.querySelector('.chat-typing');
    if (dots) {
      dots.classList.add('show');
      dots.innerHTML = `<div class="chat-typing-dots"><span></span><span></span><span></span></div>`;
    }
  });
  state.socket.on('user-stop-typing', () => {
    document.querySelector('.chat-typing')?.classList.remove('show');
  });
}

/* ════════════════════════════════════════════════
   AUTH
   ════════════════════════════════════════════════ */
function renderAuth(tab = 'login') {
  app().innerHTML = `
    <div class="auth-screen">
      <div class="auth-logo">
        <div class="auth-logo-icon">📚</div>
        <div class="auth-logo-title">Book<span>Swipe</span></div>
        <div class="auth-logo-sub">Desliza · Conecta · Intercambia</div>
      </div>
      <div class="auth-card">
        <div class="auth-tabs">
          <button class="auth-tab ${tab==='login'?'active':''}" id="tab-login">Ingresar</button>
          <button class="auth-tab ${tab==='register'?'active':''}" id="tab-reg">Registrarse</button>
        </div>
        <div id="auth-form"></div>
      </div>
    </div>`;

  $('tab-login').addEventListener('click', () => renderAuth('login'));
  $('tab-reg').addEventListener('click',   () => renderAuth('register'));

  if (tab === 'login') renderLoginForm();
  else                 renderRegisterForm();
}

function renderLoginForm() {
  $('auth-form').innerHTML = `
    <div class="form-group">
      <label class="form-label">Correo o usuario</label>
      <input class="form-input" id="f-ident" type="text" placeholder="tucorreo@email.com" autocomplete="username" />
    </div>
    <div class="form-group">
      <label class="form-label">Contraseña</label>
      <input class="form-input" id="f-pass" type="password" placeholder="••••••••" autocomplete="current-password" />
    </div>
    <button class="btn-primary" id="btn-login">Ingresar</button>`;

  $('btn-login').addEventListener('click', doLogin);
  [$('f-ident'), $('f-pass')].forEach(el =>
    el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); })
  );
}

async function doLogin() {
  const identifier = $('f-ident').value.trim();
  const password   = $('f-pass').value;
  if (!identifier || !password) return toast('Completa todos los campos', 'error');

  const btn = $('btn-login');
  btn.disabled = true;
  btn.textContent = 'Ingresando...';

  try {
    const data = await api('POST', '/api/auth/login', { identifier, password });
    if (!data) { btn.disabled = false; btn.textContent = 'Ingresar'; return; }
    state.token = data.token;
    state.user  = data.user;
    localStorage.setItem('bs_token', data.token);
    await startApp(); // ya tenemos el usuario, no re-verificar
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
}

function renderRegisterForm() {
  $('auth-form').innerHTML = `
    <div class="form-group">
      <label class="form-label">Nombre de usuario</label>
      <input class="form-input" id="f-user" type="text" placeholder="mi_usuario" autocomplete="username" />
    </div>
    <div class="form-group">
      <label class="form-label">Correo electrónico</label>
      <input class="form-input" id="f-email" type="email" placeholder="tucorreo@email.com" autocomplete="email" />
    </div>
    <div class="form-group">
      <label class="form-label">Contraseña (mín. 6 caracteres)</label>
      <input class="form-input" id="f-pass2" type="password" placeholder="••••••••" autocomplete="new-password" />
    </div>
    <button class="btn-primary" id="btn-reg">Crear cuenta</button>`;

  $('btn-reg').addEventListener('click', doRegister);
}

async function doRegister() {
  const username = $('f-user').value.trim();
  const email    = $('f-email').value.trim();
  const password = $('f-pass2').value;
  if (!username || !email || !password) return toast('Completa todos los campos', 'error');

  const btn = $('btn-reg');
  btn.disabled = true;
  btn.textContent = 'Creando cuenta...';

  try {
    const data = await api('POST', '/api/auth/register', { username, email, password });
    if (!data) { btn.disabled = false; btn.textContent = 'Crear cuenta'; return; }
    state.token = data.token;
    state.user  = data.user;
    localStorage.setItem('bs_token', data.token);
    toast('¡Bienvenido a BookSwipe! 📚', 'success');
    await startApp(); // ya tenemos el usuario, no re-verificar
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Crear cuenta';
  }
}

function logout() {
  state.socket?.disconnect();
  state.socket = null;
  state.token  = null;
  state.user   = null;
  localStorage.removeItem('bs_token');
  renderAuth('login');
}

/* ════════════════════════════════════════════════
   NAVEGACIÓN
   ════════════════════════════════════════════════ */
function renderNav() {
  const views = {
    discover: `<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>`,
    books:    `<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/>`,
    matches:  `<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>`,
    profile:  `<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  };
  const labels = { discover:'Descubrir', books:'Mis Libros', matches:'Matches', profile:'Perfil' };

  const existing = document.querySelector('.bottom-nav');
  if (existing) {
    existing.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === state.view);
    });
    const dot = existing.querySelector('[data-nav-dot]');
    if (dot) dot.style.display = (state.matchCount > 0 || totalUnread() > 0) ? 'block' : 'none';
    return;
  }

  const nav = document.createElement('div');
  nav.className = 'bottom-nav';
  nav.innerHTML = Object.entries(views).map(([v, icon]) => `
    <button class="nav-item ${v===state.view?'active':''}" data-view="${v}">
      ${icon}</svg>
      ${v==='matches' ? '<span class="nav-dot" data-nav-dot style="display:' + ((state.matchCount > 0 || totalUnread() > 0) ? 'block' : 'none') + '"></span>' : ''}
      <span class="nav-item-label">${labels[v]}</span>
    </button>`).join('');

  nav.querySelectorAll('.nav-item').forEach(btn =>
    btn.addEventListener('click', () => navigate(btn.dataset.view))
  );
  app().appendChild(nav);
}

async function navigate(view) {
  state.view = view;
  renderNav();
  document.querySelector('.view')?.remove();
  document.querySelector('.fab')?.remove();

  switch (view) {
    case 'discover': await renderDiscover(); break;
    case 'books':    await renderMyBooks();  break;
    case 'matches':  await renderMatches();  break;
    case 'profile':  await renderProfile();  break;
  }
}

/* ════════════════════════════════════════════════
   DISCOVER — Swipe con filtros
   ════════════════════════════════════════════════ */
async function renderDiscover() {
  const viewEl = document.createElement('div');
  viewEl.className = 'view';

  viewEl.innerHTML = `
    <div class="topbar">
      <div class="topbar-title">Book<span>Swipe</span></div>
      <div id="discover-counter" class="topbar-badge" style="display:none"></div>
    </div>

    <!-- Filtro por género -->
    <div class="filter-bar" id="filter-genres">
      ${GENRES.map(g => `
        <button class="filter-chip ${g === state.activeFilter ? 'active' : ''}" data-genre="${g}">
          ${escapeHtml(g)}
        </button>`).join('')}
    </div>

    <!-- Filtro por ciudad -->
    <div class="filter-city-wrap">
      <input class="filter-city-input" id="filter-city" type="text"
        placeholder="🏙 Filtrar por ciudad..." value="${escapeAttr(state.cityFilter)}" />
      <button class="filter-apply-btn" id="filter-apply">Buscar</button>
    </div>

    <div class="discover-wrap">
      <div id="card-stack-wrap" class="card-stack"></div>
      <div class="action-buttons">
        <button class="action-btn action-btn-nope" id="btn-nope">✕</button>
        <button class="action-btn action-btn-like" id="btn-like">♥</button>
      </div>
    </div>`;

  const nav = document.querySelector('.bottom-nav');
  app().insertBefore(viewEl, nav);

  /* Filtro género */
  viewEl.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.activeFilter = chip.dataset.genre;
      viewEl.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      loadDiscoverBooks();
    });
  });

  /* Filtro ciudad */
  $('filter-apply').addEventListener('click', () => {
    state.cityFilter = $('filter-city').value.trim();
    loadDiscoverBooks();
  });
  $('filter-city').addEventListener('keydown', e => {
    if (e.key === 'Enter') { state.cityFilter = e.target.value.trim(); loadDiscoverBooks(); }
  });

  /* Botones acción */
  $('btn-nope').addEventListener('click', () => triggerSwipe('left'));
  $('btn-like').addEventListener('click', () => triggerSwipe('right'));

  await loadDiscoverBooks();
}

async function loadDiscoverBooks() {
  const wrap = $('card-stack-wrap');
  if (!wrap) return;
  wrap.innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;

  try {
    let url = '/api/books/discover';
    const params = [];
    if (state.activeFilter && state.activeFilter !== 'Todos') params.push(`genre=${encodeURIComponent(state.activeFilter)}`);
    if (state.cityFilter) params.push(`city=${encodeURIComponent(state.cityFilter)}`);
    if (params.length) url += '?' + params.join('&');

    state.discoverQueue = await api('GET', url);
    buildCardStack();
  } catch (err) {
    toast(err.message, 'error');
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-sub">${escapeHtml(err.message)}</div></div>`;
  }
}

function buildCardStack() {
  const wrap    = $('card-stack-wrap');
  const counter = $('discover-counter');
  if (!wrap) return;

  const total = state.discoverQueue.length;

  if (total === 0) {
    if (counter) counter.style.display = 'none';
    const filterMsg = state.activeFilter !== 'Todos' || state.cityFilter
      ? 'Intenta cambiar los filtros.'
      : 'Vuelve pronto para nuevos títulos.';
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔭</div>
        <div class="empty-title">¡Todo explorado!</div>
        <div class="empty-sub">${escapeHtml(filterMsg)}</div>
      </div>`;
    return;
  }

  if (counter) { counter.style.display = 'block'; counter.textContent = `${total} libros`; }

  wrap.innerHTML = '';
  const slice = state.discoverQueue.slice(0, 3).reverse();
  slice.forEach(book => wrap.appendChild(buildCard(book)));

  const top = wrap.lastElementChild;
  if (top) initDrag(top, state.discoverQueue[0]._id);
}

function buildCard(book) {
  const color     = bookColor(book._id);
  const photo     = book.photos?.[0];  // primera foto real del libro
  const ownerInfo = book.owner
    ? `📍 ${book.owner.location || '—'} · @${book.owner.username}`
    : '';

  const card = document.createElement('div');
  card.className = 'book-card draggable';
  card.innerHTML = `
    <div class="stamp stamp-like">ME GUSTA</div>
    <div class="stamp stamp-nope">PASO</div>
    <div class="card-cover" style="background:${color}">
      ${photo
        ? `<img src="${escapeAttr(photo)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />`
        : `<div class="card-cover-placeholder">
             <div class="card-cover-placeholder-deco"></div>
             <div class="card-cover-placeholder-title">${escapeHtml(book.title)}</div>
             <div class="card-cover-placeholder-author">${escapeHtml(book.author)}</div>
           </div>`
      }
    </div>
    <div class="card-info">
      <div class="card-title">${escapeHtml(book.title)}</div>
      <div class="card-author">${escapeHtml(book.author)}</div>
      <div class="card-meta">
        <span class="chip chip-genre">${escapeHtml(book.genre)}</span>
        <span class="chip chip-cond">${escapeHtml(book.condition)}</span>
      </div>
      ${book.description ? `<p style="font-size:13px;color:var(--text-2);line-height:1.5;margin-bottom:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(book.description)}</p>` : ''}
      <div class="card-owner">${ownerInfo}</div>
    </div>`;

  return card;
}

function initDrag(card, bookId) {
  let startX = 0, currentX = 0, dragging = false;
  const threshold = 90;
  const likeStamp = card.querySelector('.stamp-like');
  const nopeStamp = card.querySelector('.stamp-nope');
  const getX = e => e.touches ? e.touches[0].clientX : e.clientX;

  const onStart = e => { dragging = true; startX = getX(e); card.style.transition = 'none'; };
  const onMove  = e => {
    if (!dragging) return;
    currentX = getX(e) - startX;
    const rot = currentX * 0.07;
    const t   = Math.min(Math.abs(currentX) / threshold, 1);
    card.style.transform = `translateX(${currentX}px) rotate(${rot}deg)`;
    if (currentX > 0) { likeStamp.style.opacity = t; nopeStamp.style.opacity = 0; }
    else              { nopeStamp.style.opacity = t; likeStamp.style.opacity = 0; }
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    card.style.transition = 'transform .35s cubic-bezier(.25,.46,.45,.94), opacity .35s';
    if (Math.abs(currentX) >= threshold) {
      const dir  = currentX > 0 ? 'right' : 'left';
      const exit = dir === 'right' ? window.innerWidth + 300 : -(window.innerWidth + 300);
      card.style.transform = `translateX(${exit}px) rotate(${currentX * .1}deg)`;
      card.style.opacity   = '0';
      performSwipe(bookId, dir, card);
    } else {
      card.style.transform = '';
      likeStamp.style.opacity = 0;
      nopeStamp.style.opacity = 0;
    }
    currentX = 0;
  };

  card.addEventListener('mousedown',  onStart);
  card.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onEnd);
  card.addEventListener('touchmove', onMove, { passive: true });
  card.addEventListener('touchend',  onEnd);
}

function triggerSwipe(direction) {
  const wrap    = $('card-stack-wrap');
  const topCard = wrap?.lastElementChild;
  if (!topCard?.classList.contains('draggable')) return;
  const book = state.discoverQueue[0];
  if (!book) return;

  const stamp = topCard.querySelector(direction === 'right' ? '.stamp-like' : '.stamp-nope');
  if (stamp) stamp.style.opacity = 1;
  topCard.style.transition = 'transform .4s cubic-bezier(.25,.46,.45,.94), opacity .4s';
  const exit = direction === 'right' ? window.innerWidth + 300 : -(window.innerWidth + 300);
  topCard.style.transform = `translateX(${exit}px) rotate(${direction==='right'?15:-15}deg)`;
  topCard.style.opacity   = '0';
  performSwipe(book._id, direction, topCard);
}

async function performSwipe(bookId, direction, cardEl) {
  state.discoverQueue.shift();
  const counter = $('discover-counter');
  if (counter) {
    if (!state.discoverQueue.length) counter.style.display = 'none';
    else counter.textContent = `${state.discoverQueue.length} libros`;
  }
  setTimeout(() => { cardEl.remove(); buildCardStack(); }, 380);

  try {
    const res = await api('POST', '/api/swipes', { bookId, direction });
    if (!res) return;
    if (direction === 'right' && res.match) {
      state.matchCount++;
      renderNav();
      showMatchModal(res.match);
      sendBrowserNotif('🎉 ¡Nuevo Match!', `Con @${res.match.matchedUser.username}`);
    }
  } catch (err) {
    console.error('Swipe error:', err.message);
  }
}

/* ════════════════════════════════════════════════
   MIS LIBROS
   ════════════════════════════════════════════════ */
async function renderMyBooks() {
  const viewEl = document.createElement('div');
  viewEl.className = 'view';
  viewEl.innerHTML = `
    <div class="topbar">
      <div class="topbar-title">Mis Libros</div>
    </div>
    <div id="books-grid" class="books-grid">
      <div style="grid-column:1/-1" class="empty-state"><div class="spinner"></div></div>
    </div>`;

  const nav = document.querySelector('.bottom-nav');
  app().insertBefore(viewEl, nav);

  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.innerHTML = '+';
  fab.addEventListener('click', () => openAddBookModal());
  app().appendChild(fab);

  try {
    state.myBooks = await api('GET', '/api/books/mine');
    renderBooksGrid();
  } catch (err) { toast(err.message, 'error'); }
}

function renderBooksGrid() {
  const grid = $('books-grid');
  if (!grid) return;

  if (!state.myBooks.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1" class="empty-state">
        <div class="empty-icon">📖</div>
        <div class="empty-title">Sin libros aún</div>
        <div class="empty-sub">Agrega los libros que quieres intercambiar tocando el botón <strong>+</strong></div>
      </div>`;
    return;
  }

  grid.innerHTML = state.myBooks.map(b => {
    const color   = bookColor(b._id);
    const photo   = b.photos?.[0];  // usar primera foto del libro si existe
    return `
      <div class="my-book-card">
        <div class="my-book-cover" style="background:${color}">
          ${photo
            ? `<img src="${escapeAttr(photo)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />`
            : `<div class="my-book-cover-text">
                <div class="my-book-cover-text-title">${escapeHtml(b.title)}</div>
                <div class="my-book-cover-text-author">${escapeHtml(b.author)}</div>
               </div>`
          }
        </div>
        <div class="my-book-info">
          <div class="my-book-title" title="${escapeAttr(b.title)}">${escapeHtml(b.title)}</div>
          <div class="my-book-author">${escapeHtml(b.author)}</div>
          <div class="my-book-actions">
            <button class="my-book-btn" onclick="openEditBookModal('${b._id}')">Editar</button>
            <button class="my-book-btn my-book-btn-del" onclick="deleteBook('${b._id}')">Eliminar</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ── Comprimir imagen con Canvas ─────────────────── */
async function compressImage(file, maxW = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const ratio  = Math.min(maxW / img.width, maxW / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function openAddBookModal(book = null) {
  const editing     = !!book;
  let selectedColor = book?.coverColor || COVER_COLORS[0];
  let uploadedPhotos = book?.photos ? [...book.photos] : [null, null, null];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-title">${editing ? 'Editar libro' : 'Agregar libro'}</div>

      <div class="form-group">
        <label class="form-label">Título *</label>
        <input class="form-input" id="m-title" type="text" placeholder="Ej: Cien años de soledad" value="${escapeAttr(book?.title||'')}" />
      </div>
      <div class="form-group">
        <label class="form-label">Autor *</label>
        <input class="form-input" id="m-author" type="text" placeholder="Ej: Gabriel García Márquez" value="${escapeAttr(book?.author||'')}" />
      </div>
      <div class="form-group">
        <label class="form-label">Género *</label>
        <select class="form-select" id="m-genre">
          ${GENRES_BOOK.map(g => `<option value="${g}" ${book?.genre===g?'selected':''}>${g}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-select" id="m-cond">
          <option value="Nuevo"   ${book?.condition==='Nuevo'?'selected':''}>Nuevo</option>
          <option value="Bueno"   ${!book||book?.condition==='Bueno'?'selected':''}>Bueno</option>
          <option value="Regular" ${book?.condition==='Regular'?'selected':''}>Regular</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Descripción (opcional)</label>
        <textarea class="form-textarea" id="m-desc" rows="3" placeholder="Cuéntale algo a quien lo podría querer...">${escapeHtml(book?.description||'')}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Fotos del libro <span style="color:var(--nope)">*</span> <span style="color:var(--text-3);font-weight:400;text-transform:none;font-size:10px">(3 obligatorias)</span></label>
        <div id="photo-slots" style="display:flex;gap:10px;margin-top:8px">
          ${[0,1,2].map(i => `
            <div class="photo-slot" data-slot="${i}"
              style="flex:1;aspect-ratio:1;border-radius:10px;border:2px dashed var(--border-2);
                     display:flex;align-items:center;justify-content:center;cursor:pointer;
                     overflow:hidden;position:relative;background:var(--surface);transition:border-color .2s">
              <div class="photo-placeholder" style="text-align:center;pointer-events:none;padding:8px">
                <div style="font-size:22px;opacity:.4">📷</div>
                <div style="font-size:10px;color:var(--text-3);margin-top:2px">Foto ${i+1}</div>
              </div>
              <img src="" alt="" style="display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />
              <button class="photo-remove" data-slot="${i}"
                style="display:none;position:absolute;top:4px;right:4px;width:20px;height:20px;
                       border-radius:50%;background:rgba(0,0,0,.7);color:white;font-size:12px;
                       line-height:20px;text-align:center;z-index:2;border:none;cursor:pointer;padding:0">✕</button>
            </div>`).join('')}
        </div>
        <input type="file" id="photo-input" accept="image/*" capture="environment" style="display:none" />
        <div style="font-size:11px;color:var(--text-3);margin-top:6px">Toca cada cuadro para tomar o elegir una foto. Se comprimen automáticamente.</div>
      </div>

      <div class="form-group">
        <label class="form-label">Color de portada</label>
        <div class="color-picker" id="color-picker">
          ${COVER_COLORS.map(c => `<div class="color-swatch ${c===selectedColor?'selected':''}" style="background:${c}" data-color="${c}"></div>`).join('')}
        </div>
      </div>

      <button class="btn-primary" id="m-save">${editing?'Guardar cambios':'Agregar libro'}</button>
      <div style="height:8px"></div>
      <button class="btn-secondary" id="m-cancel" style="width:100%">Cancelar</button>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  /* Rellenar fotos si editando */
  if (editing && book?.photos?.length === 3) {
    book.photos.forEach((src, i) => setSlotPhoto(i, src));
  }

  /* Color picker */
  overlay.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      overlay.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor = sw.dataset.color;
    });
  });

  const close = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 280); };
  $('m-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  /* ── Lógica de fotos ──────────────────────────── */
  let activeSlot   = 0;
  const photoInput = $('photo-input');

  function setSlotPhoto(idx, dataUrl) {
    uploadedPhotos[idx] = dataUrl;
    const slot    = overlay.querySelector(`.photo-slot[data-slot="${idx}"]`);
    if (!slot) return;
    const img     = slot.querySelector('img');
    const ph      = slot.querySelector('.photo-placeholder');
    const rmBtn   = slot.querySelector('.photo-remove');
    img.src       = dataUrl;
    img.style.display   = 'block';
    ph.style.display    = 'none';
    rmBtn.style.display = 'block';
    slot.style.borderStyle = 'solid';
    slot.style.borderColor = 'var(--gold)';
  }

  function clearSlotPhoto(idx) {
    uploadedPhotos[idx] = null;
    const slot  = overlay.querySelector(`.photo-slot[data-slot="${idx}"]`);
    if (!slot) return;
    const img   = slot.querySelector('img');
    const ph    = slot.querySelector('.photo-placeholder');
    const rmBtn = slot.querySelector('.photo-remove');
    img.style.display   = 'none';
    ph.style.display    = '';
    rmBtn.style.display = 'none';
    slot.style.borderStyle = 'dashed';
    slot.style.borderColor = 'var(--border-2)';
  }

  overlay.querySelectorAll('.photo-slot').forEach(slot => {
    slot.addEventListener('click', () => {
      activeSlot = parseInt(slot.dataset.slot);
      photoInput.value = '';
      photoInput.click();
    });
  });

  overlay.querySelectorAll('.photo-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      clearSlotPhoto(parseInt(btn.dataset.slot));
    });
  });

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast('Imagen demasiado grande (máx 10MB)', 'error');
    const saveBtn = $('m-save');
    saveBtn.textContent = 'Comprimiendo...';
    saveBtn.disabled    = true;
    try {
      const dataUrl = await compressImage(file);
      setSlotPhoto(activeSlot, dataUrl);
      /* Si quedan slots vacíos, avanzar al siguiente automáticamente */
      const next = uploadedPhotos.findIndex(p => !p);
      if (next !== -1) activeSlot = next;
    } catch {
      toast('Error al procesar la foto', 'error');
    } finally {
      saveBtn.textContent = editing ? 'Guardar cambios' : 'Agregar libro';
      saveBtn.disabled    = false;
    }
  });

  /* ── Guardar ──────────────────────────────────── */
  $('m-save').addEventListener('click', async () => {
    const payload = {
      title:       $('m-title').value.trim(),
      author:      $('m-author').value.trim(),
      genre:       $('m-genre').value,
      condition:   $('m-cond').value,
      description: $('m-desc').value.trim(),
      coverColor:  selectedColor,
      photos:      uploadedPhotos,
    };
    if (!payload.title || !payload.author) return toast('Título y autor son requeridos', 'error');
    if (payload.photos.some(p => !p)) return toast('Agrega las 3 fotos obligatorias 📷', 'error');

    const btn = $('m-save');
    btn.disabled = true; btn.textContent = 'Guardando...';
    try {
      if (editing) await api('PUT',  `/api/books/${book._id}`, payload);
      else         await api('POST', '/api/books', payload);
      toast(editing ? 'Libro actualizado ✓' : 'Libro agregado ✓', 'success');
      close();
      state.myBooks = await api('GET', '/api/books/mine');
      renderBooksGrid();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = editing ? 'Guardar cambios' : 'Agregar libro';
    }
  });
}


function openEditBookModal(id) {
  const book = state.myBooks.find(b => b._id === id);
  if (book) openAddBookModal(book);
}

async function deleteBook(id) {
  if (!confirm('¿Eliminar este libro?')) return;
  try {
    await api('DELETE', `/api/books/${id}`);
    toast('Libro eliminado', 'success');
    state.myBooks = await api('GET', '/api/books/mine');
    renderBooksGrid();
  } catch (err) { toast(err.message, 'error'); }
}

/* ════════════════════════════════════════════════
   MATCHES — Con nombre, libro y chat visible
   ════════════════════════════════════════════════ */
async function renderMatches() {
  const viewEl = document.createElement('div');
  viewEl.className = 'view';
  viewEl.innerHTML = `
    <div class="topbar">
      <div class="topbar-title">Matches</div>
    </div>
    <div id="matches-list" class="matches-list">
      <div class="empty-state"><div class="spinner"></div></div>
    </div>`;

  const nav = document.querySelector('.bottom-nav');
  app().insertBefore(viewEl, nav);

  /* Banner para activar notificaciones */
  if ('Notification' in window && Notification.permission === 'default') {
    const bar = document.createElement('div');
    bar.className = 'notif-permission-bar';
    bar.style.margin = '0 16px 12px';
    bar.innerHTML = `
      <span style="font-size:20px">🔔</span>
      <div class="notif-permission-text">Activa notificaciones para saber cuando tienes nuevos mensajes</div>
      <button class="notif-permission-btn" id="notif-btn">Activar</button>`;
    viewEl.querySelector('#matches-list').before(bar);
    $('notif-btn').addEventListener('click', async () => {
      const ok = await requestNotifPermission();
      if (ok) { toast('Notificaciones activadas 🔔', 'success'); bar.remove(); }
      else    { toast('Permiso denegado', 'error'); }
    });
  }

  try {
    state.matches    = await api('GET', '/api/swipes/matches') || [];
    state.matchCount = state.matches.length;
    renderNav();
    renderMatchesList();
  } catch (err) { toast(err.message, 'error'); }
}

function renderMatchesList() {
  const list = $('matches-list');
  if (!list) return;

  if (!state.matches.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💔</div>
        <div class="empty-title">Sin matches aún</div>
        <div class="empty-sub">Cuando alguien también quiera uno de tus libros, aparecerá aquí.</div>
      </div>`;
    return;
  }

  const myId = state.user?._id || state.user?.id || '';

  list.innerHTML = state.matches.map(m => {
    const rId    = roomId(myId, m.matchedUser.id);
    const unread = state.unreadChats[rId] || 0;
    return `
      <div class="match-card">
        <div class="match-header">
          <div class="match-avatar">${initials(m.matchedUser.username)}</div>
          <div class="match-user-info">
            <div class="match-username">@${escapeHtml(m.matchedUser.username)}</div>
            ${m.matchedUser.location ? `<div class="match-location">📍 ${escapeHtml(m.matchedUser.location)}</div>` : ''}
          </div>
          ${unread > 0 ? `<div class="match-new-badge">${unread} nuevo${unread>1?'s':''}</div>` : ''}
        </div>

        <!-- Libros del intercambio bien visibles -->
        <div class="match-exchange">
          <div class="match-book-side">
            <div class="match-book-icon">📗</div>
            <div class="match-book-label">Te interesa de él/ella</div>
            <div class="match-book-title">${escapeHtml(m.theirBook.title)}</div>
            <div class="match-book-author">${escapeHtml(m.theirBook.author)}</div>
          </div>
          <div class="match-book-side">
            <div class="match-book-icon">📘</div>
            <div class="match-book-label">Le interesa tuyo</div>
            <div class="match-book-title">${escapeHtml(m.myBook.title)}</div>
            <div class="match-book-author">${escapeHtml(m.myBook.author)}</div>
          </div>
        </div>

        <!-- Acciones -->
        <div class="match-actions">
          <button class="match-btn-chat" data-match-id="${escapeAttr(JSON.stringify(m))}">
            💬 Chat
            ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
          </button>
          <a href="mailto:${escapeAttr(m.matchedUser.email)}" class="match-btn-email">
            ✉ Email
          </a>
        </div>
      </div>`;
  }).join('');

  /* Abrir chat al hacer click */
  list.querySelectorAll('.match-btn-chat').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = JSON.parse(btn.dataset.matchId);
      openChat(m);
    });
  });
}

function updateMatchUnreadBadges() {
  if (state.view !== 'matches') return;
  const list = $('matches-list');
  if (!list) return;
  renderMatchesList();
}

/* ════════════════════════════════════════════════
   CHAT
   ════════════════════════════════════════════════ */
async function openChat(match) {
  const myId = state.user?._id || state.user?.id;
  const rId  = roomId(myId, match.matchedUser.id);
  state.activeChatRoom = rId;

  /* Limpiar unreads */
  delete state.unreadChats[rId];
  renderNav();
  updateMatchUnreadBadges();

  /* Crear panel */
  let overlay = document.querySelector('.chat-overlay');
  overlay?.remove();

  overlay = document.createElement('div');
  overlay.className = 'chat-overlay';
  overlay.innerHTML = `
    <div class="chat-panel" style="position:relative">
      <div class="chat-header">
        <div class="chat-header-handle"></div>
        <div class="chat-header-avatar">${initials(match.matchedUser.username)}</div>
        <div class="chat-header-info">
          <div class="chat-header-name">@${escapeHtml(match.matchedUser.username)}</div>
          <div class="chat-header-status" id="chat-status">Conectado</div>
        </div>
        <button class="chat-close" id="chat-close">✕</button>
      </div>
      <div class="chat-messages" id="chat-messages">
        <div class="empty-state" style="height:auto;padding:24px 0"><div class="spinner"></div></div>
      </div>
      <div class="chat-typing"><div class="chat-typing-dots"><span></span><span></span><span></span></div></div>
      <div class="chat-input-bar">
        <textarea class="chat-input" id="chat-input" placeholder="Escribe un mensaje..." rows="1"></textarea>
        <button class="chat-send" id="chat-send">➤</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  /* Cerrar */
  const close = () => {
    overlay.classList.remove('open');
    state.activeChatRoom = null;
    state.socket?.emit('leave-chat', rId);
    setTimeout(() => overlay.remove(), 280);
  };
  $('chat-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  /* Unirse al room de Socket.io */
  if (state.socket) {
    state.socket.emit('join-chat', rId);
  }

  /* Cargar historial */
  try {
    const msgs = await api('GET', `/api/chat/${rId}`);
    renderChatHistory(msgs, myId);
  } catch {
    $('chat-messages').innerHTML = `<div class="chat-empty"><div class="chat-empty-icon">💬</div><div class="chat-empty-text">Sé el primero en escribir</div></div>`;
  }

  /* Input auto-resize */
  const input = $('chat-input');
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });

  /* Typing indicator */
  let typingTimer;
  input.addEventListener('input', () => {
    state.socket?.emit('typing', { roomId: rId, username: state.user.username });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      state.socket?.emit('stop-typing', { roomId: rId });
    }, 1200);
  });

  /* Enviar mensaje */
  const sendMsg = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    state.socket?.emit('send-message', { roomId: rId, text });
    state.socket?.emit('stop-typing', { roomId: rId });
  };

  $('chat-send').addEventListener('click', sendMsg);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  });
}

function renderChatHistory(msgs, myId) {
  const container = $('chat-messages');
  if (!container) return;

  if (!msgs || !msgs.length) {
    container.innerHTML = `<div class="chat-empty"><div class="chat-empty-icon">💬</div><div class="chat-empty-text">¡Di hola! Empieza la conversación.</div></div>`;
    return;
  }

  container.innerHTML = '';
  msgs.forEach(msg => appendChatMessage(msg, myId));
}

function appendChatMessage(msg, myId) {
  const container = $('chat-messages');
  if (!container) return;

  const senderId = msg.sender?._id || msg.sender;
  const isMine   = senderId?.toString() === myId?.toString();

  /* Remover empty state si existe */
  container.querySelector('.chat-empty')?.remove();

  const el = document.createElement('div');
  el.className = `chat-msg ${isMine ? 'mine' : 'theirs'}`;
  el.innerHTML = `
    ${!isMine ? `<div style="font-size:11px;color:var(--text-3);margin-bottom:3px">@${escapeHtml(msg.sender?.username||'')}</div>` : ''}
    <div>${escapeHtml(msg.text)}</div>
    <div class="chat-msg-time">${formatTime(msg.createdAt)}</div>`;

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

/* ════════════════════════════════════════════════
   PERFIL
   ════════════════════════════════════════════════ */
async function renderProfile() {
  const viewEl = document.createElement('div');
  viewEl.className = 'view';
  viewEl.innerHTML = `
    <div class="topbar">
      <div class="topbar-title">Mi Perfil</div>
    </div>
    <div class="profile-wrap">
      <div class="empty-state"><div class="spinner"></div></div>
    </div>`;

  const nav = document.querySelector('.bottom-nav');
  app().insertBefore(viewEl, nav);

  try {
    const user = await api('GET', '/api/users/me');
    if (!user) return;
    state.user = { ...state.user, ...user };
    renderProfileContent(user);
  } catch (err) { toast(err.message, 'error'); }
}

function renderProfileContent(user) {
  const wrap = document.querySelector('.profile-wrap');
  if (!wrap) return;

  let selectedGenres = [...(user.favoriteGenres || [])];

  wrap.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${initials(user.username)}</div>
      <div>
        <div class="profile-username">@${escapeHtml(user.username)}</div>
        <div class="profile-email">${escapeHtml(user.email)}</div>
        <div class="profile-stats">
          <div class="profile-stat"><div class="profile-stat-n">${user.totalBooks||0}</div><div class="profile-stat-l">Libros</div></div>
          <div class="profile-stat"><div class="profile-stat-n">${state.matches.length}</div><div class="profile-stat-l">Matches</div></div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Sobre mí</div>
      <div class="form-group">
        <label class="form-label">Bio</label>
        <textarea class="form-textarea" id="p-bio" rows="3" placeholder="Cuéntale a otros qué tipo de lector eres...">${escapeHtml(user.bio||'')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Ciudad</label>
        <input class="form-input" id="p-loc" type="text" placeholder="Ej: Concepción, Chile" value="${escapeAttr(user.location||'')}" />
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Géneros favoritos</div>
      <div class="genres-grid">
        ${GENRES_BOOK.map(g => `
          <button class="genre-chip ${selectedGenres.includes(g)?'selected':''}" data-genre="${g}">${g}</button>
        `).join('')}
      </div>
    </div>

    <button class="btn-primary" id="p-save">Guardar cambios</button>
    <button class="logout-btn" id="p-logout">Cerrar sesión</button>`;

  wrap.querySelectorAll('.genre-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const g = chip.dataset.genre;
      if (selectedGenres.includes(g)) { selectedGenres = selectedGenres.filter(x => x !== g); chip.classList.remove('selected'); }
      else { selectedGenres.push(g); chip.classList.add('selected'); }
    });
  });

  $('p-save').addEventListener('click', async () => {
    const btn = $('p-save');
    btn.disabled = true; btn.textContent = 'Guardando...';
    try {
      await api('PUT', '/api/users/me', {
        bio:            $('p-bio').value.trim(),
        location:       $('p-loc').value.trim(),
        favoriteGenres: selectedGenres,
      });
      toast('Perfil actualizado ✓', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Guardar cambios'; }
  });

  $('p-logout').addEventListener('click', () => { if (confirm('¿Cerrar sesión?')) logout(); });
}

/* ════════════════════════════════════════════════
   MATCH MODAL
   ════════════════════════════════════════════════ */
function showMatchModal(match) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal match-modal">
      <div class="match-modal-emoji">🎉</div>
      <div class="match-modal-title">¡Es un Match!</div>
      <div class="match-modal-sub">
        Tú y <strong>@${escapeHtml(match.matchedUser.username)}</strong> quieren intercambiar libros.
      </div>
      <div class="match-modal-books">
        <div class="match-modal-book">
          <div class="match-modal-book-label">Tu libro</div>
          <div class="match-modal-book-title">${escapeHtml(match.myBook.title)}</div>
          <div class="match-modal-book-author">${escapeHtml(match.myBook.author)}</div>
        </div>
        <span style="font-size:22px;color:var(--gold);padding:0 4px">⇄</span>
        <div class="match-modal-book" style="text-align:right">
          <div class="match-modal-book-label">Su libro</div>
          <div class="match-modal-book-title">${escapeHtml(match.theirBook.title)}</div>
          <div class="match-modal-book-author">${escapeHtml(match.theirBook.author)}</div>
        </div>
      </div>
      <button class="btn-primary" id="mm-chat" style="margin-bottom:10px">💬 Abrir Chat</button>
      <button class="btn-secondary" id="mm-close" style="width:100%">Seguir explorando</button>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const close = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 280); };
  $('mm-close').addEventListener('click', close);
  $('mm-chat').addEventListener('click',  () => { close(); navigate('matches').then(() => openChat(match)); });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  renderNav();
}

/* ════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════ */
/* initApp: carga inicial desde localStorage (necesita verificar token) */
async function initApp() {
  try {
    const me = await api('GET', '/api/users/me');
    if (!me) { renderAuth(); return; }
    state.user = me;
  } catch (err) {
    // Token inválido o servidor caído → volver al login
    localStorage.removeItem('bs_token');
    state.token = null;
    renderAuth();
    return;
  }
  await startApp();
}

/* startApp: arrancar la app cuando ya tenemos state.user y state.token */
async function startApp() {
  app().innerHTML = '';

  try {
    state.matches    = await api('GET', '/api/swipes/matches') || [];
    state.matchCount = state.matches.length;
  } catch { /* silencioso */ }

  /* Socket.io opcional — si no está disponible la app sigue funcionando */
  try { initSocket(); } catch { /* sin chat en tiempo real */ }

  renderNav();
  await navigate('discover');
}

/* ── Arrancar ───────────────────────────────────── */
if (state.token) {
  initApp();
} else {
  renderAuth();
}
