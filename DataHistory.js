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

      dataHistory.playerData = {};     //holds state, offer and profit data for each player in the group
      dataHistory.lowestSpread = "N/A";

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
               console.log("batch in datah history");
               //console.log(msg);
               this.pushToBatches();
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

      // dataHistory.recordBatch = function (msg) {
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
      //    if (buyInvestorPrice - this.investorOrderSpacing > this.highestMarketPrice) this.highestMarketPrice = buyInvestorPrice - this.investorOrderSpacing;

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

      dataHistory.recordBatch = function (msg) {
         if(msg.msgData[0] === "B"){   //we only care about the start of a batch
            console.log(this.batchNumber);
            //calculate when the next batch occurs
            var nextTime = msg.msgData[1] + this.batchLength * 1000000;

            //calculate how long I have until the next batch
            var timeLeft = nextTime - getTime();

            //what to do with this??!?!?!?!?!!?
            this.batchNumber++;
         }
      }

      dataHistory.recordStateChange = function (newState, uid, timestamp) {
         this.playerData[uid].state = newState;
         this.calcLowestSpread();

         // var curProfit = this.playerData[uid].curProfitSegment[1] - ((timestamp - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000);        
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
         //console.log(Math.floor(timeElapsed / (this.batchLength * 1000000)));
         else{
            return Math.round(timeElapsed / (this.batchLength * 1000000));
         }
      };
      dataHistory.storeTransaction = function (msg) {    //[timestamp, price, fund-price, buyer, seller]
         var myTransaction = {};       
         var investorTransaction = {};
         var otherTransaction = {};        
         console.log(msg.msgData[2] - msg.msgData[1]);
         if (msg.msgData[3] == this.myId) {                                      //I'm the buyer
            this.profit += msg.msgData[2] - msg.msgData[1];                      //fundPrice - myPrice
            //ADDED 5/2/17 for graphing*************************************

            //push info on my transaction to graph
            myTransaction.positive = msg.msgData[2] - msg.msgData[1] >= 0;         //calculate +/- transaction
            myTransaction.price = msg.msgData[1];
            myTransaction.transacted = true;
            myTransaction.batchNumber = this.calcClosestBatch(msg.msgData[0],false);   
            this.myTransactions.push(myTransaction);

            //push info on the investor I transacted with to graph
            investorTransaction.price = msg.msgData[2] + this.investorOrderSpacing;    //investor has price of transaction + spacing
            investorTransaction.transacted = true;
            investorTransaction.batchNumber = myTransaction.batchNumber; 
            this.investorTransactions.push(investorTransaction);
         }

         else if (msg.msgData[4] == this.myId) {
            //if I'm the seller
            this.profit += msg.msgData[1] - msg.msgData[2];

            //ADDED 5/2/17 for graphing*************************************

            //push info on my transaction to graph
            myTransaction.positive = msg.msgData[1] - msg.msgData[2] >= 0;         //calculate +/- transaction
            myTransaction.price = msg.msgData[1];
            myTransaction.transacted = true;
            myTransaction.batchNumber = this.calcClosestBatch(msg.msgData[0],false); 
            this.myTransactions.push(myTransaction);

            //push info on the investor I transacted with to graph
            investorTransaction.price = msg.msgData[2] - this.investorOrderSpacing;    //investor has price of transaction + spacing
            investorTransaction.transacted = true;
            investorTransaction.batchNumber = myTransaction.batchNumber; 
            this.investorTransactions.push(investorTransaction);
         }
         else if(msg.msgData[3] != this.myId && msg.msgData[4] != this.myId){
            //someone else transacted, I need to push to otherTransactions
            //ADDED 5/2/17 for graphing*************************************

            //push info on other user's transaction to graph
            otherTransaction.price = msg.msgData[1];
            otherTransaction.transacted = true;
            otherTransaction.batchNumber = this.calcClosestBatch(msg.msgData[0],false); 
            this.otherTransactions.push(otherTransaction);

            //push info on the investor I transacted with to graph
            investorTransaction.price = msg.msgData[2] - this.investorOrderSpacing;    //investor has price of transaction + spacing
            investorTransaction.transacted = true;
            investorTransaction.batchNumber = otherTransaction.batchNumber; 
            this.investorTransactions.push(investorTransaction);
         }

         if (msg.msgData[3] != 0) {
            //checks if the player that receieved the buy transaction has a current buy offer
            if (this.playerData[msg.msgData[3]].curBuyOffer !== null) this.storeBuyOffer(msg.msgData[0], msg.msgData[3]);

            var uid = msg.msgData[3];
            var curProfit = this.playerData[uid].curProfitSegment[1] - ((msg.msgData[0] - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000000000); //changed from 1000
            this.recordProfitSegment(curProfit + msg.msgData[2] - msg.msgData[1], msg.msgData[0], this.playerData[uid].curProfitSegment[2], uid, this.playerData[uid].state);
         }
         //checks if the player that receieved the buy transaction has a current sell offer
         if (msg.msgData[4] != 0) {
            if (this.playerData[msg.msgData[4]].curSellOffer !== null) this.storeSellOffer(msg.msgData[0], msg.msgData[4]);

            var uid = msg.msgData[4];
            var curProfit = this.playerData[uid].curProfitSegment[1] - ((msg.msgData[0] - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000000000); //changed from 1000
            //console.log(curProfit);
            this.recordProfitSegment(curProfit + msg.msgData[1] - msg.msgData[2], msg.msgData[0], this.playerData[uid].curProfitSegment[2], uid, this.playerData[uid].state);
         }
         this.transactions.push(msg.msgData);
      };

      //records a new buy offer
      dataHistory.recordBuyOffer = function (buyMsg) { //[id,price,timestamp]
         //Store updated message to graph batch ticks
         // var thisUpdate = {};
         // var theirUpdate = {};
         // if(buyMsg.msgData[0] == this.myId){    //this was my message
         //    thisUpdate.batchNumber = this.calcClosestBatch(buyMsg.msgData[2],true);
         //    thisUpdate.price = buyMsg.msgData[1];
         //    this.myOrders.push(thisUpdate);
         // }
         // else{    //this was someone elses update msg
         //    theirUpdate.batchNumber = this.calcClosestBatch(buyMsg.msgData[2],true);
         //    theirUpdate.price = buyMsg.msgData[1];
         //    this.othersOrders.push(otherUpdate);
         // }
         

         if(this.playerData[buyMsg.msgData[0]].state == 'Snipe'){                                   //TEST -> don't want to graph snipe offer
            console.log("Tried to record buy offer, state: "  + this.playerData[buyMsg.msgData[0]].state);
            return;
         }
         //Check if current buy offer needs to be stored
         if (this.playerData[buyMsg.msgData[0]].curBuyOffer != null) {
            this.storeBuyOffer(buyMsg.msgData[2], buyMsg.msgData[0]);
            //console.log("Data being stored: " + buyMsg.msgData[2] + " : " + buyMsg.msgData[0]);
            //console.log("Local timestamp: " + getTime());
         }
         //Push on new buy offer
         this.playerData[buyMsg.msgData[0]].curBuyOffer = [buyMsg.msgData[2], buyMsg.msgData[1]];   // [timestamp, price]

         // check to see if new buy price is lowest price so far
         if (buyMsg.msgData[1] < this.lowestMarketPrice) this.lowestMarketPrice = buyMsg.msgData[1];

         //window.setTimeout(this.myOrders.push(myUpdate),this.batchLength*1000000);
         //window.setTimeout(this.othersOrders.push(otherUpdate),this.batchLength*1000000);
      };

      dataHistory.pushToBatches = function(){
         console.log("pushToBatches");
         this.myOrders.push(this.myUpdate);
         this.othersOrders.push(this.otherUpdate);

         for (let uid of this.playerData) {
            if (this.playerData.curBuyOffer != null) {
               let update = {
                  batchNumber: this.calcClosestBatch(this.playerData.curBuyOffer[0], false),
                  price: this.playerData.curBuyOffer[1]
               };
               if (uid == this.myId) {
                  this.myOrders.push(update);
               }
               else {
                  this.othersOrders.push(update);
               }
            }

            if (this.playerData.curSellOffer != null) {
               let update = {
                  batchNumber: this.calcClosestBatch(this.playerData.curSellOffer[0], false),
                  price: this.playerData.curSellOffer[1]
               };
               if (uid == this.myId) {
                  this.myOrders.push(update);
               }
               else {
                  this.othersOrders.push(update);
               }
            }

         }

      };

      // Records a new Sell offer
      dataHistory.recordSellOffer = function (sellMsg) {
         //Store updated message to graph batch ticks
         // var thisUpdate = {};
         // var theirUpdate = {};
         // if(sellMsg.msgData[0] == this.myId){    //this was my message
         //    thisUpdate.batchNumber = this.calcClosestBatch(sellMsg.msgData[2],true);
         //    thisUpdate.price = sellMsg.msgData[1];
         //    this.myOrders.push(thisUpdate);
         // }
         // else{ //this was someone else's update msg
         //    theirUpdate.batchNumber = this.calcClosestBatch(sellMsg.msgData[2],true);
         //    theirUpdate.price = sellMsg.msgData[1];
         //    this.othersOrders.push(theirUpdate);
         // }

         if(this.playerData[sellMsg.msgData[0]].state == 'Snipe'){                                 //TEST -> don't want to graph snipe offer
            console.log("Tried to record sell offer, state: "  + this.playerData[sellMsg.msgData[0]].state);
            return;
         }
         //Check if current sell offer needs to be stored
         if (this.playerData[sellMsg.msgData[0]].curSellOffer != null) {
            this.storeSellOffer(sellMsg.msgData[2], sellMsg.msgData[0]);
         }
         //Push on new sell offer
         this.playerData[sellMsg.msgData[0]].curSellOffer = [sellMsg.msgData[2], sellMsg.msgData[1]];   // [timestamp, price]

         // check to see if new sell price is highest price so far
         if (sellMsg.msgData[1] > this.highestMarketPrice) this.highestMarketPrice = sellMsg.msgData[1];

         //window.setTimeout(this.myOrders.push(myUpdate),this.batchLength*1000000);
         //window.setTimeout(this.othersOrders.push(otherUpdate),this.batchLength*1000000);
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

      dataHistory.storeSpeedChange = function (msg) {
         var uid = msg.msgData[0];
         this.playerData[uid].speed = msg.msgData[1];
         //var curProfit = this.playerData[uid].curProfitSegment[1] - ((msg.msgData[2] - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000);
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

      dataHistory.storeProfitSegment = function (endTime, uid) {
         if (this.playerData[uid].curProfitSegment == null) {
            throw "Cannot store current profit segment because it is null";
         }
         //find end price by subtracting how far graph has descended from start price
         //var endPrice = this.playerData[uid].curProfitSegment[1] - ((endTime - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000);
         var endPrice = this.playerData[uid].curProfitSegment[1] - ((endTime - this.playerData[uid].curProfitSegment[0]) * this.playerData[uid].curProfitSegment[2] / 1000000000);
         this.playerData[uid].pastProfitSegments.push([this.playerData[uid].curProfitSegment[0], endTime, this.playerData[uid].curProfitSegment[1], endPrice, this.playerData[uid].curProfitSegment[3]]);
         this.playerData[uid].curProfitSegment = null;
      };

      return dataHistory;
   };

   return api;
});
