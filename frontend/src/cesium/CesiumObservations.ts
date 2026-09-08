import { getCesium, type CesiumViewer } from './cesiumTypes';

export interface LandingObservation {
  id: string;
  instrument_type: string;
  latitude: number;
  longitude: number;
  max_depth: number;
  timestamp: string;
}

const MARKER_COLORS: Record<string, string> = {
  ARGO: '#22D3EE',
  GLIDER: '#F2B84B',
  BGC: '#4EA4FF',
  CTD: '#EEF3F7',
};

// Restrained scientific symbols: ● Argo, ▲ glider, ◆ BGC, ■ CTD.
// Rendered once to a canvas per type so the scene holds a handful of
// billboards instead of DOM markers.
function markerImage(type: string, selected: boolean): string {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  const color = MARKER_COLORS[type] ?? '#EEF3F7';
  if (ctx) {
    ctx.clearRect(0, 0, 48, 48);
    ctx.fillStyle = color;
    ctx.strokeStyle = selected ? '#FFFFFF' : 'rgba(0,0,0,0.55)';
    ctx.lineWidth = selected ? 3 : 2;
    const c = 24;
    ctx.beginPath();
    if (type === 'GLIDER') {
      ctx.moveTo(c, 10);
      ctx.lineTo(c + 13, 34);
      ctx.lineTo(c - 13, 34);
      ctx.closePath();
    } else if (type === 'BGC') {
      ctx.moveTo(c, 10);
      ctx.lineTo(c + 13, 24);
      ctx.lineTo(c, 38);
      ctx.lineTo(c - 13, 24);
      ctx.closePath();
    } else if (type === 'CTD') {
      ctx.rect(c - 10, 14, 20, 20);
    } else {
      ctx.arc(c, 24, 11, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }
  return canvas.toDataURL();
}

let managedIds: string[] = [];

export function clearObservationEntities(viewer: CesiumViewer) {
  for (const id of managedIds) {
    try {
      viewer.entities.removeById(id);
    } catch {
      /* Best-effort cleanup. */
    }
  }
  managedIds = [];
}

export function syncObservationEntities(
  viewer: CesiumViewer,
  list: LandingObservation[],
  opts: { visible: boolean; selectedId: string | null; scale?: number },
) {
  const baseScale = opts.scale ?? 1;
  clearObservationEntities(viewer);
  if (!opts.visible) return;
  const Cesium = getCesium();
  if (!Cesium) return;
  const images = new Map<string, string>();
  for (const o of list) {
    const id = `landing-obs-${o.id}`;
    const selected = o.id === opts.selectedId;
    const kind = o.instrument_type in MARKER_COLORS ? o.instrument_type : 'ARGO';
    if (!images.has(kind)) images.set(kind, markerImage(kind, false));
    if (selected) images.set(`${kind}:sel`, markerImage(kind, true));
    const entity: Record<string, unknown> = {
      id,
      position: Cesium.Cartesian3.fromDegrees(o.longitude, o.latitude, 25000),
      billboard: {
        image: selected ? images.get(`${kind}:sel`) : images.get(kind),
        scale: (selected ? 1.15 : 0.85) * baseScale,
        verticalOrigin: Cesium.VerticalOrigin?.CENTER,
      },
    };
    if (selected) {
      entity.label = {
        text: o.id,
        font: '12px monospace',
        fillColor: Cesium.Color.WHITE,
        outlineColor: new Cesium.Color(0.02, 0.06, 0.1, 0.9),
        outlineWidth: 3,
        style: Cesium.LabelStyle?.FILL_AND_OUTLINE,
        pixelOffset: { x: 0, y: -30 },
      };
    }
    try {
      viewer.entities.add(entity);
      managedIds.push(id);
    } catch {
      /* A single bad entity must not break the sequence. */
    }
  }
}
