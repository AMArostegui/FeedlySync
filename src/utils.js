// Feedly Synchronizer AddOn for Mozilla Thunderbird
// Developed by Antonio Miras Aróstegui
// Published under Mozilla Public License, version 2.0 (https://www.mozilla.org/MPL/2.0/)

Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://gre/modules/FileUtils.jsm");
Components.utils.import("resource://gre/modules/NetUtil.jsm");

var synchDirection = {
	both : 0,
	down : 1,
	up : 2,

	isBoth : function() {
		return getPref("synch.direction") == synchDirection.both;
	},
	isDownload : function() {
		return getPref("synch.direction") == synchDirection.down;
	},
	isUpload : function() {
		return getPref("synch.direction") == synchDirection.up;
	}
};

var log = {
	app : null,
	eol : null,
	file : null,

	writeLn : function(str) {
		if (getPref("log.active")) {
			let now = new Date();

			let hh = now.getHours();
			if (hh < 10)
				hh = "0" + hh;
			let mm = now.getMinutes();
			if (mm < 10)
				mm = "0" + mm;
			let ss = now.getSeconds();
			if (ss < 10)
				ss = "0" + ss;

			let dd = now.getDate();
			if (dd < 10)
			    dd = "0" + dd;
			let MM = now.getMonth() + 1;
			if (MM < 10)
			    MM = "0" + MM;

			let logStr = "(" + now.getFullYear() + "/" + MM + "/" + dd + " " + hh + ":" + mm + ":" + ss + ") " + str;

			if (log.app === null) {
				log.app = Components.classes["@mozilla.org/steel/application;1"].
					getService(Components.interfaces.steelIApplication);
				if (log.app.platformIsWindows)
					log.eol = '\r\n';
				else if (log.app.platformIsMac)
					log.eol = '\r';
				else
					log.eol = '\n';
			}

			switch (getPref("log.toFile")) {
				case false:
					log.app.console.log("FeedlySync: " + logStr);
					break;
				case true:
					if (log.file === null) {
						let logFile = now.getFullYear() + MM + dd + ".log";
						let id = addonId;
						log.file =
							FileUtils.getFile("ProfD", [id, "data", "logs", logFile], false);
						if (!log.file.exists())
							log.file.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
					}

					let outStream = FileUtils.openFileOutputStream(log.file, FileUtils.MODE_WRONLY | FileUtils.MODE_APPEND);
					let converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].
					                createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
					converter.charset = "UTF-8";
					let inStream = converter.convertToInputStream(logStr + log.eol + log.eol);
					NetUtil.asyncCopy(inStream, outStream);
					break;
			}
		}
	}
};

