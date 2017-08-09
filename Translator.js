// These functions are used to convert messages between the in-house leeps message format and
// OUCH 4.2 format or ITCH 4.1 format

// see "utility.js" for reference on the in-house leeps format

// see https://nasdaqtrader.com/content/technicalsupport/specifications/TradingProducts/OUCH4.2.pdf
// for referance on the OUTCH 4.2 format

// see http://www.nasdaqtrader.com/content/technicalsupport/specifications/dataproducts/nqtv-itch-v4_1.pdf
// for referance on the OUTCH 4.1 format


var ouchMsgSizes = {'A' : 66, 'U' : 80, 'C' : 28, 'E' : 40};

// splits a string that can contain multiple messages into an array of messages
function splitMessages(messageStr){
  
  var i = 0;
  var msgArray = [];

  // keep looping until reach end of conjoined message
  while(i < messageStr.length){

    // check the type of this message and find its size
    var msgSize = ouchMsgSizes[messageStr[i]];
    msgArray.push(messageStr.substring(i, i + msgSize));
    i += msgSize;
  }
  return msgArray;
}



// converts from the in-house leeps message format to an OUCH 4.2 formatted message
function leepsMsgToOuch(leepsMsg){
   
   // Convert an enter order message
   if(leepsMsg.msgType === "EBUY" || leepsMsg.msgType === "ESELL"){
      var ouchMsg = new Uint8Array(49);
      
      // Type
      ouchMsg[0] = charToByte('O');

      // Order Token
      ouchMsg[1] = charToByte('S');
      ouchMsg[2] = charToByte('U');      
      ouchMsg[3] = charToByte('B');
      //ouchMsg[4] = charToByte(String.fromCharCode(64 + leepsMsg.msgData[0]));
      ouchMsg[4] = charToByte(String.fromCharCode(64 + leepsMsg.subjectID));
      // Buy/Sell indicator within order id
      if(leepsMsg.msgType === "EBUY"){
         ouchMsg[5] = charToByte('B');
      }
      else if(leepsMsg.msgType === "ESELL"){
         ouchMsg[5] = charToByte('S');
      }
      //console.log("Order ID: (Before):" + leepsMsg.msgId);
      //console.log(leepsMsg);
      //console.log("Order ID: (After ):" + decimalToByteArray(leepsMsg.msgId, 9));
      spliceInArray(decimalToByteArray(leepsMsg.msgId, 9), ouchMsg, 9, 6);

      // Buy/Sell indicator
      if(leepsMsg.msgType === "EBUY"){
         ouchMsg[15] = charToByte('B');
      }
      else if(leepsMsg.msgType === "ESELL"){
         ouchMsg[15] = charToByte('S');
      }
      
      // Shares
      spliceInArray(intToByteArray(1), ouchMsg, 4, 16);

      // Stock Symbol - these two numbers together make "LPS     " when cast from bytes to characters
      spliceInArray(intToByteArray(1280332576), ouchMsg, 4, 20);
      spliceInArray(intToByteArray(538976288), ouchMsg, 4, 24);

      // Price
      //spliceInArray(priceToByteArray(leepsMsg.msgData[1]), ouchMsg, 4, 28);
      spliceInArray(priceToByteArray(leepsMsg.price), ouchMsg, 4, 28);

      // Time in Force
      //if(leepsMsg.msgData[2] === true){
      if(leepsMsg.IOC === true){
        if(ouchMsg[4] != charToByte(String.fromCharCode(64))){   //if youre not an investor
          spliceInArray(intToByteArray(1), ouchMsg, 4, 32);      //changed 5/24 to test sniping (time of force of 1)
        }
        else{
          spliceInArray(intToByteArray(3), ouchMsg, 4, 32);       //investors have TOF of 3 seconds
        }
      }
      else{    
          spliceInArray(intToByteArray(99999), ouchMsg, 4, 32);   //users have TOF of infinity
      }

      // Firm
      //spliceInArray(intToByteArray(leepsMsg.senderId), ouchMsg, 4, 36);
      ouchMsg[36] = charToByte('S');
      ouchMsg[37] = charToByte('U');      
      ouchMsg[38] = charToByte('B');
      //ouchMsg[39] = charToByte(String.fromCharCode(64 + leepsMsg.msgData[0]));
      ouchMsg[39] = charToByte(String.fromCharCode(64 + leepsMsg.subjectID));

      // Display
      ouchMsg[40] = charToByte('Y');

      // Capacity
      ouchMsg[41] = charToByte('P');

      // Intermarket Sweep Eligibility
      ouchMsg[42] = charToByte('N');

      // Minimum quantity
      spliceInArray(intToByteArray(0), ouchMsg, 4, 43);

      // Cross Type
      ouchMsg[47] = charToByte('N');

      // Customer Type
      ouchMsg[48] = charToByte('R');

      //console.log(leepsMsg.msgType + ": " + printOuchMsg(ouchMsg));
      return ouchMsg;
   }
   else if(leepsMsg.msgType === "RBUY" || leepsMsg.msgType === "RSELL")
   {
      var ouchMsg = new Uint8Array(19);
      
      // Type
      ouchMsg[0] = charToByte('X');

      // Order Token
      ouchMsg[1] = charToByte('S');
      ouchMsg[2] = charToByte('U');      
      ouchMsg[3] = charToByte('B');
      //ouchMsg[4] = charToByte(String.fromCharCode(64 + leepsMsg.msgData[0]));
      ouchMsg[4] = charToByte(String.fromCharCode(64 + leepsMsg.subjectID));
      // Buy/Sell indicator within order id
      if(leepsMsg.msgType === "RBUY"){
         ouchMsg[5] = charToByte('B');
      }
      else if(leepsMsg.msgType === "RSELL"){
         ouchMsg[5] = charToByte('S');
      }
      //console.log("Order ID: " + decimalToByteArray(leepsMsg.msgId, 9));
      spliceInArray(decimalToByteArray(leepsMsg.msgId, 9), ouchMsg, 9, 6);

      // Shares
      spliceInArray(intToByteArray(0), ouchMsg, 4, 15);

      return ouchMsg;
   }
   else if(leepsMsg.msgType === "UBUY" || leepsMsg.msgType === "USELL")
   {
      var ouchMsg = new Uint8Array(47);

      // Type
      ouchMsg[0] = charToByte('U');

      // Existing Order Token
      ouchMsg[1] = charToByte('S');
      ouchMsg[2] = charToByte('U');      
      ouchMsg[3] = charToByte('B');
      //ouchMsg[4] = charToByte(String.fromCharCode(64 + leepsMsg.msgData[0]));
      ouchMsg[4] = charToByte(String.fromCharCode(64 + leepsMsg.subjectID));
      // Buy/Sell indicator within order id
      if(leepsMsg.msgType === "UBUY"){
         ouchMsg[5] = charToByte('B');
      }
      else if(leepsMsg.msgType === "USELL"){
         ouchMsg[5] = charToByte('S');
      }
      //console.log("Order ID: " + decimalToByteArray(leepsMsg.prevMsgId, 9));
      spliceInArray(decimalToByteArray(leepsMsg.prevMsgId, 9), ouchMsg, 9, 6);

      // Replacement Order Token
      ouchMsg[15] = charToByte('S');
      ouchMsg[16] = charToByte('U');      
      ouchMsg[17] = charToByte('B');
      //ouchMsg[18] = charToByte(String.fromCharCode(64 + leepsMsg.msgData[0]));
      ouchMsg[18] = charToByte(String.fromCharCode(64 + leepsMsg.subjectID));
      // Buy/Sell indicator within order id
      if(leepsMsg.msgType === "UBUY"){
         ouchMsg[19] = charToByte('B');
      }
      else if(leepsMsg.msgType === "USELL"){
         ouchMsg[19] = charToByte('S');
      }
      //console.log("Order ID: " + decimalToByteArray(leepsMsg.msgId, 9));
      spliceInArray(decimalToByteArray(leepsMsg.msgId, 9), ouchMsg, 9, 20);

      // Shares
      spliceInArray(intToByteArray(1), ouchMsg, 4, 29);

      // Price
      //spliceInArray(priceToByteArray(leepsMsg.msgData[1]), ouchMsg, 4, 33);
      spliceInArray(priceToByteArray(leepsMsg.price), ouchMsg, 4, 33);

      // Time in Force
      //if(leepsMsg.msgData[2] === true){
      if(leepsMsg.IOC === true){  
         spliceInArray(intToByteArray(1), ouchMsg, 4, 37);    //7/18/17 changed from 0 to 1 for sniping purposes
      }
      else{
         spliceInArray(intToByteArray(99999), ouchMsg, 4, 37);
      }

      // Display
      ouchMsg[41] = charToByte('Y');

      // Intermarket Sweep Eligibility
      ouchMsg[42] = charToByte('N');

      // Minimum quantity
      spliceInArray(intToByteArray(1), ouchMsg, 4, 43);

      return ouchMsg;
   }
}





