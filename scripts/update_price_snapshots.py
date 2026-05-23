#!/usr/bin/env python3
import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional, Sequence, Tuple

import psycopg2
import yfinance as yf
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

SOURCE = "YAHOO_FINANCE"
PRICE_SCALE = Decimal("0.0001")


def main() -> int:
    load_dotenv()
    args = parse_args()

    try:
        with connect() as connection:
            stocks = load_target_stocks(connection, args.tickers)

            if not stocks:
                print_summary(processed=0, saved=0, failed=[], updated_at=None)
                return 0

            prices, failures = fetch_prices([stock["ticker"] for stock in stocks])

            if should_use_mock_price_fallback():
                prices = apply_mock_price_fallback(stocks, prices)

            saved = persist_snapshots(connection, stocks, prices)
            updated_at = datetime.now(timezone.utc).isoformat()

            missing_price_failures = [
                {"ticker": stock["ticker"], "error": "No price returned by Yahoo Finance"}
                for stock in stocks
                if stock["ticker"] not in prices
                and not any(failure["ticker"] == stock["ticker"] for failure in failures)
            ]

            print_summary(
                processed=len(stocks),
                saved=saved,
                failed=[*failures, *missing_price_failures],
                updated_at=updated_at,
            )
            return 0
    except Exception as error:
        print(
            json.dumps(
                {
                    "processed": 0,
                    "saved": 0,
                    "failed": [{"ticker": "*", "error": str(error)}],
                    "updatedAt": None,
                }
            ),
            file=sys.stderr,
        )
        return 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch latest Yahoo Finance prices and persist price snapshots."
    )
    parser.add_argument(
        "--tickers",
        help="Optional comma-separated ticker list. Defaults to stocks present in transactions or watchlists.",
    )
    parsed = parser.parse_args()

    parsed.tickers = normalize_tickers(parsed.tickers)
    return parsed


def normalize_tickers(raw_tickers: Optional[str]) -> Optional[List[str]]:
    if not raw_tickers:
        return None

    tickers = []
    seen = set()

    for ticker in raw_tickers.split(","):
        normalized = ticker.strip().upper()
        if normalized and normalized not in seen:
            seen.add(normalized)
            tickers.append(normalized)

    return tickers


def connect():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    return psycopg2.connect(database_url)


def load_target_stocks(connection, tickers: Optional[Sequence[str]]) -> List[Dict]:
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        if tickers:
            cursor.execute(
                '''
                SELECT id, ticker
                FROM "Stock"
                WHERE ticker = ANY(%s)
                ORDER BY ticker ASC
                ''',
                (list(tickers),),
            )
        else:
            cursor.execute(
                '''
                SELECT DISTINCT s.id, s.ticker
                FROM "Stock" s
                WHERE EXISTS (
                    SELECT 1 FROM "Transaction" t WHERE t."stockId" = s.id
                )
                OR EXISTS (
                    SELECT 1 FROM "WatchlistItem" w WHERE w."stockId" = s.id
                )
                ORDER BY s.ticker ASC
                '''
            )

        return list(cursor.fetchall())


def fetch_prices(tickers: Sequence[str]) -> Tuple[Dict[str, Decimal], List[Dict[str, str]]]:
    if not tickers:
        return {}, []

    prices: Dict[str, Decimal] = {}
    failures: List[Dict[str, str]] = []

    try:
        data = yf.download(
            list(tickers),
            period="1d",
            progress=False,
            threads=True,
            timeout=20,
        )

        if len(tickers) == 1:
            ticker = tickers[0]
            price = extract_single_ticker_price(data, ticker)
            if price is not None:
                prices[ticker] = price
            return prices, failures

        close_prices = data.get("Close")
        if close_prices is None:
            return prices, failures

        for ticker in tickers:
            try:
                value = close_prices[ticker].dropna().iloc[-1]
                price = normalize_price(value)
                if price is not None:
                    prices[ticker] = price
            except Exception as error:
                failures.append({"ticker": ticker, "error": str(error)})

        return prices, failures
    except Exception as error:
        return fetch_prices_one_by_one(tickers, str(error))


def fetch_prices_one_by_one(
    tickers: Sequence[str], batch_error: str
) -> Tuple[Dict[str, Decimal], List[Dict[str, str]]]:
    prices: Dict[str, Decimal] = {}
    failures: List[Dict[str, str]] = []

    for ticker in tickers:
        try:
            raw_price = yf.Ticker(ticker).fast_info.get("lastPrice")
            price = normalize_price(raw_price)
            if price is None:
                failures.append(
                    {
                        "ticker": ticker,
                        "error": f"No lastPrice returned. Batch error: {batch_error}",
                    }
                )
            else:
                prices[ticker] = price
        except Exception as error:
            failures.append({"ticker": ticker, "error": str(error)})

    return prices, failures


def extract_single_ticker_price(data, ticker: str) -> Optional[Decimal]:
    try:
        close_prices = data.get("Close")
        if close_prices is None:
            return None

        if hasattr(close_prices, "columns") and ticker in close_prices.columns:
            value = close_prices[ticker].dropna().iloc[-1]
        else:
            value = close_prices.dropna().iloc[-1]

        return normalize_price(value)
    except Exception:
        return None


def normalize_price(value) -> Optional[Decimal]:
    if value is None:
        return None

    numeric_value = float(value)
    if math.isnan(numeric_value) or numeric_value <= 0:
        return None

    return Decimal(str(numeric_value)).quantize(PRICE_SCALE, rounding=ROUND_HALF_UP)

def should_use_mock_price_fallback() -> bool:
    return os.getenv("USE_MOCK_PRICE_FALLBACK", "false").lower() == "true"


def apply_mock_price_fallback(
    stocks: Sequence[Dict], prices: Dict[str, Decimal]
) -> Dict[str, Decimal]:
    fallback_prices = dict(prices)

    for stock in stocks:
        ticker = stock["ticker"]

        if ticker not in fallback_prices:
            fallback_prices[ticker] = get_mock_price_for_ticker(ticker)

    return fallback_prices


def get_mock_price_for_ticker(ticker: str) -> Decimal:
    mock_prices = {
        "AAPL": Decimal("180.0000"),
        "MSFT": Decimal("420.0000"),
        "TSLA": Decimal("250.0000"),
        "GOOGL": Decimal("170.0000"),
        "AMZN": Decimal("185.0000"),
    }

    return mock_prices.get(ticker, Decimal("100.0000"))


def persist_snapshots(
    connection, stocks: Sequence[Dict], prices: Dict[str, Decimal]
) -> int:
    saved = 0

    with connection.cursor() as cursor:
        for stock in stocks:
            price = prices.get(stock["ticker"])
            if price is None:
                continue

            cursor.execute(
                '''
                INSERT INTO "PriceSnapshot" ("stockId", price, source, "fetchedAt")
                VALUES (%s, %s, %s, NOW())
                ''',
                (stock["id"], price, SOURCE),
            )
            saved += 1

    connection.commit()
    return saved


def print_summary(
    processed: int,
    saved: int,
    failed: Sequence[Dict[str, str]],
    updated_at: Optional[str],
) -> None:
    print(
        json.dumps(
            {
                "processed": processed,
                "saved": saved,
                "failed": list(failed),
                "updatedAt": updated_at,
            }
        )
    )


if __name__ == "__main__":
    sys.exit(main())
