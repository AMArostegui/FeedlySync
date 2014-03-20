const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let {Services} = Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

const NS_XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const fileMenuitemID = "menu_SyncItem";

var theAddOn = null;

function include(aAddon, aPath) {
	var path = aAddon.resourceURI.spec + aPath;
	Services.scriptloader.loadSubScript(path);
}

function startup(data, reason) {	
	theAddOn = data;
	include(data, "includes/utils.js");
	watchWindows(attachMI, "mail:3pane");
}

function shutdown(data, reason) {
	unload();
}

function install(data, reason) {
}

function uninstall(data, reason) {
}

function attachMI(wnd) {
	let menuItemSync = wnd.document.createElementNS(NS_XUL, "menuitem");	
	menuItemSync.setAttribute("id", fileMenuitemID);
	menuItemSync.setAttribute("label", "Synchronize Feeds with Feedly account");
	menuItemSync.addEventListener("command", synchronize, true);
	//menuItemSync.addEventListener("command", AuthController.syncTBFeedly(wnd), true);
	//menuItemSync.setAttribute("oncommand", "AuthController.syncTBFeedly(wnd)");
	//menuItemSync.setAttribute("oncommand", "PersonaController.openURLInTab(this.getAttribute('href'))");
	
	var menuItemClose = wnd.document.getElementById("menu_FileQuitItem");
	var menuItemPopup = wnd.document.getElementById("menu_FilePopup");
	menuItemPopup.insertBefore(menuItemSync, menuItemClose);
	
	unload(function() {
		menuItemSync.parentNode.removeChild(menuItemSync);
	}, wnd);	
	
	function synchronize() {
		//include(theAddOn, "src/synchronize.js");
		AuthController.syncTBFeedly(wnd);		
	}
}

var app = Components.classes["@mozilla.org/steel/application;1"]
					.getService(Components.interfaces.steelIApplication);

var baseUrl = "http://sandbox.feedly.com";	
var authUrl = "/v3/auth/auth";
var authParams = "response_type=code&client_id=sandbox&" + 
"redirect_uri=http://localhost:8080&" +
"scope=https://cloud.feedly.com/subscriptions";

var googleAuth = "accounts.google.com";
var twitterAuth = "twitterState";
var liveAuth = "login.live.com";
var facebookAuth = "www.facebook.com";

var retUrl = "localhost";
var retCode = "";

var window = null;

function OnLoadBrowser() {
	app.console.log("OnLoad Browser");
	if (browser.location.href.indexOf(retUrl) != -1) {

		var searchString = browser.location.search;
		searchString = searchString.substring(1);
		var nvPairs = searchString.split("&");
		for (i = 0; i < nvPairs.length; i++)
		{
			var nvPair = nvPairs[i].split("=");
			var name = nvPair[0];
			var value = nvPair[1];
			if (name == "code") {
				retCode = value;
				break;
			}
		}
	}		        		
}

let AuthController = {
	syncTBFeedly: function (wnd) {
		window = wnd;
		this.AuthGetCodeReq();
		//this.AuthGetCodeBrowser();
		app.console.log(retCode);
		this.AuthGetTokens();
	},
	
	AuthGetCodeReq: function () {
		var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
		.createInstance(Components.interfaces.nsIXMLHttpRequest);		
		req.open("GET", baseUrl + authUrl + "?" + authParams, true);
		req.responseType = "document";
		req.onreadystatechange = function () {
			if (req.readyState == 4) {
				if(req.status == 200) {
//					app.console.log(req.responseText);
					
					// TODO: Url should be retrieved in a proper way				
//					var dom = window.document.createElement("div");
//					dom.innerHTML = '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd"><html><head></head><body></body></html>';
//					dom.innerHTML = req.responseText;				
					var elementsA = req.responseXML.getElementsByTagName("a");
					var link3rdParty = elementsA[0].href;
					app.console.log(link3rdParty);
					
					
					
					var req3rdParty = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
					.createInstance(Components.interfaces.nsIXMLHttpRequest);		
					req3rdParty.open("GET", link3rdParty, true);
//					req3rdParty.responseType = "document";
					req3rdParty.onreadystatechange = function () {
						if (req3rdParty.readyState == 4) {
							if(req3rdParty.status == 200) {
								app.console.log(req3rdParty.responseText);
								
								// TODO: Url should be retrieved in a proper way				
////								var dom = window.document.createElement("div");
////								dom.innerHTML = '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd"><html><head></head><body></body></html>';
////								dom.innerHTML = req.responseText;				
//								var elementsA = req.responseXML.getElementsByTagName("a");
//								var link3rdParty = elementsA[0].href;
//								app.console.log(link3rdParty);
								
								
								
							}					
							else
								app.console.log("Error loading page\n");
						}
					};
					req3rdParty.send(null);
					
					
					
					
					
					
					
					
					
					
					
					
					
					
					
					
					
					
					
					
				}					
				else
					app.console.log("Error loading page\n");
			}
		};        
		req.send(null);
	},	
	
	AuthGetCodeBrowser: function () {
		retCode = "";	
		this.openURLInTab(baseUrl + authUrl + "?" + authParams);	
	},

	AuthGetTokens: function () {	
	},	
		
	get _thunderbirdRegExp() {
		delete this._thunderbirdRegExp;
//			return this._thunderbirdRegExp = new RegExp(googleAuth +
//			"|" + twitterAuth + "|" + liveAuth +
//			"|" + facebookAuth + "|" + retUrl);
		return this._thunderbirdRegExp = new RegExp("yahoo");
	},

	openURLInTab: function (url) {
		window.document.getElementById("tabmail").openTab("contentTab", {
			//contentPage: url,
			contentPage: "http://www.yahoo.com",
			clickHandler: "specialTabs.siteClickHandler(event, AuthController._thunderbirdRegExp);",
			onLoad: function (event, browser) {
				app.console.log("OnLoad OpenTab");
				//browser.onLoad = OnLoadBrowser; 
			},		
		});		
	}		
};