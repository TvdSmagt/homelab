"""Compare the current fixed contract with a dynamic (hourly) contract on measured P1 usage.

Reads hourly statistics of the DSMR sensors from the Home Assistant database and day-ahead prices
from the public EnergyZero API, then prints the cost per month under both contracts, for the current
net metering rules (salderen, until 2026-12-31) and for the rules from 2027-01-01 (no net metering).

Run inside the Home Assistant container (it can read the database, the host user cannot):

    docker exec -i homeassistant python3 - < scripts/dynamic_compare.py
    docker exec -i homeassistant python3 - --since 2026-11-01 < scripts/dynamic_compare.py

All prices in EUR incl. 21% VAT unless the name says _EXCL. Grid operator costs (netbeheer) and the
energy tax rebate are the same under both contracts and are left out.
"""

import argparse
import json
import sqlite3
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

VAT = 1.21
ENERGY_TAX_E = 0.11085  # EUR/kWh incl. VAT (2026)
ENERGY_TAX_G = 0.72680  # EUR/m3 incl. VAT (2026)

# Current contract: Budget Energie, fixed (from the tariff sheet, 2026-11-21)
FIXED_E = 0.27695  # EUR/kWh, both tariffs, incl. energy tax
FIXED_G = 1.51574  # EUR/m3, incl. energy tax
FIXED_FEEDIN = 0.01000  # EUR/kWh for export above import (and all export from 2027)
FIXED_MONTHLY = 6.99 + 6.99  # supply costs electricity + gas

# Dynamic contract: ASSUMPTIONS, replace with a real offer (they differ per supplier)
DYN_MARKUP_E_EXCL = 0.020  # supplier markup EUR/kWh excl. VAT
DYN_MARKUP_G_EXCL = 0.050  # supplier markup EUR/m3 excl. VAT
DYN_EXPORT_FEE_EXCL = 0.000  # cost per exported kWh, excl. VAT
DYN_MONTHLY = 5.99 + 5.99  # supply costs electricity + gas

DB = "file:/config/home-assistant_v2.db?mode=ro"
SENSORS = {
    "imp": ["sensor.electricity_meter_energy_consumption_tarif_1",
            "sensor.electricity_meter_energy_consumption_tarif_2"],
    "exp": ["sensor.electricity_meter_energy_production_tarif_1",
            "sensor.electricity_meter_energy_production_tarif_2"],
    "gas": ["sensor.gas_meter_gas_consumption"],
}


