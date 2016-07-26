Redwood.factory("MarketManager", function () {
   var api = {};

   //Creates the market manager, pass var's that you need for creation in here.
   api.createMarketManager = function (sendFunction, groupNumber, groupManager, debugMode) {
      var market = {};

      market.CLOCK_FREQUENCY = 100;

      market.CDABook = {};
      market.groupManager = groupManager;

      market.debugMode = debugMode;
      if (debugMode) {
         market.logger = new MessageLogger("Market " + String(groupNumber), "#55FF55", "group-" + groupNumber + "-log");
      }

      // captures the redwood admin send function
      market.rssend = function (key, value) {
         sendFunction(key, value, "admin", 1, groupNumber);
      };

      // abstracts send function so that there is single msg argument
      market.sendToGroupManager = function (message) {
         this.groupManager.recvFromMarket(message);
      };

      // handle message from subjects
      market.recvMessage = function (message) {
         message.timestamp = Date.now();
         
         // copy current market state to message for debug output
         message.buyOrdersBeforeState = $.extend(true, [], this.CDABook.buyContracts);
         message.sellOrdersBeforeState = $.extend(true, [], this.CDABook.sellContracts);

         if (this.debugMode) {
            this.logger.logRecv(message, "Group Manager");
         }

         // handle message based on type. Send reply once message has been handled
         switch (message.msgType) {

            // enter buy offer
            case "EBUY":
               //if message is a market order
               //call ioc buy with a limit greater than the max price
               if (message.msgData[1] == 214748.3647) {
                  market.CDABook.makeIOCBuy(message.msgData[0], 200000, message.timestamp, message.sellOrdersBeforeState);
               }
               //if order's price is out of bounds
               else if (message.msgData[1] > 199999.9900 || message.msgData[1] <= 0) {
                  console.error("marketManager: invalid buy price of " + message.msgData[1]);
                  break;
               }
               //otherwise order is a regular limit order
               else {
                  //if IOC, then call IOC insert function
                  if (message.msgData[2]) {
                     market.CDABook.makeIOCBuy(message.msgData[0], message.msgData[1], message.timestamp, message.sellOrdersBeforeState);
                  }
                  else {
                     // if insert was successful, send confirm message
                     if (market.CDABook.insertBuy(message.msgData[0], message.msgData[1], message.timestamp, message.msgData[3])) {
                        //only send C_EBUY message for regular limit order
                        var msg = new Message("ITCH", "C_EBUY", [message.msgData[0], message.msgData[1], message.timestamp]);
                        msg.timeStamp = message.timestamp; // for test output only
                        msg.buyOrdersBeforeState = message.buyOrdersBeforeState;
                        this.sendToGroupManager(msg);
                     }
                  }
               }
               break;

            // enter sell offer
            case "ESELL":
               if (message.msgData[1] == 214748.3647) {
                  market.CDABook.makeIOCSell(message.msgData[0], 0, message.timestamp, message.buyOrdersBeforeState);
               }
               else if (message.msgData[1] > 199999.9900 || message.msgData[1] <= 0) {
                  console.error("marketManager: invalid sell price of " + message.msgData[1]);
                  break;
               }
               else {
                  //if IOC, then call IOC insert function
                  if (message.msgData[2]) {
                     market.CDABook.makeIOCSell(message.msgData[0], message.msgData[1], message.timestamp, message.buyOrdersBeforeState);
                  }
                  else {
                     // insert returns true if order was actually inserted
                     if (market.CDABook.insertSell(message.msgData[0], message.msgData[1], message.timestamp, message.msgData[3])) {
                        //only send C_ESELL message for regular limit order
                        var msg = new Message("ITCH", "C_ESELL", [message.msgData[0], message.msgData[1], message.timestamp]);
                        msg.timeStamp = message.timestamp; // for test output only
                        msg.sellOrdersBeforeState = message.sellOrdersBeforeState;
                        this.sendToGroupManager(msg);
                     }
                  }
               }
               break;

            // remove buy offer
            case "RBUY":
               market.CDABook.removeBuy(message.msgData[0]);
               var msg = new Message("ITCH", "C_RBUY", [message.msgData[0], message.timestamp]);
               msg.timeStamp = message.timestamp; // for test output only
               msg.buyOrdersBeforeState = message.buyOrdersBeforeState;
               this.sendToGroupManager(msg);
               break;

            // remove sell offer
            case "RSELL":
               market.CDABook.removeSell(message.msgData[0]);
               var msg = new Message("ITCH", "C_RSELL", [message.msgData[0], message.timestamp]);
               msg.timeStamp = message.timestamp; // for test output only
               msg.sellOrdersBeforeState = message.sellOrdersBeforeState;
               this.sendToGroupManager(msg);
               break;

            // update buy offer
            case "UBUY":
               // insert function works as update now also
               if (market.CDABook.insertBuy(message.msgData[0], message.msgData[1], message.timestamp, message.msgData[2])) {
                  var msg = new Message("ITCH", "C_UBUY", [message.msgData[0], message.msgData[1], message.timestamp]);
                  msg.timeStamp = message.timestamp; // for test output only
                  msg.buyOrdersBeforeState = message.buyOrdersBeforeState;
                  this.sendToGroupManager(msg);
               }
               break;

            // update sell offer
            case "USELL":
               if (market.CDABook.insertSell(message.msgData[0], message.msgData[1], message.timestamp, message.msgData[2])) {
                  var msg = new Message("ITCH", "C_USELL", [message.msgData[0], message.msgData[1], message.timestamp]);
                  msg.timeStamp = message.timestamp; // for test output only
                  msg.sellOrdersBeforeState = message.sellOrdersBeforeState;
                  this.sendToGroupManager(msg);
               }
               break;

            // message not recognized
            default:
               console.error("marketManager: invalid message type: " + message.msgType);
         }
      };

      //buyPrices is array of prices that current buys have
      //buyContracts is array of actual order objects
      market.CDABook.buyPrices = [];
      market.CDABook.buyContracts = [];

      market.CDABook.sellPrices = [];
      market.CDABook.sellContracts = [];

      //inserts buy into buy orders data structure
      market.CDABook.insertBuy = function (newId, newPrice, timestamp, originTimestamp) {
         // search the whole book to see if this player already has a newer offer inserted
         var rindex = 0;
         var cindex = -1;
         while (rindex < market.CDABook.buyContracts.length) {
            cindex = market.CDABook.buyContracts[rindex].findIndex(function (element) {
               return element.id == newId;
            });
            if (cindex != -1) break;
            rindex++;
         }
         // if another order from this person was found
         if (cindex != -1) {
            if (market.CDABook.buyContracts[rindex][cindex].originTimestamp > originTimestamp) {
               // if that order is newer than the new one, don't insert the new one
               console.log("tried to insert an older buy order");
               return false;
            }
            else {
               // otherwise, get rid of the old one
               if (market.CDABook.buyContracts[rindex].length == 1) {
                  toReturn = market.CDABook.buyContracts.splice(rindex, 1)[0];
                  market.CDABook.buyPrices.splice(rindex, 1);
               }
               else {
                  toReturn = market.CDABook.buyContracts[rindex].splice(cindex, 1);
               }
            }
         }

         // insert the new order
         rindex = 0;
         while (rindex < market.CDABook.buyPrices.length && market.CDABook.buyPrices[rindex] < newPrice) rindex++;
         if (rindex == market.CDABook.buyPrices.length || market.CDABook.buyPrices[rindex] != newPrice) {
            market.CDABook.buyPrices.splice(rindex, 0, newPrice);
            market.CDABook.buyContracts.splice(rindex, 0, []);
         }
         cindex = 0;
         while (cindex < market.CDABook.buyContracts[rindex].length && market.CDABook.buyContracts[rindex][cindex].timestamp > timestamp) cindex++;
         market.CDABook.buyContracts[rindex].splice(cindex, 0, {
            price: newPrice,
            id: newId,
            timestamp: timestamp,
            originTimestamp: originTimestamp
         });
         return true;
      };

      //inserts sell into sell orders data structure
      market.CDABook.insertSell = function (newId, newPrice, timestamp, originTimestamp) {
         // search the whole book to see if this player already has a newer offer inserted
         var rindex = 0;
         var cindex = -1;
         while (rindex < market.CDABook.sellContracts.length) {
            cindex = market.CDABook.sellContracts[rindex].findIndex(function (element) {
               return element.id == newId;
            });
            if (cindex != -1) break;
            rindex++;
         }
         // if another order from this person was found
         if (cindex != -1) {
            if (market.CDABook.sellContracts[rindex][cindex].originTimestamp > originTimestamp) {
               // if that order is newer than the new one, don't insert the new one
               console.log("tried to insert an older sell order");
               return false;
            }
            else {
               // otherwise, get rid of the old one
               if (market.CDABook.sellContracts[rindex].length == 1) {
                  toReturn = market.CDABook.sellContracts.splice(rindex, 1)[0];
                  market.CDABook.sellPrices.splice(rindex, 1);
               }
               else {
                  toReturn = market.CDABook.sellContracts[rindex].splice(cindex, 1);
               }
            }
         }

         // insert the new order
         rindex = 0;
         while (rindex < market.CDABook.sellPrices.length && market.CDABook.sellPrices[rindex] > newPrice) rindex++;
         if (rindex == market.CDABook.sellPrices.length || market.CDABook.sellPrices[rindex] != newPrice) {
            market.CDABook.sellPrices.splice(rindex, 0, newPrice);
            market.CDABook.sellContracts.splice(rindex, 0, []);
         }
         cindex = 0;
         while (cindex < market.CDABook.sellContracts[rindex].length && market.CDABook.sellContracts[rindex][cindex].timestamp > timestamp) cindex++;
         market.CDABook.sellContracts[rindex].splice(cindex, 0, {
            price: newPrice,
            id: newId,
            timestamp: timestamp,
            originTimestamp: originTimestamp
         });
         return true;
      };

      //transacts an IOC order
      market.CDABook.makeIOCBuy = function (buyerId, price, timestamp, sellStateBefore) {
         if (market.CDABook.sellContracts.length === 0) return;
         if (market.CDABook.sellPrices[market.CDABook.sellPrices.length - 1] < price) {
            var order = market.CDABook.sellContracts[market.CDABook.sellContracts.length - 1].pop();
            if (market.CDABook.sellContracts[market.CDABook.sellContracts.length - 1].length === 0) {
               market.CDABook.sellContracts.pop();
               market.CDABook.sellPrices.pop();
            }
            var msg = new Message("ITCH", "C_TRA", [timestamp, buyerId, order.id, order.price]);
            msg.sellOrdersBeforeState = sellStateBefore;
            market.sendToGroupManager(msg);
         }
      };

      market.CDABook.makeIOCSell = function (sellerId, price, timestamp, buyStateBefore) {
         if (market.CDABook.buyContracts.length === 0) return;
         if (market.CDABook.buyPrices[market.CDABook.buyPrices.length - 1] > price) {
            var order = market.CDABook.buyContracts[market.CDABook.buyContracts.length - 1].pop();
            if (market.CDABook.buyContracts[market.CDABook.buyContracts.length - 1].length === 0) {
               market.CDABook.buyContracts.pop();
               market.CDABook.buyPrices.pop();
            }
            var msg = new Message("ITCH", "C_TRA", [timestamp, order.id, sellerId, order.price]);
            msg.buyOrdersBeforeState = buyStateBefore;
            market.sendToGroupManager(msg);
         }
      };

      //removes buy order associated with a user id from the order book and returns it
      market.CDABook.removeBuy = function (idToRemove) {
         var rindex = 0;
         var cindex = -1;
         while (rindex < market.CDABook.buyContracts.length) {
            cindex = market.CDABook.buyContracts[rindex].findIndex(function (element) {
               return element.id == idToRemove;
            });
            if (cindex != -1) break;
            rindex++;
         }
         if (cindex == -1) {
            return null;
         }
         var toReturn;
         if (market.CDABook.buyContracts[rindex].length == 1) {
            toReturn = market.CDABook.buyContracts.splice(rindex, 1)[0];
            market.CDABook.buyPrices.splice(rindex, 1);
         }
         else {
            toReturn = market.CDABook.buyContracts[rindex].splice(cindex, 1);
         }
         return toReturn;
      };

      //removes sell order associated with a user id from the order book and returns it
      market.CDABook.removeSell = function (idToRemove) {
         var rindex = 0;
         var cindex = -1;
         while (rindex < market.CDABook.sellContracts.length) {
            cindex = market.CDABook.sellContracts[rindex].findIndex(function (element) {
               return element.id == idToRemove;
            });
            if (cindex != -1) break;
            rindex++;
         }
         if (cindex == -1) {
            return null;
         }
         var toReturn;
         if (market.CDABook.sellContracts[rindex].length == 1) {
            toReturn = market.CDABook.sellContracts.splice(rindex, 1)[0];
            market.CDABook.sellPrices.splice(rindex, 1);
         }
         else {
            toReturn = market.CDABook.sellContracts[rindex].splice(cindex, 1);
         }
         return toReturn;
      };

      // update functions are unused now, insert does both jobs

      //updates a buy order to a new price
      market.CDABook.updateBuy = function (idToUpdate, newPrice, timestamp) {
         if (market.CDABook.removeBuy(idToUpdate) === null) {
            return;
         }
         market.CDABook.insertBuy(idToUpdate, newPrice, timestamp);
      };

      //updates a sell order to a new price
      market.CDABook.updateSell = function (idToUpdate, newPrice, timestamp) {
         if (market.CDABook.removeSell(idToUpdate) === null) {
            return;
         }
         market.CDABook.insertSell(idToUpdate, newPrice, timestamp);
      };

      return market;
   };

   return api;

});
