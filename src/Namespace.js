/* @flow */
import { get, getInheritedPropertyList } from './util';
import type Model from './Model';

type Relation = {
  primaryKey: string,
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
  model: Class<Model>;
  name: string;
  hasOne: Array<Relation>;
  belongsTo: Array<Relation>;
  hasMany: Array<Relation>;
  manyToMany: Array<Relation>;
  schema: Map<string, Object>;
  indexes: Set<Object>;
  beforeSaveHooks: Array<Function>;
  afterSaveHooks: Array<Function>;
  relationProperties: Array<string>;

  static forEachAsync(array: Array<any>, iterator: Function) {
    return array.reduce((chain, definition): Promise<any> => chain.then(() => iterator(definition)), Promise.resolve());
  }

  constructor(model: Class<Model>) {
    this.model = model;
    this.name = model.name;
    this.hasOne = [];
    this.belongsTo = [];
    this.hasMany = [];
    this.manyToMany = [];
    this.relationProperties = [];
    this.schema = new Map();
    this.indexes = new Set();
    if (model.indexes) {
      model.indexes.forEach((index: Object) => this.indexes.add(index));
    }

    this.beforeSaveHooks = getInheritedPropertyList(model, 'beforeSave');
    this.afterSaveHooks = getInheritedPropertyList(model, 'afterSave');
  }

  addSchemaProperty(property: string, definition: any) {
    let config;
    if (definition.type) {
      config = definition;
    } else {
      config = {
        type: definition
      };
    }

    this.schema.set(property, { property, ...config });
  }

  addIndex(name: string, definition: Object) {
    this.indexes.add({ name, ...definition });
  }

  forEachSchemaProperty(iterator: Function) {
    Array.from(this.schema.entries()).forEach(iterator);
  }

  forEach(property: string, iterator: Function) {
    const list = get(this, property);
    if (Array.isArray(list)) {
      list.forEach(iterator);
    }
  }

  forEachHasOne(iterator: Function) {
    return this.hasOne.forEach(iterator);
  }

  forEachHasOneAsync(iterator: Function) {
    return Namespace.forEachAsync(this.hasOne, iterator);
  }

  forEachHasManyAsync(iterator: Function) {
    return Namespace.forEachAsync(this.hasMany, iterator);
  }

  forEachManyToManyAsync(iterator: Function) {
    return Namespace.forEachAsync(this.manyToMany, iterator);
  }

  forEachHasMany(iterator: Function) {
    return this.hasMany.forEach(iterator);
  }

  forEachManyToMany(iterator: Function) {
    return this.manyToMany.forEach(iterator);
  }

  forEachIndex(iterator: Function) {
    return Array.from(this.indexes.entries()).forEach(iterator);
  }

  forEachIndexAsync(iterator: Function) {
    return Namespace.forEachAsync(Array.from(this.indexes.entries()), iterator);
  }

  addHasOne(relation: Relation) {
    this.hasOne.push(relation);
    this.relationProperties.push(relation.property);
  }

  addBelongsTo(relation: Relation) {
    this.belongsTo.push(relation);
    this.relationProperties.push(relation.property);
  }

  addHasMany(relation: Relation) {
    this.hasMany.push(relation);
    this.relationProperties.push(relation.property);
  }

  addManyToMany(relation: Relation) {
    this.manyToMany.push(relation);
    this.relationProperties.push(relation.property);
  }

  filterSchema(option: string) {
    return Array.from(this.schema.values()).filter((property: Object) => Boolean(property[option]));
  }

  getRelationProperties() {
    return this.relationProperties;
  }
}
