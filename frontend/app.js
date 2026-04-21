/* ══════════════════════════════════════════════════
   BookSwipe — app.js
   SPA completo: auth, discover, libros, matches, perfil
   ══════════════════════════════════════════════════ */

// ── Configuración ────────────────────────────────
// Al servir frontend y backend juntos, la API siempre está en el mismo origen
const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:4000'
  : '';

// ── Estado global ────────────────────────────────
const state = {
  token:         localStorage.getItem('bs_token'),
  user:          null,
  view:          'discover',
  discoverQueue: [],
  myBooks:       [],
  matches:       [],
  matchCount:    0,
  loading:       false,
};

// ── Géneros disponibles ──────────────────────────
const GENRES = [
  'Ficción','No ficción','Ciencia ficción','Fantasía',
  'Terror','Romance','Thriller','Historia','Biografía',
  'Ciencia','Filosofía','Poesía','Infantil','Cómic','Otro'
];

// Colores para portadas generadas
const COVER_COLORS = [
  '#4A1E2A','#1E3A5F','#1E4A2E','#3D1E5F',
  '#5C2E18','#1E4A4A','#5C3818','#2A1E4A',
];

// ── Helpers ──────────────────────────────────────
const $ = id => document.getElementById(id);
const app = () => document.getElementById('app');

function bookColor(str) {
  let h = 0;
  for (const c of (str || '')) h = (h * 31 + c.charCodeAt(0)) & 0xfffffff;
  return COVER_COLORS[h % COVER_COLORS.length];
}

function initials(name) {
  return (name || '??').slice(0, 2).toUpperCase();
}

function timeAgo(date) {
  const d = Math.floor((Date.now() - new Date(date)) / 1000);
  if (d < 60)    return 'ahora';
  if (d < 3600)  return `hace ${Math.floor(d/60)} min`;
  if (d < 86400) return `hace ${Math.floor(d/3600)} h`;
  return `hace ${Math.floor(d/86400)} días`;
}

// ── API helper ───────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (state.token) opts.headers['Authorization'] = `Bearer ${state.token}`;
  if (body)        opts.body = JSON.stringify(body);

  const res = await fetch(`${API_URL}${path}`, opts);
  const data = await res.json().catch(() => ({ error: 'Error de conexión' }));

  if (res.status === 401) {
    logout();
    return null;
  }
  if (!res.ok) throw new Error(data.error || 'Error desconocido');
  return data;
}

// ── Toast ─────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ── Open Library cover ───────────────────────────
async function fetchOLCover(title, author) {
  try {
    const q = encodeURIComponent(`${title} ${author}`);
    const r = await fetch(`https://openlibrary.org/search.json?q=${q}&limit=1&fields=cover_i`, { signal: AbortSignal.timeout(4000) });
    const d = await r.json();
    const id = d.docs?.[0]?.cover_i;
    return id ? `https://covers.openlibrary.org/b/id/${id}-M.jpg` : null;
  } catch { return null; }
}

function applyBookCover(imgEl, placeholderEl, title, author) {
  fetchOLCover(title, author).then(url => {
    if (!url || !imgEl.isConnected) return;
    imgEl.src = url;
    imgEl.style.display = 'block';
    placeholderEl.style.display = 'none';
    imgEl.onerror = () => {
      imgEl.style.display = 'none';
      placeholderEl.style.display = 'flex';
    };
  });
}

