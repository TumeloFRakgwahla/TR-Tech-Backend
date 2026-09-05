# TR-Tech Backend

REST API for TR-Tech Repairs and Designs — a full-stack e-commerce and service booking platform. Built with Node.js, Express, and MongoDB.

## Tech Stack

- **Runtime**: Node.js 18
- **Framework**: Express 4
- **Database**: MongoDB with Mongoose 8
- **Auth**: JWT (HTTP-only cookies) + bcrypt + session revocation
- **Validation**: express-validator + zod
- **Security**: Helmet (CSP), CORS allow-list, rate limiting, input sanitization, XSS protection
- **Testing**: Jest + Supertest + mongodb-memory-server
- **Containerization**: Docker (Node 18 Alpine)

## Features

### Authentication & Authorization
- User registration and login with email verification tokens
- Admin login with role-based access control
- Account lockout after 5 failed login attempts (15 min cooldown)
- Session management with JWT revocation via Session model
- HTTP-only, secure cookies with CSRF token support

### Products
- CRUD operations for shop products
- Filtering by category, brand, status, and search
- Pagination support
- Low-stock alerts for admins
- Stock validation during cart and order operations

### Categories & Brands
- CRUD operations for product categories
- CRUD operations for product brands

### Cart
- Add, update quantity, remove items
- Stock-aware cart operations
- Clear entire cart

### Orders
- Create orders with multiple items
- Auto stock deduction on order creation
- Order status tracking (Pending, Processing, Shipped, Delivered, Completed, Cancelled)
- Payment status tracking (Pending, Paid, Refunded)
- Admin order statistics and revenue analytics

### Repairs
- Public repair request submission with rate limiting
- Customer repair tracking (`/my-repairs`)
- Admin repair management with status updates
- Estimated cost tracking

### Services
- CRUD operations for repair services

### Contact
- Public contact form submission with rate limiting
- Admin contact management with status workflow (New, Read, Replied, Closed)

### Wishlist
- Add and remove products from wishlist
- Per-user wishlist management

### Account
- Profile update (name, phone, address)
- Email verification and resend verification

### Uploads
- Image upload endpoint (served from `/uploads` with CORS and CORP headers)

### Marketing
- Campaigns, coupons, and promotions management

### Payment Methods
- Admin-managed payment methods

### Users (Admin)
- User management for administrators

## Project Structure

```
tr-tech-backend/
├── config/
│   └── env.js           # Zod-validated environment configuration
├── middleware/
│   ├── auth.js          # JWT authentication & authorization
│   ├── csrf.js          # CSRF token validation
│   ├── rateLimiter.js   # General, auth, and public rate limiters
│   ├── requestId.js     # Unique request ID generation
│   ├── sanitize.js      # Input sanitization
│   └── validate.js      # express-validator error handler
├── models/
│   ├── User.js          # User schema with bcrypt, lockout, verification
│   ├── Product.js       # Product schema with stock, condition, status
│   ├── Order.js         # Order schema with items, customer, payment status
│   ├── Cart.js          # Cart schema with embedded items
│   ├── Repair.js        # Repair request schema
│   ├── Service.js       # Service schema
│   ├── Contact.js       # Contact message schema
│   ├── Category.js      # Product category schema
│   ├── Brand.js         # Product brand schema
│   ├── Wishlist.js      # Wishlist schema
│   ├── PaymentMethod.js # Payment method schema
│   ├── Campaign.js      # Marketing campaign schema
│   ├── Coupon.js        # Coupon schema
│   ├── Promotion.js     # Promotion schema
│   ├── Notification.js  # Notification schema
│   ├── Address.js       # Address subdocument schema
│   └── Session.js       # Session schema for JWT revocation
├── routes/
│   ├── index.js         # Route registry with CSRF middleware
│   ├── auth.js          # Register, login, logout, profile, email verify
│   ├── account.js       # Account management
│   ├── products.js      # Product CRUD, low-stock, search, filter
│   ├── categories.js    # Category CRUD
│   ├── brands.js        # Brand CRUD
│   ├── services.js      # Service CRUD
│   ├── repairs.js       # Repair requests and tracking
│   ├── orders.js        # Order CRUD, stats, my-orders
│   ├── cart.js          # Cart operations
│   ├── wishlist.js      # Wishlist operations
│   ├── contact.js       # Contact form and management
│   ├── paymentMethods.js # Payment methods CRUD
│   ├── marketing.js     # Campaigns, coupons, promotions
│   ├── upload.js        # File upload endpoint
│   └── users.js         # Admin user management
├── services/
│   ├── productService.js   # Product business logic
│   ├── orderService.js     # Order business logic
│   ├── categoryService.js  # Category business logic
│   └── brandService.js     # Brand business logic
├── utils/
│   ├── jwt.js           # JWT sign and verify utilities
│   ├── session.js       # Session issue and revocation
│   ├── response.js      # Standardized response helpers
│   ├── pagination.js    # Pagination utilities
│   └── query.js         # Query sanitization utilities
├── tests/
│   ├── env.js           # Test environment setup (mongodb-memory-server)
│   ├── setup.js         # Jest setup and global mocks
│   ├── auth.test.js     # Auth route tests
│   ├── products.test.js # Product route tests
│   ├── orders.test.js   # Order route tests
│   ├── brands.test.js   # Brand route tests
│   ├── categories.test.js # Category route tests
│   ├── marketing.test.js # Marketing route tests
│   ├── security.test.js # Security header tests
│   ├── xss.test.js      # XSS sanitization tests
│   ├── accountFeatures.test.js # Account feature tests
│   ├── payments.test.js # Payment route tests
│   └── helpers/         # Test helper utilities
├── uploads/             # Uploaded file storage
├── app.js               # Express app setup, middleware, error handling
├── server.js            # Entry point: DB connection and server start
├── package.json
├── jest.config.js
├── Dockerfile
├── .env.example
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- npm or yarn

### Installation

1. Clone the repository and navigate to the backend directory:
   ```bash
   cd tr-tech-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

