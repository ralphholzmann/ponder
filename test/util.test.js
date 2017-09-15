import test from 'ava';
import { get, has } from '../src/util';

test('`get` retrieves simple property', (t) => {
  const obj = {
    foo: 'bar'
  };

  t.is(get(obj, 'foo'), obj.foo);
});

test('`get` retrieves nested property', (t) => {
  const obj = {
    foo: {
      bar: 'baz'
    }
  };

  t.is(get(obj, 'foo.bar'), obj.foo.bar);
});

test('`get` retrieves deepy nested property', (t) => {
  const obj = {
    foo: {
      bar: {
        baz: 5
      }
    }
  };

  t.is(get(obj, 'foo.bar.baz'), obj.foo.bar.baz);
});

test('`get` returns undefined for missing property', (t) => {
  const obj = {
    foo: {
      bar: {
        baz: 5
      }
    }
  };

  t.is(get(obj, 'foo.foo'), undefined);
});

test('`has` returns true for existing property', (t) => {
  const obj = {
    foo: {
      bar: {
        baz: 5
      }
    }
  };

  t.true(has(obj, 'foo.bar'));
});

test('`has` returns false for missing property', (t) => {
  const obj = {
    foo: {
      bar: {
        baz: 5
      }
    }
  };

  t.false(has(obj, 'foo.baz'));
});