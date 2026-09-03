const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { put, del } = require('@vercel/blob');
const { authenticateAdmin } = require('../middleware/auth');
const { serverError } = require('../utils/response');

// Multer uses memory storage so the file Buffer is available for the @vercel/blob
// SDK (or for a local-disk fallback when BLOB_READ_WRITE_TOKEN is not configured).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

const isVercel = process.env.VERCEL === '1';

// Whether Vercel Blob is configured is decided lazily so tests can flip
// BLOB_READ_WRITE_TOKEN between cases without reloading this module.
function isBlobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

// Local-disk fallback (development only). On Vercel, the filesystem is
// read-only except /tmp, so we only use local disk when not on Vercel.
const uploadsDir = isVercel ? '/tmp' : path.join(__dirname, '../uploads');

function buildFilename(originalname) {
  const ext = path.extname(originalname) || '';
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}

// Upload a single image. Admin-only.
router.post('/image', authenticateAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const filename = buildFilename(req.file.originalname);

    if (isBlobEnabled()) {
      try {
        const blob = await put(filename, req.file.buffer, {
          access: 'public',
          contentType: req.file.mimetype,
          addRandomSuffix: false,
        });
        return res.json({
          success: true,
          message: 'Image uploaded successfully',
          url: blob.url,
          filename: path.basename(new URL(blob.url).pathname),
        });
      } catch (blobError) {
        console.error('Vercel Blob upload error:', blobError);
        return res.status(500).json({
          success: false,
          message: isVercel
            ? 'Image upload failed. Please ensure BLOB_READ_WRITE_TOKEN is configured in Vercel environment variables.'
            : 'Image upload failed',
        });
      }
    }

    if (isVercel) {
      return res.status(500).json({
        success: false,
        message: 'Image upload failed. Vercel Blob is not configured. Please set BLOB_READ_WRITE_TOKEN in Vercel environment variables.',
      });
    }

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const localPath = path.join(uploadsDir, filename);
    fs.writeFileSync(localPath, req.file.buffer);
    return res.json({
      success: true,
      message: 'Image uploaded successfully',
      url: `/uploads/${filename}`,
      filename,
    });
  } catch (error) {
    console.error('Upload error:', error);
    serverError(res, error);
  }
});

// Upload up to 10 images at once. Admin-only.
router.post('/images', authenticateAdmin, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    if (isBlobEnabled() === false && isVercel) {
      return res.status(500).json({
        success: false,
        message: 'Image upload failed. Vercel Blob is not configured. Please set BLOB_READ_WRITE_TOKEN in Vercel environment variables.',
      });
    }

    if (isBlobEnabled() === false) {
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
    }

    const data = [];
    for (const file of req.files) {
      const filename = buildFilename(file.originalname);
      if (isBlobEnabled()) {
        try {
          const blob = await put(filename, file.buffer, {
            access: 'public',
            contentType: file.mimetype,
            addRandomSuffix: false,
          });
          data.push({
            url: blob.url,
            filename: path.basename(new URL(blob.url).pathname),
          });
        } catch (blobError) {
          console.error('Vercel Blob upload error:', blobError);
          return res.status(500).json({
            success: false,
            message: isVercel
              ? 'Image upload failed. Please ensure BLOB_READ_WRITE_TOKEN is configured in Vercel environment variables.'
              : 'Image upload failed',
          });
        }
      } else {
        const localPath = path.join(uploadsDir, filename);
        fs.writeFileSync(localPath, file.buffer);
        data.push({ url: `/uploads/${filename}`, filename });
      }
    }

    res.status(201).json({ success: true, message: 'Images uploaded successfully', data });
  } catch (error) {
    console.error('Upload error:', error);
    serverError(res, error);
  }
});

// Delete an uploaded image. Admin-only.
// Accepts either a stored filename (legacy / local-disk) or a full Vercel Blob URL.
router.delete('/image/:filename', authenticateAdmin, async (req, res) => {
  try {
    const raw = req.params.filename;
    if (typeof raw !== 'string' || !/^[\w.\-/:%?&=#]+$/.test(raw) || raw === '.' || raw === '..') {
      return res.status(400).json({ success: false, message: 'Invalid filename' });
    }

    const isUrl = /^https?:\/\//i.test(raw);

    if (isBlobEnabled()) {
      if (!isUrl) {
        return res.status(400).json({
          success: false,
          message: 'Blob storage is enabled; pass the full image URL to delete',
        });
      }
      await del(raw);
      return res.json({ success: true, message: 'Image deleted successfully' });
    }

    if (isUrl) {
      return res.status(400).json({
        success: false,
        message: 'Local storage is enabled; pass only the filename to delete',
      });
    }

    const resolved = path.resolve(uploadsDir, raw);
    const uploadsRoot = path.join(uploadsDir, path.sep);
    if (!resolved.startsWith(uploadsRoot)) {
      return res.status(400).json({ success: false, message: 'Invalid filename' });
    }
    if (fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
      return res.json({ success: true, message: 'Image deleted successfully' });
    }
    return res.status(404).json({ success: false, message: 'Image not found' });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;