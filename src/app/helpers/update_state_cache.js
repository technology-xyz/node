const tools = require("../../tools");
const redisClient = tools.redisClient;
const { promisify } = require("util");
const redisSetAsync = promisify(redisClient.set).bind(redisClient);

module.exports = async () => {
  console.log("Updating current state cache");
  try {
    let currentState = await tools.getContractState();
    await redisSetAsync("currentStateCached", JSON.stringify(currentState));
  } catch (e) {
    console.log(e);
  }
};
