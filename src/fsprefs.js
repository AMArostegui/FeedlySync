const PREF_BRANCH = "extensions.FeedlySync.";
const PREFS = {
	// Global preferences	
	locale : Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIXULChromeRegistry).getSelectedLocale("global"),	
	baseUrl : "http://sandbox.feedly.com",
	baseSslUrl : "https://sandbox.feedly.com",
	
	// Log preferences	
	"Log.Active" : false,
	"Log.ToFile" : false,							
	
	//Authentication preferences
	"Auth.getCodeOp" : "/v3/auth/auth",
	"Auth.getTokenOp" : "/v3/auth/token",
	"Auth.redirSetCode" : "",				 	// "/feedlySetCode"
	"Auth.redirSetToken" : "", 			 		// "/feedlySetToken"

	"Auth.resTypePar" : "response_type",
	"Auth.resTypeVal" : "code",
	"Auth.cliIdPar" : "client_id",
	"Auth.cliIdVal" : "sandbox",
	"Auth.cliSecPar" : "client_secret",
	"Auth.cliSecVal" : "YDRYI5E8OP2JKXYSDW79",
	"Auth.redirPar" : "redirect_uri",
	"Auth.redirVal" : "http://localhost:8080",
	"Auth.scopePar" : "scope",
	"Auth.scopeVal" : "https://cloud.feedly.com/subscriptions",
	"Auth.statePar" : "state",
	"Auth.codePar" : "code",
	"Auth.grantTypePar" : "grant_type",
	"Auth.grantTypeVal" : "authorization_code",
	"Auth.refreshTokenPar" : "refresh_token",	

	"Auth.tokenRefresh" : "",
	"Auth.userId" : "",
	"Auth.expiringMargin" : 90,	
	
	// Synchronizing preferences	
	"Synch.tokenParam" : "Authorization",
	"Synch.subsOp" : "/v3/subscriptions",
	"Synch.account" : "",
	"Synch.direction" : 0,						// 0: Synchronization, 1: Upward, 2: Downward
};
