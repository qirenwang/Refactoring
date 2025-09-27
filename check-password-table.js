const { pool } = require('./config/database');

async function checkPasswordTable() {
    try {
        // Check if table exists
        const [tables] = await pool.execute('SHOW TABLES LIKE "password_reset_tokens"');
        
        if (tables.length > 0) {
            console.log('✓ password_reset_tokens table exists');
            
            // Show table structure
            const [structure] = await pool.execute('DESCRIBE password_reset_tokens');
            console.log('\nTable structure:');
            structure.forEach(row => {
                console.log(`  - ${row.Field}: ${row.Type} ${row.Null === 'NO' ? '(NOT NULL)' : ''} ${row.Key ? `(${row.Key})` : ''}`);
            });
            
            // Check if table has any data
            const [count] = await pool.execute('SELECT COUNT(*) as count FROM password_reset_tokens');
            console.log(`\nTable has ${count[0].count} records`);
            
        } else {
            console.log('✗ password_reset_tokens table does not exist');
            console.log('Creating table...');
            
            // Create the table
            const createTableSQL = `
                CREATE TABLE password_reset_tokens (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    token VARCHAR(255) NOT NULL UNIQUE,
                    expires_at DATETIME NOT NULL,
                    used TINYINT(1) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_token (token),
                    INDEX idx_email (email),
                    INDEX idx_expires_at (expires_at)
                )
            `;
            
            await pool.execute(createTableSQL);
            console.log('✓ password_reset_tokens table created successfully');
        }
        
    } catch (error) {
        console.error('Database check failed:', error.message);
    } finally {
        await pool.end();
    }
}

checkPasswordTable();
