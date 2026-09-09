from pathlib import Path

import numpy as np
import pytest
import xarray as xr
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services.ocean import OceanService


@pytest.fixture()
def analytic(tmp_path):
    lon = np.arange(-180, 180, 90)
    lat = [-60, 0, 60]
    values = np.broadcast_to(np.cos(np.radians(lon)), (1, 2, 3, 4)).copy()
    ds = xr.Dataset({'temperature': (('time', 'depth', 'latitude', 'longitude'), values, {'units': 'degC'})}, coords={'time': [np.datetime64('2026-01-01')], 'depth': [0, 100], 'latitude': lat, 'longitude': lon})
    path = tmp_path / 'periodic.nc'
    ds.to_netcdf(path)
    return OceanService(path, None)


def test_periodic_profile_and_great_circle(analytic):
    assert analytic.adapter.is_global
    assert analytic.profile(0, 135, 0)['profiles'][0]['temperature'] == pytest.approx(-0.5)
    assert analytic.profile(0, 185, 0) == analytic.profile(0, -175, 0)
    section = analytic.transect(0, 170, 0, -170, 0, 0, 'temperature', 5)
    assert section['total_distance_km'] == pytest.approx(2223.9, abs=0.02)
    assert abs(section['points'][2]['longitude']) == 180
    assert all(abs(p['longitude']) >= 170 for p in section['points'])
    assert all(p['value'] is not None for p in section['points'])


def test_arc_curves_poleward_and_rejects_invalid_endpoints(analytic):
    section = analytic.transect(30, -30, 30, 30, 0, 0, 'temperature', 3)
    assert section['points'][1]['latitude'] > 33
    for endpoints in [(90, 0, 0, 0), (0, 0, 0, 0), (0, 0, 0, 180), (float('nan'), 0, 0, 0)]:
        with pytest.raises(ValueError):
            analytic.transect(*endpoints, 0, 0, 'temperature')


def test_statistics_match_known_grid_and_validate_bounds(analytic):
    stats = analytic.region_stats(-60, 60, -90, 90, 0, 0, 'temperature')
    assert stats['mean'] == pytest.approx(1 / 3, abs=1e-5)
    assert stats['wet_cells'] == 9
    assert stats['std'] == pytest.approx(np.std([0, 1, 0]), abs=1e-5)
    for bounds in [(10, -10, 0, 90), (-90, 90, -180, 180), (-10, 10, 170, -170), (-10, 10, 0, float('nan'))]:
        with pytest.raises(ValueError):
            analytic.region_stats(*bounds, 0, 0, 'temperature')


def test_spatial_routes_and_seam():
    with TestClient(app) as client:
        assert client.post('/api/datasets/demo').status_code == 200
        for route in ('profile', 'inspect'):
            result = client.get(f'/api/ocean/{route}', params={'latitude': 0, 'longitude': 179})
            assert result.status_code == 200
            assert 'NaN' not in result.text
        result = client.get('/api/ocean/transect', params={'lat1': 0, 'lon1': 170, 'lat2': 0, 'lon2': -170})
        assert result.status_code == 200
        assert result.json()['total_distance_km'] < 2300
        assert client.get('/api/ocean/stats?lat_min=15&lat_max=5&lon_min=65&lon_max=85').status_code == 422


def test_regional_cutout_preserves_values_and_dateline():
    from backend.app.services.region import regional_view
    service = OceanService(Path(__file__).resolve().parents[1] / 'data/demo_ocean.nc', Path(__file__).resolve().parents[1] / 'data/observations.json')
    for lat, lon in [(-8.6, -140), (0, 179), (12, 65)]:
        view = regional_view(service, lat, lon, 'temperature', 6, 150)
        ds = view['dataset']
        assert ds['global'] is False
        west, east = ds['bounds']['longitude']
        south, north = ds['bounds']['latitude']
        assert 0 < east - west <= 65
        if lon == 65:
            assert west <= 45 and east >= 100 and north >= 28 and south <= -12
        assert west <= lon <= east and south <= lat <= north
        frame = view['frame']
        values = np.asarray(frame['slice']['values'], dtype=float)
        assert values.shape == (len(frame['slice']['latitudes']), len(frame['slice']['longitudes']))
        original = service.adapter.at_depth(service.adapter.ds.temperature.isel(time=6), 150)
        expected = original.sel(latitude=frame['slice']['latitudes'], longitude=[(x + 180) % 360 - 180 for x in frame['slice']['longitudes']])
        np.testing.assert_allclose(values, expected.values, atol=1e-5, equal_nan=True)
        assert frame['currents']['longitudes'] == frame['slice']['longitudes']
        assert all(west <= o['longitude'] <= east for o in view['observations'])
        for feature in view['land']['features']:
            from shapely.geometry import shape
            x0, y0, x1, y1 = shape(feature['geometry']).bounds
            assert west <= x0 <= x1 <= east and south <= y0 <= y1 <= north
