// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session && req.session.user_id) {
        // Update last activity timestamp
        req.session.last_activity = Date.now();
        return next();
    } else {
        // Store the requested URL for redirect after login
        req.session.returnUrl = req.originalUrl;
        
        // For API requests, return JSON instead of redirect
        if (req.path.startsWith('/api/') || req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
                redirect: '/login'
            });
        }
        
        return res.redirect('/login');
    }
};

// Check if user is already logged in (for login/signup pages)
const redirectIfLoggedIn = (req, res, next) => {
    if (req.session && req.session.user_id) {
        return res.redirect('/home');
    }
    return next();
};

// Session timeout check
const checkSessionTimeout = (req, res, next) => {
    const sessionTimeout = parseInt(process.env.SESSION_TIMEOUT) * 1000 || 1800000; // 30 minutes
    
    if (req.session && req.session.user_id && req.session.last_activity) {
        const now = Date.now();
        const inactiveTime = now - req.session.last_activity;
        
        if (inactiveTime >= sessionTimeout) {
            // Session expired
            req.session.destroy((err) => {
                if (err) {
                    console.error('Session destruction error:', err);
                }
                res.clearCookie('sessionId');
                res.clearCookie('remember_user');
                
                // For API requests, return JSON instead of redirect
                if (req.path.startsWith('/api/') || req.headers.accept && req.headers.accept.includes('application/json')) {
                    return res.status(401).json({
                        success: false,
                        message: 'Session expired',
                        redirect: '/login'
                    });
                }
                
                return res.redirect('/login');
            });
            return;
        } else {
            // Update last activity
            req.session.last_activity = now;
        }
    }
    
    next();
};

module.exports = {
    requireAuth,
    redirectIfLoggedIn,
    checkSessionTimeout
};
