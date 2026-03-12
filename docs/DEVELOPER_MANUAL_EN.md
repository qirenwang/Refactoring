# MicroPlastics Data Entry System - Developer Manual

## 1. Project Overview

**Project Name**: MicroPlastics Data Entry System (mp-data-entry-nodejs)  
**Version**: 1.0.0  
**Description**: A web application for collecting and managing microplastics sampling data. Refactored from PHP to Node.js, it supports multi-step form data entry, map visualization, user authentication, file upload, and more.

### Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | LTS |
| Backend Framework | Express.js | 4.18.2 |
| Template Engine | EJS | 3.1.10 |
| Database | MariaDB/MySQL (mysql2) | 3.6.0 |
| Password Hashing | bcryptjs | 2.4.3 |
| Session Management | express-session | 1.17.3 |
| Image Processing | @napi-rs/canvas | 0.1.71 |
| Email Service | Nodemailer | 7.0.3 |
| Security Middleware | Helmet | 7.0.0 |
| CORS | CORS | 2.8.5 |
| Validation | express-validator | 7.0.1 |
| File Upload | Multer | 1.4.5-lts.1 |
| Logging | Morgan | 1.10.0 |
| Environment Variables | dotenv | 16.3.1 |
| Dev Hot Reload | nodemon | 3.0.1 |

---

## 2. Project Architecture

### Directory Structure

```
Refactoring/
├── app.js                          # Main entry point, middleware config & server startup
├── package.json                    # Project dependencies & npm scripts
├── Dockerfile                      # Docker image build file
├── docker-compose.yml              # Docker Compose orchestration file
├── database_init.sql               # Database initialization SQL
│
├── config/                         # Configuration files
│   ├── database.js                 # Database connection pool configuration
│   └── session.js                  # Session configuration
│
├── middleware/                     # Middleware
│   └── auth.js                     # Authentication & session timeout middleware
│
├── routes/                         # Routes
│   ├── auth.js                     # Auth routes (login/signup/password reset/captcha)
│   ├── pages.js                    # Page routes (all EJS page rendering)
│   └── api.js                      # API routes (data save/query/file upload)
│
├── services/                       # Business services
│   └── emailService.js             # Email service (password reset/contact form)
│
├── views/                          # EJS templates
│   ├── layout.ejs                  # Main layout template
│   ├── home.ejs                    # Home page
│   ├── login.ejs                   # Login page
│   ├── signup.ejs                  # Signup page
│   ├── about.ejs                   # About page
│   ├── documentation.ejs           # Documentation page
│   ├── review.ejs                  # Data review page
│   ├── contact.ejs                 # Contact us page
│   ├── enter_and_edit_data.ejs     # Data entry/edit portal page
│   ├── enter_data_by_form.ejs      # Form-based data entry page
│   ├── enter_data_by_file.ejs      # File upload data entry page
│   ├── my_locations.ejs            # My locations management page
│   ├── my_locations_view.ejs       # Location view page
│   ├── my_samples.ejs              # My samples page
│   ├── my_profile.ejs              # User profile page
│   ├── admin-contact.ejs           # Admin contact form management page
│   ├── reset_password.ejs          # Password reset page
│   ├── reset_password_expired.ejs  # Reset link expired page
│   ├── error.ejs                   # Error page
│   ├── captcha_test.ejs            # Captcha test page
│   │
│   ├── partials/                   # Shared template partials
│   │   ├── header.ejs              # Header navigation
│   │   ├── sidebar.ejs             # Sidebar menu
│   │   ├── footer.ejs              # Footer
│   │   └── timeout_modal.ejs       # Session timeout warning modal
│   │
│   └── data_forms/                 # Multi-step data entry forms
│       ├── formpage1.ejs           # Step 1: Select sampling location
│       ├── formpage2.ejs           # Step 2: Sampling event information
│       ├── formpage3.ejs           # Step 3: Sample details
│       ├── formpage4.ejs           # Step 4: Plastic count statistics
│       ├── formpage5.ejs           # Step 5: Detailed analysis data
│       └── formpage6.ejs           # Step 6: Review and submit
│
├── public/                         # Static assets
│   ├── css/
│   │   ├── mp_style.css            # Main application styles
│   │   ├── style.css               # General styles
│   │   ├── auth.css                # Authentication page styles
│   │   ├── auth-pages.css          # Authentication page additional styles
│   │   └── fancy-modal.css         # Modal component styles
│   │
│   ├── js/
│   │   ├── common.js               # Common utility functions
│   │   ├── app.js                  # Frontend application entry
│   │   ├── main.js                 # Main script
│   │   ├── auth.js                 # Login/signup form handling
│   │   ├── form-handler.js         # Data entry form core handler
│   │   ├── form-loader.js          # Form loader
│   │   ├── form-validation.js      # Form validation logic
│   │   ├── multi-form-handler.js   # Multi-form handler
│   │   ├── map-home.js             # Home page map
│   │   ├── map-review.js           # Data review map
│   │   ├── map-data-entry.js       # Data entry map
│   │   ├── map-handler.js          # Common map handler
│   │   ├── enter-and-edit-map.js   # Entry and edit map
│   │   ├── my-locations.js         # Location management
│   │   ├── session-timeout.js      # Session timeout detection
│   │   ├── file-upload.js          # File upload handling
│   │   ├── dashboard.js            # Dashboard functionality
│   │   ├── fancy-modal.js          # Modal component
│   │   └── stagewise-toolbar.js    # Stage toolbar
│   │
│   └── assets/                     # Images, icons, and other static assets
│
├── scripts/                        # Database management scripts
│   ├── init-database.js            # Database initialization
│   ├── check-database.js           # Database status check
│   ├── update-database.js          # Database schema update
│   └── create-sample-table.js      # Sample table creation
│
├── db/                             # Database backups
│   └── sweetl23_partner_demo_*.sql # Full database export
│
├── uploads/                        # User uploaded files directory
├── logs/                           # Application logs directory
└── docs/                           # Project documentation
    ├── DEVELOPER_MANUAL.md         # Developer manual (Chinese)
    ├── DEVELOPER_MANUAL_EN.md      # Developer manual (English, this file)
    ├── QUICKSTART.md               # Quick start guide (Chinese)
    ├── QUICKSTART_EN.md            # Quick start guide (English)
    └── env.template.txt            # Environment variables template
```

