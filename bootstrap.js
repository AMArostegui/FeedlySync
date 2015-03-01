/*
 *	Feedly Synchronizer Add-on for Mozilla Thunderbird.
 *	Copyright (C) 2015  Antonio Miras
 *
 *	This program is free software: you can redistribute it and/or modify
 *	it under the terms of the GNU General Public License as published by
 *	the Free Software Foundation, either version 3 of the License, or
 *	(at your option) any later version.
 *
 *	This program is distributed in the hope that it will be useful,
 *	but WITHOUT ANY WARRANTY; without even the implied warranty of
 *	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *	GNU General Public License for more details.
 *
 *	Original Author: Antonio Miras <amarostegui@outlook.es>
 *
 */

const NS_XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

// BEGIN: Code taken from Bitcoin Venezuela Add-On. (c) Alexander Salas

(function(global) {
	var modules = {};
	global.require = function require(src) {
		if (modules[src])
			return modules[src];
		var scope = { require : global.require, exports : {} };
		var tools = {};
		Components.utils.import("resource://gre/modules/Services.jsm", tools);
		var baseURI = tools.Services.io.newURI(__SCRIPT_URI_SPEC__, null, null);
		try {
			var uri = tools.Services.io.newURI(
					"packages/" + src + ".js", null, baseURI);
			tools.Services.scriptloader.loadSubScript(uri.spec, scope);
		} catch (e) {
			var uri = tools.Services.io.newURI(src, null, baseURI);
			tools.Services.scriptloader.loadSubScript(uri.spec, scope);
		}
		return modules[src] = scope.exports;
	};
})(this);

(function(global) global.include = function include(src) {
	let o = {};
	Components.utils.import("resource://gre/modules/Services.jsm", o);
	let uri = o.Services.io.newURI(src, null, o.Services.io.newURI(__SCRIPT_URI_SPEC__, null, null));
	o.Services.scriptloader.loadSubScript(uri.spec, global);
})(this);

var { unload } = require("unload");
var { runOnLoad, runOnWindows, watchWindows } = require("window-utils");

// END: Code taken from Bitcoin Venezuela Add-On. (c) Alexander Salas

var win = null;
var addonId = "FeedlySync@AMArostegui";

include("src/fsprefs.js");
include("packages/prefs.js");
include("src/utils.js");
include("src/feedevents.js");
include("packages/l10n.js");
include("src/auth.js");

function install(data) {
}

function uninstall() {
}

function startup(data, reason) {
	let uriResolver = {
		getResourceURI: function(filePath) ({
			spec: __SCRIPT_URI_SPEC__ + "/../" + filePath
		})
	};
	l10n(uriResolver, "FeedlySync.properties");
	unload(l10n.unload);

	setDefaultPrefs();
	watchWindows(main, "mail:3pane");
}

function shutdown(data, reason) {
	feedEvents.removeListener();
	unload();
}

function main(window) {
	win = window;
	addMenuItem("taskPopup", "sanitizeHistory", syncTBFeedly);
	synch.readStatusFile();
	feedEvents.addListener();
}

function syncTBFeedly() {
	let action = function() {
		synch.init();
	};
	synch.authAndRun(action);
}