"""
Locust tests — escenarios de load y stress.

Ambos escenarios ejecutan el mismo ciclo completo por usuario virtual:
  BUYING → HOLDING (GET /portfolio + GET /edgar/companies/search) → SELLING → BUYING

Correr solo load test:
    locust -f locust/locustfile.py LoadUser --users 50 --spawn-rate 5 --run-time 5m

Correr solo stress test:
    locust -f locust/locustfile.py StressUser --users 200 --spawn-rate 10 --run-time 5m

Correr ambos simultáneamente:
    locust -f locust/locustfile.py --users 250 --spawn-rate 10 --run-time 5m
"""

import os
import random
import uuid

from locust import HttpUser, between, task

BASE_URL = os.getenv("BASE_URL", "http://localhost:3000")
TICKERS = os.getenv("TICKERS", "AAPL,MSFT,GOOGL,AMZN,TSLA").split(",")
EDGAR_QUERIES = ["Apple", "Microsoft", "Google", "Amazon", "Tesla"]

BUYING = "BUYING"
HOLDING = "HOLDING"
SELLING = "SELLING"


class BasePortfolioUser(HttpUser):
    abstract = True

    def on_start(self):
        self._email = f"user_{uuid.uuid4().hex[:12]}@test.com"
        self._password = "Test123!"
        self._ticker = random.choice(TICKERS)
        self.state = BUYING
        self.quantity_held = 0

        self.client.post(
            "/auth/register",
            json={"email": self._email, "password": self._password},
            name="POST /auth/register [setup]",
        )

        with self.client.post(
            "/auth/login",
            json={"email": self._email, "password": self._password},
            catch_response=True,
            name="POST /auth/login [setup]",
        ) as resp:
            if resp.status_code in (200, 201):
                token = resp.json().get("accessToken")
                self.client.headers["Authorization"] = f"Bearer {token}"
            else:
                resp.failure(f"Login failed: {resp.status_code} — {resp.text}")
                return

        with self.client.post(
            "/stocks",
            json={"ticker": self._ticker},
            catch_response=True,
            name="POST /stocks [setup]",
        ) as resp:
            if resp.status_code == 409:
                resp.success()

        with self.client.post(
            "/price-snapshots/update",
            json={"tickers": [self._ticker]},
            catch_response=True,
            name="POST /price-snapshots/update [setup]",
        ) as resp:
            if not resp.ok:
                resp.failure(f"Price snapshot update failed: {resp.status_code} — {resp.text}")

    @task
    def trade_cycle(self):
        if self.state == BUYING:
            self._do_buy()
        elif self.state == HOLDING:
            self._do_holding()
        elif self.state == SELLING:
            self._do_sell()

    def _do_buy(self):
        with self.client.post(
            "/transactions/buy",
            json={"ticker": self._ticker, "quantity": 1},
            catch_response=True,
            name="POST /transactions/buy",
        ) as resp:
            if resp.status_code in (200, 201):
                self.quantity_held += 1
                self.state = HOLDING
            else:
                resp.failure(f"Buy failed: {resp.status_code}")

    def _do_holding(self):
        self.client.get("/portfolio", name="GET /portfolio")
        q = random.choice(EDGAR_QUERIES)
        self.client.get(
            f"/edgar/companies/search?q={q}",
            name="GET /edgar/companies/search",
        )
        self.state = SELLING

    def _do_sell(self):
        with self.client.post(
            "/transactions/sell",
            json={"ticker": self._ticker, "quantity": 1},
            catch_response=True,
            name="POST /transactions/sell",
        ) as resp:
            if resp.status_code in (200, 201):
                self.quantity_held -= 1
                self.state = BUYING
            elif resp.status_code == 400:
                resp.success()
                self.quantity_held = 0
                self.state = BUYING
            else:
                resp.failure(f"Unexpected sell error: {resp.status_code}")


class LoadUser(BasePortfolioUser):
    """Carga sostenida normal. Recomendado: --users 50 --spawn-rate 5 --run-time 5m"""
    host = BASE_URL
    wait_time = between(5, 14)


class StressUser(BasePortfolioUser):
    """Carga extrema. Recomendado: --users 200 --spawn-rate 10 --run-time 3m"""
    host = BASE_URL
    wait_time = between(1, 5)