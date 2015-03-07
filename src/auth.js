function s4() {
	return Math.floor((1 + Math.random()) * 0x10000)
	.toString(16)
	.substring(1);
}

function sessionId() {
	return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
	s4() + '-' + s4() + s4() + s4();
}

var auth = {
	init : function() {
		if (auth.running) {
			log.writeLn("auth.Init: Already running. Aborted");
			return;
		}

		auth.running = true;
		if (!auth.resume())
			auth.getCode();
	},

	tokenAccess : "",
	tokenRefresh : "",
	userId : "",
	running : false,

	ready : function() {
		return auth.tokenAccess !== "";
	},

	// Notify authentication process is over
	onFinished : null,
	fireOnFinished : function(success) {
		auth.running = false;
		if (auth.onFinished !== null)
			auth.onFinished(success);
		else
			log.writeLn("auth.fireOnFinished. No OnFinished event handler");
	},

	// Try to load authentication information locally.
	resume : function() {
		auth.tokenRefresh = getPref("auth.tokenRefresh");
		if (auth.tokenRefresh === "")
			return false;

		log.writeLn("auth.resume");
		let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
        		  			.createInstance(Components.interfaces.nsIXMLHttpRequest);
		let fullUrl = getPref("baseSslUrl") + getPref("auth.getTokenOp") + "?" +
			getPref("auth.refreshTokenPar") + "=" + auth.tokenRefresh + "&" +
			getPref("auth.cliIdPar") + "=" + getPref("auth.cliIdVal") + "&" +
			getPref("auth.cliSecPar") + "=" + getPref("auth.cliSecVal") + "&" +
			getPref("auth.grantTypePar") + "=" + getPref("auth.refreshTokenPar");
		fullUrl = encodeURI(fullUrl);
		req.open("POST", fullUrl, true);
		req.onload = function (e) {
			if (e.currentTarget.readyState === 4) {
				log.writeLn(formatEventMsg("auth.resume", e));
				if (e.currentTarget.status === 200) {
					let jsonResponse = JSON.parse(e.currentTarget.responseText);
					auth.tokenAccess = jsonResponse.access_token;
					auth.userId = jsonResponse.id;
					let expiresIn = jsonResponse.expires_in * 1000;
					expiresIn = Math.round(expiresIn * getPref("auth.expiringMargin") / 100);

					// Set timer to renew access token before expiration
					let renewInterval = win.setInterval(function() {
						win.clearInterval(renewInterval);
						log.writeLn("auth.resume. Renew access token");
						auth.resume();
					}, expiresIn);

					log.writeLn("auth.resume: Got access token");
					auth.fireOnFinished(true);
				}
				else {
					auth.tokenRefresh = "";
					setPref("auth.tokenRefresh", "");
					auth.getCode();
				}
			}
		};
		req.onerror = function(error) {
			log.writeLn(formatEventMsg("auth.resume. Error", error));
			auth.fireOnFinished(false);
		};
		log.writeLn("auth.resume. Url: " + fullUrl);
		req.send(null);
		return true;
	},

	// Full authentication
	userRequest : {
		browseUrl : "",
		promptText : "",
		stateVal : "",

		authWndDOMLoaded : function(location) {
			let redirUrl = getPref("auth.redirVal");
		    if (location.href.substring(0, redirUrl.length) === redirUrl) {
		    	let paramCode = null;
		    	let paramError = getParameterByName("error", location);
		    	if (paramError === "")
		    		paramCode = getParameterByName("code", location);

		    	if (paramCode === null) {
		    		log.writeLn("auth.userRequest.authWndDOMLoaded: Error: " + paramError);
		    		auth.fireOnFinished(false);
		    	}
		    	else
		    		auth.getTokens(paramCode);

		    	// Close user authentication window
		    	return true;
		    }
		    else
		    	return false;
		},

		dismissed : function() {
    		log.writeLn("auth.userRequest.dismissed");
    		auth.fireOnFinished(false);
		},

		log : function(str) {
			log.writeLn(str);
		}
	},
	getCode : function () {
		let userGuid = sessionId();
		auth.userRequest.stateVal = encodeURI(userGuid);
		auth.userRequest.promptText = _("authWndCaption", getPref("locale"));
		auth.userRequest.browseUrl = getPref("baseSslUrl") + getPref("auth.getCodeOp") + "?" +
						getPref("auth.resTypePar") + "=" + getPref("auth.resTypeVal") + "&" +
						getPref("auth.cliIdPar") + "=" + getPref("auth.cliIdVal") + "&" +
						getPref("auth.redirPar") + "=" + getPref("auth.redirVal") + "&" +
						getPref("auth.scopePar") + "=" + getPref("auth.scopeVal") + "&" +
						getPref("auth.statePar") + "=" + auth.userRequest.stateVal;
		auth.userRequest.browseUrl = encodeURI(auth.userRequest.browseUrl);
		log.writeLn("auth.getCode. Url: " +  auth.userRequest.browseUrl);

		this.wrappedJSObject = this.userRequest;
		Services.ww.openWindow(null, "chrome://FeedlySync/content/userRequest.xul",
			null, "chrome,private,centerscreen", this);
	},

	// Use authentication code to get access and refresh tokens
	getTokens : function(code) {
		log.writeLn("auth.getTokens. Code: " + code);

		let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
        		  			.createInstance(Components.interfaces.nsIXMLHttpRequest);
		let fullUrl = getPref("baseSslUrl") + getPref("auth.getTokenOp") + "?" +
			getPref("auth.codePar") + "=" + code + "&" +
			getPref("auth.cliIdPar") + "=" + getPref("auth.cliIdVal") + "&" +
			getPref("auth.cliSecPar") + "=" + getPref("auth.cliSecVal") + "&" +
			getPref("auth.redirPar") + "=" + getPref("auth.redirVal") + "&" +
			getPref("auth.statePar") + "=" + auth.userRequest.stateVal + "&" +
			getPref("auth.grantTypePar") + "=" + getPref("auth.grantTypeVal");
		fullUrl = encodeURI(fullUrl);
		req.open("POST", fullUrl, true);
		req.onload = function (e) {
			if (e.currentTarget.readyState ===  4) {
				log.writeLn(formatEventMsg("auth.getTokens. e=", e));
				if (e.currentTarget.status === 200) {
					let jsonResponse = JSON.parse(e.currentTarget.responseText);
					auth.tokenAccess = jsonResponse.access_token;
					auth.tokenRefresh = jsonResponse.refresh_token;
					setPref("auth.tokenRefresh", auth.tokenRefresh);
					auth.userId = jsonResponse.id;
					let expiresIn = jsonResponse.expires_in * 1000;
					expiresIn = Math.round(expiresIn * getPref("auth.expiringMargin") / 100);

					// Set timer to renew access token before expiration
					let renewInterval = win.setInterval(function() {
						win.clearInterval(renewInterval);
						log.writeLn("auth.getTokens. Renew access token");
						auth.resume();
					}, expiresIn);

					log.writeLn("auth.getTokens: Sucessfully authenticated");
					auth.fireOnFinished(true);
				}
				else
					auth.fireOnFinished(false);
			}
		};
		req.onerror = function(error) {
			log.writeLn(formatEventMsg("auth.getTokens. Error", error));
			auth.fireOnFinished(false);
		};
		log.writeLn("auth.getTokens. Url: " + fullUrl);
		req.send(null);
	},
};