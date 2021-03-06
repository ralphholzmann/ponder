/* @flow */
/* eslint no-use-before-define: 0 */
import rethinkdb from 'rethinkdb';
import type Model from './Model';

interface Indexable {
  [key: string]: string;
}

export type Record = {
  id: string
} | null;

const BASE_PROTO = Object.getPrototypeOf(class {});

export const get = (object: Object, path: string): mixed => {
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

export const getInheritedPropertyList = (prototype: Indexable | Model, property: string): Array<any> => {
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

export const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);
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

const DB_TYPE = 'db';
const TABLE_TYPE = 'table';
const ARRAY_TYPE = 'array';
const OBJECT_TYPE = 'object';
const BOOLEAN_TYPE = 'boolean';
const NUMBER_TYPE = 'number';
const VALUE_TYPE = 'value';
const R_TYPE = 'r';
const SELECTION_TYPE = 'selection';
const SINGLE_SELECTION_TYPE = 'singleSelection';
const STREAM_TYPE = 'stream';
const SEQUENCE_TYPE = 'sequence';
const BINARY_TYPE = 'binary';
const STRING_TYPE = 'string';
const GROUPED_STREAM_TYPE = 'groupedStream';
const GROUPED_DATA_TYPE = 'groupedData';
const ELEMENT_TYPE = 'element';
const SPECIAL_TYPE = 'special';
const TIME_TYPE = 'time';
const ERROR_TYPE = 'error';
const GEOMETRY_TYPE = 'geometry';
const LINE_TYPE = 'line';
const POLYGON_TYPE = 'polygon';
const POINT_TYPE = 'point';

export const transforms: Map<string, Map<string, string>> = new Map([
  [
    R_TYPE,
    new Map([
      ['dbCreate', OBJECT_TYPE],
      ['dbDrop', OBJECT_TYPE],
      ['dbList', ARRAY_TYPE],
      ['tableCreate', OBJECT_TYPE],
      ['db', DB_TYPE],
      ['table', TABLE_TYPE],
      ['map', ARRAY_TYPE],
      ['union', ARRAY_TYPE],
      ['group', GROUPED_STREAM_TYPE],
      ['reduce', VALUE_TYPE],
      ['count', NUMBER_TYPE],
      ['sum', NUMBER_TYPE],
      ['avg', NUMBER_TYPE],
      ['min', ELEMENT_TYPE],
      ['max', ELEMENT_TYPE],
      ['distinct', ARRAY_TYPE],
      ['contains', BOOLEAN_TYPE],
      ['row', VALUE_TYPE],
      ['literal', SPECIAL_TYPE],
      ['and', BOOLEAN_TYPE],
      ['or', BOOLEAN_TYPE],
      ['random', NUMBER_TYPE],
      ['round', NUMBER_TYPE],
      ['ceil', NUMBER_TYPE],
      ['floor', NUMBER_TYPE],
      ['now', TIME_TYPE],
      ['time', TIME_TYPE],
      ['epochTime', TIME_TYPE],
      ['ISO8601', TIME_TYPE],
      ['args', SPECIAL_TYPE],
      ['binary', BINARY_TYPE],
      ['range', STREAM_TYPE],
      ['error', ERROR_TYPE],
      ['expr', VALUE_TYPE],
      ['js', VALUE_TYPE],
      ['info', OBJECT_TYPE],
      ['json', VALUE_TYPE],
      ['http', STREAM_TYPE],
      ['uuid', STRING_TYPE],
      ['circle', GEOMETRY_TYPE],
      ['distance', NUMBER_TYPE],
      ['geojson', GEOMETRY_TYPE],
      ['intersects', BOOLEAN_TYPE],
      ['line', LINE_TYPE],
      ['point', POINT_TYPE],
      ['grant', OBJECT_TYPE],
      ['wait', OBJECT_TYPE],
      ['tableCreate', OBJECT_TYPE],
      ['tableDrop', OBJECT_TYPE],
      ['tableList', ARRAY_TYPE]
    ])
  ],
  [
    DB_TYPE,
    new Map([
      ['tableCreate', OBJECT_TYPE],
      ['tableDrop', OBJECT_TYPE],
      ['tableList', ARRAY_TYPE],
      ['table', TABLE_TYPE],
      ['grant', OBJECT_TYPE],
      ['config', SELECTION_TYPE],
      ['rebalance', OBJECT_TYPE],
      ['reconfigure', OBJECT_TYPE],
      ['wait', OBJECT_TYPE]
    ])
  ],
  [
    TABLE_TYPE,
    new Map([
      ['indexCreate', OBJECT_TYPE],
      ['indexDrop', OBJECT_TYPE],
      ['indexList', ARRAY_TYPE],
      ['indexRename', OBJECT_TYPE],
      ['indexWait', ARRAY_TYPE],
      ['insert', OBJECT_TYPE],
      ['update', OBJECT_TYPE],
      ['replace', OBJECT_TYPE],
      ['delete', OBJECT_TYPE],
      ['sync', OBJECT_TYPE],
      ['get', SINGLE_SELECTION_TYPE],
      ['getAll', SELECTION_TYPE],
      ['between', SEQUENCE_TYPE],
      ['orderBy', SEQUENCE_TYPE],
      ['distinct', STREAM_TYPE],
      ['object', OBJECT_TYPE],
      ['getIntersecting', SELECTION_TYPE],
      ['getNearest', ARRAY_TYPE],
      ['grant', OBJECT_TYPE],
      ['config', SELECTION_TYPE],
      ['rebalance', OBJECT_TYPE],
      ['reconfigure', OBJECT_TYPE],
      ['status', SELECTION_TYPE],
      ['wait', OBJECT_TYPE],
      ['filter', SELECTION_TYPE],
      ['orderBy', SELECTION_TYPE],
      ['slice', SELECTION_TYPE],
      ['nth', OBJECT_TYPE],
      ['count', NUMBER_TYPE]
    ])
  ],
  [
    SELECTION_TYPE,
    new Map([
      ['update', OBJECT_TYPE],
      ['replace', OBJECT_TYPE],
      ['delete', OBJECT_TYPE],
      ['filter', SELECTION_TYPE],
      ['distinct', SELECTION_TYPE],
      ['count', NUMBER_TYPE],
      ['orderBy', SELECTION_TYPE],
      ['slice', SELECTION_TYPE],
      ['nth', SELECTION_TYPE],
      ['map', SELECTION_TYPE],
      ['pluck', SELECTION_TYPE]
    ])
  ],
  [
    SINGLE_SELECTION_TYPE,
    new Map([
      ['update', OBJECT_TYPE],
      ['replace', OBJECT_TYPE],
      ['delete', OBJECT_TYPE],
      ['do', OBJECT_TYPE],
      ['pluck', OBJECT_TYPE],
      ['without', OBJECT_TYPE],
      ['merge', OBJECT_TYPE],
      ['getField', VALUE_TYPE],
      ['keys', ARRAY_TYPE],
      ['values', ARRAY_TYPE]
    ])
  ],
  [
    STREAM_TYPE,
    new Map([
      ['filter', STREAM_TYPE],
      ['zip', STREAM_TYPE],
      ['concatMap', STREAM_TYPE],
      ['slice', STREAM_TYPE],
      ['union', STREAM_TYPE],
      ['sample', ARRAY_TYPE]
    ])
  ],
  [
    ARRAY_TYPE,
    new Map([
      ['filter', ARRAY_TYPE],
      ['innerJoin', ARRAY_TYPE],
      ['outerJoin', ARRAY_TYPE],
      ['zip', ARRAY_TYPE],
      ['map', ARRAY_TYPE],
      ['withFields', ARRAY_TYPE],
      ['concatMap', ARRAY_TYPE],
      ['skip', ARRAY_TYPE],
      ['limit', ARRAY_TYPE],
      ['slice', ARRAY_TYPE],
      ['union', ARRAY_TYPE],
      ['sample', ARRAY_TYPE],
      ['pluck', ARRAY_TYPE],
      ['without', ARRAY_TYPE],
      ['merge', ARRAY_TYPE],
      ['append', ARRAY_TYPE],
      ['prepend', ARRAY_TYPE],
      ['difference', ARRAY_TYPE],
      ['setInsert', ARRAY_TYPE],
      ['setUnion', ARRAY_TYPE],
      ['setIntersection', ARRAY_TYPE],
      ['setDifference', ARRAY_TYPE],
      ['hasFields', ARRAY_TYPE],
      ['insertAt', ARRAY_TYPE],
      ['spliceAt', ARRAY_TYPE],
      ['deleteAt', ARRAY_TYPE],
      ['changeAt', ARRAY_TYPE],
      ['mul', ARRAY_TYPE]
    ])
  ],
  [
    SEQUENCE_TYPE,
    new Map([
      ['innerJoin', STREAM_TYPE],
      ['outerJoin', STREAM_TYPE],
      ['eqJoin', SEQUENCE_TYPE],
      ['map', STREAM_TYPE],
      ['withFields', STREAM_TYPE],
      ['orderBy', ARRAY_TYPE],
      ['skip', STREAM_TYPE],
      ['limit', STREAM_TYPE],
      ['nth', OBJECT_TYPE],
      ['offsetsOf', ARRAY_TYPE],
      ['isEmpty', BOOLEAN_TYPE],
      ['sample', SELECTION_TYPE],
      ['group', GROUPED_STREAM_TYPE],
      ['reduce', VALUE_TYPE],
      ['fold', SEQUENCE_TYPE],
      ['count', NUMBER_TYPE],
      ['sum', NUMBER_TYPE],
      ['avg', NUMBER_TYPE],
      ['min', ELEMENT_TYPE],
      ['max', ELEMENT_TYPE],
      ['distinct', ARRAY_TYPE],
      ['contains', BOOLEAN_TYPE],
      ['pluck', STREAM_TYPE],
      ['without', STREAM_TYPE],
      ['merge', STREAM_TYPE],
      ['getField', SEQUENCE_TYPE],
      ['hasFields', STREAM_TYPE],
      ['forEach', OBJECT_TYPE],
      ['includes', SEQUENCE_TYPE],
      ['intersects', SEQUENCE_TYPE]
    ])
  ],
  [BINARY_TYPE, new Map([['slice', BINARY_TYPE], ['count', NUMBER_TYPE]])],
  [
    STRING_TYPE,
    new Map([
      ['slice', STRING_TYPE],
      ['count', NUMBER_TYPE],
      ['match', OBJECT_TYPE],
      ['split', ARRAY_TYPE],
      ['upcase', STRING_TYPE],
      ['downcase', STRING_TYPE]
    ])
  ],
  [GROUPED_STREAM_TYPE, new Map([['ungroup', ARRAY_TYPE]])],
  [GROUPED_DATA_TYPE, new Map([['ungroup', ARRAY_TYPE]])],
  [
    OBJECT_TYPE,
    new Map([
      ['count', NUMBER_TYPE],
      ['pluck', OBJECT_TYPE],
      ['do', OBJECT_TYPE],
      ['without', OBJECT_TYPE],
      ['merge', OBJECT_TYPE],
      ['getField', VALUE_TYPE],
      ['hasFields', BOOLEAN_TYPE],
      ['keys', ARRAY_TYPE],
      ['values', ARRAY_TYPE]
    ])
  ],
  [
    VALUE_TYPE,
    new Map([
      ['add', VALUE_TYPE],
      ['eq', BOOLEAN_TYPE],
      ['ne', BOOLEAN_TYPE],
      ['gt', BOOLEAN_TYPE],
      ['ge', BOOLEAN_TYPE],
      ['lt', BOOLEAN_TYPE],
      ['le', BOOLEAN_TYPE],
      ['toJsonString', STRING_TYPE],
      ['toJSON', STRING_TYPE]
    ])
  ],
  [
    TIME_TYPE,
    new Map([
      ['add', TIME_TYPE],
      ['sub', TIME_TYPE],
      ['inTimezone', TIME_TYPE],
      ['timezone', STRING_TYPE],
      ['during', BOOLEAN_TYPE],
      ['time', TIME_TYPE],
      ['timeOfDay', NUMBER_TYPE],
      ['year', NUMBER_TYPE],
      ['month', NUMBER_TYPE],
      ['day', NUMBER_TYPE],
      ['dayOfWeek', NUMBER_TYPE],
      ['dayOfYear', NUMBER_TYPE],
      ['hours', NUMBER_TYPE],
      ['minutes', NUMBER_TYPE],
      ['seconds', NUMBER_TYPE],
      ['toISO8601', STRING_TYPE],
      ['toEpochTime', NUMBER_TYPE]
    ])
  ],
  [
    NUMBER_TYPE,
    new Map([
      ['sub', NUMBER_TYPE],
      ['mul', NUMBER_TYPE],
      ['div', NUMBER_TYPE],
      ['mod', NUMBER_TYPE],
      ['round', NUMBER_TYPE],
      ['ceil', NUMBER_TYPE],
      ['floor', NUMBER_TYPE]
    ])
  ],
  [BOOLEAN_TYPE, new Map([['and', BOOLEAN_TYPE], ['or', BOOLEAN_TYPE], ['not', BOOLEAN_TYPE]])],
  [
    GEOMETRY_TYPE,
    new Map([
      ['distance', NUMBER_TYPE],
      ['toGeojson', OBJECT_TYPE],
      ['includes', BOOLEAN_TYPE],
      ['intersects', BOOLEAN_TYPE]
    ])
  ],
  [LINE_TYPE, new Map([['fill', POLYGON_TYPE]])],
  [POINT_TYPE, new Map([['point', POINT_TYPE]])],
  [POLYGON_TYPE, new Map([['polygon', POLYGON_TYPE], ['polygonSub', POLYGON_TYPE]])]
]);

export const forEachAsync = async function forEachAsync(collection: Array<any> | Object, iterator: Function) {
  if (collection) {
    if (Array.isArray(collection)) {
      for (let i = 0; i < collection.length; i += 1) {
        await iterator(collection[i], i, collection);
      }
    } else {
      for (const [key, value] of Object.entries(collection)) {
        await iterator(value, key, collection);
      }
    }
  }
};

export const selectRow = (property: string) => property.split('.').reduce((row, prop) => row(prop), rethinkdb.row);

export const assert = (test: Function, message: string) => {
  if (process.env.NODE_ENV !== 'production' && !test()) {
    throw new Error(message);
  }
};
