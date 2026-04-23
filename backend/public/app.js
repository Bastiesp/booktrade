/* BookSwipe v3 — app.js */
'use strict';

const API='';
let TOKEN=localStorage.getItem('bs_token')||'';
let ME=null,MATCHES=[],MY_BOOKS=[],QUEUE=[],UNREAD={},SOCKET=null;
let ACTIVE_GENRE='Todos',CITY='';

const GENRES=['Ficción','No ficción','Ciencia ficción','Fantasía','Terror','Romance',
  'Thriller','Historia','Biografía','Ciencia','Filosofía','Poesía','Infantil','Cómic','Otro'];
const COLORS=['#4A1E2A','#1E3A5F','#1E4A2E','#3D1E5F','#5C2E18','#1E4A4A','#5C3818','#2A1E4A'];

/* ── Utilidades ─────────────────────────────────── */
const $=id=>document.getElementById(id);
const VIEW=()=>$('view');
const setView=h=>{const v=VIEW();if(v){v.innerHTML=h;v.scrollTop=0;}};
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const ini=s=>String(s||'??').slice(0,2).toUpperCase();
const clr=id=>{let h=0;for(const c of String(id||''))h=(h*31+c.charCodeAt(0))&0xfffffff;return COLORS[h%COLORS.length];};
const fmtT=d=>new Date(d).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
const roomId=(...a)=>a.map(String).sort().join('_');

function setNav(id){
  ['nb-discover','nb-books','nb-matches','nb-profile'].forEach(n=>{
    const b=$(n);if(b)b.className='nb'+(n===id?' active':'');
  });
}

function updateBadge(){
  const el=$('nb-mlabel');if(!el)return;
  const n=Object.values(UNREAD).reduce((a,b)=>a+b,0);
  el.innerHTML=n>0?`Matches <span style="background:#F97316;color:#FFFFFF;border-radius:10px;padding:1px 6px;font-size:10px;font-weight:700;margin-left:2px">${n}</span>`:'Matches';
}

/* ── API ────────────────────────────────────────── */
async function api(method,path,body){
  const h={'Content-Type':'application/json'};
  if(TOKEN)h['Authorization']='Bearer '+TOKEN;
  const r=await fetch(API+path,{method,headers:h,body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||'Error '+r.status);
  return d;
}

function jwtPayload(token){
  try{
    const part=String(token||'').split('.')[1];
    if(!part)return {};
    return JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));
  }catch{return {};}
}

function rememberUser(u){
  if(!u)return;
  ME=u;
  try{localStorage.setItem('bs_user',JSON.stringify(u));}catch{}
}

function getCurrentUserId(){
  const saved=(()=>{try{return JSON.parse(localStorage.getItem('bs_user')||'{}');}catch{return {};}})();
  const jwt=jwtPayload(TOKEN);
  const candidates=[
    ME?._id,ME?.id,ME?.userId,ME?.uid,
    saved?._id,saved?.id,saved?.userId,saved?.uid,
    jwt._id,jwt.id,jwt.userId,jwt.uid,jwt.sub
  ].filter(Boolean);
  return candidates.length?String(candidates[0]):'';
}

/* ── Toast ──────────────────────────────────────── */
function toast(msg,type){
  const box=$('toasts');if(!box)return;
  const t=document.createElement('div');
  t.style.cssText='padding:11px 16px;border-radius:10px;font-size:14px;font-weight:500;background:#FFEDD5;border:1px solid #FDBA74;color:#111827;box-shadow:0 8px 24px rgba(0,0,0,.5)';
  if(type==='error')t.style.color='#E8806E';
  if(type==='success')t.style.color='#72C5A0';
  t.textContent=msg;box.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}

/* ══════════════════════════════════════════════════
   AUTH — oculta el nav, muestra pantalla completa
   ══════════════════════════════════════════════════ */
