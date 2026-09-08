const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const User = require('../models/User');

const seedAdmin = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    const adminEmail = 'admin@trtech.co.za';
    const adminPassword = 'Admin123!';

    let admin = await User.findOne({ email: adminEmail });

    if (admin) {
      admin.role = 'admin';
      admin.isActive = true;
      admin.failedLoginAttempts = 0;
      admin.lockUntil = null;
      admin.password = adminPassword;
      await admin.save();
      console.log(`Updated existing user to admin: ${adminEmail}`);
    } else {
      admin = await User.create({
        firstName: 'Admin',
        lastName: 'User',
        email: adminEmail,
        password: adminPassword,
        phone: '0645104733',
        role: 'admin',
        isActive: true,
        emailVerified: true
      });
      console.log(`Created admin user: ${adminEmail}`);
    }

    console.log('\nAdmin credentials:');
    console.log(`  Email:    ${adminEmail}`);
    console.log(`  Password: ${adminPassword}`);
    console.log(`  Role:     admin`);
    console.log('\nAdmin seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();
