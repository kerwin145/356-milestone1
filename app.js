/**
 * If server is restarted, run these commands:
 * 
    ip6tables -I OUTPUT -p tcp -m tcp --dport 25 -j DROP
    iptables -t nat -I OUTPUT -o eth0 -p tcp -m tcp --dport 25 -j DNAT --to-destination 130.245.171.151:11587
 */

//imports
const redis = require('redis');
const express = require('express')
const session = require('express-session');
const bodyParser = require('body-parser')
const { Pool } = require('pg'); //he PostgreSQL client for Node.js
const path = require('path');
const request = require('request');
const nodemailer = require('nodemailer')
const Memcached = require('memcached');
const { promisify } = require('util');
require('dotenv').config();
//setup
const app = express()
const port = 80
const ipAddress = '0.0.0.0'
const NGINX_URL = 'http://localhost:8080'
const redisClient = redis.createClient({
  host: 'localhost',  
  port: 6379,         
  password: 'redispass12345689987654321qwertyuiop'
})

const redisGet = promisify(redisClient.get).bind(redisClient);
const redisSet = promisify(redisClient.set).bind(redisClient);
const redisDel = promisify(redisClient.del).bind(redisClient);
const redisHGet= promisify(redisClient.hmget).bind(redisClient);
const redisHSet = promisify(redisClient.hset).bind(redisClient);
const redisExists = promisify(redisClient.exists).bind(redisClient);

const pool = new Pool({
    user: 'renderer',
    host: '209.151.152.129',
    database: 'gis',
    password: 'renderer',
    port: 5432,
  });

const transporter = nodemailer.createTransport({
    // host: `${process.env.HOST}`,
    host: "localhost",
    port: 25,
    secure: false, 
    tls: {
        rejectUnauthorized: false
    }
});

const memcached = new Memcached('127.0.0.1:11211');

//middleware
app.use(bodyParser.json())

app.use(session({
  secret: 'mm_supersecretkey', 
  resave: false,
  saveUninitialized: true
}));

// //TODO: Remove this middleware when testing as logging can really slow things down
 app.use(function(req, res, next) {
//   console.log("================DEBUGGING REQUESTS================")
//   console.log("\n\n__________URL_____________")
      //  console.log("\n\n" + req.protocol + '://' + req.get('host') + req.originalUrl)
//   console.log("\n\n___________QUERY___________")
//   console.log(req.query)
//   console.log("\n\n___________BODY___________")
//   console.log(req.body)
//   console.log("==================================================")
   res.setHeader("x-CSE356", process.env.HEADER);
   next();
 });

function cacheMiddleware(req, res, next) {
  const key = req.originalUrl;

  memcached.get(key, function (err, data) {
    if (err) {
      console.error(err);
      return res.status(500).send('Internal Server Error');
    }

    if (data) {
      // console.log('Cache hit for:', key);
      res.contentType('image/png').send(data);
    } else {
      // console.log('Cache miss for:', key);
      next(); // Continue to the next middleware
    }
  });
}

app.use(express.static(path.join(__dirname, 'frontend/build')));

app.post('/api/adduser', async (req, res) => {
  console.log("adduser")
  const { username, password, email } = req.body;
  console.log(req.body)

  // for testing ONLY
  // await redisDel(`email:${email}`)
  // await redisDel(`username:${username}`, email)

  if (!username || !password || !email) {
    return res.json({ msg: "Request body doesn't have necessary information", status: "err" });
  }

  const encodedEmail = encodeURIComponent(email);
  const key = "some_super_random_and_totally_secret_key";
  const verificationLink = `http://${process.env.HOST}/api/verify?email=${encodedEmail}&key=${key}`;

  const mailOptions = {
    from: 'Hello World <test@cse356.compas.cs.stonybrook.edu.com>',
    to: email, // Recipient's email
    subject: 'Registration Confirmation',
    text: `Hello ${username}. You email has been created and requires activation. please click this link: ${verificationLink} to activate your email. If this was not done by you, you can safely ignore this email. `,
  };

  try {
    const userEmailExists = await redisExists(`email:${email}`);
    const userUsernameExists = await redisExists(`username:${username}`);
    if (userEmailExists || userUsernameExists) {
      return res.status(200).json({ msg: "User already exists", status: 'err' });
    }

    // Send email
    await transporter.sendMail(mailOptions);

    // Store user data in Redis
    await redisHSet(`email:${email}`, 'password', password, 'user', username, 'verified', false, 'verificationKey', key);
    // Map username to email
    await redisSet(`username:${username}`, email);

    return res.json({ msg: 'User registered and email sent', status: "OK" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: 'Error sending email', status: "ERROR", err });
  }    
});

