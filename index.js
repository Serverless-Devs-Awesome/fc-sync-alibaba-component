const { Component } = require('@serverless-devs/s-core');
const getHelp = require('./utils/help');
const ServerlessError = require('./utils/error')

class SyncComponent extends Component {
  constructor() {
    super();
  }
}

module.exports = SyncComponent;