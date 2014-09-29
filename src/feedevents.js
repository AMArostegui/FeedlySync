Cu.import("resource:///modules/FeedUtils.jsm");
include("src/synch.js");

var FeedEvents = {
		subscriptionsWindow : null,		
		category : "",
		
		SubsWndCmdListener : function(event) {
			if (event == null || event.target == null)
				return;			
			
			this.category = "";
		    let sel = this.subscriptionsWindow.mView.selection;
		    if (sel.count != 1)
		      return;
		    let item = this.subscriptionsWindow.mView.getItemAtIndex(sel.currentIndex);
		    if (!item || item.container)
		      return;
		    let feedId = item.url;			
			
			switch (event.target.id) {
				case "removeFeed":
					Synch.OnLocalUnsubscribe(feedId);
					break;
			}		
		},		
		
		FeedDownloadedFnc : function(feed, aErrorCode) {
			if (aErrorCode == FeedUtils.kNewsBlogSuccess)
				Synch.OnLocalSubscribe(feed.url, feed.name, this.category);			
			this.subscriptionsWindow.FeedSubscriptions.mFeedDownloadCallback.downloadedPrimary(feed, aErrorCode);			
		},
		
		retryCount : 0,
		
		MainWndCmdListener : function(event) {
			if (event == null || event.target == null)
				return;
			if (event.target.id != "folderPaneContext-subscribe")
				return;
			
			// Wait until subscriptions window is ready to trap its commands
			this.retryCount = 0;
			this.subscriptionsWindow = null;
			let interval = win.setInterval(function() {		
				this.subscriptionsWindow =
				    Services.wm.getMostRecentWindow("Mail:News-BlogSubscriptions");		
				if (this.subscriptionsWindow != null) {
					win.clearInterval(interval);
					Log.WriteLn("FeedEvents.MainWndCmdListener");
					
					// 1) Listener for feed handling commands					
					this.subscriptionsWindow.addEventListener(
							"command", FeedEvents.SubsWndCmdListener, false);
					
					// 2) To properly respond to addFeed command we need to wait for
					// download results. Override parent function to achieve this
					this.subscriptionsWindow.FeedSubscriptions.mFeedDownloadCallback.downloadedPrimary = 
						this.subscriptionsWindow.FeedSubscriptions.mFeedDownloadCallback.downloaded;
					this.subscriptionsWindow.FeedSubscriptions.mFeedDownloadCallback.downloaded = 
						this.FeedDownloadedFnc;										
				}
				else if (this.retryCount < 20)
					this.retryCount++;
				else
					win.clearInterval(interval);
			}, 300);		
		},
		
		OnItemRemoved : function(parentItem, item) {
			if (!(item instanceof Ci.nsIMsgFolder))
				return;
			if (parentItem == null) {
				Log.WriteLn("FeedEvents.OnItemRemoved. parentItem is null");
				return;			
			}
			
			// Check whether this event happened in our target server		
			let rootFolder = GetRootFolder();
			if (rootFolder == null) {
				Log.WriteLn("FeedEvents.OnItemRemoved. rootFolder is null");
				return;
			}
			if (parentItem.rootFolder != rootFolder)
				return;		
			
			// Recycle bin: Removing item or emptying
			if (parentItem.isSpecialFolder(Ci.nsMsgFolderFlags.Trash, true))
				return;
			if (item.isSpecialFolder(Ci.nsMsgFolderFlags.Trash, false))
				return;
			
			Log.WriteLn("FeedEvents.OnItemRemoved");
			let deletedFolders = [];
			if (parentItem.rootFolder == parentItem) {
				Log.WriteLn("FeedEvents.OnItemRemoved. Category folder removed: " + item.prettyName);
				for each (let folder in fixIterator(parentItem.subFolders, Ci.nsIMsgFolder)) {
					deletedFolders.push(folder);			
				}	
			}
			else {
				Log.WriteLn("FeedEvents.OnItemRemoved. Feed removed: " + item.prettyName);
				deletedFolders.push(item);			
			}
			
			Synch.OnLocalDeletedFlds(deletedFolders)
		},		
			
		AddListener : function() {
			Log.WriteLn("FeedEvents.AddListener");
			win.addEventListener("command", this.MainWndCmdListener, false);
			let notifyFlags = Ci.nsIFolderListener.removed;
			MailServices.mailSession.AddFolderListener(this, notifyFlags);			
		},

		RemoveListener : function() {
			Log.WriteLn("FeedEvents.RemoveListener");
			win.removeEventListener("command", this.MainWndCmdListener);
			MailServices.mailSession.RemoveFolderListener(this);
		}	
	};
