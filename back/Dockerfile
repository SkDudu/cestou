FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY scraper/package.json scraper/package.json
RUN npm ci

COPY . .
RUN DATABASE_URL=postgresql://smart_grocery:smart_grocery@postgres:5432/smart_grocery?schema=public npm run prisma:generate

ENV NODE_ENV=production

CMD ["npm", "run", "api:start"]
