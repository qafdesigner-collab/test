# EduBooks web app — build from the repository root:  docker build -f apps/web/Dockerfile -t edubooks-web .
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --include-workspace-root=false --no-audit --no-fund
COPY apps/web apps/web
# Where the web server forwards /api when no reverse proxy routes it (baked in at build time).
ARG API_URL=http://api:4000
ARG COOKIE_SECURE=1
ENV API_URL=$API_URL COOKIE_SECURE=$COOKIE_SECURE NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN npm run build -w apps/web

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
