const mysql = require('mysql2/promise');
require('dotenv').config();

async function createSampleDataTable() {
    let connection;
    
    try {
        console.log('🚀 Creating sample_data table...');
        
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASS || 'mysql',
            database: process.env.DB_NAME || 'sweetl23_partner_demo',
            charset: 'utf8mb4'
        });
        
        console.log('✅ Connected to database');
          // Create sample_data table
        const createTableSQL = `
        CREATE TABLE IF NOT EXISTS \`sample_data\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`created_by\` int(11) NOT NULL,
          
          -- Location information
          \`latitude\` decimal(10,6) DEFAULT NULL,
          \`longitude\` decimal(10,6) DEFAULT NULL,
          \`location_name\` varchar(255) DEFAULT NULL,
          \`location_description\` text DEFAULT NULL,
          \`street_address\` varchar(255) DEFAULT NULL,
          \`city\` varchar(100) DEFAULT NULL,
          \`state\` varchar(50) DEFAULT NULL,
          \`country\` varchar(50) DEFAULT 'USA',
          
          -- Sample collection information
          \`collection_date\` date DEFAULT NULL,
          \`collection_time\` time DEFAULT NULL,
          \`user_sample_id\` varchar(100) DEFAULT NULL,
          \`sampler_names\` text DEFAULT NULL,
          
          -- Environmental conditions
          \`air_temp_f\` decimal(5,1) DEFAULT NULL,
          \`weather_current\` varchar(50) DEFAULT NULL,
          \`weather_24h_prior\` varchar(50) DEFAULT NULL,
          \`rainfall_24h_inches\` decimal(5,2) DEFAULT NULL,
          
          -- Sample type and media
          \`sample_type\` int(11) DEFAULT NULL COMMENT '1-10 representing different sample types',
          \`media_type\` varchar(50) DEFAULT NULL COMMENT 'Litter, Water, Soil, etc.',
          \`media_subtype\` varchar(100) DEFAULT NULL,
          
          -- Sample details
          \`particle_count\` int(11) DEFAULT NULL,
          \`particle_size_class\` varchar(50) DEFAULT NULL,
          \`particle_form\` varchar(50) DEFAULT NULL,
          \`particle_color\` varchar(50) DEFAULT NULL,
          \`polymer_code\` text DEFAULT NULL,
          \`analysis_type\` varchar(100) DEFAULT NULL,
          \`storage_location\` varchar(100) DEFAULT NULL,
          
          -- Additional data and notes
          \`notes\` text DEFAULT NULL,
          \`additional_data\` longtext DEFAULT NULL COMMENT 'JSON string for additional form fields',
          
          -- File attachments
          \`uploaded_files\` longtext DEFAULT NULL COMMENT 'JSON string for uploaded file information',
          
          -- Quality control
          \`data_quality_flag\` enum('good', 'suspect', 'bad') DEFAULT 'good',
          \`reviewed_by\` int(11) DEFAULT NULL,
          \`reviewed_at\` datetime DEFAULT NULL,
          \`review_notes\` text DEFAULT NULL,
          
          -- Metadata
          \`created_at\` datetime DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          \`data_source\` enum('manual', 'file_upload', 'api') DEFAULT 'manual',
          
          PRIMARY KEY (\`id\`),
          INDEX \`idx_created_by\` (\`created_by\`),
          INDEX \`idx_collection_date\` (\`collection_date\`),
          INDEX \`idx_location\` (\`latitude\`, \`longitude\`),
          INDEX \`idx_sample_type\` (\`sample_type\`),
          INDEX \`idx_created_at\` (\`created_at\`),
          INDEX \`idx_quality_flag\` (\`data_quality_flag\`)
        ) ENGINE=MyISAM DEFAULT CHARSET=latin1;
        `;
        
        await connection.execute(createTableSQL);
        console.log('✅ Sample_data table created successfully');
          // Create reference table for sample types
        const createRefTableSQL = `
        CREATE TABLE IF NOT EXISTS \`sample_types_ref\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`type_name\` varchar(100) NOT NULL,
          \`type_description\` text DEFAULT NULL,
          \`is_active\` tinyint(1) DEFAULT 1,
          \`created_at\` datetime DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_active\` (\`is_active\`)
        ) ENGINE=MyISAM DEFAULT CHARSET=latin1;
        `;
        
        await connection.execute(createRefTableSQL);
        console.log('✅ Sample_types_ref table created successfully');
        
        // Insert default sample types
        const insertSampleTypesSQL = `
        INSERT IGNORE INTO \`sample_types_ref\` (\`id\`, \`type_name\`, \`type_description\`) VALUES
        (1, 'Surface Water', 'Water samples collected from surface sources'),
        (2, 'Beach Sediment', 'Sediment samples from beach/shoreline areas'),
        (3, 'Marine Litter', 'Visible litter collected from marine environments'),
        (4, 'Freshwater Sediment', 'Sediment samples from freshwater sources'),
        (5, 'Soil Sample', 'Terrestrial soil samples'),
        (6, 'Air Sample', 'Atmospheric microplastic samples'),
        (7, 'Biota Sample', 'Samples from living organisms'),
        (8, 'Drinking Water', 'Treated/untreated drinking water samples'),
        (9, 'Wastewater', 'Municipal or industrial wastewater samples'),
        (10, 'Other', 'Other sample types not listed above');
        `;
        
        await connection.execute(insertSampleTypesSQL);
        console.log('✅ Sample types reference data inserted');
        
        // Insert some test sample data
        const insertTestDataSQL = `
        INSERT IGNORE INTO \`sample_data\` (
          \`id\`, \`created_by\`, \`latitude\`, \`longitude\`, \`location_name\`, \`collection_date\`, 
          \`sample_type\`, \`media_type\`, \`particle_count\`, \`notes\`, \`created_at\`
        ) VALUES 
        (1, 1, 40.7128, -74.0060, 'New York Harbor', '2024-01-15', 1, 'Surface Water', 25, 'Test sample from NYC harbor area', NOW()),
        (2, 1, 34.0522, -118.2437, 'Santa Monica Beach', '2024-01-20', 2, 'Beach Sediment', 15, 'Beach sediment sample from Santa Monica', NOW()),
        (3, 2, 41.8781, -87.6298, 'Lake Michigan Shore', '2024-01-25', 4, 'Freshwater Sediment', 8, 'Freshwater sediment from Lake Michigan', NOW());
        `;
        
        await connection.execute(insertTestDataSQL);
        console.log('✅ Test sample data inserted');
        
        // Show final statistics
        const [userCount] = await connection.execute("SELECT COUNT(*) as count FROM users");
        const [sampleCount] = await connection.execute("SELECT COUNT(*) as count FROM sample_data");
        const [typeCount] = await connection.execute("SELECT COUNT(*) as count FROM sample_types_ref");
        
        console.log('');
        console.log('📊 Database Setup Complete!');
        console.log(`👥 Users: ${userCount[0].count}`);
        console.log(`📈 Sample records: ${sampleCount[0].count}`);
        console.log(`🏷️  Sample types: ${typeCount[0].count}`);
        console.log('');
        console.log('🎉 The Node.js application is now ready to run!');
        console.log('💡 Start the server with: npm start');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            console.error('   This might be because user IDs don\'t match. Let me check user IDs...');
            try {
                const [users] = await connection.execute("SELECT User_UniqueID, username FROM users");
                console.log('   Available users:');
                users.forEach(user => {
                    console.log(`   • ID: ${user.User_UniqueID}, Username: ${user.username}`);
                });
            } catch (err) {
                console.error('   Could not fetch users:', err.message);
            }
        }
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

createSampleDataTable();
