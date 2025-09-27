const express = require('express');
const session = require('express-session');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

// Set default NODE_ENV if not specified
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'development';
}

const { testConnection } = require('./config/database');
const sessionConfig = require('./config/session');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware - completely disable CSP in development
if (process.env.NODE_ENV === 'production') {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://code.jquery.com", "https://cdn.jsdelivr.net", "https://stackpath.bootstrapcdn.com"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'"]
            }
        }
    }));
} else {
    // Completely disable security headers in development
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: false,
        crossOriginResourcePolicy: false,
        dnsPrefetchControl: false,
        frameguard: false,
        hidePoweredBy: false,
        hsts: false,
        ieNoOpen: false,
        noSniff: false,
        originAgentCluster: false,
        permittedCrossDomainPolicies: false,
        referrerPolicy: false,
        xssFilter: false
    }));
}

// CORS configuration - Allow access from any IP in development
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? 
        // In production, use specific allowed origins
        (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : false) :
        // In development, allow any origin
        true,
    credentials: true,
    optionsSuccessStatus: 200,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
}));

// Additional CORS handling for preflight requests
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(200);
});

// Logging middleware - skip GET /api/check-session requests
app.use(morgan('combined', {
    skip: function (req, res) {
        return req.method === 'GET' && (req.url === '/api/check-session' || req.path === '/api/check-session');
    }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session middleware
app.use(session(sessionConfig));

// View engine setup (using EJS for server-side rendering)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Import routes
const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const apiRoutes = require('./routes/api');

// Authentication middleware
const { checkSessionTimeout } = require('./middleware/auth');
app.use(checkSessionTimeout);

// Routes
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

// Page routes should be evaluated before legacy API fallbacks
app.use('/', pageRoutes);

// Legacy PHP compatibility routes (direct path matching)
// Keep this AFTER page routes so paths like /my-samples render EJS, while
// legacy endpoints (e.g., /php/get_map_data.php) still function.
app.use('/', apiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', { 
        error: 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', { 
        error: 'Page not found',
        message: 'The requested page could not be found.'
    });
});

// Start server
async function startServer() {
    try {
        // Test database connection
        const dbConnected = await testConnection();
        if (!dbConnected) {
            console.error('Failed to connect to database. Server not started.');
            process.exit(1);
        }        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Local access: http://localhost:${PORT}`);
            console.log(`Network access: http://192.168.31.158:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
