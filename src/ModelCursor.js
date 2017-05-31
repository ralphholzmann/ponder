const Change = require('./Change');

class ModelCursor {
  constructor(Model, cursor) {
    this.Model = Model;
    this.cursor = cursor;
  }

  each(callback) {
    this.callback = callback;
    this.cursor.each(this.onChange.bind(this));
  }

  onChange(error, change) {
    if (error) {
      this.callback(error);
    } else {
      this.callback(new Change(this.Model, change));
    }
  }

  async next(callback) {
    try {
      const record = await this.cursor.next();
      const model = new this.Model(record);
      if (callback) {
        callback(null, model);
      } else {
        return Promise.reject(model);
      }
    } catch (error) {
      if (callback) {
        callback(error);
      } else {
        return Promise.reject(error);
      }
    }
  }

  close() {
    return this.cursor.close();
  }
}

module.exports = ModelCursor;
