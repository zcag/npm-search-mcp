FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npx tsc

FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/zcag/npm-search-mcp"
LABEL org.opencontainers.image.description="MCP server for searching npm packages with live registry data"
LABEL io.modelcontextprotocol.server.name="io.github.zcag/npm-search-mcp"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist/ dist/
ENTRYPOINT ["node", "dist/index.js"]
