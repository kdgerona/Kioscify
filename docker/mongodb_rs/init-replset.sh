#!/bin/bash
set -e

mongod --port "$MONGO_REPLICA_PORT" --replSet rs0 --bind_ip 0.0.0.0 &
MONGOD_PID=$!

echo "Waiting for mongod to be ready..."
until mongosh --port "$MONGO_REPLICA_PORT" --eval "db.adminCommand('ping')" --quiet 2>/dev/null; do
  sleep 1
done

echo "Initializing replica set..."
mongosh admin --port "$MONGO_REPLICA_PORT" --eval "
  try {
    rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: '$MONGO_REPLICA_HOST:$MONGO_REPLICA_PORT' }] });
    print('Replica set initiated.');
  } catch(e) {
    if (e.codeName === 'AlreadyInitialized') {
      print('Replica set already initialized.');
    } else {
      throw e;
    }
  }
" --quiet

echo "Waiting for primary election..."
until mongosh admin --port "$MONGO_REPLICA_PORT" --eval "rs.isMaster().ismaster" --quiet 2>/dev/null | grep -q "true"; do
  sleep 1
done

echo "Creating root user if not exists..."
mongosh admin --port "$MONGO_REPLICA_PORT" --eval "
  if (!db.getUser('$MONGO_INITDB_ROOT_USERNAME')) {
    db.createUser({
      user: '$MONGO_INITDB_ROOT_USERNAME',
      pwd: '$MONGO_INITDB_ROOT_PASSWORD',
      roles: ['root']
    });
    print('Root user created.');
  } else {
    print('Root user already exists.');
  }
" --quiet

echo "REPLICA SET ONLINE"
wait "$MONGOD_PID"
