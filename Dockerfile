FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY scripts ./scripts
COPY index.html renderer.js preload.js main.js styles.css ./

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/healthz || exit 1

CMD ["npm", "run", "start:server"]
