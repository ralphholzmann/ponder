import Query from '../Query';
import { capitalize } from '../util';

const r = new Query();

export default superclass =>
  class UniqueProperty extends superclass {
    static setup(namespace) {
      return Promise.all(
        namespace.filterSchema('unique').map(async ({ property }) => {
          const tableName = `${this.name}_${property}_unique`;
          this[`is${capitalize(property)}Unique`] = async value =>
            !await r
              .table(tableName)
              .get(value.toLowerCase())
              .run();
          return Query.ensureTable(tableName);
        })
      );
    }

    static async beforeSave(record, namespace) {
      const uniqueProperties = namespace
        .filterSchema('unique')
        .filter(({ property }) => {
          return record.isNew() || record.pendingUpdate[property];
        })
        .map(({ property }) => ({
          property,
          tableName: `${record.constructor.name}_${property}_unique`,
          id: record[property],
          oldValue: record.oldValues[property]
        }));

      const result = await Promise.all(
        uniqueProperties.map(async ({ id, tableName }) =>
          r
            .table(tableName)
            .insert({ id })
            .run()
        )
      );

      const errorIndex = result.findIndex(({ errors }) => errors > 0);
      if (errorIndex > -1) {
        await Promise.all(
          result.filter(({ errors }) => errors === 0).map((item, index) => {
            const { tableName, id } = uniqueProperties[index];
            r
              .table(tableName)
              .get(id)
              .delete()
              .run();
          })
        );
        throw new Error(`'${record.constructor.name}.${uniqueProperties[errorIndex].property}' must be unique`);
      }

      await Promise.all(
        uniqueProperties.filter(property => property.oldValue).map(({ tableName, oldValue }) =>
          r
            .table(tableName)
            .get(oldValue)
            .delete()
            .run()
        )
      );

      return record;
    }
  };
