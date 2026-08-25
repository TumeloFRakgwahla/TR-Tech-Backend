const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateAdmin } = require('../middleware/auth');
const { serverError } = require('../utils/response');

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
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

router.post('/image', authenticateAdmin, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({
      success: true,
      message: 'Image uploaded successfully',
      url: imageUrl,
      filename: req.file.filename
    });
  } catch (error) {
    serverError(res, error);
  }
});

router.post('/images', authenticateAdmin, upload.array('images', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    const data = req.files.map((file) => ({
      url: `/uploads/${file.filename}`,
      filename: file.filename,
    }));
    res.status(201).json({ success: true, message: 'Images uploaded successfully', data });
  } catch (error) {
    serverError(res, error);
  }
});

router.delete('/image/:filename', authenticateAdmin, (req, res) => {
  try {
    const filename = req.params.filename;
    if (typeof filename !== 'string' || !/^[\w.-]+$/.test(filename) || filename === '.' || filename === '..') {
      return res.status(400).json({ success: false, message: 'Invalid filename' });
    }

    const resolved = path.resolve(uploadsDir, filename);
    const uploadsRoot = path.join(uploadsDir, path.sep);
    if (resolved !== path.join(uploadsDir, filename) || !resolved.startsWith(uploadsRoot)) {
      return res.status(400).json({ success: false, message: 'Invalid filename' });
    }

    if (fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
      res.json({ success: true, message: 'Image deleted successfully' });
    } else {
      res.status(404).json({ success: false, message: 'Image not found' });
    }
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;
