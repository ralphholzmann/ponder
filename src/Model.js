const { RQL_METHODS, has, selectRow, capitalize, lcfirst } = require('./util');
const Query = require('./Query');
const Point = require('./Point');

const INSERT = Symbol('insert');
const UPDATE = Symbol('update');
const STACK = Symbol('stack');
const PENDING = Symbol('pending');
const ROOT = Symbol('root');

const pendingUpdate = Symbol('pendingUpdate');
const oldValues = Symbol('oldValues');
const defineProperties = Symbol('defineProperties');
const defineRelations = Symbol('defineRelations');
const isTesting = process.env.NODE_ENV === 'test';

const BASE_PROTO = Object.getPrototypeOf(class {});

class Model {
  constructor(properties) {
    this[pendingUpdate] = {};
    this[oldValues] = {};
    this[defineProperties]();
    this[defineRelations]();

    this.assign(properties);
    this[pendingUpdate] = {};
  }

  [defineProperties]() {
    Object.keys(this.constructor.schema).forEach(key => {
      let currentValue;
      Object.defineProperty(this, key, {
        enumerable: true,
        set(value) {
          if (!this[oldValues][key]) {
            this[oldValues][key] = currentValue;
          }
          currentValue = value;
          this[pendingUpdate][key] = value;
        },
        get() {
          return currentValue;
        }
      });
    });
  }

  [defineRelations]() {
    this.constructor.forEachHasOne(({ key, foreignKey }, property) => {
      let currentValue;

      Object.defineProperty(this, property, {
        enumerable: true,
        set(value) {
          // TODO: enforce model instance of here? maybe warn?
          currentValue = value;
          if (typeof value[foreignKey] !== 'undefined') {
            this[key] = value[foreignKey];
          } else {
            this[key] = null;
          }
        },
        get() {
          return currentValue;
        }
      });
    });

    this.constructor.forEachHasMany(({ key, primaryKey, constructor }, property) => {
      const setHandler = {
        set: (target, prop, value) => {
          if (!isNaN(prop)) {
            value[key] = this[primaryKey];
          }
          target[prop] = value;
          return true;
        }
      };

      let observer = new Proxy([], setHandler);

      Object.defineProperty(this, property, {
        enumerable: true,
        set(value) {
          if (!Array.isArray(value)) {
            throw new Error(
              `'${property}' on ${this.constructor.name} instance must be an array of ${constructor.name} instances.`
            );
          }
          observer = new Proxy(value, setHandler);
        },
        get() {
          return observer;
        }
      });
    });
  }

  assign(properties) {
    const { schema, name } = this.constructor;

    if (has(properties, 'id')) {
      this.id = properties.id;
    }

    Object.keys(schema).forEach(key => {
      const config = schema[key];
      let allowNull = false;
      let type;
      let value = properties[key];

      if (config.type) {
        type = config.type;

        if ('allowNull' in config) {
          allowNull = config.allowNull;
        }
        if ('default' in config && typeof value === 'undefined') {
          value = config.default;
        }
      } else {
        type = config;
      }

      if ((type === Date && typeof value === 'undefined') || (allowNull && (value === null || value === undefined))) {
        this[key] = null;
      } else {
        if (Array.isArray(type) && type !== Point) {
          if (typeof value === 'undefined') {
            value = [];
          }
          const subType = type[0];
          if (subType === undefined) {
            this[key] = type(value);
          } else {
            this[key] = value.map(subType);
          }
        } else if (value !== null || value !== undefined) {
          this[key] = type(value);
        }
      }
    });

    this.constructor.forEachHasOne(({ constructor }, property) => {
      if (has(properties, property) && properties[property] !== null) {
        this[property] = new constructor(properties[property]);
      }
    });

    this.constructor.forEachHasMany(({ constructor }, property) => {
      if (has(properties, property) && properties[property] !== null) {
        this[property] = properties[property].map(record => new constructor(record));
      }
    });
  }

  async save(options = {}) {
    options = Object.assign(
      {
        [STACK]: new Set(),
        [PENDING]: [],
        [ROOT]: true
      },
      options
    );

    // beforeSave hooks
    await (async function runBeforeSaveHooks(model, classDef) {
      if (classDef.beforeSave) {
        await classDef.beforeSave(model);
      }

      if (Object.getPrototypeOf(classDef) !== BASE_PROTO) {
        await runBeforeSaveHooks(model, Object.getPrototypeOf(classDef));
      }
    })(this, this.constructor);

    if (has(this, 'id')) {
      await this[UPDATE](options);
    } else {
      await this[INSERT](options);
    }

    // afterSave hooks
    await (async function runAfterSaveHooks(model, classDef) {
      if (classDef.beforeSave) {
        await classDef.beforeSave(model);
      }

      if (Object.getPrototypeOf(classDef) !== BASE_PROTO) {
        await runAfterSaveHooks(model, Object.getPrototypeOf(classDef));
      }
    })(this, this.constructor);

    return this;
  }

  async [UPDATE]() {
    const { schema, name } = this.constructor;
    const unique = Object.keys(schema).reduce((reduction, key) => {
      if (schema[key].unique && this[pendingUpdate][key]) {
        reduction.push({
          key,
          value: schema[key].type === String ? this[pendingUpdate][key].toLowerCase() : this[pendingUpdate][key],
          oldValue: schema[key].type === String ? this[oldValues][key].toLowerCase() : this[oldValues][key]
        });
      }
      return reduction;
    }, []);
    if (unique.length > 0) {
      await this.constructor.createUniqueLookups(unique, name);
    }
    const query = new Query(this);
    await query
      .table(name)
      .get(this.id)
      .update(this[pendingUpdate])
      .run();
    this[pendingUpdate] = {};
    this[oldValues] = {};
    return this;
  }

