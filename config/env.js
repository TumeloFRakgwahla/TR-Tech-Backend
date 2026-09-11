const z = require('zod');

// Environment variable schema validated with Zod.
// All required variables are checked at startup; missing or invalid values cause an immediate exit.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().url('MONGODB_URI must be a valid URL'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL').default('http://localhost:5173'),
  PAYSTACK_SECRET_KEY: z.string().min(10, 'PAYSTACK_SECRET_KEY is required').optional().default(''),
  PAYSTACK_PUBLIC_KEY: z.string().min(10, 'PAYSTACK_PUBLIC_KEY is required').optional().default(''),
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.string().default('false'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default(''),
  BLOB_READ_WRITE_TOKEN: z.string().default(''),
});

const isVercel = process.env.VERCEL === '1';

const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('Invalid environment variables:');
    let hasRequiredFailure = false;
    if (error instanceof z.ZodError) {
      const issues = error.issues ?? error.errors ?? [];
      if (issues.length) {
        issues.forEach((err) => {
          const path = err.path?.join('.') || 'unknown';
          const message = err.message || 'Invalid value';
          const isOptional = ['PAYSTACK_SECRET_KEY', 'PAYSTACK_PUBLIC_KEY', 'BLOB_READ_WRITE_TOKEN'].includes(path);
          if (isOptional) {
            console.warn(`  ${path}: ${message}`);
          } else {
            console.error(`  ${path}: ${message}`);
            hasRequiredFailure = true;
          }
        });
      } else {
        console.error('  Unknown Zod validation failure (no issues reported).');
        hasRequiredFailure = true;
      }
    } else {
      console.error('  Unexpected validation error:', error.message || error);
      hasRequiredFailure = true;
    }

    if (hasRequiredFailure && !isVercel) {
      process.exit(1);
    }

    if (hasRequiredFailure && isVercel) {
      console.error('[startup] Required environment variables are invalid. The application may not function correctly on Vercel.');
    }

    const result = envSchema.safeParse(process.env);
    if (result.success) {
      return result.data;
    }

    const fallback = {
      NODE_ENV: 'production',
      PORT: 5000,
      MONGODB_URI: process.env.MONGODB_URI || '',
      JWT_SECRET: process.env.JWT_SECRET || '',
      FRONTEND_URL: process.env.FRONTEND_URL || 'https://tr-tech-frontend.vercel.app',
      PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || '',
      PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY || '',
      SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
      SMTP_PORT: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
      SMTP_SECURE: process.env.SMTP_SECURE || 'false',
      SMTP_USER: process.env.SMTP_USER || '',
      SMTP_PASS: process.env.SMTP_PASS || '',
      SMTP_FROM: process.env.SMTP_FROM || '',
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN || '',
    };
    console.warn('[startup] Falling back to default environment values. Some features may not work.');
    return fallback;
  }
};

module.exports = { parseEnv };