// ════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════
function renderAuth(tab = 'login') {
  app().innerHTML = `
    <div class="auth-screen">
      <div class="auth-logo">
        <div class="auth-logo-icon">📚</div>
        <div class="auth-logo-title">Book<span>Swipe</span></div>
        <div class="auth-logo-sub">Desliza. Conecta. Intercambia.</div>
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

  if (tab === 'login')    renderLoginForm();
  else                    renderRegisterForm();
}

function renderLoginForm() {
  $('auth-form').innerHTML = `
    <div class="form-group">
      <div class="form-label">Correo o usuario</div>
      <input class="form-input" id="f-ident" type="text" placeholder="tucorreo@email.com" autocomplete="username" />
    </div>
    <div class="form-group">
      <div class="form-label">Contraseña</div>
      <input class="form-input" id="f-pass" type="password" placeholder="••••••••" autocomplete="current-password" />
    </div>
    <button class="btn-primary" id="btn-login">Ingresar</button>`;

  $('btn-login').addEventListener('click', doLogin);
  [$('f-ident'), $('f-pass')].forEach(el => el.addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); }));
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
    if (!data) return;
    state.token = data.token;
    state.user  = data.user;
    localStorage.setItem('bs_token', data.token);
    await initApp();
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
}

function renderRegisterForm() {
  $('auth-form').innerHTML = `
    <div class="form-group">
      <div class="form-label">Nombre de usuario</div>
      <input class="form-input" id="f-user" type="text" placeholder="mi_usuario" autocomplete="username" />
    </div>
    <div class="form-group">
      <div class="form-label">Correo electrónico</div>
      <input class="form-input" id="f-email" type="email" placeholder="tucorreo@email.com" autocomplete="email" />
    </div>
    <div class="form-group">
      <div class="form-label">Contraseña (mín. 6 caracteres)</div>
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
    if (!data) return;
    state.token = data.token;
    state.user  = data.user;
    localStorage.setItem('bs_token', data.token);
    toast('¡Bienvenido a BookSwipe! 📚', 'success');
    await initApp();
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Crear cuenta';
  }
}

function logout() {
  state.token = null;
  state.user  = null;
  localStorage.removeItem('bs_token');
  renderAuth('login');
}

// ════════════════════════════════════════════════
// NAVEGACIÓN
// ════════════════════════════════════════════════
function renderNav() {
  const navIcons = {
    discover: `<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>`,
    books:    `<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/>`,
    matches:  `<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>`,
    profile:  `<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  };
  const labels = { discover:'Descubrir', books:'Mis Libros', matches:'Matches', profile:'Perfil' };

  // Si el nav ya existe, solo actualiza activos
  const existing = document.querySelector('.bottom-nav');
  if (existing) {
    existing.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === state.view);
    });
    // Actualizar dot de matches
    const matchDot = existing.querySelector('.nav-dot');
    if (matchDot) matchDot.style.display = state.matchCount > 0 ? 'block' : 'none';
    return;
  }

  const nav = document.createElement('div');
  nav.className = 'bottom-nav';
  nav.innerHTML = Object.entries(navIcons).map(([v, icon]) => `
    <button class="nav-item ${v===state.view?'active':''}" data-view="${v}">
      ${icon}</svg>
      ${v==='matches' && state.matchCount > 0 ? '<span class="nav-dot"></span>' : ''}
      <span class="nav-item-label">${labels[v]}</span>
    </button>`).join('');

  nav.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });

  app().appendChild(nav);
}

async function navigate(view) {
  if (state.view === view && !state.loading) return;
  state.view = view;
  renderNav();

  const viewEl = document.querySelector('.view');
  if (viewEl) viewEl.remove();

  switch (view) {
    case 'discover': await renderDiscover(); break;
    case 'books':    await renderMyBooks(); break;
    case 'matches':  await renderMatches(); break;
    case 'profile':  await renderProfile(); break;
  }
}

// ════════════════════════════════════════════════
// DISCOVER — Card Swipe
// ════════════════════════════════════════════════
async function renderDiscover() {
  const viewEl = document.createElement('div');
  viewEl.className = 'view';

  viewEl.innerHTML = `
    <div class="topbar">
      <div class="topbar-title">Book<span>Swipe</span></div>
      <div id="discover-counter" class="topbar-badge" style="display:none"></div>
    </div>
    <div class="discover-wrap">
      <div id="card-stack-wrap" class="card-stack"></div>
      <div class="action-buttons">
        <button class="action-btn action-btn-nope" id="btn-nope" title="Pasar">✕</button>
        <button class="action-btn action-btn-like" id="btn-like" title="Me interesa">♥</button>
      </div>
    </div>`;

  // Insertar ANTES del nav
  const nav = document.querySelector('.bottom-nav');
  app().insertBefore(viewEl, nav);

  // Cargar libros
  viewEl.querySelector('#card-stack-wrap').innerHTML = `<div class="empty-state"><div class="spinner"></div></div>`;

  try {
    state.discoverQueue = await api('GET', '/api/books/discover');
    buildCardStack();
  } catch (err) {
    toast(err.message, 'error');
  }

  // Botones
  $('btn-nope').addEventListener('click', () => triggerSwipe('left'));
  $('btn-like').addEventListener('click', () => triggerSwipe('right'));
}

function buildCardStack() {
  const wrap    = $('card-stack-wrap');
  const counter = $('discover-counter');
  if (!wrap) return;

  const total = state.discoverQueue.length;

  if (total === 0) {
    counter && (counter.style.display = 'none');
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔭</div>
        <div class="empty-title">¡Todo explorado!</div>
        <div class="empty-sub">Has visto todos los libros disponibles.<br>Vuelve pronto para nuevos títulos.</div>
      </div>`;
    return;
  }

  if (counter) {
    counter.style.display = 'block';
    counter.textContent = `${total} libros`;
  }

  wrap.innerHTML = '';

  // Renderizar top 3
  const slice = state.discoverQueue.slice(0, 3).reverse(); // render back-to-front
  slice.forEach((book, i) => {
    const card = buildCard(book);
    wrap.appendChild(card);
  });

  // Attach drag solo al top card
  const topCard = wrap.lastElementChild;
  if (topCard) initDrag(topCard, state.discoverQueue[0]._id);
}

