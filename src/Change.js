/* @flow */
/* eslint-disable camelcase */
import Database from './Database.flow';
import type Model from './Model.flow';
import type Namespace from './Namespace.flow';

type Record = {
  id: string
} | null;

type ChangeRecord = {
  old_val: Record,
  new_val: Record
};

export default class Change {
  Model: Model;
  old_val: Record;
  new_val: Record;
  namespace: Namespace;

  constructor(model: Model, change: ChangeRecord) {
    const { old_val, new_val } = change;
    this.Model = model;
    this.old_val = old_val === null ? null : new this.Model(old_val);
    this.new_val = new_val === null ? null : new this.Model(new_val);
    this.namespace = Database.getNamespace(model);
  }

  diff() {
    const { new_val, old_val } = this;

    if (new_val === null) {
      return old_val;
    }

    if (old_val === null) {
      return new_val;
    }

    const delta = {
      id: new_val.id
    };

    this.namespace.forEachSchemaProperty(([key: string]) => {
      if (old_val[key] !== new_val[key]) {
        delta[key] = new_val[key];
      }
    });

    return delta;
  }
}