### Architecture Overview

```
Browser (Client)
    │
    ▼
┌───────────────┐
│   Express.js  │  ← app.js entry point
├───────────────┤
│  Middleware    │  ← Helmet / CORS / Morgan / Session / Body Parser
├───────────────┤
│  Route Layer  │
│  ├── /auth/*  │  ← Authentication (login/signup/password reset)
│  ├── /api/*   │  ← REST API (CRUD operations)
│  └── /*       │  ← Page rendering (EJS templates)
├───────────────┤
│  Service Layer│  ← emailService (email sending)
├───────────────┤
│  Data Layer   │  ← mysql2 connection pool → MariaDB
└───────────────┘
```

---

## 3. Environment Setup

### 3.1 Environment Variables

Create a `.env` file in the project root (based on the `docs/env.template.txt` template):

```bash
cp docs/env.template.txt .env
```

Required configuration:

```bash
# ---- Application Config ----
NODE_ENV=development
PORT=3001

# ---- Database Config ----
DB_HOST=104.247.77.90
DB_USER=your_database_username
DB_PASS=your_database_password
DB_NAME=sweetl23_partner_demo

# ---- Session Config ----
SESSION_SECRET=your_secure_random_session_secret_key_here
SESSION_TIMEOUT=1800          # Timeout in seconds, default 30 minutes
COOKIE_HTTP_ONLY=true

# ---- SMTP Email Config ----
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your_email@domain.com
SMTP_PASS=your_email_password

# ---- Admin Emails (contact form notifications) ----
ADMIN_EMAIL_1=admin1@domain.com
ADMIN_EMAIL_2=admin2@domain.com
ADMIN_EMAIL_3=admin3@domain.com

# ---- Production CORS ----
# ALLOWED_ORIGINS=https://your-production-domain.com,https://www.your-domain.com
```

