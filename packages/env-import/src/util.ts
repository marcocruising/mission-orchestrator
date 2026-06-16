/** km/h → m/s */
export function kmhToMs(kmh: number): number {
  return (kmh * 1000) / 3600;
}

/** Pick the hourly index closest to target epoch (seconds). */
export function nearestHourlyIndex(timesIso: string[], targetEpochS: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < timesIso.length; i++) {
    const epochS = Math.floor(Date.parse(timesIso[i]!) / 1000);
    const dist = Math.abs(epochS - targetEpochS);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Ocean current velocity (km/h) + direction (° toward) → east/north m/s. */
export function currentToUV(velocityKmh: number, directionDeg: number): { u_ms: number; v_ms: number } {
  const rad = (directionDeg * Math.PI) / 180;
  const speedMs = kmhToMs(velocityKmh);
  return {
    u_ms: speedMs * Math.sin(rad),
    v_ms: speedMs * Math.cos(rad),
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
