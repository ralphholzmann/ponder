/* @flow */
import r from 'rethinkdb';
import Namespace from './Namespace';
import Query from './Query';
import type Model from './Model';

const isTesting = process.env.NODE_ENV === 'test';
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
  static host: string;
  static port: number;
  static db: string;
  static user: string;
  static password: string;
  static connection: r.Connection;
  static models: Map<string, Class<Model>>;
  static getUserDefinedConnection: (queryNumber: number) => Promise<r.Connection>;
  static queryNumber: number;
  static r: Query;

  static r = new Query();
  static models = new Map();
  static namespaces: Map<Class<Model>, Namespace> = new Map();
  static queryNumber = 0;

  static config({ host, port, db, user, password, getConnection }: config) {
    this.host = host || DEFAULT_RETHINKDB_HOST;
    this.port = port || DEFAULT_RETHINKDB_PORT;
    this.db = db || DEFAULT_RETHINKDB_DB;
    this.user = user || DEFAULT_RETHINKDB_USER;
    this.password = password || DEFAULT_RETHINKDB_PASSWORD;
    this.getUserDefinedConnection = getConnection;
  }

  static async getConnection(): Promise<r.Connection> {
    this.queryNumber += 1;
    if (typeof this.getUserDefinedConnection === 'function') {
      return this.getUserDefinedConnection(this.queryNumber);
    } else if (!this.connection) {
      const { host, port, db, user, password } = this;
      this.connection = await r.connect({ host, port, db, user, password });
    }
    return this.connection;
  }

  static async connect(): Promise<void> {
    const databases = await this.execute(r.dbList());
    if (isTesting && databases.indexOf(this.db) !== -1) {
      try {
        await this.execute(r.dbDrop(this.db));
      } catch (error) {
        throw new Error(error);
      }
    }
    await this.ensureDatabase();
    await Array.from(this.models.values()).reduce(async (chain, model: Class<Model>) => {
      return chain.then(() => model.initialize(this.namespaces.get(model), this.models));
    }, Promise.resolve());
  }

  static async execute(query: r.Operation<any>): Promise<string[]> {
    const connection = await this.getConnection();
    return query.run(connection);
  }

  static async disconnect(): Promise<void> {
    const connection = await this.getConnection();
    await connection.close();
    this.connection = null;
  }

  static async teardown() {
    if (process.env.NODE_ENV === 'test') {
      await this.execute(r.dbDrop(this.db));
    }
    await this.disconnect();
  }

  static register(model: Class<Model>): void {
    const namespace = new Namespace(model);
    this.namespaces.set(model, namespace);
    this.models.set(model.name, model);
  }

  static getNamespace(model: Class<Model>): Namespace {
    return this.namespaces.get(model);
  }

  static async ensureDatabase(): Promise<void> {
    const list = await this.execute(r.dbList());
    if (!list.includes(this.db)) {
      await this.execute(r.dbCreate(this.db));
    }
  }
}
