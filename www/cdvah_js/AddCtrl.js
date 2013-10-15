(function(){
    "use strict";
    /* global myApp */
    myApp.controller("AddCtrl", ["notifier", "$rootScope", "$scope", "$window", "AppsService", function (notifier, $rootScope, $scope, $window, AppsService) {

        $rootScope.appTitle = 'Add App';

        $scope.appData = {
            appUrl : 'localhost',
            installerType: 'serve'
        };

        $scope.addApp = function() {
            var serviceCall = AppsService.addApp($scope.appData.installerType, $scope.appData.appUrl);

            serviceCall.then(function(handler) {
                console.log('successfully installed');
                notifier.success('Successfully installed');
                return AppsService.updateApp(handler)
                .done();
            }, function(error) {
                console.error(error);
                notifier.error('Unable to add application because: ' + error.message);
            });
        };

        // True if the optional barcodescanner plugin is installed.
        $scope.qr_enabled = !!(cordova.plugins && cordova.plugins.barcodeScanner);

        // Scans a QR code, placing the URL into the currently selected of source and pattern.
        $scope.fetchQR = function() {
            console.log('calling');
            $window.cordova.plugins.barcodeScanner.scan(function(result) {
                console.log('success');
                if (!result || result.cancelled || !result.text) {
                    notifier.error('No QR code received.');
                } else {
                    $scope.appData.appUrl = result.text;
                    notifier.success('QR code received');
                    $scope.$apply();
                }
            },
            function(error) {
                console.log('error: ' + error);
                notifier.error('Error retrieving QR code: ' + error);
            });
        };
    }]);
})();
