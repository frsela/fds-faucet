require('dotenv').config();

let express = require('express');
let bodyParser = require('body-parser');
let ethers = require('ethers');
let cors = require('cors');

let utils = ethers.utils;

let privateKey = process.env.PRIVATE_KEY;
let provider = new ethers.providers.JsonRpcProvider(process.env.ETH_GATEWAY);

let dripAmt = utils.parseEther(process.env.DRIP_AMT);

const app = express();
const port = process.env.PORT || '3001';

const ipRefuseDuration = 58560; // time to refuse ip, 58560 is one day
let   ipServed = []; // IPs served 

app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());

let gimmieEth = function(privateKey, address, amt){
  return new Promise((resolve, reject) => {
    let wallet = new ethers.Wallet(privateKey, provider);

    return provider.getTransactionCount(wallet.address).then((transactionCount) => {
      console.log('txs', transactionCount);
      console.log('nonce', transactionCount+2)
      let transaction = {
          gas: 4712388,
          gasLimit: 50000,
          gasPrice: 100000000000,
          to: address,
          value: amt,
          nonce: transactionCount
      }

      let signPromise = wallet.sign(transaction);

      return signPromise.then((signedTransaction) => {
          return provider.sendTransaction(signedTransaction).then((tx) => {
              console.log('sent', tx);
              let checkInterval = setInterval(()=>{
                provider.getTransaction(tx.hash).then((gotTx)=>{
                  console.log(tx.hash, gotTx.confirmations);
                  if(gotTx.confirmations > 0){
                    console.log(tx, 'confirmed')
                    clearInterval(checkInterval);
                  }
                })
              },3000);
              resolve(tx);
              return;
          }).catch((error)=>{
            reject(error.message);
            return
          });
      });
    });
  });
};
/**
 * 
 * @param {any} remoteAddress 0xffff
 * @returns {boolean} true if no transaction from faucet till now, balance is zero, checks all previous blocks
 */
let viable = function (remoteAddress) // slow, will fail
{
    let currentBlock = provider.blockCount;
    let count = provider.getTransactionCount(remoteAddress, currentBlock);
    if (count > 0) return false; 
    var balance = provider.getBalance(remoteAddress, currentBlock);
    if (balance > 0) return false;

    for (var i = currentBlock; i >= 0; --i) {
        try {
            var block = provider.getBlock(i, true);
            if (block && block.transactions) {
                block.transactions.forEach(function (e) {
                    if (remoteAddress === e.from) {
                        return false;
                    }
                    if (remoteAddress === e.to) {
                        return false;
                    }
                });
            }
        } catch (e) { console.error("Error in block " + i, e); }
    }

    return true;
}

/// checking IPs, IP gets listed 
let addServedIp = function (ip) {
    ipServed.push({ ip: ip, time: Date.now() });
};
let checkServedIp = function (ip) {
    return ipServed.findIndex(o => {
        return o.ip === ip;
    });
};
let removeIp = function (index) {
    ipServed.splice(index, 1);
};
let removeOldIps = function () {
    let now = Date.now();
    let numServed = ipServed.length;
    for (var i = numServed; i >= 0; --i) {
        let obj = ipServed[i];
        if (obj.time + ipRefuseDuration < now)
            removeIp(i);
    }
};

app.get('/served', (req, res) => {
    removeOldIps();
    res.send({
        result: true,
        served: ipServed
    }).catch(error => {
        res.status(500).send({
            result: false,
            error: error
        });
    });  
});

app.post('/gimmie', (req, res) => {
    let recipient = req.body.address;

    // TODO: check ip address not blacklisted 
    let ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress; // request addres or if its behind proxy
    ip = ip.replace(/\./g, "_");

    let servedIdx = checkServedIp(ip);
    if (servedIdx !== -1) {
        let now = Date.now(); 
        let obj = ipServed[servedIdx];
        if (obj.time + ipRefuseDuration > now) { 
            res.status(500).send({
                result: false,
                error: "blacklisted ip"
            });
            return; // served and time still didn't pass
        } 
        removeIp(servedIdx); // time passed remove from served list
    }

    // check if account was already funded
    let notFoundedYet = viable(recipient); // so receiver did not receive any funds yet from this faucet, 
    if (!notFoundedYet)
    {
      res.status(500).send({
          result: false,
          error: "not viable, already funded"
      });
      return; //
    }


    removeOldIps();
    // all good 
    addServedIp(ip);

    console.log('requested: ' + recipient);
    gimmieEth(privateKey, recipient, dripAmt).then((tx)=>{
    res.send({
        result: true,
        gifted: utils.formatEther(dripAmt),
        transaction: tx.hash
    });
    }).catch(error => {
    res.status(500).send({
        result: false,
        error: error
    });
    });
});

app.listen(port, () => console.log(`Faucet dripping on port ${port}!`));

// curl -XPOST localhost:3001/gimmie --data "address=0x972e45b1e7e468466276305ab20e4cb09b1ad0e6"
