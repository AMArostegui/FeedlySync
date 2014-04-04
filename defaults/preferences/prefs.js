// Default preference values. These are accessible via the preferences system
// or via the optional chrome/content/options.xul preferences dialog.

// Global preferences
pref("extensions.FeedlySync.log", false);
pref("extensions.FeedlySync.baseUrl", "http://mierda");
pref("extensions.FeedlySync.baseSslUrl", "https://sandbox.feedly.com");

//Authentication preferences
pref("getCodeOp", "/v3/auth/auth");
pref("getTokenOp", "/v3/auth/token");
pref("redirSetCode", "");				 // "/feedlySetCode"
pref("redirSetToken", ""); 			 // "/feedlySetToken"
pref("redirGetCode", "/addOnGetCode");
pref("redirGetToken", "/addOnGetToken");

pref("resTypePar", "response_type");
pref("resTypeVal", "code");
pref("cliIdPar", "client_id");
pref("cliIdVal", "sandbox");
pref("cliSecPar", "client_secret");
pref("cliSecVal", "V0H9C3O75ODIXFSSX9OH");
pref("redirPar", "redirect_uri");
pref("redirVal", "http://localhost:8080");
pref("scopePar", "scope");
pref("scopeVal", "https://cloud.feedly.com/subscriptions");
pref("statePar", "state");
pref("stateVal", "");
pref("codePar", "code");
pref("grantTypePar", "grant_type");
pref("grantTypeVal", "authorization_code");

pref("domainGoogle", "accounts.google.com");
pref("domainTwitter", "twitterState");
pref("domainLive", "login.live.com");
pref("domainFacebook", "www.facebook.com");
pref("domainRedir", "localhost");

pref("retryMax", 20);
pref("delayFirst", 3000);
pref("delayRetry1", 3000);
pref("delayRetry2", 6000);


// Authentication preferences
//pref("extensions.FeedlySync.Auth.getCodeOp", "/v3/auth/auth");
//pref("extensions.FeedlySync.Auth.retryCount", 0);

// Sync preferences
//pref("extensions.FeedlySync.Sync.downloadOnly", false);

// https://developer.mozilla.org/en/Localizing_extension_descriptions
//pref("extensions.FeedlySync@AMArostegui.es.description", "chrome://pruebita/locale/overlay.properties");