const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function updateDatabase() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'mysql', // Adjust as needed for your setup
        database: 'sweetl23_partner_demo' // Adjust database name as needed
    });

    try {
        console.log('Reading database update script...');
        const sqlScript = fs.readFileSync(path.join(__dirname, 'database', 'update_schema_for_forms.sql'), 'utf8');
        
        // Split the script into individual statements
        const statements = sqlScript.split(';').filter(stmt => stmt.trim().length > 0);
        
        console.log(`Executing ${statements.length} database statements...`);
        
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i].trim();
            if (statement) {
                try {
                    console.log(`Executing statement ${i + 1}/${statements.length}...`);
                    await connection.execute(statement);
                } catch (error) {
                    // Some statements might fail if columns already exist, that's okay
                    if (error.code === 'ER_DUP_FIELDNAME' || error.code === 'ER_TABLE_EXISTS_ERROR') {
                        console.log(`Statement ${i + 1} skipped (already exists): ${error.message}`);
                    } else {
                        console.error(`Error executing statement ${i + 1}:`, error.message);
                    }
                }
            }
        }
        
        console.log('Database update completed successfully!');
        
    } catch (error) {
        console.error('Error updating database:', error);
    } finally {
        await connection.end();
    }
}

// Run the update if this script is called directly
if (require.main === module) {
    updateDatabase();
}

module.exports = updateDatabase;
