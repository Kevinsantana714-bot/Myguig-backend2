const cloudinary = require('cloudinary').v2;

const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
const api_key    = process.env.CLOUDINARY_API_KEY;
const api_secret = process.env.CLOUDINARY_API_SECRET;

if (!cloud_name || !api_key || !api_secret) {
  console.warn('[cloudinary] ATENÇÃO: variáveis de ambiente Cloudinary em falta!');
  console.warn('  CLOUDINARY_CLOUD_NAME:', cloud_name ? 'OK' : 'MISSING');
  console.warn('  CLOUDINARY_API_KEY:',    api_key    ? 'OK' : 'MISSING');
  console.warn('  CLOUDINARY_API_SECRET:', api_secret ? 'OK' : 'MISSING');
}

cloudinary.config({ cloud_name, api_key, api_secret });

module.exports = cloudinary;
