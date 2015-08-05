// Feedly Synchronizer AddOn for Mozilla Thunderbird
// Developed by Antonio Miras Aróstegui
// Published under Mozilla Public License, version 2.0 (https://www.mozilla.org/MPL/2.0/)

var tests = {
	savedAccountKey : "",

	begin : function() {
		auth.testing = true;
		tests.createAccount();
		statusFile.reset();

		// Create new account to perform tests in
		tests.savedAccountKey = getPref("synch.account");
		let account = FeedUtils.createRssAccount("Tests Account");
		setPref("synch.account", account.key);

		tests.login();
	},

	login : function() {
		auth.tokenAccess = "";
		auth.tokenRefresh = "";
		setPref("auth.tokenRefresh", "");

		let action = function() {
			log.writeLn("Test 1: Full Authenticaton");
			auth.tokenAccess = "";
			tests.resumeLogin();
		};
		synch.authAndRun(action);
	},

	resumeLogin : function () {
		auth.tokenAccess = "";

		let action = function() {
			log.writeLn("Test 2: Partial Authentication");
			tests.importOpml();
		};
		synch.authAndRun(action);
	},

	importOpml : function() {
	},

	end : function() {
		// Remove tests account
		let accountKey = getPref("synch.account");
		let account = MailServices.accounts.getAccount(accountKey);
		MailServices.accounts.removeAccount(account);
		setPref("synch.account", tests.savedAccountKey);

		auth.testing = false;
	},
};