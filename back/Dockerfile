FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY scraper/package.json scraper/package.json
RUN npm ci

COPY . .

ENV NODE_ENV=production

CMD ["npm", "run", "api:start"]