  async [INSERT](options) {
    const { schema } = this.constructor;
    const payload = {};
    const unique = [];

    options[STACK].add(this);

    await this.constructor.forEachHasOne(async ({ key, foreignKey, constructor }, property) => {
      if (this[property] instanceof constructor) {
        if (options[STACK].has(this[property])) {
          // Circular reference
          options[PENDING].push(async () => {
            this[key] = this[property][foreignKey];
            await this[UPDATE]();
          });
        } else {
          await this[property].save(
            Object.assign({}, options, {
              [ROOT]: false
            })
          );
          if (typeof this[property][foreignKey] !== 'undefined') {
            this[key] = this[property][foreignKey];
          }
        }
      }
    });

    Object.keys(schema).forEach(key => {
      payload[key] = this[key];
      if (schema[key].unique && this[key]) {
        unique.push({ key, value: schema[key].type === String ? this[key].toLowerCase() : this[key] });
      }
    });

    if (unique.length > 0) {
      await this.constructor.createUniqueLookups(unique, this.constructor.name);
    }

    const query = new Query(this);
    const result = await query
      .table(this.constructor.name)
      .insert(payload)
      .run();
    this.id = result.generated_keys[0];

    // Fix up circular references
    await this.constructor.forEachHasMany(async ({ key, primaryKey }, property) => {
      await Promise.all(
        this[property].map(instance => {
          instance[key] = this[primaryKey];
          return instance.save(options);
        })
      );
    });

    options[STACK].delete(this);

    if (options[ROOT] && options[PENDING]) {
      for (let update of options[PENDING]) {
        await update();
      }
    }
  }
}

Model.setup = async function modelSetup(tableList, models) {
  this.applyMixins();
  await this.ensureUniqueLookupTables(tableList);
  await this.setupRelations(models);
  await this.ensureTable(tableList);
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

  this.forEachHasMany((definition, property) => {
    const key = `${lcfirst(this.name)}${capitalize(definition.primaryKey)}`;
    const model = models.get(definition.model);

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

      model.indexes.push({ index: key });
    }
  });
};

Model.ensureTable = async function modelEnsureTable(tableList) {
  const query = new Query(this);
  if (!tableList.includes(this.name)) {
    const options = {};

    if (isTesting) {
      options.durability = 'hard';
    }

    await query.tableCreate(this.name, options).run();
  }
};

Model.ensureIndexes = async function modelEnsureIndexes() {
  if (this.indexes) {
    const indexList = await this.indexList().run();

    await Promise.all(
      this.indexes.map(async entry => {
        const { index, multi, geo } = entry;

        if (Array.isArray(index)) {
          index.forEach(field => {
            if (!has(this.schema, field)) {
              throw new Error(`${field} not found in schema`);
            }
          });

          const indexName = index.join('_');

          if (indexList.indexOf(indexName) > -1) return;

          await this.indexCreate(indexName, index.map(selectRow)).run();
        }

        if (typeof index === 'string') {
          if (indexList.indexOf(index) > -1) return;

          if (Object.keys(this.schema).indexOf(index) === -1) {
            throw new Error(`${index} not found in schema`);
          }

          if (multi) {
            await this.indexCreate(index, selectRow(index), { multi: true }).run();
          } else if (geo) {
            await this.indexCreate(index, selectRow(index), { geo: true }).run();
          } else {
            await this.indexCreate(index, selectRow(index)).run();
          }
        }
      })
    );

    await this.indexWait().run();
  }
};

Model.ensureUniqueLookupTables = async function modelEnsureUniqueLookupTables(tableList) {
  const uniqueProperties = Object.keys(this.schema).reduce((list, key) => {
    if (this.schema[key].unique) {
      list.push({ key, type: this.schema[key].type });
    }
    return list;
  }, []);
  if (uniqueProperties.length === 0) return;
  uniqueProperties.forEach(async ({ key: property, type }) => {
    const tableName = `${this.name}_${property}_unique`;
    if (!tableList.includes(tableName)) {
      const options = {};

      if (isTesting) {
        options.durability = 'hard';
      }

      this[`is${capitalize(property)}Unique`] = async value => {
        const result = await new Query(this)
          .table(tableName)
          .get(type === String ? value.toLowerCase() : value)
          .run();
        return !result;
      };

      await new Query(this).tableCreate(tableName, options).run();
    }
  });
};

Model.createUniqueLookups = async function createUniqueLookups(keys, model) {
  const result = await Promise.all(
    keys.map(({ key, value: id }) =>
      new Query(this)
        .table(`${model}_${key}_unique`)
        .insert({ id })
        .run()
    )
  );
  const errorIndex = result.findIndex(({ errors }) => errors > 0);
  if (errorIndex > -1) {
    await Promise.all(
      result.filter(({ errors }) => errors === 0).map((item, index) =>
        new Query(this)
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
      new Query(this)
        .table(`${model}_${key}_unique`)
        .get(id)
        .delete()
        .run()
    )
  );
};

Model.with = (...args) => args.reduce((superclass, mixin) => mixin(superclass), Model);

module.exports = Model;
