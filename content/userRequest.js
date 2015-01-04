function onPageLoad(aEvent) {
    let doc = aEvent.originalTarget;
    let wnd = doc.defaultView;	        
    if (doc.nodeName != "#document")
    	return;
    if (wnd != wnd.top)
    	return;
    if (wnd.frameElement)
    	return;
    
    let request = window.arguments[0].wrappedJSObject;
    if (request.authWndDOMLoaded(doc.location))
    	window.close();
}

function loadRequestedUrl() {
	let request = window.arguments[0].wrappedJSObject;
	request.log("UserRequest.loadRequestedUrl");
	
	let browser = document.getElementById("requestFrame");	
	browser.addEventListener("DOMContentLoaded", onPageLoad, true);	

	let title = request.promptText;
	document.title = title;
	
	let url = request.browseUrl;
	browser.setAttribute("src", url);
}

function cancelRequest() {
	let request = window.arguments[0].wrappedJSObject;
	request.dismissed();	
	window.close();
}