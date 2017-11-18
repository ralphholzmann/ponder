const { has } = require('../util');

export default superclass =>
  class TimeStamp extends superclass {
    static schema = {
      created: Date,
      updated: Date
    };

    static beforeSave(record) {
      if (!has(record, 'id')) {
        record.created = new Date();
      }

      record.updated = new Date();
    }
  };
