FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ARG VITE_API_TOKEN
ARG VITE_PRIMARY_COLOR
ARG VITE_GAME_TITLE
ARG VITE_GAME_PREFIX=EVT

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_TOKEN=$VITE_API_TOKEN
ENV VITE_PRIMARY_COLOR=$VITE_PRIMARY_COLOR
ENV VITE_GAME_TITLE=$VITE_GAME_TITLE
ENV VITE_GAME_PREFIX=$VITE_GAME_PREFIX

RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

RUN npm install -g vite

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/vite.preview.config.js ./

EXPOSE 4173

CMD ["vite", "preview", "--config", "vite.preview.config.js", "--host", "0.0.0.0", "--port", "4173"]
