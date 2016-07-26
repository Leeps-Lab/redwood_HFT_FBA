Redwood.factory("MarketAlgorithm", function () {
   var api = {};

   api.createMarketAlgorithm = function (subjectArgs, groupManager) {
      var marketAlgorithm = {};

      marketAlgorithm.spread = subjectArgs.maxSpread / 2;            // record of this user's spread value
      marketAlgorithm.using_speed = false;
      marketAlgorithm.state = "state_out";   // user's state - can be "state_out", "state_maker", or "state_snipe"
      marketAlgorithm.buyEntered = false;    // flags for if this user has buy/sell orders still in the book
      marketAlgorithm.sellEntered = false;

      marketAlgorithm.myId = subjectArgs.myId;
      marketAlgorithm.groupId = subjectArgs.groupId;
      marketAlgorithm.groupManager = groupManager;   //Sends message to group manager, function obtained as parameter
      marketAlgorithm.fundamentalPrice = 0;

      marketAlgorithm.isDebug = subjectArgs.isDebug;
      if (marketAlgorithm.isDebug) {
         //Create the logger for this start.js page
         marketAlgorithm.logger = new MessageLogger("Market Algorithm " + String(marketAlgorithm.myId), "#FF5555", "group-" + marketAlgorithm.groupId + "-log");
      }

      // sends a message to the group manager via direct reference
      marketAlgorithm.sendToGroupManager = function (msg) {
         this.groupManager.recvFromMarketAlgorithm(msg);
      };

      // sends a message to the dataHistory object for this subject via rs.send
      marketAlgorithm.sendToDataHistory = function (msg) {
         this.groupManager.sendToDataHistory(msg, this.myId);
      };

      // sends a message to all dataHistory objects
      marketAlgorithm.sendToAllDataHistories = function (msg) {
         this.groupManager.sendToAllDataHistories(msg);
      };

      // sends out buy and sell offer for entering market
      marketAlgorithm.enterMarket = function () {
         this.sendToGroupManager(this.enterBuyOfferMsg());
         this.sendToGroupManager(this.enterSellOfferMsg());
         this.buyEntered = true;
         this.sellEntered = true;
      };

      // sends out remove buy and sell messages for exiting market
      marketAlgorithm.exitMarket = function () {
         var nMsg = new Message("OUCH", "RBUY", [this.myId]);
         nMsg.delay = !this.using_speed;
         var nMsg2 = new Message("OUCH", "RSELL", [this.myId]);
         nMsg2.delay = !this.using_speed;
         this.sendToGroupManager(nMsg);
         this.sendToGroupManager(nMsg2);
         this.buyEntered = false;
         this.sellEntered = false;
      };

      // Handle message sent to the market algorithm
      marketAlgorithm.recvFromGroupManager = function (msg) {

         if (this.isDebug) {
            this.logger.logRecv(msg, "Group Manager");
         }

         // Fundamental Price Change
         if (msg.msgType === "FPC") {

            // update fundamental price variable
            this.fundamentalPrice = msg.msgData[1];

            //send player state to group manager
            var nMsg3;
            if (this.state == "state_out") {
               nMsg3 = new Message("SYNC_FP", "NONE", [this.myId, this.using_speed, []]);
               nMsg3.timeStamp = msg.msgData[0]; // for debugging test output only
            }
            else if (this.state == "state_maker") {
               nMsg3 = new Message("SYNC_FP", "UOFFERS", [this.myId, this.using_speed, []]);
               nMsg3.timeStamp = msg.msgData[0]; // for debugging test output only
               if (this.buyEntered) {
                  nMsg3.msgData[2].push(this.updateBuyOfferMsg());
               }
               if (this.sellEntered) {
                  nMsg3.msgData[2].push(this.updateSellOfferMsg());
               }
            }
            else if (this.state == "state_snipe") {
               nMsg3 = new Message("SYNC_FP", "SNIPE", [this.myId, this.using_speed, []]);
               nMsg3.timeStamp = msg.msgData[0]; // for debugging test output only
               snipeBuyMsg = new Message("OUCH", "EBUY", [this.myId, this.fundamentalPrice, true, Date.now()]);
               snipeBuyMsg.delay = !this.using_speed;
               snipeSellMsg = new Message("OUCH", "ESELL", [this.myId, this.fundamentalPrice, true, Date.now()]);
               snipeSellMsg.delay = !this.using_speed;
               nMsg3.msgData[2].push(snipeBuyMsg, snipeSellMsg);
            }
            else {
               console.error("invalid state");
               return;
            }

            this.sendToGroupManager(nMsg3);

            // send message to data history recording price change
            var nmsg = new Message("DATA", "FPC", msg.msgData);
            this.sendToDataHistory(nmsg);
         }

         // user sent signal to change state to market maker. Need to enter market.
         if (msg.msgType === "UMAKER") {
            this.enterMarket();                 // enter market
            this.state = "state_maker";         // set state

            var nMsg = new Message("DATA", "C_UMAKER", msg.msgData);
            this.sendToAllDataHistories(nMsg);
         }

         // user sent signal to change state to sniper
         if (msg.msgType === "USNIPE") {
            if (this.state === "state_maker") {   // if switching from being a maker, exit the market
               this.exitMarket();
            }
            this.state = "state_snipe";         // update state

            var nMsg = new Message("DATA", "C_USNIPE", msg.msgData);
            this.sendToAllDataHistories(nMsg);
         }

         // user sent signal to change state to "out of market"
         if (msg.msgType === "UOUT") {
            if (this.state === "state_maker") {   // if switching from being a maker, exit the market
               this.exitMarket();
            }
            this.state = "state_out";           // update state

            var nMsg = new Message("DATA", "C_UOUT", msg.msgData);
            this.sendToAllDataHistories(nMsg);
         }

         if (msg.msgType === "USPEED") {
            this.using_speed = msg.msgData[1];
            var nMsg = new Message("DATA", "C_USPEED", msg.msgData);
            this.sendToAllDataHistories(nMsg);
         }

         //User updated their spread
         if (msg.msgType === "UUSPR") {
            this.spread = msg.msgData[1];

            //See if there are existing orders that need to be updated
            if (this.buyEntered) {
               this.sendToGroupManager(this.updateBuyOfferMsg());
            }
            if (this.sellEntered) {
               this.sendToGroupManager(this.updateSellOfferMsg());
            }

            var nMsg = new Message("DATA", "C_UUSPR", msg.msgData);
            this.sendToAllDataHistories(nMsg);
         }

         // Confirmation that a buy offer has been placed in market
         if (msg.msgType == "C_EBUY") {
            if (msg.msgData[0] == this.myId) {
               var nMsg = new Message("DATA", "C_EBUY", msg.msgData);
               this.sendToAllDataHistories(nMsg);
            }
         }

         // Confirmation that a sell offer has been placed in market
         if (msg.msgType == "C_ESELL") {
            if (msg.msgData[0] == this.myId) {
               var nMsg = new Message("DATA", "C_ESELL", msg.msgData);
               this.sendToAllDataHistories(nMsg);
            }
         }

         // Confirmation that a buy offer has been removed from market
         if (msg.msgType == "C_RBUY") {
            if (msg.msgData[0] == this.myId) {
               var nMsg = new Message("DATA", "C_RBUY", msg.msgData);
               this.sendToAllDataHistories(nMsg);
            }
         }

         // Confirmation that a sell offer has been placed in market
         if (msg.msgType == "C_RSELL") {
            if (msg.msgData[0] == this.myId) {
               var nMsg = new Message("DATA", "C_RSELL", msg.msgData);
               this.sendToAllDataHistories(nMsg);
            }
         }

         // Confirmation that a buy offer has been updated
         if (msg.msgType == "C_UBUY") {
            if (msg.msgData[0] == this.myId) {
               var nMsg = new Message("DATA", "C_UBUY", msg.msgData);
               this.sendToAllDataHistories(nMsg);
            }
         }

         // Confirmation that a sell offer has been updated
         if (msg.msgType == "C_USELL") {
            if (msg.msgData[0] == this.myId) {
               var nMsg = new Message("DATA", "C_USELL", msg.msgData);
               this.sendToAllDataHistories(nMsg);
            }
         }

         // Confirmation that a transaction has taken place
         if (msg.msgType == "C_TRA") {
            //send data message to dataHistory containing [timestamp, price, fund-price, buyer, seller]
            //pick the buyer to send the message unless the buyer is an outside investor, then use the seller
            if (msg.msgData[2] === this.myId || (msg.msgData[1] === this.myId && msg.msgData[2] == 0)) {
               var nMsg = new Message("DATA", "C_TRA", [msg.msgData[0], msg.msgData[3], this.fundamentalPrice, msg.msgData[1], msg.msgData[2]]);
               this.sendToAllDataHistories(nMsg);
            }

            if (this.state == "state_maker") {
               if (msg.msgData[1] === this.myId) this.sendToGroupManager(this.enterBuyOfferMsg());
               if (msg.msgData[2] === this.myId) this.sendToGroupManager(this.enterSellOfferMsg());
            }
         }
      };

      marketAlgorithm.enterBuyOfferMsg = function () {
         var nMsg = new Message("OUCH", "EBUY", [this.myId, this.fundamentalPrice - this.spread / 2, false, Date.now()]);
         nMsg.delay = !this.using_speed;
         return nMsg;
      };

      marketAlgorithm.enterSellOfferMsg = function () {
         var nMsg = new Message("OUCH", "ESELL", [this.myId, this.fundamentalPrice + this.spread / 2, false, Date.now()]);
         nMsg.delay = !this.using_speed;
         return nMsg;
      };

      marketAlgorithm.updateBuyOfferMsg = function () {
         var nMsg = new Message("OUCH", "UBUY", [this.myId, this.fundamentalPrice - this.spread / 2, Date.now()]);
         nMsg.delay = !this.using_speed;
         return nMsg;
      };

      marketAlgorithm.updateSellOfferMsg = function () {
         var nMsg = new Message("OUCH", "USELL", [this.myId, this.fundamentalPrice + this.spread / 2, Date.now()]);
         nMsg.delay = !this.using_speed;
         return nMsg;
      };

      return marketAlgorithm;
   };

   return api;
});