### 3.2 Local Development

```bash
# Install dependencies
npm install

# Development mode (nodemon hot reload)
npm run dev

# Production mode
npm start
```

> **Note**: Local development defaults to port `3001` to avoid conflicts with the remote Docker container (which uses port 3000).

### 3.3 Database

The project uses a remote MariaDB database:

- **Remote Server**: CentOS 7, IP `104.247.77.90`
- **Database Name**: `sweetl23_partner_demo`
- **Connection**: `mysql2/promise` connection pool, max 10 connections
- **Charset**: `utf8mb4`

Database management scripts:

```bash
# Initialize database (creates tables from database/schema.sql)
npm run init-db

# Check database status (list tables and record counts)
node scripts/check-database.js

# Update database schema
node scripts/update-database.js
```

---

## 4. Core Modules

### 4.1 Application Entry (`app.js`)

`app.js` is the main entry point, responsible for:

1. **Middleware Configuration**: Helmet (security headers), CORS, Morgan (logging), Body Parser, Cookie Parser, Session
2. **View Engine**: EJS template engine setup; view caching disabled in development mode
3. **Route Mounting**: `/auth/*` → auth routes, `/api/*` → API routes, `/*` → page routes
4. **Legacy Compatibility**: API routes are also mounted at the `/` root path for backward compatibility with legacy PHP endpoints (e.g., `/php/get_map_data.php`)
5. **Error Handling**: Global error handling middleware and 404 handler
6. **Startup Flow**: Test database connection → Start HTTP server → Dynamically detect network IP

Key behaviors:
- **Development Mode**: All Helmet security headers disabled (for easier debugging), CORS allows any origin
- **Production Mode**: CSP and other security policies enabled, CORS restricted to `ALLOWED_ORIGINS`
- **Log Filtering**: Automatically skips logging for `GET /api/check-session` requests (reduces noise)

### 4.2 Authentication System

#### Auth Routes (`routes/auth.js`)

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/auth/captcha` | GET | Generate CAPTCHA image (using @napi-rs/canvas) | No |
| `/auth/login` | POST | User login | No |
| `/auth/signup` | POST | User registration | No |
| `/auth/logout` | POST | User logout | No |
| `/auth/check-session` | GET | Check session status | No |
| `/auth/reset-password-request` | POST | Request password reset email | No |
| `/auth/reset-password` | GET | Password reset page (validate token) | No |
| `/auth/reset-password` | POST | Submit new password | No |

**Login Flow**:
```
1. Frontend submits username/email + password + captcha
2. Captcha validation (compared against session-stored value)
3. Database user lookup (supports username or email)
4. bcrypt password verification
5. Session creation (stores user_id, username, email, etc.)
6. If "Remember Me" selected, sets cookie (30-day validity)
7. Redirect to home page or previously requested URL
```

**Registration Flow**:
```
1. Frontend submits username, email, password, and other info + captcha
2. Captcha validation
3. Username and email uniqueness check
4. bcrypt password hashing (12 rounds)
5. Insert user record into database
6. Auto-login and redirect
```

**Password Reset Flow**:
```
1. User submits email → Random token generated (32-byte hex)
2. Token stored in password_reset_tokens table (1-hour validity)
3. Reset email sent (with reset link)
4. User clicks link → Token validity verified
5. New password submitted → Password updated, token marked as used
6. Confirmation email sent
```

#### Auth Middleware (`middleware/auth.js`)

| Middleware | Purpose |
|-----------|---------|
| `requireAuth` | Protects routes requiring login. Unauthenticated API requests return 401 JSON; page requests redirect to login |
| `redirectIfLoggedIn` | Redirects logged-in users from login/signup pages to home |
| `checkSessionTimeout` | Global middleware that checks session timeout (based on `SESSION_TIMEOUT` config) |

### 4.3 Data Entry API (`routes/api.js`)

#### Complete API Endpoint Reference

**Health Check & Testing**

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/health` | GET | Health check | No |
| `/api/cors-test` | GET | CORS connectivity test | No |
| `/api/test-save` | POST | Data save test endpoint | No |

