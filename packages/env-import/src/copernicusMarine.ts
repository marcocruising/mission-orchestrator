import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scenarioBBox } from "./geo.js";
import type { EnvironmentSampleInsert, GridPoint, ScenarioEnvConfig } from "./types.js";

const SCRIPT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/copernicus-env-subset.py"
);

export interface CopernicusFetchOptions {
  config: ScenarioEnvConfig;
  grid: GridPoint[];
  datetimeIso: string;
  ts: number;
  pythonBin?: string;
}

interface CopernicusScriptOutput {
  samples?: Array<{
    kind: "salinity_psu";
    x_km: number;
    y_km: number;
    depth_m: number;
    value: number;
  }>;
  error?: string;
  warning?: string;
}

function runPythonScript(
  pythonBin: string,
  stdin: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonBin, [SCRIPT_PATH], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
    proc.stdin.write(stdin);
    proc.stdin.end();
  });
}

/** Salinity at grid points × depths via Copernicus Marine (Python bridge). */
export async function fetchCopernicusSalinity(
  options: CopernicusFetchOptions
): Promise<EnvironmentSampleInsert[]> {
  const { config, grid, datetimeIso, ts, pythonBin = "python3" } = options;

  if (!process.env.COPERNICUSMARINE_USERNAME || !process.env.COPERNICUSMARINE_PASSWORD) {
    console.warn("Copernicus: skipping salinity — COPERNICUSMARINE_USERNAME/PASSWORD not set");
    return [];
  }

  const bbox = scenarioBBox(config.geo, config.bounds_km);
  const points = grid.flatMap((pt) =>
    config.depths_m.map((depth_m) => ({
      lat: pt.lat,
      lon: pt.lon,
      x_km: pt.x_km,
      y_km: pt.y_km,
      depth_m,
    }))
  );

  const payload = JSON.stringify({
    bbox,
    points,
    datetime_iso: datetimeIso,
    depths_m: [...config.depths_m],
  });

  const { stdout, stderr, code } = await runPythonScript(pythonBin, payload);
  if (code === 2) {
    console.warn(`Copernicus: Python deps missing — ${stderr.trim() || "install copernicusmarine xarray h5py"}`);
    return [];
  }
  if (code !== 0) {
    let message = stderr.trim();
    try {
      const errJson = JSON.parse(stderr) as CopernicusScriptOutput;
      if (errJson.error) message = errJson.error;
    } catch {
      /* use stderr as-is */
    }
    throw new Error(`Copernicus salinity fetch failed: ${message || stdout}`);
  }

  const parsed = JSON.parse(stdout) as CopernicusScriptOutput;
  if (parsed.warning) console.warn(`Copernicus: ${parsed.warning}`);

  return (parsed.samples ?? []).map((s) => ({
    ts,
    kind: "salinity_psu" as const,
    x_km: s.x_km,
    y_km: s.y_km,
    depth_m: s.depth_m,
    value: s.value,
  }));
}
