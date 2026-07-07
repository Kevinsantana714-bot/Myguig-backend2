const cloudinary = require('./cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'myguig/covers',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 1200, height: 400, crop: 'fill', gravity: 'auto' }],
  },
});

module.exports = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB (igual ao limite do frontend)
});
