const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'API server is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        cors: {
            origin: req.headers.origin || 'no-origin',
            host: req.headers.host,
            userAgent: req.headers['user-agent']
        }
    });
});

// CORS test endpoint
router.get('/cors-test', (req, res) => {
    res.json({
        success: true,
        message: 'CORS is working correctly',
        headers: {
            origin: req.headers.origin,
            host: req.headers.host,
            referer: req.headers.referer,
            userAgent: req.headers['user-agent']
        },
        timestamp: new Date().toISOString()
    });
});

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Get map data (compatible with original PHP API)
router.get('/php/get_map_data.php', async (req, res) => {
    try {
        // Build the SQL query with optional filters (similar to PHP version)
        let sql = `
            SELECT 
                s.id as SampleUniqueID,
                s.location_name as location,
                CONCAT(s.city, ' ', s.state) as zipCode,
                s.latitude as lat, 
                s.longitude as lng,
                st.type_name as sampleType,
                DATE(s.collection_date) as date,
                s.media_type as plasticTypes,
                s.particle_count as particleCount
            FROM sample_data s
            LEFT JOIN sample_types_ref st ON s.sample_type = st.id
            WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL
        `;
        
        const params = [];
        
        // Apply ZIP code filter if provided (search in city or state)
        if (req.query.zipcode && req.query.zipcode.trim()) {
            sql += " AND (s.city LIKE ? OR s.state LIKE ?)";
            const zipFilter = `%${req.query.zipcode.trim()}%`;
            params.push(zipFilter, zipFilter);
        }
        
        // Apply plastic type filter if provided (search in media_type)
        if (req.query.plastic_type && req.query.plastic_type.trim()) {
            sql += " AND s.media_type LIKE ?";
            params.push(`%${req.query.plastic_type.trim()}%`);
        }
        
        // Order by collection date (most recent first)
        sql += " ORDER BY s.collection_date DESC";
        
        // Execute the query
        const [rows] = await pool.execute(sql, params);
        
        // Format the data to match the PHP response format
        const formattedData = rows.map(row => ({
            SampleUniqueID: row.SampleUniqueID,
            location: row.location || 'Unknown Location',
            zipCode: row.zipCode || 'N/A',
            lat: parseFloat(row.lat),
            lng: parseFloat(row.lng),
            sampleType: row.sampleType || 'Unknown',
            date: row.date,
            plasticTypes: row.plasticTypes || 'N/A',
            particleCount: row.particleCount || 0
        }));
        
        // Return the data as JSON (matching PHP response format)
        res.json({
            success: true,
            count: formattedData.length,
            data: formattedData,
            timestamp: new Date().toISOString().slice(0, 19).replace('T', ' ') // MySQL datetime format
        });
        
    } catch (error) {
        console.error('Error fetching map data:', error);
        res.json({
            success: false,
            message: error.message
        });
    }
});

// Get map data
router.get('/map-data', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT 
                id,
                latitude,
                longitude,
                sample_type,
                location_name,
                collection_date,
                created_by
            FROM sample_data 
            WHERE latitude IS NOT NULL 
            AND longitude IS NOT NULL
            ORDER BY collection_date DESC
        `);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching map data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching map data'
        });
    }
});

// Save form data
router.post('/save-form-data', 
    requireAuth,
    [
        body('latitude').optional({ values: 'falsy' }).isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
        body('longitude').optional({ values: 'falsy' }).isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
        body('sample_type').optional().isInt({ min: 1, max: 10 }).withMessage('Invalid sample type'),
        body('location_name').optional().isLength({ max: 255 }).withMessage('Location name too long')
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

            const {
                latitude,
                longitude,
                sample_type,
                location_name,
                collection_date,
                notes,
                // Add other form fields as needed
                ...otherData
            } = req.body;

            // Convert other data to JSON string for storage
            const additionalData = JSON.stringify(otherData);

            const [result] = await pool.execute(`
                INSERT INTO sample_data (
                    latitude,
                    longitude,
                    sample_type,
                    location_name,
                    collection_date,
                    notes,
                    additional_data,
                    created_by,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
                latitude || null,
                longitude || null,
                sample_type || null,
                location_name || null,
                collection_date || null,
                notes || null,
                additionalData,
                req.session.user_id
            ]);

            res.json({
                success: true,
                message: 'Data saved successfully',
                id: result.insertId
            });

        } catch (error) {
            console.error('Error saving form data:', error);
            res.status(500).json({
                success: false,
                message: 'Error saving data'
            });
        }
    }
);

