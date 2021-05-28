const tools = require("../../tools");
const redisClient = tools.redisClient;
const { promisify } = require("util");
const redisSetAsync = promisify(redisClient.set).bind(redisClient);
const redisGetAsync = promisify(redisClient.get).bind(redisClient);

module.exports = async () => {
  try {
    const currentStateCached = await redisGetAsync("currentStateCached");
    console.log({ currentStateCached });
    if (!currentStateCached) {
      let currentState = await tools.getContractState();
      console.log({ currentState });
      if (currentState && currentState.length > 0) {
        await redisSetAsync("currentStateCached", JSON.stringify(currentState));
      }
    }
  } catch (e) {
    console.log(e);
  }
};
