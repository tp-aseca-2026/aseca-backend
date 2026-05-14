WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci

RUN npx prisma generate

COPY scripts/requirements.txt ./scripts/requirements.txt
RUN python3 -m pip install --break-system-packages -r scripts/requirements.txt

COPY . .

RUN npm run build


# ---- Stage 2: production ----
# Solo instala dependencias de producción y copia los artefactos del builder.
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci --omit=dev

# El cliente Prisma se generó en el builder.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Requiere DATABASE_URL en tiempo de ejecución.
# Las migraciones se aplican fuera de esta imagen productiva.
CMD ["node", "dist/main"]