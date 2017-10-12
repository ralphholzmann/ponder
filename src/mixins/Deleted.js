module.exports = (superclass) => {
  class SoftDelete extends superclass {
    static beforeRun (query) {
      return query.tapFilterRight('filter', {
        deleted: null
      });
    }

    async delete() {
      this.deleted = new Date();
      await this.save();
    }
  }

  SoftDelete.ReQL = {
    delete: function () {
      return this.update({
        deleted: new Date()
      });
    },

    withDeleted: function () {
      return this;
    }
  };

  SoftDelete.schema = {
    deleted: Date
  };

  return SoftDelete;
};
