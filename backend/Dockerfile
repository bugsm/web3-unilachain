# Image backend SKPI: sama untuk laptop riset dan production (production parity).
# Semua nilai lingkungan dibaca dari env saat kontainer start; wallet di-mount read-only, tidak pernah di-build ke image.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
USER node
EXPOSE 3000
# Migrasi dijalankan oleh server saat start (src/server.ts).
CMD ["node", "dist/src/server.js"]
