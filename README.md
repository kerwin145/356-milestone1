i cri

# Setup

## setting up node
```
sudo apt-get update
sudo apt install nodejs
sudo apt install npm 

```

## Install packages
```npm install``

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
CREATE DATABASE ny_db;

#connect, create extension, and quit#
\c osm_db
CREATE EXTENSION postgis;
\q

##Import data
sudo apt install osm2pgsql
osm2pgsql -d ny_db -H localhost new-york.osm.pbf

```