// converts from the OUCH 4.2 formatted message to the in-house leeps message format
function ouchToLeepsMsg(ouchMsg){
  // Acctepted message
  if(ouchMsg.charAt(0) === 'A'){

    // pull out timestamp
    var timeStamp = string256ToInt(ouchMsg.substring(1, 9));

    // pull out message id
    var msgId = string10ToInt(ouchMsg.substring(14, 23));

    // pull out Buy/Sell Indicator and convert to leeps format
    var lpsMsgType;
    if(ouchMsg.charAt(23) === "B"){
      lpsMsgType = "C_EBUY";
    }
    else if(ouchMsg.charAt(23) === "S"){
      lpsMsgType = "C_ESELL";
    }
    else{
      console.log(ouchMsg);
      console.error("Could not recognize Buy/Sell Indicator: " + ouchMsg.charAt(23));
    }

    // pull out number of shares
    var numShares = string256ToInt(ouchMsg.substring(24, 28));
    
    // pull out the price
    var price = string256ToPrice(ouchMsg.substring(36, 40));
    
    // pull out the time in force
    var timeInForce = string256ToInt(ouchMsg.substring(40, 44));
    
    // pull out subject id from firm
    var subjId = ouchMsg.charCodeAt(47) - 64;
    // create leeps message
    //var msg = new Message("OUCH", lpsMsgType, [subjId, price, timeStamp]);
    var msg = new ItchMessage(lpsMsgType, subjId, price, timeStamp, null, null, null);
    msg.timeStamp = timeStamp; // for test output only
    msg.msgId = msgId;
    msg.numShares = numShares;
    return msg;
  }

  // Canceled message
  if(ouchMsg.charAt(0) === 'C'){

    // pull out timestamp
    var timeStamp = string256ToInt(ouchMsg.substring(1, 9));

    // pull out subject id from order token
    var subjId = ouchMsg.charCodeAt(12) - 64;

    // pull out message id
    var msgId = string10ToInt(ouchMsg.substring(14, 23));

    // pull out number of shares canceled
    var numCanceled = string256ToInt(ouchMsg.substring(23, 27));

    //var msg = new Message("OUCH", "C_CANC", [subjId, timeStamp]);
    var msg = new ItchMessage("C_CANC", subjId, null, timeStamp, null, null);
    msg.timeStamp = timeStamp; // for test output only
    msg.msgId = msgId;
    msg.numShares = numCanceled;
    return msg;
  }

  // Replaced message
  if(ouchMsg.charAt(0) === 'U'){

    // pull out timestamp
    var timeStamp = string256ToInt(ouchMsg.substring(1, 9));

    // pull out message id
    var msgId = string10ToInt(ouchMsg.substring(14, 23));

    // pull out Buy/Sell Indicator and convert to leeps format
    var lpsMsgType;
    if(ouchMsg.charAt(23) === "B"){
      lpsMsgType = "C_UBUY";
    }
    else if(ouchMsg.charAt(23) === "S"){
      lpsMsgType = "C_USELL";
    }
    else{
      console.error("Could not recognize Buy/Sell Indicator: " + ouchMsg.charAt(23));
    }

    // pull out number of shares
    var numShares = string256ToInt(ouchMsg.substring(24, 28));
    
    // pull out the price
    var price = string256ToPrice(ouchMsg.substring(36, 40));
    
    // pull out the time in force
    var timeInForce = string256ToInt(ouchMsg.substring(40, 44));
    
    // pull out subject id from firm
    var subjId = ouchMsg.charCodeAt(47) - 64;

    // pull out the previous message id
    var prevMsgId = string10ToInt(ouchMsg.substring(69, 79));

    // create leeps message
    //var msg = new Message("OUCH", lpsMsgType, [subjId, price, timeStamp]);
    var msg = new ItchMessage(lpsMsgType, subjId, price, timeStamp, null, null);
    msg.timeStamp = timeStamp; // for test output only
    msg.msgId = msgId;
    msg.prevMsgId = prevMsgId;
    msg.numShares = numShares;
    return msg;
  }

  // Executed message
  if(ouchMsg.charAt(0) === 'E'){

    // pull out timestamp
    var timeStamp = string256ToInt(ouchMsg.substring(1, 9));

    // pull out subject id from order id
    var subjId = ouchMsg.charCodeAt(12) - 64;

    // should either be B or S indicating which side of the transaction this executed msg represents
    var transactionType = ouchMsg.charAt(13);

    // pull out message id
    var msgId = string10ToInt(ouchMsg.substring(14, 23));

    // pull out number of executed shares
    var numShares = string256ToInt(ouchMsg.substring(23, 27));

    // pull out the price
    var price = string256ToPrice(ouchMsg.substring(27, 31));

    // create leeps message
    if(transactionType === "B"){
      //var msg = new Message("OUCH", "C_TRA", [timeStamp, subjId, 0, price]);
      var msg = new ItchMessage("C_TRA", subjId, price, timeStamp, subjId, 0);
    }
    else if(transactionType === "S"){
      //var msg = new Message("OUCH", "C_TRA", [timeStamp, 0, subjId, price]);
      var msg = new ItchMessage("C_TRA", subjId, price, timeStamp, 0, subjId);
    }
    else{
      console.error("Unable to recognize type of tranaction: " + transactionType);
    }
    msg.msgId = msgId;

    //console.log(msg);
    return msg;
  }

  if(ouchMsg.charAt(0) === 'S'){
    var batchType = ouchMsg.charAt(9);  //B for start of batch, P for end of batch
    var timeStamp = string256ToInt(ouchMsg.substring(1,9));  
    //var msg = new Message("ITCH", "BATCH", [batchType, timeStamp]);
    var msg = new ItchMessage("BATCH", null, null, timeStamp, null, null);
    msg.batchType = batchType;
    //if B -> make isBatch true (6/30/17)
    return msg;
  }


  // else{
  //     console.log("Not a supported msg format");
  // }

}



