import { ECPairInterface, ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';
import * as bitcoin from "bitcoinjs-lib"
import { getBitcoinBalance } from '../utils';
import { collectionDetails } from '../functions/Collection';
import { config } from "dotenv"
import { retrieveTokens } from '../functions/Tokens';
import { createOffer, getBestOffer, signData, submitSignedOfferOrder } from '../functions/Offer';

config()

const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
const ECPair: ECPairAPI = ECPairFactory(tinysecp);
const network = bitcoin.networks.bitcoin;

const buyerTokenReceiveAddress = process.env.TOKEN_RECEIVE_ADDRESS as string
const API_KEY = "28642dd0-1349-4123-a8b6-91c83e83d345"


export async function Bid(private_key: string, collections: Collection[], pid: number) {

  try {
    console.log('--------------------------------------------------------------------------------');
    console.log(`WORKER PID: ${pid}`);
    console.log("COLLECTIONS: ", collections.length);

    console.log('--------------------------------------------------------------------------------');
    const keyPair: ECPairInterface = ECPair.fromWIF(private_key, network);
    const publicKey = keyPair.publicKey.toString('hex');

    const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string

    console.log('--------------------------------------------------------------------------------');
    console.log(`PAYMENT ADDRESS: ${buyerPaymentAddress}`);
    console.log(`TOKEN RECEIEVE ADDRESS: ${buyerTokenReceiveAddress}`);
    console.log('--------------------------------------------------------------------------------');

    const bidAll = false
    const conversionRate = 100000000

    const minBid = 0.0000795
    const maxBid = 0.000658805

    const minPrice = Math.ceil(minBid * conversionRate)
    const maxPrice = Math.ceil(maxBid * conversionRate)
    const maxProfit = 20
    const minProfit = 5
    const outBidMargin = 7

    console.log('--------------------------------------------------------------------------------');
    console.log("MAX PRICE: ", maxPrice);
    console.log("MIN PRICE: ", minPrice);
    console.log("MAX PROFIT: ", maxProfit);
    console.log("MIN PROFIT: ", minProfit);
    console.log("BID ALL: ", bidAll);
    console.log('--------------------------------------------------------------------------------');

    for (const collection of collections) {
      const collectionSymbol = collection.collectionSymbol
      const collectionData = await collectionDetails(collectionSymbol)
      const floorPrice = collectionData && collectionData.floorPrice ? +collectionData.floorPrice : 0

      console.log('--------------------------------------------------------------------------------');
      console.log(`COLLECTION SYMBOL: ${collectionSymbol}`);
      console.log("FLOOR PRICE: ", floorPrice);
      console.log('--------------------------------------------------------------------------------');

      const tokens = await retrieveTokens(collectionSymbol, 20)


      const duration = 30 // MINUTES
      const currentTime = new Date().getTime();
      const expiration = currentTime + (duration * 60 * 1000);
      const feerateTier = 'halfHourFee'

      const listedMakerFeeBp = tokens && tokens[0]?.listedMakerFeeBp ? tokens[0]?.listedMakerFeeBp : 0
      const makerFee = listedMakerFeeBp / 100 / 100

      console.log('--------------------------------------------------------------------------------');
      console.log('MAKER FEE: ', makerFee);
      console.log('--------------------------------------------------------------------------------');

      for (const token of tokens) {
        const offer = await getBestOffer(token.id)
        const bestOffer = offer?.offers[0]?.price ?? 0

        let offerPrice = Math.ceil(+floorPrice / 2);
        const bidAddress = offer?.offers[0]?.buyerPaymentAddress

        if (bestOffer > 0 && bidAddress !== buyerPaymentAddress) {
          offerPrice = Math.ceil(bestOffer * (1 + (outBidMargin / 100)))
        }

        if (offerPrice < token.listedPrice / 2) {
          offerPrice = Math.ceil((token.listedPrice / 2) * (1 + (outBidMargin / 100)))
        }

        if (offerPrice > maxPrice) {
          console.log(`OFFER PRICE ${offerPrice} EXCEEDS MAX PRICE ${maxPrice}`);
          continue
        }

        console.log('--------------------------------------------------------------------------------');
        console.log(`BEST OFFER: ${collectionSymbol} ${token.id}`, bestOffer);
        console.log(`OFFER PRICE: `, offerPrice);
        console.log('--------------------------------------------------------------------------------');

        const currentOffer = await getBestOffer(token.id)

        if (currentOffer?.offers[0]?.buyerPaymentAddress === buyerPaymentAddress) {
          console.log('--------------------------------------------------------------------------------');
          console.log('YOU ALREADY HAVE AN OFFER FOR THIS TOKEN');
          console.log('--------------------------------------------------------------------------------');
          continue
        }

        const unsignedOffer = await createOffer(token.id, offerPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, feerateTier)

        console.log('--------------------------------------------------------------------------------');
        console.log({ unsignedOffer });
        console.log('--------------------------------------------------------------------------------');

        const signedOffer = await signData(unsignedOffer)

        console.log('--------------------------------------------------------------------------------');
        console.log({ signedOffer });
        console.log('--------------------------------------------------------------------------------');

        const offerData = await submitSignedOfferOrder(signedOffer, token.id, offerPrice, expiration, buyerPaymentAddress, buyerTokenReceiveAddress, publicKey, feerateTier)

        console.log('--------------------------------------------------------------------------------');
        console.log({ offerData });
        console.log('--------------------------------------------------------------------------------');

        const newOffer = {
          id: token.id,
          collectionSymbol: collectionSymbol,
          listedPrice: token.listedPrice,
          listedMakerFeeBp: token.listedMakerFeeBp,
          offerDate: new Date().toISOString(),
          bestOffer: bestOffer,
          offerPrice: offerPrice,
          offerCreated: true,
          floorPrice: floorPrice,
          listed: token.listed,
          listedAt: token.listedAt,
          listingCreated: false,
          // traits: traits
        }

        // const offerExist = await Offer.findOne({
        //   where: {
        //     id: token.id
        //   }
        // })

        // if (offerData && offerData.ok) {
        //   if (offerExist) {
        //     await Offer.update(newOffer, {
        //       where: {
        //         id: token.id
        //       }
        //     })
        //     console.log('--------------------------------------------------------------------------------');
        //     console.log('UPDATED EXISTING OFFER');
        //     console.log('--------------------------------------------------------------------------------');
        //   } else {
        //     console.log('--------------------------------------------------------------------------------');
        //     console.log('SAVE NEW OFFER');
        //     console.log('--------------------------------------------------------------------------------');
        //     // write to json file
        //     await Offer.create(newOffer)
        //   }
        // }
      }
    }
  } catch (error: any) {
    console.log(error.response);
  }
}
interface Collection {
  _id: string;
  name: string;
  collectionSymbol: string;
  image: string;
  averageOffer: number;
  floorPrice: number;
  listedMakerFeeBp: number;
  scannedTokens: number;
  tokensWithOffers: number;
  tokensWithNoOffers: number;
  percentageOfTokensWithOffers: number;
  potentialProfit: number;
  riskOrReward: number;
  offers: number[];
  __v: number;
}