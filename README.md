# SETUP
In case in the future, we need to scale out

# Tile server and post gis
There is a docker image
```docker run -p 8080:80 -p 5432:5432 -v osm-data:/data/database/ -d overv/openstreetmap-tile-server run```

# Setting up node
sudo apt-get update
sudo apt install -y nodejs
sudo apt install -y npm 

# Redis 
This is for user account data storage 

sudo apt install -y redis-server
sudo sed -i "s/# requirepass foobared/requirepass 'redis_pass'/" /etc/redis/redis.conf

# Setup a postfix server for mail

Made in collaboration with Tristan Lonsway and Devin Lin

<!-- 
Download steps is taken from the install website:
curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/redis.list
sudo apt-get update
sudo apt-get install redis -->
