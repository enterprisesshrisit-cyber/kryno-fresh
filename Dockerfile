FROM node:22-bullseye-slim AS build

WORKDIR /app

COPY package*.json ./
COPY backend/package*.json ./backend/

RUN npm ci
RUN cd backend && npm ci

COPY . .

RUN npm run build
RUN cd backend && npm run build

FROM node:22-bullseye-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY backend/package*.json ./backend/

RUN npm ci --omit=dev
RUN cd backend && npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/backend/dist ./backend/dist

EXPOSE 8080

CMD ["npm", "run", "start:live"]
