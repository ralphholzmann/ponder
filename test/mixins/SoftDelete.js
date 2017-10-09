import test from 'ava';
import { Database, Model } from '../../src';
import SoftDeleteMixin from '../../src/mixins/Deleted.js';

class Person extends Model.with(SoftDeleteMixin) {
  static schema = {
    name: String
  }
};

test.before(async () => {
  Database.config({
    db: 'test_db'
  });
  await Database.connect();
});

Database.register(Person);

test('Deleting from model definition sets deleted to a new date', async (t) => {
  const user = new Person({
    name: 'Ralph'
  });
  await user.save();
  await Person.filter({
    name: 'Ralph'
  }).delete().run();

  const [deletedUser] = await Person.run();
  t.truthy(deletedUser.deleted);
});
