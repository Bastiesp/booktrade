/* BookTrade v3 — app.js */
'use strict';

const API='';
let TOKEN=localStorage.getItem('bs_token')||'';
let ME=null,MATCHES=[],MY_BOOKS=[],QUEUE=[],UNREAD={},NOTIFS={unread:0,items:[]},HISTORY=[],SOCKET=null;
let ACTIVE_GENRE='Todos',CITY='',DISCOVER_MODE='swipe',IS_ADMIN=false;

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


function forceShowNav(){
  const nav=document.getElementById('nav');
  const view=document.getElementById('view');
  const app=document.getElementById('app');
  const small=window.innerWidth<=720;
  const side=small?'78px':'96px';
  if(app){app.style.setProperty('max-width','1180px','important');app.style.setProperty('width','100%','important');}
  if(nav){
    nav.style.setProperty('display','flex','important');
    nav.style.setProperty('position','fixed','important');
    nav.style.setProperty('top','0','important');
    nav.style.setProperty('bottom','auto','important');
    nav.style.setProperty('left',small?'0':'max(0px,calc(50% - 590px))','important');
    nav.style.setProperty('transform','none','important');
    nav.style.setProperty('width',side,'important');
    nav.style.setProperty('max-width',side,'important');
    nav.style.setProperty('height','100vh','important');
    nav.style.setProperty('background','#FFFFFF','important');
    nav.style.setProperty('border-top','none','important');
    nav.style.setProperty('border-right','1px solid #BFDBFE','important');
    nav.style.setProperty('z-index','999999','important');
    nav.style.setProperty('flex-direction','column','important');
    nav.style.setProperty('justify-content','center','important');
    nav.style.setProperty('gap','4px','important');
    nav.style.setProperty('box-shadow','8px 0 24px rgba(17,24,39,.06)','important');
  }
  if(view){
    view.style.setProperty('top','0','important');
    view.style.setProperty('bottom','0','important');
    view.style.setProperty('left',side,'important');
    view.style.setProperty('right','0','important');
    view.style.setProperty('background','#FFFFFF','important');
  }
}

function forceLogout(){
  TOKEN='';
  ME=null;
  MATCHES=[];
  MY_BOOKS=[];
  QUEUE=[];
  UNREAD={};
  try{
    localStorage.removeItem('bs_token');
    localStorage.removeItem('bs_user');
  }catch{}
  try{SOCKET?.disconnect();}catch{}
  SOCKET=null;
  forceShowNav();
  showAuth('login');
}

function requireLogin(){
  if(TOKEN)return true;
  forceShowNav();
  toast('Inicia sesión para usar este módulo','error');
  showAuth('login');
  return false;
}


function setNav(id){
  forceShowNav();
  ['nb-discover','nb-books','nb-matches','nb-chats','nb-history','nb-profile'].forEach(n=>{
    const b=$(n);if(b)b.className='nb'+(n===id?' active':'');
  });
}


function levelFor(n){n=Number(n||0);if(n>=35)return 'Oro';if(n>=15)return 'Plata';if(n>=7)return 'Bronce';return 'Aficionado';}

