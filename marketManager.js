Redwood.factory("MarketManager", function () {
   var api = {};

   //Creates the market manager, pass var's that you need for creation in here.
   api.createMarketManager = function (sendFunction, groupNumber, groupManager, debugMode, batchLength) {
      var market = {};

      market.FBABook = {};
      market.FBABook.batchNumber = 1;
      
      market.timeoutID = null; //id of the timeout that calls sendBatch. for canceling the timeout on experiment finish
      market.groupManager = groupManager;
      market.batchLength = batchLength;

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
         //message.timestamp = Date.now();
         message.timestamp = getTime();

         if (this.debugMode) {
            this.logger.logRecv(message, "Group Manager");
         }

         // copy current market state to message for debug output (should it be message.buyOrderBefore?)
         var buyOrdersBefore = $.extend(true, [], this.FBABook.buyContracts);
         var sellOrdersBefore = $.extend(true, [], this.FBABook.sellContracts);

         // handle message based on type. Send reply once message has been handled
         switch (message.msgType) {

            // enter buy offer
            case "EBUY":
               //if message is a market order
               if (message.msgData[1] == 214748.3647) {
                  market.FBABook.insertBuy(message.msgData[0], 200000, message.timestamp, message.msgData[3], true);
               }
               //if order's price is out of bounds
               else if (message.msgData[1] > 199999.9900 || message.msgData[1] <= 0) {
                  console.error("marketManager: invalid buy price of " + message.msgData[1]);
                  break;
               }
               else {
                  market.FBABook.insertBuy(message.msgData[0], message.msgData[1], message.timestamp, message.msgData[3], message.msgData[2]);
               }
               break;

            // enter sell offer
            case "ESELL":
               if (message.msgData[1] == 214748.3647) {
                  market.FBABook.insertSell(message.msgData[0], 0, message.timestamp, message.msgData[3], true);
               }
               else if (message.msgData[1] > 199999.9900 || message.msgData[1] < 0) {
                  console.error("marketManager: invalid sell price of " + message.msgData[1]);
                  break;
               }
               else {
                  market.FBABook.insertSell(message.msgData[0], message.msgData[1], message.timestamp, message.msgData[3], message.msgData[2]);
               }
               break;

            // remove buy offer
            case "RBUY":
               market.FBABook.removeBuy(message.msgData[0]);
               //ADDED 4/28/17!!!
               var msg = new Message("ITCH", "C_CANC", [message.msgData[0], message.timestamp]);
               msg.timeStamp = message.timestamp; // for test output only
               msg.buyOrdersBeforeState = message.buyOrdersBeforeState;
               msg.msgId = message.msgId;
               this.sendToGroupManager(msg);
               break;

            // remove sell offer
            case "RSELL":
               market.FBABook.removeSell(message.msgData[0]);
               //ADDED 4/28/17!!!
               var msg = new Message("ITCH", "C_CANC", [message.msgData[0], message.timestamp]);
               msg.timeStamp = message.timestamp; // for test output only
               msg.sellOrdersBeforeState = message.sellOrdersBeforeState;
               msg.msgId = message.msgId;
               this.sendToGroupManager(msg);
               break;

            // update buy offer
            case "UBUY":
               market.FBABook.insertBuy(message.msgData[0], message.msgData[1], message.timestamp, message.msgData[3], message.msgData[2]);
               //ADDED 4/28/17!!!
               var msg = new Message("ITCH", "C_UBUY", [message.msgData[0], message.msgData[1], message.timestamp]);
               msg.timeStamp = message.timestamp; // for test output only
               msg.buyOrdersBeforeState = message.buyOrdersBeforeState;
               this.sendToGroupManager(msg);
               break;

            // update sell offer
            case "USELL":
               market.FBABook.insertSell(message.msgData[0], message.msgData[1], message.timestamp, message.msgData[3], message.msgData[2]);
               //ADDED 4/28/17!!!
               var msg = new Message("ITCH", "C_USELL", [message.msgData[0], message.msgData[1], message.timestamp]);
               msg.timeStamp = message.timestamp; // for test output only
               msg.sellOrdersBeforeState = message.sellOrdersBeforeState;
               this.sendToGroupManager(msg);
               break;

            // message not recognized
            default:
               console.error("marketManager: invalid message type: " + message.msgType);
         }

         if (message.msgType == "EBUY" || message.msgType == "UBUY" || message.msgType == "RBUY") this.groupManager.dataStore.storeBuyOrderState(message.timestamp, this.FBABook.buyContracts, buyOrdersBefore);
         else this.groupManager.dataStore.storeSellOrderState(message.timestamp, this.FBABook.sellContracts, sellOrdersBefore);
      };

      market.FBABook.buyContracts = [];

      market.FBABook.sellContracts = [];

      //inserts buy into buy orders data structure
      market.FBABook.insertBuy = function (newId, newPrice, timestamp, originTimestamp, ioc) {
         // if new order isn't from an investor, check to see if an order from this player is already in the book
         if (newId != 0) {
            var index = market.FBABook.buyContracts.findIndex(function (element) {
               return element.id == newId;
            });

            if (index != -1) {
               if (market.FBABook.buyContracts[index].originTimestamp > originTimestamp) {
                  // if the order already in the book is newer, return
                  console.log("stale buy order submitted");
                  return;
               }
               else {
                  // otherwise, remove the old order
                  market.FBABook.buyContracts.splice(index, 1);
               }
            }
         }

         // push the new order onto the list
         // order doesn't matter because list will be sorted when a batch happens
         var order = {id: newId,
            price: newPrice,
            timestamp: timestamp,
            originTimestamp: originTimestamp,
            ioc: ioc,
            transacted: false,
            batchNumber: this.batchNumber,
            originBatch: this.batchNumber
         };
         market.FBABook.buyContracts.push(order);
      };

      //inserts sell into sell orders data structure
      market.FBABook.insertSell = function (newId, newPrice, timestamp, originTimestamp, ioc) {
         // check to see if an order from this player is already in the book
         if (newId != 0) {
            var index = market.FBABook.sellContracts.findIndex(function (element) {
               return element.id == newId;
            });

            if (index != -1) {
               if (market.FBABook.sellContracts[index].originTimestamp > originTimestamp) {
                  // if the order already in the book is newer, return
                  console.log("stale sell order submitted");
                  return;
               }
               else {
                  // otherwise, remove the old order
                  market.FBABook.sellContracts.splice(index, 1);
               }
            }
         }

         // push the new order onto the list
         // order doesn't matter because list will be sorted when a batch happens
         var order = {
            id: newId,
            price: newPrice,
            timestamp: timestamp,
            originTimestamp: originTimestamp,
            ioc: ioc,
            transacted: false,
            batchNumber: this.batchNumber,
            originBatch: this.batchNumber
         };
         market.FBABook.sellContracts.push(order);
      };

      //removes buy order associated with a user id from the order book
      market.FBABook.removeBuy = function (idToRemove) {
         var index = market.FBABook.buyContracts.findIndex(function (element) {
            return element.id == idToRemove;
         });

         if (index != -1) {
            market.FBABook.buyContracts.splice(index, 1);
         }
         else {
            console.log("tried to remove nonexistent buy order");
         }
      };

      //removes sell order associated with a user id from the order book
      market.FBABook.removeSell = function (idToRemove) {
         var index = market.FBABook.sellContracts.findIndex(function (element) {
            return element.id == idToRemove;
         });

         if (index != -1) {
            market.FBABook.sellContracts.splice(index, 1);
         }
         else {
            console.log("tried to remove nonexistent sell order");
         }
      };

      market.FBABook.processBatch = function (batchTime) {
         // save initial market state for data logging purposes
         var buyOrdersBefore = $.extend(true, [], this.FBABook.buyContracts);
         var sellOrdersBefore = $.extend(true, [], this.FBABook.sellContracts);

         var equilibriumPrice = null;
         var numTransactions = 0;

         // if buy and sell orders aren't empty, then there might be some transactions
         if (this.FBABook.buyContracts.length > 0 && this.FBABook.sellContracts.length > 0) {
            // calculate max non-investor sell price and min non-investor buy price
            var minBuyPrice = this.FBABook.buyContracts.reduce(function (previousValue, currentElement) {
               return currentElement.id != 0 && currentElement.price < previousValue ? currentElement.price : previousValue;
            }, 200000);
            var maxSellPrice = this.FBABook.sellContracts.reduce(function (previousValue, currentElement) {
               return currentElement.id != 0 && currentElement.price > previousValue ? currentElement.price : previousValue;
            }, 0);

            // set all buy investor prices to same as max sell investor price
            for (let order of this.FBABook.buyContracts) {
               if (order.id == 0) order.price = maxSellPrice;
            }
            // set all sell investor prices to same as min buy investor
            for (let order of this.FBABook.sellContracts) {
               if (order.id == 0) order.price = minBuyPrice;
            }

            // combine and sort buy and sell orders to find clearing price
            var allOrders = this.FBABook.buyContracts.concat(this.FBABook.sellContracts);
            allOrders.sort(function (a, b) {
               return b.price - a.price;
            });

            // calculate equilibrium price
            equilibriumPrice = (allOrders[this.FBABook.sellContracts.length - 1].price + allOrders[this.FBABook.sellContracts.length].price) / 2;

            // store equilibrium price
            this.groupManager.dataStore.storeEqPrice(batchTime, equilibriumPrice);

            var equalBuyOrders = [];   // array of buy orders with price equal to the equilibrium price
            var equalSellOrders = [];  // array of sell orders with price equal to the equilibrium price

            // every buy order above equilibrium is transacted and every sell order below equilibrium is transacted
            // push orders with price at equilibrium onto equal lists
            for (let order of this.FBABook.buyContracts) {
               if (order.price > equilibriumPrice) {
                  order.transacted = true;
                  numTransactions++;
               }
               else if (order.price == equilibriumPrice) equalBuyOrders.push(order);
            }
            for (let order of this.FBABook.sellContracts) {
               if (order.price < equilibriumPrice) {
                  order.transacted = true;
                  numTransactions++;
               }
               else if(order.price == equilibriumPrice) equalSellOrders.push(order);
            }

            // 3 cases: equal numbers of buy and sell orders at equilibrium price, more buy orders at equilibrium price or more sell orders at equilibrium price
            if (equalBuyOrders.length == equalSellOrders.length) {
               // if equal, all orders are transacted
               for (let order of equalBuyOrders) {
                  order.transacted = true;
                  numTransactions++;
               }
               for (let order of equalSellOrders) {
                  order.transacted = true;
                  numTransactions++;
               }
            }
            else if(equalBuyOrders.length > equalSellOrders.length) {
               // if more buy orders, all sell orders are transacted
               for (let order of equalSellOrders) {
                  order.transacted = true;
                  numTransactions++;
               }

               // sort buy orders so that orders from an older batch have priority, and orders from the same batch have random priority
               equalBuyOrders.sort(function (a, b) {
                  if (a.originBatch == b.originBatch) return 0.5 - Math.random();
                  else {
                     return a.originBatch - b.originBatch;
                  }
               });

               // first n buy orders get transacted where n = number of equal price sell orders
               for (let index = 0; index < equalSellOrders.length; index++) {
                  equalBuyOrders[index].transacted = true;
                  numTransactions++;
               }
            }
            else {
               // if more sell orders, all buy orders are transacted
               for (let order of equalBuyOrders) {
                  order.transacted = true;
                  numTransactions++;
               }

               // sort sell orders so that orders from an older batch have priority, and orders from the same batch have random priority
               equalSellOrders.sort(function (a, b) {
                  if (a.originBatch == b.originBatch) return 0.5 - Math.random();
                  else {
                     return a.originBatch - b.originBatch;
                  }
               });

               for (let index = 0; index < equalBuyOrders.length; index++) {
                  equalSellOrders[index].transacted = true;
                  numTransactions++;
               }
            }
         }

         // if there are no transacted orders in the book, set the equilibrium price to null so it isn't drawn
         if (numTransactions === 0) equilibriumPrice = null;

         // record number of transactions
         this.groupManager.dataStore.storeNumTransactions(this.FBABook.batchNumber, numTransactions);

         // copy current market state into batch message
         var msg = new Message("ITCH", "BATCH", [$.extend(true, [], this.FBABook.buyContracts), $.extend(true, [], this.FBABook.sellContracts), this.FBABook.batchNumber, equilibriumPrice]);
         //console.log("flag1");
         //console.log(msg.asString());
         this.sendToGroupManager(msg);
         
         // move non-ioc and non-transacted order to next batch
         var newBuyContracts = [];
         for (let order of this.FBABook.buyContracts) {
            if (!order.ioc && !order.transacted) {
               order.batchNumber++;
               newBuyContracts.push(order);
            }
         }
         
         var newSellContracts = [];
         for (let order of this.FBABook.sellContracts) {
            if (!order.ioc && !order.transacted) {
               order.batchNumber++;
               newSellContracts.push(order);
            }
         }
         
         this.FBABook.buyContracts = newBuyContracts;
         this.FBABook.sellContracts = newSellContracts;
         
         this.FBABook.batchNumber++;

         this.groupManager.dataStore.storeBuyOrderState(batchTime, this.FBABook.buyContracts, buyOrdersBefore);
         this.groupManager.dataStore.storeSellOrderState(batchTime, this.FBABook.sellContracts, sellOrdersBefore);

         //this.timeoutID = window.setTimeout(market.FBABook.processBatch, batchTime + this.batchLength - Date.now(), batchTime + this.batchLength);
         //console.log((batchTime - getTime()) / 1000000 + this.batchLength);
         this.timeoutID = window.setTimeout(market.FBABook.processBatch, (batchTime - getTime()) / 1000000 + this.batchLength, batchTime + this.batchLength * 1000000);
      }.bind(market);

      // update functions are unused now, insert does both jobs

      //updates a buy order to a new price
      market.FBABook.updateBuy = function (idToUpdate, newPrice, timestamp) {
         if (market.FBABook.removeBuy(idToUpdate) === null) {
            return;
         }
         market.FBABook.insertBuy(idToUpdate, newPrice, timestamp);
      };

      //updates a sell order to a new price
      market.FBABook.updateSell = function (idToUpdate, newPrice, timestamp) {
         if (market.FBABook.removeSell(idToUpdate) === null) {
            return;
         }
         market.FBABook.insertSell(idToUpdate, newPrice, timestamp);
      };

      return market;
   };

   return api;

});
