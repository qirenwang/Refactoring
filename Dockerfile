# Alternative Dockerfile using Ubuntu base for better canvas compatibility
FROM node:lts-slim

# Install system dependencies for canvas
RUN apt-get update && apt-get install -y \
    # Build dependencies
    build-essential \
    python3 \
    # Canvas dependencies
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    libfontconfig1-dev \
    # Clean up
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install --verbose
RUN npm install canvas

# Clean up devDependencies
RUN npm prune --production

# Copy application code
COPY . .

# Create non-root user and set permissions
RUN useradd -r -u 1001 -g root nodejs && \
    mkdir -p uploads logs && \
    chown -R nodejs:root /app && \
    chmod -R 755 /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start command
CMD ["node", "app.js"]