function nextLevelInfo(n){
  n=Number(n||0);
  if(n>=35)return {current:'Oro',next:null,currentMin:35,nextAt:null,remaining:0,percent:100};
  if(n>=15)return {current:'Plata',next:'Oro',currentMin:15,nextAt:35,remaining:35-n,percent:Math.round(((n-15)/20)*100)};
  if(n>=7)return {current:'Bronce',next:'Plata',currentMin:7,nextAt:15,remaining:15-n,percent:Math.round(((n-7)/8)*100)};
  return {current:'Aficionado',next:'Bronce',currentMin:0,nextAt:7,remaining:7-n,percent:Math.round((n/7)*100)};
}
function ratingText(u){
  const avg=Number(u?.ratingAvg||0);
  const count=Number(u?.ratingCount||0);
  return count>0?`⭐ ${avg.toFixed(1)} (${count})`:'⭐ Sin calificaciones';
}
async function openPublicProfile(userId){
  try{
    const u=await api('GET','/api/users/'+userId+'/public');
    const p=u.levelProgress||nextLevelInfo(u.completedExchanges);
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000003;display:flex;align-items:flex-end;max-width:1180px;margin:0 auto;left:50%;transform:translateX(-50%)';
    ov.innerHTML=`<div style="width:100%;background:#FFFFFF;border-radius:24px 24px 0 0;border:1px solid #BFDBFE;padding:24px;max-height:86vh;overflow:auto">
      <div style="width:44px;height:4px;background:#93C5FD;border-radius:8px;margin:0 auto 18px"></div>
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px">
        <div style="width:76px;height:76px;border-radius:50%;background:#3B82F6;color:#fff;font-size:26px;font-weight:800;display:flex;align-items:center;justify-content:center;overflow:hidden">${u.profilePhoto?`<img src="${esc(u.profilePhoto)}" style="width:100%;height:100%;object-fit:cover">`:ini(u.username)}</div>
        <div style="flex:1">
          <div style="font-family:Fraunces,serif;font-size:24px;font-weight:800;color:#111827">@${esc(u.username)}</div>
          <div style="font-size:13px;color:#6B7280;margin-top:3px">📍 ${esc(u.location||'Sin comuna')} · ${u.verificationStatus==='verified'?'✅ Verificado':'🕒 No verificado'}</div>
          <div style="font-size:13px;color:#6B7280;margin-top:3px">${levelEmoji(u.level)} ${esc(u.level||levelFor(u.completedExchanges))} · ${ratingText(u)}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
        <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:14px;padding:12px;text-align:center"><div style="font-size:20px;font-weight:900;color:#3B82F6">${u.totalBooks||0}</div><div style="font-size:11px;color:#6B7280">Libros</div></div>
        <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:14px;padding:12px;text-align:center"><div style="font-size:20px;font-weight:900;color:#3B82F6">${u.completedExchanges||0}</div><div style="font-size:11px;color:#6B7280">Intercambios</div></div>
        <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:14px;padding:12px;text-align:center"><div style="font-size:20px;font-weight:900;color:#3B82F6">${Number(u.ratingAvg||0).toFixed(1)}</div><div style="font-size:11px;color:#6B7280">Rating</div></div>
      </div>
      <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:14px;padding:14px;margin-bottom:14px">
        <div style="font-size:12px;color:#6B7280;font-weight:800;text-transform:uppercase;margin-bottom:6px">Progreso de nivel</div>
        <div style="display:flex;justify-content:space-between;font-size:13px;color:#111827;font-weight:800"><span>${levelEmoji(u.level)} ${esc(u.level)}</span><span>${p.next?`Faltan ${p.remaining} para ${p.next}`:'Nivel máximo'}</span></div>
        <div style="height:10px;background:#DBEAFE;border-radius:999px;overflow:hidden;margin-top:8px"><div style="height:100%;width:${Math.max(0,Math.min(100,p.percent||0))}%;background:#3B82F6;border-radius:999px"></div></div>
      </div>
      <div style="font-size:13px;color:#6B7280;line-height:1.5;margin-bottom:18px">${esc(u.bio||'Sin biografía todavía.')}</div>
      <button onclick="this.closest('div[style*=fixed]').remove()" style="width:100%;padding:13px;border:none;border-radius:12px;background:#3B82F6;color:#fff;font-weight:800">Cerrar</button>
    </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  }catch(e){toast(e.message,'error');}
}

function levelEmoji(l){return l==='Oro'?'🥇':l==='Plata'?'🥈':l==='Bronce'?'🥉':'📚';}
async function loadNotifications(){if(!TOKEN)return;try{NOTIFS=await api('GET','/api/notifications');updateNotificationBadge();}catch{}}
function updateNotificationBadge(){const el=$('nb-notif-badge');if(!el)return;const n=NOTIFS?.unread||0;el.style.display=n>0?'inline-flex':'none';el.textContent=n>9?'9+':String(n);}


async function checkAdminAccess(){
  if(!TOKEN)return false;
  try{const r=await api('GET','/api/admin/whoami');IS_ADMIN=!!r.isAdmin;return IS_ADMIN;}catch{IS_ADMIN=false;return false;}
}
function showPopNotification(title,body,onclick){
  const p=document.createElement('div');
  p.style.cssText='position:fixed;top:18px;right:max(18px,calc(50% - 590px + 18px));z-index:1000005;background:#FFFFFF;border:1px solid #BFDBFE;border-radius:16px;padding:14px 16px;box-shadow:0 16px 45px rgba(17,24,39,.18);max-width:320px;cursor:pointer;color:#111827';
  p.innerHTML=`<div style="font-weight:900;color:#3B82F6;font-size:14px;margin-bottom:3px">${esc(title)}</div><div style="font-size:13px;color:#6B7280;line-height:1.35">${esc(body||'')}</div>`;
  p.onclick=()=>{try{onclick&&onclick();}catch{}p.remove();};
  document.body.appendChild(p);
  setTimeout(()=>{p.style.opacity='0';p.style.transform='translateY(-8px)';p.style.transition='.25s';setTimeout(()=>p.remove(),260);},5200);
}

function updateBadge(){
  const el=$('nb-mlabel');if(!el)return;
  const n=Object.values(UNREAD).reduce((a,b)=>a+b,0);
  el.innerHTML=n>0?`Matches <span style="background:#3B82F6;color:#FFFFFF;border-radius:10px;padding:1px 6px;font-size:10px;font-weight:700;margin-left:2px">${n}</span>`:'Matches';
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
  t.style.cssText='padding:11px 16px;border-radius:10px;font-size:14px;font-weight:500;background:#DBEAFE;border:1px solid #93C5FD;color:#111827;box-shadow:0 8px 24px rgba(0,0,0,.5)';
  if(type==='error')t.style.color='#E8806E';
  if(type==='success')t.style.color='#72C5A0';
  t.textContent=msg;box.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}

/* ══════════════════════════════════════════════════
   AUTH — oculta el nav, muestra pantalla completa
   ══════════════════════════════════════════════════ */


function showForgotPassword(){
  const nav=$('nav');
  if(nav)nav.style.display='none';

  const view=VIEW();
  if(view){
    view.style.left='0';
    view.style.bottom='0';
    view.style.right='0';
  }

  setView(`
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#EFF6FF">
      <div style="width:100%;max-width:420px;background:#FFFFFF;border:1px solid #BFDBFE;border-radius:22px;padding:26px;box-shadow:0 24px 70px rgba(17,24,39,.10)">
        <div style="font-family:Fraunces,serif;font-size:28px;font-weight:900;color:#111827;margin-bottom:8px">Recuperar contraseña</div>
        <div style="font-size:14px;color:#6B7280;line-height:1.45;margin-bottom:18px">
          Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña.
        </div>

        <input id="fp-email" type="email" placeholder="tu-correo@email.com"
          style="width:100%;padding:14px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;font-size:15px;color:#111827;outline:none;margin-bottom:12px">

        <button id="fp-btn" onclick="sendForgotPassword()"
          style="width:100%;padding:14px;background:#3B82F6;color:#FFFFFF;border:none;border-radius:12px;font-size:15px;font-weight:900">
          Enviar enlace
        </button>

        <button onclick="showAuth('login')"
          style="width:100%;padding:13px;margin-top:10px;background:transparent;color:#6B7280;border:1px solid #BFDBFE;border-radius:12px;font-size:14px;font-weight:700">
          Volver al login
        </button>
      </div>
    </div>
  `);
}

async function sendForgotPassword(){
  const btn=$('fp-btn');
  const email=$('fp-email')?.value?.trim();

  if(!email){
    return toast('Ingresa tu correo','error');
  }

  btn.disabled=true;
  btn.textContent='Enviando...';

  try{
    const r=await api('POST','/api/auth/forgot-password',{email});
    toast(r.message||'Si el correo existe, recibirás un enlace.','success');
    showAuth('login');
  }catch(e){
    toast(e.message,'error');
  }finally{
    btn.disabled=false;
    btn.textContent='Enviar enlace';
  }
}


function showAuth(tab){
  forceShowNav();
  tab=tab||'login';
  const nav=$('nav');if(nav)nav.style.display='flex';
  const view=VIEW();if(view){view.style.bottom='0';view.style.left=(window.innerWidth<=720?'78px':'96px');}

  setView(`
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;position:relative;overflow:hidden;
      background:url('https://images.unsplash.com/photo-1481627834876-b7833e8f5570?q=85&w=1400&auto=format') center center/cover">
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.10),rgba(0,0,0,.04),rgba(0,0,0,.16))"></div>
      <button onclick="forceLogout()" style="position:absolute;top:14px;right:14px;z-index:999999;background:#FFFFFF;border:1px solid #BFDBFE;color:#6B7280;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:600;box-shadow:0 8px 20px rgba(17,24,39,.10)">Cerrar sesión</button>
      <div style="position:relative;z-index:1;text-align:center;margin-bottom:32px">
        <div style="font-size:52px;filter:drop-shadow(0 0 20px rgba(59,130,246,.5))">📚</div>
        <div style="font-family:'Fraunces',serif;font-size:38px;font-weight:700;color:#FFFFFF;letter-spacing:-1px;margin-top:10px;text-shadow:0 4px 20px rgba(0,0,0,.65)">Book<span style="color:#3B82F6">Trade</span></div>
        <div style="font-size:13px;color:#FFFFFF;margin-top:8px;letter-spacing:.7px;text-transform:uppercase;font-weight:900;text-shadow:0 3px 16px rgba(0,0,0,.65)">Desliza, conecta, e intercambia historias</div>
      </div>
      <div style="position:relative;z-index:1;width:100%;max-width:400px;background:rgba(255,255,255,.86);border:1px solid rgba(255,255,255,.55);border-radius:22px;padding:28px 24px;backdrop-filter:blur(8px);box-shadow:0 24px 70px rgba(17,24,39,.20)">
        <div style="display:flex;background:#FFFFFF;border-radius:10px;padding:4px;margin-bottom:22px">
          <button onclick="showAuth('login')" style="flex:1;padding:9px;border-radius:8px;font-size:14px;font-weight:600;border:none;cursor:pointer;${tab==='login'?'background:#3B82F6;color:#FFFFFF':'background:transparent;color:#6B7280'}">Ingresar</button>
          <button onclick="showAuth('register')" style="flex:1;padding:9px;border-radius:8px;font-size:14px;font-weight:600;border:none;cursor:pointer;${tab==='register'?'background:#3B82F6;color:#FFFFFF':'background:transparent;color:#6B7280'}">Registrarse</button>
        </div>
        ${tab==='login'?`
          <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Correo o usuario</div>
          <input id="fi" type="text" placeholder="tucorreo@email.com" autocomplete="username"
            style="width:100%;background:#FFFFFF;border:1px solid #BFDBFE;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;box-sizing:border-box;margin-bottom:14px"
            onfocus="this.style.borderColor='#3B82F6'" onblur="this.style.borderColor='#BFDBFE'" onkeydown="if(event.key==='Enter')doLogin()">
          <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Contraseña</div>
          <input id="fp" type="password" placeholder="••••••••" autocomplete="current-password"
            style="width:100%;background:#FFFFFF;border:1px solid #BFDBFE;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;box-sizing:border-box;margin-bottom:14px"
            onfocus="this.style.borderColor='#3B82F6'" onblur="this.style.borderColor='#BFDBFE'" onkeydown="if(event.key==='Enter')doLogin()">
          <button id="btn-login" onclick="doLogin()"
            style="width:100%;padding:14px;background:#3B82F6;color:#FFFFFF;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer">Ingresar</button>
        `:`
          <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Nombre de usuario</div>
          <input id="fu" type="text" placeholder="mi_usuario" autocomplete="username"
            style="width:100%;background:#FFFFFF;border:1px solid #BFDBFE;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;box-sizing:border-box;margin-bottom:14px"
            onfocus="this.style.borderColor='#3B82F6'" onblur="this.style.borderColor='#BFDBFE'">
          <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Correo electrónico</div>
          <input id="fe" type="email" placeholder="tucorreo@email.com" autocomplete="email"
            style="width:100%;background:#FFFFFF;border:1px solid #BFDBFE;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;box-sizing:border-box;margin-bottom:14px"
            onfocus="this.style.borderColor='#3B82F6'" onblur="this.style.borderColor='#BFDBFE'">
          <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Contraseña (mín. 6 caracteres)</div>
          <input id="fp2" type="password" placeholder="••••••••" autocomplete="new-password"
            style="width:100%;background:#FFFFFF;border:1px solid #BFDBFE;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;box-sizing:border-box;margin-bottom:14px"
            onfocus="this.style.borderColor='#3B82F6'" onblur="this.style.borderColor='#BFDBFE'">
          <button id="btn-reg" onclick="doRegister()"
            style="width:100%;padding:14px;background:#3B82F6;color:#FFFFFF;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer">Crear cuenta</button>
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
    toast('¡Bienvenido a BookTrade! 📚','success');
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
  forceShowNav();
  /* Mostrar nav */
  const nav=$('nav');if(nav)nav.style.display='flex';
  /* Restaurar #view con espacio para nav */
  const view=VIEW();if(view){view.style.bottom='0';view.style.left=(window.innerWidth<=720?'78px':'96px');}

  try{if(!ME){try{ME=JSON.parse(localStorage.getItem('bs_user')||'null');}catch{};}if(!ME)rememberUser(await api('GET','/api/users/me'));}
  catch(e){localStorage.removeItem('bs_token');TOKEN='';showAuth('login');return;}
  try{MATCHES=await api('GET','/api/swipes/matches')||[];}catch{}
  try{initSocket();}catch{}
  updateBadge();
  await loadNotifications();
  if(window._notifPoll)clearInterval(window._notifPoll);window._notifPoll=setInterval(()=>{if(TOKEN)loadNotifications();},20000);
  await checkAdminAccess();
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
      <div style="font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#111827">Book<span style="color:#3B82F6">Trade</span></div>
      <div id="qcnt" style="display:none;background:#3B82F6;color:#FFFFFF;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600"></div>
    </div>
    <div id="gbar" style="display:flex;gap:8px;padding:0 16px 10px;overflow-x:auto;scrollbar-width:none">
      ${['Todos',...GENRES].map(g=>`
        <button onclick="setGenre('${esc(g)}')" id="gf-${esc(g)}"
          style="padding:6px 14px;border-radius:20px;font-size:12px;font-weight:500;white-space:nowrap;cursor:pointer;flex-shrink:0;border:1px solid;transition:all .15s;
          ${g===ACTIVE_GENRE?'background:rgba(59,130,246,.15);border-color:rgba(59,130,246,.4);color:#3B82F6':'background:#EFF6FF;border-color:#BFDBFE;color:#6B7280'}"
        >${esc(g)}</button>`).join('')}
    </div>
    <div style="display:flex;gap:8px;padding:0 16px 10px">
      <input id="cin" type="text" value="${esc(CITY)}" placeholder="🏙 Filtrar por ciudad..."
        style="flex:1;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:9px 14px;font-size:13px;color:#111827;outline:none"
        onfocus="this.style.borderColor='#3B82F6'" onblur="this.style.borderColor='#BFDBFE'"
        onkeydown="if(event.key==='Enter'){CITY=$('cin').value.trim();loadQueue()}">
      <button onclick="CITY=$('cin').value.trim();loadQueue()"
        style="padding:9px 16px;background:#3B82F6;color:#FFFFFF;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">Buscar</button>
    </div>
    <div style="display:flex;gap:8px;padding:0 16px 12px">
      <button onclick="setDiscoverMode('swipe')" style="flex:1;padding:10px;border-radius:12px;border:1px solid ${DISCOVER_MODE==='swipe'?'#3B82F6':'#BFDBFE'};background:${DISCOVER_MODE==='swipe'?'#3B82F6':'#EFF6FF'};color:${DISCOVER_MODE==='swipe'?'#FFFFFF':'#6B7280'};font-size:13px;font-weight:800">🔥 Swipe</button>
      <button onclick="setDiscoverMode('catalog')" style="flex:1;padding:10px;border-radius:12px;border:1px solid ${DISCOVER_MODE==='catalog'?'#3B82F6':'#BFDBFE'};background:${DISCOVER_MODE==='catalog'?'#3B82F6':'#EFF6FF'};color:${DISCOVER_MODE==='catalog'?'#FFFFFF':'#6B7280'};font-size:13px;font-weight:800">📚 Catálogo</button>
    </div>
    <div style="position:relative;margin:0 16px;min-height:420px" id="stack"></div>
    <div id="swipe-actions" style="display:${DISCOVER_MODE==='swipe'?'flex':'none'};justify-content:center;align-items:center;gap:24px;padding:16px">
      <button onclick="swipeBtn('left')"
        style="width:60px;height:60px;border-radius:50%;background:#FFFFFF;border:2px solid #D45A4A;color:#D45A4A;font-size:24px;display:flex;align-items:center;justify-content:center">✕</button>
      <button onclick="swipeBtn('right')"
        style="width:72px;height:72px;border-radius:50%;background:#3B82F6;border:none;color:#FFFFFF;font-size:28px;display:flex;align-items:center;justify-content:center">♥</button>
    </div>`);

  await loadQueue();
}

