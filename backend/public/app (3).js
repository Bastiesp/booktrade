/* ══════════════════════════════════════════════════
   BookSwipe — app.js  (reescrito limpio)
   ══════════════════════════════════════════════════ */

const API = '';

let TOKEN    = localStorage.getItem('bs_token') || '';
let ME       = null;
let MATCHES  = [];
let MY_BOOKS = [];
let QUEUE    = [];
let UNREAD   = {};
let SOCKET   = null;
let ACTIVE_FILTER = 'Todos';
let CITY_FILTER   = '';

const GENRES = ['Ficción','No ficción','Ciencia ficción','Fantasía',
  'Terror','Romance','Thriller','Historia','Biografía',
  'Ciencia','Filosofía','Poesía','Infantil','Cómic','Otro'];

const COLORS = ['#4A1E2A','#1E3A5F','#1E4A2E','#3D1E5F',
  '#5C2E18','#1E4A4A','#5C3818','#2A1E4A'];

function $id(id)   { return document.getElementById(id); }
function esc(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function inia(s)   { return String(s||'??').slice(0,2).toUpperCase(); }
function hue(id)   { let h=0; for(const c of String(id||'')) h=(h*31+c.charCodeAt(0))&0xfffffff; return COLORS[h%COLORS.length]; }
function fmt(d)    { return new Date(d).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}); }
function rid(...a) { return a.map(String).sort().join('_'); }

