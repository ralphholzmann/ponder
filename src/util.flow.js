/* @flow */
/* eslint no-use-before-define: 0 */
import rethinkdb from 'rethinkdb';

const BASE_PROTO = Object.getPrototypeOf(class {});

export const get = (object: {}, path: string): mixed => {
  const [property, ...rest] = path.split('.');
  if (has(object, property) && rest.length) {
    return get(object[property], rest.join('.'));
  }
  return object[property];
};

export const has = (object: {}, path: string): boolean => {
  const [property, ...rest] = path.split('.');
  const hasProperty = Object.prototype.hasOwnProperty.call(object, path);
  if (rest.length) {
    return has(object[property], rest.join('.'));
  }
  return hasProperty;
};

export const getInheritedPropertyList = (prototype: {}, property: string): Array<mixed> => {
  const result = [];
  const nextPrototype = Object.getPrototypeOf(prototype);

  if (has(prototype, property)) {
    result.push(prototype[property]);
  }

  if (nextPrototype !== BASE_PROTO) {
    result.push(...getInheritedPropertyList(nextPrototype, property));
  }

  return result;
};

export const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
export const lcfirst = (str: string) => str.charAt(0).toLowerCase() + str.slice(1);

export const REQL_METHODS: Array<string> = [
  'add',
  'and',
  'append',
  'args',
  'avg',
  'between',
  'bracket',
  'branch',
  'build',
  'ceil',
  'changeAt',
  'changes',
  'coerceTo',
  'compose',
  'concatMap',
  'config',
  'contains',
  'count',
  'date',
  'day',
  'dayOfWeek',
  'dayOfYear',
  'default',
  'delete',
  'deleteAt',
  'difference',
  'distance',
  'distinct',
  'div',
  'do',
  'downcase',
  'during',
  'eq',
  'eqJoin',
  'fill',
  'filter',
  'floor',
  'fold',
  'forEach',
  'ge',
  'get',
  'getAll',
  'getField',
  'getIntersecting',
  'getNearest',
  'grant',
  'group',
  'gt',
  'hasFields',
  'hours',
  'inTimezone',
  'includes',
  'indexCreate',
  'indexDrop',
  'indexList',
  'indexRename',
  'indexStatus',
  'indexWait',
  'info',
  'innerJoin',
  'insert',
  'insertAt',
  'intersects',
  'isEmpty',
  'keys',
  'le',
  'limit',
  'lt',
  'map',
  'match',
  'max',
  'merge',
  'min',
  'minutes',
  'mod',
  'month',
  'mul',
  'ne',
  'not',
  'nth',
  'offsetsOf',
  'optargs',
  'or',
  'orderBy',
  'outerJoin',
  'pluck',
  'polygonSub',
  'prepend',
  'rebalance',
  'reconfigure',
  'reduce',
  'replace',
  'round',
  'sample',
  'seconds',
  'setDifference',
  'setInsert',
  'setIntersection',
  'setUnion',
  'showRunWarning',
  'skip',
  'slice',
  'spliceAt',
  'split',
  'status',
  'sub',
  'sum',
  'sync',
  'table',
  'tableCreate',
  'tableDrop',
  'tableList',
  'timeOfDay',
  'timezone',
  'toEpochTime',
  'toGeojson',
  'toISO8601',
  'toJSON',
  'toJsonString',
  'toString',
  'typeOf',
  'ungroup',
  'union',
  'upcase',
  'update',
  'uuid',
  'values',
  'wait',
  'withFields',
  'without',
  'year',
  'zip'
];
