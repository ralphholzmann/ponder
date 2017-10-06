module.exports = (superclass) => {
  class TimeStamp extends superclass {}

  TimeStamp.schema = {
    created: Date,
    updated: Date
  }

  return TimeStamp;
}
