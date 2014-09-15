/* 
 *	Feedly Synchronizer Add-on for Mozilla Thunderbird.
 *	Copyright (C) 2014  Antonio Miras
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

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;
Cu.import("resource://gre/modules/Services.jsm");

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
	}
})(this);

(function(global) global.include = function include(src) {
	var o = {};
	Components.utils.import("resource://gre/modules/Services.jsm", o);
	var uri = o.Services.io.newURI(
			src, null, o.Services.io.newURI(__SCRIPT_URI_SPEC__, null, null));
	o.Services.scriptloader.loadSubScript(uri.spec, global);
})(this);

var addon = {
	getResourceURI: function(filePath) ({
		spec: __SCRIPT_URI_SPEC__ + "/../" + filePath
	})
}
var { unload } = require("unload");
var { runOnLoad, runOnWindows, watchWindows } = require("window-utils");

// END: Code taken from Bitcoin Venezuela Add-On. (c) Alexander Salas

var app = Cc["@mozilla.org/steel/application;1"].
	getService(Components.interfaces.steelIApplication);
var win = null;
var addonId = "FeedlySync@AMArostegui";

include("src/utils.js");
include("includes/l10n.js");
include("src/fsprefs.js");
include("includes/prefs.js");
include("src/auth.js");

function install(data) {
}

function uninstall() {	
}

function startup(data, reason) {
	l10n(addon, "FeedlySync.properties");
	unload(l10n.unload);
	setDefaultPrefs();
	Synch.AddFolderListener();
	watchWindows(main, "mail:3pane");
}

function shutdown(data, reason) {
	Synch.RemoveFolderListener();
	unload();
}

function main(window) {
	win = window;
	addMenuItem("taskPopup", "sanitizeHistory", syncTBFeedly);
}

function syncTBFeedly() {	
	if (Auth.tokenAccess == "")
		Auth.Init();
	else
		Synch.Init();
}