function showAuth(tab){
  tab=tab||'login';
  /* Ocultar nav durante auth */
  const nav=$('nav');if(nav)nav.style.display='none';
  /* Hacer que #view ocupe toda la pantalla */
  const view=VIEW();if(view){view.style.bottom='0';}

  setView(`
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;position:relative;overflow:hidden;
      background:url('https://images.unsplash.com/photo-1481627834876-b7833e8f5570?q=85&w=1400&auto=format') center 30%/cover">
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(255,255,255,.80),rgba(255,247,237,.72),rgba(255,255,255,.92))"></div>
      <div style="position:relative;z-index:1;text-align:center;margin-bottom:32px">
        <div style="font-size:52px;filter:drop-shadow(0 0 20px rgba(249,115,22,.5))">📚</div>
        <div style="font-family:'Fraunces',serif;font-size:38px;font-weight:700;color:#111827;letter-spacing:-1px;margin-top:10px">Book<span style="color:#F97316">Swipe</span></div>
        <div style="font-size:12px;color:#6B7280;margin-top:6px;letter-spacing:.8px;text-transform:uppercase">Desliza · Conecta · Intercambia</div>
      </div>
      <div style="position:relative;z-index:1;width:100%;max-width:400px;background:rgba(26,18,16,.94);border:1px solid #FED7AA;border-radius:22px;padding:28px 24px;backdrop-filter:blur(12px)">
        <div style="display:flex;background:#FFFFFF;border-radius:10px;padding:4px;margin-bottom:22px">
          <button onclick="showAuth('login')" style="flex:1;padding:9px;border-radius:8px;font-size:14px;font-weight:600;border:none;cursor:pointer;${tab==='login'?'background:#F97316;color:#FFFFFF':'background:transparent;color:#6B7280'}">Ingresar</button>
          <button onclick="showAuth('register')" style="flex:1;padding:9px;border-radius:8px;font-size:14px;font-weight:600;border:none;cursor:pointer;${tab==='register'?'background:#F97316;color:#FFFFFF':'background:transparent;color:#6B7280'}">Registrarse</button>
        </div>
        ${tab==='login'?`
          <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Correo o usuario</div>
          <input id="fi" type="text" placeholder="tucorreo@email.com" autocomplete="username"
            style="width:100%;background:#FFFFFF;border:1px solid #FED7AA;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;box-sizing:border-box;margin-bottom:14px"
            onfocus="this.style.borderColor='#F97316'" onblur="this.style.borderColor='#FED7AA'" onkeydown="if(event.key==='Enter')doLogin()">
          <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Contraseña</div>
          <input id="fp" type="password" placeholder="••••••••" autocomplete="current-password"
            style="width:100%;background:#FFFFFF;border:1px solid #FED7AA;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;box-sizing:border-box;margin-bottom:14px"
            onfocus="this.style.borderColor='#F97316'" onblur="this.style.borderColor='#FED7AA'" onkeydown="if(event.key==='Enter')doLogin()">
          <button id="btn-login" onclick="doLogin()"
            style="width:100%;padding:14px;background:#F97316;color:#FFFFFF;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer">Ingresar</button>
        `:`
          <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Nombre de usuario</div>
          <input id="fu" type="text" placeholder="mi_usuario" autocomplete="username"
            style="width:100%;background:#FFFFFF;border:1px solid #FED7AA;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;box-sizing:border-box;margin-bottom:14px"
            onfocus="this.style.borderColor='#F97316'" onblur="this.style.borderColor='#FED7AA'">
          <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Correo electrónico</div>
          <input id="fe" type="email" placeholder="tucorreo@email.com" autocomplete="email"
            style="width:100%;background:#FFFFFF;border:1px solid #FED7AA;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;box-sizing:border-box;margin-bottom:14px"
            onfocus="this.style.borderColor='#F97316'" onblur="this.style.borderColor='#FED7AA'">
          <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Contraseña (mín. 6 caracteres)</div>
          <input id="fp2" type="password" placeholder="••••••••" autocomplete="new-password"
            style="width:100%;background:#FFFFFF;border:1px solid #FED7AA;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;box-sizing:border-box;margin-bottom:14px"
            onfocus="this.style.borderColor='#F97316'" onblur="this.style.borderColor='#FED7AA'">
          <button id="btn-reg" onclick="doRegister()"
            style="width:100%;padding:14px;background:#F97316;color:#FFFFFF;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer">Crear cuenta</button>
        `}
      </div>
    </div>`);
}

async function doLogin(){
  const id=$('fi')?.value?.trim(), pw=$('fp')?.value;
  if(!id||!pw)return toast('Completa todos los campos','error');
  const btn=$('btn-login');if(btn){btn.disabled=true;btn.textContent='Ingresando...';}
  try{
    const d=await api('POST','/api/auth/login',{identifier:id,password:pw});
    TOKEN=d.token;localStorage.setItem('bs_token',TOKEN);rememberUser(d.user);
    await launchApp();
  }catch(e){
    toast(e.message,'error');
    if(btn){btn.disabled=false;btn.textContent='Ingresar';}
  }
}

async function doRegister(){
  const u=$('fu')?.value?.trim(),e=$('fe')?.value?.trim(),p=$('fp2')?.value;
  if(!u||!e||!p)return toast('Completa todos los campos','error');
  const btn=$('btn-reg');if(btn){btn.disabled=true;btn.textContent='Creando cuenta...';}
  try{
    const d=await api('POST','/api/auth/register',{username:u,email:e,password:p});
    TOKEN=d.token;localStorage.setItem('bs_token',TOKEN);rememberUser(d.user);
    toast('¡Bienvenido a BookSwipe! 📚','success');
    await launchApp();
  }catch(e2){
    toast(e2.message,'error');
    if(btn){btn.disabled=false;btn.textContent='Crear cuenta';}
  }
}

function doLogout(){
  if(!confirm('¿Cerrar sesión?'))return;
  TOKEN='';ME=null;MATCHES=[];MY_BOOKS=[];QUEUE=[];
  localStorage.removeItem('bs_token');
  localStorage.removeItem('bs_user');
  SOCKET?.disconnect();SOCKET=null;
  showAuth('login');
}

/* ══════════════════════════════════════════════════
   LAUNCH — restaurar nav y cargar app
   ══════════════════════════════════════════════════ */
async function launchApp(){
  /* Mostrar nav */
  const nav=$('nav');if(nav)nav.style.display='flex';
  /* Restaurar #view con espacio para nav */
  const view=VIEW();if(view)view.style.bottom='68px';

  try{if(!ME){try{ME=JSON.parse(localStorage.getItem('bs_user')||'null');}catch{};}if(!ME)rememberUser(await api('GET','/api/users/me'));}
  catch(e){localStorage.removeItem('bs_token');TOKEN='';showAuth('login');return;}
  try{MATCHES=await api('GET','/api/swipes/matches')||[];}catch{}
  try{initSocket();}catch{}
  updateBadge();
  showDiscover();
}

/* ══════════════════════════════════════════════════
   DESCUBRIR
   ══════════════════════════════════════════════════ */
