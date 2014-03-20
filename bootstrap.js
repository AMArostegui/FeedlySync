const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let { Services } = Cu.import("resource://gre/modules/Services.jsm");

Cu.import("resource://gre/modules/AddonManager.jsm");

var app = Cc["@mozilla.org/steel/application;1"]
		  .getService(Components.interfaces.steelIApplication);


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

var baseUrl = "http://sandbox.feedly.com";
var baseSslUrl = "https://sandbox.feedly.com";

var authGetCodeOp = "/v3/auth/auth";
var authGetTokenOp = "/v3/auth/token";
var authRedirSetCode = ""; // "/feedlySetCode";
var authRedirSetToken = ""; // "/feedlySetToken";
var authRedirGetCode = "/addOnGetCode";
var authRedirGetToken = "/addOnGetToken";

var authResTypePar = "response_type";
var authResTypeVal = "code";
var authCliIdPar = "client_id";
var authCliIdVal = "sandbox";
var authCliSecPar = "client_secret";
var authCliSecVal = "W60IW73DYSUIISZX4OUP";
var authRedirPar = "redirect_uri";
var authRedirVal = "http://localhost:8080";
var authScopePar = "scope";
var authScopeVal = "https://cloud.feedly.com/subscriptions";
var authStatePar = "state";
var authStateVal = "";
var authCodePar = "code";
var authGrantTypePar = "grant_type";
var authGrantTypeVal = "authorization_code";

var domainGoogle = "accounts.google.com";
var domainTwitter = "twitterState";
var domainLive = "login.live.com";
var domainFacebook = "www.facebook.com";
var domainRedir = "localhost";

var retryCount = 0;
const retryMax = 20;
var delayFirst = 3000;
var delayRetry1 = 3000;
var delayRetry2 = 6000;

var tokenParam = "Authorization";
var tokenAccess;
var tokenRefresh;
var userId;
var expiresIn;

var subsOp = "/v3/subscriptions";


var window = null;

function init() {
	// Load tokens
	tokenAccess = "";
	tokenRefresh = "";
	userId = "";
	expiresIn = 0;	
	
	var userGuid = sessionId();
	authStateVal = encodeURI(userGuid);	
}

function syncTBFeedly(wnd) {
	init();	
	if (tokenAccess == "" || tokenRefresh == "") {
		window = wnd;
		Auth.AuthGetCode();			
	}
	else
		Synch.Compare();
}

