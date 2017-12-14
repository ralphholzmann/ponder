/* @flow */
import debug from 'debug';

import Database from './Database';
import Query from './Query';
import Point from './Point';
import { get, has, forEachAsync, getInheritedPropertyList, capitalize, lcfirst, REQL_METHODS, assert } from './util';

import type Namespace from './Namespace';
import type { Record } from './util';

const { r } = Database;
const log = debug('ponder:model');

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
    log(`initializing ${this.name}`);
    await this.applyMixins(namespace);
    await Query.ensureTable(this.name);
    await this.setupRelations(namespace, models);
    await this.createIndexes(namespace);
    log(`finished initializing ${this.name}`);
  }

  static async applyMixins(namespace: Namespace): void {
    log(`applying mixins for ${this.name}`);
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
        const query = new ModelQuery({
          model: this
        }).table(this.name);
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

  static setupHasOneRelations(namespace: Namespace, models: Map): Promise<void> {
    log(`setting up has one relations for ${this.name}`);
    return this.getForEachAsync('hasOne', (definition, property) => {
      const relation = {
        property
      };

      if (typeof definition === 'string') {
        relation.foreignKey = 'id';
        relation.model = models.get(definition);
      } else {
        relation.foreignKey = definition.foreignKey || 'id';
        relation.model = models.get(definition.model);
      }

      relation.key = `${lcfirst(property)}${capitalize(relation.foreignKey)}`;

      namespace.addHasOne(relation);
      Database.getNamespace(relation.model).addSchemaProperty(relation.key, {
        type: String,
        allowNull: true,
        relation
      });
    });
  }

  static setupBelongsToRelations(namespace: Namespace, models: Map): Promise<void> {
    log(`setting up belongs to relations for ${this.name}`);
    return this.getForEachAsync('belongsTo', (definition, property) => {
      const relation = {
        property
      };

      if (typeof definition === 'string') {
        relation.foreignKey = 'id';
        relation.model = models.get(definition);
      } else {
        relation.foreignKey = definition.foreignKey || 'id';
        relation.model = models.get(definition.model);
      }

      relation.key = `${lcfirst(relation.model.name)}${capitalize(property)}${capitalize(relation.foreignKey)}`;

      namespace.addBelongsTo(relation);
      namespace.addSchemaProperty(relation.key, {
        type: String,
        allowNull: true,
        relation
      });
    });
  }

  static async setupHasManyRelations(namespace: Namespace, models: Map): Promise<void> {
    log(`setting up has many relations for ${this.name}`);
    return this.getForEachAsync('hasMany', (definition, property) => {
      const relation = {
        property
      };

      if (typeof definition === 'string') {
        relation.foreignKey = 'id';
        relation.model = models.get(definition);
      } else {
        relation.foreignKey = definition.foreignKey || 'id';
        relation.model = models.get(definition.model);
      }

      relation.key = `${lcfirst(this.name)}${capitalize(property)}${capitalize(relation.foreignKey)}`;

      namespace.addHasMany(relation);

      Database.getNamespace(relation.model).addSchemaProperty(relation.key, {
        type: String,
        allowNull: true,
        relation
      });
      Database.getNamespace(relation.model).addIndex(relation.key, {
        properties: [relation.key]
      });
    });
  }

  static async setupHasAndBelongsToMany(namespace: Namespace, models: Map): Promise<void> {
    log(`setting up has and belongs to relations for ${this.name}`);
    return this.getForEachAsync('hasAndBelongsToMany', async (definition, property) => {
      log(`setting up has and belongs to many: ${this.name}.${property}`);
      const otherModel = models.get(definition.model);
      const relation = {
        property,
        foreignProperty: definition.property,
        model: otherModel
      };

      relation.modelNames = [this.name, otherModel.name].sort();
      relation.modelKeys = [
        [this.name, property, `${lcfirst(this.name)}Id`],
        [otherModel.name, definition.property, `${lcfirst(otherModel.name)}Id`]
      ];

      relation.myKey = relation.modelKeys[0][2];
      relation.theirKey = relation.modelKeys[1][2];

      relation.tableName = relation.modelKeys
        .map(([model, prop]) => [model, prop].join('_'))
        .sort()
        .join('__');

      namespace.addManyToMany(relation);
      Database.getNamespace(relation.model).addManyToMany(
        Object.assign({}, relation, {
          property: relation.foreignProperty,
          foreignProperty: relation.property,
          model: this,
          myKey: relation.theirKey,
          theirKey: relation.myKey
        })
      );

      log(`creating join table ${relation.tableName}`);
      await Query.ensureTable(relation.tableName);
      log(`creating join table index ${relation.tableName}.${relation.myKey}`);
      await Query.ensureIndex(relation.tableName, {
        properties: [relation.myKey]
      });
      log(`creating join table in dex ${relation.tableName}.${relation.theirKey}`);
      return Query.ensureIndex(relation.tableName, {
        properties: [relation.theirKey]
      });
    });
  }

  static async setupRelations(namespace: Namespace, models: Map): Promise<void> {
    log(`Setting up relations for ${this.name}`);
    await this.setupBelongsToRelations(namespace, models);
    await this.setupHasOneRelations(namespace, models);
    await this.setupHasManyRelations(namespace, models);
    await this.setupHasAndBelongsToMany(namespace, models);
    log(`Finished setting up relations for ${this.name}`);
  }

  static async createIndexes(namespace: Namespace) {
    log(`creating indexes for ${this.name}`);
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
          if (this.oldValues[key] === undefined) {
            this.oldValues[key] = currentValue;
          }

          if (value !== currentValue) {
            currentValue = value;
            this.pendingUpdate[key] = value;
          }
        },
        get() {
          return currentValue;
        }
      });
    });
  }

  createArrayProxy(property, addModifier, removeModifier, value = []) {
    let sealed = false;

    const setHandler = {
      set: (target, prop, value) => {
        if (sealed) {
          throw new Error(
            `Cannot set property ${prop} on ${this.constructor.name}.${
              property
            }. Relations are read only. Did you mean to call addRelation or removeRelation?`
          );
        }
        target[prop] = value;
        return true;
      }
    };

    const relation = Object.create(Array.prototype, {
      addRelation: {
        value: async item => {
          relation.unseal();

          if (this.isNew()) {
            await this.save();
          }

          await addModifier(proxy, item);

          relation.seal();
        }
      },
      removeRelation: {
        value: async item => {
          relation.unseal();

          if (this.isNew()) {
            await this.save();
          }

          await removeModifier(proxy, item);
          relation.seal();
        }
      },
      seal: {
        value: () => {
          sealed = true;
        }
      },
      unseal: {
        value: () => {
          sealed = false;
        }
      },
      isSealed: {
        value: () => sealed
      }
    });

    if (value.length) {
      relation.push(...value);
    }

    relation.seal();

    let proxy = new Proxy(relation, setHandler);
    return proxy;
  }

  defineRelations() {
    const namespace = Database.getNamespace(this.constructor);
    this.defineBelongsToRelations(namespace);
    this.defineHasOneRelations(namespace);
    this.defineHasManyRelations(namespace);
    this.defineHasAndBelongsToManyRelations(namespace);
  }

  defineBelongsToRelations(namespace) {
    namespace.forEachBelongsTo(({ property, key, foreignKey }) => {
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

  defineHasOneRelations(namespace) {
    namespace.forEachHasOne(({ property, key, foreignKey }) => {
      let currentValue;

      Object.defineProperty(this, property, {
        enumerable: true,
        set(value) {
          // TODO: enforce model instance of here? maybe warn?
          currentValue = value;
          if (typeof this[foreignKey] !== 'undefined') {
            value[key] = this[foreignKey];
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

  defineHasManyRelations(namespace) {
    namespace.forEachHasMany(({ key, property, primaryKey, model }) => {
      const addModifier = async (proxy, instance) => {
        if (typeof instance === 'string') {
          instance = await model.get(instance).run();
        }
        instance[key] = this.id;
        await instance.save();
        proxy.push(instance);
      };

      const removeModifier = async (proxy, instance) => {
        if (typeof instance === 'string') {
          instance = await model.get(instance).run();
        }
        instance[key] = null;
        await instance.save();
        const index = proxy.findIndex(proxyInstance => proxyInstance.id === instance.id);
        if (index > -1) {
          proxy.splice(index, 1);
        }
      };
      let observer = this.createArrayProxy(property, addModifier, removeModifier);

      Object.defineProperty(this, property, {
        enumerable: true,
        set(value) {
          observer = this.createArrayProxy(property, addModifier, removeModifier, value);
        },
        get() {
          return observer;
        }
      });
    });
  }

  defineHasAndBelongsToManyRelations(namespace) {
    namespace.forEachManyToMany(({ property, modelNames, modelKeys, foreignProperty, tableName, model }) => {
      const addModifier = async (proxy, instance, model) => {
        if (typeof instance === 'string') {
          instance = await model.get(instance).run();
        }

        if (instance.isNew()) {
          await instance.save();
        }

        const constructorName = this.constructor.name;
        const payload = {
          id: modelNames.map(name => (name === constructorName ? this.id : instance.id)).join('_')
        };
        modelKeys.forEach(([name, , joinProperty]) => {
          payload[joinProperty] = name === constructorName ? this.id : instance.id;
        });

        await r
          .table(tableName)
          .insert(payload)
          .run();
        proxy.push(instance);
        instance[foreignProperty].unseal();
        instance[foreignProperty].push(this);
        instance[foreignProperty].seal();
      };

      const removeModifier = async (proxy, instance) => {
        if (typeof instance === 'string') {
          instance = await model.get(instance).run();
        }
        const constructorName = this.constructor.name;
        const id = modelNames.map(name => (name === constructorName ? this.id : instance.id)).join('_');
        await r
          .table(tableName)
          .get(id)
          .delete()
          .run();

        let index = proxy.findIndex(proxyInstance => proxyInstance.id === instance.id);
        if (index > -1) {
          proxy.splice(index, 1);
        }

        index = instance[foreignProperty].findIndex(proxyInstance => proxyInstance.id === this.id);
        if (index > -1) {
          instance[foreignProperty].unseal();
          instance[foreignProperty].splice(index, 1);
          instance[foreignProperty].seal();
        }
      };
      let observer = this.createArrayProxy(property, addModifier, removeModifier);

      Object.defineProperty(this, property, {
        enumerable: true,
        set(value) {
          observer = this.createArrayProxy(property, addModifier, removeModifier, value);
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

    namespace.forEachBelongsTo(({ property, model }) => {
      if (has(properties, property) && properties[property] !== null) {
        this[property] = new model(properties[property]);
      }
    });

    namespace.forEachHasMany(({ property, model }) => {
      if (has(properties, property) && properties[property] !== null) {
        this[property] = properties[property].map(record => new model(record));
      }
    });

    namespace.forEachManyToMany(({ property, model }) => {
      if (has(properties, property) && properties[property] !== null) {
        this[property] = properties[property].map(record => new model(record));
      }
    });
  }

  async saveBelongsToRelations(namespace, options) {
    return namespace.forEachBelongsToAsync(async ({ property, key, foreignKey, model }) => {
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

  async saveHasOneRelations(namespace, options) {
    return namespace.forEachHasOneAsync(async ({ property, key, foreignKey, model }) => {
      if (this[property] instanceof model) {
        this[property][key] = this[foreignKey];
        return this[property].save(
          Object.assign({}, options, {
            ROOT: false
          })
        );
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
    await this.saveBelongsToRelations(namespace, options);

    // Perform insert / update
    if (this.isNew()) {
      // beforeSave hooks
      await namespace.beforeCreateHooks.reduce(
        async (chain, hook) => chain.then(() => hook(model, namespace)),
        Promise.resolve()
      );

      await this.insert(options);

      await namespace.afterCreateHooks.reduce(
        async (chain, hook) => chain.then(() => hook(model, namespace)),
        Promise.resolve()
      );
    } else {
      await this.update(options);
    }

    // Save hasMany relations
    await this.saveHasOneRelations(namespace, options);
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
