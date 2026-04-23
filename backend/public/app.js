'use strict';

const API = '';
let TOKEN = localStorage.getItem('bs_token') || '';
let ME = null, MY_BOOKS = [];

/* UTIL */
const $ = id => document.getElementById(id);

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = 'Bearer ' + TOKEN;

  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
}

function toast(msg) {
  alert(msg);
}

async function doLogin() {
  const id = $('fi')?.value;
  const pw = $('fp')?.value;
  if (!id || !pw) return toast('Completa todo');

  const d = await api('POST', '/api/auth/login', {
    identifier: id,
    password: pw
  });

  TOKEN = d.token;
  localStorage.setItem('bs_token', TOKEN);
  launchApp();
}

async function launchApp() {
  try {
    ME = await api('GET', '/api/users/me');
    showBooks();
  } catch {
    localStorage.removeItem('bs_token');
  }
}

async function showBooks() {
  const view = $('view');

  view.innerHTML = `
    <h2>Mis Libros</h2>
    <button onclick="openModal()">Agregar libro</button>
    <div id="list"></div>
  `;

  MY_BOOKS = await api('GET', '/api/books/mine');

  $('list').innerHTML = MY_BOOKS.map(b => `
    <div>
      <b>${b.title}</b><br>${b.author}
    </div>
  `).join('');
}

function openModal() {
  const modal = document.createElement('div');

  modal.innerHTML = `
    <div style="background:white;padding:20px">
      <input id="title" placeholder="Título"><br>
      <input id="author" placeholder="Autor"><br>
      <input id="file" type="file" accept="image/*"><br>
      <button onclick="saveBook()">Guardar</button>
    </div>
  `;

  document.body.appendChild(modal);
}

async function saveBook() {
  const title = $('title')?.value;
  const author = $('author')?.value;
  const file = $('file')?.files?.[0];

  if (!title || !author) return toast('Faltan datos');

  let photo = null;
  if (file) photo = await toBase64(file);

  try {
    await api('POST', '/api/books', {
      title,
      author,
      photos: photo ? [photo] : [],
      owner: ME._id || ME.id,
      ownerId: ME._id || ME.id
    });

    toast('Libro agregado');
    showBooks();
  } catch (e) {
    toast(e.message);
  }
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

if (TOKEN) launchApp();
