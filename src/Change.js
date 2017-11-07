/* @flow */
/* eslint-disable camelcase */
import type Model from './Model.flow';

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

  constructor(model: Model, change: ChangeRecord) {
    const { old_val: oldVal, new_val: newVal } = change;
    this.Model = model;
    this.old_val = oldVal === null ? null : new this.Model(oldVal);
    this.new_val = newVal === null ? null : new this.Model(newVal);
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

    Object.keys(this.Model.schema).forEach((key: string) => {
      if (old_val[key] !== new_val[key]) {
        delta[key] = new_val[key];
      }
    });

    return delta;
  }
}
