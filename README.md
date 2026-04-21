# 📚 BookSwipe

**Tinder para libros** — Desliza, conecta e intercambia libros con personas cercanas.

---

## ✨ Características

- 🔐 **Autenticación** — Registro y login con email/usuario + contraseña
- 📖 **Gestión de libros** — Agrega, edita y elimina tus libros disponibles
- 👆 **Swipe** — Desliza los libros de otros usuarios (drag táctil/mouse)
- 💚 **Matches** — Cuando dos personas se interesan mutuamente en sus libros
- 🖼️ **Portadas automáticas** — Carga portadas desde Open Library API
- 📱 **PWA-ready** — Funciona en móvil como app nativa

---

## 🗂 Estructura del proyecto

```
bookswipe/
├── backend/          ← API Node.js/Express (Railway)
│   ├── models/       ← Mongoose schemas
│   ├── routes/       ← Endpoints REST
│   ├── middleware/   ← JWT auth
│   ├── server.js
│   └── package.json
└── frontend/         ← SPA estática (Vercel)
    ├── index.html
    └── app.js
```

---

## 🚀 Deploy paso a paso

### 1. Subir a GitHub

```bash
git init
git add .
git commit -m "feat: BookSwipe inicial"
git remote add origin https://github.com/TU_USUARIO/bookswipe.git
git push -u origin main
```

---

### 2. Backend → Railway

1. Ir a [railway.app](https://railway.app) y crear cuenta
2. **New Project → Deploy from GitHub repo**
3. Seleccionar tu repo, elegir la carpeta **`backend/`**
4. En la pestaña **Variables**, agregar:

| Variable | Valor |
|----------|-------|
| `MONGODB_URI` | Tu string de MongoDB Atlas |
| `JWT_SECRET` | Una cadena larga y aleatoria |
| `FRONTEND_URL` | URL de Vercel (la agregas después) |

5. Railway genera una URL tipo: `https://bookswipe-backend.up.railway.app`

---

### 3. Frontend → Vercel

1. Ir a [vercel.com](https://vercel.com)
2. **New Project → Import Git Repository**
3. Seleccionar tu repo, en **Root Directory** poner `frontend`
4. En **Environment Variables** o editando `app.js`, cambiar la línea:
   ```js
   : 'https://TU_URL_RAILWAY.railway.app' // ← PON AQUÍ LA URL DE RAILWAY
   ```

5. Hacer deploy. Vercel genera: `https://bookswipe.vercel.app`

6. Volver a Railway y actualizar `FRONTEND_URL` con la URL de Vercel

---

### 4. MongoDB Atlas

1. Ir a [mongodb.com/cloud/atlas](https://mongodb.com/cloud/atlas)
2. Crear cluster gratuito (M0)
3. Crear usuario de base de datos
4. En **Network Access** → Add IP → `0.0.0.0/0` (para Railway)
5. Copiar el Connection String y usarlo en `MONGODB_URI`

---

## 🛠 Desarrollo local

```bash
# Backend
cd backend
cp .env.example .env
# Editar .env con tus variables reales
npm install
npm run dev

# Frontend (en otro terminal o simplemente abrir index.html)
cd frontend
# Abrir index.html en el navegador
# O usar Live Server de VSCode
```

---

## 🔗 API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/register` | Crear cuenta |
| POST | `/api/auth/login` | Iniciar sesión |
| GET | `/api/users/me` | Mi perfil |
| PUT | `/api/users/me` | Actualizar perfil |
| GET | `/api/books/discover` | Libros para descubrir |
| GET | `/api/books/mine` | Mis libros |
| POST | `/api/books` | Agregar libro |
| PUT | `/api/books/:id` | Editar libro |
| DELETE | `/api/books/:id` | Eliminar libro |
| POST | `/api/swipes` | Registrar swipe |
| GET | `/api/swipes/matches` | Ver mis matches |

---

## 🔮 Próximas mejoras

- [ ] Chat en tiempo real entre matches (Socket.io)
- [ ] Filtrar por género / ciudad
- [ ] Subir fotos reales de portadas (Cloudinary)
- [ ] Notificaciones push
- [ ] Sistema de reseñas de intercambios
- [ ] Multi-idioma

---

## 🧑‍💻 Stack

- **Backend**: Node.js, Express, MongoDB Atlas, Mongoose, JWT, bcryptjs
- **Frontend**: HTML5, CSS3, Vanilla JS (sin frameworks)
- **Deploy**: Railway (backend) + Vercel (frontend)
- **Covers**: Open Library API (gratuita, sin key)
