i cri

# Setup

## setting up node
```
sudo apt-get update
sudo apt install nodejs
sudo apt install npm 

```

## Install packages
```npm install```

## Download pfb map data file
```wget https://grading.cse356.compas.cs.stonybrook.edu/data/new-york.osm.pbf ```

## Installing PostgreSQL and PostGIS, and importing data
```
#installing PostgreSQL#
sudo apt install postgresql postgresql-contrib postgis

#switch to postgres user#
sudo -i -u postgres
#start PostgreSQL CLI and create db
psql
CREATE DATABASE osm_db;

#connect, create extension, and quit#
\c osm_db
CREATE EXTENSION postgis;
\q

##Import data
#Note, installing osm2pgsql may need postgres password, so we have to change the postgres pg_hba.conf in etc/postgresql/14 to trust local
sudo apt install osm2pgsql
osm2pgsql -d osm_db -H 209.94.57.33 new-york.osm.pbf

```

## More up 
To allow connections to this server in the future (if we wish to scale out), we need to modify the postgresql.conf with the following changes:
```listen_addresses = '*'```
We also need to again, modify pg_hba.conf to allow remote connections with:
```host    all             all             0.0.0.0/0            md5```
