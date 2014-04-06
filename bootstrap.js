const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let { Services } = Cu.import("resource://gre/modules/Services.jsm");

Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource:///modules/iteratorUtils.jsm");
Cu.import("resource:///modules/mailServices.js");

var scriptLoader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
					.getService(Components.interfaces.mozIJSSubScriptLoader);
scriptLoader.loadSubScript("chrome://messenger-newsblog/content/utils.js");

const PREF_BRANCH = "extensions.FeedlySync.";
const PREFS = {
	// Global preferences
	log : false,
	baseUrl : "http://sandbox.feedly.com",
	baseSslUrl : "https://sandbox.feedly.com",
	
	//Authentication preferences
	getCodeOp : "/v3/auth/auth",
	getTokenOp : "/v3/auth/token",
	redirSetCode : "",				 // "/feedlySetCode"
	redirSetToken : "", 			 // "/feedlySetToken"
	redirGetCode : "/addOnGetCode",
	redirGetToken : "/addOnGetToken",

	resTypePar : "response_type",
	resTypeVal : "code",
	cliIdPar : "client_id",
	cliIdVal : "sandbox",
	cliSecPar : "client_secret",
	cliSecVal : "V0H9C3O75ODIXFSSX9OH",
	redirPar : "redirect_uri",
	redirVal : "http://localhost:8080",
	scopePar : "scope",
	scopeVal : "https://cloud.feedly.com/subscriptions",
	statePar : "state",
	codePar : "code",
	grantTypePar : "grant_type",
	grantTypeVal : "authorization_code",

	domainGoogle : "accounts.google.com",
	domainTwitter : "twitterState",
	domainLive : "login.live.com",
	domainFacebook : "www.facebook.com",
	domainRedir : "localhost",

	retryMax : 20,
	delayFirst : 3000,
	delayRetry1 : 3000,
	delayRetry2 : 6000,
	
	tokenAccess : "",
	tokenRefresh : "",
	userId : "",
	expiresIn : 0,	
	
	// Synchronizing preferences	
	tokenParam : "Authorization",
	subsOp : "/v3/subscriptions",
	accountKey : "server3",
	downloadOnly : false,
};

var app = Cc["@mozilla.org/steel/application;1"]
		  .getService(Components.interfaces.steelIApplication);
var prefs = Components.classes["@mozilla.org/preferences-service;1"]
			.getService(Components.interfaces.nsIPrefService);

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
	include(data, "includes/prefs.js");
	setDefaultPrefs();
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
	
	var menuItemClose = wnd.document.getElementById("menu_FileQuitItem");
	var menuItemPopup = wnd.document.getElementById("menu_FilePopup");
	menuItemPopup.insertBefore(menuItemSync, menuItemClose);
	
	unload(function() {
		menuItemSync.parentNode.removeChild(menuItemSync);
	}, wnd);	
	
	function synchronize() {
		// include(theAddOn, "src/synchronize.js");
		syncTBFeedly(wnd);		
	}
}

var window = null;

function syncTBFeedly(wnd) {
	window = wnd;
	Auth.Init();
	
	//Synch.ListTB("server3"); 
}

function log(str) {
	if (getPref("log"))
		app.console.log(str);
}

function s4() {
	return Math.floor((1 + Math.random()) * 0x10000)
	.toString(16)
	.substring(1);
};

function sessionId() {
	return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
	s4() + '-' + s4() + s4() + s4();
}

