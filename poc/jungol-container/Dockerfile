FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /opt/jungol-poc

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY *.mjs ./

USER pwuser

CMD ["node", "poc.mjs"]
