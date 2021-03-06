import test from 'ava';
import { Model, Point } from '../../lib';
import Database from '../lib/database';

class Era extends Model {
  static schema = {
    name: String,
    year: Number,
    annoDomini: Boolean
  };

  static hasMany = {
    places: 'Place'
  };
}

class Place extends Model {
  static schema = {
    name: String,
    location: Point
  };

  static indexes = [
    {
      properties: ['location'],
      geo: true
    }
  ];
}

class Character extends Model {
  static schema = {
    name: { type: String, allowNull: true },
    nickname: { type: String, allowNull: true },
    age: { type: Number, allowNull: true },
    magicType: { type: String, allowNull: true },
    weaponType: { type: String, allowNull: true },
    friends: { type: [String], default: [] }
  };

  static indexes = [
    {
      properties: ['name']
    },
    {
      name: 'magicType_weaponType',
      properties: ['magicType', 'weaponType']
    },
    {
      properties: ['friends'],
      multi: true
    }
  ];

  static belongsTo = {
    equippedWeapon: 'Weapon',
    equippedArmor: 'Armor'
  };
}

class Weapon extends Model {
  static schema = {
    name: String,
    type: String,
    attack: { type: Number, default: 1 }
  };
}

class Armor extends Model {
  static schema = {
    name: String,
    defense: Number
  };
}

Database.register(Character);
Database.register(Weapon);
Database.register(Armor);
Database.register(Era);
Database.register(Place);

test.before(async () => {
  await Database.connect();
});

test.after.always(async () => {
  await Database.teardown();
});

