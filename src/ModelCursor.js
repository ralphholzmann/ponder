/* @flow */
import rethinkdb from 'rethinkdb';
import { EventEmitter } from 'events';
import Change from './Change';
import type Model from './Model';

export default class ModelCursor extends EventEmitter {
  Model: Model;
  cursor: rethinkdb.Cursor;

  constructor(model: Model, cursor: rethinkdb.Cursor) {
    super();
    this.Model = model;
    this.cursor = cursor;
    this.bindEachToEmitter();
  }

  bindEachToEmitter() {
    this.cursor.each((err, change) => {
      if (err) {
        this.emit('error', err);
      } else if (change.state) {
        this.emit('state', change.state);
      } else {
        this.emit('change', new Change(this.Model, change));
      }
    });
  }

  each(callback: Function): void {
    this.on('error', callback);
    this.on('change', change => callback(null, change));
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
