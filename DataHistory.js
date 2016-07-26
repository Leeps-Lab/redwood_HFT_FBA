RedwoodHighFrequencyTrading.factory("DataHistory", function () {
   var api = {};

   api.createDataHistory = function (startTime, startFP, myId, group, debugMode, speedCost, startingWealth, maxSpread) {
      //Variables
      dataHistory = {};
      
      dataHistory.startTime = startTime;
      dataHistory.myId = myId;
      dataHistory.group = group;
      dataHistory.curFundPrice = [startTime, startFP, 0];
      dataHistory.pastFundPrices = [];
      dataHistory.transactions = [];    //entries look like [timestamp, myTransaction]
      dataHistory.profit = startingWealth;
      dataHistory.speedCost = speedCost;
      dataHistory.maxSpread = maxSpread;

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
            case "C_TRA"    :
               this.storeTransaction(msg);
               break;
            case "C_USPEED" :
               this.storeSpeedChange(msg);
               break;
            case "C_UBUY"   :
            case "C_EBUY"   :
               this.recordBuyOffer(msg);
               break;
            case "C_USELL"  :
            case "C_ESELL"  :
               this.recordSellOffer(msg);
               break;
            case "C_RBUY"   :
               this.storeBuyOffer(msg.msgData[1], msg.msgData[0]);
               break;
            case "C_RSELL"  :
               this.storeSellOffer(msg.msgData[1], msg.msgData[0]);
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
               curBuyOffer: null,
               curSellOffer: null,
               pastBuyOffers: [],
               pastSellOffers: [],
               state: "Out",
               spread: this.maxSpread / 2,
               curProfitSegment: [this.startTime, this.profit, 0, "Out"], // [start time, start profit, slope, state]
               pastProfitSegments: []                              // [start time, end time, start price, end price, state]
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

      //records a new buy offer
      dataHistory.recordBuyOffer = function (buyMsg) {
         //Check if current buy offer needs to be stored
         if (this.playerData[buyMsg.msgData[0]].curBuyOffer != null) {
            this.storeBuyOffer(buyMsg.msgData[2], buyMsg.msgData[0]);
         }
         //Push on new buy offer
         this.playerData[buyMsg.msgData[0]].curBuyOffer = [buyMsg.msgData[2], buyMsg.msgData[1]];   // [timestamp, price]
      };

      // Records a new Sell offer
      dataHistory.recordSellOffer = function (sellMsg) {
         //Check if current sell offer needs to be stored
         if (this.playerData[sellMsg.msgData[0]].curSellOffer != null) {
            this.storeSellOffer(sellMsg.msgData[2], sellMsg.msgData[0]);
         }
         //Push on new sell offer
         this.playerData[sellMsg.msgData[0]].curSellOffer = [sellMsg.msgData[2], sellMsg.msgData[1]];   // [timestamp, price]
      };

      // Shifts buy offer from currently being active into the history
      dataHistory.storeBuyOffer = function (endTime, uid) {
         if (this.playerData[uid].curBuyOffer == null) {
            throw "Cannot shift " + uid + "'s buy offer because it is null";
         }
         this.playerData[uid].pastBuyOffers.push([this.playerData[uid].curBuyOffer[0], endTime, this.playerData[uid].curBuyOffer[1]]);  // [startTimestamp, endTimestamp, price]
         this.playerData[uid].curBuyOffer = null;
      };

      // Shifts sell offer from currently being active into the history
      dataHistory.storeSellOffer = function (endTime, uid) {
         if (this.playerData[uid].curSellOffer == null) {
            throw "Cannot shift " + uid + "'s sell offer because it is null";
         }
         this.playerData[uid].pastSellOffers.push([this.playerData[uid].curSellOffer[0], endTime, this.playerData[uid].curSellOffer[1]]);  // [startTimestamp, endTimestamp, price]
         this.playerData[uid].curSellOffer = null;
      };

      dataHistory.storeTransaction = function (msg) {
         if (msg.msgData[3] == this.myId) {
            // if I'm the buyer
            this.profit += msg.msgData[2] - msg.msgData[1];
         }
         else if (msg.msgData[4] == this.myId) {
            //if I'm the seller
            this.profit += msg.msgData[1] - msg.msgData[2];
         }

         if (msg.msgData[3] != 0) {
            if (this.playerData[msg.msgData[3]].curBuyOffer !== null) this.storeBuyOffer(msg.msgData[0], msg.msgData[3]);

            var uid = msg.msgData[3];
            var curProfit = this.playerData[uid].curProfitSegment[1] - ((msg.msgData[0] - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000);
            this.recordProfitSegment(curProfit + msg.msgData[2] - msg.msgData[1], msg.msgData[0], this.playerData[uid].curProfitSegment[2], uid, this.playerData[uid].state);
         }
         if (msg.msgData[4] != 0) {
            if (this.playerData[msg.msgData[4]].curSellOffer !== null) this.storeSellOffer(msg.msgData[0], msg.msgData[4]);

            var uid = msg.msgData[4];
            var curProfit = this.playerData[uid].curProfitSegment[1] - ((msg.msgData[0] - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000);
            this.recordProfitSegment(curProfit + msg.msgData[1] - msg.msgData[2], msg.msgData[0], this.playerData[uid].curProfitSegment[2], uid, this.playerData[uid].state);
         }
         this.transactions.push(msg.msgData);
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
