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
