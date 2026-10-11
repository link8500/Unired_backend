FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY nest-cli.json tsconfig*.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY scripts ./scripts
COPY database/design/01_modelo_postgresql.sql ./database/design/01_modelo_postgresql.sql
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
