const { pool } = require('./config/database');

async function checkAllTokens() {
    try {
        console.log('Checking all password reset tokens in database...\n');
        
        const [tokens] = await pool.execute(
            'SELECT token, user_id, expires_at, used, created_at FROM password_reset_tokens ORDER BY created_at DESC LIMIT 10'
        );

        if (tokens.length === 0) {
            console.log('❌ No password reset tokens found in database');
            
            // Let's also check if the table exists
            const [tables] = await pool.execute(
                "SHOW TABLES LIKE 'password_reset_tokens'"
            );
            
            if (tables.length === 0) {
                console.log('❌ password_reset_tokens table does not exist');
            } else {
                console.log('✅ password_reset_tokens table exists but is empty');
            }
            return;
        }

        console.log(`📋 Found ${tokens.length} tokens:`);
        tokens.forEach((tokenData, index) => {
            const currentTime = new Date();
            const expiresAt = new Date(tokenData.expires_at);
            const isExpired = currentTime > expiresAt;
            const isUsed = tokenData.used === 1;
            
            console.log(`\n${index + 1}. Token: ${tokenData.token.substring(0, 20)}...`);
            console.log(`   User ID: ${tokenData.user_id}`);
            console.log(`   Created: ${tokenData.created_at}`);
            console.log(`   Expires: ${tokenData.expires_at}`);
            console.log(`   Used: ${tokenData.used === 1 ? 'Yes' : 'No'}`);
            console.log(`   Status: ${isExpired ? 'EXPIRED' : 'VALID'} ${isUsed ? '& USED' : '& UNUSED'}`);
        });
        
        // Pick the first token for testing
        const testToken = tokens[0];
        console.log(`\n🧪 Test with first token: http://192.168.31.158:3000/auth/reset-password?token=${testToken.token}`);
        
    } catch (error) {
        console.error('❌ Error checking tokens:', error);
    } finally {
        process.exit(0);
    }
}

checkAllTokens();
