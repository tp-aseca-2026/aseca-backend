# ASECA Backend

Backend del TP Final de Aseguramiento de la Calidad de Software 2026. Expone una API para una aplicación web/mobile de portfolio tracker de acciones de mercados de Estados Unidos.

## Stack

- Node.js 22
- NestJS 11
- Prisma 7
- PostgreSQL 16
- JWT + bcrypt para autenticación
- Python + yfinance para el batch de precios
- SEC EDGAR como fuente de datos financieros oficiales

## Ejecución Local Con Docker

El `docker-compose.yml` levanta:

- API NestJS en `http://localhost:3000`
- PostgreSQL en `localhost:5434`
- Volumen persistente para la base de datos
- Migraciones Prisma al iniciar
- Seed automática de stocks base

```bash
docker compose up --build
```

Durante el arranque de la API se ejecuta:

```bash
npx prisma generate && npx prisma migrate deploy && npx prisma db seed && npm run start:dev
```

La seed es idempotente y precarga:

- `AAPL`
- `MSFT`
- `NVDA`
- `GOOGL`
- `TSLA`

## Variables De Entorno Locales

Docker Compose define valores de desarrollo:

```env
DATABASE_URL=postgresql://aseca_user:aseca_password@postgres:5432/aseca_db
JWT_SECRET=dev-secret
JWT_EXPIRES_IN=1d
SEC_USER_AGENT=ASECA Portfolio Tracker dev@example.com
PRICE_SNAPSHOT_PYTHON_COMMAND=python3
```

Para ejecutar comandos desde la máquina host contra la base de Docker, usar:

```bash
export DATABASE_URL=postgresql://aseca_user:aseca_password@localhost:5434/aseca_db
```

## Comandos Útiles

Instalar dependencias:

```bash
npm install
```

Compilar:

```bash
npm run build
```

Ejecutar API sin Docker:

```bash
npm run start:dev
```

Aplicar migraciones:

```bash
npx prisma migrate deploy
```

Ejecutar seed manualmente:

```bash
npx prisma db seed
```

Ejecutar tests:

```bash
npm test
```

Ejecutar solo unit tests principales:

```bash
npm test -- --runInBand --forceExit test/auth/unit test/stocks/unit test/transactions/unit test/portfolio/unit test/price-snapshots/unit test/watchlist/unit test/edgar/unit
```

## Batch De Precios Yahoo Finance

La valorización del portfolio usa precios persistidos en `PriceSnapshot`. El proceso de actualización obtiene precios desde Yahoo Finance y los guarda en PostgreSQL.

Endpoint protegido:

```http
POST /price-snapshots/update
```

Ejecución manual del script:

```bash
python3 scripts/update_price_snapshots.py
```

Con tickers específicos:

```bash
python3 scripts/update_price_snapshots.py --tickers AAPL,MSFT
```

El batch consulta por defecto tickers presentes en portfolios o watchlists. Si falla un ticker, informa el error en la respuesta y continúa con el resto.

## SEC EDGAR

La integración EDGAR consulta datos reales desde:

- `https://www.sec.gov/files/company_tickers.json`
- `https://data.sec.gov/submissions/CIK{cik}.json`
- `https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json`

El cliente envía `SEC_USER_AGENT` en cada request y aplica rate limit interno de máximo 10 requests por segundo, espaciando las llamadas al menos 100 ms.

## Endpoints Principales

Autenticación:

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

Stocks:

- `POST /stocks`
- `GET /stocks`
- `GET /stocks/:ticker`

Transacciones:

- `POST /transactions/buy`
- `POST /transactions/sell`
- `GET /transactions`

Portfolio:

- `GET /portfolio`

Precios:

- `GET /price-snapshots/latest`
- `GET /price-snapshots/latest/:ticker`
- `POST /price-snapshots/update`

EDGAR:

- `GET /edgar/companies/search?q=apple`
- `GET /edgar/companies/:ticker/metrics`
- `GET /edgar/companies/:ticker/filings`
- `GET /edgar/companies/:ticker/historical-metrics`

Watchlist:

- `GET /watchlist`
- `POST /watchlist`
- `DELETE /watchlist/:ticker`
- `GET /watchlist/comparison`

## Decisiones Técnicas

### Arquitectura Modular

El backend está organizado por módulos de dominio de NestJS: `auth`, `users`, `stocks`, `transactions`, `portfolio`, `price-snapshots`, `edgar` y `watchlist`.

Cada módulo separa controllers para la capa HTTP, services para reglas de negocio, repositories para acceso a datos y DTOs para validación de entrada. Esto mantiene responsabilidades acotadas y facilita probar los flujos principales del sistema.

### Persistencia Con Prisma Y PostgreSQL

PostgreSQL es la base principal del sistema y Prisma se usa como ORM y herramienta de migraciones versionadas. El schema modela usuarios, acciones, transacciones, snapshots de precios y watchlist.

Las migraciones viven en `prisma/migrations` y la seed local vive en `prisma/seed.ts`. La seed usa `upsert`, por lo que se puede ejecutar varias veces sin duplicar stocks.

### Autenticación Y Autorización

La API usa registro/login con email y password. Las passwords se almacenan hasheadas con bcrypt y el login emite un JWT Bearer token.

Las rutas privadas usan `JwtAuthGuard`. Los servicios operan con el `userId` autenticado para aislar transacciones, portfolio y watchlist por usuario.

### Portfolio Derivado Desde Transacciones

Las transacciones son el ledger fuente de verdad. El portfolio actual, las posiciones abiertas y el profit/loss se calculan dinámicamente a partir de compras, ventas y últimos precios persistidos.

Esta decisión evita duplicar estado en una tabla de balance que pueda quedar inconsistente con el historial de operaciones.

### Cierre De Posición

Una posición se cierra vendiendo la totalidad de las acciones disponibles. Las posiciones con cantidad final cero no se muestran en `GET /portfolio`.

No existe un borrado administrativo separado de posiciones, porque el historial de transacciones conserva la trazabilidad de lo ocurrido.

### Fecha De Operación

Cada transacción registra `executedAt` automáticamente en la base de datos. El historial de transacciones expone esa fecha para compras y ventas.

### Integraciones Externas

SEC EDGAR se usa como fuente oficial de datos financieros. Yahoo Finance se usa para actualizar precios mediante un proceso batch. La API de portfolio trabaja con datos persistidos para mantener respuestas consistentes y evitar depender de consultas externas durante la valorización normal.

### Testing

El backend incluye tests unitarios para servicios y reglas de dominio, además de tests de integración para endpoints principales, persistencia, autenticación y flujos de portfolio/watchlist/precios.

Los tests E2E con Cypress/Appium pertenecen al repositorio frontend/mobile, que consume esta API como backend real.

### Entorno Local

La entrega prioriza reproducibilidad local. `docker-compose.yml` levanta API + PostgreSQL, aplica migraciones y ejecuta seed automáticamente. Esto permite correr la demo y validar el backend sin depender de infraestructura externa propia.

### Alcance De Este Repositorio

Este repositorio contiene el backend y su infraestructura local mínima. Los tests E2E con Cypress/Appium pertenecen al repo aseca-frontend. Este `docker-compose.yml` levanta backend y base de datos local; no levanta el ecosistema completo web/mobile.