// Main parts of this object taken from Bitcoin Venezuela Add-On. (c) Alexander Salas
var guiElements = {
	synchCallback : null,
	testsCallback : null,
	uriResolver : null,

	startup : function(synchCallback, testsCallback, uriResolver) {
		guiElements.synchCallback = synchCallback;
		guiElements.testsCallback = testsCallback;
		guiElements.uriResolver = uriResolver;

		guiElements.addMenuItem("taskPopup", "sanitizeHistory");
		guiElements.addToolbarBtn();
	},

	toolbarBtnID : "tbBtn_SyncItem",
	toolbarBtn : null,

	saveToolbarInfo : function(aEvt) {
		let tbId = "";
		if (guiElements.toolbarBtn.parentNode !== null)
			tbId = guiElements.toolbarBtn.parentNode.getAttribute("id");
		setPref("toolbar", tbId);

		let tbb4Id = (guiElements.toolbarBtn.nextSibling || "")	&&
			guiElements.toolbarBtn.nextSibling.getAttribute("id").replace(/^wrapper-/i, "");
		setPref("toolbar.before", tbb4Id);
	},

	delToolbarBtn : function() {
		if (guiElements.toolbarBtn !== null)
			guiElements.toolbarBtn.parentNode.removeChild(guiElements.toolbarBtn);
	},

	addToolbarBtn : function() {
		let doc = win.document;

		guiElements.toolbarBtn = doc.createElementNS(NS_XUL, "toolbarbutton");
		guiElements.toolbarBtn.setAttribute("id", guiElements.toolbarBtnID);
		guiElements.toolbarBtn.setAttribute("type", "button");
		guiElements.toolbarBtn.setAttribute("image", guiElements.uriResolver.getResourceURI("icon24BW.png").spec);
		guiElements.toolbarBtn.setAttribute("label", _("synchShort", retrieveLocale()));
		guiElements.toolbarBtn.addEventListener("command", guiElements.synchCallback, true);

		let tbox = doc.getElementById("navigator-toolbox") || doc.getElementById("mail-toolbox");
		if (tbox === null) {
			log.writeLn("guiElements.addToolbarBtn. Could not find toolbar");
			return;
		}
		tbox.palette.appendChild(guiElements.toolbarBtn);

		let tbId = getPref("toolbar");
		if (tbId) {
			let tb = doc.getElementById(tbId);
			if (tb) {
				let tbb4Id = getPref("toolbar.before");
				let tbb4 = doc.getElementById(tbb4Id);
				if (!tbb4) {
					let currentset = tb.getAttribute("currentset").split(",");
					let i = currentset.indexOf(guiElements.toolbarBtnID) + 1;
					if (i > 0) {
						let len = currentset.length;
						for (; i < len; i++) {
							tbb4 = doc.getElementById(currentset[i]);
							if (tbb4)
								break;
						}
					}
				}
				tb.insertItem(guiElements.toolbarBtnID, tbb4, null, false);
			}
		}

		win.addEventListener("aftercustomization", guiElements.saveToolbarInfo, false);
		unload(guiElements.delToolbarBtn, win);
	},

	fileMenuitemID : "menu_SyncItem",
	fileMenuitemTestID : "menu_SyncTestItem",

	delMenuItem : function() {
		let doc = win.document;

		let menuitem = doc.getElementById(guiElements.fileMenuitemID);
		if (menuitem !== null)
			menuitem.parentNode.removeChild(menuitem);

		let menuitemTests = doc.getElementById(guiElements.fileMenuitemTestID);
		if (menuitemTests !== null)
			menuitemTests.parentNode.removeChild(menuitemTests);
	},

	addMenuItem : function(strMenuPopup, strMenuItemRef) {
		let doc = win.document;

		guiElements.delMenuItem();

		let menuItemSync = doc.createElementNS(NS_XUL, "menuitem");
		menuItemSync.setAttribute("id", guiElements.fileMenuitemID);
		menuItemSync.setAttribute("label", _("synchronize", retrieveLocale()));
		menuItemSync.addEventListener("command", guiElements.synchCallback, true);

		let menuItemRef = doc.getElementById(strMenuItemRef);
		if (menuItemRef === null) {
			log.writeLn("guiElements.addMenuItem. Could not find menu item: " + strMenuItemRef);
			return;
		}
		let menuPopup = doc.getElementById(strMenuPopup);
		if (menuPopup === null) {
			log.writeLn("guiElements.addMenuItem. Could not find menu popup: " + strMenuPopup);
			return;
		}
		menuPopup.insertBefore(menuItemSync, menuItemRef);

		// Debug menu item. Run tests
		if (getPref("debug.active") === true) {
			let menuItemTests = doc.createElementNS(NS_XUL, "menuitem");
			menuItemTests.setAttribute("id", guiElements.fileMenuitemTestID);
			menuItemTests.setAttribute("label", _("runTests", retrieveLocale()));
			menuItemTests.addEventListener("command", guiElements.testsCallback, true);
			menuPopup.insertBefore(menuItemTests, menuItemSync);
		}

		unload(guiElements.delMenuItem, win);
	},
};

function retrieveLocale() {
	// Looks like this function wouldn't be necessary if l10n.js was initialized later
	return Components.classes["@mozilla.org/chrome/chrome-registry;1"]
		.getService(Components.interfaces.nsIXULChromeRegistry).getSelectedLocale("global");
}

function getRootFolder() {
	let accountKey = getPref("synch.account");
	let account = MailServices.accounts.getAccount(accountKey);
	if (account === null)
		return null;

	let server = account.incomingServer;
	if (server === null) {
		log.writeLn("getRootFolder. No incoming server. Unexpected situation. Account Key = " + accountKey);
		return null;
	}
	if (server.type !== "rss") {
		log.writeLn("getRootFolder. Wrong incoming server type. Unexpected situation. Account Key = " + accountKey);
		return null;
	}

	let rootFolder = server.rootFolder;
	if (rootFolder === null) {
		log.writeLn("getRootFolder. No root folder. Unexpected situation. Account Key = " + accountKey);
		return null;
	}
	return rootFolder;
}

function formatEventMsg(message, evnt, i, j) {
	return message +
			(i !== undefined && j !== undefined ? " (" + (i + 1) + "/" + j + ")" : "") +
			" Url: " + evnt.currentTarget.channel.URI.spec +
			" Status: " + evnt.currentTarget.status + " Status Text: " + evnt.currentTarget.statusText +
			" Response text: " + evnt.currentTarget.responseText;
}

function getParameterByName(val, location) {
    let tmp = [];
    let items = location.search.substr(1).split("&");
    for (var index = 0; index < items.length; index++) {
        tmp = items[index].split("=");
        if (tmp[0] === val)
        	return decodeURIComponent(tmp[1]);
    }
    return "";
}