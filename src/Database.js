const r = require('rethinkdb');

const DEFAULT_RETHINKDB_PORT = 28015;
const DEFAULT_RETHINKDB_DB = 'test';
const isTesting = process.env.NODE_ENV === 'test';

class Database {
  static async config({ host, port, db }) {
    this.host = host || 'localhost';
    this.port = port || DEFAULT_RETHINKDB_PORT;
    this.db = db || DEFAULT_RETHINKDB_DB;
    return this;
  }

  static async connect() {
    if (this.connection === undefined) {
      const { host, port, db } = this;
      this.connection = await r.connect({ host, port, db });
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
  }
}

Database.models = [];

module.exports = Database;
