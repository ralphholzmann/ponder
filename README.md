
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
- [ ] Schema
    - [x] Type validation
    - [x] Define indexes
    - [ ] Define relations without race conditions
- [ ] Models
    - [x] ReQL proxying
    - [x] Static methods
    - [x] Instance methods
    - [x] Saving
        - [x] Inserting
        - [x] Updating
            - [x] Track updated properties
    - [ ] Deleting
    - [ ] Unique properties via lookup table
    - [ ] Pre/Post hooks
- [x] Cursors
    - [x] Return model instances
- [x] Changefeeds
    - [x] Emit model instances
    - [x] Automatic diffing with `id`
    - [x] Ability to get old value
