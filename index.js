const _ = require('lodash');
const { Component } = require('@serverless-devs/s-core');
const getHelp = require('./utils/help');
const ServerlessError = require('./utils/error');
const Sync = require('./utils/sync');
const yaml = require('js-yaml');
const path = require('path');
const fse = require('fs-extra');
const fs = require('fs');

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
        message: 'Commands error,please execute the \'s sync --help\' command.'
      }, true);
    }

    if (commands[0] && !['service', 'tags', 'function', 'code', 'trigger'].includes(commands[0])) {
      new ServerlessError({
        code: 'CommandsError',
        message: 'Commands error,please execute the \'s sync --help\' command.'
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

    const args = this.args(inputs.Args);
    const { Commands: commands, Parameters: parameters } = args;
    this.checkCmds(commands, parameters);

    const syncAllFlag = commands.length === 0;
    const onlySyncType = commands[0];

    const syncClient = new Sync(credentials, region);
    const pro = await syncClient.sync({
      syncAllFlag,
      onlySyncType,
      serviceName,
      functionName,
      properties
    });

    const project = _.cloneDeepWith(inputs.Project)
    const projectName = project.ProjectName
    delete project.ProjectName
    if (project.AccessAlias) {
      project.Access = project.AccessAlias
      delete project.AccessAlias
    }
    const { ConfigPath } = inputs.Path || {}
    const extname = path.extname(ConfigPath)
    const basename = path.basename(ConfigPath, path.extname(ConfigPath))
    const sourceConfig = yaml.safeLoad(fs.readFileSync(ConfigPath))
    await fse.outputFile(`./.s/${basename}.source_config${extname}`, yaml.dump(sourceConfig))

    sourceConfig[projectName] = { ...project, Properties: pro }
    const u = args.Parameters.save ? path.resolve(process.cwd(), args.Parameters.save): ConfigPath
    await fse.outputFile(u, yaml.dump(sourceConfig))
  }
}

module.exports = SyncComponent;