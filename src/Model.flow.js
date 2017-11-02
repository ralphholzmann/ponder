/* @flow */
import Query, { r } from './Query';
import { get, forEachAsync, getInheritedPropertyList, capitalize } from './util.flow';

export default class Model extends Query {
  static async getForEachAsync(property: string, iterator: () => Promise<void>): Promise<void> {
    return forEachAsync(get(this, property), iterator);
  }

  static async setup(namespace: {}, models: Map<string, Model>): Promise<void> {
    this.applyMixins(namespace);
    await this.ensureUniqueLookupTables();
    await Query.ensureTable(this.name);
    await this.setupRelations(models);
  }

  static applyMixins(namespace: {}): void {
    const schemas = getInheritedPropertyList('schema', this);
    namespace.schema = Object.assign({}, ...schemas);

    const ReQLs = getInheritedPropertyList('ReQL', this);
    Object.assign(this.prototype, ReQLs);
  }

  static async ensureUniqueLookupTables(): Promise<void> {
    const uniqueProperties = Object.keys(this.schema).filter(property => this.schema[property].unique);

    if (uniqueProperties.length === 0) return;

    uniqueProperties.forEach(async property => {
      const tableName = `${this.name}_${property}_unique`;
      await Query.ensureTable(tableName);
      this[`is${capitalize(property)}Unique`] = async value =>
        !await r
          .table(tableName)
          .get(value.toLowerCase())
          .run();
    });
  }

  static async setupRelations(models: Map): Promise<void> {
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
  }
}
