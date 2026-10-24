# The Dawai API.
#
#   docker build -t dawai-api apps/api
FROM node:26-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
# The build being run, for the System page and crash reports. Set by the Deploy workflow.
ARG APP_VERSION=""
ENV APP_VERSION=$APP_VERSION
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# PDF fonts, for Bangla on bills and invoices.
COPY assets ./assets
# The medicine catalogue archive, so a fresh deployment can restore it:
#   docker compose exec api node dist/seed/run.js catalog:restore
COPY data ./data
EXPOSE 5100
CMD ["node", "dist/server.js"]
