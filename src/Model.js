/* @flow */
const { RQL_METHODS, get, has, capitalize, lcfirst, forEachAsync } = require('./util');
const Query = require('./Query');
const Point = require('./Point');

const INSERT = Symbol('insert');
const UPDATE = Symbol('update');
const STACK = Symbol('stack');
const PENDING = Symbol('pending');
const ROOT = Symbol('root');

//const pendingUpdate: any = Symbol('pendingUpdate');
const oldValues = Symbol('oldValues');
const defineProperties = Symbol('defineProperties');
const defineRelations = Symbol('defineRelations');

const BASE_PROTO = Object.getPrototypeOf(class {});
const { r } = Query;

const pendingUpdate: Symbol = (Symbol('pendingUpdate'): any);

class Model {
  static async getForEachAsync(property: string, iterator: () => {}): Promise<void> {
    return forEachAsync(get(this, property), iterator);
  }
}

Model.setup = async function modelSetup(tableList, models) {
  this.applyMixins();
  await this.ensureUniqueLookupTables(tableList);
  await Query.ensureTable(this.name);
  await this.setupRelations(models);
  await this.ensureIndexes();
};

Model.applyMixins = function() {
  // Mixin Schema
  (function mixinSchema(schema, classDef) {
    if (classDef.schema) {
      Object.assign(schema, classDef.schema);
    }

    if (Object.getPrototypeOf(classDef) !== BASE_PROTO) {
      mixinSchema(schema, Object.getPrototypeOf(classDef));
    }
  })(this.schema, Object.getPrototypeOf(this));

  // Mixin ReQL
  this.ModelQuery = class extends Query {};

  RQL_METHODS.forEach(method => {
    this[method] = function rqlProxy(...args) {
      const query = new this.ModelQuery(this).table(this.name);
      return query[method](...args);
    };
  });

  (function mixinReQL(Query, baseClass, classDef) {
    if (classDef.ReQL) {
      Object.assign(Query.prototype, classDef.ReQL);
      Object.keys(classDef.ReQL).forEach(method => {
        baseClass[method] = function rqlProxy(...args) {
          const query = new this.ModelQuery(this).table(this.name);
          return query[method](...args);
        };
      });
    }

    if (Object.getPrototypeOf(classDef) !== BASE_PROTO) {
      mixinReQL(Query, baseClass, Object.getPrototypeOf(classDef));
    }
  })(this.ModelQuery, this, this);

  this.run = async function() {
    return new this.ModelQuery(this).table(this.name).run();
  };
};

Model.forEachHasOne = async function(callback) {
  if (this.relations && this.relations.hasOne) {
    for (const [property, definition] of Object.entries(this.relations.hasOne)) {
      await callback(definition, property);
    }
  }
};

Model.forEachHasMany = async function(callback) {
  if (this.relations && this.relations.hasMany) {
    for (const [property, definition] of Object.entries(this.relations.hasMany)) {
      await callback(definition, property);
    }
  }
};

Model.setupRelations = async function modelSetupRelations(models) {
  this.forEachHasOne((definition, property) => {
    const key = `${property}${capitalize(definition.foreignKey)}`;
    definition.key = key;
    definition.constructor = models.get(definition.model);

    if (!has(this.schema, key)) {
      this.schema[key] = {
        type: String,
        allowNull: true,
        relation: true
      };
    }
  });

  await this.forEachHasMany(async (definition, property) => {
    const model = models.get(definition.model);
    let manyToMany;

    model.forEachHasMany((definition, property) => {
      if (models.get(definition.model) === this) {
        manyToMany = [definition, property, model];
      }
    });

    if (manyToMany) {
      const [, manyProperty, manyModel] = manyToMany;
      definition.tableName = [`${this.name}_${property}`, `${manyModel.name}_${manyProperty}`].sort().join('__');

      await Query.ensureTable(definition.tableName);

      definition.manyToMany = true;
      definition.manyProperty = manyProperty;
      definition.myKey = `${lcfirst(this.name)}Id`;
      definition.relationKey = `${lcfirst(manyModel.name)}Id`;
      definition.modelNames = [this.name, manyModel.name].sort();
      definition.keys = [definition.myKey, definition.relationKey].sort();
      definition.constructor = model;

      await Query.ensureIndex(definition.tableName, {
        properties: [definition.keys[0]]
      });
      await Query.ensureIndex(definition.tableName, {
        properties: [definition.keys[1]]
      });
    } else {
      const key = `${lcfirst(this.name)}${capitalize(definition.primaryKey)}`;

      definition.key = key;
      definition.constructor = model;

      if (!has(model.schema, key)) {
        model.schema[key] = {
          type: String,
          allowNull: true,
          relation: true
        };
        if (!has(model, 'indexes')) {
          model.indexes = [];
        }

        model.indexes.push({ properties: [key] });
      }
    }
  });
};

Model.ensureIndexes = async function modelEnsureIndexes() {
  await forEachAsync(this.indexes, async index => Query.ensureIndex(this.name, index));
};

Model.ensureUniqueLookupTables = async function modelEnsureUniqueLookupTables() {
  const uniqueProperties = Object.keys(this.schema).reduce((list, key) => {
    if (this.schema[key].unique) {
      list.push({ key, type: this.schema[key].type });
    }
    return list;
  }, []);
  if (uniqueProperties.length === 0) return;
  uniqueProperties.forEach(async ({ key: property, type }) => {
    const tableName = `${this.name}_${property}_unique`;
    await Query.ensureTable(tableName);
    this[`is${capitalize(property)}Unique`] = async value =>
      !await r
        .table(tableName)
        .get(value.toLowerCase())
        .run();
  });
};

Model.createUniqueLookups = async function createUniqueLookups(keys, model) {
  const result = await Promise.all(
    keys.map(({ key, value: id }) =>
      r
        .table(`${model}_${key}_unique`)
        .insert({ id })
        .run()
    )
  );
  const errorIndex = result.findIndex(({ errors }) => errors > 0);
  if (errorIndex > -1) {
    await Promise.all(
      result.filter(({ errors }) => errors === 0).map((item, index) =>
        r
          .table(`${model}_${result[index].key}_unique`)
          .get(result[index].value)
          .delete()
          .run()
      )
    );
    throw new Error(`'${model}.${keys[errorIndex].key}' must be unique`);
  }
  await Promise.all(
    keys.filter(key => key.oldValue).map(({ key, oldValue: id }) =>
      r
        .table(`${model}_${key}_unique`)
        .get(id)
        .delete()
        .run()
    )
  );
};

Model.with = (...args) => args.reduce((superclass, mixin) => mixin(superclass), Model);

module.exports = Model;
