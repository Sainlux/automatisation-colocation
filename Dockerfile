# Image Node 22 + dépendances système pour sharp et SQLite
FROM node:22-bookworm-slim AS base

# Sharp a besoin de libvips runtime ; sqlite intégré à Node 22 fonctionne nativement
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips42 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installer uniquement les deps prod en cache
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copier le code applicatif
COPY app.js ./
COPY src ./src
COPY views ./views
COPY public ./public
COPY tools ./tools

# Le volume persistant Fly.io sera monté ici
ENV DATA_DIR=/data
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Le conteneur démarre Node directement (pas npm) pour propager SIGTERM
CMD ["node", "app.js"]
