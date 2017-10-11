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

const has = (object, path) => {
  const [property, ...rest] = path.split('.');
  const hasProperty = Object.prototype.hasOwnProperty.call(object, path);
  if (rest.length) {
    return has(object[property], rest.join('.'));
  }

  return hasProperty;
};

const get = (object, path) => {
  const [property, ...rest] = path.split('.');
  if (has(object, property) && rest.length) {
    return get(object[property], rest.join('.'));
  }
  return object[property];
};


module.exports.selectRow = property => property.split('.').reduce((row, prop) => row(prop), r.row);
module.exports.capitalize = str => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
module.exports.lcfirst = str => str.charAt(0).toLowerCase() + str.slice(1);
module.exports.RQL_METHODS = getRecursivePrototypeKeys(r.db(''));
module.exports.get = get;
module.exports.has = has;
