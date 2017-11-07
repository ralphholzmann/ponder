import Query, { r } from './Query';
import { has, get, forEachAsync, getInheritedPropertyList, capitalize, lcfirst } from './util.flow';
import type Namespace from './Namespace.flow';

export default class Model extends Query {
  static async getForEachAsync(property: string, iterator: () => Promise<void>): Promise<void> {
    return forEachAsync(get(this, property), iterator);
  }

  static async setup(namespace: Namespace, models: Map): Promise<void> {
    this.applyMixins(namespace);
    await this.ensureUniqueLookupTables();
    await Query.ensureTable(this.name);
    await this.setupRelations(models);
  }

  static applyMixins(namespace: Namespace): void {
    const schemas = getInheritedPropertyList('schema', this);
    const finalSchema = Object.assign({}, ...schemas);

    Object.keys(finalSchema).forEach((key: string) => namespace.addSchemaProperty(finalSchema[key]));

    const ReQLs = getInheritedPropertyList('ReQL', this);
    Object.assign(this.prototype, ReQLs);
  }

  static async ensureUniqueLookupTables(): Promise<void> {
    const uniqueProperties = this.namespace.filterSchema('unique');

    if (uniqueProperties.length === 0) return;

    uniqueProperties.forEach(async ({ property }) => {
      const tableName = `${this.name}_${property}_unique`;
      await Query.ensureTable(tableName);
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

        await Query.ensureTable(table);
        await Query.ensureIndex(definition.tableName, {
          properties: [keys[0]]
        });
        await Query.ensureIndex(definition.tableName, {
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
}
