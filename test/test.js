import test from 'ava';
import { Database, Model } from '../src';

class Character extends Model {
  static schema = {
    name: String,
    age: Number,
    magicType: String,
    weaponType: String
  }

  static indexes = {
    name: true,
    magicType_weaponType: ['magicType', 'weaponType']
  };

  static relations = {
    hasOne: {
      equippedWeapon: {
        model: 'Weapon',
        foreignKey: 'id'
      }
    }
  }
}

class Weapon extends Model {
  static schema = {
    name: String,
    type: String,
    attack: Number
  }
}

Database.register(Character);
Database.register(Weapon);

test.before(async () => {
  Database.config({
    db: 'test_db'
  });
  await Database.connect();
});

test.after.always(async () => {
  await Database.teardown();
});

test('Saving a new model instance adds an id to the instance', async (t) => {
  const user = new Character({
    name: 'Crono',
    age: 17,
    magicType: 'light',
    weaponType: 'katana'
  });
  const returnedUser = await user.save();

  t.truthy(user.id);
  t.truthy(returnedUser.id);

  const weapon = new Weapon({
    name: 'Dreamseeker',
    type: 'Katana',
    attack: 240
  });

  const returnedWeapon = await weapon.save();

  t.truthy(weapon.id);
  t.truthy(returnedWeapon.id);
});

test('Queries return instances of models', async (t) => {
  const [user] = await Character.filter({
    age: 17
  }).run();

  t.true(user instanceof Character);
  t.is(user.name, 'Crono');
  t.is(user.age, 17);
});

test('Saving an existing model updates correctly', async (t) => {
  const [user] = await Character.filter({
    weaponType: 'katana'
  }).run();
  user.age += 1;
  await user.save();

  const [updatedUser] = await Character.filter({
    weaponType: 'katana'
  }).run();
  t.is(updatedUser.age, 18);
});

test('simple indexes are created successfully', async (t) => {
  const [user] = await Character.getAll('Crono', {
    index: 'name'
  }).run();
  t.true(user instanceof Character);
  t.is(user.name, 'Crono');
});

test('compound indexes are created successfully', async (t) => {
  const [user] = await Character.getAll(['light', 'katana'], {
    index: 'magicType_weaponType'
  }).run();
  t.true(user instanceof Character);
  t.is(user.name, 'Crono');
});

test('Changefeeds return instances of models', async (t) => {
  const cursor = await Character.changes().run();
  await new Promise((resolve) => {
    cursor.each((change) => {
      t.true(change.new_val instanceof Character);
      resolve();
    });

    const user = new Character({
      name: 'Marle',
      age: 16,
      magicType: 'ice',
      weaponType: 'crossbow'
    });
    user.save();
  });
  await cursor.close();
});

test('Changefeeds `diff` correctly', async (t) => {
  let count = 0;
  const cursor = await Character.changes().run();
  await new Promise(async (resolve) => {
    const user = new Character({
      name: 'Frog',
      age: 38,
      magicType: 'water',
      weaponType: 'boardsword'
    });

    cursor.each((change) => {
      if (count === 1) {
        const diff = change.diff();
        t.is(user.id, diff.id);
        t.is(user.age, diff.age);
        resolve();
      }
      count += 1;
    });

    await user.save();
    user.age += 1;
    await user.save();
  });
  await cursor.close();
});

test('hasOne relations save correctly', async (t) => {
  const [character] = await Character.filter({
    name: 'Crono'
  }).run();

  const [weapon] = await Weapon.filter({
    name: 'Dreamseeker'
  }).run();

  character.equippedWeapon = weapon;
  character.save();
  t.is(character.equippedWeaponId, weapon.id);
});

test('hasOne relations load correctly', async (t) => {
  const [character] = await Character.filter({
    name: 'Crono'
  }).populate().run();

  console.log('character', character);

  t.true(character.equippedWeapon instanceof Weapon);
});