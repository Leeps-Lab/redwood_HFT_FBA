Redwood.controller("SubjectCtrl", ["$rootScope", "$scope", "RedwoodSubject", function($rootScope, $scope, rs) {
   rs.on_load(function() {
     console.log("hello world");
      $scope.pointsByPeriod = rs.subject[rs.user_id].points_by_period();
      $scope.pointsByPeriod.shift();
   });
}]);
