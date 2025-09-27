const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { requireAuth, redirectIfLoggedIn } = require('../middleware/auth');

const router = express.Router();

// Home page (redirect to home)
router.get('/', (req, res) => {
    res.redirect('/home');
});

// Home page
router.get('/home', (req, res) => {
    res.render('home', {
        title: 'GLPF Microplastic Project',
        currentPage: 'home',
        user: req.session.user_id ? {
            username: req.session.username,
            email: req.session.email
        } : null,
        pageSpecificJS: ['js/map-home.js']
    });
});

// Login page
router.get('/login', redirectIfLoggedIn, (req, res) => {
    res.render('login', {
        title: 'Login - MicroPlastics Data System',
        error: req.query.error || '',
        returnUrl: req.session.returnUrl || '/home'
    });
});

// Signup page
router.get('/signup', redirectIfLoggedIn, (req, res) => {
    res.render('signup', {
        title: 'Sign Up - MicroPlastics Data System',
        error: req.query.error || ''
    });
});

// About page
router.get('/about', (req, res) => {
    res.render('about', {
        title: 'About - MicroPlastics Data System',
        currentPage: 'about',
        user: req.session.user_id ? {
            username: req.session.username,
            email: req.session.email
        } : null
    });
});

// Documentation page
router.get('/documentation', (req, res) => {
    res.render('documentation', {
        title: 'Documentation - MicroPlastics Data System',
        currentPage: 'documentation',
        user: req.session.user_id ? {
            username: req.session.username,
            email: req.session.email
        } : null
    });
});

// Review page
router.get('/review', (req, res) => {
    res.render('review', {
        title: 'Review Data - MicroPlastics Data System',
        currentPage: 'review',
        user: req.session.user_id ? {
            username: req.session.username,
            email: req.session.email
        } : null,
        pageSpecificJS: ['js/map-review.js']
    });
});

// Enter and Edit Data page
router.get('/enter_and_edit_data', (req, res) => {
    res.render('enter_and_edit_data', {
        title: 'Enter and Edit Data - MicroPlastics Data System',
        currentPage: 'enter_and_edit_data',
        user: req.session.user_id ? {
            username: req.session.username,
            email: req.session.email
        } : null,
        pageSpecificJS: ['js/enter-and-edit-map.js']
    });
});

// Enter Data by Form page
router.get('/enter_data_by_form', requireAuth, (req, res) => {
    res.render('enter_data_by_form', {
        title: 'Enter Data by Form - MicroPlastics Data System',
        currentPage: 'enter_data_by_form',
        user: {
            username: req.session.username,
            email: req.session.email
        },
        pageSpecificJS: ['js/form-handler.js', 'js/map-data-entry.js']
    });
});

// Enter Data by File page
router.get('/enter_data_by_file', requireAuth, (req, res) => {
    res.render('enter_data_by_file', {
        title: 'Enter Data by File - MicroPlastics Data System',
        currentPage: 'enter_data_by_file',
        user: {
            username: req.session.username,
            email: req.session.email
        },
        pageSpecificJS: ['js/form-loader.js', 'js/multi-form-handler.js']
    });
});

// Reset Password page - handled by auth.js routes
// router.get('/reset_password', redirectIfLoggedIn, (req, res) => {
//     res.render('reset_password', {
//         title: 'Reset Password - MicroPlastics Data System',
//         error: req.query.error || ''
//     });
// });

// Reset Password redirect route (user requested /reset-password instead of /auth/reset-password)
router.get('/reset-password', (req, res) => {
    // Preserve query parameters (like token) when redirecting
    const queryString = req.url.split('?')[1];
    const redirectUrl = queryString ? `/auth/reset-password?${queryString}` : '/auth/reset-password';
    res.redirect(redirectUrl);
});

// Reset Password Expired page
router.get('/reset-password-expired', (req, res) => {
    res.render('reset_password_expired', {
        title: 'Reset Link Expired - MicroPlastics Data System'
    });
});

// Captcha Test page
router.get('/captcha_test', (req, res) => {
    res.render('captcha_test', {
        title: 'Captcha Test - MicroPlastics Data System'
    });
});

// My Locations page (requires authentication)
router.get('/my-locations', requireAuth, (req, res) => {
    res.render('my_locations_fixed', {
        title: 'My Locations - MicroPlastics Data System',
        currentPage: 'my-locations',
        user: {
            username: req.session.username,
            email: req.session.email,
            id: req.session.user_id
        }
    });
});

// My Locations VIEW page (requires authentication)
router.get('/my-locations-view', requireAuth, (req, res) => {
    res.render('my_locations_view', {
        title: 'My Locations VIEW - MicroPlastics Data System',
        currentPage: 'my-locations',
        user: {
            username: req.session.username,
            email: req.session.email,
            id: req.session.user_id
        }
    });
});

