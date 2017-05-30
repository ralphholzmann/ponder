const r = require('rethinkdb');
const Database = require('./Database');
const { RQL_METHODS } = require('./util');

const stack = Symbol('stack');
const model = Symbol('model');

const { hasOwnProperty } = Object.prototype;

class Query {
  constructor(Model, newStack = []) {
    this[model] = Model;
    this[stack] = newStack;
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
    // Cursor check -- probably a better way to check for this
    if (typeof response.next === 'function') {
      const records = await response.toArray();
      return records.map(record => new this[model](record));
    // Single record returned `get` call
    } else if (hasOwnProperty.call(response, 'id')) {
      return new this[model](response);
    }

    // insert, update, delete
    return response;
  }
}

RQL_METHODS.forEach((method) => {
  Query.prototype[method] = function rqlChain(...args) {
    this[stack].push(query => query[method](...args));
    return new this.constructor(this[model], this[stack].slice(0));
  };
});

module.exports = Query;
