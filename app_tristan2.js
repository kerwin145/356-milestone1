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
const port = 81
const ipAddress = '0.0.0.0'
const NGINX_URL = 'http://localhost:80'
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

const memcached = new Memcached('localhost:11211');

//middleware
app.use(bodyParser.json())

app.use(session({
  secret: 'mm_supersecretkey', 
  resave: false,
  saveUninitialized: true
}));


//TODO: Remove this middleware when testing as logging can really slow things down
app.use(function(req, res, next) {
  console.log("================DEBUGGING REQUESTS================")
  console.log("\n\n___________QUERY___________")
  console.log(req.query)
  console.log("\n\n___________BODY___________")
  console.log(req.body)
  console.log("==================================================")
  res.setHeader("x-CSE356", process.env.HEADER);
  next();
});

function cacheMiddleware(req, res, next) {
  const key = `${req.originalUrl}`;
  memcached.get(key, function (err, data) {
      if (data) {
          // console.log('Cache hit for:', key);
          res.send(data);
      } else {
          res.sendResponse = res.send;
          res.send = (body) => {
              memcached.set(key, body, 120, (err) => {  // Cache for 60 seconds
                  if(err) console.error(err);
              });
              res.sendResponse(body);
          };
          next();
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

app.get('/tiles/:layer/:v/:h.png', cacheMiddleware, (req, res) => {
  console.log("tiles")
  const { layer, v, h } = req.params;
  // res.contentType('image/png');
  request(`http://209.151.152.129:8080/tile/${layer}/${v}/${h}.png`).pipe(res);
  //res.send(`Requested map tile for layer ${layer}, v ${v}, h ${h}`);
});

app.get('/turn/:TL/:BR.png', cacheMiddleware, (req, res) => {
  console.log("turn")
  //const { layer, v, h } = req.params;
  const { TL, BR } = req.params;
  const tlsplit = TL.split(',');
  const brsplit = BR.split(',');
  console.log("tlsplit: " + tlsplit);
  console.log("brsplit: " + brsplit);
  const minlong = parseFloat(tlsplit[1]);
  const maxlat = parseFloat(tlsplit[0]);
  const maxlong = parseFloat(brsplit[1]);
  const minlat = parseFloat(brsplit[0]);
  console.log(`minlong ${minlong} maxlong ${maxlong} minlat ${minlat} maxlat ${maxlat}`);
  res.contentType('image/png');
  request(`http://209.151.152.129:1234/?minlong=${minlong}&minlat=${minlat}&maxlong=${maxlong}&maxlat=${maxlat}`).pipe(res);
});

//uses cache
app.post('/api/search', cacheMiddleware, async (req, res) => {
  try {
    const { minLat, minLon, maxLat, maxLon } = req.body.bbox;
    const onlyInBox = req.body.onlyInBox;
    const searchTerm = req.body.searchTerm;

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
   
      `; 
 // ORDER BY
    //   ST_Distance(ST_Transform(way, 4326), ST_Centroid(ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326))) ASC;
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

// Convert Endpoint
app.post('/convert', cacheMiddleware, (req, res) => {
  const { lat, long, zoom } = req.body;
  
  // Calculate tile indices
  const x_tile = Math.floor((long + 180) / 360 * Math.pow(2, zoom));
  const y_tile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));

  // Send response
  res.json({ x_tile, y_tile });
});

app.post('/api/route', cacheMiddleware, async (req, res) => {
  try {
    const username = await redisGet(`session:${req.sessionID}`);
    if (!username) {
      return res.status(401).json({ error: 'Unauthorized. Please login first.' });
    }

    const { source, destination } = req.body;

    if (!source || !destination || !source.lat || !source.lon || !destination.lat || !destination.lon) {
      return res.status(400).json({ error: 'Invalid request. Missing source or destination coordinates.' });
    }

    const url = `http://209.151.152.129:5000/route/v1/driving/${source.lon},${source.lat};${destination.lon},${destination.lat}?steps=true`;

    request(url, { json: true }, (error, response, body) => {
      if (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: 'An error occurred while fetching the route.' });
      }

      if (response.statusCode !== 200) {
        console.error('OSRM API Error:', body);
        return res.status(500).json({ error: 'An error occurred while fetching the route.' });
      }

      console.log(JSON.stringify(body.routes[0].legs[0].steps, null, 2));

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
      // res.setHeader('Content-Type', 'application/json');
      // res.status(200).send(JSON.stringify(formattedSteps));

      res.json(formattedSteps);
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});
/*
app.post('/api/address', cacheMiddleware, async(req, res) => {
  try {
    const { lat, lon } = req.body;

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Latitude and longitude are required.' });
    }

    const query = `
      SELECT "addr:housenumber", tags -> ARRAY['addr:street','addr:city','addr:state'] 
      FROM planet_osm_point 
      WHERE tags ? 'addr:street' 
      AND ST_DWithin(ST_TRANSFORM(way, 4326), 'POINT(long lat)'::geography, 100)
      ORDER BY ST_TRANSFORM(way, 4326) <-> 'POINT(long lat)'::geography
      LIMIT 1;
    `;

    const queryParams = [lon, lat]
    const { rows } = await pool.query(query, queryParams);

    if (rows.length > 0) {
      const { "addr:housenumber": houseNumber, tags } rows[0];
      const [street, city, stage] = tags;

      res.json({ houseNumber, street, city, state });
    }
    else {
      res.status(404).json({ error: 'No address found near the specified coordinates.' })
    } 
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});
*/
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
});

app.listen(port, ipAddress, () => {
    console.log(`App listening at http://localhost:${port}`)
});
