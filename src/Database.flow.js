/* @flow */
import r from 'rethinkdb';
import Namespace from './Namespace.flow';
import type Model from './Model.flow';
import { Map } from 'immutable';

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
  connection: {};
  models: Map<string, Model>;
  namespaces: Map<string, Namespace>;
  getConnection: (queryNumber: number) => Promise<r.Connection>;
  queryNumber: number;

  constructor({ host, port, db, user, password, getConnection }: config) {
    this.host = host || DEFAULT_RETHINKDB_HOST;
    this.port = port || DEFAULT_RETHINKDB_PORT;
    this.db = db || DEFAULT_RETHINKDB_DB;
    this.user = user || DEFAULT_RETHINKDB_USER;
    this.password = password || DEFAULT_RETHINKDB_PASSWORD;
    this.getConnection = getConnection || this.getConnection;
    this.models = new Map();
    this.queryNumber = 0;
  }

  async getConnection(): Promise<r.Connection> {
    if (!this.connection) {
      const { host, port, db, user, password } = this;
      this.connection = await r.connect({ host, port, db, user, password });
    }
    return this.connection;
  }

  async connect(): Promise<void> {
    await this.ensureDatabase();
    await Array.from(this.models.values()).reduce(async (nil, model) => {
      this.namespaces = this.namespaces.set(model.name, new Namespace(model));
      await model.setup(this.namespaces.get(model.name), this.models);
    }, null);
  }

  async execute(query: r.Operation<any>): Promise<string[]> {
    const connection = await this.getConnection((this.queryNumber += 1));
    return query.run(connection);
  }

  async disconnect(): Promise<void> {
    const connection = await this.getConnection((this.queryNumber += 1));
    await connection.close();
  }

  register(model: Model): void {
    this.models.set(model.name, model);
  }

  async ensureDatabase(): Promise<void> {
    const list = await this.execute(r.dbList());
    if (!list.includes(this.db)) {
      await this.execute(r.dbCreate(this.db));
    }
  }
}
