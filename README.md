# Ponder

## Quick Start

```
git clone git@github.com:GodelSystems/ponder.git
cd ponder/
yarn
```

## Connection
    import 'ponder' from 'ponder';

    await ponder.config({ host, port, db, user, password }).connect();


## Ponder API

**config({ host, port, db, user, password })**

  Allows you to define your RethinkDB configuration.

**connect()**

  Connects to RethinkDB using the configuration set in `config`.

**execute(query)**

  Executes a RethinkDB query.

**disconnect()**

  Closes the connection made to RethinkDB made with `connect`.

**register(Model)**

  Registers the Model class with `ponder`.

**ensureDatabase()**

  Ensures that the database set in `config` exists. (If it doesn't exist, it will be created.)


## Model
The way to interact with a RethinkDB table is through a `Model`. A `Model` **REQUIRES** a `schema`, which defines the data on the table. A `Model` can also have index and relationship definitions.

    import { Model, Point } from 'ponder';

    class User extends Model {
      static schema = {
        name: String,
        age: Number,
        email: String,
        friends: [String],
        location: Point
      };

      static indexes = [{
        index: 'name'
      }, {
        index: ['name', 'email']
      }, {
        index: 'friends',
        multi: true
      }, {
        index: 'location',
        geo: true
      }];
    };


## Schema
A `schema` defines the data (and data types) on the `Model`.

    static schema = {
      name: String,
      age: Number,
      email: String,
      friends: [String],
      location: Point
    };

## Indexes
A `model` has `indexes`, which is an array of RethinkDB secondary indexes.

    // simple, compound, multi and geo respectively

    static indexes = [{
      index: 'name'
    }, {
      index: ['name', 'email']
    }, {
      index: 'friends',
      multi: true
    }, {
      index: 'location',
      geo: true
    }];

## hasMany Relation
A `Model` can have a `hasMany` relationship with another `Model` definition. In this case, an Organization `hasMany` User models.

    class Organization extends Model {
      static schema = {
        name: String
      };

      static relations = {
        hasMany: {
          users: {
            model: 'User',
            primaryKey: 'email'
          }
        }
      };
    };


## hasOne Relation
A `Model` can also have a `hasOne` relationship with another `Model` definition. Here, the Organization only `hasOne` CEO User.

    class Organization extends Model {
      static schema = {
        name: String
      };

      static relations = {
        hasOne: {
          ceo: {
            model: 'User',
            primaryKey: 'email'
          }
        }
      };
    };

## Model Instance
The majority of cases, you will interact with a `Model` and its underlying data through a `Model` instance. Here we are creating a new `Model` of a User and saving it to RethinkDB.

    const user = new User({
      name: 'Jackson',
      age: 23,
      email: 'jackson@godelapp.com',
      friends: ['Ralph', 'Nik'],
      location: Point(43.16, 77.61)
    });

    await user.save();

You will also receive `Model` instances when querying. In this case, `myUserModel` is an instance of a User Model.


    const [myUserModel] = User.getAll('Jackson', { index: 'name' }).run();


## Query

    const byIndex = await User.getAll('Jackson', { index: 'name' }).run()

    const byFilter = await User.filter({ 'email': 'jackson@godelapp.com' }).run();

    await User.get('146f1341-bda1-4698-8f77-6734f858cca6').update({ friends: ['Ralph', 'Nik', 'Martin']}).run();



## Test
Needs a locally running instance of RethinkDB for tests.

`npm run test`

## TODO
- [ ] Setup
  - [x] Create database
  - [x] Create tables
  - [x] Ensure indexes
    - [x] Single
    - [x] Compound
    - [x] Multi
    - [x] Geo
  - [ ] connection management API
- [ ] Schema
  - [x] Type validation
  - [x] Define indexes
  - [x] Define relations without race conditions
    - [x] `hasOne`
    - [x] `hasMany`
    - [ ] two way `hasMany` (aka, `manyToMany`) requiring join table
  - [ ] Populating relations (aka, `getJoin`)
    - [x] `hasOne`
      - [x] single level
      - [x] multi level
    - [x] `hasMany`
      - [x] single level
      - [x] multi level
    - [ ] `tap` API allowing you to take control of the relation ReQL
    - [ ] API to allow you to choose which relations get loaded
  - [ ] Define virtuals
- [ ] Models
  - [x] ReQL proxying
  - [x] Static methods
  - [x] Instance methods
  - [x] Saving
    - [x] Inserting
    - [x] Updating
      - [x] Track updated properties
  - [ ] Deleting
  - [x] Unique properties via lookup table
  - [x] Pre/Post hooks
    - [ ] Include old version in hooks
- [x] Cursors
  - [x] Return model instances
- [x] Changefeeds
  - [x] Emit model instances
  - [x] Automatic diffing with `id`
  - [x] Ability to get old value
- [x] Mixins
  - [x] Support
    - [x] `Model.with` API
    - [x] Recursive schema augmenting
    - [x] Query tapping
      - [x] injectFilter
  - [x] SoftDelete
  - [ ] Changelog
  - [x] Timestamp
