import test from 'ava';
import { Database, Model } from '../src';

class TestUser extends Model {
}

TestUser.schema = {
  name: String,
  email: String
};

Database.register(TestUser);

test.before(async () => {
  Database.config({
    db: 'test_db'
  });
  await Database.connect();
});

test.after.always('guaranteed cleanup', async () => {
  await Database.teardown();
});

test('Saving a new model instance adds an id to the instance', async (t) => {
  const user = new TestUser({
    name: 'Ralph',
    email: 'foo@bar.com'
  });
  const returnedUser = await user.save();

  t.truthy(user.id);
  t.truthy(returnedUser.id);
});

test('Queries return instances of models', async (t) => {
  const [user] = await TestUser.filter({
    email: 'foo@bar.com'
  }).run();

  t.true(user instanceof TestUser);
  t.is(user.name, 'Ralph');
  t.is(user.email, 'foo@bar.com');
});

test('Saving an existing model updates its correctly', async (t) => {
  const [user] = await TestUser.filter({
    email: 'foo@bar.com'
  }).run();
  user.email = 'baz@bar.com';
  await user.save();

  const [updatedUser] = await TestUser.filter({
    email: 'baz@bar.com'
  }).run();
  t.is(updatedUser.email, 'baz@bar.com');
});
