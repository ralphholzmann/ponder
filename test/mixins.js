import test from 'ava';
import { Database, Model } from '../src';
import TimeStamp from '../src/mixins/Timestamp';
import Deleted from '../src/mixins/Deleted';

class Message extends Model.with(TimeStamp, Deleted) {
  static schema = {
    text: String
  }
}
Database.register(Message);

test.before(async () => {
  Database.config({
    db: 'test_db'
  });
  await Database.connect();
});

test('Mixin augments schema correctly', async (t) => {
  t.true(Object.prototype.hasOwnProperty.call(Message.schema, 'text'));
  t.true(Object.prototype.hasOwnProperty.call(Message.schema, 'created'));
  t.true(Object.prototype.hasOwnProperty.call(Message.schema, 'updated'));
  t.true(Object.prototype.hasOwnProperty.call(Message.schema, 'deleted'));
});
