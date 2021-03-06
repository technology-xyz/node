const KOII_CONTRACT = "kAAMofwpEVYnf0qBLRox-GG56nLAqt3M04-Qz7N9sl4";

const koiSdk = require("@_koi/sdk/node");
const fsPromises = require("fs/promises");

// Singletons
const tools = new koiSdk.Node(process.env.TRUSTED_SERVICE_URL, KOII_CONTRACT);
const arweave = require("@_koi/sdk/common").arweave;

/**
 * Namespace wrapper over APIs needed in Koii tasks
 */
class Namespace {
  /**
   * @param {*} taskTxId Tasks transaction ID to be used as the namespace name
   * @param {*} expressApp // Express app for configuration
   */
  constructor(taskTxId, expressApp) {
    this.taskTxId = taskTxId;
    this.app = expressApp;
  }

  /**
   * Namespace wrapper of redisGetAsync
   * @param {string} path // Path to get
   * @returns {Promise<*>} Promise containing data
   */
  redisGet(path) {
    return tools.redisGetAsync(this.taskTxId + path);
  }

  /**
   * Namespace wrapper over redisSetAsync
   * @param {string} path Path to set
   * @param {*} data Data to set
   * @returns {Promise<void>}
   */
  redisSet(path, data) {
    return tools.redisSetAsync(this.taskTxId + path, data);
  }

  /**
   * Namespace wrapper over fsPromises methods
   * @param {*} method The fsPromise method to call
   * @param {*} path Path for the express call
   * @param  {...any} args Remaining parameters for the FS call
   * @returns {Promise<any>}
   */
  async fs(method, path, ...args) {
    const basePath = "namespace/" + this.taskTxId;
    try {
      try {
        await fsPromises.access("namespace");
      } catch {
        await fsPromises.mkdir("namespace");
      }
      await fsPromises.access(basePath);
    } catch {
      await fsPromises.mkdir(basePath);
    }
    return fsPromises[method](`${basePath}/${path}`, ...args);
  }

  /**
   * Namespace wrapper over express app methods
   * @param {string} method // Receive method ["get", "post", "put", "delete"]
   * @param {string} path // Endpoint path appended to namespace
   * @param {Function} callback // Callback function on traffic receive
   */
  express(method, path, callback) {
    return this.app[method]("/" + this.taskTxId + path, callback);
  }
}

module.exports = {
  tools,
  arweave,
  Namespace
};
