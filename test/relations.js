import test from 'ava';
import { Database, Model } from '../src';

class Asset extends Model {
  static schema = {
    name: String
  }

  static relations = {
    hasMany: {
      quotes: {
        model: 'Quote',
        primaryKey: 'id'
      }
    }
  }
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
  }

  static relations = {
    hasOne: {
      exchange: {
        model: 'Exchange',
        foreignKey: 'id'
      }
    }
  }
}

class Exchange extends Model {
  static schema = {
    name: String,
    acronym: String,
    city: String,
    website: String
  }

  static relations = {
    hasOne: {
      country: {
        model: 'Country',
        foreignKey: 'id'
      }
    }
  }
}

class Country extends Model {
  static schema = {
    name: String,
    code: String,
    iso: String
  }
}

Database.register(Asset);
Database.register(Quote);
Database.register(Exchange);
Database.register(Country);

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
  }
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
  }
}

Database.register(A);
Database.register(B);

test.before(async () => {
  Database.config({
    db: 'test_db'
  });
  await Database.connect();
});

test('Can create complex relations before IDs exist', async (t) => {
  const asset = new Asset({
    name: 'Apple Inc.'
  });

  const quote = new Quote({
    symbol: 'AAPL',
    ask: 153.21,
    bid: 154.21,
    lastPrice: 153.71,
    openPrice: 153.60,
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

test('Can handle 1:1 circular dependencies', async (test) => {
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
