# 📚 BookSwipe

**Tinder para libros** — Desliza, conecta e intercambia libros con personas cercanas.

---

## ✨ Características

- 🔐 **Autenticación** — Registro y login con email/usuario + contraseña
- 📖 **Gestión de libros** — Agrega, edita y elimina tus libros disponibles
- 👆 **Swipe** — Desliza los libros de otros usuarios (drag táctil y mouse)
- 💚 **Matches** — Cuando dos personas se interesan mutuamente en sus libros
- 🖼️ **Portadas automáticas** — Carga portadas desde Open Library API
- 📱 **PWA-ready** — Funciona en móvil como app nativa

---

## 🗂 Estructura del proyecto

```
bookswipe/
├── .gitignore
├── README.md
│
├── backend/
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   ├── server.js
│   │
│   ├── middleware/
│   │   └── auth.js
│   │
│   ├── models/
│   │   ├── Book.js
│   │   ├── Swipe.js
│   │   └── User.js
│   │
│   └── routes/
│       ├── auth.js
│       ├── books.js
│       ├── swipes.js
│       └── users.js
│
└── frontend/
    ├── app.js
    └── index.html
```

**Total: 15 archivos — 6 carpetas**

> El backend sirve el frontend como archivos estáticos. Un solo deploy, una sola URL para todo.

---

## 🚀 Deploy en Render (recomendado — gratis)

### 1. Crear cuenta en MongoDB Atlas

1. Ir a [mongodb.com/cloud/atlas](https://mongodb.com/cloud/atlas) y crear cuenta
2. Crear un cluster gratuito **M0**
3. En **Database Access** → crear usuario con contraseña
4. En **Network Access** → Add IP → `0.0.0.0/0`
5. En **Connect** → Drivers → copiar el Connection String

El string tiene este formato:
```
mongodb+srv://usuario:clave@cluster0.xxxxx.mongodb.net/bookswipe?retryWrites=true&w=majority
```

---

### 2. Subir el proyecto a GitHub

```bash
git init
git add .
git commit -m "feat: BookSwipe inicial"
git remote add origin https://github.com/TU_USUARIO/bookswipe.git
git push -u origin main
```

---

### 3. Deploy en Render

1. Ir a [render.com](https://render.com) y crear cuenta con GitHub
2. Click en **New +** → **Web Service**
3. Conectar el repositorio de GitHub
4. Configurar el servicio:

| Campo | Valor |
|---|---|
| **Name** | bookswipe |
| **Root Directory** | `backend` |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |

5. En la sección **Environment Variables**, agregar:

| Variable | Valor |
|---|---|
| `MONGODB_URI` | Tu connection string de MongoDB Atlas |
| `JWT_SECRET` | Una cadena larga y aleatoria (mínimo 32 caracteres) |

6. Click en **Create Web Service**

Render genera una URL tipo `https://bookswipe.onrender.com`. Esa URL sirve tanto el frontend como la API — no necesitas nada más.

> **Nota:** El free tier de Render duerme el servicio tras 15 minutos sin tráfico y tarda ~30 segundos en despertar la primera vez. Para uso personal es suficiente. El plan mínimo de pago son USD $7/mes si necesitas que esté siempre activo.

---

## 🛠 Desarrollo local

```bash
# 1. Instalar dependencias del backend
cd backend
npm install

# 2. Crear archivo .env a partir del ejemplo
cp .env.example .env
# Editar .env con tus variables reales (MONGODB_URI y JWT_SECRET)

# 3. Arrancar el servidor
npm run dev

# El servidor corre en http://localhost:4000
# El frontend se sirve automáticamente desde la misma URL
```

---

## 🔗 API Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Crear cuenta |
| POST | `/api/auth/login` | No | Iniciar sesión |
| GET | `/api/users/me` | Sí | Mi perfil |
| PUT | `/api/users/me` | Sí | Actualizar perfil |
| GET | `/api/books/discover` | Sí | Libros para descubrir |
| GET | `/api/books/mine` | Sí | Mis libros |
| POST | `/api/books` | Sí | Agregar libro |
| PUT | `/api/books/:id` | Sí | Editar libro |
| DELETE | `/api/books/:id` | Sí | Eliminar libro |
| POST | `/api/swipes` | Sí | Registrar swipe |
| GET | `/api/swipes/matches` | Sí | Ver mis matches |
| GET | `/api/health` | No | Estado del servidor |

---

## 🔮 Próximas mejoras

- [ ] Chat en tiempo real entre matches (Socket.io)
- [ ] Filtrar libros por género y ciudad
- [ ] Subir fotos reales de portadas (Cloudinary)
- [ ] Notificaciones push
- [ ] Sistema de reseñas de intercambios

---

## 🧑‍💻 Stack

- **Backend:** Node.js, Express, MongoDB Atlas, Mongoose, JWT, bcryptjs
- **Frontend:** HTML5, CSS3, Vanilla JS (sin frameworks, sin build tools)
- **Deploy:** Render (frontend + backend juntos)
- **Portadas:** Open Library API (gratuita, sin API key)