app.get('/api/verify', async (req, res) => {
  console.log("verify")
  const { email, key } = req.query;
  console.log(req.body)
  if(!email || !key){
    return res.json({msg: "Not enough parameters", status: "ERROR"})
  }
  console.log("verify: " + email + ", " + key);
  const userExists = await redisExists(`email:${email}`);
  if(!userExists){
    return res.status(400).json({ msg: "User doesn't exist", status: 'HMMMMM user doesn\'t exist' });
  }

  //could also check to prevent redundant verifications but whatever
  
  const verifKey = await redisHGet(`email:${email}`, "verificationKey")
  console.log(`Correct key: ${verifKey}, entered key: ${key}, match? ${verifKey == key}`)
  if(!verifKey || verifKey != key){
    return res.status(200).json({msg: "Incorrect verification key", status: "ERROR"})
  }

  await redisHSet(`email:${email}`, 'verified', true)
  return res.json({msg: "Verified", status: "OK"})
})

app.post('/api/login', async (req, res) => {
  console.log("login")
  const { username, password } = req.body;
  console.log(req.body)
  // Retrieve user data from Redis
  const chkEmail = await redisGet(`username:${username}`)
  console.log(chkEmail)
  if(!chkEmail){
    return res.status(200).json({error: "NOT EXIST?", status: "err"})
  }

  const [chkpass, verified] = await redisHGet(`email:${chkEmail}`, "password", "verified"); 
  if(verified === "false"){
    return res.status(200).json({ error: 'NOT VERIFIED HMMMMMMM', status: "err"});
  }
  if (chkpass != password) {
    return res.status(200).json({ error: 'Invalid username or password' , status: "err"});
  } 

  await redisSet(`session:${req.sessionID}`, username);
  res.json({ status: 'ok' });
});

app.post('/api/logout', async (req, res) => {
  console.log("logout")
  try{
    await redisDel(`session:${req.sessionID}`);
    res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({msg: 'Error loggin out', status: "log out HMM"})
  }
});

app.post('/api/user', async (req, res) => {
  console.log("user")
  const username = await redisGet(`session:${req.sessionID}`);
  if(username){
    return res.json({ loggedin: true, username });
  }else{
    return res.json({loggedin: false})
  }
});

/* Note the tables in our db are:
planet_osm_point
planet_osm_line
planet_osm_polygon
planet_osm_roads
*/
function handleImageResponseAndCache(response, key, res) {
  if (response.statusCode === 200) {
    const chunks = [];
    response.on('data', (chunk) => {
      chunks.push(chunk);
    });
    response.on('end', () => {
      const imageData = Buffer.concat(chunks);
      memcached.set(key, imageData, 6000, (err) => {  // Cache for 6000 seconds
        if (err) console.error(err);
      });
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(imageData);
    });
  } else {
    res.status(response.statusCode).send(response.statusMessage);
  }
}

app.get('/tiles/:layer/:v/:h.png', cacheMiddleware, (req, res) => {
  // console.log("TILE ROUTE")
  const { layer, v, h } = req.params;
  const key = `/tiles/${layer}/${v}/${h}.png`;

  const url = `${NGINX_URL}/tile/${layer}/${v}/${h}.png`;
  request(url)
    .on('response', (response) => {
      handleImageResponseAndCache(response, key, res);
  })
  // request(`${NGINX_URL}/tile/${layer}/${v}/${h}.png`).pipe(res);
})

