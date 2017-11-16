import sys
import pdb

nGroups = int(sys.argv[1])
nPlayersPerGroup = int(sys.argv[2])
periods = int(sys.argv[3])
experimentLength = int(sys.argv[4])*1000
batchLength = int(sys.argv[5])*1000
dateStr = sys.argv[6]
exchangeType = "fba"
subject = "default"
startingWealth = 20
speedCost = 0.01
maxSpread = 2
exchangeRate = 2
filePath = dateStr+"/"+sys.argv[4]+"/"
marketEventsURLRoot = "https://raw.githubusercontent.com/Leeps-Lab/redwood-high-frequency-trading-remote/master/config/"+dateStr+"/Investors/investors_period"
priceChangesURLRoot = "https://raw.githubusercontent.com/Leeps-Lab/redwood-high-frequency-trading-remote/master/config/"+dateStr+"/Jumps/jumps_period"
exchangeURI = "54.219.182.118"

groupList = list()
for group in range(1,nGroups+1):
    groupList.append(range((group-1)*nPlayersPerGroup+1,group*nPlayersPerGroup+1))

for period in range(1,periods+1):
    marketEventsURL = marketEventsURLRoot+str(period)+"_group1.csv"
    priceChangesURL = priceChangesURLRoot+str(period)+"_group1.csv" 
    fName = filePath+exchangeType+"_config_"+str(experimentLength/1000)+"s_"+str(nGroups)+"groups_"+str(nPlayersPerGroup)+"players_"+"period"+str(period)+".csv"
    fOut = open(fName,"w")
    fOut.write("period,subject,groups,startingWealth,speedCost,maxSpread,batchLength,marketEventsURL,priceChangesURL,NULL,experimentLength,exchangeRate,exchangeURI,sessionNumber\n")
    fOut.write("1,"+subject+",\""+str(groupList).replace(" ","")+"\","+str(startingWealth)+","+str(speedCost)+","+str(maxSpread)+","+str(batchLength)+","+marketEventsURL+","+priceChangesURL+",'',"+str(experimentLength)+","+str(exchangeRate)+","+exchangeURI+","+str(period))
    fOut.close()
    
