#!/usr/bin/env python3
"""Copernicus Marine salinity subset → JSON for env-import (requires copernicusmarine + xarray)."""
from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import datetime, timedelta

try:
    import copernicusmarine as cm
    import numpy as np
    import xarray as xr
except ImportError as exc:
    print(json.dumps({"error": f"Missing Python deps: {exc}"}), file=sys.stderr)
    sys.exit(2)


def nearest_idx(coord: np.ndarray, value: float) -> int:
    return int(np.argmin(np.abs(coord - value)))


def main() -> None:
    payload = json.load(sys.stdin)
    bbox = payload["bbox"]
    points = payload["points"]
    datetime_iso = payload["datetime_iso"]
    depths_m = payload.get("depths_m", [0.5, 60])

    username = os.environ.get("COPERNICUSMARINE_USERNAME")
    password = os.environ.get("COPERNICUSMARINE_PASSWORD")
    if username and password:
        cm.login(username=username, password=password, force_overwrite=True)

    dt = datetime.fromisoformat(datetime_iso.replace("Z", "+00:00"))
    start = (dt - timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%S")
    end = (dt + timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%S")

    min_depth = max(0.5, min(depths_m))
    max_depth = max(depths_m)

    out_dir = tempfile.mkdtemp()
    cm.subset(
        dataset_id="cmems_mod_glo_phy-so_anfc_0.083deg_P1D-m",
        minimum_longitude=bbox["min_lon"],
        maximum_longitude=bbox["max_lon"],
        minimum_latitude=bbox["min_lat"],
        maximum_latitude=bbox["max_lat"],
        minimum_depth=min_depth,
        maximum_depth=max_depth,
        start_datetime=start,
        end_datetime=end,
        file_format="netcdf",
        output_directory=out_dir,
    )

    nc_files = []
    for root, _, files in os.walk(out_dir):
        for name in files:
            if name.endswith(".nc"):
                nc_files.append(os.path.join(root, name))
    if not nc_files:
        print(json.dumps({"samples": [], "warning": "No NetCDF returned"}))
        return

    ds = xr.open_dataset(nc_files[0])
    so = ds["so"]
    lats = ds["latitude"].values
    lons = ds["longitude"].values
    depths = ds["depth"].values
    times = ds["time"].values

    target = np.datetime64(dt.replace(tzinfo=None))
    t_idx = nearest_idx(times.astype("datetime64[ns]"), target.astype("datetime64[ns]"))

    samples = []
    for pt in points:
        lat = pt["lat"]
        lon = pt["lon"]
        depth_m = pt["depth_m"]
        lat_i = nearest_idx(lats, lat)
        lon_i = nearest_idx(lons, lon)
        depth_i = nearest_idx(depths, depth_m if depth_m > 0.5 else 0.5)
        value = float(so.isel(time=t_idx, latitude=lat_i, longitude=lon_i, depth=depth_i).values)
        samples.append(
            {
                "kind": "salinity_psu",
                "x_km": pt["x_km"],
                "y_km": pt["y_km"],
                "depth_m": depth_m,
                "value": value,
            }
        )

    print(json.dumps({"samples": samples}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)
