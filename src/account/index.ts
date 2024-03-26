import fs from "fs/promises";
import { config } from "dotenv"
import * as bitcoin from "bitcoinjs-lib";
import readlineSync from 'readline-sync';
import { getBitcoinBalance } from "../utils";
import { ECPairInterface, ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';
import bip39 from "bip39"
import axiosInstance from "../axios/axiosInstance";
import axios from "axios";


const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
const ECPair: ECPairAPI = ECPairFactory(tinysecp);
const network = bitcoin.networks.bitcoin;

const rateLimit = 4;
const number = rateLimit;

const filePath = `${__dirname}/wallet.json`;
config()
const PRIVATE_KEY = process.env.PRIVATE_KEY as string;

const keyPair: ECPairInterface = ECPair.fromWIF(PRIVATE_KEY, network);
const address = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string
const quicknodeApiKey = process.env.QUICK_NODE_API_KEY as string
const quicknodeEndpoint = 'https://dark-smart-moon.btc.quiknode.pro';


async function main() {
  let wallets: Wallet[] = []
  try {
    const existingWallets = await checkExistingWallets(filePath);
    if (existingWallets) {
      console.log("\x1b[33m%s\x1b[0m", "WARNING: Creating new accounts would overwrite all your existing private keys, please remember to backup your private keys ");
      const answer = readlineSync.question("Are you sure you want to overwrite your existing wallets ? (yes/no): ").toLowerCase();
      if (answer === 'yes') {
        wallets = createP2PKHwallet(number);
        await storeWallets(wallets);
        console.log(`Wallets created and saved to wallet.json`);
      } else if (answer === 'no') {
        // get wallets
        wallets = JSON.parse(await fs.readFile(filePath, 'utf8'));
        console.log("Operation cancelled.");
        // process.exit(0);
      } else {
        console.log("Invalid input. Please enter 'yes' or 'no'.");
      }
    } else {
      wallets = createP2PKHwallet(number);
      await storeWallets(wallets);
      console.log(`Wallets created and saved to wallet.json`);
    }
  } catch (error) {
    console.error("Error:", error);
  }

  const publicKey = keyPair.publicKey.toString('hex');

  const balance = await getBitcoinBalance(address)
  console.log('--------------------------------------------------------------------------------');
  console.log('BALANCE: ', balance);
  console.log('--------------------------------------------------------------------------------');

  // try to backup to google cloud

  if (balance === 0) {
    console.log('--------------------------------------------------------------------------------');
    console.log('INSUFFICIENT BALANCE');
    console.log('--------------------------------------------------------------------------------');
  }

  const distributionAmount = wallets.length > 0 ? Math.floor(balance / wallets.length) : 0

  const destinationKeyPairs = wallets.map(item => ECPair.fromWIF(item.privateKey));



  if (distributionAmount === 0) {
    console.log('--------------------------------------------------------------------------------');
    console.log('NOT ENOUGH SATS');
    console.log('--------------------------------------------------------------------------------');
    process.exit(0)
  }

  const utxos = await fetchUTXOs(address)
  console.log('--------------------------------------------------------------------------------');
  console.log('UTXOS: ', utxos);
  console.log('--------------------------------------------------------------------------------');

  const txb = new bitcoin.Transaction();

  console.log('--------------------------------------------------------------------------------');
  console.log('TXB: ', txb);
  console.log('--------------------------------------------------------------------------------')

}

async function checkExistingWallets(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    const data = await fs.readFile(filePath, 'utf-8');
    const jsonData: Wallet[] = JSON.parse(data);
    return jsonData && jsonData.length > 0;
  } catch (error) {
    return false;
  }
}

function createP2PKHwallet(amount: number): Wallet[] {
  const wallets: Wallet[] = [];
  for (let i = 0; i < amount; i++) {
    const keyPair = ECPair.makeRandom({ network: network });
    const privateKey = keyPair.toWIF();
    const address = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string;
    const wallet = { address, privateKey };
    const isBitcoin = !!bitcoin.address.toOutputScript(address, network);
    console.log({ address, isBitcoin, privateKey });
    wallets.push(wallet);
  }
  return wallets;
}

async function storeWallets(wallets: Wallet[]) {
  const walletJSON = JSON.stringify(wallets, null, 2);
  await fs.writeFile(filePath, walletJSON, "utf-8");
  console.log("\x1b[33m%s\x1b[0m", "WARNING: please remember to backup your private keys ");
}

async function fetchUTXOs(address: string) {
  try {
    const { data } = await axios.get(`https://mempool.space/api/address/${address}/utxo`);
    return data;
  } catch (error: any) {
    console.error('Error fetching UTXOs:', error.response.data);
  }
}


interface Wallet {
  address: string;
  privateKey: string;
}

main();
