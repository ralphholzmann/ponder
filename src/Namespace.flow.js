import Model from './Model.flow';

export default class Namespace {
  constructor(model: Model) {
    this.model = model;
    this.name = model.name;
  }
}
