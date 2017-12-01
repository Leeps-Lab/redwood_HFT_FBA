import numpy as np
import pdb

def createMarketEvents(nGroups,nPeriods,experimentLength,dateStr,lambdaJVec,lambdaIVec):
  
  # Output file
  filePath = "/Users/ealdrich/Dropbox/Academics/Research/UCSC/redwood-high-frequency-trading-FBA/config/"+dateStr+"/"

  # Parameters for jump distribution
  startPrice = 100
  muJump = 0
  sigJump = 0.5

  for ix,periodVal in enumerate(range(1,nPeriods+1)):
    
    # Parameters for jump times
    lambdaJ = lambdaJVec[ix]
    nSimJ = int(2*experimentLength*lambdaJ)
  
    # Investor parameters
    lambdaI = lambdaIVec[ix]
    nSimI = int(2*experimentLength*lambdaI)
    buyProb = 0.5
  
    for groupVal in range(1,nGroups+1):

      # Simulate times and sizes
      jumpTimes = np.cumsum(np.around(np.random.exponential(1/lambdaJ,nSimJ)))
      jumpTimes = jumpTimes[jumpTimes < experimentLength]
      nJump = len(jumpTimes)
      jumpSizes = startPrice + np.cumsum(np.random.normal(muJump,sigJump,nJump))

      # Save jumps to CSV
      jumpData = np.vstack(((0,startPrice),np.hstack((jumpTimes.reshape(nJump,1),jumpSizes.reshape(nJump,1)))))
      jumpFile = filePath+"Jumps/jumps_period"+str(periodVal)+"_group"+str(groupVal)+".csv"
      np.savetxt(jumpFile,jumpData,delimiter=',')

      # Simulate investor arrivals and directions
      investorTimes = np.cumsum(np.around(np.random.exponential(1/lambdaI,nSimI)))
      investorTimes = investorTimes[investorTimes < experimentLength]
      nInvestor = len(investorTimes)
      investorDirections = np.random.binomial(1,buyProb,nInvestor)

      # Save investor arrivals to CSV
      investorData = np.hstack((investorTimes.reshape(nInvestor,1),investorDirections.reshape(nInvestor,1)))
      investorFile = filePath+"Investors/investors_period"+str(periodVal)+"_group"+str(groupVal)+".csv"
      #pdb.set_trace()
      np.savetxt(investorFile,investorData,delimiter=',')