**Map Data**

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/map-data` | GET | Get map marker data | No |
| `/php/get_map_data.php` | GET | Legacy PHP-compatible endpoint | No |

**Form Data Submission**

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/save-form-data` | POST | Save multi-step form data | Yes |
| `/api/upload-file-data` | POST | Upload Excel data file | Yes |

**Reference Data**

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/references` | GET | Get reference data (polymer types, purpose categories, etc.) | No |

**Location Management**

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/locations` | GET | Get locations (filterable by user when logged in) | No |
| `/api/locations` | POST | Create new location | Yes |
| `/api/my-locations` | GET | Get current user's locations | Yes |
| `/api/check-location-exists` | GET | Check if location name already exists | No |

**User Data**

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/my-samples` | GET | Get current user's samples (paginated) | Yes |
| `/api/check-session` | GET | Check session status | No |

**Contact Form**

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/contact` | POST | Submit contact form | No |
| `/api/admin/contact-submissions` | GET | Get contact form submission list | Yes |
| `/api/admin/contact-submissions/:id/status` | PUT | Update submission status | Yes |

**Template Download**

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/download-template` | GET | Download data template file | Yes |

**Test Data**

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/add-test-location-data` | POST | Add test location data | Yes |

#### Form Data Save Flow (`POST /api/save-form-data`)

This is the system's most critical API, performing multi-table inserts within a single database transaction:

```
1. Receive complete form data from frontend
2. Percentage field validation (each group must total 100%)
3. Package hierarchy count validation
4. Begin database transaction (BEGIN)
5. Insert SamplingEvent record
6. Insert SampleDetails record
7. Insert MicroplasticsInSample record (if applicable)
8. Insert FragmentsInSample record (if applicable)
9. Insert PackagesInSample records one by one (if applicable)
10. Insert RamanDetails record (if applicable)
11. Commit transaction (COMMIT)
12. Rollback on failure (ROLLBACK)
```

### 4.4 Page Routes (`routes/pages.js`)

| Path | Description | Auth Required |
|------|-------------|---------------|
| `/` | Redirect to `/home` | No |
| `/home` | Home page (map display) | No |
| `/login` | Login page | No (redirects if logged in) |
| `/signup` | Signup page | No (redirects if logged in) |
| `/about` | About page | No |
| `/documentation` | Documentation page | No |
| `/review` | Data review page | No |
| `/contact` | Contact us page | No |
| `/enter_and_edit_data` | Data entry/edit portal | Yes |
| `/enter_data_by_form` | Form-based data entry | Yes |
| `/enter_data_by_file` | File upload data entry | Yes |
| `/my-locations` | My locations management | Yes |
| `/my-locations-view` | Location view | Yes |
| `/my-samples` | My samples | Yes |
| `/my-profile` | User profile (GET/POST) | Yes |
| `/admin/contact` | Admin contact form management | Yes |
| `/reset-password-expired` | Password reset link expired | No |
| `/logout` | Logout (GET) | No |
| `/captcha_test` | Captcha test page | No |

### 4.5 Email Service (`services/emailService.js`)

Built on Nodemailer, providing the following functions:

| Function | Purpose |
|----------|---------|
| `sendPasswordResetEmail(to, resetLink, username)` | Send password reset email |
| `sendPasswordResetConfirmationEmail(to, username)` | Send password reset confirmation email |
| `sendContactFormEmail(contactData)` | Send contact form content to admins |
| `sendContactConfirmationEmail(contactData)` | Send submission confirmation to user |

