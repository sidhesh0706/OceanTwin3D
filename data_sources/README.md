# Geographic source

`ne_110m_land.geojson` is Natural Earth's 1:110 million land geometry, retrieved on 5 September 2026 from the Natural Earth vector repository:

[Original GeoJSON](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson)

[Natural Earth](https://www.naturalearthdata.com/) · [Public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/)

The generator intersects these polygons with 45–100° E / 12° S–28° N using Shapely, then uses the same polygons for model land masking and the frontend's bundled geographic geometry. Natural Earth coastlines are generalized; they are not survey-grade boundaries or bathymetry. No political boundaries are drawn.
