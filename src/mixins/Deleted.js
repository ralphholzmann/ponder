module.exports = (superclass) => {
  class SoftDelete extends superclass {
    async delete() {
      this.deleted = new Date();
      await this.save();
    }
  }

  SoftDelete.RQL = {
    delete: function () {
      return this.update({
        deleted: new Date()
      });
    }
  };

  SoftDelete.schema = {
    deleted: Date
  };

  return SoftDelete;
};
