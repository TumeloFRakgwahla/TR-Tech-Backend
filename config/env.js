const z = require('zod');

// Environment variable schema validated with Zod.
// All required variables are checked at startup; missing or invalid values cause an immediate exit.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().url('MONGODB_URI must be a valid URL'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL').default('http://localhost:5173'),
});

// Parse and validate environment variables. Called at application startup.
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error('Invalid environment variables:');
    if (error instanceof z.ZodError) {
      const issues = error.issues ?? error.errors ?? [];
      if (issues.length) {
        issues.forEach((err) => {
          console.error(`  ${err.path?.join('.')}: ${err.message}`);
        });
      } else {
        console.error('  Unknown Zod validation failure (no issues reported).');
      }
    } else {
      console.error('  Unexpected validation error:', error.message || error);
    }
    process.exit(1);
  }
};

module.exports = { parseEnv };
