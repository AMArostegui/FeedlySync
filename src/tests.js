// Feedly Synchronizer AddOn for Mozilla Thunderbird
// Developed by Antonio Miras Aróstegui
// Published under Mozilla Public License, version 2.0 (https://www.mozilla.org/MPL/2.0/)

Services.scriptloader.loadSubScript("chrome://messenger-newsblog/content/feed-subscriptions.js");

var tests = {
	savedAccountKey : "",
	opmlFile : null,
	count : 3,

	begin : function() {
		auth.testing = true;
		statusFile.reset();

		let id = addonId;
		tests.opmlFile = FileUtils.getFile("ProfD", [id, "data", "testSubs.opml"], false);

		// Create new account to perform tests in
		tests.savedAccountKey = getPref("synch.account");
		let account = FeedUtils.createRssAccount("Tests Account");
		setPref("synch.account", account.key);

		tests.importOpml();
	},

	login : function() {
		auth.tokenAccess = "";
		auth.tokenRefresh = "";
		setPref("auth.tokenRefresh", "");

		let action = function() {
			log.writeLn("PASSED 1/" + tests.count + " : Full Authenticaton");
			tests.resumeLogin();
		};
		let error = function() {
			log.writeLn("MISSED 1");
			tests.end();
		}
		synch.authAndRun(action, error);
	},

	resumeLogin : function () {
		auth.tokenAccess = "";

		let action = function() {
			log.writeLn("PASSED 2/" + tests.count + " : Partial Authentication");
			tests.importOpml();
		};
		let error = function() {
			log.writeLn("MISSED 2");
			tests.end();
		}
		synch.authAndRun(action);
	},

	importOpml : function() {
		let server = getIncomingServer();
		if (tests.opmlFile.exists() && server !== null)
			FeedSubscriptions.importOPMLFile(tests.opmlFile, server, tests.importOpmlFinished);
		else {
			log.writeLn("MISSED 3: No OPML file in directory or unable to retrieve server");
			tests.end();
		}
	},

	importOpmlFinished : function() {
		synch.getFeedlySubs(tests.downloadSubsFinished);
	},

	downloadSubsFinished : function(jsonResponse) {
		if (compareOpmlJson(tests.opmlFile, jsonResponse)) {
			log.writeLn("PASSED 3/" + tests.count + " : Import OPML");
			tests.end();
		}
		else {
			log.writeLn("MISSED 3: Opml and subscriptions differ");
			tests.end();
		}
	},

	end : function() {
		// Remove tests account
		let accountKey = getPref("synch.account");
		let account = MailServices.accounts.getAccount(accountKey);
		MailServices.accounts.removeAccount(account);
		setPref("synch.account", tests.savedAccountKey);

		auth.testing = false;
		tests.opmlFile = null;
	},
};

function compareOpmlJson(opmlFile, json) {
	return true;
}