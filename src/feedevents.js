Cu.import("resource:///modules/FeedUtils.jsm");
include("src/synch.js");

var FeedEvents = {
		subscriptionsWindow : null,		
		retryCount : 0,
		
		MainWndCmdListener : function(event) {
			if (event == null || event.target == null)
				return;
			if (event.target.id != "folderPaneContext-subscribe")
				return;
			
			// Wait until subscriptions window is ready to trap its commands
			FeedEvents.retryCount = 0;
			FeedEvents.subscriptionsWindow = null;
			let interval = win.setInterval(function() {		
				FeedEvents.subscriptionsWindow =
				    Services.wm.getMostRecentWindow("Mail:News-BlogSubscriptions");		
				if (FeedEvents.subscriptionsWindow != null) {
					win.clearInterval(interval);
					Log.WriteLn("FeedEvents.MainWndCmdListener");					
					
					// Trap OPML import ending
					let feedSubscriptions = FeedEvents.subscriptionsWindow.FeedSubscriptions; 
					feedSubscriptions.importOPMLFinishedPrimary = feedSubscriptions.importOPMLFinishedPrimary;
					feedSubscriptions.importOPMLFinished = function (aStatusReport, aLastFolder, aWin) {
						feedSubscriptions.importOPMLFinishedPrimary(aStatusReport, aLastFolder, aWin);
						
						Synch.SrvSubscribe(FeedEvents.subscribed);
						FeedEvents.subscribed = [];						
					};
				}
				else if (FeedEvents.retryCount < 20)
					FeedEvents.retryCount++;
				else
					win.clearInterval(interval);
			}, 300);		
		},
		
		OnItemRemoved : function(parentItem, item) {
			Log.WriteLn("Synch.OnLocalDeletedFlds");			
			Synch.SrvUnsubscribe(FeedEvents.unsubscribed);
			FeedEvents.unsubscribed = [];
		},
		
		subscribed : [],		
		OnAddFeed : function(aFeed) {
			if (FeedEvents.subscriptionWindow != null) {
				let feedSubscriptions = FeedEvents.subscriptionWindow.FeedSubscriptions;
				if (feedSubscriptions.mActionMode != FeedUtils.kImportingOPML)
					Synch.SrvSubscribe();						
				else
					subscribed.push( { feedId : "" , feedName : "", feedCategory : "", domNode : null } );
			}			
		},
		
		unsubscribed : [],		
		OnDeleteFeed : function(aId, aServer, aParentFolder) {
			let subsWnd = Services.wm.getMostRecentWindow("Mail:News-BlogSubscriptions");
			if (subsWnd != null)
				Synch.SrvUnsubscribe();
			else
				unsubscribed.push( { feedId : "", domNode : null } );			
		},
			
		AddListener : function() {
			Log.WriteLn("FeedEvents.AddListener");			
			
			// Listen to folder events
			let notifyFlags = Ci.nsIFolderListener.removed;
			MailServices.mailSession.AddFolderListener(this, notifyFlags);
			
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
			
			FeedUtils.addFeed = FeedUtils.addFeedPrimary;
			FeedUtils.addFeedPrimary = null;
			FeedUtils.deleteFeed = FeedUtils.deleteFeedPrimary;
			FeedUtils.deleteFeedPrimary = null;			
		}	
	};
