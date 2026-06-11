
# Locust — Load & Stress Testing

## Requisitos previos

- Python 3.9+
- Backend corriendo en `http://localhost:3000` (o la URL configurada en `BASE_URL`)

```bash
pip install -r locust/requirements.txt
```

---

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | URL base de la API |
| `TICKERS` | `AAPL,MSFT,GOOGL,AMZN,TSLA` | Tickers a operar (comma-separated) |

---

## Diseño del flujo

Cada usuario virtual es completamente autónomo. No hay seed global ni estado compartido entre VUs.

```
on_start:
  POST /auth/register          ← cuenta única por VU
  POST /auth/login             ← obtiene JWT
  POST /stocks                 ← registra el ticker (ignora 409 si ya existe)
  POST /price-snapshots/update ← fetcha precio de Yahoo Finance para ese ticker
  └─ loop:
       BUYING  → POST /transactions/buy
       HOLDING → GET /portfolio + GET /edgar/companies/search
       SELLING → POST /transactions/sell
```

El `on_start` garantiza que el precio exista antes de que el usuario intente comprar, sin depender de ningún estado previo del sistema.

---

## Cómo correr cada escenario

### Load Test

Simula carga sostenida normal con usuarios operando a ritmo humano.

```bash
# Con UI web en http://localhost:8089
locust -f locust/locustfile.py LoadUser \
  --users 50 \
  --spawn-rate 5 \
  --run-time 5m \
  --host http://localhost:3000

# Headless
locust -f locust/locustfile.py LoadUser \
  --users 50 \
  --spawn-rate 5 \
  --run-time 5m \
  --host http://localhost:3000 \
  --headless \
  --csv locust/results/load
```

| Parámetro | Valor |
|---|---|
| Usuarios | 50 |
| Spawn rate | 5/s |
| Wait time | 5–14 s |
| Duración | 5 min |

### Stress Test

Lleva los endpoints de escritura al límite para identificar el punto de quiebre.

```bash
# Con UI web
locust -f locust/locustfile.py StressUser \
  --users 200 \
  --spawn-rate 10 \
  --run-time 3m \
  --host http://localhost:3000

# Headless
locust -f locust/locustfile.py StressUser \
  --users 200 \
  --spawn-rate 10 \
  --run-time 3m \
  --host http://localhost:3000 \
  --headless \
  --csv locust/results/stress
```

| Parámetro | Valor |
|---|---|
| Usuarios | 200 |
| Spawn rate | 10/s |
| Wait time | 1–5 s |
| Duración | 3 min |

> Crear la carpeta de resultados antes si se usa `--csv`: `mkdir -p locust/results`

---

## Escenarios de Docker Compose disponibles

| Archivo | API | Postgres | Propósito |
|---|---|---|---|
| `docker-compose.yml` | sin límite | sin límite | Baseline — el sistema se apropia de todos los recursos del host |
| `docker-compose.prod.yml` | 1 CPU / 1 GB | 1 CPU / 1 GB | Prod-like — simula un t3.small en AWS o droplet de $12/mes |
| `docker-compose.medium.yml` | 2 CPUs / 2 GB | 2 CPUs / 2 GB | Recursos moderados — simula un servidor pequeño de producción |
| `docker-compose.low.yml` | 0.25 CPUs / 256 MB | 0.5 CPUs / 512 MB | Recursos bajos — entorno muy restringido |

```bash
# Baseline (sin límites)
docker compose up --build

# Prod-like
docker compose -f docker-compose.prod.yml up --build

# Recursos moderados
docker compose -f docker-compose.medium.yml up --build

# Recursos bajos
docker compose -f docker-compose.low.yml up --build
```

---

## Resultados — Load Test

| Escenario Docker | Usuarios | Spawn Rate | Wait Time | Error Rate | GET /portfolio p95 | POST /buy p95 | POST /sell p95 | GET /edgar p95 | POST /price-snapshots/update p95 |
|---|---|---|---|---|---|---|---|---|---|
| Baseline (sin límite) | 50 | 5/s | 5–14 s | 0% | 120ms | 160ms | 160ms | 52ms | 19000ms |

---

## Resultados — Stress Test

Los resultados completos de las corridas de stress, incluyendo percentiles, RPS, error rate y breakdown de errores, se encuentran en el siguiente spreadsheet:

[Ver resultados completos en Google Sheets](https://docs.google.com/spreadsheets/d/1VSsBYFj1vj52RMBBJd6QdzIYib42q1C3u_XRar9jG_c/edit?usp=sharing)

---

## Conclusiones

- El flujo principal (buy, sell, portfolio, edgar) tuvo buen rendimiento en el load test: 0% de error rate con 50 usuarios y latencias por debajo de los 200ms en p95.
- El principal cuello de botella identificado es `POST /price-snapshots/update`: p95 de ~19 segundos, ya que depende de una llamada externa a Yahoo Finance por cada usuario virtual en su `on_start`. Este tiempo no impacta el ciclo de trading una vez que el setup terminó.
- El punto de quiebre de **baseline y medium** está entre 1000 y 2000 usuarios: con 1000 mantienen 0% de error rate; con 2000 aparecen los primeros failures.
- **Prod-like** se degrada severamente a partir de 500 usuarios por el cuello de botella del 1 CPU: las latencias de buy/sell superan los 19–25 segundos en p95.
- **Low** aguanta 100 usuarios con 0% de error rate pero se vuelve inutilizable con 200: error rate 2% y latencias de 10–16 segundos en p95.
- El **mínimo viable para carga real es prod-like** (1 CPU / 1 GB): soporta hasta 1000 usuarios con solo 1% de error rate.
- Con **200 usuarios** todos los escenarios funcionan correctamente excepto Low.
- La caché de EDGAR redujo la latencia de ~1900ms a menos de 100ms bajo carga, eliminando los errores por rate limiting que existían antes de implementarla.