app.get('/turn/:TL/:BR.png', cacheMiddleware, async (req, res) => {
  const { TL, BR } = req.params;
  const tlsplit = TL.split(',');
  const brsplit = BR.split(',');
  // console.log("tlsplit: " + tlsplit);
  // console.log("brsplit: " + brsplit);
  const minlong = parseFloat(tlsplit[1]);
  const maxlat = parseFloat(tlsplit[0]);
  const maxlong = parseFloat(brsplit[1]);
  const minlat = parseFloat(brsplit[0]);
  console.log(`minlong ${minlong} maxlong ${maxlong} minlat ${minlat} maxlat ${maxlat}`);
  const key = `/turn/${minlong}_${maxlat}_${maxlong}_${minlat}.png`;

  /*request(`${NGINX_URL}/turn/?minlong=${minlong}&minlat=${minlat}&maxlong=${maxlong}&maxlat=${maxlat}`)
    .on('response', (response) => {
      handleImageResponseAndCache(response, key, res);
  });*/
  request(`http://209.151.152.129:1234?minlong=${minlong}&minlat=${minlat}&maxlong=${maxlong}&maxlat=${maxlat}`).pipe(res);

}); 
app.post('/api/route', async (req, res) => {
  try {
    const { source, destination } = req.body;

    if (!source || !destination || !source.lat || !source.lon || !destination.lat || !destination.lon) {
      return res.status(400).json({ error: 'Invalid request. Missing source or destination coordinates.' });
    }

    const cacheKey = `/api/route/${source.lat}_${source.lon}_${destination.lat}_${destination.lon}`;
    memcached.get(cacheKey, function (err, data) {

      if (data) {
        res.json(data);
      } else {
        const url = `http://209.151.152.129:5000/route/v1/driving/${source.lon},${source.lat};${destination.lon},${destination.lat}?steps=true`;
        //TODO: replace above with below when load balancing is done
        // const url = `${NGINX_URL}/route/v1/driving/${source.lon},${source.lat};${destination.lon},${destination.lat}?steps=true`;
        request(url, { json: true }, (error, response, body) => {
          if (error) {
            console.error('Error:', error);
            return res.status(500).json({ error: 'An error occurred while fetching the route.' });
          }

          if (response.statusCode !== 200) {
            console.error('OSRM API Error:', body);
            return res.status(500).json({ error: 'An error occurred while fetching the route.' });
          }

          const route = body.routes[0];
          const steps = route.legs[0].steps;
          const formattedSteps = steps.map((step) => {

            let description = step.name ? `On ${step.name}` : 'Continue';

            if (step.maneuver) {
              switch (step.maneuver.type) {
                case 'merge':
                  description += ` and merge ${step.maneuver.modifier}`;
                  break;
                case 'off ramp':
                  description += ` and take the off-ramp ${step.maneuver.modifier}`;
                  break;
                case 'fork':
                  description += ` and take the fork ${step.maneuver.modifier}`;
                  break;
                case 'turn':
                  description += ` and turn ${step.maneuver.modifier}`;
                  break;
                case 'new name':
                  description += ` and continue onto ${step.name}`;
                  break;
                default:
                  description += ` and continue ${step.maneuver.modifier}`;
              }
            }
            if (step.exits) {
              description += ` towards exit ${step.exits}`;
            }

            return {
              description,
              coordinates: {
                lat: step.maneuver.location[1],
                lon: step.maneuver.location[0],
              },
              distance: step.distance,
            };
          });

          // Cache the response
          memcached.set(cacheKey, formattedSteps, 6000, (err) => {  // Cache for 100 minutes
            if(err) console.error('Memcached Error:', err);
          });

          res.json(formattedSteps);
        });
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});


// Convert Endpoint
app.post('/convert', (req, res) => {
  const { lat, long, zoom } = req.body;
  
  // Calculate tile indices
  const x_tile = Math.floor((long + 180) / 360 * Math.pow(2, zoom));
  const y_tile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));

  // Send response
  res.json({ x_tile, y_tile });
});

//TODO: MOVE TO WORKER SERVER
app.post('/api/search', async (req, res) => {
  try {
    const { minLat, minLon, maxLat, maxLon } = req.body.bbox;
    const onlyInBox = req.body.onlyInBox;
    const searchTerm = req.body.searchTerm;

    /*const query = `
  SELECT 
    (tags -> 'addr:housenumber') AS number,
    (tags -> 'addr:street') AS street,
    (tags -> 'addr:city') AS city,
    (tags -> 'addr:state') AS state,
    (tags -> 'addr:country') AS country
  FROM 
    planet_osm_polygon
  WHERE 
    tags ? 'addr:street'
    AND ST_DWithin(ST_Transform(way, 4326), ST_SetSRID(ST_Point($1, $2), 4326), 1000)
  ORDER BY 
    ST_Transform(way, 4326) <-> ST_SetSRID(ST_Point($1, $2), 4326)
  LIMIT 1;
`;*/

  /*const query = `
    WITH bbox AS (
      SELECT
        CAST($1 AS FLOAT8) AS min_lon,
        CAST($2 AS FLOAT8) AS min_lat,
        CAST($3 AS FLOAT8) AS max_lon,
        CAST($4 AS FLOAT8) AS max_lat
    )
    SELECT osm_id,
      name,
      ST_AsText(ST_Centroid(ST_Transform(ST_Intersection(ST_TRANSFORM(way, 4326), ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)), 4326))) AS coordinates,
      ST_AsText(ST_Transform(ST_Envelope(ST_Intersection(ST_TRANSFORM(way, 4326), ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326))), 4326)) AS bbox
    FROM
      planet_osm_point,
      bbox
    WHERE
      ST_Transform(way, 4326) && ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
      AND ST_Intersects(ST_TRANSFORM(way, 4326), ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326))
      AND name ILIKE $5
      AND (
        $6 = false OR
        ST_Contains(ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326), ST_Transform(way, 4326))
      )

      `;*/
    /*const query = `
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
      CASE WHEN $6 = true THEN
          ST_AsText(ST_Centroid(ST_Intersection(ST_TRANSFORM(way, 4326), ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326))))
        ELSE ST_AsText(ST_Centroid(ST_Transform(way, 4326)))
      END AS coordinates,
      CASE WHEN $6 = true THEN
          ST_AsText(ST_Envelope(ST_Intersection(ST_TRANSFORM(way, 4326), ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326))))
        ELSE ST_AsText(ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326))
      END AS bbox
    FROM
      planet_osm_polygon,
      bbox
    WHERE
      name ILIKE $5
      AND (
        $6 = false OR
        ST_Contains(ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326), ST_Transform(way, 4326))
    )
  `;*/
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
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});



app.post('/api/address', async (req, res) => {
  console.log("Fetching address")
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
});



// TODO: uncomment this when things are finished implementing
// app.post('/api/search', async (req, res) => {
//   request(`${NGINX_URL}/postgis/api/search`).pipe(res);
// })

// app.post('/api/address', async (req, res) => {
//   request(`${NGINX_URL}/postgis/api/address`).pipe(res);
// })


app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
});

app.listen(port, ipAddress, () => {
    console.log(`App listening at http://localhost:${port}`)
});
