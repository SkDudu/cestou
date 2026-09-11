FROM node:22-alpine AS api

WORKDIR /app

COPY package.json package-lock.json ./
COPY scraper/package.json scraper/package.json
RUN npm ci

COPY . .
RUN DATABASE_URL=postgresql://smart_grocery:smart_grocery@postgres:5432/smart_grocery?schema=public npm run prisma:generate

ENV NODE_ENV=production

CMD ["npm", "run", "api:start"]

# Playwright Linux browsers need glibc — Alpine cannot run them.
FROM mcr.microsoft.com/playwright:v1.62.1-noble AS worker

WORKDIR /app

COPY package.json package-lock.json ./
COPY scraper/package.json scraper/package.json
RUN npm ci

COPY . .
RUN DATABASE_URL=postgresql://smart_grocery:smart_grocery@postgres:5432/smart_grocery?schema=public npm run prisma:generate

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

CMD ["npm", "run", "worker:start"]
