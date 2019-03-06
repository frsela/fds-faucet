# FDS-Faucet

A simple Node Express project which dispenses a small amount of ETH (or compatible) currency on request.

### Install

`git clone git@github.com:fairDataSociety/fds-faucet.git`

`cd fds-faucet`

You will need to create a `.env` file. An example is provided.

### Run

`node index.js`

### Usage

`curl -XPOST http://localhost:3001/reset --data "token=some-unique-token"`

`curl -XPOST http://localhost:3001/gimmie --data "address=0x6968a4fa95e4dc9e618575da7a0275dfbb56d2a2"`

### Notes

Pending security review! Use with test ETH and at your own risk!