// Upload and process file data
router.post('/upload-file-data',
    requireAuth,
    upload.single('dataFile'),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'No file uploaded'
                });
            }

            // Process the uploaded file based on its type
            const fileExtension = req.file.originalname.split('.').pop().toLowerCase();
            
            if (!['csv', 'xlsx', 'json'].includes(fileExtension)) {
                return res.status(400).json({
                    success: false,
                    message: 'Unsupported file format. Please upload CSV, XLSX, or JSON files.'
                });
            }

            // Here you would implement file parsing logic
            // For now, we'll just acknowledge the upload
            res.json({
                success: true,
                message: 'File uploaded successfully',
                filename: req.file.originalname,
                fileId: req.file.filename
            });

        } catch (error) {
            console.error('Error uploading file:', error);
            res.status(500).json({
                success: false,
                message: 'Error uploading file'
            });
        }
    }
);

// Get user's sample data
router.get('/my-samples', requireAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const [rows] = await pool.execute(`
            SELECT 
                id,
                latitude,
                longitude,
                sample_type,
                location_name,
                collection_date,
                notes,
                created_at
            FROM sample_data 
            WHERE created_by = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [req.session.user_id, limit, offset]);

        const [countResult] = await pool.execute(`
            SELECT COUNT(*) as total 
            FROM sample_data 
            WHERE created_by = ?
        `, [req.session.user_id]);

        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        res.json({
            success: true,
            data: rows,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });

    } catch (error) {
        console.error('Error fetching user samples:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching samples'
        });
    }
});

// Update sample data
router.put('/sample/:id', 
    requireAuth,
    [
        body('latitude').optional({ values: 'falsy' }).isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
        body('longitude').optional({ values: 'falsy' }).isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
        body('sample_type').optional().isInt({ min: 1, max: 10 }).withMessage('Invalid sample type'),
        body('location_name').optional().isLength({ max: 255 }).withMessage('Location name too long')
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

            const sampleId = req.params.id;
            const {
                latitude,
                longitude,
                sample_type,
                location_name,
                collection_date,
                notes
            } = req.body;

            // Check if user owns this sample
            const [existingSample] = await pool.execute(
                'SELECT id FROM sample_data WHERE id = ? AND created_by = ?',
                [sampleId, req.session.user_id]
            );

            if (existingSample.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Sample not found or access denied'
                });
            }

            const [result] = await pool.execute(`
                UPDATE sample_data SET
                    latitude = COALESCE(?, latitude),
                    longitude = COALESCE(?, longitude),
                    sample_type = COALESCE(?, sample_type),
                    location_name = COALESCE(?, location_name),
                    collection_date = COALESCE(?, collection_date),
                    notes = COALESCE(?, notes),
                    updated_at = NOW()
                WHERE id = ? AND created_by = ?
            `, [
                latitude,
                longitude,
                sample_type,
                location_name,
                collection_date,
                notes,
                sampleId,
                req.session.user_id
            ]);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Sample not found'
                });
            }

            res.json({
                success: true,
                message: 'Sample updated successfully'
            });

        } catch (error) {
            console.error('Error updating sample:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating sample'
            });
        }
    }
);

// Delete sample data
router.delete('/sample/:id', requireAuth, async (req, res) => {
    try {
        const sampleId = req.params.id;

        const [result] = await pool.execute(
            'DELETE FROM sample_data WHERE id = ? AND created_by = ?',
            [sampleId, req.session.user_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Sample not found or access denied'
            });
        }

        res.json({
            success: true,
            message: 'Sample deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting sample:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting sample'
        });
    }
});

// Check session status
router.get('/check-session', (req, res) => {
    try {
        if (!req.session || !req.session.user_id) {
            return res.json({
                logged_in: false,
                timeout: false
            });
        }

        // Check if session has timed out
        const sessionTimeout = parseInt(process.env.SESSION_TIMEOUT) * 1000 || 1800000; // 30 minutes default
        const now = Date.now();
        const lastActivity = req.session.last_activity || req.session.cookie.expires;
        
        if (lastActivity && (now - lastActivity) > sessionTimeout) {
            return res.json({
                logged_in: true,
                timeout: true,
                message: 'Your session has expired due to inactivity. Please log in again.'
            });
        }

        // Update last activity
        req.session.last_activity = now;

        res.json({
            logged_in: true,
            timeout: false,
            user_id: req.session.user_id,
            username: req.session.username        });
    } catch (error) {
        console.error('Session check error:', error);
        res.status(500).json({
            logged_in: false,
            timeout: false,
            error: 'Session check failed'
        });
    }
});

// Check if location name exists
router.get('/check-location-exists', async (req, res) => {
    try {
        const { name } = req.query;
        
        if (!name || !name.trim()) {
            return res.json({
                success: true,
                exists: false,
                message: 'No location name provided'
            });
        }
        
        // Check only in Location table
        const [locationRows] = await pool.execute(
            'SELECT COUNT(*) as count FROM Location WHERE LocationName = ?',
            [name.trim()]
        );
        
        const existsInLocation = locationRows[0].count > 0;
        
        res.json({
            success: true,
            exists: existsInLocation,
            details: {
                inLocationTable: existsInLocation,
                locationCount: locationRows[0].count
            }
        });
        
    } catch (error) {
        console.error('Error checking location existence:', error);
        res.status(500).json({
            success: false,
            exists: false,
            message: 'Error checking location existence'
        });
    }
});

// Get locations from Location table
router.get('/locations', async (req, res) => {
    try {        // Query the location table from database_init.sql
        const [rows] = await pool.execute(`
            SELECT 
                Loc_UniqueID as id,
                UserLocID_txt as userLocId,
                LocationName as name,
                Location_Desc as description,
                City as city,
                State as state,
                ZipCode as zipCode,
                \`Lat-DecimalDegree\` as latitude,
                \`Long-DecimalDegree\` as longitude
            FROM Location 
            ORDER BY LocationName ASC
        `);

        res.json({
            success: true,
            locations: rows,
            count: rows.length
        });

    } catch (error) {
        console.error('Error fetching locations:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching locations',
            locations: []
        });    }
});

