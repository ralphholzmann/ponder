/* @flow */
import r from 'rethinkdb';
import { forEachAsync } from './util';

const DEFAULT_RETHINKDB_HOST = 'localhost';
const DEFAULT_RETHINKDB_PORT = 28015;
const DEFAULT_RETHINKDB_DB = 'test';
const DEFAULT_RETHINKDB_USER = 'admin';
const DEFAULT_RETHINKDB_PASSWORD = '';
const isTesting = process.env.NODE_ENV === 'test';
const NAMESPACES = {};

type config = {
  host: string,
  port: number,
  db: string,
  user: string,
  password: string
};

class Database {
  host: string;
  port: number;
  db: string;
  user: string;
  password: string;
  connection: {};

  constructor({ host, port, db, user, password }: config) {
    this.host = host || DEFAULT_RETHINKDB_HOST;
    this.port = port || DEFAULT_RETHINKDB_PORT;
    this.db = db || DEFAULT_RETHINKDB_DB;
    this.user = user || DEFAULT_RETHINKDB_USER;
    this.password = password || DEFAULT_RETHINKDB_PASSWORD;
  }

  async connect(): Promise<void> {
    if (this.connection === undefined) {
      const { host, port, db, user, password } = this;
      this.connection = await r.connect({ host, port, db, user, password });
      await this.setup();
    }
    return this.connection;
  }

  async setup() {
    if (isTesting) {
      try {
        await this.execute(r.dbDrop(this.db));
      } catch (error) {}
    }
    await this.ensureDatabase();
    await forEachAsync(Array.from(this.models.values()), Model => {
      NAMESPACES[Model.name] = {
        Model
      };
      Model.setup(NAMESPACES[Model.name], this.models);
    });
  }

  async execute(query) {
    const connection = await this.connect();
    return query.run(connection);
  }

  async disconnect() {
    const connection = await this.connect();
    await connection.close();
    this.connection = null;
  }

  register(Model) {
    this.models.set(Model.name, Model);
  }

  async ensureDatabase() {
    const list = await this.execute(r.dbList());
    if (!list.includes(this.db)) {
      await this.execute(r.dbCreate(this.db));
    }
  }

  async teardown() {
    if (isTesting) {
      await this.execute(r.dbDrop(this.db));
    }
    await this.disconnect();
  }
}

Database.models = new Map();

module.exports = Database;
