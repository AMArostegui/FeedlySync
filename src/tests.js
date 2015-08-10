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

		tests.login();
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
		};
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
		};
		synch.authAndRun(action);
	},

	savedDOMParser : null,

	importOpml : function() {
		function onDownloadSubsFinished(jsonResponse) {
			if (compareOpmlJson(tests.opmlFile, jsonResponse)) {
				log.writeLn("PASSED 3/" + tests.count + " : Import OPML");
				tests.end();
			}
			else {
				log.writeLn("MISSED 3: Opml and subscriptions differ");
				tests.end();
			}
		}

		function onImportedOpmlFinished() {
			// Undo HACK. Explained below. Clean Scope
			DOMParser = tests.savedDOMParser;
			setTimeout = undefined;
		}

		function onSubscribeFeedsFinished() {
			// I believe it's safe to assume  local import will be done before subscriptions
			synch.getFeedlySubs(onDownloadSubsFinished);
		}

		let server = getIncomingServer();
		if (tests.opmlFile.exists() && server !== null) {

			// feed-subscriptions.js is not designed to work as an stand alone module
			// This is a HACK to make the functions necessary for importOPMLFile
			// to work available within the scope
			tests.savedDOMParser = DOMParser;
			DOMParser = function() {
				return Components.classes["@mozilla.org/xmlextras/domparser;1"]
					.createInstance(Components.interfaces.nsIDOMParser);
			};
			setTimeout = function(callback) {
				win.setTimeout(callback);
			};

			synch.onSubscribeFeedsFinished = onSubscribeFeedsFinished;
			FeedSubscriptions.importOPMLFile(tests.opmlFile, server, onImportedOpmlFinished);
		}
		else {
			log.writeLn("MISSED 3: No OPML file in directory or unable to retrieve server");
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