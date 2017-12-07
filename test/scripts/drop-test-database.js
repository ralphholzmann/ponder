import r from 'rethinkdb';
import { TEST_DATABASE_NAME } from '../lib/database';

(async function() {
  const connection = await r.connect();
  try {
    await r.dbDrop(TEST_DATABASE_NAME).run(connection);
  } catch (error) {}
  await connection.close();
})();
