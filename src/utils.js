Components.utils.import("resource:///modules/mailServices.js");

var synchDirection = {
	both : 0,
	down : 1,
	up : 2,

	isBoth : function() {
		return getPref("Synch.direction") == synchDirection.both;
	},
	isDownload : function() {
		return getPref("Synch.direction") == synchDirection.down;
	},
	isUpload : function() {
		return getPref("Synch.direction") == synchDirection.up;
	}
};

var log = {
	app : null,
	file : null,
	
	writeLn : function(str) {	
		if (getPref("Log.Active")) {
			switch (getPref("Log.ToFile")) {
			case false:
				if (log.app === null) {
					log.app = Components.classes["@mozilla.org/steel/application;1"].
						getService(Components.interfaces.steelIApplication);
				}
				log.app.console.log(str);
				break;
			case true:
				if (this.File === null) {
					let today = new Date();
					let dd = today.getDate();
					if (dd < 10)
					    dd = "0" + dd;					
					let mm = today.getMonth() + 1;
					if (mm < 10)
					    mm = "0" + mm;					
					let logFile = today.getFullYear() + mm + dd + ".log";
					
					let id = addonId;
					this.File =
						FileUtils.getFile("ProfD", ["extensions", id, "data", "logs", logFile], false);
					if (!this.File.exists())
						this.File.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
				}
				
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
				
				let outStream = FileUtils.openFileOutputStream(this.File, FileUtils.MODE_WRONLY | FileUtils.MODE_APPEND);
				let converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].
				                createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
				converter.charset = "UTF-8";				
				let inStream = converter.convertToInputStream(
						hh + ":" + mm + ":" + ss + " " + str + "\r\n");
				NetUtil.asyncCopy(inStream, outStream);				
				break;
			}		
		}
	}
};

const fileMenuitemID = "menu_SyncItem";

function addMenuItem(strMenuPopup, strMenuItemRef, callback) {	
	var doc = win.document;

	function removeMenuItem() {
		var menuitem = doc.getElementById(fileMenuitemID);
		if (menuitem !== null)
			menuitem.parentNode.removeChild(menuitem);
	}
	removeMenuItem();

	let menuItemSync = doc.createElementNS(NS_XUL, "menuitem");	
	menuItemSync.setAttribute("id", fileMenuitemID);
	menuItemSync.setAttribute("label", _("synchronize", getPref("locale")));
	menuItemSync.addEventListener("command", synchronize, true);
	
	let menuItemRef = doc.getElementById(strMenuItemRef);
	if (menuItemRef === null) {
		log.WriteLn("addMenuItem. Could not find menu item: " + strMenuItemRef);
		return;		
	}
	let menuPopup = doc.getElementById(strMenuPopup);
	if (menuPopup === null) {
		log.WriteLn("addMenuItem. Could not find menu popup: " + strMenuPopup);
		return;		
	}		
	menuPopup.insertBefore(menuItemSync, menuItemRef);	
	
	function synchronize() {
		callback();		
	}

	unload(removeMenuItem, win);
}

function getRootFolder() {
	let selServer = null;
	let accountKey = getPref("Synch.account");
	for each (var account in fixIterator(MailServices.accounts.accounts, Components.interfaces.nsIMsgAccount)) {
		let server = account.incomingServer;
		if (server) {
			if ("rss" == server.type &&
				account.key == accountKey) {
				selServer = server;
				break;
			}
		}
	}		
	if (selServer === null) {
		log.WriteLn("getRootFolder. No server found. Account Key = " + accountKey);
		return null;			
	}							
	let rootFolder = selServer.rootFolder;
	if (rootFolder === null) {
		log.WriteLn("getRootFolder. No root folder. Account Key = " + accountKey);
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