Required environment variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ADMIN_EMAIL_1/2/3`

### 4.6 Database Configuration (`config/database.js`)

```javascript
// Connection pool configuration
{
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'mysql',
    database: process.env.DB_NAME || 'sweetl23_partner_demo',
    charset: 'utf8mb4',
    connectionLimit: 10
}
```

Exports:
- `pool` — mysql2/promise connection pool instance, used for all database operations
- `testConnection()` — Tests database connectivity on startup

### 4.7 Session Configuration (`config/session.js`)

```javascript
{
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,                    // False in dev to support HTTP
        httpOnly: true,                   // Enabled by default
        maxAge: SESSION_TIMEOUT * 1000,   // Default 30 minutes
        sameSite: 'lax' | 'strict'        // Development: lax / Production: strict
    },
    name: 'sessionId'
}
```

---

## 5. Database Schema

### Core Business Tables

#### users

| Column | Type | Description |
|--------|------|-------------|
| User_UniqueID | INT AUTO_INCREMENT PK | User unique ID |
| username | VARCHAR(50) UNIQUE | Username |
| email | VARCHAR(100) UNIQUE | Email |
| password | VARCHAR(255) | bcrypt hashed password |
| full_name | VARCHAR(100) | Full name |
| institution | VARCHAR(150) | Institution |
| cell_phone | VARCHAR(20) | Phone number |
| sample_confidentiality | ENUM('public','restricted','private') | Data visibility level |
| sample_storage_location | INT | Sample storage location |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update time |

#### Location

| Column | Type | Description |
|--------|------|-------------|
| Loc_UniqueID | INT PK | Location unique ID |
| UserLocID_txt | TEXT | User-defined location ID |
| LocationName | VARCHAR(255) UNIQUE | Location name |
| Location_Desc | TEXT | Location description |
| Env-Indoor_SelectID | INT | Environment type (indoor/outdoor) |
| Lat-DecimalDegree | DECIMAL(10,6) | Latitude |
| Long-DecimalDegree | DECIMAL(10,6) | Longitude |
| StreetAddress | TEXT | Street address |
| City | TEXT | City |
| State | TEXT | State/Province |
| Country | TEXT | Country |
| ZipCode | INT | Zip code |
| UserCreated | TEXT | Creator |
| DateCreated | DATETIME | Creation date |

#### SamplingEvent

| Column | Type | Description |
|--------|------|-------------|
| SamplingEventUniqueID | INT UNIQUE | Sampling event ID |
| LocationID_Num | INT | Associated location ID |
| SamplingDate | DATE | Sampling date |
| UserSamplingID | TEXT | User sampling ID |
| AirTemp-C | DECIMAL(10,0) | Air temperature (°C) |
| Weather-Current | INT | Current weather |
| Weather-Precedent24 | INT | Weather in preceding 24 hours |
| Rainfall-cm-Precedent24 | DECIMAL(10,0) | Rainfall in preceding 24 hours (cm) |
| SamplerNames | TEXT | Sampler names |
| DeviceInstallationPeriod | ENUM('no','yes') | Device-based collection |
| DeviceStartDate | DATE | Device start date |
| DeviceEndDate | DATE | Device end date |
| SampleTime | TIME | Sampling time |
| AdditionalNotes | TEXT | Additional notes |

#### SampleDetails

| Column | Type | Description |
|--------|------|-------------|
| SampleUniqueID | INT UNIQUE | Sample ID |
| SamplingEvent_Num | INT | Associated sampling event ID |
| MediaType_SelectID | INT | Media type |
| WholePkg_Count | INT | Whole package count |
| FragLargerThan5mm_Count | INT | Fragment >5mm count |
| Micro5mmAndSmaller_Count | INT | Microplastic ≤5mm count |
| WaterEnvType_SelectID | INT | Water environment type |
| SoilMoisture% | INT | Soil moisture (%) |
| StorageLocation | INT | Storage location |
| MediaSubType | VARCHAR(100) | Media subtype |
| VolumeSampled | DECIMAL(10,3) | Volume sampled |
| WaterDepth | DECIMAL(10,2) | Water depth |
| FlowVelocity | DECIMAL(10,2) | Flow velocity |

#### MicroplasticsInSample

| Column | Type | Description |
|--------|------|-------------|
| Micro_UniqueID | INT PK | Microplastic record ID |
| SampleDetails_Num | INT | Associated sample ID |
| PercentSize_<1um | INT | <1μm size percentage |
| PercentSize_1-20um | INT | 1-20μm percentage |
| PercentSize_20-100um | INT | 20-100μm percentage |
| PercentSize_100um-1mm | INT | 100μm-1mm percentage |
| PercentSize_1-5mm | INT | 1-5mm percentage |
| PercentForm_fiber | INT | Fiber form percentage |
| PercentForm_Pellet | INT | Pellet form percentage |
| PercentForm_Fragment | INT | Fragment form percentage |
| PercentColor_Clear | INT | Clear color percentage |
| PercentColor_OpaqueLight | INT | Opaque light color percentage |
| PercentColor_OpaqueDark | INT | Opaque dark color percentage |
| PercentColor_Mixed | INT | Mixed color percentage |
| Method_Desc | TEXT | Analysis method description |

#### FragmentsInSample

| Column | Type | Description |
|--------|------|-------------|
| Fragment_UniqueID | INT PK | Fragment record ID |
| SampleDetails_Num | INT | Associated sample ID |
| PercentColor_Clear | INT | Clear percentage |
| PercentColor_Op-Color | INT | Opaque colored percentage |
| PercentColor_Op-Dk | INT | Opaque dark percentage |
| PercentColor_Mixed | INT | Mixed percentage |
| PercentForm_Fiber | INT | Fiber percentage |
| PercentForm_Pellet | INT | Pellet percentage |
| PercentForm_Film | INT | Film percentage |
| PercentForm_Foam | INT | Foam percentage |
| PercentForm_HardPlastic | INT | Hard plastic percentage |

#### PackagesInSample

| Column | Type | Description |
|--------|------|-------------|
| PackageDetailsUniqueID | INT UNIQUE | Package record ID |
| SampleDetails_Num | INT | Associated sample ID |
| Form_SelectID | INT | Form category |
| Purpose_SelectID | INT | Purpose category |
| PackagingPurpose | VARCHAR(200) | Packaging purpose description |
| RecycleCode | VARCHAR(20) | Recycle code |
| ColorOpacity | VARCHAR(50) | Color opacity |
| Color | VARCHAR(50) | Color |
| UserPieceID | VARCHAR(100) | User piece ID |

#### password_reset_tokens

| Column | Type | Description |
|--------|------|-------------|
| id | INT AUTO_INCREMENT PK | Record ID |
| user_id | INT | Associated user ID |
| token | VARCHAR(255) | Reset token |
| expires_at | DATETIME | Expiration time (1 hour) |
| used | TINYINT(1) | Whether used |
| created_at | TIMESTAMP | Creation time |

#### contact_submissions

| Column | Type | Description |
|--------|------|-------------|
| id | INT AUTO_INCREMENT PK | Record ID |
| name | VARCHAR(100) | Submitter name |
| email | VARCHAR(100) | Submitter email |
| subject | VARCHAR(200) | Subject |
| message | TEXT | Message content |
| status | ENUM | Processing status |
| created_at | TIMESTAMP | Creation time |

### Reference Tables

| Table | Description |
|-------|-------------|
| MediaType_WithinLitterWaterSoil_Ref | Media type reference (litter/water/soil) |
| WaterEnvType_Ref | Water environment type reference |
| WeatherType_Ref | Weather type reference |
| StorageLoc_Ref | Storage location reference |
| Wavelength_Ref | Wavelength range reference |
| LocType_Env-Indoor_Ref | Location environment type reference |
| PolymerType_Ref | Polymer type reference |
| Purpose_Ref | Package purpose reference |
| Form_Ref | Package form reference |
| ColorType_Ref | Color type reference |

---

## 6. Frontend Architecture

### Multi-Step Form System

Data entry uses a 6-step wizard form managed by `form-handler.js`:

```
Step 1: Select Sampling Location (formpage1.ejs)
    ├── Select existing location from map
    └── Create new location (enter coordinates, address, etc.)
        ↓
