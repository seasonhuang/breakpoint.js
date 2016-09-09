var VM = require('../node_modules/unwinder/runtime/vm');

function transformExternalScript() {}

function transformCode(code) {
  window.vm = new VM.$Machine();
  console.time('transform code');
  vm.loadString(code);
  console.timeEnd('transform code');
  // TODO: 按顺序执行
  vm.run()
}

function transformScript(node) {
  var src = node.getAttribute('src');
  if (src) {
    transformExternalScript(src);
  } else {
    transformCode(node.innerText);
  }
}

new MutationObserver(mutations => {
  mutations.forEach(mutation => {
    var nodes = mutation.addedNodes;
    nodes.forEach(node => {
      if (node.tagName && node.tagName.toLowerCase() === 'script') {
        node.parentNode && node.parentNode.removeChild(node);
        transformScript(node);
      }
    });
  });
}).observe(document, {subtree: true, childList: true});
