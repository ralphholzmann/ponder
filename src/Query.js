const r = require('rethinkdb');
const Database = require('./Database');
const ModelCursor = require('./ModelCursor.js');
const { RQL_METHODS } = require('./util');

const stack = Symbol('stack');
const model = Symbol('model');
const methods = Symbol('methods');

const { hasOwnProperty } = Object.prototype;

class Query {
  constructor(Model, lastStack = [], lastMethods = []) {
    this[model] = Model;
    this[stack] = lastStack;
    this[methods] = lastMethods;
  }

  toQuery() {
    return this[stack].reduce((query, partial) => partial(query), r);
  }

  async run() {
    const connection = await Database.connect();
    const response = await this.toQuery().run(connection);

    return this.processResponse(response);
  }

  async processResponse(response) {
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
      } else {
        const records = await response.toArray();
        return records.map(record => new this[model](record));
      }
    }

    // insert, update, delete, replace
    return response;
  }
}

RQL_METHODS.forEach((method) => {
  Query.prototype[method] = function reqlChain(...args) {
    this[stack].push(query => query[method](...args));
    this[methods].push(method);
    return new this.constructor(this[model], this[stack].slice(0), this[methods].slice(0));
  };
});

Query.prototype.populate = function reqlPopulate() {
  const { relations } = this[model];
  let query = this;

  if (relations.hasOne) {
    for (let [property, definition] of Object.entries(relations.hasOne)) {
      query = query.map(function (result) {
        return result.merge({
          [property]: r.table(definition.model).getAll(result.getField(definition.key), {
            index: definition.foreignKey
          }).nth(0).default(null)
        })
      });
    }
  }

  if (relations.hasMany) {
    for (let [property, definition] of Object.entries(relations.hasMany)) {
      query = query.map(function (result) {
        return result.merge({
          [property]: r.table(definition.model).getAll(result.getField(definition.primaryKey), {
            index: definition.key
          }).coerceTo('array')
        })
      });
    }
  }

  return query;
}

module.exports = Query;