// Create new location
router.post('/locations', 
    requireAuth,    [        body('locationName').notEmpty().withMessage('Location name is required').isLength({ max: 255 }).withMessage('Location name too long'),
        body('locationShortCode').notEmpty().withMessage('Location short code is required').isLength({ max: 50 }).withMessage('Location short code too long'),
        body('locationDescription').notEmpty().withMessage('Location description is required').isLength({ max: 500 }).withMessage('Location description too long'),
        body('latitude').optional({ values: 'falsy' }).isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
        body('longitude').optional({ values: 'falsy' }).isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
        body('streetAddress').optional().isLength({ max: 500 }).withMessage('Street address too long'),
        body('city').optional().isLength({ max: 100 }).withMessage('City name too long'),
        body('state').optional().isLength({ max: 100 }).withMessage('State name too long'),
        body('country').optional().isLength({ max: 100 }).withMessage('Country name too long'),
        body('zipCode').optional().isLength({ max: 20 }).withMessage('Zip code too long')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }            const {
                locationName,
                locationShortCode,
                locationDescription,
                latitude,
                longitude,
                streetAddress,
                city,
                state,
                country,
                zipCode
            } = req.body;

            // Validate that at least one location group is provided
            const hasCoordinates = latitude !== null && longitude !== null;
            const hasAddress = streetAddress && city && state && country;
            const hasZipCode = zipCode;

            if (!hasCoordinates && !hasAddress && !hasZipCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide either coordinates, complete address, or zip code'
                });            }            // Insert into location table (use lowercase table name)
            const [result] = await pool.execute(`
                INSERT INTO Location (
                    UserLocID_txt,
                    LocationName,
                    Location_Desc,
                    \`Lat-DecimalDegree\`,
                    \`Long-DecimalDegree\`,
                    StreetAddress,
                    City,
                    State,
                    Country,
                    ZipCode,
                    \`Env-Indoor_SelectID\`,
                    UserCreated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                locationShortCode || null, // Add the short code field
                locationName,
                locationDescription, // Use the actual location description
                latitude || null,
                longitude || null,
                streetAddress || null,
                city || null,
                state || null,
                country || null,
                zipCode ? parseInt(zipCode) || null : null, // Convert to integer
                1, // Default to Environmental (Outdoors)
                req.session.username || 'system'
            ]);

            res.json({
                success: true,
                message: 'Location created successfully',
                locationId: result.insertId
            });

        } catch (error) {
            console.error('Error creating location:', error);
              // Check for duplicate location name
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({
                    success: false,
                    message: 'A location with this name already exists'
                });
            }
            
            res.status(500).json({
                success: false,
                message: 'Error creating location'
            });
        }
    }
);

// ========== MY LOCATIONS API ENDPOINTS ==========

// Get user's locations
router.get('/my-locations', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user_id;
        const username = req.session.username;
        
        // Check if user is authenticated
        if (!userId || !username) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }
        
        const query = `
            SELECT 
                Loc_UniqueID as id,
                UserLocID_txt as userLocId,
                LocationName as name,
                Location_Desc as description,
                City as city,
                State as state,
                Country as country,
                StreetAddress as streetAddress,
                ZipCode as zipCode,
                \`Lat-DecimalDegree\` as latitude,
                \`Long-DecimalDegree\` as longitude,
                UserCreated as userCreated,
                0 as sample_count
            FROM Location 
            WHERE UserCreated = ?
            ORDER BY Loc_UniqueID DESC
        `;
        
        const [locations] = await pool.execute(query, [username]);
        
        res.json({
            success: true,
            locations: locations,
            total: locations.length
        });
    } catch (error) {
        console.error('Error fetching user locations:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching locations: ' + error.message
        });
    }
});

