(function() {
    "use strict";
    /* global myApp */
    myApp.factory("AppsService", [ "ResourcesLoader", "INSTALL_DIRECTORY", "APPS_JSON", "METADATA_JSON", function(ResourcesLoader, INSTALL_DIRECTORY, APPS_JSON, METADATA_JSON) {

        var platformId = cordova.platformId;
        // Map of type -> handler.
        var installHandlerFactories = {};
        // functions to run before launching an app
        var preLaunchHooks = [];
        // Map of appId -> handler of apps that have active handlers..
        var installHandlers = {};

        function registerApp(handler) {
            installHandlers[handler.appId] = handler;
            return ResourcesLoader.readJSONFileContents(APPS_JSON)
            .then(function(result){
                result.installedApps = result.installedApps || [];
                result.installedApps.push({
                    "appId" : handler.appId,
                    "appType" : handler.type,
                    "appUrl" : handler.url,
                    "installed" : handler.isInstalled
                });
                return ResourcesLoader.writeJSONFileContents(APPS_JSON, result);
            });
        }

        function isPathAbsolute(path){
            return (path.match(/^[a-z0-9+.-]+:/) != null);
        }

        function getAppStartPageFromConfig(configFile, appBaseLocation) {
            appBaseLocation += (appBaseLocation.charAt(appBaseLocation.length - 1) === "/")? "" : "/";
            return ResourcesLoader.readFileContents(configFile)
            .then(function(contents){
                if(!contents) {
                    throw new Error("Config file is empty. Unable to find a start page for your app.");
                } else {
                    var startLocation = appBaseLocation + "index.html";
                    var parser = new DOMParser();
                    var xmlDoc = parser.parseFromString(contents, "text/xml");
                    var els = xmlDoc.getElementsByTagName("content");

                    if(els.length > 0) {
                        // go through all "content" elements looking for the "src" attribute in reverse order
                        for(var i = els.length - 1; i >= 0; i--) {
                            var el = els[i];
                            var srcValue = el.getAttribute("src");
                            if(srcValue) {
                                if(isPathAbsolute(srcValue)) {
                                    startLocation = srcValue;
                                } else {
                                    srcValue = srcValue.charAt(0) === "/" ? srcValue.substring(1) : srcValue;
                                    startLocation = appBaseLocation + srcValue;
                                }
                                break;
                            }
                        }
                    }

                    return startLocation;
                }
            });
        }

        function removeApp(appId){
            var appHandler = installHandlers[appId];
            if (!appHandler) {
                return;
            }
            delete installHandlers[appId];
            var entry = null;
            return ResourcesLoader.ensureDirectoryExists(APPS_JSON)
            .then(function() {
                return ResourcesLoader.readJSONFileContents(APPS_JSON);
            })
            .then(function(result){
                result.installedApps = result.installedApps || [];
                for(var i = 0; i < result.installedApps.length; i++){
                    if(result.installedApps[i]['appId'] === appId) {
                        entry = result.installedApps.splice(i, 1)[0];
                        break;
                    }
                }
                if (entry) {
                    return ResourcesLoader.writeJSONFileContents(APPS_JSON, result);
                }
            })
            .then(function(){
                return ResourcesLoader.deleteDirectory(appHandler.installPath);
            })
            .then(function(){
                return entry;
            });
        }

        function getAppsList(getFullEntries){
            return ResourcesLoader.ensureDirectoryExists(APPS_JSON)
            .then(function() {
                return ResourcesLoader.readJSONFileContents(APPS_JSON);
            })
            .then(function(result){
                result.installedApps = result.installedApps || [];
                var newAppsList = [];

                for(var i = 0; i < result.installedApps.length; i++){
                    if(getFullEntries) {
                        newAppsList.push(result.installedApps[i]);
                    } else {
                        newAppsList.push(result.installedApps[i]['appId']);
                    }
                }

                return newAppsList;
            });
        }

        function isUniqueApp(appName){
            return getAppsList(false /* App names only */)
            .then(function(appsList){
                if(appsList.indexOf(appName) !== -1) {
                    throw new Error("An app with this name already exists");
                }
            });
        }

        function getAppEntry(appName){
            return getAppsList(true /* Get full app entry */)
            .then(function(appEntries){
                var entry;
                for(var i = 0; i < appEntries.length; i++){
                    if(appEntries[i]['appId'] === appName){
                        entry = appEntries[i];
                        break;
                    }
                }
                if(!entry){
                    throw new Error("Could not find the app " + appName + " in the installed apps");
                }
                return entry;
            });
        }

        // On success, this function returns the following paths
        // appInstallLocation - INSTALL_DIR/app/platform/
        // platformWWWLocation - location containing the html, css and js files
        // configLocation - location of config.xml
        // startLocation - the path of the page to start the app with
        function getAppPathsForAppEntry(entry){
            var appPaths = {};
            var platformLocation = INSTALL_DIRECTORY + '/' + entry['appId'] + "/" + platformId;
            if(!isPathAbsolute(platformLocation)){
                // assume file uri
                platformLocation = "file://" + platformLocation;
            }
            appPaths.appInstallLocation = platformLocation;
            if(entry.Source === "pattern"){
                appPaths.platformWWWLocation = platformLocation + "/www/";
                appPaths.configLocation = platformLocation + "/config.xml";
            } else if(entry.Source === "serve"){
                var configFile = entry.Data;
                var location = configFile.indexOf("/config.xml");
                if(location === -1){
                    throw new Error("The location of config.xml provided is invalid. Expected the location to end with 'config.xml'");
                }
                //grab path including upto last slash
                var appLocation =  configFile.substring(0, location + 1);
                appPaths.platformWWWLocation = appLocation;
                appPaths.configLocation = configFile;
            } else {
                throw new Error("Unknown app source: " + entry.Source);
            }
            return Q.fcall(function(){
                return getAppStartPageFromConfig(appPaths.configLocation, appPaths.platformWWWLocation);
            })
            .then(function(startLocation){
                appPaths.startLocation = startLocation;
                return appPaths;
            });
        }

        function insertObjectAtPriority(objArr, handler, priority){
            var i = 0;
            var objToInsert = { "priority" : priority, "handler" : handler };
            for(i = 0; i < objArr.length; i++){
                if(objArr[i].priority > objToInsert.priority) {
                    break;
                }
            }
            objArr.splice(i, 0, objToInsert);
        }

        return {
            //return promise with the array of apps
            getAppsList : function(getFullEntries) {
                return getAppsList(getFullEntries);
            },

            launchApp : function(appName) {
                var appEntry;
                var startLocation;
                return ResourcesLoader.readJSONFileContents(METADATA_JSON)
                .then(function(settings){
                    settings = settings || {};
                    settings.lastLaunched = appName;
                    return ResourcesLoader.writeJSONFileContents(METADATA_JSON, settings);
                })
                .then(function(){
                    return getAppEntry(appName);
                })
                .then(function(_appEntry){
                    appEntry = _appEntry;
                    return getAppPathsForAppEntry(appEntry);

                })
                .then(function(appPaths){
                    startLocation = appPaths.startLocation;
                    var result = Q.resolve(0 /* dummy value to set up chain */);
                    preLaunchHooks.forEach(function (currHook) {
                        result = result.then(function(){
                            return currHook.handler(appEntry, appPaths.appInstallLocation, appPaths.platformWWWLocation);
                        });
                    });
                    return result;
                })
                .then(function() {
                    window.location = startLocation;
                });
            },

            addApp : function(installerType, appUrl) {
                var handlerFactory = installHandlerFactories[installerType];
                var handler = null;
                return Q.fcall(function(){
                    return handlerFactory.createFromUrl(appUrl);
                })
                .then(function(h) {
                    handler = h;
                    handler.installPath = INSTALL_DIRECTORY + '/' + handler.appId;
                    return removeApp(handler.appId);
                })
                .then(function() {
                    return registerApp(handler);
                })
                .then(function() {
                    return handler.updateApp();
                });
            },

            uninstallApp : function(appName) {
                return removeApp(appName);
            },

            getLastRunApp : function() {
                return ResourcesLoader.readJSONFileContents(METADATA_JSON)
                .then(function(settings){
                    if(!settings || !settings.lastLaunched) {
                        throw new Error("No App has been launched yet");
                    }
                    return settings.lastLaunched;
                });
            },

            registerInstallHandlerFactory : function(handlerFactory) {
                installHandlerFactories[handlerFactory.type] = handlerFactory;
            },

            updateApp : function(appId){
                var handler = installHandlers[appId];
                return Q.fcall(function() {
                    return handler.updateApp();
                });
            },

            addPreLaunchHook : function(handler, priority){
                if(!priority) {
                    // Assign a default priority
                    priority = 500;
                }
                insertObjectAtPriority(preLaunchHooks, handler, priority);
            }
        };
    }]);
})();
