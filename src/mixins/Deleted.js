const SOFT_DELETE = Symbol('SoftDelete');

export default superclass =>
  class SoftDelete extends superclass {
    static beforeRun(query) {
      if (query.notes[SOFT_DELETE] && query.notes[SOFT_DELETE].withDeleted) {
        return query;
      }

      return query.tapFilterRight({
        deleted: null
      });
    }

    static ReQL = {
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

    static schema = {
      deleted: Date
    };

    async delete() {
      this.deleted = new Date();
      await this.save();
    }
  };