var Auth = {		
	Init : function () {
		if (!this.FromDisk()) {			
			var userGuid = sessionId();
			this.stateVal = encodeURI(userGuid);
			this.GetCode();			
		}
		else
			Synch.Init();
	},	
		
	// Step 1: Try to load authentication information locally
	FromDisk : function () {
		tokenAccess = "";
		tokenRefresh = "";
		userId = "";
		expiresIn = 0;
		
		// TODO: Load from disk...
		return false;
	},
	
	stateVal : "",
	retryCount : 0,
	
	// Step 2: Get authentication code
	// 2-a: Feedly Request
	GetCode : function () {
		var fullUrl = getPref("baseUrl") + getPref("getCodeOp") + "?" +					
						getPref("resTypePar") + "=" + getPref("resTypeVal") + "&" +						 
						getPref("cliIdPar") + "=" + getPref("cliIdVal") + "&" +
						getPref("redirPar") + "=" + getPref("redirVal") + getPref("redirSetCode") + "&" +
						getPref("scopePar") + "=" + getPref("scopeVal") + "&" +
						getPref("statePar") + "=" + this.stateVal;
		fullUrl = encodeURI(fullUrl);
		log("Auth.GetCode. Url: " +  fullUrl);
		this.openURLInTab(fullUrl);
		
		// Wait a few seconds before trying to get results
		this.retryCount = 0;
		var startingInterval = window.setInterval(function() {
			window.clearInterval(startingInterval);
			log("Auth.GetCode. Access Redir Server");
			Auth.RedirUrlGetCode();			
		}, getPref("delayFirst"));
	},	
	
	// 2-b: Get code from Redir URL
	RedirUrlGetCode : function () {		
		var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
		  					.createInstance(Components.interfaces.nsIXMLHttpRequest);		
		var fullUrl = getPref("redirVal") + getPref("redirGetCode") + "?" + getPref("statePar") + "=" + this.stateVal;
		fullUrl = encodeURI(fullUrl)
		req.open("GET", fullUrl, true);
		req.onload = function (e) {
			if (req.readyState == 4) {
				log("Auth.RedirUrlGetCode. Status: " + req.status + " Response Text: " + req.responseText);
				if (req.status == 200) {					
					var jsonResponse = JSON.parse(req.responseText);					
					if (jsonResponse.error == "Success") {
						this.retryCount = 0;
						Auth.GetTokens(jsonResponse.code);
					}
					else
						Auth.RetryRedirUrl(0);
				}
				else
					Auth.RetryRedirUrl(0);									
			}			
		};
		req.onerror = getPref("RetryRedirUrl");
		log("Auth.RedirUrlGetCode. Url: " + fullUrl + " Attempt: " + this.retryCount);
		this.retryCount++;
		req.send(null);	
	},
	
	RetryRedirUrl : function (error) {		
		if (this.retryCount < getPref("retryMax")) {
			var retryDelay = this.retryCount < getPref("retryMax") / 2 ? getPref("delayRetry1") : getPref("delayRetry2");
			var retryInterval = window.setInterval(function() {				
				window.clearInterval(retryInterval);
				log("Auth.RetryRedirUrl. Error: " + error + " Attempt: " + this.retryCount);
				Auth.RedirUrlGetCode();
			}, retryDelay);
		}
		else
			log("Auth.RetryRedirUrl. Error: " + error + " No more tries");
	},

	// Step 3: Use authentication code to get access and refresh tokens
	GetTokens : function (code) {
		log("Auth.GetTokens. Code: " + code);
		
		var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
        		  			.createInstance(Components.interfaces.nsIXMLHttpRequest);
		var fullUrl = getPref("baseSslUrl") + getPref("getTokenOp") + "?" +
		getPref("codePar") + "=" + code + "&" +
		getPref("cliIdPar") + "=" + getPref("cliIdVal") + "&" +
		getPref("cliSecPar") + "=" + getPref("cliSecVal") + "&" +
		getPref("redirPar") + "=" + getPref("redirVal") + getPref("redirSetToken") + "&" +
		getPref("statePar") + "=" + this.stateVal + "&" +
		getPref("grantTypePar") + "=" + getPref("grantTypeVal");
		fullUrl = encodeURI(fullUrl);
		req.open("POST", fullUrl, true);
		req.onload = function (e) {
			if (req.readyState == 4) {
				log("Auth.GetTokens.OnLoad. Status: " + req.status + " Response Text: " + req.responseText);
				if (req.status == 200) {
					var jsonResponse = JSON.parse(req.responseText);
					tokenAccess = jsonResponse.access_token;
					tokenRefresh = jsonResponse.refresh_token;
					userId = jsonResponse.id;
					expiresIn = jsonResponse.expires_in;
					log("Auth.GetTokens: Sucessfully authenticated");
					Synch.Init();
				}
			}
		};
		req.onerror = function (error) {		
			log("Auth.GetTokens. Error: " + error);
		};
		log("Auth.GetTokens. Url: " + fullUrl);
		req.send(null);		
	},	
	
	// Keep browsing within Thunderbird's tab
	get _thunderbirdRegExp() {
			return this._thunderbirdRegExp = new RegExp(getPref("domainGoogle") +
						"|" + getPref("domainTwitter") + "|" + getPref("domainLive") +
						"|" + getPref("domainFacebook") + "|" + getPref("domainRedir"));
	},

	openURLInTab : function (url) {
		window.document.getElementById("tabmail").openTab("contentTab", {
			contentPage: url,			
			clickHandler: "specialTabs.siteClickHandler(event, Authentication._thunderbirdRegExp);",
		});		
	}		
};

var Synch = {
	// Get the user's subscriptionss from Feedly
	Init : function () {
		log("Synch.Init");		

		var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
							.createInstance(Components.interfaces.nsIXMLHttpRequest);		
		var fullUrl = getPref("baseSslUrl") + getPref("subsOp");
		fullUrl = encodeURI(fullUrl)		
		req.open("GET", fullUrl, true);
		req.setRequestHeader(getPref("tokenParam"), tokenAccess)
		req.onload = function (e) {
			if (req.readyState == 4) {
				log("Synch.Init. Status: " + req.status + " Response Text: " + req.responseText);
				if (req.status == 200) {
					var jsonResponse = JSON.parse(req.responseText);
					Synch.Update(jsonResponse);
				}
				else
					return;									
			}			
		};
		req.onerror = function (error) {		
			log("Synch.Init. Error: " + error);
		};
		log("Synch.Init. Url: " + fullUrl);
		req.send(null);		
	},
	
	// Synchronize Thunderbird and Feedly	
	Update : function (feedlySubs) {
		// Get the folder's server we're synchronizing
		let selServer = null;
		for each (let account in fixIterator(MailServices.accounts.accounts, Ci.nsIMsgAccount)) {			
			let server = account.incomingServer;
			if (server) {
				if ("rss" == server.type &&
					server.key == getPref("accountKey")) {
					selServer = server;
					break;
				}
			}
		}		
		if (selServer == null)
			return;
		
		// Compare TB feeds with Feedly		
		let rootfolder = selServer.rootFolder;
		if (rootfolder.hasSubFolders) {
			for each (let folder1 in fixIterator(rootfolder.subFolders, Ci.nsIMsgFolder)) {
				//log(folder1.prettiestName);							
				for each (let folder2 in fixIterator(folder1.subFolders, Ci.nsIMsgFolder)) {
					//log(folder2.prettiestName);
					tbSubs = FeedUtils.getFeedUrlsInFolder(folder2);
					for (let i = 0; i < tbSubs.length; i++) {
						if (tbSubs[i] != "")
							log(tbSubs[i]);
					}
				}				
			}
		};		
	},
};