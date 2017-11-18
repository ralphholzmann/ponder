import Database from '../../lib/Database';

Error.stackTraceLimit = 40;
const TEST_DATABASE_NAME = '__ponder_tests__';

Database.config({
  db: TEST_DATABASE_NAME
});

export default Database;
export { TEST_DATABASE_NAME };
