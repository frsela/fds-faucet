// Copyright 2019 The FairDataSociety Authors
// This file is part of the FairDataSociety library.
//
// The FairDataSociety library is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// The FairDataSociety library is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with the FairDataSociety library. If not, see <http://www.gnu.org/licenses/>.

require('dotenv').config();

let express = require('express');
let bodyParser = require('body-parser');
let ethers = require('ethers');
let cors = require('cors');
let crypto = require("crypto");

let utils = ethers.utils;

let privateKey = process.env.PRIVATE_KEY;
let provider = new ethers.providers.JsonRpcProvider(process.env.ETH_GATEWAY);

let dripAmt = utils.parseEther(process.env.DRIP_AMT);

const app = express();
const port = process.env.PORT || '3001';

const tokenABI = [
  // transfer
  {
   "constant": false,
   "inputs": [
    {
     "name": "_to",
     "type": "address"
    },
    {
     "name": "_value",
     "type": "uint256"
    }
   ],
   "name": "transfer",
   "outputs": [
    {
     "name": "",
     "type": "bool"
    }
   ],
   "type": "function"
  }
];

const maxSprinkles = 7;

let tokenAddress = '0x2ac3c1d3e24b45c6c310534bc2dd84b5ed576335';


var redis = require('redis');
var client = redis.createClient(process.env.REDIS_URL);
// console.log(process.env.REDIS_URL)

app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());

let wallet = new ethers.Wallet(privateKey, provider);

let gbzz = new ethers.Contract( tokenAddress , tokenABI , provider )

wallet.getBalance().then((balance)=>{
  console.log(process.env.ETH_GATEWAY);
  console.log(wallet.address, balance.toString());
});

let incrementDiscordUserCount = async (discordUser) => {
  client.incr('discordUserCount-'+discordUser, (err,res)=>{
    if(err !== null) throw new Error(err);
    console.log(`incremented ${discordUser} nonce`, res)
  })
}

let decrementDiscordUserCount = async (discordUser) => {
  client.decr('discordUserCount-'+discordUser, (err,res)=>{
    if(err !== null) throw new Error(err);
    console.log(`decremented ${discordUser} nonce`, res)
  })
}

let getDiscordUserCount = async (discordUser) => {
  return await new Promise((resolve,reject)=>{
    client.get('discordUserCount-'+discordUser, (err,res)=>{
      if(err !== null ) reject(err);
      console.log(err,res)
      resolve(parseInt(res));
    })
  });
}


let incrementNonce = async () => {
  client.incr('current-nonce', (err,res)=>{
    if(err !== null) throw new Error(err);
    console.log("incremented nonce", res)
  })
}

let decrementNonce = async () => {
  client.decr('current-nonce', (err,res)=>{
    if(err !== null) throw new Error(err);
    console.log("decremented nonce", res)
  })
}

let waitForConfirmation = async (tx, tries = 20) => {
  let didTry = 0;
  return new Promise((resolve, reject) => {
    let checkInterval = setInterval(()=>{
      console.log(didTry, tx)
      if(didTry > tries){
        decrementNonce();
        decrementDiscordUserCount(discordUser);
        reject(tx);
      }
      didTry += 1
      provider.getTransaction(tx.hash).then((gotTx)=>{
        if(gotTx.confirmations > 0){
            console.log(`confirmed ${tx.hash}`);                      
            clearInterval(checkInterval);
            resolve(tx);
          }
      });
    }, 5000);
  })
}

