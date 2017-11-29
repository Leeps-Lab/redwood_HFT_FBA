Redwood.factory("GroupManager", function () {
   var api = {};

   api.createGroupManager = function (groupArgs, sendFunction) {
      var groupManager = {};

      groupManager.initGroupManager = function(groupArgs){
         groupManager.marketFlag = groupArgs.mFlag; // LOCAL  = use local market (i.e. this.market)
                                                    // REMOTE = use remote market by making websockets connection
                                                    // DEBUG  = use debug market (i.e. this.debugMarket)

         groupManager.marketAlgorithms = {};   // reference to all market algorithms in this group, mapped by subject id ---> marketAlgorithms[subjectID]
         groupManager.market = {};             // reference to the market object for this group
         groupManager.dataStore = {};

         groupManager.priceChanges = groupArgs.priceChanges;         // array of all price changes that will occur
         groupManager.investorArrivals = groupArgs.investorArrivals; // array of all investor arrivals that will occur
         groupManager.priceIndex = 1;                                // index of last price index to occur. start at 1 because start FP is handled differently
         groupManager.investorIndex = 0;                             // index of last investor arrival to occur
         groupManager.intervalPromise = null;                        // promise for canceling interval when experiment ends
         groupManager.lastbatchTime = 0;

         groupManager.groupNumber = groupArgs.groupNumber;
         groupManager.memberIDs = groupArgs.memberIDs; // array that contains id number for each subject in this group
         groupManager.syncFpArray = [];                // buffer that holds onto messages until received msg from all subjects
         groupManager.delay = 500;                     // # of milliseconds that will be delayed by latency simulation
         groupManager.fastDelay = 100;
         groupManager.batchLength = groupArgs.batchLength;
         groupManager.syncFPArray = new SynchronizeArray(groupManager.memberIDs);
         groupManager.FPMsgList = [];
         groupManager.curMsgId = 1 + 500 * groupArgs.period;
         groupManager.debugArray = [];
         groupManager.inSnipeWindow = false;



         groupManager.isDebug = groupArgs.isDebug;     //indicates if message logger should be used
         groupManager.outboundMarketLog = "";          // string of debug info for messages outbound to market
         groupManager.inboundMarketLog = "";           // string of debug info for messages inbound from market
	      groupManager.suppressMessages = false;
         groupManager.currentFundPrice = 0;
         groupManager.connection = false;
         groupManager.establishConnection();
      }
      

      groupManager.establishConnection = function(){
         if(groupManager.marketFlag === "REMOTE"/*ZACH, D/N MODIFY!*/){

            // open websocket with market
            groupManager.marketURI = "ws://54.149.235.92:800" + groupArgs.groupNum + "/";
            // groupManager.marketURI = "ws://18.196.3.136:800" + groupArgs.groupNum + "/";

            groupManager.socket = new WebSocket(groupManager.marketURI, ['binary', 'base64']);

            if(groupArgs.URI == null){
               console.log("remember to add the correct URI to your config file...");
               groupArgs.URI = "54.219.182.118";    //for testing purposes, default is california
            }
            // open websocket with market
            groupManager.marketURI = "ws://" + groupArgs.URI + ":800" + groupArgs.groupNum + "/";
            groupManager.socket = new WebSocket(groupManager.marketURI, ['binary', 'base64']);

            groupManager.socket.onopen = function(event) {
               console.log(printTime(getTime()), "Group", groupArgs.groupNum, "Connected to", groupArgs.URI);
               setBatchLength(groupManager.batchLength);
            };


            // recieves messages from remote market
            groupManager.socket.onmessage = function(event) {
               // create reader to read "blob" object
               var reader = new FileReader();
               reader.addEventListener("loadend", function() {
                  // reader.result contains the raw ouch message as a DataBuffer, convert it to string
                  var ouchStr = String.fromCharCode.apply(null, new Uint8Array(reader.result));
                     // split the string in case messages are conjoined
                     var ouchMsgArray = splitMessages(ouchStr);            // translate the message and pass it to the recieve function
                     for(ouchMsg of ouchMsgArray){
                        if(ouchMsg.batchType == 'B'){                             //only care about start messages
                           groupManager.lastbatchTime = getTime();               //msg.timeStamp;
                        }  
                        groupManager.recvFromMarket(ouchToLeepsMsg(ouchMsg));
                     }
               });
               reader.readAsArrayBuffer(event.data);
            };
         }
      };


      if(groupManager.marketFlag === "DEBUG"){
         
         // wrapper for debug market recieve function
         groupManager.recvFromDebugMarket = function(msg){

            console.log("Recieved From Debug Market: " + msg);
            console.log(ouchToLeepsMsg(msg));
            groupManager.recvFromMarket(ouchToLeepsMsg(msg));
         }

         // initialize debug market
         groupManager.debugMarket = new DebugMarket(groupManager.recvFromDebugMarket);
      }

      // wrapper for the redwood send function
      groupManager.rssend = function (key, value, period) {
         sendFunction(key, value, "admin", period, this.groupNumber);
      };

      groupManager.sendToDataHistory = function (msg, uid) {
	 if(!this.suppressMessages){
            this.dataStore.storeMsg(msg);
            this.rssend("To_Data_History_" + uid, msg, this.period);
	 }
      };

      groupManager.sendToAllDataHistories = function (msg) {
	 if(!this.suppressMessages){
            this.dataStore.storeMsg(msg);
            this.rssend("To_All_Data_Histories", msg, this.period);
	 }
      };

      // sends a message to all of the market algorithms in this group
      groupManager.sendToMarketAlgorithms = function (msg) {
         for (var memberID of this.memberIDs) {
            this.marketAlgorithms[memberID].recvFromGroupManager(msg);
         }
      };

      // receive a message from a single market algorithm in this group
      groupManager.recvFromMarketAlgorithm = function (msg) {

         if (this.isDebug) {
            this.logger.logRecv(msg, "Market Algorithm");
         }
         // synchronized message in response to fundamental price change
         if (msg.protocol === "SYNC_FP") {
            //mark that this user sent msg
            this.syncFPArray.markReady(msg.msgData[0]);
            this.FPMsgList.push(msg);

            // check if every user has sent a response
            if (this.syncFPArray.allReady()) {
               // shuffle the order of messages sitting in the arrays
               var indexOrder = this.getRandomMsgOrder(this.FPMsgList.length);

               // store player order for debugging purposes
               var playerOrder = [];

               // send msgs in new shuffled order
               for (var index of indexOrder) {
                  playerOrder.push(this.FPMsgList[index].msgData[0]);
                  for (var rmsg of this.FPMsgList[index].msgData[2]) {
                     this.sendToMarket(rmsg);
                  }
               }
               
               //save order to CSV file
               this.dataStore.storePlayerOrder(msg.timeStamp, playerOrder);      

               // reset arrays for the next fundamental price change
               this.FPMsgList = [];
               this.syncFPArray = new SynchronizeArray(this.memberIDs);
            }
         }

         // general message that needs to be passed on to market algorthm
         if (msg.protocol === "OUCH") {
            groupManager.sendToMarket(msg);
         }

      };

      // Function for sending messages, will route msg to remote or local market based on this.marketFLag
      groupManager.sendToMarket = function (leepsMsg) {
         //console.log("Outbound Message", leepsMsg);                //debug OUCH messages
         if (leepsMsg.delay) {
               window.setTimeout(this.sendToRemoteMarket.bind(this), this.delay, leepsMsg);
         }
         else {
               window.setTimeout(this.sendToRemoteMarket.bind(this), this.fastDelay, leepsMsg); //fast have 100ms delay
         }
      };

      // handles a message from the market
      groupManager.recvFromMarket = function (msg) {
         // console.log("Inbound Message", msg);                //debug incoming ITCH messages
         //if(msg.msgType === "C_TRA") console.log(msg);

         if((msg.msgType === "C_TRA" && msg.subjectID > 0) || msg.msgType === "BATCH"){      //dont send investor half of the c_tra to MA
            this.sendToMarketAlgorithms(msg);
            if(msg.batchType == 'P'){
               //calculate time until snipe window (done in groupmanager because 4x marketalg = bad behavior)
               var snipeWindowDelay = this.batchLength - this.delay;
               this.inSnipeWindow = false;            //next batchLength - msg delay will be unsnipeable
               
               window.setTimeout(function (){
                  groupManager.inSnipeWindow = true;     //this is lost in this scope, use groupManager
               }, snipeWindowDelay);
            } 
         }
         else {
            if(msg.subjectID > 0) {                                 //Only send user messages to market algorithm
               this.marketAlgorithms[msg.subjectID].recvFromGroupManager(msg);
               this.debugArray.push({msgId: msg.msgId, timeString: printTime(msg.timeStamp), msgType: msg.msgType, timeStamp: msg.timeStamp}); //push info to compare server msg to redwood   
         }
            else {
               this.sendToAllDataHistories(msg);
            }
         }
      };

      groupManager.sendToLocalMarket = function(leepsMsg){          //obsolete
         console.log("sending to local market");
         this.market.recvMessage(leepsMsg);
      }

      groupManager.sendToRemoteMarket = function(leepsMsg){ 
         var msg = leepsMsgToOuch(leepsMsg);                        //convert in house format to NASDAQ OUCH format
         //console.log(msg);                                        //debug for outgoing message
         this.debugArray.push({msgId: leepsMsg.msgId, timeString: printTime(leepsMsg.timeStamp), msgType: leepsMsg.msgType, timeStamp: leepsMsg.timeStamp});   //push info to compare return msg from server
         this.socket.send(msg);
      }

      groupManager.sendToDebugMarket = function(leepsMsg){
         var msg = leepsMsgToOuch(leepsMsg);
         this.debugMarket.recvMessage(msg);
      }

      // handles message from subject and passes it on to market algorithm
      groupManager.recvFromSubject = function (msg) {
         // if this is a user message, handle it and don't send it to market
         if (msg.protocol === "USER") {
            var subjectID = msg.msgData[0];

            this.sendToAllDataHistories(msg);            //updates the UI, doesn't work when directly sent from start.js

            this.marketAlgorithms[subjectID].recvFromGroupManager(msg);
            

            // this.dataStore.storeMsg(msg);
            if (msg.msgType == "UMAKER") this.dataStore.storeSpreadChange(msg.msgData[1], this.marketAlgorithms[subjectID].spread, msg.msgData[0]);
         }
      };

      // creates an array from 0 to size-1 that are shuffled in random order
      groupManager.getRandomMsgOrder = function (size) {

         // init indices from 0 to size-1
         var indices = [];
         var rand;
         var temp;
         for (var i = 0; i < size; i++) {
            indices.push(i);
         }

         // shuffle
         for (i = size - 1; i > 0; i--) {
            rand = Math.floor(Math.random() * size);
            temp = indices[i];
            indices[i] = indices[rand];
            indices[rand] = temp;
         }
         return indices;
      };

      groupManager.sendNextPriceChange = function () {
         
         if (this.priceChanges[this.priceIndex][1] < 0) {      // if current price is -1, end the game
            this.rssend("end_game", this.groupNumber);
            window.clearTimeout(this.market.timeoutID);
            return;
         }
         // FPC message contains timestamp, new price, price index and a boolean reflecting the jump's direction
         var msg = new Message("ITCH", "FPC", [getTime(), this.priceChanges[this.priceIndex][1], this.priceIndex, this.priceChanges[this.priceIndex][1] > this.priceChanges[this.priceIndex - 1][1]]);
         msg.delay = false;
         this.dataStore.storeMsg(msg);
         this.sendToMarketAlgorithms(msg);
         //console.log("jump at", printTime(getTime()));

         this.currentFundPrice = this.priceChanges[this.priceIndex][1]; //for knowing investor price

         this.priceIndex++;

         if (this.priceIndex == this.priceChanges.length) {
            console.log("reached end of price changes array");
            return;
         }

         //set timeout for sending the next price change
         window.setTimeout(this.sendNextPriceChange, (this.startTime + this.priceChanges[this.priceIndex][0] - getTime()) / 1000000); 
      }.bind(groupManager);

      groupManager.sendNextInvestorArrival = function () {
         //saves investor data to CSV output
         this.dataStore.investorArrivals.push([getTime() - this.startTime, this.investorArrivals[this.investorIndex][1] == 1 ? "BUY" : "SELL"]);
         
         // create the outside investor leeps message
         var msgType = this.investorArrivals[this.investorIndex][1] === 1 ? "EBUY" : "ESELL";
         if(msgType === "EBUY"){
            var msg2 = new OuchMessage("EBUY", 0, 214748.3647, true);      //changed 7/3/17
         }
         else if(msgType === "ESELL"){
            var msg2 = new OuchMessage("ESELL", 0, 0, true);      //changed 7/3/17
         }

         msg2.msgId = this.curMsgId;
         this.curMsgId++;
         msg2.delay = false;
         this.sendToMarket(msg2);

         this.investorIndex++;

         if (this.investorIndex == this.investorArrivals.length) {
            console.log("reached end of investors array");
            return;
         }

         window.setTimeout(this.sendNextInvestorArrival, (this.startTime + this.investorArrivals[this.investorIndex][0] - getTime()) / 1000000);   //from cda
      }.bind(groupManager);

      return groupManager;
   };

   return api;
});
