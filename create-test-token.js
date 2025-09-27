const { pool } = require('./config/database');

async function createTestToken() {
    try {        // Create a test user first (if not exists)
        const testUserId = 99999; // Use integer ID
        const testEmail = 'test@example.com';
        const testUsername = 'testuser';
        
        // Check if user exists
        const [existingUsers] = await pool.execute(
            'SELECT User_UniqueID FROM users WHERE User_UniqueID = ?',
            [testUserId]
        );
        
        if (existingUsers.length === 0) {
            // Create test user
            await pool.execute(
                'INSERT INTO users (User_UniqueID, username, email, password) VALUES (?, ?, ?, ?)',
                [testUserId, testUsername, testEmail, '$2a$10$dummyhashedpassword']
            );
            console.log('Created test user:', testUserId);
        }
        
        // Create a fresh token that expires in 1 hour
        const token = 'test-token-' + Date.now();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
        
        await pool.execute(
            'INSERT INTO password_reset_tokens (user_id, token, expires_at, used) VALUES (?, ?, ?, 0)',
            [testUserId, token, expiresAt]
        );
        
        console.log('Created test token:', token);
        console.log('Expires at:', expiresAt);
        console.log('Test URL: http://192.168.31.158:3000/auth/reset-password?token=' + token);
        
    } catch (error) {
        console.error('Error creating test token:', error);
    } finally {
        process.exit();
    }
}

createTestToken();