// converts from the in-house leeps message format to an ITCH 4.1 formatted message
function leepsMsgToItch(leepsMsg){

}


// converts from the ITCH 4.1 formatted message to the in-house leeps message format
function itchToLeepsMsg(itchMsg){

}



// converts an int to an array of four bytes
function intToByteArray(num){
   var bytes = new Uint8Array(4);
   
   bytes[3] = num & (255);
   num = num >> 8
   bytes[2] = num & (255);
   num = num >> 8
   bytes[1] = num & (255);
   num = num >> 8
   bytes[0] = num & (255);

   return bytes;
}



// converts a float price into the standard byte format for OUCH and ITCH.
// $179.26 becomes 1792600 and then is converted to a byte array
function priceToByteArray(price){
   price = Math.trunc(price * 10000);
   return intToByteArray(price);
}  



// splices in elements from one array (giveArray) into another array (recvArray) at a set offset
function spliceInArray(giveArray, recvArray, length, offset){
   for(var i = 0; i < length; i++){
      recvArray[i+offset] = giveArray[i];
   }
}



// converts a character to its ascii number so that it can be stored as a byte
function charToByte(character){
   return character.charCodeAt();
}



// prints a byte array for debugging. Each byte is printed in hex
function printByteArray(byteArray, length){
   for(var i = 0; i < length; i++){
      
      // as hex number:
      console.log("byte " + i + ": " + byteArray[i].toString(16) + "\t\tchar:" + String.fromCharCode(byteArray[i]));   
   }
}

