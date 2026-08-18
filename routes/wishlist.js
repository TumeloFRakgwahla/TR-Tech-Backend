const express = require('express');
const router = express.Router();
const Wishlist = require('../models/Wishlist');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user._id }).populate('products');
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, products: [] });
    }
    res.json({ success: true, data: wishlist.products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/check/:productId', authenticate, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    const inWishlist = wishlist
      ? wishlist.products.some((p) => p.toString() === req.params.productId)
      : false;
    res.json({ success: true, inWishlist });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:productId', authenticate, async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = new Wishlist({ user: req.user._id, products: [] });
    }

    if (!wishlist.products.includes(req.params.productId)) {
      wishlist.products.push(req.params.productId);
      await wishlist.save();
    }

    res.json({ success: true, message: 'Added to wishlist' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:productId', authenticate, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      return res.status(404).json({ success: false, message: 'Wishlist not found' });
    }

    wishlist.products = wishlist.products.filter(
      (p) => p.toString() !== req.params.productId
    );
    await wishlist.save();

    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
