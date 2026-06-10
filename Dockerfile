FROM node:22-alpine AS base

WORKDIR /app

RUN apk add --no-cache python3 py3-pip tzdata libpq \
  && python3 -m venv /opt/venv

ENV PATH="/opt/venv/bin:${PATH}"

COPY scripts/requirements.txt ./scripts/requirements.txt
RUN apk add --no-cache --virtual .python-build-deps postgresql-dev gcc musl-dev python3-dev \
  && pip install --no-cache-dir -r scripts/requirements.txt \
  && apk del .python-build-deps

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

FROM base AS dev

CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && npx prisma db seed && npm run start:dev"]

FROM base AS production

ENV NODE_ENV=production

RUN --mount=type=secret,id=DATABASE_URL \
  export DATABASE_URL="$(cat /run/secrets/DATABASE_URL)" \
  && npx prisma generate \
  && npm run build \
  && npm prune --omit=dev

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
