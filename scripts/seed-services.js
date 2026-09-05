const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').join(__dirname, '..', '.env') });
const Service = require('../models/Service');
const path = require('path');

const services = [
  {
    name: 'Phone Repairs',
    description: 'Expert repair services for all smartphone brands including screen replacement, battery replacement, charging port repairs, and software issues.',
    category: 'Phone Repair',
    price: 150,
    estimatedTime: '1-2 hours',
    image: 'https://via.placeholder.com/100',
    icon: 'Smartphone',
    features: ['Screen replacement', 'Battery replacement', 'Charging port repair', 'Software troubleshooting', 'Water damage repair'],
    status: 'Active'
  },
  {
    name: 'Laptop & Computer Repairs',
    description: 'Comprehensive laptop and desktop repair services including hardware upgrades, virus removal, data recovery, and performance optimization.',
    category: 'Computer Repair',
    price: 200,
    estimatedTime: '2-4 hours',
    image: 'https://via.placeholder.com/100',
    icon: 'Laptop',
    features: ['Hardware diagnostics', 'Virus removal', 'Data recovery', 'Performance optimization', 'Hardware upgrades'],
    status: 'Active'
  },
  {
    name: 'Software Solutions',
    description: 'Custom software development, website creation, app development, and IT consulting services tailored to your business needs.',
    category: 'Other',
    price: 0,
    estimatedTime: 'Quote based',
    image: 'https://via.placeholder.com/100',
    icon: 'Code',
    features: ['Custom software development', 'Website design', 'Mobile app development', 'IT consulting', 'System integration'],
    status: 'Active'
  },
  {
    name: 'Graphic Design',
    description: 'Professional graphic design services including logo design, branding, marketing materials, and digital artwork creation.',
    category: 'Other',
    price: 300,
    estimatedTime: '2-3 days',
    image: 'https://via.placeholder.com/100',
    icon: 'Palette',
    features: ['Logo design', 'Brand identity', 'Marketing materials', 'Social media graphics', 'Print design'],
    status: 'Active'
  },
  {
    name: 'Software Troubleshooting',
    description: 'Expert software troubleshooting and optimization services for operating systems, applications, and system performance issues.',
    category: 'Computer Repair',
    price: 100,
    estimatedTime: '1-2 hours',
    image: 'https://via.placeholder.com/100',
    icon: 'Settings',
    features: ['OS optimization', 'Virus/malware removal', 'Driver updates', 'Software installation', 'Performance tuning'],
    status: 'Active'
  }
];

const seedServices = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    await Service.deleteMany({});
    console.log('Cleared existing services');

    await Service.insertMany(services);
    console.log('Services seeded successfully');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding services:', error);
    process.exit(1);
  }
};

seedServices();
