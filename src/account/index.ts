import fs from "fs"
import * as bitcoin from "bitcoinjs-lib"
import { ECPairFactory } from "ecpair"
import * as tinysecp from "tiny-secp256k1"
import os from 'os'

const ECPair = ECPairFactory(tinysecp);
const network = bitcoin.networks.bitcoin;

const rateLimit = 4;
const number = rateLimit

// Should hold logic that would distribute funds to the newly created accounts

async function createP2PKHwallet(amount: number = 10) {
  const wallets = [];
  for (let i = 0; i < amount; i++) {
    try {
      const keyPair = ECPair.makeRandom({ network: network });
      const privateKey = keyPair.toWIF();

      const address = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string

      const wallet = {
        address: address,
        privateKey: privateKey,
      };

      const isBitcoin = !!bitcoin.address.toOutputScript(address, network);

      console.log({ address, isBitcoin, privateKey });

      wallets.push(wallet);
    } catch (error) {
      console.log(error);
    }
  }

  const walletJSON = JSON.stringify(wallets, null, 2);


  fs.writeFile(`${__dirname}/wallet.json`, walletJSON, "utf-8", (err) => {
    if (err) {
      console.error("Error writing JSON to file:", err);
      return;
    }
    console.log(`Wallet created and saved to wallet.json`);
  });
}

createP2PKHwallet(number).then(() => {
  console.log("\x1b[33m%s\x1b[0m", "Please remember to backup your private keys for the newly created wallets.");
})
  .catch((error) => console.log(error));