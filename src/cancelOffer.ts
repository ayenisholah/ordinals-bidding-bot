import fs from "fs"
import * as bitcoin from "bitcoinjs-lib"
import { config } from "dotenv"

import { IOffer, getUserOffers, retrieveCancelOfferFormat, signData, submitCancelOfferData } from "./functions/Offer";
import { CollectionData } from "./trial";
import { ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';

config()

const PRIVATE_KEY = process.env.PRIVATE_KEY as string;
const TOKEN_RECEIVE_ADDRESS = process.env.TOKEN_RECEIVE_ADDRESS as string
const network = bitcoin.networks.bitcoin;


const filePath = `${__dirname}/collections.json`
const collections: CollectionData[] = JSON.parse(fs.readFileSync(filePath, "utf-8"))

const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
const ECPair: ECPairAPI = ECPairFactory(tinysecp);

collections.forEach((item) => {
  main(item)
})

async function main(item: CollectionData) {
  const privateKey = item.fundingWalletWIF ?? PRIVATE_KEY;
  const buyerTokenReceiveAddress = item.receiverWallet ?? TOKEN_RECEIVE_ADDRESS;

  const keyPair = ECPair.fromWIF(privateKey, network);
  const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string


  try {
    const offerData = await getUserOffers(buyerTokenReceiveAddress)

    if (offerData && offerData.offers && offerData.offers.length > 0) {
      const offers = offerData.offers

      console.log('--------------------------------------------------------------------------------');
      console.log(`${offers.length} OFFERS FOUND FOR ${buyerTokenReceiveAddress}`);
      console.log('--------------------------------------------------------------------------------');
      const cancelOps = []

      for (const offer of offers) {
        const collectionSymbol = offer.token.collectionSymbol
        const tokenId = offer.token.id
        const cancelOperation = cancelBid(offer, privateKey, collectionSymbol, tokenId, buyerPaymentAddress)

        cancelOps.push(cancelOperation)
      }

      Promise.all(cancelOps)
    }

  } catch (error) {
    console.log(error);
  }
}

async function cancelBid(offer: IOffer, privateKey: string, collectionSymbol: string, tokenId: string, buyerPaymentAddress: string) {

  if (offer.buyerPaymentAddress === buyerPaymentAddress) {
    const offerFormat = await retrieveCancelOfferFormat(offer.id)
    const signedOfferFormat = signData(offerFormat, privateKey)
    await submitCancelOfferData(offer.id, signedOfferFormat)

    console.log('--------------------------------------------------------------------------------');
    console.log(`CANCELLED OFFER FOR ${collectionSymbol} ${tokenId}`);
    console.log('--------------------------------------------------------------------------------');
  }


}