Components.utils.import("resource://gre/modules/AddonManager.jsm");
Components.utils.import("resource:///modules/iteratorUtils.jsm");

const FEED_LOCALSTATUS_SYNC = 1;
const FEED_LOCALSTATUS_DEL = 2;

var synch = {
	activityMng : null,
	process : null,

	// Object initialization
	startup : function() {
		if (synch.activityMng === null) {
			synch.activityMng = Components.classes["@mozilla.org/activity-manager;1"].
				getService(Components.interfaces.nsIActivityManager);
		}
		synch.readStatusFile();
	},

	// Begin synchronization process
	begin : function () {
		synch.getFeedlySubs();
	},

	actionInProgress : null,

	openSettingsDialog : function(addon) {
		log.writeLn("synch.OpenSettingDialog");
		Services.ww.openWindow(null, addon.optionsURL, null, "chrome,private,centerscreen,modal", this);
		if (getPref("synch.account") === "")
			log.writeLn("synch.OpenSettingDialog. No account. Action=" + synch.actionInProgress);
		else
			synch.authAndRun(synch.actionInProgress);
		synch.actionInProgress = null;
	},

	// Ensure account and authentication before running action
	authAndRun : function(action) {
		let account = getPref("synch.account");
		let ready = auth.ready();
		log.writeLn("synch.authAndRun. Account = " + account + " Ready = " + ready);

		if (account === "") {
			AddonManager.getAddonByID(addonId, synch.openSettingsDialog);
			synch.actionInProgress = action;
			return;
		}

		if (!ready) {
			auth.onFinished = function(success) {
				if (success)
					action();
				else
					log.writeLn("synch.authAndRun. Unable to authenticate. Action=" + action);

				auth.onFinished = null;
			};
			auth.init();
		}
		else
			action();
	},

	domFeedStatus : null,

	deleteStatusFile : function () {
		let id = addonId;
		let fileFeedStatus = FileUtils.getFile("ProfD", ["extensions", id, "data", "feeds.xml"], false);
		if (fileFeedStatus.exists())
			fileFeedStatus.remove(false);
		synch.readStatusFile();
	},

	readStatusFile : function() {
		domFeedStatus = null;
		let parser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
			.createInstance(Components.interfaces.nsIDOMParser);
		let id = addonId;
		let fileFeedStatus = FileUtils.getFile("ProfD", ["extensions", id, "data", "feeds.xml"], false);
		if (!fileFeedStatus.exists()) {
			log.writeLn("synch.readStatusFile. File not found. Creating");
			fileFeedStatus.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
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
		}
		else {
			NetUtil.asyncFetch(fileFeedStatus, function(inputStream, status) {
				if (!Components.isSuccessCode(status)) {
					log.writeLn("synch.readStatusFile. Error reading file");
					return;
				}
				let xmlFeedStatus = NetUtil.readInputStreamToString(inputStream, inputStream.available());
				log.writeLn("synch.readStatusFile. Readed XML = " + xmlFeedStatus);
				domFeedStatus = parser.parseFromString(xmlFeedStatus, "text/xml");
			});
		}
	},

	writeStatusFile : function() {
	    let id = addonId;
	    let domSerializer = Components.classes["@mozilla.org/xmlextras/xmlserializer;1"]
        					.createInstance(Components.interfaces.nsIDOMSerializer);
		let strDom = domSerializer.serializeToString(domFeedStatus);
		log.writeLn("synch.writeStatusFile. Status XML = " + strDom);
		let fileFeedStatus = FileUtils.getFile("ProfD",
				["extensions", id, "data", "feeds.xml"], false);
		let outStream = FileUtils.openSafeFileOutputStream(fileFeedStatus);
		let converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].
		                createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
		converter.charset = "UTF-8";
		let inStream = converter.convertToInputStream(strDom);
		NetUtil.asyncCopy(inStream, outStream);
	},

	getFeedlySubs : function() {
		log.writeLn("synch.getFeedlySubs");
		let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
		.createInstance(Components.interfaces.nsIXMLHttpRequest);
		let fullUrl = getPref("baseSslUrl") + getPref("synch.subsOp");
		fullUrl = encodeURI(fullUrl);
		req.open("GET", fullUrl, true);
		req.setRequestHeader(getPref("synch.tokenParam"), auth.tokenAccess);
		req.onload = function (e) {
			if (e.currentTarget.readyState == 4) {
				log.writeLn(formatEventMsg("synch.getFeedlySubs", e));
				if (e.currentTarget.status == 200) {
					let jsonResponse = JSON.parse(e.currentTarget.responseText);
					synch.update(jsonResponse);
				}
				else
					return;
			}
		};
		req.onerror = function (error) {
			log.writeLn(formatEventMsg("synch.getFeedlySubs. Error", error));
		};
		log.writeLn("synch.getFeedlySubs. Url: " + fullUrl);
		req.send(null);
	},

	addFeed2Dom : function(id) {
		if (synch.findDomNode(id) !== null)
			return;
		
		let nodeFeed = domFeedStatus.createElement("feed");
		let nodeStatus = domFeedStatus.createElement("status");
		nodeStatus.textContent = FEED_LOCALSTATUS_SYNC;
		let nodeId = domFeedStatus.createElement("id");
		nodeId.textContent = id;
		let nodeParent = domFeedStatus.getElementsByTagName("feeds")[0];
		nodeFeed.appendChild(nodeStatus);
		nodeFeed.appendChild(nodeId);
		nodeParent.appendChild(nodeFeed);
	},

	findDomNode : function(id, status) {
		let xpathExpression;
		if (status === undefined || status === null)
			xpathExpression = "/feeds/feed[id='" + id + "']";
		else
		    xpathExpression = "/feeds/feed[id='" + id +
    			"' and status=" + status + "]";

	    let xpathResult = domFeedStatus.evaluate(xpathExpression, domFeedStatus,
	    		null, Components.interfaces.nsIDOMXPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
	    if (xpathResult === null)
	    	return null;
	    return xpathResult.iterateNext();
	},

	subscribeFeed : function(feed, op, next) {
		let onLoadAdd = function(e) {
			if (e.currentTarget.readyState == 4) {
				log.writeLn(formatEventMsg("synch.subscribeFeed.onLoadAdd ", e));
				if (e.currentTarget.status == 200) {
					let domNode = synch.findDomNode(feed.id);
					if (domNode === null)
						synch.addFeed2Dom(feed.id);
					else
						log.writeLn("synch.subscribeFeed.onLoadAdd. Already in status file. Unexpected situation");				
				}
				next();
			}
		};

		let onLoadDel = function(e) {
			if (e.currentTarget.readyState == 4) {
				log.writeLn(formatEventMsg("synch.subscribeFeed.onLoadDel ", e));
				if (e.currentTarget.status == 200) {
					let domNode = synch.findDomNode(feed.id);
					if (domNode !== null) {
						let parentNode = domNode.parentNode;
						if (parentNode !== null)
							parentNode.removeChild(domNode);
						else
							log.writeLn("synch.subscribeFeed.onLoadDel. No parent node. Unexpected situation");
					}
					else
						log.writeLn("synch.subscribeFeed.onLoadDel. Not in status file. Unexpected situation");					
				}
				next();
			}
		};

		let onErrorAdd = function(error) {
			log.writeLn(formatEventMsg("synch.subscribeFeed.onErrorAdd ", error));
			next();
		};

		let onErrorDel = function(error) {
			log.writeLn(formatEventMsg("synch.subscribeFeed.onErrorDel ", error));

			// Unable to unsubscribe. Mark feed as deleted. It will be removed in the future.
			let domNode = synch.findDomNode(feed.id);
			if (domNode !== null) {
				let statusNodes = domNode.getElementsByTagName("status");
				if (statusNodes.length > 0) {
					let statusNode = statusNodes[0];
					statusNode.textContent = FEED_LOCALSTATUS_DEL;
				}
				else
					log.writeLn("synch.subscribeFeed.onErrorDel. No status node. Unexpected situation");
			}
			else
				log.writeLn("synch.subscribeFeed.onErrorDel. Not in status file. Unexpected situation");

			next();
		};

		let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
			.createInstance(Components.interfaces.nsIXMLHttpRequest);
		let jsonSubscribe = null;
		let fullUrl = encodeURI(getPref("baseSslUrl") + getPref("synch.subsOp") + "/");

		if (op) {
			req.open("POST", fullUrl, true);
			req.setRequestHeader(getPref("synch.tokenParam"), auth.tokenAccess);
			req.setRequestHeader("Content-Type", "application/json");
			jsonSubscribe = "{\n";
			if (!synch.isUncategorized(feed.category)) {
				jsonSubscribe += "\t\"categories\" : [\n";
				jsonSubscribe += "\t\t{\n";
				jsonSubscribe += "\t\t\t\"id\" : \"user/" + auth.userId +
								"/category/" + feed.category + "\",\n";
				jsonSubscribe += "\t\t\t\"label\" : \"" + feed.category + "\"\n";
				jsonSubscribe += "\t\t}\n";
				jsonSubscribe += "\t],\n";
			}
			else
				jsonSubscribe += "\t\"categories\" : [],\n";
			jsonSubscribe += "\t\"id\" : \"feed/" + feed.id + "\",\n";
			jsonSubscribe += "\t\"title\" : \"" + feed.name + "\"\n";
			jsonSubscribe += "}";

			req.onload = onLoadAdd;
			req.onerror = onErrorAdd;
		}
		else {
			fullUrl = fullUrl + encodeURIComponent("feed/" + feed.id);

			req.open("DELETE", fullUrl, true);
			req.setRequestHeader(getPref("synch.tokenParam"), auth.tokenAccess);

			req.onload = onLoadDel;
			req.onerror = onErrorDel;
		}

		log.writeLn("synch.subscribeFeed. Add: " + op + " Url: " + fullUrl + " Json: " + jsonSubscribe);
		req.send(jsonSubscribe);
	},

	subsTo : [],
	subsOp : [],

	subscribeFeeds : function(subs, addOp, message) {
		if (synchDirection.isDownload()) {
			log.writeLn("synch.subscribeFeeds. In download mode. Unexpected situation. Aborted");
			return;
		}
		if (Object.prototype.toString.call(subs) !== "[object Array]") {
			subs = [].concat(subs);
		}
		if (subs.length <= 0)
			return;

		// Looks like the server is limited to one subscription each time.
		// Sometimes when trying to subscribe when another operation is running, we get
		// a response 200 status, but truth is the feed hasn't subscribed
		// Enqueue all ops
		let running = synch.subsTo.length > 0;
		synch.subsTo.push(subs);
		synch.subsOp.push(addOp);
		if (running) {
			log.writeLn("synch.subscribeFeeds. Queued. Add = " + addOp + " Entries = " + subs.length +
					" Op. Count = " + synch.subsTo.length + " Caller = " + message);
			return;
		}
		else
			log.writeLn("synch.subscribeFeeds. Begin. Add = " + addOp + " Entries = " +
					synch.subsTo.length + " Caller = " + message);

		let procOp = 0;
		let procEntry = 0;

		let subTo;
		let subOp;
		let subLogMsg;

		let begin = function() {
			// All operations done. Quit
			if (procOp >= synch.subsTo.length) {
				synch.subsTo = [];
				synch.subsOp = [];
				synch.writeStatusFile();
				return;
			}

			synch.process = Components.classes["@mozilla.org/activity-process;1"].
				createInstance(Components.interfaces.nsIActivityProcess);

			let folder = getRootFolder();
			let procCaption = addOp ? _("beginSubs", getPref("locale")) : _("beginUnsubs", getPref("locale"));
			synch.process.init(procCaption + ": " + folder.prettiestName, null);
			synch.process.contextType = "account";
			synch.process.contextObj = folder.server;
			synch.activityMng.addActivity(synch.process);

			procEntry = 0;
			subTo = synch.subsTo[procOp];
			subOp = synch.subsOp[procOp];

			log.writeLn("synch.subscribeFeeds. " +
					"Entries (" + (procEntry + 1) + "/" + subTo.length + ") " +
					"Ops (" + (procOp + 1) + "/" + synch.subsTo.length + ")");
			synch.subscribeFeed(subTo[procEntry], subOp, next);
		};

		let next = function() {
			if (procEntry == subTo.length - 1) {
				synch.process.state = Components.interfaces.nsIActivityProcess.STATE_COMPLETED;
				synch.activityMng.removeActivity(synch.process.id);

				let event = Components.classes["@mozilla.org/activity-event;1"].
					createInstance(Components.interfaces.nsIActivityEvent);
				let folder = getRootFolder();

				let evntCaption = addOp ? _("endSubs", getPref("locale")) : _("endUnsubs", getPref("locale"));
				event.init(evntCaption + ": " + folder.prettiestName,
				           null,
				           "",
				           synch.process.startTime,
				           Date.now());
				event.contextType = synch.process.contextType;
				event.contextObj = synch.process.contextObj;
				synch.activityMng.addActivity(event);
				synch.process = null;

				procOp++;
				begin();
			}
			else {
				let procCaption = addOp ? _("runSubs", getPref("locale")) : _("runUnsubs", getPref("locale"));
				let msg = procCaption + ": (" + (procEntry + 1) + "/" + subTo.length +")";
				synch.process.setProgress(msg,
						procEntry + 1, subTo.length);

				procEntry++;
				log.writeLn("synch.subscribeFeeds. " +
						"Entries (" + (procEntry + 1) + "/" + subTo.length + ") " +
						"Ops (" + (procOp + 1) + "/" + synch.subsTo.length + ")");
				synch.subscribeFeed(subTo[procEntry], subOp, next);
			}
		};

		begin();
	},

	subscribe : function(subscribe, message) {
		synch.subscribeFeeds(subscribe, true, message);
	},

	unsubscribe : function(unsubscribe, message) {
		synch.subscribeFeeds(unsubscribe, false, message);
	},

	renameCategory : function(oldName, newName) {
		let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
			.createInstance(Components.interfaces.nsIXMLHttpRequest);
		let fullUrl = encodeURI(getPref("baseSslUrl") + getPref("synch.categoryOp") + "/");
		fullUrl = fullUrl + encodeURIComponent("user/" + auth.userId + "/category/"  + oldName);

		req.open("POST", fullUrl, true);
		req.setRequestHeader(getPref("synch.tokenParam"), auth.tokenAccess);
		req.setRequestHeader("Content-Type", "application/json");
		let jsonRename = "{\n";
		jsonRename += "\t\"label\" : \"" + newName + "\"\n";
		jsonRename += "}";
		req.onload = function(e) {
			if (e.currentTarget.readyState == 4) {
				log.writeLn(formatEventMsg("synch.renameCategory.onLoad ", e));
			}
		};
		req.onerror = function (error) {
			log.writeLn(formatEventMsg("synch.renameCategory.onerror ", error));
		};

		log.writeLn("synch.renameCategory. Url: " + fullUrl + " Json: " + jsonRename);
		req.send(jsonRename);
	},

	// Returns feed url, given a Thunderbird folder
	//		tbFolder: nsIMsgFolder
	getFeedId : function(tbFolder) {
		let tbSubs = FeedUtils.getFeedUrlsInFolder(tbFolder);
		if (tbSubs === null)
			return null;

		let tbSub = null;

		// Select the one at the bigger index position, as Thundebird store the older in the last position
		for (var i = tbSubs.length - 1; i >= 0; i--) {
			// Sometimes an element is empty
			if (tbSubs[i] === "")
				continue;

			// A synchronized entry prevails over the rest.
			let node = synch.findDomNode(tbSubs[i]);
			if (node !== null) {
				tbSub = tbSubs[i];
				break;
			}
			if (tbSub === null)
				tbSub = tbSubs[i];
		}
		return tbSub;
	},

	// Returns the name if feed with the id was removed from subscription list
	// 		id: string containing feed url
	//		category: string contaning feed category name
	// 		feedlySubs: JSON retrieved from server
	getNameAndRemove : function(id, category, feedlySubs) {
		let i, j;
		let found = false;

	    for (i = 0; i < feedlySubs.length; i++) {
	        let feed = feedlySubs[i];

	        // Keep in mind "feed/" prefix
	        if (feed.id.substring(0, 5) != "feed/") {
	        	log.writeLn("synch.update. Missing 'feed/' in feed identifier");
	        	continue;
	        }
	        let feedId = feed.id.substring(5, feed.id.length);
	        if (feedId == id) {
	        	if (synch.isUncategorized(category)) {
	        		found = true;
	        		break;
	        	}
	        	else {
			        for (j = 0; j < feed.categories.length; j++) {
			        	if (feed.categories[j].label == category) {
			        		found = true;
			        		break;
			        	}
			        }
	        	}
	        }
	        if (found)
	        	break;
	    }

	    // Remove feed from list so it won't be processed in second pass
	    let feedName = null;
	    if (found) {
	    	feedName = feedlySubs[i].title;
	    	
	    	if (!synch.isUncategorized(category))
	    		feedlySubs[i].categories.splice(j, 1);
			if (feedlySubs[i].categories.length === 0)
				feedlySubs.splice(i, 1);
	    }

	    return feedName;
	},

	isUncategorized : function(category) {
		return category === "" || category === _("uncategorized", getPref("locale"));
	},

	removeFromTB : function(fldName) {
		// Delete rss folder
		let fldCategory = fldName.parent;
		if (fldCategory === null) {
			log.writeLn("synch.removeFromTB. Unable to get category folder. Unexpected situation");
			return;
		}
		let array = toXPCOMArray([fldName], Components.interfaces.nsIMutableArray);
		fldCategory.deleteSubFolders(array, null);

		// Delete category folder if empty
		if (!fldCategory.subFolders.hasMoreElements()) {
			let parent = fldCategory.parent;
			if (parent === null) {
				log.writeLn("synch.removeFromTB. Unable to get parent folder. Unexpected situation");
				return;
			}
			let array = toXPCOMArray([fldCategory], Components.interfaces.nsIMutableArray);
			parent.deleteSubFolders(array, null);
		}
	},

	// Flag to indicate whether synch.update method is running
	updateRunning : false,

	// Synchronize Thunderbird and Feedly
	update : function (feedlySubs) {
		let rootFolder = getRootFolder();
		if (rootFolder === null)
			return;

		let writeDOM = false;
		synch.updateRunning = true;

		try {
			// TODO: Hay que ver que se hace con los uncategorized
			// First pass: Thunderbird subscriptions
			let subscribe = [];
			for each (var fldCategory in fixIterator(rootFolder.subFolders, Components.interfaces.nsIMsgFolder)) {
				for each (var fldName in fixIterator(fldCategory.subFolders, Components.interfaces.nsIMsgFolder)) {

					let tbSub = synch.getFeedId(fldName);
					if (tbSub === null)
						continue;

				    // Find pair (feedId-category) in Thunderbird's selected account
					let tbCategory = fldCategory.prettiestName;
					let nameInServer = synch.getNameAndRemove(tbSub, tbCategory, feedlySubs);
					if (nameInServer !== null) {
						// If Feed is subscribed in Thunderbird, it should also be present in
						// status file. Add otherwise
						let node = synch.findDomNode(tbSub);
						if (node === null) {
							writeDOM = true;
							log.writeLn("synch.update. Not found in status file, but present on both sides. Add. (" +
									fldName.prettiestName + ")");
							synch.addFeed2Dom(tbSub);							
						}
						
						// Feed name might have changed
						if (nameInServer !== fldName.prettiestName) {
							if (synchDirection.isDownload()) {
								let selFlds = win.gFolderTreeView.getSelectedFolders();
								if (selFlds.length > 0) {
									if (selFlds[0] === fldName)
										win.gFolderTreeView.selection.clearSelection();
								}									
								fldName.rename(nameInServer, null);
							}
						}							
						
						// (feedId-category) found both in server and client. Nothing else to do
						continue;
					}						

				    // Subscribed in Thunderbird but not in Feedly
				    let node = synch.findDomNode(tbSub);

			    	// Check whether this feed was previously synchronized. If so, delete locally
					if (node !== null) {
						if (synchDirection.isUpload()) {
							subscribe.push( { id : tbSub , name : fldName.prettiestName,
								category : tbCategory } );
						}
						else {
							let nodeStatus = node.getElementsByTagName("status");
							if (nodeStatus !== null && nodeStatus.length == 1) {
								nodeStatus = nodeStatus[0];								
								synch.removeFromTB(fldName);
								if (nodeStatus.firstChild.nodeValue == FEED_LOCALSTATUS_SYNC)
									log.writeLn("synch.update. Svr=0 TB=1. Removing from TB: " + tbSub);
								else
									log.writeLn("synch.update. Svr=0 TB=1. Removing from TB: " + tbSub +
											" Status deleted in ctrl file. Unexpected situation");								

								// Remove DOM node from Ctrl file
								writeDOM = true;
								node.parentNode.removeChild(node);								
							}
							else
								log.writeLn("synch.Update. Svr=0 TB=1. Removing from TB: " + tbSub +
										" Ctrl file may be corrupted 1");
						}
					}

					// Not synchronized. Add to Feedly
					else {
						if (synchDirection.isDownload()) {
							synch.removeFromTB(fldName);
							log.writeLn("synch.update. Svr=0 TB=1. Removing from TB: " + tbSub);
						}
						else {
							subscribe.push( { id : tbSub , name : fldName.prettiestName,
								category : tbCategory } );
						}
					}
				}
			}

			// Second pass: Feedly subscriptions.
			// After first pass, remaining categories are guaranteed not to be present in Thunderbird
			let unsubscribe = [];
		    for (var subIdx = 0; subIdx < feedlySubs.length; subIdx++) {
		        let feed = feedlySubs[subIdx];
		        let feedId = feed.id.substring(5, feed.id.length); // Get rid of "feed/" prefix
		        let runOnce = true;
		        for (var categoryIdx = 0; categoryIdx < feed.categories.length || runOnce; categoryIdx++) {
		        	runOnce = false;
		        	let categoryName;
		        	if (feed.categories.length > 0)
		        		categoryName = feed.categories[categoryIdx].label;
		        	else
		        		categoryName = _("uncategorized", getPref("locale"));

					// Check whether this feed was locally deleted. If so, delete on server
				    let node = synch.findDomNode(feedId, FEED_LOCALSTATUS_DEL);
					if (node !== null) {
						if (!synchDirection.isDownload()) {
							let fullUrl = encodeURI(feedId);

							// Just save the Id of the feed I want to unsubscribe. Will be processed later
							unsubscribe.push( { id : fullUrl } );
						}
					}

					// Feed not found in Thunderbird
					else {
						if (synchDirection.isUpload()) {
							let fullUrl = encodeURI(feedId);
							node = synch.findDomNode(feedId);
							unsubscribe.push( { id : fullUrl } );
						}
						else {
							// Create category if necessary
							let fldCategory2;
							try {
								fldCategory2 = rootFolder.getChildNamed(categoryName);
							}
							catch (ex) {
								fldCategory2 = null;
							}
							if (fldCategory2 === null) {
								rootFolder.QueryInterface(Components.interfaces.nsIMsgLocalMailFolder).
									createLocalSubfolder(categoryName);
								fldCategory2 = rootFolder.getChildNamed(categoryName);
								log.writeLn("synch.update. Svr=1 TB=0. Add to TB. Creating category: " + categoryName);
							}
							else
								log.writeLn("synch.update. Svr=1 TB=0. Add to TB. Category found: " + categoryName);

							// Create feed folder
							let feedName = feed.title;
							let fldFeed;
							let wasCreated = false;
							try {
								fldFeed = fldCategory2.getChildNamed(feedName);
							}
							catch (ex) {
								fldFeed = null;
							}
							if (fldFeed === null) {
								fldCategory2.QueryInterface(Components.interfaces.nsIMsgLocalMailFolder).
									createLocalSubfolder(feedName);
								fldFeed = fldCategory2.getChildNamed(feedName);
								wasCreated = true;
							}

							// Subscribe
							if (!FeedUtils.feedAlreadyExists(feedId, fldFeed.server)) {
								let id = FeedUtils.rdf.GetResource(feedId);
								let feedAux = new Feed(id, fldFeed.server);
								feedAux.folder = fldFeed;
								feedAux.title = feedName;
								FeedUtils.addFeed(feedAux);
								log.writeLn("synch.update. Svr=1 TB=0. Add to TB. Url: " + feedId + " Name: " + feedName);
							}
							else {
								if (wasCreated)
									fldFeed.parent.propagateDelete(fldFeed, true, win.msgWindow);

								log.writeLn("synch.update. Svr=1 TB=0. Feed Already Exists? Url: " + feedId + " Name: " + feedName);
								continue;
							}

							writeDOM = true;
							synch.addFeed2Dom(feedId);
						}
					}
		        }
		    }

		    // Save Ctrl File for synchronous operations
		    if (subscribe.length <= 0 && unsubscribe.length <= 0) {
		    	if (writeDOM)
		    		synch.writeStatusFile();
		    }

		    if (!synchDirection.isDownload()) {
		    	// In case category name was changed, it's better to unsubscribe first
		    	synch.unsubscribe(unsubscribe, "synch.update. Svr=0 TB=1");
			    synch.subscribe(subscribe, "synch.update. Svr=0 TB=1");
		    }
		}
		catch (err) {
			log.writeLn("synch.update. Exception thrown: " + err);
		}
		finally {
			synch.updateRunning = false;
		}
	},

	synchTimerId : null,

	setTimer : function () {
		let timeout = getPref("synch.timeout") * 60 * 1000;
		log.writeLn("synch.setTimer. Timeout = " + timeout);

		// Synchronization timeout
		// Set timer to renew access token before expiration
		if (synch.synchTimerId !== null)
			win.clearInterval(synch.synchTimerId);

		synch.synchTimerId = win.setInterval(function synchTimeout() {
			let account = getPref("synch.account");
			let ready = auth.ready();
			log.writeLn("feedEvents.synchTimeout Account = " + account + " Ready = " + ready);

			// Doesn't look like a good idea to automatically show a window without user interaction
			if (account !== "" && ready)
				syncTBFeedly();
		}, timeout);
	},

	delTimer : function () {
		log.writeLn("synch.delTimer");

		if (synch.synchTimerId !== null) {
			win.clearInterval(synch.synchTimerId);
			synch.synchTimerId = null;
		}
	},

	observe : function (aSubject, aTopic, aData) {
		if (aData !== "extensions.FeedlySync.synch.timeout")
			return;
		log.writeLn("synch.observe. Timeout preference changed");

		synch.delTimer();
		synch.setTimer();
   },
};