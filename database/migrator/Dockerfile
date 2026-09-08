FROM node:22-alpine AS build
WORKDIR /app
COPY database/migrator/package.json ./package.json
COPY database/migrator/package-lock.json ./package-lock.json
RUN npm ci --ignore-scripts
COPY database/migrator/tsconfig.json database/migrator/tsconfig.build.json ./
COPY database/migrator/src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY database/migrator/package.json ./package.json
COPY database/migrator/package-lock.json ./package-lock.json
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations/*.sql /migrations/
USER node
CMD ["node", "dist/cli.js", "up"]
