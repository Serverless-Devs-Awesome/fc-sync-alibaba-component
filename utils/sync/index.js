const _ = require('lodash');
const fse = require('fs-extra');
const path = require('path');
const unzipper = require('unzipper');
const fetchHappen = require('make-fetch-happen');

const Client = require('./client');
const Logger = require('../logger');
const ServerlessError = require('../error');


const findFunction = (functionName) => {
  if (!functionName) {
    new ServerlessError({
      code: 'FunctionNameNotFount',
      message: 'Function Name is empty.'
    }, true);
  }
}

class Sync extends Client {
  constructor (credentials, region) {
    super(credentials, region);
    this.fcClient = this.buildFcClient();
    this.logger = new Logger();
  }

  async sync ({
    syncAllFlag,
    onlySyncType,
    serviceName,
    functionName,
    properties
  }) {
    const pro = _.cloneDeepWith(properties);

    // service，只同步服务
    if (syncAllFlag || onlySyncType === 'service') {
      this.logger.info(`Starting sync ${serviceName} config.`);
      pro.Service = await this.syncService(serviceName, pro.Service);
      this.logger.info(`End sync ${serviceName} config.`);
    }
    // tags，只同步标签
    if (syncAllFlag || onlySyncType === 'tags') {
      this.logger.info(`Starting sync ${serviceName} tags.`);
      pro.Service.Tags = await this.syncTags(`services/${serviceName}`);
      this.logger.info(`End sync ${serviceName} tags.`);
    }
    // function，只同步函数
    if (syncAllFlag || onlySyncType === 'function') {
      findFunction(functionName);
      this.logger.info(`Starting sync ${serviceName}/${functionName} config.`);
      pro.Function = await this.syncFunction(serviceName, functionName, pro.Function);
      this.logger.info(`End sync ${serviceName}/${functionName} config.`);
    }
    // code，只同步代码
    if (syncAllFlag || onlySyncType === 'code') {
      findFunction(functionName);
      this.logger.info(`Starting sync ${serviceName}/${functionName} code.`);
      const codeUri = pro.Function.CodeUri || path.join('./', serviceName, functionName);
      try {
        pro.Function.CodeUri = await this.outputFunctionCode(serviceName, functionName, codeUri);
      } catch (e) {
        new ServerlessError({
          code: 'FunctionNameNotFount',
          message: 'Failed to sync function code.'
        }, false);
        new ServerlessError(e, true);
      }
      this.logger.info(`End ${serviceName}/${functionName} code.`);
    }
    // trigger，只同步触发器
    if (syncAllFlag || onlySyncType === 'trigger') {
      findFunction(functionName);
      this.logger.info(`Starting sync ${serviceName}/${functionName} trigger.`);
      pro.Function.Triggers = await this.syncTrigger(serviceName, functionName);
      this.logger.info(`End ${serviceName}/${functionName} trigger.`);
    }

    return JSON.parse(JSON.stringify(pro))
  }

  async syncService (serviceName, service) {
    const { data } = await this.fcClient.getService(serviceName);
    const { description, role, logConfig, vpcConfig, nasConfig, internetAccess } = data;
    const serviceData = {
      Description: description,
      InternetAccess: internetAccess,
      Role: role,
      Name: serviceName,
      Tags: service.Tags
    };

    if (vpcConfig) {
      serviceData.Vpc = {
        SecurityGroupId: vpcConfig.securityGroupId,
        VSwitchIds: vpcConfig.vSwitchIds,
        VpcId: vpcConfig.vpcId
      };
    }
    if (nasConfig) {
      const nas = service.Nas;

      const handlerDir = ({ serverAddr, mountDir }) => {
        const subscript = serverAddr.indexOf(':/');
        const itemConfig = {
          NasAddr: serverAddr.substr(0, subscript),
          NasDir: serverAddr.substr(subscript + 1),
          FcDir: mountDir
        };
        if (!nas || nas === 'Auto') {
          return itemConfig;
        }
        if (nas.Type === 'Auto') {
          if (!nas.FcDir || nas.FcDir === itemConfig.FcDir) {
            itemConfig.LocalDir = nas.LocalDir;
          }
          return itemConfig;
        }
        (nas.MountPoints || []).forEach(item => {
          if (`${item.NasAddr}:${item.NasDir}` === serverAddr && mountDir === item.FcDir) {
            itemConfig.LocalDir = item.LocalDir;
          }
        });
        return itemConfig;
      }

      serviceData.Nas = {
        UserId: nasConfig.userId,
        GroupId: nasConfig.groupId,
        MountPoints: nasConfig.mountPoints.map(item => handlerDir(item))
      }
    }

    if (logConfig) {
      serviceData.Log = {
        LogStore: logConfig.logstore,
        Project: logConfig.project
      };
    }
    return serviceData;
  }

  async syncTags (resourceArn) {
    const { data } = await this.fcClient.getResourceTags({ resourceArn });
    const { tags = {} } = data || {};
    const t = Object.keys(tags).map(key => ({
      Key: key,
      Value: tags[key]
    }));
    if (t.length === 0) {
      return undefined;
    }
    return t;
  }

