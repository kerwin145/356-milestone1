//imports
const redis = require('redis');
const express = require('express')
const bodyParser = require('body-parser')
const { Pool } = require('pg'); //he PostgreSQL client for Node.js
const path = require('path');
const request = require('request');
const nodemailer = require('nodemailer')


require('dotenv').config();

//setup
const app = express()
const port = 80
const ipAddress = '0.0.0.0'
const redisClient = redis.createClient({
  host: 'localhost',
  port: 6379
});

// const pool = new Pool({
//     user: 'postgres',
//     host: '209.94.58.52',
//     database: 'osm_db',
//     password: 'pass',
//     port: 5432,
//   });

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

//middleware
app.use(bodyParser.json())

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
 
app.use(express.static(path.join(__dirname, 'frontend/build')));

app.get('/tiles/:layer/:v/:h.png', (req, res) => {
    const { layer, v, h } = req.params;
    request(`http://209.151.152.129:8080/tile/${layer}/${v}/${h}.png`).pipe(res);
    //res.send(`Requested map tile for layer ${layer}, v ${v}, h ${h}`);
});


app.post('/api/adduser', async (req, res) => {
  let {username, password, email} = req.body

  if(!username || !password || !email){
      return res.json({msg: "Request body doesn't have necessary information", status: "ERROR"})
  }
 
  const encodedEmail = encodeURIComponent(email)
  let key = "some_super_random_and_totally_secret_key"
  let verificationLink = `http://${process.env.HOST}/verify?email=${encodedEmail}&key=${key}`

  const mailOptions = {
      from: 'Hello World <test@cse356.compas.cs.stonybrook.edu.com>',
      to: email, // Recipient's email
      subject: 'Registration Confirmation',
      text: `Hello ${username}. You email has been created and requires activation. please click this link: ${verificationLink} to activate your email. If this was not done by you, you can safely ignore this email. `,
  };

  try {
      await transporter.sendMail(mailOptions)
      const userExists = await redisClient.exists(`email:${email}`);
      if (userExists) {
        return res.json({ msg: "User already exists but okay", status: 'HMMMMM user already exists' });
      }
    
      // Store user data in Redis
      redisClient.hSet(`email:${email}`, 'password', password, 'user', username, 'verified', false, 'verificationKey', key);   

      return res.json({msg: 'User registered and email sent', status: "OK"})
  } catch (err) {
      console.error(err);
      return res.json({msg: 'Error sending email', status: "HMM"})
  }    
})

app.get('/api/verify', async (req, res) => {
  const { email, key } = req.query;
  if(!email || !key){
    return res.json({msg: "Not enough parameters", status: "ERROR"})
}
  console.log("verify: " + email + ", " + key);
  const userExists = await redisClient.exists(`email:${email}`);
  if(!userExists){
    return res.json({ msg: "User doesn't exist", status: 'HMMMMM user doesn\'t exist' });
  }

  const userData = await redisClient.hGetAll(`${email}`)

  if(key != userData.verificationKey){
    return res.json({msg: "Incorrect verification key", status: "ERROR"})
  }

  await redisClient.hSet(`email${email}`, 'verified', true)

  return res.status(403).json({msg: "Key incorrect", status: "ERROR"})
})

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  // Retrieve user data from Redis
  const userData = await redisClient.hGetAll(`user:${username}`);
  if(!(userData && userData.verified)){
    res.status(401).json({ error: 'NOT VERIFIED HMMMMMMM', status: "OK"});
  }
  if (userData && userData.password === password) {
    // Set session data in Redis
    await redisClient.set(`session:${req.sessionID}`, username);
    res.json({ status: 'ok' });
  } else {
    res.status(401).json({ error: 'Invalid username or password' });
  }
});

app.post('/api/logout', async (req, res) => {
  try{
    await client.del(`session:${req.sessionID}`);
    res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    return res.json({msg: 'Error loggin out', status: "log out HMM"})
  }
});

app.get('/api/user', async (req, res) => {
  const username = await client.get(`session:${req.sessionID}`);
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
app.post('/api/search', async (req, res) => {
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
    ORDER BY
      ST_Distance(ST_Transform(way, 4326), ST_Centroid(ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326))) ASC;
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

// Convert Endpoint
app.post('/convert', (req, res) => {
  const { lat, long, zoom } = req.body;
  
  // Calculate tile indices
  const x_tile = Math.floor((long + 180) / 360 * Math.pow(2, zoom));
  const y_tile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));

  // Send response
  res.json({ x_tile, y_tile });
});

app.post('/api/route', async (req, res) => {
  const { source, destination } = req.body;

  const username = await redisClient.get(`session:${req.sessionID}`);
  if (!username) {
      return res.status(401).json({ error: 'User not logged in' });
  }

  

})

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
});

app.listen(port, ipAddress, () => {
    console.log(`App listening at http://localhost:${port}`)
});
