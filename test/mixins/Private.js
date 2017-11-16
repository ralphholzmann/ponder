import test from 'ava';
import { Model } from '../../src';
import Database from '../lib/database';
import PrivateMixin from '../../lib/mixins/PrivateMixin.js';

class AppUser extends Model.with(PrivateMixin) {
  static schema = {
    name: String,
    email: {
      type: String,
      private: (instance, context) => context.user.id === instance.id
    },
    ipAddress: {
      type: String,
      private: true
    }
  };
}

test.before(async () => {
  Database.config({
    db: 'test_db'
  });
  await Database.connect();
});

Database.register(AppUser);

test('Private properties are hidden from payloads correctly', async t => {
  const appUser1 = new AppUser({
    name: 'Ralph',
    email: 'ralph@example.com',
    ipAddress: '127.0.0.1'
  });

  const appUser2 = new AppUser({
    name: 'Jackson',
    email: 'jackson@example.com',
    ipAddress: '127.0.0.2'
  });

  const req1 = {
    user: appUser1
  };

  const req2 = {
    user: appUser2
  };
  await appUser1.save();
  await appUser2.save();

  appUser1.setContext(req1);
  const payload1 = JSON.parse(JSON.stringify(appUser1));
  t.is(payload1.name, 'Ralph');
  t.is(payload1.email, 'ralph@example.com');
  t.falsy(payload1.ipAddress);

  appUser1.setContext(req2);
  const payload2 = JSON.parse(JSON.stringify(appUser1));
  t.is(payload2.name, 'Ralph');
  t.falsy(payload2.email);
  t.falsy(payload2.ipAddress);
});