async function showDiscover(){
  setNav('nb-discover');
  /* Limpiar FAB */
  document.querySelector('.fab-btn')?.remove();

  setView(`
    <div style="padding:16px 20px 10px;display:flex;align-items:center;justify-content:space-between">
      <div style="font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#111827">Book<span style="color:#F97316">Swipe</span></div>
      <div id="qcnt" style="display:none;background:#F97316;color:#FFFFFF;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600"></div>
    </div>
    <div id="gbar" style="display:flex;gap:8px;padding:0 16px 10px;overflow-x:auto;scrollbar-width:none">
      ${['Todos',...GENRES].map(g=>`
        <button onclick="setGenre('${esc(g)}')" id="gf-${esc(g)}"
          style="padding:6px 14px;border-radius:20px;font-size:12px;font-weight:500;white-space:nowrap;cursor:pointer;flex-shrink:0;border:1px solid;transition:all .15s;
          ${g===ACTIVE_GENRE?'background:rgba(249,115,22,.15);border-color:rgba(249,115,22,.4);color:#F97316':'background:#FFF7ED;border-color:#FED7AA;color:#6B7280'}"
        >${esc(g)}</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px;padding:0 16px 10px">
      <input id="cin" type="text" value="${esc(CITY)}" placeholder="🏙 Filtrar por ciudad..."
        style="flex:1;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:9px 14px;font-size:13px;color:#111827;outline:none"
        onfocus="this.style.borderColor='#F97316'" onblur="this.style.borderColor='#FED7AA'"
        onkeydown="if(event.key==='Enter'){CITY=$('cin').value.trim();loadQueue()}">
      <button onclick="CITY=$('cin').value.trim();loadQueue()"
        style="padding:9px 16px;background:#F97316;color:#FFFFFF;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">Buscar</button>
    </div>
    <div style="position:relative;margin:0 16px;height:420px" id="stack"></div>
    <div style="display:flex;justify-content:center;align-items:center;gap:24px;padding:16px">
      <button onclick="swipeBtn('left')"
        style="width:60px;height:60px;border-radius:50%;background:#FFFFFF;border:2px solid #D45A4A;color:#D45A4A;font-size:24px;display:flex;align-items:center;justify-content:center">✕</button>
      <button onclick="swipeBtn('right')"
        style="width:72px;height:72px;border-radius:50%;background:#F97316;border:none;color:#FFFFFF;font-size:28px;display:flex;align-items:center;justify-content:center">♥</button>
    </div>`);

  await loadQueue();
}

function setGenre(g){
  ACTIVE_GENRE=g;
  document.querySelectorAll('#gbar button').forEach(b=>{
    const on=b.id==='gf-'+g;
    b.style.background=on?'rgba(249,115,22,.15)':'#FFF7ED';
    b.style.borderColor=on?'rgba(249,115,22,.4)':'#FED7AA';
    b.style.color=on?'#F97316':'#6B7280';
  });
  loadQueue();
}

async function loadQueue(){
  const s=$('stack');if(!s)return;
  s.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%"><div class="spin"></div></div>';
  try{
    let url='/api/books/discover';const p=[];
    if(ACTIVE_GENRE!=='Todos')p.push('genre='+encodeURIComponent(ACTIVE_GENRE));
    if(CITY)p.push('city='+encodeURIComponent(CITY));
    if(p.length)url+='?'+p.join('&');
    QUEUE=await api('GET',url);
    drawStack();
  }catch(e){s.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6B7280;font-size:14px;text-align:center;padding:20px">${esc(e.message)}</div>`;}
}