async function api(method, path, body) {
  const h = {'Content-Type':'application/json'};
  if (TOKEN) h['Authorization'] = 'Bearer ' + TOKEN;
  const r = await fetch(API + path, { method, headers:h, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(d.error || 'Error ' + r.status);
  return d;
}

function toast(msg, type) {
  let box = $id('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:6px;pointer-events:none;max-width:340px;width:90%';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.style.cssText = 'padding:11px 16px;border-radius:10px;font-size:14px;font-weight:500;background:#2A1E19;border:1px solid #4A3428;color:#F0E4CD;box-shadow:0 8px 24px rgba(0,0,0,.5)';
  if (type==='error')   t.style.color='#E8806E';
  if (type==='success') t.style.color='#72C5A0';
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(()=>t.remove(), 3000);
}

/* ── Shell ──────────────────────────────────────── */
function buildShell() {
  $id('app').innerHTML = `
    <div id="view" style="flex:1;overflow-y:auto;overflow-x:hidden;min-height:0"></div>
    <div style="height:68px;background:#1A1210;border-top:1px solid #3A2820;display:flex;align-items:center;padding:0 8px;flex-shrink:0">
      <button class="nb" id="nb-discover" onclick="showDiscover()">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        <span>Descubrir</span>
      </button>
      <button class="nb" id="nb-books" onclick="showBooks()">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/></svg>
        <span>Mis Libros</span>
      </button>
      <button class="nb" id="nb-matches" onclick="showMatches()">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span id="nb-matches-label">Matches</span>
      </button>
      <button class="nb" id="nb-profile" onclick="showProfile()">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>Perfil</span>
      </button>
    </div>`;
}

function setView(html) {
  const v = $id('view');
  if (v) { v.innerHTML = html; v.scrollTop = 0; }
}

function setNav(active) {
  ['nb-discover','nb-books','nb-matches','nb-profile'].forEach(id => {
    const b = $id(id);
    if (b) b.style.color = id === active ? '#D4A843' : '#604840';
  });
}

function updateBadge() {
  const el = $id('nb-matches-label');
  if (!el) return;
  const n = Object.values(UNREAD).reduce((a,b)=>a+b,0);
  el.innerHTML = n > 0
    ? `Matches <span style="background:#D4A843;color:#0D0906;border-radius:10px;padding:1px 6px;font-size:10px;font-weight:700;margin-left:2px">${n}</span>`
    : 'Matches';
}

/* ── Auth ───────────────────────────────────────── */
function showAuth(tab) {
  tab = tab || 'login';
  $id('app').innerHTML = `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;position:relative;overflow:hidden;
      background:url('https://images.unsplash.com/photo-1481627834876-b7833e8f5570?q=85&w=1400&auto=format') center 30%/cover">
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(8,4,2,.85),rgba(13,9,6,.72),rgba(8,4,2,.9))"></div>
      <div style="position:relative;z-index:1;text-align:center;margin-bottom:32px">
        <div style="font-size:50px;filter:drop-shadow(0 0 18px rgba(212,168,67,.5))">📚</div>
        <div style="font-family:'Fraunces',serif;font-size:36px;font-weight:700;color:#F0E4CD;letter-spacing:-1px;margin-top:10px">Book<span style="color:#D4A843">Swipe</span></div>
        <div style="font-size:12px;color:#A08070;margin-top:6px;letter-spacing:.8px;text-transform:uppercase">Desliza · Conecta · Intercambia</div>
      </div>
      <div style="position:relative;z-index:1;width:100%;max-width:400px;background:rgba(26,18,16,.93);border:1px solid #3A2820;border-radius:22px;padding:28px 24px;backdrop-filter:blur(12px)">
        <div style="display:flex;background:#0D0906;border-radius:10px;padding:4px;margin-bottom:22px">
          <button onclick="showAuth('login')" style="flex:1;padding:9px;border-radius:8px;font-size:14px;font-weight:600;border:none;cursor:pointer;transition:all .2s;${tab==='login'?'background:#D4A843;color:#0D0906':'background:transparent;color:#A08070'}">Ingresar</button>
          <button onclick="showAuth('register')" style="flex:1;padding:9px;border-radius:8px;font-size:14px;font-weight:600;border:none;cursor:pointer;transition:all .2s;${tab==='register'?'background:#D4A843;color:#0D0906':'background:transparent;color:#A08070'}">Registrarse</button>
        </div>
        <div id="auth-body">${tab==='login' ? _loginForm() : _regForm()}</div>
      </div>
    </div>`;
}

function _inp(id, type, ph, ac, extra) {
  return `<input id="${id}" type="${type}" placeholder="${ph}" autocomplete="${ac}" ${extra||''}
    style="width:100%;background:#0D0906;border:1px solid #3A2820;border-radius:10px;padding:13px 16px;font-size:15px;color:#F0E4CD;outline:none;box-sizing:border-box;margin-bottom:14px"
    onfocus="this.style.borderColor='#D4A843'" onblur="this.style.borderColor='#3A2820'"/>`;
}

function _loginForm() {
  return `<div style="font-size:11px;font-weight:600;color:#A08070;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Correo o usuario</div>
    ${_inp('f-ident','text','tucorreo@email.com','username','onkeydown="if(event.key===\'Enter\')doLogin()"')}
    <div style="font-size:11px;font-weight:600;color:#A08070;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Contraseña</div>
    ${_inp('f-pass','password','••••••••','current-password','onkeydown="if(event.key===\'Enter\')doLogin()"')}
    <button id="btn-login" onclick="doLogin()" style="width:100%;padding:14px;background:#D4A843;color:#0D0906;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer">Ingresar</button>`;
}

function _regForm() {
  return `<div style="font-size:11px;font-weight:600;color:#A08070;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Nombre de usuario</div>
    ${_inp('f-user','text','mi_usuario','username','')}
    <div style="font-size:11px;font-weight:600;color:#A08070;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Correo electrónico</div>
    ${_inp('f-email','email','tucorreo@email.com','email','')}
    <div style="font-size:11px;font-weight:600;color:#A08070;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Contraseña (mín. 6 caracteres)</div>
    ${_inp('f-pass2','password','••••••••','new-password','')}
    <button id="btn-reg" onclick="doRegister()" style="width:100%;padding:14px;background:#D4A843;color:#0D0906;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer">Crear cuenta</button>`;
}

async function doLogin() {
  const id = $id('f-ident')?.value?.trim();
  const pw = $id('f-pass')?.value;
  if (!id||!pw) return toast('Completa todos los campos','error');
  const btn=$id('btn-login');
  if(btn){btn.disabled=true;btn.textContent='Ingresando...';}
  try {
    const d = await api('POST','/api/auth/login',{identifier:id,password:pw});
    TOKEN=d.token; ME=d.user;
    localStorage.setItem('bs_token',TOKEN);
    await launchApp();
  } catch(e) {
    toast(e.message,'error');
    if(btn){btn.disabled=false;btn.textContent='Ingresar';}
  }
}

async function doRegister() {
  const u=$id('f-user')?.value?.trim();
  const e=$id('f-email')?.value?.trim();
  const p=$id('f-pass2')?.value;
  if(!u||!e||!p) return toast('Completa todos los campos','error');
  const btn=$id('btn-reg');
  if(btn){btn.disabled=true;btn.textContent='Creando cuenta...';}
  try {
    const d = await api('POST','/api/auth/register',{username:u,email:e,password:p});
    TOKEN=d.token; ME=d.user;
    localStorage.setItem('bs_token',TOKEN);
    toast('¡Bienvenido a BookSwipe! 📚','success');
    await launchApp();
  } catch(e2) {
    toast(e2.message,'error');
    if(btn){btn.disabled=false;btn.textContent='Crear cuenta';}
  }
}

function doLogout() {
  if(!confirm('¿Cerrar sesión?')) return;
  TOKEN=''; ME=null; MATCHES=[]; MY_BOOKS=[]; QUEUE=[];
  localStorage.removeItem('bs_token');
  SOCKET?.disconnect(); SOCKET=null;
  showAuth('login');
}

/* ── Launch ─────────────────────────────────────── */
async function launchApp() {
  try {
    if (!ME) ME = await api('GET','/api/users/me');
  } catch(e) {
    localStorage.removeItem('bs_token'); TOKEN='';
    showAuth('login'); return;
  }
  try { MATCHES = await api('GET','/api/swipes/matches')||[]; } catch{}
  try { initSocket(); } catch{}
  buildShell();
  updateBadge();
  showDiscover();
}

/* ── Discover ───────────────────────────────────── */
async function showDiscover() {
  setNav('nb-discover');
  setView(`
    <div style="padding:16px 20px 10px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div style="font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#F0E4CD">Book<span style="color:#D4A843">Swipe</span></div>
      <div id="q-count" style="display:none;background:#D4A843;color:#0D0906;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600"></div>
    </div>
    <div id="gbar" style="display:flex;gap:8px;padding:0 16px 10px;overflow-x:auto;flex-shrink:0;scrollbar-width:none">
      ${['Todos',...GENRES].map(g=>`<button onclick="setGenre('${esc(g)}')" id="gf-${esc(g)}"
        style="padding:6px 14px;border-radius:20px;font-size:12px;font-weight:500;white-space:nowrap;cursor:pointer;flex-shrink:0;border:1px solid;transition:all .15s;
          ${g===ACTIVE_FILTER?'background:rgba(212,168,67,.15);border-color:rgba(212,168,67,.4);color:#D4A843':'background:#1A1210;border-color:#3A2820;color:#A08070'}">${esc(g)}</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px;padding:0 16px 10px;flex-shrink:0">
      <input id="city-in" type="text" value="${esc(CITY_FILTER)}" placeholder="🏙 Filtrar por ciudad..."
        style="flex:1;background:#1A1210;border:1px solid #3A2820;border-radius:10px;padding:9px 14px;font-size:13px;color:#F0E4CD;outline:none"
        onfocus="this.style.borderColor='#D4A843'" onblur="this.style.borderColor='#3A2820'"
        onkeydown="if(event.key==='Enter'){CITY_FILTER=$id('city-in').value.trim();loadQ()}"/>
      <button onclick="CITY_FILTER=$id('city-in').value.trim();loadQ()"
        style="padding:9px 16px;background:#D4A843;color:#0D0906;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">Buscar</button>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;padding:0 16px 12px;min-height:0">
      <div id="carea" style="position:relative;width:100%;flex:1;min-height:320px;max-height:460px"></div>
      <div style="display:flex;justify-content:center;align-items:center;gap:24px;margin-top:16px;flex-shrink:0">
        <button onclick="swipeBtn('left')" style="width:60px;height:60px;border-radius:50%;background:#231815;border:2px solid #D45A4A;color:#D45A4A;font-size:24px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
        <button onclick="swipeBtn('right')" style="width:72px;height:72px;border-radius:50%;background:#D4A843;border:none;color:#0D0906;font-size:28px;cursor:pointer;display:flex;align-items:center;justify-content:center">♥</button>
      </div>
    </div>`);
  await loadQ();
}

function setGenre(g) {
  ACTIVE_FILTER=g;
  document.querySelectorAll('#gbar button').forEach(b=>{
    const on=b.id==='gf-'+g;
    b.style.background=on?'rgba(212,168,67,.15)':'#1A1210';
    b.style.borderColor=on?'rgba(212,168,67,.4)':'#3A2820';
    b.style.color=on?'#D4A843':'#A08070';
  });
  loadQ();
}

async function loadQ() {
  const a=$id('carea'); if(!a) return;
  a.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%"><div class="spin"></div></div>';
  try {
    let url='/api/books/discover';
    const p=[];
    if(ACTIVE_FILTER!=='Todos') p.push('genre='+encodeURIComponent(ACTIVE_FILTER));
    if(CITY_FILTER) p.push('city='+encodeURIComponent(CITY_FILTER));
    if(p.length) url+='?'+p.join('&');
    QUEUE=await api('GET',url);
    drawStack();
  } catch(e) { a.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#A08070;font-size:14px">${esc(e.message)}</div>`; }
}

function drawStack() {
  const a=$id('carea'), cnt=$id('q-count');
  if(!a) return;
  if(!QUEUE.length) {
    if(cnt) cnt.style.display='none';
    a.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;text-align:center;padding:20px"><div style="font-size:48px;opacity:.4">🔭</div><div style="font-family:Fraunces,serif;font-size:20px;color:#F0E4CD">¡Todo explorado!</div><div style="font-size:13px;color:#A08070">Vuelve pronto o cambia filtros</div></div>';
    return;
  }
  if(cnt){cnt.style.display='block';cnt.textContent=QUEUE.length+' libros';}
  a.innerHTML='';
  QUEUE.slice(0,3).reverse().forEach((book,ri)=>{
    const isTop=(ri===QUEUE.slice(0,3).length-1);
    const c=document.createElement('div');
    c.style.cssText='position:absolute;inset:0;background:#231815;border:1px solid #3A2820;border-radius:22px;overflow:hidden;user-select:none;will-change:transform;transform-origin:center bottom';
    if(!isTop) {
      const idx=QUEUE.slice(0,3).length-1-ri;
      c.style.transform=`scale(${1-idx*.04}) translateY(${idx*14}px)`;
    }
    const photo=book.photos?.[0];
    c.innerHTML=`
      <div id="sl" style="position:absolute;top:28px;left:18px;padding:7px 16px;border-radius:6px;font-size:18px;font-weight:800;letter-spacing:2px;color:#4CAF7D;border:3px solid #4CAF7D;transform:rotate(-12deg);opacity:0;z-index:10;pointer-events:none">ME GUSTA</div>
      <div id="sn" style="position:absolute;top:28px;right:18px;padding:7px 16px;border-radius:6px;font-size:18px;font-weight:800;letter-spacing:2px;color:#D45A4A;border:3px solid #D45A4A;transform:rotate(12deg);opacity:0;z-index:10;pointer-events:none">PASO</div>
      <div style="height:60%;background:${hue(book._id)};position:relative;overflow:hidden">
        ${photo?`<img src="${esc(photo)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
        :`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center"><div style="font-family:Fraunces,serif;font-size:20px;font-weight:600;color:rgba(255,255,255,.9)">${esc(book.title)}</div><div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:6px;font-style:italic">${esc(book.author)}</div></div>`}
      </div>
      <div style="padding:14px 18px">
        <div style="font-family:Fraunces,serif;font-size:19px;font-weight:600;color:#F0E4CD;margin-bottom:3px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(book.title)}</div>
        <div style="font-size:13px;color:#A08070;margin-bottom:8px">${esc(book.author)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
          <span style="padding:4px 10px;border-radius:20px;font-size:11px;background:rgba(212,168,67,.12);color:#D4A843;border:1px solid rgba(212,168,67,.2)">${esc(book.genre)}</span>
          <span style="padding:4px 10px;border-radius:20px;font-size:11px;background:rgba(240,228,205,.06);color:#A08070;border:1px solid #3A2820">${esc(book.condition)}</span>
        </div>
        ${book.owner?`<div style="font-size:11px;color:#604840">📍 ${esc(book.owner.location||'—')} · @${esc(book.owner.username)}</div>`:''}
      </div>`;
    if(isTop) attachDrag(c, book._id);
    a.appendChild(c);
  });
}

function attachDrag(card, bookId) {
  let sx=0,dx=0,on=false;
  const sl=card.querySelector('#sl'), sn=card.querySelector('#sn');
  const gx=e=>e.touches?e.touches[0].clientX:e.clientX;
  card.style.cursor='grab';
  const start=e=>{on=true;sx=gx(e);card.style.transition='none';};
  const move=e=>{
    if(!on) return;
    dx=gx(e)-sx;
    card.style.transform=`translateX(${dx}px) rotate(${dx*.07}deg)`;
    const t=Math.min(Math.abs(dx)/90,1);
    if(dx>0){sl.style.opacity=t;sn.style.opacity=0;}else{sn.style.opacity=t;sl.style.opacity=0;}
  };
  const end=()=>{
    if(!on) return; on=false;
    card.style.transition='transform .35s ease,opacity .35s';
    if(Math.abs(dx)>=90){
      const dir=dx>0?'right':'left';
      card.style.transform=`translateX(${dir==='right'?800:-800}px) rotate(${dx*.1}deg)`;
      card.style.opacity='0';
      doSwipe(bookId,dir);
    } else {card.style.transform='';sl.style.opacity=0;sn.style.opacity=0;}
    dx=0;
  };
  card.addEventListener('mousedown',start);
  card.addEventListener('touchstart',start,{passive:true});
  document.addEventListener('mousemove',move);
  document.addEventListener('mouseup',end);
  card.addEventListener('touchmove',move,{passive:true});
  card.addEventListener('touchend',end);
}

function swipeBtn(dir) {
  const a=$id('carea'); if(!a||!QUEUE.length) return;
  const top=a.lastElementChild; if(!top) return;
  const sl=top.querySelector('#sl'), sn=top.querySelector('#sn');
  if(dir==='right'&&sl) sl.style.opacity=1;
  if(dir==='left'&&sn)  sn.style.opacity=1;
  top.style.transition='transform .4s ease,opacity .4s';
  top.style.transform=`translateX(${dir==='right'?800:-800}px) rotate(${dir==='right'?15:-15}deg)`;
  top.style.opacity='0';
  doSwipe(QUEUE[0]._id,dir);
}

async function doSwipe(bookId,dir) {
  QUEUE.shift();
  const cnt=$id('q-count');
  if(cnt){if(!QUEUE.length)cnt.style.display='none';else cnt.textContent=QUEUE.length+' libros';}
  setTimeout(drawStack,380);
  try {
    const r=await api('POST','/api/swipes',{bookId,direction:dir});
    if(dir==='right'&&r.match) showMatchModal(r.match);
  } catch{}
}

/* ── Mis Libros ─────────────────────────────────── */
async function showBooks() {
  setNav('nb-books');
  document.querySelector('.fab')?.remove();
  setView(`
    <div style="padding:16px 20px 10px">
      <div style="font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#F0E4CD">Mis Libros</div>
    </div>
    <div id="bgrid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 16px 16px">
      <div style="grid-column:1/-1;display:flex;justify-content:center;padding:40px"><div class="spin"></div></div>
    </div>`);
  const fab=document.createElement('button');
  fab.className='fab';
  fab.textContent='+';
  fab.style.cssText='position:fixed;bottom:84px;right:max(16px,calc(50% - 240px + 16px));width:56px;height:56px;border-radius:50%;background:#D4A843;color:#0D0906;font-size:28px;border:none;cursor:pointer;box-shadow:0 4px 24px rgba(212,168,67,.4);z-index:50;transition:transform .2s;display:flex;align-items:center;justify-content:center';
  fab.onclick=()=>openBookModal(null);
  document.body.appendChild(fab);
  try { MY_BOOKS=await api('GET','/api/books/mine'); drawBooksGrid(); }
  catch(e) { toast(e.message,'error'); }
}

function drawBooksGrid() {
  const g=$id('bgrid'); if(!g) return;
  if(!MY_BOOKS.length) { g.innerHTML=`<div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;gap:10px;text-align:center"><div style="font-size:48px;opacity:.4">📖</div><div style="font-family:Fraunces,serif;font-size:20px;color:#F0E4CD">Sin libros aún</div><div style="font-size:13px;color:#A08070">Toca el + para agregar</div></div>`; return; }
  g.innerHTML=MY_BOOKS.map(b=>`
    <div style="background:#231815;border:1px solid #3A2820;border-radius:14px;overflow:hidden">
      <div style="height:130px;background:${hue(b._id)};position:relative;overflow:hidden">
        ${b.photos?.[0]?`<img src="${esc(b.photos[0])}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
        :`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;text-align:center"><div style="font-family:Fraunces,serif;font-size:13px;font-weight:600;color:rgba(255,255,255,.9)">${esc(b.title)}</div><div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:3px;font-style:italic">${esc(b.author)}</div></div>`}
      </div>
      <div style="padding:10px 12px">
        <div style="font-size:13px;font-weight:600;color:#F0E4CD;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.title)}</div>
        <div style="font-size:11px;color:#A08070;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.author)}</div>
        <div style="display:flex;gap:6px">
          <button onclick="openBookModal('${b._id}')" style="flex:1;padding:7px 4px;border-radius:8px;font-size:11px;font-weight:500;border:1px solid #3A2820;color:#A08070;background:#1A1210;cursor:pointer">Editar</button>
          <button onclick="deleteBook('${b._id}')" style="flex:1;padding:7px 4px;border-radius:8px;font-size:11px;font-weight:500;border:1px solid rgba(212,90,74,.2);color:rgba(212,90,74,.7);background:rgba(212,90,74,.06);cursor:pointer">Eliminar</button>
        </div>
      </div>
    </div>`).join('');
}

async function deleteBook(id) {
  if(!confirm('¿Eliminar?')) return;
  try { await api('DELETE','/api/books/'+id); toast('Eliminado','success'); MY_BOOKS=await api('GET','/api/books/mine'); drawBooksGrid(); }
  catch(e) { toast(e.message,'error'); }
}

function openBookModal(idOrNull) {
  const book = typeof idOrNull==='string' ? MY_BOOKS.find(b=>b._id===idOrNull) : null;
  const editing=!!book;
  const photos=book?.photos?[...book.photos]:[null,null,null];
  let selColor=book?.coverColor||COLORS[0];
  let slot=0;

  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);z-index:200;display:flex;align-items:flex-end;opacity:0;transition:opacity .25s;max-width:480px;left:50%;transform:translateX(-50%)';
  ov.innerHTML=`
    <div id="bm" style="width:100%;background:#231815;border-radius:22px 22px 0 0;border:1px solid #3A2820;padding:8px 24px 36px;max-height:92vh;overflow-y:auto;transform:translateY(30px);transition:transform .25s">
      <div style="width:40px;height:4px;background:#4A3428;border-radius:2px;margin:12px auto 20px"></div>
      <div style="font-family:Fraunces,serif;font-size:22px;font-weight:700;color:#F0E4CD;margin-bottom:20px">${editing?'Editar libro':'Agregar libro'}</div>
      <div id="bm-body">
        ${_bmField('Título *','bm-title','text',book?.title||'')}
        ${_bmField('Autor *','bm-author','text',book?.author||'')}
        <div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:#A08070;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Género *</div>
          <select id="bm-genre" style="width:100%;background:#1A1210;border:1px solid #3A2820;border-radius:10px;padding:13px 16px;font-size:15px;color:#F0E4CD;outline:none;appearance:none;box-sizing:border-box">
            ${GENRES.map(g=>`<option value="${g}" ${book?.genre===g?'selected':''}>${g}</option>`).join('')}
          </select></div>
        <div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:#A08070;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Estado</div>
          <select id="bm-cond" style="width:100%;background:#1A1210;border:1px solid #3A2820;border-radius:10px;padding:13px 16px;font-size:15px;color:#F0E4CD;outline:none;appearance:none;box-sizing:border-box">
            ${['Nuevo','Bueno','Regular'].map(c=>`<option value="${c}" ${(book?.condition||'Bueno')===c?'selected':''}>${c}</option>`).join('')}
          </select></div>
        <div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:#A08070;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Descripción</div>
          <textarea id="bm-desc" rows="3" style="width:100%;background:#1A1210;border:1px solid #3A2820;border-radius:10px;padding:13px 16px;font-size:15px;color:#F0E4CD;outline:none;resize:none;box-sizing:border-box;line-height:1.5;font-family:inherit" placeholder="Cuéntale algo...">${esc(book?.description||'')}</textarea></div>
        <div style="margin-bottom:14px">
          <div style="font-size:11px;font-weight:600;color:#A08070;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Fotos <span style="color:#D45A4A">*</span> <span style="font-size:10px;font-weight:400;text-transform:none">(3 obligatorias)</span></div>
          <div style="display:flex;gap:10px">
            ${[0,1,2].map(i=>`<div id="ps${i}" onclick="bmSlot(${i})" style="flex:1;aspect-ratio:1;border-radius:10px;border:2px dashed #4A3428;display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;position:relative;background:#1A1210;transition:border-color .2s">
              <div id="pp${i}"><div style="font-size:22px;opacity:.4;text-align:center">📷</div><div style="font-size:10px;color:#604840;margin-top:2px;text-align:center">Foto ${i+1}</div></div>
              <img id="pi${i}" src="" style="display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
              <button id="pr${i}" onclick="bmRm(event,${i})" style="display:none;position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.7);color:white;font-size:12px;border:none;cursor:pointer;padding:0;line-height:20px;text-align:center;z-index:2">✕</button>
            </div>`).join('')}
          </div>
          <input type="file" id="bm-file" accept="image/*" capture="environment" style="display:none">
          <div style="font-size:11px;color:#604840;margin-top:6px">Toca cada cuadro para elegir una foto</div>
        </div>
        <div style="margin-bottom:20px"><div style="font-size:11px;font-weight:600;color:#A08070;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Color de portada</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            ${COLORS.map(c=>`<div id="bcs${c.slice(1)}" onclick="bmColor('${c}')" style="width:30px;height:30px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c===selColor?'#F0E4CD':'transparent'};transition:transform .15s" onmouseenter="this.style.transform='scale(1.15)'" onmouseleave="this.style.transform=''"></div>`).join('')}
          </div></div>
        <button id="bm-save" onclick="bmSave()" style="width:100%;padding:14px;background:#D4A843;color:#0D0906;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:8px">${editing?'Guardar cambios':'Agregar libro'}</button>
        <button onclick="bmClose()" style="width:100%;padding:12px;background:#2A1E19;border:1px solid #3A2820;border-radius:10px;font-size:14px;color:#A08070;cursor:pointer">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=>{ov.style.opacity='1';$id('bm').style.transform='translateY(0)';});
  ov.addEventListener('click',e=>{if(e.target===ov)bmClose();});

  if(editing&&book.photos?.length===3) book.photos.forEach((s,i)=>{if(s)bmFill(i,s);});

  window._bm={photos,selColor,book,editing,slot,ov};

  window.bmSlot  = i=>{window._bm.slot=i;$id('bm-file').value='';$id('bm-file').click();};
  window.bmRm    = (e,i)=>{e.stopPropagation();window._bm.photos[i]=null;$id('pi'+i).style.display='none';$id('pp'+i).style.display='';$id('pr'+i).style.display='none';const sl=$id('ps'+i);sl.style.borderStyle='dashed';sl.style.borderColor='#4A3428';};
  window.bmColor = c=>{window._bm.selColor=c;COLORS.forEach(x=>{const el=$id('bcs'+x.slice(1));if(el)el.style.borderColor=x===c?'#F0E4CD':'transparent';});};
  window.bmClose = ()=>{ov.style.opacity='0';$id('bm').style.transform='translateY(30px)';setTimeout(()=>ov.remove(),280);};
  window.bmSave  = async()=>{
    const p={title:$id('bm-title')?.value?.trim(),author:$id('bm-author')?.value?.trim(),genre:$id('bm-genre')?.value,condition:$id('bm-cond')?.value,description:$id('bm-desc')?.value?.trim()||'',coverColor:window._bm.selColor,photos:window._bm.photos};
    if(!p.title||!p.author) return toast('Título y autor requeridos','error');
    if(p.photos.some(x=>!x)) return toast('Agrega las 3 fotos 📷','error');
    const btn=$id('bm-save');btn.disabled=true;btn.textContent='Guardando...';
    try {
      if(window._bm.editing) await api('PUT','/api/books/'+window._bm.book._id,p);
      else await api('POST','/api/books',p);
      toast(window._bm.editing?'Actualizado ✓':'Agregado ✓','success');
      window.bmClose();
      MY_BOOKS=await api('GET','/api/books/mine'); drawBooksGrid();
    } catch(e){toast(e.message,'error');btn.disabled=false;btn.textContent=window._bm.editing?'Guardar cambios':'Agregar libro';}
  };

  $id('bm-file').addEventListener('change',async()=>{
    const f=$id('bm-file').files[0]; if(!f) return;
    if(f.size>10*1024*1024) return toast('Imagen muy grande (máx 10MB)','error');
    const btn=$id('bm-save');btn.disabled=true;btn.textContent='Comprimiendo...';
    try {
      const url=await compressImg(f);
      bmFill(window._bm.slot,url);
      window._bm.photos[window._bm.slot]=url;
      const nx=window._bm.photos.findIndex(x=>!x);
      if(nx!==-1) window._bm.slot=nx;
    } catch{toast('Error al procesar foto','error');}
    finally{btn.disabled=false;btn.textContent=window._bm.editing?'Guardar cambios':'Agregar libro';}
  });
}

function bmFill(i,src) {
  const img=$id('pi'+i),ph=$id('pp'+i),rm=$id('pr'+i),sl=$id('ps'+i);
  if(!img) return;
  img.src=src;img.style.display='block';ph.style.display='none';rm.style.display='block';
  sl.style.borderStyle='solid';sl.style.borderColor='#D4A843';
}

function _bmField(label,id,type,val) {
  return `<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:#A08070;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${label}</div>
    <input id="${id}" type="${type}" value="${esc(val)}" style="width:100%;background:#1A1210;border:1px solid #3A2820;border-radius:10px;padding:13px 16px;font-size:15px;color:#F0E4CD;outline:none;box-sizing:border-box"
    onfocus="this.style.borderColor='#D4A843'" onblur="this.style.borderColor='#3A2820'"/></div>`;
}

async function compressImg(file) {
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=e=>{const img=new Image();img.onload=()=>{const ratio=Math.min(900/img.width,900/img.height,1);const c=document.createElement('canvas');c.width=Math.round(img.width*ratio);c.height=Math.round(img.height*ratio);c.getContext('2d').drawImage(img,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.78));};img.onerror=rej;img.src=e.target.result;};r.onerror=rej;r.readAsDataURL(file);
  });
}

