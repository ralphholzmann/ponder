const { RQL_METHODS } = require('./util');
const Query = require('./Query');

const INSERT = Symbol('insert');
const UPDATE = Symbol('update');
const pendingUpdate = Symbol('pendingUpdate');

class Model {
  constructor(properties) {
    this[pendingUpdate] = {};
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
    this.assign(properties);
    this[pendingUpdate] = {};
  }

  assign(properties) {
    const { schema } = this.constructor;

    if (Object.prototype.hasOwnProperty.call(properties, 'id')) {
      this.id = properties.id;
    }

    Object.keys(schema).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
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

        if (allowNull && properties[key] === null) {
          this[key] = null;
        } else {
          this[key] = type(properties[key]);
        }
      }
    });
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

    const query = new Query(this);
    const result = await query.table(this.constructor.name).insert(payload).run();
    this.id = result.generated_keys[0];
  }
}

Model.setup = async function modelSetup(tableList) {
  const query = new Query(this);
  if (!tableList.includes(this.name)) {
    await query.tableCreate(this.name).run();
  }

  if (this.indexes) {
    const indexList = await (new Query(this)).indexList().run();
    for (let [indexName, definition] of Object.entries(this.indexes)) {
      if (!indexList.includes(indexName)) {
        const query = new Query(this);
        query.indexCreate();
      }
    }
  }
};

RQL_METHODS.forEach((method) => {
  Model[method] = function rqlProxy(...args) {
    const query = (new Query(this)).table(this.name);
    return query[method](...args);
  };
});

module.exports = Model;
