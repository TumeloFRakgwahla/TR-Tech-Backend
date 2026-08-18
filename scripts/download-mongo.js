const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  console.log('Pre-downloading MongoDB binary...');
  const mongod = await MongoMemoryServer.create();
  console.log('MongoDB binary downloaded and ready.');
  await mongod.stop();
  console.log('Done.');
})();
