import test from 'ava';
import { Model } from '../../../lib';
import Database from '../../lib/database';
import SoftDeleteMixin from '../../../lib/mixins/Deleted';

class Person extends Model.with(SoftDeleteMixin) {
  static schema = {
    name: String
  };
}

Database.register(Person);

test.before(async () => {
  await Database.connect();
});

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
