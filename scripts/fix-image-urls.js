const mongoose = require('mongoose');
const validator = require('validator');
const Product = require('../models/Product');
require('dotenv').config();

const fixUrls = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const products = await Product.find({});
  let fixed = 0;

  for (const product of products) {
    let changed = false;

    if (product.image && product.image !== validator.unescape(product.image)) {
      product.image = validator.unescape(product.image);
      changed = true;
    }

    if (Array.isArray(product.images)) {
      const unescaped = product.images.map(validator.unescape);
      if (JSON.stringify(unescaped) !== JSON.stringify(product.images)) {
        product.images = unescaped;
        changed = true;
      }
    }

    if (changed) {
      await product.save();
      fixed++;
    }
  }

  console.log(`Fixed ${fixed} product image URL(s).`);
  await mongoose.disconnect();
};

fixUrls().catch(console.error);
