/**
 * What has been done so far:
 * Node installed, postgis database made, called osm_db (instead of ny_db)
 * 
 */



//imports
const express = require('express')
const bodyParser = require('body-parser')
const { Pool } = require('pg'); //he PostgreSQL client for Node.js

require('dotenv').config();

//setup
const app = express()
const port = 80
const ipAddress = '0.0.0.0'

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

    res.send(`Requested map tile for layer ${layer}, v ${v}, h ${h}`);
});

app.post('/api/search', (req, res) => {
    const { bbox, onlyInBox, searchTerm } = req.body;

    /*
    Request Body (JSON):
    {
    "bbox": {
        "minLat": number,
        "minLon": number,
        "maxLat": number,
        "maxLon": number
    },
    "onlyInBox": boolean,
    "searchTerm": string
    }
    */

    const searchResult = []; 
    res.json(searchResult);
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