Redwood.factory("MarketAlgorithm", function () {
   var api = {};

   api.createMarketAlgorithm = function (subjectArgs, groupManager) {
      var marketAlgorithm = {};

      marketAlgorithm.spread = subjectArgs.maxSpread / 2;            // record of this user's spread value
      marketAlgorithm.using_speed = false;
      marketAlgorithm.state = "state_out";   // user's state - can be "state_out", "state_maker", or "state_snipe"
      marketAlgorithm.buyEntered = false;    // flags for if this user has buy/sell orders still in the book
      marketAlgorithm.sellEntered = false;
      // marketAlgorithm.batchlength = groupManager.batchLength;
      // marketAlgorithm.windowDuration = groupManager.delay;
      marketAlgorithm.myId = subjectArgs.myId;
      marketAlgorithm.groupId = subjectArgs.groupId;
      marketAlgorithm.groupManager = groupManager;   //Sends message to group manager, function obtained as parameter
      marketAlgorithm.fundamentalPrice = 0;
      marketAlgorithm.oldFundamentalPrice = 0;
      marketAlgorithm.currentMsgId = 0;
      marketAlgorithm.currentBuyId = 0;         
      marketAlgorithm.currentSellId = 0; 
      marketAlgorithm.numTransactions = 0;   
      marketAlgorithm.previousState = null;    
      marketAlgorithm.snipeFPCArray = [];
      // marketAlgorithm.inSnipeWindow = false;

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
         if (this.buyEntered) {
               this.sendToGroupManager(this.updateBuyOfferMsg(false));
         }
         else{
            this.sendToGroupManager(this.enterBuyOfferMsg(false));
         }
         if (this.sellEntered) {
            this.sendToGroupManager(this.updateSellOfferMsg(false));
         }
         else{
            this.sendToGroupManager(this.enterSellOfferMsg(false));
         }
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

               if(this.previousState == "state_snipe"){    
                  this.previousState = null;    //clear for single use
                  this.exitMarket();            //remove non IOC snipe messages (changes buy/sellEntered flags to false)
               }

               //prevent maker from sniping themself
               if(positiveChange){                       //the price moved up -> update sell order before buy order
                  if (this.sellEntered) {
                     nMsg3.msgData[2].push(this.updateSellOfferMsg(false));
                  }
                  else{
                      nMsg3.msgData[2].push(this.enterSellOfferMsg(false));     //enter a new order in the event yours transacted during a jump
                  }
                  if (this.buyEntered) {
                     nMsg3.msgData[2].push(this.updateBuyOfferMsg(false));
                  }
                  else{
                      nMsg3.msgData[2].push(this.enterBuyOfferMsg(false));      //enter a new order in the event yours transacted during a jump
                  }
               }
               else{                                     //the price moved down -> update buy order before sell order
                  if (this.buyEntered) {
                     nMsg3.msgData[2].push(this.updateBuyOfferMsg(false));
                  }
                  else{
                      nMsg3.msgData[2].push(this.enterBuyOfferMsg(false));      //enter a new order in the event yours transacted during a jump
                  }
                  if (this.sellEntered) {
                     nMsg3.msgData[2].push(this.updateSellOfferMsg(false));
                  }
                  else{
                      nMsg3.msgData[2].push(this.enterSellOfferMsg(false));     //enter a new order in the event yours transacted during a jump
                  }
               }
               
            }
            else if (this.state == "state_snipe") {
               nMsg3 = new Message("SYNC_FP", "SNIPE", [this.myId, this.using_speed, []]);
               nMsg3.timeStamp = msg.msgData[0]; // for debugging test output only
               if(true){//groupManager.inSnipeWindow){                                               //only populate if in the sniping window
                  //console.log("jump inside snipe window", printTime(getTime()));
                  
                  if (this.buyEntered) {
                     this.sendToGroupManager(this.removeBuyOfferMsg());       //remove old SNIPE buy msg 
                  }
                  if (this.sellEntered) {
                     this.sendToGroupManager(this.removeSellOfferMsg());      //remove old SNIPE sell msg 
                  }
                  this.snipeFPCArray[currentMsgId] = this.fundamentalPrice;   //keep track of the snipers price for C_TRA msg

                  if(positiveChange){                                         //value jumped upward
                     nMsg3.msgData[2].push(this.enterBuyOfferMsg(true));      //enter new SNIPE buy msg
                  }
                  else{                                                       //value jumped downward
                     nMsg3.msgData[2].push(this.enterSellOfferMsg(true));     //enter new SNIPE sell msg
                  }
               }
               else{
                 // console.log("tried to snipe outside window", printTime(getTime()));
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
            this.previousState = this.state;    //save previous state
            this.state = "state_maker";         // set new state
         }

         // user sent signal to change state to sniper
         if (msg.msgType === "USNIPE") {
            if (this.state === "state_maker") {   // if switching from being a maker, exit the market
               this.exitMarket();
            }
            this.previousState = this.state;    //save previous state
            this.state = "state_snipe";         // update state
         }  

         // user sent signal to change state to "out of market"
         if (msg.msgType === "UOUT") {
            this.exitMarket();                  //remove any orders (snipe or maker)
            this.previousState = this.state;    //save previous state
            this.state = "state_out";           // update state
         }

         if (msg.msgType === "USPEED") {
            this.using_speed = msg.msgData[1];
         }  

         //User updated their spread
         if (msg.msgType === "UUSPR") {
            this.spread = msg.msgData[1];
            this.state = "state_maker";
         
         }
         
         // the market sent the outcome of a batch
         if (msg.msgType == "BATCH") {
            msg.FPC = this.fundamentalPrice;          //save fpc for graphing purposes
            if(msg.batchType == 'P'){                 //store num of transactions that occurred in the last batch
               msg.numTransactions = this.numTransactions;
               this.numTransactions = 0;              //clear global for next batch
            }
            else{                                     
               msg.numTransactions = null;            //dont push for start messages
               // console.log("batch start:", printTime(getTime()));
            }
            this.sendToAllDataHistories(msg); 
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
            if(this.state == "state_snipe"){
               msg.FPC = this.snipeFPCArray[msg.msgId];  //prevents snipers from profiting on a transacting on zero spread investor
            }
            else{
               msg.FPC = this.fundamentalPrice;          //add current FPC to message for graphing
            }
            if (msg.buyerID === this.myId) {    
               this.buyEntered = false;         //added 7/18/17 for fixing OUT user input
            }
            if (msg.sellerID === this.myId) {
               this.sellEntered = false;        //added 7/18/17 for fixing OUT user input
            }
            if (this.state == "state_maker") {     //replenish filled orders if maker
               if(this.sellEntered == false){
                  this.sendToGroupManager(this.enterSellOfferMsg(false));
               }
               if(this.buyEntered == false){
                  this.sendToGroupManager(this.enterBuyOfferMsg(false));
               }
            }
            this.numTransactions++;
            this.sendToDataHistory(msg,msg.subjectID);   
         }
      };

      marketAlgorithm.enterBuyOfferMsg = function (IOC) {
         if(IOC == null) IOC = false;
         var nMsg = new OuchMessage("EBUY", this.myId, this.fundamentalPrice - this.spread / 2, IOC);
         nMsg.delay = !this.using_speed;
         nMsg.senderId = this.myId;
         nMsg.msgId = this.currentMsgId;
         this.currentBuyId = this.currentMsgId;
         this.currentMsgId++;
         this.buyEntered = true;
         return nMsg;
      };

      marketAlgorithm.enterSellOfferMsg = function (IOC) {
         if(IOC == null) IOC = false;
         var nMsg = new OuchMessage("ESELL", this.myId, this.fundamentalPrice + this.spread / 2, IOC);
         nMsg.delay = !this.using_speed;
         nMsg.senderId = this.myId;
         nMsg.msgId = this.currentMsgId;
         this.currentSellId = this.currentMsgId;
         this.currentMsgId++;
         this.sellEntered = true;
         return nMsg;
      };

      marketAlgorithm.updateBuyOfferMsg = function (IOC) {
         if(IOC == null) IOC = false;
         var nMsg = new OuchMessage("UBUY", this.myId, this.fundamentalPrice - this.spread / 2, IOC);
         nMsg.delay = !this.using_speed;
         nMsg.senderId = this.myId;
         nMsg.msgId = this.currentMsgId;
         nMsg.prevMsgId = this.currentBuyId;
         this.currentBuyId = this.currentMsgId;
         this.currentMsgId++;
         this.buyEntered = true;
         return nMsg;
      };

      marketAlgorithm.updateSellOfferMsg = function (IOC) {
         if(IOC == null) IOC = false;
         var nMsg = new OuchMessage("USELL", this.myId, this.fundamentalPrice + this.spread / 2, IOC);
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
