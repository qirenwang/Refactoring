const { pool } = require('./config/database');

async function testExpiredToken() {
    try {
        console.log('Testing expired token behavior...\n');
        
        // Get the token that should be expired
        const token = 'c9b8a7d6e5f4321098765432100987654321';
        
        const [tokens] = await pool.execute(
            'SELECT token, user_id, expires_at, used, created_at FROM password_reset_tokens WHERE token = ?',
            [token]
        );

        if (tokens.length === 0) {
            console.log('❌ Token not found in database');
            return;
        }

        const tokenData = tokens[0];
        console.log('📋 Token Details:');
        console.log(`   Token: ${tokenData.token}`);
        console.log(`   User ID: ${tokenData.user_id}`);
        console.log(`   Created: ${tokenData.created_at}`);
        console.log(`   Expires: ${tokenData.expires_at}`);
        console.log(`   Used: ${tokenData.used === 1 ? 'Yes' : 'No'}`);
        
        // Check expiration
        const currentTime = new Date();
        const expiresAt = new Date(tokenData.expires_at);
        const isExpired = currentTime > expiresAt;
        const isUsed = tokenData.used === 1;
        
        console.log(`\n🕒 Current Time: ${currentTime.toISOString()}`);
        console.log(`🕒 Token Expires: ${expiresAt.toISOString()}`);
        console.log(`❗ Is Expired: ${isExpired ? 'YES' : 'NO'}`);
        console.log(`❗ Is Used: ${isUsed ? 'YES' : 'NO'}`);
        
        if (isExpired || isUsed) {
            console.log('\n✅ Token should redirect to expired page');
        } else {
            console.log('\n✅ Token should show reset password form');
        }
        
        console.log('\n🌐 Test URL: http://192.168.31.158:3000/auth/reset-password?token=' + token);
        
    } catch (error) {
        console.error('❌ Error testing token:', error);
    } finally {
        process.exit(0);
    }
}

testExpiredToken();
