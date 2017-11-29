import Query from '../Query';
import { capitalize } from '../util';

export default superclass =>
  class TimeStamp extends superclass {
    static schema = {
      created: Date,
      updated: Date
    };

    static setup(namespace) {
      console.log('SETTING UP UNIQUE TABLES');
      return Promise.all(
        namespace.filterSchema('unique').map(async ({ property }) => {
          const tableName = `${this.name}_${property}_unique`;
          console.log('ensuring table', tableName);
          await Query.ensureTable(tableName);
          this.prototype[`is${capitalize(property)}Unique`] = async value =>
            !await r
              .table(tableName)
              .get(value.toLowerCase())
              .run();
        })
      );
    }

    static beforeSave(record) {}
  };
