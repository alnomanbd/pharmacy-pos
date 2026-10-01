# The Dawai shop app — the counter, the stock, the books.
#
# Built from the repo root: the app imports `@dawai/shared`, a sibling workspace.
#
#   docker build -f apps/shop/Dockerfile -t dawai-shop .
FROM node:22-alpine AS builder
WORKDIR /repo

# Manifests first, so a dependency install is not redone on every source edit.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/shop/package.json apps/shop/
COPY apps/console/package.json apps/console/
RUN npm ci

COPY packages/shared/ packages/shared/
COPY apps/shop/ apps/shop/
RUN npm run build -w @dawai/shop

FROM nginx:alpine
COPY --from=builder /repo/apps/shop/dist /usr/share/nginx/html
COPY apps/shop/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
