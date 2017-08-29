Redwood.controller("AdminCtrl",
   ["$rootScope",
      "$scope",
      "Admin",
      "MarketManager",
      "GroupManager",
      "MarketAlgorithm",
      "DataStorage",
      "$http",
      "$interval",
      function ($rootScope, $scope, ra, marketManager, groupManager, marketAlgorithm, dataStorage, $http, $interval) {

         var debugMode = false;   // change this to switch all the message loggers on and off

         var Display = { //Display controller

            initialize: function () {
               $("#start-session").click(function () {
                  $("#start-session").attr("disabled", "disabled");
                  ra.trigger("start_session");
               });

               ra.on("start_session", function () {
                  $("#start-session").attr("disabled", "disabled");
                  $("#pause-session").removeAttr("disabled");
               });

               $("#refresh-subjects").click(function () {
                  $("#refresh-subjects").attr("disabled", "disabled");
                  ra.refreshSubjects().then(function () {
                     $("#refresh-subjects").removeAttr("disabled");
                  });
               });

               $("#reset-session").click(function () {
                  ra.reset();
               });

               $("#pause-session").click(function () {
                  $("#pause-session").attr("disabled", "disabled");
                  ra.trigger("pause");
               });
               ra.on("pause", function () {
                  $("#pause-session").attr("disabled", "disabled");
               });

               $("#resume-session").click(function () {
                  $("#resume-session").attr("disabled", "disabled");
                  ra.trigger("resume");
               });
               ra.on("resume", function () {
                  $("#resume-session").attr("disabled", "disabled");
                  $("#pause-session").removeAttr("disabled");
               });

               ra.on_subject_paused(function (userId) {
                  $("#pause-session").attr("disabled", "disabled");
                  $("tr.subject-" + userId).addClass("warning"); //Display current period for each user
                  $("tr.subject-" + userId + " :nth-child(4)").text("Paused"); //Display current period for each user
               });

               ra.on_all_paused(function () {
                  $("#resume-session").removeAttr("disabled");
               });

               ra.on_subject_resumed(function (user) {
                  $("tr.subject-" + user).removeClass("warning"); //Display current period for each user
                  $("tr.subject-" + user + " :nth-child(4)").text(""); //Display current period for each user
               });

               $("#archive").click(function () {
                  var r = confirm("Are you sure you want to archive this session?");
                  if (r == true) {
                     ra.delete_session();
                  }
               });

               ra.on_router_connected(function (connected) { //Display router connection status
                  var status = $("#router-status");
                  if (connected) {
                     status.text("Router Connected");
                     status.removeClass("alert-danger");
                     status.addClass("alert-success");
                  } else {
                     status.text("Router Disconnected");
                     status.removeClass("alert-success");
                     status.addClass("alert-danger");
                  }
               });

               ra.on_set_period(function (user, period) {
                  $("tr.subject-" + user + " :nth-child(3)").text(period); //Display current period for each user
               });

               ra.on_set_group(function (user, group) {
                  $("tr.subject-" + user + " :nth-child(2)").text(group); //Display group for each user
               });

               ra.on_register(function (user) { //Add a row to the table to each user
                  $("#subject-list").empty();
                  for (var i = 0, l = ra.subjects.length; i < l; i++) {
                     $("#subject-list").append($("<tr>").addClass("subject-" + ra.subjects[i].user_id).append(
                        $("<td>").text(ra.subjects[i].user_id).after(
                           $("<td>").text(0).after(
                              $("<td>").text(0).after(
                                 $("<td>").text(""))))));
                  }
               });

               ra.on_set_config(function (config) { //Display the config file
                  $("table.config").empty();
                  var a = $.csv.toArrays(config);
                  for (var i = 0; i < a.length; i++) {
                     var row = a[i];
                     var tr = $("<tr>");
                     for (var j = 0; j < row.length; j++) {
                        var cell = row[j];
                        var td = $((i == 0 ? "<th>" : "<td>")).text(cell);
                        tr.append(td);
                     }
                     $("table.config").append(tr);
                  }
               });
            }
         };

         $scope.groupManagers = {};

         var resetGroups = function () {
            var config = ra.get_config(1, 0) || {};
            for (var i = 0; i < ra.subjects.length; i++) { //set all subjects to group 1 (this is so that matching can be changed per period)
               if ($.isArray(config.groups)) {
                  for (var groupId = 0; groupId < config.groups.length; groupId++) {
                     if ($.isArray(config.groups[groupId])) {
                        if (config.groups[groupId].indexOf(parseInt(ra.subjects[i].user_id)) > -1) { //Nested group array
                           ra.set_group(groupId + 1, ra.subjects[i].user_id);
                        }
                     } else {
                        ra.set_group(1, ra.subjects[i].user_id);
                     }
                  }
               } else {
                  ra.set_group(1, ra.subjects[i].user_id);
               }
            }
         };

         Display.initialize();

         ra.on_load(function () {
            resetGroups(); //Assign groups to users

            //INITIALIZE ADMIN FOR EXPERIMENT   **************************************

            var marketFlag = "REMOTE";
                                       // LOCAL  = use local market (i.e. this.market)
                                       // REMOTE = use remote market by making websockets connection
                                       // DEBUG  = use debug market (i.e. this.debugMarket)

            $scope.config = ra.get_config(1, 0);

            $scope.priceChanges = [];
            var priceURL = $scope.config.priceChangesURL;
            $http.get(priceURL).then(function (response) {
               var rows = response.data.split("\n");

               //Parse price changes CSV
               for (let i = 0; i < rows.length - 1; i++) {
                  $scope.priceChanges[i] = [];
               }

               for (let i = 0; i < rows.length - 1; i++) {
                  if (rows[i + 1] === "") continue;
                  var cells = rows[i + 1].split(",");
                  for (let j = 0; j < cells.length; j++) {
                     $scope.priceChanges[i][j] = parseFloat(cells[j]);
                     if (j == 0) {
                           $scope.priceChanges[i][j] *= 1000000;
                     }
                  }
               }

               $scope.investorArrivals = [];
               var arrivalURL = $scope.config.marketEventsURL;
               $http.get(arrivalURL).then(function (response) {
                  var rows = response.data.split("\n");

                  //Parse investor arrival changes CSV
                  for (var i = 0; i < rows.length - 1; i++) {
                     $scope.investorArrivals[i] = [];
                  }

                  for (var i = 0; i < rows.length - 1; i++) {
                     if (rows[i + 1] === "") continue;
                     var cells = rows[i + 1].split(",");
                     for (var j = 0; j < cells.length; j++) {
                        $scope.investorArrivals[i][j] = parseFloat(cells[j]);
                        if (j == 0) {
                           $scope.investorArrivals[i][j] *= 1000000;
                        }
                     }
                  }

                  //******************** seting up groups **************************

                  // Fetch groups array from config file and create wrapper for accessing groups
                  $scope.groups = $scope.config.groups;
                  $scope.getGroup = function (groupNum) {
                     return $scope.groups[groupNum - 1];
                  };

                  // create synchronize arrays for starting each group and also map subject id to their group
                  $scope.idToGroup = {};        // maps every id to their corresponding group
                  $scope.startSyncArrays = {};  // synchronized array for ensuring that all subjects in a group start together
                  for (var groupNum = 1; groupNum <= $scope.groups.length; groupNum++) {
                     var group = $scope.getGroup(groupNum); // fetch group from array
                     $scope.startSyncArrays[groupNum] = new SynchronizeArray(group);
                     for (var subject of group) {
                        $scope.idToGroup[subject] = groupNum;
                     }
                  }

                  // loop through groups and create their groupManager, market, dataStorage and marketAlgorithms
                  for (var groupNum = 1; groupNum <= $scope.groups.length; groupNum++) {

                     var group = $scope.getGroup(groupNum); // fetch group from array

                     // package arguments into an object
                     var groupArgs = {
                        priceChanges: $scope.priceChanges,
                        investorArrivals: $scope.investorArrivals,
                        groupNumber: groupNum,
                        memberIDs: group,
                        isDebug: debugMode,
                        mFlag: marketFlag,
                        groupNum: groupNum
                     };
                     $scope.groupManagers[groupNum] = groupManager.createGroupManager(groupArgs, ra.sendCustom);
                     $scope.groupManagers[groupNum].market = marketManager.createMarketManager(ra.sendCustom, groupNum, $scope.groupManagers[groupNum], debugMode, $scope.config.batchLength);
                     $scope.groupManagers[groupNum].dataStore = dataStorage.createDataStorage(group, groupNum, $scope.config.speedCost, $scope.config.startingWealth, $scope.config.batchLength);
                     for (var subjectNum of group) {

                        // map subject number to group number
                        $scope.idToGroup[subjectNum] = groupNum;

                        // package market algorithm arguments into an object then create market algorithm
                        var subjectArgs = {
                           myId: subjectNum,
                           groupId: groupNum,
                           isDebug: debugMode,
                           speedCost: $scope.config.speedCost,
                           maxSpread: $scope.config.maxSpread
                        };
                        $scope.groupManagers[groupNum].marketAlgorithms[subjectNum] = marketAlgorithm.createMarketAlgorithm(subjectArgs, $scope.groupManagers[groupNum]);
                     }
                  }
                  //********************************************************************

               });

            });

            //DONE INITIALIZING ADMIN FOR EXPERIMENT    ************************************

         });

         ra.recv("player_join_market", function (uid, msg) {
            $scope.market.insertBid(msg.bid, msg.timestamp);
            $scope.market.insertAsk(msg.ask, msg.timestamp);
         });


         ra.on_register(function (user) { //Add a row to the table to each user
            resetGroups();
         });

         ra.on("start_session", function () {
            ra.start_session();
         });

         $scope.playerTimeOffsets = {};

         ra.recv("set_player_time_offset", function (uid, data) {
            if ($scope.playerTimeOffsets[uid] === undefined) {
               $scope.playerTimeOffsets[uid] = data - getTime();
            }
         });

         ra.recv("Subject_Ready", function (uid) {

            // get group number
            var groupNum = $scope.idToGroup[uid];

            // mark subject as ready
            $scope.startSyncArrays[groupNum].markReady(uid);

            // start experiment if all subjects are marked ready
            if ($scope.startSyncArrays[groupNum].allReady()) {

               // calculate how long we have to wait so that start time coincides with a batch
               let delay = ($scope.groupManagers[groupNum].lastbatchTime - getTime()) / 1000000 + $scope.config.batchLength;
               console.log(delay);
               window.setTimeout(startExperiment, delay, groupNum);
            }
         });

         // ra.recv("next_game", function (groupNum){
         //    //export csv's
         //    resetGroups();       //reset all the start pages with next config
         // });

         // setup game state and send begin messages to clients
         var startExperiment = function(groupNum){
            $scope.startTime = getTime();

            var group = $scope.getGroup(groupNum);
            var startFP = $scope.priceChanges[0][1];

            //send out start message with start time and information about group then start groupManager
            var beginData = {
               startTime: $scope.startTime,
               startFP: startFP,
               groupNumber: groupNum,
               group: group,
               isDebug: debugMode,
               speedCost: $scope.config.speedCost,
               startingWealth: $scope.config.startingWealth,
               maxSpread: $scope.config.maxSpread,
               playerTimeOffsets: $scope.playerTimeOffsets,
               batchLength: $scope.config.batchLength
            };

            if($scope.config.hasOwnProperty("input_addresses")) {
               //console.log("%cRUNNING IN TEST MODE", 'font-family: "Comic Sans MS"');
               beginData.input_addresses = $scope.config.input_addresses.split(',');
            }

            ra.sendCustom("Experiment_Begin", beginData, "admin", 1, groupNum);
            $scope.groupManagers[groupNum].startTime = $scope.startTime;
            $scope.groupManagers[groupNum].dataStore.init(startFP, $scope.startTime, $scope.config.maxSpread);
            //$scope.groupManagers[groupNum].market.timeoutID = window.setTimeout($scope.groupManagers[groupNum].market.FBABook.processBatch, $scope.startTime + $scope.config.batchLength - Date.now(), $scope.startTime + $scope.config.batchLength);
//UNCOMMENT LATER              //$scope.groupManagers[groupNum].market.timeoutID = window.setTimeout($scope.groupManagers[groupNum].market.FBABook.processBatch, ($scope.startTime - getTime()) / 1000000 + $scope.config.batchLength, $scope.startTime + $scope.config.batchLength * 1000000);
            for (var user of group) {
               $scope.groupManagers[groupNum].marketAlgorithms[user].fundamentalPrice = startFP;
            }

            // if there are any price changes to send, start sending them
            if ($scope.priceChanges.length > 2) {
               window.setTimeout($scope.groupManagers[groupNum].sendNextPriceChange, ($scope.startTime + $scope.priceChanges[$scope.groupManagers[groupNum].priceIndex][0] - getTime()) / 1000000);
            }
            //window.setTimeout($scope.groupManagers[groupNum].sendNextInvestorArrival, $scope.startTime + $scope.investorArrivals[$scope.groupManagers[groupNum].investorIndex][0] - getTime());
            //$scope.groupManagers[groupNum].intervalPromise = $interval($scope.groupManagers[groupNum].update.bind($scope.groupManagers[groupNum]), CLOCK_FREQUENCY);
            if ($scope.investorArrivals.length > 1) {
               var investorDelayTime = ($scope.startTime + $scope.investorArrivals[$scope.groupManagers[groupNum].investorIndex][0]) - getTime();     //from cda
               console.log("Initial Delay: " + investorDelayTime);      //from cda
               window.setTimeout($scope.groupManagers[groupNum].sendNextInvestorArrival, investorDelayTime / 1000000);  //from cda
            }
            //window.setTimeout($scope.dHistory.pushToBatches, $scope.config.batchLength*1000000);
         };
         

         ra.recv("To_Group_Manager", function (uid, msg) {
            var groupNum = $scope.idToGroup[uid];
            $scope.groupManagers[groupNum].recvFromSubject(msg);
         });

         ra.on("pause", function () {
            ra.pause();
         });

         ra.on("resume", function () {
            ra.resume();
         });

         $("#buy-investor")
            .button()
            .click(function () {
               var msg = new Message("OUCH", "EBUY", [0, 214748.3647, true]);
               msg.delay = false;
               for (var group in $scope.groupManagers) {
                  //$scope.groupManagers[group].dataStore.investorArrivals.push([Date.now() - $scope.startTime, "BUY"]);
                  $scope.groupManagers[group].dataStore.investorArrivals.push([getTime() - $scope.startTime, "BUY"]);
                  $scope.groupManagers[group].sendToMarket(msg);
               }
            });

         $("#sell-investor")
            .button()
            .click(function () {
               var msg = new Message("OUCH", "ESELL", [0, 214748.3647, true]);      
               msg.delay = false;
               for (var group in $scope.groupManagers) {
                  //$scope.groupManagers[group].dataStore.investorArrivals.push([Date.now() - $scope.startTime, "SELL"]);
                  $scope.groupManagers[group].dataStore.investorArrivals.push([getTime() - $scope.startTime, "SELL"]);
                  $scope.groupManagers[group].sendToMarket(msg);
               }
            });

         $("#send-fpc")
            .button()
            .click(function () {
               // get current FP from market algorithm of first player in first group
               var oldFP = $scope.groupManagers[1].marketAlgorithms[$scope.groups[0][0]].fundamentalPrice;
               var newFP = parseFloat( $("#fpc-input").val() );
               console.log(oldFP);
               //var msg = new Message("ITCH", "FPC", [Date.now(), newFP, 0, newFP > oldFP]);
               var msg = new Message("ITCH", "FPC", [getTime(), newFP, 0, newFP > oldFP]);
               msg.delay = false;
               for (var group in $scope.groupManagers) {
                  $scope.groupManagers[group].dataStore.storeMsg(msg);
                  $scope.groupManagers[group].sendToMarketAlgorithms(msg);
               }
            });

         $("#export-profits")
            .button()
            .click(function () {
               // export final profit values to csv
               var data = [];
               for (var group in $scope.groupManagers) {
                  for (var player in $scope.groupManagers[group].dataStore.playerFinalProfits) {
                     data.push([player, $scope.groupManagers[group].dataStore.playerFinalProfits[player]]);
                  }
               }

               data.sort(function (a, b) {
                  return a[0] - b[0];
               });

               data.unshift(["player", "final_profit"]);

               // get file name by formatting start time as readable string
               var filename = printTime($scope.startTime) + '_fba_final_profits.csv';

               var csvRows = [];
               for (let index = 0; index < data.length; index++) {
                  csvRows.push(data[index].join(','));
               }
               var csvString = csvRows.join("\n");
               var a = document.createElement('a');
               a.href = 'data:attachment/csv,' + encodeURIComponent(csvString);
               a.target = '_blank';
               a.download = filename;

               document.body.appendChild(a);
               a.click();
               a.remove();
            });

      }]);
