FROM node:22-alpine

# Install dependencies for better-sqlite3
RUN apk add --no-cache python3 py3-setuptools make g++ sqlite-dev

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Rebuild better-sqlite3 from source for Alpine (for SQLite fallback)
RUN cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run build-release

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm build

# Expose port (use PORT env var, default to 3001)
EXPOSE ${PORT:-3001}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-3001}/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["node", "dist/index.js"]
