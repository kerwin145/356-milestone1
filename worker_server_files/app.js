//The appjs for posts that hit the DB
//npm i express body-parser pg

//imports 
const { Pool } = require('pg'); //he PostgreSQL client for Node.js
const express = require('express')
const bodyParser = require('body-parser')

//setup 
const app = express()
const port = 5431
const ipAddress = '0.0.0.0'

const pool = new Pool({
    user: 'renderer',
    host: '209.151.152.129',
    database: 'gis',
    password: 'renderer',
    port: 5432,
});

app.get('/api/search', async (req, res) => {
    //expect minlat, minlon, maxlat, maxlon to be parsed from app.js
    //eg: request(`${NGINX_URL}/postgis/api/search?minLat=${minLat}&minLon=${minLon}&maxLat=${maxLat}&maxLon=${maxLon}&onlyInBox=${onlyInBox}&searchTerm=${searchTerm}`)
    const { minLat, minLon, maxLat, maxLon, inBox, searchTerm } = req.query;

    const query = `
    WITH bbox AS (
      SELECT
        CAST($1 AS FLOAT8) AS min_lon,
        CAST($2 AS FLOAT8) AS min_lat,
        CAST($3 AS FLOAT8) AS max_lon,
        CAST($4 AS FLOAT8) AS max_lat
    )
    SELECT
      osm_id,
      name,
      ST_AsText(ST_Centroid(ST_Transform(way, 4326))) AS coordinates,
      ST_AsText(ST_MakeEnvelope(bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat, 4326)) AS bbox
    FROM
      (
        SELECT osm_id, name, way
        FROM planet_osm_polygon, bbox
        WHERE name ILIKE $5
          AND (
            $6 = false OR
            ST_Contains(ST_MakeEnvelope(bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat, 4326), ST_Transform(way, 4326))
          )
        UNION ALL
        SELECT osm_id, name, way
        FROM planet_osm_point, bbox
        WHERE name ILIKE $5
          AND (
            $6 = false OR
            ST_Contains(ST_MakeEnvelope(bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat, 4326), ST_Transform(way, 4326))
          )
        UNION ALL
        SELECT osm_id, name, way
        FROM planet_osm_line, bbox
        WHERE name ILIKE $5
          AND (
            $6 = false OR
            ST_Contains(ST_MakeEnvelope(bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat, 4326), ST_Transform(way, 4326))
          )
      ) AS combined_data, bbox;
  `;

    try {
        const result = await pool.query(query, [
        minLon,
        minLat,
        maxLon,
        maxLat,
        `%${searchTerm}%`,
        onlyInBox,
        ]);

        const responseData = result.rows.map(row => {
            // Extract latitude and longitude from coordinates
            const [lon, lat] = row.coordinates
            .replace('POINT(', '')
            .replace(')', '')
            .split(' ');
        
            // Map the fields to the specifications
            return {
            name: row.name,
            coordinates: { lat: parseFloat(lat), lon: parseFloat(lon) },
            bbox: {
                minLat: parseFloat(lat),
                minLon: parseFloat(lon),
                maxLat: parseFloat(lat),
                maxLon: parseFloat(lon)
            }
            };
        });
        res.json(responseData);
    } catch(err) {
        console.error('Error:', error);
        res.status(500).json({ error: 'An internal server on search worker server occurred' });
    }
})


app.get('/api/address', async (req, res) => {
    //eg request(`${NGINX_URL}/postgis/api/address?lat=${lat}&lon=${lon}`)
    const { lat, lon } = req.body;
    if (!lat || !lon) {
        return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }
    const query = `
    WITH closest_address AS (
      SELECT 
        "addr:housenumber",
        tags -> 'addr:street' AS street,
        tags -> 'addr:city' AS city,
        tags -> 'addr:state' AS state,
        ST_Distance(ST_Transform(way, 4326), ST_GeogFromText('POINT(${lon} ${lat})')) AS distance
      FROM 
        planet_osm_point
      WHERE 
        tags ? 'addr:street'
      AND 
        ST_DWithin(ST_Transform(way, 4326), ST_GeogFromText('POINT(${lon} ${lat})'), 1000)
      UNION ALL
      SELECT 
        "addr:housenumber",
        tags -> 'addr:street' AS street,
        tags -> 'addr:city' AS city,
        tags -> 'addr:state' AS state,
        ST_Distance(ST_Transform(way, 4326), ST_GeogFromText('POINT(${lon} ${lat})')) AS distance
      FROM 
        planet_osm_polygon
      WHERE 
        tags ? 'addr:street'
      AND 
        ST_DWithin(ST_Transform(way, 4326), ST_GeogFromText('POINT(${lon} ${lat})'), 1000)
    )
    SELECT 
      "addr:housenumber", street, city, state
    FROM 
      closest_address
    ORDER BY 
      distance
    LIMIT 1;
  `;

  try {
    const result = await pool.query(query);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No address found for the provided location.' });
    }

    const address = result.rows[0];
    res.json({
      number: address["addr:housenumber"] || 'N/A',
      street: address.street || 'N/A',
      city: address.city || 'N/A',
      state: address.state || 'N/A',
      country: 'USA'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
})

app.listen(port, ipAddress, () => {
    console.log(`App listening at http://localhost:${port}`)
});
