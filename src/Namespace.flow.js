/* @flow */
import { getInheritedPropertyList } from './util.flow';
import type Model from './Model.flow';

type Relation = {
  property: string,
  key: string,
  foreignKey: string,
  model: Model,
  // These properties are for manyToMany relations only
  keys: string[],
  modelNames: string[],
  table: string,
  foreignProperty: string
};

export default class Namespace {
  model: Model;
  name: string;
  hasOne: Array<Relation>;
  hasMany: Array<Relation>;
  manyToMany: Array<Relation>;
  schema: Map<string, Object>;
  indexes: Map<string, Object>;
  beforeSaveHooks: Array<Function>;
  afterSaveHooks: Array<Function>;

  constructor(model: Model) {
    this.model = model;
    this.name = model.name;
    this.hasOne = [];
    this.hasMany = [];
    this.manyToMany = [];
    this.schema = new Map(
      Object.keys(model.schema).map(property => [
        property,
        {
          property,
          ...model.schema[property]
        }
      ])
    );
    this.indexes = new Map();
    if (model.indexes) {
      Object.keys(model.indexes).forEach((name: string) => this.indexes.set(name, model.indexes[name]));
    }

    this.beforeSaveHooks = getInheritedPropertyList(model, 'beforeSave');
    this.afterSaveHooks = getInheritedPropertyList(model, 'afterSave');
  }

  addSchemaProperty(property: string, definition: Object) {
    this.schema.set(property, { property, ...definition });
  }

  addIndex(name: string, definition: Object) {
    this.indexes.set(name, definition);
  }

  addHasOne(relation: Relation) {
    this.hasOne.push(relation);
  }

  addHasMany(relation: Relation) {
    this.hasMany.push(relation);
  }

  addManyToMany(relation: Relation) {
    this.manyToMany.push(relation);
  }

  filterSchema(option: string) {
    return Array.from(this.schema.values()).filter((property: Object) => Boolean(property[option]));
  }
}