let gimmie = async (address, amt, discordUser = false) => {
  let gimmieID = crypto.randomBytes(20).toString('hex');
  console.log(`requested ${gimmieID} ${address} ${discordUser}`);
  
  let nonce = await new Promise((resolve,reject)=>{
    client.get('current-nonce', (err,res)=>{
      if(err !== null ) reject(err);
      resolve(parseInt(res));
    })
  });

  let sendEthTx = {
    gasLimit: 50000,
    gasPrice: 100000000000,
    to: address,
    value: amt,
    nonce: nonce
  }


  let sendGbzzTx = await gbzz.populateTransaction.transfer("0x8A9b99F214BB407bE10f3c1fD1ca0ae0B8cb2b92", "100000000000000000");
  sendGbzzTx.gasLimit = 200000;
  sendGbzzTx.gasPrice = 100000000000;
  sendGbzzTx.nonce = nonce+1

  let sendEthTxSigned = await wallet.signTransaction(sendEthTx);
  let sendGbzzTxSigned = await wallet.signTransaction(sendGbzzTx);


  let tx1 = provider.sendTransaction(sendEthTxSigned);
  let tx2 = provider.sendTransaction(sendGbzzTxSigned)

  incrementNonce();
  incrementNonce();

  if(discordUser){
    incrementDiscordUserCount(discordUser);    
  }

  let txo = await Promise.all([tx1, tx2]);


  let c1 = waitForConfirmation(txo[0]);
  let c2 = waitForConfirmation(txo[1]);

  let txc = await Promise.all([c1, c2]);


  return txo;

};

let resetNonce = (nonce) => {
  return provider.getTransactionCount(wallet.address).then((transactionCount) => {
    return new Promise((resolve, reject)=>{
      let n = nonce ? nonce : transactionCount ;
      console.log('resetting nonce to ', n);
      client.set("current-nonce", n, (err,v)=>{
        resolve({
          result: true,
          newNonce: n,
          transactionCount: transactionCount
        });
      });
    });       
  });
}

app.get('/',(req, res) => {
  let token = process.env.AUTH_TOKEN.substr(-10);
  if(req.body.token && req.body.token === token){  
    return provider.getTransactionCount(wallet.address).then((transactionCount) => {
        res.send({
          dripAmt: process.env.DRIP_AMT,
          transactionCount: transactionCount
        });
      });
  }else{
    res.send({
      dripAmt: process.env.DRIP_AMT
    });
  }
});


app.post('/gimmie-d', async (req, res) => {
  let recipient = req.body.address;
  let discordUser = req.body.user;

  let discordUserCount = await getDiscordUserCount(discordUser)
  
  if(discordUserCount > maxSprinkles){
    res.status(500).send({
      result: false,
      error: `sorry, ${discordUser} has already sprinkled ${maxSprinkles} times.`
    });
    return;
  }
  try {
    let result = await gimmie(recipient, dripAmt, discordUser);

    res.send({
      result: true,
      gifted: utils.formatEther(dripAmt),
      // transaction: tx.hash
    });
  } catch(e) {
    res.status(500).send({
      result: false,
      error: e
    });
  }
});

app.post('/gimmie', async (req, res) => {
  let recipient = req.body.address;
  let discordUser = req.body.discordUser;
  try {
    let result = await gimmie(recipient, dripAmt);

    res.send({
      result: true,
      gifted: utils.formatEther(dripAmt),
      // transaction: tx.hash
    });
  } catch(e) {
    res.status(500).send({
      result: false,
      error: e
    });
  }
});



app.post('/reset', (req, res) => {
  let token = process.env.AUTH_TOKEN;
    let nonce = parseInt(req.body.nonce) >= 0 ? parseInt(req.body.nonce) : false;  
  if(req.body.token === token){
    return provider.getTransactionCount(wallet.address).then((transactionCount) => {
      let nonce = parseInt(req.body.nonce) >= 0 ? parseInt(req.body.nonce) : transactionCount;
      return new Promise((resolve, reject)=>{
        console.log('resetting nonce to ', nonce);
        client.set("current-nonce", nonce, (err,v)=>{
          res.send({
            result: true,
            newNonce: nonce,
            transactionCount: transactionCount
          });
        });
      }); 
    });
  }else{
    res.status(500).send({
      result: false,
    });
  }
});

app.listen(port, () => console.log(`Faucet dripping on port ${port}!`));

// curl -XPOST localhost:3001/gimmie --data "address=0x972e45b1e7e468466276305ab20e4cb09b1ad0e6"