// converts decimal integer number into an array of bytes
function decimalToByteArray(num, numDigits){
   var bytes = new Uint8Array(numDigits);
   for(var i = numDigits-1; i >= 0; i--){
      var tmp = num % 10;
      bytes[i] = tmp + 48;
      num = Math.floor(num/10);
   }
   if(bytes[0] === 0){
    console.log("Input-> 'Num':" + num + " numDigits:" + numDigits);
   }
   return bytes;
}

// Converts a string of ascii char's stored as base 256 into a decimal int
function string256ToInt(str){
  var sum = 0;
  var base = 1;
  for(var i = str.length-1; i >= 0; i--){
    sum += str.charCodeAt(i) * base;
    base *= 256;
  }
  return sum;
}

// Converts a string of ascii char's stored as base 256 into a decimal price ("152500" -> 15.25)
function string256ToPrice(str){
  var temp = string256ToInt(str);
  var temp = temp / 10000;
  return temp;
}

// Converts a string of ascii char's stored as base 256 into a decimal int
function string10ToInt(str){
  var sum = 0;
  var base = 1;
  for(var i = str.length-1; i >= 0; i--){
    sum += (str.charCodeAt(i) - 48) * base;
    base *= 10;
  }
  return sum;
}

// Converts a byte array into a string
function byteArrayToString(byteArr){
  var outStr = "";
  for(byte of byteArr){
    outStr += String.fromCharCode(byte);
  }
  return outStr;
}

