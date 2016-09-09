/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	var VM = __webpack_require__(1);

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


/***/ },
/* 1 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(process) {// var fs = require('fs');
	var compiler = __webpack_require__(3);

	var hasOwn = Object.prototype.hasOwnProperty;

	// modules

	// function require(relativeTo, id) {
	//   var dir = path.dirname(relativeTo);
	//   var absPath;
	//   if(isRelative(id)) {
	//     absPath = path.join(dir, id);
	//   }
	//   else {
	//     absPath = node.resolve(id);
	//   }

	//   VM.loadScript(absPath);
	// }

	// vm

	var IDLE = 'idle';
	var SUSPENDED = 'suspended';
	var EXECUTING = 'executing';

	function Machine() {
	  this.debugInfo = null;
	  this.stack = null;
	  this.error = undefined;
	  this.doRestore = false;
	  this.evalResult = null;
	  this.state = IDLE;
	  this.running = false;
	  this._events = {};
	  this.stepping = false;
	  this.prevStates = [];
	  this.tryStack = [];
	  this.machineBreaks = [];
	  this.machineWatches = [];
	}

	Machine.prototype.loadScript = function(path) {
	  var src = fs.readFileSync(process.argv[2], "utf-8");
	  var output = compiler(src, { includeDebug: true });
	  var debugInfo = new DebugInfo(output.debugInfo);

	  this.setDebugInfo(debugInfo);
	  this.setCode(path, output.code);
	  this.run();
	};

	Machine.prototype.loadModule = function(path) {
	  var src = fs.readFileSync(process.argv[2], "utf-8");
	  var output = compiler(src, { includeDebug: true });

	  // run...
	};

	Machine.prototype.loadString = function(str) {
	  var output = compiler(str, { includeDebug: true });
	  var debugInfo = new DebugInfo(output.debugInfo);

	  this.setDebugInfo(debugInfo);
	  this.setCode('/eval', output.code);
	}

	Machine.prototype.execute = function(fn, thisPtr, args) {
	  var prevState = this.state;
	  this.state = EXECUTING;
	  this.running = true;

	  var prevStepping = this.stepping;
	  var prevFrame = this.rootFrame;
	  this.stepping = false;
	  var ret;

	  try {
	    if(thisPtr || args) {
	      ret = fn.apply(thisPtr, args || []);
	    }
	    else {
	      ret = fn();
	    }
	  }
	  catch(e) {
	    this.stack = e.fnstack;
	    this.error = e.error;
	  }

	  this.stepping = prevStepping;

	  // It's a weird case if we run code while we are suspended, but if
	  // so we try to run it and kind of ignore whatever happened (no
	  // breakpoints, etc), but we do fire an error event if it happened
	  if(prevState === 'suspended') {
	    if(this.error) {
	      this.fire('error', this.error);
	    }
	    this.state = prevState;
	  }
	  else {
	    this.checkStatus();
	  }

	  return ret;
	};

	Machine.prototype.run = function() {
	  var path = this.path;
	  var code = this.code;

	  var module = {
	    exports: {}
	  };
	  var fn = new Function(
	    'VM',
	    // 'require',
	    // 'module',
	    // 'exports',
	    '$Frame',
	    '$ContinuationExc',
	    // 'console',
	    code + '\nreturn $__global;'
	  );

	  var rootFn = fn(
	    this,
	    // require.bind(null, path),
	    // module,
	    // module.exports,
	    Frame,
	    ContinuationExc
	    // { log: function() {
	    //   var args = Array.prototype.slice.call(arguments);
	    //   this.output += args.join(' ') + '\n';
	    // }.bind(this)}
	  );

	  this.output = '';
	  this.execute(rootFn);
	  this.globalFn = rootFn;
	};

	Machine.prototype.abort = function() {
	  this.output = '';
	  this.globalFn = null;
	  this.state = IDLE;
	  this.running = false;
	  this.path = '';
	  this.code = '';
	  this.invokingContinuation = null;
	  this.capturingContinuation = false;
	  this.error = null;
	};

	Machine.prototype.getNextStepId = function(machineId, stepId, offset) {
	  var locs = this.debugInfo.data.stepIds[machineId];
	  var idx = locs.indexOf(stepId);
	  if(idx + offset < locs.length) {
	    return this.debugInfo.data.stepIds[machineId][idx + offset];
	  }
	  return null;
	};

	Machine.prototype.continue = function() {
	  if(this.state === SUSPENDED) {
	    this.fire('resumed');

	    var root = this.getRootFrame();
	    var top = this.getTopFrame();
	    this.running = true;
	    this.state = EXECUTING;

	    if(this.machineBreaks[top.machineId][top.next]) {
	      // We need to get past this instruction that has a breakpoint, so
	      // turn off breakpoints and step past it, then turn them back on
	      // again and execute normally
	      this.stepping = true;
	      this.hasBreakpoints = false;
	      this.restore(true);
	      // TODO: don't force this back on always
	      this.hasBreakpoints = true;
	      this.stepping = false;
	    }

	    this.running = true;
	    this.state = EXECUTING;
	    this.restore();
	  }
	};

	Machine.prototype.step = function() {
	  if(!this.stack) return;
	  this.fire('resumed');

	  var _step = function() {
	    this.running = true;
	    this.stepping = true;
	    this.hasBreakpoints = false;
	    this.restore(true);
	    this.hasBreakpoints = true;
	    this.stepping = false;
	  }.bind(this);

	  _step();

	  var top = this.getTopFrame();
	  while(this.state === SUSPENDED && !this.getLocation()) {
	    // Keep stepping until we hit something we know where we are
	    // located
	    _step();
	  }

	  if(this.state === SUSPENDED) {
	    this.running = false;
	    this.fire('paused');
	  }
	};

	Machine.prototype.stepOver = function() {
	  if(!this.rootFrame) return;
	  var top = this.getTopFrame();
	  var curloc = this.getLocation();
	  var finalLoc = curloc;
	  var biggest = 0;
	  var locs = this.debugInfo.data[top.machineId].locs;

	  // find the "biggest" expression in the function that encloses
	  // this one
	  Object.keys(locs).forEach(function(k) {
	    var loc = locs[k];

	    if(loc.start.line <= curloc.start.line &&
	       loc.end.line >= curloc.end.line &&
	       loc.start.column <= curloc.start.column &&
	       loc.end.column >= curloc.end.column) {

	      var ldiff = ((curloc.start.line - loc.start.line) +
	                   (loc.end.line - curloc.end.line));
	      var cdiff = ((curloc.start.column - loc.start.column) +
	                   (loc.end.column - curloc.end.column));
	      if(ldiff + cdiff > biggest) {
	        finalLoc = loc;
	        biggest = ldiff + cdiff;
	      }
	    }
	  });

	  if(finalLoc !== curloc) {
	    while(this.getLocation() !== finalLoc) {
	      this.step();
	    }

	    this.step();
	  }
	  else {
	    this.step();
	  }
	};

	Machine.prototype.evaluate = function(expr) {
	  if(expr === '$_') {
	    return this.evalResult;
	  }

	  // An expression can be one of these forms:
	  //
	  // 1. foo = function() { <stmt/expr> ... }
	  // 2. function foo() { <stmt/expr> ... }
	  // 3. x = <expr>
	  // 4. var x = <expr>
	  // 5. <stmt/expr>
	  //
	  // 1-4 can change any data in the current frame, and introduce new
	  // variables that are only available for the current session (will
	  // disappear after any stepping/resume/etc). Functions in 1 and 2
	  // will be compiled, so they can be paused and debugged.
	  //
	  // 5 can run any arbitrary expression

	  if(this.stack) {
	    var top = this.getTopFrame();
	    expr = compiler(expr, {
	      asExpr: true,
	      scope: top.scope
	    }).code;

	    this.running = true;
	    this.doRestore = true;
	    this.stepping = false;
	    var res = top.evaluate(this, expr);
	    this.stepping = true;
	    this.doRestore = false;
	    this.running = false;
	  }
	  else if(this.globalFn) {
	    expr = compiler(expr, {
	      asExpr: true
	    }).code;

	    this.evalArg = expr;
	    this.stepping = true;

	    this.withTopFrame({
	      next: -1,
	      state: {}
	    }, function() {
	      this.doRestore = true;
	      try {
	        (0, this).globalFn();
	      }
	      catch(e) {
	        if(e.error) {
	          throw e.error;
	        }
	      }
	      this.doRestore = false;
	    }.bind(this));
	  }
	  else {
	    throw new Error('invalid evaluation state');
	  }

	  return this.evalResult;
	};

	Machine.prototype.restore = function(suppressEvents) {
	  try {
	    this.doRestore = true;
	    this.getRootFrame().restore();
	    this.error = undefined;
	  }
	  catch(e) {
	    this.stack = e.fnstack;
	    this.error = e.error;
	  }
	  this.checkStatus(suppressEvents);
	};

	Machine.prototype.checkStatus = function(suppressEvents) {
	  if(this.stack) {
	    if(this.capturingContinuation) {
	      this.capturingContinuation = false;
	      this.onCapture();
	      return;
	    }

	    if(this.invokingContinuation) {
	      var fnstack = this.invokingContinuation;
	      this.invokingContinuation = null;
	      this.onInvoke(fnstack);
	      return;
	    }

	    if(this.error) {
	      if(this.dispatchException()) {
	        return;
	      }

	      if(!suppressEvents) {
	        this.fire('error', this.error);
	      }
	    }
	    else if(!suppressEvents) {
	      this.fire('paused');
	    }

	    this.state = SUSPENDED;
	  }
	  else {
	    if(!suppressEvents) {
	      this.fire('finish');
	    }
	    this.state = IDLE;
	  }

	  this.running = false;
	};

	Machine.prototype.toggleBreakpoint = function(line) {
	  var debug = this.debugInfo;
	  var pos = debug.lineToMachinePos(line);

	  if(pos) {
	    this.hasBreakpoints = true;
	    if(this.machineBreaks[pos.machineId][pos.locId]) {
	      this.machineBreaks[pos.machineId][pos.locId] = false;
	    }
	    else {
	      this.machineBreaks[pos.machineId][pos.locId] = true;
	    }
	  }
	};

	Machine.prototype.callCC = function() {
	  this.capturingContinuation = true;
	  throw new ContinuationExc();
	};

	Machine.prototype.onCapture = function() {
	  var fnstack = this.stack.map(function(x) { return x; });
	  var top = fnstack[0];
	  var tmpid = top.tmpid;
	  var next = this.getNextStepId(top.machineId, top.next, 2);

	  top.next = this.getNextStepId(top.machineId, top.next, 1);

	  top.state['$__t' + (top.tmpid - 1)] = function(arg) {
	    top.next = next;
	    top.state['$__t' + tmpid] = arg;
	    if(this.running) {
	      this.invokeContinuation(fnstack);
	    }
	    else {
	      this.onInvoke(fnstack);
	    }
	  }.bind(this);

	  this.restore();
	}

	Machine.prototype.invokeContinuation = function(fnstack) {
	  this.invokingContinuation = fnstack;
	  throw new ContinuationExc();
	}

	Machine.prototype.onInvoke = function(fnstack) {
	  this.stack = fnstack.map(function(x) { return x; });
	  this.fire('cont-invoked');

	  if(!this.stepping) {
	    this.running = true;
	    this.state = EXECUTING;
	    this.restore();
	  }
	}

	Machine.prototype.handleWatch = function(machineId, locId, res) {
	  var id = this.machineWatches[machineId][locId].id;

	  this.fire('watched', {
	    id: id,
	    value: res
	  });
	};

	Machine.prototype.on = function(event, handler) {
	  var arr = this._events[event] || [];
	  arr.push(handler);
	  this._events[event] = arr;
	};

	Machine.prototype.off = function(event, handler) {
	  var arr = this._events[event] || [];
	  if(handler) {
	    var i = arr.indexOf(handler);
	    if(i !== -1) {
	      arr.splice(i, 1);
	    }
	  }
	  else {
	    this._events[event] = [];
	  }
	};

	Machine.prototype.fire = function(event, data) {
	  setTimeout(function() {
	    var arr = this._events[event] || [];
	    arr.forEach(function(handler) {
	      handler(data);
	    });
	  }.bind(this), 0);
	};

	Machine.prototype.getTopFrame = function() {
	  return this.stack && this.stack[0];
	};

	Machine.prototype.getRootFrame = function() {
	  return this.stack && this.stack[this.stack.length - 1];
	};

	Machine.prototype.getFrameOffset = function(i) {
	  // TODO: this is really annoying, but it works for now. have to do
	  // two passes
	  var top = this.rootFrame;
	  var count = 0;
	  while(top.child) {
	    top = top.child;
	    count++;
	  }

	  if(i > count) {
	    return null;
	  }

	  var depth = count - i;
	  top = this.rootFrame;
	  count = 0;
	  while(top.child && count < depth) {
	    top = top.child;
	    count++;
	  }

	  return top;
	};

	Machine.prototype.setDebugInfo = function(info) {
	  this.debugInfo = info || new DebugInfo([]);
	  var machines = info.data.machines;
	  this.machineBreaks = new Array(machines.length);
	  this.machineWatches = new Array(machines.length);

	  for(var i=0; i<machines.length; i++) {
	    this.machineBreaks[i] = [];
	  }
	  for(var i=0; i<machines.length; i++) {
	    this.machineWatches[i] = [];
	  }
	};

	Machine.prototype.setCode = function(path, code) {
	  this.path = path;
	  this.code = code;
	};

	Machine.prototype.isStepping = function() {
	  return this.stepping;
	};

	Machine.prototype.getOutput = function() {
	  return this.output;
	};

	Machine.prototype.getState = function() {
	  return this.state;
	};

	Machine.prototype.getLocation = function() {
	  if(!this.stack || !this.debugInfo) return;

	  var top = this.getTopFrame();
	  return this.debugInfo.data.machines[top.machineId].locs[top.next];
	};

	Machine.prototype.disableBreakpoints = function() {
	  this.hasBreakpoints = false;
	};

	Machine.prototype.enableBreakpoints = function() {
	  this.hasBreakpoints = true;
	};

	Machine.prototype.pushState = function() {
	  this.prevStates.push([
	    this.stepping, this.hasBreakpoints
	  ]);

	  this.stepping = false;
	  this.hasBreakpoints = false;
	};

	Machine.prototype.popState = function() {
	  var state = this.prevStates.pop();
	  this.stepping = state[0];
	  this.hasBreakpoints = state[1];
	};

	Machine.prototype.pushTry = function(stack, catchLoc, finallyLoc, finallyTempVar) {
	  if(finallyLoc) {
	    stack.push({
	      finallyLoc: finallyLoc,
	      finallyTempVar: finallyTempVar
	    });
	  }

	  if(catchLoc) {
	    stack.push({
	      catchLoc: catchLoc
	    });
	  }
	};

	Machine.prototype.popCatch = function(stack, catchLoc) {
	  var entry = stack[stack.length - 1];
	  if(entry && entry.catchLoc === catchLoc) {
	    stack.pop();
	  }
	};

	Machine.prototype.popFinally = function(stack, finallyLoc) {
	  var entry = stack[stack.length - 1];

	  if(!entry || !entry.finallyLoc) {
	    stack.pop();
	    entry = stack[stack.length - 1];
	  }

	  if(entry && entry.finallyLoc === finallyLoc) {
	    stack.pop();
	  }
	};

	Machine.prototype.dispatchException = function() {
	  if(this.error == null) {
	    return false;
	  }

	  var exc = this.error;
	  var dispatched = false;
	  var prevStepping = this.stepping;
	  this.stepping = false;

	  for(var i=0; i<this.stack.length; i++) {
	    var frame = this.stack[i];

	    if(frame.dispatchException(this, exc)) {
	      // shave off the frames were walked over
	      this.stack = this.stack.slice(i);
	      dispatched = true;
	      break;
	    }
	  }

	  if(!prevStepping && dispatched) {
	    this.restore();
	    this.error = undefined;
	  }

	  return dispatched;
	};

	Machine.prototype.keys = function(obj) {
	  return Object.keys(obj).reverse();
	};

	Machine.prototype.popFrame = function() {
	  var r = this.stack.pop();
	  if(!this.stack.length) {
	    this.doRestore = false;
	    this.stack = null;
	  }
	  return r;
	};

	Machine.prototype.nextFrame = function() {
	  if(this.stack && this.stack.length) {
	    return this.stack[this.stack.length - 1];
	  }
	  return null;
	};

	Machine.prototype.withTopFrame = function(frame, fn) {
	  var prev = this.stack;
	  this.stack = [frame];
	  try {
	    var newFrame;
	    if((newFrame = fn())) {
	      // replace the top of the real stack with the new frame
	      prev[0] = newFrame;
	    }
	  }
	  finally {
	    this.stack = prev;
	  }
	};

	// frame

	function Frame(machineId, name, fn, next, state, scope,
	               thisPtr, tryStack, tmpid) {
	  this.machineId = machineId;
	  this.name = name;
	  this.fn = fn;
	  this.next = next;
	  this.state = state;
	  this.scope = scope;
	  this.thisPtr = thisPtr;
	  this.tryStack = tryStack;
	  this.tmpid = tmpid;
	}

	Frame.prototype.restore = function() {
	  this.fn.call(this.thisPtr);
	};

	Frame.prototype.evaluate = function(machine, expr) {
	  machine.evalArg = expr;
	  machine.error = undefined;
	  machine.stepping = true;

	  machine.withTopFrame(this, function() {
	    var prevNext = this.next;
	    this.next = -1;

	    try {
	      this.fn.call(this.thisPtr);
	    }
	    catch(e) {
	      if(!(e instanceof ContinuationExc)) {
	        throw e;
	      }
	      else if(e.error) {
	        throw e.error;
	      }

	      var newFrame = e.fnstack[0];
	      newFrame.next = prevNext;
	      return newFrame;
	    }

	    throw new Error('eval did not get a frame back');
	  }.bind(this));

	  return machine.evalResult;
	};

	Frame.prototype.stackEach = function(func) {
	  if(this.child) {
	    this.child.stackEach(func);
	  }
	  func(this);
	};

	Frame.prototype.stackMap = function(func) {
	  var res;
	  if(this.child) {
	    res = this.child.stackMap(func);
	  }
	  else {
	    res = [];
	  }

	  res.push(func(this));
	  return res;
	};

	Frame.prototype.stackReduce = function(func, acc) {
	  if(this.child) {
	    acc = this.child.stackReduce(func, acc);
	  }

	  return func(acc, this);
	};

	Frame.prototype.getLocation = function(machine) {
	  return machine.debugInfo.data[this.machineId].locs[this.next];
	};

	Frame.prototype.dispatchException = function(machine, exc) {
	  if(!this.tryStack) {
	    return false;
	  }

	  var next;
	  var hasCaught = false;
	  var hasFinally = false;
	  var finallyEntries = [];

	  for(var i=this.tryStack.length - 1; i >= 0; i--) {
	    var entry = this.tryStack[i];
	    if(entry.catchLoc) {
	      next = entry.catchLoc;
	      hasCaught = true;
	      break;
	    }
	    else if(entry.finallyLoc) {
	      finallyEntries.push(entry);
	      hasFinally = true;
	    }
	  }

	  // initially, `next` is undefined which will jump to the end of the
	  // function. (the default case)
	  while((entry = finallyEntries.pop())) {
	    this.state['$__t' + entry.finallyTempVar] = next;
	    next = entry.finallyLoc;
	  }

	  this.next = next;

	  if(hasFinally && !hasCaught) {
	    machine.withTopFrame(this, function() {
	      machine.doRestore = true;
	      this.restore();
	    }.bind(this));
	  }

	  return hasCaught;
	};

	// debug info

	function DebugInfo(data) {
	  this.data = data;
	}

	DebugInfo.prototype.lineToMachinePos = function(line) {
	  if(!this.data) return null;
	  var machines = this.data.machines;

	  // Iterate over the machines backwards because they are ordered
	  // innermost to top-level, and we want to break on the outermost
	  // function.
	  for(var i=machines.length - 1; i >= 0; i--) {
	    var locs = machines[i].locs;
	    var keys = Object.keys(locs);

	    for(var cur=0, len=keys.length; cur<len; cur++) {
	      var loc = locs[keys[cur]];
	      if(loc.start.line === line) {
	        return {
	          machineId: i,
	          locId: parseInt(keys[cur])
	        };
	      }
	    }
	  }

	  return null;
	};

	DebugInfo.prototype.closestMachinePos = function(start, end) {
	  if(!this.data) return null;

	  for(var i=0, l=this.data.length; i<l; i++) {
	    var locs = this.data[i].locs;
	    var keys = Object.keys(locs);
	    keys = keys.map(function(k) { return parseInt(k); });
	    keys.sort(function(a, b) { return a-b; });

	    for(var cur=0, len=keys.length; cur<len; cur++) {
	      var loc = locs[keys[cur]];

	      if((loc.start.line < start.line ||
	          (loc.start.line === start.line &&
	           loc.start.column <= start.ch)) &&
	         (loc.end.line > end.line ||
	          (loc.end.line === end.line &&
	           loc.end.column >= end.ch))) {
	        return {
	          machineId: i,
	          locId: keys[cur]
	        };
	      }
	    }
	  }

	  return null;
	};

	DebugInfo.prototype.setWatch = function(pos, src) {
	  // TODO: real uuid
	  var id = Math.random() * 10000 | 0;
	  this.watches.push({
	    pos: pos,
	    src: src,
	    id: id
	  });

	  return id;
	};

	function ContinuationExc(error, initialFrame, savedFrames) {
	  this.fnstack = (
	    savedFrames ? savedFrames :
	      initialFrame ? [initialFrame] :
	      []
	  );
	  this.error = error;
	  this.reuse = !!initialFrame;
	}

	ContinuationExc.prototype.pushFrame = function(frame) {
	  this.fnstack.push(frame);
	};

	// exports

	module.exports.$Machine = Machine;
	module.exports.$Frame = Frame;
	module.exports.$DebugInfo = DebugInfo;
	module.exports.$ContinuationExc = ContinuationExc;

	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(2)))

/***/ },
/* 2 */
/***/ function(module, exports) {

	// shim for using process in browser

	var process = module.exports = {};

	// cached from whatever global is present so that test runners that stub it
	// don't break things.  But we need to wrap it in a try catch in case it is
	// wrapped in strict mode code which doesn't define any globals.  It's inside a
	// function because try/catches deoptimize in certain engines.

	var cachedSetTimeout;
	var cachedClearTimeout;

	(function () {
	  try {
	    cachedSetTimeout = setTimeout;
	  } catch (e) {
	    cachedSetTimeout = function () {
	      throw new Error('setTimeout is not defined');
	    }
	  }
	  try {
	    cachedClearTimeout = clearTimeout;
	  } catch (e) {
	    cachedClearTimeout = function () {
	      throw new Error('clearTimeout is not defined');
	    }
	  }
	} ())
	var queue = [];
	var draining = false;
	var currentQueue;
	var queueIndex = -1;

	function cleanUpNextTick() {
	    if (!draining || !currentQueue) {
	        return;
	    }
	    draining = false;
	    if (currentQueue.length) {
	        queue = currentQueue.concat(queue);
	    } else {
	        queueIndex = -1;
	    }
	    if (queue.length) {
	        drainQueue();
	    }
	}

	function drainQueue() {
	    if (draining) {
	        return;
	    }
	    var timeout = cachedSetTimeout(cleanUpNextTick);
	    draining = true;

	    var len = queue.length;
	    while(len) {
	        currentQueue = queue;
	        queue = [];
	        while (++queueIndex < len) {
	            if (currentQueue) {
	                currentQueue[queueIndex].run();
	            }
	        }
	        queueIndex = -1;
	        len = queue.length;
	    }
	    currentQueue = null;
	    draining = false;
	    cachedClearTimeout(timeout);
	}

	process.nextTick = function (fun) {
	    var args = new Array(arguments.length - 1);
	    if (arguments.length > 1) {
	        for (var i = 1; i < arguments.length; i++) {
	            args[i - 1] = arguments[i];
	        }
	    }
	    queue.push(new Item(fun, args));
	    if (queue.length === 1 && !draining) {
	        cachedSetTimeout(drainQueue, 0);
	    }
	};

	// v8 likes predictible objects
	function Item(fun, array) {
	    this.fun = fun;
	    this.array = array;
	}
	Item.prototype.run = function () {
	    this.fun.apply(null, this.array);
	};
	process.title = 'browser';
	process.browser = true;
	process.env = {};
	process.argv = [];
	process.version = ''; // empty string to avoid regexp issues
	process.versions = {};

	function noop() {}

	process.on = noop;
	process.addListener = noop;
	process.once = noop;
	process.off = noop;
	process.removeListener = noop;
	process.removeAllListeners = noop;
	process.emit = noop;

	process.binding = function (name) {
	    throw new Error('process.binding is not supported');
	};

	process.cwd = function () { return '/' };
	process.chdir = function (dir) {
	    throw new Error('process.chdir is not supported');
	};
	process.umask = function() { return 0; };


/***/ },
/* 3 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(__dirname) {/**
	 * Copyright (c) 2013, Facebook, Inc.
	 * All rights reserved.
	 *
	 * This source code is licensed under the BSD-style license found in the
	 * https://raw.github.com/facebook/regenerator/master/LICENSE file. An
	 * additional grant of patent rights can be found in the PATENTS file in
	 * the same directory.
	 */

	var assert = __webpack_require__(4);
	var path = __webpack_require__(8);
	var types = __webpack_require__(9);
	var b = types.builders;
	var transform = __webpack_require__(22).transform;
	var utils = __webpack_require__(24);
	var recast = __webpack_require__(26);
	var esprimaHarmony = __webpack_require__(41);
	var genFunExp = /\bfunction\s*\*/;
	var blockBindingExp = /\b(let|const)\s+/;

	assert.ok(
	  /harmony/.test(esprimaHarmony.version),
	  "Bad esprima version: " + esprimaHarmony.version
	);

	function regenerator(source, options) {
	  options = utils.defaults(options || {}, {
	    supportBlockBinding: true
	  });

	  var supportBlockBinding = !!options.supportBlockBinding;
	  if (supportBlockBinding) {
	    if (!blockBindingExp.test(source)) {
	      supportBlockBinding = false;
	    }
	  }

	  var recastOptions = {
	    tabWidth: utils.guessTabWidth(source),
	    // Use the harmony branch of Esprima that installs with regenerator
	    // instead of the master branch that recast provides.
	    esprima: esprimaHarmony,
	    range: supportBlockBinding,
	      loc: true
	  };

	  var recastAst = recast.parse(source, recastOptions);
	  var ast = recastAst.program;

	  // Transpile let/const into var declarations.
	  if (supportBlockBinding) {
	    var defsResult = __webpack_require__(54)(ast, {
	      ast: true,
	      disallowUnknownReferences: false,
	      disallowDuplicated: false,
	      disallowVars: false,
	      loopClosures: "iife"
	    });

	    if (defsResult.errors) {
	      throw new Error(defsResult.errors.join("\n"))
	    }
	  }

	  var transformed = transform(ast, options);
	  recastAst.program = transformed.ast;
	  var appendix = '';

	  if(options.includeDebug) {
	    var body = recastAst.program.body;
	    body.unshift.apply(body, transformed.debugAST);
	  }

	  return {
	    code: recast.print(recastAst, recastOptions).code + '\n' + appendix,
	    debugInfo: transformed.debugInfo
	  };
	}

	// To modify an AST directly, call require("regenerator").transform(ast).
	regenerator.transform = transform;

	regenerator.runtime = {
	  dev: path.join(__dirname, "runtime", "vm.js"),
	  min: path.join(__dirname, "runtime", "min.js")
	};

	// To transform a string of ES6 code, call require("regenerator")(source);
	module.exports = regenerator;

	/* WEBPACK VAR INJECTION */}.call(exports, "/"))

/***/ },
/* 4 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(global) {'use strict';

	// compare and isBuffer taken from https://github.com/feross/buffer/blob/680e9e5e488f22aac27599a57dc844a6315928dd/index.js
	// original notice:

	/*!
	 * The buffer module from node.js, for the browser.
	 *
	 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
	 * @license  MIT
	 */
	function compare(a, b) {
	  if (a === b) {
	    return 0;
	  }

	  var x = a.length;
	  var y = b.length;

	  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
	    if (a[i] !== b[i]) {
	      x = a[i];
	      y = b[i];
	      break;
	    }
	  }

	  if (x < y) {
	    return -1;
	  }
	  if (y < x) {
	    return 1;
	  }
	  return 0;
	}
	function isBuffer(b) {
	  if (global.Buffer && typeof global.Buffer.isBuffer === 'function') {
	    return global.Buffer.isBuffer(b);
	  }
	  return !!(b != null && b._isBuffer);
	}

	// based on node assert, original notice:

	// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
	//
	// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
	//
	// Originally from narwhal.js (http://narwhaljs.org)
	// Copyright (c) 2009 Thomas Robinson <280north.com>
	//
	// Permission is hereby granted, free of charge, to any person obtaining a copy
	// of this software and associated documentation files (the 'Software'), to
	// deal in the Software without restriction, including without limitation the
	// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
	// sell copies of the Software, and to permit persons to whom the Software is
	// furnished to do so, subject to the following conditions:
	//
	// The above copyright notice and this permission notice shall be included in
	// all copies or substantial portions of the Software.
	//
	// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
	// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
	// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

	var util = __webpack_require__(5);
	var hasOwn = Object.prototype.hasOwnProperty;
	var pSlice = Array.prototype.slice;
	var functionsHaveNames = (function () {
	  return function foo() {}.name === 'foo';
	}());
	function pToString (obj) {
	  return Object.prototype.toString.call(obj);
	}
	function isView(arrbuf) {
	  if (isBuffer(arrbuf)) {
	    return false;
	  }
	  if (typeof global.ArrayBuffer !== 'function') {
	    return false;
	  }
	  if (typeof ArrayBuffer.isView === 'function') {
	    return ArrayBuffer.isView(arrbuf);
	  }
	  if (!arrbuf) {
	    return false;
	  }
	  if (arrbuf instanceof DataView) {
	    return true;
	  }
	  if (arrbuf.buffer && arrbuf.buffer instanceof ArrayBuffer) {
	    return true;
	  }
	  return false;
	}
	// 1. The assert module provides functions that throw
	// AssertionError's when particular conditions are not met. The
	// assert module must conform to the following interface.

	var assert = module.exports = ok;

	// 2. The AssertionError is defined in assert.
	// new assert.AssertionError({ message: message,
	//                             actual: actual,
	//                             expected: expected })

	var regex = /\s*function\s+([^\(\s]*)\s*/;
	// based on https://github.com/ljharb/function.prototype.name/blob/adeeeec8bfcc6068b187d7d9fb3d5bb1d3a30899/implementation.js
	function getName(func) {
	  if (!util.isFunction(func)) {
	    return;
	  }
	  if (functionsHaveNames) {
	    return func.name;
	  }
	  var str = func.toString();
	  var match = str.match(regex);
	  return match && match[1];
	}
	assert.AssertionError = function AssertionError(options) {
	  this.name = 'AssertionError';
	  this.actual = options.actual;
	  this.expected = options.expected;
	  this.operator = options.operator;
	  if (options.message) {
	    this.message = options.message;
	    this.generatedMessage = false;
	  } else {
	    this.message = getMessage(this);
	    this.generatedMessage = true;
	  }
	  var stackStartFunction = options.stackStartFunction || fail;
	  if (Error.captureStackTrace) {
	    Error.captureStackTrace(this, stackStartFunction);
	  } else {
	    // non v8 browsers so we can have a stacktrace
	    var err = new Error();
	    if (err.stack) {
	      var out = err.stack;

	      // try to strip useless frames
	      var fn_name = getName(stackStartFunction);
	      var idx = out.indexOf('\n' + fn_name);
	      if (idx >= 0) {
	        // once we have located the function frame
	        // we need to strip out everything before it (and its line)
	        var next_line = out.indexOf('\n', idx + 1);
	        out = out.substring(next_line + 1);
	      }

	      this.stack = out;
	    }
	  }
	};

	// assert.AssertionError instanceof Error
	util.inherits(assert.AssertionError, Error);

	function truncate(s, n) {
	  if (typeof s === 'string') {
	    return s.length < n ? s : s.slice(0, n);
	  } else {
	    return s;
	  }
	}
	function inspect(something) {
	  if (functionsHaveNames || !util.isFunction(something)) {
	    return util.inspect(something);
	  }
	  var rawname = getName(something);
	  var name = rawname ? ': ' + rawname : '';
	  return '[Function' +  name + ']';
	}
	function getMessage(self) {
	  return truncate(inspect(self.actual), 128) + ' ' +
	         self.operator + ' ' +
	         truncate(inspect(self.expected), 128);
	}

	// At present only the three keys mentioned above are used and
	// understood by the spec. Implementations or sub modules can pass
	// other keys to the AssertionError's constructor - they will be
	// ignored.

	// 3. All of the following functions must throw an AssertionError
	// when a corresponding condition is not met, with a message that
	// may be undefined if not provided.  All assertion methods provide
	// both the actual and expected values to the assertion error for
	// display purposes.

	function fail(actual, expected, message, operator, stackStartFunction) {
	  throw new assert.AssertionError({
	    message: message,
	    actual: actual,
	    expected: expected,
	    operator: operator,
	    stackStartFunction: stackStartFunction
	  });
	}

	// EXTENSION! allows for well behaved errors defined elsewhere.
	assert.fail = fail;

	// 4. Pure assertion tests whether a value is truthy, as determined
	// by !!guard.
	// assert.ok(guard, message_opt);
	// This statement is equivalent to assert.equal(true, !!guard,
	// message_opt);. To test strictly for the value true, use
	// assert.strictEqual(true, guard, message_opt);.

	function ok(value, message) {
	  if (!value) fail(value, true, message, '==', assert.ok);
	}
	assert.ok = ok;

	// 5. The equality assertion tests shallow, coercive equality with
	// ==.
	// assert.equal(actual, expected, message_opt);

	assert.equal = function equal(actual, expected, message) {
	  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
	};

	// 6. The non-equality assertion tests for whether two objects are not equal
	// with != assert.notEqual(actual, expected, message_opt);

	assert.notEqual = function notEqual(actual, expected, message) {
	  if (actual == expected) {
	    fail(actual, expected, message, '!=', assert.notEqual);
	  }
	};

	// 7. The equivalence assertion tests a deep equality relation.
	// assert.deepEqual(actual, expected, message_opt);

	assert.deepEqual = function deepEqual(actual, expected, message) {
	  if (!_deepEqual(actual, expected, false)) {
	    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
	  }
	};

	assert.deepStrictEqual = function deepStrictEqual(actual, expected, message) {
	  if (!_deepEqual(actual, expected, true)) {
	    fail(actual, expected, message, 'deepStrictEqual', assert.deepStrictEqual);
	  }
	};

	function _deepEqual(actual, expected, strict, memos) {
	  // 7.1. All identical values are equivalent, as determined by ===.
	  if (actual === expected) {
	    return true;
	  } else if (isBuffer(actual) && isBuffer(expected)) {
	    return compare(actual, expected) === 0;

	  // 7.2. If the expected value is a Date object, the actual value is
	  // equivalent if it is also a Date object that refers to the same time.
	  } else if (util.isDate(actual) && util.isDate(expected)) {
	    return actual.getTime() === expected.getTime();

	  // 7.3 If the expected value is a RegExp object, the actual value is
	  // equivalent if it is also a RegExp object with the same source and
	  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
	  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
	    return actual.source === expected.source &&
	           actual.global === expected.global &&
	           actual.multiline === expected.multiline &&
	           actual.lastIndex === expected.lastIndex &&
	           actual.ignoreCase === expected.ignoreCase;

	  // 7.4. Other pairs that do not both pass typeof value == 'object',
	  // equivalence is determined by ==.
	  } else if ((actual === null || typeof actual !== 'object') &&
	             (expected === null || typeof expected !== 'object')) {
	    return strict ? actual === expected : actual == expected;

	  // If both values are instances of typed arrays, wrap their underlying
	  // ArrayBuffers in a Buffer each to increase performance
	  // This optimization requires the arrays to have the same type as checked by
	  // Object.prototype.toString (aka pToString). Never perform binary
	  // comparisons for Float*Arrays, though, since e.g. +0 === -0 but their
	  // bit patterns are not identical.
	  } else if (isView(actual) && isView(expected) &&
	             pToString(actual) === pToString(expected) &&
	             !(actual instanceof Float32Array ||
	               actual instanceof Float64Array)) {
	    return compare(new Uint8Array(actual.buffer),
	                   new Uint8Array(expected.buffer)) === 0;

	  // 7.5 For all other Object pairs, including Array objects, equivalence is
	  // determined by having the same number of owned properties (as verified
	  // with Object.prototype.hasOwnProperty.call), the same set of keys
	  // (although not necessarily the same order), equivalent values for every
	  // corresponding key, and an identical 'prototype' property. Note: this
	  // accounts for both named and indexed properties on Arrays.
	  } else if (isBuffer(actual) !== isBuffer(expected)) {
	    return false;
	  } else {
	    memos = memos || {actual: [], expected: []};

	    var actualIndex = memos.actual.indexOf(actual);
	    if (actualIndex !== -1) {
	      if (actualIndex === memos.expected.indexOf(expected)) {
	        return true;
	      }
	    }

	    memos.actual.push(actual);
	    memos.expected.push(expected);

	    return objEquiv(actual, expected, strict, memos);
	  }
	}

	function isArguments(object) {
	  return Object.prototype.toString.call(object) == '[object Arguments]';
	}

	function objEquiv(a, b, strict, actualVisitedObjects) {
	  if (a === null || a === undefined || b === null || b === undefined)
	    return false;
	  // if one is a primitive, the other must be same
	  if (util.isPrimitive(a) || util.isPrimitive(b))
	    return a === b;
	  if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b))
	    return false;
	  var aIsArgs = isArguments(a);
	  var bIsArgs = isArguments(b);
	  if ((aIsArgs && !bIsArgs) || (!aIsArgs && bIsArgs))
	    return false;
	  if (aIsArgs) {
	    a = pSlice.call(a);
	    b = pSlice.call(b);
	    return _deepEqual(a, b, strict);
	  }
	  var ka = objectKeys(a);
	  var kb = objectKeys(b);
	  var key, i;
	  // having the same number of owned properties (keys incorporates
	  // hasOwnProperty)
	  if (ka.length !== kb.length)
	    return false;
	  //the same set of keys (although not necessarily the same order),
	  ka.sort();
	  kb.sort();
	  //~~~cheap key test
	  for (i = ka.length - 1; i >= 0; i--) {
	    if (ka[i] !== kb[i])
	      return false;
	  }
	  //equivalent values for every corresponding key, and
	  //~~~possibly expensive deep test
	  for (i = ka.length - 1; i >= 0; i--) {
	    key = ka[i];
	    if (!_deepEqual(a[key], b[key], strict, actualVisitedObjects))
	      return false;
	  }
	  return true;
	}

	// 8. The non-equivalence assertion tests for any deep inequality.
	// assert.notDeepEqual(actual, expected, message_opt);

	assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
	  if (_deepEqual(actual, expected, false)) {
	    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
	  }
	};

	assert.notDeepStrictEqual = notDeepStrictEqual;
	function notDeepStrictEqual(actual, expected, message) {
	  if (_deepEqual(actual, expected, true)) {
	    fail(actual, expected, message, 'notDeepStrictEqual', notDeepStrictEqual);
	  }
	}


	// 9. The strict equality assertion tests strict equality, as determined by ===.
	// assert.strictEqual(actual, expected, message_opt);

	assert.strictEqual = function strictEqual(actual, expected, message) {
	  if (actual !== expected) {
	    fail(actual, expected, message, '===', assert.strictEqual);
	  }
	};

	// 10. The strict non-equality assertion tests for strict inequality, as
	// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

	assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
	  if (actual === expected) {
	    fail(actual, expected, message, '!==', assert.notStrictEqual);
	  }
	};

	function expectedException(actual, expected) {
	  if (!actual || !expected) {
	    return false;
	  }

	  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
	    return expected.test(actual);
	  }

	  try {
	    if (actual instanceof expected) {
	      return true;
	    }
	  } catch (e) {
	    // Ignore.  The instanceof check doesn't work for arrow functions.
	  }

	  if (Error.isPrototypeOf(expected)) {
	    return false;
	  }

	  return expected.call({}, actual) === true;
	}

	function _tryBlock(block) {
	  var error;
	  try {
	    block();
	  } catch (e) {
	    error = e;
	  }
	  return error;
	}

	function _throws(shouldThrow, block, expected, message) {
	  var actual;

	  if (typeof block !== 'function') {
	    throw new TypeError('"block" argument must be a function');
	  }

	  if (typeof expected === 'string') {
	    message = expected;
	    expected = null;
	  }

	  actual = _tryBlock(block);

	  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
	            (message ? ' ' + message : '.');

	  if (shouldThrow && !actual) {
	    fail(actual, expected, 'Missing expected exception' + message);
	  }

	  var userProvidedMessage = typeof message === 'string';
	  var isUnwantedException = !shouldThrow && util.isError(actual);
	  var isUnexpectedException = !shouldThrow && actual && !expected;

	  if ((isUnwantedException &&
	      userProvidedMessage &&
	      expectedException(actual, expected)) ||
	      isUnexpectedException) {
	    fail(actual, expected, 'Got unwanted exception' + message);
	  }

	  if ((shouldThrow && actual && expected &&
	      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
	    throw actual;
	  }
	}

	// 11. Expected to throw an error:
	// assert.throws(block, Error_opt, message_opt);

	assert.throws = function(block, /*optional*/error, /*optional*/message) {
	  _throws(true, block, error, message);
	};

	// EXTENSION! This is annoying to write outside this module.
	assert.doesNotThrow = function(block, /*optional*/error, /*optional*/message) {
	  _throws(false, block, error, message);
	};

	assert.ifError = function(err) { if (err) throw err; };

	var objectKeys = Object.keys || function (obj) {
	  var keys = [];
	  for (var key in obj) {
	    if (hasOwn.call(obj, key)) keys.push(key);
	  }
	  return keys;
	};

	/* WEBPACK VAR INJECTION */}.call(exports, (function() { return this; }())))

/***/ },
/* 5 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(global, process) {// Copyright Joyent, Inc. and other Node contributors.
	//
	// Permission is hereby granted, free of charge, to any person obtaining a
	// copy of this software and associated documentation files (the
	// "Software"), to deal in the Software without restriction, including
	// without limitation the rights to use, copy, modify, merge, publish,
	// distribute, sublicense, and/or sell copies of the Software, and to permit
	// persons to whom the Software is furnished to do so, subject to the
	// following conditions:
	//
	// The above copyright notice and this permission notice shall be included
	// in all copies or substantial portions of the Software.
	//
	// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
	// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
	// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
	// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
	// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
	// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
	// USE OR OTHER DEALINGS IN THE SOFTWARE.

	var formatRegExp = /%[sdj%]/g;
	exports.format = function(f) {
	  if (!isString(f)) {
	    var objects = [];
	    for (var i = 0; i < arguments.length; i++) {
	      objects.push(inspect(arguments[i]));
	    }
	    return objects.join(' ');
	  }

	  var i = 1;
	  var args = arguments;
	  var len = args.length;
	  var str = String(f).replace(formatRegExp, function(x) {
	    if (x === '%%') return '%';
	    if (i >= len) return x;
	    switch (x) {
	      case '%s': return String(args[i++]);
	      case '%d': return Number(args[i++]);
	      case '%j':
	        try {
	          return JSON.stringify(args[i++]);
	        } catch (_) {
	          return '[Circular]';
	        }
	      default:
	        return x;
	    }
	  });
	  for (var x = args[i]; i < len; x = args[++i]) {
	    if (isNull(x) || !isObject(x)) {
	      str += ' ' + x;
	    } else {
	      str += ' ' + inspect(x);
	    }
	  }
	  return str;
	};


	// Mark that a method should not be used.
	// Returns a modified function which warns once by default.
	// If --no-deprecation is set, then it is a no-op.
	exports.deprecate = function(fn, msg) {
	  // Allow for deprecating things in the process of starting up.
	  if (isUndefined(global.process)) {
	    return function() {
	      return exports.deprecate(fn, msg).apply(this, arguments);
	    };
	  }

	  if (process.noDeprecation === true) {
	    return fn;
	  }

	  var warned = false;
	  function deprecated() {
	    if (!warned) {
	      if (process.throwDeprecation) {
	        throw new Error(msg);
	      } else if (process.traceDeprecation) {
	        console.trace(msg);
	      } else {
	        console.error(msg);
	      }
	      warned = true;
	    }
	    return fn.apply(this, arguments);
	  }

	  return deprecated;
	};


	var debugs = {};
	var debugEnviron;
	exports.debuglog = function(set) {
	  if (isUndefined(debugEnviron))
	    debugEnviron = process.env.NODE_DEBUG || '';
	  set = set.toUpperCase();
	  if (!debugs[set]) {
	    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
	      var pid = process.pid;
	      debugs[set] = function() {
	        var msg = exports.format.apply(exports, arguments);
	        console.error('%s %d: %s', set, pid, msg);
	      };
	    } else {
	      debugs[set] = function() {};
	    }
	  }
	  return debugs[set];
	};


	/**
	 * Echos the value of a value. Trys to print the value out
	 * in the best way possible given the different types.
	 *
	 * @param {Object} obj The object to print out.
	 * @param {Object} opts Optional options object that alters the output.
	 */
	/* legacy: obj, showHidden, depth, colors*/
	function inspect(obj, opts) {
	  // default options
	  var ctx = {
	    seen: [],
	    stylize: stylizeNoColor
	  };
	  // legacy...
	  if (arguments.length >= 3) ctx.depth = arguments[2];
	  if (arguments.length >= 4) ctx.colors = arguments[3];
	  if (isBoolean(opts)) {
	    // legacy...
	    ctx.showHidden = opts;
	  } else if (opts) {
	    // got an "options" object
	    exports._extend(ctx, opts);
	  }
	  // set default options
	  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
	  if (isUndefined(ctx.depth)) ctx.depth = 2;
	  if (isUndefined(ctx.colors)) ctx.colors = false;
	  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
	  if (ctx.colors) ctx.stylize = stylizeWithColor;
	  return formatValue(ctx, obj, ctx.depth);
	}
	exports.inspect = inspect;


	// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
	inspect.colors = {
	  'bold' : [1, 22],
	  'italic' : [3, 23],
	  'underline' : [4, 24],
	  'inverse' : [7, 27],
	  'white' : [37, 39],
	  'grey' : [90, 39],
	  'black' : [30, 39],
	  'blue' : [34, 39],
	  'cyan' : [36, 39],
	  'green' : [32, 39],
	  'magenta' : [35, 39],
	  'red' : [31, 39],
	  'yellow' : [33, 39]
	};

	// Don't use 'blue' not visible on cmd.exe
	inspect.styles = {
	  'special': 'cyan',
	  'number': 'yellow',
	  'boolean': 'yellow',
	  'undefined': 'grey',
	  'null': 'bold',
	  'string': 'green',
	  'date': 'magenta',
	  // "name": intentionally not styling
	  'regexp': 'red'
	};


	function stylizeWithColor(str, styleType) {
	  var style = inspect.styles[styleType];

	  if (style) {
	    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
	           '\u001b[' + inspect.colors[style][1] + 'm';
	  } else {
	    return str;
	  }
	}


	function stylizeNoColor(str, styleType) {
	  return str;
	}


	function arrayToHash(array) {
	  var hash = {};

	  array.forEach(function(val, idx) {
	    hash[val] = true;
	  });

	  return hash;
	}


	function formatValue(ctx, value, recurseTimes) {
	  // Provide a hook for user-specified inspect functions.
	  // Check that value is an object with an inspect function on it
	  if (ctx.customInspect &&
	      value &&
	      isFunction(value.inspect) &&
	      // Filter out the util module, it's inspect function is special
	      value.inspect !== exports.inspect &&
	      // Also filter out any prototype objects using the circular check.
	      !(value.constructor && value.constructor.prototype === value)) {
	    var ret = value.inspect(recurseTimes, ctx);
	    if (!isString(ret)) {
	      ret = formatValue(ctx, ret, recurseTimes);
	    }
	    return ret;
	  }

	  // Primitive types cannot have properties
	  var primitive = formatPrimitive(ctx, value);
	  if (primitive) {
	    return primitive;
	  }

	  // Look up the keys of the object.
	  var keys = Object.keys(value);
	  var visibleKeys = arrayToHash(keys);

	  if (ctx.showHidden) {
	    keys = Object.getOwnPropertyNames(value);
	  }

	  // IE doesn't make error fields non-enumerable
	  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
	  if (isError(value)
	      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
	    return formatError(value);
	  }

	  // Some type of object without properties can be shortcutted.
	  if (keys.length === 0) {
	    if (isFunction(value)) {
	      var name = value.name ? ': ' + value.name : '';
	      return ctx.stylize('[Function' + name + ']', 'special');
	    }
	    if (isRegExp(value)) {
	      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
	    }
	    if (isDate(value)) {
	      return ctx.stylize(Date.prototype.toString.call(value), 'date');
	    }
	    if (isError(value)) {
	      return formatError(value);
	    }
	  }

	  var base = '', array = false, braces = ['{', '}'];

	  // Make Array say that they are Array
	  if (isArray(value)) {
	    array = true;
	    braces = ['[', ']'];
	  }

	  // Make functions say that they are functions
	  if (isFunction(value)) {
	    var n = value.name ? ': ' + value.name : '';
	    base = ' [Function' + n + ']';
	  }

	  // Make RegExps say that they are RegExps
	  if (isRegExp(value)) {
	    base = ' ' + RegExp.prototype.toString.call(value);
	  }

	  // Make dates with properties first say the date
	  if (isDate(value)) {
	    base = ' ' + Date.prototype.toUTCString.call(value);
	  }

	  // Make error with message first say the error
	  if (isError(value)) {
	    base = ' ' + formatError(value);
	  }

	  if (keys.length === 0 && (!array || value.length == 0)) {
	    return braces[0] + base + braces[1];
	  }

	  if (recurseTimes < 0) {
	    if (isRegExp(value)) {
	      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
	    } else {
	      return ctx.stylize('[Object]', 'special');
	    }
	  }

	  ctx.seen.push(value);

	  var output;
	  if (array) {
	    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
	  } else {
	    output = keys.map(function(key) {
	      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
	    });
	  }

	  ctx.seen.pop();

	  return reduceToSingleString(output, base, braces);
	}


	function formatPrimitive(ctx, value) {
	  if (isUndefined(value))
	    return ctx.stylize('undefined', 'undefined');
	  if (isString(value)) {
	    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
	                                             .replace(/'/g, "\\'")
	                                             .replace(/\\"/g, '"') + '\'';
	    return ctx.stylize(simple, 'string');
	  }
	  if (isNumber(value))
	    return ctx.stylize('' + value, 'number');
	  if (isBoolean(value))
	    return ctx.stylize('' + value, 'boolean');
	  // For some reason typeof null is "object", so special case here.
	  if (isNull(value))
	    return ctx.stylize('null', 'null');
	}


	function formatError(value) {
	  return '[' + Error.prototype.toString.call(value) + ']';
	}


	function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
	  var output = [];
	  for (var i = 0, l = value.length; i < l; ++i) {
	    if (hasOwnProperty(value, String(i))) {
	      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
	          String(i), true));
	    } else {
	      output.push('');
	    }
	  }
	  keys.forEach(function(key) {
	    if (!key.match(/^\d+$/)) {
	      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
	          key, true));
	    }
	  });
	  return output;
	}


	function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
	  var name, str, desc;
	  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
	  if (desc.get) {
	    if (desc.set) {
	      str = ctx.stylize('[Getter/Setter]', 'special');
	    } else {
	      str = ctx.stylize('[Getter]', 'special');
	    }
	  } else {
	    if (desc.set) {
	      str = ctx.stylize('[Setter]', 'special');
	    }
	  }
	  if (!hasOwnProperty(visibleKeys, key)) {
	    name = '[' + key + ']';
	  }
	  if (!str) {
	    if (ctx.seen.indexOf(desc.value) < 0) {
	      if (isNull(recurseTimes)) {
	        str = formatValue(ctx, desc.value, null);
	      } else {
	        str = formatValue(ctx, desc.value, recurseTimes - 1);
	      }
	      if (str.indexOf('\n') > -1) {
	        if (array) {
	          str = str.split('\n').map(function(line) {
	            return '  ' + line;
	          }).join('\n').substr(2);
	        } else {
	          str = '\n' + str.split('\n').map(function(line) {
	            return '   ' + line;
	          }).join('\n');
	        }
	      }
	    } else {
	      str = ctx.stylize('[Circular]', 'special');
	    }
	  }
	  if (isUndefined(name)) {
	    if (array && key.match(/^\d+$/)) {
	      return str;
	    }
	    name = JSON.stringify('' + key);
	    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
	      name = name.substr(1, name.length - 2);
	      name = ctx.stylize(name, 'name');
	    } else {
	      name = name.replace(/'/g, "\\'")
	                 .replace(/\\"/g, '"')
	                 .replace(/(^"|"$)/g, "'");
	      name = ctx.stylize(name, 'string');
	    }
	  }

	  return name + ': ' + str;
	}


	function reduceToSingleString(output, base, braces) {
	  var numLinesEst = 0;
	  var length = output.reduce(function(prev, cur) {
	    numLinesEst++;
	    if (cur.indexOf('\n') >= 0) numLinesEst++;
	    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
	  }, 0);

	  if (length > 60) {
	    return braces[0] +
	           (base === '' ? '' : base + '\n ') +
	           ' ' +
	           output.join(',\n  ') +
	           ' ' +
	           braces[1];
	  }

	  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
	}


	// NOTE: These type checking functions intentionally don't use `instanceof`
	// because it is fragile and can be easily faked with `Object.create()`.
	function isArray(ar) {
	  return Array.isArray(ar);
	}
	exports.isArray = isArray;

	function isBoolean(arg) {
	  return typeof arg === 'boolean';
	}
	exports.isBoolean = isBoolean;

	function isNull(arg) {
	  return arg === null;
	}
	exports.isNull = isNull;

	function isNullOrUndefined(arg) {
	  return arg == null;
	}
	exports.isNullOrUndefined = isNullOrUndefined;

	function isNumber(arg) {
	  return typeof arg === 'number';
	}
	exports.isNumber = isNumber;

	function isString(arg) {
	  return typeof arg === 'string';
	}
	exports.isString = isString;

	function isSymbol(arg) {
	  return typeof arg === 'symbol';
	}
	exports.isSymbol = isSymbol;

	function isUndefined(arg) {
	  return arg === void 0;
	}
	exports.isUndefined = isUndefined;

	function isRegExp(re) {
	  return isObject(re) && objectToString(re) === '[object RegExp]';
	}
	exports.isRegExp = isRegExp;

	function isObject(arg) {
	  return typeof arg === 'object' && arg !== null;
	}
	exports.isObject = isObject;

	function isDate(d) {
	  return isObject(d) && objectToString(d) === '[object Date]';
	}
	exports.isDate = isDate;

	function isError(e) {
	  return isObject(e) &&
	      (objectToString(e) === '[object Error]' || e instanceof Error);
	}
	exports.isError = isError;

	function isFunction(arg) {
	  return typeof arg === 'function';
	}
	exports.isFunction = isFunction;

	function isPrimitive(arg) {
	  return arg === null ||
	         typeof arg === 'boolean' ||
	         typeof arg === 'number' ||
	         typeof arg === 'string' ||
	         typeof arg === 'symbol' ||  // ES6 symbol
	         typeof arg === 'undefined';
	}
	exports.isPrimitive = isPrimitive;

	exports.isBuffer = __webpack_require__(6);

	function objectToString(o) {
	  return Object.prototype.toString.call(o);
	}


	function pad(n) {
	  return n < 10 ? '0' + n.toString(10) : n.toString(10);
	}


	var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
	              'Oct', 'Nov', 'Dec'];

	// 26 Feb 16:19:34
	function timestamp() {
	  var d = new Date();
	  var time = [pad(d.getHours()),
	              pad(d.getMinutes()),
	              pad(d.getSeconds())].join(':');
	  return [d.getDate(), months[d.getMonth()], time].join(' ');
	}


	// log is just a thin wrapper to console.log that prepends a timestamp
	exports.log = function() {
	  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
	};


	/**
	 * Inherit the prototype methods from one constructor into another.
	 *
	 * The Function.prototype.inherits from lang.js rewritten as a standalone
	 * function (not on Function.prototype). NOTE: If this file is to be loaded
	 * during bootstrapping this function needs to be rewritten using some native
	 * functions as prototype setup using normal JavaScript does not work as
	 * expected during bootstrapping (see mirror.js in r114903).
	 *
	 * @param {function} ctor Constructor function which needs to inherit the
	 *     prototype.
	 * @param {function} superCtor Constructor function to inherit prototype from.
	 */
	exports.inherits = __webpack_require__(7);

	exports._extend = function(origin, add) {
	  // Don't do anything if add isn't an object
	  if (!add || !isObject(add)) return origin;

	  var keys = Object.keys(add);
	  var i = keys.length;
	  while (i--) {
	    origin[keys[i]] = add[keys[i]];
	  }
	  return origin;
	};

	function hasOwnProperty(obj, prop) {
	  return Object.prototype.hasOwnProperty.call(obj, prop);
	}

	/* WEBPACK VAR INJECTION */}.call(exports, (function() { return this; }()), __webpack_require__(2)))

/***/ },
/* 6 */
/***/ function(module, exports) {

	module.exports = function isBuffer(arg) {
	  return arg && typeof arg === 'object'
	    && typeof arg.copy === 'function'
	    && typeof arg.fill === 'function'
	    && typeof arg.readUInt8 === 'function';
	}

/***/ },
/* 7 */
/***/ function(module, exports) {

	if (typeof Object.create === 'function') {
	  // implementation from standard node.js 'util' module
	  module.exports = function inherits(ctor, superCtor) {
	    ctor.super_ = superCtor
	    ctor.prototype = Object.create(superCtor.prototype, {
	      constructor: {
	        value: ctor,
	        enumerable: false,
	        writable: true,
	        configurable: true
	      }
	    });
	  };
	} else {
	  // old school shim for old browsers
	  module.exports = function inherits(ctor, superCtor) {
	    ctor.super_ = superCtor
	    var TempCtor = function () {}
	    TempCtor.prototype = superCtor.prototype
	    ctor.prototype = new TempCtor()
	    ctor.prototype.constructor = ctor
	  }
	}


/***/ },
/* 8 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(process) {// Copyright Joyent, Inc. and other Node contributors.
	//
	// Permission is hereby granted, free of charge, to any person obtaining a
	// copy of this software and associated documentation files (the
	// "Software"), to deal in the Software without restriction, including
	// without limitation the rights to use, copy, modify, merge, publish,
	// distribute, sublicense, and/or sell copies of the Software, and to permit
	// persons to whom the Software is furnished to do so, subject to the
	// following conditions:
	//
	// The above copyright notice and this permission notice shall be included
	// in all copies or substantial portions of the Software.
	//
	// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
	// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
	// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
	// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
	// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
	// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
	// USE OR OTHER DEALINGS IN THE SOFTWARE.

	// resolves . and .. elements in a path array with directory names there
	// must be no slashes, empty elements, or device names (c:\) in the array
	// (so also no leading and trailing slashes - it does not distinguish
	// relative and absolute paths)
	function normalizeArray(parts, allowAboveRoot) {
	  // if the path tries to go above the root, `up` ends up > 0
	  var up = 0;
	  for (var i = parts.length - 1; i >= 0; i--) {
	    var last = parts[i];
	    if (last === '.') {
	      parts.splice(i, 1);
	    } else if (last === '..') {
	      parts.splice(i, 1);
	      up++;
	    } else if (up) {
	      parts.splice(i, 1);
	      up--;
	    }
	  }

	  // if the path is allowed to go above the root, restore leading ..s
	  if (allowAboveRoot) {
	    for (; up--; up) {
	      parts.unshift('..');
	    }
	  }

	  return parts;
	}

	// Split a filename into [root, dir, basename, ext], unix version
	// 'root' is just a slash, or nothing.
	var splitPathRe =
	    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
	var splitPath = function(filename) {
	  return splitPathRe.exec(filename).slice(1);
	};

	// path.resolve([from ...], to)
	// posix version
	exports.resolve = function() {
	  var resolvedPath = '',
	      resolvedAbsolute = false;

	  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
	    var path = (i >= 0) ? arguments[i] : process.cwd();

	    // Skip empty and invalid entries
	    if (typeof path !== 'string') {
	      throw new TypeError('Arguments to path.resolve must be strings');
	    } else if (!path) {
	      continue;
	    }

	    resolvedPath = path + '/' + resolvedPath;
	    resolvedAbsolute = path.charAt(0) === '/';
	  }

	  // At this point the path should be resolved to a full absolute path, but
	  // handle relative paths to be safe (might happen when process.cwd() fails)

	  // Normalize the path
	  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
	    return !!p;
	  }), !resolvedAbsolute).join('/');

	  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
	};

	// path.normalize(path)
	// posix version
	exports.normalize = function(path) {
	  var isAbsolute = exports.isAbsolute(path),
	      trailingSlash = substr(path, -1) === '/';

	  // Normalize the path
	  path = normalizeArray(filter(path.split('/'), function(p) {
	    return !!p;
	  }), !isAbsolute).join('/');

	  if (!path && !isAbsolute) {
	    path = '.';
	  }
	  if (path && trailingSlash) {
	    path += '/';
	  }

	  return (isAbsolute ? '/' : '') + path;
	};

	// posix version
	exports.isAbsolute = function(path) {
	  return path.charAt(0) === '/';
	};

	// posix version
	exports.join = function() {
	  var paths = Array.prototype.slice.call(arguments, 0);
	  return exports.normalize(filter(paths, function(p, index) {
	    if (typeof p !== 'string') {
	      throw new TypeError('Arguments to path.join must be strings');
	    }
	    return p;
	  }).join('/'));
	};


	// path.relative(from, to)
	// posix version
	exports.relative = function(from, to) {
	  from = exports.resolve(from).substr(1);
	  to = exports.resolve(to).substr(1);

	  function trim(arr) {
	    var start = 0;
	    for (; start < arr.length; start++) {
	      if (arr[start] !== '') break;
	    }

	    var end = arr.length - 1;
	    for (; end >= 0; end--) {
	      if (arr[end] !== '') break;
	    }

	    if (start > end) return [];
	    return arr.slice(start, end - start + 1);
	  }

	  var fromParts = trim(from.split('/'));
	  var toParts = trim(to.split('/'));

	  var length = Math.min(fromParts.length, toParts.length);
	  var samePartsLength = length;
	  for (var i = 0; i < length; i++) {
	    if (fromParts[i] !== toParts[i]) {
	      samePartsLength = i;
	      break;
	    }
	  }

	  var outputParts = [];
	  for (var i = samePartsLength; i < fromParts.length; i++) {
	    outputParts.push('..');
	  }

	  outputParts = outputParts.concat(toParts.slice(samePartsLength));

	  return outputParts.join('/');
	};

	exports.sep = '/';
	exports.delimiter = ':';

	exports.dirname = function(path) {
	  var result = splitPath(path),
	      root = result[0],
	      dir = result[1];

	  if (!root && !dir) {
	    // No dirname whatsoever
	    return '.';
	  }

	  if (dir) {
	    // It has a dirname, strip trailing slash
	    dir = dir.substr(0, dir.length - 1);
	  }

	  return root + dir;
	};


	exports.basename = function(path, ext) {
	  var f = splitPath(path)[2];
	  // TODO: make this comparison case-insensitive on windows?
	  if (ext && f.substr(-1 * ext.length) === ext) {
	    f = f.substr(0, f.length - ext.length);
	  }
	  return f;
	};


	exports.extname = function(path) {
	  return splitPath(path)[3];
	};

	function filter (xs, f) {
	    if (xs.filter) return xs.filter(f);
	    var res = [];
	    for (var i = 0; i < xs.length; i++) {
	        if (f(xs[i], i, xs)) res.push(xs[i]);
	    }
	    return res;
	}

	// String.prototype.substr - negative index don't work in IE8
	var substr = 'ab'.substr(-1) === 'b'
	    ? function (str, start, len) { return str.substr(start, len) }
	    : function (str, start, len) {
	        if (start < 0) start = str.length + start;
	        return str.substr(start, len);
	    }
	;

	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(2)))

/***/ },
/* 9 */
/***/ function(module, exports, __webpack_require__) {

	var types = __webpack_require__(10);

	// This core module of AST types captures ES5 as it is parsed today by
	// git://github.com/ariya/esprima.git#master.
	__webpack_require__(11);

	// Feel free to add to or remove from this list of extension modules to
	// configure the precise type hierarchy that you need.
	__webpack_require__(13);
	__webpack_require__(14);
	__webpack_require__(15);
	__webpack_require__(16);
	__webpack_require__(17);

	types.finalize();

	exports.Type = types.Type;
	exports.builtInTypes = types.builtInTypes;
	exports.namedTypes = types.namedTypes;
	exports.builders = types.builders;
	exports.defineMethod = types.defineMethod;
	exports.getFieldNames = types.getFieldNames;
	exports.getFieldValue = types.getFieldValue;
	exports.eachField = types.eachField;
	exports.someField = types.someField;
	exports.traverse = __webpack_require__(18);
	exports.finalize = types.finalize;
	exports.NodePath = __webpack_require__(19);
	exports.computeSupertypeLookupTable = types.computeSupertypeLookupTable;


/***/ },
/* 10 */
/***/ function(module, exports, __webpack_require__) {

	var assert = __webpack_require__(4);
	var Ap = Array.prototype;
	var slice = Ap.slice;
	var map = Ap.map;
	var each = Ap.forEach;
	var Op = Object.prototype;
	var objToStr = Op.toString;
	var funObjStr = objToStr.call(function(){});
	var strObjStr = objToStr.call("");
	var hasOwn = Op.hasOwnProperty;

	// A type is an object with a .check method that takes a value and returns
	// true or false according to whether the value matches the type.

	function Type(check, name) {
	    var self = this;
	    assert.ok(self instanceof Type, self);

	    // Unfortunately we can't elegantly reuse isFunction and isString,
	    // here, because this code is executed while defining those types.
	    assert.strictEqual(objToStr.call(check), funObjStr,
	                       check + " is not a function");

	    // The `name` parameter can be either a function or a string.
	    var nameObjStr = objToStr.call(name);
	    assert.ok(nameObjStr === funObjStr ||
	              nameObjStr === strObjStr,
	              name + " is neither a function nor a string");

	    Object.defineProperties(self, {
	        name: { value: name },
	        check: {
	            value: function(value, deep) {
	                var result = check.call(self, value, deep);
	                if (!result && deep && objToStr.call(deep) === funObjStr)
	                    deep(self, value);
	                return result;
	            }
	        }
	    });
	}

	var Tp = Type.prototype;

	// Throughout this file we use Object.defineProperty to prevent
	// redefinition of exported properties.
	exports.Type = Type;

	// Like .check, except that failure triggers an AssertionError.
	Tp.assert = function(value, deep) {
	    if (!this.check(value, deep)) {
	        var str = shallowStringify(value);
	        assert.ok(false, str + " does not match type " + this);
	        return false;
	    }
	    return true;
	};

	function shallowStringify(value) {
	    if (isObject.check(value))
	        return "{" + Object.keys(value).map(function(key) {
	            return key + ": " + value[key];
	        }).join(", ") + "}";

	    if (isArray.check(value))
	        return "[" + value.map(shallowStringify).join(", ") + "]";

	    return JSON.stringify(value);
	}

	Tp.toString = function() {
	    var name = this.name;

	    if (isString.check(name))
	        return name;

	    if (isFunction.check(name))
	        return name.call(this) + "";

	    return name + " type";
	};

	var builtInTypes = {};
	exports.builtInTypes = builtInTypes;

	function defBuiltInType(example, name) {
	    var objStr = objToStr.call(example);

	    Object.defineProperty(builtInTypes, name, {
	        enumerable: true,
	        value: new Type(function(value) {
	            return objToStr.call(value) === objStr;
	        }, name)
	    });

	    return builtInTypes[name];
	}

	// These types check the underlying [[Class]] attribute of the given
	// value, rather than using the problematic typeof operator. Note however
	// that no subtyping is considered; so, for instance, isObject.check
	// returns false for [], /./, new Date, and null.
	var isString = defBuiltInType("", "string");
	var isFunction = defBuiltInType(function(){}, "function");
	var isArray = defBuiltInType([], "array");
	var isObject = defBuiltInType({}, "object");
	var isRegExp = defBuiltInType(/./, "RegExp");
	var isDate = defBuiltInType(new Date, "Date");
	var isNumber = defBuiltInType(3, "number");
	var isBoolean = defBuiltInType(true, "boolean");
	var isNull = defBuiltInType(null, "null");
	var isUndefined = defBuiltInType(void 0, "undefined");

	// There are a number of idiomatic ways of expressing types, so this
	// function serves to coerce them all to actual Type objects. Note that
	// providing the name argument is not necessary in most cases.
	function toType(from, name) {
	    // The toType function should of course be idempotent.
	    if (from instanceof Type)
	        return from;

	    // The Def type is used as a helper for constructing compound
	    // interface types for AST nodes.
	    if (from instanceof Def)
	        return from.type;

	    // Support [ElemType] syntax.
	    if (isArray.check(from))
	        return Type.fromArray(from);

	    // Support { someField: FieldType, ... } syntax.
	    if (isObject.check(from))
	        return Type.fromObject(from);

	    // If isFunction.check(from), assume that from is a binary predicate
	    // function we can use to define the type.
	    if (isFunction.check(from))
	        return new Type(from, name);

	    // As a last resort, toType returns a type that matches any value that
	    // is === from. This is primarily useful for literal values like
	    // toType(null), but it has the additional advantage of allowing
	    // toType to be a total function.
	    return new Type(function(value) {
	        return value === from;
	    }, isUndefined.check(name) ? function() {
	        return from + "";
	    } : name);
	}

	// Returns a type that matches the given value iff any of type1, type2,
	// etc. match the value.
	Type.or = function(/* type1, type2, ... */) {
	    var types = [];
	    var len = arguments.length;
	    for (var i = 0; i < len; ++i)
	        types.push(toType(arguments[i]));

	    return new Type(function(value, deep) {
	        for (var i = 0; i < len; ++i)
	            if (types[i].check(value, deep))
	                return true;
	        return false;
	    }, function() {
	        return types.join(" | ");
	    });
	};

	Type.fromArray = function(arr) {
	    assert.ok(isArray.check(arr));
	    assert.strictEqual(
	        arr.length, 1,
	        "only one element type is permitted for typed arrays");
	    return toType(arr[0]).arrayOf();
	};

	Tp.arrayOf = function() {
	    var elemType = this;
	    return new Type(function(value, deep) {
	        return isArray.check(value) && value.every(function(elem) {
	            return elemType.check(elem, deep);
	        });
	    }, function() {
	        return "[" + elemType + "]";
	    });
	};

	Type.fromObject = function(obj) {
	    var fields = Object.keys(obj).map(function(name) {
	        return new Field(name, obj[name]);
	    });

	    return new Type(function(value, deep) {
	        return isObject.check(value) && fields.every(function(field) {
	            return field.type.check(value[field.name], deep);
	        });
	    }, function() {
	        return "{ " + fields.join(", ") + " }";
	    });
	};

	function Field(name, type, defaultFn, hidden) {
	    var self = this;

	    assert.ok(self instanceof Field);
	    isString.assert(name);

	    type = toType(type);

	    var properties = {
	        name: { value: name },
	        type: { value: type },
	        hidden: { value: !!hidden }
	    };

	    if (isFunction.check(defaultFn)) {
	        properties.defaultFn = { value: defaultFn };
	    }

	    Object.defineProperties(self, properties);
	}

	var Fp = Field.prototype;

	Fp.toString = function() {
	    return JSON.stringify(this.name) + ": " + this.type;
	};

	Fp.getValue = function(obj) {
	    var value = obj[this.name];

	    if (!isUndefined.check(value))
	        return value;

	    if (this.defaultFn)
	        value = this.defaultFn.call(obj);

	    return value;
	};

	// Define a type whose name is registered in a namespace (the defCache) so
	// that future definitions will return the same type given the same name.
	// In particular, this system allows for circular and forward definitions.
	// The Def object d returned from Type.def may be used to configure the
	// type d.type by calling methods such as d.bases, d.build, and d.field.
	Type.def = function(typeName) {
	    isString.assert(typeName);
	    return hasOwn.call(defCache, typeName)
	        ? defCache[typeName]
	        : defCache[typeName] = new Def(typeName);
	};

	// In order to return the same Def instance every time Type.def is called
	// with a particular name, those instances need to be stored in a cache.
	var defCache = {};

	function Def(typeName) {
	    var self = this;
	    assert.ok(self instanceof Def);

	    Object.defineProperties(self, {
	        typeName: { value: typeName },
	        baseNames: { value: [] },
	        ownFields: { value: {} },

	        // These two are populated during finalization.
	        allSupertypes: { value: {} }, // Includes own typeName.
	        supertypeList: { value: [] }, // Linear inheritance hierarchy.
	        allFields: { value: {} }, // Includes inherited fields.
	        fieldNames: { value: [] }, // Non-hidden keys of allFields.

	        type: {
	            value: new Type(function(value, deep) {
	                return self.check(value, deep);
	            }, typeName)
	        }
	    });
	}

	Def.fromValue = function(value) {
	    if (value && typeof value === "object") {
	        var type = value.type;
	        if (typeof type === "string" &&
	            hasOwn.call(defCache, type)) {
	            var d = defCache[type];
	            if (d.finalized) {
	                return d;
	            }
	        }
	    }

	    return null;
	};

	var Dp = Def.prototype;

	Dp.isSupertypeOf = function(that) {
	    if (that instanceof Def) {
	        assert.strictEqual(this.finalized, true);
	        assert.strictEqual(that.finalized, true);
	        return hasOwn.call(that.allSupertypes, this.typeName);
	    } else {
	        assert.ok(false, that + " is not a Def");
	    }
	};

	// Returns an object mapping from every known type in the defCache to the
	// most specific supertype whose name is an own property of the candidates
	// object.
	exports.computeSupertypeLookupTable = function(candidates) {
	    var table = {};

	    for (var typeName in defCache) {
	        if (hasOwn.call(defCache, typeName)) {
	            var d = defCache[typeName];
	            assert.strictEqual(d.finalized, true);
	            for (var i = 0; i < d.supertypeList.length; ++i) {
	                var superTypeName = d.supertypeList[i];
	                if (hasOwn.call(candidates, superTypeName)) {
	                    table[typeName] = superTypeName;
	                    break;
	                }
	            }
	        }
	    }

	    return table;
	};

	Dp.checkAllFields = function(value, deep) {
	    var allFields = this.allFields;
	    assert.strictEqual(this.finalized, true);

	    function checkFieldByName(name) {
	        var field = allFields[name];
	        var type = field.type;
	        var child = field.getValue(value);
	        return type.check(child, deep);
	    }

	    return isObject.check(value)
	        && Object.keys(allFields).every(checkFieldByName);
	};

	Dp.check = function(value, deep) {
	    assert.strictEqual(
	        this.finalized, true,
	        "prematurely checking unfinalized type " + this.typeName);

	    // A Def type can only match an object value.
	    if (!isObject.check(value))
	        return false;

	    var vDef = Def.fromValue(value);
	    if (!vDef) {
	        // If we couldn't infer the Def associated with the given value,
	        // and we expected it to be a SourceLocation or a Position, it was
	        // probably just missing a "type" field (because Esprima does not
	        // assign a type property to such nodes). Be optimistic and let
	        // this.checkAllFields make the final decision.
	        if (this.typeName === "SourceLocation" ||
	            this.typeName === "Position") {
	            return this.checkAllFields(value, deep);
	        }

	        // Calling this.checkAllFields for any other type of node is both
	        // bad for performance and way too forgiving.
	        return false;
	    }

	    // If checking deeply and vDef === this, then we only need to call
	    // checkAllFields once. Calling checkAllFields is too strict when deep
	    // is false, because then we only care about this.isSupertypeOf(vDef).
	    if (deep && vDef === this)
	        return this.checkAllFields(value, deep);

	    // In most cases we rely exclusively on isSupertypeOf to make O(1)
	    // subtyping determinations. This suffices in most situations outside
	    // of unit tests, since interface conformance is checked whenever new
	    // instances are created using builder functions.
	    if (!this.isSupertypeOf(vDef))
	        return false;

	    // The exception is when deep is true; then, we recursively check all
	    // fields.
	    if (!deep)
	        return true;

	    // Use the more specific Def (vDef) to perform the deep check, but
	    // shallow-check fields defined by the less specific Def (this).
	    return vDef.checkAllFields(value, deep)
	        && this.checkAllFields(value, false);
	};

	Dp.bases = function() {
	    var bases = this.baseNames;

	    assert.strictEqual(this.finalized, false);

	    each.call(arguments, function(baseName) {
	        isString.assert(baseName);

	        // This indexOf lookup may be O(n), but the typical number of base
	        // names is very small, and indexOf is a native Array method.
	        if (bases.indexOf(baseName) < 0)
	            bases.push(baseName);
	    });

	    return this; // For chaining.
	};

	// False by default until .build(...) is called on an instance.
	Object.defineProperty(Dp, "buildable", { value: false });

	var builders = {};
	exports.builders = builders;

	// This object is used as prototype for any node created by a builder.
	var nodePrototype = {};

	// Call this function to define a new method to be shared by all AST
	// nodes. The replaced method (if any) is returned for easy wrapping.
	exports.defineMethod = function(name, func) {
	    var old = nodePrototype[name];

	    // Pass undefined as func to delete nodePrototype[name].
	    if (isUndefined.check(func)) {
	        delete nodePrototype[name];

	    } else {
	        isFunction.assert(func);

	        Object.defineProperty(nodePrototype, name, {
	            enumerable: true, // For discoverability.
	            configurable: true, // For delete proto[name].
	            value: func
	        });
	    }

	    return old;
	};

	// Calling the .build method of a Def simultaneously marks the type as
	// buildable (by defining builders[getBuilderName(typeName)]) and
	// specifies the order of arguments that should be passed to the builder
	// function to create an instance of the type.
	Dp.build = function(/* param1, param2, ... */) {
	    var self = this;

	    // Calling Def.prototype.build multiple times has the effect of merely
	    // redefining this property.
	    Object.defineProperty(self, "buildParams", {
	        value: slice.call(arguments),
	        writable: false,
	        enumerable: false,
	        configurable: true
	    });

	    assert.strictEqual(self.finalized, false);
	    isString.arrayOf().assert(self.buildParams);

	    if (self.buildable) {
	        // If this Def is already buildable, update self.buildParams and
	        // continue using the old builder function.
	        return self;
	    }

	    // Every buildable type will have its "type" field filled in
	    // automatically. This includes types that are not subtypes of Node,
	    // like SourceLocation, but that seems harmless (TODO?).
	    self.field("type", self.typeName, function() { return self.typeName });

	    // Override Dp.buildable for this Def instance.
	    Object.defineProperty(self, "buildable", { value: true });

	    Object.defineProperty(builders, getBuilderName(self.typeName), {
	        enumerable: true,

	        value: function() {
	            var args = arguments;
	            var argc = args.length;
	            var built = Object.create(nodePrototype);

	            assert.ok(
	                self.finalized,
	                "attempting to instantiate unfinalized type " + self.typeName);

	            function add(param, i) {
	                if (hasOwn.call(built, param))
	                    return;

	                var all = self.allFields;
	                assert.ok(hasOwn.call(all, param), param);

	                var field = all[param];
	                var type = field.type;
	                var value;

	                if (isNumber.check(i) && i < argc) {
	                    value = args[i];
	                } else if (field.defaultFn) {
	                    // Expose the partially-built object to the default
	                    // function as its `this` object.
	                    value = field.defaultFn.call(built);
	                } else {
	                    var message = "no value or default function given for field " +
	                        JSON.stringify(param) + " of " + self.typeName + "(" +
	                            self.buildParams.map(function(name) {
	                                return all[name];
	                            }).join(", ") + ")";
	                    assert.ok(false, message);
	                }

	                assert.ok(
	                    type.check(value),
	                    shallowStringify(value) +
	                        " does not match field " + field +
	                        " of type " + self.typeName);

	                // TODO Could attach getters and setters here to enforce
	                // dynamic type safety.
	                built[param] = value;
	            }

	            self.buildParams.forEach(function(param, i) {
	                add(param, i);
	            });

	            Object.keys(self.allFields).forEach(function(param) {
	                add(param); // Use the default value.
	            });

	            // Make sure that the "type" field was filled automatically.
	            assert.strictEqual(built.type, self.typeName);

	            return built;
	        }
	    });

	    return self; // For chaining.
	};

	function getBuilderName(typeName) {
	    return typeName.replace(/^[A-Z]+/, function(upperCasePrefix) {
	        var len = upperCasePrefix.length;
	        switch (len) {
	        case 0: return "";
	        // If there's only one initial capital letter, just lower-case it.
	        case 1: return upperCasePrefix.toLowerCase();
	        default:
	            // If there's more than one initial capital letter, lower-case
	            // all but the last one, so that XMLDefaultDeclaration (for
	            // example) becomes xmlDefaultDeclaration.
	            return upperCasePrefix.slice(
	                0, len - 1).toLowerCase() +
	                upperCasePrefix.charAt(len - 1);
	        }
	    });
	}

	// The reason fields are specified using .field(...) instead of an object
	// literal syntax is somewhat subtle: the object literal syntax would
	// support only one key and one value, but with .field(...) we can pass
	// any number of arguments to specify the field.
	Dp.field = function(name, type, defaultFn, hidden) {
	    assert.strictEqual(this.finalized, false);
	    this.ownFields[name] = new Field(name, type, defaultFn, hidden);
	    return this; // For chaining.
	};

	var namedTypes = {};
	exports.namedTypes = namedTypes;

	// Like Object.keys, but aware of what fields each AST type should have.
	function getFieldNames(object) {
	    var d = Def.fromValue(object);
	    if (d) {
	        return d.fieldNames.slice(0);
	    }

	    assert.strictEqual(
	        "type" in object, false,
	        "did not recognize object of type " +
	            JSON.stringify(object.type)
	    );

	    return Object.keys(object);
	}
	exports.getFieldNames = getFieldNames;

	// Get the value of an object property, taking object.type and default
	// functions into account.
	function getFieldValue(object, fieldName) {
	    var d = Def.fromValue(object);
	    if (d) {
	        var field = d.allFields[fieldName];
	        if (field) {
	            return field.getValue(object);
	        }
	    }

	    return object[fieldName];
	}
	exports.getFieldValue = getFieldValue;

	// Iterate over all defined fields of an object, including those missing
	// or undefined, passing each field name and effective value (as returned
	// by getFieldValue) to the callback. If the object has no corresponding
	// Def, the callback will never be called.
	exports.eachField = function(object, callback, context) {
	    getFieldNames(object).forEach(function(name) {
	        callback.call(this, name, getFieldValue(object, name));
	    }, context);
	};

	// Similar to eachField, except that iteration stops as soon as the
	// callback returns a truthy value. Like Array.prototype.some, the final
	// result is either true or false to indicates whether the callback
	// returned true for any element or not.
	exports.someField = function(object, callback, context) {
	    return getFieldNames(object).some(function(name) {
	        return callback.call(this, name, getFieldValue(object, name));
	    }, context);
	};

	// This property will be overridden as true by individual Def instances
	// when they are finalized.
	Object.defineProperty(Dp, "finalized", { value: false });

	Dp.finalize = function() {
	    // It's not an error to finalize a type more than once, but only the
	    // first call to .finalize does anything.
	    if (!this.finalized) {
	        var allFields = this.allFields;
	        var allSupertypes = this.allSupertypes;

	        this.baseNames.forEach(function(name) {
	            var def = defCache[name];
	            def.finalize();
	            extend(allFields, def.allFields);
	            extend(allSupertypes, def.allSupertypes);
	        });

	        // TODO Warn if fields are overridden with incompatible types.
	        extend(allFields, this.ownFields);
	        allSupertypes[this.typeName] = this;

	        this.fieldNames.length = 0;
	        for (var fieldName in allFields) {
	            if (hasOwn.call(allFields, fieldName) &&
	                !allFields[fieldName].hidden) {
	                this.fieldNames.push(fieldName);
	            }
	        }

	        // Types are exported only once they have been finalized.
	        Object.defineProperty(namedTypes, this.typeName, {
	            enumerable: true,
	            value: this.type
	        });

	        Object.defineProperty(this, "finalized", { value: true });

	        // A linearization of the inheritance hierarchy.
	        populateSupertypeList(this.typeName, this.supertypeList);
	    }
	};

	function populateSupertypeList(typeName, list) {
	    list.length = 0;
	    list.push(typeName);

	    var lastSeen = {};

	    for (var pos = 0; pos < list.length; ++pos) {
	        typeName = list[pos];
	        var d = defCache[typeName];
	        assert.strictEqual(d.finalized, true);

	        // If we saw typeName earlier in the breadth-first traversal,
	        // delete the last-seen occurrence.
	        if (hasOwn.call(lastSeen, typeName)) {
	            delete list[lastSeen[typeName]];
	        }

	        // Record the new index of the last-seen occurrence of typeName.
	        lastSeen[typeName] = pos;

	        // Enqueue the base names of this type.
	        list.push.apply(list, d.baseNames);
	    }

	    // Compaction loop to remove array holes.
	    for (var to = 0, from = to, len = list.length; from < len; ++from) {
	        if (hasOwn.call(list, from)) {
	            list[to++] = list[from];
	        }
	    }

	    list.length = to;
	}

	function extend(into, from) {
	    Object.keys(from).forEach(function(name) {
	        into[name] = from[name];
	    });

	    return into;
	};

	exports.finalize = function() {
	    Object.keys(defCache).forEach(function(name) {
	        defCache[name].finalize();
	    });
	};


/***/ },
/* 11 */
/***/ function(module, exports, __webpack_require__) {

	var types = __webpack_require__(10);
	var Type = types.Type;
	var def = Type.def;
	var or = Type.or;
	var builtin = types.builtInTypes;
	var isString = builtin.string;
	var isNumber = builtin.number;
	var isBoolean = builtin.boolean;
	var isRegExp = builtin.RegExp;
	var shared = __webpack_require__(12);
	var defaults = shared.defaults;
	var geq = shared.geq;

	def("Node")
	    .field("type", isString)
	    .field("loc", or(
	        def("SourceLocation"),
	        null
	    ), defaults["null"], true);

	def("SourceLocation")
	    .build("start", "end", "source")
	    .field("start", def("Position"))
	    .field("end", def("Position"))
	    .field("source", or(isString, null), defaults["null"]);

	def("Position")
	    .build("line", "column")
	    .field("line", geq(1))
	    .field("column", geq(0));

	def("Program")
	    .bases("Node")
	    .build("body")
	    .field("body", [def("Statement")]);

	def("Function")
	    .bases("Node")
	    .field("id", or(def("Identifier"), null), defaults["null"])
	    .field("params", [def("Pattern")])
	    .field("body", or(def("BlockStatement"), def("Expression")));

	def("Statement").bases("Node");

	// The empty .build() here means that an EmptyStatement can be constructed
	// (i.e. it's not abstract) but that it needs no arguments.
	def("EmptyStatement").bases("Statement").build();

	def("BlockStatement")
	    .bases("Statement")
	    .build("body")
	    .field("body", [def("Statement")]);

	// TODO Figure out how to silently coerce Expressions to
	// ExpressionStatements where a Statement was expected.
	def("ExpressionStatement")
	    .bases("Statement")
	    .build("expression")
	    .field("expression", def("Expression"));

	def("IfStatement")
	    .bases("Statement")
	    .build("test", "consequent", "alternate")
	    .field("test", def("Expression"))
	    .field("consequent", def("Statement"))
	    .field("alternate", or(def("Statement"), null), defaults["null"]);

	def("LabeledStatement")
	    .bases("Statement")
	    .build("label", "body")
	    .field("label", def("Identifier"))
	    .field("body", def("Statement"));

	def("BreakStatement")
	    .bases("Statement")
	    .build("label")
	    .field("label", or(def("Identifier"), null), defaults["null"]);

	def("ContinueStatement")
	    .bases("Statement")
	    .build("label")
	    .field("label", or(def("Identifier"), null), defaults["null"]);

	def("WithStatement")
	    .bases("Statement")
	    .build("object", "body")
	    .field("object", def("Expression"))
	    .field("body", def("Statement"));

	def("SwitchStatement")
	    .bases("Statement")
	    .build("discriminant", "cases", "lexical")
	    .field("discriminant", def("Expression"))
	    .field("cases", [def("SwitchCase")])
	    .field("lexical", isBoolean, defaults["false"]);

	def("ReturnStatement")
	    .bases("Statement")
	    .build("argument")
	    .field("argument", or(def("Expression"), null));

	def("ThrowStatement")
	    .bases("Statement")
	    .build("argument")
	    .field("argument", def("Expression"));

	def("TryStatement")
	    .bases("Statement")
	    .build("block", "handler", "finalizer")
	    .field("block", def("BlockStatement"))
	    .field("handler", or(def("CatchClause"), null), function() {
	        return this.handlers && this.handlers[0] || null;
	    })
	    .field("handlers", [def("CatchClause")], function() {
	        return this.handler ? [this.handler] : [];
	    }, true) // Indicates this field is hidden from eachField iteration.
	    .field("guardedHandlers", [def("CatchClause")], defaults.emptyArray)
	    .field("finalizer", or(def("BlockStatement"), null), defaults["null"]);

	def("CatchClause")
	    .bases("Node")
	    .build("param", "guard", "body")
	    .field("param", def("Pattern"))
	    .field("guard", or(def("Expression"), null), defaults["null"])
	    .field("body", def("BlockStatement"));

	def("WhileStatement")
	    .bases("Statement")
	    .build("test", "body")
	    .field("test", def("Expression"))
	    .field("body", def("Statement"));

	def("DoWhileStatement")
	    .bases("Statement")
	    .build("body", "test")
	    .field("body", def("Statement"))
	    .field("test", def("Expression"));

	def("ForStatement")
	    .bases("Statement")
	    .build("init", "test", "update", "body")
	    .field("init", or(
	        def("VariableDeclaration"),
	        def("Expression"),
	        null))
	    .field("test", or(def("Expression"), null))
	    .field("update", or(def("Expression"), null))
	    .field("body", def("Statement"));

	def("ForInStatement")
	    .bases("Statement")
	    .build("left", "right", "body", "each")
	    .field("left", or(
	        def("VariableDeclaration"),
	        def("Expression")))
	    .field("right", def("Expression"))
	    .field("body", def("Statement"))
	    .field("each", isBoolean);

	def("DebuggerStatement").bases("Statement").build();

	def("Declaration").bases("Statement");

	def("FunctionDeclaration")
	    .bases("Function", "Declaration")
	    .build("id", "params", "body")
	    .field("id", def("Identifier"));

	def("FunctionExpression")
	    .bases("Function", "Expression")
	    .build("id", "params", "body");

	def("VariableDeclaration")
	    .bases("Declaration")
	    .build("kind", "declarations")
	    .field("kind", or("var", "let", "const"))
	    .field("declarations", [or(
	        def("VariableDeclarator"),
	        def("Identifier") // TODO Esprima deviation.
	    )]);

	def("VariableDeclarator")
	    .bases("Node")
	    .build("id", "init")
	    .field("id", def("Pattern"))
	    .field("init", or(def("Expression"), null));

	// TODO Are all Expressions really Patterns?
	def("Expression").bases("Node", "Pattern");

	def("ThisExpression").bases("Expression").build();

	def("ArrayExpression")
	    .bases("Expression")
	    .build("elements")
	    .field("elements", [or(def("Expression"), null)]);

	def("ObjectExpression")
	    .bases("Expression")
	    .build("properties")
	    .field("properties", [def("Property")]);

	// TODO Not in the Mozilla Parser API, but used by Esprima.
	def("Property")
	    .bases("Node") // Want to be able to visit Property Nodes.
	    .build("kind", "key", "value")
	    .field("kind", or("init", "get", "set"))
	    .field("key", or(def("Literal"), def("Identifier")))
	    .field("value", def("Expression"));

	def("SequenceExpression")
	    .bases("Expression")
	    .build("expressions")
	    .field("expressions", [def("Expression")]);

	var UnaryOperator = or(
	    "-", "+", "!", "~",
	    "typeof", "void", "delete");

	def("UnaryExpression")
	    .bases("Expression")
	    .build("operator", "argument", "prefix")
	    .field("operator", UnaryOperator)
	    .field("argument", def("Expression"))
	    // TODO Esprima doesn't bother with this field, presumably because
	    // it's always true for unary operators.
	    .field("prefix", isBoolean, defaults["true"]);

	var BinaryOperator = or(
	    "==", "!=", "===", "!==",
	    "<", "<=", ">", ">=",
	    "<<", ">>", ">>>",
	    "+", "-", "*", "/", "%",
	    "&", // TODO Missing from the Parser API.
	    "|", "^", "in",
	    "instanceof", "..");

	def("BinaryExpression")
	    .bases("Expression")
	    .build("operator", "left", "right")
	    .field("operator", BinaryOperator)
	    .field("left", def("Expression"))
	    .field("right", def("Expression"));

	var AssignmentOperator = or(
	    "=", "+=", "-=", "*=", "/=", "%=",
	    "<<=", ">>=", ">>>=",
	    "|=", "^=", "&=");

	def("AssignmentExpression")
	    .bases("Expression")
	    .build("operator", "left", "right")
	    .field("operator", AssignmentOperator)
	    // TODO Shouldn't this be def("Pattern")?
	    .field("left", def("Expression"))
	    .field("right", def("Expression"));

	var UpdateOperator = or("++", "--");

	def("UpdateExpression")
	    .bases("Expression")
	    .build("operator", "argument", "prefix")
	    .field("operator", UpdateOperator)
	    .field("argument", def("Expression"))
	    .field("prefix", isBoolean);

	var LogicalOperator = or("||", "&&");

	def("LogicalExpression")
	    .bases("Expression")
	    .build("operator", "left", "right")
	    .field("operator", LogicalOperator)
	    .field("left", def("Expression"))
	    .field("right", def("Expression"));

	def("ConditionalExpression")
	    .bases("Expression")
	    .build("test", "consequent", "alternate")
	    .field("test", def("Expression"))
	    .field("consequent", def("Expression"))
	    .field("alternate", def("Expression"));

	def("NewExpression")
	    .bases("Expression")
	    .build("callee", "arguments")
	    .field("callee", def("Expression"))
	    // The Mozilla Parser API gives this type as [or(def("Expression"),
	    // null)], but null values don't really make sense at the call site.
	    // TODO Report this nonsense.
	    .field("arguments", [def("Expression")]);

	def("CallExpression")
	    .bases("Expression")
	    .build("callee", "arguments")
	    .field("callee", def("Expression"))
	    // See comment for NewExpression above.
	    .field("arguments", [def("Expression")]);

	def("MemberExpression")
	    .bases("Expression")
	    .build("object", "property", "computed")
	    .field("object", def("Expression"))
	    .field("property", or(def("Identifier"), def("Expression")))
	    .field("computed", isBoolean);

	def("Pattern").bases("Node");

	def("ObjectPattern")
	    .bases("Pattern")
	    .build("properties")
	    // TODO File a bug to get PropertyPattern added to the interfaces API.
	    .field("properties", [def("PropertyPattern")]);

	def("PropertyPattern")
	    .bases("Pattern")
	    .build("key", "pattern")
	    .field("key", or(def("Literal"), def("Identifier")))
	    .field("pattern", def("Pattern"));

	def("ArrayPattern")
	    .bases("Pattern")
	    .build("elements")
	    .field("elements", [or(def("Pattern"), null)]);

	def("SwitchCase")
	    .bases("Node")
	    .build("test", "consequent")
	    .field("test", or(def("Expression"), null))
	    .field("consequent", [def("Statement")]);

	def("Identifier")
	    // But aren't Expressions and Patterns already Nodes? TODO Report this.
	    .bases("Node", "Expression", "Pattern")
	    .build("name")
	    .field("name", isString);

	def("Literal")
	    // But aren't Expressions already Nodes? TODO Report this.
	    .bases("Node", "Expression")
	    .build("value")
	    .field("value", or(
	        isString,
	        isBoolean,
	        null, // isNull would also work here.
	        isNumber,
	        isRegExp
	    ));


/***/ },
/* 12 */
/***/ function(module, exports, __webpack_require__) {

	var types = __webpack_require__(10);
	var Type = types.Type;
	var builtin = types.builtInTypes;
	var isNumber = builtin.number;

	// An example of constructing a new type with arbitrary constraints from
	// an existing type.
	exports.geq = function(than) {
	    return new Type(function(value) {
	        return isNumber.check(value) && value >= than;
	    }, isNumber + " >= " + than);
	};

	// Default value-returning functions that may optionally be passed as a
	// third argument to Def.prototype.field.
	exports.defaults = {
	    // Functions were used because (among other reasons) that's the most
	    // elegant way to allow for the emptyArray one always to give a new
	    // array instance.
	    "null": function() { return null },
	    "emptyArray": function() { return [] },
	    "false": function() { return false },
	    "true": function() { return true },
	    "undefined": function() {}
	};

	var naiveIsPrimitive = Type.or(
	    builtin.string,
	    builtin.number,
	    builtin.boolean,
	    builtin.null,
	    builtin.undefined
	);

	exports.isPrimitive = new Type(function(value) {
	    if (value === null)
	        return true;
	    var type = typeof value;
	    return !(type === "object" ||
	             type === "function");
	}, naiveIsPrimitive.toString());


/***/ },
/* 13 */
/***/ function(module, exports, __webpack_require__) {

	__webpack_require__(11);
	var types = __webpack_require__(10);
	var def = types.Type.def;
	var or = types.Type.or;
	var builtin = types.builtInTypes;
	var isBoolean = builtin.boolean;
	var isObject = builtin.object;
	var isString = builtin.string;
	var defaults = __webpack_require__(12).defaults;

	def("Function")
	    .field("generator", isBoolean, defaults["false"])
	    .field("expression", isBoolean, defaults["false"])
	    .field("defaults", [def("Expression")], defaults.emptyArray)
	    // TODO This could be represented as a SpreadElementPattern in .params.
	    .field("rest", or(def("Identifier"), null), defaults["null"]);

	def("FunctionDeclaration")
	    .build("id", "params", "body", "generator", "expression");

	def("FunctionExpression")
	    .build("id", "params", "body", "generator", "expression");

	// TODO The Parser API calls this ArrowExpression, but Esprima uses
	// ArrowFunctionExpression.
	def("ArrowFunctionExpression")
	    .bases("Function", "Expression")
	    .build("params", "body", "expression")
	    // The forced null value here is compatible with the overridden
	    // definition of the "id" field in the Function interface.
	    .field("id", null, defaults["null"])
	    // The current spec forbids arrow generators, so I have taken the
	    // liberty of enforcing that. TODO Report this.
	    .field("generator", false);

	def("YieldExpression")
	    .bases("Expression")
	    .build("argument", "delegate")
	    .field("argument", or(def("Expression"), null))
	    .field("delegate", isBoolean, defaults["false"]);

	def("GeneratorExpression")
	    .bases("Expression")
	    .build("body", "blocks", "filter")
	    .field("body", def("Expression"))
	    .field("blocks", [def("ComprehensionBlock")])
	    .field("filter", or(def("Expression"), null));

	def("ComprehensionExpression")
	    .bases("Expression")
	    .build("body", "blocks", "filter")
	    .field("body", def("Expression"))
	    .field("blocks", [def("ComprehensionBlock")])
	    .field("filter", or(def("Expression"), null));

	def("ComprehensionBlock")
	    .bases("Node")
	    .build("left", "right", "each")
	    .field("left", def("Pattern"))
	    .field("right", def("Expression"))
	    .field("each", isBoolean);

	// This would be the ideal definition for ModuleSpecifier, but alas we
	// can't expect ASTs parsed by Esprima to use this custom subtype:
	def("ModuleSpecifier")
	    .bases("Specifier", "Literal")
	//  .build("value") // Make it abstract/non-buildable for now.
	    .field("value", isString);

	// Instead we must settle for a cheap type alias:
	var ModuleSpecifier = def("Literal");

	def("ModuleDeclaration")
	    .bases("Declaration")
	    .build("id", "from", "body")
	    .field("id", or(def("Literal"), def("Identifier")))
	    .field("source", or(ModuleSpecifier, null))
	    .field("body", or(def("BlockStatement"), null));

	def("Property")
	    // Esprima extensions not mentioned in the Mozilla Parser API:
	    .field("method", isBoolean, defaults["false"])
	    .field("shorthand", isBoolean, defaults["false"])
	    .field("computed", isBoolean, defaults["false"]);

	def("MethodDefinition")
	    .bases("Declaration")
	    .build("kind", "key", "value")
	    .field("kind", or("init", "get", "set", ""))
	    .field("key", or(def("Literal"), def("Identifier")))
	    .field("value", def("Function"));

	def("SpreadElement")
	    .bases("Node")
	    .build("argument")
	    .field("argument", def("Expression"));

	def("ArrayExpression")
	    .field("elements", [or(def("Expression"), def("SpreadElement"), null)]);

	def("NewExpression")
	    .field("arguments", [or(def("Expression"), def("SpreadElement"))]);

	def("CallExpression")
	    .field("arguments", [or(def("Expression"), def("SpreadElement"))]);

	def("SpreadElementPattern")
	    .bases("Pattern")
	    .build("argument")
	    .field("argument", def("Pattern"));

	var ClassBodyElement = or(
	    def("MethodDefinition"),
	    def("VariableDeclarator"),
	    def("ClassPropertyDefinition")
	);

	def("ClassPropertyDefinition") // static property
	    .bases("Declaration")
	    .build("definition")
	    // Yes, Virginia, circular definitions are permitted.
	    .field("definition", ClassBodyElement);

	def("ClassBody")
	    .bases("Declaration")
	    .build("body")
	    .field("body", [ClassBodyElement]);

	def("ClassDeclaration")
	    .bases("Declaration")
	    .build("id", "body", "superClass")
	    .field("id", def("Identifier"))
	    .field("body", def("ClassBody"))
	    .field("superClass", or(def("Expression"), null), defaults["null"]);

	def("ClassExpression")
	    .bases("Expression")
	    .build("id", "body", "superClass")
	    .field("id", or(def("Identifier"), null), defaults["null"])
	    .field("body", def("ClassBody"))
	    .field("superClass", or(def("Expression"), null), defaults["null"]);

	// Specifier and NamedSpecifier are non-standard types that I introduced
	// for definitional convenience.
	def("Specifier").bases("Node");
	def("NamedSpecifier")
	    .bases("Specifier")
	    .field("id", def("Identifier"))
	    .field("name", or(def("Identifier"), null), defaults["null"]);

	def("ExportSpecifier")
	    .bases("NamedSpecifier")
	    .build("id", "name");

	def("ExportBatchSpecifier")
	    .bases("Specifier")
	    .build();

	def("ImportSpecifier")
	    .bases("NamedSpecifier")
	    .build("id", "name");

	def("ExportDeclaration")
	    .bases("Declaration")
	    .build("default", "declaration", "specifiers", "source")
	    .field("default", isBoolean)
	    .field("declaration", or(
	        def("Declaration"),
	        def("Expression") // Implies default.
	    ))
	    .field("specifiers", [or(
	        def("ExportSpecifier"),
	        def("ExportBatchSpecifier")
	    )], defaults.emptyArray)
	    .field("source", or(ModuleSpecifier, null), defaults["null"]);

	def("ImportDeclaration")
	    .bases("Declaration")
	    .build("specifiers", "kind", "source")
	    .field("specifiers", [def("ImportSpecifier")])
	    .field("kind", or("named", "default"))
	    .field("source", ModuleSpecifier);

	def("TaggedTemplateExpression")
	    .bases("Expression")
	    .field("tag", def("Expression"))
	    .field("quasi", def("TemplateLiteral"));

	def("TemplateLiteral")
	    .bases("Expression")
	    .build("quasis", "expressions")
	    .field("quasis", [def("TemplateElement")])
	    .field("expressions", [def("Expression")]);

	def("TemplateElement")
	    .bases("Node")
	    .build("value", "tail")
	    .field("value", {"cooked": isString, "raw": isString})
	    .field("tail", isBoolean);


/***/ },
/* 14 */
/***/ function(module, exports, __webpack_require__) {

	__webpack_require__(11);
	var types = __webpack_require__(10);
	var def = types.Type.def;
	var or = types.Type.or;
	var builtin = types.builtInTypes;
	var isBoolean = builtin.boolean;
	var defaults = __webpack_require__(12).defaults;

	def("Function")
	    .field("async", isBoolean, defaults["false"]);

	def("SpreadProperty")
	    .bases("Node")
	    .build("argument")
	    .field("argument", def("Expression"));

	def("ObjectExpression")
	    .field("properties", [or(def("Property"), def("SpreadProperty"))]);

	def("SpreadPropertyPattern")
	    .bases("Pattern")
	    .build("argument")
	    .field("argument", def("Pattern"));

	def("ObjectPattern")
	    .field("properties", [or(
	        def("PropertyPattern"),
	        def("SpreadPropertyPattern")
	    )]);

	def("AwaitExpression")
	    .bases("Expression")
	    .build("argument", "all")
	    .field("argument", or(def("Expression"), null))
	    .field("all", isBoolean, defaults["false"]);


/***/ },
/* 15 */
/***/ function(module, exports, __webpack_require__) {

	__webpack_require__(11);
	var types = __webpack_require__(10);
	var def = types.Type.def;
	var or = types.Type.or;
	var geq = __webpack_require__(12).geq;

	def("ForOfStatement")
	    .bases("Statement")
	    .build("left", "right", "body")
	    .field("left", or(
	        def("VariableDeclaration"),
	        def("Expression")))
	    .field("right", def("Expression"))
	    .field("body", def("Statement"));

	def("LetStatement")
	    .bases("Statement")
	    .build("head", "body")
	    // TODO Deviating from the spec by reusing VariableDeclarator here.
	    .field("head", [def("VariableDeclarator")])
	    .field("body", def("Statement"));

	def("LetExpression")
	    .bases("Expression")
	    .build("head", "body")
	    // TODO Deviating from the spec by reusing VariableDeclarator here.
	    .field("head", [def("VariableDeclarator")])
	    .field("body", def("Expression"));

	def("GraphExpression")
	    .bases("Expression")
	    .build("index", "expression")
	    .field("index", geq(0))
	    .field("expression", def("Literal"));

	def("GraphIndexExpression")
	    .bases("Expression")
	    .build("index")
	    .field("index", geq(0));


/***/ },
/* 16 */
/***/ function(module, exports, __webpack_require__) {

	__webpack_require__(11);
	var types = __webpack_require__(10);
	var def = types.Type.def;
	var or = types.Type.or;
	var builtin = types.builtInTypes;
	var isString = builtin.string;
	var isBoolean = builtin.boolean;

	// Note that none of these types are buildable because the Mozilla Parser
	// API doesn't specify any builder functions, and nobody uses E4X anymore.

	def("XMLDefaultDeclaration")
	    .bases("Declaration")
	    .field("namespace", def("Expression"));

	def("XMLAnyName").bases("Expression");

	def("XMLQualifiedIdentifier")
	    .bases("Expression")
	    .field("left", or(def("Identifier"), def("XMLAnyName")))
	    .field("right", or(def("Identifier"), def("Expression")))
	    .field("computed", isBoolean);

	def("XMLFunctionQualifiedIdentifier")
	    .bases("Expression")
	    .field("right", or(def("Identifier"), def("Expression")))
	    .field("computed", isBoolean);

	def("XMLAttributeSelector")
	    .bases("Expression")
	    .field("attribute", def("Expression"));

	def("XMLFilterExpression")
	    .bases("Expression")
	    .field("left", def("Expression"))
	    .field("right", def("Expression"));

	def("XMLElement")
	    .bases("XML", "Expression")
	    .field("contents", [def("XML")]);

	def("XMLList")
	    .bases("XML", "Expression")
	    .field("contents", [def("XML")]);

	def("XML").bases("Node");

	def("XMLEscape")
	    .bases("XML")
	    .field("expression", def("Expression"));

	def("XMLText")
	    .bases("XML")
	    .field("text", isString);

	def("XMLStartTag")
	    .bases("XML")
	    .field("contents", [def("XML")]);

	def("XMLEndTag")
	    .bases("XML")
	    .field("contents", [def("XML")]);

	def("XMLPointTag")
	    .bases("XML")
	    .field("contents", [def("XML")]);

	def("XMLName")
	    .bases("XML")
	    .field("contents", or(isString, [def("XML")]));

	def("XMLAttribute")
	    .bases("XML")
	    .field("value", isString);

	def("XMLCdata")
	    .bases("XML")
	    .field("contents", isString);

	def("XMLComment")
	    .bases("XML")
	    .field("contents", isString);

	def("XMLProcessingInstruction")
	    .bases("XML")
	    .field("target", isString)
	    .field("contents", or(isString, null));


/***/ },
/* 17 */
/***/ function(module, exports, __webpack_require__) {

	__webpack_require__(11);
	var types = __webpack_require__(10);
	var def = types.Type.def;
	var or = types.Type.or;
	var builtin = types.builtInTypes;
	var isString = builtin.string;
	var isBoolean = builtin.boolean;
	var defaults = __webpack_require__(12).defaults;

	def("XJSAttribute")
	    .bases("Node")
	    .build("name", "value")
	    .field("name", or(def("XJSIdentifier"), def("XJSNamespacedName")))
	    .field("value", or(
	        def("Literal"), // attr="value"
	        def("XJSExpressionContainer"), // attr={value}
	        null // attr= or just attr
	    ), defaults["null"]);

	def("XJSIdentifier")
	    .bases("Node")
	    .build("name")
	    .field("name", isString);

	def("XJSNamespacedName")
	    .bases("Node")
	    .build("namespace", "name")
	    .field("namespace", def("XJSIdentifier"))
	    .field("name", def("XJSIdentifier"));

	def("XJSMemberExpression")
	    .bases("MemberExpression")
	    .build("object", "property")
	    .field("object", or(def("XJSIdentifier"), def("XJSMemberExpression")))
	    .field("property", def("XJSIdentifier"))
	    .field("computed", isBoolean, defaults.false);

	var XJSElementName = or(
	    def("XJSIdentifier"),
	    def("XJSNamespacedName"),
	    def("XJSMemberExpression")
	);

	def("XJSSpreadAttribute")
	    .bases("Node")
	    .build("argument")
	    .field("argument", def("Expression"));

	var XJSAttributes = [or(
	    def("XJSAttribute"),
	    def("XJSSpreadAttribute")
	)];

	def("XJSExpressionContainer")
	    .bases("Expression")
	    .build("expression")
	    .field("expression", def("Expression"));

	def("XJSElement")
	    .bases("Expression")
	    .build("openingElement", "closingElement", "children")
	    .field("openingElement", def("XJSOpeningElement"))
	    .field("closingElement", or(def("XJSClosingElement"), null), defaults["null"])
	    .field("children", [or(
	        def("XJSElement"),
	        def("XJSExpressionContainer"),
	        def("XJSText"),
	        def("Literal") // TODO Esprima should return XJSText instead.
	    )], defaults.emptyArray)
	    .field("name", XJSElementName, function() {
	        // Little-known fact: the `this` object inside a default function
	        // is none other than the partially-built object itself, and any
	        // fields initialized directly from builder function arguments
	        // (like openingElement, closingElement, and children) are
	        // guaranteed to be available.
	        return this.openingElement.name;
	    })
	    .field("selfClosing", isBoolean, function() {
	        return this.openingElement.selfClosing;
	    })
	    .field("attributes", XJSAttributes, function() {
	        return this.openingElement.attributes;
	    });

	def("XJSOpeningElement")
	    .bases("Node") // TODO Does this make sense? Can't really be an XJSElement.
	    .build("name", "attributes", "selfClosing")
	    .field("name", XJSElementName)
	    .field("attributes", XJSAttributes, defaults.emptyArray)
	    .field("selfClosing", isBoolean, defaults["false"]);

	def("XJSClosingElement")
	    .bases("Node") // TODO Same concern.
	    .build("name")
	    .field("name", XJSElementName);

	def("XJSText")
	    .bases("Literal")
	    .build("value")
	    .field("value", isString);

	def("XJSEmptyExpression").bases("Expression").build();

	def("TypeAnnotatedIdentifier")
	    .bases("Pattern")
	    .build("annotation", "identifier")
	    .field("annotation", def("TypeAnnotation"))
	    .field("identifier", def("Identifier"));

	def("TypeAnnotation")
	    .bases("Pattern")
	    .build("annotatedType", "templateTypes", "paramTypes", "returnType", 
	           "unionType", "nullable")
	    .field("annotatedType", def("Identifier"))
	    .field("templateTypes", or([def("TypeAnnotation")], null))
	    .field("paramTypes", or([def("TypeAnnotation")], null))
	    .field("returnType", or(def("TypeAnnotation"), null))
	    .field("unionType", or(def("TypeAnnotation"), null))
	    .field("nullable", isBoolean);


/***/ },
/* 18 */
/***/ function(module, exports, __webpack_require__) {

	var assert = __webpack_require__(4);
	var types = __webpack_require__(10);
	var Node = types.namedTypes.Node;
	var isObject = types.builtInTypes.object;
	var isArray = types.builtInTypes.array;
	var NodePath = __webpack_require__(19);
	var funToStr = Function.prototype.toString;
	var thisPattern = /\bthis\b/;

	// Good for traversals that need to modify the syntax tree or to access
	// path/scope information via `this` (a NodePath object). Somewhat slower
	// than traverseWithNoPathInfo because of the NodePath bookkeeping.
	function traverseWithFullPathInfo(node, callback) {
	    if (!thisPattern.test(funToStr.call(callback))) {
	        // If the callback function contains no references to `this`, then
	        // it will have no way of using any of the NodePath information
	        // that traverseWithFullPathInfo provides, so we can skip that
	        // bookkeeping altogether.
	        return traverseWithNoPathInfo(
	            node instanceof NodePath ? node.value : node,
	            callback
	        );
	    }

	    function traverse(path) {
	        assert.ok(path instanceof NodePath);
	        var value = path.value;

	        if (isArray.check(value)) {
	            path.each(traverse);
	            return;
	        }

	        if (Node.check(value)) {
	            if (callback.call(path, value, traverse) === false) {
	                return;
	            }
	        } else if (!isObject.check(value)) {
	            return;
	        }

	        types.eachField(value, function(name, child) {
	            var childPath = path.get(name);
	            if (childPath.value !== child) {
	                childPath.replace(child);
	            }

	            traverse(childPath);
	        });
	    }

	    if (node instanceof NodePath) {
	        traverse(node);
	        return node.value;
	    }

	    // Just in case we call this.replace at the root, there needs to be an
	    // additional parent Path to update.
	    var rootPath = new NodePath({ root: node });
	    traverse(rootPath.get("root"));
	    return rootPath.value.root;
	}

	// Good for read-only traversals that do not require any NodePath
	// information. Faster than traverseWithFullPathInfo because less
	// information is exposed. A context parameter is supported because `this`
	// no longer has to be a NodePath object.
	function traverseWithNoPathInfo(node, callback, context) {
	    Node.assert(node);
	    context = context || null;

	    function traverse(node) {
	        if (isArray.check(node)) {
	            node.forEach(traverse);
	            return;
	        }

	        if (Node.check(node)) {
	            if (callback.call(context, node, traverse) === false) {
	                return;
	            }
	        } else if (!isObject.check(node)) {
	            return;
	        }

	        types.eachField(node, function(name, child) {
	            traverse(child);
	        });
	    }

	    traverse(node);

	    return node;
	}

	// Since we export traverseWithFullPathInfo as module.exports, we need to
	// attach traverseWithNoPathInfo to it as a property. In other words, you
	// should use require("ast-types").traverse.fast(ast, ...) to invoke the
	// quick-and-dirty traverseWithNoPathInfo function.
	traverseWithFullPathInfo.fast = traverseWithNoPathInfo;

	module.exports = traverseWithFullPathInfo;


/***/ },
/* 19 */
/***/ function(module, exports, __webpack_require__) {

	var assert = __webpack_require__(4);
	var types = __webpack_require__(10);
	var n = types.namedTypes;
	var isNumber = types.builtInTypes.number;
	var isArray = types.builtInTypes.array;
	var Path = __webpack_require__(20);
	var Scope = __webpack_require__(21);

	function NodePath(value, parentPath, name) {
	    assert.ok(this instanceof NodePath);
	    Path.call(this, value, parentPath, name);
	}

	__webpack_require__(5).inherits(NodePath, Path);
	var NPp = NodePath.prototype;

	Object.defineProperties(NPp, {
	    node: {
	        get: function() {
	            Object.defineProperty(this, "node", {
	                value: this._computeNode()
	            });

	            return this.node;
	        }
	    },

	    parent: {
	        get: function() {
	            Object.defineProperty(this, "parent", {
	                value: this._computeParent()
	            });

	            return this.parent;
	        }
	    },

	    scope: {
	        get: function() {
	            Object.defineProperty(this, "scope", {
	                value: this._computeScope()
	            });

	            return this.scope;
	        }
	    }
	});

	// The value of the first ancestor Path whose value is a Node.
	NPp._computeNode = function() {
	    var value = this.value;
	    if (n.Node.check(value)) {
	        return value;
	    }

	    var pp = this.parentPath;
	    return pp && pp.node || null;
	};

	// The first ancestor Path whose value is a Node distinct from this.node.
	NPp._computeParent = function() {
	    var value = this.value;
	    var pp = this.parentPath;

	    if (!n.Node.check(value)) {
	        while (pp && !n.Node.check(pp.value)) {
	            pp = pp.parentPath;
	        }

	        if (pp) {
	            pp = pp.parentPath;
	        }
	    }

	    while (pp && !n.Node.check(pp.value)) {
	        pp = pp.parentPath;
	    }

	    return pp || null;
	};

	// The closest enclosing scope that governs this node.
	NPp._computeScope = function() {
	    var value = this.value;
	    var pp = this.parentPath;
	    var scope = pp && pp.scope;

	    if (n.Node.check(value) &&
	        Scope.isEstablishedBy(value)) {
	        scope = new Scope(this, scope);
	    }

	    return scope || null;
	};

	NPp.getValueProperty = function(name) {
	    return types.getFieldValue(this.value, name);
	};

	/**
	 * Determine whether this.node needs to be wrapped in parentheses in order
	 * for a parser to reproduce the same local AST structure.
	 *
	 * For instance, in the expression `(1 + 2) * 3`, the BinaryExpression
	 * whose operator is "+" needs parentheses, because `1 + 2 * 3` would
	 * parse differently.
	 *
	 * If assumeExpressionContext === true, we don't worry about edge cases
	 * like an anonymous FunctionExpression appearing lexically first in its
	 * enclosing statement and thus needing parentheses to avoid being parsed
	 * as a FunctionDeclaration with a missing name.
	 */
	NPp.needsParens = function(assumeExpressionContext) {
	    if (!this.parent)
	        return false;

	    var node = this.node;

	    // If this NodePath object is not the direct owner of this.node, then
	    // we do not need parentheses here, though the direct owner might need
	    // parentheses.
	    if (node !== this.value)
	        return false;

	    var parent = this.parent.node;

	    assert.notStrictEqual(node, parent);

	    if (!n.Expression.check(node))
	        return false;

	    if (isUnaryLike(node))
	        return n.MemberExpression.check(parent)
	            && this.name === "object"
	            && parent.object === node;

	    if (isBinary(node)) {
	        if (n.CallExpression.check(parent) &&
	            this.name === "callee") {
	            assert.strictEqual(parent.callee, node);
	            return true;
	        }

	        if (isUnaryLike(parent))
	            return true;

	        if (n.MemberExpression.check(parent) &&
	            this.name === "object") {
	            assert.strictEqual(parent.object, node);
	            return true;
	        }

	        if (isBinary(parent)) {
	            var po = parent.operator;
	            var pp = PRECEDENCE[po];
	            var no = node.operator;
	            var np = PRECEDENCE[no];

	            if (pp > np) {
	                return true;
	            }

	            if (pp === np && this.name === "right") {
	                assert.strictEqual(parent.right, node);
	                return true;
	            }
	        }
	    }

	    if (n.SequenceExpression.check(node)) {
	        if (n.ForStatement.check(parent)) {
	            // Although parentheses wouldn't hurt around sequence
	            // expressions in the head of for loops, traditional style
	            // dictates that e.g. i++, j++ should not be wrapped with
	            // parentheses.
	            return false;
	        }

	        if (n.ExpressionStatement.check(parent) &&
	            this.name === "expression") {
	            return false;
	        }

	        // Otherwise err on the side of overparenthesization, adding
	        // explicit exceptions above if this proves overzealous.
	        return true;
	    }

	    if (n.YieldExpression.check(node))
	        return isBinary(parent)
	            || n.CallExpression.check(parent)
	            || n.MemberExpression.check(parent)
	            || n.NewExpression.check(parent)
	            || n.ConditionalExpression.check(parent)
	            || isUnaryLike(parent)
	            || n.YieldExpression.check(parent);

	    if (n.NewExpression.check(parent) &&
	        this.name === "callee") {
	        assert.strictEqual(parent.callee, node);
	        return containsCallExpression(node);
	    }

	    if (n.Literal.check(node) &&
	        isNumber.check(node.value) &&
	        n.MemberExpression.check(parent) &&
	        this.name === "object") {
	        assert.strictEqual(parent.object, node);
	        return true;
	    }

	    if (n.AssignmentExpression.check(node) ||
	        n.ConditionalExpression.check(node)) {
	        if (isUnaryLike(parent))
	            return true;

	        if (isBinary(parent))
	            return true;

	        if (n.CallExpression.check(parent) &&
	            this.name === "callee") {
	            assert.strictEqual(parent.callee, node);
	            return true;
	        }

	        if (n.ConditionalExpression.check(parent) &&
	            this.name === "test") {
	            assert.strictEqual(parent.test, node);
	            return true;
	        }

	        if (n.MemberExpression.check(parent) &&
	            this.name === "object") {
	            assert.strictEqual(parent.object, node);
	            return true;
	        }
	    }

	    if (assumeExpressionContext !== true &&
	        !this.canBeFirstInStatement() &&
	        this.firstInStatement())
	        return true;

	    return false;
	};

	function isBinary(node) {
	    return n.BinaryExpression.check(node)
	        || n.LogicalExpression.check(node);
	}

	function isUnaryLike(node) {
	    return n.UnaryExpression.check(node)
	        // I considered making SpreadElement and SpreadProperty subtypes
	        // of UnaryExpression, but they're not really Expression nodes.
	        || (n.SpreadElement && n.SpreadElement.check(node))
	        || (n.SpreadProperty && n.SpreadProperty.check(node));
	}

	var PRECEDENCE = {};
	[["||"],
	 ["&&"],
	 ["|"],
	 ["^"],
	 ["&"],
	 ["==", "===", "!=", "!=="],
	 ["<", ">", "<=", ">=", "in", "instanceof"],
	 [">>", "<<", ">>>"],
	 ["+", "-"],
	 ["*", "/", "%"]
	].forEach(function(tier, i) {
	    tier.forEach(function(op) {
	        PRECEDENCE[op] = i;
	    });
	});

	function containsCallExpression(node) {
	    if (n.CallExpression.check(node)) {
	        return true;
	    }

	    if (isArray.check(node)) {
	        return node.some(containsCallExpression);
	    }

	    if (n.Node.check(node)) {
	        return types.someField(node, function(name, child) {
	            return containsCallExpression(child);
	        });
	    }

	    return false;
	}

	NPp.canBeFirstInStatement = function() {
	    var node = this.node;
	    return !n.FunctionExpression.check(node)
	        && !n.ObjectExpression.check(node);
	};

	NPp.firstInStatement = function() {
	    return firstInStatement(this);
	};

	function firstInStatement(path) {
	    for (var node, parent; path.parent; path = path.parent) {
	        node = path.node;
	        parent = path.parent.node;

	        if (n.BlockStatement.check(parent) &&
	            path.parent.name === "body" &&
	            path.name === 0) {
	            assert.strictEqual(parent.body[0], node);
	            return true;
	        }

	        if (n.ExpressionStatement.check(parent) &&
	            path.name === "expression") {
	            assert.strictEqual(parent.expression, node);
	            return true;
	        }

	        if (n.SequenceExpression.check(parent) &&
	            path.parent.name === "expressions" &&
	            path.name === 0) {
	            assert.strictEqual(parent.expressions[0], node);
	            continue;
	        }

	        if (n.CallExpression.check(parent) &&
	            path.name === "callee") {
	            assert.strictEqual(parent.callee, node);
	            continue;
	        }

	        if (n.MemberExpression.check(parent) &&
	            path.name === "object") {
	            assert.strictEqual(parent.object, node);
	            continue;
	        }

	        if (n.ConditionalExpression.check(parent) &&
	            path.name === "test") {
	            assert.strictEqual(parent.test, node);
	            continue;
	        }

	        if (isBinary(parent) &&
	            path.name === "left") {
	            assert.strictEqual(parent.left, node);
	            continue;
	        }

	        if (n.UnaryExpression.check(parent) &&
	            !parent.prefix &&
	            path.name === "argument") {
	            assert.strictEqual(parent.argument, node);
	            continue;
	        }

	        return false;
	    }

	    return true;
	}

	module.exports = NodePath;


/***/ },
/* 20 */
/***/ function(module, exports, __webpack_require__) {

	var assert = __webpack_require__(4);
	var Op = Object.prototype;
	var hasOwn = Op.hasOwnProperty;
	var toString = Op.toString;
	var arrayToString = toString.call([]);
	var Ap = Array.prototype;
	var slice = Ap.slice;
	var map = Ap.map;

	function Path(value, parentPath, name) {
	    assert.ok(this instanceof Path);

	    if (parentPath) {
	        assert.ok(parentPath instanceof Path);
	    } else {
	        parentPath = null;
	        name = null;
	    }

	    // The value encapsulated by this Path, generally equal to
	    // parentPath.value[name] if we have a parentPath.
	    this.value = value;

	    // The immediate parent Path of this Path.
	    this.parentPath = parentPath;

	    // The name of the property of parentPath.value through which this
	    // Path's value was reached.
	    this.name = name;

	    // Calling path.get("child") multiple times always returns the same
	    // child Path object, for both performance and consistency reasons.
	    this.__childCache = {};
	}

	var Pp = Path.prototype;

	function getChildPath(path, name) {
	    var cache = path.__childCache;
	    var actualChildValue = path.getValueProperty(name);
	    var childPath = cache[name];
	    if (!hasOwn.call(cache, name) ||
	        // Ensure consistency between cache and reality.
	        childPath.value !== actualChildValue) {
	        childPath = cache[name] = new path.constructor(
	            actualChildValue, path, name
	        );
	    }
	    return childPath;
	}

	// This method is designed to be overridden by subclasses that need to
	// handle missing properties, etc.
	Pp.getValueProperty = function(name) {
	    return this.value[name];
	};

	Pp.get = function(name) {
	    var path = this;
	    var names = arguments;
	    var count = names.length;

	    for (var i = 0; i < count; ++i) {
	        path = getChildPath(path, names[i]);
	    }

	    return path;
	};

	Pp.each = function(callback, context) {
	    var childPaths = [];
	    var len = this.value.length;
	    var i = 0;

	    // Collect all the original child paths before invoking the callback.
	    for (var i = 0; i < len; ++i) {
	        if (hasOwn.call(this.value, i)) {
	            childPaths[i] = this.get(i);
	        }
	    }

	    // Invoke the callback on just the original child paths, regardless of
	    // any modifications made to the array by the callback. I chose these
	    // semantics over cleverly invoking the callback on new elements because
	    // this way is much easier to reason about.
	    context = context || this;
	    for (i = 0; i < len; ++i) {
	        if (hasOwn.call(childPaths, i)) {
	            callback.call(context, childPaths[i]);
	        }
	    }
	};

	Pp.map = function(callback, context) {
	    var result = [];

	    this.each(function(childPath) {
	        result.push(callback.call(this, childPath));
	    }, context);

	    return result;
	};

	Pp.filter = function(callback, context) {
	    var result = [];

	    this.each(function(childPath) {
	        if (callback.call(this, childPath)) {
	            result.push(childPath);
	        }
	    }, context);

	    return result;
	};

	Pp.replace = function(replacement) {
	    var count = arguments.length;

	    assert.ok(
	        this.parentPath instanceof Path,
	        "Instead of replacing the root of the tree, create a new tree."
	    );

	    var name = this.name;
	    var parentValue = this.parentPath.value;
	    var parentCache = this.parentPath.__childCache;
	    var results = [];

	    if (toString.call(parentValue) === arrayToString) {
	        var i;
	        var newIndex;

	        if (this.value !== parentCache[name].value) {
	            // Something caused our index (name) to become out of date.
	            for (i = 0; i < parentValue.length; ++i) {
	                if (parentValue[i] === this.value) {
	                    this.name = name = i;
	                    break;
	                }
	            }
	            assert.ok(
	                this.value === parentCache[name].value,
	                "Cannot replace already replaced node: " + this.value.type
	            );
	        }

	        delete parentCache.length;
	        delete parentCache[name];

	        var moved = {};

	        for (i = name + 1; i < parentValue.length; ++i) {
	            var child = parentCache[i];
	            if (child) {
	                newIndex = i - 1 + count;
	                moved[newIndex] = child;
	                Object.defineProperty(child, "name", { value: newIndex });
	                delete parentCache[i];
	            }
	        }

	        var args = slice.call(arguments);
	        args.unshift(name, 1);
	        parentValue.splice.apply(parentValue, args);

	        for (newIndex in moved) {
	            if (hasOwn.call(moved, newIndex)) {
	                parentCache[newIndex] = moved[newIndex];
	            }
	        }

	        for (i = name; i < name + count; ++i) {
	            results.push(this.parentPath.get(i));
	        }

	    } else if (count === 1) {
	        delete parentCache[name];
	        parentValue[name] = replacement;
	        results.push(this.parentPath.get(name));

	    } else if (count === 0) {
	        delete parentCache[name];
	        delete parentValue[name];

	    } else {
	        assert.ok(false, "Could not replace Path.");
	    }

	    return results;
	};

	module.exports = Path;


/***/ },
/* 21 */
/***/ function(module, exports, __webpack_require__) {

	var assert = __webpack_require__(4);
	var types = __webpack_require__(10);
	var Type = types.Type;
	var namedTypes = types.namedTypes;
	var builders = types.builders;
	var Node = namedTypes.Node;
	var isArray = types.builtInTypes.array;
	var hasOwn = Object.prototype.hasOwnProperty;

	function Scope(path, parentScope) {
	    assert.ok(this instanceof Scope);
	    assert.ok(path instanceof __webpack_require__(19));
	    ScopeType.assert(path.value);

	    var depth;

	    if (parentScope) {
	        assert.ok(parentScope instanceof Scope);
	        depth = parentScope.depth + 1;
	    } else {
	        parentScope = null;
	        depth = 0;
	    }

	    Object.defineProperties(this, {
	        path: { value: path },
	        node: { value: path.value },
	        isGlobal: { value: !parentScope, enumerable: true },
	        depth: { value: depth },
	        parent: { value: parentScope },
	        bindings: { value: {} }
	    });
	}

	var scopeTypes = [
	    // Program nodes introduce global scopes.
	    namedTypes.Program,

	    // Function is the supertype of FunctionExpression,
	    // FunctionDeclaration, ArrowExpression, etc.
	    namedTypes.Function,

	    // In case you didn't know, the caught parameter shadows any variable
	    // of the same name in an outer scope.
	    namedTypes.CatchClause
	];

	var ScopeType = Type.or.apply(Type, scopeTypes);

	Scope.isEstablishedBy = function(node) {
	    return ScopeType.check(node);
	};

	var Sp = Scope.prototype;

	// Will be overridden after an instance lazily calls scanScope.
	Sp.didScan = false;

	Sp.declares = function(name) {
	    this.scan();
	    return hasOwn.call(this.bindings, name);
	};

	Sp.declareTemporary = function(prefix) {
	    assert.ok(/^[a-z$_]/i.test(prefix), prefix);
	    this.scan();

	    var index = 0;
	    while (this.declares(prefix + index)) {
	        ++index;
	    }

	    var id = builders.identifier(prefix + index);
	    this.bindings[prefix + index] = id;
	    return id;
	};

	Sp.scan = function(force) {
	    if (force || !this.didScan) {
	        for (var name in this.bindings) {
	            // Empty out this.bindings, just in cases.
	            delete this.bindings[name];
	        }
	        scanScope(this.path, this.bindings);
	        this.didScan = true;
	    }
	};

	Sp.getBindings = function () {
	    this.scan();
	    return this.bindings;
	};

	function scanScope(path, bindings) {
	    var node = path.value;
	    ScopeType.assert(node);

	    if (namedTypes.CatchClause.check(node)) {
	        // A catch clause establishes a new scope but the only variable
	        // bound in that scope is the catch parameter. Any other
	        // declarations create bindings in the outer scope.
	        addPattern(path.get("param"), bindings);

	    } else {
	        recursiveScanScope(path, bindings);
	    }
	}

	function recursiveScanScope(path, bindings) {
	    var node = path.value;

	    if (path.parent &&
	        namedTypes.FunctionExpression.check(path.parent.node) &&
	        path.parent.node.id) {
	        addPattern(path.parent.get("id"), bindings);

	    } else if (isArray.check(node)) {
	        path.each(function(childPath) {
	            recursiveScanChild(childPath, bindings);
	        });

	    } else if (namedTypes.Function.check(node)) {
	        path.get("params").each(function(paramPath) {
	            addPattern(paramPath, bindings);
	        });

	        recursiveScanChild(path.get("body"), bindings);

	    } else if (namedTypes.VariableDeclarator.check(node)) {
	        addPattern(path.get("id"), bindings);
	        recursiveScanChild(path.get("init"), bindings);

	    } else if (namedTypes.ImportSpecifier &&
	               namedTypes.ImportSpecifier.check(node)) {
	        addPattern(
	          node.name ? path.get("name") : path.get("id"),
	          bindings
	        );

	    } else if (namedTypes.ModuleDeclaration &&
	               namedTypes.ModuleDeclaration.check(node)) {
	        addPattern(path.get("id"), bindings);

	    } else if (Node.check(node)) {
	        types.eachField(node, function(name, child) {
	            var childPath = path.get(name);
	            assert.strictEqual(childPath.value, child);
	            recursiveScanChild(childPath, bindings);
	        });
	    }
	}

	function recursiveScanChild(path, bindings) {
	    var node = path.value;

	    if (namedTypes.FunctionDeclaration.check(node)) {
	        addPattern(path.get("id"), bindings);

	    } else if (namedTypes.ClassDeclaration &&
	               namedTypes.ClassDeclaration.check(node)) {
	        addPattern(path.get("id"), bindings);

	    } else if (Scope.isEstablishedBy(node)) {
	        if (namedTypes.CatchClause.check(node)) {
	            var catchParamName = node.param.name;
	            var hadBinding = hasOwn.call(bindings, catchParamName);

	            // Any declarations that occur inside the catch body that do
	            // not have the same name as the catch parameter should count
	            // as bindings in the outer scope.
	            recursiveScanScope(path.get("body"), bindings);

	            // If a new binding matching the catch parameter name was
	            // created while scanning the catch body, ignore it because it
	            // actually refers to the catch parameter and not the outer
	            // scope that we're currently scanning.
	            if (!hadBinding) {
	                delete bindings[catchParamName];
	            }
	        }

	    } else {
	        recursiveScanScope(path, bindings);
	    }
	}

	function addPattern(patternPath, bindings) {
	    var pattern = patternPath.value;
	    namedTypes.Pattern.assert(pattern);

	    if (namedTypes.Identifier.check(pattern)) {
	        if (hasOwn.call(bindings, pattern.name)) {
	            bindings[pattern.name].push(patternPath);
	        } else {
	            bindings[pattern.name] = [patternPath];
	        }

	    } else if (namedTypes.SpreadElement &&
	               namedTypes.SpreadElement.check(pattern)) {
	        addPattern(patternPath.get("argument"), bindings);
	    }
	}

	Sp.lookup = function(name) {
	    for (var scope = this; scope; scope = scope.parent)
	        if (scope.declares(name))
	            break;
	    return scope;
	};

	Sp.getGlobalScope = function() {
	    var scope = this;
	    while (!scope.isGlobal)
	        scope = scope.parent;
	    return scope;
	};

	module.exports = Scope;


/***/ },
/* 22 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2013, Facebook, Inc.
	 * All rights reserved.
	 *
	 * This source code is licensed under the BSD-style license found in the
	 * https://raw.github.com/facebook/regenerator/master/LICENSE file. An
	 * additional grant of patent rights can be found in the PATENTS file in
	 * the same directory.
	 */

	var assert = __webpack_require__(4);
	var types = __webpack_require__(9);
	var n = types.namedTypes;
	var b = types.builders;
	var hoist = __webpack_require__(23).hoist;
	var Emitter = __webpack_require__(25).Emitter;
	var DebugInfo = __webpack_require__(51).DebugInfo;
	var escope = __webpack_require__(52);
	var withLoc = __webpack_require__(24).withLoc;

	exports.transform = function(ast, opts) {
	  n.Program.assert(ast);
	  var debugInfo = new DebugInfo();
	  var nodes = ast.body;
	  var asExpr = opts.asExpr;
	  var originalExpr = nodes[0];
	  var boxedVars = (opts.scope || []).reduce(function(acc, v) {
	    if(v.boxed) {
	      acc.push(v.name);
	    }
	    return acc;
	  }, []);

	  var scopes = escope.analyze(ast).scopes;

	  // Scan the scopes bottom-up by simply reversing the array. We need
	  // this because we need to detect if an identifier is boxed before
	  // the scope which it is declared in is scanned.

	  scopes.reverse();
	  scopes.forEach(function(scope) {
	    if(scope.type !== 'global' || asExpr) {

	      if(asExpr) {
	        // We need to also scan the variables to catch top-level
	        // definitions that aren't referenced but might be boxed
	        // (think function re-definitions)
	        scope.variables.forEach(function(v) {
	          if(boxedVars.indexOf(v.name) !== -1) {
	            v.defs.forEach(function(def) { def.name.boxed = true; });
	          }
	        });
	      }

	      scope.references.forEach(function(r) {
	        var defBoxed = r.resolved && r.resolved.defs.reduce(function(acc, def) {
	          return acc || def.name.boxed || boxedVars.indexOf(def.name) !== -1;
	        }, false);

	        // Ignore catch scopes
	        var from = r.from;
	        while(from.type == 'catch' && from.upper) {
	          from = from.upper;
	        }

	        if(defBoxed ||
	           (!r.resolved &&
	            boxedVars.indexOf(r.identifier.name) !== -1) ||
	           (r.resolved &&
	            r.resolved.scope.type !== 'catch' &&
	            r.resolved.scope !== from &&

	            // completely ignore references to a named function
	            // expression, as that binding is immutable (super weird)
	            !(r.resolved.defs[0].type === 'FunctionName' &&
	              r.resolved.defs[0].node.type === 'FunctionExpression'))) {

	          r.identifier.boxed = true;

	          if(r.resolved) {
	            r.resolved.defs.forEach(function(def) {
	              def.name.boxed = true;
	            });
	          }
	        }
	      });
	    }
	  });

	  if(asExpr) {
	    // If evaluating as an expression, return the last value if it's
	    // an expression
	    var last = nodes.length - 1;

	    if(n.ExpressionStatement.check(nodes[last])) {
	      nodes[last] = withLoc(
	        b.returnStatement(nodes[last].expression),
	        nodes[last].loc
	      );
	    }
	  }

	  nodes = b.functionExpression(
	    b.identifier(asExpr ? '$__eval' : '$__global'),
	    [],
	    b.blockStatement(nodes)
	  );

	  var rootFn = types.traverse(
	    nodes,
	    function(node) {
	      return visitNode.call(this, node, [], debugInfo);
	    }
	  );

	  if(asExpr) {
	    rootFn = rootFn.body.body;

	    if(opts.scope) {
	      var vars = opts.scope.map(function(v) { return v.name; });
	      var decl = rootFn[0];
	      if(n.VariableDeclaration.check(decl)) {
	        decl.declarations = decl.declarations.reduce(function(acc, v) {
	          if(vars.indexOf(v.id.name) === -1) {
	            acc.push(v);
	          }
	          return acc;
	        }, []);

	        if(!decl.declarations.length) {
	          rootFn[0] = b.expressionStatement(b.literal(null));
	        }
	      }
	    }
	    else {
	      rootFn[0] = b.expressionStatement(b.literal(null));
	    }

	    rootFn.unshift(b.expressionStatement(
	      b.callExpression(
	        b.memberExpression(
	          b.identifier('VM'),
	          b.identifier('pushState'),
	          false
	        ),
	        []
	      )
	    ));

	    rootFn.push(b.variableDeclaration(
	      'var',
	      [b.variableDeclarator(
	        b.identifier('$__rval'),
	        b.callExpression(b.identifier('$__eval'), [])
	      )]
	    ));

	    rootFn.push(b.expressionStatement(
	      b.callExpression(
	        b.memberExpression(
	          b.identifier('VM'),
	          b.identifier('popState'),
	          false
	        ),
	        []
	      )
	    ));

	    rootFn.push(b.expressionStatement(b.identifier('$__rval')));
	  }
	  else {
	    rootFn = rootFn.body.body;
	  }

	  ast.body = rootFn;

	  return {
	    ast: ast,
	    debugAST: opts.includeDebug ? [debugInfo.getDebugAST()] : [],
	    debugInfo: debugInfo.getDebugInfo()
	  };
	};

	var id = 1;
	function newFunctionName() {
	  return b.identifier('$anon' + id++);
	}

	function visitNode(node, scope, debugInfo) {
	  // Boxed variables need to access the box instead of used directly
	  // (foo => foo[0])
	  if(n.Identifier.check(node) &&
	     (!n.VariableDeclarator.check(this.parent.node) ||
	      this.parent.node.id !== node) &&
	     node.boxed) {

	    this.replace(withLoc(b.memberExpression(node, b.literal(0), true),
	                         node.loc));
	    return;
	  }

	  if(!n.Function.check(node)) {
	    // Note that because we are not returning false here the traversal
	    // will continue into the subtree rooted at this node, as desired.
	    return;
	  }

	  node.generator = false;

	  if (node.expression) {
	    // Transform expression lambdas into normal functions.
	    node.expression = false;
	    // This feels very dirty, is it ok to change the type like this?
	    // We need to output a function that we can name so it can be
	    // captured.
	    // TODO: properly compile out arrow functions
	    node.type = 'FunctionExpression';
	    node.body = b.blockStatement([
	      withLoc(b.returnStatement(node.body),
	              node.body.loc)
	    ]);
	  }

	  // All functions are converted with assignments (foo = function
	  // foo() {}) but with the function name. Rename the function though
	  // so that if it is referenced inside itself, it will close over the
	  // "outside" variable (that should be boxed)
	  node.id = node.id || newFunctionName();
	  var isGlobal = node.id.name === '$__global';
	  var isExpr = node.id.name === '$__eval';
	  var nameId = node.id;
	  var funcName = node.id.name;
	  var vars = hoist(node);
	  var localScope = !vars ? node.params : node.params.concat(
	    vars.declarations.map(function(v) {
	      return v.id;
	    })
	  );

	  // It sucks to traverse the whole function again, but we need to see
	  // if we need to manage a try stack
	  var hasTry = false;
	  types.traverse(node.body, function(child) {
	    if(n.Function.check(child)) {
	      return false;
	    }

	    if(n.TryStatement.check(child)) {
	      hasTry = true;
	    }

	    return;
	  });

	  // Traverse and compile child functions first
	  node.body = types.traverse(node.body, function(child) {
	    return visitNode.call(this,
	                          child,
	                          scope.concat(localScope),
	                          debugInfo);
	  });

	  // Now compile me
	  var debugId = debugInfo.makeId();
	  var em = new Emitter(debugId, debugInfo);
	  var path = new types.NodePath(node);

	  em.explode(path.get("body"));

	  var finalBody = em.getMachine(node.id.name, localScope);

	  // construct the thing
	  var inner = [];

	  if(!isGlobal && !isExpr) {
	    node.params.forEach(function(arg) {
	      if(arg.boxed) {
	        inner.push(b.expressionStatement(
	          b.assignmentExpression(
	            '=',
	            arg,
	            b.arrayExpression([arg])
	          )
	        ));
	      }
	    });

	    if(vars) {
	      inner = inner.concat(vars);
	    }
	  }

	  if(!isGlobal && !isExpr) {
	    inner.push.apply(inner, [
	      b.ifStatement(
	        b.unaryExpression('!', em.vmProperty('running')),
	        b.returnStatement(
	          b.callExpression(
	            b.memberExpression(b.identifier('VM'),
	                               b.identifier('execute'),
	                               false),
	            [node.id, b.literal(null), b.thisExpression(), b.identifier('arguments')]
	          )
	        )
	      )
	    ]);
	  }

	  // internal harnesses to run the function
	  inner.push(em.declareVar('$__next', b.literal(0)));
	  inner.push(em.declareVar('$__tmpid', b.literal(0)));
	  for(var i=1, l=em.numTempVars(); i<=l; i++) {
	    inner.push(em.declareVar('$__t' + i, null));
	  }

	  if(hasTry) {
	    inner.push(em.declareVar('tryStack', b.arrayExpression([])));
	  }

	  var tmpSave = [];
	  for(var i=1, l=em.numTempVars(); i<=l; i++) {
	    tmpSave.push(b.property(
	      'init',
	      b.identifier('$__t' + i),
	      b.identifier('$__t' + i)
	    ));
	  }

	  inner = inner.concat([
	    b.tryStatement(
	      b.blockStatement(getRestoration(em, isGlobal, localScope, hasTry)
	                       .concat(finalBody)),
	      b.catchClause(b.identifier('e'), null, b.blockStatement([
	        b.ifStatement(
	          b.unaryExpression(
	            '!',
	            b.binaryExpression('instanceof',
	                               b.identifier('e'),
	                               b.identifier('$ContinuationExc'))
	          ),
	          b.expressionStatement(
	            b.assignmentExpression(
	              '=',
	              b.identifier('e'),
	              b.newExpression(
	                b.identifier('$ContinuationExc'),
	                [b.identifier('e')]
	              )
	            )
	          )
	        ),

	        b.ifStatement(
	          b.unaryExpression('!', em.getProperty('e', 'reuse')),
	          b.expressionStatement(
	            b.callExpression(em.getProperty('e', 'pushFrame'), [
	              b.newExpression(
	                b.identifier('$Frame'),
	                [b.literal(debugId),
	                 b.literal(funcName.slice(1)),
	                 b.identifier(funcName),
	                 b.identifier('$__next'),
	                 b.objectExpression(
	                   localScope.map(function(id) {
	                     return b.property('init', id, id);
	                   }).concat(tmpSave)
	                 ),
	                 // b.literal(null),
	                 b.arrayExpression(localScope.concat(scope).map(function(id) {
	                   return b.objectExpression([
	                     b.property('init', b.literal('name'), b.literal(id.name)),
	                     b.property('init', b.literal('boxed'), b.literal(!!id.boxed))
	                   ]);
	                 })),
	                 b.thisExpression(),
	                 hasTry ? b.identifier('tryStack') : b.literal(null),
	                 b.identifier('$__tmpid')]
	              )
	            ])
	          )
	        ),

	        em.assign(em.getProperty('e', 'reuse'), b.literal(false)),
	        b.throwStatement(b.identifier('e'))
	      ]))
	    )
	  ]);

	  if(isGlobal || isExpr) {
	    node.body = b.blockStatement([
	      vars ? vars : b.expressionStatement(b.literal(null)),
	      b.functionDeclaration(
	          nameId, [],
	          b.blockStatement(inner)
	      )
	    ]);
	  }
	  else {
	    node.body = b.blockStatement(inner);
	  }

	  return false;
	}

	function getRestoration(self, isGlobal, localScope, hasTry) {
	  // restoring a frame
	  var restoration = [];

	  restoration.push(
	    self.declareVar(
	      '$__frame',
	      b.callExpression(self.vmProperty('popFrame'), [])
	    )
	  );

	  if(!isGlobal) {
	    restoration = restoration.concat(localScope.map(function(id) {
	      return b.expressionStatement(
	        b.assignmentExpression(
	          '=',
	          b.identifier(id.name),
	          self.getProperty(
	            self.getProperty(b.identifier('$__frame'), 'state'),
	            id
	          )
	        )
	      );
	    }));
	  }

	  restoration.push(
	    self.assign(b.identifier('$__next'),
	                self.getProperty(b.identifier('$__frame'), 'next'))
	  );
	  if(hasTry) {
	    restoration.push(
	      self.assign(b.identifier('tryStack'),
	                  self.getProperty(b.identifier('$__frame'), 'tryStack'))
	    );
	  }

	  restoration = restoration.concat([
	    self.declareVar(
	      '$__child',
	      b.callExpression(self.vmProperty('nextFrame'), [])
	    ),
	    self.assign(b.identifier('$__tmpid'),
	                self.getProperty(b.identifier('$__frame'), 'tmpid')),
	    b.ifStatement(
	      b.identifier('$__child'),
	      b.blockStatement([
	        self.assign(
	          self.getProperty(
	            self.getProperty(
	              '$__frame',
	              b.identifier('state')
	            ),
	            b.binaryExpression(
	              '+',
	              b.literal('$__t'),
	              self.getProperty('$__frame', 'tmpid')
	            ),
	            true
	          ),
	          b.callExpression(
	            self.getProperty(self.getProperty('$__child', 'fn'), 'call'),
	            [self.getProperty('$__child', 'thisPtr')]
	          )
	        ),

	        // if we are stepping, stop executing here so that it
	        // pauses on the "return" instruction
	        b.ifStatement(
	          self.vmProperty('stepping'),
	          b.throwStatement(
	            b.newExpression(b.identifier('$ContinuationExc'), 
	                            [b.literal(null),
	                             b.identifier('$__frame')])
	          )
	        )
	      ])
	    )
	  ]);

	  for(var i=1, l=self.numTempVars(); i<=l; i++) {
	    restoration.push(b.expressionStatement(
	      b.assignmentExpression(
	        '=',
	        b.identifier('$__t' + i),
	        self.getProperty(
	          self.getProperty(b.identifier('$__frame'), 'state'),
	          '$__t' + i
	        )
	      )
	    ));
	  }

	  return [
	    b.ifStatement(
	      self.vmProperty('doRestore'),
	      b.blockStatement(restoration),
	      b.ifStatement(
	        // if we are stepping, stop executing so it is stopped at
	        // the first instruction of the new frame
	        self.vmProperty('stepping'),
	        b.throwStatement(
	          b.newExpression(b.identifier('$ContinuationExc'), [])
	        )
	      )
	    )
	  ];
	}


/***/ },
/* 23 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2013, Facebook, Inc.
	 * All rights reserved.
	 *
	 * This source code is licensed under the BSD-style license found in the
	 * https://raw.github.com/facebook/regenerator/master/LICENSE file. An
	 * additional grant of patent rights can be found in the PATENTS file in
	 * the same directory.
	 */

	var assert = __webpack_require__(4);
	var types = __webpack_require__(9);
	var n = types.namedTypes;
	var b = types.builders;
	var hasOwn = Object.prototype.hasOwnProperty;
	var withLoc = __webpack_require__(24).withLoc;

	// The hoist function takes a FunctionExpression or FunctionDeclaration
	// and replaces any Declaration nodes in its body with assignments, then
	// returns a VariableDeclaration containing just the names of the removed
	// declarations.
	exports.hoist = function(fun) {
	  n.Function.assert(fun);
	  var vars = {};
	  var funDeclsToRaise = [];

	  function varDeclToExpr(vdec, includeIdentifiers) {
	    n.VariableDeclaration.assert(vdec);
	    var exprs = [];

	    vdec.declarations.forEach(function(dec) {
	      vars[dec.id.name] = dec.id;

	      if (dec.init) {
	        var assn = b.assignmentExpression('=', dec.id, dec.init);

	        exprs.push(withLoc(assn, dec.loc));
	      } else if (includeIdentifiers) {
	        exprs.push(dec.id);
	      }
	    });

	    if (exprs.length === 0)
	      return null;

	    if (exprs.length === 1)
	      return exprs[0];

	    return b.sequenceExpression(exprs);
	  }

	  types.traverse(fun.body, function(node) {
	    if (n.VariableDeclaration.check(node)) {
	      var expr = varDeclToExpr(node, false);
	      if (expr === null) {
	        this.replace();
	      } else {
	        // We don't need to traverse this expression any further because
	        // there can't be any new declarations inside an expression.
	        this.replace(withLoc(b.expressionStatement(expr), node.loc));
	      }

	      // Since the original node has been either removed or replaced,
	      // avoid traversing it any further.
	      return false;

	    } else if (n.ForStatement.check(node)) {
	      if (n.VariableDeclaration.check(node.init)) {
	        var expr = varDeclToExpr(node.init, false);
	        this.get("init").replace(expr);
	      }

	    } else if (n.ForInStatement.check(node)) {
	      if (n.VariableDeclaration.check(node.left)) {
	        var expr = varDeclToExpr(node.left, true);
	        this.get("left").replace(expr);
	      }

	    } else if (n.FunctionDeclaration.check(node)) {
	      vars[node.id.name] = node.id;

	      var parentNode = this.parent.node;
	      // Prefix the name with '$' as it introduces a new scoping rule
	      // and we want the original id to be referenced within the body
	      var funcExpr = b.functionExpression(
	        b.identifier('$' + node.id.name),
	        node.params,
	        node.body,
	        node.generator,
	        node.expression
	      );
	      funcExpr.loc = node.loc;

	      var assignment = withLoc(b.expressionStatement(
	        withLoc(b.assignmentExpression(
	          "=",
	          node.id,
	          funcExpr
	        ), node.loc)
	      ), node.loc);

	      if (n.BlockStatement.check(this.parent.node)) {
	        // unshift because later it will be added in reverse, so this
	        // will keep the original order
	        funDeclsToRaise.unshift({
	          block: this.parent.node,
	          assignment: assignment
	        });

	        // Remove the function declaration for now, but reinsert the assignment
	        // form later, at the top of the enclosing BlockStatement.
	        this.replace();

	      } else {
	        this.replace(assignment);
	      }

	      // Don't hoist variables out of inner functions.
	      return false;

	    } else if (n.FunctionExpression.check(node)) {
	      // Don't descend into nested function expressions.
	      return false;
	    }
	  });

	  funDeclsToRaise.forEach(function(entry) {
	    entry.block.body.unshift(entry.assignment);
	  });

	  var declarations = [];
	  var paramNames = {};

	  fun.params.forEach(function(param) {
	    if (n.Identifier.check(param)) {
	      paramNames[param.name] = param;
	    }
	    else {
	      // Variables declared by destructuring parameter patterns will be
	      // harmlessly re-declared.
	    }
	  });

	  Object.keys(vars).forEach(function(name) {
	    if(!hasOwn.call(paramNames, name)) {
	      var id = vars[name];
	      declarations.push(b.variableDeclarator(
	        id, id.boxed ? b.arrayExpression([b.identifier('undefined')]) : null
	      ));
	    }
	  });

	  if (declarations.length === 0) {
	    return null; // Be sure to handle this case!
	  }

	  return b.variableDeclaration("var", declarations);
	};


/***/ },
/* 24 */
/***/ function(module, exports) {

	/**
	 * Copyright (c) 2013, Facebook, Inc.
	 * All rights reserved.
	 *
	 * This source code is licensed under the BSD-style license found in the
	 * https://raw.github.com/facebook/regenerator/master/LICENSE file. An
	 * additional grant of patent rights can be found in the PATENTS file in
	 * the same directory.
	 */

	var hasOwn = Object.prototype.hasOwnProperty;

	exports.guessTabWidth = function(source) {
	  var counts = []; // Sparse array.
	  var lastIndent = 0;

	  source.split("\n").forEach(function(line) {
	    var indent = /^\s*/.exec(line)[0].length;
	    var diff = Math.abs(indent - lastIndent);
	    counts[diff] = ~~counts[diff] + 1;
	    lastIndent = indent;
	  });

	  var maxCount = -1;
	  var result = 2;

	  for (var tabWidth = 1;
	       tabWidth < counts.length;
	       tabWidth += 1) {
	    if (tabWidth in counts &&
	        counts[tabWidth] > maxCount) {
	      maxCount = counts[tabWidth];
	      result = tabWidth;
	    }
	  }

	  return result;
	};

	exports.defaults = function(obj) {
	  var len = arguments.length;
	  var extension;

	  for (var i = 1; i < len; ++i) {
	    if ((extension = arguments[i])) {
	      for (var key in extension) {
	        if (hasOwn.call(extension, key) && !hasOwn.call(obj, key)) {
	          obj[key] = extension[key];
	        }
	      }
	    }
	  }

	  return obj;
	};

	// tag nodes with source code locations

	exports.withLoc = function(node, loc) {
	  node.loc = loc;
	  return node;
	};


/***/ },
/* 25 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2013, Facebook, Inc.
	 * All rights reserved.
	 *
	 * This source code is licensed under the BSD-style license found in the
	 * https://raw.github.com/facebook/regenerator/master/LICENSE file. An
	 * additional grant of patent rights can be found in the PATENTS file in
	 * the same directory.
	 */
	"use strict";

	var assert = __webpack_require__(4);
	var types = __webpack_require__(9);
	var recast = __webpack_require__(26);
	var isArray = types.builtInTypes.array;
	var b = types.builders;
	var n = types.namedTypes;
	var leap = __webpack_require__(49);
	var meta = __webpack_require__(50);
	var hasOwn = Object.prototype.hasOwnProperty;
	var withLoc = __webpack_require__(24).withLoc;

	function makeASTGenerator(code) {
	  return function() {
	    // TODO: optimize it so it doesn't always have to parse it
	    var ast = b.blockStatement(recast.parse(code).program.body);
	    var args = arguments;
	    return types.traverse(ast, function(node) {
	      if(n.Identifier.check(node) &&
	         node.name[0] === '$') {
	        var idx = parseInt(node.name.slice(1));
	        return this.replace(args[idx - 1]);
	      }
	    });
	  }
	}

	var makeSetBreakpointAST = makeASTGenerator('VM.hasBreakpoints = true;\nVM.machineBreaks[$1][$2] = true;');

	function Emitter(debugId, debugInfo) {
	  assert.ok(this instanceof Emitter);

	  this.tmpId = 0;
	  this.maxTmpId = 0;

	  Object.defineProperties(this, {
	    // An append-only list of Statements that grows each time this.emit is
	    // called.
	    listing: { value: [] },

	    // A sparse array whose keys correspond to locations in this.listing
	    // that have been marked as branch/jump targets.
	    marked: { value: [true] },

	    // Every location has a source location mapping
	    sourceLocations: { value: [true] },

	    // The last location will be marked when this.getDispatchLoop is
	    // called.
	    finalLoc: { value: loc() },

	    debugId: { value: debugId },
	    debugInfo: { value: debugInfo }
	  });

	  // The .leapManager property needs to be defined by a separate
	  // defineProperties call so that .finalLoc will be visible to the
	  // leap.LeapManager constructor.
	  Object.defineProperties(this, {
	    // Each time we evaluate the body of a loop, we tell this.leapManager
	    // to enter a nested loop context that determines the meaning of break
	    // and continue statements therein.
	    leapManager: { value: new leap.LeapManager(this) }
	  });
	}

	var Ep = Emitter.prototype;
	exports.Emitter = Emitter;

	// Offsets into this.listing that could be used as targets for branches or
	// jumps are represented as numeric Literal nodes. This representation has
	// the amazingly convenient benefit of allowing the exact value of the
	// location to be determined at any time, even after generating code that
	// refers to the location.
	function loc() {
	  var lit = b.literal(-1);
	  // A little hacky, but mark is as a location object so we can do
	  // some quick checking later (see resolveEmptyJumps)
	  lit._location = true;
	  return lit;
	}

	// Sets the exact value of the given location to the offset of the next
	// Statement emitted.
	Ep.mark = function(loc) {
	  n.Literal.assert(loc);
	  var index = this.listing.length;
	  loc.value = index;
	  this.marked[index] = true;
	  return loc;
	};

	Ep.getLastMark = function() {
	  var index = this.listing.length;
	  while(index > 0 && !this.marked[index]) {
	    index--;
	  }
	  return index;
	};

	Ep.markAndBreak = function() {
	  var next = loc();
	  this.emitAssign(b.identifier('$__next'), next);
	  this.emit(b.breakStatement(null), true);
	  this.mark(next);
	};

	Ep.emit = function(node, internal) {
	  if (n.Expression.check(node)) {
	    node = withLoc(b.expressionStatement(node), node.loc);
	  }

	  n.Statement.assert(node);
	  this.listing.push(node);

	  if(!internal) {
	    if(!node.loc) {
	      throw new Error("source location missing: " + JSON.stringify(node));
	    }
	    else {
	      this.debugInfo.addSourceLocation(this.debugId,
	                                       node.loc,
	                                       this.listing.length - 1);
	    }
	  }
	};

	// Shorthand for emitting assignment statements. This will come in handy
	// for assignments to temporary variables.
	Ep.emitAssign = function(lhs, rhs, loc) {
	  this.emit(this.assign(lhs, rhs, loc), !loc);
	  return lhs;
	};

	// Shorthand for an assignment statement.
	Ep.assign = function(lhs, rhs, loc) {
	  var node = b.expressionStatement(
	    b.assignmentExpression("=", lhs, rhs));
	  node.loc = loc;
	  return node;
	};

	Ep.declareVar = function(name, init, loc) {
	  return withLoc(b.variableDeclaration(
	    'var',
	    [b.variableDeclarator(b.identifier(name), init)]
	  ), loc);
	};

	Ep.getProperty = function(obj, prop, computed, loc) {
	  return withLoc(b.memberExpression(
	    typeof obj === 'string' ? b.identifier(obj) : obj,
	    typeof prop === 'string' ? b.identifier(prop) : prop,
	    !!computed
	  ), loc);
	};

	Ep.vmProperty = function(name, loc) {
	  var node = b.memberExpression(
	    b.identifier('VM'),
	    b.identifier(name),
	    false
	  );
	  node.loc = loc;
	  return node;
	};

	Ep.clearPendingException = function(assignee, loc) {
	  var cp = this.vmProperty("error");

	  if(assignee) {
	    this.emitAssign(assignee, cp, loc);
	  }

	  this.emitAssign(cp, b.literal(null));
	};

	// Emits code for an unconditional jump to the given location, even if the
	// exact value of the location is not yet known.
	Ep.jump = function(toLoc) {
	  this.emitAssign(b.identifier('$__next'), toLoc);
	  this.emit(b.breakStatement(), true);
	};

	// Conditional jump.
	Ep.jumpIf = function(test, toLoc, srcLoc) {
	  n.Expression.assert(test);
	  n.Literal.assert(toLoc);

	  this.emit(withLoc(b.ifStatement(
	    test,
	    b.blockStatement([
	      this.assign(b.identifier('$__next'), toLoc),
	      b.breakStatement()
	    ])
	  ), srcLoc));
	};

	// Conditional jump, with the condition negated.
	Ep.jumpIfNot = function(test, toLoc, srcLoc) {
	  n.Expression.assert(test);
	  n.Literal.assert(toLoc);

	  this.emit(withLoc(b.ifStatement(
	    b.unaryExpression("!", test),
	    b.blockStatement([
	      this.assign(b.identifier('$__next'), toLoc),
	      b.breakStatement()
	    ])
	  ), srcLoc));
	};

	// Make temporary ids. They should be released when not needed anymore
	// so that we can generate as few of them as possible.
	Ep.getTempVar = function() {
	  this.tmpId++;
	  if(this.tmpId > this.maxTmpId) {
	    this.maxTmpId = this.tmpId;
	  }
	  return b.identifier("$__t" + this.tmpId);
	};

	Ep.currentTempId = function() {
	  return this.tmpId;
	};

	Ep.releaseTempVar = function() {
	  this.tmpId--;
	};

	Ep.numTempVars = function() {
	  return this.maxTmpId;
	};

	Ep.withTempVars = function(cb) {
	  // var prevId = this.tmpId;
	  var res = cb();
	  // this.tmpId = prevId;
	  return res;
	};

	Ep.getMachine = function(funcName, varNames) {
	  return this.getDispatchLoop(funcName, varNames);
	};

	Ep.resolveEmptyJumps = function() {
	  var self = this;
	  var forwards = {};

	  // TODO: this is actually broken now since we removed the $ctx
	  // variable
	  self.listing.forEach(function(stmt, i) {
	    if(self.marked.hasOwnProperty(i) &&
	       self.marked.hasOwnProperty(i + 2) &&
	       (n.ReturnStatement.check(self.listing[i + 1]) ||
	        n.BreakStatement.check(self.listing[i + 1])) &&
	       n.ExpressionStatement.check(stmt) &&
	       n.AssignmentExpression.check(stmt.expression) &&
	       n.MemberExpression.check(stmt.expression.left) &&
	       stmt.expression.left.object.name == '$ctx' &&
	       stmt.expression.left.property.name == '$__next') {

	      forwards[i] = stmt.expression.right;
	      // TODO: actually remove these cases from the output
	    }
	  });

	  types.traverse(self.listing, function(node) {
	    if(n.Literal.check(node) &&
	       node._location &&
	       forwards.hasOwnProperty(node.value)) {
	      this.replace(forwards[node.value]);
	    }
	  });
	};

	// Turns this.listing into a loop of the form
	//
	//   while (1) switch (context.next) {
	//   case 0:
	//   ...
	//   case n:
	//     return context.stop();
	//   }
	//
	// Each marked location in this.listing will correspond to one generated
	// case statement.
	Ep.getDispatchLoop = function(funcName, varNames) {
	  var self = this;

	  // If we encounter a break, continue, or return statement in a switch
	  // case, we can skip the rest of the statements until the next case.
	  var alreadyEnded = false, current, cases = [];

	  // If a case statement will just forward to another location, make
	  // the original loc jump straight to it
	  self.resolveEmptyJumps();

	  self.listing.forEach(function(stmt, i) {
	    if (self.marked.hasOwnProperty(i)) {
	      cases.push(b.switchCase(
	        b.literal(i),
	        current = []));
	      alreadyEnded = false;
	    }

	    if (!alreadyEnded) {
	      current.push(stmt);
	      if (isSwitchCaseEnder(stmt))
	        alreadyEnded = true;
	    }
	  });

	  // Now that we know how many statements there will be in this.listing,
	  // we can finally resolve this.finalLoc.value.
	  this.finalLoc.value = this.listing.length;
	  this.debugInfo.addFinalLocation(this.debugId, this.finalLoc.value);
	  this.debugInfo.addStepIds(this.debugId, this.marked.reduce((acc, val, i) => {
	    if(val) {
	      acc.push(i);
	    }
	    return acc;
	  }, []));;

	  cases.push.apply(cases, [
	    b.switchCase(null, []),
	    b.switchCase(this.finalLoc, [
	      b.returnStatement(null)
	    ])
	  ]);

	  // add an "eval" location
	  cases.push(
	    b.switchCase(b.literal(-1), [
	      self.assign(
	        self.vmProperty('evalResult'),
	        b.callExpression(
	          b.identifier('eval'),
	          [self.vmProperty('evalArg')]
	        )
	      ),
	      b.throwStatement(
	        b.newExpression(b.identifier('$ContinuationExc'), [])
	      )
	    ])
	  );

	  return [
	    // the state machine
	    b.whileStatement(
	      b.literal(1),
	      b.blockStatement([
	        b.ifStatement(
	          b.logicalExpression(
	            '&&',
	            self.vmProperty('hasBreakpoints'),
	            b.binaryExpression(
	              '!==',
	              self.getProperty(
	                self.getProperty(self.vmProperty('machineBreaks'),
	                                 b.literal(this.debugId),
	                                 true),
	                b.identifier('$__next'),
	                true
	              ),
	              // is identifier right here? it doesn't seem right
	              b.identifier('undefined')
	            )
	          ),
	          b.throwStatement(
	            b.newExpression(b.identifier('$ContinuationExc'), [])
	          )
	        ),

	        b.switchStatement(b.identifier('$__next'), cases),

	        b.ifStatement(
	          self.vmProperty('stepping'),
	          b.throwStatement(
	            b.newExpression(b.identifier('$ContinuationExc'), [])
	          )
	        )
	      ])
	    )
	  ];
	};

	// See comment above re: alreadyEnded.
	function isSwitchCaseEnder(stmt) {
	  return n.BreakStatement.check(stmt)
	    || n.ContinueStatement.check(stmt)
	    || n.ReturnStatement.check(stmt)
	    || n.ThrowStatement.check(stmt);
	}

	// an "atomic" expression is one that should execute within one step
	// of the VM
	function isAtomic(expr) {
	  return n.Literal.check(expr) ||
	    n.Identifier.check(expr) ||
	    n.ThisExpression.check(expr) ||
	    (n.MemberExpression.check(expr) &&
	     !expr.computed);
	}

	// No destructive modification of AST nodes.

	Ep.explode = function(path, ignoreResult) {
	  assert.ok(path instanceof types.NodePath);

	  var node = path.value;
	  var self = this;

	  n.Node.assert(node);

	  if (n.Statement.check(node))
	    return self.explodeStatement(path);

	  if (n.Expression.check(node))
	    return self.explodeExpression(path, ignoreResult);

	  if (n.Declaration.check(node))
	    throw getDeclError(node);

	  switch (node.type) {
	  case "Program":
	    return path.get("body").map(
	      self.explodeStatement,
	      self
	    );

	  case "VariableDeclarator":
	    throw getDeclError(node);

	    // These node types should be handled by their parent nodes
	    // (ObjectExpression, SwitchStatement, and TryStatement, respectively).
	  case "Property":
	  case "SwitchCase":
	  case "CatchClause":
	    throw new Error(
	      node.type + " nodes should be handled by their parents");

	  default:
	    throw new Error(
	      "unknown Node of type " +
	        JSON.stringify(node.type));
	  }
	};

	function getDeclError(node) {
	  return new Error(
	    "all declarations should have been transformed into " +
	      "assignments before the Exploder began its work: " +
	      JSON.stringify(node));
	}

	Ep.explodeStatement = function(path, labelId) {
	  assert.ok(path instanceof types.NodePath);

	  var stmt = path.value;
	  var self = this;

	  n.Statement.assert(stmt);

	  if (labelId) {
	    n.Identifier.assert(labelId);
	  } else {
	    labelId = null;
	  }

	  // Explode BlockStatement nodes even if they do not contain a yield,
	  // because we don't want or need the curly braces.
	  if (n.BlockStatement.check(stmt)) {
	    return path.get("body").each(
	      self.explodeStatement,
	      self
	    );
	  }

	  // if (!meta.containsLeap(stmt)) {
	  //   // Technically we should be able to avoid emitting the statement
	  //   // altogether if !meta.hasSideEffects(stmt), but that leads to
	  //   // confusing generated code (for instance, `while (true) {}` just
	  //   // disappears) and is probably a more appropriate job for a dedicated
	  //   // dead code elimination pass.
	  //   self.emit(stmt);
	  //   return;
	  // }

	  switch (stmt.type) {
	  case "ExpressionStatement":
	    self.explodeExpression(path.get("expression"), true);
	    break;

	  case "LabeledStatement":
	    self.explodeStatement(path.get("body"), stmt.label);
	    break;

	  case "WhileStatement":
	    var before = loc();
	    var after = loc();

	    self.mark(before);
	    self.jumpIfNot(self.explodeExpression(path.get("test")),
	                   after,
	                   path.get("test").node.loc);

	    self.markAndBreak();

	    self.leapManager.withEntry(
	      new leap.LoopEntry(after, before, labelId),
	      function() { self.explodeStatement(path.get("body")); }
	    );
	    self.jump(before);
	    self.mark(after);

	    break;

	  case "DoWhileStatement":
	    var first = loc();
	    var test = loc();
	    var after = loc();

	    self.mark(first);
	    self.leapManager.withEntry(
	      new leap.LoopEntry(after, test, labelId),
	      function() { self.explode(path.get("body")); }
	    );
	    self.mark(test);
	    self.jumpIf(self.explodeExpression(path.get("test")),
	                first,
	                path.get("test").node.loc);
	    self.emitAssign(b.identifier('$__next'), after);
	    self.emit(b.breakStatement(), true);
	    self.mark(after);

	    break;

	  case "ForStatement":
	    var head = loc();
	    var update = loc();
	    var after = loc();

	    if (stmt.init) {
	      // We pass true here to indicate that if stmt.init is an expression
	      // then we do not care about its result.
	      self.explode(path.get("init"), true);
	    }

	    self.mark(head);

	    if (stmt.test) {
	      self.jumpIfNot(self.explodeExpression(path.get("test")),
	                     after,
	                     path.get("test").node.loc);
	    } else {
	      // No test means continue unconditionally.
	    }

	    this.markAndBreak();

	    self.leapManager.withEntry(
	      new leap.LoopEntry(after, update, labelId),
	      function() { self.explodeStatement(path.get("body")); }
	    );

	    self.mark(update);

	    if (stmt.update) {
	      // We pass true here to indicate that if stmt.update is an
	      // expression then we do not care about its result.
	      self.explode(path.get("update"), true);
	    }

	    self.jump(head);

	    self.mark(after);

	    break;

	  case "ForInStatement":
	    n.Identifier.assert(stmt.left);

	    var head = loc();
	    var after = loc();

	    var keys = self.emitAssign(
	      self.getTempVar(),
	      b.callExpression(
	        self.vmProperty("keys"),
	        [self.explodeExpression(path.get("right"))]
	      ),
	      path.get("right").node.loc
	    );

	    var tmpLoc = loc();
	    self.mark(tmpLoc);

	    self.mark(head);

	    self.jumpIfNot(
	      b.memberExpression(
	        keys,
	        b.identifier("length"),
	        false
	      ),
	      after,
	      stmt.right.loc
	    );

	    self.emitAssign(
	      stmt.left,
	      b.callExpression(
	        b.memberExpression(
	          keys,
	          b.identifier("pop"),
	          false
	        ),
	        []
	      ),
	      stmt.left.loc
	    );

	    self.markAndBreak();

	    self.leapManager.withEntry(
	      new leap.LoopEntry(after, head, labelId),
	      function() { self.explodeStatement(path.get("body")); }
	    );

	    self.jump(head);

	    self.mark(after);
	    self.releaseTempVar();

	    break;

	  case "BreakStatement":
	    self.leapManager.emitBreak(stmt.label);
	    break;

	  case "ContinueStatement":
	    self.leapManager.emitContinue(stmt.label);
	    break;

	  case "SwitchStatement":
	    // Always save the discriminant into a temporary variable in case the
	    // test expressions overwrite values like context.sent.
	    var disc = self.emitAssign(
	      self.getTempVar(),
	      self.explodeExpression(path.get("discriminant"))
	    );

	    var after = loc();
	    var defaultLoc = loc();
	    var condition = defaultLoc;
	    var caseLocs = [];

	    // If there are no cases, .cases might be undefined.
	    var cases = stmt.cases || [];

	    for (var i = cases.length - 1; i >= 0; --i) {
	      var c = cases[i];
	      n.SwitchCase.assert(c);

	      if (c.test) {
	        condition = b.conditionalExpression(
	          b.binaryExpression("===", disc, c.test),
	          caseLocs[i] = loc(),
	          condition
	        );
	      } else {
	        caseLocs[i] = defaultLoc;
	      }
	    }

	    self.jump(self.explodeExpression(
	      new types.NodePath(condition, path, "discriminant")
	    ));

	    self.leapManager.withEntry(
	      new leap.SwitchEntry(after),
	      function() {
	        path.get("cases").each(function(casePath) {
	          var c = casePath.value;
	          var i = casePath.name;

	          self.mark(caseLocs[i]);

	          casePath.get("consequent").each(
	            self.explodeStatement,
	            self
	          );
	        });
	      }
	    );

	    self.releaseTempVar();
	    self.mark(after);
	    if (defaultLoc.value === -1) {
	      self.mark(defaultLoc);
	      assert.strictEqual(after.value, defaultLoc.value);
	    }

	    break;

	  case "IfStatement":
	    var elseLoc = stmt.alternate && loc();
	    var after = loc();

	    self.jumpIfNot(
	      self.explodeExpression(path.get("test")),
	      elseLoc || after,
	      path.get("test").node.loc
	    );

	    self.markAndBreak();

	    self.explodeStatement(path.get("consequent"));

	    if (elseLoc) {
	      self.jump(after);
	      self.mark(elseLoc);
	      self.explodeStatement(path.get("alternate"));
	    }

	    self.mark(after);

	    break;

	  case "ReturnStatement":
	    var arg = path.get('argument');

	    var tmp = self.getTempVar();
	      var after = loc();
	    self.emitAssign(b.identifier('$__next'), after, arg.node.loc);
	    self.emitAssign(
	      tmp,
	      this.explodeExpression(arg)
	    );
	    // TODO: breaking here allowing stepping to stop on return.
	    // Not sure if that's desirable or not.
	    // self.emit(b.breakStatement(), true);
	    self.mark(after);
	    self.releaseTempVar();

	    self.emit(withLoc(b.returnStatement(tmp), path.node.loc));
	    break;

	  case "WithStatement":
	    throw new Error(
	      node.type + " not supported in generator functions.");

	  case "TryStatement":
	    var after = loc();

	    var handler = stmt.handler;
	    if (!handler && stmt.handlers) {
	      handler = stmt.handlers[0] || null;
	    }

	    var catchLoc = handler && loc();
	    var catchEntry = catchLoc && new leap.CatchEntry(
	      catchLoc,
	      handler.param
	    );

	    var finallyLoc = stmt.finalizer && loc();
	    var finallyEntry = finallyLoc && new leap.FinallyEntry(
	      finallyLoc,
	      self.getTempVar()
	    );

	    if (finallyEntry) {
	      // Finally blocks examine their .nextLocTempVar property to figure
	      // out where to jump next, so we must set that property to the
	      // fall-through location, by default.
	      self.emitAssign(finallyEntry.nextLocTempVar, after, path.node.loc);
	    }

	    var tryEntry = new leap.TryEntry(catchEntry, finallyEntry);

	    // Push information about this try statement so that the runtime can
	    // figure out what to do if it gets an uncaught exception.
	    self.pushTry(tryEntry, path.node.loc);
	    self.markAndBreak();

	    self.leapManager.withEntry(tryEntry, function() {
	      self.explodeStatement(path.get("block"));

	      if (catchLoc) {
	        // If execution leaves the try block normally, the associated
	        // catch block no longer applies.
	        self.popCatch(catchEntry, handler.loc);

	        if (finallyLoc) {
	          // If we have both a catch block and a finally block, then
	          // because we emit the catch block first, we need to jump over
	          // it to the finally block.
	          self.jump(finallyLoc);
	        } else {
	          // If there is no finally block, then we need to jump over the
	          // catch block to the fall-through location.
	          self.jump(after);
	        }

	        self.mark(catchLoc);

	        // On entering a catch block, we must not have exited the
	        // associated try block normally, so we won't have called
	        // context.popCatch yet.  Call it here instead.
	        self.popCatch(catchEntry, handler.loc);
	        // self.markAndBreak();

	        var bodyPath = path.get("handler", "body");
	        var safeParam = self.getTempVar();
	        self.clearPendingException(safeParam, handler.loc);
	        self.markAndBreak();

	        var catchScope = bodyPath.scope;
	        var catchParamName = handler.param.name;
	        n.CatchClause.assert(catchScope.node);
	        assert.strictEqual(catchScope.lookup(catchParamName), catchScope);

	        types.traverse(bodyPath, function(node) {
	          if (n.Identifier.check(node) &&
	              node.name === catchParamName &&
	              this.scope.lookup(catchParamName) === catchScope) {
	            this.replace(safeParam);
	            return false;
	          }
	        });

	        self.leapManager.withEntry(catchEntry, function() {
	          self.explodeStatement(bodyPath);
	        });

	        self.releaseTempVar();
	      }

	      if (finallyLoc) {
	        self.mark(finallyLoc);

	        self.popFinally(finallyEntry, stmt.finalizer.loc);
	        self.markAndBreak();

	        self.leapManager.withEntry(finallyEntry, function() {
	          self.explodeStatement(path.get("finalizer"));
	        });

	        self.jump(finallyEntry.nextLocTempVar);
	        self.releaseTempVar();
	      }
	    });

	    self.mark(after);

	    break;

	  case "ThrowStatement":
	    self.emit(withLoc(b.throwStatement(
	      self.explodeExpression(path.get("argument"))
	    ), path.node.loc));

	    break;

	  case "DebuggerStatement":
	    // breakpoint, stop execute
	    var after = loc();
	    self.emit(makeSetBreakpointAST(b.literal(this.debugId), after), true);
	    self.emitAssign(b.identifier('$__next'), after);
	    self.emit(b.breakStatement(), true);
	    self.mark(after);

	    // after breakpoint, before next expression execute
	    after = loc();
	    self.emitAssign(b.identifier('$__next'), after, path.node.loc);
	    self.emit(b.breakStatement(), true);
	    self.mark(after);
	    break;

	  default:
	    throw new Error(
	      "unknown Statement of type " +
	        JSON.stringify(stmt.type));
	  }
	};

	// Emit a runtime call to context.pushTry(catchLoc, finallyLoc) so that
	// the runtime wrapper can dispatch uncaught exceptions appropriately.
	Ep.pushTry = function(tryEntry, loc) {
	  assert.ok(tryEntry instanceof leap.TryEntry);

	  var nil = b.literal(null);
	  var catchEntry = tryEntry.catchEntry;
	  var finallyEntry = tryEntry.finallyEntry;
	  var method = this.vmProperty("pushTry");
	  var args = [
	    b.identifier('tryStack'),
	    catchEntry && catchEntry.firstLoc || nil,
	    finallyEntry && finallyEntry.firstLoc || nil,
	    finallyEntry && b.literal(
	      parseInt(finallyEntry.nextLocTempVar.name.replace('$__t', ''))
	    ) || nil
	  ];

	  this.emit(withLoc(b.callExpression(method, args), loc));
	};

	// Emit a runtime call to context.popCatch(catchLoc) so that the runtime
	// wrapper knows when a catch block reported to pushTry no longer applies.
	Ep.popCatch = function(catchEntry, loc) {
	  var catchLoc;

	  if (catchEntry) {
	    assert.ok(catchEntry instanceof leap.CatchEntry);
	    catchLoc = catchEntry.firstLoc;
	  } else {
	    assert.strictEqual(catchEntry, null);
	    catchLoc = b.literal(null);
	  }

	  // TODO Think about not emitting anything when catchEntry === null.  For
	  // now, emitting context.popCatch(null) is good for sanity checking.

	  this.emit(withLoc(b.callExpression(
	    this.vmProperty("popCatch"),
	    [b.identifier('tryStack'), catchLoc]
	  ), loc));
	};

	// Emit a runtime call to context.popFinally(finallyLoc) so that the
	// runtime wrapper knows when a finally block reported to pushTry no
	// longer applies.
	Ep.popFinally = function(finallyEntry, loc) {
	  var finallyLoc;

	  if (finallyEntry) {
	    assert.ok(finallyEntry instanceof leap.FinallyEntry);
	    finallyLoc = finallyEntry.firstLoc;
	  } else {
	    assert.strictEqual(finallyEntry, null);
	    finallyLoc = b.literal(null);
	  }

	  // TODO Think about not emitting anything when finallyEntry === null.
	  // For now, emitting context.popFinally(null) is good for sanity
	  // checking.

	  this.emit(withLoc(b.callExpression(
	    this.vmProperty("popFinally"),
	    [b.identifier('tryStack'), finallyLoc]
	  ), loc));
	};

	Ep.explodeExpression = function(path, ignoreResult) {
	  assert.ok(path instanceof types.NodePath);

	  var expr = path.value;
	  if (expr) {
	    n.Expression.assert(expr);
	  } else {
	    return expr;
	  }

	  var self = this;
	  var result; // Used optionally by several cases below.

	  function includeCallExpr(expr) {
	    return expr.callee
	      || (expr.right && expr.right.callee);
	  }

	  function finish(expr) {
	    expr.callee || expr.type === "NewExpression"
	    n.Expression.assert(expr);
	    if (ignoreResult) {
	      var after = loc();
	      if (includeCallExpr(expr)) {
	        self.emitAssign(b.identifier('$__next'), after);
	        self.emit(expr);
	      } else {
	        self.emit(expr);
	        self.emitAssign(b.identifier('$__next'), after);
	      }
	      self.emit(b.breakStatement(), true);
	      self.mark(after);
	    } else {
	      return expr;
	    }
	  }

	  // If the expression does not contain a leap, then we either emit the
	  // expression as a standalone statement or return it whole.
	  // if (!meta.containsLeap(expr)) {
	  //   return finish(expr);
	  // }

	  // If any child contains a leap (such as a yield or labeled continue or
	  // break statement), then any sibling subexpressions will almost
	  // certainly have to be exploded in order to maintain the order of their
	  // side effects relative to the leaping child(ren).
	  // var hasLeapingChildren = meta.containsLeap.onlyChildren(expr);

	  // In order to save the rest of explodeExpression from a combinatorial
	  // trainwreck of special cases, explodeViaTempVar is responsible for
	  // deciding when a subexpression needs to be "exploded," which is my
	  // very technical term for emitting the subexpression as an assignment
	  // to a temporary variable and the substituting the temporary variable
	  // for the original subexpression. Think of exploded view diagrams, not
	  // Michael Bay movies. The point of exploding subexpressions is to
	  // control the precise order in which the generated code realizes the
	  // side effects of those subexpressions.
	  function explodeViaTempVar(tempVar, childPath, ignoreChildResult, keepTempVar) {
	    assert.ok(childPath instanceof types.NodePath);
	    assert.ok(
	      !ignoreChildResult || !tempVar,
	      "Ignoring the result of a child expression but forcing it to " +
	        "be assigned to a temporary variable?"
	    );

	    if(isAtomic(childPath.node)) {
	      // we still explode it because only the top-level expression is
	      // atomic, sub-expressions may not be
	      return self.explodeExpression(childPath, ignoreChildResult);
	    }
	    else if (!ignoreChildResult) {
	      var shouldRelease = !tempVar && !keepTempVar;
	      tempVar = tempVar || self.getTempVar();
	      var result = self.explodeExpression(childPath, ignoreChildResult);

	      // always mark!
	      result = self.emitAssign(
	        tempVar,
	        result,
	        childPath.node.loc
	      );

	      self.markAndBreak();

	      if(shouldRelease) {
	        self.releaseTempVar();
	      }
	    }
	    return result;
	  }

	  // If ignoreResult is true, then we must take full responsibility for
	  // emitting the expression with all its side effects, and we should not
	  // return a result.

	  switch (expr.type) {
	  case "MemberExpression":
	    return finish(withLoc(b.memberExpression(
	      self.explodeExpression(path.get("object")),
	      expr.computed
	        ? explodeViaTempVar(null, path.get("property"), false, true)
	        : expr.property,
	      expr.computed
	    ), path.node.loc));

	  case "CallExpression":
	    var oldCalleePath = path.get("callee");
	    var callArgs = path.get("arguments");

	    if(oldCalleePath.node.type === "Identifier" &&
	       oldCalleePath.node.name === "callCC") {
	      callArgs = [new types.NodePath(
	        withLoc(b.callExpression(
	          b.memberExpression(b.identifier("VM"),
	                             b.identifier("callCC"),
	                             false),
	          []
	        ), oldCalleePath.node.loc)
	      )];
	      oldCalleePath = path.get("arguments").get(0);
	    }

	    var newCallee = self.explodeExpression(oldCalleePath);

	    var r = self.withTempVars(function() {
	      var after = loc();
	      var args = callArgs.map(function(argPath) {
	        return explodeViaTempVar(null, argPath, false, true);
	      });
	      var tmp = self.getTempVar();
	      var callee = newCallee;

	      self.emitAssign(b.identifier('$__next'), after, path.node.loc);
	      self.emitAssign(b.identifier('$__tmpid'), b.literal(self.currentTempId()));
	      self.emitAssign(tmp, b.callExpression(callee, args));

	      self.emit(b.breakStatement(), true);
	      self.mark(after);

	      return tmp;
	    });

	    return r;

	  case "NewExpression":
	    // TODO: this should be the last major expression type I need to
	    // fix up to be able to trace/step through. can't call native new
	    return self.withTempVars(function() {
	      return finish(withLoc(b.newExpression(
	        explodeViaTempVar(null, path.get("callee"), false, true),
	        path.get("arguments").map(function(argPath) {
	          return explodeViaTempVar(null, argPath, false, true);
	        })
	      ), path.node.loc));
	    });

	  case "ObjectExpression":
	    return self.withTempVars(function() {
	      return finish(b.objectExpression(
	        path.get("properties").map(function(propPath) {
	          return b.property(
	            propPath.value.kind,
	            propPath.value.key,
	            explodeViaTempVar(null, propPath.get("value"), false, true)
	          );
	        })
	      ));
	    });

	  case "ArrayExpression":
	    return self.withTempVars(function() {
	      return finish(b.arrayExpression(
	        path.get("elements").map(function(elemPath) {
	          return explodeViaTempVar(null, elemPath, false, true);
	        })
	      ));
	    });

	  case "SequenceExpression":
	    var lastIndex = expr.expressions.length - 1;

	    path.get("expressions").each(function(exprPath) {
	      if (exprPath.name === lastIndex) {
	        result = self.explodeExpression(exprPath, ignoreResult);
	      } else {
	        self.explodeExpression(exprPath, true);
	      }
	    });

	    return result;

	  case "LogicalExpression":
	    var after = loc();

	    self.withTempVars(function() {
	      if (!ignoreResult) {
	        result = self.getTempVar();
	      }

	      var left = explodeViaTempVar(result, path.get("left"), false, true);

	      if (expr.operator === "&&") {
	        self.jumpIfNot(left, after, path.get("left").node.loc);
	      } else if (expr.operator === "||") {
	        self.jumpIf(left, after, path.get("left").node.loc);
	      }

	      explodeViaTempVar(result, path.get("right"), ignoreResult, true);

	      self.mark(after);
	    });

	    return result;

	  case "ConditionalExpression":
	    var elseLoc = loc();
	    var after = loc();
	    var test = self.explodeExpression(path.get("test"));

	    self.jumpIfNot(test, elseLoc, path.get("test").node.loc);

	    if (!ignoreResult) {
	      result = self.getTempVar();
	    }

	    explodeViaTempVar(result, path.get("consequent"), ignoreResult);
	    self.jump(after);

	    self.mark(elseLoc);
	    explodeViaTempVar(result, path.get("alternate"), ignoreResult);

	    self.mark(after);

	    if(!ignoreResult) {
	      self.releaseTempVar();
	    }

	    return result;

	  case "UnaryExpression":
	    return finish(withLoc(b.unaryExpression(
	      expr.operator,
	      // Can't (and don't need to) break up the syntax of the argument.
	      // Think about delete a[b].
	      self.explodeExpression(path.get("argument")),
	      !!expr.prefix
	    ), path.node.loc));

	  case "BinaryExpression":
	    return self.withTempVars(function() {
	      return finish(withLoc(b.binaryExpression(
	        expr.operator,
	        explodeViaTempVar(null, path.get("left"), false, true),
	        explodeViaTempVar(null, path.get("right"), false, true)
	      ), path.node.loc));
	    });

	  case "AssignmentExpression":
	    return finish(withLoc(b.assignmentExpression(
	      expr.operator,
	      self.explodeExpression(path.get("left")),
	      self.explodeExpression(path.get("right"))
	    ), path.node.loc));

	  case "UpdateExpression":
	    return finish(withLoc(b.updateExpression(
	      expr.operator,
	      self.explodeExpression(path.get("argument")),
	      expr.prefix
	    ), path.node.loc));

	  // case "YieldExpression":
	  //   var after = loc();
	  //   var arg = expr.argument && self.explodeExpression(path.get("argument"));

	  //   if (arg && expr.delegate) {
	  //     var result = self.getTempVar();

	  //     self.emit(b.returnStatement(b.callExpression(
	  //       self.contextProperty("delegateYield"), [
	  //         arg,
	  //         b.literal(result.property.name),
	  //         after
	  //       ]
	  //     )));

	  //     self.mark(after);

	  //     return result;
	  //   }

	    // self.emitAssign(b.identifier('$__next'), after);
	    // self.emit(b.returnStatement(arg || null));
	    // self.mark(after);

	    // return self.contextProperty("sent");

	  case "Identifier":
	  case "FunctionExpression":
	  case "ArrowFunctionExpression":
	  case "ThisExpression":
	  case "Literal":
	    return finish(expr);
	    break;

	  default:
	    throw new Error(
	      "unknown Expression of type " +
	        JSON.stringify(expr.type));
	  }
	};


/***/ },
/* 26 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(process) {var types = __webpack_require__(27);
	var parse = __webpack_require__(28).parse;
	var Printer = __webpack_require__(46).Printer;

	function print(node, options) {
	    return new Printer(options).print(node);
	}

	function prettyPrint(node, options) {
	    return new Printer(options).printGenerically(node);
	}

	function run(transformer, options) {
	    return runFile(process.argv[2], transformer, options);
	}

	// function runFile(path, transformer, options) {
	//     require("fs").readFile(path, "utf-8", function(err, code) {
	//         if (err) {
	//             console.error(err);
	//             return;
	//         }

	//         runString(code, transformer, options);
	//     });
	// }

	function defaultWriteback(output) {
	    process.stdout.write(output);
	}

	function runString(code, transformer, options) {
	    var writeback = options && options.writeback || defaultWriteback;
	    transformer(parse(code, options), function(node) {
	        writeback(print(node, options).code);
	    });
	}

	Object.defineProperties(exports, {
	    /**
	     * Parse a string of code into an augmented syntax tree suitable for
	     * arbitrary modification and reprinting.
	     */
	    parse: {
	        enumerable: true,
	        value: parse
	    },

	    /**
	     * Reprint a modified syntax tree using as much of the original source
	     * code as possible.
	     */
	    print: {
	        enumerable: true,
	        value: print
	    },

	    /**
	     * Print without attempting to reuse any original source code.
	     */
	    prettyPrint: {
	        enumerable: true,
	        value: prettyPrint
	    },

	    /**
	     * Customized version of require("ast-types").
	     */
	    types: {
	        enumerable: true,
	        value: types
	    },

	    /**
	     * Convenient command-line interface (see e.g. example/add-braces).
	     */
	    run: {
	        enumerable: true,
	        value: run
	    },

	    /**
	     * Useful utilities for implementing transformer functions.
	     */
	    Syntax: {
	        enumerable: false,
	        value: (function() {
	            var def = types.Type.def;
	            var Syntax = {};

	            Object.keys(types.namedTypes).forEach(function(name) {
	                if (def(name).buildable)
	                    Syntax[name] = name;
	            });

	            // These two types are buildable but do not technically count
	            // as syntax because they are not printable.
	            delete Syntax.SourceLocation;
	            delete Syntax.Position;

	            return Syntax;
	        })()
	    },

	    Visitor: {
	        enumerable: false,
	        value: __webpack_require__(47).Visitor
	    }
	});

	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(2)))

/***/ },
/* 27 */
/***/ function(module, exports, __webpack_require__) {

	var types = __webpack_require__(9);
	var def = types.Type.def;

	def("File")
	    .bases("Node")
	    .build("program")
	    .field("program", def("Program"));

	types.finalize();

	module.exports = types;


/***/ },
/* 28 */
/***/ function(module, exports, __webpack_require__) {

	var assert = __webpack_require__(4);
	var types = __webpack_require__(27);
	var n = types.namedTypes;
	var b = types.builders;
	var isObject = types.builtInTypes.object;
	var isArray = types.builtInTypes.array;
	var isFunction = types.builtInTypes.function;
	var Patcher = __webpack_require__(29).Patcher;
	var normalizeOptions = __webpack_require__(40).normalize;
	var hasOwn = Object.prototype.hasOwnProperty;

	exports.parse = function(source, options) {
	    options = normalizeOptions(options);

	    var lines = __webpack_require__(30).fromString(source, options);

	    var pure = options.esprima.parse(lines.toString({
	        tabWidth: options.tabWidth,
	        reuseWhitespace: false,
	        useTabs: false
	    }), {
	        loc: true,
	        range: options.range,
	        comment: true,
	        tolerant: options.tolerant
	    });

	    new LocationFixer(lines).fix(pure);

	    __webpack_require__(45).add(pure, lines);

	    // In order to ensure we reprint leading and trailing program
	    // comments, wrap the original Program node with a File node.
	    pure = b.file(pure);
	    pure.loc = {
	        lines: lines,
	        indent: 0,
	        start: lines.firstPos(),
	        end: lines.lastPos()
	    };

	    // Return a copy of the original AST so that any changes made may be
	    // compared to the original.
	    return copyAst(pure);
	};

	function LocationFixer(lines) {
	    assert.ok(this instanceof LocationFixer);
	    this.lines = lines;
	    this.indent = 0;
	}

	var LFp = LocationFixer.prototype;

	LFp.fix = function(node) {
	    if (isArray.check(node)) {
	        node.forEach(this.fix, this);
	        return;
	    }

	    if (!isObject.check(node)) {
	        return;
	    }

	    var lines = this.lines;
	    var loc = node && node.loc;
	    var start = loc && loc.start;
	    var end = loc && loc.end;
	    var oldIndent = this.indent;
	    var newIndent = oldIndent;

	    if (start) {
	        start.line = Math.max(start.line, 1);

	        if (lines.isPrecededOnlyByWhitespace(start)) {
	            // The indent returned by lines.getIndentAt is the column of
	            // the first non-space character in the line, but start.column
	            // may fall before that character, as when a file begins with
	            // whitespace but its start.column nevertheless must be 0.
	            assert.ok(start.column <= lines.getIndentAt(start.line));
	            newIndent = this.indent = start.column;
	        }
	    }

	    var names = types.getFieldNames(node);
	    for (var i = 0, len = names.length; i < len; ++i) {
	        this.fix(node[names[i]]);
	    }

	    // Restore original value of this.indent after the recursive call.
	    this.indent = oldIndent;

	    if (loc) {
	        loc.lines = lines;
	        loc.indent = newIndent;
	    }

	    if (end) {
	        end.line = Math.max(end.line, 1);

	        var pos = {
	            line: end.line,
	            column: end.column
	        };

	        // Negative columns might indicate an Esprima bug?
	        // For now, treat them as reverse indices, a la Python.
	        if (pos.column < 0)
	            pos.column += lines.getLineLength(pos.line);

	        while (lines.prevPos(pos)) {
	            if (/\S/.test(lines.charAt(pos))) {
	                assert.ok(lines.nextPos(pos));

	                end.line = pos.line;
	                end.column = pos.column;

	                break;
	            }
	        }
	    }

	    if (n.Property.check(node) && (node.method || node.shorthand)) {
	        // If the Property is a .method or .shorthand property, then the
	        // location information stored in node.value.loc is very likely
	        // untrustworthy (just the {body} part of a method, or nothing in
	        // the case of shorthand properties), so we null out that
	        // information to prevent accidental reuse of bogus source code
	        // during reprinting.
	        node.value.loc = null;
	    }
	};

	function copyAst(node) {
	    if (typeof node !== "object") {
	        return node;
	    }

	    if (isObject.check(node)) {
	        var copy = Object.create(Object.getPrototypeOf(node), {
	            original: { // Provide a link from the copy to the original.
	                value: node,
	                configurable: false,
	                enumerable: false,
	                writable: true
	            }
	        });

	        for (var key in node) {
	            var val = node[key];
	            if (val && key === "loc") {
	                copy.loc = {
	                    start: { line: val.start.line, column: val.start.column },
	                    end: { line: val.end.line, column: val.end.column }
	                };
	            } else if (hasOwn.call(node, key)) {
	                copy[key] = copyAst(val);
	            }
	        }

	        return copy;
	    }

	    if (isArray.check(node)) {
	        return node.map(copyAst);
	    }

	    return node;
	}


/***/ },
/* 29 */
/***/ function(module, exports, __webpack_require__) {

	var assert = __webpack_require__(4);
	var linesModule = __webpack_require__(30);
	var types = __webpack_require__(27);
	var getFieldValue = types.getFieldValue;
	var Node = types.namedTypes.Node;
	var Expression = types.namedTypes.Expression;
	var util = __webpack_require__(43);
	var comparePos = util.comparePos;
	var NodePath = types.NodePath;
	var isObject = types.builtInTypes.object;
	var isArray = types.builtInTypes.array;
	var isString = types.builtInTypes.string;

	function Patcher(lines) {
	    assert.ok(this instanceof Patcher);
	    assert.ok(lines instanceof linesModule.Lines);

	    var self = this,
	        replacements = [];

	    self.replace = function(loc, lines) {
	        if (isString.check(lines))
	            lines = linesModule.fromString(lines);

	        replacements.push({
	            lines: lines,
	            start: loc.start,
	            end: loc.end
	        });
	    };

	    self.get = function(loc) {
	        // If no location is provided, return the complete Lines object.
	        loc = loc || {
	            start: { line: 1, column: 0 },
	            end: { line: lines.length,
	                   column: lines.getLineLength(lines.length) }
	        };

	        var sliceFrom = loc.start,
	            toConcat = [];

	        function pushSlice(from, to) {
	            assert.ok(comparePos(from, to) <= 0);
	            toConcat.push(lines.slice(from, to));
	        }

	        replacements.sort(function(a, b) {
	            return comparePos(a.start, b.start);
	        }).forEach(function(rep) {
	            if (comparePos(sliceFrom, rep.start) > 0) {
	                // Ignore nested replacement ranges.
	            } else {
	                pushSlice(sliceFrom, rep.start);
	                toConcat.push(rep.lines);
	                sliceFrom = rep.end;
	            }
	        });

	        pushSlice(sliceFrom, loc.end);

	        return linesModule.concat(toConcat);
	    };
	}
	exports.Patcher = Patcher;

	exports.getReprinter = function(path) {
	    assert.ok(path instanceof NodePath);

	    // Make sure that this path refers specifically to a Node, rather than
	    // some non-Node subproperty of a Node.
	    if (path.node !== path.value)
	        return;

	    var orig = path.node.original;
	    var origLoc = orig && orig.loc;
	    var lines = origLoc && origLoc.lines;
	    var reprints = [];

	    if (!lines || !findReprints(path, reprints))
	        return;

	    return function(print) {
	        var patcher = new Patcher(lines);

	        reprints.forEach(function(reprint) {
	            var old = reprint.oldPath.value;
	            patcher.replace(
	                old.loc,
	                print(reprint.newPath).indentTail(old.loc.indent)
	            );
	        });

	        return patcher.get(origLoc).indentTail(-orig.loc.indent);
	    };
	};

	function findReprints(newPath, reprints) {
	    var newNode = newPath.node;
	    Node.assert(newNode);

	    var oldNode = newNode.original;
	    Node.assert(oldNode);

	    assert.deepEqual(reprints, []);

	    if (newNode.type !== oldNode.type) {
	        return false;
	    }

	    var oldPath = new NodePath(oldNode);
	    var canReprint = findChildReprints(newPath, oldPath, reprints);

	    if (!canReprint) {
	        // Make absolutely sure the calling code does not attempt to reprint
	        // any nodes.
	        reprints.length = 0;
	    }

	    return canReprint;
	}

	function findAnyReprints(newPath, oldPath, reprints) {
	    var newNode = newPath.value;
	    var oldNode = oldPath.value;

	    if (newNode === oldNode)
	        return true;

	    if (isArray.check(newNode))
	        return findArrayReprints(newPath, oldPath, reprints);

	    if (isObject.check(newNode))
	        return findObjectReprints(newPath, oldPath, reprints);

	    return false;
	}

	function findArrayReprints(newPath, oldPath, reprints) {
	    var newNode = newPath.value;
	    var oldNode = oldPath.value;
	    isArray.assert(newNode);
	    var len = newNode.length;

	    if (!(isArray.check(oldNode) &&
	          oldNode.length === len))
	        return false;

	    for (var i = 0; i < len; ++i)
	        if (!findAnyReprints(newPath.get(i), oldPath.get(i), reprints))
	            return false;

	    return true;
	}

	function findObjectReprints(newPath, oldPath, reprints) {
	    var newNode = newPath.value;
	    isObject.assert(newNode);

	    var oldNode = oldPath.value;
	    if (!isObject.check(oldNode))
	        return false;

	    if (Node.check(newNode)) {
	        if (!Node.check(oldNode)) {
	            return false;
	        }

	        // Here we need to decide whether the reprinted code for newNode
	        // is appropriate for patching into the location of oldNode.

	        if (newNode.type === oldNode.type) {
	            var childReprints = [];

	            if (findChildReprints(newPath, oldPath, childReprints)) {
	                reprints.push.apply(reprints, childReprints);
	            } else {
	                reprints.push({
	                    newPath: newPath,
	                    oldPath: oldPath
	                });
	            }

	            return true;
	        }

	        if (Expression.check(newNode) &&
	            Expression.check(oldNode)) {

	            // If both nodes are subtypes of Expression, then we should be
	            // able to fill the location occupied by the old node with
	            // code printed for the new node with no ill consequences.
	            reprints.push({
	                newPath: newPath,
	                oldPath: oldPath
	            });

	            return true;
	        }

	        // The nodes have different types, and at least one of the types
	        // is not a subtype of the Expression type, so we cannot safely
	        // assume the nodes are syntactically interchangeable.
	        return false;
	    }

	    return findChildReprints(newPath, oldPath, reprints);
	}

	function hasOpeningParen(oldPath) {
	    assert.ok(oldPath instanceof NodePath);
	    var oldNode = oldPath.value;
	    var loc = oldNode.loc;
	    var lines = loc && loc.lines;

	    if (lines) {
	        var pos = lines.skipSpaces(loc.start, true);
	        if (pos && lines.prevPos(pos) && lines.charAt(pos) === "(") {
	            var rootPath = oldPath;
	            while (rootPath.parent)
	                rootPath = rootPath.parent;
	            // If we found an opening parenthesis but it occurred before
	            // the start of the original subtree for this reprinting, then
	            // we must not return true for hasOpeningParen(oldPath).
	            return comparePos(rootPath.value.loc.start, pos) <= 0;
	        }
	    }

	    return false;
	}

	function hasClosingParen(oldPath) {
	    assert.ok(oldPath instanceof NodePath);
	    var oldNode = oldPath.value;
	    var loc = oldNode.loc;
	    var lines = loc && loc.lines;

	    if (lines) {
	        var pos = lines.skipSpaces(loc.end);
	        if (pos && lines.charAt(pos) === ")") {
	            var rootPath = oldPath;
	            while (rootPath.parent)
	                rootPath = rootPath.parent;
	            // If we found a closing parenthesis but it occurred after
	            // the end of the original subtree for this reprinting, then
	            // we must not return true for hasClosingParen(oldPath).
	            return comparePos(pos, rootPath.value.loc.end) <= 0;
	        }
	    }

	    return false;
	}

	function hasParens(oldPath) {
	    // This logic can technically be fooled if the node has parentheses
	    // but there are comments intervening between the parentheses and the
	    // node. In such cases the node will be harmlessly wrapped in an
	    // additional layer of parentheses.
	    return hasOpeningParen(oldPath) && hasClosingParen(oldPath);
	}

	function findChildReprints(newPath, oldPath, reprints) {
	    var newNode = newPath.value;
	    var oldNode = oldPath.value;

	    isObject.assert(newNode);
	    isObject.assert(oldNode);

	    // If this type of node cannot come lexically first in its enclosing
	    // statement (e.g. a function expression or object literal), and it
	    // seems to be doing so, then the only way we can ignore this problem
	    // and save ourselves from falling back to the pretty printer is if an
	    // opening parenthesis happens to precede the node.  For example,
	    // (function(){ ... }()); does not need to be reprinted, even though
	    // the FunctionExpression comes lexically first in the enclosing
	    // ExpressionStatement and fails the hasParens test, because the
	    // parent CallExpression passes the hasParens test. If we relied on
	    // the path.needsParens() && !hasParens(oldNode) check below, the
	    // absence of a closing parenthesis after the FunctionExpression would
	    // trigger pretty-printing unnecessarily.
	    if (!newPath.canBeFirstInStatement() &&
	        newPath.firstInStatement() &&
	        !hasOpeningParen(oldPath))
	        return false;

	    // If this node needs parentheses and will not be wrapped with
	    // parentheses when reprinted, then return false to skip reprinting
	    // and let it be printed generically.
	    if (newPath.needsParens(true) && !hasParens(oldPath))
	        return false;

	    for (var k in util.getUnionOfKeys(newNode, oldNode)) {
	        if (k === "loc")
	            continue;

	        if (!findAnyReprints(newPath.get(k), oldPath.get(k), reprints))
	            return false;
	    }

	    return true;
	}


/***/ },
/* 30 */
/***/ function(module, exports, __webpack_require__) {

	var assert = __webpack_require__(4);
	var sourceMap = __webpack_require__(31);
	var normalizeOptions = __webpack_require__(40).normalize;
	var secretKey = __webpack_require__(42).makeUniqueKey();
	var types = __webpack_require__(27);
	var isString = types.builtInTypes.string;
	var comparePos = __webpack_require__(43).comparePos;
	var Mapping = __webpack_require__(44);

	// Goals:
	// 1. Minimize new string creation.
	// 2. Keep (de)identation O(lines) time.
	// 3. Permit negative indentations.
	// 4. Enforce immutability.
	// 5. No newline characters.

	function getSecret(lines) {
	    return lines[secretKey];
	}

	function Lines(infos, sourceFileName) {
	    assert.ok(this instanceof Lines);
	    assert.ok(infos.length > 0);

	    if (sourceFileName) {
	        isString.assert(sourceFileName);
	    } else {
	        sourceFileName = null;
	    }

	    Object.defineProperty(this, secretKey, {
	        value: {
	            infos: infos,
	            mappings: [],
	            name: sourceFileName,
	            cachedSourceMap: null
	        }
	    });

	    if (sourceFileName) {
	        getSecret(this).mappings.push(new Mapping(this, {
	            start: this.firstPos(),
	            end: this.lastPos()
	        }));
	    }
	}

	// Exposed for instanceof checks. The fromString function should be used
	// to create new Lines objects.
	exports.Lines = Lines;
	var Lp = Lines.prototype;

	// These properties used to be assigned to each new object in the Lines
	// constructor, but we can more efficiently stuff them into the secret and
	// let these lazy accessors compute their values on-the-fly.
	Object.defineProperties(Lp, {
	    length: {
	        get: function() {
	            return getSecret(this).infos.length;
	        }
	    },

	    name: {
	        get: function() {
	            return getSecret(this).name;
	        }
	    }
	});

	function copyLineInfo(info) {
	    return {
	        line: info.line,
	        indent: info.indent,
	        sliceStart: info.sliceStart,
	        sliceEnd: info.sliceEnd
	    };
	}

	var fromStringCache = {};
	var hasOwn = fromStringCache.hasOwnProperty;
	var maxCacheKeyLen = 10;

	function countSpaces(spaces, tabWidth) {
	    var count = 0;
	    var len = spaces.length;

	    for (var i = 0; i < len; ++i) {
	        var ch = spaces.charAt(i);

	        if (ch === " ") {
	            count += 1;

	        } else if (ch === "\t") {
	            assert.strictEqual(typeof tabWidth, "number");
	            assert.ok(tabWidth > 0);

	            var next = Math.ceil(count / tabWidth) * tabWidth;
	            if (next === count) {
	                count += tabWidth;
	            } else {
	                count = next;
	            }

	        } else if (ch === "\r") {
	            // Ignore carriage return characters.

	        } else {
	            assert.fail("unexpected whitespace character", ch);
	        }
	    }

	    return count;
	}
	exports.countSpaces = countSpaces;

	var leadingSpaceExp = /^\s*/;

	function fromString(string, options) {
	    if (string instanceof Lines)
	        return string;

	    string += "";

	    var tabWidth = options && options.tabWidth;
	    var tabless = string.indexOf("\t") < 0;
	    var cacheable = !options && tabless && (string.length <= maxCacheKeyLen);

	    assert.ok(tabWidth || tabless, "encountered tabs, but no tab width specified");

	    if (cacheable && hasOwn.call(fromStringCache, string))
	        return fromStringCache[string];

	    var lines = new Lines(string.split("\n").map(function(line) {
	        var spaces = leadingSpaceExp.exec(line)[0];
	        return {
	            line: line,
	            indent: countSpaces(spaces, tabWidth),
	            sliceStart: spaces.length,
	            sliceEnd: line.length
	        };
	    }), normalizeOptions(options).sourceFileName);

	    if (cacheable)
	        fromStringCache[string] = lines;

	    return lines;
	}
	exports.fromString = fromString;

	function isOnlyWhitespace(string) {
	    return !/\S/.test(string);
	}

	Lp.toString = function(options) {
	    return this.sliceString(this.firstPos(), this.lastPos(), options);
	};

	Lp.getSourceMap = function(sourceMapName, sourceRoot) {
	    if (!sourceMapName) {
	        // Although we could make up a name or generate an anonymous
	        // source map, instead we assume that any consumer who does not
	        // provide a name does not actually want a source map.
	        return null;
	    }

	    var targetLines = this;

	    function updateJSON(json) {
	        json = json || {};

	        isString.assert(sourceMapName);
	        json.file = sourceMapName;

	        if (sourceRoot) {
	            isString.assert(sourceRoot);
	            json.sourceRoot = sourceRoot;
	        }

	        return json;
	    }

	    var secret = getSecret(targetLines);
	    if (secret.cachedSourceMap) {
	        // Since Lines objects are immutable, we can reuse any source map
	        // that was previously generated. Nevertheless, we return a new
	        // JSON object here to protect the cached source map from outside
	        // modification.
	        return updateJSON(secret.cachedSourceMap.toJSON());
	    }

	    assert.ok(
	        secret.mappings.length > 0,
	        "No source mappings found. Be sure to pass { sourceFileName: " +
	            '"source.js" } to recast.parse to enable source mapping.'
	    );

	    var smg = new sourceMap.SourceMapGenerator(updateJSON());
	    var sourcesToContents = {};

	    secret.mappings.forEach(function(mapping) {
	        var sourceCursor = mapping.sourceLines.skipSpaces(
	            mapping.sourceLoc.start
	        ) || mapping.sourceLines.lastPos();

	        var targetCursor = targetLines.skipSpaces(
	            mapping.targetLoc.start
	        ) || targetLines.lastPos();

	        while (comparePos(sourceCursor, mapping.sourceLoc.end) < 0 &&
	               comparePos(targetCursor, mapping.targetLoc.end) < 0) {

	            var sourceChar = mapping.sourceLines.charAt(sourceCursor);
	            var targetChar = targetLines.charAt(targetCursor);
	            assert.strictEqual(sourceChar, targetChar);

	            var sourceName = mapping.sourceLines.name;

	            // Add mappings one character at a time for maximum resolution.
	            smg.addMapping({
	                source: sourceName,
	                original: { line: sourceCursor.line,
	                            column: sourceCursor.column },
	                generated: { line: targetCursor.line,
	                             column: targetCursor.column }
	            });

	            if (!hasOwn.call(sourcesToContents, sourceName)) {
	                var sourceContent = mapping.sourceLines.toString();
	                smg.setSourceContent(sourceName, sourceContent);
	                sourcesToContents[sourceName] = sourceContent;
	            }

	            targetLines.nextPos(targetCursor, true);
	            mapping.sourceLines.nextPos(sourceCursor, true);
	        }
	    });

	    secret.cachedSourceMap = smg;

	    return smg.toJSON();
	};

	Lp.bootstrapCharAt = function(pos) {
	    assert.strictEqual(typeof pos, "object");
	    assert.strictEqual(typeof pos.line, "number");
	    assert.strictEqual(typeof pos.column, "number");

	    var line = pos.line,
	        column = pos.column,
	        strings = this.toString().split("\n"),
	        string = strings[line - 1];

	    if (typeof string === "undefined")
	        return "";

	    if (column === string.length &&
	        line < strings.length)
	        return "\n";

	    if (column >= string.length)
	        return "";

	    return string.charAt(column);
	};

	Lp.charAt = function(pos) {
	    assert.strictEqual(typeof pos, "object");
	    assert.strictEqual(typeof pos.line, "number");
	    assert.strictEqual(typeof pos.column, "number");

	    var line = pos.line,
	        column = pos.column,
	        secret = getSecret(this),
	        infos = secret.infos,
	        info = infos[line - 1],
	        c = column;

	    if (typeof info === "undefined" || c < 0)
	        return "";

	    var indent = this.getIndentAt(line);
	    if (c < indent)
	        return " ";

	    c += info.sliceStart - indent;

	    if (c === info.sliceEnd &&
	        line < this.length)
	        return "\n";

	    if (c >= info.sliceEnd)
	        return "";

	    return info.line.charAt(c);
	};

	Lp.stripMargin = function(width, skipFirstLine) {
	    if (width === 0)
	        return this;

	    assert.ok(width > 0, "negative margin: " + width);

	    if (skipFirstLine && this.length === 1)
	        return this;

	    var secret = getSecret(this);

	    var lines = new Lines(secret.infos.map(function(info, i) {
	        if (info.line && (i > 0 || !skipFirstLine)) {
	            info = copyLineInfo(info);
	            info.indent = Math.max(0, info.indent - width);
	        }
	        return info;
	    }));

	    if (secret.mappings.length > 0) {
	        var newMappings = getSecret(lines).mappings;
	        assert.strictEqual(newMappings.length, 0);
	        secret.mappings.forEach(function(mapping) {
	            newMappings.push(mapping.indent(width, skipFirstLine, true));
	        });
	    }

	    return lines;
	};

	Lp.indent = function(by) {
	    if (by === 0)
	        return this;

	    var secret = getSecret(this);

	    var lines = new Lines(secret.infos.map(function(info) {
	        if (info.line) {
	            info = copyLineInfo(info);
	            info.indent += by;
	        }
	        return info
	    }));

	    if (secret.mappings.length > 0) {
	        var newMappings = getSecret(lines).mappings;
	        assert.strictEqual(newMappings.length, 0);
	        secret.mappings.forEach(function(mapping) {
	            newMappings.push(mapping.indent(by));
	        });
	    }

	    return lines;
	};

	Lp.indentTail = function(by) {
	    if (by === 0)
	        return this;

	    if (this.length < 2)
	        return this;

	    var secret = getSecret(this);

	    var lines = new Lines(secret.infos.map(function(info, i) {
	        if (i > 0 && info.line) {
	            info = copyLineInfo(info);
	            info.indent += by;
	        }

	        return info;
	    }));

	    if (secret.mappings.length > 0) {
	        var newMappings = getSecret(lines).mappings;
	        assert.strictEqual(newMappings.length, 0);
	        secret.mappings.forEach(function(mapping) {
	            newMappings.push(mapping.indent(by, true));
	        });
	    }

	    return lines;
	};

	Lp.getIndentAt = function(line) {
	    assert.ok(line >= 1, "no line " + line + " (line numbers start from 1)");
	    var secret = getSecret(this),
	        info = secret.infos[line - 1];
	    return Math.max(info.indent, 0);
	};

	Lp.guessTabWidth = function() {
	    var secret = getSecret(this);
	    if (hasOwn.call(secret, "cachedTabWidth")) {
	        return secret.cachedTabWidth;
	    }

	    var counts = []; // Sparse array.
	    var lastIndent = 0;

	    for (var line = 1, last = this.length; line <= last; ++line) {
	        var info = secret.infos[line - 1];
	        var sliced = info.line.slice(info.sliceStart, info.sliceEnd);

	        // Whitespace-only lines don't tell us much about the likely tab
	        // width of this code.
	        if (isOnlyWhitespace(sliced)) {
	            continue;
	        }

	        var diff = Math.abs(info.indent - lastIndent);
	        counts[diff] = ~~counts[diff] + 1;
	        lastIndent = info.indent;
	    }

	    var maxCount = -1;
	    var result = 2;

	    for (var tabWidth = 1;
	         tabWidth < counts.length;
	         tabWidth += 1) {
	        if (hasOwn.call(counts, tabWidth) &&
	            counts[tabWidth] > maxCount) {
	            maxCount = counts[tabWidth];
	            result = tabWidth;
	        }
	    }

	    return secret.cachedTabWidth = result;
	};

	Lp.isOnlyWhitespace = function() {
	    return isOnlyWhitespace(this.toString());
	};

	Lp.isPrecededOnlyByWhitespace = function(pos) {
	    return this.slice({
	        line: pos.line,
	        column: 0
	    }, pos).isOnlyWhitespace();
	};

	Lp.getLineLength = function(line) {
	    var secret = getSecret(this),
	        info = secret.infos[line - 1];
	    return this.getIndentAt(line) + info.sliceEnd - info.sliceStart;
	};

	Lp.nextPos = function(pos, skipSpaces) {
	    var l = Math.max(pos.line, 0),
	        c = Math.max(pos.column, 0);

	    if (c < this.getLineLength(l)) {
	        pos.column += 1;

	        return skipSpaces
	            ? !!this.skipSpaces(pos, false, true)
	            : true;
	    }

	    if (l < this.length) {
	        pos.line += 1;
	        pos.column = 0;

	        return skipSpaces
	            ? !!this.skipSpaces(pos, false, true)
	            : true;
	    }

	    return false;
	};

	Lp.prevPos = function(pos, skipSpaces) {
	    var l = pos.line,
	        c = pos.column;

	    if (c < 1) {
	        l -= 1;

	        if (l < 1)
	            return false;

	        c = this.getLineLength(l);

	    } else {
	        c = Math.min(c - 1, this.getLineLength(l));
	    }

	    pos.line = l;
	    pos.column = c;

	    return skipSpaces
	        ? !!this.skipSpaces(pos, true, true)
	        : true;
	};

	Lp.firstPos = function() {
	    // Trivial, but provided for completeness.
	    return { line: 1, column: 0 };
	};

	Lp.lastPos = function() {
	    return {
	        line: this.length,
	        column: this.getLineLength(this.length)
	    };
	};

	Lp.skipSpaces = function(pos, backward, modifyInPlace) {
	    if (pos) {
	        pos = modifyInPlace ? pos : {
	            line: pos.line,
	            column: pos.column
	        };
	    } else if (backward) {
	        pos = this.lastPos();
	    } else {
	        pos = this.firstPos();
	    }

	    if (backward) {
	        while (this.prevPos(pos)) {
	            if (!isOnlyWhitespace(this.charAt(pos)) &&
	                this.nextPos(pos)) {
	                return pos;
	            }
	        }

	        return null;

	    } else {
	        while (isOnlyWhitespace(this.charAt(pos))) {
	            if (!this.nextPos(pos)) {
	                return null;
	            }
	        }

	        return pos;
	    }
	};

	Lp.trimLeft = function() {
	    var pos = this.skipSpaces(this.firstPos(), false, true);
	    return pos ? this.slice(pos) : emptyLines;
	};

	Lp.trimRight = function() {
	    var pos = this.skipSpaces(this.lastPos(), true, true);
	    return pos ? this.slice(this.firstPos(), pos) : emptyLines;
	};

	Lp.trim = function() {
	    var start = this.skipSpaces(this.firstPos(), false, true);
	    if (start === null)
	        return emptyLines;

	    var end = this.skipSpaces(this.lastPos(), true, true);
	    assert.notStrictEqual(end, null);

	    return this.slice(start, end);
	};

	Lp.eachPos = function(callback, startPos, skipSpaces) {
	    var pos = this.firstPos();

	    if (startPos) {
	        pos.line = startPos.line,
	        pos.column = startPos.column
	    }

	    if (skipSpaces && !this.skipSpaces(pos, false, true)) {
	        return; // Encountered nothing but spaces.
	    }

	    do callback.call(this, pos);
	    while (this.nextPos(pos, skipSpaces));
	};

	Lp.bootstrapSlice = function(start, end) {
	    var strings = this.toString().split("\n").slice(
	            start.line - 1, end.line);

	    strings.push(strings.pop().slice(0, end.column));
	    strings[0] = strings[0].slice(start.column);

	    return fromString(strings.join("\n"));
	};

	Lp.slice = function(start, end) {
	    if (!end) {
	        if (!start) {
	            // The client seems to want a copy of this Lines object, but
	            // Lines objects are immutable, so it's perfectly adequate to
	            // return the same object.
	            return this;
	        }

	        // Slice to the end if no end position was provided.
	        end = this.lastPos();
	    }

	    var secret = getSecret(this);
	    var sliced = secret.infos.slice(start.line - 1, end.line);

	    if (start.line === end.line) {
	        sliced[0] = sliceInfo(sliced[0], start.column, end.column);
	    } else {
	        assert.ok(start.line < end.line);
	        sliced[0] = sliceInfo(sliced[0], start.column);
	        sliced.push(sliceInfo(sliced.pop(), 0, end.column));
	    }

	    var lines = new Lines(sliced);

	    if (secret.mappings.length > 0) {
	        var newMappings = getSecret(lines).mappings;
	        assert.strictEqual(newMappings.length, 0);
	        secret.mappings.forEach(function(mapping) {
	            var sliced = mapping.slice(this, start, end);
	            if (sliced) {
	                newMappings.push(sliced);
	            }
	        }, this);
	    }

	    return lines;
	};

	function sliceInfo(info, startCol, endCol) {
	    var sliceStart = info.sliceStart;
	    var sliceEnd = info.sliceEnd;
	    var indent = Math.max(info.indent, 0);
	    var lineLength = indent + sliceEnd - sliceStart;

	    if (typeof endCol === "undefined") {
	        endCol = lineLength;
	    }

	    startCol = Math.max(startCol, 0);
	    endCol = Math.min(endCol, lineLength);
	    endCol = Math.max(endCol, startCol);

	    if (endCol < indent) {
	        indent = endCol;
	        sliceEnd = sliceStart;
	    } else {
	        sliceEnd -= lineLength - endCol;
	    }

	    lineLength = endCol;
	    lineLength -= startCol;

	    if (startCol < indent) {
	        indent -= startCol;
	    } else {
	        startCol -= indent;
	        indent = 0;
	        sliceStart += startCol;
	    }

	    assert.ok(indent >= 0);
	    assert.ok(sliceStart <= sliceEnd);
	    assert.strictEqual(lineLength, indent + sliceEnd - sliceStart);

	    if (info.indent === indent &&
	        info.sliceStart === sliceStart &&
	        info.sliceEnd === sliceEnd) {
	        return info;
	    }

	    return {
	        line: info.line,
	        indent: indent,
	        sliceStart: sliceStart,
	        sliceEnd: sliceEnd
	    };
	}

	Lp.bootstrapSliceString = function(start, end, options) {
	    return this.slice(start, end).toString(options);
	};

	Lp.sliceString = function(start, end, options) {
	    if (!end) {
	        if (!start) {
	            // The client seems to want a copy of this Lines object, but
	            // Lines objects are immutable, so it's perfectly adequate to
	            // return the same object.
	            return this;
	        }

	        // Slice to the end if no end position was provided.
	        end = this.lastPos();
	    }

	    options = normalizeOptions(options);

	    var infos = getSecret(this).infos;
	    var parts = [];
	    var tabWidth = options.tabWidth;

	    for (var line = start.line; line <= end.line; ++line) {
	        var info = infos[line - 1];

	        if (line === start.line) {
	            if (line === end.line) {
	                info = sliceInfo(info, start.column, end.column);
	            } else {
	                info = sliceInfo(info, start.column);
	            }
	        } else if (line === end.line) {
	            info = sliceInfo(info, 0, end.column);
	        }

	        var indent = Math.max(info.indent, 0);

	        var before = info.line.slice(0, info.sliceStart);
	        if (options.reuseWhitespace &&
	            isOnlyWhitespace(before) &&
	            countSpaces(before, options.tabWidth) === indent) {
	            // Reuse original spaces if the indentation is correct.
	            parts.push(info.line.slice(0, info.sliceEnd));
	            continue;
	        }

	        var tabs = 0;
	        var spaces = indent;

	        if (options.useTabs) {
	            tabs = Math.floor(indent / tabWidth);
	            spaces -= tabs * tabWidth;
	        }

	        var result = "";

	        if (tabs > 0) {
	            result += new Array(tabs + 1).join("\t");
	        }

	        if (spaces > 0) {
	            result += new Array(spaces + 1).join(" ");
	        }

	        result += info.line.slice(info.sliceStart, info.sliceEnd);

	        parts.push(result);
	    }

	    return parts.join("\n");
	};

	Lp.isEmpty = function() {
	    return this.length < 2 && this.getLineLength(1) < 1;
	};

	Lp.join = function(elements) {
	    var separator = this;
	    var separatorSecret = getSecret(separator);
	    var infos = [];
	    var mappings = [];
	    var prevInfo;

	    function appendSecret(secret) {
	        if (secret === null)
	            return;

	        if (prevInfo) {
	            var info = secret.infos[0];
	            var indent = new Array(info.indent + 1).join(" ");
	            var prevLine = infos.length;
	            var prevColumn = Math.max(prevInfo.indent, 0) +
	                prevInfo.sliceEnd - prevInfo.sliceStart;

	            prevInfo.line = prevInfo.line.slice(
	                0, prevInfo.sliceEnd) + indent + info.line.slice(
	                    info.sliceStart, info.sliceEnd);

	            prevInfo.sliceEnd = prevInfo.line.length;

	            if (secret.mappings.length > 0) {
	                secret.mappings.forEach(function(mapping) {
	                    mappings.push(mapping.add(prevLine, prevColumn));
	                });
	            }

	        } else if (secret.mappings.length > 0) {
	            mappings.push.apply(mappings, secret.mappings);
	        }

	        secret.infos.forEach(function(info, i) {
	            if (!prevInfo || i > 0) {
	                prevInfo = copyLineInfo(info);
	                infos.push(prevInfo);
	            }
	        });
	    }

	    function appendWithSeparator(secret, i) {
	        if (i > 0)
	            appendSecret(separatorSecret);
	        appendSecret(secret);
	    }

	    elements.map(function(elem) {
	        var lines = fromString(elem);
	        if (lines.isEmpty())
	            return null;
	        return getSecret(lines);
	    }).forEach(separator.isEmpty()
	               ? appendSecret
	               : appendWithSeparator);

	    if (infos.length < 1)
	        return emptyLines;

	    var lines = new Lines(infos);

	    if (mappings.length > 0) {
	        var newSecret = getSecret(lines);
	        assert.strictEqual(newSecret.mappings.length, 0);
	        newSecret.mappings = mappings;
	    }

	    return lines;
	};

	exports.concat = function(elements) {
	    return emptyLines.join(elements);
	};

	Lp.concat = function(other) {
	    var args = arguments,
	        list = [this];
	    list.push.apply(list, args);
	    assert.strictEqual(list.length, args.length + 1);
	    return emptyLines.join(list);
	};

	// The emptyLines object needs to be created all the way down here so that
	// Lines.prototype will be fully populated.
	var emptyLines = fromString("");


/***/ },
/* 31 */
/***/ function(module, exports, __webpack_require__) {

	/*
	 * Copyright 2009-2011 Mozilla Foundation and contributors
	 * Licensed under the New BSD license. See LICENSE.txt or:
	 * http://opensource.org/licenses/BSD-3-Clause
	 */
	exports.SourceMapGenerator = __webpack_require__(32).SourceMapGenerator;
	exports.SourceMapConsumer = __webpack_require__(37).SourceMapConsumer;
	exports.SourceNode = __webpack_require__(39).SourceNode;


/***/ },
/* 32 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_RESULT__;/* -*- Mode: js; js-indent-level: 2; -*- */
	/*
	 * Copyright 2011 Mozilla Foundation and contributors
	 * Licensed under the New BSD license. See LICENSE or:
	 * http://opensource.org/licenses/BSD-3-Clause
	 */
	if (false) {
	    var define = require('amdefine')(module, require);
	}
	!(__WEBPACK_AMD_DEFINE_RESULT__ = function (require, exports, module) {

	  var base64VLQ = __webpack_require__(33);
	  var util = __webpack_require__(35);
	  var ArraySet = __webpack_require__(36).ArraySet;

	  /**
	   * An instance of the SourceMapGenerator represents a source map which is
	   * being built incrementally. To create a new one, you must pass an object
	   * with the following properties:
	   *
	   *   - file: The filename of the generated source.
	   *   - sourceRoot: An optional root for all URLs in this source map.
	   */
	  function SourceMapGenerator(aArgs) {
	    this._file = util.getArg(aArgs, 'file');
	    this._sourceRoot = util.getArg(aArgs, 'sourceRoot', null);
	    this._sources = new ArraySet();
	    this._names = new ArraySet();
	    this._mappings = [];
	    this._sourcesContents = null;
	  }

	  SourceMapGenerator.prototype._version = 3;

	  /**
	   * Creates a new SourceMapGenerator based on a SourceMapConsumer
	   *
	   * @param aSourceMapConsumer The SourceMap.
	   */
	  SourceMapGenerator.fromSourceMap =
	    function SourceMapGenerator_fromSourceMap(aSourceMapConsumer) {
	      var sourceRoot = aSourceMapConsumer.sourceRoot;
	      var generator = new SourceMapGenerator({
	        file: aSourceMapConsumer.file,
	        sourceRoot: sourceRoot
	      });
	      aSourceMapConsumer.eachMapping(function (mapping) {
	        var newMapping = {
	          generated: {
	            line: mapping.generatedLine,
	            column: mapping.generatedColumn
	          }
	        };

	        if (mapping.source) {
	          newMapping.source = mapping.source;
	          if (sourceRoot) {
	            newMapping.source = util.relative(sourceRoot, newMapping.source);
	          }

	          newMapping.original = {
	            line: mapping.originalLine,
	            column: mapping.originalColumn
	          };

	          if (mapping.name) {
	            newMapping.name = mapping.name;
	          }
	        }

	        generator.addMapping(newMapping);
	      });
	      aSourceMapConsumer.sources.forEach(function (sourceFile) {
	        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
	        if (content) {
	          generator.setSourceContent(sourceFile, content);
	        }
	      });
	      return generator;
	    };

	  /**
	   * Add a single mapping from original source line and column to the generated
	   * source's line and column for this source map being created. The mapping
	   * object should have the following properties:
	   *
	   *   - generated: An object with the generated line and column positions.
	   *   - original: An object with the original line and column positions.
	   *   - source: The original source file (relative to the sourceRoot).
	   *   - name: An optional original token name for this mapping.
	   */
	  SourceMapGenerator.prototype.addMapping =
	    function SourceMapGenerator_addMapping(aArgs) {
	      var generated = util.getArg(aArgs, 'generated');
	      var original = util.getArg(aArgs, 'original', null);
	      var source = util.getArg(aArgs, 'source', null);
	      var name = util.getArg(aArgs, 'name', null);

	      this._validateMapping(generated, original, source, name);

	      if (source && !this._sources.has(source)) {
	        this._sources.add(source);
	      }

	      if (name && !this._names.has(name)) {
	        this._names.add(name);
	      }

	      this._mappings.push({
	        generatedLine: generated.line,
	        generatedColumn: generated.column,
	        originalLine: original != null && original.line,
	        originalColumn: original != null && original.column,
	        source: source,
	        name: name
	      });
	    };

	  /**
	   * Set the source content for a source file.
	   */
	  SourceMapGenerator.prototype.setSourceContent =
	    function SourceMapGenerator_setSourceContent(aSourceFile, aSourceContent) {
	      var source = aSourceFile;
	      if (this._sourceRoot) {
	        source = util.relative(this._sourceRoot, source);
	      }

	      if (aSourceContent !== null) {
	        // Add the source content to the _sourcesContents map.
	        // Create a new _sourcesContents map if the property is null.
	        if (!this._sourcesContents) {
	          this._sourcesContents = {};
	        }
	        this._sourcesContents[util.toSetString(source)] = aSourceContent;
	      } else {
	        // Remove the source file from the _sourcesContents map.
	        // If the _sourcesContents map is empty, set the property to null.
	        delete this._sourcesContents[util.toSetString(source)];
	        if (Object.keys(this._sourcesContents).length === 0) {
	          this._sourcesContents = null;
	        }
	      }
	    };

	  /**
	   * Applies the mappings of a sub-source-map for a specific source file to the
	   * source map being generated. Each mapping to the supplied source file is
	   * rewritten using the supplied source map. Note: The resolution for the
	   * resulting mappings is the minimium of this map and the supplied map.
	   *
	   * @param aSourceMapConsumer The source map to be applied.
	   * @param aSourceFile Optional. The filename of the source file.
	   *        If omitted, SourceMapConsumer's file property will be used.
	   */
	  SourceMapGenerator.prototype.applySourceMap =
	    function SourceMapGenerator_applySourceMap(aSourceMapConsumer, aSourceFile) {
	      // If aSourceFile is omitted, we will use the file property of the SourceMap
	      if (!aSourceFile) {
	        aSourceFile = aSourceMapConsumer.file;
	      }
	      var sourceRoot = this._sourceRoot;
	      // Make "aSourceFile" relative if an absolute Url is passed.
	      if (sourceRoot) {
	        aSourceFile = util.relative(sourceRoot, aSourceFile);
	      }
	      // Applying the SourceMap can add and remove items from the sources and
	      // the names array.
	      var newSources = new ArraySet();
	      var newNames = new ArraySet();

	      // Find mappings for the "aSourceFile"
	      this._mappings.forEach(function (mapping) {
	        if (mapping.source === aSourceFile && mapping.originalLine) {
	          // Check if it can be mapped by the source map, then update the mapping.
	          var original = aSourceMapConsumer.originalPositionFor({
	            line: mapping.originalLine,
	            column: mapping.originalColumn
	          });
	          if (original.source !== null) {
	            // Copy mapping
	            if (sourceRoot) {
	              mapping.source = util.relative(sourceRoot, original.source);
	            } else {
	              mapping.source = original.source;
	            }
	            mapping.originalLine = original.line;
	            mapping.originalColumn = original.column;
	            if (original.name !== null && mapping.name !== null) {
	              // Only use the identifier name if it's an identifier
	              // in both SourceMaps
	              mapping.name = original.name;
	            }
	          }
	        }

	        var source = mapping.source;
	        if (source && !newSources.has(source)) {
	          newSources.add(source);
	        }

	        var name = mapping.name;
	        if (name && !newNames.has(name)) {
	          newNames.add(name);
	        }

	      }, this);
	      this._sources = newSources;
	      this._names = newNames;

	      // Copy sourcesContents of applied map.
	      aSourceMapConsumer.sources.forEach(function (sourceFile) {
	        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
	        if (content) {
	          if (sourceRoot) {
	            sourceFile = util.relative(sourceRoot, sourceFile);
	          }
	          this.setSourceContent(sourceFile, content);
	        }
	      }, this);
	    };

	  /**
	   * A mapping can have one of the three levels of data:
	   *
	   *   1. Just the generated position.
	   *   2. The Generated position, original position, and original source.
	   *   3. Generated and original position, original source, as well as a name
	   *      token.
	   *
	   * To maintain consistency, we validate that any new mapping being added falls
	   * in to one of these categories.
	   */
	  SourceMapGenerator.prototype._validateMapping =
	    function SourceMapGenerator_validateMapping(aGenerated, aOriginal, aSource,
	                                                aName) {
	      if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
	          && aGenerated.line > 0 && aGenerated.column >= 0
	          && !aOriginal && !aSource && !aName) {
	        // Case 1.
	        return;
	      }
	      else if (aGenerated && 'line' in aGenerated && 'column' in aGenerated
	               && aOriginal && 'line' in aOriginal && 'column' in aOriginal
	               && aGenerated.line > 0 && aGenerated.column >= 0
	               && aOriginal.line > 0 && aOriginal.column >= 0
	               && aSource) {
	        // Cases 2 and 3.
	        return;
	      }
	      else {
	        throw new Error('Invalid mapping: ' + JSON.stringify({
	          generated: aGenerated,
	          source: aSource,
	          original: aOriginal,
	          name: aName
	        }));
	      }
	    };

	  /**
	   * Serialize the accumulated mappings in to the stream of base 64 VLQs
	   * specified by the source map format.
	   */
	  SourceMapGenerator.prototype._serializeMappings =
	    function SourceMapGenerator_serializeMappings() {
	      var previousGeneratedColumn = 0;
	      var previousGeneratedLine = 1;
	      var previousOriginalColumn = 0;
	      var previousOriginalLine = 0;
	      var previousName = 0;
	      var previousSource = 0;
	      var result = '';
	      var mapping;

	      // The mappings must be guaranteed to be in sorted order before we start
	      // serializing them or else the generated line numbers (which are defined
	      // via the ';' separators) will be all messed up. Note: it might be more
	      // performant to maintain the sorting as we insert them, rather than as we
	      // serialize them, but the big O is the same either way.
	      this._mappings.sort(util.compareByGeneratedPositions);

	      for (var i = 0, len = this._mappings.length; i < len; i++) {
	        mapping = this._mappings[i];

	        if (mapping.generatedLine !== previousGeneratedLine) {
	          previousGeneratedColumn = 0;
	          while (mapping.generatedLine !== previousGeneratedLine) {
	            result += ';';
	            previousGeneratedLine++;
	          }
	        }
	        else {
	          if (i > 0) {
	            if (!util.compareByGeneratedPositions(mapping, this._mappings[i - 1])) {
	              continue;
	            }
	            result += ',';
	          }
	        }

	        result += base64VLQ.encode(mapping.generatedColumn
	                                   - previousGeneratedColumn);
	        previousGeneratedColumn = mapping.generatedColumn;

	        if (mapping.source) {
	          result += base64VLQ.encode(this._sources.indexOf(mapping.source)
	                                     - previousSource);
	          previousSource = this._sources.indexOf(mapping.source);

	          // lines are stored 0-based in SourceMap spec version 3
	          result += base64VLQ.encode(mapping.originalLine - 1
	                                     - previousOriginalLine);
	          previousOriginalLine = mapping.originalLine - 1;

	          result += base64VLQ.encode(mapping.originalColumn
	                                     - previousOriginalColumn);
	          previousOriginalColumn = mapping.originalColumn;

	          if (mapping.name) {
	            result += base64VLQ.encode(this._names.indexOf(mapping.name)
	                                       - previousName);
	            previousName = this._names.indexOf(mapping.name);
	          }
	        }
	      }

	      return result;
	    };

	  SourceMapGenerator.prototype._generateSourcesContent =
	    function SourceMapGenerator_generateSourcesContent(aSources, aSourceRoot) {
	      return aSources.map(function (source) {
	        if (!this._sourcesContents) {
	          return null;
	        }
	        if (aSourceRoot) {
	          source = util.relative(aSourceRoot, source);
	        }
	        var key = util.toSetString(source);
	        return Object.prototype.hasOwnProperty.call(this._sourcesContents,
	                                                    key)
	          ? this._sourcesContents[key]
	          : null;
	      }, this);
	    };

	  /**
	   * Externalize the source map.
	   */
	  SourceMapGenerator.prototype.toJSON =
	    function SourceMapGenerator_toJSON() {
	      var map = {
	        version: this._version,
	        file: this._file,
	        sources: this._sources.toArray(),
	        names: this._names.toArray(),
	        mappings: this._serializeMappings()
	      };
	      if (this._sourceRoot) {
	        map.sourceRoot = this._sourceRoot;
	      }
	      if (this._sourcesContents) {
	        map.sourcesContent = this._generateSourcesContent(map.sources, map.sourceRoot);
	      }

	      return map;
	    };

	  /**
	   * Render the source map being generated to a string.
	   */
	  SourceMapGenerator.prototype.toString =
	    function SourceMapGenerator_toString() {
	      return JSON.stringify(this);
	    };

	  exports.SourceMapGenerator = SourceMapGenerator;

	}.call(exports, __webpack_require__, exports, module), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));


/***/ },
/* 33 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_RESULT__;/* -*- Mode: js; js-indent-level: 2; -*- */
	/*
	 * Copyright 2011 Mozilla Foundation and contributors
	 * Licensed under the New BSD license. See LICENSE or:
	 * http://opensource.org/licenses/BSD-3-Clause
	 *
	 * Based on the Base 64 VLQ implementation in Closure Compiler:
	 * https://code.google.com/p/closure-compiler/source/browse/trunk/src/com/google/debugging/sourcemap/Base64VLQ.java
	 *
	 * Copyright 2011 The Closure Compiler Authors. All rights reserved.
	 * Redistribution and use in source and binary forms, with or without
	 * modification, are permitted provided that the following conditions are
	 * met:
	 *
	 *  * Redistributions of source code must retain the above copyright
	 *    notice, this list of conditions and the following disclaimer.
	 *  * Redistributions in binary form must reproduce the above
	 *    copyright notice, this list of conditions and the following
	 *    disclaimer in the documentation and/or other materials provided
	 *    with the distribution.
	 *  * Neither the name of Google Inc. nor the names of its
	 *    contributors may be used to endorse or promote products derived
	 *    from this software without specific prior written permission.
	 *
	 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
	 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
	 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
	 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
	 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
	 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
	 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
	 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
	 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
	 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
	 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
	 */
	if (false) {
	    var define = require('amdefine')(module, require);
	}
	!(__WEBPACK_AMD_DEFINE_RESULT__ = function (require, exports, module) {

	  var base64 = __webpack_require__(34);

	  // A single base 64 digit can contain 6 bits of data. For the base 64 variable
	  // length quantities we use in the source map spec, the first bit is the sign,
	  // the next four bits are the actual value, and the 6th bit is the
	  // continuation bit. The continuation bit tells us whether there are more
	  // digits in this value following this digit.
	  //
	  //   Continuation
	  //   |    Sign
	  //   |    |
	  //   V    V
	  //   101011

	  var VLQ_BASE_SHIFT = 5;

	  // binary: 100000
	  var VLQ_BASE = 1 << VLQ_BASE_SHIFT;

	  // binary: 011111
	  var VLQ_BASE_MASK = VLQ_BASE - 1;

	  // binary: 100000
	  var VLQ_CONTINUATION_BIT = VLQ_BASE;

	  /**
	   * Converts from a two-complement value to a value where the sign bit is
	   * is placed in the least significant bit.  For example, as decimals:
	   *   1 becomes 2 (10 binary), -1 becomes 3 (11 binary)
	   *   2 becomes 4 (100 binary), -2 becomes 5 (101 binary)
	   */
	  function toVLQSigned(aValue) {
	    return aValue < 0
	      ? ((-aValue) << 1) + 1
	      : (aValue << 1) + 0;
	  }

	  /**
	   * Converts to a two-complement value from a value where the sign bit is
	   * is placed in the least significant bit.  For example, as decimals:
	   *   2 (10 binary) becomes 1, 3 (11 binary) becomes -1
	   *   4 (100 binary) becomes 2, 5 (101 binary) becomes -2
	   */
	  function fromVLQSigned(aValue) {
	    var isNegative = (aValue & 1) === 1;
	    var shifted = aValue >> 1;
	    return isNegative
	      ? -shifted
	      : shifted;
	  }

	  /**
	   * Returns the base 64 VLQ encoded value.
	   */
	  exports.encode = function base64VLQ_encode(aValue) {
	    var encoded = "";
	    var digit;

	    var vlq = toVLQSigned(aValue);

	    do {
	      digit = vlq & VLQ_BASE_MASK;
	      vlq >>>= VLQ_BASE_SHIFT;
	      if (vlq > 0) {
	        // There are still more digits in this value, so we must make sure the
	        // continuation bit is marked.
	        digit |= VLQ_CONTINUATION_BIT;
	      }
	      encoded += base64.encode(digit);
	    } while (vlq > 0);

	    return encoded;
	  };

	  /**
	   * Decodes the next base 64 VLQ value from the given string and returns the
	   * value and the rest of the string.
	   */
	  exports.decode = function base64VLQ_decode(aStr) {
	    var i = 0;
	    var strLen = aStr.length;
	    var result = 0;
	    var shift = 0;
	    var continuation, digit;

	    do {
	      if (i >= strLen) {
	        throw new Error("Expected more digits in base 64 VLQ value.");
	      }
	      digit = base64.decode(aStr.charAt(i++));
	      continuation = !!(digit & VLQ_CONTINUATION_BIT);
	      digit &= VLQ_BASE_MASK;
	      result = result + (digit << shift);
	      shift += VLQ_BASE_SHIFT;
	    } while (continuation);

	    return {
	      value: fromVLQSigned(result),
	      rest: aStr.slice(i)
	    };
	  };

	}.call(exports, __webpack_require__, exports, module), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));


/***/ },
/* 34 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_RESULT__;/* -*- Mode: js; js-indent-level: 2; -*- */
	/*
	 * Copyright 2011 Mozilla Foundation and contributors
	 * Licensed under the New BSD license. See LICENSE or:
	 * http://opensource.org/licenses/BSD-3-Clause
	 */
	if (false) {
	    var define = require('amdefine')(module, require);
	}
	!(__WEBPACK_AMD_DEFINE_RESULT__ = function (require, exports, module) {

	  var charToIntMap = {};
	  var intToCharMap = {};

	  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
	    .split('')
	    .forEach(function (ch, index) {
	      charToIntMap[ch] = index;
	      intToCharMap[index] = ch;
	    });

	  /**
	   * Encode an integer in the range of 0 to 63 to a single base 64 digit.
	   */
	  exports.encode = function base64_encode(aNumber) {
	    if (aNumber in intToCharMap) {
	      return intToCharMap[aNumber];
	    }
	    throw new TypeError("Must be between 0 and 63: " + aNumber);
	  };

	  /**
	   * Decode a single base 64 digit to an integer.
	   */
	  exports.decode = function base64_decode(aChar) {
	    if (aChar in charToIntMap) {
	      return charToIntMap[aChar];
	    }
	    throw new TypeError("Not a valid base 64 digit: " + aChar);
	  };

	}.call(exports, __webpack_require__, exports, module), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));


/***/ },
/* 35 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_RESULT__;/* -*- Mode: js; js-indent-level: 2; -*- */
	/*
	 * Copyright 2011 Mozilla Foundation and contributors
	 * Licensed under the New BSD license. See LICENSE or:
	 * http://opensource.org/licenses/BSD-3-Clause
	 */
	if (false) {
	    var define = require('amdefine')(module, require);
	}
	!(__WEBPACK_AMD_DEFINE_RESULT__ = function (require, exports, module) {

	  /**
	   * This is a helper function for getting values from parameter/options
	   * objects.
	   *
	   * @param args The object we are extracting values from
	   * @param name The name of the property we are getting.
	   * @param defaultValue An optional value to return if the property is missing
	   * from the object. If this is not specified and the property is missing, an
	   * error will be thrown.
	   */
	  function getArg(aArgs, aName, aDefaultValue) {
	    if (aName in aArgs) {
	      return aArgs[aName];
	    } else if (arguments.length === 3) {
	      return aDefaultValue;
	    } else {
	      throw new Error('"' + aName + '" is a required argument.');
	    }
	  }
	  exports.getArg = getArg;

	  var urlRegexp = /([\w+\-.]+):\/\/((\w+:\w+)@)?([\w.]+)?(:(\d+))?(\S+)?/;
	  var dataUrlRegexp = /^data:.+\,.+/;

	  function urlParse(aUrl) {
	    var match = aUrl.match(urlRegexp);
	    if (!match) {
	      return null;
	    }
	    return {
	      scheme: match[1],
	      auth: match[3],
	      host: match[4],
	      port: match[6],
	      path: match[7]
	    };
	  }
	  exports.urlParse = urlParse;

	  function urlGenerate(aParsedUrl) {
	    var url = aParsedUrl.scheme + "://";
	    if (aParsedUrl.auth) {
	      url += aParsedUrl.auth + "@"
	    }
	    if (aParsedUrl.host) {
	      url += aParsedUrl.host;
	    }
	    if (aParsedUrl.port) {
	      url += ":" + aParsedUrl.port
	    }
	    if (aParsedUrl.path) {
	      url += aParsedUrl.path;
	    }
	    return url;
	  }
	  exports.urlGenerate = urlGenerate;

	  function join(aRoot, aPath) {
	    var url;

	    if (aPath.match(urlRegexp) || aPath.match(dataUrlRegexp)) {
	      return aPath;
	    }

	    if (aPath.charAt(0) === '/' && (url = urlParse(aRoot))) {
	      url.path = aPath;
	      return urlGenerate(url);
	    }

	    return aRoot.replace(/\/$/, '') + '/' + aPath;
	  }
	  exports.join = join;

	  /**
	   * Because behavior goes wacky when you set `__proto__` on objects, we
	   * have to prefix all the strings in our set with an arbitrary character.
	   *
	   * See https://github.com/mozilla/source-map/pull/31 and
	   * https://github.com/mozilla/source-map/issues/30
	   *
	   * @param String aStr
	   */
	  function toSetString(aStr) {
	    return '$' + aStr;
	  }
	  exports.toSetString = toSetString;

	  function fromSetString(aStr) {
	    return aStr.substr(1);
	  }
	  exports.fromSetString = fromSetString;

	  function relative(aRoot, aPath) {
	    aRoot = aRoot.replace(/\/$/, '');

	    var url = urlParse(aRoot);
	    if (aPath.charAt(0) == "/" && url && url.path == "/") {
	      return aPath.slice(1);
	    }

	    return aPath.indexOf(aRoot + '/') === 0
	      ? aPath.substr(aRoot.length + 1)
	      : aPath;
	  }
	  exports.relative = relative;

	  function strcmp(aStr1, aStr2) {
	    var s1 = aStr1 || "";
	    var s2 = aStr2 || "";
	    return (s1 > s2) - (s1 < s2);
	  }

	  /**
	   * Comparator between two mappings where the original positions are compared.
	   *
	   * Optionally pass in `true` as `onlyCompareGenerated` to consider two
	   * mappings with the same original source/line/column, but different generated
	   * line and column the same. Useful when searching for a mapping with a
	   * stubbed out mapping.
	   */
	  function compareByOriginalPositions(mappingA, mappingB, onlyCompareOriginal) {
	    var cmp;

	    cmp = strcmp(mappingA.source, mappingB.source);
	    if (cmp) {
	      return cmp;
	    }

	    cmp = mappingA.originalLine - mappingB.originalLine;
	    if (cmp) {
	      return cmp;
	    }

	    cmp = mappingA.originalColumn - mappingB.originalColumn;
	    if (cmp || onlyCompareOriginal) {
	      return cmp;
	    }

	    cmp = strcmp(mappingA.name, mappingB.name);
	    if (cmp) {
	      return cmp;
	    }

	    cmp = mappingA.generatedLine - mappingB.generatedLine;
	    if (cmp) {
	      return cmp;
	    }

	    return mappingA.generatedColumn - mappingB.generatedColumn;
	  };
	  exports.compareByOriginalPositions = compareByOriginalPositions;

	  /**
	   * Comparator between two mappings where the generated positions are
	   * compared.
	   *
	   * Optionally pass in `true` as `onlyCompareGenerated` to consider two
	   * mappings with the same generated line and column, but different
	   * source/name/original line and column the same. Useful when searching for a
	   * mapping with a stubbed out mapping.
	   */
	  function compareByGeneratedPositions(mappingA, mappingB, onlyCompareGenerated) {
	    var cmp;

	    cmp = mappingA.generatedLine - mappingB.generatedLine;
	    if (cmp) {
	      return cmp;
	    }

	    cmp = mappingA.generatedColumn - mappingB.generatedColumn;
	    if (cmp || onlyCompareGenerated) {
	      return cmp;
	    }

	    cmp = strcmp(mappingA.source, mappingB.source);
	    if (cmp) {
	      return cmp;
	    }

	    cmp = mappingA.originalLine - mappingB.originalLine;
	    if (cmp) {
	      return cmp;
	    }

	    cmp = mappingA.originalColumn - mappingB.originalColumn;
	    if (cmp) {
	      return cmp;
	    }

	    return strcmp(mappingA.name, mappingB.name);
	  };
	  exports.compareByGeneratedPositions = compareByGeneratedPositions;

	}.call(exports, __webpack_require__, exports, module), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));


/***/ },
/* 36 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_RESULT__;/* -*- Mode: js; js-indent-level: 2; -*- */
	/*
	 * Copyright 2011 Mozilla Foundation and contributors
	 * Licensed under the New BSD license. See LICENSE or:
	 * http://opensource.org/licenses/BSD-3-Clause
	 */
	if (false) {
	    var define = require('amdefine')(module, require);
	}
	!(__WEBPACK_AMD_DEFINE_RESULT__ = function (require, exports, module) {

	  var util = __webpack_require__(35);

	  /**
	   * A data structure which is a combination of an array and a set. Adding a new
	   * member is O(1), testing for membership is O(1), and finding the index of an
	   * element is O(1). Removing elements from the set is not supported. Only
	   * strings are supported for membership.
	   */
	  function ArraySet() {
	    this._array = [];
	    this._set = {};
	  }

	  /**
	   * Static method for creating ArraySet instances from an existing array.
	   */
	  ArraySet.fromArray = function ArraySet_fromArray(aArray, aAllowDuplicates) {
	    var set = new ArraySet();
	    for (var i = 0, len = aArray.length; i < len; i++) {
	      set.add(aArray[i], aAllowDuplicates);
	    }
	    return set;
	  };

	  /**
	   * Add the given string to this set.
	   *
	   * @param String aStr
	   */
	  ArraySet.prototype.add = function ArraySet_add(aStr, aAllowDuplicates) {
	    var isDuplicate = this.has(aStr);
	    var idx = this._array.length;
	    if (!isDuplicate || aAllowDuplicates) {
	      this._array.push(aStr);
	    }
	    if (!isDuplicate) {
	      this._set[util.toSetString(aStr)] = idx;
	    }
	  };

	  /**
	   * Is the given string a member of this set?
	   *
	   * @param String aStr
	   */
	  ArraySet.prototype.has = function ArraySet_has(aStr) {
	    return Object.prototype.hasOwnProperty.call(this._set,
	                                                util.toSetString(aStr));
	  };

	  /**
	   * What is the index of the given string in the array?
	   *
	   * @param String aStr
	   */
	  ArraySet.prototype.indexOf = function ArraySet_indexOf(aStr) {
	    if (this.has(aStr)) {
	      return this._set[util.toSetString(aStr)];
	    }
	    throw new Error('"' + aStr + '" is not in the set.');
	  };

	  /**
	   * What is the element at the given index?
	   *
	   * @param Number aIdx
	   */
	  ArraySet.prototype.at = function ArraySet_at(aIdx) {
	    if (aIdx >= 0 && aIdx < this._array.length) {
	      return this._array[aIdx];
	    }
	    throw new Error('No element indexed by ' + aIdx);
	  };

	  /**
	   * Returns the array representation of this set (which has the proper indices
	   * indicated by indexOf). Note that this is a copy of the internal array used
	   * for storing the members so that no one can mess with internal state.
	   */
	  ArraySet.prototype.toArray = function ArraySet_toArray() {
	    return this._array.slice();
	  };

	  exports.ArraySet = ArraySet;

	}.call(exports, __webpack_require__, exports, module), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));


/***/ },
/* 37 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_RESULT__;/* -*- Mode: js; js-indent-level: 2; -*- */
	/*
	 * Copyright 2011 Mozilla Foundation and contributors
	 * Licensed under the New BSD license. See LICENSE or:
	 * http://opensource.org/licenses/BSD-3-Clause
	 */
	if (false) {
	    var define = require('amdefine')(module, require);
	}
	!(__WEBPACK_AMD_DEFINE_RESULT__ = function (require, exports, module) {

	  var util = __webpack_require__(35);
	  var binarySearch = __webpack_require__(38);
	  var ArraySet = __webpack_require__(36).ArraySet;
	  var base64VLQ = __webpack_require__(33);

	  /**
	   * A SourceMapConsumer instance represents a parsed source map which we can
	   * query for information about the original file positions by giving it a file
	   * position in the generated source.
	   *
	   * The only parameter is the raw source map (either as a JSON string, or
	   * already parsed to an object). According to the spec, source maps have the
	   * following attributes:
	   *
	   *   - version: Which version of the source map spec this map is following.
	   *   - sources: An array of URLs to the original source files.
	   *   - names: An array of identifiers which can be referrenced by individual mappings.
	   *   - sourceRoot: Optional. The URL root from which all sources are relative.
	   *   - sourcesContent: Optional. An array of contents of the original source files.
	   *   - mappings: A string of base64 VLQs which contain the actual mappings.
	   *   - file: The generated file this source map is associated with.
	   *
	   * Here is an example source map, taken from the source map spec[0]:
	   *
	   *     {
	   *       version : 3,
	   *       file: "out.js",
	   *       sourceRoot : "",
	   *       sources: ["foo.js", "bar.js"],
	   *       names: ["src", "maps", "are", "fun"],
	   *       mappings: "AA,AB;;ABCDE;"
	   *     }
	   *
	   * [0]: https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/edit?pli=1#
	   */
	  function SourceMapConsumer(aSourceMap) {
	    var sourceMap = aSourceMap;
	    if (typeof aSourceMap === 'string') {
	      sourceMap = JSON.parse(aSourceMap.replace(/^\)\]\}'/, ''));
	    }

	    var version = util.getArg(sourceMap, 'version');
	    var sources = util.getArg(sourceMap, 'sources');
	    // Sass 3.3 leaves out the 'names' array, so we deviate from the spec (which
	    // requires the array) to play nice here.
	    var names = util.getArg(sourceMap, 'names', []);
	    var sourceRoot = util.getArg(sourceMap, 'sourceRoot', null);
	    var sourcesContent = util.getArg(sourceMap, 'sourcesContent', null);
	    var mappings = util.getArg(sourceMap, 'mappings');
	    var file = util.getArg(sourceMap, 'file', null);

	    // Once again, Sass deviates from the spec and supplies the version as a
	    // string rather than a number, so we use loose equality checking here.
	    if (version != this._version) {
	      throw new Error('Unsupported version: ' + version);
	    }

	    // Pass `true` below to allow duplicate names and sources. While source maps
	    // are intended to be compressed and deduplicated, the TypeScript compiler
	    // sometimes generates source maps with duplicates in them. See Github issue
	    // #72 and bugzil.la/889492.
	    this._names = ArraySet.fromArray(names, true);
	    this._sources = ArraySet.fromArray(sources, true);

	    this.sourceRoot = sourceRoot;
	    this.sourcesContent = sourcesContent;
	    this._mappings = mappings;
	    this.file = file;
	  }

	  /**
	   * Create a SourceMapConsumer from a SourceMapGenerator.
	   *
	   * @param SourceMapGenerator aSourceMap
	   *        The source map that will be consumed.
	   * @returns SourceMapConsumer
	   */
	  SourceMapConsumer.fromSourceMap =
	    function SourceMapConsumer_fromSourceMap(aSourceMap) {
	      var smc = Object.create(SourceMapConsumer.prototype);

	      smc._names = ArraySet.fromArray(aSourceMap._names.toArray(), true);
	      smc._sources = ArraySet.fromArray(aSourceMap._sources.toArray(), true);
	      smc.sourceRoot = aSourceMap._sourceRoot;
	      smc.sourcesContent = aSourceMap._generateSourcesContent(smc._sources.toArray(),
	                                                              smc.sourceRoot);
	      smc.file = aSourceMap._file;

	      smc.__generatedMappings = aSourceMap._mappings.slice()
	        .sort(util.compareByGeneratedPositions);
	      smc.__originalMappings = aSourceMap._mappings.slice()
	        .sort(util.compareByOriginalPositions);

	      return smc;
	    };

	  /**
	   * The version of the source mapping spec that we are consuming.
	   */
	  SourceMapConsumer.prototype._version = 3;

	  /**
	   * The list of original sources.
	   */
	  Object.defineProperty(SourceMapConsumer.prototype, 'sources', {
	    get: function () {
	      return this._sources.toArray().map(function (s) {
	        return this.sourceRoot ? util.join(this.sourceRoot, s) : s;
	      }, this);
	    }
	  });

	  // `__generatedMappings` and `__originalMappings` are arrays that hold the
	  // parsed mapping coordinates from the source map's "mappings" attribute. They
	  // are lazily instantiated, accessed via the `_generatedMappings` and
	  // `_originalMappings` getters respectively, and we only parse the mappings
	  // and create these arrays once queried for a source location. We jump through
	  // these hoops because there can be many thousands of mappings, and parsing
	  // them is expensive, so we only want to do it if we must.
	  //
	  // Each object in the arrays is of the form:
	  //
	  //     {
	  //       generatedLine: The line number in the generated code,
	  //       generatedColumn: The column number in the generated code,
	  //       source: The path to the original source file that generated this
	  //               chunk of code,
	  //       originalLine: The line number in the original source that
	  //                     corresponds to this chunk of generated code,
	  //       originalColumn: The column number in the original source that
	  //                       corresponds to this chunk of generated code,
	  //       name: The name of the original symbol which generated this chunk of
	  //             code.
	  //     }
	  //
	  // All properties except for `generatedLine` and `generatedColumn` can be
	  // `null`.
	  //
	  // `_generatedMappings` is ordered by the generated positions.
	  //
	  // `_originalMappings` is ordered by the original positions.

	  SourceMapConsumer.prototype.__generatedMappings = null;
	  Object.defineProperty(SourceMapConsumer.prototype, '_generatedMappings', {
	    get: function () {
	      if (!this.__generatedMappings) {
	        this.__generatedMappings = [];
	        this.__originalMappings = [];
	        this._parseMappings(this._mappings, this.sourceRoot);
	      }

	      return this.__generatedMappings;
	    }
	  });

	  SourceMapConsumer.prototype.__originalMappings = null;
	  Object.defineProperty(SourceMapConsumer.prototype, '_originalMappings', {
	    get: function () {
	      if (!this.__originalMappings) {
	        this.__generatedMappings = [];
	        this.__originalMappings = [];
	        this._parseMappings(this._mappings, this.sourceRoot);
	      }

	      return this.__originalMappings;
	    }
	  });

	  /**
	   * Parse the mappings in a string in to a data structure which we can easily
	   * query (the ordered arrays in the `this.__generatedMappings` and
	   * `this.__originalMappings` properties).
	   */
	  SourceMapConsumer.prototype._parseMappings =
	    function SourceMapConsumer_parseMappings(aStr, aSourceRoot) {
	      var generatedLine = 1;
	      var previousGeneratedColumn = 0;
	      var previousOriginalLine = 0;
	      var previousOriginalColumn = 0;
	      var previousSource = 0;
	      var previousName = 0;
	      var mappingSeparator = /^[,;]/;
	      var str = aStr;
	      var mapping;
	      var temp;

	      while (str.length > 0) {
	        if (str.charAt(0) === ';') {
	          generatedLine++;
	          str = str.slice(1);
	          previousGeneratedColumn = 0;
	        }
	        else if (str.charAt(0) === ',') {
	          str = str.slice(1);
	        }
	        else {
	          mapping = {};
	          mapping.generatedLine = generatedLine;

	          // Generated column.
	          temp = base64VLQ.decode(str);
	          mapping.generatedColumn = previousGeneratedColumn + temp.value;
	          previousGeneratedColumn = mapping.generatedColumn;
	          str = temp.rest;

	          if (str.length > 0 && !mappingSeparator.test(str.charAt(0))) {
	            // Original source.
	            temp = base64VLQ.decode(str);
	            mapping.source = this._sources.at(previousSource + temp.value);
	            previousSource += temp.value;
	            str = temp.rest;
	            if (str.length === 0 || mappingSeparator.test(str.charAt(0))) {
	              throw new Error('Found a source, but no line and column');
	            }

	            // Original line.
	            temp = base64VLQ.decode(str);
	            mapping.originalLine = previousOriginalLine + temp.value;
	            previousOriginalLine = mapping.originalLine;
	            // Lines are stored 0-based
	            mapping.originalLine += 1;
	            str = temp.rest;
	            if (str.length === 0 || mappingSeparator.test(str.charAt(0))) {
	              throw new Error('Found a source and line, but no column');
	            }

	            // Original column.
	            temp = base64VLQ.decode(str);
	            mapping.originalColumn = previousOriginalColumn + temp.value;
	            previousOriginalColumn = mapping.originalColumn;
	            str = temp.rest;

	            if (str.length > 0 && !mappingSeparator.test(str.charAt(0))) {
	              // Original name.
	              temp = base64VLQ.decode(str);
	              mapping.name = this._names.at(previousName + temp.value);
	              previousName += temp.value;
	              str = temp.rest;
	            }
	          }

	          this.__generatedMappings.push(mapping);
	          if (typeof mapping.originalLine === 'number') {
	            this.__originalMappings.push(mapping);
	          }
	        }
	      }

	      this.__generatedMappings.sort(util.compareByGeneratedPositions);
	      this.__originalMappings.sort(util.compareByOriginalPositions);
	    };

	  /**
	   * Find the mapping that best matches the hypothetical "needle" mapping that
	   * we are searching for in the given "haystack" of mappings.
	   */
	  SourceMapConsumer.prototype._findMapping =
	    function SourceMapConsumer_findMapping(aNeedle, aMappings, aLineName,
	                                           aColumnName, aComparator) {
	      // To return the position we are searching for, we must first find the
	      // mapping for the given position and then return the opposite position it
	      // points to. Because the mappings are sorted, we can use binary search to
	      // find the best mapping.

	      if (aNeedle[aLineName] <= 0) {
	        throw new TypeError('Line must be greater than or equal to 1, got '
	                            + aNeedle[aLineName]);
	      }
	      if (aNeedle[aColumnName] < 0) {
	        throw new TypeError('Column must be greater than or equal to 0, got '
	                            + aNeedle[aColumnName]);
	      }

	      return binarySearch.search(aNeedle, aMappings, aComparator);
	    };

	  /**
	   * Returns the original source, line, and column information for the generated
	   * source's line and column positions provided. The only argument is an object
	   * with the following properties:
	   *
	   *   - line: The line number in the generated source.
	   *   - column: The column number in the generated source.
	   *
	   * and an object is returned with the following properties:
	   *
	   *   - source: The original source file, or null.
	   *   - line: The line number in the original source, or null.
	   *   - column: The column number in the original source, or null.
	   *   - name: The original identifier, or null.
	   */
	  SourceMapConsumer.prototype.originalPositionFor =
	    function SourceMapConsumer_originalPositionFor(aArgs) {
	      var needle = {
	        generatedLine: util.getArg(aArgs, 'line'),
	        generatedColumn: util.getArg(aArgs, 'column')
	      };

	      var mapping = this._findMapping(needle,
	                                      this._generatedMappings,
	                                      "generatedLine",
	                                      "generatedColumn",
	                                      util.compareByGeneratedPositions);

	      if (mapping) {
	        var source = util.getArg(mapping, 'source', null);
	        if (source && this.sourceRoot) {
	          source = util.join(this.sourceRoot, source);
	        }
	        return {
	          source: source,
	          line: util.getArg(mapping, 'originalLine', null),
	          column: util.getArg(mapping, 'originalColumn', null),
	          name: util.getArg(mapping, 'name', null)
	        };
	      }

	      return {
	        source: null,
	        line: null,
	        column: null,
	        name: null
	      };
	    };

	  /**
	   * Returns the original source content. The only argument is the url of the
	   * original source file. Returns null if no original source content is
	   * availible.
	   */
	  SourceMapConsumer.prototype.sourceContentFor =
	    function SourceMapConsumer_sourceContentFor(aSource) {
	      if (!this.sourcesContent) {
	        return null;
	      }

	      if (this.sourceRoot) {
	        aSource = util.relative(this.sourceRoot, aSource);
	      }

	      if (this._sources.has(aSource)) {
	        return this.sourcesContent[this._sources.indexOf(aSource)];
	      }

	      var url;
	      if (this.sourceRoot
	          && (url = util.urlParse(this.sourceRoot))) {
	        // XXX: file:// URIs and absolute paths lead to unexpected behavior for
	        // many users. We can help them out when they expect file:// URIs to
	        // behave like it would if they were running a local HTTP server. See
	        // https://bugzilla.mozilla.org/show_bug.cgi?id=885597.
	        var fileUriAbsPath = aSource.replace(/^file:\/\//, "");
	        if (url.scheme == "file"
	            && this._sources.has(fileUriAbsPath)) {
	          return this.sourcesContent[this._sources.indexOf(fileUriAbsPath)]
	        }

	        if ((!url.path || url.path == "/")
	            && this._sources.has("/" + aSource)) {
	          return this.sourcesContent[this._sources.indexOf("/" + aSource)];
	        }
	      }

	      throw new Error('"' + aSource + '" is not in the SourceMap.');
	    };

	  /**
	   * Returns the generated line and column information for the original source,
	   * line, and column positions provided. The only argument is an object with
	   * the following properties:
	   *
	   *   - source: The filename of the original source.
	   *   - line: The line number in the original source.
	   *   - column: The column number in the original source.
	   *
	   * and an object is returned with the following properties:
	   *
	   *   - line: The line number in the generated source, or null.
	   *   - column: The column number in the generated source, or null.
	   */
	  SourceMapConsumer.prototype.generatedPositionFor =
	    function SourceMapConsumer_generatedPositionFor(aArgs) {
	      var needle = {
	        source: util.getArg(aArgs, 'source'),
	        originalLine: util.getArg(aArgs, 'line'),
	        originalColumn: util.getArg(aArgs, 'column')
	      };

	      if (this.sourceRoot) {
	        needle.source = util.relative(this.sourceRoot, needle.source);
	      }

	      var mapping = this._findMapping(needle,
	                                      this._originalMappings,
	                                      "originalLine",
	                                      "originalColumn",
	                                      util.compareByOriginalPositions);

	      if (mapping) {
	        return {
	          line: util.getArg(mapping, 'generatedLine', null),
	          column: util.getArg(mapping, 'generatedColumn', null)
	        };
	      }

	      return {
	        line: null,
	        column: null
	      };
	    };

	  SourceMapConsumer.GENERATED_ORDER = 1;
	  SourceMapConsumer.ORIGINAL_ORDER = 2;

	  /**
	   * Iterate over each mapping between an original source/line/column and a
	   * generated line/column in this source map.
	   *
	   * @param Function aCallback
	   *        The function that is called with each mapping.
	   * @param Object aContext
	   *        Optional. If specified, this object will be the value of `this` every
	   *        time that `aCallback` is called.
	   * @param aOrder
	   *        Either `SourceMapConsumer.GENERATED_ORDER` or
	   *        `SourceMapConsumer.ORIGINAL_ORDER`. Specifies whether you want to
	   *        iterate over the mappings sorted by the generated file's line/column
	   *        order or the original's source/line/column order, respectively. Defaults to
	   *        `SourceMapConsumer.GENERATED_ORDER`.
	   */
	  SourceMapConsumer.prototype.eachMapping =
	    function SourceMapConsumer_eachMapping(aCallback, aContext, aOrder) {
	      var context = aContext || null;
	      var order = aOrder || SourceMapConsumer.GENERATED_ORDER;

	      var mappings;
	      switch (order) {
	      case SourceMapConsumer.GENERATED_ORDER:
	        mappings = this._generatedMappings;
	        break;
	      case SourceMapConsumer.ORIGINAL_ORDER:
	        mappings = this._originalMappings;
	        break;
	      default:
	        throw new Error("Unknown order of iteration.");
	      }

	      var sourceRoot = this.sourceRoot;
	      mappings.map(function (mapping) {
	        var source = mapping.source;
	        if (source && sourceRoot) {
	          source = util.join(sourceRoot, source);
	        }
	        return {
	          source: source,
	          generatedLine: mapping.generatedLine,
	          generatedColumn: mapping.generatedColumn,
	          originalLine: mapping.originalLine,
	          originalColumn: mapping.originalColumn,
	          name: mapping.name
	        };
	      }).forEach(aCallback, context);
	    };

	  exports.SourceMapConsumer = SourceMapConsumer;

	}.call(exports, __webpack_require__, exports, module), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));


/***/ },
/* 38 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_RESULT__;/* -*- Mode: js; js-indent-level: 2; -*- */
	/*
	 * Copyright 2011 Mozilla Foundation and contributors
	 * Licensed under the New BSD license. See LICENSE or:
	 * http://opensource.org/licenses/BSD-3-Clause
	 */
	if (false) {
	    var define = require('amdefine')(module, require);
	}
	!(__WEBPACK_AMD_DEFINE_RESULT__ = function (require, exports, module) {

	  /**
	   * Recursive implementation of binary search.
	   *
	   * @param aLow Indices here and lower do not contain the needle.
	   * @param aHigh Indices here and higher do not contain the needle.
	   * @param aNeedle The element being searched for.
	   * @param aHaystack The non-empty array being searched.
	   * @param aCompare Function which takes two elements and returns -1, 0, or 1.
	   */
	  function recursiveSearch(aLow, aHigh, aNeedle, aHaystack, aCompare) {
	    // This function terminates when one of the following is true:
	    //
	    //   1. We find the exact element we are looking for.
	    //
	    //   2. We did not find the exact element, but we can return the next
	    //      closest element that is less than that element.
	    //
	    //   3. We did not find the exact element, and there is no next-closest
	    //      element which is less than the one we are searching for, so we
	    //      return null.
	    var mid = Math.floor((aHigh - aLow) / 2) + aLow;
	    var cmp = aCompare(aNeedle, aHaystack[mid], true);
	    if (cmp === 0) {
	      // Found the element we are looking for.
	      return aHaystack[mid];
	    }
	    else if (cmp > 0) {
	      // aHaystack[mid] is greater than our needle.
	      if (aHigh - mid > 1) {
	        // The element is in the upper half.
	        return recursiveSearch(mid, aHigh, aNeedle, aHaystack, aCompare);
	      }
	      // We did not find an exact match, return the next closest one
	      // (termination case 2).
	      return aHaystack[mid];
	    }
	    else {
	      // aHaystack[mid] is less than our needle.
	      if (mid - aLow > 1) {
	        // The element is in the lower half.
	        return recursiveSearch(aLow, mid, aNeedle, aHaystack, aCompare);
	      }
	      // The exact needle element was not found in this haystack. Determine if
	      // we are in termination case (2) or (3) and return the appropriate thing.
	      return aLow < 0
	        ? null
	        : aHaystack[aLow];
	    }
	  }

	  /**
	   * This is an implementation of binary search which will always try and return
	   * the next lowest value checked if there is no exact hit. This is because
	   * mappings between original and generated line/col pairs are single points,
	   * and there is an implicit region between each of them, so a miss just means
	   * that you aren't on the very start of a region.
	   *
	   * @param aNeedle The element you are looking for.
	   * @param aHaystack The array that is being searched.
	   * @param aCompare A function which takes the needle and an element in the
	   *     array and returns -1, 0, or 1 depending on whether the needle is less
	   *     than, equal to, or greater than the element, respectively.
	   */
	  exports.search = function search(aNeedle, aHaystack, aCompare) {
	    return aHaystack.length > 0
	      ? recursiveSearch(-1, aHaystack.length, aNeedle, aHaystack, aCompare)
	      : null;
	  };

	}.call(exports, __webpack_require__, exports, module), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));


/***/ },
/* 39 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_RESULT__;/* -*- Mode: js; js-indent-level: 2; -*- */
	/*
	 * Copyright 2011 Mozilla Foundation and contributors
	 * Licensed under the New BSD license. See LICENSE or:
	 * http://opensource.org/licenses/BSD-3-Clause
	 */
	if (false) {
	    var define = require('amdefine')(module, require);
	}
	!(__WEBPACK_AMD_DEFINE_RESULT__ = function (require, exports, module) {

	  var SourceMapGenerator = __webpack_require__(32).SourceMapGenerator;
	  var util = __webpack_require__(35);

	  /**
	   * SourceNodes provide a way to abstract over interpolating/concatenating
	   * snippets of generated JavaScript source code while maintaining the line and
	   * column information associated with the original source code.
	   *
	   * @param aLine The original line number.
	   * @param aColumn The original column number.
	   * @param aSource The original source's filename.
	   * @param aChunks Optional. An array of strings which are snippets of
	   *        generated JS, or other SourceNodes.
	   * @param aName The original identifier.
	   */
	  function SourceNode(aLine, aColumn, aSource, aChunks, aName) {
	    this.children = [];
	    this.sourceContents = {};
	    this.line = aLine === undefined ? null : aLine;
	    this.column = aColumn === undefined ? null : aColumn;
	    this.source = aSource === undefined ? null : aSource;
	    this.name = aName === undefined ? null : aName;
	    if (aChunks != null) this.add(aChunks);
	  }

	  /**
	   * Creates a SourceNode from generated code and a SourceMapConsumer.
	   *
	   * @param aGeneratedCode The generated code
	   * @param aSourceMapConsumer The SourceMap for the generated code
	   */
	  SourceNode.fromStringWithSourceMap =
	    function SourceNode_fromStringWithSourceMap(aGeneratedCode, aSourceMapConsumer) {
	      // The SourceNode we want to fill with the generated code
	      // and the SourceMap
	      var node = new SourceNode();

	      // The generated code
	      // Processed fragments are removed from this array.
	      var remainingLines = aGeneratedCode.split('\n');

	      // We need to remember the position of "remainingLines"
	      var lastGeneratedLine = 1, lastGeneratedColumn = 0;

	      // The generate SourceNodes we need a code range.
	      // To extract it current and last mapping is used.
	      // Here we store the last mapping.
	      var lastMapping = null;

	      aSourceMapConsumer.eachMapping(function (mapping) {
	        if (lastMapping === null) {
	          // We add the generated code until the first mapping
	          // to the SourceNode without any mapping.
	          // Each line is added as separate string.
	          while (lastGeneratedLine < mapping.generatedLine) {
	            node.add(remainingLines.shift() + "\n");
	            lastGeneratedLine++;
	          }
	          if (lastGeneratedColumn < mapping.generatedColumn) {
	            var nextLine = remainingLines[0];
	            node.add(nextLine.substr(0, mapping.generatedColumn));
	            remainingLines[0] = nextLine.substr(mapping.generatedColumn);
	            lastGeneratedColumn = mapping.generatedColumn;
	          }
	        } else {
	          // We add the code from "lastMapping" to "mapping":
	          // First check if there is a new line in between.
	          if (lastGeneratedLine < mapping.generatedLine) {
	            var code = "";
	            // Associate full lines with "lastMapping"
	            do {
	              code += remainingLines.shift() + "\n";
	              lastGeneratedLine++;
	              lastGeneratedColumn = 0;
	            } while (lastGeneratedLine < mapping.generatedLine);
	            // When we reached the correct line, we add code until we
	            // reach the correct column too.
	            if (lastGeneratedColumn < mapping.generatedColumn) {
	              var nextLine = remainingLines[0];
	              code += nextLine.substr(0, mapping.generatedColumn);
	              remainingLines[0] = nextLine.substr(mapping.generatedColumn);
	              lastGeneratedColumn = mapping.generatedColumn;
	            }
	            // Create the SourceNode.
	            addMappingWithCode(lastMapping, code);
	          } else {
	            // There is no new line in between.
	            // Associate the code between "lastGeneratedColumn" and
	            // "mapping.generatedColumn" with "lastMapping"
	            var nextLine = remainingLines[0];
	            var code = nextLine.substr(0, mapping.generatedColumn -
	                                          lastGeneratedColumn);
	            remainingLines[0] = nextLine.substr(mapping.generatedColumn -
	                                                lastGeneratedColumn);
	            lastGeneratedColumn = mapping.generatedColumn;
	            addMappingWithCode(lastMapping, code);
	          }
	        }
	        lastMapping = mapping;
	      }, this);
	      // We have processed all mappings.
	      // Associate the remaining code in the current line with "lastMapping"
	      // and add the remaining lines without any mapping
	      addMappingWithCode(lastMapping, remainingLines.join("\n"));

	      // Copy sourcesContent into SourceNode
	      aSourceMapConsumer.sources.forEach(function (sourceFile) {
	        var content = aSourceMapConsumer.sourceContentFor(sourceFile);
	        if (content) {
	          node.setSourceContent(sourceFile, content);
	        }
	      });

	      return node;

	      function addMappingWithCode(mapping, code) {
	        if (mapping === null || mapping.source === undefined) {
	          node.add(code);
	        } else {
	          node.add(new SourceNode(mapping.originalLine,
	                                  mapping.originalColumn,
	                                  mapping.source,
	                                  code,
	                                  mapping.name));
	        }
	      }
	    };

	  /**
	   * Add a chunk of generated JS to this source node.
	   *
	   * @param aChunk A string snippet of generated JS code, another instance of
	   *        SourceNode, or an array where each member is one of those things.
	   */
	  SourceNode.prototype.add = function SourceNode_add(aChunk) {
	    if (Array.isArray(aChunk)) {
	      aChunk.forEach(function (chunk) {
	        this.add(chunk);
	      }, this);
	    }
	    else if (aChunk instanceof SourceNode || typeof aChunk === "string") {
	      if (aChunk) {
	        this.children.push(aChunk);
	      }
	    }
	    else {
	      throw new TypeError(
	        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
	      );
	    }
	    return this;
	  };

	  /**
	   * Add a chunk of generated JS to the beginning of this source node.
	   *
	   * @param aChunk A string snippet of generated JS code, another instance of
	   *        SourceNode, or an array where each member is one of those things.
	   */
	  SourceNode.prototype.prepend = function SourceNode_prepend(aChunk) {
	    if (Array.isArray(aChunk)) {
	      for (var i = aChunk.length-1; i >= 0; i--) {
	        this.prepend(aChunk[i]);
	      }
	    }
	    else if (aChunk instanceof SourceNode || typeof aChunk === "string") {
	      this.children.unshift(aChunk);
	    }
	    else {
	      throw new TypeError(
	        "Expected a SourceNode, string, or an array of SourceNodes and strings. Got " + aChunk
	      );
	    }
	    return this;
	  };

	  /**
	   * Walk over the tree of JS snippets in this node and its children. The
	   * walking function is called once for each snippet of JS and is passed that
	   * snippet and the its original associated source's line/column location.
	   *
	   * @param aFn The traversal function.
	   */
	  SourceNode.prototype.walk = function SourceNode_walk(aFn) {
	    var chunk;
	    for (var i = 0, len = this.children.length; i < len; i++) {
	      chunk = this.children[i];
	      if (chunk instanceof SourceNode) {
	        chunk.walk(aFn);
	      }
	      else {
	        if (chunk !== '') {
	          aFn(chunk, { source: this.source,
	                       line: this.line,
	                       column: this.column,
	                       name: this.name });
	        }
	      }
	    }
	  };

	  /**
	   * Like `String.prototype.join` except for SourceNodes. Inserts `aStr` between
	   * each of `this.children`.
	   *
	   * @param aSep The separator.
	   */
	  SourceNode.prototype.join = function SourceNode_join(aSep) {
	    var newChildren;
	    var i;
	    var len = this.children.length;
	    if (len > 0) {
	      newChildren = [];
	      for (i = 0; i < len-1; i++) {
	        newChildren.push(this.children[i]);
	        newChildren.push(aSep);
	      }
	      newChildren.push(this.children[i]);
	      this.children = newChildren;
	    }
	    return this;
	  };

	  /**
	   * Call String.prototype.replace on the very right-most source snippet. Useful
	   * for trimming whitespace from the end of a source node, etc.
	   *
	   * @param aPattern The pattern to replace.
	   * @param aReplacement The thing to replace the pattern with.
	   */
	  SourceNode.prototype.replaceRight = function SourceNode_replaceRight(aPattern, aReplacement) {
	    var lastChild = this.children[this.children.length - 1];
	    if (lastChild instanceof SourceNode) {
	      lastChild.replaceRight(aPattern, aReplacement);
	    }
	    else if (typeof lastChild === 'string') {
	      this.children[this.children.length - 1] = lastChild.replace(aPattern, aReplacement);
	    }
	    else {
	      this.children.push(''.replace(aPattern, aReplacement));
	    }
	    return this;
	  };

	  /**
	   * Set the source content for a source file. This will be added to the SourceMapGenerator
	   * in the sourcesContent field.
	   *
	   * @param aSourceFile The filename of the source file
	   * @param aSourceContent The content of the source file
	   */
	  SourceNode.prototype.setSourceContent =
	    function SourceNode_setSourceContent(aSourceFile, aSourceContent) {
	      this.sourceContents[util.toSetString(aSourceFile)] = aSourceContent;
	    };

	  /**
	   * Walk over the tree of SourceNodes. The walking function is called for each
	   * source file content and is passed the filename and source content.
	   *
	   * @param aFn The traversal function.
	   */
	  SourceNode.prototype.walkSourceContents =
	    function SourceNode_walkSourceContents(aFn) {
	      for (var i = 0, len = this.children.length; i < len; i++) {
	        if (this.children[i] instanceof SourceNode) {
	          this.children[i].walkSourceContents(aFn);
	        }
	      }

	      var sources = Object.keys(this.sourceContents);
	      for (var i = 0, len = sources.length; i < len; i++) {
	        aFn(util.fromSetString(sources[i]), this.sourceContents[sources[i]]);
	      }
	    };

	  /**
	   * Return the string representation of this source node. Walks over the tree
	   * and concatenates all the various snippets together to one string.
	   */
	  SourceNode.prototype.toString = function SourceNode_toString() {
	    var str = "";
	    this.walk(function (chunk) {
	      str += chunk;
	    });
	    return str;
	  };

	  /**
	   * Returns the string representation of this source node along with a source
	   * map.
	   */
	  SourceNode.prototype.toStringWithSourceMap = function SourceNode_toStringWithSourceMap(aArgs) {
	    var generated = {
	      code: "",
	      line: 1,
	      column: 0
	    };
	    var map = new SourceMapGenerator(aArgs);
	    var sourceMappingActive = false;
	    var lastOriginalSource = null;
	    var lastOriginalLine = null;
	    var lastOriginalColumn = null;
	    var lastOriginalName = null;
	    this.walk(function (chunk, original) {
	      generated.code += chunk;
	      if (original.source !== null
	          && original.line !== null
	          && original.column !== null) {
	        if(lastOriginalSource !== original.source
	           || lastOriginalLine !== original.line
	           || lastOriginalColumn !== original.column
	           || lastOriginalName !== original.name) {
	          map.addMapping({
	            source: original.source,
	            original: {
	              line: original.line,
	              column: original.column
	            },
	            generated: {
	              line: generated.line,
	              column: generated.column
	            },
	            name: original.name
	          });
	        }
	        lastOriginalSource = original.source;
	        lastOriginalLine = original.line;
	        lastOriginalColumn = original.column;
	        lastOriginalName = original.name;
	        sourceMappingActive = true;
	      } else if (sourceMappingActive) {
	        map.addMapping({
	          generated: {
	            line: generated.line,
	            column: generated.column
	          }
	        });
	        lastOriginalSource = null;
	        sourceMappingActive = false;
	      }
	      chunk.split('').forEach(function (ch) {
	        if (ch === '\n') {
	          generated.line++;
	          generated.column = 0;
	        } else {
	          generated.column++;
	        }
	      });
	    });
	    this.walkSourceContents(function (sourceFile, sourceContent) {
	      map.setSourceContent(sourceFile, sourceContent);
	    });

	    return { code: generated.code, map: map };
	  };

	  exports.SourceNode = SourceNode;

	}.call(exports, __webpack_require__, exports, module), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));


/***/ },
/* 40 */
/***/ function(module, exports, __webpack_require__) {

	var defaults = {
	    // If you want to use a different branch of esprima, or any other
	    // module that supports a .parse function, pass that module object to
	    // recast.parse as options.esprima.
	    esprima: __webpack_require__(41),

	    // Number of spaces the pretty-printer should use per tab for
	    // indentation. If you do not pass this option explicitly, it will be
	    // (quite reliably!) inferred from the original code.
	    tabWidth: 4,

	    // If you really want the pretty-printer to use tabs instead of
	    // spaces, make this option true.
	    useTabs: false,

	    // The reprinting code leaves leading whitespace untouched unless it
	    // has to reindent a line, or you pass false for this option.
	    reuseWhitespace: true,

	    // Some of the pretty-printer code (such as that for printing function
	    // parameter lists) makes a valiant attempt to prevent really long
	    // lines. You can adjust the limit by changing this option; however,
	    // there is no guarantee that line length will fit inside this limit.
	    wrapColumn: 74, // Aspirational for now.

	    // Pass a string as options.sourceFileName to recast.parse to tell the
	    // reprinter to keep track of reused code so that it can construct a
	    // source map automatically.
	    sourceFileName: null,

	    // Pass a string as options.sourceMapName to recast.print, and
	    // (provided you passed options.sourceFileName earlier) the
	    // PrintResult of recast.print will have a .map property for the
	    // generated source map.
	    sourceMapName: null,

	    // If provided, this option will be passed along to the source map
	    // generator as a root directory for relative source file paths.
	    sourceRoot: null,

	    // If you provide a source map that was generated from a previous call
	    // to recast.print as options.inputSourceMap, the old source map will
	    // be composed with the new source map.
	    inputSourceMap: null,

	    // If you want esprima to generate .range information (recast only
	    // uses .loc internally), pass true for this option.
	    range: false,

	    // If you want esprima not to throw exceptions when it encounters
	    // non-fatal errors, keep this option true.
	    tolerant: true
	}, hasOwn = defaults.hasOwnProperty;

	// Copy options and fill in default values.
	exports.normalize = function(options) {
	    options = options || defaults;

	    function get(key) {
	        return hasOwn.call(options, key)
	            ? options[key]
	            : defaults[key];
	    }

	    return {
	        tabWidth: +get("tabWidth"),
	        useTabs: !!get("useTabs"),
	        reuseWhitespace: !!get("reuseWhitespace"),
	        wrapColumn: Math.max(get("wrapColumn"), 0),
	        sourceFileName: get("sourceFileName"),
	        sourceMapName: get("sourceMapName"),
	        sourceRoot: get("sourceRoot"),
	        inputSourceMap: get("inputSourceMap"),
	        esprima: get("esprima"),
	        range: get("range"),
	        tolerant: get("tolerant")
	    };
	};


/***/ },
/* 41 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;/*
	  Copyright (C) 2013 Ariya Hidayat <ariya.hidayat@gmail.com>
	  Copyright (C) 2013 Thaddee Tyl <thaddee.tyl@gmail.com>
	  Copyright (C) 2012 Ariya Hidayat <ariya.hidayat@gmail.com>
	  Copyright (C) 2012 Mathias Bynens <mathias@qiwi.be>
	  Copyright (C) 2012 Joost-Wim Boekesteijn <joost-wim@boekesteijn.nl>
	  Copyright (C) 2012 Kris Kowal <kris.kowal@cixar.com>
	  Copyright (C) 2012 Yusuke Suzuki <utatane.tea@gmail.com>
	  Copyright (C) 2012 Arpad Borsos <arpad.borsos@googlemail.com>
	  Copyright (C) 2011 Ariya Hidayat <ariya.hidayat@gmail.com>

	  Redistribution and use in source and binary forms, with or without
	  modification, are permitted provided that the following conditions are met:

	    * Redistributions of source code must retain the above copyright
	      notice, this list of conditions and the following disclaimer.
	    * Redistributions in binary form must reproduce the above copyright
	      notice, this list of conditions and the following disclaimer in the
	      documentation and/or other materials provided with the distribution.

	  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
	  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
	  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
	  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
	  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
	  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
	  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
	  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
	  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
	  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
	*/

	(function (root, factory) {
	    'use strict';

	    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js,
	    // Rhino, and plain browser loading.

	    /* istanbul ignore next */
	    if (true) {
	        !(__WEBPACK_AMD_DEFINE_ARRAY__ = [exports], __WEBPACK_AMD_DEFINE_FACTORY__ = (factory), __WEBPACK_AMD_DEFINE_RESULT__ = (typeof __WEBPACK_AMD_DEFINE_FACTORY__ === 'function' ? (__WEBPACK_AMD_DEFINE_FACTORY__.apply(exports, __WEBPACK_AMD_DEFINE_ARRAY__)) : __WEBPACK_AMD_DEFINE_FACTORY__), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));
	    } else if (typeof exports !== 'undefined') {
	        factory(exports);
	    } else {
	        factory((root.esprima = {}));
	    }
	}(this, function (exports) {
	    'use strict';

	    var Token,
	        TokenName,
	        FnExprTokens,
	        Syntax,
	        PropertyKind,
	        Messages,
	        Regex,
	        SyntaxTreeDelegate,
	        ClassPropertyType,
	        source,
	        strict,
	        index,
	        lineNumber,
	        lineStart,
	        length,
	        delegate,
	        lookahead,
	        state,
	        extra;

	    Token = {
	        BooleanLiteral: 1,
	        EOF: 2,
	        Identifier: 3,
	        Keyword: 4,
	        NullLiteral: 5,
	        NumericLiteral: 6,
	        Punctuator: 7,
	        StringLiteral: 8,
	        RegularExpression: 9,
	        Template: 10
	    };

	    TokenName = {};
	    TokenName[Token.BooleanLiteral] = 'Boolean';
	    TokenName[Token.EOF] = '<end>';
	    TokenName[Token.Identifier] = 'Identifier';
	    TokenName[Token.Keyword] = 'Keyword';
	    TokenName[Token.NullLiteral] = 'Null';
	    TokenName[Token.NumericLiteral] = 'Numeric';
	    TokenName[Token.Punctuator] = 'Punctuator';
	    TokenName[Token.StringLiteral] = 'String';
	    TokenName[Token.RegularExpression] = 'RegularExpression';
	    TokenName[Token.Template] = 'Template';

	    // A function following one of those tokens is an expression.
	    FnExprTokens = ['(', '{', '[', 'in', 'typeof', 'instanceof', 'new',
	                    'return', 'case', 'delete', 'throw', 'void',
	                    // assignment operators
	                    '=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '>>>=',
	                    '&=', '|=', '^=', ',',
	                    // binary/unary operators
	                    '+', '-', '*', '/', '%', '++', '--', '<<', '>>', '>>>', '&',
	                    '|', '^', '!', '~', '&&', '||', '?', ':', '===', '==', '>=',
	                    '<=', '<', '>', '!=', '!=='];

	    Syntax = {
	        ArrayExpression: 'ArrayExpression',
	        ArrayPattern: 'ArrayPattern',
	        ArrowFunctionExpression: 'ArrowFunctionExpression',
	        AssignmentExpression: 'AssignmentExpression',
	        BinaryExpression: 'BinaryExpression',
	        BlockStatement: 'BlockStatement',
	        BreakStatement: 'BreakStatement',
	        CallExpression: 'CallExpression',
	        CatchClause: 'CatchClause',
	        ClassBody: 'ClassBody',
	        ClassDeclaration: 'ClassDeclaration',
	        ClassExpression: 'ClassExpression',
	        ComprehensionBlock: 'ComprehensionBlock',
	        ComprehensionExpression: 'ComprehensionExpression',
	        ConditionalExpression: 'ConditionalExpression',
	        ContinueStatement: 'ContinueStatement',
	        DebuggerStatement: 'DebuggerStatement',
	        DoWhileStatement: 'DoWhileStatement',
	        EmptyStatement: 'EmptyStatement',
	        ExportDeclaration: 'ExportDeclaration',
	        ExportBatchSpecifier: 'ExportBatchSpecifier',
	        ExportSpecifier: 'ExportSpecifier',
	        ExpressionStatement: 'ExpressionStatement',
	        ForInStatement: 'ForInStatement',
	        ForOfStatement: 'ForOfStatement',
	        ForStatement: 'ForStatement',
	        FunctionDeclaration: 'FunctionDeclaration',
	        FunctionExpression: 'FunctionExpression',
	        Identifier: 'Identifier',
	        IfStatement: 'IfStatement',
	        ImportDeclaration: 'ImportDeclaration',
	        ImportDefaultSpecifier: 'ImportDefaultSpecifier',
	        ImportNamespaceSpecifier: 'ImportNamespaceSpecifier',
	        ImportSpecifier: 'ImportSpecifier',
	        LabeledStatement: 'LabeledStatement',
	        Literal: 'Literal',
	        LogicalExpression: 'LogicalExpression',
	        MemberExpression: 'MemberExpression',
	        MethodDefinition: 'MethodDefinition',
	        NewExpression: 'NewExpression',
	        ObjectExpression: 'ObjectExpression',
	        ObjectPattern: 'ObjectPattern',
	        Program: 'Program',
	        Property: 'Property',
	        ReturnStatement: 'ReturnStatement',
	        SequenceExpression: 'SequenceExpression',
	        SpreadElement: 'SpreadElement',
	        SwitchCase: 'SwitchCase',
	        SwitchStatement: 'SwitchStatement',
	        TaggedTemplateExpression: 'TaggedTemplateExpression',
	        TemplateElement: 'TemplateElement',
	        TemplateLiteral: 'TemplateLiteral',
	        ThisExpression: 'ThisExpression',
	        ThrowStatement: 'ThrowStatement',
	        TryStatement: 'TryStatement',
	        UnaryExpression: 'UnaryExpression',
	        UpdateExpression: 'UpdateExpression',
	        VariableDeclaration: 'VariableDeclaration',
	        VariableDeclarator: 'VariableDeclarator',
	        WhileStatement: 'WhileStatement',
	        WithStatement: 'WithStatement',
	        YieldExpression: 'YieldExpression'
	    };

	    PropertyKind = {
	        Data: 1,
	        Get: 2,
	        Set: 4
	    };

	    ClassPropertyType = {
	        'static': 'static',
	        prototype: 'prototype'
	    };

	    // Error messages should be identical to V8.
	    Messages = {
	        UnexpectedToken: 'Unexpected token %0',
	        UnexpectedNumber: 'Unexpected number',
	        UnexpectedString: 'Unexpected string',
	        UnexpectedIdentifier: 'Unexpected identifier',
	        UnexpectedReserved: 'Unexpected reserved word',
	        UnexpectedTemplate: 'Unexpected quasi %0',
	        UnexpectedEOS: 'Unexpected end of input',
	        NewlineAfterThrow: 'Illegal newline after throw',
	        InvalidRegExp: 'Invalid regular expression',
	        UnterminatedRegExp: 'Invalid regular expression: missing /',
	        InvalidLHSInAssignment: 'Invalid left-hand side in assignment',
	        InvalidLHSInFormalsList: 'Invalid left-hand side in formals list',
	        InvalidLHSInForIn: 'Invalid left-hand side in for-in',
	        MultipleDefaultsInSwitch: 'More than one default clause in switch statement',
	        NoCatchOrFinally: 'Missing catch or finally after try',
	        UnknownLabel: 'Undefined label \'%0\'',
	        Redeclaration: '%0 \'%1\' has already been declared',
	        IllegalContinue: 'Illegal continue statement',
	        IllegalBreak: 'Illegal break statement',
	        IllegalDuplicateClassProperty: 'Illegal duplicate property in class definition',
	        IllegalClassConstructorProperty: 'Illegal constructor property in class definition',
	        IllegalReturn: 'Illegal return statement',
	        IllegalYield: 'Illegal yield expression',
	        IllegalSpread: 'Illegal spread element',
	        StrictModeWith: 'Strict mode code may not include a with statement',
	        StrictCatchVariable: 'Catch variable may not be eval or arguments in strict mode',
	        StrictVarName: 'Variable name may not be eval or arguments in strict mode',
	        StrictParamName: 'Parameter name eval or arguments is not allowed in strict mode',
	        StrictParamDupe: 'Strict mode function may not have duplicate parameter names',
	        ParameterAfterRestParameter: 'Rest parameter must be final parameter of an argument list',
	        DefaultRestParameter: 'Rest parameter can not have a default value',
	        ElementAfterSpreadElement: 'Spread must be the final element of an element list',
	        ObjectPatternAsRestParameter: 'Invalid rest parameter',
	        ObjectPatternAsSpread: 'Invalid spread argument',
	        StrictFunctionName: 'Function name may not be eval or arguments in strict mode',
	        StrictOctalLiteral: 'Octal literals are not allowed in strict mode.',
	        StrictDelete: 'Delete of an unqualified identifier in strict mode.',
	        StrictDuplicateProperty: 'Duplicate data property in object literal not allowed in strict mode',
	        AccessorDataProperty: 'Object literal may not have data and accessor property with the same name',
	        AccessorGetSet: 'Object literal may not have multiple get/set accessors with the same name',
	        StrictLHSAssignment: 'Assignment to eval or arguments is not allowed in strict mode',
	        StrictLHSPostfix: 'Postfix increment/decrement may not have eval or arguments operand in strict mode',
	        StrictLHSPrefix: 'Prefix increment/decrement may not have eval or arguments operand in strict mode',
	        StrictReservedWord: 'Use of future reserved word in strict mode',
	        MissingFromClause: 'Missing from clause',
	        NoAsAfterImportNamespace: 'Missing as after import *',
	        InvalidModuleSpecifier: 'Invalid module specifier',
	        IllegalImportDeclaration: 'Illegal import declaration',
	        IllegalExportDeclaration: 'Illegal export declaration',
	        NoUninitializedConst: 'Const must be initialized',
	        ComprehensionRequiresBlock: 'Comprehension must have at least one block',
	        ComprehensionError: 'Comprehension Error',
	        EachNotAllowed: 'Each is not supported'
	    };

	    // See also tools/generate-unicode-regex.py.
	    Regex = {
	        NonAsciiIdentifierStart: new RegExp('[\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-\u037d\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u048a-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05d0-\u05ea\u05f0-\u05f2\u0620-\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-\u0815\u081a\u0824\u0828\u0840-\u0858\u08a0\u08a2-\u08ac\u0904-\u0939\u093d\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097f\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c33\u0c35-\u0c39\u0c3d\u0c58\u0c59\u0c60\u0c61\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cde\u0ce0\u0ce1\u0cf1\u0cf2\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d60\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb0\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f4\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f0\u1700-\u170c\u170e-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3\u17d7\u17dc\u1820-\u1877\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191c\u1950-\u196d\u1970-\u1974\u1980-\u19ab\u19c1-\u19c7\u1a00-\u1a16\u1a20-\u1a54\u1aa7\u1b05-\u1b33\u1b45-\u1b4b\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23\u1c4d-\u1c4f\u1c5a-\u1c7d\u1ce9-\u1cec\u1cee-\u1cf1\u1cf5\u1cf6\u1d00-\u1dbf\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2119-\u211d\u2124\u2126\u2128\u212a-\u212d\u212f-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u2e2f\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303c\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-\u9fcc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-\ua66e\ua67f-\ua697\ua6a0-\ua6ef\ua717-\ua71f\ua722-\ua788\ua78b-\ua78e\ua790-\ua793\ua7a0-\ua7aa\ua7f8-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-\ua8b3\ua8f2-\ua8f7\ua8fb\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-\ua9b2\ua9cf\uaa00-\uaa28\uaa40-\uaa42\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa80-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uabc0-\uabe2\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc]'),
	        NonAsciiIdentifierPart: new RegExp('[\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0300-\u0374\u0376\u0377\u037a-\u037d\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u0483-\u0487\u048a-\u0527\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u05d0-\u05ea\u05f0-\u05f2\u0610-\u061a\u0620-\u0669\u066e-\u06d3\u06d5-\u06dc\u06df-\u06e8\u06ea-\u06fc\u06ff\u0710-\u074a\u074d-\u07b1\u07c0-\u07f5\u07fa\u0800-\u082d\u0840-\u085b\u08a0\u08a2-\u08ac\u08e4-\u08fe\u0900-\u0963\u0966-\u096f\u0971-\u0977\u0979-\u097f\u0981-\u0983\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bc-\u09c4\u09c7\u09c8\u09cb-\u09ce\u09d7\u09dc\u09dd\u09df-\u09e3\u09e6-\u09f1\u0a01-\u0a03\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a3c\u0a3e-\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a59-\u0a5c\u0a5e\u0a66-\u0a75\u0a81-\u0a83\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abc-\u0ac5\u0ac7-\u0ac9\u0acb-\u0acd\u0ad0\u0ae0-\u0ae3\u0ae6-\u0aef\u0b01-\u0b03\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3c-\u0b44\u0b47\u0b48\u0b4b-\u0b4d\u0b56\u0b57\u0b5c\u0b5d\u0b5f-\u0b63\u0b66-\u0b6f\u0b71\u0b82\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bbe-\u0bc2\u0bc6-\u0bc8\u0bca-\u0bcd\u0bd0\u0bd7\u0be6-\u0bef\u0c01-\u0c03\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c33\u0c35-\u0c39\u0c3d-\u0c44\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c58\u0c59\u0c60-\u0c63\u0c66-\u0c6f\u0c82\u0c83\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbc-\u0cc4\u0cc6-\u0cc8\u0cca-\u0ccd\u0cd5\u0cd6\u0cde\u0ce0-\u0ce3\u0ce6-\u0cef\u0cf1\u0cf2\u0d02\u0d03\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d-\u0d44\u0d46-\u0d48\u0d4a-\u0d4e\u0d57\u0d60-\u0d63\u0d66-\u0d6f\u0d7a-\u0d7f\u0d82\u0d83\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0dca\u0dcf-\u0dd4\u0dd6\u0dd8-\u0ddf\u0df2\u0df3\u0e01-\u0e3a\u0e40-\u0e4e\u0e50-\u0e59\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb9\u0ebb-\u0ebd\u0ec0-\u0ec4\u0ec6\u0ec8-\u0ecd\u0ed0-\u0ed9\u0edc-\u0edf\u0f00\u0f18\u0f19\u0f20-\u0f29\u0f35\u0f37\u0f39\u0f3e-\u0f47\u0f49-\u0f6c\u0f71-\u0f84\u0f86-\u0f97\u0f99-\u0fbc\u0fc6\u1000-\u1049\u1050-\u109d\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u135d-\u135f\u1380-\u138f\u13a0-\u13f4\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f0\u1700-\u170c\u170e-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176c\u176e-\u1770\u1772\u1773\u1780-\u17d3\u17d7\u17dc\u17dd\u17e0-\u17e9\u180b-\u180d\u1810-\u1819\u1820-\u1877\u1880-\u18aa\u18b0-\u18f5\u1900-\u191c\u1920-\u192b\u1930-\u193b\u1946-\u196d\u1970-\u1974\u1980-\u19ab\u19b0-\u19c9\u19d0-\u19d9\u1a00-\u1a1b\u1a20-\u1a5e\u1a60-\u1a7c\u1a7f-\u1a89\u1a90-\u1a99\u1aa7\u1b00-\u1b4b\u1b50-\u1b59\u1b6b-\u1b73\u1b80-\u1bf3\u1c00-\u1c37\u1c40-\u1c49\u1c4d-\u1c7d\u1cd0-\u1cd2\u1cd4-\u1cf6\u1d00-\u1de6\u1dfc-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u200c\u200d\u203f\u2040\u2054\u2071\u207f\u2090-\u209c\u20d0-\u20dc\u20e1\u20e5-\u20f0\u2102\u2107\u210a-\u2113\u2115\u2119-\u211d\u2124\u2126\u2128\u212a-\u212d\u212f-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d7f-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u2de0-\u2dff\u2e2f\u3005-\u3007\u3021-\u302f\u3031-\u3035\u3038-\u303c\u3041-\u3096\u3099\u309a\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-\u9fcc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua62b\ua640-\ua66f\ua674-\ua67d\ua67f-\ua697\ua69f-\ua6f1\ua717-\ua71f\ua722-\ua788\ua78b-\ua78e\ua790-\ua793\ua7a0-\ua7aa\ua7f8-\ua827\ua840-\ua873\ua880-\ua8c4\ua8d0-\ua8d9\ua8e0-\ua8f7\ua8fb\ua900-\ua92d\ua930-\ua953\ua960-\ua97c\ua980-\ua9c0\ua9cf-\ua9d9\uaa00-\uaa36\uaa40-\uaa4d\uaa50-\uaa59\uaa60-\uaa76\uaa7a\uaa7b\uaa80-\uaac2\uaadb-\uaadd\uaae0-\uaaef\uaaf2-\uaaf6\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uabc0-\uabea\uabec\uabed\uabf0-\uabf9\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe00-\ufe0f\ufe20-\ufe26\ufe33\ufe34\ufe4d-\ufe4f\ufe70-\ufe74\ufe76-\ufefc\uff10-\uff19\uff21-\uff3a\uff3f\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc]')
	    };

	    // Ensure the condition is true, otherwise throw an error.
	    // This is only to have a better contract semantic, i.e. another safety net
	    // to catch a logic error. The condition shall be fulfilled in normal case.
	    // Do NOT use this to enforce a certain condition on any user input.

	    function assert(condition, message) {
	        /* istanbul ignore if */
	        if (!condition) {
	            throw new Error('ASSERT: ' + message);
	        }
	    }

	    function StringMap() {
	        this.$data = {};
	    }

	    StringMap.prototype.get = function (key) {
	        key = '$' + key;
	        return this.$data[key];
	    };

	    StringMap.prototype.set = function (key, value) {
	        key = '$' + key;
	        this.$data[key] = value;
	        return this;
	    };

	    StringMap.prototype.has = function (key) {
	        key = '$' + key;
	        return Object.prototype.hasOwnProperty.call(this.$data, key);
	    };

	    StringMap.prototype.delete = function (key) {
	        key = '$' + key;
	        return delete this.$data[key];
	    };

	    function isDecimalDigit(ch) {
	        return (ch >= 48 && ch <= 57);   // 0..9
	    }

	    function isHexDigit(ch) {
	        return '0123456789abcdefABCDEF'.indexOf(ch) >= 0;
	    }

	    function isOctalDigit(ch) {
	        return '01234567'.indexOf(ch) >= 0;
	    }


	    // 7.2 White Space

	    function isWhiteSpace(ch) {
	        return (ch === 32) ||  // space
	            (ch === 9) ||      // tab
	            (ch === 0xB) ||
	            (ch === 0xC) ||
	            (ch === 0xA0) ||
	            (ch >= 0x1680 && '\u1680\u180E\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\uFEFF'.indexOf(String.fromCharCode(ch)) > 0);
	    }

	    // 7.3 Line Terminators

	    function isLineTerminator(ch) {
	        return (ch === 10) || (ch === 13) || (ch === 0x2028) || (ch === 0x2029);
	    }

	    // 7.6 Identifier Names and Identifiers

	    function isIdentifierStart(ch) {
	        return (ch === 36) || (ch === 95) ||  // $ (dollar) and _ (underscore)
	            (ch >= 65 && ch <= 90) ||         // A..Z
	            (ch >= 97 && ch <= 122) ||        // a..z
	            (ch === 92) ||                    // \ (backslash)
	            ((ch >= 0x80) && Regex.NonAsciiIdentifierStart.test(String.fromCharCode(ch)));
	    }

	    function isIdentifierPart(ch) {
	        return (ch === 36) || (ch === 95) ||  // $ (dollar) and _ (underscore)
	            (ch >= 65 && ch <= 90) ||         // A..Z
	            (ch >= 97 && ch <= 122) ||        // a..z
	            (ch >= 48 && ch <= 57) ||         // 0..9
	            (ch === 92) ||                    // \ (backslash)
	            ((ch >= 0x80) && Regex.NonAsciiIdentifierPart.test(String.fromCharCode(ch)));
	    }

	    // 7.6.1.2 Future Reserved Words

	    function isFutureReservedWord(id) {
	        switch (id) {
	        case 'class':
	        case 'enum':
	        case 'export':
	        case 'extends':
	        case 'import':
	        case 'super':
	            return true;
	        default:
	            return false;
	        }
	    }

	    function isStrictModeReservedWord(id) {
	        switch (id) {
	        case 'implements':
	        case 'interface':
	        case 'package':
	        case 'private':
	        case 'protected':
	        case 'public':
	        case 'static':
	        case 'yield':
	        case 'let':
	            return true;
	        default:
	            return false;
	        }
	    }

	    function isRestrictedWord(id) {
	        return id === 'eval' || id === 'arguments';
	    }

	    // 7.6.1.1 Keywords

	    function isKeyword(id) {
	        if (strict && isStrictModeReservedWord(id)) {
	            return true;
	        }

	        // 'const' is specialized as Keyword in V8.
	        // 'yield' is only treated as a keyword in strict mode.
	        // 'let' is for compatiblity with SpiderMonkey and ES.next.
	        // Some others are from future reserved words.

	        switch (id.length) {
	        case 2:
	            return (id === 'if') || (id === 'in') || (id === 'do');
	        case 3:
	            return (id === 'var') || (id === 'for') || (id === 'new') ||
	                (id === 'try') || (id === 'let');
	        case 4:
	            return (id === 'this') || (id === 'else') || (id === 'case') ||
	                (id === 'void') || (id === 'with') || (id === 'enum');
	        case 5:
	            return (id === 'while') || (id === 'break') || (id === 'catch') ||
	                (id === 'throw') || (id === 'const') ||
	                (id === 'class') || (id === 'super');
	        case 6:
	            return (id === 'return') || (id === 'typeof') || (id === 'delete') ||
	                (id === 'switch') || (id === 'export') || (id === 'import');
	        case 7:
	            return (id === 'default') || (id === 'finally') || (id === 'extends');
	        case 8:
	            return (id === 'function') || (id === 'continue') || (id === 'debugger');
	        case 10:
	            return (id === 'instanceof');
	        default:
	            return false;
	        }
	    }

	    // 7.4 Comments

	    function addComment(type, value, start, end, loc) {
	        var comment;
	        assert(typeof start === 'number', 'Comment must have valid position');

	        // Because the way the actual token is scanned, often the comments
	        // (if any) are skipped twice during the lexical analysis.
	        // Thus, we need to skip adding a comment if the comment array already
	        // handled it.
	        if (state.lastCommentStart >= start) {
	            return;
	        }
	        state.lastCommentStart = start;

	        comment = {
	            type: type,
	            value: value
	        };
	        if (extra.range) {
	            comment.range = [start, end];
	        }
	        if (extra.loc) {
	            comment.loc = loc;
	        }
	        extra.comments.push(comment);
	        if (extra.attachComment) {
	            extra.leadingComments.push(comment);
	            extra.trailingComments.push(comment);
	        }
	    }

	    function skipSingleLineComment() {
	        var start, loc, ch, comment;

	        start = index - 2;
	        loc = {
	            start: {
	                line: lineNumber,
	                column: index - lineStart - 2
	            }
	        };

	        while (index < length) {
	            ch = source.charCodeAt(index);
	            ++index;
	            if (isLineTerminator(ch)) {
	                if (extra.comments) {
	                    comment = source.slice(start + 2, index - 1);
	                    loc.end = {
	                        line: lineNumber,
	                        column: index - lineStart - 1
	                    };
	                    addComment('Line', comment, start, index - 1, loc);
	                }
	                if (ch === 13 && source.charCodeAt(index) === 10) {
	                    ++index;
	                }
	                ++lineNumber;
	                lineStart = index;
	                return;
	            }
	        }

	        if (extra.comments) {
	            comment = source.slice(start + 2, index);
	            loc.end = {
	                line: lineNumber,
	                column: index - lineStart
	            };
	            addComment('Line', comment, start, index, loc);
	        }
	    }

	    function skipMultiLineComment() {
	        var start, loc, ch, comment;

	        if (extra.comments) {
	            start = index - 2;
	            loc = {
	                start: {
	                    line: lineNumber,
	                    column: index - lineStart - 2
	                }
	            };
	        }

	        while (index < length) {
	            ch = source.charCodeAt(index);
	            if (isLineTerminator(ch)) {
	                if (ch === 13 && source.charCodeAt(index + 1) === 10) {
	                    ++index;
	                }
	                ++lineNumber;
	                ++index;
	                lineStart = index;
	                if (index >= length) {
	                    throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	                }
	            } else if (ch === 42) {
	                // Block comment ends with '*/' (char #42, char #47).
	                if (source.charCodeAt(index + 1) === 47) {
	                    ++index;
	                    ++index;
	                    if (extra.comments) {
	                        comment = source.slice(start + 2, index - 2);
	                        loc.end = {
	                            line: lineNumber,
	                            column: index - lineStart
	                        };
	                        addComment('Block', comment, start, index, loc);
	                    }
	                    return;
	                }
	                ++index;
	            } else {
	                ++index;
	            }
	        }

	        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	    }

	    function skipComment() {
	        var ch;

	        while (index < length) {
	            ch = source.charCodeAt(index);

	            if (isWhiteSpace(ch)) {
	                ++index;
	            } else if (isLineTerminator(ch)) {
	                ++index;
	                if (ch === 13 && source.charCodeAt(index) === 10) {
	                    ++index;
	                }
	                ++lineNumber;
	                lineStart = index;
	            } else if (ch === 47) { // 47 is '/'
	                ch = source.charCodeAt(index + 1);
	                if (ch === 47) {
	                    ++index;
	                    ++index;
	                    skipSingleLineComment();
	                } else if (ch === 42) {  // 42 is '*'
	                    ++index;
	                    ++index;
	                    skipMultiLineComment();
	                } else {
	                    break;
	                }
	            } else {
	                break;
	            }
	        }
	    }

	    function scanHexEscape(prefix) {
	        var i, len, ch, code = 0;

	        len = (prefix === 'u') ? 4 : 2;
	        for (i = 0; i < len; ++i) {
	            if (index < length && isHexDigit(source[index])) {
	                ch = source[index++];
	                code = code * 16 + '0123456789abcdef'.indexOf(ch.toLowerCase());
	            } else {
	                return '';
	            }
	        }
	        return String.fromCharCode(code);
	    }

	    function scanUnicodeCodePointEscape() {
	        var ch, code, cu1, cu2;

	        ch = source[index];
	        code = 0;

	        // At least, one hex digit is required.
	        if (ch === '}') {
	            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	        }

	        while (index < length) {
	            ch = source[index++];
	            if (!isHexDigit(ch)) {
	                break;
	            }
	            code = code * 16 + '0123456789abcdef'.indexOf(ch.toLowerCase());
	        }

	        if (code > 0x10FFFF || ch !== '}') {
	            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	        }

	        // UTF-16 Encoding
	        if (code <= 0xFFFF) {
	            return String.fromCharCode(code);
	        }
	        cu1 = ((code - 0x10000) >> 10) + 0xD800;
	        cu2 = ((code - 0x10000) & 1023) + 0xDC00;
	        return String.fromCharCode(cu1, cu2);
	    }

	    function getEscapedIdentifier() {
	        var ch, id;

	        ch = source.charCodeAt(index++);
	        id = String.fromCharCode(ch);

	        // '\u' (char #92, char #117) denotes an escaped character.
	        if (ch === 92) {
	            if (source.charCodeAt(index) !== 117) {
	                throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	            }
	            ++index;
	            ch = scanHexEscape('u');
	            if (!ch || ch === '\\' || !isIdentifierStart(ch.charCodeAt(0))) {
	                throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	            }
	            id = ch;
	        }

	        while (index < length) {
	            ch = source.charCodeAt(index);
	            if (!isIdentifierPart(ch)) {
	                break;
	            }
	            ++index;
	            id += String.fromCharCode(ch);

	            // '\u' (char #92, char #117) denotes an escaped character.
	            if (ch === 92) {
	                id = id.substr(0, id.length - 1);
	                if (source.charCodeAt(index) !== 117) {
	                    throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	                }
	                ++index;
	                ch = scanHexEscape('u');
	                if (!ch || ch === '\\' || !isIdentifierPart(ch.charCodeAt(0))) {
	                    throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	                }
	                id += ch;
	            }
	        }

	        return id;
	    }

	    function getIdentifier() {
	        var start, ch;

	        start = index++;
	        while (index < length) {
	            ch = source.charCodeAt(index);
	            if (ch === 92) {
	                // Blackslash (char #92) marks Unicode escape sequence.
	                index = start;
	                return getEscapedIdentifier();
	            }
	            if (isIdentifierPart(ch)) {
	                ++index;
	            } else {
	                break;
	            }
	        }

	        return source.slice(start, index);
	    }

	    function scanIdentifier() {
	        var start, id, type;

	        start = index;

	        // Backslash (char #92) starts an escaped character.
	        id = (source.charCodeAt(index) === 92) ? getEscapedIdentifier() : getIdentifier();

	        // There is no keyword or literal with only one character.
	        // Thus, it must be an identifier.
	        if (id.length === 1) {
	            type = Token.Identifier;
	        } else if (isKeyword(id)) {
	            type = Token.Keyword;
	        } else if (id === 'null') {
	            type = Token.NullLiteral;
	        } else if (id === 'true' || id === 'false') {
	            type = Token.BooleanLiteral;
	        } else {
	            type = Token.Identifier;
	        }

	        return {
	            type: type,
	            value: id,
	            lineNumber: lineNumber,
	            lineStart: lineStart,
	            range: [start, index]
	        };
	    }


	    // 7.7 Punctuators

	    function scanPunctuator() {
	        var start = index,
	            code = source.charCodeAt(index),
	            code2,
	            ch1 = source[index],
	            ch2,
	            ch3,
	            ch4;

	        switch (code) {
	        // Check for most common single-character punctuators.
	        case 40:   // ( open bracket
	        case 41:   // ) close bracket
	        case 59:   // ; semicolon
	        case 44:   // , comma
	        case 91:   // [
	        case 93:   // ]
	        case 58:   // :
	        case 63:   // ?
	        case 126:  // ~
	            ++index;
	            if (extra.tokenize && code === 40) {
	                extra.openParenToken = extra.tokens.length;
	            }

	            return {
	                type: Token.Punctuator,
	                value: String.fromCharCode(code),
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };

	        case 123:  // { open curly brace
	        case 125:  // } close curly brace
	            ++index;
	            if (extra.tokenize && code === 123) {
	                extra.openCurlyToken = extra.tokens.length;
	            }

	            // lookahead2 function can cause tokens to be scanned twice and in doing so
	            // would wreck the curly stack by pushing the same token onto the stack twice.
	            // curlyLastIndex ensures each token is pushed or popped exactly once
	            if (index > state.curlyLastIndex) {
	                state.curlyLastIndex = index;
	                if (code === 123) {
	                    state.curlyStack.push('{');
	                } else {
	                    state.curlyStack.pop();
	                }
	            }

	            return {
	                type: Token.Punctuator,
	                value: String.fromCharCode(code),
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };

	        default:
	            code2 = source.charCodeAt(index + 1);

	            // '=' (char #61) marks an assignment or comparison operator.
	            if (code2 === 61) {
	                switch (code) {
	                case 37:  // %
	                case 38:  // &
	                case 42:  // *:
	                case 43:  // +
	                case 45:  // -
	                case 47:  // /
	                case 60:  // <
	                case 62:  // >
	                case 94:  // ^
	                case 124: // |
	                    index += 2;
	                    return {
	                        type: Token.Punctuator,
	                        value: String.fromCharCode(code) + String.fromCharCode(code2),
	                        lineNumber: lineNumber,
	                        lineStart: lineStart,
	                        range: [start, index]
	                    };

	                case 33: // !
	                case 61: // =
	                    index += 2;

	                    // !== and ===
	                    if (source.charCodeAt(index) === 61) {
	                        ++index;
	                    }
	                    return {
	                        type: Token.Punctuator,
	                        value: source.slice(start, index),
	                        lineNumber: lineNumber,
	                        lineStart: lineStart,
	                        range: [start, index]
	                    };
	                default:
	                    break;
	                }
	            }
	            break;
	        }

	        // Peek more characters.

	        ch2 = source[index + 1];
	        ch3 = source[index + 2];
	        ch4 = source[index + 3];

	        // 4-character punctuator: >>>=

	        if (ch1 === '>' && ch2 === '>' && ch3 === '>') {
	            if (ch4 === '=') {
	                index += 4;
	                return {
	                    type: Token.Punctuator,
	                    value: '>>>=',
	                    lineNumber: lineNumber,
	                    lineStart: lineStart,
	                    range: [start, index]
	                };
	            }
	        }

	        // 3-character punctuators: === !== >>> <<= >>=

	        if (ch1 === '>' && ch2 === '>' && ch3 === '>') {
	            index += 3;
	            return {
	                type: Token.Punctuator,
	                value: '>>>',
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        if (ch1 === '<' && ch2 === '<' && ch3 === '=') {
	            index += 3;
	            return {
	                type: Token.Punctuator,
	                value: '<<=',
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        if (ch1 === '>' && ch2 === '>' && ch3 === '=') {
	            index += 3;
	            return {
	                type: Token.Punctuator,
	                value: '>>=',
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        if (ch1 === '.' && ch2 === '.' && ch3 === '.') {
	            index += 3;
	            return {
	                type: Token.Punctuator,
	                value: '...',
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        // Other 2-character punctuators: ++ -- << >> && ||

	        if (ch1 === ch2 && ('+-<>&|'.indexOf(ch1) >= 0)) {
	            index += 2;
	            return {
	                type: Token.Punctuator,
	                value: ch1 + ch2,
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        if (ch1 === '=' && ch2 === '>') {
	            index += 2;
	            return {
	                type: Token.Punctuator,
	                value: '=>',
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        if ('<>=!+-*%&|^/'.indexOf(ch1) >= 0) {
	            ++index;
	            return {
	                type: Token.Punctuator,
	                value: ch1,
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        if (ch1 === '.') {
	            ++index;
	            return {
	                type: Token.Punctuator,
	                value: ch1,
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	    }

	    // 7.8.3 Numeric Literals

	    function scanHexLiteral(start) {
	        var number = '';

	        while (index < length) {
	            if (!isHexDigit(source[index])) {
	                break;
	            }
	            number += source[index++];
	        }

	        if (number.length === 0) {
	            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	        }

	        if (isIdentifierStart(source.charCodeAt(index))) {
	            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	        }

	        return {
	            type: Token.NumericLiteral,
	            value: parseInt('0x' + number, 16),
	            lineNumber: lineNumber,
	            lineStart: lineStart,
	            range: [start, index]
	        };
	    }

	    function scanBinaryLiteral(start) {
	        var ch, number;

	        number = '';

	        while (index < length) {
	            ch = source[index];
	            if (ch !== '0' && ch !== '1') {
	                break;
	            }
	            number += source[index++];
	        }

	        if (number.length === 0) {
	            // only 0b or 0B
	            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	        }

	        if (index < length) {
	            ch = source.charCodeAt(index);
	            /* istanbul ignore else */
	            if (isIdentifierStart(ch) || isDecimalDigit(ch)) {
	                throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	            }
	        }

	        return {
	            type: Token.NumericLiteral,
	            value: parseInt(number, 2),
	            lineNumber: lineNumber,
	            lineStart: lineStart,
	            range: [start, index]
	        };
	    }

	    function scanOctalLiteral(prefix, start) {
	        var number, octal;

	        if (isOctalDigit(prefix)) {
	            octal = true;
	            number = '0' + source[index++];
	        } else {
	            octal = false;
	            ++index;
	            number = '';
	        }

	        while (index < length) {
	            if (!isOctalDigit(source[index])) {
	                break;
	            }
	            number += source[index++];
	        }

	        if (!octal && number.length === 0) {
	            // only 0o or 0O
	            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	        }

	        if (isIdentifierStart(source.charCodeAt(index)) || isDecimalDigit(source.charCodeAt(index))) {
	            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	        }

	        return {
	            type: Token.NumericLiteral,
	            value: parseInt(number, 8),
	            octal: octal,
	            lineNumber: lineNumber,
	            lineStart: lineStart,
	            range: [start, index]
	        };
	    }

	    function scanNumericLiteral() {
	        var number, start, ch;

	        ch = source[index];
	        assert(isDecimalDigit(ch.charCodeAt(0)) || (ch === '.'),
	            'Numeric literal must start with a decimal digit or a decimal point');

	        start = index;
	        number = '';
	        if (ch !== '.') {
	            number = source[index++];
	            ch = source[index];

	            // Hex number starts with '0x'.
	            // Octal number starts with '0'.
	            // Octal number in ES6 starts with '0o'.
	            // Binary number in ES6 starts with '0b'.
	            if (number === '0') {
	                if (ch === 'x' || ch === 'X') {
	                    ++index;
	                    return scanHexLiteral(start);
	                }
	                if (ch === 'b' || ch === 'B') {
	                    ++index;
	                    return scanBinaryLiteral(start);
	                }
	                if (ch === 'o' || ch === 'O' || isOctalDigit(ch)) {
	                    return scanOctalLiteral(ch, start);
	                }
	                // decimal number starts with '0' such as '09' is illegal.
	                if (ch && isDecimalDigit(ch.charCodeAt(0))) {
	                    throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	                }
	            }

	            while (isDecimalDigit(source.charCodeAt(index))) {
	                number += source[index++];
	            }
	            ch = source[index];
	        }

	        if (ch === '.') {
	            number += source[index++];
	            while (isDecimalDigit(source.charCodeAt(index))) {
	                number += source[index++];
	            }
	            ch = source[index];
	        }

	        if (ch === 'e' || ch === 'E') {
	            number += source[index++];

	            ch = source[index];
	            if (ch === '+' || ch === '-') {
	                number += source[index++];
	            }
	            if (isDecimalDigit(source.charCodeAt(index))) {
	                while (isDecimalDigit(source.charCodeAt(index))) {
	                    number += source[index++];
	                }
	            } else {
	                throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	            }
	        }

	        if (isIdentifierStart(source.charCodeAt(index))) {
	            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	        }

	        return {
	            type: Token.NumericLiteral,
	            value: parseFloat(number),
	            lineNumber: lineNumber,
	            lineStart: lineStart,
	            range: [start, index]
	        };
	    }

	    // 7.8.4 String Literals

	    function scanStringLiteral() {
	        var str = '', quote, start, ch, code, unescaped, restore, octal = false;

	        quote = source[index];
	        assert((quote === '\'' || quote === '"'),
	            'String literal must starts with a quote');

	        start = index;
	        ++index;

	        while (index < length) {
	            ch = source[index++];

	            if (ch === quote) {
	                quote = '';
	                break;
	            } else if (ch === '\\') {
	                ch = source[index++];
	                if (!ch || !isLineTerminator(ch.charCodeAt(0))) {
	                    switch (ch) {
	                    case 'n':
	                        str += '\n';
	                        break;
	                    case 'r':
	                        str += '\r';
	                        break;
	                    case 't':
	                        str += '\t';
	                        break;
	                    case 'u':
	                    case 'x':
	                        if (source[index] === '{') {
	                            ++index;
	                            str += scanUnicodeCodePointEscape();
	                        } else {
	                            restore = index;
	                            unescaped = scanHexEscape(ch);
	                            if (unescaped) {
	                                str += unescaped;
	                            } else {
	                                index = restore;
	                                str += ch;
	                            }
	                        }
	                        break;
	                    case 'b':
	                        str += '\b';
	                        break;
	                    case 'f':
	                        str += '\f';
	                        break;
	                    case 'v':
	                        str += '\x0B';
	                        break;

	                    default:
	                        if (isOctalDigit(ch)) {
	                            code = '01234567'.indexOf(ch);

	                            // \0 is not octal escape sequence
	                            if (code !== 0) {
	                                octal = true;
	                            }

	                            /* istanbul ignore else */
	                            if (index < length && isOctalDigit(source[index])) {
	                                octal = true;
	                                code = code * 8 + '01234567'.indexOf(source[index++]);

	                                // 3 digits are only allowed when string starts
	                                // with 0, 1, 2, 3
	                                if ('0123'.indexOf(ch) >= 0 &&
	                                        index < length &&
	                                        isOctalDigit(source[index])) {
	                                    code = code * 8 + '01234567'.indexOf(source[index++]);
	                                }
	                            }
	                            str += String.fromCharCode(code);
	                        } else {
	                            str += ch;
	                        }
	                        break;
	                    }
	                } else {
	                    ++lineNumber;
	                    if (ch === '\r' && source[index] === '\n') {
	                        ++index;
	                    }
	                    lineStart = index;
	                }
	            } else if (isLineTerminator(ch.charCodeAt(0))) {
	                break;
	            } else {
	                str += ch;
	            }
	        }

	        if (quote !== '') {
	            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	        }

	        return {
	            type: Token.StringLiteral,
	            value: str,
	            octal: octal,
	            lineNumber: lineNumber,
	            lineStart: lineStart,
	            range: [start, index]
	        };
	    }

	    function scanTemplate() {
	        var cooked = '', ch, start, terminated, head, tail, restore, unescaped, code, octal;

	        terminated = false;
	        tail = false;
	        start = index;
	        head = (source[index] === '`');

	        ++index;

	        while (index < length) {
	            ch = source[index++];
	            if (ch === '`') {
	                tail = true;
	                terminated = true;
	                break;
	            } else if (ch === '$') {
	                if (source[index] === '{') {
	                    ++index;
	                    terminated = true;
	                    break;
	                }
	                cooked += ch;
	            } else if (ch === '\\') {
	                ch = source[index++];
	                if (!isLineTerminator(ch.charCodeAt(0))) {
	                    switch (ch) {
	                    case 'n':
	                        cooked += '\n';
	                        break;
	                    case 'r':
	                        cooked += '\r';
	                        break;
	                    case 't':
	                        cooked += '\t';
	                        break;
	                    case 'u':
	                    case 'x':
	                        if (source[index] === '{') {
	                            ++index;
	                            cooked += scanUnicodeCodePointEscape();
	                        } else {
	                            restore = index;
	                            unescaped = scanHexEscape(ch);
	                            if (unescaped) {
	                                cooked += unescaped;
	                            } else {
	                                index = restore;
	                                cooked += ch;
	                            }
	                        }
	                        break;
	                    case 'b':
	                        cooked += '\b';
	                        break;
	                    case 'f':
	                        cooked += '\f';
	                        break;
	                    case 'v':
	                        cooked += '\v';
	                        break;

	                    default:
	                        if (isOctalDigit(ch)) {
	                            code = '01234567'.indexOf(ch);

	                            // \0 is not octal escape sequence
	                            if (code !== 0) {
	                                octal = true;
	                            }

	                            /* istanbul ignore else */
	                            if (index < length && isOctalDigit(source[index])) {
	                                octal = true;
	                                code = code * 8 + '01234567'.indexOf(source[index++]);

	                                // 3 digits are only allowed when string starts
	                                // with 0, 1, 2, 3
	                                if ('0123'.indexOf(ch) >= 0 &&
	                                        index < length &&
	                                        isOctalDigit(source[index])) {
	                                    code = code * 8 + '01234567'.indexOf(source[index++]);
	                                }
	                            }
	                            cooked += String.fromCharCode(code);
	                        } else {
	                            cooked += ch;
	                        }
	                        break;
	                    }
	                } else {
	                    ++lineNumber;
	                    if (ch === '\r' && source[index] === '\n') {
	                        ++index;
	                    }
	                    lineStart = index;
	                }
	            } else if (isLineTerminator(ch.charCodeAt(0))) {
	                ++lineNumber;
	                if (ch === '\r' && source[index] === '\n') {
	                    ++index;
	                }
	                lineStart = index;
	                cooked += '\n';
	            } else {
	                cooked += ch;
	            }
	        }

	        if (!terminated) {
	            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	        }

	        if (index > state.curlyLastIndex) {
	            state.curlyLastIndex = index;
	            if (!tail) {
	                state.curlyStack.push('template');
	            }

	            if (!head) {
	                state.curlyStack.pop();
	            }
	        }

	        return {
	            type: Token.Template,
	            value: {
	                cooked: cooked,
	                raw: source.slice(start + 1, index - ((tail) ? 1 : 2))
	            },
	            head: head,
	            tail: tail,
	            octal: octal,
	            lineNumber: lineNumber,
	            lineStart: lineStart,
	            range: [start, index]
	        };
	    }

	    function testRegExp(pattern, flags) {
	        var tmp = pattern,
	            value;

	        if (flags.indexOf('u') >= 0) {
	            // Replace each astral symbol and every Unicode code point
	            // escape sequence with a single ASCII symbol to avoid throwing on
	            // regular expressions that are only valid in combination with the
	            // `/u` flag.
	            // Note: replacing with the ASCII symbol `x` might cause false
	            // negatives in unlikely scenarios. For example, `[\u{61}-b]` is a
	            // perfectly valid pattern that is equivalent to `[a-b]`, but it
	            // would be replaced by `[x-b]` which throws an error.
	            tmp = tmp
	                .replace(/\\u\{([0-9a-fA-F]+)\}/g, function ($0, $1) {
	                    if (parseInt($1, 16) <= 0x10FFFF) {
	                        return 'x';
	                    }
	                    throwError({}, Messages.InvalidRegExp);
	                })
	                .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, 'x');
	        }

	        // First, detect invalid regular expressions.
	        try {
	            value = new RegExp(tmp);
	        } catch (e) {
	            throwError({}, Messages.InvalidRegExp);
	        }

	        // Return a regular expression object for this pattern-flag pair, or
	        // `null` in case the current environment doesn't support the flags it
	        // uses.
	        try {
	            return new RegExp(pattern, flags);
	        } catch (exception) {
	            return null;
	        }
	    }

	    function scanRegExpBody() {
	        var ch, str, classMarker, terminated, body;

	        ch = source[index];
	        assert(ch === '/', 'Regular expression literal must start with a slash');
	        str = source[index++];

	        classMarker = false;
	        terminated = false;
	        while (index < length) {
	            ch = source[index++];
	            str += ch;
	            if (ch === '\\') {
	                ch = source[index++];
	                // ECMA-262 7.8.5
	                if (isLineTerminator(ch.charCodeAt(0))) {
	                    throwError({}, Messages.UnterminatedRegExp);
	                }
	                str += ch;
	            } else if (isLineTerminator(ch.charCodeAt(0))) {
	                throwError({}, Messages.UnterminatedRegExp);
	            } else if (classMarker) {
	                if (ch === ']') {
	                    classMarker = false;
	                }
	            } else {
	                if (ch === '/') {
	                    terminated = true;
	                    break;
	                } else if (ch === '[') {
	                    classMarker = true;
	                }
	            }
	        }

	        if (!terminated) {
	            throwError({}, Messages.UnterminatedRegExp);
	        }

	        // Exclude leading and trailing slash.
	        body = str.substr(1, str.length - 2);
	        return {
	            value: body,
	            literal: str
	        };
	    }

	    function scanRegExpFlags() {
	        var ch, str, flags, restore;

	        str = '';
	        flags = '';
	        while (index < length) {
	            ch = source[index];
	            if (!isIdentifierPart(ch.charCodeAt(0))) {
	                break;
	            }

	            ++index;
	            if (ch === '\\' && index < length) {
	                ch = source[index];
	                if (ch === 'u') {
	                    ++index;
	                    restore = index;
	                    ch = scanHexEscape('u');
	                    if (ch) {
	                        flags += ch;
	                        for (str += '\\u'; restore < index; ++restore) {
	                            str += source[restore];
	                        }
	                    } else {
	                        index = restore;
	                        flags += 'u';
	                        str += '\\u';
	                    }
	                    throwErrorTolerant({}, Messages.UnexpectedToken, 'ILLEGAL');
	                } else {
	                    str += '\\';
	                    throwErrorTolerant({}, Messages.UnexpectedToken, 'ILLEGAL');
	                }
	            } else {
	                flags += ch;
	                str += ch;
	            }
	        }

	        return {
	            value: flags,
	            literal: str
	        };
	    }

	    function scanRegExp() {
	        var start, body, flags, value;

	        lookahead = null;
	        skipComment();
	        start = index;

	        body = scanRegExpBody();
	        flags = scanRegExpFlags();
	        value = testRegExp(body.value, flags.value);

	        if (extra.tokenize) {
	            return {
	                type: Token.RegularExpression,
	                value: value,
	                regex: {
	                    pattern: body.value,
	                    flags: flags.value
	                },
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        return {
	            literal: body.literal + flags.literal,
	            value: value,
	            regex: {
	                pattern: body.value,
	                flags: flags.value
	            },
	            range: [start, index]
	        };
	    }

	    function isIdentifierName(token) {
	        return token.type === Token.Identifier ||
	            token.type === Token.Keyword ||
	            token.type === Token.BooleanLiteral ||
	            token.type === Token.NullLiteral;
	    }

	    function advanceSlash() {
	        var prevToken,
	            checkToken;
	        // Using the following algorithm:
	        // https://github.com/mozilla/sweet.js/wiki/design
	        prevToken = extra.tokens[extra.tokens.length - 1];
	        if (!prevToken) {
	            // Nothing before that: it cannot be a division.
	            return scanRegExp();
	        }
	        if (prevToken.type === 'Punctuator') {
	            if (prevToken.value === ')') {
	                checkToken = extra.tokens[extra.openParenToken - 1];
	                if (checkToken &&
	                        checkToken.type === 'Keyword' &&
	                        (checkToken.value === 'if' ||
	                         checkToken.value === 'while' ||
	                         checkToken.value === 'for' ||
	                         checkToken.value === 'with')) {
	                    return scanRegExp();
	                }
	                return scanPunctuator();
	            }
	            if (prevToken.value === '}') {
	                // Dividing a function by anything makes little sense,
	                // but we have to check for that.
	                if (extra.tokens[extra.openCurlyToken - 3] &&
	                        extra.tokens[extra.openCurlyToken - 3].type === 'Keyword') {
	                    // Anonymous function.
	                    checkToken = extra.tokens[extra.openCurlyToken - 4];
	                    if (!checkToken) {
	                        return scanPunctuator();
	                    }
	                } else if (extra.tokens[extra.openCurlyToken - 4] &&
	                        extra.tokens[extra.openCurlyToken - 4].type === 'Keyword') {
	                    // Named function.
	                    checkToken = extra.tokens[extra.openCurlyToken - 5];
	                    if (!checkToken) {
	                        return scanRegExp();
	                    }
	                } else {
	                    return scanPunctuator();
	                }
	                // checkToken determines whether the function is
	                // a declaration or an expression.
	                if (FnExprTokens.indexOf(checkToken.value) >= 0) {
	                    // It is an expression.
	                    return scanPunctuator();
	                }
	                // It is a declaration.
	                return scanRegExp();
	            }
	            return scanRegExp();
	        }
	        if (prevToken.type === 'Keyword' && prevToken.value !== 'this') {
	            return scanRegExp();
	        }
	        return scanPunctuator();
	    }

	    function advance() {
	        var ch;

	        skipComment();

	        if (index >= length) {
	            return {
	                type: Token.EOF,
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [index, index]
	            };
	        }

	        ch = source.charCodeAt(index);

	        // Very common: ( and ) and ;
	        if (ch === 40 || ch === 41 || ch === 58) {
	            return scanPunctuator();
	        }

	        // String literal starts with single quote (#39) or double quote (#34).
	        if (ch === 39 || ch === 34) {
	            return scanStringLiteral();
	        }

	        // Template literals start with backtick (#96) for template head
	        // or close curly (#125) for template middle or template tail.
	        if (ch === 96 || (ch === 125 && state.curlyStack[state.curlyStack.length - 1] === 'template')) {
	            return scanTemplate();
	        }
	        if (isIdentifierStart(ch)) {
	            return scanIdentifier();
	        }

	        // Dot (.) char #46 can also start a floating-point number, hence the need
	        // to check the next character.
	        if (ch === 46) {
	            if (isDecimalDigit(source.charCodeAt(index + 1))) {
	                return scanNumericLiteral();
	            }
	            return scanPunctuator();
	        }

	        if (isDecimalDigit(ch)) {
	            return scanNumericLiteral();
	        }

	        // Slash (/) char #47 can also start a regex.
	        if (extra.tokenize && ch === 47) {
	            return advanceSlash();
	        }

	        return scanPunctuator();
	    }

	    function lex() {
	        var token;

	        token = lookahead;
	        index = token.range[1];
	        lineNumber = token.lineNumber;
	        lineStart = token.lineStart;

	        lookahead = advance();

	        index = token.range[1];
	        lineNumber = token.lineNumber;
	        lineStart = token.lineStart;

	        return token;
	    }

	    function peek() {
	        var pos, line, start;

	        pos = index;
	        line = lineNumber;
	        start = lineStart;
	        lookahead = advance();
	        index = pos;
	        lineNumber = line;
	        lineStart = start;
	    }

	    function lookahead2() {
	        var adv, pos, line, start, result;

	        // If we are collecting the tokens, don't grab the next one yet.
	        /* istanbul ignore next */
	        adv = (typeof extra.advance === 'function') ? extra.advance : advance;

	        pos = index;
	        line = lineNumber;
	        start = lineStart;

	        // Scan for the next immediate token.
	        /* istanbul ignore if */
	        if (lookahead === null) {
	            lookahead = adv();
	        }
	        index = lookahead.range[1];
	        lineNumber = lookahead.lineNumber;
	        lineStart = lookahead.lineStart;

	        // Grab the token right after.
	        result = adv();
	        index = pos;
	        lineNumber = line;
	        lineStart = start;

	        return result;
	    }

	    function markerCreate() {
	        if (!extra.loc && !extra.range) {
	            return undefined;
	        }
	        skipComment();
	        return {offset: index, line: lineNumber, col: index - lineStart};
	    }

	    function processComment(node) {
	        var lastChild,
	            trailingComments,
	            bottomRight = extra.bottomRightStack,
	            last = bottomRight[bottomRight.length - 1];

	        if (node.type === Syntax.Program) {
	            /* istanbul ignore else */
	            if (node.body.length > 0) {
	                return;
	            }
	        }

	        if (extra.trailingComments.length > 0) {
	            if (extra.trailingComments[0].range[0] >= node.range[1]) {
	                trailingComments = extra.trailingComments;
	                extra.trailingComments = [];
	            } else {
	                extra.trailingComments.length = 0;
	            }
	        } else {
	            if (last && last.trailingComments && last.trailingComments[0].range[0] >= node.range[1]) {
	                trailingComments = last.trailingComments;
	                delete last.trailingComments;
	            }
	        }

	        // Eating the stack.
	        if (last) {
	            while (last && last.range[0] >= node.range[0]) {
	                lastChild = last;
	                last = bottomRight.pop();
	            }
	        }

	        if (lastChild) {
	            if (lastChild.leadingComments && lastChild.leadingComments[lastChild.leadingComments.length - 1].range[1] <= node.range[0]) {
	                node.leadingComments = lastChild.leadingComments;
	                delete lastChild.leadingComments;
	            }
	        } else if (extra.leadingComments.length > 0 && extra.leadingComments[extra.leadingComments.length - 1].range[1] <= node.range[0]) {
	            node.leadingComments = extra.leadingComments;
	            extra.leadingComments = [];
	        }

	        if (trailingComments) {
	            node.trailingComments = trailingComments;
	        }

	        bottomRight.push(node);
	    }

	    function markerApply(marker, node) {
	        if (extra.range) {
	            node.range = [marker.offset, index];
	        }
	        if (extra.loc) {
	            node.loc = {
	                start: {
	                    line: marker.line,
	                    column: marker.col
	                },
	                end: {
	                    line: lineNumber,
	                    column: index - lineStart
	                }
	            };
	            node = delegate.postProcess(node);
	        }
	        if (extra.attachComment) {
	            processComment(node);
	        }
	        return node;
	    }

	    SyntaxTreeDelegate = {

	        name: 'SyntaxTree',

	        postProcess: function (node) {
	            return node;
	        },

	        createArrayExpression: function (elements) {
	            return {
	                type: Syntax.ArrayExpression,
	                elements: elements
	            };
	        },

	        createAssignmentExpression: function (operator, left, right) {
	            return {
	                type: Syntax.AssignmentExpression,
	                operator: operator,
	                left: left,
	                right: right
	            };
	        },

	        createBinaryExpression: function (operator, left, right) {
	            var type = (operator === '||' || operator === '&&') ? Syntax.LogicalExpression :
	                        Syntax.BinaryExpression;
	            return {
	                type: type,
	                operator: operator,
	                left: left,
	                right: right
	            };
	        },

	        createBlockStatement: function (body) {
	            return {
	                type: Syntax.BlockStatement,
	                body: body
	            };
	        },

	        createBreakStatement: function (label) {
	            return {
	                type: Syntax.BreakStatement,
	                label: label
	            };
	        },

	        createCallExpression: function (callee, args) {
	            return {
	                type: Syntax.CallExpression,
	                callee: callee,
	                'arguments': args
	            };
	        },

	        createCatchClause: function (param, body) {
	            return {
	                type: Syntax.CatchClause,
	                param: param,
	                body: body
	            };
	        },

	        createConditionalExpression: function (test, consequent, alternate) {
	            return {
	                type: Syntax.ConditionalExpression,
	                test: test,
	                consequent: consequent,
	                alternate: alternate
	            };
	        },

	        createContinueStatement: function (label) {
	            return {
	                type: Syntax.ContinueStatement,
	                label: label
	            };
	        },

	        createDebuggerStatement: function () {
	            return {
	                type: Syntax.DebuggerStatement
	            };
	        },

	        createDoWhileStatement: function (body, test) {
	            return {
	                type: Syntax.DoWhileStatement,
	                body: body,
	                test: test
	            };
	        },

	        createEmptyStatement: function () {
	            return {
	                type: Syntax.EmptyStatement
	            };
	        },

	        createExpressionStatement: function (expression) {
	            return {
	                type: Syntax.ExpressionStatement,
	                expression: expression
	            };
	        },

	        createForStatement: function (init, test, update, body) {
	            return {
	                type: Syntax.ForStatement,
	                init: init,
	                test: test,
	                update: update,
	                body: body
	            };
	        },

	        createForInStatement: function (left, right, body) {
	            return {
	                type: Syntax.ForInStatement,
	                left: left,
	                right: right,
	                body: body,
	                each: false
	            };
	        },

	        createForOfStatement: function (left, right, body) {
	            return {
	                type: Syntax.ForOfStatement,
	                left: left,
	                right: right,
	                body: body
	            };
	        },

	        createFunctionDeclaration: function (id, params, defaults, body, rest, generator, expression) {
	            return {
	                type: Syntax.FunctionDeclaration,
	                id: id,
	                params: params,
	                defaults: defaults,
	                body: body,
	                rest: rest,
	                generator: generator,
	                expression: expression
	            };
	        },

	        createFunctionExpression: function (id, params, defaults, body, rest, generator, expression) {
	            return {
	                type: Syntax.FunctionExpression,
	                id: id,
	                params: params,
	                defaults: defaults,
	                body: body,
	                rest: rest,
	                generator: generator,
	                expression: expression
	            };
	        },

	        createIdentifier: function (name) {
	            return {
	                type: Syntax.Identifier,
	                name: name
	            };
	        },

	        createIfStatement: function (test, consequent, alternate) {
	            return {
	                type: Syntax.IfStatement,
	                test: test,
	                consequent: consequent,
	                alternate: alternate
	            };
	        },

	        createLabeledStatement: function (label, body) {
	            return {
	                type: Syntax.LabeledStatement,
	                label: label,
	                body: body
	            };
	        },

	        createLiteral: function (token) {
	            var object = {
	                type: Syntax.Literal,
	                value: token.value,
	                raw: source.slice(token.range[0], token.range[1])
	            };
	            if (token.regex) {
	                object.regex = token.regex;
	            }
	            return object;
	        },

	        createMemberExpression: function (accessor, object, property) {
	            return {
	                type: Syntax.MemberExpression,
	                computed: accessor === '[',
	                object: object,
	                property: property
	            };
	        },

	        createNewExpression: function (callee, args) {
	            return {
	                type: Syntax.NewExpression,
	                callee: callee,
	                'arguments': args
	            };
	        },

	        createObjectExpression: function (properties) {
	            return {
	                type: Syntax.ObjectExpression,
	                properties: properties
	            };
	        },

	        createPostfixExpression: function (operator, argument) {
	            return {
	                type: Syntax.UpdateExpression,
	                operator: operator,
	                argument: argument,
	                prefix: false
	            };
	        },

	        createProgram: function (body) {
	            return {
	                type: Syntax.Program,
	                body: body
	            };
	        },

	        createProperty: function (kind, key, value, method, shorthand, computed) {
	            return {
	                type: Syntax.Property,
	                key: key,
	                value: value,
	                kind: kind,
	                method: method,
	                shorthand: shorthand,
	                computed: computed
	            };
	        },

	        createReturnStatement: function (argument) {
	            return {
	                type: Syntax.ReturnStatement,
	                argument: argument
	            };
	        },

	        createSequenceExpression: function (expressions) {
	            return {
	                type: Syntax.SequenceExpression,
	                expressions: expressions
	            };
	        },

	        createSwitchCase: function (test, consequent) {
	            return {
	                type: Syntax.SwitchCase,
	                test: test,
	                consequent: consequent
	            };
	        },

	        createSwitchStatement: function (discriminant, cases) {
	            return {
	                type: Syntax.SwitchStatement,
	                discriminant: discriminant,
	                cases: cases
	            };
	        },

	        createThisExpression: function () {
	            return {
	                type: Syntax.ThisExpression
	            };
	        },

	        createThrowStatement: function (argument) {
	            return {
	                type: Syntax.ThrowStatement,
	                argument: argument
	            };
	        },

	        createTryStatement: function (block, guardedHandlers, handlers, finalizer) {
	            return {
	                type: Syntax.TryStatement,
	                block: block,
	                guardedHandlers: guardedHandlers,
	                handlers: handlers,
	                finalizer: finalizer
	            };
	        },

	        createUnaryExpression: function (operator, argument) {
	            if (operator === '++' || operator === '--') {
	                return {
	                    type: Syntax.UpdateExpression,
	                    operator: operator,
	                    argument: argument,
	                    prefix: true
	                };
	            }
	            return {
	                type: Syntax.UnaryExpression,
	                operator: operator,
	                argument: argument,
	                prefix: true
	            };
	        },

	        createVariableDeclaration: function (declarations, kind) {
	            return {
	                type: Syntax.VariableDeclaration,
	                declarations: declarations,
	                kind: kind
	            };
	        },

	        createVariableDeclarator: function (id, init) {
	            return {
	                type: Syntax.VariableDeclarator,
	                id: id,
	                init: init
	            };
	        },

	        createWhileStatement: function (test, body) {
	            return {
	                type: Syntax.WhileStatement,
	                test: test,
	                body: body
	            };
	        },

	        createWithStatement: function (object, body) {
	            return {
	                type: Syntax.WithStatement,
	                object: object,
	                body: body
	            };
	        },

	        createTemplateElement: function (value, tail) {
	            return {
	                type: Syntax.TemplateElement,
	                value: value,
	                tail: tail
	            };
	        },

	        createTemplateLiteral: function (quasis, expressions) {
	            return {
	                type: Syntax.TemplateLiteral,
	                quasis: quasis,
	                expressions: expressions
	            };
	        },

	        createSpreadElement: function (argument) {
	            return {
	                type: Syntax.SpreadElement,
	                argument: argument
	            };
	        },

	        createTaggedTemplateExpression: function (tag, quasi) {
	            return {
	                type: Syntax.TaggedTemplateExpression,
	                tag: tag,
	                quasi: quasi
	            };
	        },

	        createArrowFunctionExpression: function (params, defaults, body, rest, expression) {
	            return {
	                type: Syntax.ArrowFunctionExpression,
	                id: null,
	                params: params,
	                defaults: defaults,
	                body: body,
	                rest: rest,
	                generator: false,
	                expression: expression
	            };
	        },

	        createMethodDefinition: function (propertyType, kind, key, value, computed) {
	            return {
	                type: Syntax.MethodDefinition,
	                key: key,
	                value: value,
	                kind: kind,
	                'static': propertyType === ClassPropertyType.static,
	                computed: computed
	            };
	        },

	        createClassBody: function (body) {
	            return {
	                type: Syntax.ClassBody,
	                body: body
	            };
	        },

	        createClassExpression: function (id, superClass, body) {
	            return {
	                type: Syntax.ClassExpression,
	                id: id,
	                superClass: superClass,
	                body: body
	            };
	        },

	        createClassDeclaration: function (id, superClass, body) {
	            return {
	                type: Syntax.ClassDeclaration,
	                id: id,
	                superClass: superClass,
	                body: body
	            };
	        },

	        createExportSpecifier: function (id, name) {
	            return {
	                type: Syntax.ExportSpecifier,
	                id: id,
	                name: name
	            };
	        },

	        createExportBatchSpecifier: function () {
	            return {
	                type: Syntax.ExportBatchSpecifier
	            };
	        },

	        createImportDefaultSpecifier: function (id) {
	            return {
	                type: Syntax.ImportDefaultSpecifier,
	                id: id
	            };
	        },

	        createImportNamespaceSpecifier: function (id) {
	            return {
	                type: Syntax.ImportNamespaceSpecifier,
	                id: id
	            };
	        },

	        createExportDeclaration: function (isDefault, declaration, specifiers, src) {
	            return {
	                type: Syntax.ExportDeclaration,
	                'default': !!isDefault,
	                declaration: declaration,
	                specifiers: specifiers,
	                source: src
	            };
	        },

	        createImportSpecifier: function (id, name) {
	            return {
	                type: Syntax.ImportSpecifier,
	                id: id,
	                name: name
	            };
	        },

	        createImportDeclaration: function (specifiers, src) {
	            return {
	                type: Syntax.ImportDeclaration,
	                specifiers: specifiers,
	                source: src
	            };
	        },

	        createYieldExpression: function (argument, dlg) {
	            return {
	                type: Syntax.YieldExpression,
	                argument: argument,
	                delegate: dlg
	            };
	        },

	        createComprehensionExpression: function (filter, blocks, body) {
	            return {
	                type: Syntax.ComprehensionExpression,
	                filter: filter,
	                blocks: blocks,
	                body: body
	            };
	        }

	    };

	    // Return true if there is a line terminator before the next token.

	    function peekLineTerminator() {
	        var pos, line, start, found;

	        pos = index;
	        line = lineNumber;
	        start = lineStart;
	        skipComment();
	        found = lineNumber !== line;
	        index = pos;
	        lineNumber = line;
	        lineStart = start;

	        return found;
	    }

	    // Throw an exception

	    function throwError(token, messageFormat) {
	        var error,
	            args = Array.prototype.slice.call(arguments, 2),
	            msg = messageFormat.replace(
	                /%(\d)/g,
	                function (whole, idx) {
	                    assert(idx < args.length, 'Message reference must be in range');
	                    return args[idx];
	                }
	            );

	        if (typeof token.lineNumber === 'number') {
	            error = new Error('Line ' + token.lineNumber + ': ' + msg);
	            error.index = token.range[0];
	            error.lineNumber = token.lineNumber;
	            error.column = token.range[0] - lineStart + 1;
	        } else {
	            error = new Error('Line ' + lineNumber + ': ' + msg);
	            error.index = index;
	            error.lineNumber = lineNumber;
	            error.column = index - lineStart + 1;
	        }

	        error.description = msg;
	        throw error;
	    }

	    function throwErrorTolerant() {
	        try {
	            throwError.apply(null, arguments);
	        } catch (e) {
	            if (extra.errors) {
	                extra.errors.push(e);
	            } else {
	                throw e;
	            }
	        }
	    }


	    // Throw an exception because of the token.

	    function throwUnexpected(token) {
	        if (token.type === Token.EOF) {
	            throwError(token, Messages.UnexpectedEOS);
	        }

	        if (token.type === Token.NumericLiteral) {
	            throwError(token, Messages.UnexpectedNumber);
	        }

	        if (token.type === Token.StringLiteral) {
	            throwError(token, Messages.UnexpectedString);
	        }

	        if (token.type === Token.Identifier) {
	            throwError(token, Messages.UnexpectedIdentifier);
	        }

	        if (token.type === Token.Keyword) {
	            if (isFutureReservedWord(token.value)) {
	                throwError(token, Messages.UnexpectedReserved);
	            } else if (strict && isStrictModeReservedWord(token.value)) {
	                throwErrorTolerant(token, Messages.StrictReservedWord);
	                return;
	            }
	            throwError(token, Messages.UnexpectedToken, token.value);
	        }

	        if (token.type === Token.Template) {
	            throwError(token, Messages.UnexpectedTemplate, token.value.raw);
	        }

	        // BooleanLiteral, NullLiteral, or Punctuator.
	        throwError(token, Messages.UnexpectedToken, token.value);
	    }

	    // Expect the next token to match the specified punctuator.
	    // If not, an exception will be thrown.

	    function expect(value) {
	        var token = lex();
	        if (token.type !== Token.Punctuator || token.value !== value) {
	            throwUnexpected(token);
	        }
	    }

	    // Expect the next token to match the specified keyword.
	    // If not, an exception will be thrown.

	    function expectKeyword(keyword) {
	        var token = lex();
	        if (token.type !== Token.Keyword || token.value !== keyword) {
	            throwUnexpected(token);
	        }
	    }

	    // Return true if the next token matches the specified punctuator.

	    function match(value) {
	        return lookahead.type === Token.Punctuator && lookahead.value === value;
	    }

	    // Return true if the next token matches the specified keyword

	    function matchKeyword(keyword) {
	        return lookahead.type === Token.Keyword && lookahead.value === keyword;
	    }


	    // Return true if the next token matches the specified contextual keyword

	    function matchContextualKeyword(keyword) {
	        return lookahead.type === Token.Identifier && lookahead.value === keyword;
	    }

	    // Return true if the next token is an assignment operator

	    function matchAssign() {
	        var op;

	        if (lookahead.type !== Token.Punctuator) {
	            return false;
	        }
	        op = lookahead.value;
	        return op === '=' ||
	            op === '*=' ||
	            op === '/=' ||
	            op === '%=' ||
	            op === '+=' ||
	            op === '-=' ||
	            op === '<<=' ||
	            op === '>>=' ||
	            op === '>>>=' ||
	            op === '&=' ||
	            op === '^=' ||
	            op === '|=';
	    }

	    function consumeSemicolon() {
	        var line, oldIndex = index, oldLineNumber = lineNumber,
	            oldLineStart = lineStart, oldLookahead = lookahead;

	        // Catch the very common case first: immediately a semicolon (char #59).
	        if (source.charCodeAt(index) === 59) {
	            lex();
	            return;
	        }

	        line = lineNumber;
	        skipComment();
	        if (lineNumber !== line) {
	            index = oldIndex;
	            lineNumber = oldLineNumber;
	            lineStart = oldLineStart;
	            lookahead = oldLookahead;
	            return;
	        }

	        if (match(';')) {
	            lex();
	            return;
	        }

	        if (lookahead.type !== Token.EOF && !match('}')) {
	            throwUnexpected(lookahead);
	        }
	    }

	    // Return true if provided expression is LeftHandSideExpression

	    function isLeftHandSide(expr) {
	        return expr.type === Syntax.Identifier || expr.type === Syntax.MemberExpression;
	    }

	    function isAssignableLeftHandSide(expr) {
	        return isLeftHandSide(expr) || expr.type === Syntax.ObjectPattern || expr.type === Syntax.ArrayPattern;
	    }

	    // 11.1.4 Array Initialiser

	    function parseArrayInitialiser() {
	        var elements = [], blocks = [], filter = null, tmp, possiblecomprehension = true,
	            marker = markerCreate();

	        expect('[');
	        while (!match(']')) {
	            if (lookahead.value === 'for' &&
	                    lookahead.type === Token.Keyword) {
	                if (!possiblecomprehension) {
	                    throwError({}, Messages.ComprehensionError);
	                }
	                matchKeyword('for');
	                tmp = parseForStatement({ignoreBody: true});
	                tmp.of = tmp.type === Syntax.ForOfStatement;
	                tmp.type = Syntax.ComprehensionBlock;
	                if (tmp.left.kind) { // can't be let or const
	                    throwError({}, Messages.ComprehensionError);
	                }
	                blocks.push(tmp);
	            } else if (lookahead.value === 'if' &&
	                           lookahead.type === Token.Keyword) {
	                if (!possiblecomprehension) {
	                    throwError({}, Messages.ComprehensionError);
	                }
	                expectKeyword('if');
	                expect('(');
	                filter = parseExpression();
	                expect(')');
	            } else if (lookahead.value === ',' &&
	                           lookahead.type === Token.Punctuator) {
	                possiblecomprehension = false; // no longer allowed.
	                lex();
	                elements.push(null);
	            } else {
	                tmp = parseSpreadOrAssignmentExpression();
	                elements.push(tmp);
	                if (tmp && tmp.type === Syntax.SpreadElement) {
	                    if (!match(']')) {
	                        throwError({}, Messages.ElementAfterSpreadElement);
	                    }
	                } else if (!(match(']') || matchKeyword('for') || matchKeyword('if'))) {
	                    expect(','); // this lexes.
	                    possiblecomprehension = false;
	                }
	            }
	        }

	        expect(']');

	        if (filter && !blocks.length) {
	            throwError({}, Messages.ComprehensionRequiresBlock);
	        }

	        if (blocks.length) {
	            if (elements.length !== 1) {
	                throwError({}, Messages.ComprehensionError);
	            }
	            return markerApply(marker, delegate.createComprehensionExpression(filter, blocks, elements[0]));
	        }
	        return markerApply(marker, delegate.createArrayExpression(elements));
	    }

	    // 11.1.5 Object Initialiser

	    function parsePropertyFunction(options) {
	        var previousStrict, previousYieldAllowed, params, defaults, body,
	            marker = markerCreate();

	        previousStrict = strict;
	        previousYieldAllowed = state.yieldAllowed;
	        state.yieldAllowed = options.generator;
	        params = options.params || [];
	        defaults = options.defaults || [];

	        body = parseConciseBody();
	        if (options.name && strict && isRestrictedWord(params[0].name)) {
	            throwErrorTolerant(options.name, Messages.StrictParamName);
	        }
	        strict = previousStrict;
	        state.yieldAllowed = previousYieldAllowed;

	        return markerApply(marker, delegate.createFunctionExpression(
	            null,
	            params,
	            defaults,
	            body,
	            options.rest || null,
	            options.generator,
	            body.type !== Syntax.BlockStatement
	        ));
	    }


	    function parsePropertyMethodFunction(options) {
	        var previousStrict, tmp, method;

	        previousStrict = strict;
	        strict = true;

	        tmp = parseParams();

	        if (tmp.stricted) {
	            throwErrorTolerant(tmp.stricted, tmp.message);
	        }


	        method = parsePropertyFunction({
	            params: tmp.params,
	            defaults: tmp.defaults,
	            rest: tmp.rest,
	            generator: options.generator
	        });

	        strict = previousStrict;

	        return method;
	    }


	    function parseObjectPropertyKey() {
	        var marker = markerCreate(),
	            token = lex(),
	            propertyKey,
	            result;

	        // Note: This function is called only from parseObjectProperty(), where
	        // EOF and Punctuator tokens are already filtered out.

	        if (token.type === Token.StringLiteral || token.type === Token.NumericLiteral) {
	            if (strict && token.octal) {
	                throwErrorTolerant(token, Messages.StrictOctalLiteral);
	            }
	            return markerApply(marker, delegate.createLiteral(token));
	        }

	        if (token.type === Token.Punctuator && token.value === '[') {
	            // For computed properties we should skip the [ and ], and
	            // capture in marker only the assignment expression itself.
	            marker = markerCreate();
	            propertyKey = parseAssignmentExpression();
	            result = markerApply(marker, propertyKey);
	            expect(']');
	            return result;
	        }

	        return markerApply(marker, delegate.createIdentifier(token.value));
	    }

	    function parseObjectProperty() {
	        var token, key, id, param, computed,
	            marker = markerCreate();

	        token = lookahead;
	        computed = (token.value === '[' && token.type === Token.Punctuator);

	        if (token.type === Token.Identifier || computed) {

	            id = parseObjectPropertyKey();

	            // Property Assignment: Getter and Setter.

	            if (token.value === 'get' && !(match(':') || match('('))) {
	                computed = (lookahead.value === '[');
	                key = parseObjectPropertyKey();
	                expect('(');
	                expect(')');
	                return markerApply(marker, delegate.createProperty('get', key, parsePropertyFunction({ generator: false }), false, false, computed));
	            }
	            if (token.value === 'set' && !(match(':') || match('('))) {
	                computed = (lookahead.value === '[');
	                key = parseObjectPropertyKey();
	                expect('(');
	                token = lookahead;
	                param = [ parseVariableIdentifier() ];
	                expect(')');
	                return markerApply(marker, delegate.createProperty('set', key, parsePropertyFunction({ params: param, generator: false, name: token }), false, false, computed));
	            }
	            if (match(':')) {
	                lex();
	                return markerApply(marker, delegate.createProperty('init', id, parseAssignmentExpression(), false, false, computed));
	            }
	            if (match('(')) {
	                return markerApply(marker, delegate.createProperty('init', id, parsePropertyMethodFunction({ generator: false }), true, false, computed));
	            }
	            if (computed) {
	                // Computed properties can only be used with full notation.
	                throwUnexpected(lookahead);
	            }
	            return markerApply(marker, delegate.createProperty('init', id, id, false, true, false));
	        }
	        if (token.type === Token.EOF || token.type === Token.Punctuator) {
	            if (!match('*')) {
	                throwUnexpected(token);
	            }
	            lex();

	            computed = (lookahead.type === Token.Punctuator && lookahead.value === '[');

	            id = parseObjectPropertyKey();

	            if (!match('(')) {
	                throwUnexpected(lex());
	            }

	            return markerApply(marker, delegate.createProperty('init', id, parsePropertyMethodFunction({ generator: true }), true, false, computed));
	        }
	        key = parseObjectPropertyKey();
	        if (match(':')) {
	            lex();
	            return markerApply(marker, delegate.createProperty('init', key, parseAssignmentExpression(), false, false, false));
	        }
	        if (match('(')) {
	            return markerApply(marker, delegate.createProperty('init', key, parsePropertyMethodFunction({ generator: false }), true, false, false));
	        }
	        throwUnexpected(lex());
	    }

	    function getFieldName(key) {
	        var toString = String;
	        if (key.type === Syntax.Identifier) {
	            return key.name;
	        }
	        return toString(key.value);
	    }

	    function parseObjectInitialiser() {
	        var properties = [], property, name, kind, storedKind, map = new StringMap(),
	            marker = markerCreate();

	        expect('{');

	        while (!match('}')) {
	            property = parseObjectProperty();

	            if (!property.computed) {
	                name = getFieldName(property.key);
	                kind = (property.kind === 'init') ? PropertyKind.Data : (property.kind === 'get') ? PropertyKind.Get : PropertyKind.Set;

	                if (map.has(name)) {
	                    storedKind = map.get(name);
	                    if (storedKind === PropertyKind.Data) {
	                        if (strict && kind === PropertyKind.Data) {
	                            throwErrorTolerant({}, Messages.StrictDuplicateProperty);
	                        } else if (kind !== PropertyKind.Data) {
	                            throwErrorTolerant({}, Messages.AccessorDataProperty);
	                        }
	                    } else {
	                        if (kind === PropertyKind.Data) {
	                            throwErrorTolerant({}, Messages.AccessorDataProperty);
	                        } else if (storedKind & kind) {
	                            throwErrorTolerant({}, Messages.AccessorGetSet);
	                        }
	                    }
	                    map.set(name, storedKind | kind);
	                } else {
	                    map.set(name, kind);
	                }
	            }

	            properties.push(property);

	            if (!match('}')) {
	                expect(',');
	            }
	        }

	        expect('}');

	        return markerApply(marker, delegate.createObjectExpression(properties));
	    }

	    function parseTemplateElement(option) {
	        var marker, token;

	        if (lookahead.type !== Token.Template || (option.head && !lookahead.head)) {
	            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	        }

	        marker = markerCreate();
	        token = lex();

	        if (strict && token.octal) {
	            throwError(token, Messages.StrictOctalLiteral);
	        }
	        return markerApply(marker, delegate.createTemplateElement({ raw: token.value.raw, cooked: token.value.cooked }, token.tail));
	    }

	    function parseTemplateLiteral() {
	        var quasi, quasis, expressions, marker = markerCreate();

	        quasi = parseTemplateElement({ head: true });
	        quasis = [ quasi ];
	        expressions = [];

	        while (!quasi.tail) {
	            expressions.push(parseExpression());
	            quasi = parseTemplateElement({ head: false });
	            quasis.push(quasi);
	        }

	        return markerApply(marker, delegate.createTemplateLiteral(quasis, expressions));
	    }

	    // 11.1.6 The Grouping Operator

	    function parseGroupExpression() {
	        var expr;

	        expect('(');

	        ++state.parenthesizedCount;

	        expr = parseExpression();

	        expect(')');

	        return expr;
	    }


	    // 11.1 Primary Expressions

	    function parsePrimaryExpression() {
	        var marker, type, token, expr;

	        type = lookahead.type;

	        if (type === Token.Identifier) {
	            marker = markerCreate();
	            return markerApply(marker, delegate.createIdentifier(lex().value));
	        }

	        if (type === Token.StringLiteral || type === Token.NumericLiteral) {
	            if (strict && lookahead.octal) {
	                throwErrorTolerant(lookahead, Messages.StrictOctalLiteral);
	            }
	            marker = markerCreate();
	            return markerApply(marker, delegate.createLiteral(lex()));
	        }

	        if (type === Token.Keyword) {
	            if (matchKeyword('this')) {
	                marker = markerCreate();
	                lex();
	                return markerApply(marker, delegate.createThisExpression());
	            }

	            if (matchKeyword('function')) {
	                return parseFunctionExpression();
	            }

	            if (matchKeyword('class')) {
	                return parseClassExpression();
	            }

	            if (matchKeyword('super')) {
	                marker = markerCreate();
	                lex();
	                return markerApply(marker, delegate.createIdentifier('super'));
	            }
	        }

	        if (type === Token.BooleanLiteral) {
	            marker = markerCreate();
	            token = lex();
	            token.value = (token.value === 'true');
	            return markerApply(marker, delegate.createLiteral(token));
	        }

	        if (type === Token.NullLiteral) {
	            marker = markerCreate();
	            token = lex();
	            token.value = null;
	            return markerApply(marker, delegate.createLiteral(token));
	        }

	        if (match('[')) {
	            return parseArrayInitialiser();
	        }

	        if (match('{')) {
	            return parseObjectInitialiser();
	        }

	        if (match('(')) {
	            return parseGroupExpression();
	        }

	        if (match('/') || match('/=')) {
	            marker = markerCreate();
	            expr = delegate.createLiteral(scanRegExp());
	            peek();
	            return markerApply(marker, expr);
	        }

	        if (type === Token.Template) {
	            return parseTemplateLiteral();
	        }

	        throwUnexpected(lex());
	    }

	    // 11.2 Left-Hand-Side Expressions

	    function parseArguments() {
	        var args = [], arg;

	        expect('(');

	        if (!match(')')) {
	            while (index < length) {
	                arg = parseSpreadOrAssignmentExpression();
	                args.push(arg);

	                if (match(')')) {
	                    break;
	                } else if (arg.type === Syntax.SpreadElement) {
	                    throwError({}, Messages.ElementAfterSpreadElement);
	                }

	                expect(',');
	            }
	        }

	        expect(')');

	        return args;
	    }

	    function parseSpreadOrAssignmentExpression() {
	        if (match('...')) {
	            var marker = markerCreate();
	            lex();
	            return markerApply(marker, delegate.createSpreadElement(parseAssignmentExpression()));
	        }
	        return parseAssignmentExpression();
	    }

	    function parseNonComputedProperty() {
	        var marker = markerCreate(),
	            token = lex();

	        if (!isIdentifierName(token)) {
	            throwUnexpected(token);
	        }

	        return markerApply(marker, delegate.createIdentifier(token.value));
	    }

	    function parseNonComputedMember() {
	        expect('.');

	        return parseNonComputedProperty();
	    }

	    function parseComputedMember() {
	        var expr;

	        expect('[');

	        expr = parseExpression();

	        expect(']');

	        return expr;
	    }

	    function parseNewExpression() {
	        var callee, args, marker = markerCreate();

	        expectKeyword('new');
	        callee = parseLeftHandSideExpression();
	        args = match('(') ? parseArguments() : [];

	        return markerApply(marker, delegate.createNewExpression(callee, args));
	    }

	    function parseLeftHandSideExpressionAllowCall() {
	        var expr, args, marker = markerCreate();

	        expr = matchKeyword('new') ? parseNewExpression() : parsePrimaryExpression();

	        while (match('.') || match('[') || match('(') || (lookahead.type === Token.Template && lookahead.head)) {
	            if (match('(')) {
	                args = parseArguments();
	                expr = markerApply(marker, delegate.createCallExpression(expr, args));
	            } else if (match('[')) {
	                expr = markerApply(marker, delegate.createMemberExpression('[', expr, parseComputedMember()));
	            } else if (match('.')) {
	                expr = markerApply(marker, delegate.createMemberExpression('.', expr, parseNonComputedMember()));
	            } else {
	                expr = markerApply(marker, delegate.createTaggedTemplateExpression(expr, parseTemplateLiteral()));
	            }
	        }

	        return expr;
	    }

	    function parseLeftHandSideExpression() {
	        var expr, marker = markerCreate();

	        expr = matchKeyword('new') ? parseNewExpression() : parsePrimaryExpression();

	        while (match('.') || match('[') || (lookahead.type === Token.Template && lookahead.head)) {
	            if (match('[')) {
	                expr = markerApply(marker, delegate.createMemberExpression('[', expr, parseComputedMember()));
	            } else if (match('.')) {
	                expr = markerApply(marker, delegate.createMemberExpression('.', expr, parseNonComputedMember()));
	            } else {
	                expr = markerApply(marker, delegate.createTaggedTemplateExpression(expr, parseTemplateLiteral()));
	            }
	        }

	        return expr;
	    }

	    // 11.3 Postfix Expressions

	    function parsePostfixExpression() {
	        var marker = markerCreate(),
	            expr = parseLeftHandSideExpressionAllowCall(),
	            token;

	        if (lookahead.type !== Token.Punctuator) {
	            return expr;
	        }

	        if ((match('++') || match('--')) && !peekLineTerminator()) {
	            // 11.3.1, 11.3.2
	            if (strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
	                throwErrorTolerant({}, Messages.StrictLHSPostfix);
	            }

	            if (!isLeftHandSide(expr)) {
	                throwError({}, Messages.InvalidLHSInAssignment);
	            }

	            token = lex();
	            expr = markerApply(marker, delegate.createPostfixExpression(token.value, expr));
	        }

	        return expr;
	    }

	    // 11.4 Unary Operators

	    function parseUnaryExpression() {
	        var marker, token, expr;

	        if (lookahead.type !== Token.Punctuator && lookahead.type !== Token.Keyword) {
	            return parsePostfixExpression();
	        }

	        if (match('++') || match('--')) {
	            marker = markerCreate();
	            token = lex();
	            expr = parseUnaryExpression();
	            // 11.4.4, 11.4.5
	            if (strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
	                throwErrorTolerant({}, Messages.StrictLHSPrefix);
	            }

	            if (!isLeftHandSide(expr)) {
	                throwError({}, Messages.InvalidLHSInAssignment);
	            }

	            return markerApply(marker, delegate.createUnaryExpression(token.value, expr));
	        }

	        if (match('+') || match('-') || match('~') || match('!')) {
	            marker = markerCreate();
	            token = lex();
	            expr = parseUnaryExpression();
	            return markerApply(marker, delegate.createUnaryExpression(token.value, expr));
	        }

	        if (matchKeyword('delete') || matchKeyword('void') || matchKeyword('typeof')) {
	            marker = markerCreate();
	            token = lex();
	            expr = parseUnaryExpression();
	            expr = markerApply(marker, delegate.createUnaryExpression(token.value, expr));
	            if (strict && expr.operator === 'delete' && expr.argument.type === Syntax.Identifier) {
	                throwErrorTolerant({}, Messages.StrictDelete);
	            }
	            return expr;
	        }

	        return parsePostfixExpression();
	    }

	    function binaryPrecedence(token, allowIn) {
	        var prec = 0;

	        if (token.type !== Token.Punctuator && token.type !== Token.Keyword) {
	            return 0;
	        }

	        switch (token.value) {
	        case '||':
	            prec = 1;
	            break;

	        case '&&':
	            prec = 2;
	            break;

	        case '|':
	            prec = 3;
	            break;

	        case '^':
	            prec = 4;
	            break;

	        case '&':
	            prec = 5;
	            break;

	        case '==':
	        case '!=':
	        case '===':
	        case '!==':
	            prec = 6;
	            break;

	        case '<':
	        case '>':
	        case '<=':
	        case '>=':
	        case 'instanceof':
	            prec = 7;
	            break;

	        case 'in':
	            prec = allowIn ? 7 : 0;
	            break;

	        case '<<':
	        case '>>':
	        case '>>>':
	            prec = 8;
	            break;

	        case '+':
	        case '-':
	            prec = 9;
	            break;

	        case '*':
	        case '/':
	        case '%':
	            prec = 11;
	            break;

	        default:
	            break;
	        }

	        return prec;
	    }

	    // 11.5 Multiplicative Operators
	    // 11.6 Additive Operators
	    // 11.7 Bitwise Shift Operators
	    // 11.8 Relational Operators
	    // 11.9 Equality Operators
	    // 11.10 Binary Bitwise Operators
	    // 11.11 Binary Logical Operators

	    function parseBinaryExpression() {
	        var expr, token, prec, previousAllowIn, stack, right, operator, left, i,
	            marker, markers;

	        previousAllowIn = state.allowIn;
	        state.allowIn = true;

	        marker = markerCreate();
	        left = parseUnaryExpression();

	        token = lookahead;
	        prec = binaryPrecedence(token, previousAllowIn);
	        if (prec === 0) {
	            return left;
	        }
	        token.prec = prec;
	        lex();

	        markers = [marker, markerCreate()];
	        right = parseUnaryExpression();

	        stack = [left, token, right];

	        while ((prec = binaryPrecedence(lookahead, previousAllowIn)) > 0) {

	            // Reduce: make a binary expression from the three topmost entries.
	            while ((stack.length > 2) && (prec <= stack[stack.length - 2].prec)) {
	                right = stack.pop();
	                operator = stack.pop().value;
	                left = stack.pop();
	                expr = delegate.createBinaryExpression(operator, left, right);
	                markers.pop();
	                marker = markers.pop();
	                markerApply(marker, expr);
	                stack.push(expr);
	                markers.push(marker);
	            }

	            // Shift.
	            token = lex();
	            token.prec = prec;
	            stack.push(token);
	            markers.push(markerCreate());
	            expr = parseUnaryExpression();
	            stack.push(expr);
	        }

	        state.allowIn = previousAllowIn;

	        // Final reduce to clean-up the stack.
	        i = stack.length - 1;
	        expr = stack[i];
	        markers.pop();
	        while (i > 1) {
	            expr = delegate.createBinaryExpression(stack[i - 1].value, stack[i - 2], expr);
	            i -= 2;
	            marker = markers.pop();
	            markerApply(marker, expr);
	        }

	        return expr;
	    }


	    // 11.12 Conditional Operator

	    function parseConditionalExpression() {
	        var expr, previousAllowIn, consequent, alternate, marker = markerCreate();
	        expr = parseBinaryExpression();

	        if (match('?')) {
	            lex();
	            previousAllowIn = state.allowIn;
	            state.allowIn = true;
	            consequent = parseAssignmentExpression();
	            state.allowIn = previousAllowIn;
	            expect(':');
	            alternate = parseAssignmentExpression();

	            expr = markerApply(marker, delegate.createConditionalExpression(expr, consequent, alternate));
	        }

	        return expr;
	    }

	    // 11.13 Assignment Operators

	    // 12.14.5 AssignmentPattern

	    function reinterpretAsAssignmentBindingPattern(expr) {
	        var i, len, property, element;

	        if (expr.type === Syntax.ObjectExpression) {
	            expr.type = Syntax.ObjectPattern;
	            for (i = 0, len = expr.properties.length; i < len; i += 1) {
	                property = expr.properties[i];
	                if (property.kind !== 'init') {
	                    throwError({}, Messages.InvalidLHSInAssignment);
	                }
	                reinterpretAsAssignmentBindingPattern(property.value);
	            }
	        } else if (expr.type === Syntax.ArrayExpression) {
	            expr.type = Syntax.ArrayPattern;
	            for (i = 0, len = expr.elements.length; i < len; i += 1) {
	                element = expr.elements[i];
	                /* istanbul ignore else */
	                if (element) {
	                    reinterpretAsAssignmentBindingPattern(element);
	                }
	            }
	        } else if (expr.type === Syntax.Identifier) {
	            if (isRestrictedWord(expr.name)) {
	                throwError({}, Messages.InvalidLHSInAssignment);
	            }
	        } else if (expr.type === Syntax.SpreadElement) {
	            reinterpretAsAssignmentBindingPattern(expr.argument);
	            if (expr.argument.type === Syntax.ObjectPattern) {
	                throwError({}, Messages.ObjectPatternAsSpread);
	            }
	        } else {
	            /* istanbul ignore else */
	            if (expr.type !== Syntax.MemberExpression && expr.type !== Syntax.CallExpression && expr.type !== Syntax.NewExpression) {
	                throwError({}, Messages.InvalidLHSInAssignment);
	            }
	        }
	    }

	    // 13.2.3 BindingPattern

	    function reinterpretAsDestructuredParameter(options, expr) {
	        var i, len, property, element;

	        if (expr.type === Syntax.ObjectExpression) {
	            expr.type = Syntax.ObjectPattern;
	            for (i = 0, len = expr.properties.length; i < len; i += 1) {
	                property = expr.properties[i];
	                if (property.kind !== 'init') {
	                    throwError({}, Messages.InvalidLHSInFormalsList);
	                }
	                reinterpretAsDestructuredParameter(options, property.value);
	            }
	        } else if (expr.type === Syntax.ArrayExpression) {
	            expr.type = Syntax.ArrayPattern;
	            for (i = 0, len = expr.elements.length; i < len; i += 1) {
	                element = expr.elements[i];
	                if (element) {
	                    reinterpretAsDestructuredParameter(options, element);
	                }
	            }
	        } else if (expr.type === Syntax.Identifier) {
	            validateParam(options, expr, expr.name);
	        } else if (expr.type === Syntax.SpreadElement) {
	            // BindingRestElement only allows BindingIdentifier
	            if (expr.argument.type !== Syntax.Identifier) {
	                throwError({}, Messages.InvalidLHSInFormalsList);
	            }
	            validateParam(options, expr.argument, expr.argument.name);
	        } else {
	            throwError({}, Messages.InvalidLHSInFormalsList);
	        }
	    }

	    function reinterpretAsCoverFormalsList(expressions) {
	        var i, len, param, params, defaults, defaultCount, options, rest;

	        params = [];
	        defaults = [];
	        defaultCount = 0;
	        rest = null;
	        options = {
	            paramSet: new StringMap()
	        };

	        for (i = 0, len = expressions.length; i < len; i += 1) {
	            param = expressions[i];
	            if (param.type === Syntax.Identifier) {
	                params.push(param);
	                defaults.push(null);
	                validateParam(options, param, param.name);
	            } else if (param.type === Syntax.ObjectExpression || param.type === Syntax.ArrayExpression) {
	                reinterpretAsDestructuredParameter(options, param);
	                params.push(param);
	                defaults.push(null);
	            } else if (param.type === Syntax.SpreadElement) {
	                assert(i === len - 1, 'It is guaranteed that SpreadElement is last element by parseExpression');
	                if (param.argument.type !== Syntax.Identifier) {
	                    throwError({}, Messages.InvalidLHSInFormalsList);
	                }
	                reinterpretAsDestructuredParameter(options, param.argument);
	                rest = param.argument;
	            } else if (param.type === Syntax.AssignmentExpression) {
	                params.push(param.left);
	                defaults.push(param.right);
	                ++defaultCount;
	                validateParam(options, param.left, param.left.name);
	            } else {
	                return null;
	            }
	        }

	        if (options.message === Messages.StrictParamDupe) {
	            throwError(
	                strict ? options.stricted : options.firstRestricted,
	                options.message
	            );
	        }

	        if (defaultCount === 0) {
	            defaults = [];
	        }

	        return {
	            params: params,
	            defaults: defaults,
	            rest: rest,
	            stricted: options.stricted,
	            firstRestricted: options.firstRestricted,
	            message: options.message
	        };
	    }

	    function parseArrowFunctionExpression(options, marker) {
	        var previousStrict, previousYieldAllowed, body;

	        expect('=>');

	        previousStrict = strict;
	        previousYieldAllowed = state.yieldAllowed;
	        state.yieldAllowed = false;
	        body = parseConciseBody();

	        if (strict && options.firstRestricted) {
	            throwError(options.firstRestricted, options.message);
	        }
	        if (strict && options.stricted) {
	            throwErrorTolerant(options.stricted, options.message);
	        }

	        strict = previousStrict;
	        state.yieldAllowed = previousYieldAllowed;

	        return markerApply(marker, delegate.createArrowFunctionExpression(
	            options.params,
	            options.defaults,
	            body,
	            options.rest,
	            body.type !== Syntax.BlockStatement
	        ));
	    }

	    function parseAssignmentExpression() {
	        var marker, expr, token, params, oldParenthesizedCount,
	            startsWithParen = false;

	        // Note that 'yield' is treated as a keyword in strict mode, but a
	        // contextual keyword (identifier) in non-strict mode, so we need
	        // to use matchKeyword and matchContextualKeyword appropriately.
	        if ((state.yieldAllowed && matchContextualKeyword('yield')) || (strict && matchKeyword('yield'))) {
	            return parseYieldExpression();
	        }

	        oldParenthesizedCount = state.parenthesizedCount;

	        marker = markerCreate();

	        if (match('(')) {
	            token = lookahead2();
	            if ((token.type === Token.Punctuator && token.value === ')') || token.value === '...') {
	                params = parseParams();
	                if (!match('=>')) {
	                    throwUnexpected(lex());
	                }
	                return parseArrowFunctionExpression(params, marker);
	            }
	            startsWithParen = true;
	        }

	        token = lookahead;
	        expr = parseConditionalExpression();

	        if (match('=>') &&
	                (state.parenthesizedCount === oldParenthesizedCount ||
	                state.parenthesizedCount === (oldParenthesizedCount + 1))) {
	            if (expr.type === Syntax.Identifier) {
	                params = reinterpretAsCoverFormalsList([ expr ]);
	            } else if (expr.type === Syntax.AssignmentExpression ||
	                    expr.type === Syntax.ArrayExpression ||
	                    expr.type === Syntax.ObjectExpression) {
	                if (!startsWithParen) {
	                    throwUnexpected(lex());
	                }
	                params = reinterpretAsCoverFormalsList([ expr ]);
	            } else if (expr.type === Syntax.SequenceExpression) {
	                params = reinterpretAsCoverFormalsList(expr.expressions);
	            }
	            if (params) {
	                return parseArrowFunctionExpression(params, marker);
	            }
	        }

	        if (matchAssign()) {
	            // 11.13.1
	            if (strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
	                throwErrorTolerant(token, Messages.StrictLHSAssignment);
	            }

	            // ES.next draf 11.13 Runtime Semantics step 1
	            if (match('=') && (expr.type === Syntax.ObjectExpression || expr.type === Syntax.ArrayExpression)) {
	                reinterpretAsAssignmentBindingPattern(expr);
	            } else if (!isLeftHandSide(expr)) {
	                throwError({}, Messages.InvalidLHSInAssignment);
	            }

	            expr = markerApply(marker, delegate.createAssignmentExpression(lex().value, expr, parseAssignmentExpression()));
	        }

	        return expr;
	    }

	    // 11.14 Comma Operator

	    function parseExpression() {
	        var marker, expr, expressions, sequence, spreadFound;

	        marker = markerCreate();
	        expr = parseAssignmentExpression();
	        expressions = [ expr ];

	        if (match(',')) {
	            while (index < length) {
	                if (!match(',')) {
	                    break;
	                }

	                lex();
	                expr = parseSpreadOrAssignmentExpression();
	                expressions.push(expr);

	                if (expr.type === Syntax.SpreadElement) {
	                    spreadFound = true;
	                    if (!match(')')) {
	                        throwError({}, Messages.ElementAfterSpreadElement);
	                    }
	                    break;
	                }
	            }

	            sequence = markerApply(marker, delegate.createSequenceExpression(expressions));
	        }

	        if (spreadFound && lookahead2().value !== '=>') {
	            throwError({}, Messages.IllegalSpread);
	        }

	        return sequence || expr;
	    }

	    // 12.1 Block

	    function parseStatementList() {
	        var list = [],
	            statement;

	        while (index < length) {
	            if (match('}')) {
	                break;
	            }
	            statement = parseSourceElement();
	            if (typeof statement === 'undefined') {
	                break;
	            }
	            list.push(statement);
	        }

	        return list;
	    }

	    function parseBlock() {
	        var block, marker = markerCreate();

	        expect('{');

	        block = parseStatementList();

	        expect('}');

	        return markerApply(marker, delegate.createBlockStatement(block));
	    }

	    // 12.2 Variable Statement

	    function parseVariableIdentifier() {
	        var marker = markerCreate(),
	            token = lex();

	        if (token.type !== Token.Identifier) {
	            throwUnexpected(token);
	        }

	        return markerApply(marker, delegate.createIdentifier(token.value));
	    }

	    function parseVariableDeclaration(kind) {
	        var id,
	            marker = markerCreate(),
	            init = null;
	        if (match('{')) {
	            id = parseObjectInitialiser();
	            reinterpretAsAssignmentBindingPattern(id);
	        } else if (match('[')) {
	            id = parseArrayInitialiser();
	            reinterpretAsAssignmentBindingPattern(id);
	        } else {
	            /* istanbul ignore next */
	            id = state.allowKeyword ? parseNonComputedProperty() : parseVariableIdentifier();
	            // 12.2.1
	            if (strict && isRestrictedWord(id.name)) {
	                throwErrorTolerant({}, Messages.StrictVarName);
	            }
	        }

	        if (kind === 'const') {
	            if (!match('=')) {
	                throwError({}, Messages.NoUninitializedConst);
	            }
	            expect('=');
	            init = parseAssignmentExpression();
	        } else if (match('=')) {
	            lex();
	            init = parseAssignmentExpression();
	        }

	        return markerApply(marker, delegate.createVariableDeclarator(id, init));
	    }

	    function parseVariableDeclarationList(kind) {
	        var list = [];

	        do {
	            list.push(parseVariableDeclaration(kind));
	            if (!match(',')) {
	                break;
	            }
	            lex();
	        } while (index < length);

	        return list;
	    }

	    function parseVariableStatement() {
	        var declarations, marker = markerCreate();

	        expectKeyword('var');

	        declarations = parseVariableDeclarationList();

	        consumeSemicolon();

	        return markerApply(marker, delegate.createVariableDeclaration(declarations, 'var'));
	    }

	    // kind may be `const` or `let`
	    // Both are experimental and not in the specification yet.
	    // see http://wiki.ecmascript.org/doku.php?id=harmony:const
	    // and http://wiki.ecmascript.org/doku.php?id=harmony:let
	    function parseConstLetDeclaration(kind) {
	        var declarations, marker = markerCreate();

	        expectKeyword(kind);

	        declarations = parseVariableDeclarationList(kind);

	        consumeSemicolon();

	        return markerApply(marker, delegate.createVariableDeclaration(declarations, kind));
	    }

	    // people.mozilla.org/~jorendorff/es6-draft.html

	    function parseModuleSpecifier() {
	        var marker = markerCreate(),
	            specifier;

	        if (lookahead.type !== Token.StringLiteral) {
	            throwError({}, Messages.InvalidModuleSpecifier);
	        }
	        specifier = delegate.createLiteral(lex());
	        return markerApply(marker, specifier);
	    }

	    function parseExportBatchSpecifier() {
	        var marker = markerCreate();
	        expect('*');
	        return markerApply(marker, delegate.createExportBatchSpecifier());
	    }

	    function parseExportSpecifier() {
	        var id, name = null, marker = markerCreate();
	        if (matchKeyword('default')) {
	            lex();
	            id = markerApply(marker, delegate.createIdentifier('default'));
	            // export {default} from "something";
	        } else {
	            id = parseVariableIdentifier();
	        }
	        if (matchContextualKeyword('as')) {
	            lex();
	            name = parseNonComputedProperty();
	        }

	        return markerApply(marker, delegate.createExportSpecifier(id, name));
	    }

	    function parseExportDeclaration() {
	        var declaration = null,
	            possibleIdentifierToken, sourceElement,
	            isExportFromIdentifier,
	            src = null, specifiers = [],
	            marker = markerCreate();

	        expectKeyword('export');

	        if (matchKeyword('default')) {
	            // covers:
	            // export default ...
	            lex();
	            if (matchKeyword('function') || matchKeyword('class')) {
	                possibleIdentifierToken = lookahead2();
	                if (isIdentifierName(possibleIdentifierToken)) {
	                    // covers:
	                    // export default function foo () {}
	                    // export default class foo {}
	                    sourceElement = parseSourceElement();
	                    return markerApply(marker, delegate.createExportDeclaration(true, sourceElement, [sourceElement.id], null));
	                }
	                // covers:
	                // export default function () {}
	                // export default class {}
	                switch (lookahead.value) {
	                case 'class':
	                    return markerApply(marker, delegate.createExportDeclaration(true, parseClassExpression(), [], null));
	                case 'function':
	                    return markerApply(marker, delegate.createExportDeclaration(true, parseFunctionExpression(), [], null));
	                }
	            }

	            if (matchContextualKeyword('from')) {
	                throwError({}, Messages.UnexpectedToken, lookahead.value);
	            }

	            // covers:
	            // export default {};
	            // export default [];
	            if (match('{')) {
	                declaration = parseObjectInitialiser();
	            } else if (match('[')) {
	                declaration = parseArrayInitialiser();
	            } else {
	                declaration = parseAssignmentExpression();
	            }
	            consumeSemicolon();
	            return markerApply(marker, delegate.createExportDeclaration(true, declaration, [], null));
	        }

	        // non-default export
	        if (lookahead.type === Token.Keyword) {
	            // covers:
	            // export var f = 1;
	            switch (lookahead.value) {
	            case 'let':
	            case 'const':
	            case 'var':
	            case 'class':
	            case 'function':
	                return markerApply(marker, delegate.createExportDeclaration(false, parseSourceElement(), specifiers, null));
	            }
	        }

	        if (match('*')) {
	            // covers:
	            // export * from "foo";
	            specifiers.push(parseExportBatchSpecifier());

	            if (!matchContextualKeyword('from')) {
	                throwError({}, lookahead.value ?
	                        Messages.UnexpectedToken : Messages.MissingFromClause, lookahead.value);
	            }
	            lex();
	            src = parseModuleSpecifier();
	            consumeSemicolon();

	            return markerApply(marker, delegate.createExportDeclaration(false, null, specifiers, src));
	        }

	        expect('{');
	        if (!match('}')) {
	            do {
	                isExportFromIdentifier = isExportFromIdentifier || matchKeyword('default');
	                specifiers.push(parseExportSpecifier());
	            } while (match(',') && lex());
	        }
	        expect('}');

	        if (matchContextualKeyword('from')) {
	            // covering:
	            // export {default} from "foo";
	            // export {foo} from "foo";
	            lex();
	            src = parseModuleSpecifier();
	            consumeSemicolon();
	        } else if (isExportFromIdentifier) {
	            // covering:
	            // export {default}; // missing fromClause
	            throwError({}, lookahead.value ?
	                    Messages.UnexpectedToken : Messages.MissingFromClause, lookahead.value);
	        } else {
	            // cover
	            // export {foo};
	            consumeSemicolon();
	        }
	        return markerApply(marker, delegate.createExportDeclaration(false, declaration, specifiers, src));
	    }


	    function parseImportSpecifier() {
	        // import {<foo as bar>} ...;
	        var id, name = null, marker = markerCreate();

	        id = parseNonComputedProperty();
	        if (matchContextualKeyword('as')) {
	            lex();
	            name = parseVariableIdentifier();
	        }

	        return markerApply(marker, delegate.createImportSpecifier(id, name));
	    }

	    function parseNamedImports() {
	        var specifiers = [];
	        // {foo, bar as bas}
	        expect('{');
	        if (!match('}')) {
	            do {
	                specifiers.push(parseImportSpecifier());
	            } while (match(',') && lex());
	        }
	        expect('}');
	        return specifiers;
	    }

	    function parseImportDefaultSpecifier() {
	        // import <foo> ...;
	        var id, marker = markerCreate();

	        id = parseNonComputedProperty();

	        return markerApply(marker, delegate.createImportDefaultSpecifier(id));
	    }

	    function parseImportNamespaceSpecifier() {
	        // import <* as foo> ...;
	        var id, marker = markerCreate();

	        expect('*');
	        if (!matchContextualKeyword('as')) {
	            throwError({}, Messages.NoAsAfterImportNamespace);
	        }
	        lex();
	        id = parseNonComputedProperty();

	        return markerApply(marker, delegate.createImportNamespaceSpecifier(id));
	    }

	    function parseImportDeclaration() {
	        var specifiers, src, marker = markerCreate();

	        expectKeyword('import');
	        specifiers = [];

	        if (lookahead.type === Token.StringLiteral) {
	            // covers:
	            // import "foo";
	            src = parseModuleSpecifier();
	            consumeSemicolon();
	            return markerApply(marker, delegate.createImportDeclaration(specifiers, src));
	        }

	        if (!matchKeyword('default') && isIdentifierName(lookahead)) {
	            // covers:
	            // import foo
	            // import foo, ...
	            specifiers.push(parseImportDefaultSpecifier());
	            if (match(',')) {
	                lex();
	            }
	        }
	        if (match('*')) {
	            // covers:
	            // import foo, * as foo
	            // import * as foo
	            specifiers.push(parseImportNamespaceSpecifier());
	        } else if (match('{')) {
	            // covers:
	            // import foo, {bar}
	            // import {bar}
	            specifiers = specifiers.concat(parseNamedImports());
	        }

	        if (!matchContextualKeyword('from')) {
	            throwError({}, lookahead.value ?
	                    Messages.UnexpectedToken : Messages.MissingFromClause, lookahead.value);
	        }
	        lex();
	        src = parseModuleSpecifier();
	        consumeSemicolon();

	        return markerApply(marker, delegate.createImportDeclaration(specifiers, src));
	    }

	    // 12.3 Empty Statement

	    function parseEmptyStatement() {
	        var marker = markerCreate();
	        expect(';');
	        return markerApply(marker, delegate.createEmptyStatement());
	    }

	    // 12.4 Expression Statement

	    function parseExpressionStatement() {
	        var marker = markerCreate(), expr = parseExpression();
	        consumeSemicolon();
	        return markerApply(marker, delegate.createExpressionStatement(expr));
	    }

	    // 12.5 If statement

	    function parseIfStatement() {
	        var test, consequent, alternate, marker = markerCreate();

	        expectKeyword('if');

	        expect('(');

	        test = parseExpression();

	        expect(')');

	        consequent = parseStatement();

	        if (matchKeyword('else')) {
	            lex();
	            alternate = parseStatement();
	        } else {
	            alternate = null;
	        }

	        return markerApply(marker, delegate.createIfStatement(test, consequent, alternate));
	    }

	    // 12.6 Iteration Statements

	    function parseDoWhileStatement() {
	        var body, test, oldInIteration, marker = markerCreate();

	        expectKeyword('do');

	        oldInIteration = state.inIteration;
	        state.inIteration = true;

	        body = parseStatement();

	        state.inIteration = oldInIteration;

	        expectKeyword('while');

	        expect('(');

	        test = parseExpression();

	        expect(')');

	        if (match(';')) {
	            lex();
	        }

	        return markerApply(marker, delegate.createDoWhileStatement(body, test));
	    }

	    function parseWhileStatement() {
	        var test, body, oldInIteration, marker = markerCreate();

	        expectKeyword('while');

	        expect('(');

	        test = parseExpression();

	        expect(')');

	        oldInIteration = state.inIteration;
	        state.inIteration = true;

	        body = parseStatement();

	        state.inIteration = oldInIteration;

	        return markerApply(marker, delegate.createWhileStatement(test, body));
	    }

	    function parseForVariableDeclaration() {
	        var marker = markerCreate(),
	            token = lex(),
	            declarations = parseVariableDeclarationList();

	        return markerApply(marker, delegate.createVariableDeclaration(declarations, token.value));
	    }

	    function parseForStatement(opts) {
	        var init, test, update, left, right, body, operator, oldInIteration,
	            marker = markerCreate();
	        init = test = update = null;
	        expectKeyword('for');

	        // http://wiki.ecmascript.org/doku.php?id=proposals:iterators_and_generators&s=each
	        if (matchContextualKeyword('each')) {
	            throwError({}, Messages.EachNotAllowed);
	        }

	        expect('(');

	        if (match(';')) {
	            lex();
	        } else {
	            if (matchKeyword('var') || matchKeyword('let') || matchKeyword('const')) {
	                state.allowIn = false;
	                init = parseForVariableDeclaration();
	                state.allowIn = true;

	                if (init.declarations.length === 1) {
	                    if (matchKeyword('in') || matchContextualKeyword('of')) {
	                        operator = lookahead;
	                        if (!((operator.value === 'in' || init.kind !== 'var') && init.declarations[0].init)) {
	                            lex();
	                            left = init;
	                            right = parseExpression();
	                            init = null;
	                        }
	                    }
	                }
	            } else {
	                state.allowIn = false;
	                init = parseExpression();
	                state.allowIn = true;

	                if (matchContextualKeyword('of')) {
	                    operator = lex();
	                    left = init;
	                    right = parseExpression();
	                    init = null;
	                } else if (matchKeyword('in')) {
	                    // LeftHandSideExpression
	                    if (!isAssignableLeftHandSide(init)) {
	                        throwError({}, Messages.InvalidLHSInForIn);
	                    }
	                    operator = lex();
	                    left = init;
	                    right = parseExpression();
	                    init = null;
	                }
	            }

	            if (typeof left === 'undefined') {
	                expect(';');
	            }
	        }

	        if (typeof left === 'undefined') {

	            if (!match(';')) {
	                test = parseExpression();
	            }
	            expect(';');

	            if (!match(')')) {
	                update = parseExpression();
	            }
	        }

	        expect(')');

	        oldInIteration = state.inIteration;
	        state.inIteration = true;

	        if (!(opts !== undefined && opts.ignoreBody)) {
	            body = parseStatement();
	        }

	        state.inIteration = oldInIteration;

	        if (typeof left === 'undefined') {
	            return markerApply(marker, delegate.createForStatement(init, test, update, body));
	        }

	        if (operator.value === 'in') {
	            return markerApply(marker, delegate.createForInStatement(left, right, body));
	        }
	        return markerApply(marker, delegate.createForOfStatement(left, right, body));
	    }

	    // 12.7 The continue statement

	    function parseContinueStatement() {
	        var label = null, marker = markerCreate();

	        expectKeyword('continue');

	        // Optimize the most common form: 'continue;'.
	        if (source.charCodeAt(index) === 59) {
	            lex();

	            if (!state.inIteration) {
	                throwError({}, Messages.IllegalContinue);
	            }

	            return markerApply(marker, delegate.createContinueStatement(null));
	        }

	        if (peekLineTerminator()) {
	            if (!state.inIteration) {
	                throwError({}, Messages.IllegalContinue);
	            }

	            return markerApply(marker, delegate.createContinueStatement(null));
	        }

	        if (lookahead.type === Token.Identifier) {
	            label = parseVariableIdentifier();

	            if (!state.labelSet.has(label.name)) {
	                throwError({}, Messages.UnknownLabel, label.name);
	            }
	        }

	        consumeSemicolon();

	        if (label === null && !state.inIteration) {
	            throwError({}, Messages.IllegalContinue);
	        }

	        return markerApply(marker, delegate.createContinueStatement(label));
	    }

	    // 12.8 The break statement

	    function parseBreakStatement() {
	        var label = null, marker = markerCreate();

	        expectKeyword('break');

	        // Catch the very common case first: immediately a semicolon (char #59).
	        if (source.charCodeAt(index) === 59) {
	            lex();

	            if (!(state.inIteration || state.inSwitch)) {
	                throwError({}, Messages.IllegalBreak);
	            }

	            return markerApply(marker, delegate.createBreakStatement(null));
	        }

	        if (peekLineTerminator()) {
	            if (!(state.inIteration || state.inSwitch)) {
	                throwError({}, Messages.IllegalBreak);
	            }

	            return markerApply(marker, delegate.createBreakStatement(null));
	        }

	        if (lookahead.type === Token.Identifier) {
	            label = parseVariableIdentifier();

	            if (!state.labelSet.has(label.name)) {
	                throwError({}, Messages.UnknownLabel, label.name);
	            }
	        }

	        consumeSemicolon();

	        if (label === null && !(state.inIteration || state.inSwitch)) {
	            throwError({}, Messages.IllegalBreak);
	        }

	        return markerApply(marker, delegate.createBreakStatement(label));
	    }

	    // 12.9 The return statement

	    function parseReturnStatement() {
	        var argument = null, marker = markerCreate();

	        expectKeyword('return');

	        if (!state.inFunctionBody) {
	            throwErrorTolerant({}, Messages.IllegalReturn);
	        }

	        // 'return' followed by a space and an identifier is very common.
	        if (source.charCodeAt(index) === 32) {
	            if (isIdentifierStart(source.charCodeAt(index + 1))) {
	                argument = parseExpression();
	                consumeSemicolon();
	                return markerApply(marker, delegate.createReturnStatement(argument));
	            }
	        }

	        if (peekLineTerminator()) {
	            return markerApply(marker, delegate.createReturnStatement(null));
	        }

	        if (!match(';')) {
	            if (!match('}') && lookahead.type !== Token.EOF) {
	                argument = parseExpression();
	            }
	        }

	        consumeSemicolon();

	        return markerApply(marker, delegate.createReturnStatement(argument));
	    }

	    // 12.10 The with statement

	    function parseWithStatement() {
	        var object, body, marker = markerCreate();

	        if (strict) {
	            throwErrorTolerant({}, Messages.StrictModeWith);
	        }

	        expectKeyword('with');

	        expect('(');

	        object = parseExpression();

	        expect(')');

	        body = parseStatement();

	        return markerApply(marker, delegate.createWithStatement(object, body));
	    }

	    // 12.10 The swith statement

	    function parseSwitchCase() {
	        var test,
	            consequent = [],
	            sourceElement,
	            marker = markerCreate();

	        if (matchKeyword('default')) {
	            lex();
	            test = null;
	        } else {
	            expectKeyword('case');
	            test = parseExpression();
	        }
	        expect(':');

	        while (index < length) {
	            if (match('}') || matchKeyword('default') || matchKeyword('case')) {
	                break;
	            }
	            sourceElement = parseSourceElement();
	            if (typeof sourceElement === 'undefined') {
	                break;
	            }
	            consequent.push(sourceElement);
	        }

	        return markerApply(marker, delegate.createSwitchCase(test, consequent));
	    }

	    function parseSwitchStatement() {
	        var discriminant, cases, clause, oldInSwitch, defaultFound, marker = markerCreate();

	        expectKeyword('switch');

	        expect('(');

	        discriminant = parseExpression();

	        expect(')');

	        expect('{');

	        cases = [];

	        if (match('}')) {
	            lex();
	            return markerApply(marker, delegate.createSwitchStatement(discriminant, cases));
	        }

	        oldInSwitch = state.inSwitch;
	        state.inSwitch = true;
	        defaultFound = false;

	        while (index < length) {
	            if (match('}')) {
	                break;
	            }
	            clause = parseSwitchCase();
	            if (clause.test === null) {
	                if (defaultFound) {
	                    throwError({}, Messages.MultipleDefaultsInSwitch);
	                }
	                defaultFound = true;
	            }
	            cases.push(clause);
	        }

	        state.inSwitch = oldInSwitch;

	        expect('}');

	        return markerApply(marker, delegate.createSwitchStatement(discriminant, cases));
	    }

	    // 12.13 The throw statement

	    function parseThrowStatement() {
	        var argument, marker = markerCreate();

	        expectKeyword('throw');

	        if (peekLineTerminator()) {
	            throwError({}, Messages.NewlineAfterThrow);
	        }

	        argument = parseExpression();

	        consumeSemicolon();

	        return markerApply(marker, delegate.createThrowStatement(argument));
	    }

	    // 12.14 The try statement

	    function parseCatchClause() {
	        var param, body, marker = markerCreate();

	        expectKeyword('catch');

	        expect('(');
	        if (match(')')) {
	            throwUnexpected(lookahead);
	        }

	        param = parseExpression();
	        // 12.14.1
	        if (strict && param.type === Syntax.Identifier && isRestrictedWord(param.name)) {
	            throwErrorTolerant({}, Messages.StrictCatchVariable);
	        }

	        expect(')');
	        body = parseBlock();
	        return markerApply(marker, delegate.createCatchClause(param, body));
	    }

	    function parseTryStatement() {
	        var block, handlers = [], finalizer = null, marker = markerCreate();

	        expectKeyword('try');

	        block = parseBlock();

	        if (matchKeyword('catch')) {
	            handlers.push(parseCatchClause());
	        }

	        if (matchKeyword('finally')) {
	            lex();
	            finalizer = parseBlock();
	        }

	        if (handlers.length === 0 && !finalizer) {
	            throwError({}, Messages.NoCatchOrFinally);
	        }

	        return markerApply(marker, delegate.createTryStatement(block, [], handlers, finalizer));
	    }

	    // 12.15 The debugger statement

	    function parseDebuggerStatement() {
	        var marker = markerCreate();
	        expectKeyword('debugger');

	        consumeSemicolon();

	        return markerApply(marker, delegate.createDebuggerStatement());
	    }

	    // 12 Statements

	    function parseStatement() {
	        var type = lookahead.type,
	            marker,
	            expr,
	            labeledBody;

	        if (type === Token.EOF) {
	            throwUnexpected(lookahead);
	        }

	        if (type === Token.Punctuator) {
	            switch (lookahead.value) {
	            case ';':
	                return parseEmptyStatement();
	            case '{':
	                return parseBlock();
	            case '(':
	                return parseExpressionStatement();
	            default:
	                break;
	            }
	        }

	        if (type === Token.Keyword) {
	            switch (lookahead.value) {
	            case 'break':
	                return parseBreakStatement();
	            case 'continue':
	                return parseContinueStatement();
	            case 'debugger':
	                return parseDebuggerStatement();
	            case 'do':
	                return parseDoWhileStatement();
	            case 'for':
	                return parseForStatement();
	            case 'function':
	                return parseFunctionDeclaration();
	            case 'class':
	                return parseClassDeclaration();
	            case 'if':
	                return parseIfStatement();
	            case 'return':
	                return parseReturnStatement();
	            case 'switch':
	                return parseSwitchStatement();
	            case 'throw':
	                return parseThrowStatement();
	            case 'try':
	                return parseTryStatement();
	            case 'var':
	                return parseVariableStatement();
	            case 'while':
	                return parseWhileStatement();
	            case 'with':
	                return parseWithStatement();
	            default:
	                break;
	            }
	        }

	        marker = markerCreate();
	        expr = parseExpression();

	        // 12.12 Labelled Statements
	        if ((expr.type === Syntax.Identifier) && match(':')) {
	            lex();

	            if (state.labelSet.has(expr.name)) {
	                throwError({}, Messages.Redeclaration, 'Label', expr.name);
	            }

	            state.labelSet.set(expr.name, true);
	            labeledBody = parseStatement();
	            state.labelSet.delete(expr.name);
	            return markerApply(marker, delegate.createLabeledStatement(expr, labeledBody));
	        }

	        consumeSemicolon();

	        return markerApply(marker, delegate.createExpressionStatement(expr));
	    }

	    // 13 Function Definition

	    function parseConciseBody() {
	        if (match('{')) {
	            return parseFunctionSourceElements();
	        }
	        return parseAssignmentExpression();
	    }

	    function parseFunctionSourceElements() {
	        var sourceElement, sourceElements = [], token, directive, firstRestricted,
	            oldLabelSet, oldInIteration, oldInSwitch, oldInFunctionBody, oldParenthesizedCount,
	            marker = markerCreate();

	        expect('{');

	        while (index < length) {
	            if (lookahead.type !== Token.StringLiteral) {
	                break;
	            }
	            token = lookahead;

	            sourceElement = parseSourceElement();
	            sourceElements.push(sourceElement);
	            if (sourceElement.expression.type !== Syntax.Literal) {
	                // this is not directive
	                break;
	            }
	            directive = source.slice(token.range[0] + 1, token.range[1] - 1);
	            if (directive === 'use strict') {
	                strict = true;
	                if (firstRestricted) {
	                    throwErrorTolerant(firstRestricted, Messages.StrictOctalLiteral);
	                }
	            } else {
	                if (!firstRestricted && token.octal) {
	                    firstRestricted = token;
	                }
	            }
	        }

	        oldLabelSet = state.labelSet;
	        oldInIteration = state.inIteration;
	        oldInSwitch = state.inSwitch;
	        oldInFunctionBody = state.inFunctionBody;
	        oldParenthesizedCount = state.parenthesizedCount;

	        state.labelSet = new StringMap();
	        state.inIteration = false;
	        state.inSwitch = false;
	        state.inFunctionBody = true;
	        state.parenthesizedCount = 0;

	        while (index < length) {
	            if (match('}')) {
	                break;
	            }
	            sourceElement = parseSourceElement();
	            if (typeof sourceElement === 'undefined') {
	                break;
	            }
	            sourceElements.push(sourceElement);
	        }

	        expect('}');

	        state.labelSet = oldLabelSet;
	        state.inIteration = oldInIteration;
	        state.inSwitch = oldInSwitch;
	        state.inFunctionBody = oldInFunctionBody;
	        state.parenthesizedCount = oldParenthesizedCount;

	        return markerApply(marker, delegate.createBlockStatement(sourceElements));
	    }

	    function validateParam(options, param, name) {
	        if (strict) {
	            if (isRestrictedWord(name)) {
	                options.stricted = param;
	                options.message = Messages.StrictParamName;
	            }
	            if (options.paramSet.has(name)) {
	                options.stricted = param;
	                options.message = Messages.StrictParamDupe;
	            }
	        } else if (!options.firstRestricted) {
	            if (isRestrictedWord(name)) {
	                options.firstRestricted = param;
	                options.message = Messages.StrictParamName;
	            } else if (isStrictModeReservedWord(name)) {
	                options.firstRestricted = param;
	                options.message = Messages.StrictReservedWord;
	            } else if (options.paramSet.has(name)) {
	                options.firstRestricted = param;
	                options.message = Messages.StrictParamDupe;
	            }
	        }
	        options.paramSet.set(name, true);
	    }

	    function parseParam(options) {
	        var token, rest, param, def;

	        token = lookahead;
	        if (token.value === '...') {
	            token = lex();
	            rest = true;
	        }

	        if (match('[')) {
	            param = parseArrayInitialiser();
	            reinterpretAsDestructuredParameter(options, param);
	        } else if (match('{')) {
	            if (rest) {
	                throwError({}, Messages.ObjectPatternAsRestParameter);
	            }
	            param = parseObjectInitialiser();
	            reinterpretAsDestructuredParameter(options, param);
	        } else {
	            param = parseVariableIdentifier();
	            validateParam(options, token, token.value);
	        }

	        if (match('=')) {
	            if (rest) {
	                throwErrorTolerant(lookahead, Messages.DefaultRestParameter);
	            }
	            lex();
	            def = parseAssignmentExpression();
	            ++options.defaultCount;
	        }

	        if (rest) {
	            if (!match(')')) {
	                throwError({}, Messages.ParameterAfterRestParameter);
	            }
	            options.rest = param;
	            return false;
	        }

	        options.params.push(param);
	        options.defaults.push(def);
	        return !match(')');
	    }

	    function parseParams(firstRestricted) {
	        var options, marker = markerCreate();

	        options = {
	            params: [],
	            defaultCount: 0,
	            defaults: [],
	            rest: null,
	            firstRestricted: firstRestricted
	        };

	        expect('(');

	        if (!match(')')) {
	            options.paramSet = new StringMap();
	            while (index < length) {
	                if (!parseParam(options)) {
	                    break;
	                }
	                expect(',');
	            }
	        }

	        expect(')');

	        if (options.defaultCount === 0) {
	            options.defaults = [];
	        }

	        return markerApply(marker, options);
	    }

	    function parseFunctionDeclaration() {
	        var id, body, token, tmp, firstRestricted, message, previousStrict, previousYieldAllowed, generator,
	            marker = markerCreate();

	        expectKeyword('function');

	        generator = false;
	        if (match('*')) {
	            lex();
	            generator = true;
	        }

	        token = lookahead;

	        id = parseVariableIdentifier();

	        if (strict) {
	            if (isRestrictedWord(token.value)) {
	                throwErrorTolerant(token, Messages.StrictFunctionName);
	            }
	        } else {
	            if (isRestrictedWord(token.value)) {
	                firstRestricted = token;
	                message = Messages.StrictFunctionName;
	            } else if (isStrictModeReservedWord(token.value)) {
	                firstRestricted = token;
	                message = Messages.StrictReservedWord;
	            }
	        }

	        tmp = parseParams(firstRestricted);
	        firstRestricted = tmp.firstRestricted;
	        if (tmp.message) {
	            message = tmp.message;
	        }

	        previousStrict = strict;
	        previousYieldAllowed = state.yieldAllowed;
	        state.yieldAllowed = generator;

	        body = parseFunctionSourceElements();

	        if (strict && firstRestricted) {
	            throwError(firstRestricted, message);
	        }
	        if (strict && tmp.stricted) {
	            throwErrorTolerant(tmp.stricted, message);
	        }
	        strict = previousStrict;
	        state.yieldAllowed = previousYieldAllowed;

	        return markerApply(marker, delegate.createFunctionDeclaration(id, tmp.params, tmp.defaults, body, tmp.rest, generator, false));
	    }

	    function parseFunctionExpression() {
	        var token, id = null, firstRestricted, message, tmp, body, previousStrict, previousYieldAllowed, generator,
	            marker = markerCreate();

	        expectKeyword('function');

	        generator = false;

	        if (match('*')) {
	            lex();
	            generator = true;
	        }

	        if (!match('(')) {
	            token = lookahead;
	            id = parseVariableIdentifier();
	            if (strict) {
	                if (isRestrictedWord(token.value)) {
	                    throwErrorTolerant(token, Messages.StrictFunctionName);
	                }
	            } else {
	                if (isRestrictedWord(token.value)) {
	                    firstRestricted = token;
	                    message = Messages.StrictFunctionName;
	                } else if (isStrictModeReservedWord(token.value)) {
	                    firstRestricted = token;
	                    message = Messages.StrictReservedWord;
	                }
	            }
	        }

	        tmp = parseParams(firstRestricted);
	        firstRestricted = tmp.firstRestricted;
	        if (tmp.message) {
	            message = tmp.message;
	        }

	        previousStrict = strict;
	        previousYieldAllowed = state.yieldAllowed;
	        state.yieldAllowed = generator;

	        body = parseFunctionSourceElements();

	        if (strict && firstRestricted) {
	            throwError(firstRestricted, message);
	        }
	        if (strict && tmp.stricted) {
	            throwErrorTolerant(tmp.stricted, message);
	        }
	        strict = previousStrict;
	        state.yieldAllowed = previousYieldAllowed;

	        return markerApply(marker, delegate.createFunctionExpression(id, tmp.params, tmp.defaults, body, tmp.rest, generator, false));
	    }

	    function parseYieldExpression() {
	        var yieldToken, delegateFlag, expr, marker = markerCreate();

	        yieldToken = lex();
	        assert(yieldToken.value === 'yield', 'Called parseYieldExpression with non-yield lookahead.');

	        if (!state.yieldAllowed) {
	            throwErrorTolerant({}, Messages.IllegalYield);
	        }

	        delegateFlag = false;
	        if (match('*')) {
	            lex();
	            delegateFlag = true;
	        }

	        expr = parseAssignmentExpression();

	        return markerApply(marker, delegate.createYieldExpression(expr, delegateFlag));
	    }

	    // 14 Functions and classes

	    // 14.1 Functions is defined above (13 in ES5)
	    // 14.2 Arrow Functions Definitions is defined in (7.3 assignments)

	    // 14.3 Method Definitions
	    // 14.3.7
	    function specialMethod(methodDefinition) {
	        return methodDefinition.kind === 'get' ||
	            methodDefinition.kind === 'set' ||
	            methodDefinition.value.generator;
	    }

	    function parseMethodDefinition() {
	        var token, key, param, propType, computed,
	            marker = markerCreate();

	        if (lookahead.value === 'static') {
	            propType = ClassPropertyType.static;
	            lex();
	        } else {
	            propType = ClassPropertyType.prototype;
	        }

	        if (match('*')) {
	            lex();
	            computed = (lookahead.value === '[');
	            return markerApply(marker, delegate.createMethodDefinition(
	                propType,
	                '',
	                parseObjectPropertyKey(),
	                parsePropertyMethodFunction({ generator: true }),
	                computed
	            ));
	        }

	        token = lookahead;
	        key = parseObjectPropertyKey();

	        if (token.value === 'get' && !match('(')) {
	            computed = (lookahead.value === '[');
	            key = parseObjectPropertyKey();

	            expect('(');
	            expect(')');
	            return markerApply(marker, delegate.createMethodDefinition(
	                propType,
	                'get',
	                key,
	                parsePropertyFunction({ generator: false }),
	                computed
	            ));
	        }
	        if (token.value === 'set' && !match('(')) {
	            computed = (lookahead.value === '[');
	            key = parseObjectPropertyKey();

	            expect('(');
	            token = lookahead;
	            param = [ parseVariableIdentifier() ];
	            expect(')');
	            return markerApply(marker, delegate.createMethodDefinition(
	                propType,
	                'set',
	                key,
	                parsePropertyFunction({ params: param, generator: false, name: token }),
	                computed
	            ));
	        }

	        computed = (token.value === '[');

	        return markerApply(marker, delegate.createMethodDefinition(
	            propType,
	            '',
	            key,
	            parsePropertyMethodFunction({ generator: false }),
	            computed
	        ));
	    }

	    // 14.5 Class Definitions

	    function parseClassElement() {
	        if (match(';')) {
	            lex();
	        } else {
	            return parseMethodDefinition();
	        }
	    }

	    function parseClassBody() {
	        var classElement, classElements = [], existingProps = {},
	            marker = markerCreate(), propName, propType;

	        existingProps[ClassPropertyType.static] = new StringMap();
	        existingProps[ClassPropertyType.prototype] = new StringMap();

	        expect('{');

	        while (index < length) {
	            if (match('}')) {
	                break;
	            }
	            classElement = parseClassElement(existingProps);

	            if (typeof classElement !== 'undefined') {
	                classElements.push(classElement);

	                propName = !classElement.computed && getFieldName(classElement.key);
	                if (propName !== false) {
	                    propType = classElement.static ?
	                                ClassPropertyType.static :
	                                ClassPropertyType.prototype;

	                    if (propName === 'constructor' && !classElement.static) {
	                        if (specialMethod(classElement)) {
	                            throwError(classElement, Messages.IllegalClassConstructorProperty);
	                        }
	                        if (existingProps[ClassPropertyType.prototype].has('constructor')) {
	                            throwError(classElement.key, Messages.IllegalDuplicateClassProperty);
	                        }
	                    }
	                    existingProps[propType].set(propName, true);
	                }
	            }
	        }

	        expect('}');

	        return markerApply(marker, delegate.createClassBody(classElements));
	    }

	    function parseClassExpression() {
	        var id, previousYieldAllowed, superClass = null, marker = markerCreate();

	        expectKeyword('class');

	        if (!matchKeyword('extends') && !match('{')) {
	            id = parseVariableIdentifier();
	        }

	        if (matchKeyword('extends')) {
	            expectKeyword('extends');
	            previousYieldAllowed = state.yieldAllowed;
	            state.yieldAllowed = false;
	            superClass = parseAssignmentExpression();
	            state.yieldAllowed = previousYieldAllowed;
	        }

	        return markerApply(marker, delegate.createClassExpression(id, superClass, parseClassBody()));
	    }

	    function parseClassDeclaration() {
	        var id, previousYieldAllowed, superClass = null, marker = markerCreate();

	        expectKeyword('class');

	        id = parseVariableIdentifier();

	        if (matchKeyword('extends')) {
	            expectKeyword('extends');
	            previousYieldAllowed = state.yieldAllowed;
	            state.yieldAllowed = false;
	            superClass = parseAssignmentExpression();
	            state.yieldAllowed = previousYieldAllowed;
	        }

	        return markerApply(marker, delegate.createClassDeclaration(id, superClass, parseClassBody()));
	    }

	    // 15 Program

	    function parseSourceElement() {
	        if (lookahead.type === Token.Keyword) {
	            switch (lookahead.value) {
	            case 'const':
	            case 'let':
	                return parseConstLetDeclaration(lookahead.value);
	            case 'function':
	                return parseFunctionDeclaration();
	            case 'export':
	                throwErrorTolerant({}, Messages.IllegalExportDeclaration);
	                return parseExportDeclaration();
	            case 'import':
	                throwErrorTolerant({}, Messages.IllegalImportDeclaration);
	                return parseImportDeclaration();
	            default:
	                return parseStatement();
	            }
	        }

	        if (lookahead.type !== Token.EOF) {
	            return parseStatement();
	        }
	    }

	    function parseProgramElement() {
	        if (extra.isModule && lookahead.type === Token.Keyword) {
	            switch (lookahead.value) {
	            case 'export':
	                return parseExportDeclaration();
	            case 'import':
	                return parseImportDeclaration();
	            }
	        }

	        return parseSourceElement();
	    }

	    function parseProgramElements() {
	        var sourceElement, sourceElements = [], token, directive, firstRestricted;

	        while (index < length) {
	            token = lookahead;
	            if (token.type !== Token.StringLiteral) {
	                break;
	            }

	            sourceElement = parseProgramElement();
	            sourceElements.push(sourceElement);
	            if (sourceElement.expression.type !== Syntax.Literal) {
	                // this is not directive
	                break;
	            }
	            directive = source.slice(token.range[0] + 1, token.range[1] - 1);
	            if (directive === 'use strict') {
	                strict = true;
	                if (firstRestricted) {
	                    throwErrorTolerant(firstRestricted, Messages.StrictOctalLiteral);
	                }
	            } else {
	                if (!firstRestricted && token.octal) {
	                    firstRestricted = token;
	                }
	            }
	        }

	        while (index < length) {
	            sourceElement = parseProgramElement();
	            if (typeof sourceElement === 'undefined') {
	                break;
	            }
	            sourceElements.push(sourceElement);
	        }
	        return sourceElements;
	    }

	    function parseProgram() {
	        var body, marker = markerCreate();
	        strict = !!extra.isModule;
	        peek();
	        body = parseProgramElements();
	        return markerApply(marker, delegate.createProgram(body));
	    }

	    function collectToken() {
	        var loc, token, range, value, entry;

	        skipComment();
	        loc = {
	            start: {
	                line: lineNumber,
	                column: index - lineStart
	            }
	        };

	        token = extra.advance();
	        loc.end = {
	            line: lineNumber,
	            column: index - lineStart
	        };

	        if (token.type !== Token.EOF) {
	            range = [token.range[0], token.range[1]];
	            value = source.slice(token.range[0], token.range[1]);
	            entry = {
	                type: TokenName[token.type],
	                value: value,
	                range: range,
	                loc: loc
	            };
	            if (token.regex) {
	                entry.regex = {
	                    pattern: token.regex.pattern,
	                    flags: token.regex.flags
	                };
	            }
	            extra.tokens.push(entry);
	        }

	        return token;
	    }

	    function collectRegex() {
	        var pos, loc, regex, token;

	        skipComment();

	        pos = index;
	        loc = {
	            start: {
	                line: lineNumber,
	                column: index - lineStart
	            }
	        };

	        regex = extra.scanRegExp();
	        loc.end = {
	            line: lineNumber,
	            column: index - lineStart
	        };

	        if (!extra.tokenize) {
	            /* istanbul ignore next */
	            // Pop the previous token, which is likely '/' or '/='
	            if (extra.tokens.length > 0) {
	                token = extra.tokens[extra.tokens.length - 1];
	                if (token.range[0] === pos && token.type === 'Punctuator') {
	                    if (token.value === '/' || token.value === '/=') {
	                        extra.tokens.pop();
	                    }
	                }
	            }

	            extra.tokens.push({
	                type: 'RegularExpression',
	                value: regex.literal,
	                regex: regex.regex,
	                range: [pos, index],
	                loc: loc
	            });
	        }

	        return regex;
	    }

	    function filterTokenLocation() {
	        var i, entry, token, tokens = [];

	        for (i = 0; i < extra.tokens.length; ++i) {
	            entry = extra.tokens[i];
	            token = {
	                type: entry.type,
	                value: entry.value
	            };
	            if (entry.regex) {
	                token.regex = {
	                    pattern: entry.regex.pattern,
	                    flags: entry.regex.flags
	                };
	            }
	            if (extra.range) {
	                token.range = entry.range;
	            }
	            if (extra.loc) {
	                token.loc = entry.loc;
	            }
	            tokens.push(token);
	        }

	        extra.tokens = tokens;
	    }

	    function patch() {
	        if (typeof extra.tokens !== 'undefined') {
	            extra.advance = advance;
	            extra.scanRegExp = scanRegExp;

	            advance = collectToken;
	            scanRegExp = collectRegex;
	        }
	    }

	    function unpatch() {
	        if (typeof extra.scanRegExp === 'function') {
	            advance = extra.advance;
	            scanRegExp = extra.scanRegExp;
	        }
	    }

	    // This is used to modify the delegate.

	    function extend(object, properties) {
	        var entry, result = {};

	        for (entry in object) {
	            /* istanbul ignore else */
	            if (object.hasOwnProperty(entry)) {
	                result[entry] = object[entry];
	            }
	        }

	        for (entry in properties) {
	            /* istanbul ignore else */
	            if (properties.hasOwnProperty(entry)) {
	                result[entry] = properties[entry];
	            }
	        }

	        return result;
	    }

	    function tokenize(code, options) {
	        var toString,
	            token,
	            tokens;

	        toString = String;
	        if (typeof code !== 'string' && !(code instanceof String)) {
	            code = toString(code);
	        }

	        delegate = SyntaxTreeDelegate;
	        source = code;
	        index = 0;
	        lineNumber = (source.length > 0) ? 1 : 0;
	        lineStart = 0;
	        length = source.length;
	        lookahead = null;
	        state = {
	            allowKeyword: true,
	            allowIn: true,
	            labelSet: new StringMap(),
	            inFunctionBody: false,
	            inIteration: false,
	            inSwitch: false,
	            lastCommentStart: -1,
	            curlyStack: [],
	            curlyLastIndex: 0
	        };

	        extra = {};

	        // Options matching.
	        options = options || {};

	        // Of course we collect tokens here.
	        options.tokens = true;
	        extra.tokens = [];
	        extra.tokenize = true;
	        // The following two fields are necessary to compute the Regex tokens.
	        extra.openParenToken = -1;
	        extra.openCurlyToken = -1;

	        extra.range = (typeof options.range === 'boolean') && options.range;
	        extra.loc = (typeof options.loc === 'boolean') && options.loc;

	        if (typeof options.comment === 'boolean' && options.comment) {
	            extra.comments = [];
	        }
	        if (typeof options.tolerant === 'boolean' && options.tolerant) {
	            extra.errors = [];
	        }

	        patch();

	        try {
	            peek();
	            if (lookahead.type === Token.EOF) {
	                return extra.tokens;
	            }

	            token = lex();
	            while (lookahead.type !== Token.EOF) {
	                try {
	                    token = lex();
	                } catch (lexError) {
	                    token = lookahead;
	                    if (extra.errors) {
	                        extra.errors.push(lexError);
	                        // We have to break on the first error
	                        // to avoid infinite loops.
	                        break;
	                    } else {
	                        throw lexError;
	                    }
	                }
	            }

	            filterTokenLocation();
	            tokens = extra.tokens;
	            if (typeof extra.comments !== 'undefined') {
	                tokens.comments = extra.comments;
	            }
	            if (typeof extra.errors !== 'undefined') {
	                tokens.errors = extra.errors;
	            }
	        } catch (e) {
	            throw e;
	        } finally {
	            unpatch();
	            extra = {};
	        }
	        return tokens;
	    }

	    function parse(code, options) {
	        var program, toString;

	        toString = String;
	        if (typeof code !== 'string' && !(code instanceof String)) {
	            code = toString(code);
	        }

	        delegate = SyntaxTreeDelegate;
	        source = code;
	        index = 0;
	        lineNumber = (source.length > 0) ? 1 : 0;
	        lineStart = 0;
	        length = source.length;
	        lookahead = null;
	        state = {
	            allowKeyword: false,
	            allowIn: true,
	            labelSet: new StringMap(),
	            parenthesizedCount: 0,
	            inFunctionBody: false,
	            inIteration: false,
	            inSwitch: false,
	            lastCommentStart: -1,
	            yieldAllowed: false,
	            curlyPosition: 0,
	            curlyStack: [],
	            curlyLastIndex: 0
	        };

	        extra = {};
	        if (typeof options !== 'undefined') {
	            extra.range = (typeof options.range === 'boolean') && options.range;
	            extra.loc = (typeof options.loc === 'boolean') && options.loc;
	            extra.attachComment = (typeof options.attachComment === 'boolean') && options.attachComment;

	            if (extra.loc && options.source !== null && options.source !== undefined) {
	                delegate = extend(delegate, {
	                    'postProcess': function (node) {
	                        node.loc.source = toString(options.source);
	                        return node;
	                    }
	                });
	            }

	            if (options.sourceType === 'module') {
	                extra.isModule = true;
	            }
	            if (typeof options.tokens === 'boolean' && options.tokens) {
	                extra.tokens = [];
	            }
	            if (typeof options.comment === 'boolean' && options.comment) {
	                extra.comments = [];
	            }
	            if (typeof options.tolerant === 'boolean' && options.tolerant) {
	                extra.errors = [];
	            }
	            if (extra.attachComment) {
	                extra.range = true;
	                extra.comments = [];
	                extra.bottomRightStack = [];
	                extra.trailingComments = [];
	                extra.leadingComments = [];
	            }
	        }

	        patch();
	        try {
	            program = parseProgram();
	            if (typeof extra.comments !== 'undefined') {
	                program.comments = extra.comments;
	            }
	            if (typeof extra.tokens !== 'undefined') {
	                filterTokenLocation();
	                program.tokens = extra.tokens;
	            }
	            if (typeof extra.errors !== 'undefined') {
	                program.errors = extra.errors;
	            }
	        } catch (e) {
	            throw e;
	        } finally {
	            unpatch();
	            extra = {};
	        }

	        return program;
	    }

	    // Sync with *.json manifests.
	    exports.version = '1.1.0-dev-harmony';

	    exports.tokenize = tokenize;

	    exports.parse = parse;

	    // Deep copy.
	   /* istanbul ignore next */
	    exports.Syntax = (function () {
	        var name, types = {};

	        if (typeof Object.create === 'function') {
	            types = Object.create(null);
	        }

	        for (name in Syntax) {
	            if (Syntax.hasOwnProperty(name)) {
	                types[name] = Syntax[name];
	            }
	        }

	        if (typeof Object.freeze === 'function') {
	            Object.freeze(types);
	        }

	        return types;
	    }());

	}));
	/* vim: set sw=4 ts=4 et tw=80 : */


/***/ },
/* 42 */
/***/ function(module, exports) {

	"use strict";

	var originalObject = Object;
	var originalDefProp = Object.defineProperty;
	var originalCreate = Object.create;

	function defProp(obj, name, value) {
	  if (originalDefProp) try {
	    originalDefProp.call(originalObject, obj, name, { value: value });
	  } catch (definePropertyIsBrokenInIE8) {
	    obj[name] = value;
	  } else {
	    obj[name] = value;
	  }
	}

	// For functions that will be invoked using .call or .apply, we need to
	// define those methods on the function objects themselves, rather than
	// inheriting them from Function.prototype, so that a malicious or clumsy
	// third party cannot interfere with the functionality of this module by
	// redefining Function.prototype.call or .apply.
	function makeSafeToCall(fun) {
	  if (fun) {
	    defProp(fun, "call", fun.call);
	    defProp(fun, "apply", fun.apply);
	  }
	  return fun;
	}

	makeSafeToCall(originalDefProp);
	makeSafeToCall(originalCreate);

	var hasOwn = makeSafeToCall(Object.prototype.hasOwnProperty);
	var numToStr = makeSafeToCall(Number.prototype.toString);
	var strSlice = makeSafeToCall(String.prototype.slice);

	var cloner = function(){};
	function create(prototype) {
	  if (originalCreate) {
	    return originalCreate.call(originalObject, prototype);
	  }
	  cloner.prototype = prototype || null;
	  return new cloner;
	}

	var rand = Math.random;
	var uniqueKeys = create(null);

	function makeUniqueKey() {
	  // Collisions are highly unlikely, but this module is in the business of
	  // making guarantees rather than safe bets.
	  do var uniqueKey = internString(strSlice.call(numToStr.call(rand(), 36), 2));
	  while (hasOwn.call(uniqueKeys, uniqueKey));
	  return uniqueKeys[uniqueKey] = uniqueKey;
	}

	function internString(str) {
	  var obj = {};
	  obj[str] = true;
	  return Object.keys(obj)[0];
	}

	// External users might find this function useful, but it is not necessary
	// for the typical use of this module.
	defProp(exports, "makeUniqueKey", makeUniqueKey);

	// Object.getOwnPropertyNames is the only way to enumerate non-enumerable
	// properties, so if we wrap it to ignore our secret keys, there should be
	// no way (except guessing) to access those properties.
	var originalGetOPNs = Object.getOwnPropertyNames;
	Object.getOwnPropertyNames = function getOwnPropertyNames(object) {
	  for (var names = originalGetOPNs(object),
	           src = 0,
	           dst = 0,
	           len = names.length;
	       src < len;
	       ++src) {
	    if (!hasOwn.call(uniqueKeys, names[src])) {
	      if (src > dst) {
	        names[dst] = names[src];
	      }
	      ++dst;
	    }
	  }
	  names.length = dst;
	  return names;
	};

	function defaultCreatorFn(object) {
	  return create(null);
	}

	function makeAccessor(secretCreatorFn) {
	  var brand = makeUniqueKey();
	  var passkey = create(null);

	  secretCreatorFn = secretCreatorFn || defaultCreatorFn;

	  function register(object) {
	    var secret; // Created lazily.

	    function vault(key, forget) {
	      // Only code that has access to the passkey can retrieve (or forget)
	      // the secret object.
	      if (key === passkey) {
	        return forget
	          ? secret = null
	          : secret || (secret = secretCreatorFn(object));
	      }
	    }

	    defProp(object, brand, vault);
	  }

	  function accessor(object) {
	    if (!hasOwn.call(object, brand))
	      register(object);
	    return object[brand](passkey);
	  }

	  accessor.forget = function(object) {
	    if (hasOwn.call(object, brand))
	      object[brand](passkey, true);
	  };

	  return accessor;
	}

	defProp(exports, "makeAccessor", makeAccessor);


/***/ },
/* 43 */
/***/ function(module, exports, __webpack_require__) {

	var assert = __webpack_require__(4);
	var getFieldValue = __webpack_require__(27).getFieldValue;
	var sourceMap = __webpack_require__(31);
	var SourceMapConsumer = sourceMap.SourceMapConsumer;
	var SourceMapGenerator = sourceMap.SourceMapGenerator;
	var hasOwn = Object.prototype.hasOwnProperty;

	function getUnionOfKeys(obj) {
	    for (var i = 0, key,
	             result = {},
	             objs = arguments,
	             argc = objs.length;
	         i < argc;
	         i += 1)
	    {
	        obj = objs[i];
	        for (key in obj)
	            if (hasOwn.call(obj, key))
	                result[key] = true;
	    }
	    return result;
	}
	exports.getUnionOfKeys = getUnionOfKeys;

	exports.assertEquivalent = function(a, b) {
	    if (!deepEquivalent(a, b)) {
	        throw new Error(
	            JSON.stringify(a) + " not equivalent to " +
	            JSON.stringify(b)
	        );
	    }
	};

	function deepEquivalent(a, b) {
	    if (a === b)
	        return true;

	    if (a instanceof Array)
	        return deepArrEquiv(a, b);

	    if (typeof a === "object")
	        return deepObjEquiv(a, b);

	    return false;
	}
	exports.deepEquivalent = deepEquivalent;

	function deepArrEquiv(a, b) {
	    assert.ok(a instanceof Array);
	    var len = a.length;

	    if (!(b instanceof Array &&
	          b.length === len))
	        return false;

	    for (var i = 0; i < len; ++i) {
	        if (i in a !== i in b)
	            return false;

	        if (!deepEquivalent(a[i], b[i]))
	            return false;
	    }

	    return true;
	}

	function deepObjEquiv(a, b) {
	    assert.strictEqual(typeof a, "object");
	    if (!a || !b || typeof b !== "object")
	        return false;

	    for (var key in getUnionOfKeys(a, b)) {
	        if (key === "loc" ||
	            key === "range" ||
	            key === "comments" ||
	            key === "raw")
	            continue;

	        if (!deepEquivalent(getFieldValue(a, key),
	                            getFieldValue(b, key)))
	        {
	            return false;
	        }
	    }

	    return true;
	}

	function comparePos(pos1, pos2) {
	    return (pos1.line - pos2.line) || (pos1.column - pos2.column);
	}
	exports.comparePos = comparePos;

	exports.composeSourceMaps = function(formerMap, latterMap) {
	    if (formerMap) {
	        if (!latterMap) {
	            return formerMap;
	        }
	    } else {
	        return latterMap || null;
	    }

	    var smcFormer = new SourceMapConsumer(formerMap);
	    var smcLatter = new SourceMapConsumer(latterMap);
	    var smg = new SourceMapGenerator({
	        file: latterMap.file,
	        sourceRoot: latterMap.sourceRoot
	    });

	    var sourcesToContents = {};

	    smcLatter.eachMapping(function(mapping) {
	        var origPos = smcFormer.originalPositionFor({
	            line: mapping.originalLine,
	            column: mapping.originalColumn
	        });

	        var sourceName = origPos.source;

	        smg.addMapping({
	            source: sourceName,
	            original: {
	                line: origPos.line,
	                column: origPos.column
	            },
	            generated: {
	                line: mapping.generatedLine,
	                column: mapping.generatedColumn
	            },
	            name: mapping.name
	        });

	        var sourceContent = smcFormer.sourceContentFor(sourceName);
	        if (sourceContent && !hasOwn.call(sourcesToContents, sourceName)) {
	            sourcesToContents[sourceName] = sourceContent;
	            smg.setSourceContent(sourceName, sourceContent);
	        }
	    });

	    return smg.toJSON();
	};


/***/ },
/* 44 */
/***/ function(module, exports, __webpack_require__) {

	var assert = __webpack_require__(4);
	var types = __webpack_require__(27);
	var isString = types.builtInTypes.string;
	var isNumber = types.builtInTypes.number;
	var SourceLocation = types.namedTypes.SourceLocation;
	var Position = types.namedTypes.Position;
	var linesModule = __webpack_require__(30);
	var comparePos = __webpack_require__(43).comparePos;

	function Mapping(sourceLines, sourceLoc, targetLoc) {
	    assert.ok(this instanceof Mapping);
	    assert.ok(sourceLines instanceof linesModule.Lines);
	    SourceLocation.assert(sourceLoc);

	    if (targetLoc) {
	        // In certain cases it's possible for targetLoc.{start,end}.column
	        // values to be negative, which technically makes them no longer
	        // valid SourceLocation nodes, so we need to be more forgiving.
	        assert.ok(
	            isNumber.check(targetLoc.start.line) &&
	            isNumber.check(targetLoc.start.column) &&
	            isNumber.check(targetLoc.end.line) &&
	            isNumber.check(targetLoc.end.column)
	        );
	    } else {
	        // Assume identity mapping if no targetLoc specified.
	        targetLoc = sourceLoc;
	    }

	    Object.defineProperties(this, {
	        sourceLines: { value: sourceLines },
	        sourceLoc: { value: sourceLoc },
	        targetLoc: { value: targetLoc }
	    });
	}

	var Mp = Mapping.prototype;
	module.exports = Mapping;

	Mp.slice = function(lines, start, end) {
	    assert.ok(lines instanceof linesModule.Lines);
	    Position.assert(start);

	    if (end) {
	        Position.assert(end);
	    } else {
	        end = lines.lastPos();
	    }

	    var sourceLines = this.sourceLines;
	    var sourceLoc = this.sourceLoc;
	    var targetLoc = this.targetLoc;

	    function skip(name) {
	        var sourceFromPos = sourceLoc[name];
	        var targetFromPos = targetLoc[name];
	        var targetToPos = start;

	        if (name === "end") {
	            targetToPos = end;
	        } else {
	            assert.strictEqual(name, "start");
	        }

	        return skipChars(
	            sourceLines, sourceFromPos,
	            lines, targetFromPos, targetToPos
	        );
	    }

	    if (comparePos(start, targetLoc.start) <= 0) {
	        if (comparePos(targetLoc.end, end) <= 0) {
	            targetLoc = {
	                start: subtractPos(targetLoc.start, start.line, start.column),
	                end: subtractPos(targetLoc.end, start.line, start.column)
	            };

	            // The sourceLoc can stay the same because the contents of the
	            // targetLoc have not changed.

	        } else if (comparePos(end, targetLoc.start) <= 0) {
	            return null;

	        } else {
	            sourceLoc = {
	                start: sourceLoc.start,
	                end: skip("end")
	            };

	            targetLoc = {
	                start: subtractPos(targetLoc.start, start.line, start.column),
	                end: subtractPos(end, start.line, start.column)
	            };
	        }

	    } else {
	        if (comparePos(targetLoc.end, start) <= 0) {
	            return null;
	        }

	        if (comparePos(targetLoc.end, end) <= 0) {
	            sourceLoc = {
	                start: skip("start"),
	                end: sourceLoc.end
	            };

	            targetLoc = {
	                // Same as subtractPos(start, start.line, start.column):
	                start: { line: 1, column: 0 },
	                end: subtractPos(targetLoc.end, start.line, start.column)
	            };

	        } else {
	            sourceLoc = {
	                start: skip("start"),
	                end: skip("end")
	            };

	            targetLoc = {
	                // Same as subtractPos(start, start.line, start.column):
	                start: { line: 1, column: 0 },
	                end: subtractPos(end, start.line, start.column)
	            };
	        }
	    }

	    return new Mapping(this.sourceLines, sourceLoc, targetLoc);
	};

	Mp.add = function(line, column) {
	    return new Mapping(this.sourceLines, this.sourceLoc, {
	        start: addPos(this.targetLoc.start, line, column),
	        end: addPos(this.targetLoc.end, line, column)
	    });
	};

	function addPos(toPos, line, column) {
	    return {
	        line: toPos.line + line - 1,
	        column: (toPos.line === 1)
	            ? toPos.column + column
	            : toPos.column
	    };
	}

	Mp.subtract = function(line, column) {
	    return new Mapping(this.sourceLines, this.sourceLoc, {
	        start: subtractPos(this.targetLoc.start, line, column),
	        end: subtractPos(this.targetLoc.end, line, column)
	    });
	};

	function subtractPos(fromPos, line, column) {
	    return {
	        line: fromPos.line - line + 1,
	        column: (fromPos.line === line)
	            ? fromPos.column - column
	            : fromPos.column
	    };
	}

	Mp.indent = function(by, skipFirstLine, noNegativeColumns) {
	    if (by === 0) {
	        return this;
	    }

	    var targetLoc = this.targetLoc;
	    var startLine = targetLoc.start.line;
	    var endLine = targetLoc.end.line;

	    if (skipFirstLine && startLine === 1 && endLine === 1) {
	        return this;
	    }

	    targetLoc = {
	        start: targetLoc.start,
	        end: targetLoc.end
	    };

	    if (!skipFirstLine || startLine > 1) {
	        var startColumn = targetLoc.start.column + by;
	        targetLoc.start = {
	            line: startLine,
	            column: noNegativeColumns
	                ? Math.max(0, startColumn)
	                : startColumn
	        };
	    }

	    if (!skipFirstLine || endLine > 1) {
	        var endColumn = targetLoc.end.column + by;
	        targetLoc.end = {
	            line: endLine,
	            column: noNegativeColumns
	                ? Math.max(0, endColumn)
	                : endColumn
	        };
	    }

	    return new Mapping(this.sourceLines, this.sourceLoc, targetLoc);
	};

	function skipChars(
	    sourceLines, sourceFromPos,
	    targetLines, targetFromPos, targetToPos
	) {
	    assert.ok(sourceLines instanceof linesModule.Lines);
	    assert.ok(targetLines instanceof linesModule.Lines);
	    Position.assert(sourceFromPos);
	    Position.assert(targetFromPos);
	    Position.assert(targetToPos);

	    var targetComparison = comparePos(targetFromPos, targetToPos);
	    if (targetComparison === 0) {
	        // Trivial case: no characters to skip.
	        return sourceFromPos;
	    }

	    if (targetComparison < 0) {
	        // Skipping forward.

	        var sourceCursor = sourceLines.skipSpaces(sourceFromPos);
	        var targetCursor = targetLines.skipSpaces(targetFromPos);

	        var lineDiff = targetToPos.line - targetCursor.line;
	        sourceCursor.line += lineDiff;
	        targetCursor.line += lineDiff;

	        if (lineDiff > 0) {
	            // If jumping to later lines, reset columns to the beginnings
	            // of those lines.
	            sourceCursor.column = 0;
	            targetCursor.column = 0;
	        } else {
	            assert.strictEqual(lineDiff, 0);
	        }

	        while (comparePos(targetCursor, targetToPos) < 0 &&
	               targetLines.nextPos(targetCursor, true)) {
	            assert.ok(sourceLines.nextPos(sourceCursor, true));
	            assert.strictEqual(
	                sourceLines.charAt(sourceCursor),
	                targetLines.charAt(targetCursor)
	            );
	        }

	    } else {
	        // Skipping backward.

	        var sourceCursor = sourceLines.skipSpaces(sourceFromPos, true);
	        var targetCursor = targetLines.skipSpaces(targetFromPos, true);

	        var lineDiff = targetToPos.line - targetCursor.line;
	        sourceCursor.line += lineDiff;
	        targetCursor.line += lineDiff;

	        if (lineDiff < 0) {
	            // If jumping to earlier lines, reset columns to the ends of
	            // those lines.
	            sourceCursor.column = sourceLines.getLineLength(sourceCursor.line);
	            targetCursor.column = targetLines.getLineLength(targetCursor.line);
	        } else {
	            assert.strictEqual(lineDiff, 0);
	        }

	        while (comparePos(targetToPos, targetCursor) < 0 &&
	               targetLines.prevPos(targetCursor, true)) {
	            assert.ok(sourceLines.prevPos(sourceCursor, true));
	            assert.strictEqual(
	                sourceLines.charAt(sourceCursor),
	                targetLines.charAt(targetCursor)
	            );
	        }
	    }

	    return sourceCursor;
	}


/***/ },
/* 45 */
/***/ function(module, exports, __webpack_require__) {

	var assert = __webpack_require__(4);
	var types = __webpack_require__(27);
	var isArray = types.builtInTypes.array;
	var isObject = types.builtInTypes.object;
	var linesModule = __webpack_require__(30);
	var fromString = linesModule.fromString;
	var Lines = linesModule.Lines;
	var concat = linesModule.concat;
	var comparePos = __webpack_require__(43).comparePos;

	exports.add = function(ast, lines) {
	    var comments = ast.comments;
	    assert.ok(comments instanceof Array);
	    delete ast.comments;

	    assert.ok(lines instanceof Lines);

	    var pt = new PosTracker,
	        len = comments.length,
	        comment,
	        key,
	        loc, locs = pt.locs,
	        pair,
	        sorted = [];

	    pt.visit(ast);

	    for (var i = 0; i < len; ++i) {
	        comment = comments[i];
	        Object.defineProperty(comment.loc, "lines", { value: lines });
	        pt.getEntry(comment, "end").comment = comment;
	    }

	    for (key in locs) {
	        loc = locs[key];
	        pair = key.split(",");

	        sorted.push({
	            line: +pair[0],
	            column: +pair[1],
	            startNode: loc.startNode,
	            endNode: loc.endNode,
	            comment: loc.comment
	        });
	    }

	    sorted.sort(comparePos);

	    var pendingComments = [];
	    var previousNode;

	    function addComment(node, comment) {
	        if (node) {
	            var comments = node.comments || (node.comments = []);
	            comments.push(comment);
	        }
	    }

	    function dumpTrailing() {
	        pendingComments.forEach(function(comment) {
	            addComment(previousNode, comment);
	            comment.trailing = true;
	        });

	        pendingComments.length = 0;
	    }

	    sorted.forEach(function(entry) {
	        if (entry.endNode) {
	            // If we're ending a node with comments still pending, then we
	            // need to attach those comments to the previous node before
	            // updating the previous node.
	            dumpTrailing();
	            previousNode = entry.endNode;
	        }

	        if (entry.comment) {
	            pendingComments.push(entry.comment);
	        }

	        if (entry.startNode) {
	            var node = entry.startNode;
	            var nodeStartColumn = node.loc.start.column;
	            var didAddLeadingComment = false;
	            var gapEndLoc = node.loc.start;

	            // Iterate backwards through pendingComments, examining the
	            // gaps between them. In order to earn the .possiblyLeading
	            // status, a comment must be separated from entry.startNode by
	            // an unbroken series of whitespace-only gaps.
	            for (var i = pendingComments.length - 1; i >= 0; --i) {
	                var comment = pendingComments[i];
	                var gap = lines.slice(comment.loc.end, gapEndLoc);
	                gapEndLoc = comment.loc.start;

	                if (gap.isOnlyWhitespace()) {
	                    comment.possiblyLeading = true;
	                } else {
	                    break;
	                }
	            }

	            pendingComments.forEach(function(comment) {
	                if (!comment.possiblyLeading) {
	                    // If comment.possiblyLeading was not set to true
	                    // above, the comment must be a trailing comment.
	                    comment.trailing = true;
	                    addComment(previousNode, comment);

	                } else if (didAddLeadingComment) {
	                    // If we previously added a leading comment to this
	                    // node, then any subsequent pending comments must
	                    // also be leading comments, even if they are indented
	                    // more deeply than the node itself.
	                    assert.strictEqual(comment.possiblyLeading, true);
	                    comment.trailing = false;
	                    addComment(node, comment);

	                } else if (comment.type === "Line" &&
	                           comment.loc.start.column > nodeStartColumn) {
	                    // If the comment is a //-style comment and indented
	                    // more deeply than the node itself, and we have not
	                    // encountered any other leading comments, treat this
	                    // comment as a trailing comment and add it to the
	                    // previous node.
	                    comment.trailing = true;
	                    addComment(previousNode, comment);

	                } else {
	                    // Here we have the first leading comment for this node.
	                    comment.trailing = false;
	                    addComment(node, comment);
	                    didAddLeadingComment = true;
	                }
	            });

	            pendingComments.length = 0;

	            // Note: the previous node is the node that started OR ended
	            // most recently.
	            previousNode = entry.startNode;
	        }
	    });

	    // Provided we have a previous node to add them to, dump any
	    // still-pending comments into the last node we came across.
	    dumpTrailing();
	};

	function PosTracker() {
	    assert.ok(this instanceof PosTracker);
	    this.locs = {};
	}

	var PTp = PosTracker.prototype;

	PTp.getEntry = function(node, which) {
	    var locs = this.locs,
	        loc = node && node.loc,
	        pos = loc && loc[which],
	        key = pos && (pos.line + "," + pos.column);
	    return key && (locs[key] || (locs[key] = {}));
	};

	PTp.visit = function(node) {
	    if (isArray.check(node)) {
	        node.forEach(this.visit, this);
	    } else if (isObject.check(node)) {
	        var entry = this.getEntry(node, "start");
	        if (entry && !entry.startNode) {
	            entry.startNode = node;
	        }

	        var names = types.getFieldNames(node);
	        for (var i = 0, len = names.length; i < len; ++i) {
	            this.visit(node[names[i]]);
	        }

	        if ((entry = this.getEntry(node, "end"))) {
	            entry.endNode = node;
	        }
	    }
	};

	function printLeadingComment(comment) {
	    var orig = comment.original;
	    var loc = orig && orig.loc;
	    var lines = loc && loc.lines;
	    var parts = [];

	    if (comment.type === "Block") {
	        parts.push("/*", comment.value, "*/");
	    } else if (comment.type === "Line") {
	        parts.push("//", comment.value);
	    } else assert.fail(comment.type);

	    if (comment.trailing) {
	        // When we print trailing comments as leading comments, we don't
	        // want to bring any trailing spaces along.
	        parts.push("\n");

	    } else if (lines instanceof Lines) {
	        var trailingSpace = lines.slice(
	            loc.end,
	            lines.skipSpaces(loc.end)
	        );

	        if (trailingSpace.length === 1) {
	            // If the trailing space contains no newlines, then we want to
	            // preserve it exactly as we found it.
	            parts.push(trailingSpace);
	        } else {
	            // If the trailing space contains newlines, then replace it
	            // with just that many newlines, with all other spaces removed.
	            parts.push(new Array(trailingSpace.length).join("\n"));
	        }

	    } else {
	        parts.push("\n");
	    }

	    return concat(parts).stripMargin(loc ? loc.start.column : 0);
	}

	function printTrailingComment(comment) {
	    var orig = comment.original;
	    var loc = orig && orig.loc;
	    var lines = loc && loc.lines;
	    var parts = [];

	    if (lines instanceof Lines) {
	        var fromPos = lines.skipSpaces(loc.start, true) || lines.firstPos();
	        var leadingSpace = lines.slice(fromPos, loc.start);

	        if (leadingSpace.length === 1) {
	            // If the leading space contains no newlines, then we want to
	            // preserve it exactly as we found it.
	            parts.push(leadingSpace);
	        } else {
	            // If the leading space contains newlines, then replace it
	            // with just that many newlines, sans all other spaces.
	            parts.push(new Array(leadingSpace.length).join("\n"));
	        }
	    }

	    if (comment.type === "Block") {
	        parts.push("/*", comment.value, "*/");
	    } else if (comment.type === "Line") {
	        parts.push("//", comment.value, "\n");
	    } else assert.fail(comment.type);

	    return concat(parts).stripMargin(
	        loc ? loc.start.column : 0,
	        true // Skip the first line, in case there were leading spaces.
	    );
	}

	exports.printComments = function(comments, innerLines) {
	    if (innerLines) {
	        assert.ok(innerLines instanceof Lines);
	    } else {
	        innerLines = fromString("");
	    }

	    var count = comments ? comments.length : 0;
	    if (count === 0) {
	        return innerLines;
	    }

	    var parts = [];
	    var leading = [];
	    var trailing = [];

	    comments.forEach(function(comment) {
	        // For now, only /*comments*/ can be trailing comments.
	        if (comment.type === "Block" &&
	            comment.trailing) {
	            trailing.push(comment);
	        } else {
	            leading.push(comment);
	        }
	    });

	    leading.forEach(function(comment) {
	        parts.push(printLeadingComment(comment));
	    });

	    parts.push(innerLines);

	    trailing.forEach(function(comment) {
	        parts.push(printTrailingComment(comment));
	    });

	    return concat(parts);
	};


/***/ },
/* 46 */
/***/ function(module, exports, __webpack_require__) {

	var assert = __webpack_require__(4);
	var sourceMap = __webpack_require__(31);
	var printComments = __webpack_require__(45).printComments;
	var linesModule = __webpack_require__(30);
	var fromString = linesModule.fromString;
	var concat = linesModule.concat;
	var normalizeOptions = __webpack_require__(40).normalize;
	var getReprinter = __webpack_require__(29).getReprinter;
	var types = __webpack_require__(27);
	var namedTypes = types.namedTypes;
	var isString = types.builtInTypes.string;
	var isObject = types.builtInTypes.object;
	var NodePath = types.NodePath;
	var util = __webpack_require__(43);

	function PrintResult(code, sourceMap) {
	    assert.ok(this instanceof PrintResult);
	    isString.assert(code);

	    var properties = {
	        code: {
	            value: code,
	            enumerable: true
	        }
	    };

	    if (sourceMap) {
	        isObject.assert(sourceMap);

	        properties.map = {
	            value: sourceMap,
	            enumerable: true
	        };
	    }

	    Object.defineProperties(this, properties);
	}

	var PRp = PrintResult.prototype;
	var warnedAboutToString = false;

	PRp.toString = function() {
	    if (!warnedAboutToString) {
	        console.warn(
	            "Deprecation warning: recast.print now returns an object with " +
	            "a .code property. You appear to be treating the object as a " +
	            "string, which might still work but is strongly discouraged."
	        );

	        warnedAboutToString = true;
	    }

	    return this.code;
	};

	var emptyPrintResult = new PrintResult("");

	function Printer(originalOptions) {
	    assert.ok(this instanceof Printer);

	    var explicitTabWidth = originalOptions && originalOptions.tabWidth;
	    var options = normalizeOptions(originalOptions);
	    assert.notStrictEqual(options, originalOptions);

	    // It's common for client code to pass the same options into both
	    // recast.parse and recast.print, but the Printer doesn't need (and
	    // can be confused by) options.sourceFileName, so we null it out.
	    options.sourceFileName = null;

	    function printWithComments(path) {
	        assert.ok(path instanceof NodePath);
	        return printComments(path.node.comments, print(path));
	    }

	    function print(path, includeComments) {
	        if (includeComments)
	            return printWithComments(path);

	        assert.ok(path instanceof NodePath);

	        if (!explicitTabWidth) {
	            var oldTabWidth = options.tabWidth;
	            var orig = path.node.original;
	            var origLoc = orig && orig.loc;
	            var origLines = origLoc && origLoc.lines;
	            if (origLines) {
	                options.tabWidth = origLines.guessTabWidth();
	                try {
	                    return maybeReprint(path);
	                } finally {
	                    options.tabWidth = oldTabWidth;
	                }
	            }
	        }

	        return maybeReprint(path);
	    }

	    function maybeReprint(path) {
	        var reprinter = getReprinter(path);
	        if (reprinter)
	            return maybeAddParens(path, reprinter(maybeReprint));
	        return printRootGenerically(path);
	    }

	    // Print the root node generically, but then resume reprinting its
	    // children non-generically.
	    function printRootGenerically(path) {
	        return genericPrint(path, options, printWithComments);
	    }

	    // Print the entire AST generically.
	    function printGenerically(path) {
	        return genericPrint(path, options, printGenerically);
	    }

	    this.print = function(ast) {
	        if (!ast) {
	            return emptyPrintResult;
	        }

	        var path = ast instanceof NodePath ? ast : new NodePath(ast);
	        var lines = print(path, true);

	        return new PrintResult(
	            lines.toString(options),
	            util.composeSourceMaps(
	                options.inputSourceMap,
	                lines.getSourceMap(
	                    options.sourceMapName,
	                    options.sourceRoot
	                )
	            )
	        );
	    };

	    this.printGenerically = function(ast) {
	        if (!ast) {
	            return emptyPrintResult;
	        }

	        var path = ast instanceof NodePath ? ast : new NodePath(ast);
	        var lines = printGenerically(path);

	        return new PrintResult(lines.toString(options));
	    };
	}

	exports.Printer = Printer;

	function maybeAddParens(path, lines) {
	    return path.needsParens() ? concat(["(", lines, ")"]) : lines;
	}

	function genericPrint(path, options, printPath) {
	    assert.ok(path instanceof NodePath);
	    return maybeAddParens(path, genericPrintNoParens(path, options, printPath));
	}

	function genericPrintNoParens(path, options, print) {
	    var n = path.value;

	    if (!n) {
	        return fromString("");
	    }

	    if (typeof n === "string") {
	        return fromString(n, options);
	    }

	    namedTypes.Node.assert(n);

	    switch (n.type) {
	    case "File":
	        path = path.get("program");
	        n = path.node;
	        namedTypes.Program.assert(n);

	        // intentionally fall through...

	    case "Program":
	        return maybeAddSemicolon(
	            printStatementSequence(path.get("body"), print)
	        );

	    case "EmptyStatement":
	        return fromString("");

	    case "ExpressionStatement":
	        return concat([print(path.get("expression")), ";"]);

	    case "BinaryExpression":
	    case "LogicalExpression":
	    case "AssignmentExpression":
	        return fromString(" ").join([
	            print(path.get("left")),
	            n.operator,
	            print(path.get("right"))
	        ]);

	    case "MemberExpression":
	        var parts = [print(path.get("object"))];

	        if (n.computed)
	            parts.push("[", print(path.get("property")), "]");
	        else
	            parts.push(".", print(path.get("property")));

	        return concat(parts);

	    case "Path":
	        return fromString(".").join(n.body);

	    case "Identifier":
	        return fromString(n.name, options);

	    case "SpreadElement":
	    case "SpreadElementPattern":
	    case "SpreadProperty":
	    case "SpreadPropertyPattern":
	        return concat(["...", print(path.get("argument"))]);

	    case "FunctionDeclaration":
	    case "FunctionExpression":
	        var parts = [];

	        if (n.async)
	            parts.push("async ");

	        parts.push("function");

	        if (n.generator)
	            parts.push("*");

	        if (n.id)
	            parts.push(" ", print(path.get("id")));

	        parts.push(
	            "(",
	            printFunctionParams(path, options, print),
	            ") ",
	            print(path.get("body")));

	        return concat(parts);

	    case "ArrowFunctionExpression":
	        var parts = [];

	        if (n.async)
	            parts.push("async ");

	        if (n.params.length === 1) {
	            parts.push(print(path.get("params", 0)));
	        } else {
	            parts.push(
	                "(",
	                printFunctionParams(path, options, print),
	                ")"
	            );
	        }

	        parts.push(" => ", print(path.get("body")));

	        return concat(parts);

	    case "MethodDefinition":
	        return printMethod(
	            n.kind,
	            path.get("key"),
	            path.get("value"),
	            options,
	            print
	        );

	    case "YieldExpression":
	        var parts = ["yield"];

	        if (n.delegate)
	            parts.push("*");

	        if (n.argument)
	            parts.push(" ", print(path.get("argument")));

	        return concat(parts);

	    case "AwaitExpression":
	        var parts = ["await"];

	        if (n.all)
	            parts.push("*");

	        if (n.argument)
	            parts.push(" ", print(path.get("argument")));

	        return concat(parts);

	    case "ModuleDeclaration":
	        var parts = ["module", print(path.get("id"))];

	        if (n.source) {
	            assert.ok(!n.body);
	            parts.push("from", print(path.get("source")));
	        } else {
	            parts.push(print(path.get("body")));
	        }

	        return fromString(" ").join(parts);

	    case "ImportSpecifier":
	    case "ExportSpecifier":
	        var parts = [print(path.get("id"))];

	        if (n.name)
	            parts.push(" as ", print(path.get("name")));

	        return concat(parts);

	    case "ExportBatchSpecifier":
	        return fromString("*");

	    case "ExportDeclaration":
	        var parts = ["export"];

	        if (n["default"]) {
	            parts.push(" default");

	        } else if (n.specifiers &&
	                   n.specifiers.length > 0) {

	            if (n.specifiers.length === 1 &&
	                n.specifiers[0].type === "ExportBatchSpecifier") {
	                parts.push(" *");
	            } else {
	                parts.push(
	                    " { ",
	                    fromString(", ").join(path.get("specifiers").map(print)),
	                    " }"
	                );
	            }

	            if (n.source)
	                parts.push(" from ", print(path.get("source")));

	            parts.push(";");

	            return concat(parts);
	        }

	        var decLines = print(path.get("declaration"));
	        parts.push(" ", decLines);
	        if (lastNonSpaceCharacter(decLines) !== ";") {
	            parts.push(";");
	        }

	        return concat(parts);

	    case "ImportDeclaration":
	        var parts = ["import"];

	        if (!(n.specifiers &&
	              n.specifiers.length > 0)) {
	            parts.push(" ", print(path.get("source")));

	        } else if (n.kind === "default") {
	            parts.push(
	                " ",
	                print(path.get("specifiers", 0)),
	                " from ",
	                print(path.get("source"))
	            );

	        } else if (n.kind === "named") {
	            parts.push(
	                " { ",
	                fromString(", ").join(path.get("specifiers").map(print)),
	                " } from ",
	                print(path.get("source"))
	            );
	        }

	        parts.push(";");

	        return concat(parts);

	    case "BlockStatement":
	        var naked = printStatementSequence(path.get("body"), print);
	        if (naked.isEmpty())
	            return fromString("{}");

	        return concat([
	            "{\n",
	            naked.indent(options.tabWidth),
	            "\n}"
	        ]);

	    case "ReturnStatement":
	        var parts = ["return"];

	        if (n.argument) {
	            var argLines = print(path.get("argument"));
	            if (argLines.length > 1 &&
	                namedTypes.XJSElement &&
	                namedTypes.XJSElement.check(n.argument)) {
	                parts.push(
	                    " (\n",
	                    argLines.indent(options.tabWidth),
	                    "\n)"
	                );
	            } else {
	                parts.push(" ", argLines);
	            }
	        }

	        parts.push(";");

	        return concat(parts);

	    case "CallExpression":
	        return concat([
	            print(path.get("callee")),
	            "(",
	            fromString(", ").join(path.get("arguments").map(print)),
	            ")"
	        ]);

	    case "ObjectExpression":
	    case "ObjectPattern":
	        var allowBreak = false,
	            len = n.properties.length,
	            parts = [len > 0 ? "{\n" : "{"];

	        path.get("properties").map(function(childPath) {
	            var prop = childPath.value;
	            var i = childPath.name;

	            var lines = print(childPath).indent(options.tabWidth);

	            var multiLine = lines.length > 1;
	            if (multiLine && allowBreak) {
	                // Similar to the logic for BlockStatement.
	                parts.push("\n");
	            }

	            parts.push(lines);

	            if (i < len - 1) {
	                // Add an extra line break if the previous object property
	                // had a multi-line value.
	                parts.push(multiLine ? ",\n\n" : ",\n");
	                allowBreak = !multiLine;
	            }
	        });

	        parts.push(len > 0 ? "\n}" : "}");

	        return concat(parts);

	    case "PropertyPattern":
	        return concat([
	            print(path.get("key")),
	            ": ",
	            print(path.get("pattern"))
	        ]);

	    case "Property": // Non-standard AST node type.
	        if (n.method || n.kind === "get" || n.kind === "set") {
	            return printMethod(
	                n.kind,
	                path.get("key"),
	                path.get("value"),
	                options,
	                print
	            );
	        }

	        return concat([
	            print(path.get("key")),
	            ": ",
	            print(path.get("value"))
	        ]);

	    case "ArrayExpression":
	    case "ArrayPattern":
	        var elems = n.elements,
	            len = elems.length,
	            parts = ["["];

	        path.get("elements").each(function(elemPath) {
	            var elem = elemPath.value;
	            if (!elem) {
	                // If the array expression ends with a hole, that hole
	                // will be ignored by the interpreter, but if it ends with
	                // two (or more) holes, we need to write out two (or more)
	                // commas so that the resulting code is interpreted with
	                // both (all) of the holes.
	                parts.push(",");
	            } else {
	                var i = elemPath.name;
	                if (i > 0)
	                    parts.push(" ");
	                parts.push(print(elemPath));
	                if (i < len - 1)
	                    parts.push(",");
	            }
	        });

	        parts.push("]");

	        return concat(parts);

	    case "SequenceExpression":
	        return fromString(", ").join(path.get("expressions").map(print));

	    case "ThisExpression":
	        return fromString("this");

	    case "Literal":
	        if (typeof n.value !== "string")
	            return fromString(n.value, options);

	        // intentionally fall through...

	    case "ModuleSpecifier":
	        // A ModuleSpecifier is a string-valued Literal.
	        return fromString(nodeStr(n), options);

	    case "UnaryExpression":
	        var parts = [n.operator];
	        if (/[a-z]$/.test(n.operator))
	            parts.push(" ");
	        parts.push(print(path.get("argument")));
	        return concat(parts);

	    case "UpdateExpression":
	        var parts = [
	            print(path.get("argument")),
	            n.operator
	        ];

	        if (n.prefix)
	            parts.reverse();

	        return concat(parts);

	    case "ConditionalExpression":
	        return concat([
	            "(", print(path.get("test")),
	            " ? ", print(path.get("consequent")),
	            " : ", print(path.get("alternate")), ")"
	        ]);

	    case "NewExpression":
	        var parts = ["new ", print(path.get("callee"))];
	        var args = n.arguments;

	        if (args) {
	            parts.push(
	                "(",
	                fromString(", ").join(path.get("arguments").map(print)),
	                ")"
	            );
	        }

	        return concat(parts);

	    case "VariableDeclaration":
	        var parts = [n.kind, " "];
	        var maxLen = 0;
	        var printed = path.get("declarations").map(function(childPath) {
	            var lines = print(childPath);
	            maxLen = Math.max(lines.length, maxLen);
	            return lines;
	        });

	        if (maxLen === 1) {
	            parts.push(fromString(", ").join(printed));
	        } else if (printed.length > 1 ) {
	            parts.push(
	                fromString(",\n").join(printed)
	                    .indentTail("var ".length)
	            );
	        } else {
	            parts.push(printed[0]);
	        }

	        // We generally want to terminate all variable declarations with a
	        // semicolon, except when they are children of for loops.
	        var parentNode = path.parent && path.parent.node;
	        if (!namedTypes.ForStatement.check(parentNode) &&
	            !namedTypes.ForInStatement.check(parentNode) &&
	            !(namedTypes.ForOfStatement &&
	              namedTypes.ForOfStatement.check(parentNode))) {
	            parts.push(";");
	        }

	        return concat(parts);

	    case "VariableDeclarator":
	        return n.init ? fromString(" = ").join([
	            print(path.get("id")),
	            print(path.get("init"))
	        ]) : print(path.get("id"));

	    case "WithStatement":
	        return concat([
	            "with (",
	            print(path.get("object")),
	            ") ",
	            print(path.get("body"))
	        ]);

	    case "IfStatement":
	        var con = adjustClause(print(path.get("consequent")), options),
	            parts = ["if (", print(path.get("test")), ")", con];

	        if (n.alternate)
	            parts.push(
	                endsWithBrace(con) ? " else" : "\nelse",
	                adjustClause(print(path.get("alternate")), options));

	        return concat(parts);

	    case "ForStatement":
	        // TODO Get the for (;;) case right.
	        var init = print(path.get("init")),
	            sep = init.length > 1 ? ";\n" : "; ",
	            forParen = "for (",
	            indented = fromString(sep).join([
	                init,
	                print(path.get("test")),
	                print(path.get("update"))
	            ]).indentTail(forParen.length),
	            head = concat([forParen, indented, ")"]),
	            clause = adjustClause(print(path.get("body")), options),
	            parts = [head];

	        if (head.length > 1) {
	            parts.push("\n");
	            clause = clause.trimLeft();
	        }

	        parts.push(clause);

	        return concat(parts);

	    case "WhileStatement":
	        return concat([
	            "while (",
	            print(path.get("test")),
	            ")",
	            adjustClause(print(path.get("body")), options)
	        ]);

	    case "ForInStatement":
	        // Note: esprima can't actually parse "for each (".
	        return concat([
	            n.each ? "for each (" : "for (",
	            print(path.get("left")),
	            " in ",
	            print(path.get("right")),
	            ")",
	            adjustClause(print(path.get("body")), options)
	        ]);

	    case "ForOfStatement":
	        return concat([
	            "for (",
	            print(path.get("left")),
	            " of ",
	            print(path.get("right")),
	            ")",
	            adjustClause(print(path.get("body")), options)
	        ]);

	    case "DoWhileStatement":
	        var doBody = concat([
	            "do",
	            adjustClause(print(path.get("body")), options)
	        ]), parts = [doBody];

	        if (endsWithBrace(doBody))
	            parts.push(" while");
	        else
	            parts.push("\nwhile");

	        parts.push(" (", print(path.get("test")), ");");

	        return concat(parts);

	    case "BreakStatement":
	        var parts = ["break"];
	        if (n.label)
	            parts.push(" ", print(path.get("label")));
	        parts.push(";");
	        return concat(parts);

	    case "ContinueStatement":
	        var parts = ["continue"];
	        if (n.label)
	            parts.push(" ", print(path.get("label")));
	        parts.push(";");
	        return concat(parts);

	    case "LabeledStatement":
	        return concat([
	            print(path.get("label")),
	            ":\n",
	            print(path.get("body"))
	        ]);

	    case "TryStatement":
	        var parts = [
	            "try ",
	            print(path.get("block"))
	        ];

	        path.get("handlers").each(function(handler) {
	            parts.push(" ", print(handler));
	        });

	        if (n.finalizer)
	            parts.push(" finally ", print(path.get("finalizer")));

	        return concat(parts);

	    case "CatchClause":
	        var parts = ["catch (", print(path.get("param"))];

	        if (n.guard)
	            // Note: esprima does not recognize conditional catch clauses.
	            parts.push(" if ", print(path.get("guard")));

	        parts.push(") ", print(path.get("body")));

	        return concat(parts);

	    case "ThrowStatement":
	        return concat([
	            "throw ",
	            print(path.get("argument")),
	            ";"
	        ]);

	    case "SwitchStatement":
	        return concat([
	            "switch (",
	            print(path.get("discriminant")),
	            ") {\n",
	            fromString("\n").join(path.get("cases").map(print)),
	            "\n}"
	        ]);

	        // Note: ignoring n.lexical because it has no printing consequences.

	    case "SwitchCase":
	        var parts = [];

	        if (n.test)
	            parts.push("case ", print(path.get("test")), ":");
	        else
	            parts.push("default:");

	        if (n.consequent.length > 0) {
	            parts.push("\n", printStatementSequence(
	                path.get("consequent"),
	                print
	            ).indent(options.tabWidth));
	        }

	        return concat(parts);

	    case "DebuggerStatement":
	        return fromString("debugger;");

	    // XJS extensions below.

	    case "XJSAttribute":
	        var parts = [print(path.get("name"))];
	        if (n.value)
	            parts.push("=", print(path.get("value")));
	        return concat(parts);

	    case "XJSIdentifier":
	        return fromString(n.name, options);

	    case "XJSNamespacedName":
	        return fromString(":").join([
	            print(path.get("namespace")),
	            print(path.get("name"))
	        ]);

	    case "XJSMemberExpression":
	        return fromString(".").join([
	            print(path.get("object")),
	            print(path.get("property"))
	        ]);

	    case "XJSSpreadAttribute":
	        return concat(["{...", print(path.get("argument")), "}"]);

	    case "XJSExpressionContainer":
	        return concat(["{", print(path.get("expression")), "}"]);

	    case "XJSElement":
	        var openingLines = print(path.get("openingElement"));

	        if (n.openingElement.selfClosing) {
	            assert.ok(!n.closingElement);
	            return openingLines;
	        }

	        var childLines = concat(
	            path.get("children").map(function(childPath) {
	                var child = childPath.value;

	                if (namedTypes.Literal.check(child) &&
	                    typeof child.value === "string") {
	                    if (/\S/.test(child.value)) {
	                        return child.value.replace(/^\s+|\s+$/g, "");
	                    } else if (/\n/.test(child.value)) {
	                        return "\n";
	                    }
	                }

	                return print(childPath);
	            })
	        ).indentTail(options.tabWidth);

	        var closingLines = print(path.get("closingElement"));

	        return concat([
	            openingLines,
	            childLines,
	            closingLines
	        ]);

	    case "XJSOpeningElement":
	        var parts = ["<", print(path.get("name"))];
	        var attrParts = [];

	        path.get("attributes").each(function(attrPath) {
	            attrParts.push(" ", print(attrPath));
	        });

	        var attrLines = concat(attrParts);

	        var needLineWrap = (
	            attrLines.length > 1 ||
	            attrLines.getLineLength(1) > options.wrapColumn
	        );

	        if (needLineWrap) {
	            attrParts.forEach(function(part, i) {
	                if (part === " ") {
	                    assert.strictEqual(i % 2, 0);
	                    attrParts[i] = "\n";
	                }
	            });

	            attrLines = concat(attrParts).indentTail(options.tabWidth);
	        }

	        parts.push(attrLines);

	        if (needLineWrap) {
	            parts.push("\n");
	        }

	        parts.push(n.selfClosing ? " />" : ">");

	        return concat(parts);

	    case "XJSClosingElement":
	        return concat(["</", print(path.get("name")), ">"]);

	    case "XJSText":
	        return fromString(n.value, options);

	    case "XJSEmptyExpression":
	        return fromString("");

	    case "TypeAnnotatedIdentifier":
	        var parts = [
	            print(path.get("annotation")),
	            " ",
	            print(path.get("identifier"))
	        ];

	        return concat(parts);

	    case "ClassBody":
	        return concat([
	            "{\n",
	            printStatementSequence(path.get("body"), print, true)
	                .indent(options.tabWidth),
	            "\n}"
	        ]);

	    case "ClassPropertyDefinition":
	        var parts = ["static ", print(path.get("definition"))];
	        if (!namedTypes.MethodDefinition.check(n.definition))
	            parts.push(";");
	        return concat(parts);

	    case "ClassDeclaration":
	    case "ClassExpression":
	        var parts = ["class"];

	        if (n.id)
	            parts.push(" ", print(path.get("id")));

	        if (n.superClass)
	            parts.push(" extends ", print(path.get("superClass")));

	        parts.push(" ", print(path.get("body")));

	        return concat(parts);

	    // Unhandled types below. If encountered, nodes of these types should
	    // be either left alone or desugared into AST types that are fully
	    // supported by the pretty-printer.

	    case "ClassHeritage": // TODO
	    case "ComprehensionBlock": // TODO
	    case "ComprehensionExpression": // TODO
	    case "Glob": // TODO
	    case "TaggedTemplateExpression": // TODO
	    case "TemplateElement": // TODO
	    case "TemplateLiteral": // TODO
	    case "GeneratorExpression": // TODO
	    case "LetStatement": // TODO
	    case "LetExpression": // TODO
	    case "GraphExpression": // TODO
	    case "GraphIndexExpression": // TODO
	    case "TypeAnnotation": // TODO
	    default:
	        debugger;
	        throw new Error("unknown type: " + JSON.stringify(n.type));
	    }

	    return p;
	}

	function printStatementSequence(path, print, inClassBody) {
	    var filtered = path.filter(function(stmtPath) {
	        var stmt = stmtPath.value;

	        // Just in case the AST has been modified to contain falsy
	        // "statements," it's safer simply to skip them.
	        if (!stmt)
	            return false;

	        // Skip printing EmptyStatement nodes to avoid leaving stray
	        // semicolons lying around.
	        if (stmt.type === "EmptyStatement")
	            return false;

	        namedTypes.Statement.assert(stmt);

	        return true;
	    });

	    var allowBreak = false,
	        len = filtered.length,
	        parts = [];

	    filtered.map(function(stmtPath) {
	        var lines = print(stmtPath);
	        var stmt = stmtPath.value;

	        if (inClassBody) {
	            if (namedTypes.MethodDefinition.check(stmt))
	                return lines;

	            if (namedTypes.ClassPropertyDefinition.check(stmt) &&
	                namedTypes.MethodDefinition.check(stmt.definition))
	                return lines;
	        }

	        // Try to add a semicolon to anything that isn't a method in a
	        // class body.
	        return maybeAddSemicolon(lines);

	    }).forEach(function(lines, i) {
	        var multiLine = lines.length > 1;
	        if (multiLine && allowBreak) {
	            // Insert an additional line break before multi-line
	            // statements, if we did not insert an extra line break
	            // after the previous statement.
	            parts.push("\n");
	        }

	        if (!inClassBody)
	            lines = maybeAddSemicolon(lines);

	        parts.push(lines);

	        if (i < len - 1) {
	            // Add an extra line break if the previous statement
	            // spanned multiple lines.
	            parts.push(multiLine ? "\n\n" : "\n");

	            // Avoid adding another line break if we just added an
	            // extra one.
	            allowBreak = !multiLine;
	        }
	    });

	    return concat(parts);
	}

	function printMethod(kind, keyPath, valuePath, options, print) {
	    var parts = [];
	    var key = keyPath.value;
	    var value = valuePath.value;

	    namedTypes.FunctionExpression.assert(value);

	    if (value.async) {
	        parts.push("async ");
	    }

	    if (!kind || kind === "init") {
	        if (value.generator) {
	            parts.push("*");
	        }
	    } else {
	        assert.ok(kind === "get" || kind === "set");
	        parts.push(kind, " ");
	    }

	    parts.push(
	        print(keyPath),
	        "(",
	        printFunctionParams(valuePath, options, print),
	        ") ",
	        print(valuePath.get("body"))
	    );

	    return concat(parts);
	}

	function printFunctionParams(path, options, print) {
	    var fun = path.node;
	    namedTypes.Function.assert(fun);

	    var params = path.get("params");
	    var defaults = path.get("defaults");
	    var printed = params.map(defaults.value ? function(param) {
	        var p = print(param);
	        var d = defaults.get(param.name);
	        return d.value ? concat([p, "=", print(d)]) : p;
	    } : print);

	    if (fun.rest) {
	        printed.push(concat(["...", print(path.get("rest"))]));
	    }

	    var joined = fromString(", ").join(printed);
	    if (joined.length > 1 ||
	        joined.getLineLength(1) > options.wrapColumn) {
	        joined = fromString(",\n").join(printed);
	        return concat(["\n", joined.indent(options.tabWidth)]);
	    }

	    return joined;
	}

	function adjustClause(clause, options) {
	    if (clause.length > 1)
	        return concat([" ", clause]);

	    return concat([
	        "\n",
	        maybeAddSemicolon(clause).indent(options.tabWidth)
	    ]);
	}

	function lastNonSpaceCharacter(lines) {
	    var pos = lines.lastPos();
	    do {
	        var ch = lines.charAt(pos);
	        if (/\S/.test(ch))
	            return ch;
	    } while (lines.prevPos(pos));
	}

	function endsWithBrace(lines) {
	    return lastNonSpaceCharacter(lines) === "}";
	}

	function nodeStr(n) {
	    namedTypes.Literal.assert(n);
	    isString.assert(n.value);
	    return JSON.stringify(n.value);
	}

	function maybeAddSemicolon(lines) {
	    var eoc = lastNonSpaceCharacter(lines);
	    if (!eoc || "\n};".indexOf(eoc) < 0)
	        return concat([lines, ";"]);
	    return lines;
	}


/***/ },
/* 47 */
/***/ function(module, exports, __webpack_require__) {

	var assert = __webpack_require__(4);
	var Class = __webpack_require__(48);
	var Node = __webpack_require__(27).namedTypes.Node;
	var slice = Array.prototype.slice;
	var removeRequests = [];

	var Visitor = exports.Visitor = Class.extend({
	    visit: function(node) {
	        var self = this;

	        if (!node) {
	            // pass

	        } else if (node instanceof Array) {
	            node = self.visitArray(node);

	        } else if (Node.check(node)) {
	            var methodName = "visit" + node.type,
	                method = self[methodName] || self.genericVisit;
	            node = method.call(this, node);

	        } else if (typeof node === "object") {
	            // Some AST node types contain ad-hoc (non-AST) objects that
	            // may contain nested AST nodes.
	            self.genericVisit(node);
	        }

	        return node;
	    },

	    visitArray: function(arr, noUpdate) {
	        for (var elem, result, undef,
	                 i = 0, len = arr.length;
	             i < len;
	             i += 1)
	        {
	            if (i in arr)
	                elem = arr[i];
	            else
	                continue;

	            var requesters = [];
	            removeRequests.push(requesters);

	            // Make sure we don't accidentally reuse a previous result
	            // when this.visit throws an exception.
	            result = undef;

	            try {
	                result = this.visit(elem);

	            } finally {
	                assert.strictEqual(
	                    removeRequests.pop(),
	                    requesters);
	            }

	            if (requesters.length > 0 || (result === null && elem !== null)) {
	                // This hole will be elided by the compaction loop below.
	                delete arr[i];
	            } else if (result !== undef) {
	                arr[i] = result;
	            }
	        }

	        // Compact the array to eliminate holes.
	        for (var dst = 0,
	                 src = dst,
	                 // The length of the array might have changed during the
	                 // iteration performed above.
	                 len = arr.length;
	             src < len;
	             src += 1)
	            if (src in arr)
	                arr[dst++] = arr[src];
	        arr.length = dst;

	        return arr;
	    },

	    remove: function() {
	        var len = removeRequests.length,
	            requesters = removeRequests[len - 1];
	        if (requesters)
	            requesters.push(this);
	    },

	    genericVisit: function(node) {
	        var field,
	            oldValue,
	            newValue;

	        for (field in node) {
	            if (!node.hasOwnProperty(field))
	                continue;

	            oldValue = node[field];

	            if (oldValue instanceof Array) {
	                this.visitArray(oldValue);

	            } else if (Node.check(oldValue)) {
	                newValue = this.visit(oldValue);

	                if (typeof newValue === "undefined") {
	                    // Keep oldValue.
	                } else {
	                    node[field] = newValue;
	                }

	            } else if (typeof oldValue === "object") {
	                this.genericVisit(oldValue);
	            }
	        }

	        return node;
	    }
	});


/***/ },
/* 48 */
/***/ function(module, exports) {

	// Sentinel value passed to base constructors to skip invoking this.init.
	var populating = {};

	function makeClass(base, newProps) {
	  var baseProto = base.prototype;
	  var ownProto = Object.create(baseProto);
	  var newStatics = newProps.statics;
	  var populated;

	  function constructor() {
	    if (!populated) {
	      if (base.extend === extend) {
	        // Ensure population of baseProto if base created by makeClass.
	        base.call(populating);
	      }

	      // Wrap override methods to make this._super available.
	      populate(ownProto, newProps, baseProto);

	      // Help the garbage collector reclaim this object, since we
	      // don't need it anymore.
	      newProps = null;

	      populated = true;
	    }

	    // When we invoke a constructor just for the sake of making sure
	    // its prototype has been populated, the receiver object (this)
	    // will be strictly equal to the populating object, which means we
	    // want to avoid invoking this.init.
	    if (this === populating) {
	      return;
	    }

	    // Evaluate this.init only once to avoid looking up .init in the
	    // prototype chain twice.
	    var init = this.init;
	    if (init) {
	      init.apply(this, arguments);
	    }
	  }

	  // Copy any static properties that have been assigned to the base
	  // class over to the subclass.
	  populate(constructor, base);

	  if (newStatics) {
	    // Remove the statics property from newProps so that it does not
	    // get copied to the prototype.
	    delete newProps.statics;

	    // We re-use populate for static properties, so static methods
	    // have the same access to this._super that normal methods have.
	    populate(constructor, newStatics, base);

	    // Help the GC reclaim this object.
	    newStatics = null;
	  }

	  // These property assignments overwrite any properties of the same
	  // name that may have been copied from base, above. Note that ownProto
	  // has not been populated with any methods or properties, yet, because
	  // we postpone that work until the subclass is instantiated for the
	  // first time. Also note that we share a single implementation of
	  // extend between all classes.
	  constructor.prototype = ownProto;
	  constructor.extend = extend;
	  constructor.base = baseProto;

	  // Setting constructor.prototype.constructor = constructor is
	  // important so that instanceof works properly in all browsers.
	  ownProto.constructor = constructor;

	  // Setting .cls as a shorthand for .constructor is purely a
	  // convenience to make calling static methods easier.
	  ownProto.cls = constructor;

	  // If there is a static initializer, call it now. This needs to happen
	  // last so that the constructor is ready to be used if, for example,
	  // constructor.init needs to create an instance of the new class.
	  if (constructor.init) {
	    constructor.init(constructor);
	  }

	  return constructor;
	}

	function populate(target, source, parent) {
	  for (var name in source) {
	    if (source.hasOwnProperty(name)) {
	      target[name] = parent ? maybeWrap(name, source, parent) : source[name];
	    }
	  }
	}

	var hasOwnExp = /\bhasOwnProperty\b/;
	var superExp = hasOwnExp.test(populate) ? /\b_super\b/ : /.*/;

	function maybeWrap(name, child, parent) {
	  var cval = child && child[name];
	  var pval = parent && parent[name];

	  if (typeof cval === "function" &&
	      typeof pval === "function" &&
	      cval !== pval && // Avoid infinite recursion.
	      cval.extend !== extend && // Don't wrap classes.
	      superExp.test(cval)) // Only wrap if this._super needed.
	  {
	    return function() {
	      var saved = this._super;
	      this._super = parent[name];
	      try { return cval.apply(this, arguments) }
	      finally { this._super = saved };
	    };
	  }

	  return cval;
	}

	function extend(newProps) {
	  return makeClass(this, newProps || {});
	}

	module.exports = extend.call(function(){});


/***/ },
/* 49 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2013, Facebook, Inc.
	 * All rights reserved.
	 *
	 * This source code is licensed under the BSD-style license found in the
	 * https://raw.github.com/facebook/regenerator/master/LICENSE file. An
	 * additional grant of patent rights can be found in the PATENTS file in
	 * the same directory.
	 */

	var assert = __webpack_require__(4);
	var types = __webpack_require__(9);
	var n = types.namedTypes;
	var b = types.builders;
	var inherits = __webpack_require__(5).inherits;

	function Entry() {
	  assert.ok(this instanceof Entry);
	}

	function FunctionEntry(returnLoc) {
	  Entry.call(this);

	  n.Literal.assert(returnLoc);

	  Object.defineProperties(this, {
	    returnLoc: { value: returnLoc }
	  });
	}

	inherits(FunctionEntry, Entry);
	exports.FunctionEntry = FunctionEntry;

	function LoopEntry(breakLoc, continueLoc, label) {
	  Entry.call(this);

	  n.Literal.assert(breakLoc);
	  n.Literal.assert(continueLoc);

	  if (label) {
	    n.Identifier.assert(label);
	  } else {
	    label = null;
	  }

	  Object.defineProperties(this, {
	    breakLoc: { value: breakLoc },
	    continueLoc: { value: continueLoc },
	    label: { value: label }
	  });
	}

	inherits(LoopEntry, Entry);
	exports.LoopEntry = LoopEntry;

	function SwitchEntry(breakLoc) {
	  Entry.call(this);

	  n.Literal.assert(breakLoc);

	  Object.defineProperties(this, {
	    breakLoc: { value: breakLoc }
	  });
	}

	inherits(SwitchEntry, Entry);
	exports.SwitchEntry = SwitchEntry;

	function TryEntry(catchEntry, finallyEntry) {
	  Entry.call(this);

	  if (catchEntry) {
	    assert.ok(catchEntry instanceof CatchEntry);
	  } else {
	    catchEntry = null;
	  }

	  if (finallyEntry) {
	    assert.ok(finallyEntry instanceof FinallyEntry);
	  } else {
	    finallyEntry = null;
	  }

	  Object.defineProperties(this, {
	    catchEntry: { value: catchEntry },
	    finallyEntry: { value: finallyEntry }
	  });
	}

	inherits(TryEntry, Entry);
	exports.TryEntry = TryEntry;

	function CatchEntry(firstLoc, paramId) {
	  Entry.call(this);

	  n.Literal.assert(firstLoc);
	  n.Identifier.assert(paramId);

	  Object.defineProperties(this, {
	    firstLoc: { value: firstLoc },
	    paramId: { value: paramId }
	  });
	}

	inherits(CatchEntry, Entry);
	exports.CatchEntry = CatchEntry;

	function FinallyEntry(firstLoc, nextLocTempVar) {
	  Entry.call(this);

	  n.Literal.assert(firstLoc);
	  n.Identifier.assert(nextLocTempVar);

	  Object.defineProperties(this, {
	    firstLoc: { value: firstLoc },
	    nextLocTempVar: { value: nextLocTempVar }
	  });
	}

	inherits(FinallyEntry, Entry);
	exports.FinallyEntry = FinallyEntry;

	function LeapManager(emitter) {
	  assert.ok(this instanceof LeapManager);

	  var Emitter = __webpack_require__(25).Emitter;
	  assert.ok(emitter instanceof Emitter);

	  Object.defineProperties(this, {
	    emitter: { value: emitter },
	    entryStack: {
	      value: [new FunctionEntry(emitter.finalLoc)]
	    }
	  });
	}

	var LMp = LeapManager.prototype;
	exports.LeapManager = LeapManager;

	LMp.withEntry = function(entry, callback) {
	  assert.ok(entry instanceof Entry);
	  this.entryStack.push(entry);
	  try {
	    callback.call(this.emitter);
	  } finally {
	    var popped = this.entryStack.pop();
	    assert.strictEqual(popped, entry);
	  }
	};

	LMp._leapToEntry = function(predicate, defaultLoc) {
	  var entry, loc;
	  var finallyEntries = [];
	  var skipNextTryEntry = null;

	  for (var i = this.entryStack.length - 1; i >= 0; --i) {
	    entry = this.entryStack[i];

	    if (entry instanceof CatchEntry ||
	        entry instanceof FinallyEntry) {

	      // If we are inside of a catch or finally block, then we must
	      // have exited the try block already, so we shouldn't consider
	      // the next TryStatement as a handler for this throw.
	      skipNextTryEntry = entry;

	    } else if (entry instanceof TryEntry) {
	      if (skipNextTryEntry) {
	        // If an exception was thrown from inside a catch block and this
	        // try statement has a finally block, make sure we execute that
	        // finally block.
	        if (skipNextTryEntry instanceof CatchEntry &&
	            entry.finallyEntry) {
	          finallyEntries.push(entry.finallyEntry);
	        }

	        skipNextTryEntry = null;

	      } else if ((loc = predicate.call(this, entry))) {
	        break;

	      } else if (entry.finallyEntry) {
	        finallyEntries.push(entry.finallyEntry);
	      }

	    } else if ((loc = predicate.call(this, entry))) {
	      break;
	    }
	  }

	  if (loc) {
	    // fall through
	  } else if (defaultLoc) {
	    loc = defaultLoc;
	  } else {
	    return null;
	  }

	  n.Literal.assert(loc);

	  var finallyEntry;
	  while ((finallyEntry = finallyEntries.pop())) {
	    this.emitter.emitAssign(finallyEntry.nextLocTempVar, loc);
	    loc = finallyEntry.firstLoc;
	  }

	  return loc;
	};

	function getLeapLocation(entry, property, label) {
	  var loc = entry[property];
	  if (loc) {
	    if (label) {
	      if (entry.label &&
	          entry.label.name === label.name) {
	        return loc;
	      }
	    } else {
	      return loc;
	    }
	  }
	  return null;
	}

	LMp.emitBreak = function(label) {
	  var loc = this._leapToEntry(function(entry) {
	    return getLeapLocation(entry, "breakLoc", label);
	  });

	  if (loc === null) {
	    throw new Error("illegal break statement");
	  }

	  this.emitter.clearPendingException();
	  this.emitter.jump(loc);
	};

	LMp.emitContinue = function(label) {
	  var loc = this._leapToEntry(function(entry) {
	    return getLeapLocation(entry, "continueLoc", label);
	  });

	  if (loc === null) {
	    throw new Error("illegal continue statement");
	  }

	  this.emitter.clearPendingException();
	  this.emitter.jump(loc);
	};


/***/ },
/* 50 */
/***/ function(module, exports, __webpack_require__) {

	/**
	 * Copyright (c) 2013, Facebook, Inc.
	 * All rights reserved.
	 *
	 * This source code is licensed under the BSD-style license found in the
	 * https://raw.github.com/facebook/regenerator/master/LICENSE file. An
	 * additional grant of patent rights can be found in the PATENTS file in
	 * the same directory.
	 */

	var assert = __webpack_require__(4);
	var m = __webpack_require__(42).makeAccessor();
	var types = __webpack_require__(9);
	var isArray = types.builtInTypes.array;
	var n = types.namedTypes;
	var hasOwn = Object.prototype.hasOwnProperty;

	function makePredicate(propertyName, knownTypes) {
	  function onlyChildren(node) {
	    n.Node.assert(node);

	    // Assume no side effects until we find out otherwise.
	    var result = false;

	    function check(child) {
	      if (result) {
	        // Do nothing.
	      } else if (isArray.check(child)) {
	        child.some(check);
	      } else if (n.Node.check(child)) {
	        assert.strictEqual(result, false);
	        result = predicate(child);
	      }
	      return result;
	    }

	    types.eachField(node, function(name, child) {
	      check(child);
	    });

	    return result;
	  }

	  function predicate(node) {
	    n.Node.assert(node);

	    var meta = m(node);
	    if (hasOwn.call(meta, propertyName))
	      return meta[propertyName];

	    // Certain types are "opaque," which means they have no side
	    // effects or leaps and we don't care about their subexpressions.
	    if (hasOwn.call(opaqueTypes, node.type))
	      return meta[propertyName] = false;

	    if (hasOwn.call(knownTypes, node.type))
	      return meta[propertyName] = true;

	    return meta[propertyName] = onlyChildren(node);
	  }

	  predicate.onlyChildren = onlyChildren;

	  return predicate;
	}

	var opaqueTypes = {
	  FunctionExpression: true
	};

	// These types potentially have side effects regardless of what side
	// effects their subexpressions have.
	var sideEffectTypes = {
	  CallExpression: true, // Anything could happen!
	  ForInStatement: true, // Modifies the key variable.
	  UnaryExpression: true, // Think delete.
	  BinaryExpression: true, // Might invoke .toString() or .valueOf().
	  AssignmentExpression: true, // Side-effecting by definition.
	  UpdateExpression: true, // Updates are essentially assignments.
	  NewExpression: true // Similar to CallExpression.
	};

	// These types are the direct cause of all leaps in control flow.
	var leapTypes = {
	  YieldExpression: true,
	  BreakStatement: true,
	  ContinueStatement: true,
	  ReturnStatement: true,
	  ThrowStatement: true,
	  CallExpression: true,
	  DebuggerStatement: true
	};

	// All leap types are also side effect types.
	for (var type in leapTypes) {
	  if (hasOwn.call(leapTypes, type)) {
	    sideEffectTypes[type] = leapTypes[type];
	  }
	}

	exports.hasSideEffects = makePredicate("hasSideEffects", sideEffectTypes);
	exports.containsLeap = makePredicate("containsLeap", leapTypes);


/***/ },
/* 51 */
/***/ function(module, exports, __webpack_require__) {

	var types = __webpack_require__(9);
	var recast = __webpack_require__(26);
	var b = types.builders;

	function DebugInfo() {
	  this.baseId = 0;
	  this.baseIndex = 1;
	  this.machines = [];
	  this.stepIds = [];
	  this.stmts = [];
	}

	DebugInfo.prototype.makeId = function() {
	  var id = this.baseId++;
	  this.machines[id] = {
	    locs: {},
	    finalLoc: null
	  };
	  return id;
	};

	DebugInfo.prototype.addStepIds = function(machineId, ids) {
	  this.stepIds[machineId] = ids;
	}

	DebugInfo.prototype.addSourceLocation = function(machineId, loc, index) {
	  this.machines[machineId].locs[index] = loc;
	  return index;
	};

	DebugInfo.prototype.getSourceLocation = function(machineId, index) {
	  return this.machines[machineId].locs[index];
	};

	DebugInfo.prototype.addFinalLocation = function(machineId, loc) {
	  this.machines[machineId].finalLoc = loc;
	};

	DebugInfo.prototype.getDebugAST = function() {
	  const ast = recast.parse('(' + JSON.stringify(
	    { machines: this.machines,
	      stepIds: this.stepIds }
	  ) + ')');

	  return b.variableDeclaration(
	    'var',
	    [b.variableDeclarator(
	      b.identifier('__debugInfo'),
	      ast.program.body[0].expression)]
	  );
	};

	DebugInfo.prototype.getDebugInfo = function() {
	  return { machines: this.machines,
	           stepIds: this.stepIds };
	};

	exports.DebugInfo = DebugInfo;


/***/ },
/* 52 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;/*
	  Copyright (C) 2012-2013 Yusuke Suzuki <utatane.tea@gmail.com>
	  Copyright (C) 2013 Alex Seville <hi@alexanderseville.com>

	  Redistribution and use in source and binary forms, with or without
	  modification, are permitted provided that the following conditions are met:

	    * Redistributions of source code must retain the above copyright
	      notice, this list of conditions and the following disclaimer.
	    * Redistributions in binary form must reproduce the above copyright
	      notice, this list of conditions and the following disclaimer in the
	      documentation and/or other materials provided with the distribution.

	  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
	  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
	  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
	  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
	  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
	  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
	  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
	  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
	  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
	  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
	*/

	/**
	 * Escope (<a href="http://github.com/Constellation/escope">escope</a>) is an <a
	 * href="http://www.ecma-international.org/publications/standards/Ecma-262.htm">ECMAScript</a>
	 * scope analyzer extracted from the <a
	 * href="http://github.com/Constellation/esmangle">esmangle project</a/>.
	 * <p>
	 * <em>escope</em> finds lexical scopes in a source program, i.e. areas of that
	 * program where different occurrences of the same identifier refer to the same
	 * variable. With each scope the contained variables are collected, and each
	 * identifier reference in code is linked to its corresponding variable (if
	 * possible).
	 * <p>
	 * <em>escope</em> works on a syntax tree of the parsed source code which has
	 * to adhere to the <a
	 * href="https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API">
	 * Mozilla Parser API</a>. E.g. <a href="http://esprima.org">esprima</a> is a parser
	 * that produces such syntax trees.
	 * <p>
	 * The main interface is the {@link analyze} function.
	 * @module
	 */

	/*jslint bitwise:true */
	/*global exports:true, define:true, require:true*/
	(function (factory, global) {
	    'use strict';

	    function namespace(str, obj) {
	        var i, iz, names, name;
	        names = str.split('.');
	        for (i = 0, iz = names.length; i < iz; ++i) {
	            name = names[i];
	            if (obj.hasOwnProperty(name)) {
	                obj = obj[name];
	            } else {
	                obj = (obj[name] = {});
	            }
	        }
	        return obj;
	    }

	    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js,
	    // and plain browser loading,
	    if (true) {
	        !(__WEBPACK_AMD_DEFINE_ARRAY__ = [exports, __webpack_require__(53)], __WEBPACK_AMD_DEFINE_RESULT__ = function (exports, estraverse) {
	            factory(exports, global, estraverse);
	        }.apply(exports, __WEBPACK_AMD_DEFINE_ARRAY__), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));
	    } else if (typeof exports !== 'undefined') {
	        factory(exports, global, require('estraverse'));
	    } else {
	        factory(namespace('escope', global), global, global.estraverse);
	    }
	}(function (exports, global, estraverse) {
	    'use strict';

	    var Syntax,
	        Map,
	        currentScope,
	        globalScope,
	        scopes,
	        options;

	    Syntax = estraverse.Syntax;

	    if (typeof global.Map !== 'undefined') {
	        // ES6 Map
	        Map = global.Map;
	    } else {
	        Map = function Map() {
	            this.__data = {};
	        };

	        Map.prototype.get = function MapGet(key) {
	            key = '$' + key;
	            if (this.__data.hasOwnProperty(key)) {
	                return this.__data[key];
	            }
	            return undefined;
	        };

	        Map.prototype.has = function MapHas(key) {
	            key = '$' + key;
	            return this.__data.hasOwnProperty(key);
	        };

	        Map.prototype.set = function MapSet(key, val) {
	            key = '$' + key;
	            this.__data[key] = val;
	        };

	        Map.prototype['delete'] = function MapDelete(key) {
	            key = '$' + key;
	            return delete this.__data[key];
	        };
	    }

	    function assert(cond, text) {
	        if (!cond) {
	            throw new Error(text);
	        }
	    }

	    function defaultOptions() {
	        return {
	            optimistic: false,
	            directive: false,
	            ecmaVersion: 5
	        };
	    }

	    function updateDeeply(target, override) {
	        var key, val;

	        function isHashObject(target) {
	            return typeof target === 'object' && target instanceof Object && !(target instanceof RegExp);
	        }

	        for (key in override) {
	            if (override.hasOwnProperty(key)) {
	                val = override[key];
	                if (isHashObject(val)) {
	                    if (isHashObject(target[key])) {
	                        updateDeeply(target[key], val);
	                    } else {
	                        target[key] = updateDeeply({}, val);
	                    }
	                } else {
	                    target[key] = val;
	                }
	            }
	        }
	        return target;
	    }

	    /**
	     * A Reference represents a single occurrence of an identifier in code.
	     * @class Reference
	     */
	    function Reference(ident, scope, flag, writeExpr, maybeImplicitGlobal) {
	        /**
	         * Identifier syntax node.
	         * @member {esprima#Identifier} Reference#identifier
	         */
	        this.identifier = ident;
	        /**
	         * Reference to the enclosing Scope.
	         * @member {Scope} Reference#from
	         */
	        this.from = scope;
	        /**
	         * Whether the reference comes from a dynamic scope (such as 'eval',
	         * 'with', etc.), and may be trapped by dynamic scopes.
	         * @member {boolean} Reference#tainted
	         */
	        this.tainted = false;
	        /**
	         * The variable this reference is resolved with.
	         * @member {Variable} Reference#resolved
	         */
	        this.resolved = null;
	        /**
	         * The read-write mode of the reference. (Value is one of {@link
	         * Reference.READ}, {@link Reference.RW}, {@link Reference.WRITE}).
	         * @member {number} Reference#flag
	         * @private
	         */
	        this.flag = flag;
	        if (this.isWrite()) {
	            /**
	             * If reference is writeable, this is the tree being written to it.
	             * @member {esprima#Node} Reference#writeExpr
	             */
	            this.writeExpr = writeExpr;
	        }
	        /**
	         * Whether the Reference might refer to a global variable.
	         * @member {boolean} Reference#__maybeImplicitGlobal
	         * @private
	         */
	        this.__maybeImplicitGlobal = maybeImplicitGlobal;
	    }

	    /**
	     * @constant Reference.READ
	     * @private
	     */
	    Reference.READ = 0x1;
	    /**
	     * @constant Reference.WRITE
	     * @private
	     */
	    Reference.WRITE = 0x2;
	    /**
	     * @constant Reference.RW
	     * @private
	     */
	    Reference.RW = 0x3;

	    /**
	     * Whether the reference is static.
	     * @method Reference#isStatic
	     * @return {boolean}
	     */
	    Reference.prototype.isStatic = function isStatic() {
	        return !this.tainted && this.resolved && this.resolved.scope.isStatic();
	    };

	    /**
	     * Whether the reference is writeable.
	     * @method Reference#isWrite
	     * @return {boolean}
	     */
	    Reference.prototype.isWrite = function isWrite() {
	        return this.flag & Reference.WRITE;
	    };

	    /**
	     * Whether the reference is readable.
	     * @method Reference#isRead
	     * @return {boolean}
	     */
	    Reference.prototype.isRead = function isRead() {
	        return this.flag & Reference.READ;
	    };

	    /**
	     * Whether the reference is read-only.
	     * @method Reference#isReadOnly
	     * @return {boolean}
	     */
	    Reference.prototype.isReadOnly = function isReadOnly() {
	        return this.flag === Reference.READ;
	    };

	    /**
	     * Whether the reference is write-only.
	     * @method Reference#isWriteOnly
	     * @return {boolean}
	     */
	    Reference.prototype.isWriteOnly = function isWriteOnly() {
	        return this.flag === Reference.WRITE;
	    };

	    /**
	     * Whether the reference is read-write.
	     * @method Reference#isReadWrite
	     * @return {boolean}
	     */
	    Reference.prototype.isReadWrite = function isReadWrite() {
	        return this.flag === Reference.RW;
	    };

	    /**
	     * A Variable represents a locally scoped identifier. These include arguments to
	     * functions.
	     * @class Variable
	     */
	    function Variable(name, scope) {
	        /**
	         * The variable name, as given in the source code.
	         * @member {String} Variable#name
	         */
	        this.name = name;
	        /**
	         * List of defining occurrences of this variable (like in 'var ...'
	         * statements or as parameter), as AST nodes.
	         * @member {esprima.Identifier[]} Variable#identifiers
	         */
	        this.identifiers = [];
	        /**
	         * List of {@link Reference|references} of this variable (excluding parameter entries)
	         * in its defining scope and all nested scopes. For defining
	         * occurrences only see {@link Variable#defs}.
	         * @member {Reference[]} Variable#references
	         */
	        this.references = [];

	        /**
	         * List of defining occurrences of this variable (like in 'var ...'
	         * statements or as parameter), as custom objects.
	         * @typedef {Object} DefEntry
	         * @property {String} DefEntry.type - the type of the occurrence (e.g.
	         *      "Parameter", "Variable", ...)
	         * @property {esprima.Identifier} DefEntry.name - the identifier AST node of the occurrence
	         * @property {esprima.Node} DefEntry.node - the enclosing node of the
	         *      identifier
	         * @property {esprima.Node} [DefEntry.parent] - the enclosing statement
	         *      node of the identifier
	         * @member {DefEntry[]} Variable#defs
	         */
	        this.defs = [];

	        this.tainted = false;
	        /**
	         * Whether this is a stack variable.
	         * @member {boolean} Variable#stack
	         */
	        this.stack = true;
	        /**
	         * Reference to the enclosing Scope.
	         * @member {Scope} Variable#scope
	         */
	        this.scope = scope;
	    }

	    Variable.CatchClause = 'CatchClause';
	    Variable.Parameter = 'Parameter';
	    Variable.FunctionName = 'FunctionName';
	    Variable.Variable = 'Variable';
	    Variable.ImplicitGlobalVariable = 'ImplicitGlobalVariable';

	    function isStrictScope(scope, block) {
	        var body, i, iz, stmt, expr;

	        // When upper scope is exists and strict, inner scope is also strict.
	        if (scope.upper && scope.upper.isStrict) {
	            return true;
	        }

	        if (scope.type === 'function') {
	            body = block.body;
	        } else if (scope.type === 'global') {
	            body = block;
	        } else {
	            return false;
	        }

	        if (options.directive) {
	            for (i = 0, iz = body.body.length; i < iz; ++i) {
	                stmt = body.body[i];
	                if (stmt.type !== 'DirectiveStatement') {
	                    break;
	                }
	                if (stmt.raw === '"use strict"' || stmt.raw === '\'use strict\'') {
	                    return true;
	                }
	            }
	        } else {
	            for (i = 0, iz = body.body.length; i < iz; ++i) {
	                stmt = body.body[i];
	                if (stmt.type !== Syntax.ExpressionStatement) {
	                    break;
	                }
	                expr = stmt.expression;
	                if (expr.type !== Syntax.Literal || typeof expr.value !== 'string') {
	                    break;
	                }
	                if (expr.raw != null) {
	                    if (expr.raw === '"use strict"' || expr.raw === '\'use strict\'') {
	                        return true;
	                    }
	                } else {
	                    if (expr.value === 'use strict') {
	                        return true;
	                    }
	                }
	            }
	        }
	        return false;
	    }

	    /**
	     * @class Scope
	     */
	    function Scope(block, opt) {
	        var variable, body;

	        /**
	         * One of 'catch', 'with', 'function' or 'global'.
	         * @member {String} Scope#type
	         */
	        this.type =
	            (block.type === Syntax.CatchClause) ? 'catch' :
	            (block.type === Syntax.WithStatement) ? 'with' :
	            (block.type === Syntax.Program) ? 'global' : 'function';
	         /**
	         * The scoped {@link Variable}s of this scope, as <code>{ Variable.name
	         * : Variable }</code>.
	         * @member {Map} Scope#set
	         */
	        this.set = new Map();
	        /**
	         * The tainted variables of this scope, as <code>{ Variable.name :
	         * boolean }</code>.
	         * @member {Map} Scope#taints */
	        this.taints = new Map();
	        /**
	         * Generally, through the lexical scoping of JS you can always know
	         * which variable an identifier in the source code refers to. There are
	         * a few exceptions to this rule. With 'global' and 'with' scopes you
	         * can only decide at runtime which variable a reference refers to.
	         * Moreover, if 'eval()' is used in a scope, it might introduce new
	         * bindings in this or its prarent scopes.
	         * All those scopes are considered 'dynamic'.
	         * @member {boolean} Scope#dynamic
	         */
	        this.dynamic = this.type === 'global' || this.type === 'with';
	        /**
	         * A reference to the scope-defining syntax node.
	         * @member {esprima.Node} Scope#block
	         */
	        this.block = block;
	         /**
	         * The {@link Reference|references} that are not resolved with this scope.
	         * @member {Reference[]} Scope#through
	         */
	        this.through = [];
	         /**
	         * The scoped {@link Variable}s of this scope. In the case of a
	         * 'function' scope this includes the automatic argument <em>arguments</em> as
	         * its first element, as well as all further formal arguments.
	         * @member {Variable[]} Scope#variables
	         */
	        this.variables = [];
	         /**
	         * Any variable {@link Reference|reference} found in this scope. This
	         * includes occurrences of local variables as well as variables from
	         * parent scopes (including the global scope). For local variables
	         * this also includes defining occurrences (like in a 'var' statement).
	         * In a 'function' scope this does not include the occurrences of the
	         * formal parameter in the parameter list.
	         * @member {Reference[]} Scope#references
	         */
	        this.references = [];
	         /**
	         * List of {@link Reference}s that are left to be resolved (i.e. which
	         * need to be linked to the variable they refer to). Used internally to
	         * resolve bindings during scope analysis. On a finalized scope
	         * analysis, all sopes have <em>left</em> value <strong>null</strong>.
	         * @member {Reference[]} Scope#left
	         */
	        this.left = [];
	         /**
	         * For 'global' and 'function' scopes, this is a self-reference. For
	         * other scope types this is the <em>variableScope</em> value of the
	         * parent scope.
	         * @member {Scope} Scope#variableScope
	         */
	        this.variableScope =
	            (this.type === 'global' || this.type === 'function') ? this : currentScope.variableScope;
	         /**
	         * Whether this scope is created by a FunctionExpression.
	         * @member {boolean} Scope#functionExpressionScope
	         */
	        this.functionExpressionScope = false;
	         /**
	         * Whether this is a scope that contains an 'eval()' invocation.
	         * @member {boolean} Scope#directCallToEvalScope
	         */
	        this.directCallToEvalScope = false;
	         /**
	         * @member {boolean} Scope#thisFound
	         */
	        this.thisFound = false;
	        body = this.type === 'function' ? block.body : block;
	        if (opt.naming) {
	            this.__define(block.id, {
	                type: Variable.FunctionName,
	                name: block.id,
	                node: block
	            });
	            this.functionExpressionScope = true;
	        } else {
	            if (this.type === 'function') {
	                variable = new Variable('arguments', this);
	                this.taints.set('arguments', true);
	                this.set.set('arguments', variable);
	                this.variables.push(variable);
	            }

	            if (block.type === Syntax.FunctionExpression && block.id) {
	                new Scope(block, { naming: true });
	            }
	        }

	         /**
	         * Reference to the parent {@link Scope|scope}.
	         * @member {Scope} Scope#upper
	         */
	        this.upper = currentScope;
	         /**
	         * Whether 'use strict' is in effect in this scope.
	         * @member {boolean} Scope#isStrict
	         */
	        this.isStrict = isStrictScope(this, block);

	         /**
	         * List of nested {@link Scope}s.
	         * @member {Scope[]} Scope#childScopes
	         */
	        this.childScopes = [];
	        if (currentScope) {
	            currentScope.childScopes.push(this);
	        }


	        // RAII
	        currentScope = this;
	        if (this.type === 'global') {
	            globalScope = this;
	            globalScope.implicit = {
	                set: new Map(),
	                variables: []
	            };
	        }
	        scopes.push(this);
	    }

	    Scope.prototype.__close = function __close() {
	        var i, iz, ref, current, node, implicit;

	        // Because if this is global environment, upper is null
	        if (!this.dynamic || options.optimistic) {
	            // static resolve
	            for (i = 0, iz = this.left.length; i < iz; ++i) {
	                ref = this.left[i];
	                if (!this.__resolve(ref)) {
	                    this.__delegateToUpperScope(ref);
	                }
	            }
	        } else {
	            // this is "global" / "with" / "function with eval" environment
	            if (this.type === 'with') {
	                for (i = 0, iz = this.left.length; i < iz; ++i) {
	                    ref = this.left[i];
	                    ref.tainted = true;
	                    this.__delegateToUpperScope(ref);
	                }
	            } else {
	                for (i = 0, iz = this.left.length; i < iz; ++i) {
	                    // notify all names are through to global
	                    ref = this.left[i];
	                    current = this;
	                    do {
	                        current.through.push(ref);
	                        current = current.upper;
	                    } while (current);
	                }
	            }
	        }

	        if (this.type === 'global') {
	            implicit = [];
	            for (i = 0, iz = this.left.length; i < iz; ++i) {
	                ref = this.left[i];
	                if (ref.__maybeImplicitGlobal && !this.set.has(ref.identifier.name)) {
	                    implicit.push(ref.__maybeImplicitGlobal);
	                }
	            }

	            // create an implicit global variable from assignment expression
	            for (i = 0, iz = implicit.length; i < iz; ++i) {
	                node = implicit[i];
	                this.__defineImplicit(node.left, {
	                    type: Variable.ImplicitGlobalVariable,
	                    name: node.left,
	                    node: node
	                });
	            }
	        }

	        this.left = null;
	        currentScope = this.upper;
	    };

	    Scope.prototype.__resolve = function __resolve(ref) {
	        var variable, name;
	        name = ref.identifier.name;
	        if (this.set.has(name)) {
	            variable = this.set.get(name);
	            variable.references.push(ref);
	            variable.stack = variable.stack && ref.from.variableScope === this.variableScope;
	            if (ref.tainted) {
	                variable.tainted = true;
	                this.taints.set(variable.name, true);
	            }
	            ref.resolved = variable;
	            return true;
	        }
	        return false;
	    };

	    Scope.prototype.__delegateToUpperScope = function __delegateToUpperScope(ref) {
	        if (this.upper) {
	            this.upper.left.push(ref);
	        }
	        this.through.push(ref);
	    };

	    Scope.prototype.__defineImplicit = function __defineImplicit(node, info) {
	        var name, variable;
	        if (node && node.type === Syntax.Identifier) {
	            name = node.name;
	            if (!this.implicit.set.has(name)) {
	                variable = new Variable(name, this);
	                variable.identifiers.push(node);
	                variable.defs.push(info);
	                this.implicit.set.set(name, variable);
	                this.implicit.variables.push(variable);
	            } else {
	                variable = this.implicit.set.get(name);
	                variable.identifiers.push(node);
	                variable.defs.push(info);
	            }
	        }
	    };

	    Scope.prototype.__define = function __define(node, info) {
	        var name, variable;
	        if (node && node.type === Syntax.Identifier) {
	            name = node.name;
	            if (!this.set.has(name)) {
	                variable = new Variable(name, this);
	                variable.identifiers.push(node);
	                variable.defs.push(info);
	                this.set.set(name, variable);
	                this.variables.push(variable);
	            } else {
	                variable = this.set.get(name);
	                variable.identifiers.push(node);
	                variable.defs.push(info);
	            }
	        }
	    };

	    Scope.prototype.__referencing = function __referencing(node, assign, writeExpr, maybeImplicitGlobal) {
	        var ref;
	        // because Array element may be null
	        if (node && node.type === Syntax.Identifier) {
	            ref = new Reference(node, this, assign || Reference.READ, writeExpr, maybeImplicitGlobal);
	            this.references.push(ref);
	            this.left.push(ref);
	        }
	    };

	    Scope.prototype.__detectEval = function __detectEval() {
	        var current;
	        current = this;
	        this.directCallToEvalScope = true;
	        do {
	            current.dynamic = true;
	            current = current.upper;
	        } while (current);
	    };

	    Scope.prototype.__detectThis = function __detectThis() {
	        this.thisFound = true;
	    };

	    Scope.prototype.__isClosed = function isClosed() {
	        return this.left === null;
	    };

	    // API Scope#resolve(name)
	    // returns resolved reference
	    Scope.prototype.resolve = function resolve(ident) {
	        var ref, i, iz;
	        assert(this.__isClosed(), 'scope should be closed');
	        assert(ident.type === Syntax.Identifier, 'target should be identifier');
	        for (i = 0, iz = this.references.length; i < iz; ++i) {
	            ref = this.references[i];
	            if (ref.identifier === ident) {
	                return ref;
	            }
	        }
	        return null;
	    };

	    // API Scope#isStatic
	    // returns this scope is static
	    Scope.prototype.isStatic = function isStatic() {
	        return !this.dynamic;
	    };

	    // API Scope#isArgumentsMaterialized
	    // return this scope has materialized arguments
	    Scope.prototype.isArgumentsMaterialized = function isArgumentsMaterialized() {
	        // TODO(Constellation)
	        // We can more aggressive on this condition like this.
	        //
	        // function t() {
	        //     // arguments of t is always hidden.
	        //     function arguments() {
	        //     }
	        // }
	        var variable;

	        // This is not function scope
	        if (this.type !== 'function') {
	            return true;
	        }

	        if (!this.isStatic()) {
	            return true;
	        }

	        variable = this.set.get('arguments');
	        assert(variable, 'always have arguments variable');
	        return variable.tainted || variable.references.length  !== 0;
	    };

	    // API Scope#isThisMaterialized
	    // return this scope has materialized `this` reference
	    Scope.prototype.isThisMaterialized = function isThisMaterialized() {
	        // This is not function scope
	        if (this.type !== 'function') {
	            return true;
	        }
	        if (!this.isStatic()) {
	            return true;
	        }
	        return this.thisFound;
	    };

	    Scope.mangledName = '__$escope$__';

	    Scope.prototype.attach = function attach() {
	        if (!this.functionExpressionScope) {
	            this.block[Scope.mangledName] = this;
	        }
	    };

	    Scope.prototype.detach = function detach() {
	        if (!this.functionExpressionScope) {
	            delete this.block[Scope.mangledName];
	        }
	    };

	    Scope.prototype.isUsedName = function (name) {
	        if (this.set.has(name)) {
	            return true;
	        }
	        for (var i = 0, iz = this.through.length; i < iz; ++i) {
	            if (this.through[i].identifier.name === name) {
	                return true;
	            }
	        }
	        return false;
	    };

	    /**
	     * @class ScopeManager
	     */
	    function ScopeManager(scopes) {
	        this.scopes = scopes;
	        this.attached = false;
	    }

	    // Returns appropliate scope for this node
	    ScopeManager.prototype.__get = function __get(node) {
	        var i, iz, scope;
	        if (this.attached) {
	            return node[Scope.mangledName] || null;
	        }
	        if (Scope.isScopeRequired(node)) {
	            for (i = 0, iz = this.scopes.length; i < iz; ++i) {
	                scope = this.scopes[i];
	                if (!scope.functionExpressionScope) {
	                    if (scope.block === node) {
	                        return scope;
	                    }
	                }
	            }
	        }
	        return null;
	    };

	    ScopeManager.prototype.acquire = function acquire(node) {
	        return this.__get(node);
	    };

	    ScopeManager.prototype.release = function release(node) {
	        var scope = this.__get(node);
	        if (scope) {
	            scope = scope.upper;
	            while (scope) {
	                if (!scope.functionExpressionScope) {
	                    return scope;
	                }
	                scope = scope.upper;
	            }
	        }
	        return null;
	    };

	    ScopeManager.prototype.attach = function attach() {
	        var i, iz;
	        for (i = 0, iz = this.scopes.length; i < iz; ++i) {
	            this.scopes[i].attach();
	        }
	        this.attached = true;
	    };

	    ScopeManager.prototype.detach = function detach() {
	        var i, iz;
	        for (i = 0, iz = this.scopes.length; i < iz; ++i) {
	            this.scopes[i].detach();
	        }
	        this.attached = false;
	    };

	    Scope.isScopeRequired = function isScopeRequired(node) {
	        return Scope.isVariableScopeRequired(node) || node.type === Syntax.WithStatement || node.type === Syntax.CatchClause;
	    };

	    Scope.isVariableScopeRequired = function isVariableScopeRequired(node) {
	        return node.type === Syntax.Program || node.type === Syntax.FunctionExpression || node.type === Syntax.FunctionDeclaration;
	    };

	    /**
	     * Main interface function. Takes an Esprima syntax tree and returns the
	     * analyzed scopes.
	     * @function analyze
	     * @param {esprima.Tree} tree
	     * @param {Object} providedOptions - Options that tailor the scope analysis
	     * @param {boolean} [providedOptions.optimistic=false] - the optimistic flag
	     * @param {boolean} [providedOptions.directive=false]- the directive flag
	     * @param {boolean} [providedOptions.ignoreEval=false]- whether to check 'eval()' calls
	     * @return {ScopeManager}
	     */
	    function analyze(tree, providedOptions) {
	        var resultScopes;

	        options = updateDeeply(defaultOptions(), providedOptions);
	        resultScopes = scopes = [];
	        currentScope = null;
	        globalScope = null;

	        // attach scope and collect / resolve names
	        estraverse.traverse(tree, {
	            enter: function enter(node) {
	                var i, iz, decl;
	                if (Scope.isScopeRequired(node)) {
	                    new Scope(node, {});
	                }

	                switch (node.type) {
	                case Syntax.AssignmentExpression:
	                    if (node.operator === '=') {
	                        currentScope.__referencing(node.left, Reference.WRITE, node.right, (!currentScope.isStrict && node.left.name != null) && node);
	                    } else {
	                        currentScope.__referencing(node.left, Reference.RW, node.right);
	                    }
	                    currentScope.__referencing(node.right);
	                    break;

	                case Syntax.ArrayExpression:
	                    for (i = 0, iz = node.elements.length; i < iz; ++i) {
	                        currentScope.__referencing(node.elements[i]);
	                    }
	                    break;

	                case Syntax.BlockStatement:
	                    break;

	                case Syntax.BinaryExpression:
	                    currentScope.__referencing(node.left);
	                    currentScope.__referencing(node.right);
	                    break;

	                case Syntax.BreakStatement:
	                    break;

	                case Syntax.CallExpression:
	                    currentScope.__referencing(node.callee);
	                    for (i = 0, iz = node['arguments'].length; i < iz; ++i) {
	                        currentScope.__referencing(node['arguments'][i]);
	                    }

	                    // check this is direct call to eval
	                    if (!options.ignoreEval && node.callee.type === Syntax.Identifier && node.callee.name === 'eval') {
	                        currentScope.variableScope.__detectEval();
	                    }
	                    break;

	                case Syntax.CatchClause:
	                    currentScope.__define(node.param, {
	                        type: Variable.CatchClause,
	                        name: node.param,
	                        node: node
	                    });
	                    break;

	                case Syntax.ConditionalExpression:
	                    currentScope.__referencing(node.test);
	                    currentScope.__referencing(node.consequent);
	                    currentScope.__referencing(node.alternate);
	                    break;

	                case Syntax.ContinueStatement:
	                    break;

	                case Syntax.DirectiveStatement:
	                    break;

	                case Syntax.DoWhileStatement:
	                    currentScope.__referencing(node.test);
	                    break;

	                case Syntax.DebuggerStatement:
	                    break;

	                case Syntax.EmptyStatement:
	                    break;

	                case Syntax.ExpressionStatement:
	                    currentScope.__referencing(node.expression);
	                    break;

	                case Syntax.ForStatement:
	                    currentScope.__referencing(node.init);
	                    currentScope.__referencing(node.test);
	                    currentScope.__referencing(node.update);
	                    break;

	                case Syntax.ForInStatement:
	                    if (node.left.type === Syntax.VariableDeclaration) {
	                        currentScope.__referencing(node.left.declarations[0].id, Reference.WRITE, null, false);
	                    } else {
	                        currentScope.__referencing(node.left, Reference.WRITE, null, (!currentScope.isStrict && node.left.name != null) && node);
	                    }
	                    currentScope.__referencing(node.right);
	                    break;

	                case Syntax.FunctionDeclaration:
	                    // FunctionDeclaration name is defined in upper scope
	                    currentScope.upper.__define(node.id, {
	                        type: Variable.FunctionName,
	                        name: node.id,
	                        node: node
	                    });
	                    for (i = 0, iz = node.params.length; i < iz; ++i) {
	                        currentScope.__define(node.params[i], {
	                            type: Variable.Parameter,
	                            name: node.params[i],
	                            node: node,
	                            index: i
	                        });
	                    }
	                    break;

	                case Syntax.FunctionExpression:
	                    // id is defined in upper scope
	                    for (i = 0, iz = node.params.length; i < iz; ++i) {
	                        currentScope.__define(node.params[i], {
	                            type: Variable.Parameter,
	                            name: node.params[i],
	                            node: node,
	                            index: i
	                        });
	                    }
	                    break;

	                case Syntax.Identifier:
	                    break;

	                case Syntax.IfStatement:
	                    currentScope.__referencing(node.test);
	                    break;

	                case Syntax.Literal:
	                    break;

	                case Syntax.LabeledStatement:
	                    break;

	                case Syntax.LogicalExpression:
	                    currentScope.__referencing(node.left);
	                    currentScope.__referencing(node.right);
	                    break;

	                case Syntax.MemberExpression:
	                    currentScope.__referencing(node.object);
	                    if (node.computed) {
	                        currentScope.__referencing(node.property);
	                    }
	                    break;

	                case Syntax.NewExpression:
	                    currentScope.__referencing(node.callee);
	                    for (i = 0, iz = node['arguments'].length; i < iz; ++i) {
	                        currentScope.__referencing(node['arguments'][i]);
	                    }
	                    break;

	                case Syntax.ObjectExpression:
	                    for (i = 0; i < node.properties.length; i++) {
	                        if (node.properties[i].kind === 'init') {
	                            currentScope.__referencing(node.properties[i].value);
	                        }
	                    }
	                    break;

	                case Syntax.Program:
	                    break;

	                case Syntax.Property:
	                    break;

	                case Syntax.ReturnStatement:
	                    currentScope.__referencing(node.argument);
	                    break;

	                case Syntax.SequenceExpression:
	                    for (i = 0, iz = node.expressions.length; i < iz; ++i) {
	                        currentScope.__referencing(node.expressions[i]);
	                    }
	                    break;

	                case Syntax.SwitchStatement:
	                    currentScope.__referencing(node.discriminant);
	                    break;

	                case Syntax.SwitchCase:
	                    currentScope.__referencing(node.test);
	                    break;

	                case Syntax.ThisExpression:
	                    currentScope.variableScope.__detectThis();
	                    break;

	                case Syntax.ThrowStatement:
	                    currentScope.__referencing(node.argument);
	                    break;

	                case Syntax.TryStatement:
	                    break;

	                case Syntax.UnaryExpression:
	                    currentScope.__referencing(node.argument);
	                    break;

	                case Syntax.UpdateExpression:
	                    currentScope.__referencing(node.argument, Reference.RW, null);
	                    break;

	                case Syntax.VariableDeclaration:
	                    for (i = 0, iz = node.declarations.length; i < iz; ++i) {
	                        decl = node.declarations[i];
	                        currentScope.variableScope.__define(decl.id, {
	                            type: Variable.Variable,
	                            name: decl.id,
	                            node: decl,
	                            index: i,
	                            parent: node
	                        });
	                        if (decl.init) {
	                            // initializer is found
	                            currentScope.__referencing(decl.id, Reference.WRITE, decl.init, false);
	                            currentScope.__referencing(decl.init);
	                        }
	                    }
	                    break;

	                case Syntax.VariableDeclarator:
	                    break;

	                case Syntax.WhileStatement:
	                    currentScope.__referencing(node.test);
	                    break;

	                case Syntax.WithStatement:
	                    // WithStatement object is referenced at upper scope
	                    currentScope.upper.__referencing(node.object);
	                    break;
	                }
	            },

	            leave: function leave(node) {
	                while (currentScope && node === currentScope.block) {
	                    currentScope.__close();
	                }
	            }
	        });

	        assert(currentScope === null);
	        globalScope = null;
	        scopes = null;
	        options = null;

	        return new ScopeManager(resultScopes);
	    }

	    /** @name module:escope.version */
	    exports.version = '1.0.3';
	    /** @name module:escope.Reference */
	    exports.Reference = Reference;
	    /** @name module:escope.Variable */
	    exports.Variable = Variable;
	    /** @name module:escope.Scope */
	    exports.Scope = Scope;
	    /** @name module:escope.ScopeManager */
	    exports.ScopeManager = ScopeManager;
	    /** @name module:escope.analyze */
	    exports.analyze = analyze;
	}, this));
	/* vim: set sw=4 ts=4 et tw=80 : */


/***/ },
/* 53 */
/***/ function(module, exports) {

	/*
	  Copyright (C) 2012-2013 Yusuke Suzuki <utatane.tea@gmail.com>
	  Copyright (C) 2012 Ariya Hidayat <ariya.hidayat@gmail.com>

	  Redistribution and use in source and binary forms, with or without
	  modification, are permitted provided that the following conditions are met:

	    * Redistributions of source code must retain the above copyright
	      notice, this list of conditions and the following disclaimer.
	    * Redistributions in binary form must reproduce the above copyright
	      notice, this list of conditions and the following disclaimer in the
	      documentation and/or other materials provided with the distribution.

	  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
	  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
	  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
	  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
	  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
	  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
	  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
	  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
	  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
	  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
	*/
	/*jslint vars:false, bitwise:true*/
	/*jshint indent:4*/
	/*global exports:true*/
	(function clone(exports) {
	    'use strict';

	    var Syntax,
	        isArray,
	        VisitorOption,
	        VisitorKeys,
	        objectCreate,
	        objectKeys,
	        BREAK,
	        SKIP,
	        REMOVE;

	    function ignoreJSHintError() { }

	    isArray = Array.isArray;
	    if (!isArray) {
	        isArray = function isArray(array) {
	            return Object.prototype.toString.call(array) === '[object Array]';
	        };
	    }

	    function deepCopy(obj) {
	        var ret = {}, key, val;
	        for (key in obj) {
	            if (obj.hasOwnProperty(key)) {
	                val = obj[key];
	                if (typeof val === 'object' && val !== null) {
	                    ret[key] = deepCopy(val);
	                } else {
	                    ret[key] = val;
	                }
	            }
	        }
	        return ret;
	    }

	    function shallowCopy(obj) {
	        var ret = {}, key;
	        for (key in obj) {
	            if (obj.hasOwnProperty(key)) {
	                ret[key] = obj[key];
	            }
	        }
	        return ret;
	    }
	    ignoreJSHintError(shallowCopy);

	    // based on LLVM libc++ upper_bound / lower_bound
	    // MIT License

	    function upperBound(array, func) {
	        var diff, len, i, current;

	        len = array.length;
	        i = 0;

	        while (len) {
	            diff = len >>> 1;
	            current = i + diff;
	            if (func(array[current])) {
	                len = diff;
	            } else {
	                i = current + 1;
	                len -= diff + 1;
	            }
	        }
	        return i;
	    }

	    function lowerBound(array, func) {
	        var diff, len, i, current;

	        len = array.length;
	        i = 0;

	        while (len) {
	            diff = len >>> 1;
	            current = i + diff;
	            if (func(array[current])) {
	                i = current + 1;
	                len -= diff + 1;
	            } else {
	                len = diff;
	            }
	        }
	        return i;
	    }
	    ignoreJSHintError(lowerBound);

	    objectCreate = Object.create || (function () {
	        function F() { }

	        return function (o) {
	            F.prototype = o;
	            return new F();
	        };
	    })();

	    objectKeys = Object.keys || function (o) {
	        var keys = [], key;
	        for (key in o) {
	            keys.push(key);
	        }
	        return keys;
	    };

	    function extend(to, from) {
	        var keys = objectKeys(from), key, i, len;
	        for (i = 0, len = keys.length; i < len; i += 1) {
	            key = keys[i];
	            to[key] = from[key];
	        }
	        return to;
	    }

	    Syntax = {
	        AssignmentExpression: 'AssignmentExpression',
	        AssignmentPattern: 'AssignmentPattern',
	        ArrayExpression: 'ArrayExpression',
	        ArrayPattern: 'ArrayPattern',
	        ArrowFunctionExpression: 'ArrowFunctionExpression',
	        AwaitExpression: 'AwaitExpression', // CAUTION: It's deferred to ES7.
	        BlockStatement: 'BlockStatement',
	        BinaryExpression: 'BinaryExpression',
	        BreakStatement: 'BreakStatement',
	        CallExpression: 'CallExpression',
	        CatchClause: 'CatchClause',
	        ClassBody: 'ClassBody',
	        ClassDeclaration: 'ClassDeclaration',
	        ClassExpression: 'ClassExpression',
	        ComprehensionBlock: 'ComprehensionBlock',  // CAUTION: It's deferred to ES7.
	        ComprehensionExpression: 'ComprehensionExpression',  // CAUTION: It's deferred to ES7.
	        ConditionalExpression: 'ConditionalExpression',
	        ContinueStatement: 'ContinueStatement',
	        DebuggerStatement: 'DebuggerStatement',
	        DirectiveStatement: 'DirectiveStatement',
	        DoWhileStatement: 'DoWhileStatement',
	        EmptyStatement: 'EmptyStatement',
	        ExportAllDeclaration: 'ExportAllDeclaration',
	        ExportDefaultDeclaration: 'ExportDefaultDeclaration',
	        ExportNamedDeclaration: 'ExportNamedDeclaration',
	        ExportSpecifier: 'ExportSpecifier',
	        ExpressionStatement: 'ExpressionStatement',
	        ForStatement: 'ForStatement',
	        ForInStatement: 'ForInStatement',
	        ForOfStatement: 'ForOfStatement',
	        FunctionDeclaration: 'FunctionDeclaration',
	        FunctionExpression: 'FunctionExpression',
	        GeneratorExpression: 'GeneratorExpression',  // CAUTION: It's deferred to ES7.
	        Identifier: 'Identifier',
	        IfStatement: 'IfStatement',
	        ImportDeclaration: 'ImportDeclaration',
	        ImportDefaultSpecifier: 'ImportDefaultSpecifier',
	        ImportNamespaceSpecifier: 'ImportNamespaceSpecifier',
	        ImportSpecifier: 'ImportSpecifier',
	        Literal: 'Literal',
	        LabeledStatement: 'LabeledStatement',
	        LogicalExpression: 'LogicalExpression',
	        MemberExpression: 'MemberExpression',
	        MethodDefinition: 'MethodDefinition',
	        ModuleSpecifier: 'ModuleSpecifier',
	        NewExpression: 'NewExpression',
	        ObjectExpression: 'ObjectExpression',
	        ObjectPattern: 'ObjectPattern',
	        Program: 'Program',
	        Property: 'Property',
	        RestElement: 'RestElement',
	        ReturnStatement: 'ReturnStatement',
	        SequenceExpression: 'SequenceExpression',
	        SpreadElement: 'SpreadElement',
	        SwitchStatement: 'SwitchStatement',
	        SwitchCase: 'SwitchCase',
	        TaggedTemplateExpression: 'TaggedTemplateExpression',
	        TemplateElement: 'TemplateElement',
	        TemplateLiteral: 'TemplateLiteral',
	        ThisExpression: 'ThisExpression',
	        ThrowStatement: 'ThrowStatement',
	        TryStatement: 'TryStatement',
	        UnaryExpression: 'UnaryExpression',
	        UpdateExpression: 'UpdateExpression',
	        VariableDeclaration: 'VariableDeclaration',
	        VariableDeclarator: 'VariableDeclarator',
	        WhileStatement: 'WhileStatement',
	        WithStatement: 'WithStatement',
	        YieldExpression: 'YieldExpression'
	    };

	    VisitorKeys = {
	        AssignmentExpression: ['left', 'right'],
	        AssignmentPattern: ['left', 'right'],
	        ArrayExpression: ['elements'],
	        ArrayPattern: ['elements'],
	        ArrowFunctionExpression: ['params', 'defaults', 'rest', 'body'],
	        AwaitExpression: ['argument'], // CAUTION: It's deferred to ES7.
	        BlockStatement: ['body'],
	        BinaryExpression: ['left', 'right'],
	        BreakStatement: ['label'],
	        CallExpression: ['callee', 'arguments'],
	        CatchClause: ['param', 'body'],
	        ClassBody: ['body'],
	        ClassDeclaration: ['id', 'superClass', 'body'],
	        ClassExpression: ['id', 'superClass', 'body'],
	        ComprehensionBlock: ['left', 'right'],  // CAUTION: It's deferred to ES7.
	        ComprehensionExpression: ['blocks', 'filter', 'body'],  // CAUTION: It's deferred to ES7.
	        ConditionalExpression: ['test', 'consequent', 'alternate'],
	        ContinueStatement: ['label'],
	        DebuggerStatement: [],
	        DirectiveStatement: [],
	        DoWhileStatement: ['body', 'test'],
	        EmptyStatement: [],
	        ExportAllDeclaration: ['source'],
	        ExportDefaultDeclaration: ['declaration'],
	        ExportNamedDeclaration: ['declaration', 'specifiers', 'source'],
	        ExportSpecifier: ['exported', 'local'],
	        ExpressionStatement: ['expression'],
	        ForStatement: ['init', 'test', 'update', 'body'],
	        ForInStatement: ['left', 'right', 'body'],
	        ForOfStatement: ['left', 'right', 'body'],
	        FunctionDeclaration: ['id', 'params', 'defaults', 'rest', 'body'],
	        FunctionExpression: ['id', 'params', 'defaults', 'rest', 'body'],
	        GeneratorExpression: ['blocks', 'filter', 'body'],  // CAUTION: It's deferred to ES7.
	        Identifier: [],
	        IfStatement: ['test', 'consequent', 'alternate'],
	        ImportDeclaration: ['specifiers', 'source'],
	        ImportDefaultSpecifier: ['local'],
	        ImportNamespaceSpecifier: ['local'],
	        ImportSpecifier: ['imported', 'local'],
	        Literal: [],
	        LabeledStatement: ['label', 'body'],
	        LogicalExpression: ['left', 'right'],
	        MemberExpression: ['object', 'property'],
	        MethodDefinition: ['key', 'value'],
	        ModuleSpecifier: [],
	        NewExpression: ['callee', 'arguments'],
	        ObjectExpression: ['properties'],
	        ObjectPattern: ['properties'],
	        Program: ['body'],
	        Property: ['key', 'value'],
	        RestElement: [ 'argument' ],
	        ReturnStatement: ['argument'],
	        SequenceExpression: ['expressions'],
	        SpreadElement: ['argument'],
	        SwitchStatement: ['discriminant', 'cases'],
	        SwitchCase: ['test', 'consequent'],
	        TaggedTemplateExpression: ['tag', 'quasi'],
	        TemplateElement: [],
	        TemplateLiteral: ['quasis', 'expressions'],
	        ThisExpression: [],
	        ThrowStatement: ['argument'],
	        TryStatement: ['block', 'handlers', 'handler', 'guardedHandlers', 'finalizer'],
	        UnaryExpression: ['argument'],
	        UpdateExpression: ['argument'],
	        VariableDeclaration: ['declarations'],
	        VariableDeclarator: ['id', 'init'],
	        WhileStatement: ['test', 'body'],
	        WithStatement: ['object', 'body'],
	        YieldExpression: ['argument']
	    };

	    // unique id
	    BREAK = {};
	    SKIP = {};
	    REMOVE = {};

	    VisitorOption = {
	        Break: BREAK,
	        Skip: SKIP,
	        Remove: REMOVE
	    };

	    function Reference(parent, key) {
	        this.parent = parent;
	        this.key = key;
	    }

	    Reference.prototype.replace = function replace(node) {
	        this.parent[this.key] = node;
	    };

	    Reference.prototype.remove = function remove() {
	        if (isArray(this.parent)) {
	            this.parent.splice(this.key, 1);
	            return true;
	        } else {
	            this.replace(null);
	            return false;
	        }
	    };

	    function Element(node, path, wrap, ref) {
	        this.node = node;
	        this.path = path;
	        this.wrap = wrap;
	        this.ref = ref;
	    }

	    function Controller() { }

	    // API:
	    // return property path array from root to current node
	    Controller.prototype.path = function path() {
	        var i, iz, j, jz, result, element;

	        function addToPath(result, path) {
	            if (isArray(path)) {
	                for (j = 0, jz = path.length; j < jz; ++j) {
	                    result.push(path[j]);
	                }
	            } else {
	                result.push(path);
	            }
	        }

	        // root node
	        if (!this.__current.path) {
	            return null;
	        }

	        // first node is sentinel, second node is root element
	        result = [];
	        for (i = 2, iz = this.__leavelist.length; i < iz; ++i) {
	            element = this.__leavelist[i];
	            addToPath(result, element.path);
	        }
	        addToPath(result, this.__current.path);
	        return result;
	    };

	    // API:
	    // return type of current node
	    Controller.prototype.type = function () {
	        var node = this.current();
	        return node.type || this.__current.wrap;
	    };

	    // API:
	    // return array of parent elements
	    Controller.prototype.parents = function parents() {
	        var i, iz, result;

	        // first node is sentinel
	        result = [];
	        for (i = 1, iz = this.__leavelist.length; i < iz; ++i) {
	            result.push(this.__leavelist[i].node);
	        }

	        return result;
	    };

	    // API:
	    // return current node
	    Controller.prototype.current = function current() {
	        return this.__current.node;
	    };

	    Controller.prototype.__execute = function __execute(callback, element) {
	        var previous, result;

	        result = undefined;

	        previous  = this.__current;
	        this.__current = element;
	        this.__state = null;
	        if (callback) {
	            result = callback.call(this, element.node, this.__leavelist[this.__leavelist.length - 1].node);
	        }
	        this.__current = previous;

	        return result;
	    };

	    // API:
	    // notify control skip / break
	    Controller.prototype.notify = function notify(flag) {
	        this.__state = flag;
	    };

	    // API:
	    // skip child nodes of current node
	    Controller.prototype.skip = function () {
	        this.notify(SKIP);
	    };

	    // API:
	    // break traversals
	    Controller.prototype['break'] = function () {
	        this.notify(BREAK);
	    };

	    // API:
	    // remove node
	    Controller.prototype.remove = function () {
	        this.notify(REMOVE);
	    };

	    Controller.prototype.__initialize = function(root, visitor) {
	        this.visitor = visitor;
	        this.root = root;
	        this.__worklist = [];
	        this.__leavelist = [];
	        this.__current = null;
	        this.__state = null;
	        this.__fallback = visitor.fallback === 'iteration';
	        this.__keys = VisitorKeys;
	        if (visitor.keys) {
	            this.__keys = extend(objectCreate(this.__keys), visitor.keys);
	        }
	    };

	    function isNode(node) {
	        if (node == null) {
	            return false;
	        }
	        return typeof node === 'object' && typeof node.type === 'string';
	    }

	    function isProperty(nodeType, key) {
	        return (nodeType === Syntax.ObjectExpression || nodeType === Syntax.ObjectPattern) && 'properties' === key;
	    }

	    Controller.prototype.traverse = function traverse(root, visitor) {
	        var worklist,
	            leavelist,
	            element,
	            node,
	            nodeType,
	            ret,
	            key,
	            current,
	            current2,
	            candidates,
	            candidate,
	            sentinel;

	        this.__initialize(root, visitor);

	        sentinel = {};

	        // reference
	        worklist = this.__worklist;
	        leavelist = this.__leavelist;

	        // initialize
	        worklist.push(new Element(root, null, null, null));
	        leavelist.push(new Element(null, null, null, null));

	        while (worklist.length) {
	            element = worklist.pop();

	            if (element === sentinel) {
	                element = leavelist.pop();

	                ret = this.__execute(visitor.leave, element);

	                if (this.__state === BREAK || ret === BREAK) {
	                    return;
	                }
	                continue;
	            }

	            if (element.node) {

	                ret = this.__execute(visitor.enter, element);

	                if (this.__state === BREAK || ret === BREAK) {
	                    return;
	                }

	                worklist.push(sentinel);
	                leavelist.push(element);

	                if (this.__state === SKIP || ret === SKIP) {
	                    continue;
	                }

	                node = element.node;
	                nodeType = element.wrap || node.type;
	                candidates = this.__keys[nodeType];
	                if (!candidates) {
	                    if (this.__fallback) {
	                        candidates = objectKeys(node);
	                    } else {
	                        throw new Error('Unknown node type ' + nodeType + '.');
	                    }
	                }

	                current = candidates.length;
	                while ((current -= 1) >= 0) {
	                    key = candidates[current];
	                    candidate = node[key];
	                    if (!candidate) {
	                        continue;
	                    }

	                    if (isArray(candidate)) {
	                        current2 = candidate.length;
	                        while ((current2 -= 1) >= 0) {
	                            if (!candidate[current2]) {
	                                continue;
	                            }
	                            if (isProperty(nodeType, candidates[current])) {
	                                element = new Element(candidate[current2], [key, current2], 'Property', null);
	                            } else if (isNode(candidate[current2])) {
	                                element = new Element(candidate[current2], [key, current2], null, null);
	                            } else {
	                                continue;
	                            }
	                            worklist.push(element);
	                        }
	                    } else if (isNode(candidate)) {
	                        worklist.push(new Element(candidate, key, null, null));
	                    }
	                }
	            }
	        }
	    };

	    Controller.prototype.replace = function replace(root, visitor) {
	        function removeElem(element) {
	            var i,
	                key,
	                nextElem,
	                parent;

	            if (element.ref.remove()) {
	                // When the reference is an element of an array.
	                key = element.ref.key;
	                parent = element.ref.parent;

	                // If removed from array, then decrease following items' keys.
	                i = worklist.length;
	                while (i--) {
	                    nextElem = worklist[i];
	                    if (nextElem.ref && nextElem.ref.parent === parent) {
	                        if  (nextElem.ref.key < key) {
	                            break;
	                        }
	                        --nextElem.ref.key;
	                    }
	                }
	            }
	        }

	        var worklist,
	            leavelist,
	            node,
	            nodeType,
	            target,
	            element,
	            current,
	            current2,
	            candidates,
	            candidate,
	            sentinel,
	            outer,
	            key;

	        this.__initialize(root, visitor);

	        sentinel = {};

	        // reference
	        worklist = this.__worklist;
	        leavelist = this.__leavelist;

	        // initialize
	        outer = {
	            root: root
	        };
	        element = new Element(root, null, null, new Reference(outer, 'root'));
	        worklist.push(element);
	        leavelist.push(element);

	        while (worklist.length) {
	            element = worklist.pop();

	            if (element === sentinel) {
	                element = leavelist.pop();

	                target = this.__execute(visitor.leave, element);

	                // node may be replaced with null,
	                // so distinguish between undefined and null in this place
	                if (target !== undefined && target !== BREAK && target !== SKIP && target !== REMOVE) {
	                    // replace
	                    element.ref.replace(target);
	                }

	                if (this.__state === REMOVE || target === REMOVE) {
	                    removeElem(element);
	                }

	                if (this.__state === BREAK || target === BREAK) {
	                    return outer.root;
	                }
	                continue;
	            }

	            target = this.__execute(visitor.enter, element);

	            // node may be replaced with null,
	            // so distinguish between undefined and null in this place
	            if (target !== undefined && target !== BREAK && target !== SKIP && target !== REMOVE) {
	                // replace
	                element.ref.replace(target);
	                element.node = target;
	            }

	            if (this.__state === REMOVE || target === REMOVE) {
	                removeElem(element);
	                element.node = null;
	            }

	            if (this.__state === BREAK || target === BREAK) {
	                return outer.root;
	            }

	            // node may be null
	            node = element.node;
	            if (!node) {
	                continue;
	            }

	            worklist.push(sentinel);
	            leavelist.push(element);

	            if (this.__state === SKIP || target === SKIP) {
	                continue;
	            }

	            nodeType = element.wrap || node.type;
	            candidates = this.__keys[nodeType];
	            if (!candidates) {
	                if (this.__fallback) {
	                    candidates = objectKeys(node);
	                } else {
	                    throw new Error('Unknown node type ' + nodeType + '.');
	                }
	            }

	            current = candidates.length;
	            while ((current -= 1) >= 0) {
	                key = candidates[current];
	                candidate = node[key];
	                if (!candidate) {
	                    continue;
	                }

	                if (isArray(candidate)) {
	                    current2 = candidate.length;
	                    while ((current2 -= 1) >= 0) {
	                        if (!candidate[current2]) {
	                            continue;
	                        }
	                        if (isProperty(nodeType, candidates[current])) {
	                            element = new Element(candidate[current2], [key, current2], 'Property', new Reference(candidate, current2));
	                        } else if (isNode(candidate[current2])) {
	                            element = new Element(candidate[current2], [key, current2], null, new Reference(candidate, current2));
	                        } else {
	                            continue;
	                        }
	                        worklist.push(element);
	                    }
	                } else if (isNode(candidate)) {
	                    worklist.push(new Element(candidate, key, null, new Reference(node, key)));
	                }
	            }
	        }

	        return outer.root;
	    };

	    function traverse(root, visitor) {
	        var controller = new Controller();
	        return controller.traverse(root, visitor);
	    }

	    function replace(root, visitor) {
	        var controller = new Controller();
	        return controller.replace(root, visitor);
	    }

	    function extendCommentRange(comment, tokens) {
	        var target;

	        target = upperBound(tokens, function search(token) {
	            return token.range[0] > comment.range[0];
	        });

	        comment.extendedRange = [comment.range[0], comment.range[1]];

	        if (target !== tokens.length) {
	            comment.extendedRange[1] = tokens[target].range[0];
	        }

	        target -= 1;
	        if (target >= 0) {
	            comment.extendedRange[0] = tokens[target].range[1];
	        }

	        return comment;
	    }

	    function attachComments(tree, providedComments, tokens) {
	        // At first, we should calculate extended comment ranges.
	        var comments = [], comment, len, i, cursor;

	        if (!tree.range) {
	            throw new Error('attachComments needs range information');
	        }

	        // tokens array is empty, we attach comments to tree as 'leadingComments'
	        if (!tokens.length) {
	            if (providedComments.length) {
	                for (i = 0, len = providedComments.length; i < len; i += 1) {
	                    comment = deepCopy(providedComments[i]);
	                    comment.extendedRange = [0, tree.range[0]];
	                    comments.push(comment);
	                }
	                tree.leadingComments = comments;
	            }
	            return tree;
	        }

	        for (i = 0, len = providedComments.length; i < len; i += 1) {
	            comments.push(extendCommentRange(deepCopy(providedComments[i]), tokens));
	        }

	        // This is based on John Freeman's implementation.
	        cursor = 0;
	        traverse(tree, {
	            enter: function (node) {
	                var comment;

	                while (cursor < comments.length) {
	                    comment = comments[cursor];
	                    if (comment.extendedRange[1] > node.range[0]) {
	                        break;
	                    }

	                    if (comment.extendedRange[1] === node.range[0]) {
	                        if (!node.leadingComments) {
	                            node.leadingComments = [];
	                        }
	                        node.leadingComments.push(comment);
	                        comments.splice(cursor, 1);
	                    } else {
	                        cursor += 1;
	                    }
	                }

	                // already out of owned node
	                if (cursor === comments.length) {
	                    return VisitorOption.Break;
	                }

	                if (comments[cursor].extendedRange[0] > node.range[1]) {
	                    return VisitorOption.Skip;
	                }
	            }
	        });

	        cursor = 0;
	        traverse(tree, {
	            leave: function (node) {
	                var comment;

	                while (cursor < comments.length) {
	                    comment = comments[cursor];
	                    if (node.range[1] < comment.extendedRange[0]) {
	                        break;
	                    }

	                    if (node.range[1] === comment.extendedRange[0]) {
	                        if (!node.trailingComments) {
	                            node.trailingComments = [];
	                        }
	                        node.trailingComments.push(comment);
	                        comments.splice(cursor, 1);
	                    } else {
	                        cursor += 1;
	                    }
	                }

	                // already out of owned node
	                if (cursor === comments.length) {
	                    return VisitorOption.Break;
	                }

	                if (comments[cursor].extendedRange[0] > node.range[1]) {
	                    return VisitorOption.Skip;
	                }
	            }
	        });

	        return tree;
	    }

	    exports.version = "2.0.0";
	    exports.Syntax = Syntax;
	    exports.traverse = traverse;
	    exports.replace = replace;
	    exports.attachComments = attachComments;
	    exports.VisitorKeys = VisitorKeys;
	    exports.VisitorOption = VisitorOption;
	    exports.Controller = Controller;
	    exports.cloneEnvironment = function () { return clone({}); };

	    return exports;
	}(exports));
	/* vim: set sw=4 ts=4 et tw=80 : */


/***/ },
/* 54 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";

	var assert = __webpack_require__(4);
	var is = __webpack_require__(55);
	var fmt = __webpack_require__(56);
	var stringmap = __webpack_require__(57);
	var stringset = __webpack_require__(58);
	var alter = __webpack_require__(59);
	var traverse = __webpack_require__(61);
	var breakable = __webpack_require__(62);
	var Scope = __webpack_require__(63);
	var error = __webpack_require__(64);
	var options = __webpack_require__(65);
	var Stats = __webpack_require__(67);
	var jshint_vars = __webpack_require__(68);


	function getline(node) {
	    return node.loc.start.line;
	}

	function isConstLet(kind) {
	    return is.someof(kind, ["const", "let"]);
	}

	function isVarConstLet(kind) {
	    return is.someof(kind, ["var", "const", "let"]);
	}

	function isNonFunctionBlock(node) {
	    return node.type === "BlockStatement" && is.noneof(node.$parent.type, ["FunctionDeclaration", "FunctionExpression"]);
	}

	function isForWithConstLet(node) {
	    return node.type === "ForStatement" && node.init && node.init.type === "VariableDeclaration" && isConstLet(node.init.kind);
	}

	function isForInWithConstLet(node) {
	    return node.type === "ForInStatement" && node.left.type === "VariableDeclaration" && isConstLet(node.left.kind);
	}

	function isFunction(node) {
	    return is.someof(node.type, ["FunctionDeclaration", "FunctionExpression"]);
	}

	function isLoop(node) {
	    return is.someof(node.type, ["ForStatement", "ForInStatement", "WhileStatement", "DoWhileStatement"]);
	}

	function isReference(node) {
	    var parent = node.$parent;
	    return node.$refToScope ||
	        node.type === "Identifier" &&
	        !(parent.type === "VariableDeclarator" && parent.id === node) && // var|let|const $
	        !(parent.type === "MemberExpression" && parent.computed === false && parent.property === node) && // obj.$
	        !(parent.type === "Property" && parent.key === node) && // {$: ...}
	        !(parent.type === "LabeledStatement" && parent.label === node) && // $: ...
	        !(parent.type === "CatchClause" && parent.param === node) && // catch($)
	        !(isFunction(parent) && parent.id === node) && // function $(..
	        !(isFunction(parent) && is.someof(node, parent.params)) && // function f($)..
	        true;
	}

	function isLvalue(node) {
	    return isReference(node) &&
	        ((node.$parent.type === "AssignmentExpression" && node.$parent.left === node) ||
	            (node.$parent.type === "UpdateExpression" && node.$parent.argument === node));
	}

	function createScopes(node, parent) {
	    assert(!node.$scope);

	    node.$parent = parent;
	    node.$scope = node.$parent ? node.$parent.$scope : null; // may be overridden

	    if (node.type === "Program") {
	        // Top-level program is a scope
	        // There's no block-scope under it
	        node.$scope = new Scope({
	            kind: "hoist",
	            node: node,
	            parent: null,
	        });

	    } else if (isFunction(node)) {
	        // Function is a scope, with params in it
	        // There's no block-scope under it

	        node.$scope = new Scope({
	            kind: "hoist",
	            node: node,
	            parent: node.$parent.$scope,
	        });

	        // function has a name
	        if (node.id) {
	            assert(node.id.type === "Identifier");

	            if (node.type === "FunctionDeclaration") {
	                // Function name goes in parent scope for declared functions
	                node.$parent.$scope.add(node.id.name, "fun", node.id, null);
	            } else if (node.type === "FunctionExpression") {
	                // Function name goes in function's scope for named function expressions
	                node.$scope.add(node.id.name, "fun", node.id, null);
	            } else {
	                assert(false);
	            }
	        }

	        node.params.forEach(function(param) {
	            node.$scope.add(param.name, "param", param, null);
	        });

	    } else if (node.type === "VariableDeclaration") {
	        // Variable declarations names goes in current scope
	        assert(isVarConstLet(node.kind));
	        node.declarations.forEach(function(declarator) {
	            assert(declarator.type === "VariableDeclarator");
	            var name = declarator.id.name;
	            if (options.disallowVars && node.kind === "var") {
	                error(getline(declarator), "var {0} is not allowed (use let or const)", name);
	            }
	            node.$scope.add(name, node.kind, declarator.id, declarator.range[1]);
	        });

	    } else if (isForWithConstLet(node) || isForInWithConstLet(node)) {
	        // For(In) loop with const|let declaration is a scope, with declaration in it
	        // There may be a block-scope under it
	        node.$scope = new Scope({
	            kind: "block",
	            node: node,
	            parent: node.$parent.$scope,
	        });

	    } else if (isNonFunctionBlock(node)) {
	        // A block node is a scope unless parent is a function
	        node.$scope = new Scope({
	            kind: "block",
	            node: node,
	            parent: node.$parent.$scope,
	        });

	    } else if (node.type === "CatchClause") {
	        var identifier = node.param;

	        node.$scope = new Scope({
	            kind: "catch-block",
	            node: node,
	            parent: node.$parent.$scope,
	        });
	        node.$scope.add(identifier.name, "caught", identifier, null);

	        // All hoist-scope keeps track of which variables that are propagated through,
	        // i.e. an reference inside the scope points to a declaration outside the scope.
	        // This is used to mark "taint" the name since adding a new variable in the scope,
	        // with a propagated name, would change the meaning of the existing references.
	        //
	        // catch(e) is special because even though e is a variable in its own scope,
	        // we want to make sure that catch(e){let e} is never transformed to
	        // catch(e){var e} (but rather var e$0). For that reason we taint the use of e
	        // in the closest hoist-scope, i.e. where var e$0 belongs.
	        node.$scope.closestHoistScope().markPropagates(identifier.name);
	    }
	}

	function createTopScope(programScope, environments, globals) {
	    function inject(obj) {
	        for (var name in obj) {
	            var writeable = obj[name];
	            var kind = (writeable ? "var" : "const");
	            if (topScope.hasOwn(name)) {
	                topScope.remove(name);
	            }
	            topScope.add(name, kind, {loc: {start: {line: -1}}}, -1);
	        }
	    }

	    var topScope = new Scope({
	        kind: "hoist",
	        node: {},
	        parent: null,
	    });

	    var complementary = {
	        undefined: false,
	        Infinity: false,
	        console: false,
	    };

	    inject(complementary);
	    inject(jshint_vars.reservedVars);
	    inject(jshint_vars.ecmaIdentifiers);
	    if (environments) {
	        environments.forEach(function(env) {
	            if (!jshint_vars[env]) {
	                error(-1, 'environment "{0}" not found', env);
	            } else {
	                inject(jshint_vars[env]);
	            }
	        });
	    }
	    if (globals) {
	        inject(globals);
	    }

	    // link it in
	    programScope.parent = topScope;
	    topScope.children.push(programScope);

	    return topScope;
	}

	function setupReferences(ast, allIdentifiers, opts) {
	    var analyze = (is.own(opts, "analyze") ? opts.analyze : true);

	    function visit(node) {
	        if (!isReference(node)) {
	            return;
	        }
	        allIdentifiers.add(node.name);

	        var scope = node.$scope.lookup(node.name);
	        if (analyze && !scope && options.disallowUnknownReferences) {
	            error(getline(node), "reference to unknown global variable {0}", node.name);
	        }
	        // check const and let for referenced-before-declaration
	        if (analyze && scope && is.someof(scope.getKind(node.name), ["const", "let"])) {
	            var allowedFromPos = scope.getFromPos(node.name);
	            var referencedAtPos = node.range[0];
	            assert(is.finitenumber(allowedFromPos));
	            assert(is.finitenumber(referencedAtPos));
	            if (referencedAtPos < allowedFromPos) {
	                if (!node.$scope.hasFunctionScopeBetween(scope)) {
	                    error(getline(node), "{0} is referenced before its declaration", node.name);
	                }
	            }
	        }
	        node.$refToScope = scope;
	    }

	    traverse(ast, {pre: visit});
	}

	// TODO for loops init and body props are parallel to each other but init scope is outer that of body
	// TODO is this a problem?

	function varify(ast, stats, allIdentifiers, changes) {
	    function unique(name) {
	        assert(allIdentifiers.has(name));
	        for (var cnt = 0; ; cnt++) {
	            var genName = name + "$" + String(cnt);
	            if (!allIdentifiers.has(genName)) {
	                return genName;
	            }
	        }
	    }

	    function renameDeclarations(node) {
	        if (node.type === "VariableDeclaration" && isConstLet(node.kind)) {
	            var hoistScope = node.$scope.closestHoistScope();
	            var origScope = node.$scope;

	            // text change const|let => var
	            changes.push({
	                start: node.range[0],
	                end: node.range[0] + node.kind.length,
	                str: "var",
	            });

	            node.declarations.forEach(function(declarator) {
	                assert(declarator.type === "VariableDeclarator");
	                var name = declarator.id.name;

	                stats.declarator(node.kind);

	                // rename if
	                // 1) name already exists in hoistScope, or
	                // 2) name is already propagated (passed) through hoistScope or manually tainted
	                var rename = (origScope !== hoistScope &&
	                    (hoistScope.hasOwn(name) || hoistScope.doesPropagate(name)));

	                var newName = (rename ? unique(name) : name);

	                origScope.remove(name);
	                hoistScope.add(newName, "var", declarator.id, declarator.range[1]);

	                origScope.moves = origScope.moves || stringmap();
	                origScope.moves.set(name, {
	                    name: newName,
	                    scope: hoistScope,
	                });

	                allIdentifiers.add(newName);

	                if (newName !== name) {
	                    stats.rename(name, newName, getline(declarator));

	                    declarator.id.originalName = name;
	                    declarator.id.name = newName;

	                    // textchange var x => var x$1
	                    changes.push({
	                        start: declarator.id.range[0],
	                        end: declarator.id.range[1],
	                        str: newName,
	                    });
	                }
	            });

	            // ast change const|let => var
	            node.kind = "var";
	        }
	    }

	    function renameReferences(node) {
	        if (!node.$refToScope) {
	            return;
	        }
	        var move = node.$refToScope.moves && node.$refToScope.moves.get(node.name);
	        if (!move) {
	            return;
	        }
	        node.$refToScope = move.scope;

	        if (node.name !== move.name) {
	            node.originalName = node.name;
	            node.name = move.name;

	            if (node.alterop) {
	                // node has no range because it is the result of another alter operation
	                var existingOp = null;
	                for (var i = 0; i < changes.length; i++) {
	                    var op = changes[i];
	                    if (op.node === node) {
	                        existingOp = op;
	                        break;
	                    }
	                }
	                assert(existingOp);

	                // modify op
	                existingOp.str = move.name;
	            } else {
	                changes.push({
	                    start: node.range[0],
	                    end: node.range[1],
	                    str: move.name,
	                });
	            }
	        }
	    }

	    traverse(ast, {pre: renameDeclarations});
	    traverse(ast, {pre: renameReferences});
	    ast.$scope.traverse({pre: function(scope) {
	        delete scope.moves;
	    }});
	}


	function detectLoopClosures(ast) {
	    traverse(ast, {pre: visit});

	    function detectIifyBodyBlockers(body, node) {
	        return breakable(function(brk) {
	            traverse(body, {pre: function(n) {
	                // if we hit an inner function of the loop body, don't traverse further
	                if (isFunction(n)) {
	                    return false;
	                }

	                var err = true; // reset to false in else-statement below
	                var msg = "loop-variable {0} is captured by a loop-closure that can't be transformed due to use of {1} at line {2}";
	                if (n.type === "BreakStatement") {
	                    error(getline(node), msg, node.name, "break", getline(n));
	                } else if (n.type === "ContinueStatement") {
	                    error(getline(node), msg, node.name, "continue", getline(n));
	                } else if (n.type === "ReturnStatement") {
	                    error(getline(node), msg, node.name, "return", getline(n));
	                } else if (n.type === "YieldExpression") {
	                    error(getline(node), msg, node.name, "yield", getline(n));
	                } else if (n.type === "Identifier" && n.name === "arguments") {
	                    error(getline(node), msg, node.name, "arguments", getline(n));
	                } else if (n.type === "VariableDeclaration" && n.kind === "var") {
	                    error(getline(node), msg, node.name, "var", getline(n));
	                } else {
	                    err = false;
	                }
	                if (err) {
	                    brk(true); // break traversal
	                }
	            }});
	            return false;
	        });
	    }

	    function visit(node) {
	        // forbidden pattern:
	        // <any>* <loop> <non-fn>* <constlet-def> <any>* <fn> <any>* <constlet-ref>
	        var loopNode = null;
	        if (isReference(node) && node.$refToScope && isConstLet(node.$refToScope.getKind(node.name))) {
	            // traverse nodes up towards root from constlet-def
	            // if we hit a function (before a loop) - ok!
	            // if we hit a loop - maybe-ouch
	            // if we reach root - ok!
	            for (var n = node.$refToScope.node; ; ) {
	                if (isFunction(n)) {
	                    // we're ok (function-local)
	                    return;
	                } else if (isLoop(n)) {
	                    loopNode = n;
	                    // maybe not ok (between loop and function)
	                    break;
	                }
	                n = n.$parent;
	                if (!n) {
	                    // ok (reached root)
	                    return;
	                }
	            }

	            assert(isLoop(loopNode));

	            // traverse scopes from reference-scope up towards definition-scope
	            // if we hit a function, ouch!
	            var defScope = node.$refToScope;
	            var generateIIFE = (options.loopClosures === "iife");

	            for (var s = node.$scope; s; s = s.parent) {
	                if (s === defScope) {
	                    // we're ok
	                    return;
	                } else if (isFunction(s.node)) {
	                    // not ok (there's a function between the reference and definition)
	                    // may be transformable via IIFE

	                    if (!generateIIFE) {
	                        var msg = "loop-variable {0} is captured by a loop-closure. Tried \"loopClosures\": \"iife\" in defs-config.json?";
	                        return error(getline(node), msg, node.name);
	                    }

	                    // here be dragons
	                    // for (let x = ..; .. ; ..) { (function(){x})() } is forbidden because of current
	                    // spec and VM status
	                    if (loopNode.type === "ForStatement" && defScope.node === loopNode) {
	                        var declarationNode = defScope.getNode(node.name);
	                        return error(getline(declarationNode), "Not yet specced ES6 feature. {0} is declared in for-loop header and then captured in loop closure", declarationNode.name);
	                    }

	                    // speak now or forever hold your peace
	                    if (detectIifyBodyBlockers(loopNode.body, node)) {
	                        // error already generated
	                        return;
	                    }

	                    // mark loop for IIFE-insertion
	                    loopNode.$iify = true;
	                }
	            }
	        }
	    }
	}

	function transformLoopClosures(root, ops, options) {
	    function insertOp(pos, str, node) {
	        var op = {
	            start: pos,
	            end: pos,
	            str: str,
	        }
	        if (node) {
	            op.node = node;
	        }
	        ops.push(op);
	    }

	    traverse(root, {pre: function(node) {
	        if (!node.$iify) {
	            return;
	        }

	        var hasBlock = (node.body.type === "BlockStatement");

	        var insertHead = (hasBlock ?
	            node.body.range[0] + 1 : // just after body {
	            node.body.range[0]); // just before existing expression
	        var insertFoot = (hasBlock ?
	            node.body.range[1] - 1 : // just before body }
	            node.body.range[1]);  // just after existing expression

	        var forInName = (node.type === "ForInStatement" && node.left.declarations[0].id.name);;
	        var iifeHead = fmt("(function({0}){", forInName ? forInName : "");
	        var iifeTail = fmt("}).call(this{0});", forInName ? ", " + forInName : "");

	        // modify AST
	        var iifeFragment = options.parse(iifeHead + iifeTail);
	        var iifeExpressionStatement = iifeFragment.body[0];
	        var iifeBlockStatement = iifeExpressionStatement.expression.callee.object.body;

	        if (hasBlock) {
	            var forBlockStatement = node.body;
	            var tmp = forBlockStatement.body;
	            forBlockStatement.body = [iifeExpressionStatement];
	            iifeBlockStatement.body = tmp;
	        } else {
	            var tmp$0 = node.body;
	            node.body = iifeExpressionStatement;
	            iifeBlockStatement.body[0] = tmp$0;
	        }

	        // create ops
	        insertOp(insertHead, iifeHead);

	        if (forInName) {
	            insertOp(insertFoot, "}).call(this, ");

	            var args = iifeExpressionStatement.expression.arguments;
	            var iifeArgumentIdentifier = args[1];
	            iifeArgumentIdentifier.alterop = true;
	            insertOp(insertFoot, forInName, iifeArgumentIdentifier);

	            insertOp(insertFoot, ");");
	        } else {
	            insertOp(insertFoot, iifeTail);
	        }
	    }});
	}

	function detectConstAssignment(ast) {
	    traverse(ast, {pre: function(node) {
	        if (isLvalue(node)) {
	            var scope = node.$scope.lookup(node.name);
	            if (scope && scope.getKind(node.name) === "const") {
	                error(getline(node), "can't assign to const variable {0}", node.name);
	            }
	        }
	    }});
	}

	function detectConstantLets(ast) {
	    traverse(ast, {pre: function(node) {
	        if (isLvalue(node)) {
	            var scope = node.$scope.lookup(node.name);
	            if (scope) {
	                scope.markWrite(node.name);
	            }
	        }
	    }});

	    ast.$scope.detectUnmodifiedLets();
	}

	function setupScopeAndReferences(root, opts) {
	    // setup scopes
	    traverse(root, {pre: createScopes});
	    var topScope = createTopScope(root.$scope, options.environments, options.globals);

	    // allIdentifiers contains all declared and referenced vars
	    // collect all declaration names (including those in topScope)
	    var allIdentifiers = stringset();
	    topScope.traverse({pre: function(scope) {
	        allIdentifiers.addMany(scope.decls.keys());
	    }});

	    // setup node.$refToScope, check for errors.
	    // also collects all referenced names to allIdentifiers
	    setupReferences(root, allIdentifiers, opts);
	    return allIdentifiers;
	}

	function cleanupTree(root) {
	    traverse(root, {pre: function(node) {
	        for (var prop in node) {
	            if (prop[0] === "$") {
	                delete node[prop];
	            }
	        }
	    }});
	}

	function run(src, config) {
	    // alter the options singleton with user configuration
	    for (var key in config) {
	        options[key] = config[key];
	    }

	    var parsed;

	    if (is.object(src)) {
	        if (!options.ast) {
	            return {
	                errors: [
	                    "Can't produce string output when input is an AST. " +
	                    "Did you forget to set options.ast = true?"
	                ],
	            };
	        }

	        // Received an AST object as src, so no need to parse it.
	        parsed = src;

	    } else if (is.string(src)) {
	        try {
	            parsed = options.parse(src, {
	                loc: true,
	                range: true,
	            });
	        } catch (e) {
	            return {
	                errors: [
	                    fmt("line {0} column {1}: Error during input file parsing\n{2}\n{3}",
	                        e.lineNumber,
	                        e.column,
	                        src.split("\n")[e.lineNumber - 1],
	                        fmt.repeat(" ", e.column - 1) + "^")
	                ],
	            };
	        }

	    } else {
	        return {
	            errors: ["Input was neither an AST object nor a string."],
	        };
	    }

	    var ast = parsed;

	    // TODO detect unused variables (never read)
	    error.reset();

	    var allIdentifiers = setupScopeAndReferences(ast, {});

	    // static analysis passes
	    detectLoopClosures(ast);
	    detectConstAssignment(ast);
	    //detectConstantLets(ast);

	    var changes = [];
	    transformLoopClosures(ast, changes, options);

	    //ast.$scope.print(); process.exit(-1);

	    if (error.errors.length >= 1) {
	        return {
	            errors: error.errors,
	        };
	    }

	    if (changes.length > 0) {
	        cleanupTree(ast);
	        allIdentifiers = setupScopeAndReferences(ast, {analyze: false});
	    }
	    assert(error.errors.length === 0);

	    // change constlet declarations to var, renamed if needed
	    // varify modifies the scopes and AST accordingly and
	    // returns a list of change fragments (to use with alter)
	    var stats = new Stats();
	    varify(ast, stats, allIdentifiers, changes);

	    if (options.ast) {
	        // return the modified AST instead of src code
	        // get rid of all added $ properties first, such as $parent and $scope
	        cleanupTree(ast);
	        return {
	            stats: stats,
	            ast: ast,
	        };
	    } else {
	        // apply changes produced by varify and return the transformed src
	        var transformedSrc = alter(src, changes);
	        return {
	            stats: stats,
	            src: transformedSrc,
	        };
	    }
	}

	module.exports = run;


/***/ },
/* 55 */
/***/ function(module, exports) {

	// simple-is.js
	// MIT licensed, see LICENSE file
	// Copyright (c) 2013 Olov Lassus <olov.lassus@gmail.com>

	var is = (function() {
	    "use strict";

	    var hasOwnProperty = Object.prototype.hasOwnProperty;
	    var toString = Object.prototype.toString;
	    var _undefined = void 0;

	    return {
	        nan: function(v) {
	            return v !== v;
	        },
	        boolean: function(v) {
	            return typeof v === "boolean";
	        },
	        number: function(v) {
	            return typeof v === "number";
	        },
	        string: function(v) {
	            return typeof v === "string";
	        },
	        fn: function(v) {
	            return typeof v === "function";
	        },
	        object: function(v) {
	            return v !== null && typeof v === "object";
	        },
	        primitive: function(v) {
	            var t = typeof v;
	            return v === null || v === _undefined ||
	                t === "boolean" || t === "number" || t === "string";
	        },
	        array: Array.isArray || function(v) {
	            return toString.call(v) === "[object Array]";
	        },
	        finitenumber: function(v) {
	            return typeof v === "number" && isFinite(v);
	        },
	        someof: function(v, values) {
	            return values.indexOf(v) >= 0;
	        },
	        noneof: function(v, values) {
	            return values.indexOf(v) === -1;
	        },
	        own: function(obj, prop) {
	            return hasOwnProperty.call(obj, prop);
	        },
	    };
	})();

	if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
	    module.exports = is;
	}


/***/ },
/* 56 */
/***/ function(module, exports) {

	// simple-fmt.js
	// MIT licensed, see LICENSE file
	// Copyright (c) 2013 Olov Lassus <olov.lassus@gmail.com>

	var fmt = (function() {
	    "use strict";

	    function fmt(str, var_args) {
	        var args = Array.prototype.slice.call(arguments, 1);
	        return str.replace(/\{(\d+)\}/g, function(s, match) {
	            return (match in args ? args[match] : s);
	        });
	    }

	    function obj(str, obj) {
	        return str.replace(/\{([_$a-zA-Z0-9][_$a-zA-Z0-9]*)\}/g, function(s, match) {
	            return (match in obj ? obj[match] : s);
	        });
	    }

	    function repeat(str, n) {
	        return (new Array(n + 1)).join(str);
	    }

	    fmt.fmt = fmt;
	    fmt.obj = obj;
	    fmt.repeat = repeat;
	    return fmt;
	})();

	if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
	    module.exports = fmt;
	}


/***/ },
/* 57 */
/***/ function(module, exports) {

	// stringmap.js
	// MIT licensed, see LICENSE file
	// Copyright (c) 2013 Olov Lassus <olov.lassus@gmail.com>

	var StringMap = (function() {
	    "use strict";

	    // to save us a few characters
	    var hasOwnProperty = Object.prototype.hasOwnProperty;

	    var create = (function() {
	        function hasOwnEnumerableProps(obj) {
	            for (var prop in obj) {
	                if (hasOwnProperty.call(obj, prop)) {
	                    return true;
	                }
	            }
	            return false;
	        }
	        // FF <= 3.6:
	        // o = {}; o.hasOwnProperty("__proto__" or "__count__" or "__parent__") => true
	        // o = {"__proto__": null}; Object.prototype.hasOwnProperty.call(o, "__proto__" or "__count__" or "__parent__") => false
	        function hasOwnPollutedProps(obj) {
	            return hasOwnProperty.call(obj, "__count__") || hasOwnProperty.call(obj, "__parent__");
	        }

	        var useObjectCreate = false;
	        if (typeof Object.create === "function") {
	            if (!hasOwnEnumerableProps(Object.create(null))) {
	                useObjectCreate = true;
	            }
	        }
	        if (useObjectCreate === false) {
	            if (hasOwnEnumerableProps({})) {
	                throw new Error("StringMap environment error 0, please file a bug at https://github.com/olov/stringmap/issues");
	            }
	        }
	        // no throw yet means we can create objects without own enumerable props (safe-guard against VMs and shims)

	        var o = (useObjectCreate ? Object.create(null) : {});
	        var useProtoClear = false;
	        if (hasOwnPollutedProps(o)) {
	            o.__proto__ = null;
	            if (hasOwnEnumerableProps(o) || hasOwnPollutedProps(o)) {
	                throw new Error("StringMap environment error 1, please file a bug at https://github.com/olov/stringmap/issues");
	            }
	            useProtoClear = true;
	        }
	        // no throw yet means we can create objects without own polluted props (safe-guard against VMs and shims)

	        return function() {
	            var o = (useObjectCreate ? Object.create(null) : {});
	            if (useProtoClear) {
	                o.__proto__ = null;
	            }
	            return o;
	        };
	    })();

	    // stringmap ctor
	    function stringmap(optional_object) {
	        // use with or without new
	        if (!(this instanceof stringmap)) {
	            return new stringmap(optional_object);
	        }
	        this.obj = create();
	        this.hasProto = false; // false (no __proto__ key) or true (has __proto__ key)
	        this.proto = undefined; // value for __proto__ key when hasProto is true, undefined otherwise

	        if (optional_object) {
	            this.setMany(optional_object);
	        }
	    };

	    // primitive methods that deals with data representation
	    stringmap.prototype.has = function(key) {
	        // The type-check of key in has, get, set and delete is important because otherwise an object
	        // {toString: function() { return "__proto__"; }} can avoid the key === "__proto__" test.
	        // The alternative to type-checking would be to force string conversion, i.e. key = String(key);
	        if (typeof key !== "string") {
	            throw new Error("StringMap expected string key");
	        }
	        return (key === "__proto__" ?
	            this.hasProto :
	            hasOwnProperty.call(this.obj, key));
	    };

	    stringmap.prototype.get = function(key) {
	        if (typeof key !== "string") {
	            throw new Error("StringMap expected string key");
	        }
	        return (key === "__proto__" ?
	            this.proto :
	            (hasOwnProperty.call(this.obj, key) ? this.obj[key] : undefined));
	    };

	    stringmap.prototype.set = function(key, value) {
	        if (typeof key !== "string") {
	            throw new Error("StringMap expected string key");
	        }
	        if (key === "__proto__") {
	            this.hasProto = true;
	            this.proto = value;
	        } else {
	            this.obj[key] = value;
	        }
	    };

	    stringmap.prototype.remove = function(key) {
	        if (typeof key !== "string") {
	            throw new Error("StringMap expected string key");
	        }
	        var didExist = this.has(key);
	        if (key === "__proto__") {
	            this.hasProto = false;
	            this.proto = undefined;
	        } else {
	            delete this.obj[key];
	        }
	        return didExist;
	    };

	    // alias remove to delete but beware:
	    // sm.delete("key"); // OK in ES5 and later
	    // sm['delete']("key"); // OK in all ES versions
	    // sm.remove("key"); // OK in all ES versions
	    stringmap.prototype['delete'] = stringmap.prototype.remove;

	    stringmap.prototype.isEmpty = function() {
	        for (var key in this.obj) {
	            if (hasOwnProperty.call(this.obj, key)) {
	                return false;
	            }
	        }
	        return !this.hasProto;
	    };

	    stringmap.prototype.size = function() {
	        var len = 0;
	        for (var key in this.obj) {
	            if (hasOwnProperty.call(this.obj, key)) {
	                ++len;
	            }
	        }
	        return (this.hasProto ? len + 1 : len);
	    };

	    stringmap.prototype.keys = function() {
	        var keys = [];
	        for (var key in this.obj) {
	            if (hasOwnProperty.call(this.obj, key)) {
	                keys.push(key);
	            }
	        }
	        if (this.hasProto) {
	            keys.push("__proto__");
	        }
	        return keys;
	    };

	    stringmap.prototype.values = function() {
	        var values = [];
	        for (var key in this.obj) {
	            if (hasOwnProperty.call(this.obj, key)) {
	                values.push(this.obj[key]);
	            }
	        }
	        if (this.hasProto) {
	            values.push(this.proto);
	        }
	        return values;
	    };

	    stringmap.prototype.items = function() {
	        var items = [];
	        for (var key in this.obj) {
	            if (hasOwnProperty.call(this.obj, key)) {
	                items.push([key, this.obj[key]]);
	            }
	        }
	        if (this.hasProto) {
	            items.push(["__proto__", this.proto]);
	        }
	        return items;
	    };


	    // methods that rely on the above primitives
	    stringmap.prototype.setMany = function(object) {
	        if (object === null || (typeof object !== "object" && typeof object !== "function")) {
	            throw new Error("StringMap expected Object");
	        }
	        for (var key in object) {
	            if (hasOwnProperty.call(object, key)) {
	                this.set(key, object[key]);
	            }
	        }
	        return this;
	    };

	    stringmap.prototype.merge = function(other) {
	        var keys = other.keys();
	        for (var i = 0; i < keys.length; i++) {
	            var key = keys[i];
	            this.set(key, other.get(key));
	        }
	        return this;
	    };

	    stringmap.prototype.map = function(fn) {
	        var keys = this.keys();
	        for (var i = 0; i < keys.length; i++) {
	            var key = keys[i];
	            keys[i] = fn(this.get(key), key); // re-use keys array for results
	        }
	        return keys;
	    };

	    stringmap.prototype.forEach = function(fn) {
	        var keys = this.keys();
	        for (var i = 0; i < keys.length; i++) {
	            var key = keys[i];
	            fn(this.get(key), key);
	        }
	    };

	    stringmap.prototype.clone = function() {
	        var other = stringmap();
	        return other.merge(this);
	    };

	    stringmap.prototype.toString = function() {
	        var self = this;
	        return "{" + this.keys().map(function(key) {
	            return JSON.stringify(key) + ":" + JSON.stringify(self.get(key));
	        }).join(",") + "}";
	    };

	    return stringmap;
	})();

	if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
	    module.exports = StringMap;
	}


/***/ },
/* 58 */
/***/ function(module, exports) {

	// stringset.js
	// MIT licensed, see LICENSE file
	// Copyright (c) 2013 Olov Lassus <olov.lassus@gmail.com>

	var StringSet = (function() {
	    "use strict";

	    // to save us a few characters
	    var hasOwnProperty = Object.prototype.hasOwnProperty;

	    var create = (function() {
	        function hasOwnEnumerableProps(obj) {
	            for (var prop in obj) {
	                if (hasOwnProperty.call(obj, prop)) {
	                    return true;
	                }
	            }
	            return false;
	        }

	        // FF <= 3.6:
	        // o = {}; o.hasOwnProperty("__proto__" or "__count__" or "__parent__") => true
	        // o = {"__proto__": null}; Object.prototype.hasOwnProperty.call(o, "__proto__" or "__count__" or "__parent__") => false
	        function hasOwnPollutedProps(obj) {
	            return hasOwnProperty.call(obj, "__count__") || hasOwnProperty.call(obj, "__parent__");
	        }

	        var useObjectCreate = false;
	        if (typeof Object.create === "function") {
	            if (!hasOwnEnumerableProps(Object.create(null))) {
	                useObjectCreate = true;
	            }
	        }
	        if (useObjectCreate === false) {
	            if (hasOwnEnumerableProps({})) {
	                throw new Error("StringSet environment error 0, please file a bug at https://github.com/olov/stringset/issues");
	            }
	        }
	        // no throw yet means we can create objects without own enumerable props (safe-guard against VMs and shims)

	        var o = (useObjectCreate ? Object.create(null) : {});
	        var useProtoClear = false;
	        if (hasOwnPollutedProps(o)) {
	            o.__proto__ = null;
	            if (hasOwnEnumerableProps(o) || hasOwnPollutedProps(o)) {
	                throw new Error("StringSet environment error 1, please file a bug at https://github.com/olov/stringset/issues");
	            }
	            useProtoClear = true;
	        }
	        // no throw yet means we can create objects without own polluted props (safe-guard against VMs and shims)

	        return function() {
	            var o = (useObjectCreate ? Object.create(null) : {});
	            if (useProtoClear) {
	                o.__proto__ = null;
	            }
	            return o;
	        };
	    })();

	    // stringset ctor
	    function stringset(optional_array) {
	        // use with or without new
	        if (!(this instanceof stringset)) {
	            return new stringset(optional_array);
	        }
	        this.obj = create();
	        this.hasProto = false; // false (no __proto__ item) or true (has __proto__ item)

	        if (optional_array) {
	            this.addMany(optional_array);
	        }
	    };

	    // primitive methods that deals with data representation
	    stringset.prototype.has = function(item) {
	        // The type-check of item in has, get, set and delete is important because otherwise an object
	        // {toString: function() { return "__proto__"; }} can avoid the item === "__proto__" test.
	        // The alternative to type-checking would be to force string conversion, i.e. item = String(item);
	        if (typeof item !== "string") {
	            throw new Error("StringSet expected string item");
	        }
	        return (item === "__proto__" ?
	            this.hasProto :
	            hasOwnProperty.call(this.obj, item));
	    };

	    stringset.prototype.add = function(item) {
	        if (typeof item !== "string") {
	            throw new Error("StringSet expected string item");
	        }
	        if (item === "__proto__") {
	            this.hasProto = true;
	        } else {
	            this.obj[item] = true;
	        }
	    };

	    stringset.prototype.remove = function(item) {
	        if (typeof item !== "string") {
	            throw new Error("StringSet expected string item");
	        }
	        var didExist = this.has(item);
	        if (item === "__proto__") {
	            this.hasProto = false;
	        } else {
	            delete this.obj[item];
	        }
	        return didExist;
	    };

	    // alias remove to delete but beware:
	    // ss.delete("key"); // OK in ES5 and later
	    // ss['delete']("key"); // OK in all ES versions
	    // ss.remove("key"); // OK in all ES versions
	    stringset.prototype['delete'] = stringset.prototype.remove;

	    stringset.prototype.isEmpty = function() {
	        for (var item in this.obj) {
	            if (hasOwnProperty.call(this.obj, item)) {
	                return false;
	            }
	        }
	        return !this.hasProto;
	    };

	    stringset.prototype.size = function() {
	        var len = 0;
	        for (var item in this.obj) {
	            if (hasOwnProperty.call(this.obj, item)) {
	                ++len;
	            }
	        }
	        return (this.hasProto ? len + 1 : len);
	    };

	    stringset.prototype.items = function() {
	        var items = [];
	        for (var item in this.obj) {
	            if (hasOwnProperty.call(this.obj, item)) {
	                items.push(item);
	            }
	        }
	        if (this.hasProto) {
	            items.push("__proto__");
	        }
	        return items;
	    };


	    // methods that rely on the above primitives
	    stringset.prototype.addMany = function(items) {
	        if (!Array.isArray(items)) {
	            throw new Error("StringSet expected array");
	        }
	        for (var i = 0; i < items.length; i++) {
	            this.add(items[i]);
	        }
	        return this;
	    };

	    stringset.prototype.merge = function(other) {
	        this.addMany(other.items());
	        return this;
	    };

	    stringset.prototype.clone = function() {
	        var other = stringset();
	        return other.merge(this);
	    };

	    stringset.prototype.toString = function() {
	        return "{" + this.items().map(JSON.stringify).join(",") + "}";
	    };

	    return stringset;
	})();

	if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
	    module.exports = StringSet;
	}


/***/ },
/* 59 */
/***/ function(module, exports, __webpack_require__) {

	// alter.js
	// MIT licensed, see LICENSE file
	// Copyright (c) 2013 Olov Lassus <olov.lassus@gmail.com>

	var assert = __webpack_require__(4);
	var stableSort = __webpack_require__(60);

	// fragments is a list of {start: index, end: index, str: string to replace with}
	function alter(str, fragments) {
	    "use strict";

	    var isArray = Array.isArray || function(v) {
	        return Object.prototype.toString.call(v) === "[object Array]";
	    };;

	    assert(typeof str === "string");
	    assert(isArray(fragments));

	    // stableSort isn't in-place so no need to copy array first
	    var sortedFragments = stableSort(fragments, function(a, b) {
	        return a.start - b.start;
	    });

	    var outs = [];

	    var pos = 0;
	    for (var i = 0; i < sortedFragments.length; i++) {
	        var frag = sortedFragments[i];

	        assert(pos <= frag.start);
	        assert(frag.start <= frag.end);
	        outs.push(str.slice(pos, frag.start));
	        outs.push(frag.str);
	        pos = frag.end;
	    }
	    if (pos < str.length) {
	        outs.push(str.slice(pos));
	    }

	    return outs.join("");
	}

	if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
	    module.exports = alter;
	}


/***/ },
/* 60 */
/***/ function(module, exports, __webpack_require__) {

	//! stable.js 0.1.5, https://github.com/Two-Screen/stable
	//! © 2014 Angry Bytes and contributors. MIT licensed.

	(function() {

	// A stable array sort, because `Array#sort()` is not guaranteed stable.
	// This is an implementation of merge sort, without recursion.

	var stable = function(arr, comp) {
	    return exec(arr.slice(), comp);
	};

	stable.inplace = function(arr, comp) {
	    var result = exec(arr, comp);

	    // This simply copies back if the result isn't in the original array,
	    // which happens on an odd number of passes.
	    if (result !== arr) {
	        pass(result, null, arr.length, arr);
	    }

	    return arr;
	};

	// Execute the sort using the input array and a second buffer as work space.
	// Returns one of those two, containing the final result.
	function exec(arr, comp) {
	    if (typeof(comp) !== 'function') {
	        comp = function(a, b) {
	            return String(a).localeCompare(b);
	        };
	    }

	    // Short-circuit when there's nothing to sort.
	    var len = arr.length;
	    if (len <= 1) {
	        return arr;
	    }

	    // Rather than dividing input, simply iterate chunks of 1, 2, 4, 8, etc.
	    // Chunks are the size of the left or right hand in merge sort.
	    // Stop when the left-hand covers all of the array.
	    var buffer = new Array(len);
	    for (var chk = 1; chk < len; chk *= 2) {
	        pass(arr, comp, chk, buffer);

	        var tmp = arr;
	        arr = buffer;
	        buffer = tmp;
	    }

	    return arr;
	}

	// Run a single pass with the given chunk size.
	var pass = function(arr, comp, chk, result) {
	    var len = arr.length;
	    var i = 0;
	    // Step size / double chunk size.
	    var dbl = chk * 2;
	    // Bounds of the left and right chunks.
	    var l, r, e;
	    // Iterators over the left and right chunk.
	    var li, ri;

	    // Iterate over pairs of chunks.
	    for (l = 0; l < len; l += dbl) {
	        r = l + chk;
	        e = r + chk;
	        if (r > len) r = len;
	        if (e > len) e = len;

	        // Iterate both chunks in parallel.
	        li = l;
	        ri = r;
	        while (true) {
	            // Compare the chunks.
	            if (li < r && ri < e) {
	                // This works for a regular `sort()` compatible comparator,
	                // but also for a simple comparator like: `a > b`
	                if (comp(arr[li], arr[ri]) <= 0) {
	                    result[i++] = arr[li++];
	                }
	                else {
	                    result[i++] = arr[ri++];
	                }
	            }
	            // Nothing to compare, just flush what's left.
	            else if (li < r) {
	                result[i++] = arr[li++];
	            }
	            else if (ri < e) {
	                result[i++] = arr[ri++];
	            }
	            // Both iterators are at the chunk ends.
	            else {
	                break;
	            }
	        }
	    }
	};

	// Export using CommonJS or to the window.
	if (true) {
	    module.exports = stable;
	}
	else {
	    window.stable = stable;
	}

	})();


/***/ },
/* 61 */
/***/ function(module, exports) {

	function traverse(root, options) {
	    "use strict";

	    options = options || {};
	    var pre = options.pre;
	    var post = options.post;
	    var skipProperty = options.skipProperty;

	    function visit(node, parent, prop, idx) {
	        if (!node || typeof node.type !== "string") {
	            return;
	        }

	        var res = undefined;
	        if (pre) {
	            res = pre(node, parent, prop, idx);
	        }

	        if (res !== false) {
	            for (var prop in node) {
	                if (skipProperty ? skipProperty(prop, node) : prop[0] === "$") {
	                    continue;
	                }

	                var child = node[prop];

	                if (Array.isArray(child)) {
	                    for (var i = 0; i < child.length; i++) {
	                        visit(child[i], node, prop, i);
	                    }
	                } else {
	                    visit(child, node, prop);
	                }
	            }
	        }

	        if (post) {
	            post(node, parent, prop, idx);
	        }
	    }

	    visit(root, null);
	};

	if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
	    module.exports = traverse;
	}


/***/ },
/* 62 */
/***/ function(module, exports) {

	// breakable.js
	// MIT licensed, see LICENSE file
	// Copyright (c) 2013 Olov Lassus <olov.lassus@gmail.com>

	var breakable = (function() {
	    "use strict";

	    function Val(val) {
	        this.val = val;
	    }

	    function brk(val) {
	        throw new Val(val);
	    }

	    function breakable(fn) {
	        try {
	            return fn(brk);
	        } catch (e) {
	            if (e instanceof Val) {
	                return e.val;
	            }
	            throw e;
	        }
	    }

	    breakable.fn = function breakablefn(fn) {
	        return breakable.bind(null, fn);
	    };

	    return breakable;
	})();

	if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
	    module.exports = breakable;
	}


/***/ },
/* 63 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";

	var assert = __webpack_require__(4);
	var stringmap = __webpack_require__(57);
	var stringset = __webpack_require__(58);
	var is = __webpack_require__(55);
	var fmt = __webpack_require__(56);
	var error = __webpack_require__(64);
	var options = __webpack_require__(65);

	function Scope(args) {
	    assert(is.someof(args.kind, ["hoist", "block", "catch-block"]));
	    assert(is.object(args.node));
	    assert(args.parent === null || is.object(args.parent));

	    // kind === "hoist": function scopes, program scope, injected globals
	    // kind === "block": ES6 block scopes
	    // kind === "catch-block": catch block scopes
	    this.kind = args.kind;

	    // the AST node the block corresponds to
	    this.node = args.node;

	    // parent scope
	    this.parent = args.parent;

	    // children scopes for easier traversal (populated internally)
	    this.children = [];

	    // scope declarations. decls[variable_name] = {
	    //     kind: "fun" for functions,
	    //           "param" for function parameters,
	    //           "caught" for catch parameter
	    //           "var",
	    //           "const",
	    //           "let"
	    //     node: the AST node the declaration corresponds to
	    //     from: source code index from which it is visible at earliest
	    //           (only stored for "const", "let" [and "var"] nodes)
	    // }
	    this.decls = stringmap();

	    // names of all declarations within this scope that was ever written
	    // TODO move to decls.w?
	    // TODO create corresponding read?
	    this.written = stringset();

	    // names of all variables declared outside this hoist scope but
	    // referenced in this scope (immediately or in child).
	    // only stored on hoist scopes for efficiency
	    // (because we currently generate lots of empty block scopes)
	    this.propagates = (this.kind === "hoist" ? stringset() : null);

	    // scopes register themselves with their parents for easier traversal
	    if (this.parent) {
	        this.parent.children.push(this);
	    }
	}

	Scope.prototype.print = function(indent) {
	    indent = indent || 0;
	    var scope = this;
	    var names = this.decls.keys().map(function(name) {
	        return fmt("{0} [{1}]", name, scope.decls.get(name).kind);
	    }).join(", ");
	    var propagates = this.propagates ? this.propagates.items().join(", ") : "";
	    console.log(fmt("{0}{1}: {2}. propagates: {3}", fmt.repeat(" ", indent), this.node.type, names, propagates));
	    this.children.forEach(function(c) {
	        c.print(indent + 2);
	    });
	};

	Scope.prototype.add = function(name, kind, node, referableFromPos) {
	    assert(is.someof(kind, ["fun", "param", "var", "caught", "const", "let"]));

	    function isConstLet(kind) {
	        return is.someof(kind, ["const", "let"]);
	    }

	    var scope = this;

	    // search nearest hoist-scope for fun, param and var's
	    // const, let and caught variables go directly in the scope (which may be hoist, block or catch-block)
	    if (is.someof(kind, ["fun", "param", "var"])) {
	        while (scope.kind !== "hoist") {
	            if (scope.decls.has(name) && isConstLet(scope.decls.get(name).kind)) { // could be caught
	                return error(node.loc.start.line, "{0} is already declared", name);
	            }
	            scope = scope.parent;
	        }
	    }
	    // name exists in scope and either new or existing kind is const|let => error
	    if (scope.decls.has(name) && (options.disallowDuplicated || isConstLet(scope.decls.get(name).kind) || isConstLet(kind))) {
	        return error(node.loc.start.line, "{0} is already declared", name);
	    }

	    var declaration = {
	        kind: kind,
	        node: node,
	    };
	    if (referableFromPos) {
	        assert(is.someof(kind, ["var", "const", "let"]));
	        declaration.from = referableFromPos;
	    }
	    scope.decls.set(name, declaration);
	};

	Scope.prototype.getKind = function(name) {
	    assert(is.string(name));
	    var decl = this.decls.get(name);
	    return decl ? decl.kind : null;
	};

	Scope.prototype.getNode = function(name) {
	    assert(is.string(name));
	    var decl = this.decls.get(name);
	    return decl ? decl.node : null;
	};

	Scope.prototype.getFromPos = function(name) {
	    assert(is.string(name));
	    var decl = this.decls.get(name);
	    return decl ? decl.from : null;
	};

	Scope.prototype.hasOwn = function(name) {
	    return this.decls.has(name);
	};

	Scope.prototype.remove = function(name) {
	    return this.decls.remove(name);
	};

	Scope.prototype.doesPropagate = function(name) {
	    return this.propagates.has(name);
	};

	Scope.prototype.markPropagates = function(name) {
	    this.propagates.add(name);
	};

	Scope.prototype.closestHoistScope = function() {
	    var scope = this;
	    while (scope.kind !== "hoist") {
	        scope = scope.parent;
	    }
	    return scope;
	};

	Scope.prototype.hasFunctionScopeBetween = function(outer) {
	    function isFunction(node) {
	        return is.someof(node.type, ["FunctionDeclaration", "FunctionExpression"]);
	    }

	    for (var scope = this; scope; scope = scope.parent) {
	        if (scope === outer) {
	            return false;
	        }
	        if (isFunction(scope.node)) {
	            return true;
	        }
	    }

	    throw new Error("wasn't inner scope of outer");
	};

	Scope.prototype.lookup = function(name) {
	    for (var scope = this; scope; scope = scope.parent) {
	        if (scope.decls.has(name)) {
	            return scope;
	        } else if (scope.kind === "hoist") {
	            scope.propagates.add(name);
	        }
	    }
	    return null;
	};

	Scope.prototype.markWrite = function(name) {
	    assert(is.string(name));
	    this.written.add(name);
	};

	// detects let variables that are never modified (ignores top-level)
	Scope.prototype.detectUnmodifiedLets = function() {
	    var outmost = this;

	    function detect(scope) {
	        if (scope !== outmost) {
	            scope.decls.keys().forEach(function(name) {
	                if (scope.getKind(name) === "let" && !scope.written.has(name)) {
	                    return error(scope.getNode(name).loc.start.line, "{0} is declared as let but never modified so could be const", name);
	                }
	            });
	        }

	        scope.children.forEach(function(childScope) {
	            detect(childScope);;
	        });
	    }
	    detect(this);
	};

	Scope.prototype.traverse = function(options) {
	    options = options || {};
	    var pre = options.pre;
	    var post = options.post;

	    function visit(scope) {
	        if (pre) {
	            pre(scope);
	        }
	        scope.children.forEach(function(childScope) {
	            visit(childScope);
	        });
	        if (post) {
	            post(scope);
	        }
	    }

	    visit(this);
	};

	module.exports = Scope;


/***/ },
/* 64 */
/***/ function(module, exports, __webpack_require__) {

	"use strict";

	var fmt = __webpack_require__(56);
	var assert = __webpack_require__(4);

	function error(line, var_args) {
	    assert(arguments.length >= 2);

	    var msg = (arguments.length === 2 ?
	        String(var_args) : fmt.apply(fmt, Array.prototype.slice.call(arguments, 1)));

	    error.errors.push(line === -1 ? msg : fmt("line {0}: {1}", line, msg));
	}

	error.reset = function() {
	    error.errors = [];
	};

	error.reset();

	module.exports = error;


/***/ },
/* 65 */
/***/ function(module, exports, __webpack_require__) {

	// default configuration

	module.exports = {
	    disallowVars: false,
	    disallowDuplicated: true,
	    disallowUnknownReferences: true,
	    parse: __webpack_require__(66).parse,
	};


/***/ },
/* 66 */
/***/ function(module, exports, __webpack_require__) {

	var __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;/*
	  Copyright (C) 2012 Ariya Hidayat <ariya.hidayat@gmail.com>
	  Copyright (C) 2012 Mathias Bynens <mathias@qiwi.be>
	  Copyright (C) 2012 Joost-Wim Boekesteijn <joost-wim@boekesteijn.nl>
	  Copyright (C) 2012 Kris Kowal <kris.kowal@cixar.com>
	  Copyright (C) 2012 Yusuke Suzuki <utatane.tea@gmail.com>
	  Copyright (C) 2012 Arpad Borsos <arpad.borsos@googlemail.com>
	  Copyright (C) 2011 Ariya Hidayat <ariya.hidayat@gmail.com>

	  Redistribution and use in source and binary forms, with or without
	  modification, are permitted provided that the following conditions are met:

	    * Redistributions of source code must retain the above copyright
	      notice, this list of conditions and the following disclaimer.
	    * Redistributions in binary form must reproduce the above copyright
	      notice, this list of conditions and the following disclaimer in the
	      documentation and/or other materials provided with the distribution.

	  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
	  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
	  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
	  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
	  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
	  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
	  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
	  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
	  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
	  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
	*/

	/*jslint bitwise:true plusplus:true */
	/*global esprima:true, define:true, exports:true, window: true,
	throwError: true, createLiteral: true, generateStatement: true,
	parseAssignmentExpression: true, parseBlock: true, parseExpression: true,
	parseFunctionDeclaration: true, parseFunctionExpression: true,
	parseFunctionSourceElements: true, parseVariableIdentifier: true,
	parseLeftHandSideExpression: true,
	parseStatement: true, parseSourceElement: true */

	(function (root, factory) {
	    'use strict';

	    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js,
	    // Rhino, and plain browser loading.
	    if (true) {
	        !(__WEBPACK_AMD_DEFINE_ARRAY__ = [exports], __WEBPACK_AMD_DEFINE_FACTORY__ = (factory), __WEBPACK_AMD_DEFINE_RESULT__ = (typeof __WEBPACK_AMD_DEFINE_FACTORY__ === 'function' ? (__WEBPACK_AMD_DEFINE_FACTORY__.apply(exports, __WEBPACK_AMD_DEFINE_ARRAY__)) : __WEBPACK_AMD_DEFINE_FACTORY__), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));
	    } else if (typeof exports !== 'undefined') {
	        factory(exports);
	    } else {
	        factory((root.esprima = {}));
	    }
	}(this, function (exports) {
	    'use strict';

	    var Token,
	        TokenName,
	        Syntax,
	        PropertyKind,
	        Messages,
	        Regex,
	        source,
	        strict,
	        index,
	        lineNumber,
	        lineStart,
	        length,
	        buffer,
	        state,
	        extra;

	    Token = {
	        BooleanLiteral: 1,
	        EOF: 2,
	        Identifier: 3,
	        Keyword: 4,
	        NullLiteral: 5,
	        NumericLiteral: 6,
	        Punctuator: 7,
	        StringLiteral: 8
	    };

	    TokenName = {};
	    TokenName[Token.BooleanLiteral] = 'Boolean';
	    TokenName[Token.EOF] = '<end>';
	    TokenName[Token.Identifier] = 'Identifier';
	    TokenName[Token.Keyword] = 'Keyword';
	    TokenName[Token.NullLiteral] = 'Null';
	    TokenName[Token.NumericLiteral] = 'Numeric';
	    TokenName[Token.Punctuator] = 'Punctuator';
	    TokenName[Token.StringLiteral] = 'String';

	    Syntax = {
	        AssignmentExpression: 'AssignmentExpression',
	        ArrayExpression: 'ArrayExpression',
	        BlockStatement: 'BlockStatement',
	        BinaryExpression: 'BinaryExpression',
	        BreakStatement: 'BreakStatement',
	        CallExpression: 'CallExpression',
	        CatchClause: 'CatchClause',
	        ConditionalExpression: 'ConditionalExpression',
	        ContinueStatement: 'ContinueStatement',
	        DoWhileStatement: 'DoWhileStatement',
	        DebuggerStatement: 'DebuggerStatement',
	        EmptyStatement: 'EmptyStatement',
	        ExpressionStatement: 'ExpressionStatement',
	        ForStatement: 'ForStatement',
	        ForInStatement: 'ForInStatement',
	        FunctionDeclaration: 'FunctionDeclaration',
	        FunctionExpression: 'FunctionExpression',
	        Identifier: 'Identifier',
	        IfStatement: 'IfStatement',
	        Literal: 'Literal',
	        LabeledStatement: 'LabeledStatement',
	        LogicalExpression: 'LogicalExpression',
	        MemberExpression: 'MemberExpression',
	        NewExpression: 'NewExpression',
	        ObjectExpression: 'ObjectExpression',
	        Program: 'Program',
	        Property: 'Property',
	        ReturnStatement: 'ReturnStatement',
	        SequenceExpression: 'SequenceExpression',
	        SwitchStatement: 'SwitchStatement',
	        SwitchCase: 'SwitchCase',
	        ThisExpression: 'ThisExpression',
	        ThrowStatement: 'ThrowStatement',
	        TryStatement: 'TryStatement',
	        UnaryExpression: 'UnaryExpression',
	        UpdateExpression: 'UpdateExpression',
	        VariableDeclaration: 'VariableDeclaration',
	        VariableDeclarator: 'VariableDeclarator',
	        WhileStatement: 'WhileStatement',
	        WithStatement: 'WithStatement'
	    };

	    PropertyKind = {
	        Data: 1,
	        Get: 2,
	        Set: 4
	    };

	    // Error messages should be identical to V8.
	    Messages = {
	        UnexpectedToken:  'Unexpected token %0',
	        UnexpectedNumber:  'Unexpected number',
	        UnexpectedString:  'Unexpected string',
	        UnexpectedIdentifier:  'Unexpected identifier',
	        UnexpectedReserved:  'Unexpected reserved word',
	        UnexpectedEOS:  'Unexpected end of input',
	        NewlineAfterThrow:  'Illegal newline after throw',
	        InvalidRegExp: 'Invalid regular expression',
	        UnterminatedRegExp:  'Invalid regular expression: missing /',
	        InvalidLHSInAssignment:  'Invalid left-hand side in assignment',
	        InvalidLHSInForIn:  'Invalid left-hand side in for-in',
	        MultipleDefaultsInSwitch: 'More than one default clause in switch statement',
	        NoCatchOrFinally:  'Missing catch or finally after try',
	        UnknownLabel: 'Undefined label \'%0\'',
	        Redeclaration: '%0 \'%1\' has already been declared',
	        IllegalContinue: 'Illegal continue statement',
	        IllegalBreak: 'Illegal break statement',
	        IllegalReturn: 'Illegal return statement',
	        StrictModeWith:  'Strict mode code may not include a with statement',
	        StrictCatchVariable:  'Catch variable may not be eval or arguments in strict mode',
	        StrictVarName:  'Variable name may not be eval or arguments in strict mode',
	        StrictParamName:  'Parameter name eval or arguments is not allowed in strict mode',
	        StrictParamDupe: 'Strict mode function may not have duplicate parameter names',
	        StrictFunctionName:  'Function name may not be eval or arguments in strict mode',
	        StrictOctalLiteral:  'Octal literals are not allowed in strict mode.',
	        StrictDelete:  'Delete of an unqualified identifier in strict mode.',
	        StrictDuplicateProperty:  'Duplicate data property in object literal not allowed in strict mode',
	        AccessorDataProperty:  'Object literal may not have data and accessor property with the same name',
	        AccessorGetSet:  'Object literal may not have multiple get/set accessors with the same name',
	        StrictLHSAssignment:  'Assignment to eval or arguments is not allowed in strict mode',
	        StrictLHSPostfix:  'Postfix increment/decrement may not have eval or arguments operand in strict mode',
	        StrictLHSPrefix:  'Prefix increment/decrement may not have eval or arguments operand in strict mode',
	        StrictReservedWord:  'Use of future reserved word in strict mode'
	    };

	    // See also tools/generate-unicode-regex.py.
	    Regex = {
	        NonAsciiIdentifierStart: new RegExp('[\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-\u037d\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u048a-\u0527\u0531-\u0556\u0559\u0561-\u0587\u05d0-\u05ea\u05f0-\u05f2\u0620-\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-\u0815\u081a\u0824\u0828\u0840-\u0858\u08a0\u08a2-\u08ac\u0904-\u0939\u093d\u0950\u0958-\u0961\u0971-\u0977\u0979-\u097f\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c33\u0c35-\u0c39\u0c3d\u0c58\u0c59\u0c60\u0c61\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cde\u0ce0\u0ce1\u0cf1\u0cf2\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d60\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb0\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f4\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f0\u1700-\u170c\u170e-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3\u17d7\u17dc\u1820-\u1877\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191c\u1950-\u196d\u1970-\u1974\u1980-\u19ab\u19c1-\u19c7\u1a00-\u1a16\u1a20-\u1a54\u1aa7\u1b05-\u1b33\u1b45-\u1b4b\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23\u1c4d-\u1c4f\u1c5a-\u1c7d\u1ce9-\u1cec\u1cee-\u1cf1\u1cf5\u1cf6\u1d00-\u1dbf\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2119-\u211d\u2124\u2126\u2128\u212a-\u212d\u212f-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u2e2f\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303c\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-\u9fcc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-\ua66e\ua67f-\ua697\ua6a0-\ua6ef\ua717-\ua71f\ua722-\ua788\ua78b-\ua78e\ua790-\ua793\ua7a0-\ua7aa\ua7f8-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-\ua8b3\ua8f2-\ua8f7\ua8fb\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-\ua9b2\ua9cf\uaa00-\uaa28\uaa40-\uaa42\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa80-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uabc0-\uabe2\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc]'),
	        NonAsciiIdentifierPart: new RegExp('[\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0300-\u0374\u0376\u0377\u037a-\u037d\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u0483-\u0487\u048a-\u0527\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u05d0-\u05ea\u05f0-\u05f2\u0610-\u061a\u0620-\u0669\u066e-\u06d3\u06d5-\u06dc\u06df-\u06e8\u06ea-\u06fc\u06ff\u0710-\u074a\u074d-\u07b1\u07c0-\u07f5\u07fa\u0800-\u082d\u0840-\u085b\u08a0\u08a2-\u08ac\u08e4-\u08fe\u0900-\u0963\u0966-\u096f\u0971-\u0977\u0979-\u097f\u0981-\u0983\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bc-\u09c4\u09c7\u09c8\u09cb-\u09ce\u09d7\u09dc\u09dd\u09df-\u09e3\u09e6-\u09f1\u0a01-\u0a03\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a3c\u0a3e-\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a59-\u0a5c\u0a5e\u0a66-\u0a75\u0a81-\u0a83\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abc-\u0ac5\u0ac7-\u0ac9\u0acb-\u0acd\u0ad0\u0ae0-\u0ae3\u0ae6-\u0aef\u0b01-\u0b03\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3c-\u0b44\u0b47\u0b48\u0b4b-\u0b4d\u0b56\u0b57\u0b5c\u0b5d\u0b5f-\u0b63\u0b66-\u0b6f\u0b71\u0b82\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bbe-\u0bc2\u0bc6-\u0bc8\u0bca-\u0bcd\u0bd0\u0bd7\u0be6-\u0bef\u0c01-\u0c03\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c33\u0c35-\u0c39\u0c3d-\u0c44\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c58\u0c59\u0c60-\u0c63\u0c66-\u0c6f\u0c82\u0c83\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbc-\u0cc4\u0cc6-\u0cc8\u0cca-\u0ccd\u0cd5\u0cd6\u0cde\u0ce0-\u0ce3\u0ce6-\u0cef\u0cf1\u0cf2\u0d02\u0d03\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d-\u0d44\u0d46-\u0d48\u0d4a-\u0d4e\u0d57\u0d60-\u0d63\u0d66-\u0d6f\u0d7a-\u0d7f\u0d82\u0d83\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0dca\u0dcf-\u0dd4\u0dd6\u0dd8-\u0ddf\u0df2\u0df3\u0e01-\u0e3a\u0e40-\u0e4e\u0e50-\u0e59\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb9\u0ebb-\u0ebd\u0ec0-\u0ec4\u0ec6\u0ec8-\u0ecd\u0ed0-\u0ed9\u0edc-\u0edf\u0f00\u0f18\u0f19\u0f20-\u0f29\u0f35\u0f37\u0f39\u0f3e-\u0f47\u0f49-\u0f6c\u0f71-\u0f84\u0f86-\u0f97\u0f99-\u0fbc\u0fc6\u1000-\u1049\u1050-\u109d\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u135d-\u135f\u1380-\u138f\u13a0-\u13f4\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f0\u1700-\u170c\u170e-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176c\u176e-\u1770\u1772\u1773\u1780-\u17d3\u17d7\u17dc\u17dd\u17e0-\u17e9\u180b-\u180d\u1810-\u1819\u1820-\u1877\u1880-\u18aa\u18b0-\u18f5\u1900-\u191c\u1920-\u192b\u1930-\u193b\u1946-\u196d\u1970-\u1974\u1980-\u19ab\u19b0-\u19c9\u19d0-\u19d9\u1a00-\u1a1b\u1a20-\u1a5e\u1a60-\u1a7c\u1a7f-\u1a89\u1a90-\u1a99\u1aa7\u1b00-\u1b4b\u1b50-\u1b59\u1b6b-\u1b73\u1b80-\u1bf3\u1c00-\u1c37\u1c40-\u1c49\u1c4d-\u1c7d\u1cd0-\u1cd2\u1cd4-\u1cf6\u1d00-\u1de6\u1dfc-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u200c\u200d\u203f\u2040\u2054\u2071\u207f\u2090-\u209c\u20d0-\u20dc\u20e1\u20e5-\u20f0\u2102\u2107\u210a-\u2113\u2115\u2119-\u211d\u2124\u2126\u2128\u212a-\u212d\u212f-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d7f-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u2de0-\u2dff\u2e2f\u3005-\u3007\u3021-\u302f\u3031-\u3035\u3038-\u303c\u3041-\u3096\u3099\u309a\u309d-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-\u9fcc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua62b\ua640-\ua66f\ua674-\ua67d\ua67f-\ua697\ua69f-\ua6f1\ua717-\ua71f\ua722-\ua788\ua78b-\ua78e\ua790-\ua793\ua7a0-\ua7aa\ua7f8-\ua827\ua840-\ua873\ua880-\ua8c4\ua8d0-\ua8d9\ua8e0-\ua8f7\ua8fb\ua900-\ua92d\ua930-\ua953\ua960-\ua97c\ua980-\ua9c0\ua9cf-\ua9d9\uaa00-\uaa36\uaa40-\uaa4d\uaa50-\uaa59\uaa60-\uaa76\uaa7a\uaa7b\uaa80-\uaac2\uaadb-\uaadd\uaae0-\uaaef\uaaf2-\uaaf6\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uabc0-\uabea\uabec\uabed\uabf0-\uabf9\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe00-\ufe0f\ufe20-\ufe26\ufe33\ufe34\ufe4d-\ufe4f\ufe70-\ufe74\ufe76-\ufefc\uff10-\uff19\uff21-\uff3a\uff3f\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc]')
	    };

	    // Ensure the condition is true, otherwise throw an error.
	    // This is only to have a better contract semantic, i.e. another safety net
	    // to catch a logic error. The condition shall be fulfilled in normal case.
	    // Do NOT use this to enforce a certain condition on any user input.

	    function assert(condition, message) {
	        if (!condition) {
	            throw new Error('ASSERT: ' + message);
	        }
	    }

	    function sliceSource(from, to) {
	        return source.slice(from, to);
	    }

	    if (typeof 'esprima'[0] === 'undefined') {
	        sliceSource = function sliceArraySource(from, to) {
	            return source.slice(from, to).join('');
	        };
	    }

	    function isDecimalDigit(ch) {
	        return '0123456789'.indexOf(ch) >= 0;
	    }

	    function isHexDigit(ch) {
	        return '0123456789abcdefABCDEF'.indexOf(ch) >= 0;
	    }

	    function isOctalDigit(ch) {
	        return '01234567'.indexOf(ch) >= 0;
	    }


	    // 7.2 White Space

	    function isWhiteSpace(ch) {
	        return (ch === ' ') || (ch === '\u0009') || (ch === '\u000B') ||
	            (ch === '\u000C') || (ch === '\u00A0') ||
	            (ch.charCodeAt(0) >= 0x1680 &&
	             '\u1680\u180E\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\uFEFF'.indexOf(ch) >= 0);
	    }

	    // 7.3 Line Terminators

	    function isLineTerminator(ch) {
	        return (ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029');
	    }

	    // 7.6 Identifier Names and Identifiers

	    function isIdentifierStart(ch) {
	        return (ch === '$') || (ch === '_') || (ch === '\\') ||
	            (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
	            ((ch.charCodeAt(0) >= 0x80) && Regex.NonAsciiIdentifierStart.test(ch));
	    }

	    function isIdentifierPart(ch) {
	        return (ch === '$') || (ch === '_') || (ch === '\\') ||
	            (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
	            ((ch >= '0') && (ch <= '9')) ||
	            ((ch.charCodeAt(0) >= 0x80) && Regex.NonAsciiIdentifierPart.test(ch));
	    }

	    // 7.6.1.2 Future Reserved Words

	    function isFutureReservedWord(id) {
	        switch (id) {

	        // Future reserved words.
	        case 'class':
	        case 'enum':
	        case 'export':
	        case 'extends':
	        case 'import':
	        case 'super':
	            return true;
	        }

	        return false;
	    }

	    function isStrictModeReservedWord(id) {
	        switch (id) {

	        // Strict Mode reserved words.
	        case 'implements':
	        case 'interface':
	        case 'package':
	        case 'private':
	        case 'protected':
	        case 'public':
	        case 'static':
	        case 'yield':
	        case 'let':
	            return true;
	        }

	        return false;
	    }

	    function isRestrictedWord(id) {
	        return id === 'eval' || id === 'arguments';
	    }

	    // 7.6.1.1 Keywords

	    function isKeyword(id) {
	        var keyword = false;
	        switch (id.length) {
	        case 2:
	            keyword = (id === 'if') || (id === 'in') || (id === 'do');
	            break;
	        case 3:
	            keyword = (id === 'var') || (id === 'for') || (id === 'new') || (id === 'try');
	            break;
	        case 4:
	            keyword = (id === 'this') || (id === 'else') || (id === 'case') || (id === 'void') || (id === 'with');
	            break;
	        case 5:
	            keyword = (id === 'while') || (id === 'break') || (id === 'catch') || (id === 'throw');
	            break;
	        case 6:
	            keyword = (id === 'return') || (id === 'typeof') || (id === 'delete') || (id === 'switch');
	            break;
	        case 7:
	            keyword = (id === 'default') || (id === 'finally');
	            break;
	        case 8:
	            keyword = (id === 'function') || (id === 'continue') || (id === 'debugger');
	            break;
	        case 10:
	            keyword = (id === 'instanceof');
	            break;
	        }

	        if (keyword) {
	            return true;
	        }

	        switch (id) {
	        // Future reserved words.
	        // 'const' is specialized as Keyword in V8.
	        case 'const':
	            return true;

	        // For compatiblity to SpiderMonkey and ES.next
	        case 'yield':
	        case 'let':
	            return true;
	        }

	        if (strict && isStrictModeReservedWord(id)) {
	            return true;
	        }

	        return isFutureReservedWord(id);
	    }

	    // 7.4 Comments

	    function skipComment() {
	        var ch, blockComment, lineComment;

	        blockComment = false;
	        lineComment = false;

	        while (index < length) {
	            ch = source[index];

	            if (lineComment) {
	                ch = source[index++];
	                if (isLineTerminator(ch)) {
	                    lineComment = false;
	                    if (ch === '\r' && source[index] === '\n') {
	                        ++index;
	                    }
	                    ++lineNumber;
	                    lineStart = index;
	                }
	            } else if (blockComment) {
	                if (isLineTerminator(ch)) {
	                    if (ch === '\r' && source[index + 1] === '\n') {
	                        ++index;
	                    }
	                    ++lineNumber;
	                    ++index;
	                    lineStart = index;
	                    if (index >= length) {
	                        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	                    }
	                } else {
	                    ch = source[index++];
	                    if (index >= length) {
	                        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	                    }
	                    if (ch === '*') {
	                        ch = source[index];
	                        if (ch === '/') {
	                            ++index;
	                            blockComment = false;
	                        }
	                    }
	                }
	            } else if (ch === '/') {
	                ch = source[index + 1];
	                if (ch === '/') {
	                    index += 2;
	                    lineComment = true;
	                } else if (ch === '*') {
	                    index += 2;
	                    blockComment = true;
	                    if (index >= length) {
	                        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	                    }
	                } else {
	                    break;
	                }
	            } else if (isWhiteSpace(ch)) {
	                ++index;
	            } else if (isLineTerminator(ch)) {
	                ++index;
	                if (ch ===  '\r' && source[index] === '\n') {
	                    ++index;
	                }
	                ++lineNumber;
	                lineStart = index;
	            } else {
	                break;
	            }
	        }
	    }

	    function scanHexEscape(prefix) {
	        var i, len, ch, code = 0;

	        len = (prefix === 'u') ? 4 : 2;
	        for (i = 0; i < len; ++i) {
	            if (index < length && isHexDigit(source[index])) {
	                ch = source[index++];
	                code = code * 16 + '0123456789abcdef'.indexOf(ch.toLowerCase());
	            } else {
	                return '';
	            }
	        }
	        return String.fromCharCode(code);
	    }

	    function scanIdentifier() {
	        var ch, start, id, restore;

	        ch = source[index];
	        if (!isIdentifierStart(ch)) {
	            return;
	        }

	        start = index;
	        if (ch === '\\') {
	            ++index;
	            if (source[index] !== 'u') {
	                return;
	            }
	            ++index;
	            restore = index;
	            ch = scanHexEscape('u');
	            if (ch) {
	                if (ch === '\\' || !isIdentifierStart(ch)) {
	                    return;
	                }
	                id = ch;
	            } else {
	                index = restore;
	                id = 'u';
	            }
	        } else {
	            id = source[index++];
	        }

	        while (index < length) {
	            ch = source[index];
	            if (!isIdentifierPart(ch)) {
	                break;
	            }
	            if (ch === '\\') {
	                ++index;
	                if (source[index] !== 'u') {
	                    return;
	                }
	                ++index;
	                restore = index;
	                ch = scanHexEscape('u');
	                if (ch) {
	                    if (ch === '\\' || !isIdentifierPart(ch)) {
	                        return;
	                    }
	                    id += ch;
	                } else {
	                    index = restore;
	                    id += 'u';
	                }
	            } else {
	                id += source[index++];
	            }
	        }

	        // There is no keyword or literal with only one character.
	        // Thus, it must be an identifier.
	        if (id.length === 1) {
	            return {
	                type: Token.Identifier,
	                value: id,
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        if (isKeyword(id)) {
	            return {
	                type: Token.Keyword,
	                value: id,
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        // 7.8.1 Null Literals

	        if (id === 'null') {
	            return {
	                type: Token.NullLiteral,
	                value: id,
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        // 7.8.2 Boolean Literals

	        if (id === 'true' || id === 'false') {
	            return {
	                type: Token.BooleanLiteral,
	                value: id,
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        return {
	            type: Token.Identifier,
	            value: id,
	            lineNumber: lineNumber,
	            lineStart: lineStart,
	            range: [start, index]
	        };
	    }

	    // 7.7 Punctuators

	    function scanPunctuator() {
	        var start = index,
	            ch1 = source[index],
	            ch2,
	            ch3,
	            ch4;

	        // Check for most common single-character punctuators.

	        if (ch1 === ';' || ch1 === '{' || ch1 === '}') {
	            ++index;
	            return {
	                type: Token.Punctuator,
	                value: ch1,
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        if (ch1 === ',' || ch1 === '(' || ch1 === ')') {
	            ++index;
	            return {
	                type: Token.Punctuator,
	                value: ch1,
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        // Dot (.) can also start a floating-point number, hence the need
	        // to check the next character.

	        ch2 = source[index + 1];
	        if (ch1 === '.' && !isDecimalDigit(ch2)) {
	            return {
	                type: Token.Punctuator,
	                value: source[index++],
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        // Peek more characters.

	        ch3 = source[index + 2];
	        ch4 = source[index + 3];

	        // 4-character punctuator: >>>=

	        if (ch1 === '>' && ch2 === '>' && ch3 === '>') {
	            if (ch4 === '=') {
	                index += 4;
	                return {
	                    type: Token.Punctuator,
	                    value: '>>>=',
	                    lineNumber: lineNumber,
	                    lineStart: lineStart,
	                    range: [start, index]
	                };
	            }
	        }

	        // 3-character punctuators: === !== >>> <<= >>=

	        if (ch1 === '=' && ch2 === '=' && ch3 === '=') {
	            index += 3;
	            return {
	                type: Token.Punctuator,
	                value: '===',
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        if (ch1 === '!' && ch2 === '=' && ch3 === '=') {
	            index += 3;
	            return {
	                type: Token.Punctuator,
	                value: '!==',
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        if (ch1 === '>' && ch2 === '>' && ch3 === '>') {
	            index += 3;
	            return {
	                type: Token.Punctuator,
	                value: '>>>',
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        if (ch1 === '<' && ch2 === '<' && ch3 === '=') {
	            index += 3;
	            return {
	                type: Token.Punctuator,
	                value: '<<=',
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        if (ch1 === '>' && ch2 === '>' && ch3 === '=') {
	            index += 3;
	            return {
	                type: Token.Punctuator,
	                value: '>>=',
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }

	        // 2-character punctuators: <= >= == != ++ -- << >> && ||
	        // += -= *= %= &= |= ^= /=

	        if (ch2 === '=') {
	            if ('<>=!+-*%&|^/'.indexOf(ch1) >= 0) {
	                index += 2;
	                return {
	                    type: Token.Punctuator,
	                    value: ch1 + ch2,
	                    lineNumber: lineNumber,
	                    lineStart: lineStart,
	                    range: [start, index]
	                };
	            }
	        }

	        if (ch1 === ch2 && ('+-<>&|'.indexOf(ch1) >= 0)) {
	            if ('+-<>&|'.indexOf(ch2) >= 0) {
	                index += 2;
	                return {
	                    type: Token.Punctuator,
	                    value: ch1 + ch2,
	                    lineNumber: lineNumber,
	                    lineStart: lineStart,
	                    range: [start, index]
	                };
	            }
	        }

	        // The remaining 1-character punctuators.

	        if ('[]<>+-*%&|^!~?:=/'.indexOf(ch1) >= 0) {
	            return {
	                type: Token.Punctuator,
	                value: source[index++],
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [start, index]
	            };
	        }
	    }

	    // 7.8.3 Numeric Literals

	    function scanNumericLiteral() {
	        var number, start, ch;

	        ch = source[index];
	        assert(isDecimalDigit(ch) || (ch === '.'),
	            'Numeric literal must start with a decimal digit or a decimal point');

	        start = index;
	        number = '';
	        if (ch !== '.') {
	            number = source[index++];
	            ch = source[index];

	            // Hex number starts with '0x'.
	            // Octal number starts with '0'.
	            if (number === '0') {
	                if (ch === 'x' || ch === 'X') {
	                    number += source[index++];
	                    while (index < length) {
	                        ch = source[index];
	                        if (!isHexDigit(ch)) {
	                            break;
	                        }
	                        number += source[index++];
	                    }

	                    if (number.length <= 2) {
	                        // only 0x
	                        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	                    }

	                    if (index < length) {
	                        ch = source[index];
	                        if (isIdentifierStart(ch)) {
	                            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	                        }
	                    }
	                    return {
	                        type: Token.NumericLiteral,
	                        value: parseInt(number, 16),
	                        lineNumber: lineNumber,
	                        lineStart: lineStart,
	                        range: [start, index]
	                    };
	                } else if (isOctalDigit(ch)) {
	                    number += source[index++];
	                    while (index < length) {
	                        ch = source[index];
	                        if (!isOctalDigit(ch)) {
	                            break;
	                        }
	                        number += source[index++];
	                    }

	                    if (index < length) {
	                        ch = source[index];
	                        if (isIdentifierStart(ch) || isDecimalDigit(ch)) {
	                            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	                        }
	                    }
	                    return {
	                        type: Token.NumericLiteral,
	                        value: parseInt(number, 8),
	                        octal: true,
	                        lineNumber: lineNumber,
	                        lineStart: lineStart,
	                        range: [start, index]
	                    };
	                }

	                // decimal number starts with '0' such as '09' is illegal.
	                if (isDecimalDigit(ch)) {
	                    throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	                }
	            }

	            while (index < length) {
	                ch = source[index];
	                if (!isDecimalDigit(ch)) {
	                    break;
	                }
	                number += source[index++];
	            }
	        }

	        if (ch === '.') {
	            number += source[index++];
	            while (index < length) {
	                ch = source[index];
	                if (!isDecimalDigit(ch)) {
	                    break;
	                }
	                number += source[index++];
	            }
	        }

	        if (ch === 'e' || ch === 'E') {
	            number += source[index++];

	            ch = source[index];
	            if (ch === '+' || ch === '-') {
	                number += source[index++];
	            }

	            ch = source[index];
	            if (isDecimalDigit(ch)) {
	                number += source[index++];
	                while (index < length) {
	                    ch = source[index];
	                    if (!isDecimalDigit(ch)) {
	                        break;
	                    }
	                    number += source[index++];
	                }
	            } else {
	                ch = 'character ' + ch;
	                if (index >= length) {
	                    ch = '<end>';
	                }
	                throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	            }
	        }

	        if (index < length) {
	            ch = source[index];
	            if (isIdentifierStart(ch)) {
	                throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	            }
	        }

	        return {
	            type: Token.NumericLiteral,
	            value: parseFloat(number),
	            lineNumber: lineNumber,
	            lineStart: lineStart,
	            range: [start, index]
	        };
	    }

	    // 7.8.4 String Literals

	    function scanStringLiteral() {
	        var str = '', quote, start, ch, code, unescaped, restore, octal = false;

	        quote = source[index];
	        assert((quote === '\'' || quote === '"'),
	            'String literal must starts with a quote');

	        start = index;
	        ++index;

	        while (index < length) {
	            ch = source[index++];

	            if (ch === quote) {
	                quote = '';
	                break;
	            } else if (ch === '\\') {
	                ch = source[index++];
	                if (!isLineTerminator(ch)) {
	                    switch (ch) {
	                    case 'n':
	                        str += '\n';
	                        break;
	                    case 'r':
	                        str += '\r';
	                        break;
	                    case 't':
	                        str += '\t';
	                        break;
	                    case 'u':
	                    case 'x':
	                        restore = index;
	                        unescaped = scanHexEscape(ch);
	                        if (unescaped) {
	                            str += unescaped;
	                        } else {
	                            index = restore;
	                            str += ch;
	                        }
	                        break;
	                    case 'b':
	                        str += '\b';
	                        break;
	                    case 'f':
	                        str += '\f';
	                        break;
	                    case 'v':
	                        str += '\x0B';
	                        break;

	                    default:
	                        if (isOctalDigit(ch)) {
	                            code = '01234567'.indexOf(ch);

	                            // \0 is not octal escape sequence
	                            if (code !== 0) {
	                                octal = true;
	                            }

	                            if (index < length && isOctalDigit(source[index])) {
	                                octal = true;
	                                code = code * 8 + '01234567'.indexOf(source[index++]);

	                                // 3 digits are only allowed when string starts
	                                // with 0, 1, 2, 3
	                                if ('0123'.indexOf(ch) >= 0 &&
	                                        index < length &&
	                                        isOctalDigit(source[index])) {
	                                    code = code * 8 + '01234567'.indexOf(source[index++]);
	                                }
	                            }
	                            str += String.fromCharCode(code);
	                        } else {
	                            str += ch;
	                        }
	                        break;
	                    }
	                } else {
	                    ++lineNumber;
	                    if (ch ===  '\r' && source[index] === '\n') {
	                        ++index;
	                    }
	                }
	            } else if (isLineTerminator(ch)) {
	                break;
	            } else {
	                str += ch;
	            }
	        }

	        if (quote !== '') {
	            throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	        }

	        return {
	            type: Token.StringLiteral,
	            value: str,
	            octal: octal,
	            lineNumber: lineNumber,
	            lineStart: lineStart,
	            range: [start, index]
	        };
	    }

	    function scanRegExp() {
	        var str, ch, start, pattern, flags, value, classMarker = false, restore, terminated = false;

	        buffer = null;
	        skipComment();

	        start = index;
	        ch = source[index];
	        assert(ch === '/', 'Regular expression literal must start with a slash');
	        str = source[index++];

	        while (index < length) {
	            ch = source[index++];
	            str += ch;
	            if (ch === '\\') {
	                ch = source[index++];
	                // ECMA-262 7.8.5
	                if (isLineTerminator(ch)) {
	                    throwError({}, Messages.UnterminatedRegExp);
	                }
	                str += ch;
	            } else if (classMarker) {
	                if (ch === ']') {
	                    classMarker = false;
	                }
	            } else {
	                if (ch === '/') {
	                    terminated = true;
	                    break;
	                } else if (ch === '[') {
	                    classMarker = true;
	                } else if (isLineTerminator(ch)) {
	                    throwError({}, Messages.UnterminatedRegExp);
	                }
	            }
	        }

	        if (!terminated) {
	            throwError({}, Messages.UnterminatedRegExp);
	        }

	        // Exclude leading and trailing slash.
	        pattern = str.substr(1, str.length - 2);

	        flags = '';
	        while (index < length) {
	            ch = source[index];
	            if (!isIdentifierPart(ch)) {
	                break;
	            }

	            ++index;
	            if (ch === '\\' && index < length) {
	                ch = source[index];
	                if (ch === 'u') {
	                    ++index;
	                    restore = index;
	                    ch = scanHexEscape('u');
	                    if (ch) {
	                        flags += ch;
	                        str += '\\u';
	                        for (; restore < index; ++restore) {
	                            str += source[restore];
	                        }
	                    } else {
	                        index = restore;
	                        flags += 'u';
	                        str += '\\u';
	                    }
	                } else {
	                    str += '\\';
	                }
	            } else {
	                flags += ch;
	                str += ch;
	            }
	        }

	        try {
	            value = new RegExp(pattern, flags);
	        } catch (e) {
	            throwError({}, Messages.InvalidRegExp);
	        }

	        return {
	            literal: str,
	            value: value,
	            range: [start, index]
	        };
	    }

	    function isIdentifierName(token) {
	        return token.type === Token.Identifier ||
	            token.type === Token.Keyword ||
	            token.type === Token.BooleanLiteral ||
	            token.type === Token.NullLiteral;
	    }

	    function advance() {
	        var ch, token;

	        skipComment();

	        if (index >= length) {
	            return {
	                type: Token.EOF,
	                lineNumber: lineNumber,
	                lineStart: lineStart,
	                range: [index, index]
	            };
	        }

	        token = scanPunctuator();
	        if (typeof token !== 'undefined') {
	            return token;
	        }

	        ch = source[index];

	        if (ch === '\'' || ch === '"') {
	            return scanStringLiteral();
	        }

	        if (ch === '.' || isDecimalDigit(ch)) {
	            return scanNumericLiteral();
	        }

	        token = scanIdentifier();
	        if (typeof token !== 'undefined') {
	            return token;
	        }

	        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	    }

	    function lex() {
	        var token;

	        if (buffer) {
	            index = buffer.range[1];
	            lineNumber = buffer.lineNumber;
	            lineStart = buffer.lineStart;
	            token = buffer;
	            buffer = null;
	            return token;
	        }

	        buffer = null;
	        return advance();
	    }

	    function lookahead() {
	        var pos, line, start;

	        if (buffer !== null) {
	            return buffer;
	        }

	        pos = index;
	        line = lineNumber;
	        start = lineStart;
	        buffer = advance();
	        index = pos;
	        lineNumber = line;
	        lineStart = start;

	        return buffer;
	    }

	    // Return true if there is a line terminator before the next token.

	    function peekLineTerminator() {
	        var pos, line, start, found;

	        pos = index;
	        line = lineNumber;
	        start = lineStart;
	        skipComment();
	        found = lineNumber !== line;
	        index = pos;
	        lineNumber = line;
	        lineStart = start;

	        return found;
	    }

	    // Throw an exception

	    function throwError(token, messageFormat) {
	        var error,
	            args = Array.prototype.slice.call(arguments, 2),
	            msg = messageFormat.replace(
	                /%(\d)/g,
	                function (whole, index) {
	                    return args[index] || '';
	                }
	            );

	        if (typeof token.lineNumber === 'number') {
	            error = new Error('Line ' + token.lineNumber + ': ' + msg);
	            error.index = token.range[0];
	            error.lineNumber = token.lineNumber;
	            error.column = token.range[0] - lineStart + 1;
	        } else {
	            error = new Error('Line ' + lineNumber + ': ' + msg);
	            error.index = index;
	            error.lineNumber = lineNumber;
	            error.column = index - lineStart + 1;
	        }

	        throw error;
	    }

	    function throwErrorTolerant() {
	        try {
	            throwError.apply(null, arguments);
	        } catch (e) {
	            if (extra.errors) {
	                extra.errors.push(e);
	            } else {
	                throw e;
	            }
	        }
	    }


	    // Throw an exception because of the token.

	    function throwUnexpected(token) {
	        if (token.type === Token.EOF) {
	            throwError(token, Messages.UnexpectedEOS);
	        }

	        if (token.type === Token.NumericLiteral) {
	            throwError(token, Messages.UnexpectedNumber);
	        }

	        if (token.type === Token.StringLiteral) {
	            throwError(token, Messages.UnexpectedString);
	        }

	        if (token.type === Token.Identifier) {
	            throwError(token, Messages.UnexpectedIdentifier);
	        }

	        if (token.type === Token.Keyword) {
	            if (isFutureReservedWord(token.value)) {
	                throwError(token, Messages.UnexpectedReserved);
	            } else if (strict && isStrictModeReservedWord(token.value)) {
	                throwErrorTolerant(token, Messages.StrictReservedWord);
	                return;
	            }
	            throwError(token, Messages.UnexpectedToken, token.value);
	        }

	        // BooleanLiteral, NullLiteral, or Punctuator.
	        throwError(token, Messages.UnexpectedToken, token.value);
	    }

	    // Expect the next token to match the specified punctuator.
	    // If not, an exception will be thrown.

	    function expect(value) {
	        var token = lex();
	        if (token.type !== Token.Punctuator || token.value !== value) {
	            throwUnexpected(token);
	        }
	    }

	    // Expect the next token to match the specified keyword.
	    // If not, an exception will be thrown.

	    function expectKeyword(keyword) {
	        var token = lex();
	        if (token.type !== Token.Keyword || token.value !== keyword) {
	            throwUnexpected(token);
	        }
	    }

	    // Return true if the next token matches the specified punctuator.

	    function match(value) {
	        var token = lookahead();
	        return token.type === Token.Punctuator && token.value === value;
	    }

	    // Return true if the next token matches the specified keyword

	    function matchKeyword(keyword) {
	        var token = lookahead();
	        return token.type === Token.Keyword && token.value === keyword;
	    }

	    // Return true if the next token is an assignment operator

	    function matchAssign() {
	        var token = lookahead(),
	            op = token.value;

	        if (token.type !== Token.Punctuator) {
	            return false;
	        }
	        return op === '=' ||
	            op === '*=' ||
	            op === '/=' ||
	            op === '%=' ||
	            op === '+=' ||
	            op === '-=' ||
	            op === '<<=' ||
	            op === '>>=' ||
	            op === '>>>=' ||
	            op === '&=' ||
	            op === '^=' ||
	            op === '|=';
	    }

	    function consumeSemicolon() {
	        var token, line;

	        // Catch the very common case first.
	        if (source[index] === ';') {
	            lex();
	            return;
	        }

	        line = lineNumber;
	        skipComment();
	        if (lineNumber !== line) {
	            return;
	        }

	        if (match(';')) {
	            lex();
	            return;
	        }

	        token = lookahead();
	        if (token.type !== Token.EOF && !match('}')) {
	            throwUnexpected(token);
	        }
	    }

	    // Return true if provided expression is LeftHandSideExpression

	    function isLeftHandSide(expr) {
	        return expr.type === Syntax.Identifier || expr.type === Syntax.MemberExpression;
	    }

	    // 11.1.4 Array Initialiser

	    function parseArrayInitialiser() {
	        var elements = [];

	        expect('[');

	        while (!match(']')) {
	            if (match(',')) {
	                lex();
	                elements.push(null);
	            } else {
	                elements.push(parseAssignmentExpression());

	                if (!match(']')) {
	                    expect(',');
	                }
	            }
	        }

	        expect(']');

	        return {
	            type: Syntax.ArrayExpression,
	            elements: elements
	        };
	    }

	    // 11.1.5 Object Initialiser

	    function parsePropertyFunction(param, first) {
	        var previousStrict, body;

	        previousStrict = strict;
	        body = parseFunctionSourceElements();
	        if (first && strict && isRestrictedWord(param[0].name)) {
	            throwErrorTolerant(first, Messages.StrictParamName);
	        }
	        strict = previousStrict;

	        return {
	            type: Syntax.FunctionExpression,
	            id: null,
	            params: param,
	            defaults: [],
	            body: body,
	            rest: null,
	            generator: false,
	            expression: false
	        };
	    }

	    function parseObjectPropertyKey() {
	        var token = lex();

	        // Note: This function is called only from parseObjectProperty(), where
	        // EOF and Punctuator tokens are already filtered out.

	        if (token.type === Token.StringLiteral || token.type === Token.NumericLiteral) {
	            if (strict && token.octal) {
	                throwErrorTolerant(token, Messages.StrictOctalLiteral);
	            }
	            return createLiteral(token);
	        }

	        return {
	            type: Syntax.Identifier,
	            name: token.value
	        };
	    }

	    function parseObjectProperty() {
	        var token, key, id, param;

	        token = lookahead();

	        if (token.type === Token.Identifier) {

	            id = parseObjectPropertyKey();

	            // Property Assignment: Getter and Setter.

	            if (token.value === 'get' && !match(':')) {
	                key = parseObjectPropertyKey();
	                expect('(');
	                expect(')');
	                return {
	                    type: Syntax.Property,
	                    key: key,
	                    value: parsePropertyFunction([]),
	                    kind: 'get'
	                };
	            } else if (token.value === 'set' && !match(':')) {
	                key = parseObjectPropertyKey();
	                expect('(');
	                token = lookahead();
	                if (token.type !== Token.Identifier) {
	                    expect(')');
	                    throwErrorTolerant(token, Messages.UnexpectedToken, token.value);
	                    return {
	                        type: Syntax.Property,
	                        key: key,
	                        value: parsePropertyFunction([]),
	                        kind: 'set'
	                    };
	                } else {
	                    param = [ parseVariableIdentifier() ];
	                    expect(')');
	                    return {
	                        type: Syntax.Property,
	                        key: key,
	                        value: parsePropertyFunction(param, token),
	                        kind: 'set'
	                    };
	                }
	            } else {
	                expect(':');
	                return {
	                    type: Syntax.Property,
	                    key: id,
	                    value: parseAssignmentExpression(),
	                    kind: 'init'
	                };
	            }
	        } else if (token.type === Token.EOF || token.type === Token.Punctuator) {
	            throwUnexpected(token);
	        } else {
	            key = parseObjectPropertyKey();
	            expect(':');
	            return {
	                type: Syntax.Property,
	                key: key,
	                value: parseAssignmentExpression(),
	                kind: 'init'
	            };
	        }
	    }

	    function parseObjectInitialiser() {
	        var properties = [], property, name, kind, map = {}, toString = String;

	        expect('{');

	        while (!match('}')) {
	            property = parseObjectProperty();

	            if (property.key.type === Syntax.Identifier) {
	                name = property.key.name;
	            } else {
	                name = toString(property.key.value);
	            }
	            kind = (property.kind === 'init') ? PropertyKind.Data : (property.kind === 'get') ? PropertyKind.Get : PropertyKind.Set;
	            if (Object.prototype.hasOwnProperty.call(map, name)) {
	                if (map[name] === PropertyKind.Data) {
	                    if (strict && kind === PropertyKind.Data) {
	                        throwErrorTolerant({}, Messages.StrictDuplicateProperty);
	                    } else if (kind !== PropertyKind.Data) {
	                        throwErrorTolerant({}, Messages.AccessorDataProperty);
	                    }
	                } else {
	                    if (kind === PropertyKind.Data) {
	                        throwErrorTolerant({}, Messages.AccessorDataProperty);
	                    } else if (map[name] & kind) {
	                        throwErrorTolerant({}, Messages.AccessorGetSet);
	                    }
	                }
	                map[name] |= kind;
	            } else {
	                map[name] = kind;
	            }

	            properties.push(property);

	            if (!match('}')) {
	                expect(',');
	            }
	        }

	        expect('}');

	        return {
	            type: Syntax.ObjectExpression,
	            properties: properties
	        };
	    }

	    // 11.1.6 The Grouping Operator

	    function parseGroupExpression() {
	        var expr;

	        expect('(');

	        expr = parseExpression();

	        expect(')');

	        return expr;
	    }


	    // 11.1 Primary Expressions

	    function parsePrimaryExpression() {
	        var token = lookahead(),
	            type = token.type;

	        if (type === Token.Identifier) {
	            return {
	                type: Syntax.Identifier,
	                name: lex().value
	            };
	        }

	        if (type === Token.StringLiteral || type === Token.NumericLiteral) {
	            if (strict && token.octal) {
	                throwErrorTolerant(token, Messages.StrictOctalLiteral);
	            }
	            return createLiteral(lex());
	        }

	        if (type === Token.Keyword) {
	            if (matchKeyword('this')) {
	                lex();
	                return {
	                    type: Syntax.ThisExpression
	                };
	            }

	            if (matchKeyword('function')) {
	                return parseFunctionExpression();
	            }
	        }

	        if (type === Token.BooleanLiteral) {
	            lex();
	            token.value = (token.value === 'true');
	            return createLiteral(token);
	        }

	        if (type === Token.NullLiteral) {
	            lex();
	            token.value = null;
	            return createLiteral(token);
	        }

	        if (match('[')) {
	            return parseArrayInitialiser();
	        }

	        if (match('{')) {
	            return parseObjectInitialiser();
	        }

	        if (match('(')) {
	            return parseGroupExpression();
	        }

	        if (match('/') || match('/=')) {
	            return createLiteral(scanRegExp());
	        }

	        return throwUnexpected(lex());
	    }

	    // 11.2 Left-Hand-Side Expressions

	    function parseArguments() {
	        var args = [];

	        expect('(');

	        if (!match(')')) {
	            while (index < length) {
	                args.push(parseAssignmentExpression());
	                if (match(')')) {
	                    break;
	                }
	                expect(',');
	            }
	        }

	        expect(')');

	        return args;
	    }

	    function parseNonComputedProperty() {
	        var token = lex();

	        if (!isIdentifierName(token)) {
	            throwUnexpected(token);
	        }

	        return {
	            type: Syntax.Identifier,
	            name: token.value
	        };
	    }

	    function parseNonComputedMember() {
	        expect('.');

	        return parseNonComputedProperty();
	    }

	    function parseComputedMember() {
	        var expr;

	        expect('[');

	        expr = parseExpression();

	        expect(']');

	        return expr;
	    }

	    function parseNewExpression() {
	        var expr;

	        expectKeyword('new');

	        expr = {
	            type: Syntax.NewExpression,
	            callee: parseLeftHandSideExpression(),
	            'arguments': []
	        };

	        if (match('(')) {
	            expr['arguments'] = parseArguments();
	        }

	        return expr;
	    }

	    function parseLeftHandSideExpressionAllowCall() {
	        var expr;

	        expr = matchKeyword('new') ? parseNewExpression() : parsePrimaryExpression();

	        while (match('.') || match('[') || match('(')) {
	            if (match('(')) {
	                expr = {
	                    type: Syntax.CallExpression,
	                    callee: expr,
	                    'arguments': parseArguments()
	                };
	            } else if (match('[')) {
	                expr = {
	                    type: Syntax.MemberExpression,
	                    computed: true,
	                    object: expr,
	                    property: parseComputedMember()
	                };
	            } else {
	                expr = {
	                    type: Syntax.MemberExpression,
	                    computed: false,
	                    object: expr,
	                    property: parseNonComputedMember()
	                };
	            }
	        }

	        return expr;
	    }


	    function parseLeftHandSideExpression() {
	        var expr;

	        expr = matchKeyword('new') ? parseNewExpression() : parsePrimaryExpression();

	        while (match('.') || match('[')) {
	            if (match('[')) {
	                expr = {
	                    type: Syntax.MemberExpression,
	                    computed: true,
	                    object: expr,
	                    property: parseComputedMember()
	                };
	            } else {
	                expr = {
	                    type: Syntax.MemberExpression,
	                    computed: false,
	                    object: expr,
	                    property: parseNonComputedMember()
	                };
	            }
	        }

	        return expr;
	    }

	    // 11.3 Postfix Expressions

	    function parsePostfixExpression() {
	        var expr = parseLeftHandSideExpressionAllowCall(), token;

	        token = lookahead();
	        if (token.type !== Token.Punctuator) {
	            return expr;
	        }

	        if ((match('++') || match('--')) && !peekLineTerminator()) {
	            // 11.3.1, 11.3.2
	            if (strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
	                throwErrorTolerant({}, Messages.StrictLHSPostfix);
	            }
	            if (!isLeftHandSide(expr)) {
	                throwErrorTolerant({}, Messages.InvalidLHSInAssignment);
	            }

	            expr = {
	                type: Syntax.UpdateExpression,
	                operator: lex().value,
	                argument: expr,
	                prefix: false
	            };
	        }

	        return expr;
	    }

	    // 11.4 Unary Operators

	    function parseUnaryExpression() {
	        var token, expr;

	        token = lookahead();
	        if (token.type !== Token.Punctuator && token.type !== Token.Keyword) {
	            return parsePostfixExpression();
	        }

	        if (match('++') || match('--')) {
	            token = lex();
	            expr = parseUnaryExpression();
	            // 11.4.4, 11.4.5
	            if (strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
	                throwErrorTolerant({}, Messages.StrictLHSPrefix);
	            }

	            if (!isLeftHandSide(expr)) {
	                throwErrorTolerant({}, Messages.InvalidLHSInAssignment);
	            }

	            expr = {
	                type: Syntax.UpdateExpression,
	                operator: token.value,
	                argument: expr,
	                prefix: true
	            };
	            return expr;
	        }

	        if (match('+') || match('-') || match('~') || match('!')) {
	            expr = {
	                type: Syntax.UnaryExpression,
	                operator: lex().value,
	                argument: parseUnaryExpression(),
	                prefix: true
	            };
	            return expr;
	        }

	        if (matchKeyword('delete') || matchKeyword('void') || matchKeyword('typeof')) {
	            expr = {
	                type: Syntax.UnaryExpression,
	                operator: lex().value,
	                argument: parseUnaryExpression(),
	                prefix: true
	            };
	            if (strict && expr.operator === 'delete' && expr.argument.type === Syntax.Identifier) {
	                throwErrorTolerant({}, Messages.StrictDelete);
	            }
	            return expr;
	        }

	        return parsePostfixExpression();
	    }

	    // 11.5 Multiplicative Operators

	    function parseMultiplicativeExpression() {
	        var expr = parseUnaryExpression();

	        while (match('*') || match('/') || match('%')) {
	            expr = {
	                type: Syntax.BinaryExpression,
	                operator: lex().value,
	                left: expr,
	                right: parseUnaryExpression()
	            };
	        }

	        return expr;
	    }

	    // 11.6 Additive Operators

	    function parseAdditiveExpression() {
	        var expr = parseMultiplicativeExpression();

	        while (match('+') || match('-')) {
	            expr = {
	                type: Syntax.BinaryExpression,
	                operator: lex().value,
	                left: expr,
	                right: parseMultiplicativeExpression()
	            };
	        }

	        return expr;
	    }

	    // 11.7 Bitwise Shift Operators

	    function parseShiftExpression() {
	        var expr = parseAdditiveExpression();

	        while (match('<<') || match('>>') || match('>>>')) {
	            expr = {
	                type: Syntax.BinaryExpression,
	                operator: lex().value,
	                left: expr,
	                right: parseAdditiveExpression()
	            };
	        }

	        return expr;
	    }
	    // 11.8 Relational Operators

	    function parseRelationalExpression() {
	        var expr, previousAllowIn;

	        previousAllowIn = state.allowIn;
	        state.allowIn = true;

	        expr = parseShiftExpression();

	        while (match('<') || match('>') || match('<=') || match('>=') || (previousAllowIn && matchKeyword('in')) || matchKeyword('instanceof')) {
	            expr = {
	                type: Syntax.BinaryExpression,
	                operator: lex().value,
	                left: expr,
	                right: parseShiftExpression()
	            };
	        }

	        state.allowIn = previousAllowIn;
	        return expr;
	    }

	    // 11.9 Equality Operators

	    function parseEqualityExpression() {
	        var expr = parseRelationalExpression();

	        while (match('==') || match('!=') || match('===') || match('!==')) {
	            expr = {
	                type: Syntax.BinaryExpression,
	                operator: lex().value,
	                left: expr,
	                right: parseRelationalExpression()
	            };
	        }

	        return expr;
	    }

	    // 11.10 Binary Bitwise Operators

	    function parseBitwiseANDExpression() {
	        var expr = parseEqualityExpression();

	        while (match('&')) {
	            lex();
	            expr = {
	                type: Syntax.BinaryExpression,
	                operator: '&',
	                left: expr,
	                right: parseEqualityExpression()
	            };
	        }

	        return expr;
	    }

	    function parseBitwiseXORExpression() {
	        var expr = parseBitwiseANDExpression();

	        while (match('^')) {
	            lex();
	            expr = {
	                type: Syntax.BinaryExpression,
	                operator: '^',
	                left: expr,
	                right: parseBitwiseANDExpression()
	            };
	        }

	        return expr;
	    }

	    function parseBitwiseORExpression() {
	        var expr = parseBitwiseXORExpression();

	        while (match('|')) {
	            lex();
	            expr = {
	                type: Syntax.BinaryExpression,
	                operator: '|',
	                left: expr,
	                right: parseBitwiseXORExpression()
	            };
	        }

	        return expr;
	    }

	    // 11.11 Binary Logical Operators

	    function parseLogicalANDExpression() {
	        var expr = parseBitwiseORExpression();

	        while (match('&&')) {
	            lex();
	            expr = {
	                type: Syntax.LogicalExpression,
	                operator: '&&',
	                left: expr,
	                right: parseBitwiseORExpression()
	            };
	        }

	        return expr;
	    }

	    function parseLogicalORExpression() {
	        var expr = parseLogicalANDExpression();

	        while (match('||')) {
	            lex();
	            expr = {
	                type: Syntax.LogicalExpression,
	                operator: '||',
	                left: expr,
	                right: parseLogicalANDExpression()
	            };
	        }

	        return expr;
	    }

	    // 11.12 Conditional Operator

	    function parseConditionalExpression() {
	        var expr, previousAllowIn, consequent;

	        expr = parseLogicalORExpression();

	        if (match('?')) {
	            lex();
	            previousAllowIn = state.allowIn;
	            state.allowIn = true;
	            consequent = parseAssignmentExpression();
	            state.allowIn = previousAllowIn;
	            expect(':');

	            expr = {
	                type: Syntax.ConditionalExpression,
	                test: expr,
	                consequent: consequent,
	                alternate: parseAssignmentExpression()
	            };
	        }

	        return expr;
	    }

	    // 11.13 Assignment Operators

	    function parseAssignmentExpression() {
	        var token, expr;

	        token = lookahead();
	        expr = parseConditionalExpression();

	        if (matchAssign()) {
	            // LeftHandSideExpression
	            if (!isLeftHandSide(expr)) {
	                throwErrorTolerant({}, Messages.InvalidLHSInAssignment);
	            }

	            // 11.13.1
	            if (strict && expr.type === Syntax.Identifier && isRestrictedWord(expr.name)) {
	                throwErrorTolerant(token, Messages.StrictLHSAssignment);
	            }

	            expr = {
	                type: Syntax.AssignmentExpression,
	                operator: lex().value,
	                left: expr,
	                right: parseAssignmentExpression()
	            };
	        }

	        return expr;
	    }

	    // 11.14 Comma Operator

	    function parseExpression() {
	        var expr = parseAssignmentExpression();

	        if (match(',')) {
	            expr = {
	                type: Syntax.SequenceExpression,
	                expressions: [ expr ]
	            };

	            while (index < length) {
	                if (!match(',')) {
	                    break;
	                }
	                lex();
	                expr.expressions.push(parseAssignmentExpression());
	            }

	        }
	        return expr;
	    }

	    // 12.1 Block

	    function parseStatementList() {
	        var list = [],
	            statement;

	        while (index < length) {
	            if (match('}')) {
	                break;
	            }
	            statement = parseSourceElement();
	            if (typeof statement === 'undefined') {
	                break;
	            }
	            list.push(statement);
	        }

	        return list;
	    }

	    function parseBlock() {
	        var block;

	        expect('{');

	        block = parseStatementList();

	        expect('}');

	        return {
	            type: Syntax.BlockStatement,
	            body: block
	        };
	    }

	    // 12.2 Variable Statement

	    function parseVariableIdentifier() {
	        var token = lex();

	        if (token.type !== Token.Identifier) {
	            throwUnexpected(token);
	        }

	        return {
	            type: Syntax.Identifier,
	            name: token.value
	        };
	    }

	    function parseVariableDeclaration(kind) {
	        var id = parseVariableIdentifier(),
	            init = null;

	        // 12.2.1
	        if (strict && isRestrictedWord(id.name)) {
	            throwErrorTolerant({}, Messages.StrictVarName);
	        }

	        if (kind === 'const') {
	            expect('=');
	            init = parseAssignmentExpression();
	        } else if (match('=')) {
	            lex();
	            init = parseAssignmentExpression();
	        }

	        return {
	            type: Syntax.VariableDeclarator,
	            id: id,
	            init: init
	        };
	    }

	    function parseVariableDeclarationList(kind) {
	        var list = [];

	        do {
	            list.push(parseVariableDeclaration(kind));
	            if (!match(',')) {
	                break;
	            }
	            lex();
	        } while (index < length);

	        return list;
	    }

	    function parseVariableStatement() {
	        var declarations;

	        expectKeyword('var');

	        declarations = parseVariableDeclarationList();

	        consumeSemicolon();

	        return {
	            type: Syntax.VariableDeclaration,
	            declarations: declarations,
	            kind: 'var'
	        };
	    }

	    // kind may be `const` or `let`
	    // Both are experimental and not in the specification yet.
	    // see http://wiki.ecmascript.org/doku.php?id=harmony:const
	    // and http://wiki.ecmascript.org/doku.php?id=harmony:let
	    function parseConstLetDeclaration(kind) {
	        var declarations;

	        expectKeyword(kind);

	        declarations = parseVariableDeclarationList(kind);

	        consumeSemicolon();

	        return {
	            type: Syntax.VariableDeclaration,
	            declarations: declarations,
	            kind: kind
	        };
	    }

	    // 12.3 Empty Statement

	    function parseEmptyStatement() {
	        expect(';');

	        return {
	            type: Syntax.EmptyStatement
	        };
	    }

	    // 12.4 Expression Statement

	    function parseExpressionStatement() {
	        var expr = parseExpression();

	        consumeSemicolon();

	        return {
	            type: Syntax.ExpressionStatement,
	            expression: expr
	        };
	    }

	    // 12.5 If statement

	    function parseIfStatement() {
	        var test, consequent, alternate;

	        expectKeyword('if');

	        expect('(');

	        test = parseExpression();

	        expect(')');

	        consequent = parseStatement();

	        if (matchKeyword('else')) {
	            lex();
	            alternate = parseStatement();
	        } else {
	            alternate = null;
	        }

	        return {
	            type: Syntax.IfStatement,
	            test: test,
	            consequent: consequent,
	            alternate: alternate
	        };
	    }

	    // 12.6 Iteration Statements

	    function parseDoWhileStatement() {
	        var body, test, oldInIteration;

	        expectKeyword('do');

	        oldInIteration = state.inIteration;
	        state.inIteration = true;

	        body = parseStatement();

	        state.inIteration = oldInIteration;

	        expectKeyword('while');

	        expect('(');

	        test = parseExpression();

	        expect(')');

	        if (match(';')) {
	            lex();
	        }

	        return {
	            type: Syntax.DoWhileStatement,
	            body: body,
	            test: test
	        };
	    }

	    function parseWhileStatement() {
	        var test, body, oldInIteration;

	        expectKeyword('while');

	        expect('(');

	        test = parseExpression();

	        expect(')');

	        oldInIteration = state.inIteration;
	        state.inIteration = true;

	        body = parseStatement();

	        state.inIteration = oldInIteration;

	        return {
	            type: Syntax.WhileStatement,
	            test: test,
	            body: body
	        };
	    }

	    function parseForVariableDeclaration() {
	        var token = lex();

	        return {
	            type: Syntax.VariableDeclaration,
	            declarations: parseVariableDeclarationList(),
	            kind: token.value
	        };
	    }

	    function parseForStatement() {
	        var init, test, update, left, right, body, oldInIteration;

	        init = test = update = null;

	        expectKeyword('for');

	        expect('(');

	        if (match(';')) {
	            lex();
	        } else {
	            if (matchKeyword('var') || matchKeyword('let')) {
	                state.allowIn = false;
	                init = parseForVariableDeclaration();
	                state.allowIn = true;

	                if (init.declarations.length === 1 && matchKeyword('in')) {
	                    lex();
	                    left = init;
	                    right = parseExpression();
	                    init = null;
	                }
	            } else {
	                state.allowIn = false;
	                init = parseExpression();
	                state.allowIn = true;

	                if (matchKeyword('in')) {
	                    // LeftHandSideExpression
	                    if (!isLeftHandSide(init)) {
	                        throwErrorTolerant({}, Messages.InvalidLHSInForIn);
	                    }

	                    lex();
	                    left = init;
	                    right = parseExpression();
	                    init = null;
	                }
	            }

	            if (typeof left === 'undefined') {
	                expect(';');
	            }
	        }

	        if (typeof left === 'undefined') {

	            if (!match(';')) {
	                test = parseExpression();
	            }
	            expect(';');

	            if (!match(')')) {
	                update = parseExpression();
	            }
	        }

	        expect(')');

	        oldInIteration = state.inIteration;
	        state.inIteration = true;

	        body = parseStatement();

	        state.inIteration = oldInIteration;

	        if (typeof left === 'undefined') {
	            return {
	                type: Syntax.ForStatement,
	                init: init,
	                test: test,
	                update: update,
	                body: body
	            };
	        }

	        return {
	            type: Syntax.ForInStatement,
	            left: left,
	            right: right,
	            body: body,
	            each: false
	        };
	    }

	    // 12.7 The continue statement

	    function parseContinueStatement() {
	        var token, label = null;

	        expectKeyword('continue');

	        // Optimize the most common form: 'continue;'.
	        if (source[index] === ';') {
	            lex();

	            if (!state.inIteration) {
	                throwError({}, Messages.IllegalContinue);
	            }

	            return {
	                type: Syntax.ContinueStatement,
	                label: null
	            };
	        }

	        if (peekLineTerminator()) {
	            if (!state.inIteration) {
	                throwError({}, Messages.IllegalContinue);
	            }

	            return {
	                type: Syntax.ContinueStatement,
	                label: null
	            };
	        }

	        token = lookahead();
	        if (token.type === Token.Identifier) {
	            label = parseVariableIdentifier();

	            if (!Object.prototype.hasOwnProperty.call(state.labelSet, label.name)) {
	                throwError({}, Messages.UnknownLabel, label.name);
	            }
	        }

	        consumeSemicolon();

	        if (label === null && !state.inIteration) {
	            throwError({}, Messages.IllegalContinue);
	        }

	        return {
	            type: Syntax.ContinueStatement,
	            label: label
	        };
	    }

	    // 12.8 The break statement

	    function parseBreakStatement() {
	        var token, label = null;

	        expectKeyword('break');

	        // Optimize the most common form: 'break;'.
	        if (source[index] === ';') {
	            lex();

	            if (!(state.inIteration || state.inSwitch)) {
	                throwError({}, Messages.IllegalBreak);
	            }

	            return {
	                type: Syntax.BreakStatement,
	                label: null
	            };
	        }

	        if (peekLineTerminator()) {
	            if (!(state.inIteration || state.inSwitch)) {
	                throwError({}, Messages.IllegalBreak);
	            }

	            return {
	                type: Syntax.BreakStatement,
	                label: null
	            };
	        }

	        token = lookahead();
	        if (token.type === Token.Identifier) {
	            label = parseVariableIdentifier();

	            if (!Object.prototype.hasOwnProperty.call(state.labelSet, label.name)) {
	                throwError({}, Messages.UnknownLabel, label.name);
	            }
	        }

	        consumeSemicolon();

	        if (label === null && !(state.inIteration || state.inSwitch)) {
	            throwError({}, Messages.IllegalBreak);
	        }

	        return {
	            type: Syntax.BreakStatement,
	            label: label
	        };
	    }

	    // 12.9 The return statement

	    function parseReturnStatement() {
	        var token, argument = null;

	        expectKeyword('return');

	        if (!state.inFunctionBody) {
	            throwErrorTolerant({}, Messages.IllegalReturn);
	        }

	        // 'return' followed by a space and an identifier is very common.
	        if (source[index] === ' ') {
	            if (isIdentifierStart(source[index + 1])) {
	                argument = parseExpression();
	                consumeSemicolon();
	                return {
	                    type: Syntax.ReturnStatement,
	                    argument: argument
	                };
	            }
	        }

	        if (peekLineTerminator()) {
	            return {
	                type: Syntax.ReturnStatement,
	                argument: null
	            };
	        }

	        if (!match(';')) {
	            token = lookahead();
	            if (!match('}') && token.type !== Token.EOF) {
	                argument = parseExpression();
	            }
	        }

	        consumeSemicolon();

	        return {
	            type: Syntax.ReturnStatement,
	            argument: argument
	        };
	    }

	    // 12.10 The with statement

	    function parseWithStatement() {
	        var object, body;

	        if (strict) {
	            throwErrorTolerant({}, Messages.StrictModeWith);
	        }

	        expectKeyword('with');

	        expect('(');

	        object = parseExpression();

	        expect(')');

	        body = parseStatement();

	        return {
	            type: Syntax.WithStatement,
	            object: object,
	            body: body
	        };
	    }

	    // 12.10 The swith statement

	    function parseSwitchCase() {
	        var test,
	            consequent = [],
	            statement;

	        if (matchKeyword('default')) {
	            lex();
	            test = null;
	        } else {
	            expectKeyword('case');
	            test = parseExpression();
	        }
	        expect(':');

	        while (index < length) {
	            if (match('}') || matchKeyword('default') || matchKeyword('case')) {
	                break;
	            }
	            statement = parseStatement();
	            if (typeof statement === 'undefined') {
	                break;
	            }
	            consequent.push(statement);
	        }

	        return {
	            type: Syntax.SwitchCase,
	            test: test,
	            consequent: consequent
	        };
	    }

	    function parseSwitchStatement() {
	        var discriminant, cases, clause, oldInSwitch, defaultFound;

	        expectKeyword('switch');

	        expect('(');

	        discriminant = parseExpression();

	        expect(')');

	        expect('{');

	        cases = [];

	        if (match('}')) {
	            lex();
	            return {
	                type: Syntax.SwitchStatement,
	                discriminant: discriminant,
	                cases: cases
	            };
	        }

	        oldInSwitch = state.inSwitch;
	        state.inSwitch = true;
	        defaultFound = false;

	        while (index < length) {
	            if (match('}')) {
	                break;
	            }
	            clause = parseSwitchCase();
	            if (clause.test === null) {
	                if (defaultFound) {
	                    throwError({}, Messages.MultipleDefaultsInSwitch);
	                }
	                defaultFound = true;
	            }
	            cases.push(clause);
	        }

	        state.inSwitch = oldInSwitch;

	        expect('}');

	        return {
	            type: Syntax.SwitchStatement,
	            discriminant: discriminant,
	            cases: cases
	        };
	    }

	    // 12.13 The throw statement

	    function parseThrowStatement() {
	        var argument;

	        expectKeyword('throw');

	        if (peekLineTerminator()) {
	            throwError({}, Messages.NewlineAfterThrow);
	        }

	        argument = parseExpression();

	        consumeSemicolon();

	        return {
	            type: Syntax.ThrowStatement,
	            argument: argument
	        };
	    }

	    // 12.14 The try statement

	    function parseCatchClause() {
	        var param;

	        expectKeyword('catch');

	        expect('(');
	        if (match(')')) {
	            throwUnexpected(lookahead());
	        }

	        param = parseVariableIdentifier();
	        // 12.14.1
	        if (strict && isRestrictedWord(param.name)) {
	            throwErrorTolerant({}, Messages.StrictCatchVariable);
	        }

	        expect(')');

	        return {
	            type: Syntax.CatchClause,
	            param: param,
	            body: parseBlock()
	        };
	    }

	    function parseTryStatement() {
	        var block, handlers = [], finalizer = null;

	        expectKeyword('try');

	        block = parseBlock();

	        if (matchKeyword('catch')) {
	            handlers.push(parseCatchClause());
	        }

	        if (matchKeyword('finally')) {
	            lex();
	            finalizer = parseBlock();
	        }

	        if (handlers.length === 0 && !finalizer) {
	            throwError({}, Messages.NoCatchOrFinally);
	        }

	        return {
	            type: Syntax.TryStatement,
	            block: block,
	            guardedHandlers: [],
	            handlers: handlers,
	            finalizer: finalizer
	        };
	    }

	    // 12.15 The debugger statement

	    function parseDebuggerStatement() {
	        expectKeyword('debugger');

	        consumeSemicolon();

	        return {
	            type: Syntax.DebuggerStatement
	        };
	    }

	    // 12 Statements

	    function parseStatement() {
	        var token = lookahead(),
	            expr,
	            labeledBody;

	        if (token.type === Token.EOF) {
	            throwUnexpected(token);
	        }

	        if (token.type === Token.Punctuator) {
	            switch (token.value) {
	            case ';':
	                return parseEmptyStatement();
	            case '{':
	                return parseBlock();
	            case '(':
	                return parseExpressionStatement();
	            default:
	                break;
	            }
	        }

	        if (token.type === Token.Keyword) {
	            switch (token.value) {
	            case 'break':
	                return parseBreakStatement();
	            case 'continue':
	                return parseContinueStatement();
	            case 'debugger':
	                return parseDebuggerStatement();
	            case 'do':
	                return parseDoWhileStatement();
	            case 'for':
	                return parseForStatement();
	            case 'function':
	                return parseFunctionDeclaration();
	            case 'if':
	                return parseIfStatement();
	            case 'return':
	                return parseReturnStatement();
	            case 'switch':
	                return parseSwitchStatement();
	            case 'throw':
	                return parseThrowStatement();
	            case 'try':
	                return parseTryStatement();
	            case 'var':
	                return parseVariableStatement();
	            case 'while':
	                return parseWhileStatement();
	            case 'with':
	                return parseWithStatement();
	            default:
	                break;
	            }
	        }

	        expr = parseExpression();

	        // 12.12 Labelled Statements
	        if ((expr.type === Syntax.Identifier) && match(':')) {
	            lex();

	            if (Object.prototype.hasOwnProperty.call(state.labelSet, expr.name)) {
	                throwError({}, Messages.Redeclaration, 'Label', expr.name);
	            }

	            state.labelSet[expr.name] = true;
	            labeledBody = parseStatement();
	            delete state.labelSet[expr.name];

	            return {
	                type: Syntax.LabeledStatement,
	                label: expr,
	                body: labeledBody
	            };
	        }

	        consumeSemicolon();

	        return {
	            type: Syntax.ExpressionStatement,
	            expression: expr
	        };
	    }

	    // 13 Function Definition

	    function parseFunctionSourceElements() {
	        var sourceElement, sourceElements = [], token, directive, firstRestricted,
	            oldLabelSet, oldInIteration, oldInSwitch, oldInFunctionBody;

	        expect('{');

	        while (index < length) {
	            token = lookahead();
	            if (token.type !== Token.StringLiteral) {
	                break;
	            }

	            sourceElement = parseSourceElement();
	            sourceElements.push(sourceElement);
	            if (sourceElement.expression.type !== Syntax.Literal) {
	                // this is not directive
	                break;
	            }
	            directive = sliceSource(token.range[0] + 1, token.range[1] - 1);
	            if (directive === 'use strict') {
	                strict = true;
	                if (firstRestricted) {
	                    throwErrorTolerant(firstRestricted, Messages.StrictOctalLiteral);
	                }
	            } else {
	                if (!firstRestricted && token.octal) {
	                    firstRestricted = token;
	                }
	            }
	        }

	        oldLabelSet = state.labelSet;
	        oldInIteration = state.inIteration;
	        oldInSwitch = state.inSwitch;
	        oldInFunctionBody = state.inFunctionBody;

	        state.labelSet = {};
	        state.inIteration = false;
	        state.inSwitch = false;
	        state.inFunctionBody = true;

	        while (index < length) {
	            if (match('}')) {
	                break;
	            }
	            sourceElement = parseSourceElement();
	            if (typeof sourceElement === 'undefined') {
	                break;
	            }
	            sourceElements.push(sourceElement);
	        }

	        expect('}');

	        state.labelSet = oldLabelSet;
	        state.inIteration = oldInIteration;
	        state.inSwitch = oldInSwitch;
	        state.inFunctionBody = oldInFunctionBody;

	        return {
	            type: Syntax.BlockStatement,
	            body: sourceElements
	        };
	    }

	    function parseFunctionDeclaration() {
	        var id, param, params = [], body, token, stricted, firstRestricted, message, previousStrict, paramSet;

	        expectKeyword('function');
	        token = lookahead();
	        id = parseVariableIdentifier();
	        if (strict) {
	            if (isRestrictedWord(token.value)) {
	                throwErrorTolerant(token, Messages.StrictFunctionName);
	            }
	        } else {
	            if (isRestrictedWord(token.value)) {
	                firstRestricted = token;
	                message = Messages.StrictFunctionName;
	            } else if (isStrictModeReservedWord(token.value)) {
	                firstRestricted = token;
	                message = Messages.StrictReservedWord;
	            }
	        }

	        expect('(');

	        if (!match(')')) {
	            paramSet = {};
	            while (index < length) {
	                token = lookahead();
	                param = parseVariableIdentifier();
	                if (strict) {
	                    if (isRestrictedWord(token.value)) {
	                        stricted = token;
	                        message = Messages.StrictParamName;
	                    }
	                    if (Object.prototype.hasOwnProperty.call(paramSet, token.value)) {
	                        stricted = token;
	                        message = Messages.StrictParamDupe;
	                    }
	                } else if (!firstRestricted) {
	                    if (isRestrictedWord(token.value)) {
	                        firstRestricted = token;
	                        message = Messages.StrictParamName;
	                    } else if (isStrictModeReservedWord(token.value)) {
	                        firstRestricted = token;
	                        message = Messages.StrictReservedWord;
	                    } else if (Object.prototype.hasOwnProperty.call(paramSet, token.value)) {
	                        firstRestricted = token;
	                        message = Messages.StrictParamDupe;
	                    }
	                }
	                params.push(param);
	                paramSet[param.name] = true;
	                if (match(')')) {
	                    break;
	                }
	                expect(',');
	            }
	        }

	        expect(')');

	        previousStrict = strict;
	        body = parseFunctionSourceElements();
	        if (strict && firstRestricted) {
	            throwError(firstRestricted, message);
	        }
	        if (strict && stricted) {
	            throwErrorTolerant(stricted, message);
	        }
	        strict = previousStrict;

	        return {
	            type: Syntax.FunctionDeclaration,
	            id: id,
	            params: params,
	            defaults: [],
	            body: body,
	            rest: null,
	            generator: false,
	            expression: false
	        };
	    }

	    function parseFunctionExpression() {
	        var token, id = null, stricted, firstRestricted, message, param, params = [], body, previousStrict, paramSet;

	        expectKeyword('function');

	        if (!match('(')) {
	            token = lookahead();
	            id = parseVariableIdentifier();
	            if (strict) {
	                if (isRestrictedWord(token.value)) {
	                    throwErrorTolerant(token, Messages.StrictFunctionName);
	                }
	            } else {
	                if (isRestrictedWord(token.value)) {
	                    firstRestricted = token;
	                    message = Messages.StrictFunctionName;
	                } else if (isStrictModeReservedWord(token.value)) {
	                    firstRestricted = token;
	                    message = Messages.StrictReservedWord;
	                }
	            }
	        }

	        expect('(');

	        if (!match(')')) {
	            paramSet = {};
	            while (index < length) {
	                token = lookahead();
	                param = parseVariableIdentifier();
	                if (strict) {
	                    if (isRestrictedWord(token.value)) {
	                        stricted = token;
	                        message = Messages.StrictParamName;
	                    }
	                    if (Object.prototype.hasOwnProperty.call(paramSet, token.value)) {
	                        stricted = token;
	                        message = Messages.StrictParamDupe;
	                    }
	                } else if (!firstRestricted) {
	                    if (isRestrictedWord(token.value)) {
	                        firstRestricted = token;
	                        message = Messages.StrictParamName;
	                    } else if (isStrictModeReservedWord(token.value)) {
	                        firstRestricted = token;
	                        message = Messages.StrictReservedWord;
	                    } else if (Object.prototype.hasOwnProperty.call(paramSet, token.value)) {
	                        firstRestricted = token;
	                        message = Messages.StrictParamDupe;
	                    }
	                }
	                params.push(param);
	                paramSet[param.name] = true;
	                if (match(')')) {
	                    break;
	                }
	                expect(',');
	            }
	        }

	        expect(')');

	        previousStrict = strict;
	        body = parseFunctionSourceElements();
	        if (strict && firstRestricted) {
	            throwError(firstRestricted, message);
	        }
	        if (strict && stricted) {
	            throwErrorTolerant(stricted, message);
	        }
	        strict = previousStrict;

	        return {
	            type: Syntax.FunctionExpression,
	            id: id,
	            params: params,
	            defaults: [],
	            body: body,
	            rest: null,
	            generator: false,
	            expression: false
	        };
	    }

	    // 14 Program

	    function parseSourceElement() {
	        var token = lookahead();

	        if (token.type === Token.Keyword) {
	            switch (token.value) {
	            case 'const':
	            case 'let':
	                return parseConstLetDeclaration(token.value);
	            case 'function':
	                return parseFunctionDeclaration();
	            default:
	                return parseStatement();
	            }
	        }

	        if (token.type !== Token.EOF) {
	            return parseStatement();
	        }
	    }

	    function parseSourceElements() {
	        var sourceElement, sourceElements = [], token, directive, firstRestricted;

	        while (index < length) {
	            token = lookahead();
	            if (token.type !== Token.StringLiteral) {
	                break;
	            }

	            sourceElement = parseSourceElement();
	            sourceElements.push(sourceElement);
	            if (sourceElement.expression.type !== Syntax.Literal) {
	                // this is not directive
	                break;
	            }
	            directive = sliceSource(token.range[0] + 1, token.range[1] - 1);
	            if (directive === 'use strict') {
	                strict = true;
	                if (firstRestricted) {
	                    throwErrorTolerant(firstRestricted, Messages.StrictOctalLiteral);
	                }
	            } else {
	                if (!firstRestricted && token.octal) {
	                    firstRestricted = token;
	                }
	            }
	        }

	        while (index < length) {
	            sourceElement = parseSourceElement();
	            if (typeof sourceElement === 'undefined') {
	                break;
	            }
	            sourceElements.push(sourceElement);
	        }
	        return sourceElements;
	    }

	    function parseProgram() {
	        var program;
	        strict = false;
	        program = {
	            type: Syntax.Program,
	            body: parseSourceElements()
	        };
	        return program;
	    }

	    // The following functions are needed only when the option to preserve
	    // the comments is active.

	    function addComment(type, value, start, end, loc) {
	        assert(typeof start === 'number', 'Comment must have valid position');

	        // Because the way the actual token is scanned, often the comments
	        // (if any) are skipped twice during the lexical analysis.
	        // Thus, we need to skip adding a comment if the comment array already
	        // handled it.
	        if (extra.comments.length > 0) {
	            if (extra.comments[extra.comments.length - 1].range[1] > start) {
	                return;
	            }
	        }

	        extra.comments.push({
	            type: type,
	            value: value,
	            range: [start, end],
	            loc: loc
	        });
	    }

	    function scanComment() {
	        var comment, ch, loc, start, blockComment, lineComment;

	        comment = '';
	        blockComment = false;
	        lineComment = false;

	        while (index < length) {
	            ch = source[index];

	            if (lineComment) {
	                ch = source[index++];
	                if (isLineTerminator(ch)) {
	                    loc.end = {
	                        line: lineNumber,
	                        column: index - lineStart - 1
	                    };
	                    lineComment = false;
	                    addComment('Line', comment, start, index - 1, loc);
	                    if (ch === '\r' && source[index] === '\n') {
	                        ++index;
	                    }
	                    ++lineNumber;
	                    lineStart = index;
	                    comment = '';
	                } else if (index >= length) {
	                    lineComment = false;
	                    comment += ch;
	                    loc.end = {
	                        line: lineNumber,
	                        column: length - lineStart
	                    };
	                    addComment('Line', comment, start, length, loc);
	                } else {
	                    comment += ch;
	                }
	            } else if (blockComment) {
	                if (isLineTerminator(ch)) {
	                    if (ch === '\r' && source[index + 1] === '\n') {
	                        ++index;
	                        comment += '\r\n';
	                    } else {
	                        comment += ch;
	                    }
	                    ++lineNumber;
	                    ++index;
	                    lineStart = index;
	                    if (index >= length) {
	                        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	                    }
	                } else {
	                    ch = source[index++];
	                    if (index >= length) {
	                        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	                    }
	                    comment += ch;
	                    if (ch === '*') {
	                        ch = source[index];
	                        if (ch === '/') {
	                            comment = comment.substr(0, comment.length - 1);
	                            blockComment = false;
	                            ++index;
	                            loc.end = {
	                                line: lineNumber,
	                                column: index - lineStart
	                            };
	                            addComment('Block', comment, start, index, loc);
	                            comment = '';
	                        }
	                    }
	                }
	            } else if (ch === '/') {
	                ch = source[index + 1];
	                if (ch === '/') {
	                    loc = {
	                        start: {
	                            line: lineNumber,
	                            column: index - lineStart
	                        }
	                    };
	                    start = index;
	                    index += 2;
	                    lineComment = true;
	                    if (index >= length) {
	                        loc.end = {
	                            line: lineNumber,
	                            column: index - lineStart
	                        };
	                        lineComment = false;
	                        addComment('Line', comment, start, index, loc);
	                    }
	                } else if (ch === '*') {
	                    start = index;
	                    index += 2;
	                    blockComment = true;
	                    loc = {
	                        start: {
	                            line: lineNumber,
	                            column: index - lineStart - 2
	                        }
	                    };
	                    if (index >= length) {
	                        throwError({}, Messages.UnexpectedToken, 'ILLEGAL');
	                    }
	                } else {
	                    break;
	                }
	            } else if (isWhiteSpace(ch)) {
	                ++index;
	            } else if (isLineTerminator(ch)) {
	                ++index;
	                if (ch ===  '\r' && source[index] === '\n') {
	                    ++index;
	                }
	                ++lineNumber;
	                lineStart = index;
	            } else {
	                break;
	            }
	        }
	    }

	    function filterCommentLocation() {
	        var i, entry, comment, comments = [];

	        for (i = 0; i < extra.comments.length; ++i) {
	            entry = extra.comments[i];
	            comment = {
	                type: entry.type,
	                value: entry.value
	            };
	            if (extra.range) {
	                comment.range = entry.range;
	            }
	            if (extra.loc) {
	                comment.loc = entry.loc;
	            }
	            comments.push(comment);
	        }

	        extra.comments = comments;
	    }

	    function collectToken() {
	        var start, loc, token, range, value;

	        skipComment();
	        start = index;
	        loc = {
	            start: {
	                line: lineNumber,
	                column: index - lineStart
	            }
	        };

	        token = extra.advance();
	        loc.end = {
	            line: lineNumber,
	            column: index - lineStart
	        };

	        if (token.type !== Token.EOF) {
	            range = [token.range[0], token.range[1]];
	            value = sliceSource(token.range[0], token.range[1]);
	            extra.tokens.push({
	                type: TokenName[token.type],
	                value: value,
	                range: range,
	                loc: loc
	            });
	        }

	        return token;
	    }

	    function collectRegex() {
	        var pos, loc, regex, token;

	        skipComment();

	        pos = index;
	        loc = {
	            start: {
	                line: lineNumber,
	                column: index - lineStart
	            }
	        };

	        regex = extra.scanRegExp();
	        loc.end = {
	            line: lineNumber,
	            column: index - lineStart
	        };

	        // Pop the previous token, which is likely '/' or '/='
	        if (extra.tokens.length > 0) {
	            token = extra.tokens[extra.tokens.length - 1];
	            if (token.range[0] === pos && token.type === 'Punctuator') {
	                if (token.value === '/' || token.value === '/=') {
	                    extra.tokens.pop();
	                }
	            }
	        }

	        extra.tokens.push({
	            type: 'RegularExpression',
	            value: regex.literal,
	            range: [pos, index],
	            loc: loc
	        });

	        return regex;
	    }

	    function filterTokenLocation() {
	        var i, entry, token, tokens = [];

	        for (i = 0; i < extra.tokens.length; ++i) {
	            entry = extra.tokens[i];
	            token = {
	                type: entry.type,
	                value: entry.value
	            };
	            if (extra.range) {
	                token.range = entry.range;
	            }
	            if (extra.loc) {
	                token.loc = entry.loc;
	            }
	            tokens.push(token);
	        }

	        extra.tokens = tokens;
	    }

	    function createLiteral(token) {
	        return {
	            type: Syntax.Literal,
	            value: token.value
	        };
	    }

	    function createRawLiteral(token) {
	        return {
	            type: Syntax.Literal,
	            value: token.value,
	            raw: sliceSource(token.range[0], token.range[1])
	        };
	    }

	    function createLocationMarker() {
	        var marker = {};

	        marker.range = [index, index];
	        marker.loc = {
	            start: {
	                line: lineNumber,
	                column: index - lineStart
	            },
	            end: {
	                line: lineNumber,
	                column: index - lineStart
	            }
	        };

	        marker.end = function () {
	            this.range[1] = index;
	            this.loc.end.line = lineNumber;
	            this.loc.end.column = index - lineStart;
	        };

	        marker.applyGroup = function (node) {
	            if (extra.range) {
	                node.groupRange = [this.range[0], this.range[1]];
	            }
	            if (extra.loc) {
	                node.groupLoc = {
	                    start: {
	                        line: this.loc.start.line,
	                        column: this.loc.start.column
	                    },
	                    end: {
	                        line: this.loc.end.line,
	                        column: this.loc.end.column
	                    }
	                };
	            }
	        };

	        marker.apply = function (node) {
	            if (extra.range) {
	                node.range = [this.range[0], this.range[1]];
	            }
	            if (extra.loc) {
	                node.loc = {
	                    start: {
	                        line: this.loc.start.line,
	                        column: this.loc.start.column
	                    },
	                    end: {
	                        line: this.loc.end.line,
	                        column: this.loc.end.column
	                    }
	                };
	            }
	        };

	        return marker;
	    }

	    function trackGroupExpression() {
	        var marker, expr;

	        skipComment();
	        marker = createLocationMarker();
	        expect('(');

	        expr = parseExpression();

	        expect(')');

	        marker.end();
	        marker.applyGroup(expr);

	        return expr;
	    }

	    function trackLeftHandSideExpression() {
	        var marker, expr;

	        skipComment();
	        marker = createLocationMarker();

	        expr = matchKeyword('new') ? parseNewExpression() : parsePrimaryExpression();

	        while (match('.') || match('[')) {
	            if (match('[')) {
	                expr = {
	                    type: Syntax.MemberExpression,
	                    computed: true,
	                    object: expr,
	                    property: parseComputedMember()
	                };
	                marker.end();
	                marker.apply(expr);
	            } else {
	                expr = {
	                    type: Syntax.MemberExpression,
	                    computed: false,
	                    object: expr,
	                    property: parseNonComputedMember()
	                };
	                marker.end();
	                marker.apply(expr);
	            }
	        }

	        return expr;
	    }

	    function trackLeftHandSideExpressionAllowCall() {
	        var marker, expr;

	        skipComment();
	        marker = createLocationMarker();

	        expr = matchKeyword('new') ? parseNewExpression() : parsePrimaryExpression();

	        while (match('.') || match('[') || match('(')) {
	            if (match('(')) {
	                expr = {
	                    type: Syntax.CallExpression,
	                    callee: expr,
	                    'arguments': parseArguments()
	                };
	                marker.end();
	                marker.apply(expr);
	            } else if (match('[')) {
	                expr = {
	                    type: Syntax.MemberExpression,
	                    computed: true,
	                    object: expr,
	                    property: parseComputedMember()
	                };
	                marker.end();
	                marker.apply(expr);
	            } else {
	                expr = {
	                    type: Syntax.MemberExpression,
	                    computed: false,
	                    object: expr,
	                    property: parseNonComputedMember()
	                };
	                marker.end();
	                marker.apply(expr);
	            }
	        }

	        return expr;
	    }

	    function filterGroup(node) {
	        var n, i, entry;

	        n = (Object.prototype.toString.apply(node) === '[object Array]') ? [] : {};
	        for (i in node) {
	            if (node.hasOwnProperty(i) && i !== 'groupRange' && i !== 'groupLoc') {
	                entry = node[i];
	                if (entry === null || typeof entry !== 'object' || entry instanceof RegExp) {
	                    n[i] = entry;
	                } else {
	                    n[i] = filterGroup(entry);
	                }
	            }
	        }
	        return n;
	    }

	    function wrapTrackingFunction(range, loc) {

	        return function (parseFunction) {

	            function isBinary(node) {
	                return node.type === Syntax.LogicalExpression ||
	                    node.type === Syntax.BinaryExpression;
	            }

	            function visit(node) {
	                var start, end;

	                if (isBinary(node.left)) {
	                    visit(node.left);
	                }
	                if (isBinary(node.right)) {
	                    visit(node.right);
	                }

	                if (range) {
	                    if (node.left.groupRange || node.right.groupRange) {
	                        start = node.left.groupRange ? node.left.groupRange[0] : node.left.range[0];
	                        end = node.right.groupRange ? node.right.groupRange[1] : node.right.range[1];
	                        node.range = [start, end];
	                    } else if (typeof node.range === 'undefined') {
	                        start = node.left.range[0];
	                        end = node.right.range[1];
	                        node.range = [start, end];
	                    }
	                }
	                if (loc) {
	                    if (node.left.groupLoc || node.right.groupLoc) {
	                        start = node.left.groupLoc ? node.left.groupLoc.start : node.left.loc.start;
	                        end = node.right.groupLoc ? node.right.groupLoc.end : node.right.loc.end;
	                        node.loc = {
	                            start: start,
	                            end: end
	                        };
	                    } else if (typeof node.loc === 'undefined') {
	                        node.loc = {
	                            start: node.left.loc.start,
	                            end: node.right.loc.end
	                        };
	                    }
	                }
	            }

	            return function () {
	                var marker, node;

	                skipComment();

	                marker = createLocationMarker();
	                node = parseFunction.apply(null, arguments);
	                marker.end();

	                if (range && typeof node.range === 'undefined') {
	                    marker.apply(node);
	                }

	                if (loc && typeof node.loc === 'undefined') {
	                    marker.apply(node);
	                }

	                if (isBinary(node)) {
	                    visit(node);
	                }

	                return node;
	            };
	        };
	    }

	    function patch() {

	        var wrapTracking;

	        if (extra.comments) {
	            extra.skipComment = skipComment;
	            skipComment = scanComment;
	        }

	        if (extra.raw) {
	            extra.createLiteral = createLiteral;
	            createLiteral = createRawLiteral;
	        }

	        if (extra.range || extra.loc) {

	            extra.parseGroupExpression = parseGroupExpression;
	            extra.parseLeftHandSideExpression = parseLeftHandSideExpression;
	            extra.parseLeftHandSideExpressionAllowCall = parseLeftHandSideExpressionAllowCall;
	            parseGroupExpression = trackGroupExpression;
	            parseLeftHandSideExpression = trackLeftHandSideExpression;
	            parseLeftHandSideExpressionAllowCall = trackLeftHandSideExpressionAllowCall;

	            wrapTracking = wrapTrackingFunction(extra.range, extra.loc);

	            extra.parseAdditiveExpression = parseAdditiveExpression;
	            extra.parseAssignmentExpression = parseAssignmentExpression;
	            extra.parseBitwiseANDExpression = parseBitwiseANDExpression;
	            extra.parseBitwiseORExpression = parseBitwiseORExpression;
	            extra.parseBitwiseXORExpression = parseBitwiseXORExpression;
	            extra.parseBlock = parseBlock;
	            extra.parseFunctionSourceElements = parseFunctionSourceElements;
	            extra.parseCatchClause = parseCatchClause;
	            extra.parseComputedMember = parseComputedMember;
	            extra.parseConditionalExpression = parseConditionalExpression;
	            extra.parseConstLetDeclaration = parseConstLetDeclaration;
	            extra.parseEqualityExpression = parseEqualityExpression;
	            extra.parseExpression = parseExpression;
	            extra.parseForVariableDeclaration = parseForVariableDeclaration;
	            extra.parseFunctionDeclaration = parseFunctionDeclaration;
	            extra.parseFunctionExpression = parseFunctionExpression;
	            extra.parseLogicalANDExpression = parseLogicalANDExpression;
	            extra.parseLogicalORExpression = parseLogicalORExpression;
	            extra.parseMultiplicativeExpression = parseMultiplicativeExpression;
	            extra.parseNewExpression = parseNewExpression;
	            extra.parseNonComputedProperty = parseNonComputedProperty;
	            extra.parseObjectProperty = parseObjectProperty;
	            extra.parseObjectPropertyKey = parseObjectPropertyKey;
	            extra.parsePostfixExpression = parsePostfixExpression;
	            extra.parsePrimaryExpression = parsePrimaryExpression;
	            extra.parseProgram = parseProgram;
	            extra.parsePropertyFunction = parsePropertyFunction;
	            extra.parseRelationalExpression = parseRelationalExpression;
	            extra.parseStatement = parseStatement;
	            extra.parseShiftExpression = parseShiftExpression;
	            extra.parseSwitchCase = parseSwitchCase;
	            extra.parseUnaryExpression = parseUnaryExpression;
	            extra.parseVariableDeclaration = parseVariableDeclaration;
	            extra.parseVariableIdentifier = parseVariableIdentifier;

	            parseAdditiveExpression = wrapTracking(extra.parseAdditiveExpression);
	            parseAssignmentExpression = wrapTracking(extra.parseAssignmentExpression);
	            parseBitwiseANDExpression = wrapTracking(extra.parseBitwiseANDExpression);
	            parseBitwiseORExpression = wrapTracking(extra.parseBitwiseORExpression);
	            parseBitwiseXORExpression = wrapTracking(extra.parseBitwiseXORExpression);
	            parseBlock = wrapTracking(extra.parseBlock);
	            parseFunctionSourceElements = wrapTracking(extra.parseFunctionSourceElements);
	            parseCatchClause = wrapTracking(extra.parseCatchClause);
	            parseComputedMember = wrapTracking(extra.parseComputedMember);
	            parseConditionalExpression = wrapTracking(extra.parseConditionalExpression);
	            parseConstLetDeclaration = wrapTracking(extra.parseConstLetDeclaration);
	            parseEqualityExpression = wrapTracking(extra.parseEqualityExpression);
	            parseExpression = wrapTracking(extra.parseExpression);
	            parseForVariableDeclaration = wrapTracking(extra.parseForVariableDeclaration);
	            parseFunctionDeclaration = wrapTracking(extra.parseFunctionDeclaration);
	            parseFunctionExpression = wrapTracking(extra.parseFunctionExpression);
	            parseLeftHandSideExpression = wrapTracking(parseLeftHandSideExpression);
	            parseLogicalANDExpression = wrapTracking(extra.parseLogicalANDExpression);
	            parseLogicalORExpression = wrapTracking(extra.parseLogicalORExpression);
	            parseMultiplicativeExpression = wrapTracking(extra.parseMultiplicativeExpression);
	            parseNewExpression = wrapTracking(extra.parseNewExpression);
	            parseNonComputedProperty = wrapTracking(extra.parseNonComputedProperty);
	            parseObjectProperty = wrapTracking(extra.parseObjectProperty);
	            parseObjectPropertyKey = wrapTracking(extra.parseObjectPropertyKey);
	            parsePostfixExpression = wrapTracking(extra.parsePostfixExpression);
	            parsePrimaryExpression = wrapTracking(extra.parsePrimaryExpression);
	            parseProgram = wrapTracking(extra.parseProgram);
	            parsePropertyFunction = wrapTracking(extra.parsePropertyFunction);
	            parseRelationalExpression = wrapTracking(extra.parseRelationalExpression);
	            parseStatement = wrapTracking(extra.parseStatement);
	            parseShiftExpression = wrapTracking(extra.parseShiftExpression);
	            parseSwitchCase = wrapTracking(extra.parseSwitchCase);
	            parseUnaryExpression = wrapTracking(extra.parseUnaryExpression);
	            parseVariableDeclaration = wrapTracking(extra.parseVariableDeclaration);
	            parseVariableIdentifier = wrapTracking(extra.parseVariableIdentifier);
	        }

	        if (typeof extra.tokens !== 'undefined') {
	            extra.advance = advance;
	            extra.scanRegExp = scanRegExp;

	            advance = collectToken;
	            scanRegExp = collectRegex;
	        }
	    }

	    function unpatch() {
	        if (typeof extra.skipComment === 'function') {
	            skipComment = extra.skipComment;
	        }

	        if (extra.raw) {
	            createLiteral = extra.createLiteral;
	        }

	        if (extra.range || extra.loc) {
	            parseAdditiveExpression = extra.parseAdditiveExpression;
	            parseAssignmentExpression = extra.parseAssignmentExpression;
	            parseBitwiseANDExpression = extra.parseBitwiseANDExpression;
	            parseBitwiseORExpression = extra.parseBitwiseORExpression;
	            parseBitwiseXORExpression = extra.parseBitwiseXORExpression;
	            parseBlock = extra.parseBlock;
	            parseFunctionSourceElements = extra.parseFunctionSourceElements;
	            parseCatchClause = extra.parseCatchClause;
	            parseComputedMember = extra.parseComputedMember;
	            parseConditionalExpression = extra.parseConditionalExpression;
	            parseConstLetDeclaration = extra.parseConstLetDeclaration;
	            parseEqualityExpression = extra.parseEqualityExpression;
	            parseExpression = extra.parseExpression;
	            parseForVariableDeclaration = extra.parseForVariableDeclaration;
	            parseFunctionDeclaration = extra.parseFunctionDeclaration;
	            parseFunctionExpression = extra.parseFunctionExpression;
	            parseGroupExpression = extra.parseGroupExpression;
	            parseLeftHandSideExpression = extra.parseLeftHandSideExpression;
	            parseLeftHandSideExpressionAllowCall = extra.parseLeftHandSideExpressionAllowCall;
	            parseLogicalANDExpression = extra.parseLogicalANDExpression;
	            parseLogicalORExpression = extra.parseLogicalORExpression;
	            parseMultiplicativeExpression = extra.parseMultiplicativeExpression;
	            parseNewExpression = extra.parseNewExpression;
	            parseNonComputedProperty = extra.parseNonComputedProperty;
	            parseObjectProperty = extra.parseObjectProperty;
	            parseObjectPropertyKey = extra.parseObjectPropertyKey;
	            parsePrimaryExpression = extra.parsePrimaryExpression;
	            parsePostfixExpression = extra.parsePostfixExpression;
	            parseProgram = extra.parseProgram;
	            parsePropertyFunction = extra.parsePropertyFunction;
	            parseRelationalExpression = extra.parseRelationalExpression;
	            parseStatement = extra.parseStatement;
	            parseShiftExpression = extra.parseShiftExpression;
	            parseSwitchCase = extra.parseSwitchCase;
	            parseUnaryExpression = extra.parseUnaryExpression;
	            parseVariableDeclaration = extra.parseVariableDeclaration;
	            parseVariableIdentifier = extra.parseVariableIdentifier;
	        }

	        if (typeof extra.scanRegExp === 'function') {
	            advance = extra.advance;
	            scanRegExp = extra.scanRegExp;
	        }
	    }

	    function stringToArray(str) {
	        var length = str.length,
	            result = [],
	            i;
	        for (i = 0; i < length; ++i) {
	            result[i] = str.charAt(i);
	        }
	        return result;
	    }

	    function parse(code, options) {
	        var program, toString;

	        toString = String;
	        if (typeof code !== 'string' && !(code instanceof String)) {
	            code = toString(code);
	        }

	        source = code;
	        index = 0;
	        lineNumber = (source.length > 0) ? 1 : 0;
	        lineStart = 0;
	        length = source.length;
	        buffer = null;
	        state = {
	            allowIn: true,
	            labelSet: {},
	            inFunctionBody: false,
	            inIteration: false,
	            inSwitch: false
	        };

	        extra = {};
	        if (typeof options !== 'undefined') {
	            extra.range = (typeof options.range === 'boolean') && options.range;
	            extra.loc = (typeof options.loc === 'boolean') && options.loc;
	            extra.raw = (typeof options.raw === 'boolean') && options.raw;
	            if (typeof options.tokens === 'boolean' && options.tokens) {
	                extra.tokens = [];
	            }
	            if (typeof options.comment === 'boolean' && options.comment) {
	                extra.comments = [];
	            }
	            if (typeof options.tolerant === 'boolean' && options.tolerant) {
	                extra.errors = [];
	            }
	        }

	        if (length > 0) {
	            if (typeof source[0] === 'undefined') {
	                // Try first to convert to a string. This is good as fast path
	                // for old IE which understands string indexing for string
	                // literals only and not for string object.
	                if (code instanceof String) {
	                    source = code.valueOf();
	                }

	                // Force accessing the characters via an array.
	                if (typeof source[0] === 'undefined') {
	                    source = stringToArray(code);
	                }
	            }
	        }

	        patch();
	        try {
	            program = parseProgram();
	            if (typeof extra.comments !== 'undefined') {
	                filterCommentLocation();
	                program.comments = extra.comments;
	            }
	            if (typeof extra.tokens !== 'undefined') {
	                filterTokenLocation();
	                program.tokens = extra.tokens;
	            }
	            if (typeof extra.errors !== 'undefined') {
	                program.errors = extra.errors;
	            }
	            if (extra.range || extra.loc) {
	                program.body = filterGroup(program.body);
	            }
	        } catch (e) {
	            throw e;
	        } finally {
	            unpatch();
	            extra = {};
	        }

	        return program;
	    }

	    // Sync with package.json.
	    exports.version = '1.0.4';

	    exports.parse = parse;

	    // Deep copy.
	    exports.Syntax = (function () {
	        var name, types = {};

	        if (typeof Object.create === 'function') {
	            types = Object.create(null);
	        }

	        for (name in Syntax) {
	            if (Syntax.hasOwnProperty(name)) {
	                types[name] = Syntax[name];
	            }
	        }

	        if (typeof Object.freeze === 'function') {
	            Object.freeze(types);
	        }

	        return types;
	    }());

	}));
	/* vim: set sw=4 ts=4 et tw=80 : */


/***/ },
/* 67 */
/***/ function(module, exports, __webpack_require__) {

	var fmt = __webpack_require__(56);
	var is = __webpack_require__(55);
	var assert = __webpack_require__(4);

	function Stats() {
	    this.lets = 0;
	    this.consts = 0;
	    this.renames = [];
	}

	Stats.prototype.declarator = function(kind) {
	    assert(is.someof(kind, ["const", "let"]));
	    if (kind === "const") {
	        this.consts++;
	    } else {
	        this.lets++;
	    }
	};

	Stats.prototype.rename = function(oldName, newName, line) {
	    this.renames.push({
	        oldName: oldName,
	        newName: newName,
	        line: line,
	    });
	};

	Stats.prototype.toString = function() {
	//    console.log("defs.js stats for file {0}:", filename)

	    var renames = this.renames.map(function(r) {
	        return r;
	    }).sort(function(a, b) {
	            return a.line - b.line;
	        }); // sort a copy of renames

	    var renameStr = renames.map(function(rename) {
	        return fmt("\nline {0}: {1} => {2}", rename.line, rename.oldName, rename.newName);
	    }).join("");

	    var sum = this.consts + this.lets;
	    var constlets = (sum === 0 ?
	        "can't calculate const coverage (0 consts, 0 lets)" :
	        fmt("{0}% const coverage ({1} consts, {2} lets)",
	            Math.floor(100 * this.consts / sum), this.consts, this.lets));

	    return constlets + renameStr + "\n";
	};

	module.exports = Stats;


/***/ },
/* 68 */
/***/ function(module, exports) {

	// jshint -W001

	"use strict";

	// Identifiers provided by the ECMAScript standard.

	exports.reservedVars = {
		arguments : false,
		NaN       : false
	};

	exports.ecmaIdentifiers = {
		Array              : false,
		Boolean            : false,
		Date               : false,
		decodeURI          : false,
		decodeURIComponent : false,
		encodeURI          : false,
		encodeURIComponent : false,
		Error              : false,
		"eval"             : false,
		EvalError          : false,
		Function           : false,
		hasOwnProperty     : false,
		isFinite           : false,
		isNaN              : false,
		JSON               : false,
		Math               : false,
		Map                : false,
		Number             : false,
		Object             : false,
		parseInt           : false,
		parseFloat         : false,
		RangeError         : false,
		ReferenceError     : false,
		RegExp             : false,
		Set                : false,
		String             : false,
		SyntaxError        : false,
		TypeError          : false,
		URIError           : false,
		WeakMap            : false
	};

	// Global variables commonly provided by a web browser environment.

	exports.browser = {
		ArrayBuffer          : false,
		ArrayBufferView      : false,
		Audio                : false,
		Blob                 : false,
		addEventListener     : false,
		applicationCache     : false,
		atob                 : false,
		blur                 : false,
		btoa                 : false,
		clearInterval        : false,
		clearTimeout         : false,
		close                : false,
		closed               : false,
		DataView             : false,
		DOMParser            : false,
		defaultStatus        : false,
		document             : false,
		Element              : false,
		event                : false,
		FileReader           : false,
		Float32Array         : false,
		Float64Array         : false,
		FormData             : false,
		focus                : false,
		frames               : false,
		getComputedStyle     : false,
		HTMLElement          : false,
		HTMLAnchorElement    : false,
		HTMLBaseElement      : false,
		HTMLBlockquoteElement: false,
		HTMLBodyElement      : false,
		HTMLBRElement        : false,
		HTMLButtonElement    : false,
		HTMLCanvasElement    : false,
		HTMLDirectoryElement : false,
		HTMLDivElement       : false,
		HTMLDListElement     : false,
		HTMLFieldSetElement  : false,
		HTMLFontElement      : false,
		HTMLFormElement      : false,
		HTMLFrameElement     : false,
		HTMLFrameSetElement  : false,
		HTMLHeadElement      : false,
		HTMLHeadingElement   : false,
		HTMLHRElement        : false,
		HTMLHtmlElement      : false,
		HTMLIFrameElement    : false,
		HTMLImageElement     : false,
		HTMLInputElement     : false,
		HTMLIsIndexElement   : false,
		HTMLLabelElement     : false,
		HTMLLayerElement     : false,
		HTMLLegendElement    : false,
		HTMLLIElement        : false,
		HTMLLinkElement      : false,
		HTMLMapElement       : false,
		HTMLMenuElement      : false,
		HTMLMetaElement      : false,
		HTMLModElement       : false,
		HTMLObjectElement    : false,
		HTMLOListElement     : false,
		HTMLOptGroupElement  : false,
		HTMLOptionElement    : false,
		HTMLParagraphElement : false,
		HTMLParamElement     : false,
		HTMLPreElement       : false,
		HTMLQuoteElement     : false,
		HTMLScriptElement    : false,
		HTMLSelectElement    : false,
		HTMLStyleElement     : false,
		HTMLTableCaptionElement: false,
		HTMLTableCellElement : false,
		HTMLTableColElement  : false,
		HTMLTableElement     : false,
		HTMLTableRowElement  : false,
		HTMLTableSectionElement: false,
		HTMLTextAreaElement  : false,
		HTMLTitleElement     : false,
		HTMLUListElement     : false,
		HTMLVideoElement     : false,
		history              : false,
		Int16Array           : false,
		Int32Array           : false,
		Int8Array            : false,
		Image                : false,
		length               : false,
		localStorage         : false,
		location             : false,
		MessageChannel       : false,
		MessageEvent         : false,
		MessagePort          : false,
		moveBy               : false,
		moveTo               : false,
		MutationObserver     : false,
		name                 : false,
		Node                 : false,
		NodeFilter           : false,
		navigator            : false,
		onbeforeunload       : true,
		onblur               : true,
		onerror              : true,
		onfocus              : true,
		onload               : true,
		onresize             : true,
		onunload             : true,
		open                 : false,
		openDatabase         : false,
		opener               : false,
		Option               : false,
		parent               : false,
		print                : false,
		removeEventListener  : false,
		resizeBy             : false,
		resizeTo             : false,
		screen               : false,
		scroll               : false,
		scrollBy             : false,
		scrollTo             : false,
		sessionStorage       : false,
		setInterval          : false,
		setTimeout           : false,
		SharedWorker         : false,
		status               : false,
		top                  : false,
		Uint16Array          : false,
		Uint32Array          : false,
		Uint8Array           : false,
		Uint8ClampedArray    : false,
		WebSocket            : false,
		window               : false,
		Worker               : false,
		XMLHttpRequest       : false,
		XMLSerializer        : false,
		XPathEvaluator       : false,
		XPathException       : false,
		XPathExpression      : false,
		XPathNamespace       : false,
		XPathNSResolver      : false,
		XPathResult          : false
	};

	exports.devel = {
		alert  : false,
		confirm: false,
		console: false,
		Debug  : false,
		opera  : false,
		prompt : false
	};

	exports.worker = {
		importScripts: true,
		postMessage  : true,
		self         : true
	};

	// Widely adopted global names that are not part of ECMAScript standard
	exports.nonstandard = {
		escape  : false,
		unescape: false
	};

	// Globals provided by popular JavaScript environments.

	exports.couch = {
		"require" : false,
		respond   : false,
		getRow    : false,
		emit      : false,
		send      : false,
		start     : false,
		sum       : false,
		log       : false,
		exports   : false,
		module    : false,
		provides  : false
	};

	exports.node = {
		__filename   : false,
		__dirname    : false,
		Buffer       : false,
		DataView     : false,
		console      : false,
		exports      : true,  // In Node it is ok to exports = module.exports = foo();
		GLOBAL       : false,
		global       : false,
		module       : false,
		process      : false,
		require      : false,
		setTimeout   : false,
		clearTimeout : false,
		setInterval  : false,
		clearInterval: false
	};

	exports.phantom = {
		phantom      : true,
		require      : true,
		WebPage      : true
	};

	exports.rhino = {
		defineClass  : false,
		deserialize  : false,
		gc           : false,
		help         : false,
		importPackage: false,
		"java"       : false,
		load         : false,
		loadClass    : false,
		print        : false,
		quit         : false,
		readFile     : false,
		readUrl      : false,
		runCommand   : false,
		seal         : false,
		serialize    : false,
		spawn        : false,
		sync         : false,
		toint32      : false,
		version      : false
	};

	exports.wsh = {
		ActiveXObject            : true,
		Enumerator               : true,
		GetObject                : true,
		ScriptEngine             : true,
		ScriptEngineBuildVersion : true,
		ScriptEngineMajorVersion : true,
		ScriptEngineMinorVersion : true,
		VBArray                  : true,
		WSH                      : true,
		WScript                  : true,
		XDomainRequest           : true
	};

	// Globals provided by popular JavaScript libraries.

	exports.dojo = {
		dojo     : false,
		dijit    : false,
		dojox    : false,
		define	 : false,
		"require": false
	};

	exports.jquery = {
		"$"    : false,
		jQuery : false
	};

	exports.mootools = {
		"$"           : false,
		"$$"          : false,
		Asset         : false,
		Browser       : false,
		Chain         : false,
		Class         : false,
		Color         : false,
		Cookie        : false,
		Core          : false,
		Document      : false,
		DomReady      : false,
		DOMEvent      : false,
		DOMReady      : false,
		Drag          : false,
		Element       : false,
		Elements      : false,
		Event         : false,
		Events        : false,
		Fx            : false,
		Group         : false,
		Hash          : false,
		HtmlTable     : false,
		Iframe        : false,
		IframeShim    : false,
		InputValidator: false,
		instanceOf    : false,
		Keyboard      : false,
		Locale        : false,
		Mask          : false,
		MooTools      : false,
		Native        : false,
		Options       : false,
		OverText      : false,
		Request       : false,
		Scroller      : false,
		Slick         : false,
		Slider        : false,
		Sortables     : false,
		Spinner       : false,
		Swiff         : false,
		Tips          : false,
		Type          : false,
		typeOf        : false,
		URI           : false,
		Window        : false
	};

	exports.prototypejs = {
		"$"               : false,
		"$$"              : false,
		"$A"              : false,
		"$F"              : false,
		"$H"              : false,
		"$R"              : false,
		"$break"          : false,
		"$continue"       : false,
		"$w"              : false,
		Abstract          : false,
		Ajax              : false,
		Class             : false,
		Enumerable        : false,
		Element           : false,
		Event             : false,
		Field             : false,
		Form              : false,
		Hash              : false,
		Insertion         : false,
		ObjectRange       : false,
		PeriodicalExecuter: false,
		Position          : false,
		Prototype         : false,
		Selector          : false,
		Template          : false,
		Toggle            : false,
		Try               : false,
		Autocompleter     : false,
		Builder           : false,
		Control           : false,
		Draggable         : false,
		Draggables        : false,
		Droppables        : false,
		Effect            : false,
		Sortable          : false,
		SortableObserver  : false,
		Sound             : false,
		Scriptaculous     : false
	};

	exports.yui = {
		YUI       : false,
		Y         : false,
		YUI_config: false
	};



/***/ }
/******/ ]);