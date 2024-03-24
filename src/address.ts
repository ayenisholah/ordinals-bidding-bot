import yargs, { Arguments } from "yargs"
import fs from "fs"
import path from "path"
import * as bitcoin from "bitcoinjs-lib"
import { ECPairFactory } from "ecpair"
import * as tinysecp from "tiny-secp256k1"

const ECPair = ECPairFactory(tinysecp);
const network = bitcoin.networks.bitcoin;

interface Options {
  number: number
}

const options = yargs
  .usage(
    'Usage: -n <number of wallet you want created>'
  )
  .option('n', {
    alias: 'number',
    describe: 'Number of wallets you want created',
    type: 'number',
    demandOption: false
  }).argv as unknown as Arguments<Options>

const { number } = options

console.log({ number });

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

  const filePath = path.join(__dirname, "/wallet")
  const walletJSON = JSON.stringify(wallets, null, 2);

  if (!fs.existsSync(filePath)) {
    try {
      fs.mkdirSync(filePath, { recursive: true });
      console.log(`Directory '${filePath}' created.`);
    } catch (err) {
      console.error("Error creating directory:", err);
      return;
    }
  }

  fs.writeFile(`${filePath}/wallet.json`, walletJSON, "utf-8", (err) => {
    if (err) {
      console.error("Error writing JSON to file:", err);
      return;
    }
    console.log(`Wallet created and saved to wallet.json`);
  });
}

createP2PKHwallet(number).catch((error) => console.log(error));