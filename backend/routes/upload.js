const express = require('express');
const auth = require('../middleware/auth');

const router = express.Router();

let cloudinary = null;

try {
  cloudinary = require('cloudinary').v2;
} catch (err) {
  console.warn('⚠️ Cloudinary SDK no instalado. Ejecuta npm install cloudinary');
}

function ensureCloudinary() {
  if (!cloudinary) {
    throw new Error('Cloudinary SDK no instalado');
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary no configurado. Faltan CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY o CLOUDINARY_API_SECRET');
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });

  return cloudinary;
}

/*
  POST /api/upload/image
  Body:
  {
    image: "data:image/jpeg;base64,...",
    folder: "books" | "profiles"
  }

  Seguridad:
  - Requiere token JWT.
  - El API secret queda solo en backend.
  - Se valida que sea data:image.
  - Se limita el tamaño aproximado del base64.
*/
router.post('/image', auth, async (req, res) => {
  try {
    const { image, folder } = req.body;

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Imagen requerida' });
    }

    if (!image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Formato de imagen inválido' });
    }

    // El cliente comprime antes de subir. Este límite evita abusos o imágenes sin comprimir.
    // 6.5MB en base64 equivale aproximadamente a 4.8MB binarios, suficiente para imágenes ya optimizadas.
    if (image.length > 6_500_000) {
      return res.status(413).json({ error: 'Imagen demasiado grande después de comprimir. Intenta con otra foto.' });
    }

    const safeFolder = ['books', 'profiles'].includes(folder) ? folder : 'misc';
    const cld = ensureCloudinary();

    const result = await cld.uploader.upload(image, {
      folder: `booktrade/${safeFolder}`,
      resource_type: 'image',
      overwrite: false,
      unique_filename: true,
      use_filename: false,
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto:good', fetch_format: 'auto' }
      ],
      context: {
        userId: String(req.userId)
      }
    });

    res.json({
      ok: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      format: result.format
    });
  } catch (err) {
    console.error('POST /api/upload/image error:', err.message);
    res.status(500).json({
      error: err.message || 'No se pudo subir la imagen'
    });
  }
});

module.exports = router;
