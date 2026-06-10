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
                print_summary(
                    processed=0, saved=0, failed=[], reused=[], updated_at=None
                )
                return 0

            prices, failures = fetch_prices([stock["ticker"] for stock in stocks])

            saved = persist_snapshots(connection, stocks, prices)
            updated_at = datetime.now(timezone.utc).isoformat()
            reused = load_persisted_price_fallbacks(connection, stocks, prices)
            reused_tickers = {fallback["ticker"] for fallback in reused}

            missing_price_failures = [
                {"ticker": stock["ticker"], "error": "No price returned by Yahoo Finance"}
                for stock in stocks
                if stock["ticker"] not in prices
                and stock["ticker"] not in reused_tickers
                and not any(failure["ticker"] == stock["ticker"] for failure in failures)
            ]
            unrecovered_failures = [
                failure
                for failure in failures
                if failure["ticker"] not in reused_tickers
            ]

            print_summary(
                processed=len(stocks),
                saved=saved,
                failed=[*unrecovered_failures, *missing_price_failures],
                reused=reused,
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
                    "reused": [],
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


def fetch_prices(
    tickers: Sequence[str],
) -> Tuple[Dict[str, Decimal], List[Dict[str, str]]]:
    if not tickers:
        return {}, []

    try:
        data = yf.download(
            list(tickers),
            period="5d",
            progress=False,
            threads=True,
            timeout=20,
        )

        prices = extract_download_prices(data, tickers)
        missing_tickers = [ticker for ticker in tickers if ticker not in prices]

        if not missing_tickers:
            return prices, []

        fallback_prices, failures = fetch_prices_one_by_one(
            missing_tickers,
            "No close price returned by Yahoo Finance download",
        )
        prices.update(fallback_prices)

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
            yahoo_ticker = yf.Ticker(ticker)
            raw_price = yahoo_ticker.fast_info.get("lastPrice")
            price = normalize_price(raw_price)

            if price is None:
                price = fetch_recent_history_price(yahoo_ticker)

            if price is None:
                failures.append(
                    {
                        "ticker": ticker,
                        "error": f"No market price returned. Batch error: {batch_error}",
                    }
                )
            else:
                prices[ticker] = price
        except Exception as error:
            failures.append({"ticker": ticker, "error": str(error)})

    return prices, failures


def extract_download_prices(data, tickers: Sequence[str]) -> Dict[str, Decimal]:
    prices: Dict[str, Decimal] = {}
    close_prices = data.get("Close")

    if close_prices is None:
        return prices

    for ticker in tickers:
        price = extract_download_price(close_prices, ticker)

        if price is not None:
            prices[ticker] = price

    return prices


def extract_download_price(close_prices, ticker: str) -> Optional[Decimal]:
    if hasattr(close_prices, "columns"):
        if ticker not in close_prices.columns:
            return None

        return normalize_last_series_price(close_prices[ticker])

    return normalize_last_series_price(close_prices)


def fetch_recent_history_price(yahoo_ticker) -> Optional[Decimal]:
    history = yahoo_ticker.history(period="5d")
    close_prices = history.get("Close")

    if close_prices is None:
        return None

    return normalize_last_series_price(close_prices)


def normalize_last_series_price(series) -> Optional[Decimal]:
    values = series.dropna()

    if values.empty:
        return None

    return normalize_price(values.iloc[-1])


def normalize_price(value) -> Optional[Decimal]:
    if value is None:
        return None

    numeric_value = float(value)
    if math.isnan(numeric_value) or numeric_value <= 0:
        return None

    return Decimal(str(numeric_value)).quantize(PRICE_SCALE, rounding=ROUND_HALF_UP)


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


def load_persisted_price_fallbacks(
    connection, stocks: Sequence[Dict], fresh_prices: Dict[str, Decimal]
) -> List[Dict]:
    missing_stocks = [stock for stock in stocks if stock["ticker"] not in fresh_prices]

    if not missing_stocks:
        return []

    stock_by_id = {stock["id"]: stock for stock in missing_stocks}

    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            '''
            SELECT DISTINCT ON ("stockId") "stockId", price, source, "fetchedAt"
            FROM "PriceSnapshot"
            WHERE "stockId" = ANY(%s)
            ORDER BY "stockId", "fetchedAt" DESC
            ''',
            (list(stock_by_id.keys()),),
        )

        snapshots = cursor.fetchall()

    return [
        {
            "ticker": stock_by_id[snapshot["stockId"]]["ticker"],
            "stockId": snapshot["stockId"],
            "price": str(snapshot["price"]),
            "source": snapshot["source"],
            "fetchedAt": snapshot["fetchedAt"].isoformat(),
        }
        for snapshot in snapshots
    ]


def print_summary(
    processed: int,
    saved: int,
    failed: Sequence[Dict[str, str]],
    reused: Sequence[Dict],
    updated_at: Optional[str],
) -> None:
    print(
        json.dumps(
            {
                "processed": processed,
                "saved": saved,
                "failed": list(failed),
                "reused": list(reused),
                "updatedAt": updated_at,
            }
        )
    )


if __name__ == "__main__":
    sys.exit(main())
