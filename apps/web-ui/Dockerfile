# ---------- deps stage ----------
FROM node:18-alpine AS base
WORKDIR /app

FROM base AS deps
COPY ["apps/web-ui/package.json", "apps/web-ui/package-lock.json", "./"]
COPY [".env", "/app/.env"]
RUN npm ci

# ---------- build stage ----------
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/web-ui/package*.json ./apps/web-ui/

# Install dependencies
RUN npm install
RUN cd apps/web-ui && npm install

# Copy source code
COPY . .

# Build the application
WORKDIR /app/apps/web-ui
RUN npm run build

# ---------- runtime stage ----------
FROM node:18-alpine AS runner

WORKDIR /app

# Copy necessary files from builder
COPY --from=builder /app/apps/web-ui/.next ./.next
COPY --from=builder /app/apps/web-ui/package*.json ./
COPY --from=builder /app/apps/web-ui/public ./public
COPY --from=builder /app/apps/web-ui/next.config.js ./
COPY --from=builder /app/.env ./.env

# Install production dependencies
RUN npm install --production

# Set environment variables
ENV PORT=3500
ENV NODE_ENV=production

# Expose port
EXPOSE 3500

# Start the application
CMD ["npm", "start"]