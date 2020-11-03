const { Component } = require('@serverless-devs/s-core');
const getHelp = require('./utils/help');
const ServerlessError = require('./utils/error')

class SyncComponent extends Component {
  constructor() {
    super();
  }

  checkInputs (region, serviceName) {
    if (!region) {
      new ServerlessError({ code: 'RegionNotFount', message: 'Region is empty.' }, true)
    }
    
    if (!serviceName) {
      new ServerlessError({
        code: 'ServiceNameNotFount',
        message: 'Service Name is empty.'
      }, true);
    }
  }

  checkCmds (commands, parameters) {
    if (parameters.save && typeof parameters.save !== 'string') {
      new ServerlessError({ code: 'SaveIsEmpty', message: 'Save is empty.' }, true)
    }
    
    if (commands.length > 1) {
      new ServerlessError({
        code: 'CommandsError',
        message: 'Commands error.'
      }, true);
    }
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
    this.checkInputs(region, serviceName);

    const { Commands: commands, Parameters: parameters } = this.args(inputs.Args);
    this.checkCmds(commands, parameters);
  }
}

module.exports = SyncComponent;