const express = require('express');
const { serverError, badRequest } = require('../utils/response');
const router = express.Router();
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { authenticate } = require('../middleware/auth');

// Validation for adding/updating cart items.
const cartItemValidation = [
  body('product').notEmpty().withMessage('Product ID is required'),
  body('name').optional().trim().isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),
  body('condition').optional().trim().isLength({ max: 50 }).withMessage('Invalid condition'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('image').optional().trim().isLength({ max: 500 }).withMessage('Image URL is too long')
];

const productIdValidation = [
  param('productId').notEmpty().withMessage('Product ID is required')
];

// Get the authenticated user's cart items.
// Creates an empty cart if one does not exist yet.
router.get('/', authenticate, async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      try {
        cart = await Cart.create({ user: req.user._id, items: [] });
      } catch (createError) {
        if (createError.code === 11000) {
          cart = await Cart.findOne({ user: req.user._id });
        } else {
          throw createError;
        }
      }
    }
    res.json({ success: true, data: cart.items });
  } catch (error) {
    serverError(res, error);
  }
});

// Add an item to the cart.
// Validates stock availability before adding. Merges with existing item if present.
router.post('/', authenticate, cartItemValidation, validate, async (req, res) => {
  try {
    const { product, name, condition, price, quantity, image } = req.body;
    const productId = product;

    const productDoc = await Product.findById(productId).catch(() => null);
    if (!productDoc) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      try {
        cart = await Cart.create({ user: req.user._id, items: [] });
      } catch (createError) {
        if (createError.code === 11000) {
          cart = await Cart.findOne({ user: req.user._id });
        } else {
          throw createError;
        }
      }
    }

    const existingIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId.toString()
    );

    const itemData = {
      product: productId,
      name: name || productDoc.name,
      condition: condition || productDoc.condition,
      price: price || productDoc.price,
      quantity: quantity || 1,
      image: image || productDoc.image || ''
    };

    if (existingIndex >= 0) {
      const newQuantity = cart.items[existingIndex].quantity + itemData.quantity;
      if (newQuantity > productDoc.stock) {
        return res.status(400).json({ 
          success: false, 
          message: `Cannot add more. Only ${productDoc.stock} available in stock. Current quantity: ${cart.items[existingIndex].quantity}` 
        });
      }
      cart.items[existingIndex].quantity = newQuantity;
      if (itemData.name) cart.items[existingIndex].name = itemData.name;
      if (itemData.condition) cart.items[existingIndex].condition = itemData.condition;
      if (itemData.price) cart.items[existingIndex].price = itemData.price;
      if (itemData.image) cart.items[existingIndex].image = itemData.image;
    } else {
      if (itemData.quantity > productDoc.stock) {
        return res.status(400).json({ 
          success: false, 
          message: `Cannot add more. Only ${productDoc.stock} available in stock.` 
        });
      }
      cart.items.push(itemData);
    }

    await cart.save();
    res.json({ success: true, data: cart.items });
  } catch (error) {
    badRequest(res, error);
  }
});

// Update the quantity of a cart item.
// Validates against current stock before updating.
router.put('/:productId', authenticate, productIdValidation, validate, async (req, res) => {
  try {
    const { quantity } = req.body;
    const productId = req.params.productId;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
    }

    const productDoc = await Product.findById(productId).catch(() => null);
    if (!productDoc) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (quantity > productDoc.stock) {
      return res.status(400).json({ 
        success: false, 
        message: `Only ${productDoc.stock} available in stock` 
      });
    }

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const item = cart.items.find(
      (item) => item.product.toString() === productId.toString()
    );

    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    item.quantity = quantity;
    await cart.save();

    res.json({ success: true, data: cart.items });
  } catch (error) {
    badRequest(res, error);
  }
});

// Remove a single item from the cart by product ID.
router.delete('/:productId', authenticate, productIdValidation, async (req, res) => {
  try {
    const productId = req.params.productId;

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    cart.items = cart.items.filter(
      (item) => item.product.toString() !== productId.toString()
    );
    await cart.save();

    res.json({ success: true, data: cart.items });
  } catch (error) {
    serverError(res, error);
  }
});

// Remove all items from the cart.
router.delete('/', authenticate, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    cart.items = [];
    await cart.save();

    res.json({ success: true, data: [] });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;
