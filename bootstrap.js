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
const fileMenuitemID = "menu_SyncItem";

const PREF_BRANCH = "extensions.FeedlySync.";
const PREFS = {
	// Global preferences	
	locale : Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIXULChromeRegistry).getSelectedLocale("global"),	
	baseUrl : "http://sandbox.feedly.com",
	baseSslUrl : "https://sandbox.feedly.com",
	
	// Log preferences	
	"Log.Active" : false,
	"Log.Output" : 0,	
	
	//Authentication preferences
	"Auth.getCodeOp" : "/v3/auth/auth",
	"Auth.getTokenOp" : "/v3/auth/token",
	"Auth.redirSetCode" : "",				 // "/feedlySetCode"
	"Auth.redirSetToken" : "", 			 // "/feedlySetToken"
	"Auth.redirGetCode" : "/addOnGetCode",
	"Auth.redirGetToken" : "/addOnGetToken",

	"Auth.resTypePar" : "response_type",
	"Auth.resTypeVal" : "code",
	"Auth.cliIdPar" : "client_id",
	"Auth.cliIdVal" : "sandbox",
	"Auth.cliSecPar" : "client_secret",
	"Auth.cliSecVal" : "YDRYI5E8OP2JKXYSDW79",
	"Auth.redirPar" : "redirect_uri",
	"Auth.redirVal" : "http://localhost:8080",
	"Auth.scopePar" : "scope",
	"Auth.scopeVal" : "https://cloud.feedly.com/subscriptions",
	"Auth.statePar" : "state",
	"Auth.codePar" : "code",
	"Auth.grantTypePar" : "grant_type",
	"Auth.grantTypeVal" : "authorization_code",
	"Auth.refreshTokenPar" : "refresh_token",	

	"Auth.domainGoogle" : "accounts.google.com",
	"Auth.domainTwitter" : "twitterState",
	"Auth.domainLive" : "login.live.com",
	"Auth.domainFacebook" : "www.facebook.com",
	"Auth.domainRedir" : "localhost",

	"Auth.retryMax" : 20,
	"Auth.delayFirst" : 3000,
	"Auth.delayRetry1" : 3000,
	"Auth.delayRetry2" : 6000,
	
	"Auth.tokenRefresh" : "",
	"Auth.userId" : "",
	"Auth.expiringMargin" : 90,	
	
	// Synchronizing preferences	
	"Synch.tokenParam" : "Authorization",
	"Synch.subsOp" : "/v3/subscriptions",
	"Synch.account" : "",
	"Synch.downloadOnly" : false,
};

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

include("src/utils.js");
include("includes/l10n.js");
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
	watchWindows(main, "mail:3pane");
}

function shutdown(data, reason) {
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