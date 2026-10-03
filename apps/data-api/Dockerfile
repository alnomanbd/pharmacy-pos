# The Dawai Data API.
#
#   docker build -t dawai-data-api apps/data-api
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# The admin page and the API reference.
COPY public ./public
EXPOSE 5200
USER node
CMD ["node", "dist/server.js"]
