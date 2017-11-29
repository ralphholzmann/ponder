import test from 'ava';
import r from 'rethinkdb';
import { Model, UniquePropertyMixin } from '../../../lib';
import Database, { TEST_DATABASE_NAME } from '../../lib/database';

class ChatUser extends Model.with(UniquePropertyMixin) {
  static schema = {
    name: String,
    username: {
      type: String,
      unique: true
    },
    email: {
      type: String,
      unique: true
    }
  };
}

Database.register(ChatUser);

test.before(async () => {
  await Database.connect();
});

test('unique property creates index table to enforce uniqueness', async t => {
  const tableList = await Database.execute(r.db(TEST_DATABASE_NAME).tableList());
  t.true(tableList.includes('ChatUser_username_unique'));
  t.true(tableList.includes('ChatUser_email_unique'));
});

/** /
test('unique values creates static is[prop]Unique method and returns uniquess of given value', async t => {
  t.false(await Character.isNameUnique('Crono'));
  t.true(await Character.isNameUnique('Lavos'));
});

test('throws error when trying to create model with duplicate unique value and does not save duplicate model', async t => {
  let cronos = await Character.filter({ name: 'Crono' }).run();
  t.is(cronos.length, 1);
  const duplicate = new Character({
    name: 'Crono',
    age: 17,
    weaponType: 'katana',
    friends: ['Marle']
  });
  const error = await t.throws(duplicate.save());
  t.is(error.message, "'Character.name' must be unique");
  cronos = await Character.filter({ name: 'Crono' }).run();
  t.is(cronos.length, 1);
});

test('updates unique lookup table when updating unique value, deletes old unique record', async t => {
  const [frog] = await Character.filter({ name: 'Frog' }).run();
  frog.name = 'Kaeru';
  await frog.save();
  const updated = await Character.get(frog.id).run();
  t.is(updated.name, 'Kaeru');
  t.true(await Character.isNameUnique('Frog'));
});

test('throws error when trying to update table with nonunique value', async t => {
  const [character] = await Character.filter({ name: 'Robo' }).run();
  character.name = 'Crono';
  const error = await t.throws(character.save());
  t.is(error.message, "'Character.name' must be unique");
  const cronos = await Character.filter({ name: 'Crono' }).run();
  t.is(cronos.length, 1);
});

/**/
