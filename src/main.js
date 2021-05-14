const koi_node = require("./node");
function runNode(arg) {
  var node = new koi_node(arg);

  console.log("node is", node);
  node.run();
}
function runVote(arg) {
  var node = new koi_node(arg);
  console.log("node", node);
  node.runVote();
}
module.exports = { runNode, runVote };
