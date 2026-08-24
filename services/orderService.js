const Order = require('../models/Order');
const Product = require('../models/Product');

const rollbackStock = async (reserved) => {
  for (const r of reserved) {
    try {
      await Product.findByIdAndUpdate(r.id, { $inc: { stock: r.quantity } });
    } catch (rollbackError) {
      console.error('Stock rollback failed:', rollbackError);
    }
  }
};

const createOrder = async (orderData) => {
  const reservedStock = [];
  const validatedItems = [];
  let computedTotal = 0;

  for (const item of orderData.items) {
    const product = await Product.findById(item.product);
    if (!product) {
      await rollbackStock(reservedStock);
      throw new Error(`Product ${item.product} not found`);
    }

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: product._id, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
      { new: true }
    );

    if (!updatedProduct) {
      await rollbackStock(reservedStock);
      throw new Error(`Insufficient stock for ${product.name}`);
    }

    reservedStock.push({ id: product._id, quantity: item.quantity });

    validatedItems.push({
      product: product._id,
      name: product.name,
      condition: product.condition,
      price: product.price,
      quantity: item.quantity,
    });
    computedTotal += product.price * item.quantity;
  }

  const order = await Order.create({
    items: validatedItems,
    customer: orderData.customer,
    userId: orderData.userId,
    totalAmount: computedTotal,
    paymentMethod: orderData.paymentMethod,
    status: 'Pending',
    paymentStatus: 'Pending',
    notes: orderData.notes,
  });

  return order;
};

const getOrders = async (query = {}, page = 1, limit = 20) => {
  const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
  const [orders, total] = await Promise.all([
    Order.find(query).populate('items.product').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(query),
  ]);
  return { orders, total };
};

const getOrderById = async (id) => {
  return Order.findById(id).populate('items.product');
};

const updateOrder = async (id, updateData) => {
  return Order.findByIdAndUpdate(id, updateData, { new: true }).populate('items.product');
};

const deleteOrder = async (id) => {
  return Order.findByIdAndDelete(id);
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  rollbackStock,
};
