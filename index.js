const { Component } = require('@serverless-devs/s-core');
const getHelp = require('./utils/help');
const ServerlessError = require('./utils/error')

class SyncComponent extends Component {
  constructor() {
    super();
  }

  async sync (inputs) {
    this.help(inputs, getHelp(inputs));

    const {
      Properties: properties = {},
      Credentials: credentials = {}
    } = inputs;

    const {
      Region: region,
      Service: serviceProp = {},
      Function: functionProp = {}
    } = properties;
    const serviceName = serviceProp.Name;
    const functionName = functionProp.Name;

    const { Commands: commands, Parameters: parameters } = this.args(inputs.Args);

  }
}

module.exports = SyncComponent;