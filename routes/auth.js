const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const canvas = require('@napi-rs/canvas');
const { pool } = require('../config/database');
const { redirectIfLoggedIn } = require('../middleware/auth');
const { sendPasswordResetEmail, sendPasswordResetConfirmationEmail } = require('../services/emailService');

const router = express.Router();

// Helper function to generate captcha
function generateCaptcha() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Helper function to create captcha image
function createCaptchaImage(text) {
    const width = 150;
    const height = 50;
    const canvas_obj = canvas.createCanvas(width, height);
    const ctx = canvas_obj.getContext('2d');

    // Background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);

    // Add noise lines
    ctx.strokeStyle = '#ccc';
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * width, Math.random() * height);
        ctx.lineTo(Math.random() * width, Math.random() * height);
        ctx.stroke();
    }

    // Draw text
    ctx.fillStyle = '#333';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, height / 2 + 8);

    return canvas_obj.toBuffer('image/png');
}

// Captcha route
router.get('/captcha', (req, res) => {
    const captchaText = generateCaptcha();
    req.session.captcha_code = captchaText;
    
    const imageBuffer = createCaptchaImage(captchaText);
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(imageBuffer);
});

// Login route
router.post('/login', 
    redirectIfLoggedIn,
    [
        body('login').notEmpty().withMessage('Username or email is required'),
        body('password').notEmpty().withMessage('Password is required'),
        body('captcha').notEmpty().withMessage('Verification code is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }

            const { login, password, captcha, remember } = req.body;

            // Check captcha
            if (!req.session.captcha_code) {
                return res.status(400).json({
                    success: false,
                    message: 'Verification code has expired. Please try again.'
                });
            }

            if (captcha.toLowerCase() !== req.session.captcha_code.toLowerCase()) {
                delete req.session.captcha_code;
                return res.status(400).json({
                    success: false,
                    message: 'Verification code is incorrect'
                });
            }

            // Clear captcha after use
            delete req.session.captcha_code;

            // Check user credentials
            const [rows] = await pool.execute(
                'SELECT User_UniqueID as id, username, email, password FROM users WHERE username = ? OR email = ?',
                [login, login]
            );

            if (rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const user = rows[0];
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (!passwordMatch) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid password'
                });
            }

            // Create session
            req.session.user_id = user.id;
            req.session.username = user.username;
            req.session.email = user.email;
            req.session.last_activity = Date.now();

            // Set remember cookie if requested
            if (remember) {
                res.cookie('remember_user', user.username, {
                    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production'
                });
            }

            res.json({
                success: true,
                message: 'Login successful',
                redirectUrl: '/home'
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred during login'
            });
        }
    }
);

// Signup route
router.post('/signup',
    redirectIfLoggedIn,
    [
        body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
        body('email').isEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
        body('confirm_password').custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),
        body('captcha').notEmpty().withMessage('Verification code is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }

            const { username, email, password, captcha } = req.body;

            // Check captcha
            if (!req.session.captcha_code) {
                return res.status(400).json({
                    success: false,
                    message: 'Verification code has expired. Please try again.'
                });
            }

            if (captcha.toLowerCase() !== req.session.captcha_code.toLowerCase()) {
                delete req.session.captcha_code;
                return res.status(400).json({
                    success: false,
                    message: 'Verification code is incorrect'
                });
            }

            // Clear captcha after use
            delete req.session.captcha_code;            // Check if user already exists
            const [existingUsers] = await pool.execute(
                'SELECT User_UniqueID as id FROM users WHERE username = ? OR email = ?',
                [username, email]
            );

            if (existingUsers.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Username or email already exists'
                });
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 12);

            // Insert new user
            const [result] = await pool.execute(
                'INSERT INTO users (username, email, password, created_at) VALUES (?, ?, ?, NOW())',
                [username, email, hashedPassword]
            );

            // Create session for new user
            req.session.user_id = result.insertId;
            req.session.username = username;
            req.session.email = email;
            req.session.last_activity = Date.now();

            res.json({
                success: true,
                message: 'Account created successfully',
                redirectUrl: '/home'
            });

        } catch (error) {
            console.error('Signup error:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred during signup'
            });
        }
    }
);

// Logout route
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destruction error:', err);
            return res.status(500).json({
                success: false,
                message: 'Error during logout'
            });
        }
        
        res.clearCookie('sessionId');
        res.clearCookie('remember_user');
        
        res.json({
            success: true,
            message: 'Logged out successfully',
            redirectUrl: '/login'
        });
    });
});

// Check session status (for AJAX requests)
router.get('/check-session', (req, res) => {
    const sessionTimeout = parseInt(process.env.SESSION_TIMEOUT) * 1000 || 1800000;
    
    if (!req.session.user_id) {
        return res.json({
            logged_in: false,
            timeout: false
        });
    }

    const now = Date.now();
    const inactiveTime = now - (req.session.last_activity || now);
    
    if (inactiveTime >= sessionTimeout) {
        req.session.destroy((err) => {
            if (err) console.error('Session destruction error:', err);
        });
        
        return res.json({
            logged_in: false,
            timeout: true,
            message: 'Session expired due to inactivity'
    });
    }

    // Update last activity
    req.session.last_activity = now;
    
    res.json({
        logged_in: true,
        timeout: false,
        username: req.session.username
    });
});

