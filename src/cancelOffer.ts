import yargs, { Arguments } from "yargs"
import * as bitcoin from "bitcoinjs-lib"
import { ECPairInterface, ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';

import sequelize from "./database";
import Bid from "./models/offer.model";
import { getOffers, retrieveCancelOfferFormat, signData, submitCancelOfferData } from "./functions/Offer";

const options = yargs
  .usage(
    'Usage: -p <private_key> -a <api_key> -l <list of token and configuration to bid on>'
  )
  .option('p', {
    alias: 'private_key',
    describe: 'Wallet Private Key',
    type: 'string',
    demandOption: true
  })
  .option('a', {
    alias: 'api_key',
    describe: 'NFTTOOLS API Key',
    type: 'string',
    demandOption: true
  }).argv as unknown as Arguments<Options>

interface Options {
  private_key: string;
  api_key: string;
}

const { private_key, api_key } = options;
const network = bitcoin.networks.bitcoin; // or bitcoin.networks.testnet for testnet

const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
const ECPair: ECPairAPI = ECPairFactory(tinysecp);

async function main() {
  try {
    await sequelize.authenticate();
    // await sequelize.sync({ alter: true }); // chain to alter

    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }

  try {
    // get successful offers
    const keyPair: ECPairInterface = ECPair.fromWIF(private_key, network);

    const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string

    console.log('--------------------------------------------------------------------------------');
    console.log(`PAYMENT ADDRESS: ${buyerPaymentAddress}`);
    console.log('--------------------------------------------------------------------------------');


    const createdOffers = await Bid.findAll({})

    // get offers
    for (const token of createdOffers) {
      const offerData = await getOffers(token.id, api_key)

      const offer = offerData?.offers?.find(item => item.buyerPaymentAddress === buyerPaymentAddress)

      if (offer) {
        const offerFormat = await retrieveCancelOfferFormat(offer.id, api_key)

        console.log('--------------------------------------------------------------------------------');
        console.log({ offerFormat });

        console.log('--------------------------------------------------------------------------------');

        const signedOfferFormat = signData(offerFormat, private_key)

        console.log('--------------------------------------------------------------------------------');
        console.log({ signedOfferFormat });
        console.log('--------------------------------------------------------------------------------');

        const cancelOfferData = await submitCancelOfferData(offer.id, signedOfferFormat, api_key)

        console.log('--------------------------------------------------------------------------------');
        console.log({ cancelOfferData });
        console.log('--------------------------------------------------------------------------------');
      }
    }

  } catch (error) {
    console.log(error);
  }
}

main()