/* ── Matches ────────────────────────────────────── */
async function showMatches() {
  setNav('nb-matches');
  UNREAD={}; updateBadge();
  setView(`
    <div style="padding:16px 20px 10px"><div style="font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#F0E4CD">Matches</div></div>
    <div id="mlist" style="padding:0 16px 16px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;justify-content:center;padding:40px"><div class="spin"></div></div>
    </div>`);
  try { MATCHES=await api('GET','/api/swipes/matches')||[]; drawMatches(); }
  catch(e) { toast(e.message,'error'); }
}

function drawMatches() {
  const ml=$id('mlist'); if(!ml) return;
  if(!MATCHES.length){ml.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;gap:10px;text-align:center"><div style="font-size:48px;opacity:.4">💔</div><div style="font-family:Fraunces,serif;font-size:20px;color:#F0E4CD">Sin matches aún</div><div style="font-size:13px;color:#A08070">Cuando alguien quiera tu libro aparecerá aquí</div></div>`;return;}
  ml.innerHTML=MATCHES.map((m,i)=>`
    <div style="background:#231815;border:1px solid #3A2820;border-radius:14px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:12px;padding:16px 16px 12px">
        <div style="width:48px;height:48px;border-radius:50%;background:#D4A843;color:#0D0906;font-family:Fraunces,serif;font-size:18px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${inia(m.matchedUser.username)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-family:Fraunces,serif;font-size:17px;font-weight:700;color:#F0E4CD">@${esc(m.matchedUser.username)}</div>
          ${m.matchedUser.location?`<div style="font-size:12px;color:#A08070;margin-top:1px">📍 ${esc(m.matchedUser.location)}</div>`:''}
        </div>
        <span style="background:#D4A843;color:#0D0906;border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700">✓ Match</span>
      </div>
      <div style="display:flex;margin:0 16px 12px;background:#1A1210;border-radius:10px;border:1px solid #3A2820;overflow:hidden">
        <div style="flex:1;padding:12px 14px;border-right:1px solid #3A2820">
          <div style="font-size:9px;font-weight:700;color:#604840;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Te interesa</div>
          <div style="font-family:Fraunces,serif;font-size:14px;font-weight:600;color:#F0E4CD;line-height:1.3">${esc(m.theirBook.title)}</div>
          <div style="font-size:11px;color:#A08070;margin-top:2px">${esc(m.theirBook.author)}</div>
        </div>
        <div style="flex:1;padding:12px 14px">
          <div style="font-size:9px;font-weight:700;color:#604840;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Le interesa tuyo</div>
          <div style="font-family:Fraunces,serif;font-size:14px;font-weight:600;color:#F0E4CD;line-height:1.3">${esc(m.myBook.title)}</div>
          <div style="font-size:11px;color:#A08070;margin-top:2px">${esc(m.myBook.author)}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;padding:0 16px 16px">
        <button onclick="openChat(${i})" style="flex:1;padding:11px;background:#D4A843;color:#0D0906;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">💬 Chat</button>
        <a href="mailto:${esc(m.matchedUser.email)}" style="padding:11px 16px;background:#1A1210;border:1px solid #3A2820;border-radius:10px;font-size:13px;color:#A08070;text-decoration:none;display:flex;align-items:center;gap:5px">✉ Email</a>
      </div>
    </div>`).join('');
}

/* ── Chat ───────────────────────────────────────── */
function openChat(idx) {
  const m=MATCHES[idx]; if(!m) return;
  const myId=(ME?._id||ME?.id||'').toString();
  const room=rid(myId,m.matchedUser.id);
  delete UNREAD[room]; updateBadge();

  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(4px);z-index:300;display:flex;align-items:flex-end;opacity:0;transition:opacity .25s;max-width:480px;left:50%;transform:translateX(-50%)';
  ov.innerHTML=`
    <div id="cp" style="width:100%;height:85vh;background:#0D0906;border-radius:22px 22px 0 0;border:1px solid #3A2820;display:flex;flex-direction:column;transform:translateY(40px);transition:transform .25s">
      <div style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #3A2820;flex-shrink:0;position:relative">
        <div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);width:36px;height:4px;background:#4A3428;border-radius:2px"></div>
        <div style="width:38px;height:38px;border-radius:50%;background:#D4A843;color:#0D0906;font-family:Fraunces,serif;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center">${inia(m.matchedUser.username)}</div>
        <div style="flex:1"><div style="font-size:15px;font-weight:600;color:#F0E4CD">@${esc(m.matchedUser.username)}</div></div>
        <button onclick="chatClose()" style="width:32px;height:32px;border-radius:50%;background:#1A1210;color:#A08070;border:none;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">✕</button>
      </div>
      <div id="cmsgs" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;scrollbar-width:none">
        <div style="display:flex;justify-content:center;padding:20px"><div class="spin"></div></div>
      </div>
      <div style="display:flex;gap:10px;padding:12px 16px;border-top:1px solid #3A2820;background:#1A1210;flex-shrink:0">
        <textarea id="cin" rows="1" placeholder="Escribe un mensaje..."
          style="flex:1;background:#231815;border:1px solid #3A2820;border-radius:22px;padding:10px 16px;font-size:14px;color:#F0E4CD;outline:none;resize:none;max-height:100px;line-height:1.4;font-family:inherit"
          onfocus="this.style.borderColor='#D4A843'" onblur="this.style.borderColor='#3A2820'"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px'"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();chatSend()}"></textarea>
        <button onclick="chatSend()" style="width:42px;height:42px;border-radius:50%;background:#D4A843;color:#0D0906;border:none;cursor:pointer;font-size:18px;align-self:flex-end;flex-shrink:0">➤</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=>{ov.style.opacity='1';$id('cp').style.transform='translateY(0)';});
  ov.addEventListener('click',e=>{if(e.target===ov)chatClose();});

  window._chatRoom=room; window._chatMyId=myId;
  if(SOCKET) SOCKET.emit('join-chat',room);

  window.chatClose=()=>{ov.style.opacity='0';$id('cp').style.transform='translateY(40px)';setTimeout(()=>{ov.remove();window._chatRoom=null;},280);};
  window.chatSend=()=>{const i=$id('cin');const t=i?.value?.trim();if(!t)return;i.value='';i.style.height='auto';if(SOCKET)SOCKET.emit('send-message',{roomId:room,text:t});};

  api('GET','/api/chat/'+room).then(msgs=>{
    const b=$id('cmsgs');if(!b)return;
    if(!msgs?.length){b.innerHTML='<div style="text-align:center;color:#604840;font-size:13px;padding:20px">¡Empieza la conversación!</div>';return;}
    b.innerHTML=''; msgs.forEach(appendMsg);
  }).catch(()=>{const b=$id('cmsgs');if(b)b.innerHTML='<div style="text-align:center;color:#604840;font-size:13px;padding:20px">Empieza la conversación.</div>';});
}

function appendMsg(msg) {
  const b=$id('cmsgs'); if(!b) return;
  const mine=(msg.sender?._id||msg.sender)?.toString()===(window._chatMyId||'').toString();
  const el=document.createElement('div');
  el.style.cssText=`max-width:78%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.4;word-break:break-word;align-self:${mine?'flex-end':'flex-start'};${mine?'background:#D4A843;color:#0D0906;border-bottom-right-radius:4px':'background:#2A1E19;color:#F0E4CD;border:1px solid #3A2820;border-bottom-left-radius:4px'}`;
  el.innerHTML=`<div>${esc(msg.text)}</div><div style="font-size:10px;opacity:.6;margin-top:3px;${mine?'text-align:right':''}">${fmt(msg.createdAt)}</div>`;
  b.appendChild(el); b.scrollTop=b.scrollHeight;
}

/* ── Perfil ─────────────────────────────────────── */
async function showProfile() {
  setNav('nb-profile');
  setView(`<div style="display:flex;justify-content:center;padding:60px"><div class="spin"></div></div>`);
  try {
    const u=await api('GET','/api/users/me');
    ME={...ME,...u};
    let sg=[...(u.favoriteGenres||[])];
    setView(`
      <div style="padding:0 16px 24px">
        <div style="font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#F0E4CD;padding:16px 0 12px">Mi Perfil</div>
        <div style="background:#231815;border:1px solid #3A2820;border-radius:14px;padding:20px;margin-bottom:20px;display:flex;align-items:center;gap:16px">
          <div style="width:64px;height:64px;border-radius:50%;background:#D4A843;color:#0D0906;font-family:Fraunces,serif;font-size:22px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${inia(u.username)}</div>
          <div>
            <div style="font-family:Fraunces,serif;font-size:20px;font-weight:700;color:#F0E4CD">@${esc(u.username)}</div>
            <div style="font-size:13px;color:#A08070;margin-top:2px">${esc(u.email)}</div>
            <div style="display:flex;gap:16px;margin-top:8px">
              <div><div style="font-size:18px;font-weight:600;color:#D4A843">${u.totalBooks||0}</div><div style="font-size:11px;color:#A08070">Libros</div></div>
              <div><div style="font-size:18px;font-weight:600;color:#D4A843">${MATCHES.length}</div><div style="font-size:11px;color:#A08070">Matches</div></div>
            </div>
          </div>
        </div>
        <div style="font-size:11px;font-weight:700;color:#604840;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Sobre mí</div>
        <textarea id="pbio" rows="3" placeholder="Cuéntale a otros qué tipo de lector eres..." style="width:100%;background:#1A1210;border:1px solid #3A2820;border-radius:10px;padding:13px 16px;font-size:15px;color:#F0E4CD;outline:none;resize:none;margin-bottom:12px;box-sizing:border-box;line-height:1.5;font-family:inherit">${esc(u.bio||'')}</textarea>
        <input id="ploc" type="text" value="${esc(u.location||'')}" placeholder="Ej: Concepción, Chile"
          style="width:100%;background:#1A1210;border:1px solid #3A2820;border-radius:10px;padding:13px 16px;font-size:15px;color:#F0E4CD;outline:none;margin-bottom:20px;box-sizing:border-box"
          onfocus="this.style.borderColor='#D4A843'" onblur="this.style.borderColor='#3A2820'"/>
        <div style="font-size:11px;font-weight:700;color:#604840;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Géneros favoritos</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">
          ${GENRES.map(g=>`<button onclick="profToggle('${esc(g)}')" id="gc-${esc(g)}"
            style="padding:7px 14px;border-radius:20px;font-size:12px;cursor:pointer;border:1px solid;transition:all .15s;${sg.includes(g)?'background:rgba(212,168,67,.12);border-color:rgba(212,168,67,.35);color:#D4A843':'background:#1A1210;border-color:#3A2820;color:#A08070'}">${g}</button>`).join('')}
        </div>
        <button id="psave" onclick="profSave()" style="width:100%;padding:14px;background:#D4A843;color:#0D0906;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:12px">Guardar cambios</button>
        <button onclick="doLogout()" style="width:100%;padding:14px;background:transparent;border:1px solid #3A2820;border-radius:12px;font-size:14px;color:#A08070;cursor:pointer">Cerrar sesión</button>
      </div>`);
    window._profG=sg;
    window.profToggle=g=>{const a=window._profG;const has=a.includes(g);if(has)window._profG=a.filter(x=>x!==g);else a.push(g);const btn=$id('gc-'+g);if(!btn)return;const on=window._profG.includes(g);btn.style.background=on?'rgba(212,168,67,.12)':'#1A1210';btn.style.borderColor=on?'rgba(212,168,67,.35)':'#3A2820';btn.style.color=on?'#D4A843':'#A08070';};
    window.profSave=async()=>{const btn=$id('psave');btn.disabled=true;btn.textContent='Guardando...';try{await api('PUT','/api/users/me',{bio:$id('pbio').value.trim(),location:$id('ploc').value.trim(),favoriteGenres:window._profG});toast('Perfil actualizado ✓','success');}catch(e){toast(e.message,'error');}finally{btn.disabled=false;btn.textContent='Guardar cambios';}};
  } catch(e) { toast(e.message,'error'); }
}

/* ── Match Modal ────────────────────────────────── */
function showMatchModal(match) {
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);z-index:400;display:flex;align-items:flex-end;opacity:0;transition:opacity .25s;max-width:480px;left:50%;transform:translateX(-50%)';
  ov.innerHTML=`
    <div id="mm" style="width:100%;background:#231815;border-radius:22px 22px 0 0;border:1px solid #3A2820;padding:40px 24px 36px;text-align:center;transform:translateY(30px);transition:transform .25s">
      <div style="font-size:68px;line-height:1;margin-bottom:16px">🎉</div>
      <div style="font-family:Fraunces,serif;font-size:28px;font-weight:700;color:#D4A843;margin-bottom:8px">¡Es un Match!</div>
      <div style="font-size:14px;color:#A08070;margin-bottom:24px;line-height:1.5">Tú y <strong style="color:#F0E4CD">@${esc(match.matchedUser.username)}</strong> quieren intercambiar libros</div>
      <div style="display:flex;align-items:center;gap:12px;background:#1A1210;border-radius:14px;padding:16px;margin-bottom:20px;text-align:left">
        <div style="flex:1"><div style="font-size:10px;color:#604840;text-transform:uppercase;letter-spacing:.5px">Tu libro</div><div style="font-family:Fraunces,serif;font-size:15px;font-weight:600;color:#F0E4CD;margin-top:3px">${esc(match.myBook.title)}</div><div style="font-size:12px;color:#A08070">${esc(match.myBook.author)}</div></div>
        <span style="font-size:22px;color:#D4A843">⇄</span>
        <div style="flex:1;text-align:right"><div style="font-size:10px;color:#604840;text-transform:uppercase;letter-spacing:.5px">Su libro</div><div style="font-family:Fraunces,serif;font-size:15px;font-weight:600;color:#F0E4CD;margin-top:3px">${esc(match.theirBook.title)}</div><div style="font-size:12px;color:#A08070">${esc(match.theirBook.author)}</div></div>
      </div>
      <button onclick="this.closest('[id]').closest('div').remove();showMatches()" style="width:100%;padding:14px;background:#D4A843;color:#0D0906;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:10px">💬 Ver Matches</button>
      <button onclick="this.closest('[id]').closest('div').remove()" style="width:100%;padding:12px;background:#2A1E19;border:1px solid #3A2820;border-radius:10px;font-size:14px;color:#A08070;cursor:pointer">Seguir explorando</button>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=>{ov.style.opacity='1';$id('mm').style.transform='translateY(0)';});
  ov.addEventListener('click',e=>{if(e.target===ov){ov.style.opacity='0';setTimeout(()=>ov.remove(),280);}});
}

