class Change {
  constructor(Model, change) {
    const { old_val, new_val } = change;
    this.Model = Model;
    this.old_val = old_val === null ? null : new Model(old_val);
    this.new_val = new_val === null ? null : new Model(new_val);
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