function log(str) {
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
	
	// Step 1: Get authentication code
	// 1-a: Feedly Request
	AuthGetCode : function () {
		var fullUrl = baseUrl + authGetCodeOp + "?" +					
						authResTypePar + "=" + authResTypeVal + "&" +						 
					    authCliIdPar + "=" + authCliIdVal + "&" +
						authRedirPar + "=" + authRedirVal + authRedirSetCode + "&" +
						authScopePar + "=" + authScopeVal + "&" +
						authStatePar + "=" + authStateVal;
		fullUrl = encodeURI(fullUrl);
		log("AuthGetCode. Url: " +  fullUrl);
		this.openURLInTab(fullUrl);
		
		// Wait a few seconds before trying to get results
		retryCount = 0;
		var startingInterval = window.setInterval(function() {
			window.clearInterval(startingInterval);
			log("AuthGetCode. Access Redir Server");
			Auth.RedirUrlGetCode();			
		}, delayFirst);
	},
	
	// 1-b: Get code from Redir URL
	RedirUrlGetCode : function () {		
		var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
		  					.createInstance(Components.interfaces.nsIXMLHttpRequest);		
		var fullUrl = authRedirVal + authRedirGetCode + "?" + authStatePar + "=" + authStateVal;
		fullUrl = encodeURI(fullUrl)
		req.open("GET", fullUrl, true);
		req.onload = function (e) {
			if (req.readyState == 4) {
				log("RedirUrlGetCode. Status: " + req.status + " Response Text: " + req.responseText);
				if (req.status == 200) {					
					var jsonResponse = JSON.parse(req.responseText);					
					if (jsonResponse.error == "Success") {
						retryCount = 0;
						Auth.AuthGetTokens(jsonResponse.code);
					}
					else
						Auth.RetryRedirUrl(0);
				}
				else
					Auth.RetryRedirUrl(0);									
			}			
		};
		req.onerror = this.RetryRedirUrl;
		log("RedirUrlGetCode. Url: " + fullUrl + " Attempt: " + retryCount);
		retryCount++;
		req.send(null);	
	},
	
	RetryRedirUrl : function (error) {		
		if (retryCount < retryMax) {
			var retryDelay = retryCount < retryMax / 2 ? delayRetry1 : delayRetry2;
			var retryInterval = window.setInterval(function() {				
				window.clearInterval(retryInterval);
				log("RetryRedirUrl. Error: " + error + " Attempt: " + retryCount);
				Auth.RedirUrlGetCode();
			}, retryDelay);
		}
		else
			log("RetryRedirUrl. Error: " + error + " No more tries");
	},

	// Step 2: Use authentication code to get access and refresh tokens
	AuthGetTokens : function (code) {
		log("AuthGetTokens. Code: " + code);
		
		var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
        		  			.createInstance(Components.interfaces.nsIXMLHttpRequest);
		var fullUrl = baseSslUrl + authGetTokenOp + "?" +
		authCodePar + "=" + code + "&" +
		authCliIdPar + "=" + authCliIdVal + "&" +
		authCliSecPar + "=" + authCliSecVal + "&" +
		authRedirPar + "=" + authRedirVal + authRedirSetToken + "&" +
		authStatePar + "=" + authStateVal + "&" +
		authGrantTypePar + "=" + authGrantTypeVal;
		fullUrl = encodeURI(fullUrl);
		req.open("POST", fullUrl, true);
		req.onload = function (e) {
			if (req.readyState == 4) {
				log("OnLoad. Status: " + req.status + " Response Text: " + req.responseText);
				if (req.status == 200) {
					var jsonResponse = JSON.parse(req.responseText);
					tokenAccess = jsonResponse.access_token;
					tokenRefresh = jsonResponse.refresh_token;
					userId = jsonResponse.id;
					expiresIn = jsonResponse.expires_in;
					Synch.Compare();
				}
			}
		};
		req.onerror = function (error) {		
			log("AuthGetTokens. Error: " + error);
		};
		log("AuthGetTokens. Url: " + fullUrl);
		req.send(null);		
	},	
	
	// Keep browsing within Thunderbird's tab
	get _thunderbirdRegExp() {
			return this._thunderbirdRegExp = new RegExp(domainGoogle +
						"|" + domainTwitter + "|" + domainLive +
						"|" + domainFacebook + "|" + domainRedir);
	},

	openURLInTab : function (url) {
		window.document.getElementById("tabmail").openTab("contentTab", {
			contentPage: url,			
			clickHandler: "specialTabs.siteClickHandler(event, Authentication._thunderbirdRegExp);",
		});		
	}		
};

var Synch = {
	Compare : function () {
		log("Compare");
		
		// Get all the user's subscriptions
		var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
							.createInstance(Components.interfaces.nsIXMLHttpRequest);		
		var fullUrl = baseSslUrl + subsOp;
		fullUrl = encodeURI(fullUrl)		
		req.open("GET", fullUrl, true);
		req.setRequestHeader(tokenParam, tokenAccess)
		req.onload = function (e) {
			if (req.readyState == 4) {
				log("Compare. Status: " + req.status + " Response Text: " + req.responseText);
				if (req.status == 200) {					
				}
				else
					return;									
			}			
		};
		req.onerror = function (error) {		
			log("Compare. Error: " + error);
		};
		log("Compare. Url: " + fullUrl);
		req.send(null);		
	},
};