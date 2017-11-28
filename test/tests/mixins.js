import test from 'ava';
import { Model } from '../../lib';
import Database from '../lib/database';
import TimeStampMixin from '../../lib/mixins/Timestamp';
import SoftDeleteMixin from '../../lib/mixins/Deleted';

class Message extends Model.with(TimeStampMixin, SoftDeleteMixin) {
  static schema = {
    text: String
  };
}

Database.register(Message);

test.before(async () => {
  await Database.connect();
});

test('Mixin augments schema correctly', async t => {
  const namespace = Database.getNamespace(Message);
  [('text', 'created', 'updated', 'deleted')].forEach(prop => t.truthy(namespace.schema.get(prop)));
});

test('Mixin dates are serialized correctly', async t => {
  const message = new Message({
    text: 'Hello world!'
  });

  await message.save();
  t.true(message.created instanceof Date);

  const copy = await Message.get(message.id).run();

  t.true(copy.created instanceof Date);
});