function drawStack(){
  const s=$('stack'),cnt=$('qcnt');if(!s)return;
  if(!QUEUE.length){
    if(cnt)cnt.style.display='none';
    s.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;text-align:center;padding:20px"><div style="font-size:48px;opacity:.4">🔭</div><div style="font-family:Fraunces,serif;font-size:20px;color:#111827">¡Todo explorado!</div><div style="font-size:13px;color:#6B7280">Vuelve pronto o cambia los filtros</div></div>';
    return;
  }
  if(cnt){cnt.style.display='block';cnt.textContent=QUEUE.length+' libros';}
  s.innerHTML='';
  QUEUE.slice(0,3).reverse().forEach((book,ri)=>{
    const isTop=ri===Math.min(QUEUE.length,3)-1;
    const depth=Math.min(QUEUE.length,3)-1-ri;
    const card=document.createElement('div');
    card.style.cssText=`position:absolute;inset:0;background:#FFFFFF;border:1px solid #FED7AA;border-radius:22px;overflow:hidden;user-select:none;will-change:transform;transform-origin:center bottom;${depth>0?`transform:scale(${1-depth*.04}) translateY(${depth*14}px)`:''}`;
    const photo=book.photos?.[0];
    card.innerHTML=`
      <div id="sl" style="position:absolute;top:28px;left:18px;padding:7px 16px;border-radius:6px;font-size:18px;font-weight:800;letter-spacing:2px;color:#4CAF7D;border:3px solid #4CAF7D;transform:rotate(-12deg);opacity:0;z-index:10;pointer-events:none">ME GUSTA</div>
      <div id="sn" style="position:absolute;top:28px;right:18px;padding:7px 16px;border-radius:6px;font-size:18px;font-weight:800;letter-spacing:2px;color:#D45A4A;border:3px solid #D45A4A;transform:rotate(12deg);opacity:0;z-index:10;pointer-events:none">PASO</div>
      <div style="height:60%;background:${clr(book._id)};position:relative;overflow:hidden">
        ${photo?`<img src="${esc(photo)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
        :`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center"><div style="font-family:Fraunces,serif;font-size:20px;font-weight:600;color:rgba(255,255,255,.9)">${esc(book.title)}</div><div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:6px;font-style:italic">${esc(book.author)}</div></div>`}
      </div>
      <div style="padding:14px 18px">
        <div style="font-family:Fraunces,serif;font-size:18px;font-weight:600;color:#111827;margin-bottom:3px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(book.title)}</div>
        <div style="font-size:13px;color:#6B7280;margin-bottom:8px">${esc(book.author)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
          <span style="padding:4px 10px;border-radius:20px;font-size:11px;background:rgba(249,115,22,.12);color:#F97316;border:1px solid rgba(249,115,22,.2)">${esc(book.genre)}</span>
          <span style="padding:4px 10px;border-radius:20px;font-size:11px;background:rgba(240,228,205,.06);color:#6B7280;border:1px solid #FED7AA">${esc(book.condition)}</span>
        </div>
        ${book.owner?`<div style="font-size:11px;color:#9CA3AF">📍 ${esc(book.owner.location||'—')} · @${esc(book.owner.username)}</div>`:''}
      </div>`;
    if(isTop)attachDrag(card,book._id);
    s.appendChild(card);
  });
}

function attachDrag(card,bookId){
  let sx=0,dx=0,on=false;
  const sl=card.querySelector('#sl'),sn=card.querySelector('#sn');
  const gx=e=>e.touches?e.touches[0].clientX:e.clientX;
  card.style.cursor='grab';
  const start=e=>{on=true;sx=gx(e);card.style.transition='none';};
  const move=e=>{if(!on)return;dx=gx(e)-sx;card.style.transform=`translateX(${dx}px) rotate(${dx*.07}deg)`;const t=Math.min(Math.abs(dx)/90,1);if(dx>0){sl.style.opacity=t;sn.style.opacity=0;}else{sn.style.opacity=t;sl.style.opacity=0;}};
  const end=()=>{if(!on)return;on=false;card.style.transition='transform .35s ease,opacity .35s';if(Math.abs(dx)>=90){const dir=dx>0?'right':'left';card.style.transform=`translateX(${dir==='right'?800:-800}px) rotate(${dx*.1}deg)`;card.style.opacity='0';doSwipe(bookId,dir);}else{card.style.transform='';sl.style.opacity=0;sn.style.opacity=0;}dx=0;};
  card.addEventListener('mousedown',start);card.addEventListener('touchstart',start,{passive:true});
  document.addEventListener('mousemove',move);document.addEventListener('mouseup',end);
  card.addEventListener('touchmove',move,{passive:true});card.addEventListener('touchend',end);
}

function swipeBtn(dir){
  const s=$('stack');if(!s||!QUEUE.length)return;
  const top=s.lastElementChild;if(!top)return;
  const sl=top.querySelector('#sl'),sn=top.querySelector('#sn');
  if(dir==='right'&&sl)sl.style.opacity=1;
  if(dir==='left'&&sn)sn.style.opacity=1;
  top.style.transition='transform .4s ease,opacity .4s';
  top.style.transform=`translateX(${dir==='right'?800:-800}px) rotate(${dir==='right'?15:-15}deg)`;
  top.style.opacity='0';
  doSwipe(QUEUE[0]._id,dir);
}

async function doSwipe(bookId,dir){
  QUEUE.shift();
  const cnt=$('qcnt');if(cnt){if(!QUEUE.length)cnt.style.display='none';else cnt.textContent=QUEUE.length+' libros';}
  setTimeout(drawStack,380);
  try{const r=await api('POST','/api/swipes',{bookId,direction:dir});if(dir==='right'&&r.match)showMatchModal(r.match);}catch{}
}

/* ══════════════════════════════════════════════════
   MIS LIBROS
   ══════════════════════════════════════════════════ */
async function showBooks(){
  setNav('nb-books');
  document.querySelector('.fab-btn')?.remove();
  setView(`
    <div style="padding:16px 20px 12px"><div style="font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#111827">Mis Libros</div></div>
    <div id="bgrid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 16px 80px">
      <div style="grid-column:1/-1;display:flex;justify-content:center;padding:40px"><div class="spin"></div></div>
    </div>`);

  const fab=document.createElement('button');
  fab.className='fab-btn';
  fab.textContent='+';
  fab.style.cssText='position:fixed;bottom:84px;right:max(16px,calc(50% - 240px + 16px));width:56px;height:56px;border-radius:50%;background:#F97316;color:#FFFFFF;font-size:28px;border:none;cursor:pointer;box-shadow:0 4px 24px rgba(249,115,22,.4);z-index:200;transition:transform .2s;display:flex;align-items:center;justify-content:center';
  fab.onclick=()=>openBookModal(null);
  document.body.appendChild(fab);

  try{MY_BOOKS=await api('GET','/api/books/mine');drawBooksGrid();}
  catch(e){toast(e.message,'error');}
}

function drawBooksGrid(){
  const g=$('bgrid');if(!g)return;
  if(!MY_BOOKS.length){g.innerHTML=`<div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;gap:10px;text-align:center"><div style="font-size:48px;opacity:.4">📖</div><div style="font-family:Fraunces,serif;font-size:20px;color:#111827">Sin libros aún</div><div style="font-size:13px;color:#6B7280">Toca el + para agregar</div></div>`;return;}
  g.innerHTML=MY_BOOKS.map(b=>`
    <div style="background:#FFFFFF;border:1px solid #FED7AA;border-radius:14px;overflow:hidden">
      <div style="height:130px;background:${clr(b._id)};position:relative;overflow:hidden">
        ${b.photos?.[0]?`<img src="${esc(b.photos[0])}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`:`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;text-align:center"><div style="font-family:Fraunces,serif;font-size:13px;font-weight:600;color:rgba(255,255,255,.9)">${esc(b.title)}</div><div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:3px;font-style:italic">${esc(b.author)}</div></div>`}
      </div>
      <div style="padding:10px 12px">
        <div style="font-size:13px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.title)}</div>
        <div style="font-size:11px;color:#6B7280;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.author)}</div>
        <div style="display:flex;gap:6px">
          <button onclick="openBookModal('${b._id}')" style="flex:1;padding:7px 4px;border-radius:8px;font-size:11px;font-weight:500;border:1px solid #FED7AA;color:#6B7280;background:#FFF7ED;cursor:pointer">Editar</button>
          <button onclick="deleteBook('${b._id}')" style="flex:1;padding:7px 4px;border-radius:8px;font-size:11px;font-weight:500;border:1px solid rgba(212,90,74,.2);color:rgba(212,90,74,.7);background:rgba(212,90,74,.06);cursor:pointer">Eliminar</button>
        </div>
      </div>
    </div>`).join('');
}

async function deleteBook(id){
  if(!confirm('¿Eliminar este libro?'))return;
  try{await api('DELETE','/api/books/'+id);toast('Eliminado','success');MY_BOOKS=await api('GET','/api/books/mine');drawBooksGrid();}
  catch(e){toast(e.message,'error');}
}

/* ── Modal libro ──────────────────────────────────── */
function openBookModal(idOrNull){
  const book=typeof idOrNull==='string'?MY_BOOKS.find(b=>b._id===idOrNull):null;
  const editing=!!book;
  const photos=book?.photos?[...book.photos,null,null,null].slice(0,3):[null,null,null];
  let selColor=book?.coverColor||COLORS[0];
  let activeSlot=0;

  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);z-index:500;display:flex;align-items:flex-end;opacity:0;transition:opacity .25s;max-width:480px;left:50%;transform:translateX(-50%)';
  ov.innerHTML=`
    <div id="bm" style="width:100%;background:#FFFFFF;border-radius:22px 22px 0 0;border:1px solid #FED7AA;padding:8px 24px 36px;max-height:92vh;overflow-y:auto;transform:translateY(30px);transition:transform .25s">
      <div style="width:40px;height:4px;background:#FDBA74;border-radius:2px;margin:12px auto 20px"></div>
      <div style="font-family:Fraunces,serif;font-size:22px;font-weight:700;color:#111827;margin-bottom:20px">${editing?'Editar libro':'Agregar libro'}</div>
      ${bmField('Título *','bm-ti','text',book?.title||'')}
      ${bmField('Autor *','bm-au','text',book?.author||'')}
      <div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Género *</div>
        <select id="bm-ge" style="width:100%;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;appearance:none;box-sizing:border-box">
          ${GENRES.map(g=>`<option value="${g}" ${book?.genre===g?'selected':''}>${g}</option>`).join('')}
        </select></div>
      <div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Estado</div>
        <select id="bm-co" style="width:100%;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;appearance:none;box-sizing:border-box">
          ${['Nuevo','Bueno','Regular'].map(c=>`<option value="${c}" ${(book?.condition||'Bueno')===c?'selected':''}>${c}</option>`).join('')}
        </select></div>
      <div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Descripción</div>
        <textarea id="bm-de" rows="3" placeholder="Cuéntale algo..." style="width:100%;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;resize:none;box-sizing:border-box;line-height:1.5;font-family:inherit">${esc(book?.description||'')}</textarea></div>
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Fotos <span style="color:#D45A4A">*</span> <span style="font-size:10px;font-weight:400;text-transform:none">(mínimo 1)</span></div>
        <div style="display:flex;gap:10px">
          ${[0,1,2].map(i=>`<div id="ps${i}" onclick="bmPickSlot(${i})" style="flex:1;aspect-ratio:1;border-radius:10px;border:2px dashed #FDBA74;display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;position:relative;background:#FFF7ED">
            <div id="pp${i}" style="text-align:center;pointer-events:none"><div style="font-size:22px;opacity:.4">📷</div><div style="font-size:10px;color:#9CA3AF;margin-top:2px">Foto ${i+1}</div></div>
            <img id="pi${i}" src="" style="display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
            <button id="pr${i}" onclick="bmRmSlot(event,${i})" style="display:none;position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.7);color:white;font-size:12px;border:none;cursor:pointer;padding:0;line-height:20px;text-align:center;z-index:2">✕</button>
          </div>`).join('')}
        </div>
        <input type="file" id="bm-file" accept="image/*" style="display:none">
        <div style="font-size:11px;color:#9CA3AF;margin-top:6px">Toca cada cuadro para elegir una foto</div>
      </div>
      <div style="margin-bottom:20px"><div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Color de portada</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${COLORS.map(c=>`<div id="bcs${c.slice(1)}" onclick="bmPickColor('${c}')" style="width:30px;height:30px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c===selColor?'#111827':'transparent'};transition:transform .15s"></div>`).join('')}
        </div></div>
      <button id="bm-save" onclick="bmSave()" style="width:100%;padding:14px;background:#F97316;color:#FFFFFF;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:8px">${editing?'Guardar cambios':'Agregar libro'}</button>
      <button onclick="bmClose()" style="width:100%;padding:12px;background:#FFEDD5;border:1px solid #FED7AA;border-radius:10px;font-size:14px;color:#6B7280;cursor:pointer">Cancelar</button>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=>{ov.style.opacity='1';$('bm').style.transform='translateY(0)';});
  ov.addEventListener('click',e=>{if(e.target===ov)bmClose();});

  if(editing&&book.photos?.length)book.photos.slice(0,3).forEach((s,i)=>{if(s)bmFillSlot(i,s);});

  /* Guardar estado del modal en el propio objeto para evitar globals conflictivos */
  const state={photos,selColor,book,editing};

  window.bmPickSlot=i=>{activeSlot=i;$('bm-file').value='';$('bm-file').click();};
  window.bmRmSlot=(e,i)=>{e.stopPropagation();state.photos[i]=null;$('pi'+i).style.display='none';$('pp'+i).style.display='';$('pr'+i).style.display='none';$('ps'+i).style.borderColor='#FDBA74';$('ps'+i).style.borderStyle='dashed';};
  window.bmPickColor=c=>{state.selColor=c;COLORS.forEach(x=>{const el=$('bcs'+x.slice(1));if(el)el.style.borderColor=x===c?'#111827':'transparent';});};
  window.bmClose=()=>{ov.style.opacity='0';$('bm').style.transform='translateY(30px)';setTimeout(()=>ov.remove(),280);};
  window.bmSave=async()=>{
    if(!ME)return toast('Usuario no cargado. Cierra sesión e ingresa nuevamente.','error');
    const uid=getCurrentUserId();
    if(!uid)return toast('Dueño requerido: no se pudo identificar tu usuario. Cierra sesión e ingresa nuevamente.','error');

    const cleanPhotos=state.photos.filter(Boolean);
    const p={
      title:$('bm-ti')?.value?.trim(),
      author:$('bm-au')?.value?.trim(),
      genre:$('bm-ge')?.value,
      condition:$('bm-co')?.value,
      description:$('bm-de')?.value?.trim()||'',
      coverColor:state.selColor,
      photos:cleanPhotos,

      // Compatibilidad con distintos backends/schemas:
      // algunos esperan owner, otros user/usuario/dueno/dueño.
      owner:uid,
      ownerId:uid,
      owner_id:uid,
      user:uid,
      userId:uid,
      user_id:uid,
      usuario:uid,
      usuarioId:uid,
      usuario_id:uid,
      dueno:uid,
      duenoId:uid,
      dueno_id:uid,
      duenio:uid,
      duenioId:uid,
      duenio_id:uid,
      'dueño':uid,
      'dueñoId':uid
    };
    if(!p.title||!p.author)return toast('Título y autor son requeridos','error');
    if(cleanPhotos.length<1)return toast('Agrega al menos 1 foto 📷','error');
    const btn=$('bm-save');btn.disabled=true;btn.textContent='Guardando...';
    try{
      if(state.editing)await api('PUT','/api/books/'+state.book._id,p);
      else await api('POST','/api/books',p);
      toast(state.editing?'Libro actualizado ✓':'Libro agregado ✓','success');
      window.bmClose();
      MY_BOOKS=await api('GET','/api/books/mine');drawBooksGrid();
    }catch(e){toast(e.message,'error');btn.disabled=false;btn.textContent=state.editing?'Guardar cambios':'Agregar libro';}
  };

  $('bm-file').addEventListener('change',async()=>{
    const f=$('bm-file').files[0];if(!f)return;
    if(f.size>10*1024*1024)return toast('Imagen muy grande (máx 10MB)','error');
    const btn=$('bm-save');btn.disabled=true;btn.textContent='Comprimiendo...';
    try{
      const url=await compressImg(f);
      bmFillSlot(activeSlot,url);state.photos[activeSlot]=url;
      const nx=state.photos.findIndex(x=>!x);if(nx!==-1)activeSlot=nx;
    }catch{toast('Error al procesar foto','error');}
    finally{btn.disabled=false;btn.textContent=state.editing?'Guardar cambios':'Agregar libro';}
  });
}

function bmFillSlot(i,src){const img=$('pi'+i),ph=$('pp'+i),rm=$('pr'+i),sl=$('ps'+i);if(!img)return;img.src=src;img.style.display='block';ph.style.display='none';rm.style.display='block';sl.style.borderStyle='solid';sl.style.borderColor='#F97316';}
function bmField(label,id,type,val){return `<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${label}</div><input id="${id}" type="${type}" value="${esc(val)}" style="width:100%;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;box-sizing:border-box" onfocus="this.style.borderColor='#F97316'" onblur="this.style.borderColor='#FED7AA'"/></div>`;}
async function compressImg(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>{const img=new Image();img.onload=()=>{const ratio=Math.min(900/img.width,900/img.height,1);const c=document.createElement('canvas');c.width=Math.round(img.width*ratio);c.height=Math.round(img.height*ratio);c.getContext('2d').drawImage(img,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.78));};img.onerror=rej;img.src=e.target.result;};r.onerror=rej;r.readAsDataURL(file);});}

