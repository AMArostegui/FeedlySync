// Feedly Synchronizer AddOn for Mozilla Thunderbird
// Developed by Antonio Miras Aróstegui
// Published under Mozilla Public License, version 2.0 (https://www.mozilla.org/MPL/2.0/)

Services.scriptloader.loadSubScript("chrome://messenger-newsblog/content/feed-subscriptions.js");

var tests = {

	saved : {
		accountKey : "",
		tokenAccess : "",
		tokenRefresh : "",
	},

	opmlFile : null,
	count : 3,

	begin : function() {
		auth.testing = true;
		statusFile.reset();

		let id = addonId;
		tests.opmlFile = FileUtils.getFile("ProfD", [id, "data", "testSubs.opml"], false);

		// Save current state
		tests.saved.accountKey = getPref("synch.account");
		tests.saved.tokenAccess = auth.tokenAccess;
		tests.saved.tokenRefresh = auth.tokenRefresh;

		// Create new account to perform tests in
		let account = FeedUtils.createRssAccount("Tests Account");
		setPref("synch.account", account.key);

		tests.login();
	},

	login : function() {
		auth.tokenAccess = "";
		auth.tokenRefresh = "";
		setPref("auth.tokenRefresh", "");

		let action = function() {
			log.writeLn("PASSED 1/" + tests.count + " : Full Authenticaton", true);
			tests.resumeLogin();
		};
		let error = function() {
			log.writeLn("MISSED 1", true);
			tests.end();
		};
		synch.authAndRun(action, error);
	},

	resumeLogin : function () {
		auth.tokenAccess = "";

		let action = function() {
			log.writeLn("PASSED 2/" + tests.count + " : Partial Authentication", true);
			tests.importOpml();
		};
		let error = function() {
			log.writeLn("MISSED 2", true);
			tests.end();
		};
		synch.authAndRun(action);
	},

	scopeDOMParser : null,

	importOpml : function() {
		function onCompareOmplJsonFinished(result) {
			if (result) {
				log.writeLn("PASSED 3/" + tests.count + " : Import OPML", true);
				tests.end();
			}
			else {
				log.writeLn("MISSED 3: Opml and subscriptions differ", true);
				tests.end();
			}
		}

		let server = getIncomingServer();
		if (tests.opmlFile.exists() && server !== null) {

			// feed-subscriptions.js is not designed to work as an stand alone module
			// This is a HACK to make the functions necessary for importOPMLFile
			// to work available within the scope
			tests.scopeDOMParser = DOMParser;
			DOMParser = function() {
				return Components.classes["@mozilla.org/xmlextras/domparser;1"]
					.createInstance(Components.interfaces.nsIDOMParser);
			};
			setTimeout = function(callback) {
				win.setTimeout(callback);
			};

			synch.onSubscribeFeedsFinished = function() {
				// I believe it's safe to assume  local import will be done before subscriptions
				synch.getFeedlySubs(function(jsonResponse) {
					comparer.opmlFileJsonObj(tests.opmlFile, jsonResponse, onCompareOmplJsonFinished);
				});
			};
			FeedSubscriptions.importOPMLFile(tests.opmlFile, server, function() {
				// Undo HACK. Clean Scope
				DOMParser = tests.scopeDOMParser;
				setTimeout = undefined;
			});
		}
		else {
			log.writeLn("MISSED 3: No OPML file in directory or unable to retrieve server", true);
			tests.end();
		}
	},

	end : function() {
		function onSynchAccountRemoved() {
			setPref("synch.account", tests.saved.accountKey);
			auth.tokenAccess = tests.saved.tokenAccess;
			auth.tokenRefresh = tests.saved.tokenRefresh;
			setPref("auth.tokenRefresh", auth.tokenRefresh);

			auth.testing = false;
			tests.opmlFile = null;
		}

		feedEvents.onSynchAccountRemoved = onSynchAccountRemoved;

		// Remove tests account
		let accountKey = getPref("synch.account");
		let account = MailServices.accounts.getAccount(accountKey);
		MailServices.accounts.removeAccount(account);
	},
};

var comparer = {
	debug : function(callback) {
		let id = addonId;

		let opmlFile = FileUtils.getFile("ProfD", [id, "data", "testSubs.opml"], false);
		if (!opmlFile.exists()) {
			callback(false);
			return;
		}

		let jsonFile = FileUtils.getFile("ProfD", [id, "data", "testSubs.json"], false);
		if (!jsonFile.exists()) {
			callback(false);
			return;
		}

		comparer.opmlFileJsonFile(opmlFile, jsonFile, callback);
	},

	opmlFileJsonFile : function(opmlFile, jsonFile, callback) {
		NetUtil.asyncFetch(jsonFile, function(inputStream, status) {
			if (!Components.isSuccessCode(status)) {
				callback(false);
				return;
			}

			let jsonStr = NetUtil.readInputStreamToString(inputStream, inputStream.available());
			let jsonObj = null;
			try {
				jsonObj = JSON.parse(jsonStr);
				comparer.opmlFileJsonObj(opmlFile, jsonObj, callback);
			}
			catch (err) {
				callback(false);
				return;
			}
		});
	},

	opmlFileJsonObj : function(opmlFile, jsonObj, callback) {
		NetUtil.asyncFetch(opmlFile, function(inputStream, status) {
			if (!Components.isSuccessCode(status)) {
				log.writeLn("MISSED 3: Error reading file", true);
				callback(false);
				return;
			}

			let theXml = NetUtil.readInputStreamToString(inputStream, inputStream.available(), { charset: "UTF-8" });
			let parser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
				.createInstance(Components.interfaces.nsIDOMParser);
			let theDom = parser.parseFromString(theXml, "text/xml");
			let chkCollection = theDom.getElementsByTagName("parsererror");
			if (chkCollection.length > 0) {
				log.writeLn("MISSED 3: Error parsing opml", true);
				callback(false);
				return;
			}

			compareParsed(theDom, jsonObj, callback);
		});

		function compareParsed(dom, json, callback) {
			let feedsByCat = {};

		    let bodyNode = dom.getElementsByTagName("body")[0];
		    let category = bodyNode.firstElementChild;
		    while (category !== null) {
		    	let feedTitle = category.firstElementChild;
		    	while (feedTitle !== null) {
		    		let feed = feedTitle.firstElementChild;
		    		let id = feed.getAttribute("xmlUrl");
		    		feedsByCat[id] = category.getAttribute("title");
		    		feedTitle = feedTitle.nextElementSibling;
		    	}
		    	category = category.nextElementSibling;
		    }

		    for (var subIdx = 0; subIdx < json.length; subIdx++) {
		        let feed = json[subIdx];
		        let feedId = feed.id.substring(5, feed.id.length); // Get rid of "feed/" prefix
		        let categoryName = "";
		        for (var categoryIdx = 0; categoryIdx < feed.categories.length; categoryIdx++) {
		        	if (feed.categories.length > 0)
		        		categoryName = feed.categories[categoryIdx].label;
		        	else
		        		categoryName = _("uncategorized", retrieveLocale());
		        }

		        if (feedsByCat[feedId] === undefined) {
		        	callback(false);
		        	return;
		        }
		        else if (feedsByCat[feedId] !== categoryName) {
		        	callback(false);
		        	return;
		        }
		        else
		        	delete feedsByCat[feedId];
		    }

		    callback(Object.keys(feedsByCat).length === 0);
		}
	},
};
