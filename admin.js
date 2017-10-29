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
                  // $scope.numPeriods = a.length - 1;   //CHANGED 10/17/18 TO BE ABLE TO START ON DIF PERIOD #S
                  $scope.numPeriods = 1;
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

         var resetGroups = function (period) {              
            var config = ra.get_config(period, 0) || {};    //MAYBE CHANGE TO 1 INSTEAD OF PERIOD I HATE THIS SHIT
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

         var initExperiment = function () {
            console.log("Initalizing Groups, period:", $scope.period);
            resetGroups($scope.period); //Assign groups to users                  //MAYBE GET RID OF THIS IN FUTURE

            //INITIALIZE ADMIN FOR EXPERIMENT   **************************************

            var marketFlag = "REMOTE";
                                       // LOCAL  = use local market (i.e. this.market)
                                       // REMOTE = use remote market by making websockets connection
                                       // DEBUG  = use debug market (i.e. this.debugMarket)


            $scope.config = ra.get_config($scope.period, 0);

            $scope.speedCost = $scope.config.speedCost;
            $scope.startingWealth = $scope.config.startingWealth;
            $scope.maxSpread = $scope.config.maxSpread;
            $scope.experimentLength = $scope.config.experimentLength;
            $scope.exchangeRate = $scope.config.exchangeRate;
            $scope.exchangeURI = $scope.config.exchangeURI;

            if($scope.experimentLength == null){
               $scope.experimentLength = 300000;      //default exp length of 5 mins
            }
            if($scope.exchangeRate == null){
               $scope.exchangeRate = 1;              //default exchange rate of 1
            }
            if($scope.startingWealth == null){
               $scope.startingWealth = 20;
            }

            $scope.priceChanges = [];
            var priceURL = $scope.config.priceChangesURL;
            $http.get(priceURL).then(function (response) {
               var rows = response.data.split("\n");

               //Parse price changes CSV
               for (let i = 0; i < rows.length - 2; i++) {
                  $scope.priceChanges[i] = [];
               }

               for (let i = 0; i < rows.length - 2; i++) {
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
                  for (var i = 0; i < rows.length - 2; i++) {
                     $scope.investorArrivals[i] = [];
                  }

                  for (var i = 0; i < rows.length - 2; i++) {
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

                  $scope.input_array = []; 

                  // loop through groups and create their groupManager, market, dataStorage and marketAlgorithms
                  for (var groupNum = 1; groupNum <= $scope.groups.length; groupNum++) {

                     var group = $scope.getGroup(groupNum); // fetch group from array

                     for (var subjectNum of group) {
                     // download user input csvs
                        $scope.input_array[subjectNum] = [];

                        if ($scope.config.hasOwnProperty("input_addresses")) {
                           var input_addresses = $scope.config.input_addresses.split(',');
                           
                           var xhr = new XMLHttpRequest();

                           xhr.open('GET', input_addresses[subjectNum-1],false);

                           xhr.onload = function (e) {

                             if (xhr.readyState == 4){
                                 if(xhr.status == 200){
                                    var single_input_array = [];

                                    var response = {data:xhr.responseText};


                                    var rows = response.data.split("\n");                    //split csv up line by line into an array of rows


                                 

                                    for (let i = 0; i < rows.length; i++) {                  //for each row in array
                                       if (rows[i] === "") continue;                         //if reached end of csv line continue to next one

                                       single_input_array[i] = [];




                                       var cells = rows[i].split(",");                       //if more data in csv row, add column to arrays row


                                       for (let j = 0; j < cells.length; j++) {              //for each column in csv row
                                          if(j == 1) {
                                                single_input_array[i][j] = String(cells[j]);     //read as a string (MAKER,SNIPE,etc)
                                          }
                                          else{
                                                single_input_array[i][j] = parseFloat(cells[j]);  //read timestamps and spreads as ints
                                          }
                                       }
                                    }
                                 $scope.input_array[subjectNum] = single_input_array;
                                 }
                              }
                           };
                           xhr.send(null);
                        }
                     }
                     // package arguments into an object
                     var groupArgs = {
                        priceChanges: $scope.priceChanges,
                        investorArrivals: $scope.investorArrivals,
                        groupNumber: groupNum,
                        memberIDs: group,
                        isDebug: debugMode,
                        mFlag: marketFlag,
                        groupNum: groupNum,
                        URI: $scope.exchangeURI,
                        period: $scope.period
                     };
                     
                     

                     if($scope.period == 1){
                        $scope.groupManagers[groupNum] = groupManager.createGroupManager(groupArgs, ra.sendCustom);
                     }
                     $scope.groupManagers[groupNum].initGroupManager(groupArgs);
		   //  console.log($scope.investorArrivals);                     
                     // $scope.groupManagers[groupNum].market = marketManager.createMarketManager(ra.sendCustom, groupNum, $scope.groupManagers[groupNum]);
                     $scope.groupManagers[groupNum].dataStore = dataStorage.createDataStorage(group, groupNum, $scope.speedCost, $scope.startingWealth, $scope.config.batchLength, $scope.config.sessionNumber);
                     for (var subjectNum of group) {

                        // map subject number to group number
                        $scope.idToGroup[subjectNum] = groupNum;

                        // package market algorithm arguments into an object then create market algorithm
                        $scope.subjectArgs = {
                           myId: subjectNum,
                           groupId: groupNum,
                           isDebug: debugMode,
                           speedCost: $scope.speedCost,
                           maxSpread: $scope.maxSpread
                        };
                        $scope.groupManagers[groupNum].marketAlgorithms[subjectNum] = marketAlgorithm.createMarketAlgorithm($scope.subjectArgs, $scope.groupManagers[groupNum]);
                     }
                  }
               });
            });
         };

         ra.on_load(function () {
            $scope.period = 1;         //start period from 1
            $scope.profitData = [];    //initialize array for storing cummulatie profit
            $scope.deltas = [];
            initExperiment();          //moved everything to a function for calls between period
         }); 

         ra.recv("player_join_market", function (uid, msg) {
            $scope.market.insertBid(msg.bid, msg.timestamp);
            $scope.market.insertAsk(msg.ask, msg.timestamp);
         });


         ra.on_register(function (user) { //Add a row to the table to each user
            resetGroups($scope.period);
         });

         ra.on("start_session", function () {
            ra.start_session();
            // window.setTimeout(sendPeriod, $scope.experimentLength + 3000);    //generous 5secs to load everything before recursive calls to send next period
         });

         $scope.playerTimeOffsets = {};

         ra.recv("set_player_time_offset", function (uid, data) {
            if ($scope.playerTimeOffsets[uid] === undefined) {
               $scope.playerTimeOffsets[uid] = data - getTime();
            }
         });

         ra.recv("Subject_Ready", function (uid) {
            // console.log("rcv Subject_Ready", uid);
            // get group number
            var groupNum = $scope.idToGroup[uid];

            // mark subject as ready
            $scope.startSyncArrays[groupNum].markReady(uid);

            // start experiment if all subjects are marked ready
            if ($scope.startSyncArrays[groupNum].allReady()) {
		          $scope.startSyncArrays[groupNum].reset();
               // calculate how long we have to wait so that start time coincides with a batch
               let delay = ($scope.groupManagers[groupNum].lastbatchTime - getTime()) / 1000000 + $scope.config.batchLength;
               console.log("Starting group " + groupNum + " on next Batch in: " + delay);
               window.setTimeout(startExperiment, delay, groupNum);
            }
         });

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
               batchLength: $scope.config.batchLength,
               exchangeRate: $scope.exchangeRate,
               period: $scope.period,
               input_arrays: $scope.input_array
            };

            // if($scope.config.hasOwnProperty("input_addresses")) {
            //    beginData.input_addresses = $scope.config.input_addresses.split(',');
            // }

            ra.sendCustom("Experiment_Begin", beginData, "admin", $scope.period, groupNum);
            $scope.groupManagers[groupNum].startTime = $scope.startTime;
            $scope.groupManagers[groupNum].dataStore.init(startFP, $scope.startTime, $scope.config.maxSpread);
            for (var user of group) {
               $scope.groupManagers[groupNum].marketAlgorithms[user].fundamentalPrice = startFP;
            }

            // if there are any price changes to send, start sending them
            if ($scope.priceChanges.length > 2) {
               var jumpDelay = $scope.startTime + $scope.priceChanges[$scope.groupManagers[groupNum].priceIndex][0] - getTime();
               if(jumpDelay < 0) jumpDelay = 0;
               window.setTimeout($scope.groupManagers[groupNum].sendNextPriceChange, jumpDelay / 1000000);
            }
            //$scope.groupManagers[groupNum].intervalPromise = $interval($scope.groupManagers[groupNum].update.bind($scope.groupManagers[groupNum]), CLOCK_FREQUENCY);
            if ($scope.investorArrivals.length > 1) {
               var investorDelayTime = ($scope.startTime + $scope.investorArrivals[$scope.groupManagers[groupNum].investorIndex][0]) - getTime();     //from cda
               window.setTimeout($scope.groupManagers[groupNum].sendNextInvestorArrival, investorDelayTime / 1000000);  //from cda
            }

            $scope.groupManagers[groupNum].socket.send(generateSystemEventMsg('S',$scope.startTime));   //reset exchange + sync time
	         //console.log(printTime($scope.startTime));
            window.setTimeout(sendPeriod, $scope.experimentLength); 
         };


         var sendPeriod = function() {
            console.log("Period", $scope.period, "ending after", $scope.experimentLength / 1000, "seconds");
            
            for (var groupNum = 1; groupNum <= $scope.groups.length; groupNum++){         //download data and leave market
               var group = $scope.getGroup(groupNum);
               for (var user of group) {
		             $scope.groupManagers[groupNum].suppressMessages = true;
                  if($scope.groupManagers[groupNum].marketAlgorithms[user] != null){
                     $scope.groupManagers[groupNum].marketAlgorithms[user].exitMarket();           //ensure each user is reset for next period
                  }
               }
               $("#export-btn-" + groupNum).click().removeAttr("id");     //removes download link after the click
               getFinalProfits();
            }
            $("#debug").click();    //download deltas csv
            $scope.deltas = [];     //reset delta array

            $scope.period++;        //increment period

            if($scope.period > $scope.numPeriods){          //end game
               finishGame();
            }
            else{
               initExperiment();
               // ra.sendCustom("_next_period");
               window.setTimeout(function (){
                  ra.sendCustom("_next_period");      //3100 gives enough time for websockify to establish + batch msg to come
               }, 3100);
               window.setTimeout(sendPeriod, $scope.experimentLength + 3100); //dont want each period to be 3100 shorter
               }
         };

        var finishGame = function() {
            console.log("ending game");
            ra.sendCustom("end_game");

            //download data:
            for(var groupNum = 1; groupNum <= $scope.groups.length; groupNum++){
               $scope.groupManagers[groupNum].socket.send(generateSystemEventMsg('E'));   //signal to server to end the day
            }
            $('#export-profits').click().removeAttr("id");
        };

        var getFinalProfits = function() {
            for (var group in $scope.groupManagers) {
               for (var player in $scope.groupManagers[group].dataStore.playerFinalProfits) {
                  $scope.profitData.push([$scope.period, player, $scope.groupManagers[group].dataStore.playerFinalProfits[player],
                     $scope.groupManagers[group].dataStore.playerFinalProfits[player] / $scope.exchangeRate]);
               }
            }
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

         $("#debug")
            .button()
            .click(function () {
               for (var groupNum = 1; groupNum <= $scope.groups.length; groupNum++){         //do for each group
                  var a = $scope.groupManagers[groupNum].debugArray;
                  a.sort(function (a,b) {
                     return a.msgId - b.msgId;
                  });
                  //console.log(groupNum, a);          //print whole array
                  for (var index = 0; index < $scope.groupManagers[groupNum].debugArray.length - 1; index+=2){  
                     if(a[index + 1].msgId == a[index].msgId){
                        $scope.deltas.push({msgId: a[index].msgId, delta: printTime(Math.abs(a[index + 1].timeStamp - a[index].timeStamp)), msgType: a[index].msgType + "->" + a[index + 1].msgType, groupNum: groupNum});
                     }          
                  }
               }
               console.log($scope.deltas);
               var filename = printTime($scope.startTime)+ '_period_'+ $scope.config.sessionNumber + '_fba_deltas.csv';

               var csvRows = [];
               for (let index = 0; index < $scope.deltas.length; index++) {      //godbless stackoverflow
                  csvRows[index] = $scope.deltas[index].msgId + "," + $scope.deltas[index].delta + "," + $scope.deltas[index].msgType + "," + $scope.deltas[index].groupNum;
               }

               csvRows.unshift(["msgId", "delta", "msgType", "groupNum"]);

               var csvString = csvRows.join("\n");
               var a = document.createElement('a');
               a.href = 'data:attachment/csv,' + encodeURIComponent(csvString);
               a.target = '_blank';
               a.download = filename;

               document.body.appendChild(a);
               a.click();
               a.remove();
            });

         $("#buy-investor")
            .button()
            .click(function () {
               var msg = new OuchMessage("EBUY", 0, 214748.3647, true);   
               msg.delay = false;
               msg.msgId = Math.floor(Math.random() * 1000 + 1000);  //lol
               for (var group in $scope.groupManagers) {
                  $scope.groupManagers[group].dataStore.investorArrivals.push([getTime() - $scope.startTime, "BUY"]);
                  $scope.groupManagers[group].sendToMarket(msg);
               }
            });

         $("#sell-investor")
            .button()
            .click(function () {
               var msg = new OuchMessage("ESELL", 0, 0, true);   
               msg.delay = false;
               msg.msgId = Math.floor(Math.random() * 1000 + 1000);  //lol
               for (var group in $scope.groupManagers) {
                  $scope.groupManagers[group].dataStore.investorArrivals.push([getTime() - $scope.startTime, "SELL"]);
                  $scope.groupManagers[group].sendToMarket(msg);
               }
            });

         $("#send-fpc")
            .button()
            .click(function () {
               var msg = new Message("ITCH", "FPC", [getTime(), parseFloat( $("#fpc-input").val() )]);
               msg.delay = false;
               for (var group in $scope.groupManagers) {
                  $scope.groupManagers[group].dataStore.storeMsg(msg);
                  $scope.groupManagers[group].sendToMarketAlgorithms(msg);
               }
            });

         $("#export-profits")
            .button()
            .click(function () {

               $scope.profitData.sort(function (a, b) {
                  return a[0] - b[0];  //sorts b to lower index than a
               });

               // combine rows with same period and user
               for (let row = 0; row < $scope.profitData.length; row++) {
                  for(let moving_row = row + 1; moving_row < $scope.profitData.length; moving_row++){
                     //if same period and player, remove from array
                     if (($scope.profitData[row][0] === $scope.profitData[moving_row][0]) && ($scope.profitData[row][1] === $scope.profitData[moving_row][1])){
                        $scope.profitData.splice(moving_row, 1);
                     }
                  }
               }

               $scope.profitData.unshift(["period, player", "final_profit", "after_exchange_rate_"]);    //adds to beginning of array

               // get file name by formatting end time as readable string
               var filename = printTime($scope.startTime) +'_period_' + $scope.config.sessionNumber + '_fba_final_profits.csv';

               var csvRows = [];
               for (let index = 0; index < $scope.profitData.length; index++) {
                  csvRows.push($scope.profitData[index].join(','));
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
