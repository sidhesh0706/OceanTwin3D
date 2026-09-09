"""Native-grid regional cutouts for the globe-to-water-column transition."""
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from shapely.affinity import translate
from shapely.geometry import box, mapping, shape

from backend.app.adapters.netcdf import UNITS, clean


@lru_cache(maxsize=1)
def coastlines():
    source = Path(__file__).resolve().parents[3] / 'data_sources/ne_110m_land.geojson'
    return [shape(f['geometry']) for f in json.loads(source.read_text(encoding='utf-8'))['features']]


def regional_view(service, latitude, longitude, variable, time, depth):
    adapter = service.adapter
    adapter.validate(variable, time)
    center = adapter.position(latitude, longitude)
    ds = adapter.ds.isel(time=time)
    # Unwrap around the selected instrument, including Pacific seam regions.
    if adapter.is_global:
        ds = ds.assign_coords(longitude=center + ((ds.longitude - center + 180) % 360 - 180)).sortby('longitude')
    # Include the broad ocean context, not just the few cells next to the float.
    # The Indian Ocean window covers both Arabian Sea and Bay of Bengal.
    indian = 40 <= center <= 105 and -30 <= latitude <= 30
    lat_window = (-30, 30) if indian else (latitude - 25, latitude + 25)
    lon_window = (40, 105) if indian else (center - 30, center + 30)
    ds = ds.sel(latitude=slice(*lat_window), longitude=slice(*lon_window))
    ds = adapter.downsample(ds, cap=73, depth_cap=ds.sizes['depth'])
    if ds.sizes['latitude'] < 2 or ds.sizes['longitude'] < 2:
        raise ValueError('Not enough model cells around this location for a regional view.')
    west, east = float(ds.longitude.min()), float(ds.longitude.max())
    south, north = float(ds.latitude.min()), float(ds.latitude.max())
    meta = adapter.metadata() | {
        'id': f'{adapter.metadata()["id"]}-region',
        'name': 'Local ocean around selected instrument', 'global': False,
        'bounds': {'longitude': [west, east], 'latitude': [south, north], 'depth': adapter.metadata()['bounds']['depth']},
        'grid': adapter.metadata()['grid'] | {'longitude': ds.sizes['longitude'], 'latitude': ds.sizes['latitude']},
    }
    def field(arr, z):
        finite = arr.values[np.isfinite(arr.values)]
        return {'variable': variable, 'units': UNITS[variable], 'time': time, 'timestamp': adapter.times()[time],
                'depth': z, 'depths': arr.depth.values.tolist() if z is None else [z],
                'latitudes': ds.latitude.values.tolist(), 'longitudes': ds.longitude.values.tolist(),
                'values': clean(arr.values), 'range': [float(finite.min()), float(finite.max())] if finite.size else [None, None]}
    volume_arr = adapter.downsample(ds[variable], cap=73, depth_cap=32)
    volume = field(volume_arr, None)
    selected = adapter.at_depth(ds, depth)
    slice_field = field(selected[variable], depth)
    currents = None
    if meta['has_currents']:
        currents = {'depth': depth, 'time': time, 'latitudes': ds.latitude.values.tolist(), 'longitudes': ds.longitude.values.tolist(),
                    'u': clean(selected.u_current.values), 'v': clean(selected.v_current.values), 'units': 'm/s'}
    sensors = []
    for obs in service.observations:
        lon = center + ((obs['longitude'] - center + 180) % 360 - 180)
        if west <= lon <= east and south <= obs['latitude'] <= north:
            sensors.append({k: v for k, v in obs.items() if k != 'profiles'} | {'longitude': lon, 'max_depth': max((p['depth'] for p in obs['profiles']), default=0)})
    bounds = box(west, south, east, north)
    features = []
    for polygon in coastlines():
        for offset in (-360, 0, 360):
            shifted = translate(polygon, xoff=offset)
            if not shifted.intersects(bounds):
                continue
            clipped = shifted.intersection(bounds)
            if clipped.geom_type in ('Polygon', 'MultiPolygon') and not clipped.is_empty:
                features.append({'type': 'Feature', 'properties': {}, 'geometry': mapping(clipped)})
    return {'dataset': meta, 'frame': {'slice': slice_field, 'volume': volume, 'currents': currents},
            'observations': sensors, 'land': {'type': 'FeatureCollection', 'features': features}}
