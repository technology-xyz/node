const { koi_node } = require("koi_tools");
function runNode(arg) {
  var node = new koi_node(arg);

  console.log("node is", node);

  node.run();
}
module.exports = runNode;
