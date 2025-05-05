# ---------- deps stage ----------
FROM registry.access.redhat.com/ubi8/nodejs-20:latest AS deps
WORKDIR /opt/app-root/src

# อัปเดตแพ็คเกจระบบและติดตั้งแพ็คเกจที่จำเป็นเพื่อป้องกันช่องโหว่
USER 0
RUN dnf update -y && \
    dnf clean all && \
    rm -rf /var/cache/dnf
USER 1001

# Copy package files
COPY --chown=1001:0 ["apps/web-ui/package.json", "apps/web-ui/package-lock.json", "./"]
COPY --chown=1001:0 [".env", "/opt/app-root/src/.env"]
RUN npm ci --legacy-peer-deps

# ---------- build stage ----------
FROM registry.access.redhat.com/ubi8/nodejs-20:latest AS builder
WORKDIR /opt/app-root/src

# อัปเดตแพ็คเกจระบบและติดตั้งแพ็คเกจที่จำเป็นเพื่อป้องกันช่องโหว่
USER 0
RUN dnf update -y && \
    dnf clean all && \
    rm -rf /var/cache/dnf
USER 1001

# Copy package files
COPY --chown=1001:0 package*.json ./
COPY --chown=1001:0 apps/web-ui/package*.json ./apps/web-ui/

# Install dependencies
RUN npm install --legacy-peer-deps && \
    cd apps/web-ui && npm install --legacy-peer-deps

# Copy source code
COPY --chown=1001:0 . .

# Build the application
WORKDIR /opt/app-root/src/apps/web-ui
RUN npm run build && \
    npm prune --production --legacy-peer-deps

# ---------- runtime stage ----------
FROM registry.access.redhat.com/ubi8/nodejs-20-minimal:latest AS runner
WORKDIR /opt/app-root/src

# Set environment variables
ENV PORT=3500
ENV NODE_ENV=production

# Copy necessary files from builder
COPY --from=builder --chown=1001:0 /opt/app-root/src/apps/web-ui/.next ./.next
COPY --from=builder --chown=1001:0 /opt/app-root/src/apps/web-ui/node_modules ./node_modules
COPY --from=builder --chown=1001:0 /opt/app-root/src/apps/web-ui/package.json ./package.json
COPY --from=builder --chown=1001:0 /opt/app-root/src/apps/web-ui/public ./public
COPY --from=builder --chown=1001:0 /opt/app-root/src/apps/web-ui/next.config.js ./next.config.js
COPY --from=builder --chown=1001:0 /opt/app-root/src/.env ./.env

# หมายเหตุ: ubi-minimal มี non-root user มาให้แล้ว (uid 1001)

# Expose port
EXPOSE 3500

# Start the application
CMD ["node_modules/.bin/next", "start"]