/* ══════════════════════════════════════════════════
   MATCHES
   ══════════════════════════════════════════════════ */
async function showMatches(){
  setNav('nb-matches');
  document.querySelector('.fab-btn')?.remove();
  UNREAD={};updateBadge();
  setView(`
    <div style="padding:16px 20px 12px"><div style="font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#111827">Matches</div></div>
    <div id="mlist" style="padding:0 16px 80px;display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;justify-content:center;padding:40px"><div class="spin"></div></div>
    </div>`);
  try{MATCHES=await api('GET','/api/swipes/matches')||[];drawMatches();}
  catch(e){toast(e.message,'error');}
}

function drawMatches(){
  const ml=$('mlist');if(!ml)return;
  if(!MATCHES.length){ml.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;gap:10px;text-align:center"><div style="font-size:48px;opacity:.4">💔</div><div style="font-family:Fraunces,serif;font-size:20px;color:#111827">Sin matches aún</div><div style="font-size:13px;color:#6B7280">Cuando alguien quiera tu libro aparecerá aquí</div></div>`;return;}
  ml.innerHTML=MATCHES.map((m,i)=>`
    <div style="background:#FFFFFF;border:1px solid #FED7AA;border-radius:14px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:12px;padding:16px 16px 12px">
        <div style="width:48px;height:48px;border-radius:50%;background:#F97316;color:#FFFFFF;font-family:Fraunces,serif;font-size:18px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ini(m.matchedUser.username)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-family:Fraunces,serif;font-size:17px;font-weight:700;color:#111827">@${esc(m.matchedUser.username)}</div>
          ${m.matchedUser.location?`<div style="font-size:12px;color:#6B7280;margin-top:1px">📍 ${esc(m.matchedUser.location)}</div>`:''}
        </div>
        <span style="background:#F97316;color:#FFFFFF;border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700">✓ Match</span>
      </div>
      <div style="display:flex;margin:0 16px 12px;background:#FFF7ED;border-radius:10px;border:1px solid #FED7AA;overflow:hidden">
        <div style="flex:1;padding:12px 14px;border-right:1px solid #FED7AA">
          <div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Te interesa</div>
          <div style="font-family:Fraunces,serif;font-size:14px;font-weight:600;color:#111827;line-height:1.3">${esc(m.theirBook.title)}</div>
          <div style="font-size:11px;color:#6B7280;margin-top:2px">${esc(m.theirBook.author)}</div>
        </div>
        <div style="flex:1;padding:12px 14px">
          <div style="font-size:9px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">Le interesa tuyo</div>
          <div style="font-family:Fraunces,serif;font-size:14px;font-weight:600;color:#111827;line-height:1.3">${esc(m.myBook.title)}</div>
          <div style="font-size:11px;color:#6B7280;margin-top:2px">${esc(m.myBook.author)}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;padding:0 16px 16px">
        <button onclick="openChat(${i})" style="flex:1;padding:11px;background:#F97316;color:#FFFFFF;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">💬 Chat</button>
        <a href="mailto:${esc(m.matchedUser.email)}" style="padding:11px 16px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;font-size:13px;color:#6B7280;display:flex;align-items:center;gap:5px">✉ Email</a>
      </div>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════
   CHAT
   ══════════════════════════════════════════════════ */
function openChat(idx){
  const m=MATCHES[idx];if(!m)return;
  const myId=(ME?._id||ME?.id||'').toString();
  const room=roomId(myId,m.matchedUser.id);
  delete UNREAD[room];updateBadge();

  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);z-index:600;display:flex;align-items:flex-end;opacity:0;transition:opacity .25s;max-width:480px;left:50%;transform:translateX(-50%)';
  ov.innerHTML=`
    <div id="cp" style="width:100%;height:88vh;background:#FFFFFF;border-radius:22px 22px 0 0;border:1px solid #FED7AA;display:flex;flex-direction:column;transform:translateY(40px);transition:transform .25s">
      <div style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #FED7AA;flex-shrink:0;position:relative">
        <div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);width:36px;height:4px;background:#FDBA74;border-radius:2px"></div>
        <div style="width:38px;height:38px;border-radius:50%;background:#F97316;color:#FFFFFF;font-family:Fraunces,serif;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center">${ini(m.matchedUser.username)}</div>
        <div style="flex:1"><div style="font-size:15px;font-weight:600;color:#111827">@${esc(m.matchedUser.username)}</div></div>
        <button id="chat-close-btn" style="width:32px;height:32px;border-radius:50%;background:#FFF7ED;color:#6B7280;border:none;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">✕</button>
      </div>
      <div id="cmsgs" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;scrollbar-width:none">
        <div style="display:flex;justify-content:center;padding:20px"><div class="spin"></div></div>
      </div>
      <div style="display:flex;gap:10px;padding:12px 16px;border-top:1px solid #FED7AA;background:#FFF7ED;flex-shrink:0">
        <textarea id="cin2" rows="1" placeholder="Escribe un mensaje..."
          style="flex:1;background:#FFFFFF;border:1px solid #FED7AA;border-radius:22px;padding:10px 16px;font-size:14px;color:#111827;outline:none;resize:none;max-height:100px;line-height:1.4;font-family:inherit"
          onfocus="this.style.borderColor='#F97316'" onblur="this.style.borderColor='#FED7AA'"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px'"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();chatSend2()}"></textarea>
        <button onclick="chatSend2()" style="width:42px;height:42px;border-radius:50%;background:#F97316;color:#FFFFFF;border:none;cursor:pointer;font-size:18px;align-self:flex-end;flex-shrink:0">➤</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=>{ov.style.opacity='1';$('cp').style.transform='translateY(0)';});

  const closeChat=()=>{ov.style.opacity='0';$('cp').style.transform='translateY(40px)';setTimeout(()=>{ov.remove();window._cRoom=null;},280);};
  $('chat-close-btn').onclick=closeChat;
  ov.addEventListener('click',e=>{if(e.target===ov)closeChat();});

  window._cRoom=room;window._cMyId=myId;
  if(SOCKET)SOCKET.emit('join-chat',room);

  window.chatSend2=()=>{const i=$('cin2');const t=i?.value?.trim();if(!t)return;i.value='';i.style.height='auto';if(SOCKET)SOCKET.emit('send-message',{roomId:room,text:t});};

  api('GET','/api/chat/'+room).then(msgs=>{
    const b=$('cmsgs');if(!b)return;
    if(!msgs?.length){b.innerHTML='<div style="text-align:center;color:#9CA3AF;font-size:13px;padding:20px">¡Empieza la conversación!</div>';return;}
    b.innerHTML='';msgs.forEach(appendMsg2);
  }).catch(()=>{const b=$('cmsgs');if(b)b.innerHTML='<div style="text-align:center;color:#9CA3AF;font-size:13px;padding:20px">Empieza la conversación.</div>';});
}

