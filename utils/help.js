
module.exports = (inputs) => ({
  description: `Usage: s ${inputs.Project.ProjectName} sync

    Synchronize remote configuration.`,
  commands: [{
    name: 'service',
    desc: 'only sync service.'
  }, {
    name: 'tags',
    desc: 'only sync service tags.'
  }, {
    name: 'function',
    desc: 'only sync function config.'
  }, {
    name: 'code',
    desc: 'only sync function code.'
  }, {
    name: 'trigger',
    desc: 'only sync trigger.'
  }],
  args: [{
    name: '--save <filePath>',
    desc: 'Sync the configuration file save path.'
  }]
})