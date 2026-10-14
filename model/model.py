"""Three-party teleconsultation overlap model.

A slot is feasible when ALL of patient, India operations team and destination clinic
are inside their working window at the same UTC instant. Resolution: 30 minutes.
Every date of 2026 is evaluated, so DST shifts are captured through the IANA tz database.
Working-hour windows and the patient-region list are ASSUMPTIONS, not company data.
"""
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import pandas as pd

YEAR = 2026
STEP_MIN = 30

# Patient regions (IANA zones, same set as the scheduler app picker)
REGIONS = {
    "UK": "Europe/London", "Ireland": "Europe/Dublin", "Europe Central": "Europe/Berlin",
    "Europe Eastern": "Europe/Athens", "US Eastern": "America/New_York",
    "US Central": "America/Chicago", "US Mountain": "America/Denver",
    "US Arizona": "America/Phoenix", "US Pacific": "America/Los_Angeles",
    "US Alaska": "America/Anchorage", "US Hawaii": "Pacific/Honolulu",
    "UAE / Gulf": "Asia/Dubai", "Saudi Arabia": "Asia/Riyadh", "Qatar": "Asia/Qatar",
    "Israel": "Asia/Jerusalem", "Australia WA": "Australia/Perth",
    "Australia QLD": "Australia/Brisbane", "Australia NSW/VIC": "Australia/Sydney",
    "Australia SA": "Australia/Adelaide", "New Zealand": "Pacific/Auckland",
    "South Africa": "Africa/Johannesburg",
}
# Destination clinic regions studied
DESTINATIONS = {"Turkey": "Europe/Istanbul", "Mexico": "America/Mexico_City",
                "Thailand": "Asia/Bangkok", "South Korea": "Asia/Seoul"}
INDIA = "Asia/Kolkata"

# Working windows in local hours (start, end). ASSUMPTIONS.
SCENARIOS = {
    "Strict":   {"patient": (9, 20),  "india": (9, 18),  "clinic": (9, 18)},
    "Standard": {"patient": (8, 21),  "india": (9, 21),  "clinic": (9, 18)},
    "Relaxed":  {"patient": (7, 22),  "india": (8, 23),  "clinic": (8, 20)},
}


def in_window(local_dt, win):
    h = local_dt.hour + local_dt.minute / 60
    return win[0] <= h < win[1]


def day_feasible_hours(date, pz, cz, win):
    """Feasible hours in the 24h UTC day starting at `date` 00:00 UTC."""
    base = datetime(date.year, date.month, date.day, tzinfo=timezone.utc)
    pz, cz, iz = ZoneInfo(pz), ZoneInfo(cz), ZoneInfo(INDIA)
    n = 0
    for k in range(24 * 60 // STEP_MIN):
        t = base + timedelta(minutes=k * STEP_MIN)
        if in_window(t.astimezone(pz), win["patient"]) and \
           in_window(t.astimezone(iz), win["india"]) and \
           in_window(t.astimezone(cz), win["clinic"]):
            n += 1
    return n * STEP_MIN / 60


def run():
    dates = [datetime(YEAR, 1, 1) + timedelta(days=i) for i in range(365)]
    rows = []
    for sc, win in SCENARIOS.items():
        for rname, rz in REGIONS.items():
            for dname, dz in DESTINATIONS.items():
                hrs = [day_feasible_hours(d, rz, dz, win) for d in dates]
                s = pd.Series(hrs)
                rows.append({
                    "scenario": sc, "region": rname, "destination": dname,
                    "mean_hours": s.mean(), "min_hours": s.min(), "max_hours": s.max(),
                    "zero_days": int((s == 0).sum()),
                    "seasonal_swing": s.max() - s.min(),
                })
    df = pd.DataFrame(rows)
    df.to_csv(os.path.join(OUT, "results.csv"), index=False)
    return df


if __name__ == "__main__":
    df = run()
    print(df.groupby("scenario").agg(
        pairs=("mean_hours", "size"),
        pairs_never_feasible=("zero_days", lambda x: int((x == 365).sum())),
        pairs_with_any_zero_day=("zero_days", lambda x: int((x > 0).sum())),
        pairs_with_dst_swing=("seasonal_swing", lambda x: int((x > 0).sum())),
    ))
