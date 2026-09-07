FROM mcr.microsoft.com/playwright:v1.63.0-noble AS build
WORKDIR /opt/collector
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM build AS test
COPY test ./test
CMD ["npm", "test"]

FROM build AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM mcr.microsoft.com/playwright:v1.63.0-noble
ENV NODE_ENV=production
WORKDIR /opt/collector
COPY --from=production-dependencies /opt/collector/package.json ./
COPY --from=production-dependencies /opt/collector/node_modules ./node_modules
COPY --from=build /opt/collector/dist ./dist
RUN mkdir -p /var/lib/jungol/profile && chown -R pwuser:pwuser /var/lib/jungol
USER pwuser
ENTRYPOINT ["node", "dist/cli.js"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 CMD ["node", "dist/cli.js", "healthcheck"]
CMD ["start"]
