Components.utils.import("resource://gre/modules/Services.jsm");

const PREF_BRANCH = "extensions.FeedlySync.";
const PREFS = {
	// Global preferences
	locale : Services.locale.getLocaleComponentForUserAgent(),
	baseUrl : "http://sandbox.feedly.com",
	baseSslUrl : "https://sandbox.feedly.com",

	// Log preferences
	"log.active" : false,
	"log.toFile" : false,

	//Authentication preferences
	"auth.getCodeOp" : "/v3/auth/auth",
	"auth.getTokenOp" : "/v3/auth/token",

	"auth.resTypePar" : "response_type",
	"auth.resTypeVal" : "code",
	"auth.cliIdPar" : "client_id",
	"auth.cliIdVal" : "sandbox",
	"auth.cliSecPar" : "client_secret",
	"auth.cliSecVal" : "YDRYI5E8OP2JKXYSDW79",
	"auth.redirPar" : "redirect_uri",
	"auth.redirVal" : "http://localhost:8080",
	"auth.scopePar" : "scope",
	"auth.scopeVal" : "https://cloud.feedly.com/subscriptions",
	"auth.statePar" : "state",
	"auth.codePar" : "code",
	"auth.grantTypePar" : "grant_type",
	"auth.grantTypeVal" : "authorization_code",
	"auth.refreshTokenPar" : "refresh_token",

	"auth.tokenRefresh" : "",
	"auth.userId" : "",
	"auth.expiringMargin" : 90,

	// Synchronizing preferences
	"synch.tokenParam" : "Authorization",
	"synch.subsOp" : "/v3/subscriptions",
	"synch.account" : "",
	"synch.direction" : 0,						// 0: Synchronization, 1: Upward, 2: Downward
	"synch.timeout" : 5
};
