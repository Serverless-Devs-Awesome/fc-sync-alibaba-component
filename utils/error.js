const Logger = require('./logger');

class ServerlessError {
  constructor(e, throwError = true) {
    const logger = new Logger();
    if (throwError) {
      if (e instanceof Error) {
        throw e;
      } else {
        const { code, message } = e;
        const err = new Error(message);
        err.name = code;
        throw err;
      }
    } else {
      logger.error(message);
    }
  }
}

module.exports = ServerlessError;