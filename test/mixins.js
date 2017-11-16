import test from 'ava';
import { Model } from '../src';
import Database from './lib/database';
import TimeStampMixin from '../lib/mixins/Timestamp';
import SoftDeleteMixin from '../lib/mixins/Deleted';

class Message extends Model.with(TimeStampMixin, SoftDeleteMixin) {
  static schema = {
    text: String
  };
}

Database.register(Message);

test('Mixin augments schema correctly', async t => {
  const namespace = Database.getNamespace();
  [('text', 'created', 'updated', 'deleted')].forEach(prop => t.truthy(namespace.schema.get(prop)));
});