def hourly_usage(since: datetime) -> dict[datetime, dict[str, float]]:
    """Usage per hour (UTC start) from the hourly long-term statistics."""
    db = sqlite3.connect(DB, uri=True)
    usage: dict[datetime, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for kind, ids in SENSORS.items():
        for sid in ids:
            rows = db.execute(
                """SELECT s.start_ts, s.sum - LAG(s.sum) OVER (ORDER BY s.start_ts)
                   FROM statistics s JOIN statistics_meta m ON s.metadata_id = m.id
                   WHERE m.statistic_id = ? ORDER BY s.start_ts""",
                (sid,),
            ).fetchall()
            for ts, delta in rows:
                hour = datetime.fromtimestamp(ts, timezone.utc)
                if delta is not None and hour >= since:
                    usage[hour][kind] += max(delta, 0.0)
    return usage


def prices(usage_type: int, start: datetime, end: datetime) -> dict[datetime, float]:
    """Day-ahead prices per hour, EUR excl. VAT (1 = electricity/kWh, 3 = gas/m3)."""
    out: dict[datetime, float] = {}
    day = start.replace(hour=0, minute=0, second=0, microsecond=0)
    while day <= end:  # one month per request
        till = min(day + timedelta(days=31), end + timedelta(days=1))
        url = ("https://api.energyzero.nl/v1/energyprices"
               f"?fromDate={day:%Y-%m-%dT%H:%M:%S}.000Z&tillDate={till:%Y-%m-%dT%H:%M:%S}.000Z"
               f"&interval=4&usageType={usage_type}&inclBtw=false")
        req = urllib.request.Request(url, headers={"User-Agent": "homelab-dynamic-compare"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            for p in json.load(resp)["Prices"]:
                t = datetime.fromisoformat(p["readingDate"].replace("Z", "+00:00"))
                out[t.replace(minute=0, second=0, microsecond=0)] = p["price"]
        day = till
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default="2000-01-01", help="YYYY-MM-DD (local date, approx.)")
    args = ap.parse_args()
    since = datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc)

    usage = hourly_usage(since)
    if not usage:
        print("No P1 statistics yet.")
        return
    first, last = min(usage), max(usage)
    pe, pg = prices(1, first, last), prices(3, first, last)

    months: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    missing = 0
    for hour, u in sorted(usage.items()):
        if hour not in pe:
            missing += 1
            continue
        local = hour.astimezone()
        m = months[f"{local:%Y-%m}"]
        m["hours"] += 1
        m["imp"] += u["imp"]
        m["exp"] += u["exp"]
        m["gas"] += u["gas"]
        m["dyn_imp"] += u["imp"] * ((pe[hour] + DYN_MARKUP_E_EXCL) * VAT + ENERGY_TAX_E)
        m["dyn_exp"] += u["exp"] * (pe[hour] - DYN_EXPORT_FEE_EXCL) * VAT
        m["dyn_gas"] += u["gas"] * ((pg.get(hour, 0.0) + DYN_MARKUP_G_EXCL) * VAT + ENERGY_TAX_G)

    print(f"Data: {first.astimezone():%Y-%m-%d %H:%M} to {last.astimezone():%Y-%m-%d %H:%M}"
          f" ({len(usage)} h{', %d h without price' % missing if missing else ''})")
    print("Dynamic contract uses ASSUMED markups and fees, see the top of the script.\n")
    head = (f"{'month':7} {'days':>5} {'imp kWh':>8} {'exp kWh':>8} {'gas m3':>7} | "
            f"{'fixed':>8} {'dynamic':>8} {'diff':>8} | {'fixed27':>8} {'dyn27':>8} {'diff27':>8}")
    print(head)
    print("-" * len(head))
    tot = defaultdict(float)
    for month, m in sorted(months.items()):
        days = m["hours"] / 24
        netted = min(m["imp"], m["exp"])  # net metering: export offsets import (approx., per month)
        fees_f, fees_d = FIXED_MONTHLY * days * 12 / 365, DYN_MONTHLY * days * 12 / 365
        gas_f = m["gas"] * FIXED_G
        # 2026 rules (salderen)
        fixed = (m["imp"] - netted) * FIXED_E + (m["exp"] - netted) * -FIXED_FEEDIN + gas_f + fees_f
        dyn = m["dyn_imp"] - m["dyn_exp"] - netted * ENERGY_TAX_E + m["dyn_gas"] + fees_d
        # 2027 rules (no salderen): export earns only the feed-in / market price
        fixed27 = m["imp"] * FIXED_E - m["exp"] * FIXED_FEEDIN + gas_f + fees_f
        dyn27 = m["dyn_imp"] - m["dyn_exp"] + m["dyn_gas"] + fees_d
        for k, v in (("fixed", fixed), ("dyn", dyn), ("fixed27", fixed27), ("dyn27", dyn27),
                     ("days", days), ("imp", m["imp"]), ("exp", m["exp"]), ("gas", m["gas"])):
            tot[k] += v
        print(f"{month:7} {days:5.1f} {m['imp']:8.1f} {m['exp']:8.1f} {m['gas']:7.1f} | "
              f"{fixed:8.2f} {dyn:8.2f} {dyn - fixed:+8.2f} | {fixed27:8.2f} {dyn27:8.2f} {dyn27 - fixed27:+8.2f}")
    print("-" * len(head))
    print(f"{'total':7} {tot['days']:5.1f} {tot['imp']:8.1f} {tot['exp']:8.1f} {tot['gas']:7.1f} | "
          f"{tot['fixed']:8.2f} {tot['dyn']:8.2f} {tot['dyn'] - tot['fixed']:+8.2f} | "
          f"{tot['fixed27']:8.2f} {tot['dyn27']:8.2f} {tot['dyn27'] - tot['fixed27']:+8.2f}")
    print("\ndiff = dynamic - fixed (negative: dynamic would have been cheaper). EUR incl. VAT.")


if __name__ == "__main__":
    main()
