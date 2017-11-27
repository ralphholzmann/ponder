/* @flow */
/* eslint-disable no-use-before-define */
import rethinkdb from 'rethinkdb';
import ModelCursor from './ModelCursor';
import { transforms, getInheritedPropertyList, REQL_METHODS, selectRow, assert } from './util';
import Database from './Database';
import type Model from './Model';
import type Namespace from './Namespace';

const { hasOwnProperty } = Object.prototype;

type QueryOptions = {
  model?: Model,
  stack?: Array<Function>,
  methods?: Array<string>,
  returns?: Array<string>,
  notes?: Object
};

export default function Query(options: QueryOptions = {}) {
  const { model, stack = [], methods = ['r'], returns = ['r'], notes = {} } = options;
  this.model = model;
  this.stack = stack;
  this.methods = methods;
  this.returns = returns;
  this.notes = notes;
}

Query.prototype.toQuery = function toQuery() {
  return this.stack.reduce((query, partial) => partial(query), rethinkdb);
};

Query.prototype.run = async function run() {
  let query = this;
  if (this.model) {
    const beforeRunHooks = getInheritedPropertyList(this.model, 'beforeRun');
    query = await beforeRunHooks.reduce(async (partialQuery: Query, hook: Query => Query) => hook(partialQuery), query);
  }

  const connection = await Database.getConnection();
  const rethinkQuery = query.toQuery();
  const response = await rethinkQuery.run(connection);
  return this.processResponse(response);
};

Query.prototype.processResponse = async function processResponse(response: rethinkdb.Cursor) {
  if (response === null || this.model === undefined) return response;
  const isArrayResult = Array.isArray(response) && typeof response.toArray === 'function';
  const methodList = this.methods;
  const Constructor = this.model;

  // Single record returned - `get` call
  if (hasOwnProperty.call(response, 'id')) {
    return new Constructor(response);
    // Cursor check -- probably a better way to check for this
  } else if (typeof response.next === 'function' && !isArrayResult) {
    // Changefeed
    if (methodList[methodList.length - 1] === 'changes') {
      return new ModelCursor(Constructor, response);
    }
    const records = await response.toArray();
    return records.map((record: {}) => new Constructor(record));
  }
  // insert, update, delete, replace
  return response;
};

Query.prototype.populate = function populate(): rethinkdb.Operation {
  const namespace = Database.getNamespace(this.model);
  let query = this;

  query = this.populateHasOne(query, namespace);
  query = this.populateHasMany(query, namespace);
  query = this.populateManyToMany(query, namespace);

  return query;
};

Query.prototype.populateHasOne = function populateHasOne(query: Query, namespace: Namespace): Query {
  namespace.forEach('hasOne', ({ property, key, foreignKey, model }) => {
    const method = query.returns.includes('singleSelection') ? 'do' : 'map';
    query = query[method](result =>
      result.merge({
        [property]: rethinkdb
          .table(model.name)
          .getAll(result.getField(key), {
            index: foreignKey
          })
          .nth(0)
          .default(null)
      })
    );
  });

  return query;
};

Query.prototype.populateHasMany = function populateHasMany(query: Query, namespace: Namespace): Query {
  namespace.forEach('hasMany', ({ property, key, model }) => {
    const method = query.returns.includes('singleSelection') ? 'do' : 'map';
    query = query[method](result =>
      result.merge({
        [property]: rethinkdb
          .table(model.name)
          .getAll(result.getField('id'), {
            index: key
          })
          .coerceTo('array')
      })
    );
  });

  return query;
};

Query.prototype.populateManyToMany = function populateManyToMany(query: Query, namespace: Namespace): Query {
  namespace.forEach('manyToMany', ({ property, key, primaryKey, model, table, foreignKey }) => {
    const method = query.returns.includes('singleSelection') ? 'do' : 'map';
    query = query[method](function(result) {
      return result.merge({
        [property]: rethinkdb
          .table(table)
          .getAll(result.getField('id'), {
            index: key
          })
          .coerceTo('array')
          .map(function(result) {
            return rethinkdb.table(model.name).get(result.getField(foreignKey));
          })
      });
    });
  });

  return query;
};