// My Samples page (requires authentication)
router.get('/my-samples', requireAuth, (req, res) => {
    res.render('my_samples', {
        title: 'My Samples - MicroPlastics Data System',
        currentPage: 'my-samples',
        user: {
            username: req.session.username,
            email: req.session.email,
            id: req.session.user_id
        }
    });
});

// Logout route (GET)
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destruction error:', err);
        }
        res.clearCookie('sessionId');
        res.clearCookie('remember_user');
        res.redirect('/login');
    });
});

// My Profile page (requires authentication)
router.get('/my-profile', requireAuth, async (req, res) => {
    try {
        // Get user data
        const [userRows] = await pool.execute(
            'SELECT * FROM users WHERE User_UniqueID = ?',
            [req.session.user_id]
        );

        if (userRows.length === 0) {
            return res.redirect('/login');
        }

        // Get storage locations for dropdown
        const [storageRows] = await pool.execute(
            'SELECT StorageLocUniqueID, StorageLoc_Desc FROM StorageLoc_Ref ORDER BY StorageLoc_Desc'
        );

        res.render('my_profile', {
            title: 'My Profile - MicroPlastics Data System',
            currentPage: 'my-profile',
            user: userRows[0],
            storageLocations: storageRows,
            success: req.query.success,
            error: req.query.error
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        res.render('my_profile', {
            title: 'My Profile - MicroPlastics Data System',
            currentPage: 'my-profile',
            user: req.session,
            storageLocations: [],
            error: 'Failed to load profile data'
        });
    }
});

// Update profile (POST)
router.post('/my-profile', requireAuth, [
    body('full_name').trim().isLength({ min: 1 }).withMessage('Full name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('institution').trim().isLength({ min: 1 }).withMessage('Institution is required'),
    body('cell_phone').optional({ checkFalsy: true }).isMobilePhone('en-US').withMessage('Valid phone number required'),
    body('sample_confidentiality').isIn(['public', 'restricted', 'private']).withMessage('Invalid confidentiality setting'),
    body('sample_storage_location').optional({ checkFalsy: true }).isInt().withMessage('Invalid storage location'),
    body('new_password').optional({ checkFalsy: true }).isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('confirm_password').custom((value, { req }) => {
        if (req.body.new_password && value !== req.body.new_password) {
            throw new Error('Passwords do not match');
        }
        return true;
    })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.redirect(`/my-profile?error=${encodeURIComponent(errors.array()[0].msg)}`);
        }

        const {
            full_name,
            email,
            institution,
            cell_phone,
            sample_confidentiality,
            sample_storage_location,
            current_password,
            new_password
        } = req.body;

        // Get current user data
        const [userRows] = await pool.execute(
            'SELECT * FROM users WHERE User_UniqueID = ?',
            [req.session.user_id]
        );

        if (userRows.length === 0) {
            return res.redirect('/login');
        }

        const currentUser = userRows[0];

        // Check if email is already taken by another user
        const [emailRows] = await pool.execute(
            'SELECT User_UniqueID FROM users WHERE email = ? AND User_UniqueID != ?',
            [email, req.session.user_id]
        );

        if (emailRows.length > 0) {
            return res.redirect('/my-profile?error=Email is already registered to another account');
        }

        // Prepare update data
        let updateData = {
            full_name,
            email,
            institution,
            sample_confidentiality,
            cell_phone: cell_phone || null,
            sample_storage_location: sample_storage_location || null
        };

        // Handle password change
        if (new_password) {
            if (!current_password) {
                return res.redirect('/my-profile?error=Current password is required to change password');
            }

            const passwordMatch = await bcrypt.compare(current_password, currentUser.password);
            if (!passwordMatch) {
                return res.redirect('/my-profile?error=Current password is incorrect');
            }

            const hashedPassword = await bcrypt.hash(new_password, 10);
            updateData.password = hashedPassword;
        }

        // Build dynamic SQL query
        const updateFields = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
        const updateValues = Object.values(updateData);
        updateValues.push(req.session.user_id);

        await pool.execute(
            `UPDATE users SET ${updateFields}, updated_at = CURRENT_TIMESTAMP WHERE User_UniqueID = ?`,
            updateValues
        );

        // Update session data
        req.session.email = email;

        res.redirect('/my-profile?success=1');
    } catch (error) {
        console.error('Error updating profile:', error);
        res.redirect('/my-profile?error=Failed to update profile');
    }
});

// Contact page
router.get('/contact', (req, res) => {
    res.render('contact', {
        title: 'Contact Us - MicroPlastics Data System',
        currentPage: 'contact',
        user: req.session.user_id ? {
            username: req.session.username,
            email: req.session.email
        } : null
    });
});

// Admin Contact Management page
router.get('/admin/contact', requireAuth, (req, res) => {
    res.render('admin-contact', {
        title: 'Contact Form Submissions - Admin',
        currentPage: 'admin-contact',
        user: req.session.user_id ? {
            username: req.session.username,
            email: req.session.email
        } : null
    });
});

module.exports = router;
