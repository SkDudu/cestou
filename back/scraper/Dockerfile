# Multi-stage: compile TS, run with Playwright image
FROM mcr.microsoft.com/playwright:v1.50.0-jammy AS build
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm install && npx tsc

FROM mcr.microsoft.com/playwright:v1.50.0-jammy
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
USER pwuser
CMD ["node", "dist/index.js"]