/* ── Socket.io ──────────────────────────────────── */
function initSocket() {
  if(typeof io==='undefined'||SOCKET?.connected) return;
  SOCKET=io({auth:{token:TOKEN}});
  SOCKET.on('new-message',msg=>{
    const myId=(ME?._id||ME?.id||'').toString();
    const r=rid(myId,(msg.sender?._id||msg.sender).toString());
    if(window._chatRoom===r) appendMsg(msg);
    else { UNREAD[r]=(UNREAD[r]||0)+1; updateBadge(); }
  });
}

/* ── CSS ────────────────────────────────────────── */
const _s=document.createElement('style');
_s.textContent=`
  @keyframes spin{to{transform:rotate(360deg)}}
  .spin{width:32px;height:32px;border:3px solid #3A2820;border-top-color:#D4A843;border-radius:50%;animation:spin .7s linear infinite}
  .nb{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px 4px;border:none;background:transparent;cursor:pointer;color:#604840;font-size:10px;font-weight:500;font-family:inherit;transition:color .2s}
  .nb:hover{color:#A08070}
  #view::-webkit-scrollbar{display:none}
  .fab:hover{transform:scale(1.08) rotate(90deg) !important}
`;
document.head.appendChild(_s);

/* ── ARRANCAR ───────────────────────────────────── */
if (TOKEN) { launchApp(); } else { showAuth('login'); }
