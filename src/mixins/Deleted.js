const SOFT_DELETE = Symbol('SoftDelete');

module.exports = superclass => {
  class SoftDelete extends superclass {
    static beforeRun(query) {
      if (query.notes[SOFT_DELETE] && query.notes[SOFT_DELETE].withDeleted) {
        return query;
      }

      return query.tapFilterRight({
        deleted: null
      });
    }

    async delete() {
      this.deleted = new Date();
      await this.save();
    }
  }

  SoftDelete.ReQL = {
    delete() {
      return this.update({
        deleted: new Date()
      });
    },

    withDeleted() {
      this.notes[SOFT_DELETE] = {};
      this.notes[SOFT_DELETE].withDeleted = true;
      return this;
    }
  };

  SoftDelete.schema = {
    deleted: Date
  };

  return SoftDelete;
};