Step 2: Sampling Event Information (formpage2.ejs)
    ├── Date, time, weather
    ├── Temperature, rainfall
    └── Sampler names, device information
        ↓
Step 3: Sample Details (formpage3.ejs)
    ├── Media type (water/soil/litter)
    ├── Category counts
    └── Environmental parameters
        ↓
Step 4: Plastic Count Statistics (formpage4.ejs)
    ├── Whole package count by category
    ├── Fragment count by category
    └── Microplastic count by category
        ↓
Step 5: Detailed Analysis Data (formpage5.ejs)
    ├── Size distribution percentages
    ├── Form distribution percentages
    ├── Color distribution percentages
    ├── Polymer distribution percentages
    └── Raman spectroscopy data (optional)
        ↓
Step 6: Review and Submit (formpage6.ejs)
    ├── Data overview confirmation
    └── Final submission
```

### Map Functionality

The project uses Leaflet maps across multiple pages:

| File | Page | Function |
|------|------|----------|
| `map-home.js` | Home page | Display all sampling point markers |
| `map-review.js` | Review page | Filterable sampling data map display |
| `map-data-entry.js` | Form Step 1 | Select location or create new on map |
| `map-handler.js` | Shared | Map initialization and common operations |
| `enter-and-edit-map.js` | Entry/Edit page | Entry and edit page map |

### Frontend Common Components

| File | Function |
|------|----------|
| `common.js` | Common utility functions, global variables |
| `session-timeout.js` | Session timeout detection and warning modal |
| `fancy-modal.js` | Custom modal component |
| `auth.js` | Login/signup page form handling |
| `file-upload.js` | Excel file upload processing |

### CSS Files

| File | Purpose |
|------|---------|
| `mp_style.css` | Main application styles |
| `style.css` | General base styles |
| `auth.css` | Authentication page styles |
| `auth-pages.css` | Authentication page additional styles |
| `fancy-modal.css` | Modal component styles |

---

## 7. Deployment Guide

### Docker Deployment

```bash
# Build image
docker build -t mp-data-entry .

# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

**Dockerfile details**:
- Base image: `node:lts-slim`
- Installs Canvas system dependencies (`libcairo2-dev`, etc.)
- Runs as non-root user (`nodejs`) for enhanced security
- Health check: `curl -f http://localhost:3000/api/health`
- Exposes port: `3000`

**docker-compose.yml details**:
- Port mapping: `3000:3000`
- Network mode: `host` (for host machine database access)
- Volume mounts: source code (read-only), `uploads/`, `logs/`, `.env` (read-only)
- Auto-restart policy

### Production Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure correct database credentials
- [ ] Configure SMTP email service
- [ ] Set a strong Session secret (at least 32-character random string)
- [ ] Configure `ALLOWED_ORIGINS` for CORS
- [ ] Set up reverse proxy (Nginx recommended)
- [ ] Enable HTTPS (SSL/TLS certificate)
- [ ] Set up log rotation
- [ ] Ensure `uploads/` and `logs/` directories exist with write permissions
- [ ] Set up process manager (PM2 or use Docker)

### Nginx Reverse Proxy Reference Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 8. Development Guidelines

### API Response Format

All APIs use the following unified JSON response format:

```javascript
// Success response
{
    success: true,
    message: "Operation successful",
    data: { ... }
}

// Error response
{
    success: false,
    message: "Error description",
    errors: [ ... ]  // Validation error details (optional)
}
```

