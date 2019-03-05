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

let utils = ethers.utils;

let privateKey = process.env.PRIVATE_KEY;
let provider = new ethers.providers.JsonRpcProvider(process.env.ETH_GATEWAY);

let dripAmt = utils.parseEther(process.env.DRIP_AMT);

const app = express();
const port = process.env.PORT || '3001';

var redis = require('redis');
var client = redis.createClient(process.env.REDIS_URL);
console.log(process.env.REDIS_URL)

app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());

// let getNonce = ()=>{
//   return new Promise((resolve, reject)=>{
//     client.get("current_nonce", (value)=>{
//       console.log('v', value)
//       resolve(value);
//     });
//   });
// };

// let setNonce  = (nonce)=>{
//   return new Promise((resolve, reject)=>{
//     console.log(nonce) 
//     client.set("current_nonce", 'test', (err,v)=>{resolve(v)});
//   });  
// }



// let startNonce = 40;

// getNonce().then((nonce)=>{
//   console.log(nonce)
//   let newNonce = nonce === null ? startNonce : nonce + 1;
//   console.log(nonce, newNonce)
//   setNonce(newNonce).then((res)=>{
//     console.log('done')
//   });
// })

let gimmieEth = function(privateKey, address, amt){
  return new Promise((resolve, reject) => {
    let wallet = new ethers.Wallet(privateKey, provider);

    return client.incr('current-nonce',(err,v)=>{
      if(err){reject(err)};
      console.log('nonce', v);
      let transaction = {
          gas: 4712388,
          gasLimit: 50000,
          gasPrice: 100000000000,
          to: address,
          value: amt,
          nonce: v
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

    return provider.getTransactionCount(wallet.address).then((transactionCount) => {


    });
  });
};

app.post('/gimmie', (req, res) => {
  let recipient = req.body.address;
  console.log('requested: ' + recipient)
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
