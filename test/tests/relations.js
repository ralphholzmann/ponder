import test from 'ava';
import { Model } from '../../lib';
import Database from '../lib/database';

test.before(async () => {
  await Database.connect();
});

class Asset extends Model {
  static schema = {
    name: String
  };

  static hasMany = {
    quotes: 'Quote'
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

  static belongsTo = {
    exchange: 'Exchange'
  };
}

class Exchange extends Model {
  static schema = {
    name: String,
    acronym: String,
    city: String,
    website: String
  };

  static belongsTo = {
    country: 'Country'
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
  await asset.quotes.addRelation(quote);

  t.is(asset.id, quote.assetId);
  t.is(quote.exchangeId, exchange.id);
  t.is(exchange.countryId, country.id);
});

test('Can load complex relations', async t => {
  const [asset] = await Asset.filter({
    name: 'Apple Inc.'
  })
    .populate()
    .run();

  t.truthy(asset.quotes[0]);
  t.truthy(asset.quotes[0].exchange);
  t.truthy(asset.quotes[0].exchange.country);
});

test('Can define which relations get loaded', async t => {
  const [asset] = await Asset.filter({
    name: 'Apple Inc.'
  })
    .populate({
      quotes: {
        exchange: true
      }
    })
    .run();

  t.truthy(asset.quotes[0]);
  t.truthy(asset.quotes[0].exchange);
  t.falsy(asset.quotes[0].exchange.country);
});

class A extends Model {
  static schema = {
    name: String
  };

  static belongsTo = {
    b: 'B'
  };
}

class B extends Model {
  static schema = {
    name: String
  };

  static belongsTo = {
    a: 'A'
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

  static belongsTo = {
    d: 'D'
  };
}

class D extends Model {
  static schema = {
    name: String
  };

  static belongsTo = {
    e: 'E'
  };
}

class E extends Model {
  static schema = {
    name: String
  };

  static belongsTo = {
    c: 'C'
  };
}

Database.register(C);
Database.register(D);
Database.register(E);

test('Can handle saving 3 way circular dependencies', async t => {
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

test('Can handle loading 3 way circular dependencies', async t => {
  const [c] = await C.filter({
    name: 'model c'
  })
    .populate()
    .run();

  t.truthy(c.d.e);
});

class Post extends Model {
  static schema = {
    title: String,
    body: String,
    date: Date
  };

  static hasAndBelongsToMany = {
    tags: {
      model: 'Tag',
      property: 'posts'
    }
  };
}

class Tag extends Model {
  static schema = {
    name: String
  };
}

Database.register(Post);
Database.register(Tag);

test('Handles creation of many to many relations correctly', async t => {
  const post = new Post({
    title: 'How to defeat Lavos, the easy way!',
    body: 'Just kidding, there is no easy way.',
    date: new Date()
  });

  const tag1 = new Tag({
    name: 'tutorial'
  });
  const tag2 = new Tag({
    name: 'lavos'
  });

  await post.tags.addRelation(tag1, tag2);
  t.is(post.tags[0], tag1);
  t.is(tag1.posts[0], post);
  t.is(post.tags[1], tag2);
  t.is(tag2.posts[0], post);

  t.truthy(post.id);
  t.truthy(tag1.id);
  t.truthy(tag2.id);

  const [retrievedPost] = await Post.filter({
    title: 'How to defeat Lavos, the easy way!'
  })
    .populate()
    .run();

  t.is(post.id, retrievedPost.id);
  t.true(retrievedPost.tags.some(tag => tag.id === tag1.id));
  t.true(retrievedPost.tags.some(tag => tag.id === tag2.id));

  t.true(retrievedPost.tags[0] instanceof Tag);
  t.true(retrievedPost.tags[1] instanceof Tag);

  const [retrievedTag] = await Tag.filter({
    name: 'tutorial'
  })
    .populate()
    .run();

  t.is(tag1.id, retrievedTag.id);
  t.true(retrievedTag.posts[0] instanceof Post);
});

test('Handles updating of many to many relations correctly', async t => {
  const [post] = await Post.filter({
    title: 'How to defeat Lavos, the easy way!'
  })
    .populate()
    .run();

  t.is(post.tags.length, 2);
  await post.tags.removeRelation(post.tags[0]);
  t.is(post.tags.length, 1);

  const [post2] = await Post.filter({
    title: 'How to defeat Lavos, the easy way!'
  })
    .populate()
    .run();
  t.is(post2.tags.length, 1);
});

class User extends Model {
  static schema = {
    username: String
  };

  static hasAndBelongsToMany = {
    reportedMessages: {
      model: 'Message',
      property: 'reportedBy'
    }
  };
}

class Message extends Model {
  static schema = {
    text: String
  };

  static belongsTo = {
    user: 'User'
  };
}

Database.register(User);
Database.register(Message);

test('Handles multiple many to many relations of the same model types', async t => {
  const user1 = new User({
    username: 'jackson'
  });

  const user2 = new User({
    username: 'ralph'
  });

  const message1 = new Message({
    text: 'This is a test',
    user: user1
  });

  const message2 = new Message({
    text: 'This is also a test',
    user: user2
  });

  await user1.reportedMessages.addRelation(message2);

  const user1copy = await User.get(user1.id)
    .populate()
    .run();

  t.is(user1copy.reportedMessages.length, 1);
});
