const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkTables() {
    let connection;
    
    try {
        console.log('🔍 Checking existing database tables...');
        
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASS || 'mysql',
            database: process.env.DB_NAME || 'sweetl23_partner_demo',
            charset: 'utf8mb4'
        });
        
        console.log('✅ Connected to database');
        
        // Check if users table exists
        const [tables] = await connection.execute("SHOW TABLES");
        console.log('\n📋 Existing tables:');
        tables.forEach(table => {
            console.log(`  • ${Object.values(table)[0]}`);
        });
        
        // Check if users table exists and has the right structure
        try {
            const [userColumns] = await connection.execute("DESCRIBE users");
            console.log('\n👤 Users table structure:');
            userColumns.forEach(col => {
                console.log(`  • ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
            });
        } catch (err) {
            console.log('\n❌ Users table does not exist');
        }
        
        // Check if sample_data table exists and has the right structure
        try {
            const [sampleColumns] = await connection.execute("DESCRIBE sample_data");
            console.log('\n📊 Sample_data table structure:');
            sampleColumns.forEach(col => {
                console.log(`  • ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
            });
        } catch (err) {
            console.log('\n❌ Sample_data table does not exist');
        }
        
        // Check if we have any users
        try {
            const [users] = await connection.execute("SELECT COUNT(*) as count FROM users");
            console.log(`\n👥 Users in database: ${users[0].count}`);
        } catch (err) {
            console.log('\n❌ Cannot query users table');
        }
        
        // Check if we have any sample data
        try {
            const [samples] = await connection.execute("SELECT COUNT(*) as count FROM sample_data");
            console.log(`📈 Sample records: ${samples[0].count}`);
        } catch (err) {
            console.log('\n❌ Cannot query sample_data table');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

checkTables();
