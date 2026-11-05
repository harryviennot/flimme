# The invite page and the app-link files for flimme.com (roadmap M4.18): the app's web export
# (the invite page and the legal pages, app-structure.md#invites-and-deep-links) served by nginx.
#
#   docker build -f mobile/web.Dockerfile -t flimme-web .
#   docker run --rm -p 8080:80 flimme-web
#   node tools/check-well-known.mjs http://localhost:8080 --allow-placeholders
#
# Build context: the repository root (the pnpm workspace). mobile/web.Dockerfile.dockerignore
# keeps the context to what the export needs, and never an .env file. Dokploy builds this file on
# the VPS (build type Dockerfile, Q18.6); CI's `web` job builds and checks it. Both base images are
# pinned by tag and digest.

FROM node:24.22.2-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS build

# pnpm comes from package.json's packageManager field, through corepack. CI=1: Expo asks nothing.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=1 \
    EXPO_NO_TELEMETRY=1
RUN corepack enable

WORKDIR /repo

# The workspace files first, so the install layer is reused until a package file or the lock
# changes. Only the app and what it needs (the contract). --ignore-scripts: the export needs no
# install script, and the root's postinstall (`lefthook install`) fails without git. The patches
# still apply.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY mobile/package.json ./mobile/
COPY packages/contract/package.json ./packages/contract/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter 'mobile...'

COPY packages ./packages
COPY mobile ./mobile

# The production app config, since the page is public. The page calls no API, so one export
# serves both environments (Q18.3).
WORKDIR /repo/mobile
RUN APP_VARIANT=production npx expo export -p web

FROM nginx:1.31.8-alpine@sha256:785835ea65db4bba6f021acc0f3be91b0fef76a53fe41f8588c6698d2aed0606 AS serve

# The whole config is ours (mobile/web/nginx.conf), so the image's server block and pages go.
RUN rm -r /etc/nginx/conf.d/default.conf /usr/share/nginx/html/*
COPY mobile/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /repo/mobile/dist /usr/share/nginx/html
EXPOSE 80
