# TR-Tech Backend

Backend API for TR-Tech Repairs and Designs built with Node.js, Express.js, and MongoDB.

## Features

- **Products API**: Manage shop products (CRUD operations)
- **Services API**: Manage repair services (CRUD operations)
- **Orders API**: Handle customer orders with stock management
- **Contact API**: Manage contact form submissions

## Tech Stack

- Node.js
- Express.js
- MongoDB with Mongoose
- CORS for cross-origin requests

## Getting Started

### Prerequisites

- Node.js installed
- MongoDB installed locally or MongoDB Atlas connection

### Installation

1. Clone the repository
2. Navigate to the backend directory:
   ```bash
   cd tr-tech-backend
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a `.env` file based on `.env.example`
5. Start the development server:
   ```bash
   npm run dev
   ```

## API Endpoints

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Services
- `GET /api/services` - Get all services
- `GET /api/services/:id` - Get single service
- `POST /api/services` - Create service
- `PUT /api/services/:id` - Update service
- `DELETE /api/services/:id` - Delete service

### Orders
- `GET /api/orders` - Get all orders
- `GET /api/orders/:id` - Get single order
- `POST /api/orders` - Create order (auto-updates stock)
- `PUT /api/orders/:id` - Update order status
- `DELETE /api/orders/:id` - Delete order

### Contact
- `GET /api/contact` - Get all contact messages
- `GET /api/contact/:id` - Get single message
- `POST /api/contact` - Submit contact form
- `PUT /api/contact/:id` - Update message status
- `DELETE /api/contact/:id` - Delete message

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `PORT` | Server port (default: 5000) |
| `NODE_ENV` | Environment mode |

## License

MIT
