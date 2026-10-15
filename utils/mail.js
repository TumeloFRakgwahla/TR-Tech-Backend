const nodemailer = require('nodemailer');
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

let transporter;
let transportInitialized = false;

const isMailConfigured = () => {
  const sendgridKey = process.env.SENDGRID_API_KEY ? process.env.SENDGRID_API_KEY.replace(/\s+/g, '') : undefined;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : undefined;
  return Boolean(sendgridKey || (smtpHost && smtpPort && smtpUser && smtpPass));
};

const initTransporter = () => {
  if (transportInitialized) return transporter;
  transportInitialized = true;

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : undefined;
  const sendgridKey = process.env.SENDGRID_API_KEY ? process.env.SENDGRID_API_KEY.replace(/\s+/g, '') : undefined;
  const isDev = process.env.NODE_ENV !== 'production';

  if (sendgridKey) {
    transporter = nodemailer.createTransport({
      service: 'SendGrid',
      auth: {
        user: process.env.SENDGRID_USER || 'apikey',
        pass: sendgridKey,
      },
    });
  } else if (smtpHost && smtpPort && smtpUser && smtpPass) {
    const secure = process.env.SMTP_SECURE !== 'false';
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort, 10),
      secure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  } else if (isDev) {
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    });
    console.warn('[mail] No SMTP/SendGrid config found. Using JSON transport — emails will be saved to console output instead of being sent.');
  } else {
    transporter = null;
  }
  

  return transporter;
};

const verifyTransport = async () => {
  const transport = initTransporter();
  if (!transport || transporter.transporter?.transportType === 'JSONTransport') return null;
  try {
    await transport.verify();
    return true;
  } catch (error) {
    console.error('[mail] SMTP/transport verification failed:', error.message);
    return false;
  }
};
const logSentEmail = (label, mailOptions, result) => {
  if (process.env.NODE_ENV !== 'production' && transporter && transporter.transporter && transporter.transporter.transportType === 'JSONTransport') {
    console.log(`\n[mail:dev] ${label} email:`);
    console.log(`  To: ${mailOptions.to}`);
    console.log(`  Subject: ${mailOptions.subject}`);
    if (mailOptions.html) {
      const urlMatch = mailOptions.html.match(/href="([^"]+)"/);
      if (urlMatch) console.log(`  Verification URL: ${urlMatch[1]}`);
    }
    if (mailOptions.text) {
      const urlMatch = mailOptions.text.match(/https?:\/\/[^\s]+/);
      if (urlMatch) console.log(`  Verification URL: ${urlMatch[0]}`);
    }
    console.log('');
  }
};

const getFromAddress = () => {
  return process.env.SMTP_FROM || process.env.SENDGRID_FROM || 'no-reply@tr-tech.com';
};

const sendVerificationEmail = async (toEmail, name, verificationToken) => {
  const transport = initTransporter();
  if (!transport) {
    console.warn(`[mail] No SMTP/SendGrid config — skipping verification email to ${toEmail}. Configure SMTP or SendGrid to enable email sending.`);
    return null;
  }

  const from = getFromAddress();
  const verifyUrl = `${frontendUrl}/verify-email?token=${verificationToken}`;

  const mailOptions = {
    from,
    to: toEmail,
    subject: 'Verify your email address',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">Verify your email address</h1>
        <p>Hello ${name || 'there'},</p>
        <p>Thank you for registering with TR-Tech. Please click the button below to verify your email address:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">Verify Email</a>
        </p>
        <p>If you did not create an account, you can safely ignore this email.</p>
        <p style="color: #666; font-size: 14px; margin-top: 40px;">This link will expire in 24 hours.</p>
      </div>
    `,
    text: `Hello ${name || 'there'},\n\nPlease verify your email address by clicking the link below:\n\n${verifyUrl}\n\nIf you did not create an account, you can safely ignore this email.\n\nThis link will expire in 24 hours.`,
  };

  try {
    const result = await transport.sendMail(mailOptions);
    logSentEmail('verification', mailOptions, result);
    return result;
  } catch (error) {
    console.error('[mail] Failed to send verification email to', toEmail, error.message);
    return null;
  }
};

const sendPasswordResetEmail = async (toEmail, name, resetToken) => {
  const transport = initTransporter();
  if (!transport) {
    console.warn(`[mail] No SMTP/SendGrid config — skipping password reset email to ${toEmail}. Configure SMTP or SendGrid to enable email sending.`);
    return null;
  }

  const from = getFromAddress();
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from,
    to: toEmail,
    subject: 'Password reset instructions',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">Reset your password</h1>
        <p>Hello ${name || 'there'},</p>
        <p>Click the button below to reset your password. This link will expire in 15 minutes.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
        </p>
        <p>If you did not request a password reset, you can safely ignore this email.</p>
      </div>
    `,
    text: `Hello ${name || 'there'},\n\nClick the link below to reset your password (expires in 15 minutes):\n\n${resetUrl}\n\nIf you did not request a password reset, you can safely ignore this email.`,
  };

  try {
    const result = await transport.sendMail(mailOptions);
    logSentEmail('password-reset', mailOptions, result);
    return result;
  } catch (error) {
    console.error('[mail] Failed to send password reset email to', toEmail, error.message);
    return null;
  }
};

const sendAdminAlert = async (subject, text, html) => {
  const transport = initTransporter();
  if (!transport) {
    console.warn('[mail] No SMTP/SendGrid config — skipping admin alert');
    return null;
  }

  const from = getFromAddress();
  const adminEmail = process.env.ADMIN_EMAIL || getFromAddress();

  const mailOptions = {
    from,
    to: adminEmail,
    subject,
    text,
    html: html || text,
  };

  try {
    const result = await transport.sendMail(mailOptions);
    logSentEmail('admin-alert', mailOptions, result);
    return result;
  } catch (error) {
    console.error('[mail] Failed to send admin alert:', error.message);
    return null;
  }
};

module.exports = {
  nodemailer,
  initTransporter,
  isMailConfigured,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendAdminAlert,
  verifyTransport,
};