function buildCard(book) {
  const color   = bookColor(book._id);
  const ownerInfo = book.owner
    ? `📍 ${book.owner.location || 'Desconocido'} · @${book.owner.username}`
    : '';

  const card = document.createElement('div');
  card.className = 'book-card draggable';
  card.innerHTML = `
    <div class="stamp stamp-like">ME GUSTA</div>
    <div class="stamp stamp-nope">PASO</div>
    <div class="card-cover" style="background:${color}">
      <div class="card-cover-placeholder" style="background:${color}">
        <div class="card-cover-placeholder-deco"></div>
        <div class="card-cover-placeholder-title">${escapeHtml(book.title)}</div>
        <div class="card-cover-placeholder-author">${escapeHtml(book.author)}</div>
      </div>
      <img src="" alt="" style="display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />
    </div>
    <div class="card-info">
      <div class="card-title">${escapeHtml(book.title)}</div>
      <div class="card-author">${escapeHtml(book.author)}</div>
      <div class="card-meta">
        <span class="chip chip-genre">${escapeHtml(book.genre)}</span>
        <span class="chip chip-cond">${escapeHtml(book.condition)}</span>
      </div>
      ${book.description ? `<p style="font-size:13px;color:var(--text-2);line-height:1.5;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(book.description)}</p>` : ''}
      <div class="card-owner">${ownerInfo}</div>
    </div>`;

  // Async cover from Open Library
  const img         = card.querySelector('img');
  const placeholder = card.querySelector('.card-cover-placeholder');
  applyBookCover(img, placeholder, book.title, book.author);

  return card;
}

function initDrag(card, bookId) {
  let startX = 0, currentX = 0, isDragging = false;
  const threshold = 90;

  const like = card.querySelector('.stamp-like');
  const nope = card.querySelector('.stamp-nope');

  const getX = e => e.touches ? e.touches[0].clientX : e.clientX;

  const onStart = e => {
    isDragging = true;
    startX     = getX(e);
    card.style.transition = 'none';
  };

  const onMove = e => {
    if (!isDragging) return;
    currentX = getX(e) - startX;
    const rot = currentX * 0.07;
    const t   = Math.min(Math.abs(currentX) / threshold, 1);
    card.style.transform = `translateX(${currentX}px) rotate(${rot}deg)`;
    if (currentX > 0) { like.style.opacity = t; nope.style.opacity = 0; }
    else              { nope.style.opacity = t; like.style.opacity = 0; }
  };

  const onEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    card.style.transition = 'transform .35s cubic-bezier(.25,.46,.45,.94), opacity .35s';
    if (Math.abs(currentX) >= threshold) {
      const dir  = currentX > 0 ? 'right' : 'left';
      const exit = dir === 'right' ? window.innerWidth + 300 : -(window.innerWidth + 300);
      card.style.transform = `translateX(${exit}px) rotate(${currentX*.1}deg)`;
      card.style.opacity   = '0';
      performSwipe(bookId, dir, card);
    } else {
      card.style.transform = '';
      like.style.opacity = 0;
      nope.style.opacity = 0;
    }
    currentX = 0;
  };

  // Mouse
  card.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  // Touch
  card.addEventListener('touchstart', onStart, { passive: true });
  card.addEventListener('touchmove',  onMove,  { passive: true });
  card.addEventListener('touchend',   onEnd);
}

function triggerSwipe(direction) {
  const wrap    = $('card-stack-wrap');
  const topCard = wrap?.lastElementChild;
  if (!topCard || !topCard.classList.contains('draggable')) return;

  const book  = state.discoverQueue[0];
  if (!book) return;

  const like = topCard.querySelector('.stamp-like');
  const nope = topCard.querySelector('.stamp-nope');
  if (direction === 'right') like.style.opacity = 1;
  else                       nope.style.opacity = 1;

  topCard.style.transition = 'transform .4s cubic-bezier(.25,.46,.45,.94), opacity .4s';
  const exit = direction === 'right' ? window.innerWidth + 300 : -(window.innerWidth + 300);
  topCard.style.transform = `translateX(${exit}px) rotate(${direction==='right'?15:-15}deg)`;
  topCard.style.opacity   = '0';

  performSwipe(book._id, direction, topCard);
}

async function performSwipe(bookId, direction, cardEl) {
  // Remover del queue
  state.discoverQueue.shift();

  // Actualizar counter
  const counter = $('discover-counter');
  if (counter) {
    if (state.discoverQueue.length === 0) counter.style.display = 'none';
    else counter.textContent = `${state.discoverQueue.length} libros`;
  }

  // Reconstruir stack después de animación
  setTimeout(() => {
    cardEl.remove();
    buildCardStack();
  }, 380);

  // Enviar swipe al backend
  try {
    const res = await api('POST', '/api/swipes', { bookId, direction });
    if (!res) return;

    if (direction === 'right' && res.match) {
      state.matchCount++;
      showMatchModal(res.match);
    }
  } catch (err) {
    console.error('Swipe error:', err.message);
  }
}

// ════════════════════════════════════════════════
// MIS LIBROS
// ════════════════════════════════════════════════
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

  // FAB para agregar
  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.innerHTML = '+';
  fab.title = 'Agregar libro';
  fab.addEventListener('click', () => openAddBookModal());
  app().appendChild(fab);

  viewEl.addEventListener('remove', () => fab.remove());

  try {
    state.myBooks = await api('GET', '/api/books/mine');
    renderBooksGrid();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderBooksGrid() {
  const grid = $('books-grid');
  if (!grid) return;

  if (state.myBooks.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1" class="empty-state">
        <div class="empty-icon">📖</div>
        <div class="empty-title">Sin libros aún</div>
        <div class="empty-sub">Agrega los libros que quieres intercambiar<br>tocando el botón <strong>+</strong></div>
      </div>`;
    return;
  }

  grid.innerHTML = state.myBooks.map(b => {
    const color = bookColor(b._id);
    return `
      <div class="my-book-card">
        <div class="my-book-cover" style="background:${color}">
          <img src="" alt="" style="display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:cover" data-title="${escapeAttr(b.title)}" data-author="${escapeAttr(b.author)}" />
          <div class="my-book-cover-text">
            <div class="my-book-cover-text-title">${escapeHtml(b.title)}</div>
            <div class="my-book-cover-text-author">${escapeHtml(b.author)}</div>
          </div>
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

  // Cargar portadas async
  grid.querySelectorAll('img[data-title]').forEach(img => {
    const placeholder = img.closest('.my-book-cover').querySelector('.my-book-cover-text');
    applyBookCover(img, placeholder, img.dataset.title, img.dataset.author);
  });
}

function openAddBookModal(book = null) {
  const editing = !!book;
  let selectedColor = book?.coverColor || COVER_COLORS[0];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-title">${editing ? 'Editar libro' : 'Agregar libro'}</div>

      <div class="form-group">
        <div class="form-label">Título *</div>
        <input class="form-input" id="m-title" type="text" placeholder="Ej: Cien años de soledad" value="${escapeAttr(book?.title||'')}" />
      </div>
      <div class="form-group">
        <div class="form-label">Autor *</div>
        <input class="form-input" id="m-author" type="text" placeholder="Ej: Gabriel García Márquez" value="${escapeAttr(book?.author||'')}" />
      </div>
      <div class="form-group">
        <div class="form-label">Género *</div>
        <select class="form-select" id="m-genre">
          ${GENRES.map(g => `<option value="${g}" ${book?.genre===g?'selected':''}>${g}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <div class="form-label">Estado del libro</div>
        <select class="form-select" id="m-cond">
          <option value="Nuevo" ${book?.condition==='Nuevo'?'selected':''}>Nuevo</option>
          <option value="Bueno" ${!book||book?.condition==='Bueno'?'selected':''}>Bueno</option>
          <option value="Regular" ${book?.condition==='Regular'?'selected':''}>Regular</option>
        </select>
      </div>
      <div class="form-group">
        <div class="form-label">Descripción (opcional)</div>
        <textarea class="form-textarea" id="m-desc" rows="3" placeholder="Cuéntale algo a quién lo podría querer...">${escapeHtml(book?.description||'')}</textarea>
      </div>
      <div class="form-group">
        <div class="form-label">Color de portada</div>
        <div class="color-picker" id="color-picker">
          ${COVER_COLORS.map(c => `<div class="color-swatch ${c===selectedColor?'selected':''}" style="background:${c}" data-color="${c}"></div>`).join('')}
        </div>
      </div>

      <button class="btn-primary" id="m-save">${editing?'Guardar cambios':'Agregar libro'}</button>
      <div style="height:8px"></div>
      <button class="btn-secondary" id="m-cancel" style="width:100%;margin-top:0">Cancelar</button>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  // Color picker
  overlay.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      overlay.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor = sw.dataset.color;
    });
  });

  // Cerrar
  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 280);
  };
  $('m-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // Guardar
  $('m-save').addEventListener('click', async () => {
    const payload = {
      title:       $('m-title').value.trim(),
      author:      $('m-author').value.trim(),
      genre:       $('m-genre').value,
      condition:   $('m-cond').value,
      description: $('m-desc').value.trim(),
      coverColor:  selectedColor,
    };
    if (!payload.title || !payload.author) return toast('Título y autor son requeridos', 'error');

    const btn = $('m-save');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
      if (editing) {
        await api('PUT',  `/api/books/${book._id}`, payload);
        toast('Libro actualizado ✓', 'success');
      } else {
        await api('POST', '/api/books', payload);
        toast('Libro agregado ✓', 'success');
      }
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
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ════════════════════════════════════════════════
// MATCHES
// ════════════════════════════════════════════════
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

  try {
    state.matches = await api('GET', '/api/swipes/matches');
    state.matchCount = state.matches.length;
    renderNav(); // actualizar dot
    renderMatchesList();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderMatchesList() {
  const list = $('matches-list');
  if (!list) return;

  if (state.matches.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💔</div>
        <div class="empty-title">Sin matches aún</div>
        <div class="empty-sub">Cuando alguien también quiera<br>uno de tus libros, aparecerá aquí.</div>
      </div>`;
    return;
  }

  list.innerHTML = state.matches.map(m => `
    <div class="match-card">
      <div class="match-header">
        <div class="match-avatar">${initials(m.matchedUser.username)}</div>
        <div class="match-user-info">
          <div class="match-username">@${escapeHtml(m.matchedUser.username)}</div>
          ${m.matchedUser.location ? `<div class="match-location">📍 ${escapeHtml(m.matchedUser.location)}</div>` : ''}
        </div>
        <div class="match-badge">✓ Match</div>
      </div>

      <div class="match-exchange">
        <div class="match-book">
          <div class="match-book-label">Te interesa</div>
          <div class="match-book-title">${escapeHtml(m.theirBook.title)}</div>
          <div class="match-book-author">${escapeHtml(m.theirBook.author)}</div>
        </div>
        <div class="match-arrow">⇄</div>
        <div class="match-book" style="text-align:right">
          <div class="match-book-label">Le interesa tuyo</div>
          <div class="match-book-title">${escapeHtml(m.myBook.title)}</div>
          <div class="match-book-author">${escapeHtml(m.myBook.author)}</div>
        </div>
      </div>

      <a href="mailto:${escapeAttr(m.matchedUser.email)}" class="match-contact">
        <span>✉</span>
        <span>Contactar a @${escapeHtml(m.matchedUser.username)}</span>
      </a>
    </div>`).join('');
}

// ════════════════════════════════════════════════
// PERFIL
// ════════════════════════════════════════════════
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
  } catch (err) {
    toast(err.message, 'error');
  }
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
          <div class="profile-stat">
            <div class="profile-stat-n">${user.totalBooks || 0}</div>
            <div class="profile-stat-l">Libros</div>
          </div>
          <div class="profile-stat">
            <div class="profile-stat-n">${state.matches.length}</div>
            <div class="profile-stat-l">Matches</div>
          </div>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Sobre mí</div>
      <div class="form-group">
        <div class="form-label">Bio</div>
        <textarea class="form-textarea" id="p-bio" rows="3" placeholder="Cuéntale a otros qué tipo de lector eres...">${escapeHtml(user.bio || '')}</textarea>
      </div>
      <div class="form-group">
        <div class="form-label">Ciudad</div>
        <input class="form-input" id="p-loc" type="text" placeholder="Ej: Concepción, Chile" value="${escapeAttr(user.location || '')}" />
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">Géneros favoritos</div>
      <div class="genres-grid" id="genres-grid">
        ${GENRES.map(g => `
          <button class="genre-chip ${selectedGenres.includes(g)?'selected':''}" data-genre="${g}">${g}</button>
        `).join('')}
      </div>
    </div>

    <button class="btn-primary" id="p-save">Guardar cambios</button>
    <button class="logout-btn" id="p-logout">Cerrar sesión</button>`;

  // Genre chips
  wrap.querySelectorAll('.genre-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const g = chip.dataset.genre;
      if (selectedGenres.includes(g)) {
        selectedGenres = selectedGenres.filter(x => x !== g);
        chip.classList.remove('selected');
      } else {
        selectedGenres.push(g);
        chip.classList.add('selected');
      }
    });
  });

  $('p-save').addEventListener('click', async () => {
    const btn = $('p-save');
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    try {
      await api('PUT', '/api/users/me', {
        bio:            $('p-bio').value.trim(),
        location:       $('p-loc').value.trim(),
        favoriteGenres: selectedGenres,
      });
      toast('Perfil actualizado ✓', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar cambios';
    }
  });

  $('p-logout').addEventListener('click', () => {
    if (confirm('¿Cerrar sesión?')) logout();
  });
}

// ════════════════════════════════════════════════
// MATCH MODAL
// ════════════════════════════════════════════════
function showMatchModal(match) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal match-modal">
      <div class="match-modal-emoji">🎉</div>
      <div class="match-modal-title">¡Es un Match!</div>
      <div class="match-modal-sub">
        Tú y <strong>@${escapeHtml(match.matchedUser.username)}</strong> quieren<br>intercambiar libros entre sí.
      </div>

      <div class="match-modal-books">
        <div class="match-modal-book">
          <div class="match-modal-book-label">Tu libro</div>
          <div class="match-modal-book-title">${escapeHtml(match.myBook.title)}</div>
          <div class="match-modal-book-author">${escapeHtml(match.myBook.author)}</div>
        </div>
        <span style="font-size:24px;color:var(--gold)">⇄</span>
        <div class="match-modal-book" style="text-align:right">
          <div class="match-modal-book-label">Su libro</div>
          <div class="match-modal-book-title">${escapeHtml(match.theirBook.title)}</div>
          <div class="match-modal-book-author">${escapeHtml(match.theirBook.author)}</div>
        </div>
      </div>

      <a href="mailto:${escapeAttr(match.matchedUser.email)}" class="match-contact" style="margin-bottom:12px;display:flex">
        ✉ Escribirle a @${escapeHtml(match.matchedUser.username)}
      </a>
      <button class="btn-secondary" id="mm-close" style="width:100%">Seguir explorando</button>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 280);
  };
  $('mm-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  renderNav(); // actualizar dot de matches
}

// ════════════════════════════════════════════════
// SEGURIDAD
// ════════════════════════════════════════════════
function escapeHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeAttr(str) {
  return String(str || '').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════
async function initApp() {
  app().innerHTML = '';

  // Verificar token y cargar usuario
  try {
    const me = await api('GET', '/api/users/me');
    if (!me) { renderAuth(); return; }
    state.user = me;
  } catch {
    renderAuth(); return;
  }

  // Cargar matches para badge
  try {
    const matches = await api('GET', '/api/swipes/matches');
    state.matches    = matches || [];
    state.matchCount = state.matches.length;
  } catch { /* silencioso */ }

  renderNav();
  await navigate('discover');
}

// ── Arrancar ─────────────────────────────────────
if (state.token) {
  initApp();
} else {
  renderAuth();
}
