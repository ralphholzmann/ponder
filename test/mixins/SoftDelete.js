import test from 'ava';
import { Database, Model } from '../../src';
import SoftDeleteMixin from '../../src/mixins/Deleted.js';

class Person extends Model.with(SoftDeleteMixin) {
  static schema = {
    name: String
  };
}

test.before(async () => {
  Database.config({
    db: 'test_db'
  });
  await Database.connect();
});

Database.register(Person);

test('Deleting from model instance sets deleted to a new date', async t => {
  const user = new Person({
    name: 'Ralph'
  });
  await user.save();

  t.is(await Person.count().run(), 1);

  await user.delete();

  t.is(await Person.count().run(), 0);
  t.is(
    await Person.withDeleted()
      .count()
      .run(),
    1
  );
});

test('Deleting from model class sets deleted to a new date', async t => {
  const user = new Person({
    name: 'Martin'
  });
  await user.save();

  t.is(await Person.count().run(), 1);

  await Person.delete().run();

  t.is(await Person.count().run(), 0);
  t.is(
    await Person.withDeleted()
      .count()
      .run(),
    2
  );
});
