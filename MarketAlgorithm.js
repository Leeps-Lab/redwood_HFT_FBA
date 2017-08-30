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
      marketAlgorithm.oldFundamentalPrice = 0;
      marketAlgorithm.currentMsgId = 0;
      marketAlgorithm.currentBuyId = 0;         
      marketAlgorithm.currentSellId = 0;        

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
      };

      // sends out remove buy and sell messages for exiting market
      marketAlgorithm.exitMarket = function () {
         if(this.buyEntered) {    
            this.sendToGroupManager(this.removeBuyOfferMsg());
         }
         if(this.sellEntered){
            this.sendToGroupManager(this.removeSellOfferMsg());
         }
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

            //Calculate if the new fundamental price is greater than the old price
            var positiveChange = (this.fundamentalPrice - this.oldFundamentalPrice) > 0 ? true : false;

            //send player state to group manager
            var nMsg3;
            if (this.state == "state_out") {
               nMsg3 = new Message("SYNC_FP", "NONE", [this.myId, this.using_speed, []]);
               nMsg3.timeStamp = msg.msgData[0]; // for debugging test output only
            }
            else if (this.state == "state_maker") {
               nMsg3 = new Message("SYNC_FP", "UOFFERS", [this.myId, this.using_speed, []]);
               nMsg3.timeStamp = msg.msgData[0]; // for debugging test output only

               //prevent maker from sniping themself
               if(positiveChange){                       //the price moved up -> update sell order before buy order
                  if (this.sellEntered) {
                     nMsg3.msgData[2].push(this.updateSellOfferMsg());
                  }
                  else{
                      nMsg3.msgData[2].push(this.enterSellOfferMsg());     //enter a new order in the event yours transacted during a jump
                  }
                  if (this.buyEntered) {
                     nMsg3.msgData[2].push(this.updateBuyOfferMsg());
                  }
                  else{
                      nMsg3.msgData[2].push(this.enterBuyOfferMsg());      //enter a new order in the event yours transacted during a jump
                  }
               }
               else{                                     //the price moved down -> update buy order before sell order
                  if (this.buyEntered) {
                     nMsg3.msgData[2].push(this.updateBuyOfferMsg());
                  }
                  else{
                      nMsg3.msgData[2].push(this.enterBuyOfferMsg());      //enter a new order in the event yours transacted during a jump
                  }
                  if (this.sellEntered) {
                     nMsg3.msgData[2].push(this.updateSellOfferMsg());
                  }
                  else{
                      nMsg3.msgData[2].push(this.enterSellOfferMsg());     //enter a new order in the event yours transacted during a jump
                  }
               }
               
            }
            else if (this.state == "state_snipe") {
               nMsg3 = new Message("SYNC_FP", "SNIPE", [this.myId, this.using_speed, []]);
               nMsg3.timeStamp = msg.msgData[0]; // for debugging test output only

               if(this.buyEntered) {    //remove stale snipe messages (no more IOC)
                  this.sendToGroupManager(this.removeBuyOfferMsg());
               }
               if(this.sellEntered){
                  this.sendToGroupManager(this.removeSellOfferMsg());
               }

               if(positiveChange){     //the new price is greater than the old price -> generate snipe buy message
                  snipeBuyMsg = new OuchMessage("EBUY", this.myId, this.fundamentalPrice, true);
                  snipeBuyMsg.delay = !this.using_speed;
                  snipeBuyMsg.msgId = this.currentMsgId;
                  this.currentBuyId = this.currentMsgId;
                  this.currentMsgId++;
                  this.buyEntered = true;
                  nMsg3.msgData[2].push(snipeBuyMsg);
               }
               else{                   //the new price is less than the old price -> generate snipe sell message
                  snipeSellMsg = new OuchMessage("ESELL", this.myId, this.fundamentalPrice, true);
                  snipeSellMsg.delay = !this.using_speed;
                  snipeSellMsg.msgId = this.currentMsgId;
                  this.currentSellId = this.currentMsgId;
                  this.currentMsgId++;
                  this.sellEntered = true;
                  nMsg3.msgData[2].push(snipeSellMsg);
               }
            }
            
            else {
               console.error("invalid state");
               return;
            }

            this.sendToGroupManager(nMsg3);

            //Set the old fundamental price to the current fundamental price for checking +/- change
            this.oldFundamentalPrice = this.fundamentalPrice;

            // send message to data history recording price change
            var nmsg = new Message("DATA", "FPC", msg.msgData);
            this.sendToDataHistory(nmsg);
         }

         // user sent signal to change state to market maker. Need to enter market.
         if (msg.msgType === "UMAKER") {
            this.enterMarket();                 // enter market
            this.state = "state_maker";         // set state
         }

         // user sent signal to change state to sniper
         if (msg.msgType === "USNIPE") {
            if (this.state === "state_maker") {   // if switching from being a maker, exit the market
               this.exitMarket();
            }
            this.state = "state_snipe";         // update state
         }  

         // user sent signal to change state to "out of market"
         if (msg.msgType === "UOUT") {
            this.exitMarket();                  //remove any orders (snipe or maker)
            this.state = "state_out";           // update state
         }

         if (msg.msgType === "USPEED") {
            this.using_speed = msg.msgData[1];
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
         }
         
         // the market sent the outcome of a batch
         if (msg.msgType == "BATCH") {
            msg.FPC = this.fundamentalPrice;          //save fpc for graphing purposes
            this.sendToDataHistory(msg);
         }

         // Confirmation that a buy offer has been placed in market
         if (msg.msgType == "C_EBUY") {
            if (msg.subjectID == this.myId) {   
               this.sendToAllDataHistories(msg);               //changed 7/3/17
            }
         }

         // Confirmation that a sell offer has been placed in market
         if (msg.msgType == "C_ESELL") {
            if (msg.subjectID == this.myId) { 
               this.sendToAllDataHistories(msg);               //changed 7/3/17
            }  
         }

         if(msg.msgType === "C_CANC"){
            // Confirmation that a buy offer has been removed from market
            if (msg.msgId === this.currentBuyId) {
               if (msg.subjectID == this.myId) {   
                  msg.msgType = "C_RBUY";                                          //Identify for Dhistory
                  // this.buyEntered = false;
                  this.sendToAllDataHistories(msg);
               }
            }

            // Confirmation that a sell offer has been removed from the market
            if (msg.msgId === this.currentSellId) {
               if (msg.subjectID == this.myId) { 
                  msg.msgType = "C_RSELL";
                  // this.sellEntered = false;
                  this.sendToAllDataHistories(msg);
               }
            }
         }

         // Confirmation that a buy offer has been updated
         if (msg.msgType == "C_UBUY") {
            if (msg.subjectID == this.myId) {
               this.sendToAllDataHistories(msg);           
            }
         }

         // Confirmation that a sell offer has been updated
         if (msg.msgType == "C_USELL") {
            if (msg.subjectID == this.myId) {
               this.sendToAllDataHistories(msg);            
            }
         }

         // Confirmation that a transaction has taken place
         if (msg.msgType == "C_TRA") {
            msg.FPC = this.fundamentalPrice;    //add FPC to message for graphing
            if (msg.buyerID === this.myId) {    
               this.buyEntered = false;         //added 7/18/17 for fixing OUT user input
            }
            if (msg.sellerID === this.myId) {
               this.sellEntered = false;        //added 7/18/17 for fixing OUT user input
            }
            if (this.state == "state_maker") {     //replenish filled orders if maker
               if(this.sellEntered == false){
                  this.sendToGroupManager(this.enterSellOfferMsg());
               }
               if(this.buyEntered == false){
                  this.sendToGroupManager(this.enterBuyOfferMsg());
               }
            }
            this.sendToDataHistory(msg,msg.subjectID);   
            this.groupManager.dataStore.storeMsg(msg);   
         }
      };

      marketAlgorithm.enterBuyOfferMsg = function () {
         var nMsg = new OuchMessage("EBUY", this.myId, this.fundamentalPrice - this.spread / 2, false);
         nMsg.delay = !this.using_speed;
         nMsg.senderId = this.myId;
         nMsg.msgId = this.currentMsgId;
         this.currentBuyId = this.currentMsgId;
         this.currentMsgId++;
         this.buyEntered = true;
         return nMsg;
      };

      marketAlgorithm.enterSellOfferMsg = function () {
         var nMsg = new OuchMessage("ESELL", this.myId, this.fundamentalPrice + this.spread / 2, false);
         nMsg.delay = !this.using_speed;
         nMsg.senderId = this.myId;
         nMsg.msgId = this.currentMsgId;
         this.currentSellId = this.currentMsgId;
         this.currentMsgId++;
         this.sellEntered = true;
         return nMsg;
      };

      marketAlgorithm.updateBuyOfferMsg = function () {
         var nMsg = new OuchMessage("UBUY", this.myId, this.fundamentalPrice - this.spread / 2, false);
         nMsg.delay = !this.using_speed;
         nMsg.senderId = this.myId;
         nMsg.msgId = this.currentMsgId;
         nMsg.prevMsgId = this.currentBuyId;
         this.currentBuyId = this.currentMsgId;
         this.currentMsgId++;
         this.buyEntered = true;
         return nMsg;
      };

      marketAlgorithm.updateSellOfferMsg = function () {
         var nMsg = new OuchMessage("USELL", this.myId, this.fundamentalPrice + this.spread / 2, false);
         nMsg.delay = !this.using_speed;
         nMsg.senderId = this.myId;
         nMsg.msgId = this.currentMsgId;
         nMsg.prevMsgId = this.currentSellId;
         this.currentSellId = this.currentMsgId;
         this.currentMsgId++;
         this.sellEntered = true;
         return nMsg;
      };

      marketAlgorithm.removeBuyOfferMsg = function() {
         var nMsg = new OuchMessage("RBUY", this.myId, null, null);
         nMsg.delay = !this.using_speed;
         nMsg.senderId = this.myId;
         nMsg.msgId = this.currentBuyId;
         this.buyEntered = false;
         return nMsg;
      }

      marketAlgorithm.removeSellOfferMsg = function() {
         var nMsg = new OuchMessage("RSELL", this.myId, null, null);
         nMsg.delay = !this.using_speed;
         nMsg.senderId = this.myId;
         nMsg.msgId = this.currentSellId;
         this.sellEntered = false;
         return nMsg;
      }

      return marketAlgorithm;
   };

   return api;
});
