Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource:///modules/iteratorUtils.jsm");

function onLoad() {
	// Clean combobox
	let popup = document.getElementById("accountPopup");
	if (popup == null)
		return;	
	while (popup.firstChild)
	    popup.removeChild(popup.firstChild);
	
	// Preferences
	let prefLocale = Components.classes["@mozilla.org/chrome/chrome-registry;1"]
					 .getService(Components.interfaces.nsIXULChromeRegistry)
					 .getSelectedLocale("global");	
	let prefBranch = Components.classes["@mozilla.org/preferences-service;1"]
					 .getService(Components.interfaces.nsIPrefService)
					 .getBranch("extensions.FeedlySync.");
	let prefFolder = "";
	if (prefBranch != null) {
		prefFolder = prefBranch.getCharPref("Synch.account");
		prefLocale = prefBranch.getCharPref("locale");		
	}
	
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
				popup.appendChild(menuItem);
				count++;
			}
		}
	}
	
	// No RSS accounts or nothing selected yet. Populate combobox with dummy node	
	if (sel == -1 || count <= 0) {
		let menuItem = document.createElement("menuitem");
		menuItem.setAttribute("label", _("syncAccountNone", prefLocale));
		menuItem.setAttribute("value", "");
		popup.appendChild(menuItem);		
		return;		
	}
			
	let list = document.getElementById("accountList");
	if (list == null)
		return;
	list.selectedIndex = sel;
}

function onNewAccount() {
	  window.openDialog("chrome://messenger-newsblog/content/feedAccountWizard.xul",
              "", "chrome,modal,titlebar,centerscreen");
	  onLoad();
}