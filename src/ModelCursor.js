/* @flow */
import rethinkdb from 'rethinkdb';
import Change from './Change';
import type Model from './Model';

export default class ModelCursor {
  Model: Model;
  cursor: rethinkdb.Cursor;

  constructor(model: Model, cursor: rethinkdb.Cursor) {
    this.Model = model;
    this.cursor = cursor;
  }

  each(callback: Function): void {
    this.cursor.each(this.onChange.bind(this, callback));
  }

  onChange(callback: Function, error: rethinkdb.ReqlError, change: Object): void {
    if (error) {
      callback(error);
    } else {
      callback(null, new Change(this.Model, change));
    }
  }

  async next(callback: Function): Promise<any> {
    try {
      const record = await this.cursor.next();
      const model = new this.Model(record);
      if (callback) {
        return callback(null, model);
      }
      return Promise.reject(model);
    } catch (error) {
      if (callback) {
        return callback(error);
      }
      return Promise.reject(error);
    }
  }

  close(): Promise<void> {
    return this.cursor.close();
  }
}
