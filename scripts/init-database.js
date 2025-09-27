#!/usr/bin/env node

// Database initialization script
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function initializeDatabase() {
    let connection;
    
    try {
        console.log('🚀 Starting database initialization...');
        
        // Create connection without specifying database
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASS || 'mysql',
            charset: 'utf8mb4',
            multipleStatements: true
        });
        
        console.log('✅ Connected to MySQL server');
        
        // Read the schema file
        const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
        const schemaSql = await fs.readFile(schemaPath, 'utf8');
        
        console.log('📖 Read schema file');
        
        // Execute the schema SQL
        console.log('🏗️  Creating database and tables...');
        await connection.execute(schemaSql);
        
        console.log('✅ Database schema created successfully!');
        console.log('');
        console.log('📊 Database Summary:');
        console.log('  • Database: sweetl23_partner_demo');
        console.log('  • Tables created:');
        console.log('    - users (authentication)');
        console.log('    - sample_data (main data storage)');
        console.log('    - sample_types_ref (reference data)');
        console.log('    - sessions (session storage)');
        console.log('  • Default users created:');
        console.log('    - admin / admin@example.com (password: admin123)');
        console.log('    - testuser / test@example.com (password: test123)');
        console.log('  • Sample data: 3 test records inserted');
        console.log('');
        console.log('🎉 Database initialization complete!');
        console.log('💡 You can now start the application with: npm start');
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('');
            console.error('🔑 Access denied. Please check your database credentials in .env file:');
            console.error('   DB_HOST, DB_USER, DB_PASS');
        } else if (error.code === 'ECONNREFUSED') {
            console.error('');
            console.error('🔌 Connection refused. Please make sure MySQL server is running.');
        }
        
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run the initialization
initializeDatabase();
