FROM osrm/osrm-backend

COPY us-northeast.osm.pbf /data/us-northeast.osm.pbf

RUN osrm-extract -p /opt/car.lua /data/us-northeast.osm.pbf
RUN osrm-partition /data/us-northeast.osrm
RUN osrm-customize /data/us-northeast.osrm

EXPOSE 5000

CMD ["osrm-routed", "--algorithm", "mld", "/data/us-northeast.osrm"]
