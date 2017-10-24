import test from 'ava';
import { Database, Model } from '../src';

class Asset extends Model {
  static schema = {
    name: String
  };

  static relations = {
    hasMany: {
      quotes: {
        model: 'Quote',
        primaryKey: 'id'
      }
    }
  };
}

class Quote extends Model {
  static schema = {
    symbol: String,
    ask: Number,
    bid: Number,
    lastPrice: Number,
    openPrice: Number,
    closePrice: Number,
    volume: Number
  };

  static relations = {
    hasOne: {
      exchange: {
        model: 'Exchange',
        foreignKey: 'id'
      }
    }
  };
}

class Exchange extends Model {
  static schema = {
    name: String,
    acronym: String,
    city: String,
    website: String
  };

  static relations = {
    hasOne: {
      country: {
        model: 'Country',
        foreignKey: 'id'
      }
    }
  };
}

class Country extends Model {
  static schema = {
    name: String,
    code: String,
    iso: String
  };
}

Database.register(Asset);
Database.register(Quote);
Database.register(Exchange);
Database.register(Country);

test.before(async () => {
  Database.config({
    db: 'test_db'
  });
  await Database.connect();
});

test('Can create complex relations before IDs exist', async t => {
  const asset = new Asset({
    name: 'Apple Inc.'
  });

  const quote = new Quote({
    symbol: 'AAPL',
    ask: 153.21,
    bid: 154.21,
    lastPrice: 153.71,
    openPrice: 153.6,
    closePrice: 153.61,
    volume: 20000
  });

  const exchange = new Exchange({
    name: 'NASDAQ',
    acronym: 'NASDAQ',
    city: 'New York',
    website: 'www.nasdaq.com'
  });

  const country = new Country({
    name: 'United States',
    code: 'US',
    iso: 'USA'
  });

  exchange.country = country;
  quote.exchange = exchange;
  asset.quotes.push(quote);

  await asset.save();
  t.is(asset.id, quote.assetId);
  t.is(quote.exchangeId, exchange.id);
  t.is(exchange.countryId, country.id);
});

class A extends Model {
  static schema = {
    name: String
  };

  static relations = {
    hasOne: {
      b: {
        model: 'B',
        foreignKey: 'id'
      }
    }
  };
}

class B extends Model {
  static schema = {
    name: String
  };

  static relations = {
    hasOne: {
      a: {
        model: 'A',
        foreignKey: 'id'
      }
    }
  };
}

Database.register(A);
Database.register(B);

test('Can handle 1:1 circular dependencies', async t => {
  const a = new A({
    name: 'model a'
  });

  const b = new B({
    name: 'model b'
  });

  a.b = b;
  b.a = a;

  await a.save();

  t.is(a.bId, b.id);
  t.is(b.aId, a.id);
});

class C extends Model {
  static schema = {
    name: String
  };

  static relations = {
    hasOne: {
      d: {
        model: 'D',
        foreignKey: 'id'
      }
    }
  };
}

class D extends Model {
  static schema = {
    name: String
  };

  static relations = {
    hasOne: {
      e: {
        model: 'E',
        foreignKey: 'id'
      }
    }
  };
}

class E extends Model {
  static schema = {
    name: String
  };

  static relations = {
    hasOne: {
      c: {
        model: 'C',
        foreignKey: 'id'
      }
    }
  };
}

Database.register(C);
Database.register(D);
Database.register(E);

test('Can handle 3 way circular dependencies', async t => {
  const c = new C({
    name: 'model c'
  });

  const d = new D({
    name: 'model d'
  });

  const e = new E({
    name: 'model e'
  });

  c.d = d;
  d.e = e;
  e.c = c;

  await c.save();

  t.is(c.dId, d.id);
  t.is(d.eId, e.id);
  t.is(e.cId, c.id);
});

class Post extends Model {
  static relations = {
    hasMany: {
      tags: {
        model: 'Tag',
        foreignKey: 'id'
      }
    }
  };
}

class Tag extends Model {
  static relations = {
    hasMany: {
      posts: {
        model: 'Post',
        foreignKey: 'id'
      }
    }
  };
}
