// Default preference values. These are accessible via the preferences system
// or via the optional chrome/content/options.xul preferences dialog.

// Global preferences
pref("extensions.FeedlySync.log", false);
pref("extensions.FeedlySync.baseUrl", "http://mierda");
pref("extensions.FeedlySync.baseSslUrl", "https://sandbox.feedly.com");

//Authentication preferences
pref("extensions.FeedlySync.getCodeOp", "/v3/auth/auth");
pref("extensions.FeedlySync.getTokenOp", "/v3/auth/token");
pref("extensions.FeedlySync.redirSetCode", "");				 // "/feedlySetCode"
pref("extensions.FeedlySync.redirSetToken", ""); 			 // "/feedlySetToken"
pref("extensions.FeedlySync.redirGetCode", "/addOnGetCode");
pref("extensions.FeedlySync.redirGetToken", "/addOnGetToken");

pref("extensions.FeedlySync.resTypePar", "response_type");
pref("extensions.FeedlySync.resTypeVal", "code");
pref("extensions.FeedlySync.cliIdPar", "client_id");
pref("extensions.FeedlySync.cliIdVal", "sandbox");
pref("extensions.FeedlySync.cliSecPar", "client_secret");
pref("extensions.FeedlySync.cliSecVal", "V0H9C3O75ODIXFSSX9OH");
pref("extensions.FeedlySync.redirPar", "redirect_uri");
pref("extensions.FeedlySync.redirVal", "http://localhost:8080");
pref("extensions.FeedlySync.scopePar", "scope");
pref("extensions.FeedlySync.scopeVal", "https://cloud.feedly.com/subscriptions");
pref("extensions.FeedlySync.statePar", "state");
pref("extensions.FeedlySync.codePar", "code");
pref("extensions.FeedlySync.grantTypePar", "grant_type");
pref("extensions.FeedlySync.grantTypeVal", "authorization_code");

pref("extensions.FeedlySync.domainGoogle", "accounts.google.com");
pref("extensions.FeedlySync.domainTwitter", "twitterState");
pref("extensions.FeedlySync.domainLive", "login.live.com");
pref("extensions.FeedlySync.domainFacebook", "www.facebook.com");
pref("extensions.FeedlySync.domainRedir", "localhost");

pref("extensions.FeedlySync.retryMax", 20);
pref("extensions.FeedlySync.delayFirst", 3000);
pref("extensions.FeedlySync.delayRetry1", 3000);
pref("extensions.FeedlySync.delayRetry2", 6000);

pref("extensions.FeedlySync.tokenAccess", "");
pref("extensions.FeedlySync.tokenRefresh", "");
pref("extensions.FeedlySync.userId", "");
pref("extensions.FeedlySync.expiresIn", 0);	

// Synchronizing preferences
pref("extensions.FeedlySync.tokenParam", "Authorization");
pref("extensions.FeedlySync.subsOp", "/v3/subscriptions");
pref("extensions.FeedlySync.accountKey", "");
pref("extensions.FeedlySync.downloadOnly", false);

// https://developer.mozilla.org/en/Localizing_extension_descriptions
//pref("extensions.FeedlySync@AMArostegui.es.description", "chrome://pruebita/locale/overlay.properties");