import Database from './Database.flow';
import Query from './Query';

import { get, has, forEachAsync, getInheritedPropertyList, capitalize, lcfirst } from './util.flow';
import type Namespace from './Namespace.flow';

const { r } = Database;

export default class Model extends Query {
  static namespace: Namespace;
  static databases: Array<Database>;
  static databases = [];

  static async getForEachAsync(property: string, iterator: () => Promise<void>): Promise<void> {
    return forEachAsync(get(this, property), iterator);
  }

  static async setup(namespace: Namespace, models: Map): Promise<void> {
    this.applyMixins(namespace);
    await this.ensureUniqueLookupTables(namespace);
    await this.ensureTable(this.name);
    await this.setupRelations(namespace, models);
  }

  static applyMixins(namespace: Namespace): void {
    const schemas = getInheritedPropertyList(this, 'schema');
    const finalSchema = Object.assign({}, ...schemas);

    Object.keys(finalSchema).forEach((key: string) => namespace.addSchemaProperty(key, finalSchema[key]));

    const ReQLs = getInheritedPropertyList(this, 'ReQL');
    Object.assign(this.prototype, ReQLs);
  }

  static async ensureUniqueLookupTables(namespace: Namespace): Promise<void> {
    const uniqueProperties = namespace.filterSchema('unique');

    if (uniqueProperties.length === 0) return;

    uniqueProperties.forEach(async ({ property }) => {
      const tableName = `${this.name}_${property}_unique`;
      await this.ensureTable(tableName);
      this[`is${capitalize(property)}Unique`] = async value =>
        !await r
          .table(tableName)
          .get(value.toLowerCase())
          .run();
    });
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
          model,
          key,
          foreignKey,
          keys,
          table,
          foreignProperty,
          modelNames
        });

        await this.ensureTable(table);
        await this.ensureIndex(definition.tableName, {
          properties: [keys[0]]
        });
        await this.ensureIndex(definition.tableName, {
          properties: [keys[1]]
        });
      } else {
        const key = `${lcfirst(this.name)}${capitalize(definition.primaryKey)}`;
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

  constructor(properties) {
    super();
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

    Database.getNamespace(this.constructor).forEachHasOne(

    this.constructor.forEachHasMany(({ key, primaryKey, constructor, manyToMany, manyProperty }, property) => {
      let setHandler;
      if (manyToMany) {
        setHandler = {
          set: (target, prop, value) => {
            target[prop] = value;

            if (!isNaN(prop) && !value[manyProperty].includes(this)) {
              value[manyProperty].push(this);
            }

            return true;
          }
        };
      } else {
        setHandler = {
          set: (target, prop, value) => {
            if (!isNaN(prop)) {
              value[key] = this[primaryKey];
            }
            target[prop] = value;
            return true;
          }
        };
      }

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
    const { schema } = this.constructor;

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
        return;
      }

      if (Array.isArray(type) && type !== Point) {
        if (typeof value === 'undefined') value = [];

        const subType = type[0];

        this[key] = subType === undefined ? type(value) : value.map(subType);

        return;
      }

      if (value !== null || value !== undefined) {
        this[key] = type(value);
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
    const namespace = Database.getNamespace(this.constructor);
    options = Object.assign(
      {
        STACK: new Set(),
        PENDING: [],
        ROOT: true
      },
      options
    );

    // beforeSave hooks
    await namespace.beforeSaveHooks.reduce(async (model, hook) => await hook(model), this);

    if (has(this, 'id')) {
      await this.update(options);
    } else {
      await this.insert(options);
    }

    // afterSave hooks
    await namespace.afterSaveHooks.reduce(async (model, hook) => await hook(model), this);

    return this;
  }

  async insert(options) {
    const namespace = Database.getNamespace(this.constructor);
    const { schema } = this.constructor;
    const payload = {};
    const unique = [];

    options.STACK.add(this);

    await namespace.forEachHasOne(async ({ property, key, foreignKey, model }) => {
      if (this[property] instanceof model) {
        if (options.STACK.has(this[property])) {
          // Circular reference
          options.PENDING.push(async () => {
            this[key] = this[property][foreignKey];
            await this.update();
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

    namespace.forEachSchemaProperty(([key: string, definition: Object]) => {
      payload[key] = this[key];
      if (definition.unique && this[key]) {
        unique.push({ key, value: definition.type === String ? this[key].toLowerCase() : this[key] });
      }
    });

    if (unique.length > 0) {
      await this.constructor.createUniqueLookups(unique, this.constructor.name);
    }

    const result = await r
      .table(this.constructor.name)
      .insert(payload)
      .run();
    this.id = result.generated_keys[0];

    /** /
  property: string,
  key: string,
  foreignKey: string,
  model: Model,
  // These properties are for manyToMany relations only
  keys: string[],
  modelNames: string[],
  table: string,
  foreignProperty: string
    /**/

    await namespace.forEachHasMany(async ({ property, key, foreignKey, model }) => {
      await Promise.all(
        this[property].map(instance => {
          instance[key] = this[primaryKey];
          return instance.save(options);
        })
      );

      if (manyToMany) {
        const relationIds = this[property].map(instance => instance.id);
        await Promise.all(
          relationIds.map(async relationId => {
            const id = (this.constructor.name === modelNames[0] ? [this.id, relationId] : [relationId, this.id]).join(
              '_'
            );
            await r
              .table(tableName)
              .insert({
                id,
                [myKey]: this.id,
                [relationKey]: relationId
              })
              .run();
          })
        );
      }
    });

    options.STACK.delete(this);

    // Fix up circular references
    if (options.ROOT && options.PENDING) {
      options.PENDING.forEach(update => update());
    }
  }
}
