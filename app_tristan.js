/**
 * What has been done so far:
 * Node installed, postgis database made, called osm_db
 * 
 */



//imports
const express = require('express')
const bodyParser = require('body-parser')
const { Pool } = require('pg'); //he PostgreSQL client for Node.js

require('dotenv').config();

//setup
const app = express()
const port = 3000
const ipAddress = '0.0.0.0'

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'osm_db',
    password: 'pass',
    port: 5432,
  });

//middleware
app.use(bodyParser.json())
app.use(function(req, res, next) {
    console.log("================DEBUGGING REQUESTS================")
    console.log("\n\n___________QUERY___________")
    console.log(req.query)
    console.log("\n\n___________BODY___________")
    console.log(req.body)
    console.log("==================================================")
    res.setHeader("X-CSE356", process.env.HEADER)
    next()
});

app.get('/tiles/:layer/:v/:h.png', (req, res) => {
  const { layer, v, h } = req.params;

  worldMercMax = 20037508.3427892;
  worldMercMin = -1 * worldMercMax;
  worldMercSize = worldMercMax - worldMercMin;
  worldTileSize = 2 ** layer;
  tileMercSize = worldMercSize / worldTileSize;
  
  xmin = worldMercMin + tileMercSize * h;
  xmax = worldMercMin + tileMercSize * (h + 1);
  ymin = worldMercMax - tileMercSize * (v + 1);
  ymax = worldMercMax - tileMercSize * (v);

  const SQL = `
  WITH bounds AS (
    SELECT
      ST_TileEnvelope(zoom_level, tile_column, tile_row) AS geom
    FROM
      (
        SELECT
          ${layer} AS zoom_level,
          ${h} AS tile_column,
          ${v} AS tile_row
      ) AS tile
  )
  SELECT
    ST_AsMVT(q, 'layer_name', 4096, 'geom') AS mvt_tile
  FROM
    (
      SELECT
        ST_AsMVTGeom(
          ST_Transform(geom, 3857), -- Assuming your data is in EPSG:4326, you may need to adjust this
          bounds.geom,
          4096,
          256,
          true -- Clipping to the tile boundary
        ) AS geom
      FROM
        planet_osm_polygon,
        bounds
      WHERE
        ST_Intersects(geom, bounds.geom) -- Filter only geometries intersecting the tile bounds
    ) AS q;
  `;
  //res.send(`Requested map tile for layer ${layer}, v ${v}, h ${h}`);

  try {
    const tile = pool.query(SQL);
    console.log("got tile: ");
    console.log(tile);

    res.setHeader('Content-Type', 'application/x-protobuf');

    if (tile.st_asmvt.length === 0) {
      res.status(204);
    }

    res.send(tile.st_asmvt);
  } catch (e) {
    res.status(404).send({
      error: e.toString(),
    });
  }

});


/* Note the tables in our db are:
planet_osm_point
planet_osm_line
planet_osm_polygon
planet_osm_roads
*/
app.post('/api/search', async (req, res) => {
    const { bbox, onlyInBox, searchTerm } = req.body;
  
    let query = `
      SELECT name, ST_Y(ST_Centroid(way)) AS lat, ST_X(ST_Centroid(way)) AS lon,
      ST_YMin(bbox) AS minLat, ST_XMin(bbox) AS minLon, ST_YMax(bbox) AS maxLat, ST_XMax(bbox) AS maxLon
      FROM (
          SELECT name, way, 
          CASE 
              WHEN $1 = true THEN ST_Intersection(way, ST_MakeEnvelope($2, $3, $4, $5, 4326))
              ELSE way
          END AS bbox
          FROM planet_osm_point
          WHERE name ILIKE $6
          AND way && ST_MakeEnvelope($2, $3, $4, $5, 4326)
      ) AS subquery;
    `;
  
    try {
      const results = await pool.query(query, [
        onlyInBox,
        bbox.minLon,
        bbox.minLat,
        bbox.maxLon,
        bbox.maxLat,
        `%${searchTerm}%`,
      ]);
      res.json(results.rows.map(row => ({
        name: row.name,
        coordinates: { lat: row.lat, lon: row.lon },
        bbox: {
          minLat: row.minlat,
          minLon: row.minlon,
          maxLat: row.maxlat,
          maxLon: row.maxlon
        }
      })));
    } catch (error) {
      console.error('Error executing search query', error);
      res.status(500).send('Server error');
    }
  });
  
  

function secant(x) {return 1/Math.cos(x)}

// Convert Endpoint
app.post('/convert', (req, res) => {
    const { lat, long, zoom } = req.body;

    //https://gis.stackexchange.com/questions/133205/wmts-convert-geolocation-lat-long-to-tile-index-at-a-given-zoom-level
    let n = Math.pow(2, zoom)
    const xTile = n * Math.floor((long + 180) / 360);
    const yTile = n * Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + secant(lat * Math.PI / 180)) / Math.PI) / 2);
    res.json({ x_tile: xTile, y_tile: yTile });
  });
  

app.listen(port, ipAddress, () => {
    console.log(`App listening at http://localhost:${port}`)
});
