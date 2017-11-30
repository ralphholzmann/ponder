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

test('unique values creates static is[prop]Unique method and returns uniquess of given value', async t => {
  const chatUser = new ChatUser({
    name: 'Ralph',
    username: 'ralphholzmann',
    email: 'ralph@example.com'
  });
  await chatUser.save();

  const chatUser2 = new ChatUser({
    name: 'Martin',
    username: 'martin',
    email: 'martin@example.com'
  });
  await chatUser2.save();

  t.false(await ChatUser.isUsernameUnique('ralphholzmann'));
  t.false(await ChatUser.isUsernameUnique('martin'));
  t.true(await ChatUser.isUsernameUnique('crosby'));
});

test('throws error when trying to create model with duplicate unique value and does not save duplicate model', async t => {
  let chatUsers = await ChatUser.filter({ name: 'Ralph' }).run();
  t.is(chatUsers.length, 1);

  const duplicate = new ChatUser({
    name: 'Ralph',
    username: 'ralphholzmann',
    email: 'ralph@example.com'
  });
  const error = await t.throws(duplicate.save());
  t.is(error.message, "'ChatUser.username' must be unique");
  chatUsers = await ChatUser.filter({ name: 'Ralph' }).run();
  t.is(chatUsers.length, 1);
});

test('updates unique lookup table when updating unique value, deletes old unique record', async t => {
  const [ralph] = await ChatUser.filter({ name: 'Ralph' }).run();
  ralph.username = 'ralph2';
  await ralph.save();
  const updated = await ChatUser.get(ralph.id).run();
  t.is(updated.username, 'ralph2');
  t.true(await ChatUser.isUsernameUnique('ralphholzmann'));
  t.false(await ChatUser.isUsernameUnique('ralph2'));
});

test('throws error when trying to update table with nonunique value', async t => {
  const [ralph] = await ChatUser.filter({ name: 'Ralph' }).run();
  ralph.username = 'martin';
  const error = await t.throws(ralph.save());
  t.is(error.message, "'ChatUser.username' must be unique");
  const chatUsers = await ChatUser.filter({ username: 'martin' }).run();
  t.is(chatUsers.length, 1);
});
