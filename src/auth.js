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
	Init : function() {
		if (Auth.running) {
			Log.WriteLn("Auth.Init: Already running. Aborted");
			return;
		}

		Auth.running = true;
		if (!Auth.Resume())
			Auth.GetCode();
	},
	
	tokenAccess : "",
	tokenRefresh : "",
	userId : "",
	running : false,

	Ready : function() {
		return Auth.tokenAccess != "";
	},

	// Notify authentication process is over
	OnFinished : null,
	FireOnFinished : function(success) {
		Auth.running = false;
		if (Auth.OnFinished != null)
			Auth.OnFinished(success);
		else
			Log.WriteLn("Auth.FireOnFinished. No OnFinished event handler");
	},
		
	// Try to load authentication information locally.
	Resume : function() {
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
				Log.WriteLn(FormatEventMsg("Auth.Resume", e));
				if (e.currentTarget.status == 200) {
					let jsonResponse = JSON.parse(e.currentTarget.responseText);
					Auth.tokenAccess = jsonResponse.access_token;
					Auth.userId = jsonResponse.id;
					let expiresIn = jsonResponse.expires_in * 1000;
					expiresIn = Math.round(expiresIn * getPref("Auth.expiringMargin") / 100);
					
					// Set timer to renew access token before expiration
					let renewInterval = win.setInterval(function() {
						win.clearInterval(renewInterval);
						Log.WriteLn("Auth.Resume. Renew access token");
						Auth.Resume();
					}, expiresIn);					
					
					Log.WriteLn("Auth.Resume: Got access token");
					Auth.FireOnFinished(true);
				}
				else {
					Auth.GetCode();
				}					
			}
		};
		req.onerror = function(error) {		
			Log.WriteLn(FormatEventMsg("Auth.Resume. Error", error));
			Auth.tokenRefresh = "";
			setPref("Auth.tokenRefresh", "");
			Auth.FireOnFinished(false);
		};
		Log.WriteLn("Auth.Resume. Url: " + fullUrl);
		req.send(null);		
		return true;
	},	
	
	// Full authentication
	UserRequest : {
		browseUrl : "",
		promptText : "",
		stateVal : "",

		authWndDOMLoaded : function(location) {
			let redirUrl = getPref("Auth.redirVal");
		    if (location.href.substring(0, redirUrl.length) == redirUrl) {
		    	let paramCode = null;
		    	let paramError = getParameterByName("error", location);
		    	if (paramError == "")
		    		paramCode = getParameterByName("code", location);

		    	if (paramCode == null) {
		    		Log.WriteLn("Auth.UserRequest.authWndDOMLoaded: Error: " + paramError);
		    		Auth.FireOnFinished(false);
		    	}
		    	else
		    		Auth.GetTokens(paramCode);
		    	
		    	// Close user authentication window
		    	return true;
		    }
		    else
		    	return false;
		},

		dismissed : function() {
    		Log.WriteLn("Auth.UserRequest.dismissed");
    		Auth.FireOnFinished(false);
		},

		log : function(str) {
			Log.WriteLn(str);
		}
	},
	GetCode : function () {
		let userGuid = sessionId();
		Auth.UserRequest.stateVal = encodeURI(userGuid);
		Auth.UserRequest.promptText = _("authWndCaption", getPref("locale"));
		Auth.UserRequest.browseUrl = getPref("baseSslUrl") + getPref("Auth.getCodeOp") + "?" +
						getPref("Auth.resTypePar") + "=" + getPref("Auth.resTypeVal") + "&" +						 
						getPref("Auth.cliIdPar") + "=" + getPref("Auth.cliIdVal") + "&" +
						getPref("Auth.redirPar") + "=" + getPref("Auth.redirVal") + getPref("Auth.redirSetCode") + "&" +
						getPref("Auth.scopePar") + "=" + getPref("Auth.scopeVal") + "&" +
						getPref("Auth.statePar") + "=" + Auth.UserRequest.stateVal;
		Auth.UserRequest.browseUrl = encodeURI(Auth.UserRequest.browseUrl);
		Log.WriteLn("Auth.GetCode. Url: " +  Auth.UserRequest.browseUrl);
		
		this.wrappedJSObject = this.UserRequest;
		Services.ww.openWindow(null, "chrome://FeedlySync/content/userRequest.xul",
			null, "chrome,private,centerscreen", this);
	},

	// Use authentication code to get access and refresh tokens
	GetTokens : function(code) {
		Log.WriteLn("Auth.GetTokens. Code: " + code);

		let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
        		  			.createInstance(Components.interfaces.nsIXMLHttpRequest);
		let fullUrl = getPref("baseSslUrl") + getPref("Auth.getTokenOp") + "?" +
			getPref("Auth.codePar") + "=" + code + "&" +
			getPref("Auth.cliIdPar") + "=" + getPref("Auth.cliIdVal") + "&" +
			getPref("Auth.cliSecPar") + "=" + getPref("Auth.cliSecVal") + "&" +
			getPref("Auth.redirPar") + "=" + getPref("Auth.redirVal") + getPref("Auth.redirSetToken") + "&" +
			getPref("Auth.statePar") + "=" + Auth.UserRequest.stateVal + "&" +
			getPref("Auth.grantTypePar") + "=" + getPref("Auth.grantTypeVal");
		fullUrl = encodeURI(fullUrl);
		req.open("POST", fullUrl, true);
		req.onload = function (e) {
			if (e.currentTarget.readyState == 4) {
				Log.WriteLn(FormatEventMsg("Auth.GetTokens. e=", e));
				if (e.currentTarget.status == 200) {
					let jsonResponse = JSON.parse(e.currentTarget.responseText);
					Auth.tokenAccess = jsonResponse.access_token;
					Auth.tokenRefresh = jsonResponse.refresh_token;
					setPref("Auth.tokenRefresh", Auth.tokenRefresh);
					Auth.userId = jsonResponse.id;
					let expiresIn = jsonResponse.expires_in * 1000;
					expiresIn = Math.round(expiresIn * getPref("Auth.expiringMargin") / 100);
					
					// Set timer to renew access token before expiration
					let renewInterval = win.setInterval(function() {
						win.clearInterval(renewInterval);
						Log.WriteLn("Auth.GetTokens. Renew access token");
						Auth.Resume();
					}, expiresIn);					
					
					Log.WriteLn("Auth.GetTokens: Sucessfully authenticated");
					Auth.FireOnFinished(true);
				}
				else
					Auth.FireOnFinished(false);
			}
		};
		req.onerror = function(error) {		
			Log.WriteLn(FormatEventMsg("Auth.GetTokens. Error", error));
			Auth.FireOnFinished(false);
		};
		Log.WriteLn("Auth.GetTokens. Url: " + fullUrl);
		req.send(null);		
	},	
}