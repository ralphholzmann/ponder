const thinky = require('thinky')({
  db: 'test'
});
const Model = require('./src/Model');
const Database = require('./src/Database');
const LIMIT = 1000;

var ThinkyUser = thinky.createModel("User", {
  id: String,
  name: String,
  email: String
});

class OurUser extends Model {}
OurUser.schema = {
  name: String,
  email: String
};
Database.register(OurUser);

async function testThinky() {
  await thinky.dbReady();
  console.log("testing thinky");
  let chain = Promise.resolve();

  function saveNewUser() {
    return (new ThinkyUser({
      name: 'Ralph',
      email: 'ralph@holzmann.io'
    })).save();
  }

  let start = new Date();
  for (var i = 0; i < LIMIT; i++) {
    chain = chain.then(saveNewUser)
  }
  return chain.then(function () {
    console.log('thinky time', (new Date()) - start);
  });
  
}

async function testOurs() {
  Database.config({
    db: 'test'
  })
  await Database.connect();

  console.log("testing ours");
  let chain = Promise.resolve();

  function saveNewUser() {
    return (new OurUser({
      name: 'Ralph',
      email: 'ralph@holzmann.io'
    })).save();
  }

  let start = new Date();
  for (var i = 0; i < LIMIT; i++) {
    chain = chain.then(saveNewUser)
  }
  return chain.then(function () {
    console.log('our time', (new Date()) - start);
  });
  
}

testThinky().then(testOurs)