4. Update the environment variables in `.env`:
   ```env
   MONGODB_URI=mongodb://localhost:27017/tr-tech
   PORT=5000
   NODE_ENV=development
   JWT_SECRET=your-secret-key-min-32-chars
   FRONTEND_URL=http://localhost:5173
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

The server runs on `http://localhost:5000` by default.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start server with Node |
| `npm run dev` | Start server with Nodemon (auto-reload) |
| `npm test` | Run Jest test suite |
| `npm run test:watch` | Run Jest in watch mode |

## API Base URL

All routes are prefixed with `/api/v1`.

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/auth/register` | Register new user | Public |
| POST | `/api/v1/auth/login` | Login user | Public |
| POST | `/api/v1/auth/admin/login` | Login admin | Public |
| POST | `/api/v1/auth/logout` | Logout user | Public |
| POST | `/api/v1/auth/admin/logout` | Logout admin | Public |
| GET | `/api/v1/auth/me` | Get current user | User |
| PUT | `/api/v1/auth/updateprofile` | Update profile | User |
| POST | `/api/v1/auth/verify-email` | Verify email | Public |
| POST | `/api/v1/auth/resend-verification` | Resend verification email | Public |
| GET | `/api/v1/auth/admin/me` | Get current admin | Admin |

### CSRF

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/csrf-token` | Get CSRF token | Public |

### Products

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/products` | List products (filter, search, paginate) | Public |
| GET | `/api/v1/products/:id` | Get single product | Public |
| POST | `/api/v1/products` | Create product | Admin |
| PUT | `/api/v1/products/:id` | Update product | Admin |
| DELETE | `/api/v1/products/:id` | Delete product | Admin |
| GET | `/api/v1/products/low-stock` | Get low-stock products | Admin |

Query params for listing: `page`, `limit`, `category`, `brand`, `status`, `search`

### Categories

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/categories` | List categories | Public |
| GET | `/api/v1/categories/:id` | Get single category | Public |
| POST | `/api/v1/categories` | Create category | Admin |
| PUT | `/api/v1/categories/:id` | Update category | Admin |
| DELETE | `/api/v1/categories/:id` | Delete category | Admin |

### Brands

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/brands` | List brands | Public |
| GET | `/api/v1/brands/:id` | Get single brand | Public |
| POST | `/api/v1/brands` | Create brand | Admin |
| PUT | `/api/v1/brands/:id` | Update brand | Admin |
| DELETE | `/api/v1/brands/:id` | Delete brand | Admin |

### Services

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/services` | List services | Public |
| GET | `/api/v1/services/:id` | Get single service | Public |
| POST | `/api/v1/services` | Create service | Admin |
| PUT | `/api/v1/services/:id` | Update service | Admin |
| DELETE | `/api/v1/services/:id` | Delete service | Admin |

### Repairs

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/repairs` | Submit repair request | Public (rate limited) |
| GET | `/api/v1/repairs/my-repairs` | Get user's repairs | User |
| GET | `/api/v1/repairs` | List all repairs | Admin |
| GET | `/api/v1/repairs/:id` | Get single repair | Admin |
| PUT | `/api/v1/repairs/:id` | Update repair status/cost | Admin |
| DELETE | `/api/v1/repairs/:id` | Delete repair | Admin |

### Orders

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/orders` | Create order | Public |
| GET | `/api/v1/orders/my-orders` | Get user's orders | User |
| GET | `/api/v1/orders/my-orders/:id` | Get single user order | User |
| GET | `/api/v1/orders` | List all orders | Admin |
| GET | `/api/v1/orders/:id` | Get single order | Admin |
| GET | `/api/v1/orders/stats` | Get order statistics | Admin |
| PUT | `/api/v1/orders/:id` | Update order status | Admin |
| DELETE | `/api/v1/orders/:id` | Delete order | Admin |

