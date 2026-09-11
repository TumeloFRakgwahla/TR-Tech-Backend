let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (error) {
  nodemailer = null;
}

const createTransporter = () => {
  if (!nodemailer) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    }
  });
};

const transporter = createTransporter();

const isEmailConfigured = () => {
  return !!transporter && !!(process.env.SMTP_USER && process.env.SMTP_PASS);
};

const generateVerificationEmail = (userName, verificationLink) => {
  return {
    subject: 'Verify your TR-Tech account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background-color: #1e293b; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">TR-Tech Repairs & Designs</h1>
        </div>
        <div style="padding: 32px; background-color: #ffffff; border: 1px solid #e2e8f0;">
          <h2 style="color: #1e293b; margin-top: 0;">Verify your email address</h2>
          <p style="color: #475569; line-height: 1.6;">Hi ${userName},</p>
          <p style="color: #475569; line-height: 1.6;">Thank you for registering with TR-Tech. Please click the button below to verify your email address and activate your account.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${verificationLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Verify Email Address</a>
          </div>
          <p style="color: #475569; line-height: 1.6; font-size: 14px;">If the button above doesn't work, copy and paste the following link into your browser:</p>
          <p style="color: #2563eb; word-break: break-all; font-size: 14px;">${verificationLink}</p>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">This link will expire in 24 hours. If you did not create an account with TR-Tech, please ignore this email.</p>
        </div>
        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">TR-Tech Repairs & Designs | +27 79 100 2552 | info@trtech.co.za</p>
        </div>
      </div>
    `
  };
};

const generateOrderConfirmationEmail = (order) => {
  const itemsHtml = order.items.map((item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b;">${item.name || 'Product'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b; text-align: right;">R${(item.price * item.quantity).toFixed(2)}</td>
    </tr>
  `).join('');

  return {
    subject: `Order Confirmation - TR-Tech Order #${String(order._id).slice(-6).toUpperCase()}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background-color: #1e293b; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">TR-Tech Repairs & Designs</h1>
        </div>
        <div style="padding: 32px; background-color: #ffffff; border: 1px solid #e2e8f0;">
          <h2 style="color: #1e293b; margin-top: 0;">Order Confirmation</h2>
          <p style="color: #475569; line-height: 1.6;">Hi ${order.customer.name},</p>
          <p style="color: #475569; line-height: 1.6;">Thank you for your order. Here are your order details:</p>
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 16px 0;">
            <p style="margin: 0; color: #1e293b;"><strong>Order Number:</strong> #${String(order._id).slice(-6).toUpperCase()}</p>
            <p style="margin: 4px 0 0 0; color: #1e293b;"><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
            <p style="margin: 4px 0 0 0; color: #1e293b;"><strong>Status:</strong> ${order.status}</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <thead>
              <tr style="background-color: #f1f5f9;">
                <th style="padding: 12px; text-align: left; color: #1e293b; font-weight: 600;">Item</th>
                <th style="padding: 12px; text-align: center; color: #1e293b; font-weight: 600;">Qty</th>
                <th style="padding: 12px; text-align: right; color: #1e293b; font-weight: 600;">Total</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding: 12px; text-align: right; color: #1e293b; font-weight: 600;">Total:</td>
                <td style="padding: 12px; text-align: right; color: #1e293b; font-weight: 600;">R${order.totalAmount.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          <p style="color: #475569; line-height: 1.6;">If you have any questions about your order, please contact us at info@trtech.co.za or +27 79 100 2552.</p>
        </div>
        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">TR-Tech Repairs & Designs | +27 79 100 2552 | info@trtech.co.za</p>
        </div>
      </div>
    `
  };
};

const generatePasswordResetEmail = (userName, resetLink) => {
  return {
    subject: 'Reset your TR-Tech password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background-color: #1e293b; padding: 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">TR-Tech Repairs & Designs</h1>
        </div>
        <div style="padding: 32px; background-color: #ffffff; border: 1px solid #e2e8f0;">
          <h2 style="color: #1e293b; margin-top: 0;">Reset your password</h2>
          <p style="color: #475569; line-height: 1.6;">Hi ${userName},</p>
          <p style="color: #475569; line-height: 1.6;">We received a request to reset your password. Click the button below to choose a new password.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #475569; line-height: 1.6; font-size: 14px;">If the button above doesn't work, copy and paste the following link into your browser:</p>
          <p style="color: #2563eb; word-break: break-all; font-size: 14px;">${resetLink}</p>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">This link will expire in 1 hour. If you did not request a password reset, please ignore this email and your password will remain unchanged.</p>
        </div>
        <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">TR-Tech Repairs & Designs | +27 79 100 2552 | info@trtech.co.za</p>
        </div>
      </div>
    `
  };
};

const sendEmail = async (to, emailData) => {
  if (!isEmailConfigured()) {
    console.log('[Email Service] Email not configured. Would send:', { to, subject: emailData.subject });
    return { success: true, message: 'Email service not configured', simulated: true };
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Failed to send email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

module.exports = {
  transporter,
  isEmailConfigured,
  sendEmail,
  generateVerificationEmail,
  generateOrderConfirmationEmail,
  generatePasswordResetEmail
};
