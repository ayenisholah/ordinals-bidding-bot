import * as bitcoin from "bitcoinjs-lib"
import { ECPairInterface, ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';
import { config } from "dotenv"

import { cancelAllUserOffers, getOffers, retrieveCancelOfferFormat, signData, submitCancelOfferData } from "./functions/Offer";

config()

const private_key = process.env.PRIVATE_KEY as string;
const network = bitcoin.networks.bitcoin; // or bitcoin.networks.testnet for testnet

const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
const ECPair: ECPairAPI = ECPairFactory(tinysecp);

async function main() {

  try {
    // get successful offers
    const keyPair: ECPairInterface = ECPair.fromWIF(private_key, network);

    const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string

    console.log('--------------------------------------------------------------------------------');
    console.log(`PAYMENT ADDRESS: ${buyerPaymentAddress}`);
    console.log('--------------------------------------------------------------------------------');

    const buyerTokenReceiveAddress = 'bc1p5rw87me62aftc3lgrqpq430gp3rp5wtj4atxz6pum2rmhjhvsk0sx73cgk'

    await cancelAllUserOffers(buyerTokenReceiveAddress, private_key)
    // bulk cancel

  } catch (error) {
    console.log(error);
  }
}

main()