  async syncFunction (serviceName, functionName, proFunction) {
    const { data } = await this.fcClient.getFunction(serviceName, functionName);
    const {
      description,
      runtime,
      handler,
      timeout,
      initializer,
      initializationTimeout,
      memorySize,
      environmentVariables,
      instanceConcurrency,
      customContainerConfig,
      caPort,
      instanceType
    } = data;

    let customContainer;
    if (customContainerConfig) {
      customContainer = {
        Image: customContainerConfig.image,
        Command: customContainerConfig.command,
        Args: customContainerConfig.args
      };
    }
    return {
      Name: functionName,
      CodeUri: proFunction.CodeUri,
      Description: description,
      Runtime: runtime,
      Handler: handler,
      Timeout: timeout,
      Initializer: initializer,
      InitializationTimeout: initializationTimeout,
      MemorySize: memorySize,
      InstanceConcurrency: instanceConcurrency,
      CustomContainer: customContainer,
      CaPort: caPort,
      InstanceType: instanceType,
      Environment: Object.keys(environmentVariables).map(key => ({
        key: key,
        Value: environmentVariables[key]
      })),
      Triggers: proFunction.Triggers
    };
  }

  async outputFunctionCode (serviceName, functionName, fullOutputDir) {
    const { data: configData } = await this.fcClient.getFunction(serviceName, functionName);
    if (configData.runtime === 'custom-container') {
      this.logger.warn(`${serviceName}/${functionName} is custom-container, skipping the sync code.`);
      return undefined;
    } else if (configData.runtime.includes('java')) {
      this.logger.warn(`${serviceName}/${functionName} is ${configData.runtime}, skipping the sync code.`);
      return undefined;
    }

    let dir = fullOutputDir;
    if (typeof fullOutputDir !== 'string') {
      if (fullOutputDir.Src) {
        fullOutputDir.Src = path.join('./', serviceName, functionName);
      }
      dir = fullOutputDir.Src;
    }

    const { data } = await this.fcClient.getFunctionCode(serviceName, functionName);
    await fse.ensureDir(dir);
    const res = await fetchHappen(data.url);
    const buffer = await res.buffer();
    await unzipper.Open.buffer(buffer)
    .then(d => d.extract({ path: path.join(process.cwd(), dir) }))
    .catch(e => {
      throw e
    });
    return fullOutputDir;
  }

  async syncTrigger (serviceName, functionName, proFunction) {
    const { data } = await this.fcClient.listTriggers(serviceName, functionName);
    const { triggers = [] } = data || {};
    if (triggers.length === 0) {
      return undefined;
    }
    return triggers.map(item => {
      const { triggerConfig = {}, qualifier, triggerType, sourceArn, invocationRole } = item;
      let type = triggerType;
      let parameters = {};
      switch (type) {
        case 'http':
          parameters = {
            Qualifier: qualifier,
            AuthType: triggerConfig.authType,
            Methods: triggerConfig.methods
          };
          type = 'HTTP';
          break;
        case 'oss':
          parameters = {
            Qualifier: qualifier,
            Bucket: sourceArn.split(':').pop(),
            Events: triggerConfig.events,
            InvocationRole: invocationRole,
            Filter: {
              Prefix: triggerConfig.filter.key.prefix,
              Suffix: triggerConfig.filter.key.suffix
            }
          };
          type = 'OSS';
          break;
        case 'timer':
          type = 'Timer';
          parameters = {
            Qualifier: qualifier,
            CronExpression: triggerConfig.cronExpression,
            Enable: triggerConfig.enable,
            Payload: triggerConfig.payload
          };
          break;
        case 'cdn_events':
          type = 'CDN';
          parameters = {
            Qualifier: qualifier,
            EventName: triggerConfig.eventName,
            EventVersion: triggerConfig.eventVersion,
            Notes: triggerConfig.notes,
            Filter: {
              Domain: triggerConfig.filter.domain
            },
            InvocationRole: invocationRole
          };
          break;
        case 'log':
          type = 'Log';
          parameters = {
            Qualifier: qualifier,
            SourceConfig: {
              LogStore: triggerConfig.sourceConfig.logstore
            },
            JobConfig: {
              MaxRetryTime: triggerConfig.jobConfig.maxRetryTime,
              TriggerInterval: triggerConfig.jobConfig.triggerInterval
            },
            LogConfig: {
              LogStore: triggerConfig.logConfig.logstore,
              Project: triggerConfig.logConfig.project
            },
            FunctionParameter: triggerConfig.functionParameter,
            Enable: triggerConfig.enable,
            InvocationRole: invocationRole
          };
          break;
        case 'mns_topic': {
          const arnConfig = sourceArn.split(':');
          type = 'MNSTopic';
          parameters = {
            Qualifier: qualifier,
            InvocationRole: invocationRole,
            FilterTag: triggerConfig.filterTag,
            NotifyStrategy: triggerConfig.notifyStrategy,
            NotifyContentFormat: triggerConfig.notifyContentFormat,
            Region: arnConfig[2],
            TopicName: arnConfig.pop().split('/').pop()
          };
          break;
        }
        case 'tablestore': {
          const arnOtsConfig = sourceArn.split(':').pop().split('/');
          type = 'TableStore';
          parameters = {
            Qualifier: qualifier,
            InvocationRole: invocationRole,
            TableName: arnOtsConfig[3],
            InstanceName: arnOtsConfig[1]
          };
          break;
        }
        default:
          this.logger.info(`Skip sync triggerName: ${item.triggerName}`);
      }
      const triggerData = {
        Name: item.triggerName,
        Type: type,
        Parameters: parameters
      };
      return triggerData;
    })
  }
}

module.exports = Sync
