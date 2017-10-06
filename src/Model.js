const {
  RQL_METHODS,
  has,
  selectRow,
  capitalize,
  lcfirst
} = require('./util');
const Query = require('./Query');

const INSERT = Symbol('insert');
const UPDATE = Symbol('update');
const STACK = Symbol('stack');
const PENDING = Symbol('pending');
const ROOT = Symbol('root');

const pendingUpdate = Symbol('pendingUpdate');
const defineProperties = Symbol('defineProperties');
const defineRelations = Symbol('defineRelations');
const isTesting = process.env.NODE_ENV === 'test';

class Model {
  constructor(properties) {
    this[pendingUpdate] = {};
    this[defineProperties]();
    this[defineRelations]();

    this.assign(properties);
    this[pendingUpdate] = {};
  }

  [defineProperties]() {
    Object.keys(this.constructor.schema).forEach((key) => {
      let currentValue;
      Object.defineProperty(this, key, {
        enumerable: true,
        set(value) {
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
      }

      let observer = new Proxy([], setHandler);

      Object.defineProperty(this, property, {
        enumerable: true,
        set(value) {
          if (!Array.isArray(value)) {
            throw new Error(`'${property}' on ${this.constructor.name} instance must be an array of ${constructor.name} instances.`);
          }
          observer = new Proxy(value, setHandler);
        },
        get() {
          return observer;
        }
      });
    })
  }

  assign(properties) {
    const { schema, relations } = this.constructor;

    if (Object.prototype.hasOwnProperty.call(properties, 'id')) {
      this.id = properties.id;
    }

    Object.keys(schema).forEach((key) => {
      const config = schema[key];
      let allowNull = false;
      let type;

      if (config.type) {
        type = config.type;

        if ('allowNull' in config) {
          allowNull = config.allowNull;
        }
      } else {
        type = config;
      }

      if (allowNull && (properties[key] === null || properties[key] === undefined)) {
        this[key] = null;
      } else {
        this[key] = type(properties[key]);
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
    options = Object.assign({
      [STACK]: new Set(),
      [PENDING]: [],
      [ROOT]: true
    }, options);

    if (has(this, 'id')) {
      await this[UPDATE](options);
    } else {
      await this[INSERT](options);
    }

    return this;
  }

  async [UPDATE]() {
    const query = new Query(this);
    await query.table(this.constructor.name).get(this.id).update(this[pendingUpdate]).run();
    this[pendingUpdate] = {};
    return this;
  }

  async [INSERT](options) {
    const { schema } = this.constructor;
    const payload = {};

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
          await this[property].save(Object.assign({}, options, {
            [ROOT]: false
          }));
          if (typeof this[property][foreignKey] !== 'undefined') {
            this[key] = this[property][foreignKey];
          }
        }
      }
    });

    Object.keys(schema).forEach((key) => {
      payload[key] = this[key];
    });

    const query = new Query(this);
    const result = await query.table(this.constructor.name).insert(payload).run();
    this.id = result.generated_keys[0];

    // Fix up circular references

    await this.constructor.forEachHasMany(async ({ key, primaryKey }, property) => {
      await Promise.all(this[property].map((instance) => {
        instance[key] = this[primaryKey];
        return instance.save(options);
      }));
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
  await this.setupRelations(models);
  await this.ensureTable(tableList);
  await this.ensureIndexes();
};

Model.forEachHasOne = async function (callback) {
  if (this.relations && this.relations.hasOne) {
    for (const [property, definition] of Object.entries(this.relations.hasOne)) {
      await callback(definition, property);
    }
  }
};

Model.forEachHasMany = async function (callback) {
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
      }
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
      }
      if (!has(model, 'indexes')) {
        model.indexes = {};
      }

      model.indexes[key] = true;
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
    for (let [indexName, definition] of Object.entries(this.indexes)) {
      if (!indexList.includes(indexName)) {
        // Simple index
        if (definition === true) {
          if (has(this.schema, indexName)) {
            await this.indexCreate(indexName, selectRow(indexName)).run();
          } else {
            throw new Error(`Unable to create simple index "${indexName}" on Model ${this.name} because that property does not exist on the Model's schema.`);
          }
        // Compound index
        } else if (Array.isArray(definition)) {
          definition.forEach(property => {
            if (!has(this.schema, property)) {
              throw new Error(`Unable to create compound index "${indexName}" on Model ${this.name} because property '${property}' does not exist on the Model's schema.`);
            }
          });
          await this.indexCreate(indexName, definition.map(selectRow)).run();
        }
      }
    }
    await this.indexWait().run();
  }
};

RQL_METHODS.forEach((method) => {
  Model[method] = function rqlProxy(...args) {
    const query = (new Query(this)).table(this.name);
    return query[method](...args);
  };
});

module.exports = Model;
