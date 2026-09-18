FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY index.js db.js iap.js library.js library.json ./
ENV NODE_ENV=production PORT=4700 DB_PATH=/data/lyceum.sqlite LIBRARY_DIR=/data/library
VOLUME ["/data"]
EXPOSE 4700
USER node
CMD ["node", "index.js"]
