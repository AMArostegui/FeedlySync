Cu.import("resource:///modules/FeedUtils.jsm");
include("src/synch.js");

var FeedEvents = {
		retryCount : 0,
		
		MainWndCmdListener : function(event) {
			if (event == null || event.target == null)
				return;
			if (event.target.id != "folderPaneContext-subscribe")
				return;
			
			// Wait until subscriptions window is ready to trap its commands
			FeedEvents.retryCount = 0;
			let subscriptionsWindow = null;
			let interval = win.setInterval(function() {		
				subscriptionsWindow =
				    Services.wm.getMostRecentWindow("Mail:News-BlogSubscriptions");		
				if (subscriptionsWindow != null) {
					win.clearInterval(interval);
					Log.WriteLn("FeedEvents.MainWndCmdListener");
				
					// Trap OPML import ending
					let feedSubscriptions = subscriptionsWindow.FeedSubscriptions; 
					feedSubscriptions.importOPMLFinishedPrimary = feedSubscriptions.importOPMLFinishedPrimary;
					feedSubscriptions.importOPMLFinished = function (aStatusReport, aLastFolder, aWin) {
						feedSubscriptions.importOPMLFinishedPrimary(aStatusReport, aLastFolder, aWin);
						FeedEvents.OnImportOPMLFinished();
					};
				}
				else if (FeedEvents.retryCount < 20)
					FeedEvents.retryCount++;
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
		CheckFolderLevel : function(aParentFolder) {
			if (aParentFolder == null)
				return false;
			let rootFolder = GetRootFolder();
			if (rootFolder == null)
				return false;
			if (aParentFolder.parent != rootFolder)
				return false;
			return true;			
		},
		
		subscribed : [],	
		
		OnImportOPMLFinished : function() {
			Log.WriteLn("FeedEvents.OnImportOPMLFinished. Count=" + FeedEvents.subscribed.length);
			FeedEvents.feedFolders = {};
			let action = function() {
				Synch.SrvSubscribe(FeedEvents.subscribed, "FeedEvents.OnImportOPMLFinished", true);
				FeedEvents.subscribed = [];
			};
			Synch.AuthAndRun(action);
		},
		
		// Helper dictionary. Stores whether a folder contains feeds
		// Intended to avoid calling repeatedly FeedUtils.getFeedUrlsInFolder which seems inefficient		
		feedFolders : {},
		
		OnAddFeed : function(aFeed) {
			if (Synch.updateRunning)
				return;
			let subscriptionsWindow =
			    Services.wm.getMostRecentWindow("Mail:News-BlogSubscriptions");
			if (subscriptionsWindow == null) {
				Log.WriteLn("FeedEvents.OnAddFeed. Subscribing not using dialog. Unexpected situation");
				return;				
			}
			if (!FeedEvents.CheckFolderLevel(aFeed.folder.parent))
				return;			
			if (aFeed.mFolder == null || aFeed.mFolder.parent == null) {
				Log.WriteLn("FeedEvents.OnAddFeed. No parent folder. Cannot retrieve category");
				return;
			}			
				
			let feedSubscriptions = subscriptionsWindow.FeedSubscriptions;
			if (feedSubscriptions.mActionMode != feedSubscriptions.kImportingOPML) {
				let feedUrlArray = FeedUtils.getFeedUrlsInFolder(aFeed.mFolder);
				if (feedUrlArray != null && feedUrlArray.length > 1) {
					Log.WriteLn("FeedEvents.OnAddFeed. Only first feed of folder will be synchronized. Ignored: " + aFeed.url);
					return;
				}				
				let action = function() {
					Synch.SrvSubscribe( { id : aFeed.url, name : aFeed.title, category : aFeed.mFolder.parent.name },
						"FeedEvents.OnAddFeed", true);
				};
				Synch.AuthAndRun(action);
			}
			else {
				switch (FeedEvents.feedFolders[aFeed.mFolder.URI]) {		
				// Mark as processed to avoid subsequent calling
				case undefined:
					FeedEvents.feedFolders[aFeed.mFolder.URI] = true;
					let feedUrlArray = FeedUtils.getFeedUrlsInFolder(aFeed.mFolder);					
					if (feedUrlArray != null && feedUrlArray.length > 1)						
						return;
					break;
					
				// The folder has subscribed a feed
				case true:
					return;				
				}
				FeedEvents.subscribed.push( { id : aFeed.url, name : aFeed.title, category : aFeed.mFolder.parent.name } );
			}				
		},
		
		unsubscribed : [],
		
		OnItemRemoved : function(parentItem, item) {
			if (Synch.updateRunning)
				return;
			
			Log.WriteLn("FeedEvents.OnItemRemoved. Count=" + FeedEvents.unsubscribed.length);
			let action = function () {
				Synch.SrvUnsubscribe(FeedEvents.unsubscribed, "FeedEvents.OnItemRemoved");
				FeedEvents.unsubscribed = [];
			};
			Synch.AuthAndRun(action);
		},
		
		OnDeleteFeed : function(aId, aServer, aParentFolder) {
			if (Synch.updateRunning)
				return;			
			if (!FeedEvents.CheckFolderLevel(aParentFolder))
				return;
			let node = Synch.FindDomNode(aId.Value);
			if (node == null)
				return;
			
			let subsWnd = Services.wm.getMostRecentWindow("Mail:News-BlogSubscriptions");
			if (subsWnd != null) {
				let action = function() {
					Synch.SrvUnsubscribe( { id : aId.Value, domNode : node },
						"FeedEvents.OnDeleteFeed");
				};
				Synch.AuthAndRun(action);
			}
			else
				FeedEvents.unsubscribed.push( { id : aId.Value, domNode : node } );
		},
			
		AddListener : function() {
			Log.WriteLn("FeedEvents.AddListener");			
			
			// Folder events listener
			let notifyFlags = Ci.nsIFolderListener.removed;
			MailServices.mailSession.AddFolderListener(this, notifyFlags);
			
			// Main window command listener
			win.addEventListener("command", FeedEvents.MainWndCmdListener, false);
			
			// We need to know when user's subscribed/unsuscbrided to a Feed
			FeedUtils.addFeedPrimary = FeedUtils.addFeed;
			FeedUtils.addFeed = function(aFeed) {
				FeedUtils.addFeedPrimary(aFeed);
				FeedEvents.OnAddFeed(aFeed);				
			};			
			FeedUtils.deleteFeedPrimary = FeedUtils.deleteFeed;
			FeedUtils.deleteFeed = function(aId, aServer, aParentFolder) {
				FeedUtils.deleteFeedPrimary(aId, aServer, aParentFolder);
				FeedEvents.OnDeleteFeed(aId, aServer, aParentFolder);				
			};			
		},

		RemoveListener : function() {
			Log.WriteLn("FeedEvents.RemoveListener");
			MailServices.mailSession.RemoveFolderListener(this);
			
			win.removeEventListener("command", FeedEvents.MainWndCmdListener);
			
			FeedUtils.addFeed = FeedUtils.addFeedPrimary;
			FeedUtils.addFeedPrimary = null;
			FeedUtils.deleteFeed = FeedUtils.deleteFeedPrimary;
			FeedUtils.deleteFeedPrimary = null;			
		}	
	};
