# Image frontend SKPI: sama untuk laptop riset dan production (production parity).
# Tidak ada nilai lingkungan di bundle; alamat backend dibaca saat kontainer start (BACKEND_URL).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
ENV BACKEND_URL=http://backend:3000
ENV NGINX_RESOLVER=127.0.0.11
EXPOSE 8080
