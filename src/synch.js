Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource:///modules/iteratorUtils.jsm");
Cu.import("resource:///modules/mailServices.js");
Cu.import("resource:///modules/FeedUtils.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");

var Synch = {
	// Get the user's subscriptions from Feedly
	Init : function () {
		this.ReadStatusFile();
	},
	
	domFeedStatus : null,
	
	ReadStatusFile : function() {
		domFeedStatus = null;
		let parser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
			.createInstance(Components.interfaces.nsIDOMParser);
		let addonId = "FeedlySync@AMArostegui";
		let fileFeedStatus = FileUtils.getFile("ProfD", ["extensions", addonId, "data", "feeds.xml"], false);
		if (!fileFeedStatus.exists()) {
			Log.WriteLn("Synch.ReadStatusFile. File not found. Creating");
			fileFeedStatus.create(Ci.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);			
			let strDom = "<?xml version=\"1.0\"?>";
			strDom += "<feeds>";		
			strDom += "</feeds>";			
			let outStream = FileUtils.openSafeFileOutputStream(fileFeedStatus);
			let converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].
			                createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
			converter.charset = "UTF-8";
			let inStream = converter.convertToInputStream(strDom);
			NetUtil.asyncCopy(inStream, outStream);
			domFeedStatus = parser.parseFromString(strDom, "text/xml");
			Synch.GetFeedlySubs();			
		}
		else {
			NetUtil.asyncFetch(fileFeedStatus, function(inputStream, status) {
				if (!Components.isSuccessCode(status)) {
					Log.WriteLn("Synch.ReadStatusFile. Error reading file");
					return;
				}
				let xmlFeedStatus = NetUtil.readInputStreamToString(inputStream, inputStream.available());
				Log.WriteLn("Synch.ReadStatusFile. Readed XML = " + xmlFeedStatus);
				domFeedStatus = parser.parseFromString(xmlFeedStatus, "text/xml");
				Synch.GetFeedlySubs();
			});			
		}		
	},
	
	WriteStatusFile : function() {		
	    let addonId = "FeedlySync@AMArostegui";
	    let domSerializer = Components.classes["@mozilla.org/xmlextras/xmlserializer;1"]
        					.createInstance(Components.interfaces.nsIDOMSerializer);	    
		let strDom = domSerializer.serializeToString(domFeedStatus);
		Log.WriteLn("Synch.WriteStatusFile. Status XML = " + strDom);
		let fileFeedStatus = FileUtils.getFile("ProfD",
				["extensions", addonId, "data", "feeds.xml"], false);								
		let outStream = FileUtils.openSafeFileOutputStream(fileFeedStatus);
		let converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].
		                createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
		converter.charset = "UTF-8";
		let inStream = converter.convertToInputStream(strDom);
		NetUtil.asyncCopy(inStream, outStream);		
	},
	
	GetFeedlySubs : function() {
		Log.WriteLn("Synch.GetFeedlySubs");
		let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
		.createInstance(Components.interfaces.nsIXMLHttpRequest);		
		let fullUrl = getPref("baseSslUrl") + getPref("Synch.subsOp");
		fullUrl = encodeURI(fullUrl);
		req.open("GET", fullUrl, true);
		req.setRequestHeader(getPref("Synch.tokenParam"), Auth.tokenAccess);
		req.onload = function (e) {
			if (e.currentTarget.readyState == 4) {
				Log.WriteLn("Synch.GetFeedlySubs. Status: " + e.currentTarget.status +
						" Response Text: " + e.currentTarget.responseText);
				if (e.currentTarget.status == 200) {
					let jsonResponse = JSON.parse(e.currentTarget.responseText);
					Synch.Update(jsonResponse);
				}
				else
					return;									
			}			
		};
		req.onerror = function (error) {		
			Log.WriteLn("Synch.GetFeedlySubs. Error: " + error);
		};
		Log.WriteLn("Synch.GetFeedlySubs. Url: " + fullUrl);
		req.send(null);		
	},
	
	// Synchronize Thunderbird and Feedly	
	Update : function (feedlySubs) {		
		// Get the folder's server we're synchronizing
		let selServer = null;
		for each (let account in fixIterator(MailServices.accounts.accounts, Ci.nsIMsgAccount)) {			
			let server = account.incomingServer;
			if (server) {
				if ("rss" == server.type &&
					server.key == getPref("Synch.accountKey")) {
					selServer = server;
					break;
				}
			}
		}		
		if (selServer == null)
			return;				
		let rootFolder = selServer.rootFolder;
		if (rootFolder == null)
			return;
		
		const FEED_LOCALSTATUS_SYNC = 1;
		const FEED_LOCALSTATUS_DEL = 2;
		let writeDom = false;
		
		// TODO: Hay que ver que se hace con los uncategorized
		// First pass: Thunderbird subscriptions
		for each (let fldCategory in fixIterator(rootFolder.subFolders, Ci.nsIMsgFolder)) {
			for each (let fldName in fixIterator(fldCategory.subFolders, Ci.nsIMsgFolder)) {
				tbSubs = FeedUtils.getFeedUrlsInFolder(fldName);
				if (tbSubs == null)
					continue;

				for (let i = 0; i < tbSubs.length; i++) {
					// Why is the first element always empty?
					if (tbSubs[i] == "")
						continue;
					
					// Seek pair feed-category in Feedly					
					let found = false;						
				    for (var j = 0; j < feedlySubs.length; j++) {
				        let feed = feedlySubs[j];
				        
				        // Keep in mind "feed/" prefix
				        if (feed.id.substring(0, 5) != "feed/") {
				        	Log.WriteLn("Synch.Update. Missing 'feed/' in feed identifier");
				        	continue;
				        }				        
				        let feedId = feed.id.substring(5, feed.id.length); 					        					        
				        if (feedId == tbSubs[i]) { 					        	
					        for (var k = 0; k < feed.categories.length; k++) {
					        	if (feed.categories[k].label == fldCategory.prettiestName) {
					        		found = true;
					        		break;
					        	}					        	
					        }					        	
				        }
				        if (found)
				        	break;
				    }
				    
				    // Feed-category found on both server and client. Won't be processed in second pass
				    if (found) { 
						feedlySubs[j].categories.splice(k, 1);
						if (feedlySubs[j].categories.length == 0)
							feedlySubs.splice(j, 1);
				    	continue;				    	
				    }				    	
				    
				    // Subscribed in Thunderbird but not in Feedly
				    let xpathExpression = "/feeds/feed[id='" + tbSubs[i] + "']";
				    let xpathResult = domFeedStatus.evaluate(xpathExpression, domFeedStatus,
				    		null, Ci.nsIDOMXPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
				    let node = xpathResult.iterateNext();
				    
			    	// Check whether this feed was previously synchronized. If so, delete locally				    
					if (node != null) {
						let nodeStatus = node.getElementsByTagName("status");
						if (nodeStatus != null && nodeStatus.length == 1) {
							nodeStatus = nodeStatus[0];							
							if (nodeStatus.firstChild.nodeValue == FEED_LOCALSTATUS_SYNC) {
								fldName.parent.propagateDelete(fldName, true, msgWindow);
								
								// Remove node from Ctrl file DOM
								writeDom = true;								
								node.parentNode.removeChild(node);
								Log.WriteLn("Synch.Update. Svr=0 TB=1. Removing from TB: " + tbSubs[i]);
							}
							else
								Log.WriteLn("Synch.Update. Svr=0 TB=1. Removing from TB: " + tbSubs[i] +
										" Ctrl file may be corrupted 2");							
						}
						else
							Log.WriteLn("Synch.Update. Svr=0 TB=1. Removing from TB: " + tbSubs[i] +
									" Ctrl file may be corrupted 1");						
					}		
					
					// Not synchronized. Add to Feedly
					else {								
						let fullUrl = getPref("baseSslUrl") + getPref("Synch.subsOp");
						fullUrl = encodeURI(fullUrl);
						let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
									.createInstance(Components.interfaces.nsIXMLHttpRequest);
						req.open("POST", fullUrl, true);
						req.setRequestHeader(getPref("Synch.tokenParam"), Auth.tokenAccess);
						req.setRequestHeader("Content-Type", "application/json");
						let jsonSubscribe = "{\n";
						jsonSubscribe += "\t\"categories\" : [\n";
						jsonSubscribe += "\t\t{\n";
						jsonSubscribe += "\t\t\t\"id\" : \"user/" + userId + 
										"/category/" + fldCategory.prettiestName + "\",\n";
						jsonSubscribe += "\t\t\t\"label\" : \"" + fldCategory.prettiestName + "\"\n";
						jsonSubscribe += "\t\t}\n";
						jsonSubscribe += "\t],\n";
						jsonSubscribe += "\t\"id\" : \"feed/" + tbSubs[i] + "\",\n";
						jsonSubscribe += "\t\"title\" : \"" + fldName.prettiestName + "\"\n";
						jsonSubscribe += "}";						
						req.onload = function (e) {
							if (e.currentTarget.readyState == 4) {
								Log.WriteLn("Synch.Update. Svr=0 TB=1. Add to Feedly. Status: " + e.currentTarget.status +
										" Response Text: " + e.currentTarget.responseText);
							}			
						};
						req.onerror = function (error) {		
							Log.WriteLn("Synch.Update. Svr=0 TB=1. Add to Feedly. Error: " + error);
						};
						Log.WriteLn("Synch.Update. Svr=0 TB=1. Add to Feedly. Url: " + fullUrl);
						req.send(jsonSubscribe);
					}				
					
					// Several feeds for category, just one feed by folder					
					break;
				}
			}				
		}
		
		// Second pass: Feedly subscriptions.
		// After first pass, remaining categories are guaranteed not to be present on Thunderbird
		let unsuscribe = [];
	    for (let subIdx = 0; subIdx < feedlySubs.length; subIdx++) {
	        let feed = feedlySubs[subIdx];
	        let feedId = feed.id.substring(5, feed.id.length); // Get rid of "feed/" prefix	        	        
	        for (let categoryIdx = 0; categoryIdx < feed.categories.length; categoryIdx++) {
	        	let categoryName = feed.categories[categoryIdx].label;
	        	
				// Check whether this feed was locally deleted. If so, delete on server
			    let xpathExpression = "/feeds/feed[id='" + feedId + 
		    		"' and status=" + FEED_LOCALSTATUS_DEL + "]";
			    let xpathResult = domFeedStatus.evaluate(xpathExpression, domFeedStatus,
			    	null, Ci.nsIDOMXPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
			    let node = xpathResult.iterateNext();	        	
				if (node != null) {					
					let fullUrl = encodeURI(getPref("baseSslUrl") + getPref("Synch.subsOp") + "/") +
						encodeURIComponent(feed.id);
					
					// Just save the Id of the feed I want to unsuscribe. Will be processed later
					unsuscribe.push( { feedId : fullUrl, domNode : node } );					
				}
				
				// Feed not synchronized. Add to Thunderbird
				else {
					// Create category if neccesary
					let fldCategory;
					try {
						fldCategory = rootFolder.getChildNamed(categoryName);
					} catch (ex) {
						fldCategory = null;
					}					
					if (fldCategory == null) {
						rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder).
                        	createLocalSubfolder(categoryName);
						fldCategory = rootFolder.getChildNamed(categoryName);
						Log.WriteLn("Synch.Update. Svr=1 TB=0. Add to TB. Creating category: " + categoryName);
					}
					else
						Log.WriteLn("Synch.Update. Svr=1 TB=0. Add to TB. Category found: " + categoryName);
					
					// Create feed folder
					let feedName = feed.title;					
					let fldFeed;
					try {
						fldFeed = fldCategory.getChildNamed(feedName);						
					} catch (ex) {
						fldFeed = null;
					}
					if (fldFeed == null) {
						fldCategory.QueryInterface(Ci.nsIMsgLocalMailFolder).
                			createLocalSubfolder(feedName);
						fldFeed = fldCategory.getChildNamed(feedName);						
					}
					
					// Subscribe					
					if (!FeedUtils.feedAlreadyExists(feedId, fldFeed.server)) {
						let id = FeedUtils.rdf.GetResource(feedId);
						let feedAux = new Feed(id, fldFeed.server);
						feedAux.folder = fldFeed;
						feedAux.title = feedName;
						FeedUtils.addFeed(feedAux);
						Log.WriteLn("Synch.Update. Svr=1 TB=0. Add to TB. Url: " + feedId + " Name: " + feedName);
					}
					else
					{
						Log.WriteLn("Synch.Update. Svr=1 TB=0. Feed Already Exists? Url: " + feedId + " Name: " + feedName);
						continue;						
					}														
					
					// Add to Ctrl File DOM
					writeDom = true;
					let nodeFeed = domFeedStatus.createElement("feed");
					let nodeStatus = domFeedStatus.createElement("status");
					nodeStatus.textContent = FEED_LOCALSTATUS_SYNC;
					let nodeId = domFeedStatus.createElement("id");
					nodeId.textContent = feedId;
					let nodeParent = domFeedStatus.getElementsByTagName("feeds")[0];
					nodeFeed.appendChild(nodeStatus);
					nodeFeed.appendChild(nodeId);
					nodeParent.appendChild(nodeFeed);					
				}
	        }
	    }
	    
	    // Save Ctrl File for synchronous operations
	    if (writeDom && unsuscribe.length <= 0)	    	
	    	Synch.WriteStatusFile();	    
	    
	    // Now that we know how many feeds we want to remove, we can update the status file after the last one	    
	    let processed = 0;
	    for (let i = 0; i < unsuscribe.length; i++) {
			let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
			.createInstance(Components.interfaces.nsIXMLHttpRequest);					
			req.open("DELETE", unsuscribe[i].feedId, true);
			req.setRequestHeader(getPref("Synch.tokenParam"), Auth.tokenAccess);
			req.onload = function (e) {
				if (e.currentTarget.readyState == 4) {
					Log.WriteLn("Synch.Update. Svr=1 TB=0. Remove from Feedly. Status: " +
							e.currentTarget.status + " Response Text: " + e.currentTarget.responseText);
					
					let node = unsuscribe[processed].domNode; 
					node.parentNode.removeChild(node);					
					if (processed == unsuscribe.length - 1)
						Synch.WriteStatusFile();
					processed++;
				}			
			};
			req.onerror = function (error) {		
				Log.WriteLn("Synch.Update. Svr=1 TB=0. Remove from Feedly. Error: " + error);				
				if (processed == unsuscribe.length - 1)
					Synch.WriteStatusFile();
				processed++;
			};
			Log.WriteLn("Synch.Update. Svr=1 TB=0. Remove from Feedly. Url: " + unsuscribe[i].feedId);
			req.send(null);	    	
	    }	    
	},
};