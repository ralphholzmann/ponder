import test from 'ava';
import { Model } from '../lib';
import Database from './lib/database';
import TimeStampMixin from '../lib/mixins/Timestamp.js';

const TWEET_LENGTH = 140;

class Tweet extends Model.with(TimeStampMixin) {
  static schema = {
    text: String
  };

  static async beforeSave(tweet) {
    tweet.hookRan = true;
    if (tweet.text.length > TWEET_LENGTH) {
      throw new Error('Tweet is too long!');
    }
  }

  static async afterSave() {}
}

Database.register(Tweet);

test('beforeSave hook executes successfully', async t => {
  const tweet = new Tweet({
    text: 'You have distracted from my creative process'
  });

  await t.notThrows(tweet.save());
  t.truthy(tweet.created);
  t.truthy(tweet.updated);
  t.true(tweet.hookRan);
});

test('beforeSave hook throws successfully', async t => {
  const tweet = new Tweet({
    text: `We the People of the United States, in Order to form a more perfect Union,
           establish Justice, insure domestic Tranquility, provide for the common
           defence, promote the general Welfare, and secure the Blessings of
           Liberty to ourselves and our Posterity, do ordain and establish this
           Constitution for the United States of America.`
  });

  await t.throws(tweet.save());
  t.true(tweet.hookRan);
  t.falsy(tweet.created);
  t.falsy(tweet.updated);
});
