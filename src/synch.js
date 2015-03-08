Components.utils.import("resource://gre/modules/AddonManager.jsm");
Components.utils.import("resource:///modules/iteratorUtils.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");
Components.utils.import("resource://gre/modules/NetUtil.jsm");

const FEED_LOCALSTATUS_SYNC = 1;
const FEED_LOCALSTATUS_DEL = 2;

var synch = {
	// Get the user's subscriptions from Feedly
	init : function () {
		synch.getFeedlySubs();
	},

	actionInProgress : null,

	openSettingsDialog : function(addon) {
		log.writeLn("synch.OpenSettingDialog");
		Services.ww.openWindow(null, addon.optionsURL, null, "chrome,private,centerscreen,modal", this);
		if (getPref("synch.account") === "")
			log.writeLn("Synch.OpenSettingDialog. No account. Action=" + synch.actionInProgress);
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
				log.writeLn(formatEventMsg("synch.GetFeedlySubs", e));
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
    			"' and status=" + FEED_LOCALSTATUS_DEL + "]";

	    let xpathResult = domFeedStatus.evaluate(xpathExpression, domFeedStatus,
	    		null, Components.interfaces.nsIDOMXPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
	    if (xpathResult === null)
	    	return null;
	    return xpathResult.iterateNext();
	},

	subscribeRunning : false,

	srvSubscribe : function(subscribe, message, writeStatusFile) {
		if (synchDirection.isDownload()) {
			log.writeLn(message + " Add to Feedly while in download mode. Unexpected situation. Aborted");
			return;
		}
		if (Object.prototype.toString.call(subscribe) !== "[object Array]") {
			subscribe = [].concat(subscribe);
		}
		if (subscribe.length <= 0)
			return;

		log.writeLn(message + " Add to Feedly. Begin");

		// Looks like server is limited to one subscription each time.
		// Sometimes when trying to subscribe when another operation is running, we get
		// a response 200 status, but in fact, the feed hasn't subscribed
		// Wait until all operations are done
		if (synch.subscribeRunning) {
			let interval = win.setInterval(function() {
				if (!synch.subscribeRunning) {
					win.clearInterval(interval);
					synch.srvSubscribe(subscribe, message, writeStatusFile);
				}
				else
					log.writeLn(message + " Add to Feedly. Waiting for current op. to end");
			}, 1500);
		}

		try {
			synch.subscribeRunning = true;

			let processed = 0;
			let fullUrl = getPref("baseSslUrl") + getPref("synch.subsOp");
			fullUrl = encodeURI(fullUrl);
			let srvSubscribeFeed = function() {
				if (processed >= subscribe.length)
					return;

				let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
					.createInstance(Components.interfaces.nsIXMLHttpRequest);
				req.open("POST", fullUrl, true);
				req.setRequestHeader(getPref("synch.tokenParam"), auth.tokenAccess);
				req.setRequestHeader("Content-Type", "application/json");
				let jsonSubscribe = "{\n";
				jsonSubscribe += "\t\"categories\" : [\n";
				jsonSubscribe += "\t\t{\n";
				jsonSubscribe += "\t\t\t\"id\" : \"user/" + auth.userId +
								"/category/" + subscribe[processed].category + "\",\n";
				jsonSubscribe += "\t\t\t\"label\" : \"" + subscribe[processed].category + "\"\n";
				jsonSubscribe += "\t\t}\n";
				jsonSubscribe += "\t],\n";
				jsonSubscribe += "\t\"id\" : \"feed/" + subscribe[processed].id + "\",\n";
				jsonSubscribe += "\t\"title\" : \"" + subscribe[processed].name + "\"\n";
				jsonSubscribe += "}";
				req.onload = function (e) {
					if (e.currentTarget.readyState == 4) {
						log.writeLn(formatEventMsg(message + " Add to Feedly",
								e, processed, subscribe.length));
						let domNode = synch.findDomNode(subscribe[processed].id);
						if (domNode === null)
							synch.addFeed2Dom(subscribe[processed].id);
						else
							log.writeLn(message + " Already in status file. Unexpected situation");

						if (writeStatusFile && processed == subscribe.length - 1) {
							synch.writeStatusFile();
							synch.subscribeRunning = false;
						}
						else {
							processed++;
							srvSubscribeFeed();
						}
					}
				};
				req.onerror = function (error) {
					log.writeLn(formatEventMsg(message + " Add to Feedly. Error",
							error, processed, subscribe.length));
					if (writeStatusFile && processed == subscribe.length - 1)
						synch.writeStatusFile();
					processed++;
					srvSubscribeFeed();
				};
				log.writeLn(message + " Add to Feedly. Url: " + fullUrl + " Json: " + jsonSubscribe);
				req.send(jsonSubscribe);
			};
			srvSubscribeFeed();
		}
		finally {
			synch.subscribeRunning = false;
		}
	},

	unsubscribeRunning : false,

	srvUnsubscribe : function(unsubscribe, message) {
		if (synchDirection.isDownload()) {
			log.writeLn(message + " Remove from Feedly while in download mode. Unexpected situation. Aborted");
			return;
		}
		if (Object.prototype.toString.call(unsubscribe) !== "[object Array]") {
			unsubscribe = [].concat(unsubscribe);
		}
		if (unsubscribe.length <= 0)
			return;

		log.writeLn(message + " Remove from Feedly. Begin");

		// Take a look to comment in SrvSubscribe
		if (synch.unsubscribeRunning) {
			let interval = win.setInterval(function() {
				if (!synch.unsubscribeRunning) {
					win.clearInterval(interval);
					synch.srvUnsubscribe(unsubscribe, message, writeStatusFile);
				}
				else
					log.writeLn(message + " Remove from Feedly. Waiting for current op. to end");
			}, 1500);
		}

		try {
			synch.unsubscribeRunning = true;

			let processed = 0;
			let url = encodeURI(getPref("baseSslUrl") + getPref("synch.subsOp") + "/");
			let srvUnsubscribeFeed = function() {
				if (processed >= unsubscribe.length)
					return;

				let req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
					.createInstance(Components.interfaces.nsIXMLHttpRequest);
				let fullUrl = url + encodeURIComponent("feed/" + unsubscribe[processed].id);
				req.open("DELETE", fullUrl, true);
				req.setRequestHeader(getPref("synch.tokenParam"), auth.tokenAccess);
				req.onload = function (e) {
					if (e.currentTarget.readyState == 4) {
						log.writeLn(formatEventMsg(message + " Remove from Feedly",
								e, processed, unsubscribe.length));
						let node = unsubscribe[processed].domNode;
						if (node !== null)
							node.parentNode.removeChild(node);

						// Update the status file when we're done
						if (processed == unsubscribe.length - 1) {
							synch.writeStatusFile();
							synch.unsubscribeRunning = false;
						}
						else {
							processed++;
							srvUnsubscribeFeed();
						}
					}
				};
				req.onerror = function (error) {
					log.writeLn(formatEventMsg(message + " Remove from Feedly. Error",
							error, processed, unsubscribe.length));

					// Unable to unsubscribe. Mark feed as deleted. It will be removed in the future.
					let node = unsubscribe[processed].domNode;
					let statusNodes = node.getElementsByTagName("status");
					if (statusNodes.length > 0) {
						let statusNode = statusNodes[0];
						statusNode.textContent = FEED_LOCALSTATUS_DEL;
					}
					else
						log.writeLn(message + " No status node. Unexpected situation");

					if (processed == unsubscribe.length - 1) {
						synch.writeStatusFile();
						synch.unsubscribeRunning = false;
					}
					else {
						processed++;
						srvUnsubscribeFeed();
					}
				};
				log.writeLn(message + " Remove from Feedly. Url: " + fullUrl);
				req.send(null);
			};
			srvUnsubscribeFeed();
		}
		finally {
			synch.unsubscribeRunning = false;
		}
	},

	// Flag to indicate whether synch.Update method is running
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
					let tbSubs = FeedUtils.getFeedUrlsInFolder(fldName);
					if (tbSubs === null)
						continue;

					for (var i = 0; i < tbSubs.length; i++) {
						// Why is the first element always empty?
						if (tbSubs[i] === "")
							continue;

						// Seek pair feed-category in Feedly. So far, TB cannot subscribe to the same feed
						// in different folders.
						let found = false;
						var k = 0;
					    for (var j = 0; j < feedlySubs.length; j++) {
					        let feed = feedlySubs[j];

					        // Keep in mind "feed/" prefix
					        if (feed.id.substring(0, 5) != "feed/") {
					        	log.writeLn("synch.update. Missing 'feed/' in feed identifier");
					        	continue;
					        }
					        let feedId = feed.id.substring(5, feed.id.length);
					        if (feedId == tbSubs[i]) {
						        for (k = 0; k < feed.categories.length; k++) {
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
							if (feedlySubs[j].categories.length === 0)
								feedlySubs.splice(j, 1);
					    	continue;
					    }

					    // Subscribed in Thunderbird but not in Feedly
					    let node = synch.findDomNode(tbSubs[i]);

				    	// Check whether this feed was previously synchronized. If so, delete locally
						if (node !== null) {
							if (synchDirection.isUpload()) {
								subscribe.push( { id : tbSubs[i] , name : fldName.prettiestName,
									category : fldCategory.prettiestName } );
							}
							else {
								let nodeStatus = node.getElementsByTagName("status");
								if (nodeStatus !== null && nodeStatus.length == 1) {
									nodeStatus = nodeStatus[0];
									if (nodeStatus.firstChild.nodeValue == FEED_LOCALSTATUS_SYNC) {
										fldName.parent.propagateDelete(fldName, true, win.msgWindow);

										// Remove node from Ctrl file DOM
										writeDOM = true;
										node.parentNode.removeChild(node);
										log.writeLn("synch.update. Svr=0 TB=1. Removing from TB: " + tbSubs[i]);
									}
									else
										log.writeLn("synch.update. Svr=0 TB=1. Removing from TB: " + tbSubs[i] +
												" Ctrl file may be corrupted 2");
								}
								else
									log.writeLn("synch.Update. Svr=0 TB=1. Removing from TB: " + tbSubs[i] +
											" Ctrl file may be corrupted 1");
							}
						}

						// Not synchronized. Add to Feedly
						else {
							if (synchDirection.isDownload()) {
								fldName.parent.propagateDelete(fldName, true, win.msgWindow);
								log.writeLn("synch.update. Svr=0 TB=1. Removing from TB: " + tbSubs[i]);
							}
							else {
								subscribe.push( { id : tbSubs[i] , name : fldName.prettiestName,
									category : fldCategory.prettiestName } );
							}
						}

						// Several feeds for category, just one feed by folder
						break;
					}
				}
			}

			// Second pass: Feedly subscriptions.
			// After first pass, remaining categories are guaranteed not to be present on Thunderbird
			let unsubscribe = [];
		    for (var subIdx = 0; subIdx < feedlySubs.length; subIdx++) {
		        let feed = feedlySubs[subIdx];
		        let feedId = feed.id.substring(5, feed.id.length); // Get rid of "feed/" prefix
		        for (var categoryIdx = 0; categoryIdx < feed.categories.length; categoryIdx++) {
		        	let categoryName = feed.categories[categoryIdx].label;

					// Check whether this feed was locally deleted. If so, delete on server
				    let node = synch.findDomNode(feedId, FEED_LOCALSTATUS_DEL);
					if (node !== null) {
						if (!synchDirection.isDownload()) {
							let fullUrl = encodeURI(feedId);

							// Just save the Id of the feed I want to unsubscribe. Will be processed later
							unsubscribe.push( { id : fullUrl, domNode : node } );
						}
					}

					// Feed not synchronized. Add to Thunderbird
					else {
						if (synchDirection.isUpload()) {
							let fullUrl = encodeURI(feedId);
							unsubscribe.push( { id : fullUrl, domNode : node } );
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
			    synch.srvSubscribe(subscribe, "synch.update. Svr=0 TB=1", unsubscribe.length <= 0);
			    synch.srvUnsubscribe(unsubscribe, "synch.update. Svr=0 TB=1");
		    }
		}
		finally {
			synch.updateRunning = false;
		}
	},
};