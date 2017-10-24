const r = require('rethinkdb');
const Database = require('./Database');
const ModelCursor = require('./ModelCursor.js');
const { RQL_METHODS, transforms } = require('./util');

const BASE_PROTO = Object.getPrototypeOf(class {});
const stack = Symbol('stack');
const model = Symbol('model');
const methods = Symbol('methods');
const returns = Symbol('returns');

const { hasOwnProperty } = Object.prototype;

class Query {
  constructor(Model, lastStack = [], lastMethods = [], returnTypes = ['r'], notes = {}) {
    this[model] = Model;
    this[stack] = lastStack;
    this[methods] = lastMethods;
    this[returns] = returnTypes;
    this.notes = notes;
  }

  toQuery() {
    return this[stack].reduce((query, partial) => partial(query), r);
  }

  async run() {
    const query = await (async function runBeforeRunHooks(classDef, query, hooks) {
      if (classDef && classDef.beforeRun && !hooks.includes(classDef.beforeRun)) {
        hooks.push(classDef.beforeRun);
        query = classDef.beforeRun(query);
      }

      if (classDef && Object.getPrototypeOf(classDef) !== BASE_PROTO) {
        query = await runBeforeRunHooks(Object.getPrototypeOf(classDef), query, hooks);
      }
      return query;
    })(this[model], this, []);

    const connection = await Database.connect();
    const response = await query.toQuery().run(connection);

    return this.processResponse(response);
  }

  async processResponse(response) {
    if (response === null) return response;
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
    const previousReturnType = this[returns][this[returns].length - 1];
    if (!transforms.get(previousReturnType)) {
      console.log(this[returns]);
      console.log('prt', previousReturnType, this.toQuery().toString());
    }
    const nextReturnType = transforms.get(previousReturnType).get(method);

    this[stack].push(query => query[method](...args));
    this[methods].push(method);
    this[returns].push(nextReturnType);
    return new this.constructor(
      this[model],
      this[stack].slice(0),
      this[methods].slice(0),
      this[returns].slice(0),
      this.notes
    );
  };
});

Query.prototype.populate = function reqlPopulate() {
  const { relations } = this[model];
  let query = this;

  if (relations.hasOne) {
    for (let [property, definition] of Object.entries(relations.hasOne)) {
      query = query.map(function(result) {
        return result.merge({
          [property]: r
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
      query = query.map(function(result) {
        return result.merge({
          [property]: r
            .table(definition.model)
            .getAll(result.getField(definition.primaryKey), {
              index: definition.key
            })
            .coerceTo('array')
        });
      });
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

Query.prototype.tapFilterRight = function(args) {
  if (this[methods].find(method => INVALID_FILTER_METHODS.includes(method))) return this;

  let methodIndex;
  for (let i = this[returns].length; i >= 0; i--) {
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

module.exports = Query;
