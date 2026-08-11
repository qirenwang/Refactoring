const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { requireAuth, redirectIfLoggedIn } = require('../middleware/auth');
const {
    PASSWORD_REQUIREMENTS_MESSAGE,
    isStrongPassword
} = require('../utils/account-recovery');

const router = express.Router();

const optionalText = value => {
    if (typeof value !== 'string') return null;
    const trimmedValue = value.trim();
    return trimmedValue || null;
};

const optionalId = value => value ? Number.parseInt(value, 10) : null;

async function loadUserProfileReferenceData() {
    const [
        [organizationTypes],
        [countries],
        [states]
    ] = await Promise.all([
        pool.execute(`
            SELECT OrganizationTypeUniqueID, OrganizationType
            FROM OrganizationType_Ref
            ORDER BY OrganizationTypeUniqueID
        `),
        pool.execute(`
            SELECT CountryUniqueID, ISOAlpha2, Country
            FROM Country_Ref
            ORDER BY Country
        `),
        pool.execute(`
            SELECT StateUniqueID, State, Country_Num
            FROM State_Ref
            ORDER BY State
        `)
    ]);

    return { organizationTypes, countries, states };
}

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
router.get('/signup', redirectIfLoggedIn, async (req, res) => {
    try {
        const [
            [organizationTypes],
            [countries],
            [states]
        ] = await Promise.all([
            pool.execute(`
                SELECT OrganizationTypeUniqueID, OrganizationType
                FROM OrganizationType_Ref
                ORDER BY OrganizationTypeUniqueID
            `),
            pool.execute(`
                SELECT CountryUniqueID, ISOAlpha2, Country
                FROM Country_Ref
                ORDER BY Country
            `),
            pool.execute(`
                SELECT StateUniqueID, State, Country_Num
                FROM State_Ref
                ORDER BY State
            `)
        ]);

        res.render('signup', {
            title: 'Sign Up - MicroPlastics Data System',
            error: req.query.error || '',
            organizationTypes,
            countries,
            states
        });
    } catch (error) {
        console.error('Error loading signup reference data:', error);
        res.status(500).render('signup', {
            title: 'Sign Up - MicroPlastics Data System',
            error: 'Unable to load the signup form. Please try again later.',
            organizationTypes: [],
            countries: [],
            states: []
        });
    }
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
        } : null
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
    const rawEditSampleId = req.query.editSampleId;
    const parsedEditSampleId = typeof rawEditSampleId === 'string' && /^\d+$/.test(rawEditSampleId)
        ? Number(rawEditSampleId)
        : null;
    const editSampleId = Number.isSafeInteger(parsedEditSampleId) && parsedEditSampleId > 0
        ? parsedEditSampleId
        : null;

    res.render('enter_data_by_form', {
        title: editSampleId
            ? 'Edit My Data - MicroPlastics Data System'
            : 'Enter Data by Form - MicroPlastics Data System',
        currentPage: 'enter_data_by_form',
        user: {
            username: req.session.username,
            email: req.session.email
        },
        editSampleId,
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
        title: 'Edit My Data - MicroPlastics Data System',
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
        const [userRows] = await pool.execute(
            `SELECT
                users.User_UniqueID,
                users.username,
                users.email,
                users.first_name,
                users.last_name,
                users.organization,
                users.OrganizationType_Num,
                users.OrganizationTypeOther,
                users.job_title,
                users.Country_Num,
                users.State_Num,
                users.role,
                users.is_active,
                users.email_verified,
                users.created_at,
                users.updated_at
             FROM users
             WHERE users.User_UniqueID = ?`,
            [req.session.user_id]
        );

        if (userRows.length === 0) {
            return res.redirect('/login');
        }

        let referenceData;
        try {
            referenceData = await loadUserProfileReferenceData();
        } catch (referenceError) {
            console.error('Error loading profile reference data:', referenceError);
            return res.status(500).render('my_profile', {
                title: 'My Profile - MicroPlastics Data System',
                currentPage: 'my-profile',
                user: userRows[0],
                success: null,
                error: 'Your profile was loaded, but editing is temporarily unavailable. Please try again.',
                profileEditable: false,
                organizationTypes: [],
                countries: [],
                states: []
            });
        }

        return res.render('my_profile', {
            title: 'My Profile - MicroPlastics Data System',
            currentPage: 'my-profile',
            user: userRows[0],
            success: req.query.success,
            error: req.query.error,
            profileEditable: true,
            ...referenceData
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        return res.status(500).render('my_profile', {
            title: 'My Profile - MicroPlastics Data System',
            currentPage: 'my-profile',
            user: {
                username: req.session.username,
                email: req.session.email
            },
            error: 'Failed to load profile data',
            profileEditable: false,
            organizationTypes: [],
            countries: [],
            states: []
        });
    }
});

// Update profile (POST)
router.post('/my-profile', requireAuth, [
    body('first_name').trim().notEmpty().withMessage('First name is required').bail()
        .isLength({ max: 50 }).withMessage('First name is too long'),
    body('last_name').trim().notEmpty().withMessage('Last name is required').bail()
        .isLength({ max: 50 }).withMessage('Last name is too long'),
    body('email')
        .trim()
        .isEmail().withMessage('Valid email is required')
        .isLength({ max: 100 }).withMessage('Email is too long'),
    body('organization').trim().notEmpty().withMessage('Organization is required').bail()
        .isLength({ max: 100 }).withMessage('Organization is too long'),
    body('organization_type_num').notEmpty().withMessage('Organization type is required').bail()
        .isInt({ min: 1 }).withMessage('Invalid organization type'),
    body('organization_type_other').optional({ checkFalsy: true }).trim().isLength({ max: 255 }).withMessage('Other organization type is too long'),
    body('job_title').trim().notEmpty().withMessage('Job / Position Title is required').bail()
        .isLength({ max: 100 }).withMessage('Job / Position Title is too long'),
    body('country_num').notEmpty().withMessage('Country is required').bail()
        .isInt({ min: 1 }).withMessage('Invalid country'),
    body('state_num').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid state'),
    body('new_password').optional({ checkFalsy: true }).custom(value => {
        if (!isStrongPassword(value)) {
            throw new Error(PASSWORD_REQUIREMENTS_MESSAGE);
        }
        return true;
    }),
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
            first_name,
            last_name,
            email,
            organization,
            organization_type_num,
            organization_type_other,
            job_title,
            country_num,
            state_num,
            current_password,
            new_password
        } = req.body;

        const [userRows] = await pool.execute(
            'SELECT User_UniqueID, username, password FROM users WHERE User_UniqueID = ?',
            [req.session.user_id]
        );

        if (userRows.length === 0) {
            return res.redirect('/login');
        }

        const currentUser = userRows[0];

        if (currentUser.username.toLowerCase() === email.toLowerCase()) {
            return res.redirect('/my-profile?error=Username and email must be different');
        }

        const [conflictingUsers] = await pool.execute(
            `SELECT User_UniqueID
             FROM users
             WHERE User_UniqueID != ?
               AND (username = ? OR email = ?)
             LIMIT 1`,
            [req.session.user_id, email, email]
        );

        if (conflictingUsers.length > 0) {
            return res.redirect('/my-profile?error=Email is already registered to another account');
        }

        const organizationTypeId = optionalId(organization_type_num);
        const countryId = optionalId(country_num);
        const stateId = optionalId(state_num);
        let organizationTypeOther = optionalText(organization_type_other);

        if (organizationTypeId) {
            const [organizationTypeRows] = await pool.execute(
                `SELECT OrganizationType
                 FROM OrganizationType_Ref
                 WHERE OrganizationTypeUniqueID = ?`,
                [organizationTypeId]
            );

            if (organizationTypeRows.length === 0) {
                return res.redirect('/my-profile?error=Invalid organization type');
            }

            if (organizationTypeRows[0].OrganizationType === 'Other (please specify)') {
                if (!organizationTypeOther) {
                    return res.redirect('/my-profile?error=Other organization type is required');
                }
            } else {
                organizationTypeOther = null;
            }
        } else {
            organizationTypeOther = null;
        }

        let selectedCountry = null;
        if (countryId) {
            const [countryRows] = await pool.execute(
                'SELECT CountryUniqueID, ISOAlpha2 FROM Country_Ref WHERE CountryUniqueID = ?',
                [countryId]
            );

            if (countryRows.length === 0) {
                return res.redirect('/my-profile?error=Invalid country');
            }

            [selectedCountry] = countryRows;
        }

        if (stateId && !countryId) {
            return res.redirect('/my-profile?error=Select a country before selecting a state');
        }

        const isUnitedStates = selectedCountry && selectedCountry.ISOAlpha2 === 'US';
        if (isUnitedStates && !stateId) {
            return res.redirect('/my-profile?error=State is required when United States is selected');
        }

        if (!isUnitedStates && stateId) {
            return res.redirect('/my-profile?error=State can only be selected for United States');
        }

        if (stateId) {
            const [stateRows] = await pool.execute(
                `SELECT StateUniqueID
                 FROM State_Ref
                 WHERE StateUniqueID = ? AND Country_Num = ?`,
                [stateId, countryId]
            );

            if (stateRows.length === 0) {
                return res.redirect('/my-profile?error=Invalid state for the selected country');
            }
        }

        const updateData = {
            first_name: optionalText(first_name),
            last_name: optionalText(last_name),
            email,
            organization: optionalText(organization),
            OrganizationType_Num: organizationTypeId,
            OrganizationTypeOther: organizationTypeOther,
            job_title: optionalText(job_title),
            Country_Num: countryId,
            State_Num: stateId
        };

        if (new_password) {
            if (!current_password) {
                return res.redirect('/my-profile?error=Current password is required to change password');
            }

            const passwordMatch = await bcrypt.compare(current_password, currentUser.password);
            if (!passwordMatch) {
                return res.redirect('/my-profile?error=Current password is incorrect');
            }

            const hashedPassword = await bcrypt.hash(new_password, 12);
            updateData.password = hashedPassword;
        }

        const updateFields = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
        const updateValues = Object.values(updateData);
        updateValues.push(req.session.user_id);

        await pool.execute(
            `UPDATE users SET ${updateFields}, updated_at = CURRENT_TIMESTAMP WHERE User_UniqueID = ?`,
            updateValues
        );

        req.session.email = email;

        return res.redirect('/my-profile?success=1');
    } catch (error) {
        console.error('Error updating profile:', error);

        if (error.code === 'ER_DUP_ENTRY') {
            return res.redirect('/my-profile?error=Email is already registered to another account');
        }

        return res.redirect('/my-profile?error=Failed to update profile');
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
