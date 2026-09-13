import type { Land } from '../types';

/** Rasterized geography shared by globe and local views, including polygon holes. */
export function landMask(
  land: Land | null | undefined,
  width: number,
  height: number,
  west: number,
  east: number,
  south: number,
  north: number,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  land?.features.forEach((feature) => {
    const polygons =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates as number[][][]]
        : (feature.geometry.coordinates as number[][][][]);
    for (const rings of polygons)
      for (const shift of [-360, 0, 360]) {
        ctx.beginPath();
        for (const ring of rings) {
          ring.forEach(([lon, lat], i) => {
            const x = ((lon + shift - west) / (east - west)) * (width - 1);
            const y = ((north - lat) / (north - south)) * (height - 1);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
        }
        ctx.fill('evenodd');
      }
  });
  return ctx.getImageData(0, 0, width, height).data;
}

/** Display-only extension beneath land; offshore missing values remain missing. */
export function extendCoastalDisplay(
  rows: (number | null)[][],
  isLand: (j: number, i: number) => boolean,
  periodic: boolean,
) {
  return rows.map((row, j) =>
    row.map((value, i) => {
      if (value !== null || !isLand(j, i)) return value;
      let sum = 0,
        weights = 0;
      for (let dj = -2; dj <= 2; dj++)
        for (let di = -2; di <= 2; di++) {
          const jj = j + dj,
            ii = periodic ? (i + di + row.length) % row.length : i + di;
          if (jj < 0 || jj >= rows.length || ii < 0 || ii >= row.length || (!di && !dj)) continue;
          const v = rows[jj][ii];
          if (v === null || !Number.isFinite(v)) continue;
          const w = 1 / (di * di + dj * dj);
          sum += v * w;
          weights += w;
        }
      return weights ? sum / weights : null;
    }),
  );
}

/** Exact model-node classification avoids losing narrow islands to raster pixels. */
export function geographicLandTest(land: Land | null | undefined) {
  const polygons = (land?.features ?? [])
    .flatMap((f) =>
      f.geometry.type === 'Polygon'
        ? [f.geometry.coordinates as number[][][]]
        : (f.geometry.coordinates as number[][][][]),
    )
    .map((rings) => ({
      rings,
      west: Math.min(...rings[0].map((p) => p[0])),
      east: Math.max(...rings[0].map((p) => p[0])),
      south: Math.min(...rings[0].map((p) => p[1])),
      north: Math.max(...rings[0].map((p) => p[1])),
    }));
  const inRing = (ring: number[][], x: number, y: number) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i],
        [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return (longitude: number, latitude: number) => {
    for (const p of polygons)
      for (const offset of [-360, 0, 360]) {
        const x = longitude + offset;
        if (x < p.west || x > p.east || latitude < p.south || latitude > p.north) continue;
        if (
          inRing(p.rings[0], x, latitude) &&
          !p.rings.slice(1).some((r) => inRing(r, x, latitude))
        )
          return true;
      }
    return false;
  };
}
