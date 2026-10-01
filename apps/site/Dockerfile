# The Dawai marketing site — a static export (`next build` writes `out/`).
#
#   docker build --build-arg NEXT_PUBLIC_API_URL=https://api.dawai.com.bd/api \
#                --build-arg NEXT_PUBLIC_APP_URL=https://shop.dawai.com.bd \
#                --build-arg NEXT_PUBLIC_SITE_URL=https://dawai.com.bd \
#                -t dawai-site apps/site
#
# The three URLs are inlined at build time — a site built against the wrong API
# fails visibly, it does not quietly post sign-ups elsewhere.
FROM node:22-alpine AS builder
WORKDIR /site
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /site/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
