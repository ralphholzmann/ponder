const r = require('rethinkdb');
const { RQL_METHODS, get, has, selectRow, capitalize } = require('./util');
const Query = require('./Query');

const INSERT = Symbol('insert');
const UPDATE = Symbol('update');
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

  [defineProperties] () {
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
    const { relations } = this.constructor;
    if (relations && relations.hasOne) {
      for (let [property, { key, foreignKey }] of Object.entries(relations.hasOne)) {
        let currentValue;

        Object.defineProperty(this, property, {
          enumerable: true,
          set(value) {
            // TODO: enforce model instance of here? maybe warn?
            currentValue = value;
            this[key] = value[foreignKey];
          },
          get() {
            return currentValue;
          }
        });
      }
    }
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

    if (relations) {
      if (relations.hasOne) {
        for (let [property, { constructor }] of Object.entries(relations.hasOne)) {
          if (Object.prototype.hasOwnProperty.call(properties, property) && properties[property] !== null) {
            this[property] = new constructor(properties[property]);
          }
        }
      }
    }
  }

  async save() {
    if (Object.prototype.hasOwnProperty.call(this, 'id')) {
      await this[UPDATE]();
    } else {
      await this[INSERT]();
    }

    return this;
  }

  async [UPDATE]() {
    const query = new Query(this);
    await query.table(this.constructor.name).get(this.id).update(this[pendingUpdate]).run();
    this[pendingUpdate] = {};
    return this;
  }

  async [INSERT]() {
    const { schema } = this.constructor;
    const payload = {};

    Object.keys(schema).forEach((key) => {
      payload[key] = this[key];
    });
    console.log('pl', payload);

    const query = new Query(this);
    const result = await query.table(this.constructor.name).insert(payload).run();
    this.id = result.generated_keys[0];
  }
}

Model.setup = async function modelSetup(tableList, models) {
  await this.setupRelations(models);
  await this.ensureTable(tableList);
  await this.ensureIndexes();
};

Model.setupRelations = async function modelSetupRelations(models) {
  if (this.relations) {
      if (this.relations.hasOne) {
        for (let [property, definition] of Object.entries(this.relations.hasOne)) {
          const key = `${property}${capitalize(definition.foreignKey)}`;
          definition.key = key;
          definition.constructor = models.get(definition.model);
          if (!has(this.schema, key)) {
            this.schema[key] = {
              type: String,
              allowNull: true
            }
          }
        }
      }
  }
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