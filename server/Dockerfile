FROM node:24-alpine
WORKDIR /app
COPY index.js db.js iap.js library.json ./
ENV NODE_ENV=production PORT=4700 DB_PATH=/data/lyceum.sqlite
VOLUME ["/data"]
EXPOSE 4700
USER node
CMD ["node", "index.js"]
