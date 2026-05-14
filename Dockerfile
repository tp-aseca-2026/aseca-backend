# ---- Stage 1: builder ----
# Instala todas las dependencias (incluye devDeps), genera el cliente Prisma
# y compila el TypeScript a JavaScript.
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci

RUN npx prisma generate

COPY . .

RUN npm run build


# ---- Stage 2: production ----
# Solo instala dependencias de producción y copia los artefactos del builder.
# La imagen final es más chica y no tiene el compilador ni las devDeps.
FROM node:22-alpine AS production

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev

# El cliente Prisma se generó en el builder con los binarios de Alpine.
# Lo copiamos en lugar de regenerarlo (prisma es devDependency).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Requiere la variable DATABASE_URL en tiempo de ejecución.
# Las migraciones se aplican fuera de esta imagen productiva.
CMD ["node", "dist/main"]