// Password reset request route
router.post('/reset-password-request', 
    redirectIfLoggedIn,
    [
        body('email').isEmail().withMessage('Please enter a valid email address'),
        body('captcha').notEmpty().withMessage('Verification code is required')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }

            const { email, captcha } = req.body;

            // Check captcha
            if (!req.session.captcha_code) {
                return res.status(400).json({
                    success: false,
                    message: 'Verification code has expired. Please try again.'
                });
            }

            if (captcha.toLowerCase() !== req.session.captcha_code.toLowerCase()) {
                delete req.session.captcha_code;
                return res.status(400).json({
                    success: false,
                    message: 'Verification code is incorrect'
                });
            }

            // Clear captcha after use
            delete req.session.captcha_code;

            // Check if email exists in users table
            const [users] = await pool.execute(
                'SELECT User_UniqueID, username, email FROM users WHERE email = ?',
                [email]
            );

            if (users.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'This email address is not registered in our system.'
                });
            }

            const user = users[0];

            // Generate a secure random token
            const resetToken = crypto.randomBytes(32).toString('hex');
            
            // Set expiration time (1 hour from now)
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

            // Delete any existing tokens for this user
            await pool.execute(
                'DELETE FROM password_reset_tokens WHERE user_id = ? OR email = ?',
                [user.User_UniqueID, email]
            );

            // Store the reset token in database
            await pool.execute(
                'INSERT INTO password_reset_tokens (user_id, email, token, expires_at) VALUES (?, ?, ?, ?)',
                [user.User_UniqueID, email, resetToken, expiresAt]
            );            // Generate reset link
            const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`;

            // Send password reset email
            const emailResult = await sendPasswordResetEmail(email, resetLink, user.username);

            if (!emailResult.success) {
                console.error('Failed to send password reset email:', emailResult.error);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to send password reset email. Please try again later.'
                });
            }

            res.json({
                success: true,
                message: 'Password reset instructions have been sent to your email address.'
            });

        } catch (error) {
            console.error('Error in password reset request:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while processing your request. Please try again.'
            });
        }
    }
);

// Password reset form route (GET)
router.get('/reset-password', redirectIfLoggedIn, async (req, res) => {
    try {
        const { token } = req.query;
          if (!token) {
            return res.render('reset_password', {
                title: 'Password Reset',
                error: 'Invalid or missing reset token.',
                token: null
            });
        }
        
        // Verify token exists and get its details
        const [tokens] = await pool.execute(
            'SELECT * FROM password_reset_tokens WHERE token = ?',
            [token]
        );        if (tokens.length === 0) {
            return res.redirect('/reset-password-expired');
        }
        
        const tokenData = tokens[0];
        const currentTime = new Date();
        const expiresAt = new Date(tokenData.expires_at);
        const isExpired = currentTime > expiresAt;
        const isUsed = tokenData.used === 1;        if (isExpired || isUsed) {
            return res.redirect('/reset-password-expired');
        }

        res.render('reset_password', {
            title: 'Reset Password',
            token: token,
            error: null
        });

    } catch (error) {
        console.error('Error in password reset form:', error);
        res.render('reset_password', {
            title: 'Password Reset',
            error: 'An error occurred. Please try again.',
            token: null
        });
    }
});

// Password reset submit route (POST)
router.post('/reset-password', 
    redirectIfLoggedIn,
    [
        body('token').notEmpty().withMessage('Reset token is required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
        body('confirmPassword').custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Password confirmation does not match password');
            }
            return true;
        })
        // Note: No captcha required for password reset since user already proved email access
    ],    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }

            const { token, password } = req.body;

            // No captcha check needed for password reset - user already verified email access// Verify token exists and get its details
            const [tokens] = await pool.execute(
                'SELECT * FROM password_reset_tokens WHERE token = ?',
                [token]
            );

            if (tokens.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'This password reset link has expired or has already been used.',
                    redirect: '/reset-password-expired'
                });
            }

            const tokenData = tokens[0];
            const currentTime = new Date();
            const expiresAt = new Date(tokenData.expires_at);
            const isExpired = currentTime > expiresAt;
            const isUsed = tokenData.used === 1;

            if (isExpired || isUsed) {
                return res.status(400).json({
                    success: false,
                    message: 'This password reset link has expired or has already been used.',
                    redirect: '/reset-password-expired'
                });
            }

            const resetRecord = tokens[0];

            // Get user information
            const [users] = await pool.execute(
                'SELECT User_UniqueID, username, email FROM users WHERE User_UniqueID = ?',
                [resetRecord.user_id]
            );

            if (users.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'User not found.'
                });
            }

            const user = users[0];

            // Hash the new password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Update user's password
            await pool.execute(
                'UPDATE users SET password = ? WHERE User_UniqueID = ?',
                [hashedPassword, user.User_UniqueID]
            );

            // Mark token as used
            await pool.execute(
                'UPDATE password_reset_tokens SET used = 1 WHERE token = ?',
                [token]
            );

            // Send confirmation email
            await sendPasswordResetConfirmationEmail(user.email, user.username);

            res.json({
                success: true,
                message: 'Your password has been reset successfully. You can now log in with your new password.',
                redirectUrl: '/login'
            });

        } catch (error) {
            console.error('Error resetting password:', error);
            res.status(500).json({
                success: false,
                message: 'An error occurred while resetting your password. Please try again.'
            });
        }
    }
);

module.exports = router;
