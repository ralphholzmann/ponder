const r = require('rethinkdb');

module.exports = {
  Model: require('./Model'),
  Database: require('./Database'),
  Point: (args) => {
    let x;
    let y;
    if (Array.isArray(args) && args.length === 2 && !isNaN(args[0]) && !isNaN(args[1])) {
      [x, y] = args;
    } else if (args.type === 'Point' && args['$reql_type$'] === 'GEOMETRY') {
      [x, y] = args.coordinates;
    }

    return r.point(x, y);
  }
};
