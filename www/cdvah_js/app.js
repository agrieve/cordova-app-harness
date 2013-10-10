var myApp = angular.module("CordovaAppHarness", []);


myApp.config(["$routeProvider", function($routeProvider){
    $routeProvider.when("/", {
        templateUrl: "cdvah_views/list.html",
        controller: "ListCtrl"
    });
    $routeProvider.when("/add", {
        templateUrl: "cdvah_views/add.html",
        controller: "AddCtrl"
    });
}]);

// foo
document.addEventListener('deviceready', function() {
    cordova.plugins.fileextras.getDataDirectory(false, function(dirEntry) {
        var path = dirEntry.fullPath;
        myApp.value("INSTALL_DIRECTORY", path + "/apps");
        myApp.value("APPS_JSON", path + "/apps.json");
        myApp.value("METADATA_JSON", path + "/metadata.json");
        angular.bootstrap(document, ['CordovaAppHarness']);
    });
}, false);
