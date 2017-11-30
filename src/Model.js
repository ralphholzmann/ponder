/* @flow */
import Database from './Database';
import Query from './Query';
import Point from './Point';
import { get, has, forEachAsync, getInheritedPropertyList, capitalize, lcfirst, REQL_METHODS, assert } from './util';

import type Namespace from './Namespace';
import type { Record } from './util';

const { r } = Database;

export default class Model {
  static namespace: Namespace;
  static databases: Array<Database>;
  static indexes: Array<Object>;
  static databases = [];
  static name: string;

  id: string;

  static async getForEachAsync(property: string, iterator: Function): Promise<void> {
    return forEachAsync(get(this, property), iterator);
  }

  static async initialize(namespace: Namespace, models: Map<string, Class<Model>>): Promise<void> {
    await this.applyMixins(namespace);
    await Query.ensureTable(this.name);
    await this.setupRelations(namespace, models);
    await this.createIndexes(namespace);
  }

  static async applyMixins(namespace: Namespace): void {
    const schemas = getInheritedPropertyList(this, 'schema');
    const setups = getInheritedPropertyList(this, 'setup');

    const finalSchema = Object.assign({}, ...schemas);
    Object.keys(finalSchema).forEach((key: string) => namespace.addSchemaProperty(key, finalSchema[key]));

    await setups.reduce((chain, fn) => chain.then(() => fn.call(this, namespace)), Promise.resolve());

    const CustomReQLList = getInheritedPropertyList(this, 'ReQL');
    const CustomReQL = {};
    if (CustomReQLList.length) {
      Object.assign(CustomReQL, ...CustomReQLList);
    }

    class ModelQuery extends Query {}

    REQL_METHODS.forEach(method => {
      this[method] = function rqlProxy(...args) {
        const query = new ModelQuery({ model: this }).table(this.name);
        return query[method](...args);
      };
    });

    Object.assign(ModelQuery.prototype, CustomReQL);
    Object.keys(CustomReQL).forEach(method => {
      this[method] = function rqlProxy(...args) {
        const query = new ModelQuery(this).table(this.name);
        return query[method](...args);
      };
    });

    this.run = () => new ModelQuery(this).table(this.name).run();
  }

  static with(...args) {
    return args.reduce((superclass, mixin) => mixin(superclass), Model);
  }

  static async setupRelations(namespace: Namespace, models: Map): Promise<void> {
    this.getForEachAsync('relations.hasOne', (definition: Object, property: string) => {
      const foreignKey = definition.foreignKey || 'id';
      const key = `${property}${capitalize(foreignKey)}`;
      const relation = {
        property,
        key,
        foreignKey,
        model: models.get(definition.model)
      };

      namespace.addHasOne(relation);

      namespace.addSchemaProperty(key, {
        type: String,
        allowNull: true,
        relation
      });
    });

    await this.getForEachAsync('relations.hasMany', async (definition: Object, property: string) => {
      const model = models.get(definition.model);
      let manyToMany;

      model.getForEachAsync('relations.hasMany', (foreignDefinition, foreignProperty) => {
        if (models.get(foreignDefinition.model) === this) {
          manyToMany = [foreignProperty, model];
        }
      });

      if (manyToMany) {
        const [foreignProperty, manyModel] = manyToMany;
        const key = `${lcfirst(this.name)}Id`;
        const foreignKey = `${lcfirst(manyModel.name)}Id`;
        const keys = [key, foreignKey].sort();
        const table = [[this.name, property].join('_'), [manyModel.name, foreignProperty].join('_')].sort().join('__');
        const modelNames = [this.name, manyModel.name].sort();

        namespace.addManyToMany({
          property,
          model,
          key,
          foreignKey,
          keys,
          table,
          foreignProperty,
          modelNames
        });

        await Query.ensureTable(table);
        await Query.ensureIndex(table, {
          properties: [keys[0]]
        });
        await Query.ensureIndex(table, {
          properties: [keys[1]]
        });
      } else {
        const key = `${lcfirst(this.name)}${capitalize(definition.primaryKey || 'id')}`;
        const relation = {
          primaryKey: definition.primaryKey,
          property,
          key,
          model
        };
        namespace.addHasMany(relation);

        namespace.addSchemaProperty(key, {
          type: String,
          allowNull: true,
          relation
        });

        Database.getNamespace(model).addSchemaProperty(key, {
          type: String,
          allowNull: true,
          relation: true
        });

        Database.getNamespace(model).addIndex(key, {
          properties: [key]
        });
      }
    });
  }

