(function(){
    "use strict";
    /* global myApp */
    myApp.run(["AppsService", "ResourcesLoader", "ContextMenuInjectScript", function(AppsService, ResourcesLoader, ContextMenuInjectScript){
        var platformId = cordova.platformId;

        AppsService.addPreLaunchHook(function(appEntry, appInstallLocation , wwwLocation) {
            if(appEntry.Source === "serve"){
                return Q.fcall(function(){
                    // We can't inject the context menu script into cordova.js remotely
                    // So we create a local copy of the cordova.js used by the server,
                    //      append the context menu script (requests for cordova.js are routed to it)
                    wwwLocation += (wwwLocation.charAt(wwwLocation.length - 1) === "/")? "" : "/";
                    var cordovaJSPath = wwwLocation + "cordova.js";
                    return ResourcesLoader.xhrGet(cordovaJSPath);
                })
                .then(function(xhr){
                    var dataToAppend = ContextMenuInjectScript.getInjectString(appEntry.Name);
                    var completeText = xhr.responseText + dataToAppend;
                    appInstallLocation += (appInstallLocation.charAt(appInstallLocation.length - 1) === "/")? "" : "/";
                    return ResourcesLoader.writeFileContents(appInstallLocation + "cordova.js", completeText);
                });
            }
        }, 250 /* Give it a priority */);

        function ServeHandler(url) {
            this.url = url;
            this.appId = '';
            this.isInstalled = false;
            this.installPath = '';
            this._cachedProjectJson = null;
            this._cachedConfigXml = null;
        }

        ServeHandler.prototype.type = 'serve';

        ServeHandler.prototype._updateAppMeta = function() {
            var self = this;
            return ResourcesLoader.xhrGet(this.url + '/' + platformId + '/project.json')
            .then(function(xhr) {
                self._cachedProjectJson = JSON.parse(xhr.responseText);
                return ResourcesLoader.xhrGet(self.url + self._cachedProjectJson['configPath']);
            })
            .then(function(xhr) {
                self._cachedConfigXml = new DOMParser().parseFromString(xhr.responseText, 'text/xml');
                self.appId = self._cachedConfigXml.firstChild.getAttribute('id');
            });
        };

        ServeHandler.prototype.updateApp = function(dontUseCache) {
            if (dontUseCache || !this._cachedConfigXml) {
                return this._updateAppMeta()
                .then(this.updateApp.bind(this, false));
            }
            var self = this;
            var wwwPath = this._cachedProjectJson['wwwPath'];
            var files = this._cachedProjectJson['wwwFileList'];
            var i = 0;
            function downloadNext() {
                if (!files[i]) {
                    return;
                }
                console.log('now downloading ' + i + ' of ' + files.length);
                var sourceUrl = self.url + wwwPath + files[i];
                var destPath = self.installPath + files[i];
                console.log(destPath);
                i += 1;
                return ResourcesLoader.downloadFromUrl(sourceUrl, destPath).then(downloadNext);
            }
            return downloadNext();
        };

        function createFromUrl(url) {
            // Strip platform and trailing slash if they exist.
            url = url.replace(/\/$/, '').replace(new RegExp(platformId + '$'), '').replace(/\/$/, '');
            if (!/^http:/.test(url)) {
                url = 'http://' + url;
            }
            if (!/:(\d)/.test(url)) {
                url = url.replace(/(.*?\/\/[^\/]*)/, '$1:8000');
            }
            // Fetch config.xml.
            var ret = new ServeHandler(url);

            return ret._updateAppMeta().then(function() { return ret; });
        }

        AppsService.registerInstallHandlerFactory({
            type: 'serve',
            createFromUrl: createFromUrl
        });
    }]);
})();
