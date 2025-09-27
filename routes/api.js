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

// Test endpoint to add sample location data with ZIP codes
router.post('/add-test-location-data', requireAuth, async (req, res) => {
    try {
        // Sample Detroit area ZIP codes with coordinates
        const testLocations = [
            { name: 'Downtown Detroit', lat: 42.3314, lng: -83.0458, zipCode: 48226, city: 'Detroit', state: 'MI' },
            { name: 'Belle Isle Park', lat: 42.3401, lng: -82.9849, zipCode: 48207, city: 'Detroit', state: 'MI' },
            { name: 'Detroit Riverfront', lat: 42.3298, lng: -83.0365, zipCode: 48226, city: 'Detroit', state: 'MI' },
            { name: 'Campus Martius', lat: 42.3314, lng: -83.0457, zipCode: 48226, city: 'Detroit', state: 'MI' },
            { name: 'Eastern Market', lat: 42.3481, lng: -83.0401, zipCode: 48207, city: 'Detroit', state: 'MI' }
        ];

        // Insert test locations
        for (const loc of testLocations) {
            // Insert location
            const [locationResult] = await pool.execute(`
                INSERT INTO Location (
                    LocationName, Location_Desc, \`Env-Indoor_SelectID\`,
                    \`Lat-DecimalDegree\`, \`Long-DecimalDegree\`, 
                    City, State, Country, ZipCode,
                    UserCreated
                ) VALUES (?, ?, 1, ?, ?, ?, ?, 'USA', ?, ?)
            `, [
                loc.name, 
                `Test location for ${loc.name}`, 
                loc.lat, 
                loc.lng, 
                loc.city, 
                loc.state, 
                loc.zipCode,
                req.session.username
            ]);

            const locationId = locationResult.insertId;

            // Insert sampling event
            const [eventResult] = await pool.execute(`
                INSERT INTO SamplingEvent (
                    SamplingEventUniqueID, LocationID_Num, DeviceInstallationPeriod,
                    SamplingDate, UserSamplingID, DateEntered
                ) VALUES (?, ?, 'no', CURDATE(), ?, NOW())
            `, [locationId, locationId, req.session.user_id]);

            // Insert sample details
            await pool.execute(`
                INSERT INTO SampleDetails (
                    SampleUniqueID, SamplingEvent_Num, MediaType_SelectID,
                    Micro5mmAndSmaller_Count, FragLargerThan5mm_Count, WholePkg_Count
                ) VALUES (?, ?, 1, ?, ?, ?)
            `, [
                locationId, 
                locationId, 
                Math.floor(Math.random() * 100) + 10,
                Math.floor(Math.random() * 50) + 5,
                Math.floor(Math.random() * 20) + 1
            ]);
        }

        res.json({
            success: true,
            message: `Added ${testLocations.length} test locations with sample data`
        });

    } catch (error) {
        console.error('Error adding test data:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding test data: ' + error.message
        });
    }
});

