args = commandArgs(trailingOnly=TRUE)
nPeriods = args[1]
nGroups = args[2]
dateStr = args[3]
filePath = paste("~/Dropbox/Academics/Research/UCSC/redwood-high-frequency-trading-remote/config/",dateStr,"/",sep="")

# Parameters for jump times
totalTime = 5*60*1000
lambdaJ = 1/4000
nSimJ = 2*totalTime*lambdaJ

# Parameters for jump distribution
startPrice = 100
muJump = 0
sigJump = 0.5

# Investor parameters
lambdaI = 1/3000 #lambdaJ*.5
nSimI = 2*totalTime*lambdaI
buyProb = 0.5

for(periodVal in 1:nPeriods){
  for(groupVal in 1:nGroups){

    # Simulate times and sizes
    jumpTimes = cumsum(round(rexp(nSimJ,lambdaJ)))
    jumpTimes = jumpTimes[jumpTimes < totalTime]
    nJump = length(jumpTimes)
    jumpSizes = startPrice + cumsum(rnorm(nJump,muJump,sigJump))

    # Save jumps to CSV
    jumpData = rbind(c(0,startPrice),cbind(jumpTimes, jumpSizes))
    jumpFile = paste(filePath,"Jumps/jumps_period",periodVal,"_group",groupVal,".csv",sep="")
    write.csv(jumpData,jumpFile,row.names=FALSE)

    # Simulate investor arrivals and directions
    investorTimes = cumsum(round(rexp(nSimI,lambdaI)))
    investorTimes = investorTimes[investorTimes < totalTime]
    nInvestor = length(investorTimes)
    investorDirections = rbinom(nInvestor,1,buyProb)

    # Save investor arrivals to CSV
    investorData = cbind(investorTimes, investorDirections)
    investorFile = paste(filePath,"Investors/investors_period",periodVal,"_group",groupVal,".csv",sep="")
    write.csv(investorData,investorFile,row.names=FALSE)
  }
}