### Data Validation Rules

**Percentage field groups** — each group must total 100%:
- Microplastic size distribution (< 1μm + 1-20μm + 20-100μm + 100μm-1mm + 1-5mm = 100%)
- Microplastic color distribution
- Microplastic form distribution
- Microplastic polymer distribution
- Fragment form distribution
- Fragment polymer distribution

**Package hierarchy validation**:
- Sum of category counts = total count
- Recycle code counts per category = category count

### Code Style

| Rule | Description |
|------|-------------|
| File naming | Use kebab-case (e.g., `form-handler.js`) |
| Route naming | RESTful style |
| Database fields | Maintain original naming conventions (includes hyphens, e.g., `AirTemp-C`) |
| Error handling | Unified JSON response format |
| Async operations | Use async/await |
| Database operations | Use parameterized queries to prevent SQL injection |

---

## 9. Extension Guide

### Adding a New Page

1. Add a route in `routes/pages.js`:

```javascript
router.get('/new-page', requireAuth, (req, res) => {
    res.render('new_page', {
        title: 'New Page',
        currentPage: 'new-page',
        user: {
            id: req.session.user_id,
            username: req.session.username,
            full_name: req.session.full_name
        }
    });
});
```

2. Create view file `views/new_page.ejs`

3. Add navigation entry in `views/partials/sidebar.ejs`

### Adding a New API

Add in `routes/api.js`:

```javascript
router.post('/new-endpoint',
    requireAuth,
    [
        body('field_name').notEmpty().withMessage('Field is required'),
        // More validation rules...
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.json({ success: false, errors: errors.array() });
            }
            // Business logic...
            res.json({ success: true, data: result });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
);
```

### Database Changes

1. Write SQL migration scripts (place in `db/` or `scripts/`)
2. Add new field support in the corresponding route files
3. Use `node scripts/update-database.js` to execute migrations (or run SQL manually)

---

## 10. Known Issues & Notes

### Canvas Module

The project uses `@napi-rs/canvas` instead of `canvas`. If you encounter import errors, make sure the code uses:

```javascript
const { createCanvas } = require('@napi-rs/canvas');
// NOT: const canvas = require('canvas');
```

### MySQL2 Configuration

The `mysql2` connection pool does not support the following options (removed):

```javascript
// The following options cause warnings or errors, do NOT add them:
// acquireTimeout: 60000
// timeout: 60000
// reconnect: true
```

### Port Conflicts

Local development uses `PORT=3001`, the remote Docker container uses `3000`. If conflicts persist, change to another port in `.env`.

### Database Field Naming

Due to migration from the legacy system, database field names contain hyphens (e.g., `AirTemp-C`, `Lat-DecimalDegree`). These must be wrapped in backticks in SQL queries:

```sql
SELECT `AirTemp-C`, `Lat-DecimalDegree` FROM SamplingEvent;
```

---

## 11. Useful Commands

```bash
# ---- Development ----
npm install              # Install dependencies
npm run dev              # Start dev server (nodemon)
npm start                # Start production server
npm run init-db          # Initialize database

# ---- Database Scripts ----
node scripts/check-database.js    # Check database status
node scripts/update-database.js   # Update database schema

# ---- Docker ----
docker build -t mp-data-entry .   # Build image
docker-compose up -d              # Start containers
docker-compose logs -f            # View logs
docker-compose down               # Stop containers
docker-compose restart            # Restart containers

# ---- Database CLI ----
mysql -h 104.247.77.90 -u <user> -p sweetl23_partner_demo
```

---

## 12. Contact & Support

- **Project Maintainer**: Wayne State University
- **Issue Reporting**: Use the in-app contact form (`/contact`)
- **Email Service**: Via SMTP configuration

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 1.0.0 | 2025-01 | PHP → Node.js refactoring complete, core features live |

---

*Last updated: 2026-02-13*
