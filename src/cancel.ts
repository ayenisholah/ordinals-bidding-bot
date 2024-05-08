import fs from "fs"
import * as bitcoin from "bitcoinjs-lib"
import { config } from "dotenv"

import { ICollectionOffer, IOffer, cancelCollectionOffer, getBestCollectionOffer, getUserOffers, retrieveCancelOfferFormat, signData, submitCancelOfferData } from "./functions/Offer";
import { ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';

config()

const FUNDING_WIF = process.env.FUNDING_WIF as string;
const TOKEN_RECEIVE_ADDRESS = process.env.TOKEN_RECEIVE_ADDRESS as string
const network = bitcoin.networks.bitcoin;


const filePath = `${__dirname}/collections.json`
const collections: CollectionData[] = JSON.parse(fs.readFileSync(filePath, "utf-8"))

const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
const ECPair: ECPairAPI = ECPairFactory(tinysecp);



const uniqueCollections = collections.filter(
  (collection, index, self) =>
    index === self.findIndex((c) => c.tokenReceiveAddress === collection.tokenReceiveAddress && c.offerType === collection.offerType)
);

uniqueCollections.forEach((item) => {
  main(item)
})

async function main(item: CollectionData) {
  const privateKey = item.fundingWalletWIF ?? FUNDING_WIF;
  const collectionSymbol = item.collectionSymbol;
  const buyerTokenReceiveAddress = item.tokenReceiveAddress ?? TOKEN_RECEIVE_ADDRESS;

  const keyPair = ECPair.fromWIF(privateKey, network);
  const publicKey = keyPair.publicKey.toString('hex');
  const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string


  if (item.offerType === "ITEM") {
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
  } else if (item.offerType === "COLLECTION") {
    const bestOffers = await getBestCollectionOffer(item.collectionSymbol)
    const ourOffers = bestOffers?.offers.find((item) => item.btcParams.makerOrdinalReceiveAddress.toLowerCase() === buyerTokenReceiveAddress.toLowerCase()) as ICollectionOffer

    if (ourOffers) {
      const offerIds = [ourOffers.id]
      await cancelCollectionOffer(offerIds, publicKey, privateKey)
    }
  }
}

async function cancelBid(offer: IOffer, privateKey: string, collectionSymbol: string, tokenId: string, buyerPaymentAddress: string) {
  if (offer.buyerPaymentAddress === buyerPaymentAddress) {
    const offerFormat = await retrieveCancelOfferFormat(offer.id)
    const signedOfferFormat = signData(offerFormat, privateKey)
    if (signedOfferFormat) {
      await submitCancelOfferData(offer.id, signedOfferFormat)
      console.log('--------------------------------------------------------------------------------');
      console.log(`CANCELLED OFFER FOR ${collectionSymbol} ${tokenId}`);
      console.log('--------------------------------------------------------------------------------');
    }
  }
}

export interface CollectionData {
  collectionSymbol: string;
  minBid: number;
  maxBid: number;
  minFloorBid: number;
  maxFloorBid: number;
  outBidMargin: number;
  bidCount: number;
  duration: number;
  fundingWalletWIF?: string;
  tokenReceiveAddress?: string;
  scheduledLoop?: number;
  counterbidLoop?: number;
  offerType: "ITEM" | "COLLECTION";
  feeSatsPerVbyte?: number;
}