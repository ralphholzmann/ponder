/* @flow */
/* eslint-disable camelcase */
import Database from './Database';
import type Model from './Model';
import type Namespace from './Namespace';
import type { Record } from './util';

type ChangeRecord = {
  old_val: Record,
  new_val: Record
};

export default class Change {
  Model: Model;
  old_val: Record;
  new_val: Record;
  namespace: Namespace;

  constructor(ModelConstructor: Function, change: ChangeRecord) {
    const { old_val, new_val } = change;
    this.Model = ModelConstructor;
    this.old_val = old_val ? new ModelConstructor(old_val) : null;
    this.new_val = new_val ? new ModelConstructor(new_val) : null;
    this.namespace = Database.getNamespace(ModelConstructor);
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
