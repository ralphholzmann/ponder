
```
yarn
npm run test
```

Needs a locally running instance of rethinkdb for tests.

## TODO
- [ ] Setup
    - [x] Create database
    - [x] Create tables
    - [ ] Ensure indexes
        - [ ] Single
        - [ ] Compound
        - [ ] Multi
        - [ ] Geo
- [ ] Schema
    - [x] Type validation
    - [ ] Define indexes
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
- [ ] Cursors
    - [x] Return model instances
- [ ] Changefeeds
    - [x] Emit model instances
    - [x] Automatic diffing with `id`
    - [ ] Ability to get old value
