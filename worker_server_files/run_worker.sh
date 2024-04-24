#docker run --name worker_container -e THREADS=8 -e "OSM2PGSQL_EXTRA_ARGS=-C 4096" -p 8080:80 -p 5432:5432 -p 1234:1234 -v osm-data:/data/database/ -d worker run
docker run --name tile_container -e THREADS=8 -e "OSM2PGSQL_EXTRA_ARGS=-C 4096" -p 8080:80 -p 5432:5432 -p 1234:1234 -v osm-data:/data/database/ -d overv/openstreetmap-tile-server run
