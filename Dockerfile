# WhatsApp Web.js Docker Image
# Multi-stage build for optimized production image

# Stage 1: Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for building)
RUN npm ci --include=optional

# Copy source files
COPY . .

# Stage 2: Production stage
FROM node:20-slim

# Install Chromium dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    fonts-liberation \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN groupadd -r wwebjs && useradd -r -g wwebjs wwebjs

# Copy built application from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/index.js ./
COPY --from=builder /app/index.d.ts ./
COPY --from=builder /app/docker-example.js ./
COPY --from=builder /app/phone-pairing-example.js ./

# Create directories for auth and cache with proper permissions
RUN mkdir -p /app/.wwebjs_auth /app/.wwebjs_cache \
    && chown -R wwebjs:wwebjs /app

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

# Switch to non-root user
USER wwebjs

# Expose no ports by default (library, not a server)
# If running example.js or a bot, you may need to expose ports

# Default command (can be overridden)
CMD ["node"]
