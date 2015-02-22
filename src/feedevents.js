Components.utils.import("resource:///modules/FeedUtils.jsm");
include("src/synch.js");

var feedEvents = {
		retryCount : 0,

		mainWndCmdListener : function(event) {
			if (event === null || event.target === null)
				return;
			if (event.target.id !== "folderPaneContext-subscribe")
				return;

			// Wait until subscriptions window is ready to trap its commands
			feedEvents.retryCount = 0;
			let subscriptionsWindow = null;
			let interval = win.setInterval(function() {
				subscriptionsWindow =
				    Services.wm.getMostRecentWindow("Mail:News-BlogSubscriptions");
				if (subscriptionsWindow !== null) {
					win.clearInterval(interval);
					log.writeLn("FeedEvents.mainWndCmdListener");

					// Trap OPML import ending
					let feedSubscriptions = subscriptionsWindow.FeedSubscriptions;
					feedSubscriptions.importOPMLFinishedPrimary = feedSubscriptions.importOPMLFinished;
					feedSubscriptions.importOPMLFinished = function (aStatusReport, aLastFolder, aWin) {
						feedSubscriptions.importOPMLFinishedPrimary(aStatusReport, aLastFolder, aWin);
						feedEvents.onImportOPMLFinished();
					};
				}
				else if (feedEvents.retryCount < 20)
					feedEvents.retryCount++;
				else
					win.clearInterval(interval);
			}, 300);
		},

		// Thunderbird Server, Feed and Folder hierarchy:
		// Only the first feed of feedname-level folders will be synchronized
		//		Server1 => Local (Not marked as synchronizable in TB Settings)
		//		Server2 => Syncronized (Marked)
		//			Folder2-1, ..., Folder2-N: Category n name => Synchronized
		//				Feed2-n-1, ..., Feed2-n-K  => Local
		//				Folder2-n-1, ..., Folder2-n-L: Feed l name => Synchronized
		//					Feed2-n-l-1 => Synchronized
		//					Feed2-n-l-2, ..., Feed2-n-l-M => Local
		//					Folder(...) : All folder in lower levels are local
		checkFolderLevel : function(aFolder) {
			if (aFolder === null)
				return false;
			let aParentFolder = aFolder.parent;
			if (aParentFolder === null)
				return false;
			let rootFolder = getRootFolder();
			if (rootFolder === null)
				return false;
			if (aParentFolder.parent !== rootFolder)
				return false;
			return true;
		},

		subscribed : [],

		onImportOPMLFinished : function() {
			if (SynchDirection.IsDownload())
				return;

			if (feedEvents.subscribed.length <= 0)
				return;
			log.writeLn("FeedEvents.onImportOPMLFinished. Count=" + feedEvents.subscribed.length);
			feedEvents.feedFolders = {};
			let action = function() {
				synch.srvSubscribe(feedEvents.subscribed, "FeedEvents.onImportOPMLFinished", true);
				feedEvents.subscribed = [];
			};
			synch.authAndRun(action);
		},

		// Helper dictionary. Stores whether a folder contains feeds
		// Intended to avoid calling repeatedly FeedUtils.getFeedUrlsInFolder which seems inefficient
		feedFolders : {},

		onAddFeed : function(aFeed) {
			if (SynchDirection.IsDownload())
				return;

			if (synch.updateRunning)
				return;
			let subscriptionsWindow =
			    Services.wm.getMostRecentWindow("Mail:News-BlogSubscriptions");
			if (subscriptionsWindow === null) {
				log.writeLn("FeedEvents.onAddFeed. Subscribing not using dialog. Unexpected situation");
				return;
			}
			if (!feedEvents.checkFolderLevel(aFeed.folder))
				return;
			if (aFeed.mFolder === null || aFeed.mFolder.parent === null) {
				log.writeLn("FeedEvents.onAddFeed. No parent folder. Cannot retrieve category");
				return;
			}

			let feedSubscriptions = subscriptionsWindow.FeedSubscriptions;
			if (feedSubscriptions.mActionMode !== feedSubscriptions.kImportingOPML) {
				let feedUrlArray = FeedUtils.getFeedUrlsInFolder(aFeed.mFolder);
				if (feedUrlArray !== null && feedUrlArray.length > 1) {
					log.writeLn("FeedEvents.onAddFeed. Only first feed of folder will be synchronized. Ignored: " + aFeed.url);
					return;
				}
				let action = function() {
					synch.srvSubscribe( { id : aFeed.url, name : aFeed.title, category : aFeed.mFolder.parent.name },
						"FeedEvents.onAddFeed", true);
				};
				synch.authAndRun(action);
			}
			else {
				switch (feedEvents.feedFolders[aFeed.mFolder.URI]) {
				// Mark as processed to avoid subsequent calling
				case undefined:
					feedEvents.feedFolders[aFeed.mFolder.URI] = true;
					let feedUrlArray = FeedUtils.getFeedUrlsInFolder(aFeed.mFolder);
					if (feedUrlArray !== null && feedUrlArray.length > 1)
						return;
					break;

				// The folder has subscribed a feed
				case true:
					return;
				}
				feedEvents.subscribed.push( { id : aFeed.url, name : aFeed.title, category : aFeed.mFolder.parent.name } );
			}
		},

		isRootFolder : function(parentItem, item) {
			if (parentItem !== null)
				return false;
			if (!(item instanceof Components.interfaces.nsIMsgFolder))
				return false;
			if (item.server === null || item.server.type !== "rss")
				return false;

			let accountKey = getPref("synch.account");
			if (accountKey === "")
				return false;

			return null === MailServices.accounts.getAccount(accountKey);
		},

		unsubscribed : [],

		OnItemRemoved : function(parentItem, item) {
			if (SynchDirection.IsDownload())
				return;

			if (synch.updateRunning)
				return;
			if (feedEvents.isRootFolder(parentItem, item)) {
				log.writeLn("FeedEvents.OnItemRemoved. Removing synchronized account");
				setPref("synch.account", "");
				synch.deleteStatusFile();
				return;
			}

			if (feedEvents.unsubscribed.length <= 0)
				return;
			log.writeLn("FeedEvents.OnItemRemoved. Count=" + feedEvents.unsubscribed.length);
			let action = function () {
				synch.srvUnsubscribe(feedEvents.unsubscribed, "FeedEvents.OnItemRemoved");
				feedEvents.unsubscribed = [];
			};
			synch.authAndRun(action);
		},

		onDeleteFeed : function(aId, aServer, aParentFolder) {
			if (SynchDirection.IsDownload())
				return;

			if (synch.updateRunning)
				return;

			// Do not use synch.checkFolderLevel. By this point, parent folder is recycle bin
			let rootFolder = getRootFolder();
			if (rootFolder === null)
				return;
			if (aParentFolder.rootFolder !== rootFolder)
				return;
			let node = synch.findDomNode(aId.Value);
			if (node === null)
				return;

			let subsWnd = Services.wm.getMostRecentWindow("Mail:News-BlogSubscriptions");
			if (subsWnd !== null) {
				let action = function() {
					synch.srvUnsubscribe( { id : aId.Value, domNode : node },
						"FeedEvents.onDeleteFeed");
				};
				synch.authAndRun(action);
			}
			else
				feedEvents.unsubscribed.push( { id : aId.Value, domNode : node } );
		},

		addListener : function() {
			log.writeLn("FeedEvents.AddListener");

			// Folder events listener
			let notifyFlags = Components.interfaces.nsIFolderListener.removed;
			MailServices.mailSession.AddFolderListener(this, notifyFlags);

			// Main window command listener
			win.addEventListener("command", feedEvents.mainWndCmdListener, false);

			// We need to know when user's subscribed/unsuscbrided to a Feed
			FeedUtils.addFeedPrimary = FeedUtils.addFeed;
			FeedUtils.addFeed = function(aFeed) {
				FeedUtils.addFeedPrimary(aFeed);
				feedEvents.onAddFeed(aFeed);
			};
			FeedUtils.deleteFeedPrimary = FeedUtils.deleteFeed;
			FeedUtils.deleteFeed = function(aId, aServer, aParentFolder) {
				feedEvents.onDeleteFeed(aId, aServer, aParentFolder);
				FeedUtils.deleteFeedPrimary(aId, aServer, aParentFolder);
			};
		},

		removeListener : function() {
			log.writeLn("FeedEvents.RemoveListener");
			MailServices.mailSession.RemoveFolderListener(this);

			win.removeEventListener("command", feedEvents.mainWndCmdListener);

			FeedUtils.addFeed = FeedUtils.addFeedPrimary;
			FeedUtils.addFeedPrimary = null;
			FeedUtils.deleteFeed = FeedUtils.deleteFeedPrimary;
			FeedUtils.deleteFeedPrimary = null;
		}
	};
