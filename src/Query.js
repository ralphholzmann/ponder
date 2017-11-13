/* eslint-disable no-use-before-define */
const rethinkdb = require('rethinkdb');
const Database = require('./Database');
const ModelCursor = require('./ModelCursor.js');
const { RQL_METHODS, transforms, selectRow, assert } = require('./util');

const BASE_PROTO = Object.getPrototypeOf(class {});
const stack = Symbol('stack');
const model = Symbol('model');
const methods = Symbol('methods');
const returns = Symbol('returns');

const { hasOwnProperty } = Object.prototype;

class Query {
  constructor(Model, lastStack = [], lastMethods = [], returnTypes = [], notes = {}) {
    this[model] = Model;
    this[stack] = lastStack;
    this[methods] = lastMethods.length ? lastMethods : ['r'];
    this[returns] = returnTypes.length ? returnTypes : ['r'];
    this.notes = notes;
  }

  toQuery() {
    return this[stack].reduce((query, partial) => partial(query), rethinkdb);
  }

  async run() {
    let query = this;

    if (this[model]) {
      query = await (async function runBeforeRunHooks(classDef, query, hooks) {
        if (classDef && classDef.beforeRun && !hooks.includes(classDef.beforeRun)) {
          hooks.push(classDef.beforeRun);
          query = classDef.beforeRun(query);
        }

        if (classDef && Object.getPrototypeOf(classDef) !== BASE_PROTO) {
          query = await runBeforeRunHooks(Object.getPrototypeOf(classDef), query, hooks);
        }
        return query;
      })(this[model], this, []);
    }

    const connection = await Database.connect();
    const response = await query.toQuery().run(connection);

    return this.processResponse(response);
  }

  async processResponse(response) {
    if (response === null || this[model] === undefined) return response;
    const isArrayResult = Array.isArray(response) && typeof response.toArray === 'function';
    const methodList = this[methods];

    // Single record returned - `get` call
    if (hasOwnProperty.call(response, 'id')) {
      return new this[model](response);
      // Cursor check -- probably a better way to check for this
    } else if (typeof response.next === 'function' && !isArrayResult) {
      // Changefeed
      if (methodList[methodList.length - 1] === 'changes') {
        return new ModelCursor(this[model], response);
      }
      const records = await response.toArray();
      return records.map(record => new this[model](record));
    }
    // insert, update, delete, replace
    return response;
  }
}

module.exports.STACK_SYMBOL = stack;
module.exports.METHODS_SYMBOL = methods;

RQL_METHODS.forEach(method => {
  Query.prototype[method] = function reqlChain(...args) {
    const newStack = this[stack].slice(0);
    const newMethods = this[methods].slice(0);
    const newReturns = this[returns].slice(0);
    const previousReturnType = this[returns][this[returns].length - 1];

    try {
      const nextReturnType = transforms.get(previousReturnType).get(method);
      newReturns.push(nextReturnType);
    } catch (error) { console.log(error); }

    newMethods.push(method);
    newStack.push(query => query[method](...args));

    return new this.constructor(this[model], newStack, newMethods, newReturns, this.notes);
  };
});

Query.prototype.populate = function reqlPopulate() {
  const { relations } = this[model];
  let query = this;

  if (relations.hasOne) {
    for (let [property, definition] of Object.entries(relations.hasOne)) {
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
  if (this[methods].find(method => INVALID_FILTER_METHODS.includes(method))) return this;

  let methodIndex;
  for (let i = this[returns].length; i >= 0; i -= 1) {
    if (FILTERABLE_TYPES.includes(this[returns][i])) {
      methodIndex = i;
      break;
    }
  }
  const newStack = this[stack].slice(0);
  const newMethods = this[methods].slice(0);
  const newReturns = this[returns].slice(0);
  newStack.splice(methodIndex, 0, function(query) {
    return query.filter(args);
  });
  newMethods.splice(methodIndex, 0, 'filter');
  newReturns.splice(methodIndex + 1, 0, transforms.get(this[returns][methodIndex]).get('filter'));
  return new this.constructor(this[model], newStack, newMethods, newReturns, this.notes);
};

Query.ensureTable = async tableName => {
  const tableList = await r.tableList().run();
  if (!tableList.includes(tableName)) {
    await r.tableCreate(tableName).run();
    await r
      .table(tableName)
      .wait()
      .run();
  }
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

module.exports = Query;