test('Saving a new model instance adds an id to the instance', async t => {
  const user = new Character({
    name: 'Crono',
    age: 17,
    magicType: 'light',
    weaponType: 'katana',
    friends: ['Marle']
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

test('Queries return instances of models', async t => {
  const [user] = await Character.filter({
    age: 17
  }).run();

  t.true(user instanceof Character);
  t.is(user.name, 'Crono');
  t.is(user.age, 17);
});

test('Saving an existing model updates correctly', async t => {
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

test('simple indexes are created successfully', async t => {
  const [user] = await Character.getAll('Crono', {
    index: 'name'
  }).run();
  t.true(user instanceof Character);
  t.is(user.name, 'Crono');
});

test('compound indexes are created successfully', async t => {
  const [user] = await Character.getAll(['light', 'katana'], {
    index: 'magicType_weaponType'
  }).run();
  t.true(user instanceof Character);
  t.is(user.name, 'Crono');
});

test('multi indexes are created successfully', async t => {
  const [user] = await Character.getAll('Marle', {
    index: 'friends'
  }).run();
  t.true(user instanceof Character);
  t.is(user.name, 'Crono');
});

test('Changefeeds return instances of models', async t => {
  const cursor = await Character.changes().run();
  await new Promise(resolve => {
    cursor.each((err, change) => {
      t.true(change.new_val instanceof Character);
      resolve();
    });

    const user = new Character({
      name: 'Marle',
      age: 16,
      magicType: 'ice',
      weaponType: 'crossbow',
      friends: ['Marle', 'Crono']
    });
    user.save();
  });
  await cursor.close();
});

test('Changefeeds `diff` correctly', async t => {
  let count = 0;
  const cursor = await Character.changes().run();
  await new Promise(async resolve => {
    const user = new Character({
      name: 'Frog',
      age: 38,
      magicType: 'water',
      weaponType: 'boardsword',
      friends: []
    });

    cursor.each((err, change) => {
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

test('hasOne relations save correctly', async t => {
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

test('hasOne relations load correctly', async t => {
  const [character] = await Character.filter({
    name: 'Crono'
  })
    .populate()
    .run();

  t.true(character.equippedWeapon instanceof Weapon);
  t.is(character.equippedWeaponId, character.equippedWeapon.id);

  t.true(character.equippedArmor instanceof Armor);
  t.is(character.equippedArmorId, character.equippedArmor.id);
});

test('populate on single record', async t => {
  const [{ id }] = await Character.filter({
    name: 'Crono'
  }).run();
  const character = await Character.get(id)
    .populate()
    .run();

  t.true(character.equippedWeapon instanceof Weapon);
  t.is(character.equippedWeaponId, character.equippedWeapon.id);

  t.true(character.equippedArmor instanceof Armor);
  t.is(character.equippedArmorId, character.equippedArmor.id);
});

test('populate on an instance', async t => {
  const [{ id }] = await Character.filter({
    name: 'Crono'
  }).run();
  const character = await Character.get(id).run();

  await character.populate();

  t.true(character.equippedWeapon instanceof Weapon);
  t.is(character.equippedWeaponId, character.equippedWeapon.id);

  t.true(character.equippedArmor instanceof Armor);
  t.is(character.equippedArmorId, character.equippedArmor.id);
});

test('hasMany relations save correctly', async t => {
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

  await era.places.addRelation(leeneSquare);
  await era.places.addRelation(truceInn);

  await leeneSquare.save();
  await truceInn.save();

  t.is(era.places[0], leeneSquare);
  t.is(era.places[1], truceInn);
  t.is(leeneSquare.eraId, era.id);
  t.is(truceInn.eraId, era.id);
});

test('hasMany relations load correctly', async t => {
  const [present] = await Era.filter({
    name: 'present'
  })
    .populate()
    .run();

  t.is(present.places.length, 2);
  t.true(present.places[0] instanceof Place);
  t.true(present.places[1] instanceof Place);
});

test('geo indexes are created successfully', async t => {
  const [leeneSquare] = await Place.filter({
    name: 'Leene Square'
  }).run();

  const { location } = leeneSquare;

  const nearest = await Place.getNearest(location, { index: 'location' }).run();
  t.is(nearest.length, 1);
});

test('sets property to default value if property is undefined and default is set', async t => {
  const weapon = new Weapon({
    name: 'Mop',
    type: 'Katana'
  });
  const returnedWeapon = await weapon.save();

  t.is(returnedWeapon.attack, 1);
});

test('sets array proprety to empty array if array is empty', async t => {
  const user = new Character({
    name: 'Robo',
    age: 300,
    weaponType: 'mechanicalArm'
  });
  const returnedUser = await user.save();

  t.truthy(returnedUser.id);
});

test('Only includes schema properties when serializing', async t => {
  const [character] = await Character.filter({ name: 'Crono' })
    .populate()
    .run();
  const serialized = JSON.parse(JSON.stringify(character));
  const namespace = Database.getNamespace(Character);
  const schemaKeys = Object.keys(Character.schema);

  schemaKeys.push('id');
  namespace.forEachBelongsTo(({ key, property }) => {
    schemaKeys.push(key);
    schemaKeys.push(property);
  });
  namespace.forEachHasMany(({ key, property }) => {
    schemaKeys.push(key);
    schemaKeys.push(property);
  });
  namespace.forEachManyToMany(({ key, property }) => {
    schemaKeys.push(key);
    schemaKeys.push(property);
  });

  Object.keys(serialized).forEach(key => t.true(schemaKeys.includes(key)));
});

test('Serializes hasMany relations correctly', async t => {
  const [era] = await Era.filter({
    name: 'present'
  })
    .populate()
    .run();

  const json = JSON.parse(JSON.stringify(era));
  t.true(Array.isArray(json.places));
});

test('`reload` method updates model from the database', async t => {
  const weapon = new Weapon({
    name: 'Rainbow Sword',
    type: 'sword',
    attack: 200
  });

  await weapon.save();
  const weaponCopy = await Weapon.get(weapon.id).run();

  weaponCopy.attack = 210;
  await weaponCopy.save();

  t.is(weapon.attack, 200);
  await weapon.reload();
  t.is(weapon.attack, 210);
});