### Cart

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/cart` | Get cart items | User |
| POST | `/api/v1/cart` | Add item to cart | User |
| PUT | `/api/v1/cart/:productId` | Update item quantity | User |
| DELETE | `/api/v1/cart/:productId` | Remove item from cart | User |
| DELETE | `/api/v1/cart` | Clear cart | User |

### Wishlist

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/wishlist` | Get wishlist | User |
| POST | `/api/v1/wishlist` | Add to wishlist | User |
| DELETE | `/api/v1/wishlist/:productId` | Remove from wishlist | User |

### Contact

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/contact` | Submit contact form | Public (rate limited) |
| GET | `/api/v1/contact` | List contact messages | Admin |
| GET | `/api/v1/contact/:id` | Get single message | Admin |
| PUT | `/api/v1/contact/:id` | Update message status | Admin |
| DELETE | `/api/v1/contact/:id` | Delete message | Admin |

### Uploads

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/upload` | Upload file | User |
| GET | `/uploads/:filename` | Serve uploaded file | Public |

### Payment Methods

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/payment-methods` | List payment methods | Public |
| POST | `/api/v1/payment-methods` | Create payment method | Admin |
| PUT | `/api/v1/payment-methods/:id` | Update payment method | Admin |
| DELETE | `/api/v1/payment-methods/:id` | Delete payment method | Admin |

### Marketing

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/marketing/campaigns` | List campaigns | Public |
| GET | `/api/v1/marketing/coupons` | List coupons | Public |
| GET | `/api/v1/marketing/promotions` | List promotions | Public |
| POST | `/api/v1/marketing/campaigns` | Create campaign | Admin |
| PUT | `/api/v1/marketing/campaigns/:id` | Update campaign | Admin |
| DELETE | `/api/v1/marketing/campaigns/:id` | Delete campaign | Admin |
| POST | `/api/v1/marketing/coupons` | Create coupon | Admin |
| PUT | `/api/v1/marketing/coupons/:id` | Update coupon | Admin |
| DELETE | `/api/v1/marketing/coupons/:id` | Delete coupon | Admin |
| POST | `/api/v1/marketing/promotions` | Create promotion | Admin |
| PUT | `/api/v1/marketing/promotions/:id` | Update promotion | Admin |
| DELETE | `/api/v1/marketing/promotions/:id` | Delete promotion | Admin |

### Payments

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/payments/paystack/initialize` | Initialize Paystack payment | User |
| POST | `/api/v1/payments/paystack/verify` | Verify Paystack payment | User |
| POST | `/api/v1/payments/paystack/webhook` | Paystack webhook | Public |

### Account

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/account/profile` | Get profile | User |
| PUT | `/api/v1/account/profile` | Update profile | User |

### Users (Admin)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/v1/users` | List users | Admin |
| GET | `/api/v1/users/:id` | Get single user | Admin |
| PUT | `/api/v1/users/:id` | Update user | Admin |
| DELETE | `/api/v1/users/:id` | Delete user | Admin |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `development` | No |
| `PORT` | Server port | `5000` | No |
| `MONGODB_URI` | MongoDB connection string | — | Yes |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | — | Yes |
| `FRONTEND_URL` | Frontend origin for CORS | `http://localhost:5173` | No |

## Security

- **Helmet**: Security headers with strict Content Security Policy
- **CORS**: Allow-listed origins with credentials support
- **Rate Limiting**: General API limiter, auth-specific limiter, and public form limiter
- **Input Sanitization**: XSS protection via sanitize-html middleware
- **CSRF Protection**: Token-based CSRF via cookies (`/api/csrf-token`)
- **Password Hashing**: bcrypt with salt rounds
- **Account Lockout**: 5 failed attempts triggers 15-minute lockout
- **JWT Revocation**: Session model tracks and revokes tokens
- **Request ID**: Unique identifier per request for tracing
- **Query Sanitization**: Regex escaping for search queries

## Testing

Tests use Jest with mongodb-memory-server for an in-memory database.

```bash
npm test
```

Test suites cover:
- Authentication flows (register, login, admin login, logout)
- Product CRUD and filtering
- Order creation and stock management
- Brand and category management
- Marketing endpoints
- Payment verification and webhooks
- Security headers and XSS protection
- Account features

## Docker

Build and run with Docker:

```bash
docker build -t tr-tech-backend .
docker run -p 5000:5000 --env-file .env tr-tech-backend
```

## License

MIT
