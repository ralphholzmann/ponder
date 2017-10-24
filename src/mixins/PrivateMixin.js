const NAMESPACE = Symbol('ProtectedMixin');

module.exports = superclass => {
  class PrivateMixin extends superclass {
    setContext(context) {
      this[NAMESPACE] = {
        context
      };
    }

    toJSON() {
      const { context } = this[NAMESPACE];
      return Object.keys(this.constructor.schema).reduce((json, property) => {
        const config = this.constructor.schema[property];
        if (config.type) {
          if (config.private === false || (typeof config.private === 'function' && config.private(this, context))) {
            json[property] = this[property];
          }
        } else {
          json[property] = this[property];
        }
        return json;
      }, {});
    }
  }

  return PrivateMixin;
};
