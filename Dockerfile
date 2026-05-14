FROM node:22-alpine AS base

WORKDIR /app

RUN apk add --no-cache python3 py3-pip \
  && python3 -m venv /opt/venv

ENV PATH="/opt/venv/bin:${PATH}"

COPY scripts/requirements.txt ./scripts/requirements.txt
RUN pip install --no-cache-dir -r scripts/requirements.txt

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

FROM base AS dev

CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && npm run start:dev"]

FROM base AS production

ENV NODE_ENV=production

RUN npx prisma generate \
  && npm run build \
  && npm prune --omit=dev

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
