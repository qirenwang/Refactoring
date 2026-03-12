# Quick Start Guide

## Get Started in 5 Minutes

### 1. Clone the Project and Install Dependencies

```bash
cd /path/to/Refactoring
npm install
```

### 2. Configure Environment Variables

Copy the environment variable template and edit it:

```bash
cp docs/env.template.txt .env
```

Edit the `.env` file and configure the following required items:

```bash
# Development port
PORT=3001

# Database connection (remote server)
DB_HOST=104.247.77.90
DB_USER=your_username
DB_PASS=your_password
DB_NAME=sweetl23_partner_demo

# Session configuration
SESSION_SECRET=your_random_secret_key
SESSION_TIMEOUT=1800
```

> Tip: See `docs/env.template.txt` for full environment variable documentation.

### 3. Start the Development Server

```bash
npm run dev
```

On successful startup, you will see:

```
Database connected successfully
Server running on port 3001
Environment: development
Local access: http://localhost:3001
Network access: http://192.168.x.x:3001
```

### 4. Access the Application

Open your browser and navigate to: `http://localhost:3001`

---

## Common Development Tasks

| Task | Action |
|------|--------|
| Modify page styles | Edit `public/css/mp_style.css` |
| Modify frontend interaction logic | Edit the corresponding JS file in `public/js/` |
| Modify page templates | Edit the corresponding `.ejs` file in `views/` |
| Add/modify API endpoints | Edit `routes/api.js` |
| Modify authentication logic | Edit `routes/auth.js` or `middleware/auth.js` |
| Add new page routes | Edit `routes/pages.js` and create the corresponding `.ejs` file |
| Modify database configuration | Edit `config/database.js` |
| Modify email service | Edit `services/emailService.js` |

---

## Project Structure Quick Reference

```
Key files:
├── app.js                 ← Application entry point
├── config/database.js     ← Database connection config
├── config/session.js      ← Session configuration
├── middleware/auth.js      ← Authentication middleware
├── routes/
│   ├── api.js             ← API endpoints (data save/query)
│   ├── auth.js            ← Authentication (login/signup/password reset)
│   └── pages.js           ← Page routes (EJS rendering)
├── services/
│   └── emailService.js    ← Email sending service
├── views/                 ← EJS page templates
│   ├── data_forms/        ← 6-step data entry forms
│   └── partials/          ← Shared template partials (header/sidebar/footer)
├── public/
│   ├── css/               ← Stylesheets
│   └── js/                ← Frontend scripts
└── docs/                  ← Project documentation
```

---

## NPM Scripts

```bash
npm run dev        # Development mode (nodemon hot reload)
npm start          # Production mode
npm run init-db    # Initialize database
```

---

## Docker Quick Start

If you need to deploy with Docker:

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

---

## FAQ

### Q: Database connection failed?
A: Check that the database credentials in `.env` are correct, and confirm the remote server (`104.247.77.90`) is accessible. Try a manual connection test:
```bash
mysql -h 104.247.77.90 -u <your_user> -p sweetl23_partner_demo
```

### Q: Port already in use?
A: Change the `PORT` value in `.env` to another port (e.g., 3002). The default is 3001 to avoid conflicts with the Docker container.

### Q: Canvas errors?
A: Ensure the project uses `@napi-rs/canvas` rather than `canvas`. In Docker environments, system dependencies like `libcairo2-dev` are required (already included in the Dockerfile).

### Q: Page styles not updating after changes?
A: View caching is disabled in development mode. If you still see cached content, clear your browser cache or use a hard refresh (Ctrl+Shift+R / Cmd+Shift+R).

### Q: Email sending fails?
A: Check the SMTP configuration in `.env`. Ensure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` are correctly set.

---

Full documentation: [Developer Manual (English)](./DEVELOPER_MANUAL_EN.md) | [开发者手册 (中文)](./DEVELOPER_MANUAL.md)

---

*Last updated: 2026-02-13*
