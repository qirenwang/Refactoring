const session = require('express-session');
require('dotenv').config();

const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'your-secret-key-here',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Always false in development to support HTTP
        httpOnly: process.env.COOKIE_HTTP_ONLY !== 'false',
        maxAge: parseInt(process.env.SESSION_TIMEOUT) * 1000 || 1800000, // 30 minutes default
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax' // Relaxed for development
    },
    name: 'sessionId'
};

module.exports = sessionConfig;
