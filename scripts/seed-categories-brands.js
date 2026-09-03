const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').join(__dirname, '..', '.env') });
const Category = require('../models/Category');
const Brand = require('../models/Brand');

const categories = [
  { name: 'Smartphones', slug: 'smartphones', icon: 'Smartphone', displayOrder: 1, status: 'Active' },
  { name: 'Laptops', slug: 'laptops', icon: 'Laptop', displayOrder: 2, status: 'Active' },
  { name: 'Laptop Accessories', slug: 'laptop-accessories', icon: 'Cable', displayOrder: 3, status: 'Active' },
  { name: 'Mobile Accessories', slug: 'mobile-accessories', icon: 'Headphones', displayOrder: 4, status: 'Active' },
  { name: 'Gaming', slug: 'gaming', icon: 'Gamepad2', displayOrder: 5, status: 'Active' },
  { name: 'Networking', slug: 'networking', icon: 'Wifi', displayOrder: 6, status: 'Active' },
  { name: 'Printers', slug: 'printers', icon: 'Printer', displayOrder: 7, status: 'Active' },
  { name: 'Storage Devices', slug: 'storage-devices', icon: 'HardDrive', displayOrder: 8, status: 'Active' },
  { name: 'Other', slug: 'other', icon: 'MoreHorizontal', displayOrder: 9, status: 'Active' },
];

const brands = [
  { name: 'Apple', slug: 'apple', status: 'Active' },
  { name: 'Samsung', slug: 'samsung', status: 'Active' },
  { name: 'HP', slug: 'hp', status: 'Active' },
  { name: 'Dell', slug: 'dell', status: 'Active' },
  { name: 'Lenovo', slug: 'lenovo', status: 'Active' },
  { name: 'Asus', slug: 'asus', status: 'Active' },
  { name: 'Huawei', slug: 'huawei', status: 'Active' },
  { name: 'Xiaomi', slug: 'xiaomi', status: 'Active' },
  { name: 'Sony', slug: 'sony', status: 'Active' },
  { name: 'LG', slug: 'lg', status: 'Active' },
  { name: 'Microsoft', slug: 'microsoft', status: 'Active' },
  { name: 'Google', slug: 'google', status: 'Active' },
  { name: 'Other', slug: 'other', status: 'Active' },
];

const seedCategoriesAndBrands = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    // Clear existing data
    await Category.deleteMany({});
    console.log('Cleared existing categories');

    await Brand.deleteMany({});
    console.log('Cleared existing brands');

    // Insert new data
    const insertedCategories = await Category.insertMany(categories);
    console.log(`Seeded ${insertedCategories.length} categories:`);
    insertedCategories.forEach(c => {
      console.log(`  - ${c.name} (icon: ${c.icon}, order: ${c.displayOrder})`);
    });

    const insertedBrands = await Brand.insertMany(brands);
    console.log(`\nSeeded ${insertedBrands.length} brands:`);
    insertedBrands.forEach(b => {
      console.log(`  - ${b.name}`);
    });

    console.log('\nData seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

seedCategoriesAndBrands();
