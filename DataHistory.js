RedwoodHighFrequencyTrading.factory("DataHistory", function () {
   var api = {};

   api.createDataHistory = function (startTime, startFP, myId, group, debugMode, speedCost, startingWealth, maxSpread, batchLength) {
      //Variables
      dataHistory = {};

      dataHistory.myUpdate = {};
      dataHistory.otherUpdate = {};
      dataHistory.startTime = startTime;
      dataHistory.myId = myId;
      dataHistory.group = group;
      dataHistory.curFundPrice = [startTime, startFP, 0];
      dataHistory.pastFundPrices = [];
      dataHistory.transactions = [];    //entries look like [timestamp, myTransaction]
      dataHistory.profit = startingWealth;
      dataHistory.speedCost = speedCost;
      dataHistory.maxSpread = maxSpread;
      dataHistory.batchLength = batchLength;
      dataHistory.batchNumber = 0;

      dataHistory.investorTransactions =[];
      dataHistory.otherTransactions = [];
      dataHistory.myTransactions = [];

      dataHistory.priceHistory = [];         // storage for all equilibrium prices
      dataHistory.investorOrderSpacing = maxSpread / 4;  // visual spacing between investor orders in dollars
      dataHistory.myOrders = [];             // alternate order storage for  ing
      dataHistory.othersOrders = [];
      dataHistory.investorOrders = [];

      dataHistory.investorOrdersThisBatch = [];

      dataHistory.playerData = {};     //holds state, offer and profit data for each player in the group
      dataHistory.lowestSpread = "N/A";
      dataHistory.highestSpread = maxSpread/2;
      dataHistory.buyTransactionCount = 0;
      dataHistory.sellTransactionCount = 0;

      dataHistory.highestMarketPrice = startFP;
      dataHistory.lowestMarketPrice = startFP;
      dataHistory.highestProfitPrice = startingWealth;
      dataHistory.lowestProfitPrice = startingWealth;

      dataHistory.debugMode = debugMode;
      if (debugMode) {
         dataHistory.logger = new MessageLogger("Data History " + String(myId), "orange", "subject-log");
      }

      dataHistory.recvMessage = function (msg) {
         if (this.debugMode) {
            this.logger.logRecv(msg, "Market Algorithm");
         }
         //console.log(msg);
         switch (msg.msgType) {
            case "FPC"      :
               this.recordFPCchange(msg);
               break;
            case "BATCH"    :
               this.pushToBatches();
               //console.log(msg);
               break;
            case "C_TRA"    :
               this.storeTransaction(msg);
               break;
            case "USPEED" :         //changed 6/27/17 for refactor
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
               //this.storeBuyOffer(msg.msgData[1], msg.msgData[0]);
               this.storeBuyOffer(msg.timeStamp, msg.subjectID);
               break;
            case "C_RSELL"  :
               //this.storeSellOffer(msg.msgData[1], msg.msgData[0]);
               this.storeBuyOffer(msg.timeStamp, msg.subjectID);
               break;      
            case "UMAKER" :      //changed 6/27/17 for refactor
               this.recordStateChange("Maker", msg.msgData[0], msg.msgData[1]);
               //this.recordStateChange("Maker", msg.subjectID, msg.timeStamp);
               break;
            case "USNIPE" :      //changed 6/27/17 for refactor
               this.recordStateChange("Snipe", msg.msgData[0], msg.msgData[1]);
               //this.recordStateChange("Snipe", msg.subjectID, msg.timeStamp);
               break;
            case "UOUT" :
               this.recordStateChange("Out", msg.msgData[0], msg.msgData[1]);
               //this.recordStateChange("Out", msg.subjectID, msg.timeStamp);
               break;
            case "UUSPR" :
               console.log("UUSPR");
               this.playerData[msg.msgData[0]].spread = msg.msgData[1];
               this.calcLowestSpread();
               this.calcHighestSpread();
               break;
         }
      };

      // Functions
      
      //initializes player data storage
      dataHistory.init = function () {
         for (var uid of this.group) {
            this.playerData[uid] = {
               speed: false,
               curBuyOffer: null,
               curSellOffer: null,
               pastBuyOffers: [],
               pastSellOffers: [],
               displaySpread: this.maxSpread / 2,                         // the player's spread at the time of the last batch
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

      dataHistory.calcHighestSpread = function () {
         this.highestSpread = "N/A";
         for (var player in this.playerData) {
            if (this.playerData[player].state == "Maker" && (this.highestSpread == "N/A" || this.playerData[player].spread > this.highestSpread)) {
               this.highestSpread = this.playerData[player].spread;
            }
         }
         console.log(this.highestSpread);
      };

      dataHistory.recordStateChange = function (newState, uid, timestamp) {
         this.playerData[uid].state = newState;
         this.calcLowestSpread();

         var curProfit = this.playerData[uid].curProfitSegment[1] - ((timestamp - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000000000);     
         this.recordProfitSegment(curProfit, timestamp, this.playerData[uid].curProfitSegment[2], uid, newState);
      };

      // Adds fundamental price change to history
      dataHistory.recordFPCchange = function (fpcMsg) {
         if (fpcMsg.msgData[1] > this.highestMarketPrice) this.highestMarketPrice = fpcMsg.msgData[1];
         if (fpcMsg.msgData[1] < this.lowestMarketPrice) this.lowestMarketPrice = fpcMsg.msgData[1];

         this.storeFundPrice(fpcMsg.msgData[0]);
         this.curFundPrice = [fpcMsg.msgData[0], fpcMsg.msgData[1], 0];
      };

      dataHistory.storeFundPrice = function (endTime) {
         this.pastFundPrices.push([this.curFundPrice[0], endTime, this.curFundPrice[1]]);
         this.curFundPrice = null;
      };

      dataHistory.calcClosestBatch = function (myTimestamp,isUpdateMessage){
         var timeElapsed = myTimestamp - this.startTime;
         if(isUpdateMessage){
            return Math.ceil(timeElapsed / (this.batchLength * 1000000));
         }
         else{
            return Math.round(timeElapsed / (this.batchLength * 1000000));
         }
      };

      dataHistory.storeTransaction = function (msg) {    //[timestamp, price, fund-price, buyer, seller]
         var myTransaction = {};       
         var investorTransaction = {};
         var otherTransaction = {};        
         if (msg.buyerID == this.myId) {                                            //I'm the buyer
            this.profit += msg.FPC - msg.price;                                     //fundPrice - myPrice
            //push info on my transaction to graph
            myTransaction.positive = msg.FPC - msg.price >= 0;                      //calculate +/- transaction
            myTransaction.price = msg.price;
            myTransaction.transacted = true;
            myTransaction.batchNumber = this.calcClosestBatch(msg.timeStamp,false); //test -> 7/17/17
            //myTransaction.batchNumber = this.calcClosestBatch(getTime(),false);   
            this.myTransactions.push(myTransaction);

            //push info on the investor I transacted with to graph
            this.sellTransactionCount++;                                            //number of sell transactions in this batch
            investorTransaction.price = msg.FPC - (this.highestSpread / 2) - (this.sellTransactionCount * this.investorOrderSpacing);
            investorTransaction.transacted = true;
            investorTransaction.batchNumber = myTransaction.batchNumber;
            //console.log("investor transaction: ", investorTransaction);
            this.investorTransactions.push(investorTransaction);
         }
         else if (msg.sellerID == this.myId) {                                      //if I'm the seller
            this.profit += msg.price - msg.FPC;
            //push info on my transaction to graph
            myTransaction.positive = msg.price - msg.FPC >= 0;                      //calculate +/- transaction
            myTransaction.price = msg.price;
            myTransaction.transacted = true;
            myTransaction.batchNumber = this.calcClosestBatch(msg.timeStamp,false); //test -> 7/17/17
            //myTransaction.batchNumber = this.calcClosestBatch(getTime(),false);  
            this.myTransactions.push(myTransaction);

            //push info on the investor I transacted with to graph
            this.buyTransactionCount++;
            investorTransaction.price = msg.FPC + (this.highestSpread / 2) + (this.buyTransactionCount * this.investorOrderSpacing);    //investor has price of transaction + spacing
            investorTransaction.transacted = true;
            investorTransaction.batchNumber = myTransaction.batchNumber; 
            //console.log("investor transaction: ", investorTransaction);
            this.investorTransactions.push(investorTransaction);
         }
         else {   //a different user transacted, need to push to investorTransaction to update my graph
            if (msg.buyerID == 0) { // buyer was an investor
               this.buyTransactionCount++;
               investorTransaction.price = msg.FPC + (this.highestSpread / 2) + (this.buyTransactionCount * this.investorOrderSpacing);    //investor has price of transaction + spacing
               investorTransaction.transacted = true;
               investorTransaction.batchNumber = this.calcClosestBatch(msg.timeStamp,false);    //changed 7/17/17
               //investorTransaction.batchNumber = this.calcClosestBatch(getTime(),false); 
               //console.log("investor transaction: ", investorTransaction);
               this.investorTransactions.push(investorTransaction);
            }
            else { //other user is the buyer
               otherTransaction.price = msg.price;
               otherTransaction.transacted = true;
               otherTransaction.batchNumber = this.calcClosestBatch(msg.timeStamp,false); //changed 7/17/17
               //otherTransaction.batchNumber = this.calcClosestBatch(getTime(),false);
               //console.log("other transaction: ", otherTransaction);
               this.otherTransactions.push(otherTransaction);
            }

            if (msg.sellerID == 0) { // seller was an investor
               this.sellTransactionCount++;
               investorTransaction.price = msg.FPC - (this.highestSpread / 2) - (this.sellTransactionCount * this.investorOrderSpacing);
               investorTransaction.transacted = true;
               investorTransaction.batchNumber = this.calcClosestBatch(msg.timeStamp,false);       //changed 7/17/17
               //investorTransaction.batchNumber = this.calcClosestBatch(getTime(),false); 
               //console.log("investor transaction: ", investorTransaction);
               this.investorTransactions.push(investorTransaction);
            }
            else { //other user is the seller
               otherTransaction.price = msg.price;
               otherTransaction.transacted = true;
               otherTransaction.batchNumber = this.calcClosestBatch(msg.timeStamp,false);    //changed 7/17/17
               //otherTransaction.batchNumber = this.calcClosestBatch(getTime(),false); 
               //console.log("other transaction: ", otherTransaction);
               this.otherTransactions.push(otherTransaction);
            }

         }
         if (msg.buyerID != 0) { //checks if the player that receieved the buy transaction has a current buy offer
            if (this.playerData[msg.buyerID].curBuyOffer !== null) this.storeBuyOffer(msg.timeStamp, msg.buyerID);
            var uid = msg.buyerID;
            var curProfit = this.playerData[uid].curProfitSegment[1] - ((msg.timeStamp - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000000000); //changed from 1000
            this.recordProfitSegment(curProfit + msg.FPC - msg.price, msg.timeStamp, this.playerData[uid].curProfitSegment[2], uid, this.playerData[uid].state);
         }

         //checks if the player that receieved the buy transaction has a current sell offer
         if (msg.sellerID != 0) {   //checks if the player that receieved the buy transaction has a current sell offer
            if (this.playerData[msg.sellerID].curSellOffer !== null) this.storeSellOffer(msg.timeStamp, msg.sellerID);
            var uid = msg.sellerID;
            var curProfit = this.playerData[uid].curProfitSegment[1] - ((msg.timeStamp - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000000000); //changed from 1000
            this.recordProfitSegment(curProfit + msg.price - msg.FPC, msg.timeStamp, this.playerData[uid].curProfitSegment[2], uid, this.playerData[uid].state);
         }
         //console.log(msg.msgData);
         //this.transactions.push(msg.msgData);    //removed 7/17/17
      };



      dataHistory.pushToBatches = function(){
         let currentBatch = this.calcClosestBatch(getTime(), false);
         let batchMinPrice = this.curFundPrice[1];
         let batchMaxPrice = this.curFundPrice[1];
         
         for (var uid of this.group) {
            if (this.playerData[uid].curBuyOffer != null) {
               batchMinPrice = Math.min(batchMinPrice, this.playerData[uid].curBuyOffer[1]);

               let update = {
                  batchNumber: currentBatch,
                  price: this.playerData[uid].curBuyOffer[1]
               };
               if (uid == this.myId) {
                  this.myOrders.push(update);
               }
               else {
                  this.othersOrders.push(update);
               }
            }

            if (this.playerData[uid].curSellOffer != null) {
               batchMaxPrice = Math.max(batchMaxPrice, this.playerData[uid].curSellOffer[1]);

               let update = {
                  batchNumber: currentBatch,
                  price: this.playerData[uid].curSellOffer[1]
               };
               if (uid == this.myId) {
                  this.myOrders.push(update);
               }
               else {
                  this.othersOrders.push(update);
               }
            }

         }

         // add investor orders from this batch to investor orders array
         for(let order of this.investorOrdersThisBatch) {
            if (order.isBuy) {
               batchMaxPrice += this.investorOrderSpacing;
               order.price = batchMaxPrice;
            }
            else {
               batchMinPrice -= this.investorOrderSpacing;
               order.price = batchMinPrice;
            }
            this.investorOrders.push(order);
            //console.log(order,(getTime() - order.time)/1000000);
         }
         this.investorOrdersThisBatch = [];

         window.setTimeout(function(){
               this.buyTransactionCount = 0;
               this.sellTransactionCount = 0;
            }.bind(this), 200);
      };

      //records a new buy offer
      dataHistory.recordBuyOffer = function (buyMsg) { 
         if (buyMsg.subjectID == 0) {     // if this is an investor order
            this.investorOrdersThisBatch.push({
               batchNumber: this.calcClosestBatch(buyMsg.timeStamp, true),
               price: buyMsg.price,
               isBuy: true,
               time: getTime()
            });
            return;
         }

         if(this.playerData[buyMsg.subjectID].state == 'Snipe'){  //TEST -> don't want to graph snipe offer
            console.log("Tried to record buy offer, state: "  + this.playerData[buyMsg.subjectID].state);
            return;
         }
         //Check if current buy offer needs to be stored
         if (this.playerData[buyMsg.subjectID].curBuyOffer != null) {
            this.storeBuyOffer(buyMsg.timeStamp, buyMsg.subjectID);
         }
         
         //Push on new buy offer
         this.playerData[buyMsg.subjectID].curBuyOffer = [buyMsg.timeStamp, buyMsg.price];   // [timestamp, price]

         // check to see if new buy price is lowest price so far
         if (buyMsg.price < this.lowestMarketPrice) this.lowestMarketPrice = buyMsg.price;
      };

      dataHistory.recordSellOffer = function (sellMsg) { //[id,price,timestamp]
         // if this is an investor order
         if (sellMsg.subjectID == 0) {
            this.investorOrdersThisBatch.push({
               batchNumber: this.calcClosestBatch(sellMsg.timeStamp, true),
               isBuy: false,
               time: getTime()
            });
            return;
         }

         if(this.playerData[sellMsg.subjectID].state == 'Snipe'){     //TEST -> don't want to graph snipe offer
            console.log("Tried to record sell offer, state: "  + this.playerData[sellMsg.subjectID].state);
            return;
         }
         //Check if current sell offer needs to be stored
         if (this.playerData[sellMsg.subjectID].curSellOffer != null) {
            this.storeSellOffer(sellMsg.timeStamp, sellMsg.subjectID);
         }
         //Push on new sell offer
         this.playerData[sellMsg.subjectID].curSellOffer = [sellMsg.timeStamp, sellMsg.price];   // [timestamp, price]

         // check to see if new sell price is highest price so far
         if (sellMsg.price > this.highestMarketPrice) this.highestMarketPrice = sellMsg.price;
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

      dataHistory.storeSpeedChange = function (msg) { //("USER", "USPEED", [rs.user_id, $scope.using_speed, $scope.tradingGraph.getCurOffsetTime()])
         var uid = msg.msgData[0];
         this.playerData[uid].speed = msg.msgData[1];
         var curProfit = this.playerData[uid].curProfitSegment[1] - ((msg.msgData[2] - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000000000);
         this.recordProfitSegment(curProfit, msg.msgData[2], msg.msgData[1] ? this.speedCost : 0, uid, this.playerData[uid].state);
      };

      dataHistory.recordProfitSegment = function (price, startTime, slope, uid, state) {
         if (price > this.highestProfitPrice) this.highestProfitPrice = price;
         if (price < this.lowestProfitPrice) this.lowestProfitPrice = price;

         if (this.playerData[uid].curProfitSegment != null) {
            this.storeProfitSegment(startTime, uid);
         }
         this.playerData[uid].curProfitSegment = [startTime, price, slope, state];
      };

      // 

      dataHistory.storeProfitSegment = function (endTime, uid) {
         if (this.playerData[uid].curProfitSegment == null) {
            throw "Cannot store current profit segment because it is null";
         }
         //find end price by subtracting how far graph has descended from start price
         var endPrice = this.playerData[uid].curProfitSegment[1] - ((endTime - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000000000);
         this.playerData[uid].pastProfitSegments.push([this.playerData[uid].curProfitSegment[0], endTime, this.playerData[uid].curProfitSegment[1], endPrice, this.playerData[uid].curProfitSegment[3]]);
         this.playerData[uid].curProfitSegment = null;
      };

      //dataHistory.recordBatch = function (msg) {
      //    // calculate offset buy investor price
      //    // first find minimum non-investor sell order price
      //    var buyInvestorPrice = msg.msgData[1].reduce(function (previousValue, currentElement) {
      //       return currentElement.price > previousValue && currentElement.id != 0 ? currentElement.price : previousValue;
      //    }, msg.msgData[4]);
      //    //then add investor spacing
      //    buyInvestorPrice += this.investorOrderSpacing;

      //    for (var buyOrder of msg.msgData[0]) {
      //       if (buyOrder.transacted && buyOrder.id != 0) {
      //          var uid = buyOrder.id;
      //          if (uid == this.myId) this.profit += msg.msgData[4] - msg.msgData[3];
               
      //          //var curProfit = this.playerData[uid].curProfitSegment[1] - ((this.startTime + this.batchLength * msg.msgData[2] - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000);
      //          var curProfit = this.playerData[uid].curProfitSegment[1] - ((this.startTime + this.batchLength * msg.msgData[2] * 1000000 - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000000000);   //changed 4/17/17 to batchlength*1000000
      //          this.recordProfitSegment(curProfit + msg.msgData[4] - msg.msgData[3], this.startTime + this.batchLength * msg.msgData[2] * 1000000, this.playerData[uid].curProfitSegment[2], uid, this.playerData[uid].state);         //changed 4/17/17 to batchlength*1000000
      //       }

      //       // split orders up into my orders, others' orders and investor orders
      //       if (buyOrder.id == dataHistory.myId) {
      //          // if it's my order, record whether the profit from it was positive
      //          buyOrder.positive = msg.msgData[4] - msg.msgData[3] >= 0;
      //          this.myOrders.push(buyOrder);
      //       }
      //       else if (buyOrder.id == 0) {
      //          // if it's an investor order, change its price before pushing it on
      //          buyOrder.price = buyInvestorPrice;
      //          buyInvestorPrice += this.investorOrderSpacing;
      //          this.investorOrders.push(buyOrder);
      //       }
      //       else this.othersOrders.push(buyOrder);
      //    }

      //    // highest order in this batch is buy investor price minus investor spacing
      //    // check to see if new price is greater than current highest price
      //    if (buyInvestorPrice - this.investorOrderSpacing > this.highestMarketPrice) {
      //       this.highestMarketPrice = buyInvestorPrice - this.investorOrderSpacing;
      //    }

      //    // do the same calculation for sell investors
      //    var sellInvestorPrice = msg.msgData[0].reduce(function (previousValue, currentElement) {
      //       return currentElement.price < previousValue && currentElement.id != 0 ? currentElement.price : previousValue;
      //    }, msg.msgData[4]);
      //    sellInvestorPrice -= this.investorOrderSpacing;

      //    for (var sellOrder of msg.msgData[1]) {
      //       if (sellOrder.transacted && sellOrder.id != 0) {
      //          var uid = sellOrder.id;
      //          if (uid == this.myId) this.profit += msg.msgData[3] - msg.msgData[4];
               
      //          //var curProfit = this.playerData[uid].curProfitSegment[1] - ((this.startTime + this.batchLength * msg.msgData[2] - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000);
      //          var curProfit = this.playerData[uid].curProfitSegment[1] - ((this.startTime + this.batchLength * msg.msgData[2] * 1000000 - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000000000);  //changed 4/17/17 to batchlength*1000000
      //          this.recordProfitSegment(curProfit + msg.msgData[3] - msg.msgData[4], this.startTime + this.batchLength * msg.msgData[2] * 1000000, this.playerData[uid].curProfitSegment[2], uid, this.playerData[uid].state);                  //changed 4/17/17 to batchlength*1000000
      //       }

      //       if (sellOrder.id == dataHistory.myId) {
      //          sellOrder.positive = msg.msgData[3] - msg.msgData[4] >= 0;
      //          this.myOrders.push(sellOrder);
      //       }
      //       else if (sellOrder.id == 0) {
      //          sellOrder.price = sellInvestorPrice;
      //          sellInvestorPrice -= this.investorOrderSpacing;
      //          this.investorOrders.push(sellOrder);
      //       }
      //       else this.othersOrders.push(sellOrder);
      //    }

      //    if (sellInvestorPrice + this.investorOrderSpacing < this.lowestMarketPrice) this.lowestMarketPrice = sellInvestorPrice + this.investorOrderSpacing;

      //    // save equilibrium price
      //    this.priceHistory.push([msg.msgData[2], msg.msgData[3]]);

      //    // update display spread for all players
      //    for (var uid of this.group) {
      //       this.playerData[uid].displaySpread = this.playerData[uid].spread;
      //    }
      // };

      return dataHistory;
   };

   return api;
});