function setGenre(g){
  ACTIVE_GENRE=g;
  document.querySelectorAll('#gbar button').forEach(b=>{
    const on=b.id==='gf-'+g;
    b.style.background=on?'rgba(59,130,246,.15)':'#EFF6FF';
    b.style.borderColor=on?'rgba(59,130,246,.4)':'#BFDBFE';
    b.style.color=on?'#3B82F6':'#6B7280';
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


function setDiscoverMode(mode){DISCOVER_MODE=mode;drawStack();}
function drawCatalog(){
  const s=$('stack'),cnt=$('qcnt');if(!s)return;
  const actions=$('swipe-actions');if(actions)actions.style.display='none';
  s.style.height='auto';s.style.minHeight='420px';
  if(cnt){cnt.style.display=QUEUE.length?'block':'none';cnt.textContent=QUEUE.length+' libros';}
  if(!QUEUE.length){s.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:360px;gap:10px;text-align:center;padding:20px"><div style="font-size:48px;opacity:.4">🔭</div><div style="font-family:Fraunces,serif;font-size:20px;color:#111827">¡Todo explorado!</div><div style="font-size:13px;color:#6B7280">Vuelve pronto o cambia los filtros</div></div>';return;}
  s.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;padding-bottom:22px">${QUEUE.map(book=>{const photo=book.photos?.[0];return `<div style="background:#FFFFFF;border:1px solid #BFDBFE;border-radius:18px;overflow:hidden;box-shadow:0 10px 26px rgba(17,24,39,.05)"><div style="height:210px;background:${clr(book._id)};position:relative;overflow:hidden">${photo?`<img src="${esc(photo)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`:`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center"><div style="font-family:Fraunces,serif;font-size:20px;font-weight:600;color:rgba(255,255,255,.9)">${esc(book.title)}</div><div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:6px;font-style:italic">${esc(book.author)}</div></div>`}</div><div style="padding:14px"><div style="font-family:Fraunces,serif;font-size:18px;font-weight:700;color:#111827;line-height:1.25">${esc(book.title)}</div><div style="font-size:13px;color:#6B7280;margin:4px 0 10px">${esc(book.author)}</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px"><span style="padding:4px 10px;border-radius:20px;font-size:11px;background:rgba(59,130,246,.12);color:#3B82F6;border:1px solid rgba(59,130,246,.2)">${esc(book.genre)}</span><span style="padding:4px 10px;border-radius:20px;font-size:11px;background:#EFF6FF;color:#6B7280;border:1px solid #BFDBFE">${esc(book.condition)}</span></div><div style="font-size:12px;color:#9CA3AF;margin-bottom:12px">📍 ${esc(book.owner?.location||'—')} · @${esc(book.owner?.username||'usuario')}</div><div style="display:flex;gap:8px"><button onclick="catalogSwipe('${book._id}','left')" style="flex:1;padding:10px;border-radius:10px;border:1px solid rgba(212,90,74,.25);background:#FFFFFF;color:#D45A4A;font-weight:800">Paso</button><button onclick="catalogSwipe('${book._id}','right')" style="flex:1;padding:10px;border-radius:10px;border:none;background:#3B82F6;color:#FFFFFF;font-weight:800">Me interesa</button></div></div></div>`}).join('')}</div>`;
}
async function catalogSwipe(bookId,dir){
  try{const r=await api('POST','/api/swipes',{bookId,direction:dir});QUEUE=QUEUE.filter(b=>String(b._id)!==String(bookId));drawCatalog();if(dir==='right'&&r.match)showMatchModal(r.match);else toast(dir==='right'?'Interés guardado':'Libro descartado','success');}catch(e){toast(e.message,'error');}
}

function drawStack(){
  if(DISCOVER_MODE==='catalog')return drawCatalog();
  const s=$('stack'),cnt=$('qcnt');if(!s)return;
  s.style.height='420px';s.style.minHeight='420px';const actions=$('swipe-actions');if(actions)actions.style.display='flex';
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
    card.style.cssText=`position:absolute;inset:0;background:#FFFFFF;border:1px solid #BFDBFE;border-radius:22px;overflow:hidden;user-select:none;will-change:transform;transform-origin:center bottom;${depth>0?`transform:scale(${1-depth*.04}) translateY(${depth*14}px)`:''}`;
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
          <span style="padding:4px 10px;border-radius:20px;font-size:11px;background:rgba(59,130,246,.12);color:#3B82F6;border:1px solid rgba(59,130,246,.2)">${esc(book.genre)}</span>
          <span style="padding:4px 10px;border-radius:20px;font-size:11px;background:rgba(240,228,205,.06);color:#6B7280;border:1px solid #BFDBFE">${esc(book.condition)}</span>
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
  if(!requireLogin())return;
  document.querySelector('.fab-btn')?.remove();
  setView(`
    <div style="padding:16px 20px 12px"><div style="font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#111827">Mis Libros</div></div>
    <div id="bgrid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 16px 80px">
      <div style="grid-column:1/-1;display:flex;justify-content:center;padding:40px"><div class="spin"></div></div>
    </div>`);

  const fab=document.createElement('button');
  fab.className='fab-btn';
  fab.textContent='+';
  fab.style.cssText='position:fixed;bottom:84px;right:max(24px,calc(50% - 590px + 24px));width:56px;height:56px;border-radius:50%;background:#3B82F6;color:#FFFFFF;font-size:28px;border:none;cursor:pointer;box-shadow:0 4px 24px rgba(59,130,246,.4);z-index:200;transition:transform .2s;display:flex;align-items:center;justify-content:center';
  fab.onclick=()=>openBookModal(null);
  document.body.appendChild(fab);

  try{MY_BOOKS=await api('GET','/api/books/mine');drawBooksGrid();}
  catch(e){toast(e.message,'error');}
}

function drawBooksGrid(){
  const g=$('bgrid');if(!g)return;
  if(!MY_BOOKS.length){g.innerHTML=`<div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;gap:10px;text-align:center"><div style="font-size:48px;opacity:.4">📖</div><div style="font-family:Fraunces,serif;font-size:20px;color:#111827">Sin libros aún</div><div style="font-size:13px;color:#6B7280">Toca el + para agregar</div></div>`;return;}
  g.innerHTML=MY_BOOKS.map(b=>`
    <div style="background:#FFFFFF;border:1px solid #BFDBFE;border-radius:14px;overflow:hidden">
      <div style="height:130px;background:${clr(b._id)};position:relative;overflow:hidden">
        ${b.photos?.[0]?`<img src="${esc(b.photos[0])}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`:`<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;text-align:center"><div style="font-family:Fraunces,serif;font-size:13px;font-weight:600;color:rgba(255,255,255,.9)">${esc(b.title)}</div><div style="font-size:11px;color:rgba(255,255,255,.6);margin-top:3px;font-style:italic">${esc(b.author)}</div></div>`}
      </div>
      <div style="padding:10px 12px">
        <div style="font-size:13px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.title)}</div>
        <div style="font-size:11px;color:#6B7280;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.author)}</div>
        <div style="display:flex;gap:6px">
          <button onclick="openBookModal('${b._id}')" style="flex:1;padding:7px 4px;border-radius:8px;font-size:11px;font-weight:500;border:1px solid #BFDBFE;color:#6B7280;background:#EFF6FF;cursor:pointer">Editar</button>
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
    <div id="bm" style="width:100%;background:#FFFFFF;border-radius:22px 22px 0 0;border:1px solid #BFDBFE;padding:8px 24px 36px;max-height:92vh;overflow-y:auto;transform:translateY(30px);transition:transform .25s">
      <div style="width:40px;height:4px;background:#93C5FD;border-radius:2px;margin:12px auto 20px"></div>
      <div style="font-family:Fraunces,serif;font-size:22px;font-weight:700;color:#111827;margin-bottom:20px">${editing?'Editar libro':'Agregar libro'}</div>
      ${bmField('Título *','bm-ti','text',book?.title||'')}
      ${bmField('Autor *','bm-au','text',book?.author||'')}
      <div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Género *</div>
        <select id="bm-ge" style="width:100%;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;appearance:none;box-sizing:border-box">
          ${GENRES.map(g=>`<option value="${g}" ${book?.genre===g?'selected':''}>${g}</option>`).join('')}
        </select></div>
      <div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Estado</div>
        <select id="bm-co" style="width:100%;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;appearance:none;box-sizing:border-box">
          ${['Nuevo','Bueno','Regular'].map(c=>`<option value="${c}" ${(book?.condition||'Bueno')===c?'selected':''}>${c}</option>`).join('')}
        </select></div>
      <div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Descripción</div>
        <textarea id="bm-de" rows="3" placeholder="Cuéntale algo..." style="width:100%;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;resize:none;box-sizing:border-box;line-height:1.5;font-family:inherit">${esc(book?.description||'')}</textarea></div>
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Fotos <span style="color:#D45A4A">*</span> <span style="font-size:10px;font-weight:400;text-transform:none">(mínimo 1)</span></div>
        <div style="display:flex;gap:10px">
          ${[0,1,2].map(i=>`<div id="ps${i}" onclick="bmPickSlot(${i})" style="flex:1;aspect-ratio:1;border-radius:10px;border:2px dashed #93C5FD;display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;position:relative;background:#EFF6FF">
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
      <button id="bm-save" onclick="bmSave()" style="width:100%;padding:14px;background:#3B82F6;color:#FFFFFF;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:8px">${editing?'Guardar cambios':'Agregar libro'}</button>
      <button onclick="bmClose()" style="width:100%;padding:12px;background:#DBEAFE;border:1px solid #BFDBFE;border-radius:10px;font-size:14px;color:#6B7280;cursor:pointer">Cancelar</button>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=>{ov.style.opacity='1';$('bm').style.transform='translateY(0)';});
  ov.addEventListener('click',e=>{if(e.target===ov)bmClose();});

  if(editing&&book.photos?.length)book.photos.slice(0,3).forEach((s,i)=>{if(s)bmFillSlot(i,s);});

  /* Guardar estado del modal en el propio objeto para evitar globals conflictivos */
  const state={photos,selColor,book,editing};

  window.bmPickSlot=i=>{activeSlot=i;$('bm-file').value='';$('bm-file').click();};
  window.bmRmSlot=(e,i)=>{e.stopPropagation();state.photos[i]=null;$('pi'+i).style.display='none';$('pp'+i).style.display='';$('pr'+i).style.display='none';$('ps'+i).style.borderColor='#93C5FD';$('ps'+i).style.borderStyle='dashed';};
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

function bmFillSlot(i,src){const img=$('pi'+i),ph=$('pp'+i),rm=$('pr'+i),sl=$('ps'+i);if(!img)return;img.src=src;img.style.display='block';ph.style.display='none';rm.style.display='block';sl.style.borderStyle='solid';sl.style.borderColor='#3B82F6';}
function bmField(label,id,type,val){return `<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${label}</div><input id="${id}" type="${type}" value="${esc(val)}" style="width:100%;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;box-sizing:border-box" onfocus="this.style.borderColor='#3B82F6'" onblur="this.style.borderColor='#BFDBFE'"/></div>`;}
async function compressImg(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>{const img=new Image();img.onload=()=>{const ratio=Math.min(900/img.width,900/img.height,1);const c=document.createElement('canvas');c.width=Math.round(img.width*ratio);c.height=Math.round(img.height*ratio);c.getContext('2d').drawImage(img,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.78));};img.onerror=rej;img.src=e.target.result;};r.onerror=rej;r.readAsDataURL(file);});}

/* ══════════════════════════════════════════════════
   MATCHES
   ══════════════════════════════════════════════════ */
async function showMatches(){
  setNav('nb-matches');
  if(!requireLogin())return;
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
    <div style="background:#FFFFFF;border:1px solid #BFDBFE;border-radius:14px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:12px;padding:16px 16px 12px">
        <button onclick="openPublicProfile('${m.matchedUser.id}')" style="width:48px;height:48px;border-radius:50%;background:#3B82F6;color:#FFFFFF;font-family:Fraunces,serif;font-size:18px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:none;overflow:hidden">${m.matchedUser.profilePhoto?`<img src="${esc(m.matchedUser.profilePhoto)}" style="width:100%;height:100%;object-fit:cover">`:ini(m.matchedUser.username)}</button>
        <div style="flex:1;min-width:0">
          <button onclick="openPublicProfile('${m.matchedUser.id}')" style="font-family:Fraunces,serif;font-size:17px;font-weight:700;color:#111827;border:none;background:transparent;padding:0;text-align:left">@${esc(m.matchedUser.username)}</button>
          ${m.matchedUser.location?`<div style="font-size:12px;color:#6B7280;margin-top:1px">📍 ${esc(m.matchedUser.location)}</div>`:''}
        </div>
        <span style="background:#3B82F6;color:#FFFFFF;border-radius:20px;padding:3px 10px;font-size:10px;font-weight:700">✓ Match</span>
      </div>
      <div style="display:flex;margin:0 16px 12px;background:#EFF6FF;border-radius:10px;border:1px solid #BFDBFE;overflow:hidden">
        <div style="flex:1;padding:12px 14px;border-right:1px solid #BFDBFE">
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
      <div style="margin:0 16px 10px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:10px;font-size:12px;color:#6B7280">
        Estado del intercambio: <strong style="color:#111827">${m.exchangeState?.label||'Coordinando'}</strong>
      </div>
      <div style="display:flex;gap:8px;padding:0 16px 16px">
        <button onclick="openChat(${i})" style="flex:1;padding:11px;background:#3B82F6;color:#FFFFFF;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">💬 Chat</button>
        <button onclick="confirmExchange(${i})" style="flex:1;padding:11px;background:#10B981;color:#FFFFFF;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">✅ Intercambiado</button>
      </div>
    </div>`).join('');
}


async function confirmExchange(idx){
  const m=MATCHES[idx];if(!m)return;
  if(!confirm('¿Confirmas que este intercambio ya se realizó?'))return;
  try{
    const r=await api('POST','/api/exchanges/confirm',{matchedUserId:m.matchedUser.id,myBookId:m.myBook.id,theirBookId:m.theirBook.id});
    toast(r.completed?'Intercambio completado y guardado en historial ✓':'Confirmación enviada. Falta que la otra persona confirme.','success');
    await loadNotifications();await showMatches();
  }catch(e){toast(e.message,'error');}
}


async function showChats(){
  setNav('nb-chats');
  if(!requireLogin())return;
  document.querySelector('.fab-btn')?.remove();
  setView(`<div style="padding:16px 20px 12px;display:flex;align-items:center;justify-content:space-between"><div><div style="font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#111827">Chats</div><div style="font-size:12px;color:#6B7280;margin-top:2px">Conversaciones con tus matches</div></div><button onclick="loadNotifications();showNotifications?.()" style="background:#EFF6FF;border:1px solid #BFDBFE;color:#3B82F6;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:800">🔔 ${NOTIFS?.unread||0}</button></div><div id="clist" style="padding:0 16px 80px;display:flex;flex-direction:column;gap:12px"><div style="display:flex;justify-content:center;padding:40px"><div class="spin"></div></div></div>`);
  try{MATCHES=await api('GET','/api/swipes/matches')||[];drawChats();}catch(e){toast(e.message,'error');}
}
function drawChats(){
  const c=$('clist');if(!c)return;
  if(!MATCHES.length){c.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:240px;gap:10px;text-align:center"><div style="font-size:48px;opacity:.45">💬</div><div style="font-family:Fraunces,serif;font-size:20px;color:#111827">Sin chats todavía</div><div style="font-size:13px;color:#6B7280">Cuando tengas matches, tus conversaciones aparecerán aquí.</div></div>`;return;}
  const myId=getCurrentUserId();
  c.innerHTML=MATCHES.map((m,i)=>{const r=roomId(myId,m.matchedUser.id);const unread=UNREAD[r]||0;return `<button onclick="openChat(${i})" style="width:100%;display:flex;align-items:center;gap:14px;background:#FFFFFF;border:1px solid #BFDBFE;border-radius:16px;padding:14px;text-align:left;box-shadow:0 8px 24px rgba(17,24,39,.04)"><div style="width:52px;height:52px;border-radius:50%;background:#3B82F6;color:#fff;font-family:Fraunces,serif;font-size:18px;font-weight:900;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">${m.matchedUser.profilePhoto?`<img src="${esc(m.matchedUser.profilePhoto)}" style="width:100%;height:100%;object-fit:cover">`:ini(m.matchedUser.username)}</div><div style="flex:1;min-width:0"><div style="font-family:Fraunces,serif;font-size:17px;font-weight:800;color:#111827">@${esc(m.matchedUser.username)}</div><div style="font-size:12px;color:#6B7280;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.myBook.title)} ⇄ ${esc(m.theirBook.title)}</div><div style="font-size:11px;color:#9CA3AF;margin-top:3px">${m.exchangeState?.label||'Coordinando intercambio'}</div></div>${unread?`<span style="background:#EF4444;color:#fff;border-radius:999px;min-width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900">${unread>9?'9+':unread}</span>`:''}</button>`}).join('');
}

async function showHistory(){
  setNav('nb-history');if(!requireLogin())return;
  document.querySelector('.fab-btn')?.remove();
  setView(`<div style="padding:16px 20px 12px;display:flex;align-items:center;justify-content:space-between">
    <div style="font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#111827">Historial</div>
    <button onclick="showNotifications()" style="position:relative;background:#EFF6FF;border:1px solid #BFDBFE;color:#3B82F6;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:700">🔔 <span>${NOTIFS?.unread||0}</span></button>
  </div><div id="hlist" style="padding:0 16px 80px;display:flex;flex-direction:column;gap:14px"><div style="display:flex;justify-content:center;padding:40px"><div class="spin"></div></div></div>`);
  try{HISTORY=await api('GET','/api/exchanges/history');drawHistory();}catch(e){toast(e.message,'error');}
}
function drawHistory(){
  const h=$('hlist');if(!h)return;
  if(!HISTORY.length){h.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:240px;gap:10px;text-align:center"><div style="font-size:48px;opacity:.45">📜</div><div style="font-family:Fraunces,serif;font-size:20px;color:#111827">Sin historial aún</div><div style="font-size:13px;color:#6B7280">Cuando ambos confirmen un intercambio aparecerá aquí.</div></div>`;return;}
  const myId=getCurrentUserId();
  h.innerHTML=HISTORY.map(x=>{const other=(String(x.requester?._id||x.requester?.id)===String(myId))?x.matchedUser:x.requester;return `<div style="background:#FFFFFF;border:1px solid #BFDBFE;border-radius:14px;padding:16px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><div style="width:44px;height:44px;border-radius:50%;background:#3B82F6;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;overflow:hidden">${other?.profilePhoto?`<img src="${esc(other.profilePhoto)}" style="width:100%;height:100%;object-fit:cover">`:ini(other?.username)}</div><div style="flex:1"><div style="font-family:Fraunces,serif;font-size:17px;font-weight:700;color:#111827">@${esc(other?.username||'Usuario')}</div><div style="font-size:12px;color:#6B7280">${levelEmoji(other?.level)} ${esc(other?.level||'Aficionado')} · ${other?.completedExchanges||0} intercambios</div></div><span style="background:#DCFCE7;color:#166534;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700">Completado</span></div>
    <div style="display:flex;gap:8px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:12px"><div style="flex:1"><div style="font-size:9px;color:#9CA3AF;font-weight:800;text-transform:uppercase">Tu libro</div><div style="font-weight:700;color:#111827;font-size:13px">${esc(x.myBook?.title||'—')}</div><div style="font-size:11px;color:#6B7280">${esc(x.myBook?.author||'')}</div></div><div style="font-size:20px;color:#3B82F6;display:flex;align-items:center">⇄</div><div style="flex:1;text-align:right"><div style="font-size:9px;color:#9CA3AF;font-weight:800;text-transform:uppercase">Recibido</div><div style="font-weight:700;color:#111827;font-size:13px">${esc(x.theirBook?.title||'—')}</div><div style="font-size:11px;color:#6B7280">${esc(x.theirBook?.author||'')}</div></div></div>
    <div style="font-size:11px;color:#9CA3AF;margin-top:10px">Fecha: ${new Date(x.completedAt||x.updatedAt).toLocaleDateString('es-CL')}</div></div>`}).join('');
}
async function showNotifications(){
  setView(`<div style="padding:16px 20px 12px;display:flex;align-items:center;justify-content:space-between"><div style="font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#111827">Notificaciones</div><button onclick="showHistory()" style="background:#EFF6FF;border:1px solid #BFDBFE;color:#6B7280;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:700">Volver</button></div><div id="nlist" style="padding:0 16px 80px;display:flex;flex-direction:column;gap:10px"><div class="spin"></div></div>`);
  try{await loadNotifications();await api('PUT','/api/notifications/read');const n=$('nlist');if(!NOTIFS.items.length)n.innerHTML='<div style="text-align:center;color:#6B7280;padding:40px">No tienes notificaciones.</div>';else n.innerHTML=NOTIFS.items.map(it=>`<div style="background:${it.read?'#FFFFFF':'#EFF6FF'};border:1px solid #BFDBFE;border-radius:12px;padding:14px"><div style="font-weight:800;color:#111827;font-size:14px">${esc(it.title)}</div><div style="font-size:13px;color:#6B7280;margin-top:3px">${esc(it.body||'')}</div><div style="font-size:10px;color:#9CA3AF;margin-top:6px">${new Date(it.createdAt).toLocaleString('es-CL')}</div></div>`).join('');NOTIFS.unread=0;updateNotificationBadge();}catch(e){toast(e.message,'error');}
}

/* ══════════════════════════════════════════════════
   CHAT
   ══════════════════════════════════════════════════ */
function openChat(idx){
  const m=MATCHES[idx];if(!m)return;
  window.__CHAT_OPEN__=true;
  const navChat=$('nav');if(navChat)navChat.style.setProperty('display','none','important');
  const myId=(ME?._id||ME?.id||'').toString();
  const room=roomId(myId,m.matchedUser.id);
  delete UNREAD[room];updateBadge();if($('clist'))drawChats();

  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);z-index:1000002;display:flex;align-items:flex-end;opacity:0;transition:opacity .25s;max-width:480px;left:50%;transform:translateX(-50%)';
  ov.innerHTML=`
    <div id="cp" style="width:100%;height:min(88vh,calc(100vh - 24px));background:#FFFFFF;border-radius:22px 22px 0 0;border:1px solid #BFDBFE;display:flex;flex-direction:column;transform:translateY(40px);transition:transform .25s">
      <div style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #BFDBFE;flex-shrink:0;position:relative">
        <div style="position:absolute;top:10px;left:50%;transform:translateX(-50%);width:36px;height:4px;background:#93C5FD;border-radius:2px"></div>
        <div style="width:38px;height:38px;border-radius:50%;background:#3B82F6;color:#FFFFFF;font-family:Fraunces,serif;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center">${ini(m.matchedUser.username)}</div>
        <div style="flex:1"><div style="font-size:15px;font-weight:600;color:#111827">@${esc(m.matchedUser.username)}</div></div>
        ${tab==='login'?`
          <button type="button" onclick="showForgotPassword()"
            style="width:100%;background:rgba(255,255,255,.88);border:1px solid rgba(255,255,255,.75);color:#1D4ED8;border-radius:12px;padding:11px 12px;font-size:13px;font-weight:900;margin:0 0 12px;cursor:pointer;text-decoration:none;box-shadow:0 8px 24px rgba(17,24,39,.12)">
            ¿Olvidaste tu contraseña?
          </button>
        `:''}
        <button id="chat-close-btn" style="width:32px;height:32px;border-radius:50%;background:#EFF6FF;color:#6B7280;border:none;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center">✕</button>
      </div>
      <div id="cmsgs" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;scrollbar-width:none">
        <div style="display:flex;justify-content:center;padding:20px"><div class="spin"></div></div>
      </div>
      <div style="display:flex;gap:10px;padding:12px 16px max(18px,env(safe-area-inset-bottom));border-top:1px solid #BFDBFE;background:#EFF6FF;flex-shrink:0;position:relative;z-index:2">
        <textarea id="cin2" rows="1" placeholder="Escribe un mensaje..."
          style="flex:1;background:#FFFFFF;border:1px solid #BFDBFE;border-radius:22px;padding:10px 16px;font-size:14px;color:#111827;outline:none;resize:none;max-height:100px;line-height:1.4;font-family:inherit"
          onfocus="this.style.borderColor='#3B82F6'" onblur="this.style.borderColor='#BFDBFE'"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px'"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();chatSend2()}"></textarea>
        <button onclick="chatSend2()" style="width:42px;height:42px;border-radius:50%;background:#3B82F6;color:#FFFFFF;border:none;cursor:pointer;font-size:18px;align-self:flex-end;flex-shrink:0">➤</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=>{ov.style.opacity='1';$('cp').style.transform='translateY(0)';});

  const closeChat=()=>{ov.style.opacity='0';$('cp').style.transform='translateY(40px)';setTimeout(()=>{ov.remove();window._cRoom=null;window.__CHAT_OPEN__=false;if(typeof forceShowNav==='function')forceShowNav();},280);};
  $('chat-close-btn').onclick=closeChat;
  ov.addEventListener('click',e=>{if(e.target===ov)closeChat();});

  window._cRoom=room;window._cMyId=myId;
  if (SOCKET?.connected) {
    SOCKET.emit('join-chat', room, (res) => {
      if (!res?.ok) console.warn('No se pudo unir a la sala:', res?.error);
    });
  }

  window.chatSend2 = () => {
    const i = $('cin2');
    const t = i?.value?.trim();

    if (!t) return;

    i.value = '';
    i.style.height = 'auto';

    const clientId = 'msg_' + Date.now() + '_' + Math.random().toString(16).slice(2);

    const tempMsg = {
      _id: clientId,
      clientId,
      roomId: room,
      text: t,
      createdAt: new Date().toISOString(),
      sender: window._cMyId,
      pending: true
    };

    appendMsg2(tempMsg);

    if (!SOCKET?.connected) {
      toast('Chat reconectando. Intenta nuevamente.', 'error');
      return;
    }

    SOCKET.timeout(5000).emit(
      'send-message',
      { roomId: room, text: t, clientId },
      (err, response) => {
        if (err || !response?.ok) {
          toast(response?.error || 'No se pudo enviar el mensaje', 'error');
          return;
        }
      }
    );
  };

  api('GET','/api/chat/'+room).then(msgs=>{
    const b=$('cmsgs');if(!b)return;
    if(!msgs?.length){b.innerHTML='<div style="text-align:center;color:#9CA3AF;font-size:13px;padding:20px">¡Empieza la conversación!</div>';return;}
    b.innerHTML='';msgs.forEach(appendMsg2);
  }).catch(()=>{const b=$('cmsgs');if(b)b.innerHTML='<div style="text-align:center;color:#9CA3AF;font-size:13px;padding:20px">Empieza la conversación.</div>';});
}

function appendMsg2(msg){
  const b = $('cmsgs');
  if (!b) return;

  const mid = msg.clientId || msg._id;

  if (mid && b.querySelector(`[data-mid="${String(mid)}"]`)) {
    return;
  }

  const mine = (msg.sender?._id || msg.sender?.id || msg.sender)?.toString() === (window._cMyId || '').toString();

  const el = document.createElement('div');
  el.dataset.mid = String(mid || Date.now() + Math.random());

  el.style.cssText = `max-width:78%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.4;word-break:break-word;align-self:${mine?'flex-end':'flex-start'};${mine?'background:#3B82F6;color:#FFFFFF;border-bottom-right-radius:4px':'background:#DBEAFE;color:#111827;border:1px solid #BFDBFE;border-bottom-left-radius:4px'}`;

  el.innerHTML = `<div>${esc(msg.text)}</div><div style="font-size:10px;opacity:.6;margin-top:3px;${mine?'text-align:right':''}">${fmtT(msg.createdAt || new Date())}</div>`;

  b.appendChild(el);
  b.scrollTop = b.scrollHeight;
}

/* ══════════════════════════════════════════════════
   PERFIL
   ══════════════════════════════════════════════════ */
async function showProfile(){
  setNav('nb-profile');
  if(!requireLogin())return;
  document.querySelector('.fab-btn')?.remove();
  setView(`<div style="display:flex;justify-content:center;padding:60px"><div class="spin"></div></div>`);
  try{
    const u=await api('GET','/api/users/me');rememberUser({...ME,...u});
    let sg=[...(u.favoriteGenres||[])];
    setView(`
      <div style="padding:0 16px 80px">
        <div style="font-family:'Fraunces',serif;font-size:26px;font-weight:700;color:#111827;padding:16px 0 12px">Mi Perfil</div>
        <div style="background:#FFFFFF;border:1px solid #BFDBFE;border-radius:14px;padding:20px;margin-bottom:20px;display:flex;align-items:center;gap:16px">
          <div style="width:64px;height:64px;border-radius:50%;background:#3B82F6;color:#FFFFFF;font-family:Fraunces,serif;font-size:22px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">${u.profilePhoto?`<img src="${esc(u.profilePhoto)}" style="width:100%;height:100%;object-fit:cover">`:ini(u.username)}</div>
          <div>
            <div style="font-family:Fraunces,serif;font-size:20px;font-weight:700;color:#111827">@${esc(u.username)}</div>
            <div style="font-size:13px;color:#6B7280;margin-top:2px">${esc(u.email)}</div>
            <div style="display:flex;gap:16px;margin-top:8px">
              <div><div style="font-size:18px;font-weight:600;color:#3B82F6">${u.totalBooks||0}</div><div style="font-size:11px;color:#6B7280">Libros</div></div>
              <div><div style="font-size:18px;font-weight:600;color:#3B82F6">${MATCHES.length}</div><div style="font-size:11px;color:#6B7280">Matches</div></div><div><div style="font-size:18px;font-weight:600;color:#3B82F6">${u.completedExchanges||0}</div><div style="font-size:11px;color:#6B7280">Intercambios</div></div>
            </div>
          </div>
        </div>
        <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:14px;padding:14px;margin-bottom:16px">
          <div style="font-size:11px;font-weight:800;color:#9CA3AF;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">Nivel de usuario</div>
          ${(()=>{const p=u.levelProgress||nextLevelInfo(u.completedExchanges);return `<div style="font-family:Fraunces,serif;font-size:20px;font-weight:800;color:#111827">${levelEmoji(u.level)} ${esc(u.level||levelFor(u.completedExchanges))}</div><div style="font-size:12px;color:#6B7280;margin-top:3px">${u.completedExchanges||0} intercambios realizados · ${p.next?`faltan ${p.remaining} para ${p.next}`:'nivel máximo alcanzado'} · Verificación: ${esc(u.verificationStatus||'pending')}</div><div style="height:10px;background:#DBEAFE;border-radius:999px;overflow:hidden;margin-top:10px"><div style="height:100%;width:${Math.max(0,Math.min(100,p.percent||0))}%;background:#3B82F6;border-radius:999px"></div></div>`})()}
        </div>
        <div style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Foto de rostro / perfil</div><div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:12px;margin-bottom:16px"><input type="file" id="pf-file" accept="image/*" style="width:100%;font-size:13px;color:#6B7280"><div style="font-size:11px;color:#9CA3AF;margin-top:8px">Sube una foto clara de tu rostro. Quedará pendiente de verificación.</div></div>
        <div style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Sobre mí</div>
        <textarea id="pb" rows="3" placeholder="Cuéntale a otros qué tipo de lector eres..." style="width:100%;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;resize:none;margin-bottom:12px;box-sizing:border-box;line-height:1.5;font-family:inherit">${esc(u.bio||'')}</textarea>
        <input id="pl" type="text" value="${esc(u.location||'')}" placeholder="Ej: Concepción, Chile"
          style="width:100%;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:13px 16px;font-size:15px;color:#111827;outline:none;margin-bottom:20px;box-sizing:border-box"
          onfocus="this.style.borderColor='#3B82F6'" onblur="this.style.borderColor='#BFDBFE'">
        <div style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Géneros favoritos</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">
          ${GENRES.map(g=>`<button onclick="pgToggle('${esc(g)}')" id="pg-${esc(g)}"
            style="padding:7px 14px;border-radius:20px;font-size:12px;cursor:pointer;border:1px solid;transition:all .15s;
            ${sg.includes(g)?'background:rgba(59,130,246,.12);border-color:rgba(59,130,246,.35);color:#3B82F6':'background:#EFF6FF;border-color:#BFDBFE;color:#6B7280'}">${g}</button>`).join('')}
        </div>
        <button id="psave" onclick="pgSave()" style="width:100%;padding:14px;background:#3B82F6;color:#FFFFFF;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:12px">Guardar cambios</button>
        ${IS_ADMIN?`${IS_ADMIN?`<button onclick="window.location.href='/admin'" style="width:100%;padding:14px;background:#111827;color:#FFFFFF;border:none;border-radius:12px;font-size:14px;font-weight:800;cursor:pointer;margin-bottom:10px">⚙️ Abrir panel admin</button>`:''}`:''}
        <button onclick="doLogout()" style="width:100%;padding:14px;background:transparent;border:1px solid #BFDBFE;border-radius:12px;font-size:14px;color:#6B7280;cursor:pointer">Cerrar sesión</button>
      </div>`);
    window._pg=sg;
    window.pgToggle=g=>{const has=window._pg.includes(g);if(has)window._pg=window._pg.filter(x=>x!==g);else window._pg.push(g);const btn=$('pg-'+g);if(!btn)return;const on=window._pg.includes(g);btn.style.background=on?'rgba(59,130,246,.12)':'#EFF6FF';btn.style.borderColor=on?'rgba(59,130,246,.35)':'#BFDBFE';btn.style.color=on?'#3B82F6':'#6B7280';};
    window.pgSave=async()=>{const btn=$('psave');btn.disabled=true;btn.textContent='Guardando...';try{let profilePhoto;const file=$('pf-file')?.files?.[0];if(file)profilePhoto=await compressImg(file);const payload={bio:$('pb').value.trim(),location:$('pl').value.trim(),favoriteGenres:window._pg};if(profilePhoto)payload.profilePhoto=profilePhoto;const updated=await api('PUT','/api/users/me',payload);rememberUser({...ME,...updated});toast('Perfil actualizado ✓','success');showProfile();}catch(e){toast(e.message,'error');}finally{btn.disabled=false;btn.textContent='Guardar cambios';}};
  }catch(e){toast(e.message,'error');}
}

/* ── Match Modal ────────────────────────────────── */
function showMatchModal(match){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);z-index:700;display:flex;align-items:flex-end;opacity:0;transition:opacity .25s;max-width:480px;left:50%;transform:translateX(-50%)';
  const close=()=>{ov.style.opacity='0';setTimeout(()=>ov.remove(),280);};
  ov.innerHTML=`
    <div id="mmb" style="width:100%;background:#FFFFFF;border-radius:22px 22px 0 0;border:1px solid #BFDBFE;padding:40px 24px 36px;text-align:center;transform:translateY(30px);transition:transform .25s">
      <div style="font-size:68px;line-height:1;margin-bottom:16px;animation:matchPop .5s ease">🎉</div>
      <div style="font-family:Fraunces,serif;font-size:28px;font-weight:700;color:#3B82F6;margin-bottom:8px">¡Es un Match!</div>
      <div style="font-size:14px;color:#6B7280;margin-bottom:24px;line-height:1.5">Tú y <strong style="color:#111827">@${esc(match.matchedUser.username)}</strong> quieren intercambiar libros</div>
      <div style="display:flex;align-items:center;gap:12px;background:#EFF6FF;border-radius:14px;padding:16px;margin-bottom:20px;text-align:left">
        <div style="flex:1"><div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px">Tu libro</div><div style="font-family:Fraunces,serif;font-size:15px;font-weight:600;color:#111827;margin-top:3px">${esc(match.myBook.title)}</div><div style="font-size:12px;color:#6B7280">${esc(match.myBook.author)}</div></div>
        <span style="font-size:22px;color:#3B82F6">⇄</span>
        <div style="flex:1;text-align:right"><div style="font-size:10px;color:#9CA3AF;text-transform:uppercase;letter-spacing:.5px">Su libro</div><div style="font-family:Fraunces,serif;font-size:15px;font-weight:600;color:#111827;margin-top:3px">${esc(match.theirBook.title)}</div><div style="font-size:12px;color:#6B7280">${esc(match.theirBook.author)}</div></div>
      </div>
      <button id="mm-ver" style="width:100%;padding:14px;background:#3B82F6;color:#FFFFFF;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:10px">💬 Ver Matches</button>
      <button id="mm-cont" style="width:100%;padding:12px;background:#DBEAFE;border:1px solid #BFDBFE;border-radius:10px;font-size:14px;color:#6B7280;cursor:pointer">Seguir explorando</button>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(()=>{ov.style.opacity='1';$('mmb').style.transform='translateY(0)';});
  $('mm-ver').onclick=()=>{close();showMatches();};
  $('mm-cont').onclick=close;
  ov.addEventListener('click',e=>{if(e.target===ov)close();});
}

/* ── Socket.io ──────────────────────────────────── */
function initSocket(){
  try {
    if (typeof io === 'undefined') {
      console.warn('Socket.IO cliente no cargado');
      return;
    }

    if (SOCKET?.connected) return;

    SOCKET = io(window.location.origin, {
      auth: { token: TOKEN },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 8000
    });

    SOCKET.on('connect', () => {
      console.log('🟢 Socket conectado:', SOCKET.id);

      if (window._cRoom) {
        SOCKET.emit('join-chat', window._cRoom);
      }
    });

    SOCKET.on('disconnect', (reason) => {
      console.log('🔴 Socket desconectado:', reason);
    });

    SOCKET.on('connect_error', (err) => {
      console.warn('Socket.IO error:', err?.message || err);
    });

    SOCKET.on('new-message', (msg) => {
      const myId = (ME?._id || ME?.id || '').toString();
      const senderId = (msg.sender?._id || msg.sender?.id || msg.sender || '').toString();

      if (!senderId) return;

      const r = msg.roomId || roomId(myId, senderId);

      if (window._cRoom === r) {
        appendMsg2(msg);
      } else {
        UNREAD[r] = (UNREAD[r] || 0) + 1;
        updateBadge();
        const senderName=msg.sender?.username||'Nuevo mensaje';
        showPopNotification('💬 '+senderName, msg.text||'Tienes un nuevo mensaje', ()=>showChats());
        loadNotifications();
      }
    });

    SOCKET.on('message-error', (data) => {
      toast(data?.error || 'Error al enviar mensaje', 'error');
    });
    SOCKET.on('notification-update',async(data)=>{
      const before=NOTIFS?.unread||0;
      await loadNotifications();
      const after=NOTIFS?.unread||0;
      if(after>before)showPopNotification('🔔 Nueva notificación','Tienes una nueva actividad en BookTrade',()=>showNotifications());
    });

  } catch (err) {
    console.warn('Socket.IO desactivado:', err?.message || err);
  }
}

/* ══════════════════════════════════════════════════
   ARRANCAR
   ══════════════════════════════════════════════════ */
/* Arrancar */
forceShowNav();
const navEl=$('nav');
if(navEl)navEl.style.display='flex';
const viewEl=$('view');
if(viewEl)viewEl.style.bottom='68px';

if(TOKEN){launchApp();}else{showAuth('login');}
setInterval(forceShowNav,1000);

window.showForgotPassword=showForgotPassword;
window.sendForgotPassword=sendForgotPassword;
