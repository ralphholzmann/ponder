/* @flow */
/* eslint-disable no-use-before-define */
import rethinkdb from 'rethinkdb';
import ModelCursor from './ModelCursor';
import { transforms, selectRow, assert } from './util';
import { getInheritedPropertyList, REQL_METHODS } from './util.flow';
import type Model from './Model.flow';

const { hasOwnProperty } = Object.prototype;

export default function Query(
  model: Model,
  lastStack: Array<Function> = [],
  lastMethods: Array<string> = [],
  returnTypes: Array<string> = [],
  notes: {} = {}
) {
  this.model = model;
  this.stack = lastStack;
  this.methods = lastMethods.length ? lastMethods : ['r'];
  this.returns = returnTypes.length ? returnTypes : ['r'];
  this.notes = notes;
}

Query.prototype.toQuery = function toQuery() {
  return this.stack.reduce((query, partial) => partial(query), rethinkdb);
};

Query.prototype.run = async function run() {
  const beforeRunHooks = getInheritedPropertyList(this.model, 'beforeRun');
  const query = await beforeRunHooks.reduce(
    async (partialQuery: Query, hook: Query => Query) => hook(partialQuery),
    this
  );
  const connection = await this.model.db.getConnection();
  const response = await query.toQuery().run(connection);

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
  const { relations } = this.model;
  let query = this;

  if (relations.hasOne) {
    for (const [property, definition] of Object.entries(relations.hasOne)) {
      query = query.map(function(result) {
        return result.merge({
          [property]: rethinkdb
            .table(definition.model)
            .getAll(result.getField(definition.key), {
              index: definition.foreignKey
            })
            .nth(0)
            .default(null)
        });
      });
    }
  }

  if (relations.hasMany) {
    for (let [property, definition] of Object.entries(relations.hasMany)) {
      if (definition.manyToMany) {
        query = query.map(function(result) {
          return result.merge({
            [property]: rethinkdb
              .table(definition.tableName)
              .getAll(result.getField('id'), {
                index: definition.myKey
              })
              .coerceTo('array')
              .map(function(result) {
                return rethinkdb.table(definition.model).get(result.getField(definition.relationKey));
              })
          });
        });
      } else {
        query = query.map(function(result) {
          return result.merge({
            [property]: rethinkdb
              .table(definition.model)
              .getAll(result.getField(definition.primaryKey), {
                index: definition.key
              })
              .coerceTo('array')
          });
        });
      }
    }
  }

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
    const nextReturnType = transforms.get(previousReturnType).get(method);

    const newStack = this.stack.slice(0);
    newStack.push(query => query[method](...args));
    const newMethods = this.methods.slice(0);
    newMethods.push(method);
    const newReturns = this.returns.slice(0);
    newReturns.push(nextReturnType);
    return new this.constructor(this.model, newStack, newMethods, newReturns, this.notes);
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
  return new this.constructor(this.model, newStack, newMethods, newReturns, this.notes);
};

Query.ensureIndex = async (tableName, { name, properties, multi = false, geo = false }) => {
  const indexList = await r
    .table(tableName)
    .indexList()
    .run();

  if (!indexList.includes(name || properties[0])) {
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
Query.r = r;
