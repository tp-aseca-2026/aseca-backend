# ---- Stage 1: builder ----
# Instala todas las dependencias, genera el cliente Prisma
# y compila el TypeScript a JavaScript.
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci

# Prisma 7 lee DATABASE_URL desde prisma.config.ts incluso para generate.
# Usamos una URL dummy solo para generar el cliente durante el build.
ENV DATABASE_URL="postgresql://test_user:test_password@localhost:5432/aseca_test?schema=public"

RUN npx prisma generate

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