function appendMsg2(msg){
  const b=$('cmsgs');if(!b)return;
  const mine=(msg.sender?._id||msg.sender)?.toString()===(window._cMyId||'').toString();
  const el=document.createElement('div');
  el.style.cssText=`max-width:78%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.4;word-break:break-word;align-self:${mine?'flex-end':'flex-start'};${mine?'background:#F97316;color:#FFFFFF;border-bottom-right-radius:4px':'background:#FFEDD5;color:#111827;border:1px solid #FED7AA;border-bottom-left-radius:4px'}`;
  el.innerHTML=`<div>${esc(msg.text)}</div><div style="font-size:10px;opacity:.6;margin-top:3px;${mine?'text-align:right':''}">${fmtT(msg.createdAt)}</div>`;
  b.appendChild(el);b.scrollTop=b.scrollHeight;
}

/* ══════════════════════════════════════════════════
   PERFIL
   ══════════════════════════════════════════════════ */
async function showProfile(){
  setNav('nb-profile');
  document.querySelector('.fab-btn')?.remove();
  setView(`<div style="display:flex;justify-content:center;padding:60px"><div class="spin"></div></div>`);
  try{
    const u=await api('GET','/api/users/me');rememberUser({...ME,...u});
    let sg=[...(u.favoriteGenres||[])];
    setView(`
      <div style="padding:0 16px 80px">
        <div style="font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#111827;padding:16px 0 12px">Mi Perfil</div>
        <div style="background:#FFFFFF;border:1px solid #FED7AA;border-radius:14px;padding:20px;margin-bottom:20px;display:flex;align-items:center;gap:16px">
          <div style="width:64px;height:64px;border-radius:50%;background:#F97316;color:#FFFFFF;font-family:Fraunces,serif;font-size:22px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ini(u.username)}</div>
          <div>
            <div style="font-family:Fraunces,serif;font-size:20px;font-weight:700;color:#111827">@${esc(u.username)}</div>
            <div style="font-size:13px;color:#6B7280;margin-top:2px">${esc(u.email)}</div>
            <div style="display:flex;gap:16px;margin-top:8px">
              <div><div style="font-size:18px;font-weight:600;color:#F97316">${u.totalBooks||0}</div><div style="font-size:11px;color:#6B7280">Libros</div></div>
              <div><div style="font-size:18px;font-weight:600;color:#F97316">${MATCHES.length}</div><div style="font-size:11px;color:#6B7280">Matches</div></div>
            </div>
          </div>
        </div>
        <div style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Sobre mí</div>
        <textarea id="pb" rows="3" placeholder="Cuéntale a otros qué tipo de lector eres..." style="width:100%;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;resize:none;margin-bottom:12px;box-sizing:border-box;line-height:1.5;font-family:inherit">${esc(u.bio||'')}</textarea>
        <input id="pl" type="text" value="${esc(u.location||'')}" placeholder="Ej: Concepción, Chile"
          style="width:100%;background:#FFF7ED;border:1px solid #FED7AA;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;margin-bottom:20px;box-sizing:border-box"
          onfocus="this.style.borderColor='#F97316'" onblur="this.style.borderColor='#FED7AA'">
        <div style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Géneros favoritos</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">
          ${GENRES.map(g=>`<button onclick="pgToggle('${esc(g)}')" id="pg-${esc(g)}"
            style="padding:7px 14px;border-radius:20px;font-size:12px;cursor:pointer;border:1px solid;transition:all .15s;
            ${sg.includes(g)?'background:rgba(249,115,22,.12);border-color:rgba(249,115,22,.35);color:#F97316':'background:#FFF7ED;border-color:#FED7AA;color:#6B7280'}">${g}</button>`).join('')}
        </div>
        <button id="psave" onclick="pgSave()" style="width:100%;padding:14px;background:#F97316;color:#FFFFFF;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:12px">Guardar cambios</button>
        <button onclick="doLogout()" style="width:100%;padding:14px;background:transparent;border:1px solid #FED7AA;border-radius:12px;font-size:14px;color:#6B7280;cursor:pointer">Cerrar sesión</button>
      </div>`);
    window._pg=sg;
    window.pgToggle=g=>{const has=window._pg.includes(g);if(has)window._pg=window._pg.filter(x=>x!==g);else window._pg.push(g);const btn=$('pg-'+g);if(!btn)return;const on=window._pg.includes(g);btn.style.background=on?'rgba(249,115,22,.12)':'#FFF7ED';btn.style.borderColor=on?'rgba(249,115,22,.35)':'#FED7AA';btn.style.color=on?'#F97316':'#6B7280';};
    window.pgSave=async()=>{const btn=$('psave');btn.disabled=true;btn.textContent='Guardando...';try{await api('PUT','/api/users/me',{bio:$('pb').value.trim(),location:$('pl').value.trim(),favoriteGenres:window._pg});toast('Perfil actualizado ✓','success');}catch(e){toast(e.message,'error');}finally{btn.disabled=false;btn.textContent='Guardar cambios';}};
  }catch(e){toast(e.message,'error');}
}

/* ── Match Modal ────────────────────────────────── */
function showMatchModal(match){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);z-index:700;display:flex;align-items:flex-end;opacity:0;transition:opacity .25s;max-width:480px;left:50%;transform:translateX(-50%)';
  const close=()=>{ov.style.opacity='0';setTimeout(()=>ov.remove(),280);};
  ov.innerHTML=`
    <div id="mmb" style="width:100%;background:#FFFFFF;border-radius:22px 22px 0 0;border:1px solid #FED7AA;padding:40px 24px 36px;text-align:center;transform:translateY(30px);transition:transform .25s">
      <div style="font-size:68px;line-height:1;margin-bottom:16px;animation:matchPop .5s ease">🎉</div>
      <div style="font-family:Fraunces,serif;font-size:28px;font-weight:700;color:#F97316;margin-bottom:8px">¡Es un Match!</div>
      <div style="font-size:14px;color:#6B7280;margin-bottom:24px;line-height:1.5">Tú y <strong style="color:#111827">@${esc(match.matchedUser.username)}</strong> quieren intercambiar libros</div>
      <div style="display:flex;align-items:center;gap:12px;background:#FFF7ED;border-radius:14px;padding:16px;margin-bottom:20px;text-align:left">
        <div style="flex:1"><div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px">Tu libro</div><div style="font-family:Fraunces,serif;font-size:15px;font-weight:600;color:#111827;margin-top:3px">${esc(match.myBook.title)}</div><div style="font-size:12px;color:#6B7280">${esc(match.myBook.author)}</div></div>
        <span style="font-size:22px;color:#F97316">⇄</span>
        <div style="flex:1;text-align:right"><div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px">Su libro</div><div style="font-family:Fraunces,serif;font-size:15px;font-weight:600;color:#111827;margin-top:3px">${esc(match.theirBook.title)}</div><div style="font-size:12px;color:#6B7280">${esc(match.theirBook.author)}</div></div>
      </div>
      <button id="mm-ver" style="width:100%;padding:14px;background:#F97316;color:#FFFFFF;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:10px">💬 Ver Matches</button>
      <button id="mm-cont" style="width:100%;padding:12px;background:#FFEDD5;border:1px solid #FED7AA;border-radius:10px;font-size:14px;color:#6B7280;cursor:pointer">Seguir explorando</button>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=>{ov.style.opacity='1';$('mmb').style.transform='translateY(0)';});
  $('mm-ver').onclick=()=>{close();showMatches();};
  $('mm-cont').onclick=close;
  ov.addEventListener('click',e=>{if(e.target===ov)close();});
}

/* ── Socket.io ──────────────────────────────────── */
function initSocket(){
  if(typeof io==='undefined'||SOCKET?.connected)return;
  SOCKET=io({auth:{token:TOKEN}});
  SOCKET.on('new-message',msg=>{
    const myId=(ME?._id||ME?.id||'').toString();
    const r=roomId(myId,(msg.sender?._id||msg.sender).toString());
    if(window._cRoom===r)appendMsg2(msg);
    else{UNREAD[r]=(UNREAD[r]||0)+1;updateBadge();}
  });
}

/* ══════════════════════════════════════════════════
   ARRANCAR
   ══════════════════════════════════════════════════ */
/* Ocultar nav hasta que el usuario esté logueado */
const navEl=$('nav');
if(navEl)navEl.style.display='none';
const viewEl=$('view');
if(viewEl)viewEl.style.bottom='0';

if(TOKEN){launchApp();}else{showAuth('login');}
