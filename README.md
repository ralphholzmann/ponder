
```
yarn
npm run test
```

Needs a locally running instance of rethinkdb for tests.

## TODO
- [ ] Setup
  - [x] Create database
  - [x] Create tables
  - [x] Ensure indexes
    - [x] Single
    - [x] Compound
    - [ ] Multi
    - [ ] Geo
  - [ ] connection management API
- [ ] Schema
  - [x] Type validation
  - [x] Define indexes
  - [ ] Define relations without race conditions
    - [x] `hasOne`
    - [x] `hasMany`
    - [ ] two way `hasMany` (aka, `manyToMany`) requiring join table
  - [ ] Populating relations (aka, `getJoin`)
    - [x] `hasOne`
      - [x] single level
      - [x] multi level
    - [x] `hasMany`
      - [x] single level
      - [ ] multi level
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
  - [ ] Pre/Post hooks
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
    - [ ] Query tapping
    - [ ]
  - [ ] SoftDelete
  - [ ] Changelog
  - [ ] Timestamp
