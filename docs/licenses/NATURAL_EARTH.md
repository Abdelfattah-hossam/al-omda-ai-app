# Natural Earth map data

The bundled `src/lib/world-countries.json` in the app is derived from Natural
Earth v5.1.1 1:110m country geometry and English/Arabic names. Antarctica is
omitted; coordinates are projected to an equirectangular SVG view and rounded
to two decimals. Boundaries are generalized, not a legal boundary statement.
No external map service is called at runtime.

Source: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.1/geojson/ne_110m_admin_0_countries.geojson

Terms: https://www.naturalearthdata.com/about/terms-of-use/

Natural Earth data is public domain, including commercial use and changes.
