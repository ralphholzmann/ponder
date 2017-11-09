/* @flow */
import r from 'rethinkdb';
import Namespace from './Namespace.flow';
import Query from './Query';
import type Model from './Model.flow';

const DEFAULT_RETHINKDB_HOST = 'localhost';
const DEFAULT_RETHINKDB_PORT = 28015;
const DEFAULT_RETHINKDB_DB = 'test';
const DEFAULT_RETHINKDB_USER = 'admin';
const DEFAULT_RETHINKDB_PASSWORD = '';

type config = {
  host: string,
  port: number,
  db: string,
  user: string,
  password: string,
  getConnection: (queryNumber: number) => Promise<r.Connection>
};

export default class Database {
  host: string;
  port: number;
  db: string;
  user: string;
  password: string;
  connection: r.Connection;
  models: Map<string, Model>;
  namespaces: Map<string, Namespace>;
  getUserDefinedConnection: (queryNumber: number) => Promise<r.Connection>;
  queryNumber: number;

  constructor({ host, port, db, user, password, getConnection }: config) {
    this.host = host || DEFAULT_RETHINKDB_HOST;
    this.port = port || DEFAULT_RETHINKDB_PORT;
    this.db = db || DEFAULT_RETHINKDB_DB;
    this.user = user || DEFAULT_RETHINKDB_USER;
    this.password = password || DEFAULT_RETHINKDB_PASSWORD;
    this.getUserDefinedConnection = getConnection;
    this.models = new Map();
    this.namespaces = new Map();
    this.queryNumber = 0;
  }

  async getConnection(): Promise<r.Connection> {
    this.queryNumber += 1;
    if (typeof this.getUserDefinedConnection === 'function') {
      return this.getUserDefinedConnection(this.queryNumber);
    } else if (!this.connection) {
      const { host, port, db, user, password } = this;
      this.connection = await r.connect({ host, port, db, user, password });
    }
    return this.connection;
  }

  async connect(): Promise<void> {
    await this.ensureDatabase();
    await Array.from(this.models.values()).reduce(async (nil, model) => {
      await model.setup(this.namespaces.get(model.table), this.models);
    }, null);
  }

  async execute(query: r.Operation<any>): Promise<string[]> {
    const connection = await this.getConnection();
    return query.run(connection);
  }

  async disconnect(): Promise<void> {
    const connection = await this.getConnection();
    await connection.close();
  }

  register(model: Model): void {
    const namespace = new Namespace(model, this);
    const table = model.name;
    this.namespaces.set(table, namespace);

    this.models.set(
      table,
      class extends model {
        static namespace = namespace;
        static table = table;
        static r = new Query({
          namespace
        });
      }
    );
  }

  async ensureDatabase(): Promise<void> {
    const list = await this.execute(r.dbList());
    if (!list.includes(this.db)) {
      await this.execute(r.dbCreate(this.db));
    }
  }
}
