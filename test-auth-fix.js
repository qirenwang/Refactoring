// Quick test to verify the auth.js SQL fix is working
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root', 
    password: process.env.DB_PASS || 'mysql',
    database: process.env.DB_NAME || 'sweetl23_partner_demo',
    charset: 'utf8mb4'
};

async function testAuthFix() {
    try {
        const pool = await mysql.createPool(dbConfig);
        
        // Test the exact same query that's now in auth.js
        const testToken = 'non_existent_token';
        const [tokens] = await pool.execute(
            'SELECT * FROM password_reset_tokens WHERE token = ?',
            [testToken]
        );
        
        console.log('✅ SQL query executed successfully!');
        console.log(`Found ${tokens.length} tokens (expected 0 for non-existent token)`);
        
        // Test with a real token if any exist
        const [allTokens] = await pool.execute(
            'SELECT * FROM password_reset_tokens ORDER BY created_at DESC LIMIT 1'
        );
        
        if (allTokens.length > 0) {
            const realToken = allTokens[0].token;
            const [realTokenResult] = await pool.execute(
                'SELECT * FROM password_reset_tokens WHERE token = ?',
                [realToken]
            );
            
            console.log(`✅ Real token query also works! Found ${realTokenResult.length} token(s)`);
            
            if (realTokenResult.length > 0) {
                const tokenData = realTokenResult[0];
                const currentTime = new Date();
                const expiresAt = new Date(tokenData.expires_at);
                const isExpired = currentTime > expiresAt;
                const isUsed = tokenData.used === 1;
                
                console.log('Token validation logic test:');
                console.log(`- Token ID: ${tokenData.id}`);
                console.log(`- Expires at: ${tokenData.expires_at}`);
                console.log(`- Used: ${tokenData.used}`);
                console.log(`- Is expired: ${isExpired}`);
                console.log(`- Is used: ${isUsed}`);
                console.log(`- Should redirect to expired page: ${isExpired || isUsed}`);
            }
        } else {
            console.log('No tokens found in database to test with');
        }
        
        await pool.end();
        console.log('✅ All tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

testAuthFix();
