Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource:///modules/iteratorUtils.jsm");
Components.utils.import("resource://gre/modules/AddonManager.jsm");

let addonId = "FeedlySync@AMArostegui";
let loadedModules = false;

function include(src, uriSpec) {
	let o = {};
	Components.utils.import("resource://gre/modules/Services.jsm", o);
	let uri = o.Services.io.newURI(src, null, o.Services.io.newURI(uriSpec, null, null));
	o.Services.scriptloader.loadSubScript(uri.spec, this);
}

function loadModules(addon) {
	let resourceUri = addon.getResourceURI();
	let addonUriSpec = resourceUri.spec + "bootstrap.js";

	include("src/fsprefs.js", addonUriSpec);
	include("includes/prefs.js", addonUriSpec);
	include("src/utils.js", addonUriSpec);
	include("includes/l10n.js", addonUriSpec);

	loadedModules = true;
	onLoad();
}

function onLoad() {
	if (!loadedModules) {
		AddonManager.getAddonByID(addonId, loadModules);
		return;
	}

	// Clean combobox
	Log.WriteLn("Options.onLoad");
	let popup = document.getElementById("accountPopup");
	if (popup == null)
		return;	
	while (popup.firstChild)
	    popup.removeChild(popup.firstChild);
	
	let prefFolder = getPref("Synch.account");
	let prefLocale = getPref("locale");
	
	// Populate combobox	
	let count = 0;
	let sel = -1;	
	for each (let account in fixIterator(MailServices.accounts.accounts,
			Components.interfaces.nsIMsgAccount)) {			
		let server = account.incomingServer;
		if (server) {
			if ("rss" == server.type) {
				if (prefFolder == server.prettyName)
					sel = count;
				
				let menuItem = document.createElement("menuitem");
				menuItem.setAttribute("label", server.prettyName);
				menuItem.setAttribute("value", server.prettyName);
				menuItem.setAttribute("oncommand", "onSelected('" + server.prettyName + "')");
				popup.appendChild(menuItem);
				count++;
			}
		}
	}
	
	// No RSS accounts or nothing selected yet. Populate combobox with dummy node
	Log.WriteLn("Options.onLoad. Selected Folder = " + sel + " Folder Count = " + count);
	if (sel == -1 || count <= 0) {
		let menuItem = document.createElement("menuitem");
		menuItem.setAttribute("label", _("syncAccountNone", prefLocale));
		menuItem.setAttribute("value", "");
		menuItem.setAttribute("oncommand", "onSelected('')");
		popup.appendChild(menuItem);		
		return;		
	}
			
	let list = document.getElementById("accountList");
	if (list == null)
		return;
	list.selectedIndex = sel;
}

function onSelected(selected) {
	Log.WriteLn("Options.onSelected. Selected=" + selected);
	setPref("Synch.account", selected);
}

function onNewAccount() {
	window.openDialog("chrome://messenger-newsblog/content/feedAccountWizard.xul",
			"", "chrome,modal,titlebar,centerscreen");
	onLoad();
}