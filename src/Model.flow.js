import Query from './Query';

import { get, forEachAsync, getInheritedPropertyList, capitalize, lcfirst } from './util.flow';
import type Namespace from './Namespace.flow';
import type Database from './Database.flow';

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

    Object.keys(finalSchema).forEach((key: string) => namespace.addSchemaProperty(finalSchema[key]));

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

      namespace.addSchemaProperty({
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
          property,
          key,
          model
        };
        namespace.addhasMany(relation);

        namespace.addSchemaProperty({
          type: String,
          allowNull: true,
          relation
        });

        model.namespace.addSchemaProperty(key, {
          type: String,
          allowNull: true,
          relation: true
        });

        model.namespace.addIndex(key, {
          properties: [key]
        });
      }
    });
  }
  async save(options = {}) {
    const { namespace } = this.constructor;
    options = Object.assign(
      {
        STACK: new Set(),
        PENDING: [],
        ROOT: true
      },
      options
    );

    console.log('ns', namespace);
    console.log('cs', this.constructor);

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
    const { schema } = this.constructor;
    const payload = {};
    const unique = [];

    options.STACK.add(this);

    await this.constructor.forEachHasOne(async ({ key, foreignKey, constructor }, property) => {
      if (this[property] instanceof constructor) {
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

    Object.keys(schema).forEach(key => {
      payload[key] = this[key];
      if (schema[key].unique && this[key]) {
        unique.push({ key, value: schema[key].type === String ? this[key].toLowerCase() : this[key] });
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

    await this.constructor.forEachHasMany(
      async ({ key, primaryKey, manyToMany, tableName, keys, myKey, relationKey, modelNames }, property) => {
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
      }
    );

    options.STACK.delete(this);

    // Fix up circular references
    if (options.ROOT && options.PENDING) {
      options.PENDING.forEach(async update => await update());
    }
  }
}
