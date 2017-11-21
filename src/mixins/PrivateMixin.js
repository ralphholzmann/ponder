const NAMESPACE = Symbol('ProtectedMixin');

export default superclass =>
  class PrivateMixin extends superclass {
    setContext(context) {
      this[NAMESPACE] = {
        context
      };
    }

    toJSON() {
      const json = super.toJSON();
      const { context } = this[NAMESPACE];
      return Object.keys(this.constructor.schema).reduce(
        (response, property) => {
          const config = this.constructor.schema[property];
          if (config.type) {
            if (
              config.private === false ||
              config.private === undefined ||
              (typeof config.private === 'function' && config.private(this, context))
            ) {
              response[property] = json[property];
            } else if (config.private === true && Object.prototype.hasOwnProperty.call(response, property)) {
              delete response[property];
            }
          } else {
            response[property] = json[property];
          }
          return response;
        },
        {
          id: this.id
        }
      );
    }
  };
