var mapnik = require('mapnik');
var fs = require('fs');

const express = require('express')
const app = express()
const port = 1234

// register fonts and datasource plugins
mapnik.register_default_fonts();
mapnik.register_default_input_plugins();

app.get('/', (req, res) => {
        const minlongm = req.query.minlong
        const maxlongm = req.query.maxlong
        const minlatm = req.query.minlat
        const maxlatm = req.query.maxlat
        const projectedmin = proj4('EPSG:4326','EPSG:3857',[parseInt(minlongm),parseInt(minlatm)]);
        const projectedmax = proj4('EPSG:4326','EPSG:3857',[parseInt(maxlongm),parseInt(maxlatm)]);
        console.log("projected min: " + projectedmin + " projected max: " + projectedmax);
        var map = new mapnik.Map(256, 256);
        map.load('/data/style/mapnik.xml', function(err,map) {
            if (err) throw err;
            map.zoomToBox(projectedmin[0],projectedmin[1],projectedmax[0],projectedmax[1]);
            var im = new mapnik.Image(256, 256);
            map.render(im, function(err,im) {
                if (err) throw err;
                im.encode('png', function(err,buffer) {
                    if (err) throw err;
                    /*fs.writeFile('map.png',buffer, function(err) {
                    if (err) throw err;
                    console.log('saved map image to map.png');
                    });*/
                    res.type('image/png');
                    res.send(buffer);
                });
            });
        });
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
