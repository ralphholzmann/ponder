const r = require('rethinkdb');

function getRecursivePrototypeKeys(object, set = new Set()) {
  const proto = Object.getPrototypeOf(object);

  if (proto) {
    Object.keys(proto).forEach(method => set.add(method));
    return getRecursivePrototypeKeys(proto, set);
  }

  set.delete('run');
  set.delete('constructor');

  return set;
}

module.exports.RQL_METHODS = getRecursivePrototypeKeys(r.db(''));

module.exports.capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
module.exports.lcfirst = (str) => str.charAt(0).toLowerCase() + str.slice(1);

const get = module.exports.get = (object, path) => {
  const [property, ...rest] = path.split('.');
  if (object.hasOwnProperty(property)) {
    if (rest.length) {
      return get(object[property], rest.join('.'));
    } else {
      return object[property];
    }
  }
};

module.exports.has = (object, path) => {
  return !!get(object, path);
};

module.exports.selectRow = (property) => property.split('.').reduce((row, prop) => row(prop), r.row);