Query.ensureTable = async function ensureTable(tableName: string): Promise<void> {
  const tableList = await r.tableList().run();
  if (!tableList.includes(tableName)) {
    await r.tableCreate(tableName).run();
    await r
      .table(tableName)
      .wait()
      .run();
  }
};

REQL_METHODS.forEach((method: string): void => {
  Query.prototype[method] = function reqlChain(...args) {
    const previousReturnType = this.returns[this.returns.length - 1];

    if (!transforms.get(previousReturnType)) {
      console.log('missing return type from', previousReturnType, 'to', method);
      console.log(this.methods);
      console.log(this.returns);
    }

    const newStack = this.stack.slice(0);
    const newMethods = this.methods.slice(0);
    const newReturns = this.returns.slice(0);

    newStack.push(query => query[method](...args));
    newMethods.push(method);

    try {
      const nextReturnType = transforms.get(previousReturnType).get(method);
      newReturns.push(nextReturnType);
    } catch (error) {
      console.log(error);
    }

    return new this.constructor({
      model: this.model,
      stack: newStack,
      methods: newMethods,
      returns: newReturns,
      namespace: this.namespace,
      notes: this.notes
    });
  };
});

const INVALID_FILTER_METHODS = [
  'indexCreate',
  'indexDrop',
  'indexList',
  'indexRename',
  'indexWait',
  'insert',
  'grant',
  'config',
  'rebalance',
  'reconfigure',
  'status',
  'wait',
  'tableCreate'
];

const FILTERABLE_TYPES = ['table', 'stream', 'array', 'selection'];

Query.prototype.tapFilterRight = function tapFilterRight(args) {
  if (this.methods.find(method => INVALID_FILTER_METHODS.includes(method))) return this;

  let methodIndex;
  for (let i = this.returns.length; i >= 0; i--) {
    if (FILTERABLE_TYPES.includes(this.returns[i])) {
      methodIndex = i;
      break;
    }
  }
  const newStack = this.stack.slice(0);
  const newMethods = this.methods.slice(0);
  const newReturns = this.returns.slice(0);
  newStack.splice(methodIndex, 0, function(query) {
    return query.filter(args);
  });
  newMethods.splice(methodIndex, 0, 'filter');
  newReturns.splice(methodIndex + 1, 0, transforms.get(this.returns[methodIndex]).get('filter'));

  return new this.constructor({
    model: this.model,
    stack: newStack,
    methods: newMethods,
    returns: newReturns,
    notes: this.notes
  });
};

Query.ensureIndex = async (tableName, { name, properties, multi = false, geo = false }) => {
  const indexList = await r
    .table(tableName)
    .indexList()
    .run();

  if (typeof name === 'undefined' && properties.length === 1) {
    name = properties[0];
  }

  if (!indexList.includes(name)) {
    const args = [];
    const options = {
      multi,
      geo
    };

    // Simple index
    if (properties.length === 1) {
      // Single property
      if (!properties[0].includes('.')) {
        args.push(properties[0], options);
        // Single nested property
      } else {
        assert(
          () => !!name,
          `Index name missing for nested property ${properties[0]} on ${tableName} model. Please add a name to this index definition.`
        );
        args.push(name, selectRow(properties[0]), options);
      }
      // Compound indexes
    } else {
      assert(
        () => !!name,
        `Index name missing for compound index on properties ${JSON.stringify(
          properties
        )} on ${tableName} model. Please add a name to this index definition.`
      );
      args.push(name, properties.map(selectRow), options);
    }

    await r
      .table(tableName)
      .indexCreate(...args)
      .run();
    await r
      .table(tableName)
      .indexWait()
      .run();
  }
};

const r = new Query();
