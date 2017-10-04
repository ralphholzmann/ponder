import test from 'ava';
import { Database, Model, Point } from '../src';

class Era extends Model {
  static schema = {
    name: String,
    year: Number,
    annoDomini: Boolean
  };

  static relations = {
    hasMany: {
      places: {
        model: 'Place',
        primaryKey: 'id'
      }
    }
  }
}

class Place extends Model {
  static schema = {
    name: String,
    location: Point
  }
}

class Character extends Model {
  static schema = {
    name: String,
    age: Number,
    magicType: String,
    weaponType: String
  };

  static indexes = {
    name: true,
    magicType_weaponType: ['magicType', 'weaponType']
  };

  static relations = {
    hasOne: {
      equippedWeapon: {
        model: 'Weapon',
        foreignKey: 'id'
      },
      equippedArmor: {
        model: 'Armor',
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

class Armor extends Model {
  static schema = {
    name: String,
    defense: Number
  }
}

Database.register(Character);
Database.register(Weapon);
Database.register(Armor);
Database.register(Era);
Database.register(Place);

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

  const armor = new Armor({
    name: 'Regal Plate',
    defense: 88
  });
  const returnedArmor = await armor.save();

  t.truthy(armor.id);
  t.truthy(returnedArmor.id);
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

  const [armor] = await Armor.filter({
    name: 'Regal Plate'
  }).run();

  character.equippedWeapon = weapon;
  character.equippedArmor = armor;

  await character.save();
  t.is(character.equippedWeaponId, weapon.id);
  t.is(character.equippedArmorId, armor.id);
});

test('hasOne relations load correctly', async (t) => {
  const [character] = await Character.filter({
    name: 'Crono'
  }).populate().run();

  t.true(character.equippedWeapon instanceof Weapon);
  t.is(character.equippedWeaponId, character.equippedWeapon.id);

  t.true(character.equippedArmor instanceof Armor);
  t.is(character.equippedArmorId, character.equippedArmor.id);
});

test('hasMany relations save correctly', async (t) => {
  const era = new Era({
    name: 'present',
    year: 1000,
    annoDomini: true
  });

  await era.save();

  const leeneSquare = new Place({
    name: 'Leene Square',
    location: [50, 50]
  });
  await leeneSquare.save();

  const truceInn = new Place({
    name: 'Truce Inn',
    location: [30, 50]
  });
  await truceInn.save();

  era.places.push(leeneSquare);
  era.places.push(truceInn);

  await leeneSquare.save();
  await truceInn.save();

  t.is(era.places[0], leeneSquare);
  t.is(era.places[1], truceInn);
  t.is(leeneSquare.eraId, era.id);
  t.is(truceInn.eraId, era.id);
});

test('hasMany relations load correctly', async (t) => {
  const [present] = await Era.filter({
    name: 'present'
  }).populate().run();

  t.is(present.places.length, 2);
  t.true(present.places[0] instanceof Place);
  t.true(present.places[1] instanceof Place);
});
