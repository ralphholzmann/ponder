class Change {
  constructor(Model, change) {
    const oldValue = change.old_val;
    const newValue = change.new_val;

    this.Model = Model;
    this.old_val = oldValue === null ? null : new Model(oldValue);
    this.new_val = newValue === null ? null : new Model(newValue);
  }

  diff() {
    const delta = {
      id: this.new_val.id
    };

    Object.keys(this.Model.schema).forEach(key => {
      if (this.old_val[key] !== this.new_val[key]) {
        delta[key] = this.new_val[key];
      }
    });

    return delta;
  }
}

module.exports = Change;
