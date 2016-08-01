RedwoodHighFrequencyTrading.factory("DataHistory", function () {
   var api = {};

   api.createDataHistory = function (startTime, startFP, myId, group, debugMode, speedCost, startingWealth, maxSpread, batchLength) {
      //Variables
      dataHistory = {};
      
      dataHistory.startTime = startTime;
      dataHistory.myId = myId;
      dataHistory.group = group;
      dataHistory.curFundPrice = [startTime, startFP, 0];
      dataHistory.pastFundPrices = [];
      dataHistory.profit = startingWealth;
      dataHistory.speedCost = speedCost;
      dataHistory.maxSpread = maxSpread;
      dataHistory.batchLength = batchLength;
      dataHistory.orderHistory = [];

      dataHistory.playerData = {};     //holds state, offer and profit data for each player in the group
      dataHistory.lowestSpread = "N/A";

      dataHistory.debugMode = debugMode;
      if (debugMode) {
         dataHistory.logger = new MessageLogger("Data History " + String(myId), "orange", "subject-log");
      }

      dataHistory.recvMessage = function (msg) {
         if (this.debugMode) {
            this.logger.logRecv(msg, "Market Algorithm");
         }

         switch (msg.msgType) {
            case "FPC"      :
               this.recordFPCchange(msg);
               break;
            case "BATCH"    :
               this.recordBatch(msg);
               break;
            case "C_TRA"    :
               this.storeTransaction(msg);
               break;
            case "C_USPEED" :
               this.storeSpeedChange(msg);
               break;
            case "C_UMAKER" :
               this.recordStateChange("Maker", msg.msgData[0], msg.msgData[1]);
               break;
            case "C_USNIPE" :
               this.recordStateChange("Snipe", msg.msgData[0], msg.msgData[1]);
               break;
            case "C_UOUT" :
               this.recordStateChange("Out", msg.msgData[0], msg.msgData[1]);
               break;
            case "C_UUSPR" :
               this.playerData[msg.msgData[0]].spread = msg.msgData[1];
               this.calcLowestSpread();
               break;
         }
      };

      // Functions
      
      //initializes player data storage
      dataHistory.init = function () {
         for (var uid of this.group) {
            this.playerData[uid] = {
               state: "Out",
               spread: this.maxSpread / 2,
               curProfitSegment: [this.startTime, this.profit, 0, "Out"], // [start time, start profit, slope, state]
               pastProfitSegments: []                                     // [start time, end time, start price, end price, state]
            };
         }
      };

      dataHistory.calcLowestSpread = function () {
         this.lowestSpread = "N/A";
         for (var player in this.playerData) {
            if (this.playerData[player].state == "Maker" && (this.lowestSpread == "N/A" || this.playerData[player].spread < this.lowestSpread)) {
               this.lowestSpread = this.playerData[player].spread;
            }
         }
      };

      dataHistory.recordBatch = function (msg) {
         for (var buyOrder of msg.msgData[0]) {
            if (buyOrder.transacted) {
               var uid = buyOrder.id;
               if (uid == this.myId) this.profit += msg.msgData[4] - msg.msgData[3];
               
               var curProfit = this.playerData[uid].curProfitSegment[1] - ((this.startTime + this.batchLength * msg.msgData[2] - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000);
               this.recordProfitSegment(curProfit + msg.msgData[4] - msg.msgData[3], this.startTime + this.batchLength * msg.msgData[2], this.playerData[uid].curProfitSegment[2], uid, this.playerData[uid].state);
            }
         }
         for (var sellOrder of msg.msgData[1]) {
            if (sellOrder.transacted) {
               var uid = sellOrder.id;
               if (uid == this.myId) this.profit += msg.msgData[3] - msg.msgData[4];
               
               var curProfit = this.playerData[uid].curProfitSegment[1] - ((this.startTime + this.batchLength * msg.msgData[2] - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000);
               this.recordProfitSegment(curProfit + msg.msgData[3] - msg.msgData[4], this.startTime + this.batchLength * msg.msgData[2], this.playerData[uid].curProfitSegment[2], uid, this.playerData[uid].state);
            }
         }

         this.orderHistory.push(msg.msgData);
      };

      dataHistory.recordStateChange = function (newState, uid, timestamp) {
         this.playerData[uid].state = newState;
         this.calcLowestSpread();

         var curProfit = this.playerData[uid].curProfitSegment[1] - ((timestamp - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000);
         this.recordProfitSegment(curProfit, timestamp, this.playerData[uid].curProfitSegment[2], uid, newState);
      };

      // Adds fundamental price change to history
      dataHistory.recordFPCchange = function (fpcMsg) {
         this.storeFundPrice(fpcMsg.msgData[0]);
         this.curFundPrice = [fpcMsg.msgData[0], fpcMsg.msgData[1], 0];
      };

      dataHistory.storeFundPrice = function (endTime) {
         this.pastFundPrices.push([this.curFundPrice[0], endTime, this.curFundPrice[1]]);
         this.curFundPrice = null;
      };

      dataHistory.storeSpeedChange = function (msg) {
         var uid = msg.msgData[0];
         var curProfit = this.playerData[uid].curProfitSegment[1] - ((msg.msgData[2] - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000);
         this.recordProfitSegment(curProfit, msg.msgData[2], msg.msgData[1] ? this.speedCost : 0, uid, this.playerData[uid].state);
      };

      dataHistory.recordProfitSegment = function (price, startTime, slope, uid, state) {
         if (this.playerData[uid].curProfitSegment != null) {
            this.storeProfitSegment(startTime, uid);
         }
         this.playerData[uid].curProfitSegment = [startTime, price, slope, state];
      };

      dataHistory.storeProfitSegment = function (endTime, uid) {
         if (this.playerData[uid].curProfitSegment == null) {
            throw "Cannot store current profit segment because it is null";
         }
         //find end price by subtracting how far graph has descended from start price
         var endPrice = this.playerData[uid].curProfitSegment[1] - ((endTime - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000);
         this.playerData[uid].pastProfitSegments.push([this.playerData[uid].curProfitSegment[0], endTime, this.playerData[uid].curProfitSegment[1], endPrice, this.playerData[uid].curProfitSegment[3]]);
         this.playerData[uid].curProfitSegment = null;
      };

      return dataHistory;
   };

   return api;
});
