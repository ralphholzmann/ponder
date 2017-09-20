const r = require('rethinkdb');

const DEFAULT_RETHINKDB_HOST = 'localhost';
const DEFAULT_RETHINKDB_PORT = 28015;
const DEFAULT_RETHINKDB_DB = 'test';
const DEFAULT_RETHINKDB_USER = 'admin';
const DEFAULT_RETHINKDB_PASSWORD = '';
const isTesting = process.env.NODE_ENV === 'test';

class Database {
  static config({ host, port, db, user, password }) {
    this.host = host || DEFAULT_RETHINKDB_HOST;
    this.port = port || DEFAULT_RETHINKDB_PORT;
    this.db = db || DEFAULT_RETHINKDB_DB;
    this.user = user || DEFAULT_RETHINKDB_USER;
    this.password = password || DEFAULT_RETHINKDB_PASSWORD;
    return this;
  }

  static async connect() {
    if (this.connection === undefined) {
      const { host, port, db, user, password } = this;
      this.connection = await r.connect({ host, port, db, user, password });
      await this.setup();
    }
    return this.connection;
  }

  static async execute(query) {
    const connection = await this.connect();
    return query.run(connection);
  }

  static async disconnect() {
    const connection = await this.connect();
    await connection.close();
    this.connection = null;
  }

  static register(Model) {
    this.models.push(Model);
  }

  static async ensureDatabase() {
    const list = await this.execute(r.dbList());
    if (!list.includes(this.db)) {
      await this.execute(r.dbCreate(this.db));
    }
  }

  static async setup() {
    await this.ensureDatabase();
    const tableList = await this.execute(r.db(this.db).tableList());
    await Promise.all(this.models.map(Model => Model.setup(tableList)));
  }

  static async teardown() {
    if (isTesting) {
      await this.execute(r.dbDrop(this.db));
    }
    await this.disconnect();
  }
}

Database.models = [];

module.exports = Database;
