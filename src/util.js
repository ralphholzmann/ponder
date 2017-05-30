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
