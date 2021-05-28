const heartbeat = require("./heartbeat"),
  vote = require("./vote"),
  trafficLog = require("./traffic_log"),
  state = require("./state");

module.exports = {
  vote,
  heartbeat,
  trafficLog,
  state
};