// logs string of characters using thier ascii numbers
function logStringAsNums(str){
  var i = 0;
  var outString = "";
  for(char of str){
    outString += "(" + i + ":" + char.charCodeAt(0) + ")";
    i++;
  }
  console.log(outString);
}

function printOuchMsg(str){
  var i=0;
  var outString = "";
  for(;i < outString.length; i++){
    outString += "(" + i + ":" + str[i] + ")";
  } 
  outString += "\n";
  return outString;
}

// Downloads string to file For testing output
function downloadHex(inString, strFileName, strMimeType) {

    var strData = "";
    for(var i = 0; i < inString.length; i++){
      var temp = inString.charAt(i);
      var hexTemp = temp.charCodeAt().toString(16);
      if(hexTemp.length === 1){
        strData += '0';
      }
      strData += hexTemp;
    }

    var D = document,
        A = arguments,
        a = D.createElement("a"),
        d = A[0],
        n = A[1],
        t = A[2] || "text/plain";

    //build download link:
    a.href = "data:" + strMimeType + "charset=utf-8," + escape(strData);


    if (window.MSBlobBuilder) { // IE10
        var bb = new MSBlobBuilder();
        bb.append(strData);
        return navigator.msSaveBlob(bb, strFileName);
    } /* end if(window.MSBlobBuilder) */



    if ('download' in a) { //FF20, CH19
        a.setAttribute("download", n);
        a.innerHTML = "downloading...";
        D.body.appendChild(a);
        setTimeout(function() {
            var e = D.createEvent("MouseEvents");
            e.initMouseEvent("click", true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
            a.dispatchEvent(e);
            D.body.removeChild(a);
        }, 66);
        return true;
    }; /* end if('download' in a) */



    //do iframe dataURL download: (older W3)
    var f = D.createElement("iframe");
    D.body.appendChild(f);
    f.src = "data:" + (A[2] ? A[2] : "application/octet-stream") + (window.btoa ? ";base64" : "") + "," + (window.btoa ? window.btoa : escape)(strData);
    setTimeout(function() {
        D.body.removeChild(f);
    }, 333);
    return true;
}


// 
function outputMsgs(msgArray){
   var outStr = "";
   for(msg of msgArray){
      console.log(msg);
      for(byte of msg){
         outStr += String.fromCharCode(byte);
      }
   }
   download(outStr, "test.txt", "text/plain");
}