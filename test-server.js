const express = require('express');
const path = require('path');
const app = express();

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Mock user for testing
const mockUser = { username: 'testuser' };

// Routes
app.get('/enter_data_by_form', (req, res) => {
    res.render('enter_data_by_form', { user: mockUser });
});

// Mock API endpoints
app.get('/api/locations', (req, res) => {
    res.json([
        { LocationID: 1, LocationName: 'Test Location 1' },
        { LocationID: 2, LocationName: 'Test Location 2' }
    ]);
});

app.post('/api/locations', (req, res) => {
    console.log('Received new location:', req.body);
    // Simulate successful save
    res.json({ 
        success: true, 
        locationId: Math.floor(Math.random() * 1000) + 100,
        message: 'Location saved successfully'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Test server running on http://localhost:${PORT}`);
    console.log(`Form page: http://localhost:${PORT}/enter_data_by_form`);
});
