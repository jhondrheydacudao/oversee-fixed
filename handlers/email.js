const nodemailer = require('nodemailer');
const { db } = require('./db.js');
const config = require('../config.json');

async function getSMTPSettings() {
  const smtpSettings = await db.get('smtp_settings');
  const name = await db.get('name') || 'OverSee';
  if (!smtpSettings) {
    throw new Error('SMTP settings not found');
  }

  const isSecure = !(smtpSettings.port == 587 || smtpSettings.port == 25);
  const transporterConfig = {
    host: smtpSettings.server,
    port: smtpSettings.port,
    secure: isSecure,
    auth: {
      user: smtpSettings.username,
      pass: smtpSettings.password,
    },
    tls: {
      rejectUnauthorized: true,
    },
  };

  const transporter = nodemailer.createTransport(transporterConfig);
  return { transporter, smtpSettings, name };
}

async function sendWelcomeEmail(email, username, password) {
  try {
    const { transporter, smtpSettings, name } = await getSMTPSettings();

    const mailOptions = {
      from: `${smtpSettings.fromName} <${smtpSettings.fromAddress}>`,
      to: email,
      subject: `Welcome to ${name}!`,
      html: `
        <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f9;
                padding: 0;
                margin: 0;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
              }
              .header {
                background-color: #007bff;
                color: #ffffff;
                padding: 20px;
                text-align: center;
                border-radius: 8px 8px 0 0;
              }
              .content {
                padding: 20px;
                font-size: 16px;
                color: #333333;
              }
              .footer {
                text-align: center;
                margin-top: 20px;
                color: #777777;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Welcome to ${name}!</h1>
              </div>
              <div class="content">
                <p>Hi ${username},</p>
                <p>Thank you for joining ${name}. We are thrilled to have you on board.</p>
                <p>Your account details are as follows:</p>
                <ul>
                  <li><strong>Username:</strong> ${username}</li>
                  <li><strong>Password:</strong> ${password}</li>
                </ul>
                <p>We hope you have a great experience with ${name}!</p>
              </div>
              <div class="footer">
                <p>This is an automated message. Please do not reply.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
}

async function sendVerificationEmail(email, token) {
  try {
    const { transporter, smtpSettings, name } = await getSMTPSettings();

    const mailOptions = {
      from: `${smtpSettings.fromName} <${smtpSettings.fromAddress}>`,
      to: email,
      subject: 'Verify Your Email Address',
      html: `
        <html>
          <head>
            <style>
              body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: #f9f9f9;
                padding: 0;
                margin: 0;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                padding: 20px;
                border-radius: 10px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
              }
              .header {
                text-align: center;
                padding: 20px;
              }
              .content {
                padding: 20px;
                font-size: 16px;
                color: #333333;
              }
              .button {
                display: inline-block;
                padding: 14px 28px;
                font-size: 16px;
                color: #ffffff;
                background-color: #4caf50;
                text-decoration: none;
                border-radius: 5px;
                text-align: center;
                margin: 20px 0;
              }
              .footer {
                text-align: center;
                margin-top: 20px;
                color: #777777;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>Verify Your Email Address</h2>
              </div>
              <div class="content">
                <p>Hello,</p>
                <p>Thank you for registering with ${name}. Please click the button below to verify your email address:</p>
                <a href="${config.baseUri}/verify/${token}" class="button">Verify Email</a>
                <p>If you're having trouble clicking the button, copy and paste the following link into your browser:</p>
                <p><a href="${config.baseUri}/verify/${token}">${config.baseUri}/verify/${token}</a></p>
                <p>If you did not create an account with ${name}, please disregard this email.</p>
              </div>
              <div class="footer">
                <p>Thanks,<br/>The ${name} Team</p>
              </div>
            </div>
          </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw new Error('Failed to send verification email');
  }
}

/**
 * Sends a test email using SMTP settings stored in the database.
 *
 * @param {string} recipientEmail - The email address where the test email should be sent.
 * @returns {Promise<string>} A promise that resolves with a success message or rejects with an error message.
 */
async function sendTestEmail(recipientEmail) {
  try {
    const { transporter, smtpSettings, name } = await getSMTPSettings();

    const mailOptions = {
      from: `${smtpSettings.fromName} <${smtpSettings.fromAddress}>`,
      to: recipientEmail,
      subject: 'OverSee Test Message',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
            <style>
              /* Media Queries */
              @media only screen and (max-width: 500px) {
                .button { width: 100% !important; }
              }
              body {
                font-family: Arial, sans-serif;
                background-color: #f2f4f6;
                margin: 0;
                padding: 0;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
              }
              .header {
                text-align: center;
                padding: 20px;
              }
              .content {
                padding: 20px;
                font-size: 16px;
                color: #333333;
              }
              .footer {
                text-align: center;
                margin-top: 20px;
                color: #777777;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Hello from OverSee Panel!</h1>
              </div>
              <div class="content">
                <p>This is a test of the OverSee mail system. You're good to go!</p>
                <p>Regards,<br/>${name}</p>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} ${name}</p>
              </div>
            </div>
          </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Test Email sent to ${recipientEmail}`);
    return true;
  } catch (error) {
    console.error('Error sending test email:', error);
    return false;
  }
}

async function sendPasswordResetEmail(email, token) {
  try {
    const { transporter, smtpSettings, name } = await getSMTPSettings();

    const mailOptions = {
      from: `${smtpSettings.fromName} <${smtpSettings.fromAddress}>`,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f9;
                padding: 0;
                margin: 0;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
              }
              .header {
                text-align: center;
                padding: 20px;
              }
              .content {
                padding: 20px;
                font-size: 16px;
                color: #333333;
              }
              .button {
                display: inline-block;
                padding: 14px 28px;
                font-size: 16px;
                color: #ffffff;
                background-color: #4caf50;
                text-decoration: none;
                border-radius: 5px;
                text-align: center;
                margin: 20px 0;
              }
              .footer {
                text-align: center;
                margin-top: 20px;
                color: #777777;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2>Password Reset Request</h2>
              </div>
              <div class="content">
                <p>Hello,</p>
                <p>We received a request to reset your password. Click the button below to reset it:</p>
                <a href="${config.baseUri}/auth/reset/${token}" class="button">Reset Password</a>
                <p>If the button above does not work, click the link below:</p>
                <p><a href="${config.baseUri}/auth/reset/${token}">${config.baseUri}/auth/reset/${token}</a></p>
                <p>If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
              </div>
              <div class="footer">
                <p>Thank you,<br/>The ${name} Team</p>
              </div>
            </div>
          </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
}

module.exports = {
  sendPasswordResetEmail, 
  sendWelcomeEmail,
  sendTestEmail,
  sendVerificationEmail,
};
