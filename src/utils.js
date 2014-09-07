var Log = {
	File : null,
	
	WriteLn : function(str) {	
		if (getPref("Log.Active")) {
			switch (getPref("Log.Output")) {
			case 0:
				app.console.log(str);
				break;
			case 1:
				if (this.File == null) {					
					let today = new Date();
					let dd = today.getDate();
					if (dd < 10)
					    dd = "0" + dd;					
					let mm = today.getMonth() + 1;
					if (mm < 10)
					    mm = "0" + mm;					
					let logFile = today.getFullYear() + mm + dd + ".log";
					
					let addonId = "FeedlySync@AMArostegui";
					this.File =
						FileUtils.getFile("ProfD", ["extensions", addonId, "data", logFile], false);
					if (!this.File.exists())
						this.File.create(Ci.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
				}
				
				let outStream = FileUtils.openFileOutputStream(this.File, FileUtils.MODE_WRONLY | FileUtils.MODE_APPEND);
				let converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].
				                createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
				converter.charset = "UTF-8";
				let now = new Date();
				let inStream = converter.convertToInputStream(
						now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds() + " " + str + "\r\n");
				NetUtil.asyncCopy(inStream, outStream);				
				break;
			}		
		}
	}
}
