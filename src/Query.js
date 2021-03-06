/* @flow */
/* eslint-disable no-use-before-define */
import rethinkdb from 'rethinkdb';
import debug from 'debug';
import { Set } from 'immutable';
import ModelCursor from './ModelCursor';
import { transforms, getInheritedPropertyList, REQL_METHODS, selectRow, assert, has } from './util';
import Database from './Database';
import type Model from './Model';
import type Namespace from './Namespace';
import util from 'util';

const { hasOwnProperty } = Object.prototype;
const log = debug('ponder:query');

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

Query.prototype.run = async function run(options = {}) {
  let query = this;
  if (options.log) {
    console.log(this.methods);
    console.log(this.returns);
  }
  if (this.model) {
    const beforeRunHooks = getInheritedPropertyList(this.model, 'beforeRun');
    query = await beforeRunHooks.reduce(async (partialQuery: Query, hook: Query => Query) => hook(partialQuery), query);
  }

  const connection = await Database.getConnection();
  const rethinkQuery = query.toQuery();
  if (options.log) {
    console.log(rethinkQuery.toString());
  }
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

Query.prototype.populate = function populate(relations = null): rethinkdb.Operation {
  let query = this;
  const method = query.returns.includes('singleSelection') ? 'do' : 'map';
  const namespace = Database.getNamespace(this.model);
  const populated: Set<Class<Model>> = new Set().add(this.model);

  query = populateBelongsTo(query, namespace, relations, populated, method);
  query = populateHasOne(query, namespace, relations, populated, method);
  query = populateHasMany(query, namespace, relations, populated, method);
  query = populateManyToMany(query, namespace, relations, populated, method);

  return query;
};

function shouldLoadRelation(relations, property) {
  if (typeof relations === 'undefined' || relations === false) {
    return false;
  } else if (relations === null || has(relations, property)) {
    return true;
  }
  return false;
}

function getNextRelations(relations, property) {
  if (relations === null) {
    return null;
  } else if (relations === true) {
    return false;
  } else if (relations !== false && typeof relations !== 'undefined' && has(relations, property)) {
    if (relations[property] === true) {
      return false;
    }
    return relations[property];
  }

  return false;
}

function populateBelongsTo(
  query: Query,
  namespace: Namespace,
  relations: Object | Boolean | null,
  populated: Set<Class<Model>>,
  method: string = 'map'
): Query {
  namespace.forEach('belongsTo', ({ property, key, foreignKey, model }) => {
    if (!shouldLoadRelation(relations, property)) return;
    const nextRelations = getNextRelations(relations, property);

    if (!populated.has(model)) {
      query = query[method](result =>
        rethinkdb.branch(
          result.ne(null),
          result.merge(() => {
            let subQuery = rethinkdb
              .table(model.name)
              .getAll(result.getField(key), {
                index: foreignKey
              })
              .nth(0)
              .default(null);

            subQuery = populateBelongsTo(
              subQuery,
              Database.getNamespace(model),
              nextRelations,
              populated.add(model),
              'do'
            );
            subQuery = populateHasOne(
              subQuery,
              Database.getNamespace(model),
              nextRelations,
              populated.add(model),
              'do'
            );
            subQuery = populateHasMany(
              subQuery,
              Database.getNamespace(model),
              nextRelations,
              populated.add(model),
              'do'
            );
            subQuery = populateManyToMany(
              subQuery,
              Database.getNamespace(model),
              nextRelations,
              populated.add(model),
              'do'
            );
            return {
              [property]: subQuery
            };
          }),
          rethinkdb.expr(null)
        )
      );
    }
  });

  return query;
}

function populateHasOne(
  query: Query,
  namespace: Namespace,
  relations: Object | Boolean | null,
  populated: Set<Class<Model>>,
  method: string = 'map'
): Query {
  namespace.forEach('hasOne', ({ property, key, foreignKey, model }) => {
    if (!shouldLoadRelation(relations, property)) return;
    const nextRelations = getNextRelations(relations, property);

    query = query[method](result =>
      rethinkdb.branch(
        result.ne(null),
        result.merge(() => {
          let subQuery = rethinkdb
            .table(model.name)
            .getAll(foreignKey, {
              index: key
            })
            .nth(0)
            .default(null);

          if (!populated.has(model)) {
            subQuery = populateBelongsTo(
              subQuery,
              Database.getNamespace(model),
              nextRelations,
              populated.add(model),
              'do'
            );
            subQuery = populateHasOne(
              subQuery,
              Database.getNamespace(model),
              nextRelations,
              populated.add(model),
              'do'
            );
            subQuery = populateHasMany(
              subQuery,
              Database.getNamespace(model),
              nextRelations,
              populated.add(model),
              'do'
            );
            subQuery = populateManyToMany(
              subQuery,
              Database.getNamespace(model),
              nextRelations,
              populated.add(model),
              'do'
            );
          }
          return {
            [property]: subQuery
          };
        }),
        rethinkdb.expr(null)
      )
    );
  });

  return query;
}

function populateHasMany(
  query: Query,
  namespace: Namespace,
  relations: Object | Boolean | null,
  populated: Set<Class<Model>>,
  method: string = 'map'
): Query {
  namespace.forEach('hasMany', ({ property, key, model }) => {
    if (!shouldLoadRelation(relations, property)) return;
    const nextRelations = getNextRelations(relations, property);

    query = query[method](result =>
      rethinkdb.branch(
        result.ne(null),
        result.merge(() => {
          let subQuery = rethinkdb
            .table(model.name)
            .getAll(result.getField('id'), {
              index: key
            })
            .coerceTo('array');

          if (!populated.has(model)) {
            subQuery = populateBelongsTo(subQuery, Database.getNamespace(model), nextRelations, populated.add(model));
            subQuery = populateHasOne(subQuery, Database.getNamespace(model), nextRelations, populated.add(model));
            subQuery = populateHasMany(subQuery, Database.getNamespace(model), nextRelations, populated.add(model));
            subQuery = populateManyToMany(subQuery, Database.getNamespace(model), nextRelations, populated.add(model));
          }

          return {
            [property]: subQuery
          };
        }),
        rethinkdb.expr(null)
      )
    );
  });

  return query;
}

function populateManyToMany(
  query: Query,
  namespace: Namespace,
  relations: Object | Boolean | null,
  populated: Set<Class<Model>>,
  method: string = 'map'
): Query {
  namespace.forEach('manyToMany', ({ property, myKey, theirKey, model, tableName }) => {
    if (!shouldLoadRelation(relations, property)) return;
    const nextRelations = getNextRelations(relations, property);

    query = query[method](result =>
      rethinkdb.branch(
        result.ne(null),
        result.merge(() => {
          let subQuery = rethinkdb
            .table(tableName)
            .getAll(result.getField('id'), {
              index: myKey
            })
            .coerceTo('array')
            .map(arrayResult => rethinkdb.table(model.name).get(arrayResult.getField(theirKey)));

          if (!populated.has(model)) {
            subQuery = populateBelongsTo(subQuery, Database.getNamespace(model), nextRelations, populated.add(model));
            subQuery = populateHasOne(subQuery, Database.getNamespace(model), nextRelations, populated.add(model));
            subQuery = populateHasMany(subQuery, Database.getNamespace(model), nextRelations, populated.add(model));
            subQuery = populateManyToMany(subQuery, Database.getNamespace(model), nextRelations, populated.add(model));
          }

          return {
            [property]: subQuery
          };
        }),
        rethinkdb.expr(null)
      )
    );
  });

  return query;
}

Query.ensureTable = async function ensureTable(tableName: string): Promise<void> {
  log(`creating table ${tableName}`);
  return r
    .branch(
      rethinkdb
        .tableList()
        .contains(tableName)
        .not(),
      rethinkdb.branch(
        rethinkdb
          .tableCreate(tableName)
          .getField('tables_created')
          .eq(1),
        rethinkdb.table(tableName).wait(),
        rethinkdb.expr(null)
      ),
      rethinkdb.expr(null)
    )
    .run();
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
      /* Tumbleweed */
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
  'get',
  'tableCreate'
];

const FILTERABLE_TYPES = ['table', 'stream', 'array', 'selection'];

Query.prototype.tapFilterRight = function tapFilterRight(args) {
  if (this.methods.find(method => INVALID_FILTER_METHODS.includes(method))) return this;

  let methodIndex;
  for (let i = this.returns.length; i >= 0; i -= 1) {
    if (FILTERABLE_TYPES.includes(this.returns[i])) {
      methodIndex = i;
      break;
    }
  }
  const newStack = this.stack.slice(0);
  const newMethods = this.methods.slice(0);
  const newReturns = this.returns.slice(0);
  newStack.splice(methodIndex, 0, query => query.filter(args));
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

Query.ensureIndex = (tableName, { name, properties, multi = false, geo = false }) => {
  if (typeof name === 'undefined' && properties.length === 1) {
    name = properties[0];
  }

  log(`create index ${tableName}.${name}`);

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
        `Index name missing for nested property ${properties[0]} on ${
          tableName
        } model. Please add a name to this index definition.`
      );
      args.push(name, selectRow(properties[0]), options);
    }
    // Compound indexes
  } else {
    assert(
      () => !!name,
      `Index name missing for compound index on properties ${JSON.stringify(properties)} on ${
        tableName
      } model. Please add a name to this index definition.`
    );
    args.push(name, properties.map(selectRow), options);
  }

  return r
    .branch(
      rethinkdb
        .table(tableName)
        .indexList()
        .contains(name)
        .not(),
      rethinkdb.branch(
        rethinkdb
          .table(tableName)
          .indexCreate(...args)
          .getField('created')
          .eq(1),
        rethinkdb.table(tableName).indexWait(name),
        rethinkdb.expr(null)
      ),
      rethinkdb.expr(null)
    )
    .run();
};

const r = new Query();