// Get map data from SampleDetails and related tables
router.get('/php/get_map_data.php', async (req, res) => {
    try {
        // Build the SQL query with optional filters using the actual database schema
        let sql = `
            SELECT 
                sd.SampleUniqueID,
                l.LocationName as location,
                l.ZipCode as zipCode,
                l.\`Lat-DecimalDegree\` as lat, 
                l.\`Long-DecimalDegree\` as lng,
                mt.MediaTypeOverall as sampleType,
                DATE(se.SamplingDate) as date,
                mt.MediaTypeOverall as plasticTypes,
                (sd.WholePkg_Count + sd.FragLargerThan5mm_Count + sd.Micro5mmAndSmaller_Count) as particleCount
            FROM SampleDetails sd
            LEFT JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
            LEFT JOIN Location l ON se.LocationID_Num = l.Loc_UniqueID
            LEFT JOIN MediaType_WithinLitterWaterSoil_Ref mt ON sd.MediaType_SelectID = mt.MediaTypeUniqueID
            WHERE l.\`Lat-DecimalDegree\` IS NOT NULL AND l.\`Long-DecimalDegree\` IS NOT NULL
        `;
        
        const params = [];
        
        // Apply ZIP code filter if provided (search in actual ZipCode field)
        if (req.query.zipcode && req.query.zipcode.trim()) {
            sql += " AND l.ZipCode = ?";
            params.push(parseInt(req.query.zipcode.trim()));
        }
        
        // Apply plastic type filter if provided (search in media_type)
        if (req.query.plastic_type && req.query.plastic_type.trim()) {
            sql += " AND mt.MediaTypeOverall LIKE ?";
            params.push(`%${req.query.plastic_type.trim()}%`);
        }
        
        // Order by collection date (most recent first)
        sql += " ORDER BY se.SamplingDate DESC";
        
        // Execute the query
        const [rows] = await pool.execute(sql, params);
        
        // Format the data to match the PHP response format
        const formattedData = rows.map(row => ({
            SampleUniqueID: row.SampleUniqueID,
            location: row.location || 'Unknown Location',
            zipCode: row.zipCode || 'N/A',
            lat: parseFloat(row.lat) || 0,
            lng: parseFloat(row.lng) || 0,
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
                sd.SampleUniqueID as id,
                l.\`Lat-DecimalDegree\` as latitude,
                l.\`Long-DecimalDegree\` as longitude,
                mt.MediaTypeOverall as sample_type,
                l.LocationName as location_name,
                se.SamplingDate as collection_date,
                se.UserSamplingID as created_by
            FROM SampleDetails sd
            LEFT JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
            LEFT JOIN Location l ON se.LocationID_Num = l.Loc_UniqueID
            LEFT JOIN MediaType_WithinLitterWaterSoil_Ref mt ON sd.MediaType_SelectID = mt.MediaTypeUniqueID
            WHERE l.\`Lat-DecimalDegree\` IS NOT NULL 
            AND l.\`Long-DecimalDegree\` IS NOT NULL
            ORDER BY se.SamplingDate DESC
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

// Test endpoint without authentication
router.post('/test-save', async (req, res) => {
    console.log('=== TEST SAVE ENDPOINT ===');
    console.log('Request method:', req.method);
    console.log('Request headers:', JSON.stringify(req.headers, null, 2));
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Session data:', JSON.stringify(req.session, null, 2));
    
    res.json({
        success: true,
        message: 'Test endpoint working',
        session: req.session,
        body: req.body
    });
});

// Save form data
router.post('/save-form-data', 
    requireAuth,
    [
        // Validation for required fields - check both possible field names
        body('location_id').optional(),
        body('selected_location_id').optional(),
        body('sample_date').notEmpty().withMessage('Sample date is required'),
        body('media_type').notEmpty().withMessage('Media type is required')
    ],
    async (req, res) => {
        console.log('=== SAVE FORM DATA REQUEST ===');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        console.log('Session user_id:', req.session.user_id);
        
        const connection = await pool.getConnection();
        
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                console.log('Validation errors:', errors.array());
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg,
                    errors: errors.array()
                });
            }

            const formData = req.body;
            
            // Get location ID from either field name
            const locationId = formData.location_id || formData.selected_location_id;
            if (!locationId) {
                return res.status(400).json({
                    success: false,
                    message: 'Location is required'
                });
            }

            await connection.beginTransaction();

            const userId = req.session.user_id || 'system';

            console.log('Starting database transaction...');

            // Step 1: Insert into SamplingEvent table (complete fields)
            const samplingEventData = {
                LocationID_Num: parseInt(locationId),
                SamplingDate: formData.sample_date,
                UserSamplingID: userId,
                'AirTemp-C': formData.air_temp ? parseFloat(formData.air_temp) : null,
                'Weather-Current': formData.current_conditions ? await getWeatherTypeId(connection, formData.current_conditions) : null,
                'Weather-Precedent24': formData.precedent_weather ? await getWeatherTypeId(connection, formData.precedent_weather) : null,
                'Rainfall-cm-Precedent24': formData.rainfall ? parseFloat(formData.rainfall) : null,
                SamplerNames: formData.sample_description || null,
                DeviceInstallationPeriod: formData.device_installation_period || 'no',
                DeviceStartDate: formData.device_start_date || null,
                DeviceEndDate: formData.device_end_date || null,
                SampleTime: formData.sample_time || null,
                WeatherPrecedent24: formData.precedent_weather_24h ? await getWeatherTypeId(connection, formData.precedent_weather_24h) : null,
                AdditionalNotes: formData.additional_notes || null
            };

            console.log('Inserting sampling event data:', samplingEventData);

            // Generate a unique ID for the sampling event
            // Check for existing max ID and increment
            const [maxIdResult] = await connection.execute(
                'SELECT MAX(SamplingEventUniqueID) as maxId FROM SamplingEvent'
            );
            const samplingEventUniqueId = (maxIdResult[0].maxId || 0) + 1;

            const [samplingEventResult] = await connection.execute(`
                INSERT INTO SamplingEvent (
                    SamplingEventUniqueID, LocationID_Num, SamplingDate, UserSamplingID, \`AirTemp-C\`, 
                    \`Weather-Current\`, \`Weather-Precedent24\`, \`Rainfall-cm-Precedent24\`, SamplerNames,
                    DeviceInstallationPeriod, DeviceStartDate, DeviceEndDate, SampleTime, 
                    WeatherPrecedent24, AdditionalNotes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                samplingEventUniqueId,
                samplingEventData.LocationID_Num,
                samplingEventData.SamplingDate,
                samplingEventData.UserSamplingID,
                samplingEventData['AirTemp-C'],
                samplingEventData['Weather-Current'],
                samplingEventData['Weather-Precedent24'],
                samplingEventData['Rainfall-cm-Precedent24'],
                samplingEventData.SamplerNames,
                samplingEventData.DeviceInstallationPeriod,
                samplingEventData.DeviceStartDate,
                samplingEventData.DeviceEndDate,
                samplingEventData.SampleTime,
                samplingEventData.WeatherPrecedent24,
                samplingEventData.AdditionalNotes
            ]);

            const samplingEventId = samplingEventUniqueId; // Use the generated ID
            console.log('Sampling event created with ID:', samplingEventId);

            // Step 2: Insert into SampleDetails table (complete fields)
            const mediaTypeId = await getMediaTypeId(connection, formData.media_type);
            const waterEnvTypeId = formData.environment_type ? await getWaterEnvTypeId(connection, formData.environment_type) : null;

            const sampleDetailsData = {
                SamplingEvent_Num: samplingEventId,
                MediaType_SelectID: mediaTypeId,
                WholePkg_Count: formData.packaging_count ? parseInt(formData.packaging_count) : null,
                FragLargerThan5mm_Count: formData.fragments_count ? parseInt(formData.fragments_count) : null,
                Micro5mmAndSmaller_Count: formData.microplastics_count ? parseInt(formData.microplastics_count) : null,
                WaterEnvType_SelectID: waterEnvTypeId,
                'SoilMoisture%': formData.soil_moisture ? parseFloat(formData.soil_moisture) : null,
                StorageLocation: 1, // Default storage location
                // Additional fields from formpage2-5
                MediaSubType: getMediaSubType(formData),
                LandscapeType: getLandscapeType(formData),
                MixedMediaDescription: formData.mixed_media_description || null,
                VolumeSampled: formData.volume_sampled ? parseFloat(formData.volume_sampled) : null,
                WaterDepth: formData.water_depth ? parseFloat(formData.water_depth) : null,
                FlowVelocity: formData.flow_velocity ? parseFloat(formData.flow_velocity) : null,
                SuspendedSolids: formData.suspended_solids ? parseFloat(formData.suspended_solids) : null,
                Conductivity: formData.conductivity ? parseFloat(formData.conductivity) : null,
                SoilDryWeight: formData.soil_dry_weight ? parseFloat(formData.soil_dry_weight) : null,
                SoilOrganicMatter: formData.soil_organic_matter ? parseFloat(formData.soil_organic_matter) : null,
                SoilSand: formData.soil_sand ? parseFloat(formData.soil_sand) : null,
                SoilSilt: formData.soil_silt ? parseFloat(formData.soil_silt) : null,
                SoilClay: formData.soil_clay ? parseFloat(formData.soil_clay) : null,
                ReplicatesCount: formData.replicates_count ? parseInt(formData.replicates_count) : null,
                MicroplasticsSampleAmount: formData.microplastics_sample_amount ? parseFloat(formData.microplastics_sample_amount) : null,
                MicroplasticsSampleUnit: formData.microplastics_sample_unit || null,
                FragmentsSampleAmount: formData.fragments_sample_amount ? parseFloat(formData.fragments_sample_amount) : null,
                FragmentsSampleUnit: formData.fragments_sample_unit || null,
                PackagingSampleAmount: formData.packaging_sample_amount ? parseFloat(formData.packaging_sample_amount) : null,
                PackagingSampleUnit: formData.packaging_sample_unit || null
            };

            console.log('Inserting sample details data:', sampleDetailsData);

            // Generate a unique ID for the sample details
            // Check for existing max ID and increment
            const [maxSampleIdResult] = await connection.execute(
                'SELECT MAX(SampleUniqueID) as maxId FROM SampleDetails'
            );
            const sampleUniqueId = (maxSampleIdResult[0].maxId || 0) + 1;

            const [sampleDetailsResult] = await connection.execute(`
                INSERT INTO SampleDetails (
                    SampleUniqueID, SamplingEvent_Num, MediaType_SelectID, WholePkg_Count, 
                    FragLargerThan5mm_Count, Micro5mmAndSmaller_Count, 
                    WaterEnvType_SelectID, \`SoilMoisture%\`, StorageLocation,
                    MediaSubType, LandscapeType, MixedMediaDescription, VolumeSampled,
                    WaterDepth, FlowVelocity, SuspendedSolids, Conductivity,
                    SoilDryWeight, SoilOrganicMatter, SoilSand, SoilSilt, SoilClay,
                    ReplicatesCount, MicroplasticsSampleAmount, MicroplasticsSampleUnit,
                    FragmentsSampleAmount, FragmentsSampleUnit, PackagingSampleAmount, PackagingSampleUnit
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                sampleUniqueId,
                sampleDetailsData.SamplingEvent_Num,
                sampleDetailsData.MediaType_SelectID,
                sampleDetailsData.WholePkg_Count,
                sampleDetailsData.FragLargerThan5mm_Count,
                sampleDetailsData.Micro5mmAndSmaller_Count,
                sampleDetailsData.WaterEnvType_SelectID,
                sampleDetailsData['SoilMoisture%'],
                sampleDetailsData.StorageLocation,
                sampleDetailsData.MediaSubType,
                sampleDetailsData.LandscapeType,
                sampleDetailsData.MixedMediaDescription,
                sampleDetailsData.VolumeSampled,
                sampleDetailsData.WaterDepth,
                sampleDetailsData.FlowVelocity,
                sampleDetailsData.SuspendedSolids,
                sampleDetailsData.Conductivity,
                sampleDetailsData.SoilDryWeight,
                sampleDetailsData.SoilOrganicMatter,
                sampleDetailsData.SoilSand,
                sampleDetailsData.SoilSilt,
                sampleDetailsData.SoilClay,
                sampleDetailsData.ReplicatesCount,
                sampleDetailsData.MicroplasticsSampleAmount,
                sampleDetailsData.MicroplasticsSampleUnit,
                sampleDetailsData.FragmentsSampleAmount,
                sampleDetailsData.FragmentsSampleUnit,
                sampleDetailsData.PackagingSampleAmount,
                sampleDetailsData.PackagingSampleUnit
            ]);

            const sampleDetailsId = sampleUniqueId; // Use the generated ID
            console.log('Sample details created with ID:', sampleDetailsId);

            // Step 3: Insert microplastics details if provided (complete fields)
            if (formData.has_quantitative_data === 'yes' && formData.microplastics_count && parseInt(formData.microplastics_count) > 0) {
                console.log('Inserting microplastics details...');
                
                // Generate a unique ID for microplastics
                const [maxMicroIdResult] = await connection.execute(
                    'SELECT MAX(Micro_UniqueID) as maxId FROM MicroplasticsInSample'
                );
                const microUniqueId = (maxMicroIdResult[0].maxId || 0) + 1;
                
                await connection.execute(`
                    INSERT INTO MicroplasticsInSample (
                        Micro_UniqueID, SampleDetails_Num, \`PercentSize_<1um\`, \`PercentSize_1-20um\`, 
                        \`PercentSize_20-100um\`, \`PercentSize_100um-1mm\`, \`PercentSize_1-5mm\`,
                        PercentForm_fiber, PercentForm_Pellet, PercentForm_Fragment, PercentForm_Film, PercentForm_Foam,
                        PercentColor_Clear, PercentColor_OpaqueLight, PercentColor_OpaqueDark, PercentColor_Mixed,
                        Method_Desc
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    microUniqueId,
                    sampleDetailsId,
                    formData.mp_size_lt_1um ? parseInt(formData.mp_size_lt_1um) : null,
                    formData.mp_size_1_20um ? parseInt(formData.mp_size_1_20um) : null,
                    formData.mp_size_20_100um ? parseInt(formData.mp_size_20_100um) : null,
                    formData.mp_size_100um_1mm ? parseInt(formData.mp_size_100um_1mm) : null,
                    formData.mp_size_1_5mm ? parseInt(formData.mp_size_1_5mm) : null,
                    formData.mp_form_fiber ? parseInt(formData.mp_form_fiber) : null,
                    formData.mp_form_pellet ? parseInt(formData.mp_form_pellet) : null,
                    formData.mp_form_fragment ? parseInt(formData.mp_form_fragment) : null,
                    formData.mp_form_film ? parseInt(formData.mp_form_film) : null,
                    formData.mp_form_foam ? parseInt(formData.mp_form_foam) : null,
                    formData.mp_color_clear ? parseInt(formData.mp_color_clear) : null,
                    formData.mp_color_opaque_light ? parseInt(formData.mp_color_opaque_light) : null,
                    formData.mp_color_opaque_dark ? parseInt(formData.mp_color_opaque_dark) : null,
                    formData.mp_color_mixed ? parseInt(formData.mp_color_mixed) : null,
                    formData.mp_estimate_method || null
                ]);
                console.log('Microplastics details inserted with ID:', microUniqueId);
                
                // Insert polymer details for microplastics if provided
                await insertPolymerDetails(connection, microUniqueId, formData, 'microplastics');
            }

            // Step 4: Insert fragments details if provided (complete fields)
            if (formData.has_quantitative_data === 'yes' && formData.fragments_count && parseInt(formData.fragments_count) > 0) {
                console.log('Inserting fragments details...');
                
                // Generate a unique ID for fragments
                const [maxFragmentIdResult] = await connection.execute(
                    'SELECT MAX(Fragment_UniqueID) as maxId FROM FragmentsInSample'
                );
                const fragmentUniqueId = (maxFragmentIdResult[0].maxId || 0) + 1;
                
                await connection.execute(`
                    INSERT INTO FragmentsInSample (
                        Fragment_UniqueID, SampleDetails_Num, \`PercentColor_Clear\`, \`PercentColor_Op-Color\`, 
                        \`PercentColor_Op-Dk\`, \`PercentColor_Mixed\`, PercentForm_Fiber,
                        PercentForm_Pellet, PercentForm_Film, PercentForm_Foam, PercentForm_HardPlastic
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    fragmentUniqueId,
                    sampleDetailsId,
                    formData.fragment_color_clear ? parseInt(formData.fragment_color_clear) : null,
                    formData.fragment_color_opaque_light ? parseInt(formData.fragment_color_opaque_light) : null,
                    formData.fragment_color_opaque_dark ? parseInt(formData.fragment_color_opaque_dark) : null,
                    formData.fragment_color_mixed ? parseInt(formData.fragment_color_mixed) : null,
                    formData.fragment_form_fiber ? parseInt(formData.fragment_form_fiber) : null,
                    formData.fragment_form_pellet ? parseInt(formData.fragment_form_pellet) : null,
                    formData.fragment_form_film ? parseInt(formData.fragment_form_film) : null,
                    formData.fragment_form_foam ? parseInt(formData.fragment_form_foam) : null,
                    formData.fragment_form_hardplastic ? parseInt(formData.fragment_form_hardplastic) : null
                ]);
                console.log('Fragments details inserted with ID:', fragmentUniqueId);
                
                // Insert polymer details for fragments if provided
                await insertPolymerDetails(connection, fragmentUniqueId, formData, 'fragments');
            }

            // Step 5: Insert packaging details if provided (complete fields with user-defined text data)
            if (formData.has_quantitative_data === 'yes' && formData.packaging_count && parseInt(formData.packaging_count) > 0) {
                console.log('Inserting packaging details...');
                
                // Handle both array and individual field formats
                let packagingPurposes = [];
                let packagingRecycleCodes = [];
                let packagingColors = [];
                let packagingIds = [];
                let packagingOpacities = [];
                
                // Check for array format first
                if (formData['packaging_purpose[]']) {
                    packagingPurposes = Array.isArray(formData['packaging_purpose[]']) ? formData['packaging_purpose[]'] : [formData['packaging_purpose[]']];
                }
                if (formData['packaging_recycle_code[]']) {
                    packagingRecycleCodes = Array.isArray(formData['packaging_recycle_code[]']) ? formData['packaging_recycle_code[]'] : [formData['packaging_recycle_code[]']];
                }
                if (formData['packaging_color[]']) {
                    packagingColors = Array.isArray(formData['packaging_color[]']) ? formData['packaging_color[]'] : [formData['packaging_color[]']];
                }
                if (formData['packaging_id[]']) {
                    packagingIds = Array.isArray(formData['packaging_id[]']) ? formData['packaging_id[]'] : [formData['packaging_id[]']];
                }
                if (formData['packaging_color_opacity[]']) {
                    packagingOpacities = Array.isArray(formData['packaging_color_opacity[]']) ? formData['packaging_color_opacity[]'] : [formData['packaging_color_opacity[]']];
                }
                
                // Fallback to individual field format
                if (packagingPurposes.length === 0) {
                    for (let i = 1; i <= parseInt(formData.packaging_count); i++) {
                        if (formData[`packaging_purpose_${i}`]) {
                            packagingPurposes.push(formData[`packaging_purpose_${i}`]);
                        }
                        if (formData[`packaging_recycle_code_${i}`]) {
                            packagingRecycleCodes.push(formData[`packaging_recycle_code_${i}`]);
                        }
                        if (formData[`packaging_color_${i}`]) {
                            packagingColors.push(formData[`packaging_color_${i}`]);
                        }
                        if (formData[`packaging_userpiece_${i}`]) {
                            packagingIds.push(formData[`packaging_userpiece_${i}`]);
                        }
                        if (formData[`packaging_color_opacity_${i}`]) {
                            packagingOpacities.push(formData[`packaging_color_opacity_${i}`]);
                        }
                    }
                }

                const packagingCount = parseInt(formData.packaging_count);
                console.log('Processing', packagingCount, 'packaging items');
                console.log('Packaging data:', { packagingPurposes, packagingRecycleCodes, packagingColors, packagingIds, packagingOpacities });
                
                for (let i = 0; i < packagingCount; i++) {
                    // Generate a unique ID for each package
                    const [maxPackageIdResult] = await connection.execute(
                        'SELECT MAX(PackageDetailsUniqueID) as maxId FROM PackagesInSample'
                    );
                    const packageUniqueId = (maxPackageIdResult[0].maxId || 0) + 1;
                    
                    await connection.execute(`
                        INSERT INTO PackagesInSample (
                            PackageDetailsUniqueID, SampleDetails_Num, Form_SelectID, 
                            PackagingPurpose, RecycleCode, ColorOpacity, Color, UserPieceID
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        packageUniqueId,
                        sampleDetailsId,
                        1, // Default form ID
                        packagingPurposes[i] || null,
                        packagingRecycleCodes[i] || null,
                        packagingOpacities[i] || null,
                        packagingColors[i] || null,
                        packagingIds[i] || null
                    ]);
                    console.log(`Inserted packaging item ${i + 1} with ID:`, packageUniqueId);
                }
            }

            // Step 6: Insert Raman spectroscopy details if provided
            if (formData.has_raman_data === 'yes' && formData.raman_wavelength) {
                console.log('Inserting Raman details...');
                
                try {
                    // Generate a unique ID for Raman details
                    const [maxRamanIdResult] = await connection.execute(
                        'SELECT MAX(Raman_UniqueID) as maxId FROM RamanDetails'
                    );
                    const ramanUniqueId = (maxRamanIdResult[0].maxId || 0) + 1;
                    
                    await connection.execute(`
                        INSERT INTO RamanDetails (Raman_UniqueID, SampleDetails_Num, Wavelength)
                        VALUES (?, ?, ?)
                    `, [ramanUniqueId, sampleDetailsId, parseInt(formData.raman_wavelength)]);
                    
                    console.log('Raman details inserted with ID:', ramanUniqueId);
                } catch (error) {
                    console.error('Error inserting Raman details:', error);
                    // Continue execution even if Raman insertion fails
                }
            }

            await connection.commit();
            console.log('Transaction committed successfully');

            res.json({
                success: true,
                message: 'Data saved successfully',
                samplingEventId: samplingEventId,
                sampleDetailsId: sampleDetailsId
            });

        } catch (error) {
            await connection.rollback();
            console.error('Error saving form data:', error);
            console.error('Error stack:', error.stack);
            res.status(500).json({
                success: false,
                message: 'Error saving data: ' + error.message,
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        } finally {
            connection.release();
        }
    }
);

// Helper functions for data lookup
async function getWeatherTypeId(connection, weatherType) {
    const [rows] = await connection.execute(
        'SELECT WeatherUniqueID FROM WeatherType_Ref WHERE WeatherType = ?',
        [weatherType]
    );
    return rows.length > 0 ? rows[0].WeatherUniqueID : null;
}

async function getMediaTypeId(connection, mediaType) {
    // First try to find exact match in the reference table
    const [rows] = await connection.execute(
        'SELECT MediaTypeUniqueID FROM 	MediaType_WithinLitterWaterSoil_Ref WHERE MediaTypeOverall = ?',
        [mediaType]
    );
    
    if (rows.length > 0) {
        return rows[0].MediaTypeUniqueID;
    }
    
    // Fallback to mapping if no exact match found
    const mediaTypeMapping = {
        'water': 1,
        'soil_sediment': 2,
        'in_soil': 2,
        'soil_litter': 3,
        'mixed_composite': 4
    };
    return mediaTypeMapping[mediaType] || 1; // Default to 1 if not found
}

async function getWaterEnvTypeId(connection, environmentType) {
    // First try to find exact match in the reference table
    const [rows] = await connection.execute(
        'SELECT WaterEnv_UniqueID FROM WaterEnvType_Ref WHERE WaterEnv_Name = ?',
        [environmentType]
    );
    
    if (rows.length > 0) {
        return rows[0].WaterEnv_UniqueID;
    }
    
    // Fallback to mapping if no exact match found
    const environmentTypeMapping = {
        'Stream': 1,
        'River': 2,
        'Inland Lake': 3,
        'Pond': 4,
        'Wetland': 5,
        'Great Lake': 6,
        'Ocean': 1 // Default to stream if ocean not in database
    };
    return environmentTypeMapping[environmentType] || 1; // Default to 1 if not found
}

function getMediaSubType(formData) {
    // Return the specific media subtype based on media type
    if (formData.media_type === 'water') {
        return formData.water_type || null;
    } else if (formData.media_type === 'soil_sediment') {
        return formData.sediment_type || null;
    }
    return null;
}

function getLandscapeType(formData) {
    // Return the landscape type based on media type
    if (formData.media_type === 'in_soil') {
        return formData.soil_landscape_type || null;
    } else if (formData.media_type === 'soil_litter') {
        return formData.surface_landscape_type || null;
    }
    return null;
}

async function insertPolymerDetails(connection, parentId, formData, type) {
    const polymerTypes = [
        'pete', 'hdpe', 'pvc', 'ldpe', 'pp', 'ps', 'other', 'pa', 'pc', 'rubber',
        'pla', 'abs', 'eva', 'pb', 'pe_uhmw', 'pmma', 'hips', 'eps', 'bitumen', 'pan'
    ];

    const tableName = type === 'microplastics' ? 'MicroplasticsPolymerDetails' : 'FragmentsPolymerDetails';
    const foreignKey = type === 'microplastics' ? 'Micro_UniqueID' : 'Fragment_UniqueID';
    const fieldPrefix = type === 'microplastics' ? 'mp_polymer_' : 'fragment_polymer_';

    for (const polymerType of polymerTypes) {
        const fieldName = `${fieldPrefix}${polymerType}`;
        if (formData[fieldName] && parseInt(formData[fieldName]) > 0) {
            try {
                // Generate a unique ID for polymer details
                const [maxIdResult] = await connection.execute(
                    `SELECT MAX(ID) as maxId FROM ${tableName}`
                );
                const polymerDetailsId = (maxIdResult[0].maxId || 0) + 1;
                
                await connection.execute(`
                    INSERT INTO ${tableName} (ID, ${foreignKey}, PolymerType, Percentage)
                    VALUES (?, ?, ?, ?)
                `, [polymerDetailsId, parentId, polymerType.toUpperCase(), parseInt(formData[fieldName])]);
                
                console.log(`Inserted ${type} polymer detail: ${polymerType} = ${formData[fieldName]}%`);
            } catch (error) {
                console.error(`Error inserting polymer details for ${polymerType}:`, error);
                // Continue with other polymer types even if one fails
            }
        }
    }
}

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
        // Ensure numeric pagination params and apply simple bounds
        const page = Number.isFinite(parseInt(req.query.page, 10)) ? Math.max(1, parseInt(req.query.page, 10)) : 1;
        const limit = Number.isFinite(parseInt(req.query.limit, 10)) ? Math.min(100, Math.max(1, parseInt(req.query.limit, 10))) : 10;
        const offset = (page - 1) * limit;
        const userId = req.session.user_id;

        // Inline numeric LIMIT/OFFSET to avoid prepared statement issues on some MySQL versions
        const samplesSql = `
            SELECT 
                sd.SampleUniqueID as id,
                l.\`Lat-DecimalDegree\` as latitude,
                l.\`Long-DecimalDegree\` as longitude,
                mt.MediaTypeOverall as sample_type,
                l.LocationName as location_name,
                se.SamplingDate as collection_date,
                l.Location_Desc as notes,
                se.SamplingDate as created_at
            FROM SampleDetails sd
            LEFT JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
            LEFT JOIN Location l ON se.LocationID_Num = l.Loc_UniqueID
            LEFT JOIN MediaType_WithinLitterWaterSoil_Ref mt ON sd.MediaType_SelectID = mt.MediaTypeUniqueID
            WHERE se.UserSamplingID = ?
            ORDER BY se.SamplingDate DESC
            LIMIT ${offset}, ${limit}
        `;

        const [rows] = await pool.execute(samplesSql, [userId]);

        const [countResult] = await pool.execute(`
            SELECT COUNT(*) as total 
            FROM SampleDetails sd
            LEFT JOIN SamplingEvent se ON sd.SamplingEvent_Num = se.SamplingEventUniqueID
            WHERE se.UserSamplingID = ?
        `, [userId]);

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

// Update sample data - Remove this endpoint as it references non-existent table
// router.put('/sample/:id', requireAuth, [...], async (req, res) => { ... });

// Delete sample data - Remove this endpoint as it references non-existent table  
// router.delete('/sample/:id', requireAuth, async (req, res) => { ... });

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
    const userId = String(req.session.user_id);
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

// Contact form submission endpoint
router.post('/contact', [
    body('user_name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('user_email').isEmail().normalizeEmail().withMessage('Please enter a valid email address'),
    body('user_organization').optional().trim().isLength({ max: 200 }).withMessage('Organization name is too long'),
    body('question_category').isIn([
        'general', 'data-entry', 'data-analysis', 'technical', 
        'research', 'manuals', 'sample-analysis', 'other'
    ]).withMessage('Please select a valid question category'),
    body('user_question').trim().isLength({ min: 10, max: 2000 }).withMessage('Question must be between 10 and 2000 characters'),
    body('subscribe_updates').optional().isIn(['yes']).withMessage('Invalid subscription option')
], async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Please check your form data',
                errors: errors.array()
            });
        }

        const contactData = {
            user_name: req.body.user_name,
            user_email: req.body.user_email,
            user_organization: req.body.user_organization || null,
            question_category: req.body.question_category,
            user_question: req.body.user_question,
            subscribe_updates: req.body.subscribe_updates || 'no'
        };

        // Save contact form submission to database (optional)
        try {
            await pool.execute(`
                INSERT INTO contact_submissions (
                    user_name, user_email, user_organization, 
                    question_category, user_question, subscribe_updates,
                    submission_date, ip_address
                ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
            `, [
                contactData.user_name,
                contactData.user_email,
                contactData.user_organization,
                contactData.question_category,
                contactData.user_question,
                contactData.subscribe_updates,
                req.ip
            ]);
        } catch (dbError) {
            console.error('Database save error (continuing):', dbError);
            // Continue even if database save fails
        }

        // Import email service
        const { sendContactFormEmail, sendContactConfirmationEmail } = require('../services/emailService');

        // Send email to administrators
        const adminEmailResult = await sendContactFormEmail(contactData);
        
        // Send confirmation email to user
        const userEmailResult = await sendContactConfirmationEmail(contactData);

        if (adminEmailResult.success) {
            res.json({
                success: true,
                message: 'Thank you for your message! We have received your inquiry and will respond within 1-2 business days.',
                data: {
                    confirmation_sent: userEmailResult.success,
                    admin_notified: adminEmailResult.success
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'There was an error sending your message. Please try again or contact us directly.'
            });
        }

    } catch (error) {
        console.error('Contact form submission error:', error);
        res.status(500).json({
            success: false,
            message: 'There was an error processing your request. Please try again.'
        });
    }
});

// Admin Contact Submissions API
router.get('/admin/contact-submissions', requireAuth, async (req, res) => {
    try {
        const { status, category } = req.query;
        
        let query = 'SELECT * FROM contact_submissions';
        let params = [];
        let conditions = [];
        
        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }
        
        if (category) {
            conditions.push('question_category = ?');
            params.push(category);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY submission_date DESC';
        
        const [submissions] = await pool.execute(query, params);
        
        // Get stats
        const [rows] = await pool.execute(`
            SELECT 
                status,
                COUNT(*) as count
            FROM contact_submissions 
            GROUP BY status
        `);
        
        const stats = {
            total: submissions.length,
            new: 0,
            in_progress: 0,
            resolved: 0,
            closed: 0
        };
        
        
        res.json({
            success: true,
            submissions,
            stats
        });
        
    } catch (error) {
        console.error('Error fetching contact submissions:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching contact submissions'
        });
    }
});

// Update contact submission status
router.put('/admin/contact-submissions/:id/status', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        // Validate status
        const validStatuses = ['new', 'in_progress', 'resolved', 'closed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }
        
        const updateData = { status };
        
        // If resolving, set resolved_date and resolved_by
        if (status === 'resolved') {
            updateData.resolved_date = new Date();
            updateData.resolved_by = req.session.user.username; // Assuming user info in session
        }
        
        await pool.execute(
            'UPDATE contact_submissions SET status = ?, resolved_date = ?, resolved_by = ? WHERE id = ?',
            [status, updateData.resolved_date || null, updateData.resolved_by || null, id]
        );
        
        res.json({
            success: true,
            message: 'Status updated successfully'
        });
        
    } catch (error) {
        console.error('Error updating contact submission status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating status'
        });
    }
});

module.exports = router;
