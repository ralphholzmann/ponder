/* @flow */
import r from 'rethinkdb';

type PointArguments = {
  type: 'Point',
  $reql_type$: 'GEOMETRY',
  coordinates: number[]
};

export default (args: PointArguments) => {
  let x;
  let y;
  if (Array.isArray(args) && args.length === 2 && !isNaN(args[0]) && !isNaN(args[1])) {
    [x, y] = args;
  } else if (args.type === 'Point' && args.$reql_type$ === 'GEOMETRY') {
    const coordinates = args.coordinates;
    [x, y] = coordinates;
  }

  return r.point(x, y);
};
