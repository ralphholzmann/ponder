/* eslint no-use-before-define: 0 */
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
