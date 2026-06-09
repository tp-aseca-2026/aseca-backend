
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

## Cómo correr cada escenario

Ambos escenarios ejecutan el mismo ciclo completo por usuario virtual:

```
on_start: POST /auth/register → POST /auth/login → POST /stocks → POST /price-snapshots/update
  └─ loop:
       BUYING  → POST /transactions/buy
       HOLDING → GET /portfolio + GET /edgar/companies/search
       SELLING → POST /transactions/sell
```

Cada usuario virtual crea su propia cuenta con email único. El precio del ticker se fetchea de Yahoo Finance en el `on_start`, por lo que no se requiere seed manual previo.

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

| Escenario Docker | Usuarios | Spawn Rate | Wait Time | Error Rate | GET /portfolio p95 | POST /buy p95 | POST /sell p95 | GET /edgar p95 |
|---|---|---|---|---|---|---|---|---|
| Baseline (sin límite) | 50 | 5/s | 5–14 s | 0% | 37ms | 250ms | 60ms | 18ms |

---

## Resultados — Stress Test

| Escenario Docker | Usuarios | Spawn Rate | Wait Time | Error Rate | GET /portfolio p95 | POST /buy p95 | POST /sell p95 | GET /edgar p95 |
|---|---|---|---|---|---|---|---|---|
| Baseline (sin límite) | 200 | 10/s | 1–5 s | 0% | 18ms | 66ms | 68ms | 50ms |
| Baseline (sin límite) | 500 | 20/s | 1–5 s | 0% | 730ms | 820ms | 1300ms | 34ms |
| Baseline (sin límite) | 1000 | 20/s | 1–5 s | 0% | 4200ms | 5500ms | 6800ms | 130ms |
| Baseline (sin límite) | 2000 | 30/s | 1–5 s | 2% | 4900ms | 6600ms | 8100ms | 240ms |
| Baseline (sin límite) | 5000 | 50/s | 1–5 s | 38% | 21000ms | 25000ms | 32000ms | 1100ms |
| Medium (2 CPU / 2 GB) | 200 | 10/s | 1–5 s | 0% | 15ms | 71ms | 64ms | 9ms |
| Medium (2 CPU / 2 GB) | 500 | 20/s | 1–5 s | 0% | 780ms | 1200ms | 1100ms | 30ms |
| Medium (2 CPU / 2 GB) | 1000 | 20/s | 1–5 s | 0% | 3800ms | 5700ms | 6000ms | 160ms |
| Medium (2 CPU / 2 GB) | 2000 | 30/s | 1–5 s | 4% | 15000ms | 19000ms | 23000ms | 1900ms |
| Medium (2 CPU / 2 GB) | 5000 | 50/s | 1–5 s | 62% | 20000ms | 74000ms | 32000ms | 12000ms |
| Prod-like (1 CPU / 1 GB) | 200 | 10/s | 1–5 s | 0% | 650ms | 940ms | 930ms | 90ms |
| Prod-like (1 CPU / 1 GB) | 500 | 20/s | 1–5 s | 0% | 14000ms | 19000ms | 25000ms | 430ms |
| Prod-like (1 CPU / 1 GB) | 1000 | 20/s | 1–5 s | 1% | 17000ms | 22000ms | 27000ms | 380ms |
| Prod-like (1 CPU / 1 GB) | 2000 | 30/s | 1–5 s | 25% | — | — | — | — |
| Low (0.25 CPU / 256 MB) | 100 | 10/s | 1–5 s | 0% | 510ms | 1400ms | 720ms | 110ms |
| Low (0.25 CPU / 256 MB) | 200 | 10/s | 1–5 s | 2% | 10000ms | 15000ms | 16000ms | 700ms |
| Low (0.25 CPU / 256 MB) | 500 | 20/s | 1–5 s | 5% | 27000ms | 34000ms | 43000ms | 900ms |

---

## Mapa de capacidad

| Escenario Docker | 100 usuarios | 200 usuarios | 500 usuarios | 1000 usuarios | 2000 usuarios | 5000 usuarios |
|---|---|---|---|---|---|---|
| Baseline (sin límite) | — | 0% | 0% | 0% | 2% | 38% |
| Medium (2 CPU / 2 GB) | — | 0% | 0% | 0% | 4% | 62% |
| Prod-like (1 CPU / 1 GB) | — | 0% | 0% | 1% | 25% | — |
| Low (0.25 CPU / 256 MB) | 0% | 2% | 5% | — | — | — |

Cada celda: error rate.

---

## Resultados completos

Los datos crudos de todos los runs (latencias, percentiles, RPS, error breakdown) están en el siguiente spreadsheet:

[Ver resultados en Google Sheets](https://docs.google.com/spreadsheets/d/1VSsBYFj1vj52RMBBJd6QdzIYib42q1C3u_XRar9jG_c/edit?usp=sharing)

---

## Conclusiones

- El punto de quiebre de **baseline y medium** está entre 1000 y 2000 usuarios: con 1000 mantienen 0% de error rate; con 2000 aparecen los primeros failures.
- **Prod-like** se degrada severamente a partir de 500 usuarios por el cuello de botella del 1 CPU: las latencias de buy/sell superan los 19–25 segundos en p95.
- **Low** aguanta 100 usuarios con 0% de error rate pero se vuelve inutilizable con 200: error rate 2% y latencias de 10–16 segundos en p95.
- El **mínimo viable para carga real es prod-like** (1 CPU / 1 GB): soporta hasta 1000 usuarios con solo 1% de error rate.
- Con **200 usuarios** todos los escenarios funcionan correctamente excepto Low.
- La caché de EDGAR redujo la latencia de ~1900ms a menos de 100ms bajo carga, eliminando los errores por rate limiting que existían antes de implementarla.