  static async createIndexes(namespace: Namespace) {
    await namespace.forEachIndexAsync(([name, definition]) => {
      return Query.ensureIndex(this.name, definition);
    });
  }

  constructor(properties: Record) {
    this.pendingUpdate = {};
    this.oldValues = {};
    this.defineProperties();
    this.defineRelations();
    this.assign(properties);
    this.pendingUpdate = {};
  }

  defineProperties() {
    Database.getNamespace(this.constructor).forEachSchemaProperty(([key]) => {
      let currentValue;
      Object.defineProperty(this, key, {
        enumerable: true,
        set(value) {
          if (!this.oldValues[key]) {
            this.oldValues[key] = currentValue;
          }
          currentValue = value;

          this.pendingUpdate[key] = value;
        },
        get() {
          return currentValue;
        }
      });
    });
  }

  defineRelations() {
    this.defineHasOneRelations();
    this.defineHasManyRelations();
    this.defineManyToManyRelations();
  }

  defineHasOneRelations() {
    Database.getNamespace(this.constructor).forEachHasOne(({ property, key, foreignKey }) => {
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
  }

  defineHasManyRelations() {
    Database.getNamespace(this.constructor).forEachHasMany(({ key, property, primaryKey, constructor }) => {
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

  defineManyToManyRelations() {
    Database.getNamespace(this.constructor).forEachManyToMany(({ property, constructor, foreignProperty }) => {
      const setHandler = {
        set: (target, prop, value) => {
          target[prop] = value;

          if (!isNaN(prop) && !value[foreignProperty].includes(this)) {
            value[foreignProperty].push(this);
          }

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
    const namespace = Database.getNamespace(this.constructor);

    if (has(properties, 'id')) {
      this.id = properties.id;
    }

    namespace.forEachSchemaProperty(([key: string, definition: Object]) => {
      let allowNull = false;
      let type;
      let value = properties[key];

      if (definition.type) {
        type = definition.type;

        if ('allowNull' in definition) {
          allowNull = definition.allowNull;
        }
        if ('default' in definition && typeof value === 'undefined') {
          value = definition.default;
        }
      } else {
        type = definition;
      }

      if ((type === Date && typeof value === 'undefined') || (allowNull && (value === null || value === undefined))) {
        this[key] = null;
        return;
      }

      if (Array.isArray(type) && type !== Point) {
        if (typeof value === 'undefined') value = [];

        const subType = type[0];

        this[key] = subType === undefined ? type(value) : value.map(subType);

        return;
      }

      if (type === Date) {
        this[key] = value;
      } else if (value !== null || value !== undefined) {
        this[key] = type(value);
      }
    });

    Database.getNamespace(this.constructor).forEachHasOne(({ property, model }) => {
      if (has(properties, property) && properties[property] !== null) {
        this[property] = new model(properties[property]);
      }
    });

    Database.getNamespace(this.constructor).forEachHasMany(({ property, model }) => {
      if (has(properties, property) && properties[property] !== null) {
        this[property] = properties[property].map(record => new model(record));
      }
    });

    Database.getNamespace(this.constructor).forEachManyToMany(({ property, model }) => {
      if (has(properties, property) && properties[property] !== null) {
        this[property] = properties[property].map(record => new model(record));
      }
    });
  }

  async saveHasOneRelations(namespace, options) {
    return namespace.forEachHasOneAsync(async ({ property, key, foreignKey, model }) => {
      if (this[property] instanceof model) {
        if (options.STACK.has(this[property])) {
          // Circular reference
          options.PENDING.push(async () => {
            this[key] = this[property][foreignKey];
            await this.save();
          });
        } else {
          await this[property].save(
            Object.assign({}, options, {
              ROOT: false
            })
          );
          if (typeof this[property][foreignKey] !== 'undefined') {
            this[key] = this[property][foreignKey];
          }
        }
      }
    });
  }

  async saveHasManyRelations(namespace, options) {
    return namespace.forEachHasManyAsync(async ({ property, key, primaryKey }) => {
      await Promise.all(
        this[property].map(instance => {
          instance[key] = this[primaryKey];
          return instance.save(
            Object.assign({}, options, {
              ROOT: false
            })
          );
        })
      );
    });
  }

  async saveManyToManyRelations(namespace, options) {
    return namespace.forEachManyToManyAsync(async ({ property, key, table, primaryKey, modelNames, keys }) => {
      await Promise.all(
        this[property].map(instance => {
          instance[key] = this[primaryKey];
          return instance.save(
            Object.assign({}, options, {
              ROOT: false
            })
          );
        })
      );

      const relationIds = this[property].map(instance => instance.id);

      await Promise.all(
        relationIds.map(async relationId => {
          const [key1, key2] = keys;
          let ids;

          if (this.constructor.name === modelNames[0]) {
            ids = [this.id, relationId];
          } else {
            ids = [relationId, this.id];
          }
          const [value1, value2] = ids;

          await r
            .table(table)
            .insert({
              id: ids.join('_'),
              [key1]: value1,
              [key2]: value2
            })
            .run();
        })
      );
    });
  }

  async save(options = {}) {
    const namespace = Database.getNamespace(this.constructor);
    const model = this;
    options = Object.assign(
      {
        STACK: new Set(),
        PENDING: [],
        ROOT: true
      },
      options
    );

    if (options.STACK.has(this)) {
      return this;
    }

    // beforeSave hooks
    await namespace.beforeSaveHooks.reduce(
      async (chain, hook) => chain.then(() => hook(model, namespace)),
      Promise.resolve()
    );

    options.STACK.add(this);

    // Save hasOne relations
    await this.saveHasOneRelations(namespace, options);

    // Perform insert / update
    if (has(this, 'id')) {
      await this.update(options);
    } else {
      await this.insert(options);
    }

    // Save hasMany relations
    await this.saveHasManyRelations(namespace, options);
    await this.saveManyToManyRelations(namespace, options);

    options.STACK.delete(this);

    // Fix up circular references
    if (options.ROOT && options.PENDING) {
      options.PENDING.forEach(update => update());
    }

    // afterSave hooks
    await namespace.afterSaveHooks.reduce(async (chain, hook) => chain.then(() => hook(model)), Promise.resolve());

    return this;
  }

  async insert() {
    const namespace = Database.getNamespace(this.constructor);
    const payload = {};

    await namespace.forEachSchemaProperty(([key: string, definition: Object]) => {
      payload[key] = this[key];
    });

    const result = await r
      .table(this.constructor.name)
      .insert(payload)
      .run();
    this.id = result.generated_keys[0];
  }

  async update() {
    await r
      .table(this.constructor.name)
      .get(this.id)
      .update(this.pendingUpdate)
      .run();

    this.pendingUpdate = {};
    this.oldValues = {};
    return this;
  }

  isNew() {
    return this.id === undefined;
  }

  async populate() {
    assert(() => !this.isNew(), "`populate` cannot be called on an instance that hasn't been saved yet");
    const namespace = Database.getNamespace(this.constructor);
    const plucked = await this.constructor
      .get(this.id)
      .populate()
      .pluck(...namespace.getRelationProperties())
      .run();
    this.assign(plucked);
  }

  toJSON() {
    let json = {
      id: this.id
    };
    let namespace = Database.getNamespace(this.constructor);

    namespace.forEachSchemaProperty(([key, value]) => {
      json[key] = this[key];
    });

    namespace.forEachHasOne(({ key, property }) => {
      json[key] = this[key];
      json[property] = this[property];
    });

    namespace.forEachHasMany(({ key, property }) => {
      json[key] = this[key];
      json[property] = this[property];
    });

    namespace.forEachManyToMany(({ key, property }) => {
      json[key] = this[key];
      json[property] = this[property];
    });

    return json;
  }
}
