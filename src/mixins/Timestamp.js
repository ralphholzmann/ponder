const { has } = require('../util');

module.exports = (superclass) => {
  class TimeStamp extends superclass {}

  TimeStamp.schema = {
    created: Date,
    updated: Date
  }

  TimeStamp.beforeSave = function (record) {
    if (!has(record, 'id')) {
      record.created = new Date();
    }

    record.updated = new Date();
  }

  return TimeStamp;
}
