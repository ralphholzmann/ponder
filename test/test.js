import test from 'ava';
import { Database, Model } from '../src';

class Character extends Model {}

Character.schema = {
  name: String,
  email: String
};

Character.indexes = {
  'name': true,
  'name_email': ['name', 'email']
};

Character.relations = [{
  model: ''
}]

Database.register(Character);

test.before(async () => {
  Database.config({
    db: 'test_db'
  });
  await Database.connect();
});

test('Saving a new model instance adds an id to the instance', async (t) => {
  const user = new TestUser({
    name: 'Crono',
    email: 'crono@theendoftime.com'
  });
  const returnedUser = await user.save();

  t.truthy(user.id);
  t.truthy(returnedUser.id);
});

test('Queries return instances of models', async (t) => {
  const [user] = await TestUser.filter({
    email: 'crono@theendoftime.com'
  }).run();

  t.true(user instanceof TestUser);
  t.is(user.name, 'Crono');
  t.is(user.email, 'crono@theendoftime.com');
});

test('Saving an existing model updates correctly', async (t) => {
  const [user] = await TestUser.filter({
    email: 'crono@theendoftime.com'
  }).run();
  user.email = 'frog@theendoftime.com';
  await user.save();

  const [updatedUser] = await TestUser.filter({
    email: 'frog@theendoftime.com'
  }).run();
  t.is(updatedUser.email, 'frog@theendoftime.com');
});

test('simple indexes are created successfully', async (t) => {
  const [user] = await TestUser.getAll('Crono', {
    index: 'name'
  }).run();
  t.true(user instanceof TestUser);
  t.is(user.name, 'Crono');
  t.is(user.email, 'frog@theendoftime.com');
});

test('compound indexes are created successfully', async (t) => {
  const [user] = await TestUser.getAll(['Crono', 'frog@theendoftime.com'], {
    index: 'name_email'
  }).run();
  t.true(user instanceof TestUser);
  t.is(user.name, 'Crono');
  t.is(user.email, 'frog@theendoftime.com');
});

test('Changefeeds return instances of models', async (t) => {
  const cursor = await TestUser.changes().run();
  await new Promise((resolve) => {
    cursor.each((change) => {
      t.true(change.new_val instanceof TestUser);
      resolve();
    });

    const user = new TestUser({
      name: 'Marle',
      email: 'marle@thendoftime.com'
    });
    user.save();
  });
  await cursor.close();
});

test('Changefeeds `diff` correctly', async (t) => {
  let count = 0;
  const cursor = await TestUser.changes().run();
  await new Promise(async (resolve) => {
    const user = new TestUser({
      name: 'Marle',
      email: 'marle@thendoftime.com'
    });

    cursor.each((change) => {
      if (count === 1) {
        const diff = change.diff();
        t.is(user.id, diff.id);
        t.is(user.email, diff.email);
        resolve();
      }
      count += 1;
    });

    await user.save();
    user.email = 'marle@fiendlordskeep.com';
    await user.save();
  });
  await cursor.close();
});