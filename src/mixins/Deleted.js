module.exports = (superclass) => {
  class Deleted extends superclass {
    async delete() {
      this.deleted = new Date();
      await this.save();
    }
  }

  Deleted.schema = {
    deleted: Date
  };

  return Deleted;
};
