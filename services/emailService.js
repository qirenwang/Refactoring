const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter for sending emails
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Verify transporter configuration
transporter.verify((error, success) => {
    if (error) {
        console.error('Email transporter verification failed:', error);
    } else {
        console.log('Email transporter is ready to send emails');
    }
});

/**
 * Send password reset email
 * @param {string} to - Recipient email address
 * @param {string} resetLink - Password reset link
 * @param {string} username - User's username
 */
async function sendPasswordResetEmail(to, resetLink, username) {
    const mailOptions = {
        from: {
            name: 'MicroPlastics Data System',
            address: process.env.SMTP_USER
        },
        to: to,
        subject: 'Password Reset Request - MicroPlastics Data System',
        html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    background-color: #f8f9fa;
                    margin: 0;
                    padding: 20px;
                }
                .email-container {
                    max-width: 600px;
                    margin: 0 auto;
                    background-color: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
                    overflow: hidden;
                }
                .email-header {
                    background-color: #3bb4e5;
                    color: white;
                    padding: 30px;
                    text-align: center;
                }
                .email-header h1 {
                    margin: 0;
                    font-size: 24px;
                    font-weight: 600;
                }
                .email-body {
                    padding: 40px 30px;
                }
                .email-body h2 {
                    color: #1c87b3;
                    margin-top: 0;
                    font-size: 20px;
                }
                .reset-button {
                    display: inline-block;
                    background-color: #3bb4e5;
                    color: white;
                    padding: 15px 30px;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: 500;
                    margin: 20px 0;
                    transition: background-color 0.2s ease;
                }
                .reset-button:hover {
                    background-color: #1c87b3;
                }
                .warning-box {
                    background-color: #fff3cd;
                    border: 1px solid #ffeaa7;
                    border-radius: 6px;
                    padding: 15px;
                    margin: 20px 0;
                    color: #856404;
                }
                .email-footer {
                    background-color: #f5f5f5;
                    padding: 20px 30px;
                    text-align: center;
                    font-size: 14px;
                    color: #666;
                    border-top: 1px solid #e0e0e0;
                }
                .link-text {
                    word-break: break-all;
                    background-color: #f8f9fa;
                    padding: 10px;
                    border-radius: 4px;
                    font-family: monospace;
                    font-size: 14px;
                    margin: 10px 0;
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="email-header">
                    <h1>🔐 Password Reset Request</h1>
                </div>
                
                <div class="email-body">
                    <h2>Hello ${username},</h2>
                    
                    <p>We received a request to reset your password for your MicroPlastics Data System account.</p>
                    
                    <p>Click the button below to reset your password:</p>
                    
                    <div style="text-align: center;">
                        <a href="${resetLink}" class="reset-button">Reset Password</a>
                    </div>
                    
                    <p>Or copy and paste this link into your browser:</p>
                    <div class="link-text">${resetLink}</div>
                    
                    <div class="warning-box">
                        <strong>⚠️ Important:</strong>
                        <ul>
                            <li>This link will expire in 1 hour</li>
                            <li>This link can only be used once</li>
                            <li>If you didn't request this reset, please ignore this email</li>
                            <li>Your password will remain unchanged unless you use this link</li>
                        </ul>
                    </div>
                    
                    <p>If you're having trouble with the button above, copy and paste the URL into your web browser.</p>
                    
                    <p>Best regards,<br>
                    MicroPlastics Data System Team</p>
                </div>
                
                <div class="email-footer">
                    <p>This is an automated message. Please do not reply to this email.</p>
                    <p>© ${new Date().getFullYear()} MicroPlastics Data System. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `,
        text: `
        Password Reset Request - MicroPlastics Data System
        
        Hello ${username},
        
        We received a request to reset your password for your MicroPlastics Data System account.
        
        Please click the following link to reset your password:
        ${resetLink}
        
        IMPORTANT:
        - This link will expire in 1 hour
        - This link can only be used once
        - If you didn't request this reset, please ignore this email
        
        Best regards,
        MicroPlastics Data System Team
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Password reset email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending password reset email:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send password reset confirmation email
 * @param {string} to - Recipient email address
 * @param {string} username - User's username
 */
async function sendPasswordResetConfirmationEmail(to, username) {
    const mailOptions = {
        from: {
            name: 'MicroPlastics Data System',
            address: process.env.SMTP_USER
        },
        to: to,
        subject: 'Password Reset Successful - MicroPlastics Data System',
        html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    background-color: #f8f9fa;
                    margin: 0;
                    padding: 20px;
                }
                .email-container {
                    max-width: 600px;
                    margin: 0 auto;
                    background-color: #ffffff;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
                    overflow: hidden;
                }
                .email-header {
                    background-color: #27ae60;
                    color: white;
                    padding: 30px;
                    text-align: center;
                }
                .email-header h1 {
                    margin: 0;
                    font-size: 24px;
                    font-weight: 600;
                }
                .email-body {
                    padding: 40px 30px;
                }
                .email-footer {
                    background-color: #f5f5f5;
                    padding: 20px 30px;
                    text-align: center;
                    font-size: 14px;
                    color: #666;
                    border-top: 1px solid #e0e0e0;
                }
                .success-box {
                    background-color: #d1ecf1;
                    border: 1px solid #bee5eb;
                    border-radius: 6px;
                    padding: 15px;
                    margin: 20px 0;
                    color: #0c5460;
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="email-header">
                    <h1>✅ Password Reset Successful</h1>
                </div>
                
                <div class="email-body">
                    <h2>Hello ${username},</h2>
                    
                    <div class="success-box">
                        <strong>Great news!</strong> Your password has been successfully reset.
                    </div>
                    
                    <p>Your MicroPlastics Data System account password has been updated successfully. You can now log in with your new password.</p>
                    
                    <p>If you didn't make this change, please contact our support team immediately.</p>
                    
                    <p>Best regards,<br>
                    MicroPlastics Data System Team</p>
                </div>
                
                <div class="email-footer">
                    <p>This is an automated message. Please do not reply to this email.</p>
                    <p>© ${new Date().getFullYear()} MicroPlastics Data System. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `,
        text: `
        Password Reset Successful - MicroPlastics Data System
        
        Hello ${username},
        
        Your MicroPlastics Data System account password has been successfully reset.
        You can now log in with your new password.
        
        If you didn't make this change, please contact our support team immediately.
        
        Best regards,
        MicroPlastics Data System Team
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Password reset confirmation email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending confirmation email:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send contact form submission to administrators
 * @param {Object} contactData - Contact form data
 */
async function sendContactFormEmail(contactData) {
    const {
        user_name,
        user_email,
        user_organization,
        question_category,
        user_question,
        subscribe_updates
    } = contactData;

    // List of administrators who should receive contact form submissions
    const adminEmails = [
        process.env.ADMIN_EMAIL_1 || process.env.SMTP_USER,
        process.env.ADMIN_EMAIL_2,
        process.env.ADMIN_EMAIL_3
    ].filter(email => email); // Remove undefined emails

    const mailOptions = {
        from: {
            name: 'MicroPlastics Data System - Contact Form',
            address: process.env.SMTP_USER
        },
        to: adminEmails,
        replyTo: user_email,
        subject: `Contact Form Submission: ${question_category} - ${user_name}`,
        html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    background-color: #f8f9fa;
                    margin: 0;
                    padding: 20px;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    overflow: hidden;
                }
                .header {
                    background: linear-gradient(135deg, #007bff, #0056b3);
                    color: white;
                    padding: 30px;
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                }
                .content {
                    padding: 30px;
                }
                .field-group {
                    margin-bottom: 20px;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 15px;
                }
                .field-label {
                    font-weight: bold;
                    color: #007bff;
                    margin-bottom: 5px;
                    font-size: 14px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .field-value {
                    font-size: 16px;
                    margin-bottom: 10px;
                }
                .question-text {
                    background-color: #f8f9fa;
                    padding: 15px;
                    border-radius: 4px;
                    border-left: 4px solid #007bff;
                    font-style: italic;
                }
                .footer {
                    background-color: #f8f9fa;
                    padding: 20px;
                    text-align: center;
                    font-size: 12px;
                    color: #666;
                }
                .badge {
                    display: inline-block;
                    background-color: #28a745;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-size: 12px;
                    margin-left: 10px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📧 New Contact Form Submission</h1>
                    <p>MicroPlastics Data System</p>
                </div>
                
                <div class="content">
                    <div class="field-group">
                        <div class="field-label">👤 Contact Information</div>
                        <div class="field-value"><strong>Name:</strong> ${user_name}</div>
                        <div class="field-value"><strong>Email:</strong> <a href="mailto:${user_email}">${user_email}</a></div>
                        ${user_organization ? `<div class="field-value"><strong>Organization:</strong> ${user_organization}</div>` : ''}
                    </div>
                    
                    <div class="field-group">
                        <div class="field-label">📂 Category</div>
                        <div class="field-value">${question_category}</div>
                    </div>
                    
                    <div class="field-group">
                        <div class="field-label">💬 Question</div>
                        <div class="question-text">${user_question}</div>
                    </div>
                    
                    ${subscribe_updates === 'yes' ? '<div class="field-group"><div class="field-label">📬 Newsletter</div><div class="field-value">User requested to receive updates <span class="badge">Subscribe</span></div></div>' : ''}
                    
                    <div class="field-group">
                        <div class="field-label">⏰ Submitted</div>
                        <div class="field-value">${new Date().toLocaleString()}</div>
                    </div>
                </div>
                
                <div class="footer">
                    <p>You can reply directly to this email to respond to ${user_name}.</p>
                    <p>This message was sent from the MicroPlastics Data System contact form.</p>
                </div>
            </div>
        </body>
        </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Contact form email sent to administrators:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending contact form email:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send confirmation email to user who submitted contact form
 * @param {Object} contactData - Contact form data
 */
async function sendContactConfirmationEmail(contactData) {
    const { user_name, user_email, question_category } = contactData;

    const mailOptions = {
        from: {
            name: 'MicroPlastics Data System',
            address: process.env.SMTP_USER
        },
        to: user_email,
        subject: 'Thank you for contacting us - MicroPlastics Data System',
        html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    background-color: #f8f9fa;
                    margin: 0;
                    padding: 20px;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    overflow: hidden;
                }
                .header {
                    background: linear-gradient(135deg, #28a745, #20c997);
                    color: white;
                    padding: 30px;
                    text-align: center;
                }
                .header h1 {
                    margin: 0;
                    font-size: 24px;
                }
                .content {
                    padding: 30px;
                }
                .highlight-box {
                    background-color: #e8f5e8;
                    border: 1px solid #28a745;
                    border-radius: 4px;
                    padding: 15px;
                    margin: 20px 0;
                }
                .footer {
                    background-color: #f8f9fa;
                    padding: 20px;
                    text-align: center;
                    font-size: 12px;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✅ Message Received</h1>
                    <p>Thank you for contacting us!</p>
                </div>
                
                <div class="content">
                    <p>Dear ${user_name},</p>
                    
                    <p>Thank you for reaching out to us regarding <strong>${question_category}</strong>. We have received your message and will review it carefully.</p>
                    
                    <div class="highlight-box">
                        <strong>⏱️ Response Time:</strong> We typically respond to inquiries within 1-2 business days.
                    </div>
                    
                    <p>If you have additional questions or need urgent assistance, please don't hesitate to contact us again.</p>
                    
                    <p>Best regards,<br>
                    <strong>MicroPlastics Data System Team</strong><br>
                    Wayne State University</p>
                </div>
                
                <div class="footer">
                    <p>This is an automated confirmation email.</p>
                    <p>MicroPlastics Data System - Wayne State University</p>
                </div>
            </div>
        </body>
        </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Contact confirmation email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending contact confirmation email:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendPasswordResetEmail,
    sendPasswordResetConfirmationEmail,
    sendContactFormEmail,
    sendContactConfirmationEmail
};
