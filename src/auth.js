function s4() {
	return Math.floor((1 + Math.random()) * 0x10000)
	.toString(16)
	.substring(1);
}

function sessionId() {
	return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
	s4() + '-' + s4() + s4() + s4();
}

var Auth = {		
	Init : function () {
		if (!Auth.Resume(true)) {			
			Auth.GetCode();			
		}
	},
	
	tokenAccess : "",
	tokenRefresh : "",
	userId : "",
		
	// Step 1: Try to load authentication information locally
	Resume : function (synch) {
		Auth.tokenRefresh = getPref("Auth.tokenRefresh");
		if (Auth.tokenRefresh == "")
			return false;
		
		Log.WriteLn("Auth.Resume");		
		let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
        		  			.createInstance(Components.interfaces.nsIXMLHttpRequest);
		let fullUrl = getPref("baseSslUrl") + getPref("Auth.getTokenOp") + "?" +
		getPref("Auth.refreshTokenPar") + "=" + Auth.tokenRefresh + "&" +
		getPref("Auth.cliIdPar") + "=" + getPref("Auth.cliIdVal") + "&" +
		getPref("Auth.cliSecPar") + "=" + getPref("Auth.cliSecVal") + "&" +
		getPref("Auth.grantTypePar") + "=" + getPref("Auth.refreshTokenPar");
		fullUrl = encodeURI(fullUrl);
		req.open("POST", fullUrl, true);
		req.onload = function (e) {
			if (e.currentTarget.readyState == 4) {
				Log.WriteLn("Auth.Resume.OnLoad. Status: " + e.currentTarget.status +
						" Response Text: " + e.currentTarget.responseText);
				if (e.currentTarget.status == 200) {
					let jsonResponse = JSON.parse(e.currentTarget.responseText);
					Auth.tokenAccess = jsonResponse.access_token;
					userId = jsonResponse.id;
					let expiresIn = jsonResponse.expires_in * 1000;
					expiresIn = Math.round(expiresIn * getPref("Auth.expiringMargin") / 100);
					
					// Set timer to renew access token before expiration
					let renewInterval = win.setInterval(function() {
						win.clearInterval(renewInterval);
						Log.WriteLn("Auth.Resume. Renew access token");
						Auth.Resume(false);			
					}, expiresIn);					
					
					Log.WriteLn("Auth.Resume: Got access token");
					if (synch)
						Synch.Init();
				}
				else {
					Auth.GetCode();
				}					
			}
		};
		req.onerror = function(error) {		
			Log.WriteLn("Auth.Resume. Error: " + error);
		};
		Log.WriteLn("Auth.Resume. Url: " + fullUrl);
		req.send(null);		
		return true;
	},
	
	stateVal : "",
	retryCount : 0,
	
	// Step 2: Get authentication code
	// 2-a: Feedly Request
	GetCode : function () {
		let userGuid = sessionId();
		Auth.stateVal = encodeURI(userGuid);
		
		let fullUrl = getPref("baseUrl") + getPref("Auth.getCodeOp") + "?" +					
						getPref("Auth.resTypePar") + "=" + getPref("Auth.resTypeVal") + "&" +						 
						getPref("Auth.cliIdPar") + "=" + getPref("Auth.cliIdVal") + "&" +
						getPref("Auth.redirPar") + "=" + getPref("Auth.redirVal") + getPref("Auth.redirSetCode") + "&" +
						getPref("Auth.scopePar") + "=" + getPref("Auth.scopeVal") + "&" +
						getPref("Auth.statePar") + "=" + Auth.stateVal;
		fullUrl = encodeURI(fullUrl);
		Log.WriteLn("Auth.GetCode. Url: " +  fullUrl);
		Auth.openURLInTab(fullUrl);
		
		// Wait a few seconds before trying to get results
		Auth.retryCount = 0;
		let startingInterval = win.setInterval(function() {
			win.clearInterval(startingInterval);
			Log.WriteLn("Auth.GetCode. Access Redir Server");
			Auth.RedirUrlGetCode();			
		}, getPref("Auth.delayFirst"));
	},	
	
	// 2-b: Get code from Redir URL
	RedirUrlGetCode : function() {		
		let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
		  					.createInstance(Components.interfaces.nsIXMLHttpRequest);		
		let fullUrl = getPref("Auth.redirVal") + getPref("Auth.redirGetCode") + "?" + getPref("Auth.statePar") + "=" + Auth.stateVal;
		fullUrl = encodeURI(fullUrl)
		req.open("GET", fullUrl, true);
		req.onload = function (e) {
			if (e.currentTarget.readyState == 4) {
				Log.WriteLn("Auth.RedirUrlGetCode. Status: " + e.currentTarget.status +
						" Response Text: " + e.currentTarget.responseText);
				if (e.currentTarget.status == 200) {					
					let jsonResponse = JSON.parse(e.currentTarget.responseText);					
					if (jsonResponse.error == "Success") {
						Auth.retryCount = 0;
						Auth.GetTokens(jsonResponse.code);
					}
					else
						Auth.RetryRedirUrl(0);
				}
				else
					Auth.RetryRedirUrl(0);									
			}			
		};
		req.onerror = function (error) {		
			Log.WriteLn("Auth.RedirUrlGetCode. Error: " + error);
		};		
		Log.WriteLn("Auth.RedirUrlGetCode. Url: " + fullUrl + " Attempt: " + Auth.retryCount);
		Auth.retryCount++;
		req.send(null);	
	},
	
	RetryRedirUrl : function(error) {		
		if (Auth.retryCount < getPref("Auth.retryMax")) {
			let retryDelay = Auth.retryCount < getPref("Auth.retryMax") / 2 ? getPref("Auth.delayRetry1") : getPref("Auth.delayRetry2");
			let retryInterval = win.setInterval(function() {				
				win.clearInterval(retryInterval);
				Log.WriteLn("Auth.RetryRedirUrl. Error: " + error + " Attempt: " + Auth.retryCount);
				Auth.RedirUrlGetCode();
			}, retryDelay);
		}
		else
			Log.WriteLn("Auth.RetryRedirUrl. Error: " + error + " No more tries");
	},

	// Step 3: Use authentication code to get access and refresh tokens
	GetTokens : function (code) {
		Log.WriteLn("Auth.GetTokens. Code: " + code);
		
		let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
        		  			.createInstance(Components.interfaces.nsIXMLHttpRequest);
		let fullUrl = getPref("baseSslUrl") + getPref("Auth.getTokenOp") + "?" +
		getPref("Auth.codePar") + "=" + code + "&" +
		getPref("Auth.cliIdPar") + "=" + getPref("Auth.cliIdVal") + "&" +
		getPref("Auth.cliSecPar") + "=" + getPref("Auth.cliSecVal") + "&" +
		getPref("Auth.redirPar") + "=" + getPref("Auth.redirVal") + getPref("Auth.redirSetToken") + "&" +
		getPref("Auth.statePar") + "=" + Auth.stateVal + "&" +
		getPref("Auth.grantTypePar") + "=" + getPref("Auth.grantTypeVal");
		fullUrl = encodeURI(fullUrl);
		req.open("POST", fullUrl, true);
		req.onload = function (e) {
			if (e.currentTarget.readyState == 4) {
				Log.WriteLn("Auth.GetTokens.OnLoad. Status: " + e.currentTarget.status +
						" Response Text: " + e.currentTarget.responseText);
				if (e.currentTarget.status == 200) {
					let jsonResponse = JSON.parse(e.currentTarget.responseText);
					Auth.tokenAccess = jsonResponse.access_token;
					Auth.tokenRefresh = jsonResponse.refresh_token;
					setPref("Auth.tokenRefresh", Auth.tokenRefresh);
					userId = jsonResponse.id;
					let expiresIn = jsonResponse.expires_in * 1000;
					expiresIn = Math.round(expiresIn * getPref("Auth.expiringMargin") / 100);
					
					// Set timer to renew access token before expiration
					let renewInterval = win.setInterval(function() {
						win.clearInterval(renewInterval);
						Log.WriteLn("Auth.GetTokens. Renew access token");
						Auth.Resume(false);			
					}, expiresIn);					
					
					Log.WriteLn("Auth.GetTokens: Sucessfully authenticated");
					Synch.Init();
				}
			}
		};
		req.onerror = function(error) {		
			Log.WriteLn("Auth.GetTokens. Error: " + error);
		};
		Log.WriteLn("Auth.GetTokens. Url: " + fullUrl);
		req.send(null);		
	},	
	
	// Keep browsing within Thunderbird's tab
	get _thunderbirdRegExp() {
			return Auth._thunderbirdRegExp = new RegExp(getPref("Auth.domainGoogle") +
						"|" + getPref("Auth.domainTwitter") + "|" + getPref("Auth.domainLive") +
						"|" + getPref("Auth.domainFacebook") + "|" + getPref("Auth.domainRedir"));
	},

	openURLInTab : function(url) {
		win.document.getElementById("tabmail").openTab("contentTab", {
			contentPage: url,			
			clickHandler: "specialTabs.siteClickHandler(event, Authentication._thunderbirdRegExp);",
		});		
	},		
}