// Get a specific location
router.get('/locations/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user_id;
        const locationId = req.params.id;
        
        const query = `
            SELECT 
                l.*,
                COUNT(s.id) as sample_count
            FROM locations l
            LEFT JOIN samples s ON l.id = s.location_id
            WHERE l.id = ? AND l.user_id = ?
            GROUP BY l.id
        `;
        
        const [locations] = await pool.execute(query, [locationId, userId]);
        
        if (locations.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Location not found'
            });
        }
        
        res.json(locations[0]);
    } catch (error) {
        console.error('Error fetching location:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching location'
        });
    }
});

// Create a new location
router.post('/locations', requireAuth, [
    body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Name is required and must be less than 255 characters'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
    body('type').trim().isLength({ min: 1, max: 50 }).withMessage('Type is required and must be less than 50 characters'),
    body('streetaddress').optional().trim().isLength({ max: 255 }).withMessage('Address must be less than 255 characters'),
    body('city').optional().trim().isLength({ max: 100 }).withMessage('City must be less than 100 characters'),
    body('state').optional().trim().isLength({ max: 100 }).withMessage('State must be less than 100 characters'),
    body('country').optional().trim().isLength({ max: 100 }).withMessage('Country must be less than 100 characters'),
    body('zip_code').optional().trim().isLength({ max: 20 }).withMessage('ZIP code must be less than 20 characters'),
    body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const userId = req.session.user_id;
        const {
            name,
            latitude,
            longitude,
            type,
            streetaddress,
            city,
            state,
            country,
            zip_code,
            description
        } = req.body;

        const query = `
            INSERT INTO locations (
                user_id, name, latitude, longitude, type, 
                streetaddress, city, state, country, zip_code, description,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;

        const [result] = await pool.execute(query, [
            userId, name, latitude, longitude, type,
            streetaddress || null, city || null, state || null, 
            country || null, zip_code || null, description || null
        ]);

        // Fetch the created location
        const [newLocation] = await pool.execute(
            'SELECT * FROM Locations WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Location created successfully',
            ...newLocation[0],
            sample_count: 0
        });

    } catch (error) {
        console.error('Error creating location:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                message: 'A location with this name already exists'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Error creating location'
        });
    }
});

// Update a location
router.put('/locations/:id', requireAuth, [
    body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Name is required and must be less than 255 characters'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
    body('type').trim().isLength({ min: 1, max: 50 }).withMessage('Type is required and must be less than 50 characters'),
    body('streetaddress').optional().trim().isLength({ max: 255 }).withMessage('Address must be less than 255 characters'),
    body('city').optional().trim().isLength({ max: 100 }).withMessage('City must be less than 100 characters'),
    body('state').optional().trim().isLength({ max: 100 }).withMessage('State must be less than 100 characters'),
    body('country').optional().trim().isLength({ max: 100 }).withMessage('Country must be less than 100 characters'),
    body('zip_code').optional().trim().isLength({ max: 20 }).withMessage('ZIP code must be less than 20 characters'),
    body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const userId = req.session.user_id;
        const locationId = req.params.id;
        const {
            name,
            latitude,
            longitude,
            type,
            streetaddress,
            city,
            state,
            country,
            zip_code,
            description
        } = req.body;

        // Check if location exists and belongs to user
        const [existingLocation] = await pool.execute(
            'SELECT id FROM Locations WHERE id = ? AND user_id = ?',
            [locationId, userId]
        );

        if (existingLocation.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Location not found'
            });
        }

        const query = `
            UPDATE locations SET 
                name = ?, latitude = ?, longitude = ?, type = ?,
                streetaddress = ?, city = ?, state = ?, country = ?, 
                zip_code = ?, description = ?, updated_at = NOW()
            WHERE id = ? AND user_id = ?
        `;

        await pool.execute(query, [
            name, latitude, longitude, type,
            streetaddress || null, city || null, state || null,
            country || null, zip_code || null, description || null,
            locationId, userId
        ]);

        // Fetch the updated location with sample count
        const [updatedLocation] = await pool.execute(`
            SELECT 
                l.*,
                COUNT(s.id) as sample_count
            FROM Locations l
            LEFT JOIN samples s ON l.id = s.location_id
            WHERE l.id = ? AND l.user_id = ?
            GROUP BY l.id
        `, [locationId, userId]);

        res.json({
            success: true,
            message: 'Location updated successfully',
            ...updatedLocation[0]
        });

    } catch (error) {
        console.error('Error updating location:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                message: 'A location with this name already exists'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Error updating location'
        });
    }
});

// Delete a location
router.delete('/locations/:id', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user_id;
        const locationId = req.params.id;

        // Check if location exists and belongs to user
        const [existingLocation] = await pool.execute(
            'SELECT id FROM locations WHERE id = ? AND user_id = ?',
            [locationId, userId]
        );

        if (existingLocation.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Location not found'
            });
        }

        // Check if location has associated samples
        const [samples] = await pool.execute(
            'SELECT COUNT(*) as count FROM samples WHERE location_id = ?',
            [locationId]
        );

        if (samples[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete location with associated samples. Please delete all samples first.'
            });
        }

        // Delete the location
        await pool.execute(
            'DELETE FROM locations WHERE id = ? AND user_id = ?',
            [locationId, userId]
        );

        res.json({
            success: true,
            message: 'Location deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting location:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting location'
        });
    }
});

module.exports = router;
