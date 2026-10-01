# The Dawai operator console.
#
# Built from the repo root: the app imports `@dawai/shared`, a sibling workspace.
#
#   docker build -f apps/console/Dockerfile -t dawai-console .
FROM node:22-alpine AS builder
WORKDIR /repo

# Manifests first, so a dependency install is not redone on every source edit.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/shop/package.json apps/shop/
COPY apps/console/package.json apps/console/
RUN npm ci

COPY packages/shared/ packages/shared/
COPY apps/console/ apps/console/
RUN npm run build -w @dawai/console

FROM nginx:alpine
COPY --from=builder /repo/apps/console/dist /usr/share/nginx/html
COPY apps/console/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
