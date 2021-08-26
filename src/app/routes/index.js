const heartbeat = require("../controllers/heartbeat"),
  submitVote = require("../controllers/submit_vote"),
  {
    getCurrentState,
    getTopContentPredicted,
    getNFTState,
    handleNFTUpload,
    getTotalKOIIEarned,
    getTotalNFTViews
  } = require("../controllers/state"),
  { nodes, registerNode } = require("../controllers/nodes"),
  cache = require("../middlewares/cache");

module.exports = function (app) {
  app.get("/", heartbeat);
  app.get("/nodes", nodes);
  app.get("/state/current", getCurrentState);
  app.get("/state/top-content-predicted", getTopContentPredicted);
  app.get("/state/nft", cache, getNFTState);
  app.get("/state/total-nft-views", getTotalNFTViews);
  app.get("/state/total-koii-earned", getTotalKOIIEarned);
  app.post("/handle-nft-upload", handleNFTUpload);
  app.post("/submit-vote", submitVote);
  app.post("/register-node", registerNode);
};
